import {
  blockChangedSinceBase,
  deltaKey,
  extractBlock,
  extractLayout,
  extractPublications,
  layoutChangedSinceBase,
  storedContentSha256,
  type DeltaBase,
  type SourceLayoutRow,
} from './extract';
import { stableSha256 } from './stable-json';

function baseRow(overrides: Partial<SourceLayoutRow> = {}): SourceLayoutRow {
  return {
    id: 'layout-1',
    tenant_id: 'tenant-alfa',
    organization_id: null,
    plant_id: 'planta-1',
    model: 'LINEA-1',
    revision: 'A',
    footprint_w: 20000,
    footprint_h: 10000,
    unit: 'mm',
    grid_size: 500,
    approval_status: 'approved',
    approved_by: 'gerente@alfa.mx',
    approved_at: '2026-07-10T12:30:00.000Z',
    approval_note: 'ok',
    dxf_data: 'DXF',
    dxf_name: 'plano.dxf',
    dxf_offset_x: 1,
    dxf_offset_y: 2,
    dxf_scale: 3,
    dxf_rotation: 90,
    dxf_visible: false,
    dxf_opacity: 0.7,
    connectors: [{ from: 'a', to: 'b' }],
    assets: [{ id: 'as-1' }],
    annotations: [{ id: 'an-1' }],
    snapshots: null,
    cells: [{ id: 'c-1' }],
    layers: [{ id: 'capa-1' }],
    cad_document: { meta: { schema: 3, version: 3 }, entities: [] },
    cad_document_version: 3,
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T12:30:00.000Z',
    created_by: 'seed@alfa.mx',
    ...overrides,
  };
}

const pointer = (blobKey: string, sha: string) => ({
  _storage: {
    kind: 'document_blob',
    version: 1,
    blobKey,
    sha256: sha,
    encoding: 'gzip',
    compressedBytes: 10,
    uncompressedBytes: 100,
  },
  summary: { schema: 3, contentVersion: 5, entityCount: 1 },
});

const SHA = 'c'.repeat(64);

describe('extractLayout — parser del modelo legacy', () => {
  it('un layout sin cad_document NO se exporta como documento', () => {
    const result = extractLayout(baseRow({ cad_document: null }));
    expect(result.document).toBeNull();
    expect(result.skippedReason).toBe('sin_documento');
    expect(result.versions).toHaveLength(0);
    expect(result.referencedBlobKeys).toHaveLength(0);
  });

  it('mapea el canónico con dxf, capas y metadata legacy completa', () => {
    const result = extractLayout(baseRow());
    const doc = result.document!;
    expect(doc.legacySourceId).toBe('layout-1');
    expect(doc.tenantId).toBe('tenant-alfa');
    expect(doc.name).toBe('LINEA-1 A');
    expect(doc.dxf).toEqual({
      data: 'DXF',
      name: 'plano.dxf',
      offsetX: 1,
      offsetY: 2,
      scale: 3,
      rotation: 90,
      visible: false,
      opacity: 0.7,
    });
    expect(doc.legacyMetadata.approval).toEqual({
      status: 'approved',
      approvedBy: 'gerente@alfa.mx',
      approvedAt: '2026-07-10T12:30:00.000Z',
      note: 'ok',
    });
    expect(doc.legacyMetadata.footprint).toEqual({
      footprintW: 20000,
      footprintH: 10000,
      unit: 'mm',
      gridSize: 500,
    });
    expect(doc.legacyMetadata.connectors).toEqual([{ from: 'a', to: 'b' }]);
    expect(doc.contentSha256).toBe(
      stableSha256({ meta: { schema: 3, version: 3 }, entities: [] }),
    );
  });

  it('el canónico genera su versión CAS y los snapshots llegan etiquetados', () => {
    const snapDoc = {
      meta: { schema: 3, version: 1 },
      entities: [{ id: 'x' }],
    };
    const result = extractLayout(
      baseRow({
        snapshots: [
          {
            id: 'snap-1',
            name: 'Antes de aprobar',
            createdAt: '2026-07-02T09:00:00.000Z',
            cadDocument: snapDoc,
            cadDocumentVersion: 1,
          },
        ],
      }),
    );
    expect(result.versions.map((v) => v.version).sort()).toEqual([1, 3]);
    const canonical = result.versions.find((v) => v.version === 3)!;
    expect(canonical.label).toBeNull();
    expect(canonical.legacySourceId).toBe('layout-1:v3');
    const snapshot = result.versions.find((v) => v.version === 1)!;
    expect(snapshot.label).toBe('Antes de aprobar');
    expect(snapshot.legacySourceId).toBe('snap-1');
    expect(snapshot.sha256).toBe(stableSha256(snapDoc));
  });

  it('snapshot con doc pero SIN token CAS válido: aviso y no genera versión', () => {
    const result = extractLayout(
      baseRow({
        snapshots: [
          { id: 'snap-x', name: 'legado', cadDocument: { meta: {} } },
        ],
      }),
    );
    expect(result.versions).toHaveLength(1); // solo la canónica
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'snapshot_sin_version' }),
    ]);
    const summaries = result.document!.legacyMetadata.snapshots as unknown[];
    expect(summaries).toHaveLength(1); // la metadata SÍ conserva el resumen
  });

  it('conflicto de slot: snapshot con contenido DISTINTO en la versión canónica se descarta con aviso', () => {
    const result = extractLayout(
      baseRow({
        snapshots: [
          {
            id: 'snap-c',
            name: 'conflicto',
            cadDocument: { meta: { schema: 3 }, entities: [{ id: 'otro' }] },
            cadDocumentVersion: 3,
          },
        ],
      }),
    );
    expect(result.versions).toHaveLength(1);
    expect(result.versions[0].label).toBeNull(); // ganó la canónica
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'conflicto_version_snapshot' }),
    ]);
  });

  it('snapshot duplicado con el MISMO contenido se colapsa en silencio', () => {
    const doc = baseRow().cad_document!;
    const result = extractLayout(
      baseRow({
        snapshots: [
          { id: 's1', name: 'igual', cadDocument: doc, cadDocumentVersion: 3 },
        ],
      }),
    );
    expect(result.versions).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('documento con CAS 0: se copia pero avisa y no genera historial', () => {
    const result = extractLayout(baseRow({ cad_document_version: 0 }));
    expect(result.document).not.toBeNull();
    expect(result.versions).toHaveLength(0);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'documento_version_cero' }),
    ]);
  });

  it('punteros: sha del manifiesto como huella y blobKeys deduplicadas', () => {
    const ptr = pointer('bk-1', SHA);
    const result = extractLayout(
      baseRow({
        cad_document: ptr,
        cad_document_version: 5,
        snapshots: [
          {
            id: 'snap-p',
            name: 'congelada',
            cadDocument: ptr,
            cadDocumentVersion: 4,
          },
        ],
      }),
    );
    expect(result.document!.contentSha256).toBe(SHA);
    expect(result.versions).toHaveLength(2);
    expect(result.referencedBlobKeys).toEqual(['bk-1']); // dedup
  });
});

describe('extractPublications — recibos embebidos', () => {
  const row = {
    id: 'layout-1',
    tenant_id: 'tenant-alfa',
    updated_at: '2026-07-10T12:30:00.000Z',
  };

  it('extrae recibos válidos con su id legacy', () => {
    const { publications, warnings } = extractPublications(
      {
        publications: [
          {
            id: 'pub-1',
            fileName: 'plano.pdf',
            sha256: 'A'.repeat(64),
            bytes: 10,
            paperSpaceIds: ['ps-1'],
            publishedBy: 'ing@alfa.mx',
            publishedAt: '2026-07-09T00:00:00.000Z',
          },
        ],
      },
      row,
    );
    expect(warnings).toHaveLength(0);
    expect(publications).toHaveLength(1);
    expect(publications[0]).toMatchObject({
      legacySourceId: 'pub-1',
      sha256: 'a'.repeat(64),
      bytes: 10,
      documentLegacySourceId: 'layout-1',
    });
  });

  it('recibo sin id: legacy_source_id determinista por hash estable', () => {
    const receipt = {
      sha256: 'b'.repeat(64),
      bytes: 5,
      paperSpaceIds: ['ps-1'],
    };
    const first = extractPublications({ publications: [receipt] }, row);
    const second = extractPublications(
      {
        publications: [
          { paperSpaceIds: ['ps-1'], bytes: 5, sha256: 'b'.repeat(64) },
        ],
      },
      row,
    );
    expect(first.publications[0].legacySourceId).toHaveLength(64);
    expect(first.publications[0].legacySourceId).toBe(
      second.publications[0].legacySourceId,
    );
  });

  it('recibo malformado se descarta con aviso sin abortar', () => {
    const { publications, warnings } = extractPublications(
      { publications: [{ sha256: 'no-es-hex', bytes: 0, paperSpaceIds: [] }] },
      row,
    );
    expect(publications).toHaveLength(0);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'publicacion_invalida' }),
    ]);
  });

  it('documento sin arreglo publications → vacío', () => {
    expect(extractPublications({}, row).publications).toHaveLength(0);
  });
});

describe('storedContentSha256', () => {
  it('para un puntero usa el sha del manifiesto (minúsculas)', () => {
    expect(storedContentSha256(pointer('bk', SHA.toUpperCase()))).toBe(SHA);
  });
  it('para inline usa el hash estable (independiente del orden de claves)', () => {
    expect(storedContentSha256({ b: 1, a: 2 })).toBe(
      storedContentSha256({ a: 2, b: 1 }),
    );
  });
});

describe('delta — comparación contra manifiesto base', () => {
  const base: DeltaBase = {
    documents: new Map([
      [deltaKey('t', 'd1'), { cadDocumentVersion: 3, updatedAt: 'T1' }],
    ]),
    blocks: new Map([[deltaKey('t', 'b1'), { version: 2, updatedAt: 'T1' }]]),
    blobShas: new Set(),
  };

  it('sin base todo cuenta como cambiado (export completo)', () => {
    expect(layoutChangedSinceBase(null, 't', 'd1', 3, 'T1')).toBe(true);
  });
  it('documento idéntico (CAS + updated_at) NO cambia', () => {
    expect(layoutChangedSinceBase(base, 't', 'd1', 3, 'T1')).toBe(false);
  });
  it('CAS avanzado o updated_at distinto o doc nuevo → cambiado', () => {
    expect(layoutChangedSinceBase(base, 't', 'd1', 4, 'T1')).toBe(true);
    expect(layoutChangedSinceBase(base, 't', 'd1', 3, 'T2')).toBe(true);
    expect(layoutChangedSinceBase(base, 't', 'd2', 1, 'T1')).toBe(true);
  });
  it('bloques: misma semántica con version/updated_at', () => {
    expect(blockChangedSinceBase(base, 't', 'b1', 2, 'T1')).toBe(false);
    expect(blockChangedSinceBase(base, 't', 'b1', 3, 'T1')).toBe(true);
    expect(blockChangedSinceBase(base, 't', 'b2', 1, 'T1')).toBe(true);
  });
});

describe('extractBlock', () => {
  it('mapea el bloque con su legacy_source_id y versión', () => {
    const block = extractBlock({
      id: 'blk-1',
      tenant_id: 'tenant-alfa',
      organization_id: null,
      plant_id: 'planta-1',
      name: 'Celda SMT Ñ',
      assets: [{ id: 'b-1' }],
      definition: { schema: 1 },
      version: 2,
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-10T12:30:00.000Z',
      created_by: 'seed@alfa.mx',
    });
    expect(block.legacySourceId).toBe('blk-1');
    expect(block.version).toBe(2);
    expect(block.name).toBe('Celda SMT Ñ');
  });
});
