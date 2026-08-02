import {
  readManifest,
  readNdjson,
  verifyArchiveFiles,
  type ArchiveManifest,
  type BlockExportRecord,
  type DocumentExportRecord,
} from './archive';
import { IMPORT_PROJECT_LEGACY_ID } from './import';
import { TargetDb } from './target';

/**
 * ROLLBACK EXACTO de un import: borra del destino SOLO lo que el manifiesto
 * del archivo importado declara —
 *
 * - `cad_documents` por (tenant, legacy_source_id) del manifiesto; el borrado
 *   arrastra por FK sus `cad_document_versions` y `cad_publications` (que son
 *   hijas de ESA fila importada);
 * - `sf_cad_blocks` por (tenant, legacy_source_id) del manifiesto;
 * - el proyecto contenedor "Importado de Enterprise" del lane, SOLO si queda
 *   sin documentos;
 * - `design_blobs` de los sha del manifiesto, SOLO si tras el borrado ningún
 *   puntero vivo (documentos o versiones) los referencia (huérfanos
 *   resultantes).
 *
 * Una fila SIN legacy_source_id (nativa de Design) es INTOCABLE por
 * construcción: todos los DELETE filtran por los ids del manifiesto. Los datos
 * del ORIGEN jamás se tocan (este comando ni se conecta al origen).
 */
export interface RollbackOptions {
  targetUrl: string;
  archiveDir: string;
  tenants: string[] | null;
  dryRun: boolean;
}

export interface RollbackResult {
  exitCode: number;
  deleted: {
    documents: number;
    versions: number;
    publications: number;
    blocks: number;
    blobs: number;
    projects: number;
  };
  keptBlobs: number;
  errors: string[];
}

export async function runRollback(
  options: RollbackOptions,
): Promise<RollbackResult> {
  const deleted = {
    documents: 0,
    versions: 0,
    publications: 0,
    blocks: 0,
    blobs: 0,
    projects: 0,
  };
  const errors: string[] = [];
  let keptBlobs = 0;

  let manifest: ArchiveManifest;
  try {
    manifest = readManifest(options.archiveDir);
    verifyArchiveFiles(options.archiveDir, manifest);
  } catch (err) {
    return {
      exitCode: 1,
      deleted,
      keptBlobs,
      errors: [
        err instanceof Error ? err.message : String(err),
        'El archivo no pasó la verificación de integridad; rollback abortado sin tocar el destino.',
      ],
    };
  }

  const inScope = (tenantId: string | null): boolean =>
    !options.tenants ||
    (tenantId !== null && options.tenants.includes(tenantId));

  // El alcance del borrado sale de los REGISTROS del archivo (mismo criterio
  // que el import), no de conteos: exactitud fila a fila.
  const documents = (
    await readNdjson<DocumentExportRecord>(
      options.archiveDir,
      'documents.ndjson',
    )
  ).filter((r) => inScope(r.tenantId));
  const blocks = (
    await readNdjson<BlockExportRecord>(options.archiveDir, 'blocks.ndjson')
  ).filter((r) => inScope(r.tenantId));
  const blobs = manifest.blobs.filter((b) => inScope(b.tenantId));

  const target = await TargetDb.connect(options.targetUrl);
  try {
    const lanes = new Set<string | null>();
    /** Ids de documentos borrados (o que el dry-run borraría): las
     *  comprobaciones de huérfanos simulan el estado POST-borrado. */
    const deletedDocumentIds: string[] = [];

    for (const record of documents) {
      lanes.add(record.tenantId);
      const params: unknown[] = [record.legacySourceId];
      const where = target.lane('tenant_id', record.tenantId, params);
      const rows = await target.query<{ id: string }>(
        `SELECT id FROM cad_documents WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      if (!rows.length) continue;
      const documentId = rows[0].id;
      deletedDocumentIds.push(documentId);
      const versionRows = await target.query<{ n: string }>(
        `SELECT count(*) AS n FROM cad_document_versions WHERE document_id = $1`,
        [documentId],
      );
      const publicationRows = await target.query<{ n: string }>(
        `SELECT count(*) AS n FROM cad_publications WHERE document_id = $1`,
        [documentId],
      );
      deleted.documents += 1;
      deleted.versions += Number(versionRows[0]?.n ?? 0);
      deleted.publications += Number(publicationRows[0]?.n ?? 0);
      if (!options.dryRun) {
        // El FK ON DELETE CASCADE arrastra versiones y publicaciones.
        await target.query(`DELETE FROM cad_documents WHERE id = $1`, [
          documentId,
        ]);
      }
    }

    for (const record of blocks) {
      const params: unknown[] = [record.legacySourceId];
      const where = target.lane('tenant_id', record.tenantId, params);
      const rows = await target.query<{ id: string }>(
        `SELECT id FROM sf_cad_blocks WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      if (!rows.length) continue;
      deleted.blocks += 1;
      if (!options.dryRun) {
        await target.query(`DELETE FROM sf_cad_blocks WHERE id = $1`, [
          rows[0].id,
        ]);
      }
    }

    /* Blobs del manifiesto que quedaron huérfanos tras el borrado. */
    for (const blob of blobs) {
      const params: unknown[] = [blob.sha256];
      const where = target.lane('tenant_id', blob.tenantId, params);
      const rows = await target.query<{ blob_key: string }>(
        `SELECT blob_key FROM design_blobs WHERE sha256 = $1 AND ${where}`,
        params,
      );
      if (!rows.length) continue;
      const blobKey = rows[0].blob_key;
      // Referencias VIVAS tras el borrado: se excluyen los documentos (y sus
      // versiones) recién borrados — en dry-run, los que SE BORRARÍAN.
      const referenced = await target.query(
        `SELECT 1 FROM cad_documents
          WHERE cad_document #>> '{_storage,blobKey}' = $1
            AND id <> ALL($2::varchar[])
          UNION ALL
         SELECT 1 FROM cad_document_versions
          WHERE cad_document #>> '{_storage,blobKey}' = $1
            AND document_id <> ALL($2::varchar[])
          LIMIT 1`,
        [blobKey, deletedDocumentIds],
      );
      if (referenced.length) {
        keptBlobs += 1; // otro documento (nativo o de otro import) lo usa
        continue;
      }
      deleted.blobs += 1;
      if (!options.dryRun) {
        await target.query(`DELETE FROM design_blobs WHERE blob_key = $1`, [
          blobKey,
        ]);
      }
    }

    /* Proyecto contenedor por lane, solo si quedó vacío. */
    for (const lane of lanes) {
      const params: unknown[] = [IMPORT_PROJECT_LEGACY_ID];
      const where = target.lane('tenant_id', lane, params);
      const rows = await target.query<{ id: string }>(
        `SELECT id FROM cad_projects WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      if (!rows.length) continue;
      const projectId = rows[0].id;
      const remaining = await target.query(
        `SELECT 1 FROM cad_documents
          WHERE project_id = $1 AND id <> ALL($2::varchar[]) LIMIT 1`,
        [projectId, deletedDocumentIds],
      );
      if (remaining.length) continue;
      deleted.projects += 1;
      if (!options.dryRun) {
        await target.query(`DELETE FROM cad_projects WHERE id = $1`, [
          projectId,
        ]);
      }
    }

    return { exitCode: errors.length ? 1 : 0, deleted, keptBlobs, errors };
  } finally {
    await target.close();
  }
}
