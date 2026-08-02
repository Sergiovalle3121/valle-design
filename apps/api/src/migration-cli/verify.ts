import { isStoredCadDocumentBlobPointer } from '../modules/cad-documents/cad-document-storage';
import { tenantLaneKey, type EntityCounts, emptyCounts } from './archive';
import {
  extractLayout,
  extractPublications,
  storedContentSha256,
} from './extract';
import { SourceReader } from './source';
import { sha256Hex } from './stable-json';
import { TargetDb } from './target';
import { decodeCadDocumentArchive } from '../modules/cad-documents/cad-document-storage';

/**
 * REPORTE DE PARIDAD origen (enterprise) vs destino (design): conteos por
 * entidad y tenant, y comparación profunda por documento — versión CAS,
 * hash del contenido canónico (puntero o inline estable), historial de
 * versiones, publicaciones, bloques y blobs (bytes re-hasheados en AMBOS
 * lados). El origen se lee con la misma transacción READ ONLY estructural
 * del export. Exit code 1 ante CUALQUIER discrepancia.
 *
 * El alcance son las filas MIGRABLES del origen y las filas del destino con
 * `legacy_source_id` (las nativas de Design no participan). Una fila legacy
 * del destino que el origen no tiene también es discrepancia (huérfana) —
 * así, tras un rollback, este comando demuestra el destino limpio mostrando
 * destino=0 con exit code 1 (paridad rota a propósito).
 */
export interface VerifyOptions {
  sourceUrl: string;
  targetUrl: string;
  tenants: string[] | null;
}

export interface VerifyResult {
  exitCode: number;
  countsByLane: Record<string, { source: EntityCounts; target: EntityCounts }>;
  discrepancies: string[];
}

export async function runVerify(options: VerifyOptions): Promise<VerifyResult> {
  const discrepancies: string[] = [];
  const countsByLane: VerifyResult['countsByLane'] = {};
  const laneEntry = (tenantId: string | null) =>
    (countsByLane[tenantLaneKey(tenantId)] ??= {
      source: emptyCounts(),
      target: emptyCounts(),
    });

  const reader = await SourceReader.connect(options.sourceUrl);
  const target = await TargetDb.connect(options.targetUrl);
  try {
    const layouts = await reader.readLayouts(options.tenants);
    const blocks = await reader.readBlocks(options.tenants);
    const expectedDocKeys = new Set<string>();
    const expectedBlockKeys = new Set<string>();
    const expectedBlobs = new Map<
      string,
      { tenantId: string | null; sha256: string; size: number }
    >();

    for (const layout of layouts) {
      const extraction = extractLayout(layout);
      if (!extraction.document) continue;
      const doc = extraction.document;
      const lane = laneEntry(doc.tenantId);
      lane.source.documents += 1;
      lane.source.versions += extraction.versions.length;
      expectedDocKeys.add(`${doc.tenantId ?? ' '}::${doc.legacySourceId}`);

      /* documento canónico en destino */
      const params: unknown[] = [doc.legacySourceId];
      const where = target.lane('tenant_id', doc.tenantId, params);
      const rows = await target.query<{
        id: string;
        cad_document_version: number;
        cad_document: Record<string, unknown> | null;
      }>(
        `SELECT id, cad_document_version, cad_document
           FROM cad_documents WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      if (!rows.length) {
        discrepancies.push(
          `Documento ${doc.legacySourceId} (tenant ${doc.tenantId ?? 'NULL'}): ausente en destino.`,
        );
      } else {
        lane.target.documents += 1;
        const targetRow = rows[0];
        if (Number(targetRow.cad_document_version) !== doc.cadDocumentVersion) {
          discrepancies.push(
            `Documento ${doc.legacySourceId}: versión CAS origen ${doc.cadDocumentVersion} ≠ destino ${targetRow.cad_document_version}.`,
          );
        }
        const targetSha = targetRow.cad_document
          ? storedContentSha256(targetRow.cad_document)
          : null;
        if (targetSha !== doc.contentSha256) {
          discrepancies.push(
            `Documento ${doc.legacySourceId}: hash de contenido origen ${doc.contentSha256} ≠ destino ${targetSha ?? 'NULL'}.`,
          );
        }

        /* versiones CAS */
        for (const version of extraction.versions) {
          const found = await target.query<{
            cad_document: Record<string, unknown>;
          }>(
            `SELECT cad_document FROM cad_document_versions
              WHERE document_id = $1 AND version = $2`,
            [targetRow.id, version.version],
          );
          if (!found.length) {
            discrepancies.push(
              `Versión ${version.version} del documento ${doc.legacySourceId}: ausente en destino.`,
            );
            continue;
          }
          lane.target.versions += 1;
          const sha = storedContentSha256(found[0].cad_document);
          if (sha !== version.sha256) {
            discrepancies.push(
              `Versión ${version.version} del documento ${doc.legacySourceId}: hash origen ${version.sha256} ≠ destino ${sha}.`,
            );
          }
        }
      }

      /* blobs referenciados (bytes re-hasheados en ambos lados) */
      for (const blobKey of extraction.referencedBlobKeys) {
        const blob = await reader.readBlobData(doc.tenantId, blobKey);
        if (!blob) {
          discrepancies.push(
            `Blob ${blobKey} (documento ${doc.legacySourceId}): ausente en ORIGEN.`,
          );
          continue;
        }
        const sourceSha = sha256Hex(blob.data);
        if (sourceSha !== blob.sha256.toLowerCase()) {
          discrepancies.push(
            `Blob ${blobKey}: corrupto en ORIGEN (sha real ${sourceSha} ≠ fila ${blob.sha256}).`,
          );
        }
        expectedBlobs.set(`${doc.tenantId ?? ' '}::${sourceSha}`, {
          tenantId: doc.tenantId,
          sha256: sourceSha,
          size: blob.size,
        });
      }

      /* publicaciones (del canónico hidratado) */
      let hydrated: Record<string, unknown> | null = doc.cadDocument;
      if (isStoredCadDocumentBlobPointer(doc.cadDocument)) {
        const blob = await reader.readBlobData(
          doc.tenantId,
          doc.cadDocument._storage.blobKey,
        );
        hydrated = blob
          ? ((await decodeCadDocumentArchive(
              blob.data,
              doc.cadDocument._storage,
            )) as Record<string, unknown>)
          : null;
      }
      if (hydrated) {
        const { publications } = extractPublications(hydrated, layout);
        lane.source.publications += publications.length;
        for (const publication of publications) {
          const pubParams: unknown[] = [publication.legacySourceId];
          const pubWhere = target.lane(
            'tenant_id',
            publication.tenantId,
            pubParams,
          );
          const found = await target.query(
            `SELECT 1 FROM cad_publications WHERE legacy_source_id = $1 AND ${pubWhere}`,
            pubParams,
          );
          if (found.length) lane.target.publications += 1;
          else
            discrepancies.push(
              `Publicación ${publication.legacySourceId} (documento ${doc.legacySourceId}): ausente en destino.`,
            );
        }
      }
    }

    /* blobs esperados en destino */
    for (const expected of expectedBlobs.values()) {
      const lane = laneEntry(expected.tenantId);
      lane.source.blobs += 1;
      const params: unknown[] = [expected.sha256];
      const where = target.lane('tenant_id', expected.tenantId, params);
      const rows = await target.query<{ size: number; data: Buffer }>(
        `SELECT size, data FROM design_blobs WHERE sha256 = $1 AND ${where}`,
        params,
      );
      if (!rows.length) {
        discrepancies.push(
          `Blob ${expected.sha256} (tenant ${expected.tenantId ?? 'NULL'}): ausente en destino.`,
        );
        continue;
      }
      const actualSha = sha256Hex(rows[0].data);
      if (actualSha !== expected.sha256 || rows[0].size !== expected.size) {
        discrepancies.push(
          `Blob ${expected.sha256}: bytes del destino no verifican (sha real ${actualSha}, tamaño ${rows[0].size} ≠ ${expected.size}).`,
        );
        continue;
      }
      lane.target.blobs += 1;
    }

    /* bloques */
    for (const blockRow of blocks) {
      const lane = laneEntry(blockRow.tenant_id ?? null);
      lane.source.blocks += 1;
      expectedBlockKeys.add(`${blockRow.tenant_id ?? ' '}::${blockRow.id}`);
      const params: unknown[] = [blockRow.id];
      const where = target.lane(
        'tenant_id',
        blockRow.tenant_id ?? null,
        params,
      );
      const rows = await target.query<{ version: number }>(
        `SELECT version FROM sf_cad_blocks
          WHERE legacy_source_id = $1 AND deleted_at IS NULL AND ${where}`,
        params,
      );
      if (!rows.length) {
        discrepancies.push(`Bloque ${blockRow.id}: ausente en destino.`);
        continue;
      }
      lane.target.blocks += 1;
      if (Number(rows[0].version) !== Number(blockRow.version)) {
        discrepancies.push(
          `Bloque ${blockRow.id}: versión origen ${blockRow.version} ≠ destino ${rows[0].version}.`,
        );
      }
    }

    /* huérfanos legacy en destino (filas importadas que el origen ya no tiene) */
    const laneFilter = (params: unknown[]): string => {
      if (!options.tenants) return '';
      params.push(options.tenants);
      return ` AND tenant_id = ANY($${params.length})`;
    };
    {
      const params: unknown[] = [];
      const rows = await target.query<{
        tenant_id: string | null;
        legacy_source_id: string;
      }>(
        `SELECT tenant_id, legacy_source_id FROM cad_documents
          WHERE legacy_source_id IS NOT NULL${laneFilter(params)}`,
        params,
      );
      for (const row of rows) {
        if (
          !expectedDocKeys.has(
            `${row.tenant_id ?? ' '}::${row.legacy_source_id}`,
          )
        ) {
          discrepancies.push(
            `Documento huérfano en destino: legacy_source_id ${row.legacy_source_id} (tenant ${row.tenant_id ?? 'NULL'}) no existe (o no es migrable) en el origen.`,
          );
        }
      }
    }
    {
      const params: unknown[] = [];
      const rows = await target.query<{
        tenant_id: string | null;
        legacy_source_id: string;
      }>(
        `SELECT tenant_id, legacy_source_id FROM sf_cad_blocks
          WHERE legacy_source_id IS NOT NULL AND deleted_at IS NULL${laneFilter(params)}`,
        params,
      );
      for (const row of rows) {
        if (
          !expectedBlockKeys.has(
            `${row.tenant_id ?? ' '}::${row.legacy_source_id}`,
          )
        ) {
          discrepancies.push(
            `Bloque huérfano en destino: legacy_source_id ${row.legacy_source_id} (tenant ${row.tenant_id ?? 'NULL'}) no existe en el origen.`,
          );
        }
      }
    }

    return {
      exitCode: discrepancies.length ? 1 : 0,
      countsByLane,
      discrepancies,
    };
  } finally {
    await reader.close();
    await target.close();
  }
}
