import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArchiveWriter,
  readManifest,
  type ArchiveManifest,
  type BlobExportRecord,
  type BlockExportRecord,
  type DocumentExportRecord,
  type EntityCounts,
  type PublicationExportRecord,
  type VersionExportRecord,
  emptyCounts,
  tenantLaneKey,
} from '../archive';

/**
 * HERRAMIENTA DE PRUEBA (validación 4.c): construye, a partir de un archivo de
 * exportación completo, un archivo VÁLIDO "a la mitad" — los primeros
 * ⌈n/2⌉ documentos con sus versiones/publicaciones/blobs y la mitad de los
 * bloques, con manifiesto recalculado. Simula el estado que dejaría un import
 * interrumpido: la primera pasada importa este medio archivo; la segunda
 * (archivo completo + --resume) debe completar sin duplicar.
 *
 * NO forma parte de la CLI operativa — solo del arnés de validación.
 */
function readLines<T>(dir: string, file: string): T[] {
  const body = readFileSync(join(dir, file), 'utf8');
  return body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export function makeTruncatedArchive(fullDir: string, outDir: string): void {
  const manifest = readManifest(fullDir);
  const documents = readLines<DocumentExportRecord>(
    fullDir,
    'documents.ndjson',
  );
  const versions = readLines<VersionExportRecord>(fullDir, 'versions.ndjson');
  const publications = readLines<PublicationExportRecord>(
    fullDir,
    'publications.ndjson',
  );
  const blocks = readLines<BlockExportRecord>(fullDir, 'blocks.ndjson');
  const blobs = readLines<BlobExportRecord>(fullDir, 'blobs.ndjson');

  const keepDocs = documents.slice(0, Math.ceil(documents.length / 2));
  const keepDocKeys = new Set(
    keepDocs.map((d) => `${d.tenantId ?? ' '}::${d.legacySourceId}`),
  );
  const keepVersions = versions.filter((v) =>
    keepDocKeys.has(`${v.tenantId ?? ' '}::${v.documentLegacySourceId}`),
  );
  const keepPublications = publications.filter((p) =>
    keepDocKeys.has(`${p.tenantId ?? ' '}::${p.documentLegacySourceId}`),
  );
  const keepBlocks = blocks.slice(0, Math.ceil(blocks.length / 2));
  const referencedShas = new Set<string>();
  for (const payload of [
    ...keepDocs.map((d) => d.cadDocument),
    ...keepVersions.map((v) => v.cadDocument),
  ]) {
    const storage = (payload as { _storage?: { sha256?: string } })._storage;
    if (storage?.sha256) referencedShas.add(storage.sha256.toLowerCase());
  }
  const keepBlobs = blobs.filter((b) => referencedShas.has(b.sha256));

  rmSync(outDir, { recursive: true, force: true });
  const writer = new ArchiveWriter(outDir);
  const counts: EntityCounts = emptyCounts();
  const countsByTenant: Record<string, EntityCounts> = {};
  const lane = (tenantId: string | null): EntityCounts =>
    (countsByTenant[tenantLaneKey(tenantId)] ??= emptyCounts());
  for (const record of keepDocs) {
    writer.append('documents.ndjson', record);
    counts.documents += 1;
    lane(record.tenantId).documents += 1;
  }
  for (const record of keepVersions) {
    writer.append('versions.ndjson', record);
    counts.versions += 1;
    lane(record.tenantId).versions += 1;
  }
  for (const record of keepPublications) {
    writer.append('publications.ndjson', record);
    counts.publications += 1;
    lane(record.tenantId).publications += 1;
  }
  for (const record of keepBlocks) {
    writer.append('blocks.ndjson', record);
    counts.blocks += 1;
    lane(record.tenantId).blocks += 1;
  }
  for (const record of keepBlobs) {
    writer.append('blobs.ndjson', record);
    counts.blobs += 1;
    lane(record.tenantId).blobs += 1;
    writer.writeBlob(
      record.sha256,
      readFileSync(join(fullDir, 'blobs', record.sha256)),
    );
  }

  const truncated: Omit<ArchiveManifest, 'files' | 'archiveFormat' | 'tool'> = {
    createdAt: new Date().toISOString(),
    source: manifest.source,
    delta: manifest.delta,
    counts,
    countsByTenant,
    documents: manifest.documents.filter((d) =>
      keepDocKeys.has(`${d.tenantId ?? ' '}::${d.legacySourceId}`),
    ),
    blocks: manifest.blocks.filter((b) =>
      keepBlocks.some(
        (k) =>
          k.legacySourceId === b.legacySourceId && k.tenantId === b.tenantId,
      ),
    ),
    blobs: keepBlobs.map((b) => ({
      tenantId: b.tenantId,
      sha256: b.sha256,
      size: b.size,
    })),
  };
  writer.finalize(truncated);
  console.log(
    `Archivo truncado en ${outDir}: documentos=${counts.documents}/${documents.length} versiones=${counts.versions}/${versions.length} publicaciones=${counts.publications}/${publications.length} bloques=${counts.blocks}/${blocks.length} blobs=${counts.blobs}/${blobs.length}`,
  );
}

/* istanbul ignore next — punto de entrada real */
if (require.main === module) {
  const [fullDir, outDir] = process.argv.slice(2);
  if (!fullDir || !outDir) {
    console.error('Uso: make-truncated-archive <archivo-completo> <salida>');
    process.exit(2);
  }
  makeTruncatedArchive(fullDir, outDir);
}
