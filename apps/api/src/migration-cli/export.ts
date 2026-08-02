import { existsSync, readFileSync } from 'node:fs';
import {
  ArchiveWriter,
  type ArchiveManifest,
  type BlobExportRecord,
  type EntityCounts,
  emptyCounts,
  tenantLaneKey,
} from './archive';
import {
  type DeltaBase,
  type ExtractWarning,
  blockChangedSinceBase,
  deltaKey,
  extractBlock,
  extractLayout,
  extractPublications,
  layoutChangedSinceBase,
} from './extract';
import { SourceReader } from './source';
import { sha256Hex } from './stable-json';
import {
  decodeCadDocumentArchive,
  isStoredCadDocumentBlobPointer,
} from '../modules/cad-documents/cad-document-storage';

export interface ExportOptions {
  sourceUrl: string;
  outDir: string;
  tenants: string[] | null;
  dryRun: boolean;
  /** manifest.json de un export previo → export DELTA (solo lo cambiado). */
  deltaBasePath: string | null;
}

export interface ExportResult {
  exitCode: number;
  manifest: ArchiveManifest | null;
  counts: EntityCounts;
  warnings: ExtractWarning[];
  skippedNoDocument: number;
  skippedUnchanged: number;
  errors: string[];
}

function loadDeltaBase(path: string): {
  base: DeltaBase;
  baseManifestSha256: string;
} {
  const raw = readFileSync(path, 'utf8');
  const manifest = JSON.parse(raw) as ArchiveManifest;
  const base: DeltaBase = {
    documents: new Map(),
    blocks: new Map(),
    blobShas: new Set(),
  };
  for (const doc of manifest.documents ?? []) {
    base.documents.set(deltaKey(doc.tenantId, doc.legacySourceId), {
      cadDocumentVersion: doc.cadDocumentVersion,
      updatedAt: doc.updatedAt,
    });
  }
  for (const block of manifest.blocks ?? []) {
    base.blocks.set(deltaKey(block.tenantId, block.legacySourceId), {
      version: block.version,
      updatedAt: block.updatedAt,
    });
  }
  for (const blob of manifest.blobs ?? []) {
    base.blobShas.add(`${blob.tenantId ?? ' '}::${blob.sha256}`);
  }
  return { base, baseManifestSha256: sha256Hex(raw) };
}

export async function runExport(options: ExportOptions): Promise<ExportResult> {
  const errors: string[] = [];
  const warnings: ExtractWarning[] = [];
  let delta: { base: DeltaBase; baseManifestSha256: string } | null = null;
  if (options.deltaBasePath) {
    if (!existsSync(options.deltaBasePath)) {
      return {
        exitCode: 1,
        manifest: null,
        counts: emptyCounts(),
        warnings,
        skippedNoDocument: 0,
        skippedUnchanged: 0,
        errors: [`No existe el manifiesto base ${options.deltaBasePath}.`],
      };
    }
    delta = loadDeltaBase(options.deltaBasePath);
  }

  const reader = await SourceReader.connect(options.sourceUrl);
  try {
    const databaseName = await reader.databaseName();
    const layouts = await reader.readLayouts(options.tenants);
    const blocks = await reader.readBlocks(options.tenants);

    const writer = new ArchiveWriter(options.outDir);
    const counts = emptyCounts();
    const countsByTenant: Record<string, EntityCounts> = {};
    const laneCounts = (tenantId: string | null): EntityCounts =>
      (countsByTenant[tenantLaneKey(tenantId)] ??= emptyCounts());
    const manifestDocuments: ArchiveManifest['documents'] = [];
    const manifestBlocks: ArchiveManifest['blocks'] = [];
    const manifestBlobs: ArchiveManifest['blobs'] = [];
    /**
     * (tenant::sha) ya vistos — dedup de blobs compartidos entre docs.
     * `included=false` cuando el blob ya viajó en el export base (delta): el
     * archivo delta NO lo re-empaqueta y el import lo resuelve contra el
     * destino (que ya lo tiene por el import base).
     */
    const exportedBlobs = new Map<
      string,
      { record: BlobExportRecord; included: boolean }
    >();
    let skippedNoDocument = 0;
    let skippedUnchanged = 0;

    for (const layout of layouts) {
      const extraction = extractLayout(layout);
      warnings.push(...extraction.warnings);
      if (!extraction.document) {
        skippedNoDocument += 1;
        continue;
      }
      const document = extraction.document;
      if (
        !layoutChangedSinceBase(
          delta?.base ?? null,
          document.tenantId,
          document.legacySourceId,
          document.cadDocumentVersion,
          document.updatedAt,
        )
      ) {
        skippedUnchanged += 1;
        // La huella viaja igualmente para que el manifiesto delta sirva de
        // base ACUMULADA del siguiente export delta.
        manifestDocuments.push({
          tenantId: document.tenantId,
          legacySourceId: document.legacySourceId,
          cadDocumentVersion: document.cadDocumentVersion,
          updatedAt: document.updatedAt,
          contentSha256: document.contentSha256,
        });
        continue;
      }

      // ── Blobs referenciados por el canónico y las versiones exportadas ──
      let layoutBroken = false;
      for (const blobKey of extraction.referencedBlobKeys) {
        const blob = await reader.readBlobData(document.tenantId, blobKey);
        if (!blob) {
          errors.push(
            `Layout ${document.legacySourceId}: el puntero referencia el blob ${blobKey} y no existe en doc_blobs (tenant ${document.tenantId ?? 'NULL'}).`,
          );
          layoutBroken = true;
          continue;
        }
        const actualSha = sha256Hex(blob.data);
        if (actualSha !== blob.sha256.toLowerCase()) {
          errors.push(
            `Blob ${blobKey} corrupto en el ORIGEN: sha256 real ${actualSha} ≠ fila ${blob.sha256}.`,
          );
          layoutBroken = true;
          continue;
        }
        const dedupKey = `${document.tenantId ?? ' '}::${actualSha}`;
        if (!exportedBlobs.has(dedupKey)) {
          const included = !delta?.base.blobShas.has(dedupKey);
          exportedBlobs.set(dedupKey, {
            record: {
              tenantId: document.tenantId,
              sha256: actualSha,
              size: blob.size,
              sourceBlobKey: blobKey,
            },
            included,
          });
          if (!options.dryRun && included) {
            writer.writeBlob(actualSha, blob.data);
          }
        }
      }
      if (layoutBroken) continue;

      // ── Publicaciones: del documento canónico HIDRATADO ──
      let hydrated: Record<string, unknown> = document.cadDocument;
      if (isStoredCadDocumentBlobPointer(document.cadDocument)) {
        const pointer = document.cadDocument._storage;
        const blob = await reader.readBlobData(
          document.tenantId,
          pointer.blobKey,
        );
        // blob existe y verificado arriba (layoutBroken cubrió el fallo).
        hydrated = (await decodeCadDocumentArchive(
          blob!.data,
          pointer,
        )) as Record<string, unknown>;
      }
      const extracted = extractPublications(hydrated, layout);
      warnings.push(...extracted.warnings);

      writer.append('documents.ndjson', document);
      counts.documents += 1;
      laneCounts(document.tenantId).documents += 1;
      manifestDocuments.push({
        tenantId: document.tenantId,
        legacySourceId: document.legacySourceId,
        cadDocumentVersion: document.cadDocumentVersion,
        updatedAt: document.updatedAt,
        contentSha256: document.contentSha256,
      });
      for (const version of extraction.versions) {
        writer.append('versions.ndjson', version);
        counts.versions += 1;
        laneCounts(version.tenantId).versions += 1;
      }
      for (const publication of extracted.publications) {
        writer.append('publications.ndjson', publication);
        counts.publications += 1;
        laneCounts(publication.tenantId).publications += 1;
      }
    }

    for (const blockRow of blocks) {
      const block = extractBlock(blockRow);
      manifestBlocks.push({
        tenantId: block.tenantId,
        legacySourceId: block.legacySourceId,
        version: block.version,
        updatedAt: block.updatedAt,
      });
      if (
        !blockChangedSinceBase(
          delta?.base ?? null,
          block.tenantId,
          block.legacySourceId,
          block.version,
          block.updatedAt,
        )
      ) {
        skippedUnchanged += 1;
        continue;
      }
      writer.append('blocks.ndjson', block);
      counts.blocks += 1;
      laneCounts(block.tenantId).blocks += 1;
    }

    for (const { record, included } of exportedBlobs.values()) {
      if (!included) continue; // ya viajó en el export base (delta)
      writer.append('blobs.ndjson', record);
      counts.blobs += 1;
      laneCounts(record.tenantId).blobs += 1;
      manifestBlobs.push({
        tenantId: record.tenantId,
        sha256: record.sha256,
        size: record.size,
      });
    }

    if (errors.length) {
      return {
        exitCode: 1,
        manifest: null,
        counts,
        warnings,
        skippedNoDocument,
        skippedUnchanged,
        errors,
      };
    }

    let manifest: ArchiveManifest | null = null;
    if (!options.dryRun) {
      manifest = writer.finalize({
        createdAt: new Date().toISOString(),
        source: { database: databaseName, tenantScope: options.tenants },
        delta: { baseManifestSha256: delta?.baseManifestSha256 ?? null },
        counts,
        countsByTenant,
        documents: manifestDocuments,
        blocks: manifestBlocks,
        blobs: manifestBlobs,
      });
    }
    return {
      exitCode: 0,
      manifest,
      counts,
      warnings,
      skippedNoDocument,
      skippedUnchanged,
      errors,
    };
  } finally {
    await reader.close();
  }
}
