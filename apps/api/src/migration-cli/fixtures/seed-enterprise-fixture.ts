import { gzipSync } from 'node:zlib';
import { Client } from 'pg';
import { sha256Hex } from '../stable-json';

/**
 * SEMBRADOR DE FIXTURES para la VALIDACIÓN punta a punta de la migración
 * (Fase 4). Escribe en una BD DESECHABLE (p. ej. `valle_enterprise_fixture`,
 * creada aparte y migrada con el `migration:run` del repo enterprise) datos
 * REPRESENTATIVOS del modelo legacy `sf_line_layouts`/`doc_blobs`/
 * `sf_cad_blocks`:
 *
 *  - 2 tenants (alfa/beta);
 *  - documento inline pequeño CON unicode, publicaciones embebidas, capas,
 *    connectors/assets/annotations/cells, aprobación y DXF con colocación;
 *  - documento >1 MB como PUNTERO a doc_blobs (gzip real, sha256 correcto);
 *  - snapshots con documento embebido, con puntero y SIN token CAS (borde);
 *  - blob COMPARTIDO por dedup entre dos documentos del mismo tenant;
 *  - layout sin cadDocument (no debe exportarse como documento);
 *  - bloques sf_cad_blocks con versiones.
 *
 * Subcomandos:
 *   seed  — limpia las tablas CAD de la BD fixture y siembra todo (default).
 *   bump  — simula un guardado nuevo en el ORIGEN sobre el layout inline de
 *           tenant-alfa (documento cambiado + CAS+1 + updated_at) para probar
 *           el export DELTA.
 *
 * SOLO para BDs desechables de prueba — jamás apuntar a una BD real.
 */

export const TENANT_A = 'tenant-alfa';
export const TENANT_B = 'tenant-beta';

export const LAYOUT_A1_INLINE = '11111111-1111-4111-8111-111111111111';
export const LAYOUT_A2_BLOB = '22222222-2222-4222-8222-222222222222';
export const LAYOUT_A3_SHARED = '33333333-3333-4333-8333-333333333333';
export const LAYOUT_A4_NODOC = '44444444-4444-4444-8444-444444444444';
export const LAYOUT_B1_INLINE = '55555555-5555-4555-8555-555555555555';
export const LAYOUT_B2_BLOB = '66666666-6666-4666-8666-666666666666';

export const BLOCK_A1 = 'aaaaaaa1-0000-4000-8000-00000000000a';
export const BLOCK_A2 = 'aaaaaaa2-0000-4000-8000-00000000000b';
export const BLOCK_B1 = 'bbbbbbb1-0000-4000-8000-00000000000c';

export const BLOB_KEY_A = 'f0000000-aaaa-4aaa-8aaa-00000000000a';
export const BLOB_KEY_B = 'f0000000-bbbb-4bbb-8bbb-00000000000b';

const T0 = '2026-07-01T10:00:00.000Z';
const T1 = '2026-07-10T12:30:00.000Z';

function smallDocument(
  tag: string,
  version: number,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    meta: { schema: 3, version, unit: 'mm' },
    entities: [
      {
        id: `muro-${tag}-1`,
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 12000, y: 0 },
        layer: 'A-MURO',
      },
      {
        id: `texto-${tag}`,
        type: 'text',
        position: { x: 500, y: 700 },
        text: `Línea Ñandú 🏭 — «${tag}» v${version}`,
        layer: 'TEXTO',
      },
    ],
    ...extras,
  };
}

/** Documento >1 MB SIN comprimir (umbral de puntero del origen: 1_000_000). */
export function bigDocument(tenant: string): Record<string, unknown> {
  const entities: Record<string, unknown>[] = [];
  for (let i = 0; i < 11000; i += 1) {
    entities.push({
      id: `e-${tenant}-${i}`,
      type: 'line',
      start: { x: (i * 7919) % 100003, y: (i * 104729) % 99991 },
      end: { x: (i * 15485863) % 100019, y: (i * 32452843) % 99989 },
      layer: `CAPA-${i % 8}`,
    });
  }
  entities.push({
    id: `titulo-${tenant}`,
    type: 'text',
    position: { x: 1, y: 2 },
    text: `Plano grande de ${tenant} — 大きい図面 ✓`,
    layer: 'TEXTO',
  });
  return {
    meta: { schema: 3, version: 5, unit: 'mm' },
    entities,
    paperSpaces: [
      { id: 'ps-1', name: 'Hoja A1', page: { width: 841, height: 594 } },
    ],
    publications: [
      {
        id: `pub-${tenant}-grande`,
        fileName: 'plano-grande.pdf',
        sha256: 'b'.repeat(64),
        bytes: 4321,
        paperSpaceIds: ['ps-1'],
        publishedBy: `ing@${tenant}.mx`,
        publishedAt: T1,
      },
    ],
  };
}

export interface FixtureBlob {
  blobKey: string;
  tenantId: string;
  sha256: string;
  compressed: Buffer;
  uncompressedBytes: number;
}

export function buildPointerBlob(
  document: Record<string, unknown>,
  blobKey: string,
  tenantId: string,
): { blob: FixtureBlob; pointer: Record<string, unknown> } {
  const source = Buffer.from(JSON.stringify(document), 'utf8');
  const compressed = gzipSync(source, { level: 6 });
  const sha = sha256Hex(compressed);
  return {
    blob: {
      blobKey,
      tenantId,
      sha256: sha,
      compressed,
      uncompressedBytes: source.length,
    },
    pointer: {
      _storage: {
        kind: 'document_blob',
        version: 1,
        blobKey,
        sha256: sha,
        encoding: 'gzip',
        compressedBytes: compressed.length,
        uncompressedBytes: source.length,
      },
      summary: {
        schema: 3,
        contentVersion: Number(
          (document.meta as Record<string, unknown>)?.version ?? 0,
        ),
        entityCount: Array.isArray(document.entities)
          ? document.entities.length
          : 0,
      },
    },
  };
}

const json = (value: unknown): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);

async function insertLayout(
  client: Client,
  row: {
    id: string;
    tenantId: string;
    model: string;
    revision: string;
    cadDocument: Record<string, unknown> | null;
    cadDocumentVersion: number;
    layers?: unknown[] | null;
    connectors?: unknown[] | null;
    assets?: unknown[] | null;
    annotations?: unknown[] | null;
    cells?: unknown[] | null;
    snapshots?: unknown[] | null;
    approval?: {
      status: string;
      by: string;
      at: string;
      note: string;
    } | null;
    dxf?: {
      data: string;
      name: string;
      offsetX: number;
      offsetY: number;
      scale: number;
      rotation: number;
      visible: boolean;
      opacity: number;
    } | null;
    createdBy?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO sf_line_layouts (
       id, tenant_id, organization_id, plant_id, created_at, updated_at,
       created_by, model, revision, footprint_w, footprint_h, unit, grid_size,
       approval_status, approved_by, approved_at, approval_note,
       dxf_data, dxf_name, dxf_offset_x, dxf_offset_y, dxf_scale, dxf_rotation,
       dxf_visible, dxf_opacity, connectors, assets, annotations, snapshots,
       cells, layers, cad_document, cad_document_version
     ) VALUES ($1,$2,NULL,'planta-1',$3,$4,$5,$6,$7,20000,10000,'mm',500,
               $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,$24::jsonb,
               $25::jsonb,$26::jsonb,$27)`,
    [
      row.id,
      row.tenantId,
      T0,
      T1,
      row.createdBy ?? `seed@${row.tenantId}.mx`,
      row.model,
      row.revision,
      row.approval?.status ?? null,
      row.approval?.by ?? null,
      row.approval?.at ?? null,
      row.approval?.note ?? null,
      row.dxf?.data ?? null,
      row.dxf?.name ?? null,
      row.dxf?.offsetX ?? 0,
      row.dxf?.offsetY ?? 0,
      row.dxf?.scale ?? 1,
      row.dxf?.rotation ?? 0,
      row.dxf?.visible ?? true,
      row.dxf?.opacity ?? 0.5,
      json(row.connectors ?? null),
      json(row.assets ?? null),
      json(row.annotations ?? null),
      json(row.snapshots ?? null),
      json(row.cells ?? null),
      json(row.layers ?? null),
      json(row.cadDocument),
      row.cadDocumentVersion,
    ],
  );
}

export async function seed(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    // BD desechable: se resiembra desde cero (solo tablas CAD del fixture).
    await client.query('DELETE FROM sf_line_layouts');
    await client.query('DELETE FROM sf_cad_blocks');
    await client.query('DELETE FROM doc_blobs');

    /* ── Blobs (gzip real, sha256 correcto) ─────────────────────────── */
    const bigA = buildPointerBlob(bigDocument(TENANT_A), BLOB_KEY_A, TENANT_A);
    const bigB = buildPointerBlob(bigDocument(TENANT_B), BLOB_KEY_B, TENANT_B);
    for (const { blob } of [bigA, bigB]) {
      await client.query(
        `INSERT INTO doc_blobs (blob_key, tenant_id, sha256, size, data, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          blob.blobKey,
          blob.tenantId,
          blob.sha256,
          blob.compressed.length,
          blob.compressed,
          T0,
        ],
      );
    }

    /* ── Tenant ALFA ────────────────────────────────────────────────── */
    await insertLayout(client, {
      id: LAYOUT_A1_INLINE,
      tenantId: TENANT_A,
      model: 'LINEA-ALFA-Ñ',
      revision: 'A',
      cadDocument: smallDocument('alfa-uno', 3, {
        paperSpaces: [
          { id: 'ps-1', name: 'Hoja Ñ', page: { width: 841, height: 594 } },
        ],
        publications: [
          {
            id: 'pub-alfa-1',
            fileName: 'plano-alfa-ñ.pdf',
            sha256: 'a'.repeat(64),
            bytes: 1234,
            paperSpaceIds: ['ps-1'],
            publishedBy: 'ing@alfa.mx',
            publishedAt: T1,
          },
        ],
      }),
      cadDocumentVersion: 3,
      layers: [
        {
          id: 'capa-1',
          name: 'Muros Ñ',
          color: '#ff0000',
          visible: true,
          locked: false,
        },
        {
          id: 'capa-2',
          name: 'Texto',
          color: '#00ff00',
          visible: true,
          locked: true,
        },
      ],
      connectors: [{ from: 'st-1', to: 'st-2', kind: 'flow' }],
      assets: [
        {
          id: 'as-1',
          kind: 'bench',
          x: 100,
          y: 200,
          w: 800,
          h: 400,
          rotation: 0,
        },
        {
          id: 'as-2',
          kind: 'robot',
          x: 1500,
          y: 250,
          w: 600,
          h: 600,
          rotation: 90,
        },
      ],
      annotations: [
        {
          id: 'an-1',
          type: 'text',
          x: 10,
          y: 20,
          text: 'Zona segura ⚠️',
          layer: 'capa-2',
        },
      ],
      cells: [
        {
          id: 'cell-1',
          name: 'Celda Ñ1',
          color: '#0000ff',
          stationIds: ['st-1'],
        },
      ],
      snapshots: [
        {
          id: 'snap-a1-1',
          name: 'Antes de aprobar',
          createdAt: '2026-07-02T09:00:00.000Z',
          createdBy: 'ing@alfa.mx',
          footprint: {
            footprintW: 20000,
            footprintH: 10000,
            unit: 'mm',
            gridSize: 500,
          },
          positions: [],
          dxf: null,
          connectors: [],
          assets: [],
          annotations: [],
          cadDocument: smallDocument('alfa-uno', 1),
          cadDocumentVersion: 1,
        },
        {
          id: 'snap-a1-2',
          name: 'Revisión con Ñ',
          createdAt: '2026-07-05T09:00:00.000Z',
          createdBy: 'ing@alfa.mx',
          footprint: {
            footprintW: 20000,
            footprintH: 10000,
            unit: 'mm',
            gridSize: 500,
          },
          positions: [
            { id: 'st-1', x: 100, y: 100, w: 1200, h: 800, rotation: 0 },
          ],
          dxf: {
            offsetX: 5,
            offsetY: 6,
            scale: 1.5,
            rotation: 0,
            visible: true,
            opacity: 0.4,
          },
          connectors: [],
          assets: [],
          annotations: [],
          cadDocument: smallDocument('alfa-uno', 2),
          cadDocumentVersion: 2,
        },
      ],
      approval: {
        status: 'approved',
        by: 'gerente@alfa.mx',
        at: T1,
        note: 'Aprobado para producción — línea Ñ.',
      },
      dxf: {
        data: '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nPISO\n10\n0\n20\n0\n11\n1000\n21\n0\n0\nENDSEC\n0\nEOF\n',
        name: 'planta-alfa-ñ.dxf',
        offsetX: 12.5,
        offsetY: -7.25,
        scale: 2,
        rotation: 90,
        visible: true,
        opacity: 0.35,
      },
    });

    await insertLayout(client, {
      id: LAYOUT_A2_BLOB,
      tenantId: TENANT_A,
      model: 'LINEA-ALFA-GRANDE',
      revision: 'B',
      cadDocument: bigA.pointer,
      cadDocumentVersion: 5,
      layers: [
        {
          id: 'capa-g',
          name: 'General',
          color: '#123456',
          visible: true,
          locked: false,
        },
      ],
      snapshots: [
        {
          id: 'snap-a2-1',
          name: 'Congelada',
          createdAt: '2026-07-08T15:00:00.000Z',
          createdBy: 'ing@alfa.mx',
          footprint: {
            footprintW: 20000,
            footprintH: 10000,
            unit: 'mm',
            gridSize: 500,
          },
          positions: [],
          dxf: null,
          connectors: [],
          assets: [],
          annotations: [],
          // Mismo puntero → mismo blob (el snapshot NO re-infla el documento).
          cadDocument: bigA.pointer,
          cadDocumentVersion: 4,
        },
      ],
    });

    // Dedup: OTRO documento del mismo tenant apuntando al MISMO blob.
    await insertLayout(client, {
      id: LAYOUT_A3_SHARED,
      tenantId: TENANT_A,
      model: 'LINEA-ALFA-COMPARTIDA',
      revision: 'A',
      cadDocument: bigA.pointer,
      cadDocumentVersion: 2,
    });

    // Layout SIN cadDocument: no debe exportarse como documento.
    await insertLayout(client, {
      id: LAYOUT_A4_NODOC,
      tenantId: TENANT_A,
      model: 'LINEA-ALFA-SIN-CAD',
      revision: 'A',
      cadDocument: null,
      cadDocumentVersion: 0,
      assets: [
        { id: 'as-solo', kind: 'rack', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      ],
      dxf: {
        data: '0\nSECTION\n0\nENDSEC\n0\nEOF\n',
        name: 'solo-dxf.dxf',
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotation: 0,
        visible: true,
        opacity: 0.5,
      },
    });

    /* ── Tenant BETA ────────────────────────────────────────────────── */
    await insertLayout(client, {
      id: LAYOUT_B1_INLINE,
      tenantId: TENANT_B,
      model: 'LINEA-BETA-月',
      revision: 'C',
      cadDocument: smallDocument('beta-uno', 1),
      cadDocumentVersion: 1,
      layers: [
        {
          id: 'capa-b',
          name: '月のレイヤ',
          color: '#abcdef',
          visible: false,
          locked: false,
        },
      ],
      snapshots: [
        {
          id: 'snap-b1-1',
          name: 'Snapshot legado sin CAS',
          createdAt: '2026-07-03T08:00:00.000Z',
          createdBy: null,
          footprint: {
            footprintW: 20000,
            footprintH: 10000,
            unit: 'mm',
            gridSize: 500,
          },
          positions: [],
          dxf: null,
          connectors: [],
          assets: [],
          annotations: [],
          // BORDE: documento embebido SIN token CAS → no migra como versión.
          cadDocument: smallDocument('beta-uno-viejo', 0),
        },
      ],
    });

    await insertLayout(client, {
      id: LAYOUT_B2_BLOB,
      tenantId: TENANT_B,
      model: 'LINEA-BETA-GRANDE',
      revision: 'A',
      cadDocument: bigB.pointer,
      cadDocumentVersion: 2,
      snapshots: [
        {
          id: 'snap-b2-1',
          name: 'Boceto embebido',
          createdAt: '2026-07-04T08:00:00.000Z',
          createdBy: 'ing@beta.mx',
          footprint: {
            footprintW: 20000,
            footprintH: 10000,
            unit: 'mm',
            gridSize: 500,
          },
          positions: [],
          dxf: null,
          connectors: [],
          assets: [],
          annotations: [],
          cadDocument: smallDocument('beta-grande', 1),
          cadDocumentVersion: 1,
        },
      ],
      approval: {
        status: 'in_review',
        by: 'auditor@beta.mx',
        at: T1,
        note: 'Pendiente de firma.',
      },
    });

    /* ── Bloques CAD ────────────────────────────────────────────────── */
    const insertBlock = (
      id: string,
      tenantId: string,
      name: string,
      version: number,
      definition: Record<string, unknown> | null,
    ) =>
      client.query(
        `INSERT INTO sf_cad_blocks (
           id, tenant_id, organization_id, plant_id, created_at, updated_at,
           created_by, name, assets, definition, version
         ) VALUES ($1,$2,NULL,'planta-1',$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
        [
          id,
          tenantId,
          T0,
          T1,
          `seed@${tenantId}.mx`,
          name,
          json([
            {
              id: 'b-1',
              kind: 'conveyor',
              x: 0,
              y: 0,
              w: 2000,
              h: 400,
              rotation: 0,
            },
            {
              id: 'b-2',
              kind: 'printer',
              x: 2100,
              y: 0,
              w: 800,
              h: 600,
              rotation: 0,
            },
          ]),
          json(definition),
          version,
        ],
      );
    await insertBlock(BLOCK_A1, TENANT_A, 'Celda SMT Ñ', 2, {
      schema: 1,
      origin: { x: 0, y: 0 },
      description: 'Celda estándar SMT — versión 2 ✓',
    });
    await insertBlock(BLOCK_A2, TENANT_A, 'Conveyor doble', 1, null);
    await insertBlock(BLOCK_B1, TENANT_B, 'Horno reflow 月', 1, {
      schema: 1,
      origin: { x: 0, y: 0 },
    });

    await client.query('COMMIT');
    console.log(
      'Fixture sembrado: 6 layouts (5 con cad_document, 1 sin), 3 bloques, 2 blobs.',
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Simula un guardado nuevo en el ORIGEN: el layout inline de tenant-alfa
 * cambia contenido, avanza el CAS (3→4) y toca `updated_at`. El siguiente
 * `export --delta-base` debe traer SOLO este documento.
 */
export async function bump(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const next = smallDocument('alfa-uno', 4, {
      paperSpaces: [
        { id: 'ps-1', name: 'Hoja Ñ', page: { width: 841, height: 594 } },
      ],
      publications: [
        {
          id: 'pub-alfa-1',
          fileName: 'plano-alfa-ñ.pdf',
          sha256: 'a'.repeat(64),
          bytes: 1234,
          paperSpaceIds: ['ps-1'],
          publishedBy: 'ing@alfa.mx',
          publishedAt: T1,
        },
      ],
    });
    (next.entities as Record<string, unknown>[]).push({
      id: 'muro-nuevo-4',
      type: 'line',
      start: { x: 0, y: 8000 },
      end: { x: 12000, y: 8000 },
      layer: 'A-MURO',
    });
    const result = await client.query(
      `UPDATE sf_line_layouts
          SET cad_document = $2::jsonb,
              cad_document_version = cad_document_version + 1,
              updated_at = now()
        WHERE id = $1 AND cad_document_version = 3`,
      [LAYOUT_A1_INLINE, JSON.stringify(next)],
    );
    console.log(
      `bump: layout ${LAYOUT_A1_INLINE} → CAS 4 (filas afectadas: ${result.rowCount}).`,
    );
  } finally {
    await client.end();
  }
}

/* istanbul ignore next — punto de entrada real */
if (require.main === module) {
  const url = process.env.DATABASE_URL_SOURCE;
  if (!url) {
    console.error('Define DATABASE_URL_SOURCE hacia la BD fixture DESECHABLE.');
    process.exit(2);
  }
  const mode = process.argv[2] ?? 'seed';
  const run = mode === 'bump' ? bump : seed;
  run(url).catch((err) => {
    console.error('ERROR:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
