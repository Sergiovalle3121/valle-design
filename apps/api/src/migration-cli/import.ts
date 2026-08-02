import { randomUUID } from 'node:crypto';
import {
  ArchiveIntegrityError,
  readArchiveBlob,
  readManifest,
  readNdjson,
  verifyArchiveFiles,
  type ArchiveManifest,
  type BlobExportRecord,
  type BlockExportRecord,
  type DocumentExportRecord,
  type PublicationExportRecord,
  type VersionExportRecord,
} from './archive';
import { storedContentSha256 } from './extract';
import {
  planBlobAction,
  planBlockAction,
  planDocumentAction,
  rewritePointerBlobKey,
  type ExistingBlob,
  type ExistingBlock,
  type ExistingDocument,
} from './import-plan';
import { stableSha256 } from './stable-json';
import { TargetDb, jsonParam } from './target';

export const IMPORT_PROJECT_LEGACY_ID = 'enterprise-import';
export const IMPORT_PROJECT_NAME = 'Importado de Enterprise';

export interface ImportOptions {
  targetUrl: string;
  archiveDir: string;
  tenants: string[] | null;
  projectId: string | null;
  dryRun: boolean;
  resume: boolean;
}

export interface EntityReport {
  archivo: number;
  insertados: number;
  actualizados: number;
  sinCambios: number;
  omitidos: number;
}

export interface ImportResult {
  exitCode: number;
  report: Record<
    'documents' | 'versions' | 'publications' | 'blocks' | 'blobs',
    EntityReport
  >;
  discrepancies: string[];
  errors: string[];
  /** Paridad final archivo (en alcance) vs destino. */
  parity: { entity: string; archivo: number; destino: number }[];
}

function emptyReport(): EntityReport {
  return {
    archivo: 0,
    insertados: 0,
    actualizados: 0,
    sinCambios: 0,
    omitidos: 0,
  };
}

function inScope(tenantId: string | null, tenants: string[] | null): boolean {
  if (!tenants) return true;
  return tenantId !== null && tenants.includes(tenantId);
}

export function blockContentSha256(record: {
  name: string;
  assets: unknown[];
  definition: Record<string, unknown> | null;
  version: number;
}): string {
  return stableSha256({
    name: record.name,
    assets: record.assets,
    definition: record.definition,
    version: record.version,
  });
}

export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const errors: string[] = [];
  const discrepancies: string[] = [];
  const report: ImportResult['report'] = {
    documents: emptyReport(),
    versions: emptyReport(),
    publications: emptyReport(),
    blocks: emptyReport(),
    blobs: emptyReport(),
  };
  const parity: ImportResult['parity'] = [];

  let manifest: ArchiveManifest;
  try {
    manifest = readManifest(options.archiveDir);
    verifyArchiveFiles(options.archiveDir, manifest);
  } catch (err) {
    return {
      exitCode: 1,
      report,
      discrepancies,
      parity,
      errors: [
        err instanceof Error ? err.message : String(err),
        'El archivo de exportación no pasó la verificación de integridad; no se tocó el destino.',
      ],
    };
  }

  const documents = (
    await readNdjson<DocumentExportRecord>(
      options.archiveDir,
      'documents.ndjson',
    )
  ).filter((r) => inScope(r.tenantId, options.tenants));
  const versions = (
    await readNdjson<VersionExportRecord>(options.archiveDir, 'versions.ndjson')
  ).filter((r) => inScope(r.tenantId, options.tenants));
  const publications = (
    await readNdjson<PublicationExportRecord>(
      options.archiveDir,
      'publications.ndjson',
    )
  ).filter((r) => inScope(r.tenantId, options.tenants));
  const blocks = (
    await readNdjson<BlockExportRecord>(options.archiveDir, 'blocks.ndjson')
  ).filter((r) => inScope(r.tenantId, options.tenants));
  const blobs = (
    await readNdjson<BlobExportRecord>(options.archiveDir, 'blobs.ndjson')
  ).filter((r) => inScope(r.tenantId, options.tenants));

  report.documents.archivo = documents.length;
  report.versions.archivo = versions.length;
  report.publications.archivo = publications.length;
  report.blocks.archivo = blocks.length;
  report.blobs.archivo = blobs.length;

  const lanes = [...new Set(documents.map((d) => d.tenantId))];
  if (options.projectId && lanes.length > 1) {
    return {
      exitCode: 1,
      report,
      discrepancies,
      parity,
      errors: [
        `--project-id solo es válido con UN lane de tenant en alcance (hay ${lanes.length}); usa --tenant.`,
      ],
    };
  }

  const target = await TargetDb.connect(options.targetUrl);
  try {
    /* ── Proyectos por lane ─────────────────────────────────────────── */
    const projectByLane = new Map<string | null, string>();
    for (const lane of lanes) {
      if (options.projectId) {
        const params: unknown[] = [options.projectId];
        const rows = await target.query<{
          id: string;
          tenant_id: string | null;
        }>(
          `SELECT id, tenant_id FROM cad_projects WHERE id = $1 AND deleted_at IS NULL`,
          params,
        );
        if (!rows.length) {
          errors.push(
            `--project-id ${options.projectId} no existe en el destino.`,
          );
          break;
        }
        if ((rows[0].tenant_id ?? null) !== lane) {
          errors.push(
            `--project-id ${options.projectId} pertenece al tenant ${rows[0].tenant_id ?? 'NULL'}, no a ${lane ?? 'NULL'}.`,
          );
          break;
        }
        projectByLane.set(lane, rows[0].id);
        continue;
      }
      const params: unknown[] = [IMPORT_PROJECT_LEGACY_ID];
      const where = target.lane('tenant_id', lane, params);
      const existing = await target.query<{ id: string }>(
        `SELECT id FROM cad_projects WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      if (existing.length) {
        projectByLane.set(lane, existing[0].id);
      } else if (options.dryRun) {
        projectByLane.set(lane, '(se crearía)');
      } else {
        const id = randomUUID();
        await target.query(
          `INSERT INTO cad_projects (id, tenant_id, name, description, status, legacy_source_id)
           VALUES ($1, $2, $3, $4, 'active', $5)`,
          [
            id,
            lane,
            IMPORT_PROJECT_NAME,
            'Documentos CAD copiados desde valle-enterprise (Fase 4).',
            IMPORT_PROJECT_LEGACY_ID,
          ],
        );
        projectByLane.set(lane, id);
      }
    }
    if (errors.length) {
      return { exitCode: 1, report, discrepancies, parity, errors };
    }

    /* ── Blobs (content-addressed, verificación de hash al escribir) ── */
    // (tenantLane::sourceBlobKey) → blobKey destino
    const blobKeyMap = new Map<string, string>();
    // (tenantLane::sha256) → blobKey destino (para punteros delta sin blob en archivo)
    const blobShaMap = new Map<string, string>();
    for (const blob of blobs) {
      const laneKey = blob.tenantId ?? ' ';
      const params: unknown[] = [blob.sha256];
      const where = target.lane('tenant_id', blob.tenantId, params);
      const existingRows = await target.query<
        ExistingBlob & { gc_marked_at: Date | null; blob_key: string }
      >(
        `SELECT blob_key AS "blobKey", size, gc_marked_at AS "gcMarkedAt" FROM design_blobs WHERE sha256 = $1 AND ${where}`,
        params,
      );
      const existing = existingRows.length ? existingRows[0] : null;
      const plan = planBlobAction(existing, blob);
      if (plan.action === 'collision') {
        errors.push(`Blob ${blob.sha256}: ${plan.detail}`);
        continue;
      }
      if (plan.action === 'reuse') {
        blobKeyMap.set(`${laneKey}::${blob.sourceBlobKey}`, plan.targetBlobKey);
        blobShaMap.set(`${laneKey}::${blob.sha256}`, plan.targetBlobKey);
        report.blobs.sinCambios += 1;
        if (options.resume) continue; // ya importado: ni re-lee ni re-verifica
        try {
          await readArchiveBlob(options.archiveDir, blob.sha256); // verifica bytes del archivo
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
        if (plan.resurrect && !options.dryRun) {
          await target.query(
            `UPDATE design_blobs SET gc_marked_at = NULL WHERE blob_key = $1`,
            [plan.targetBlobKey],
          );
        }
        continue;
      }
      // insert: los bytes se leen y VERIFICAN contra el sha256 del nombre.
      let data: Buffer;
      try {
        data = await readArchiveBlob(options.archiveDir, blob.sha256);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
        continue;
      }
      if (data.length !== blob.size) {
        errors.push(
          `Blob ${blob.sha256}: tamaño real ${data.length} ≠ manifiesto ${blob.size}; se rechaza.`,
        );
        continue;
      }
      let targetKey = plan.targetBlobKey;
      if (!options.dryRun) {
        const insert = async (key: string) =>
          target.query(
            `INSERT INTO design_blobs (blob_key, tenant_id, sha256, size, data, created_at, gc_marked_at)
             VALUES ($1, $2, $3, $4, $5, now(), NULL)`,
            [key, blob.tenantId, blob.sha256, blob.size, data],
          );
        try {
          await insert(targetKey);
        } catch {
          // blob_key es PK GLOBAL: otra fila (otro tenant/contenido) puede
          // poseer la clave del origen — se re-inserta bajo clave nueva y el
          // puntero se re-escribe vía blobKeyMap.
          targetKey = randomUUID();
          await insert(targetKey);
        }
      }
      blobKeyMap.set(`${laneKey}::${blob.sourceBlobKey}`, targetKey);
      blobShaMap.set(`${laneKey}::${blob.sha256}`, targetKey);
      report.blobs.insertados += 1;
    }
    if (errors.length) {
      return {
        exitCode: 1,
        report,
        discrepancies,
        parity,
        errors: [
          ...errors,
          options.dryRun
            ? 'Dry-run: se detectaron blobs corruptos/colisiones; el import real se rechazaría.'
            : 'Import detenido por blobs corruptos/colisiones antes de escribir documentos.',
        ],
      };
    }

    /** Resuelve blobKey destino para un puntero (archivo o destino previo). */
    const resolveBlobKey = async (
      tenantId: string | null,
      sourceKey: string,
      sha256: string,
    ): Promise<string | null> => {
      const laneKey = tenantId ?? ' ';
      const mapped =
        blobKeyMap.get(`${laneKey}::${sourceKey}`) ??
        blobShaMap.get(`${laneKey}::${sha256}`);
      if (mapped) return mapped;
      // Delta: el blob no vino en este archivo — debe existir ya en destino.
      const params: unknown[] = [sha256];
      const where = target.lane('tenant_id', tenantId, params);
      const rows = await target.query<{ blob_key: string }>(
        `SELECT blob_key FROM design_blobs WHERE sha256 = $1 AND ${where}`,
        params,
      );
      if (!rows.length) return null;
      blobShaMap.set(`${laneKey}::${sha256}`, rows[0].blob_key);
      return rows[0].blob_key;
    };

    /* ── Documentos (upsert por tenant + legacy_source_id) ───────────── */
    // (lane::legacySourceId) → id destino, para versiones y publicaciones.
    const documentIdMap = new Map<string, string>();
    for (const record of documents) {
      const laneKey = record.tenantId ?? ' ';
      const resolver = new Map<string, string | null>();
      const pointerKey = isPointer(record.cadDocument)
        ? String(record.cadDocument._storage.blobKey)
        : null;
      if (pointerKey) {
        const sha = String(
          (record.cadDocument._storage as Record<string, unknown>).sha256,
        ).toLowerCase();
        resolver.set(
          pointerKey,
          await resolveBlobKey(record.tenantId, pointerKey, sha),
        );
      }
      const rewritten = rewritePointerBlobKey(
        record.cadDocument,
        (key) => resolver.get(key) ?? null,
      );
      if (rewritten.missing) {
        errors.push(
          `Documento ${record.legacySourceId}: su puntero referencia un blob inexistente en archivo y destino (sha ${record.contentSha256}); registro omitido.`,
        );
        report.documents.omitidos += 1;
        continue;
      }

      const params: unknown[] = [record.legacySourceId];
      const where = target.lane('tenant_id', record.tenantId, params);
      const rows = await target.query<{
        id: string;
        cad_document_version: number;
        cad_document: Record<string, unknown> | null;
      }>(
        `SELECT id, cad_document_version, cad_document
           FROM cad_documents WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      const existing: ExistingDocument | null = rows.length
        ? {
            id: rows[0].id,
            cadDocumentVersion: Number(rows[0].cad_document_version) || 0,
            contentSha256: rows[0].cad_document
              ? storedContentSha256(rows[0].cad_document)
              : null,
          }
        : null;
      const plan = planDocumentAction(existing, record);

      if (plan.action === 'skip') {
        documentIdMap.set(
          `${laneKey}::${record.legacySourceId}`,
          plan.targetId,
        );
        if (plan.reason === 'sin_cambios') report.documents.sinCambios += 1;
        else {
          report.documents.omitidos += 1;
          discrepancies.push(
            `Documento ${record.legacySourceId}: el destino está en versión CAS más nueva (${existing?.cadDocumentVersion}) que el archivo (${record.cadDocumentVersion}); no se retrocede.`,
          );
        }
        continue;
      }

      if (plan.action === 'insert') {
        const id = randomUUID();
        documentIdMap.set(`${laneKey}::${record.legacySourceId}`, id);
        report.documents.insertados += 1;
        if (options.dryRun) continue;
        await target.query(
          `INSERT INTO cad_documents (
             id, tenant_id, organization_id, plant_id, created_at, updated_at,
             created_by, project_id, name, model, revision, cad_document,
             cad_document_version, layers, legacy_source_id, legacy_metadata,
             dxf_data, dxf_name, dxf_offset_x, dxf_offset_y, dxf_scale,
             dxf_rotation, dxf_visible, dxf_opacity
           ) VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8,$9,$10,$11::jsonb,$12,
                     $13::jsonb,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            id,
            record.tenantId,
            record.organizationId,
            record.plantId,
            record.createdAt,
            record.createdBy,
            projectByLane.get(record.tenantId) ?? null,
            record.name,
            record.model,
            record.revision,
            jsonParam(rewritten.stored),
            record.cadDocumentVersion,
            jsonParam(record.layers),
            record.legacySourceId,
            jsonParam(record.legacyMetadata),
            record.dxf.data,
            record.dxf.name,
            record.dxf.offsetX,
            record.dxf.offsetY,
            record.dxf.scale,
            record.dxf.rotation,
            record.dxf.visible,
            record.dxf.opacity,
          ],
        );
        continue;
      }

      documentIdMap.set(`${laneKey}::${record.legacySourceId}`, plan.targetId);
      report.documents.actualizados += 1;
      if (options.dryRun) continue;
      await target.query(
        `UPDATE cad_documents SET
           name = $2, model = $3, revision = $4, cad_document = $5::jsonb,
           cad_document_version = $6, layers = $7::jsonb,
           legacy_metadata = $8::jsonb, dxf_data = $9, dxf_name = $10,
           dxf_offset_x = $11, dxf_offset_y = $12, dxf_scale = $13,
           dxf_rotation = $14, dxf_visible = $15, dxf_opacity = $16,
           updated_at = now()
         WHERE id = $1`,
        [
          plan.targetId,
          record.name,
          record.model,
          record.revision,
          jsonParam(rewritten.stored),
          record.cadDocumentVersion,
          jsonParam(record.layers),
          jsonParam(record.legacyMetadata),
          record.dxf.data,
          record.dxf.name,
          record.dxf.offsetX,
          record.dxf.offsetY,
          record.dxf.scale,
          record.dxf.rotation,
          record.dxf.visible,
          record.dxf.opacity,
        ],
      );
    }

    /* ── Versiones CAS (inmutables, únicas por documento+versión) ────── */
    for (const record of versions) {
      const laneKey = record.tenantId ?? ' ';
      const documentId = documentIdMap.get(
        `${laneKey}::${record.documentLegacySourceId}`,
      );
      if (!documentId || documentId === '(se crearía)') {
        if (options.dryRun && documentId) {
          report.versions.insertados += 1;
          continue;
        }
        report.versions.omitidos += 1;
        if (!documentId) {
          discrepancies.push(
            `Versión ${record.legacySourceId}: su documento ${record.documentLegacySourceId} no está en el destino ni en el alcance.`,
          );
        }
        continue;
      }
      const existing = await target.query<{
        id: string;
        sha256: string | null;
      }>(
        `SELECT id, sha256 FROM cad_document_versions
          WHERE document_id = $1 AND version = $2`,
        [documentId, record.version],
      );
      if (existing.length) {
        report.versions.sinCambios += 1;
        if (existing[0].sha256 && existing[0].sha256 !== record.sha256) {
          discrepancies.push(
            `Versión ${record.version} del documento ${record.documentLegacySourceId}: el destino tiene contenido distinto (sha ${existing[0].sha256} ≠ ${record.sha256}); el historial es inmutable y no se pisa.`,
          );
        }
        continue;
      }
      const pointerKey = isPointer(record.cadDocument)
        ? String(record.cadDocument._storage.blobKey)
        : null;
      let stored = record.cadDocument;
      if (pointerKey) {
        const sha = String(
          (record.cadDocument._storage as Record<string, unknown>).sha256,
        ).toLowerCase();
        const resolved = await resolveBlobKey(record.tenantId, pointerKey, sha);
        if (!resolved) {
          report.versions.omitidos += 1;
          errors.push(
            `Versión ${record.legacySourceId}: puntero a blob inexistente (sha ${sha}); omitida.`,
          );
          continue;
        }
        const rewritten = rewritePointerBlobKey(
          record.cadDocument,
          () => resolved,
        );
        stored = rewritten.stored;
      }
      report.versions.insertados += 1;
      if (options.dryRun) continue;
      await target.query(
        `INSERT INTO cad_document_versions (
           id, tenant_id, organization_id, plant_id, created_at, updated_at,
           created_by, document_id, version, cad_document, sha256, label,
           legacy_source_id
         ) VALUES ($1,$2,NULL,NULL,$3,now(),$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [
          randomUUID(),
          record.tenantId,
          record.createdAt,
          record.createdBy,
          documentId,
          record.version,
          jsonParam(stored),
          record.sha256,
          record.label,
          record.legacySourceId,
        ],
      );
    }

    /* ── Publicaciones (recibos inmutables) ──────────────────────────── */
    for (const record of publications) {
      const laneKey = record.tenantId ?? ' ';
      const documentId = documentIdMap.get(
        `${laneKey}::${record.documentLegacySourceId}`,
      );
      if (!documentId || documentId === '(se crearía)') {
        if (options.dryRun && documentId) {
          report.publications.insertados += 1;
          continue;
        }
        report.publications.omitidos += 1;
        if (!documentId) {
          discrepancies.push(
            `Publicación ${record.legacySourceId}: su documento ${record.documentLegacySourceId} no está en el destino ni en el alcance.`,
          );
        }
        continue;
      }
      const params: unknown[] = [record.legacySourceId, documentId];
      const where = target.lane('tenant_id', record.tenantId, params);
      const existing = await target.query<{ id: string }>(
        `SELECT id FROM cad_publications
          WHERE legacy_source_id = $1 AND document_id = $2 AND ${where}`,
        params,
      );
      if (existing.length) {
        report.publications.sinCambios += 1;
        continue;
      }
      report.publications.insertados += 1;
      if (options.dryRun) continue;
      await target.query(
        `INSERT INTO cad_publications (
           id, tenant_id, organization_id, plant_id, created_at, updated_at,
           created_by, document_id, file_name, sha256, bytes, paper_space_ids,
           published_by, published_at, legacy_source_id
         ) VALUES ($1,$2,NULL,NULL,now(),now(),$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [
          randomUUID(),
          record.tenantId,
          record.publishedBy,
          documentId,
          record.fileName,
          record.sha256,
          record.bytes,
          jsonParam(record.paperSpaceIds),
          record.publishedBy,
          record.publishedAt,
          record.legacySourceId,
        ],
      );
    }

    /* ── Bloques (upsert por tenant + legacy_source_id) ──────────────── */
    for (const record of blocks) {
      const params: unknown[] = [record.legacySourceId];
      const where = target.lane('tenant_id', record.tenantId, params);
      const rows = await target.query<{
        id: string;
        version: number;
        name: string;
        assets: unknown[];
        definition: Record<string, unknown> | null;
      }>(
        `SELECT id, version, name, assets, definition
           FROM sf_cad_blocks WHERE legacy_source_id = $1 AND ${where}`,
        params,
      );
      const existing: ExistingBlock | null = rows.length
        ? {
            id: rows[0].id,
            version: Number(rows[0].version) || 1,
            contentSha256: blockContentSha256({
              name: rows[0].name,
              assets: rows[0].assets ?? [],
              definition: rows[0].definition ?? null,
              version: Number(rows[0].version) || 1,
            }),
          }
        : null;
      const plan = planBlockAction(existing, {
        version: record.version,
        contentSha256: blockContentSha256(record),
      });
      if (plan.action === 'skip') {
        if (plan.reason === 'sin_cambios') report.blocks.sinCambios += 1;
        else {
          report.blocks.omitidos += 1;
          discrepancies.push(
            `Bloque ${record.legacySourceId}: versión del destino más nueva; no se retrocede.`,
          );
        }
        continue;
      }
      if (plan.action === 'insert') {
        report.blocks.insertados += 1;
        if (options.dryRun) continue;
        await target.query(
          `INSERT INTO sf_cad_blocks (
             id, tenant_id, organization_id, plant_id, created_at, updated_at,
             created_by, name, assets, definition, version, legacy_source_id
           ) VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
          [
            randomUUID(),
            record.tenantId,
            record.organizationId,
            record.plantId,
            record.createdAt,
            record.createdBy,
            record.name,
            jsonParam(record.assets),
            jsonParam(record.definition),
            record.version,
            record.legacySourceId,
          ],
        );
        continue;
      }
      report.blocks.actualizados += 1;
      if (options.dryRun) continue;
      await target.query(
        `UPDATE sf_cad_blocks SET
           name = $2, assets = $3::jsonb, definition = $4::jsonb,
           version = $5, updated_at = now()
         WHERE id = $1`,
        [
          plan.targetId,
          record.name,
          jsonParam(record.assets),
          jsonParam(record.definition),
          record.version,
        ],
      );
    }

    /* ── Paridad final archivo(en alcance) vs destino ────────────────── */
    if (!options.dryRun) {
      let docsInTarget = 0;
      for (const record of documents) {
        const params: unknown[] = [record.legacySourceId];
        const where = target.lane('tenant_id', record.tenantId, params);
        const rows = await target.query<{ cad_document_version: number }>(
          `SELECT cad_document_version FROM cad_documents
            WHERE legacy_source_id = $1 AND ${where}`,
          params,
        );
        if (
          rows.length &&
          Number(rows[0].cad_document_version) >= record.cadDocumentVersion
        ) {
          docsInTarget += 1;
        } else {
          discrepancies.push(
            `Paridad: documento ${record.legacySourceId} ausente o retrasado en destino.`,
          );
        }
      }
      let versionsInTarget = 0;
      for (const record of versions) {
        const documentId = documentIdMap.get(
          `${record.tenantId ?? ' '}::${record.documentLegacySourceId}`,
        );
        if (!documentId) continue;
        const rows = await target.query(
          `SELECT 1 FROM cad_document_versions WHERE document_id = $1 AND version = $2`,
          [documentId, record.version],
        );
        if (rows.length) versionsInTarget += 1;
        else
          discrepancies.push(
            `Paridad: versión ${record.version} del documento ${record.documentLegacySourceId} ausente en destino.`,
          );
      }
      let publicationsInTarget = 0;
      for (const record of publications) {
        const params: unknown[] = [record.legacySourceId];
        const where = target.lane('tenant_id', record.tenantId, params);
        const rows = await target.query(
          `SELECT 1 FROM cad_publications WHERE legacy_source_id = $1 AND ${where}`,
          params,
        );
        if (rows.length) publicationsInTarget += 1;
        else
          discrepancies.push(
            `Paridad: publicación ${record.legacySourceId} ausente en destino.`,
          );
      }
      let blocksInTarget = 0;
      for (const record of blocks) {
        const params: unknown[] = [record.legacySourceId];
        const where = target.lane('tenant_id', record.tenantId, params);
        const rows = await target.query<{ version: number }>(
          `SELECT version FROM sf_cad_blocks WHERE legacy_source_id = $1 AND ${where}`,
          params,
        );
        if (rows.length && Number(rows[0].version) >= record.version) {
          blocksInTarget += 1;
        } else {
          discrepancies.push(
            `Paridad: bloque ${record.legacySourceId} ausente o retrasado en destino.`,
          );
        }
      }
      let blobsInTarget = 0;
      for (const record of blobs) {
        const params: unknown[] = [record.sha256, record.size];
        const where = target.lane('tenant_id', record.tenantId, params);
        const rows = await target.query(
          `SELECT 1 FROM design_blobs WHERE sha256 = $1 AND size = $2 AND ${where}`,
          params,
        );
        if (rows.length) blobsInTarget += 1;
        else
          discrepancies.push(
            `Paridad: blob ${record.sha256} ausente en destino.`,
          );
      }
      parity.push(
        {
          entity: 'documents',
          archivo: documents.length,
          destino: docsInTarget,
        },
        {
          entity: 'versions',
          archivo: versions.length,
          destino: versionsInTarget,
        },
        {
          entity: 'publications',
          archivo: publications.length,
          destino: publicationsInTarget,
        },
        { entity: 'blocks', archivo: blocks.length, destino: blocksInTarget },
        { entity: 'blobs', archivo: blobs.length, destino: blobsInTarget },
      );
    }

    const exitCode = errors.length || discrepancies.length ? 1 : 0;
    return { exitCode, report, discrepancies, parity, errors };
  } finally {
    await target.close();
  }
}

function isPointer(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { _storage: Record<string, unknown> } {
  const storage = value?._storage;
  return (
    !!storage &&
    typeof storage === 'object' &&
    (storage as Record<string, unknown>).kind === 'document_blob'
  );
}
