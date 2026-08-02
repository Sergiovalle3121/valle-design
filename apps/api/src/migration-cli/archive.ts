import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { sha256Hex } from './stable-json';

/**
 * Formato del ARCHIVO DE EXPORTACIÓN (directorio versionado) de la migración
 * enterprise→design:
 *
 *   <dir>/
 *     manifest.json        — versión de formato, alcance, conteos, huellas
 *     documents.ndjson     — un DocumentExportRecord por línea
 *     versions.ndjson      — un VersionExportRecord por línea
 *     publications.ndjson  — un PublicationExportRecord por línea
 *     blocks.ndjson        — un BlockExportRecord por línea
 *     blobs.ndjson         — un BlobExportRecord por línea (metadata)
 *     blobs/<sha256>       — bytes crudos (gzip) del blob, nombre = sha256
 *
 * El manifiesto lleva el sha256 de cada NDJSON: import/rollback lo verifican
 * ANTES de tocar nada — un archivo truncado o alterado se rechaza completo.
 */
export const ARCHIVE_FORMAT_VERSION = 1;

export const NDJSON_FILES = [
  'documents.ndjson',
  'versions.ndjson',
  'publications.ndjson',
  'blocks.ndjson',
  'blobs.ndjson',
] as const;
export type NdjsonFileName = (typeof NDJSON_FILES)[number];

/** Clave de lane de tenant en tablas del manifiesto (NULL = lane sistema). */
export const SYSTEM_LANE = '__system__';
export function tenantLaneKey(tenantId: string | null): string {
  return tenantId ?? SYSTEM_LANE;
}

/* ───────────────────────────── Registros ───────────────────────────── */

export interface DocumentExportRecord {
  legacySourceId: string;
  tenantId: string | null;
  organizationId: string | null;
  plantId: string | null;
  name: string;
  model: string | null;
  revision: string | null;
  /** Documento canónico TAL CUAL vive en el origen (inline o puntero). */
  cadDocument: Record<string, unknown>;
  cadDocumentVersion: number;
  layers: Record<string, unknown>[] | null;
  dxf: {
    data: string | null;
    name: string | null;
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    visible: boolean;
    opacity: number;
  };
  legacyMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  /** sha del puntero (`_storage.sha256`) o hash estable del JSON inline. */
  contentSha256: string;
}

export interface VersionExportRecord {
  documentLegacySourceId: string;
  tenantId: string | null;
  version: number;
  /** Nombre del snapshot legacy de origen; NULL = versión canónica. */
  label: string | null;
  legacySourceId: string;
  cadDocument: Record<string, unknown>;
  sha256: string;
  createdAt: string;
  createdBy: string | null;
}

export interface PublicationExportRecord {
  documentLegacySourceId: string;
  tenantId: string | null;
  legacySourceId: string;
  fileName: string;
  sha256: string;
  bytes: number;
  paperSpaceIds: string[];
  publishedBy: string;
  publishedAt: string;
}

export interface BlockExportRecord {
  legacySourceId: string;
  tenantId: string | null;
  organizationId: string | null;
  plantId: string | null;
  name: string;
  assets: unknown[];
  definition: Record<string, unknown> | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface BlobExportRecord {
  tenantId: string | null;
  sha256: string;
  size: number;
  sourceBlobKey: string;
}

/* ───────────────────────────── Manifiesto ───────────────────────────── */

export interface DocumentFingerprint {
  tenantId: string | null;
  legacySourceId: string;
  cadDocumentVersion: number;
  updatedAt: string;
  contentSha256: string;
}

export interface BlockFingerprint {
  tenantId: string | null;
  legacySourceId: string;
  version: number;
  updatedAt: string;
}

export interface EntityCounts {
  documents: number;
  versions: number;
  publications: number;
  blocks: number;
  blobs: number;
}

export interface ArchiveManifest {
  archiveFormat: number;
  tool: string;
  createdAt: string;
  source: {
    database: string;
    /** null = exportación completa (todos los tenants). */
    tenantScope: string[] | null;
  };
  delta: {
    /** sha256 del manifest base cuando el export fue delta; null = completo. */
    baseManifestSha256: string | null;
  };
  counts: EntityCounts;
  countsByTenant: Record<string, EntityCounts>;
  files: Record<NdjsonFileName, { sha256: string; records: number }>;
  /** Huellas para el export delta posterior y el rollback exacto. */
  documents: DocumentFingerprint[];
  blocks: BlockFingerprint[];
  blobs: { tenantId: string | null; sha256: string; size: number }[];
}

export function emptyCounts(): EntityCounts {
  return { documents: 0, versions: 0, publications: 0, blocks: 0, blobs: 0 };
}

/* ─────────────────────────── Escritura ─────────────────────────── */

export class ArchiveWriter {
  private readonly lines = new Map<NdjsonFileName, string[]>();

  constructor(readonly dir: string) {
    for (const file of NDJSON_FILES) this.lines.set(file, []);
  }

  append(file: NdjsonFileName, record: unknown): void {
    this.lines.get(file)!.push(JSON.stringify(record));
  }

  writeBlob(sha256: string, data: Buffer): void {
    const blobsDir = join(this.dir, 'blobs');
    mkdirSync(blobsDir, { recursive: true });
    writeFileSync(join(blobsDir, sha256), data);
  }

  /** Persiste NDJSON + manifiesto (calcula huellas y conteos de archivo). */
  finalize(
    manifest: Omit<ArchiveManifest, 'files' | 'archiveFormat' | 'tool'>,
  ): ArchiveManifest {
    mkdirSync(this.dir, { recursive: true });
    const files = {} as ArchiveManifest['files'];
    for (const file of NDJSON_FILES) {
      const lines = this.lines.get(file)!;
      const body = lines.length ? lines.join('\n') + '\n' : '';
      writeFileSync(join(this.dir, file), body, 'utf8');
      files[file] = { sha256: sha256Hex(body), records: lines.length };
    }
    const full: ArchiveManifest = {
      archiveFormat: ARCHIVE_FORMAT_VERSION,
      tool: 'valle-design migration-cli',
      ...manifest,
      files,
    };
    writeFileSync(
      join(this.dir, 'manifest.json'),
      JSON.stringify(full, null, 2) + '\n',
      'utf8',
    );
    return full;
  }
}

/* ─────────────────────────── Lectura ─────────────────────────── */

export class ArchiveIntegrityError extends Error {}

export function readManifest(dir: string): ArchiveManifest {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path)) {
    throw new ArchiveIntegrityError(`No existe ${path}.`);
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as ArchiveManifest;
  if (manifest.archiveFormat !== ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveIntegrityError(
      `Formato de archivo no soportado: ${manifest.archiveFormat} (esperado ${ARCHIVE_FORMAT_VERSION}).`,
    );
  }
  return manifest;
}

/**
 * Verifica el sha256 y el conteo de líneas de cada NDJSON contra el
 * manifiesto. Lanza ArchiveIntegrityError ante cualquier truncado/alteración.
 */
export function verifyArchiveFiles(
  dir: string,
  manifest: ArchiveManifest,
): void {
  for (const file of NDJSON_FILES) {
    const expected = manifest.files[file];
    if (!expected) {
      throw new ArchiveIntegrityError(`El manifiesto no declara ${file}.`);
    }
    const path = join(dir, file);
    if (!existsSync(path)) {
      throw new ArchiveIntegrityError(`Falta ${file} en el archivo.`);
    }
    const body = readFileSync(path, 'utf8');
    const sha = sha256Hex(body);
    if (sha !== expected.sha256) {
      throw new ArchiveIntegrityError(
        `${file} está corrupto o truncado: sha256 ${sha} ≠ manifiesto ${expected.sha256}.`,
      );
    }
  }
}

export async function readNdjson<T>(
  dir: string,
  file: NdjsonFileName,
): Promise<T[]> {
  const path = join(dir, file);
  if (!existsSync(path)) {
    throw new ArchiveIntegrityError(`Falta ${file} en el archivo.`);
  }
  const records: T[] = [];
  const rl = createInterface({
    input: createReadStream(path, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line) as T);
  }
  return records;
}

/** Lee y VERIFICA los bytes de un blob del archivo (rechaza corruptos). */
export async function readArchiveBlob(
  dir: string,
  sha256: string,
): Promise<Buffer> {
  const path = join(dir, 'blobs', sha256);
  if (!existsSync(path)) {
    throw new ArchiveIntegrityError(`Falta el blob ${sha256} en el archivo.`);
  }
  const data = await readFile(path);
  const actual = sha256Hex(data);
  if (actual !== sha256) {
    throw new ArchiveIntegrityError(
      `Blob corrupto en el archivo: sha256 real ${actual} ≠ esperado ${sha256}.`,
    );
  }
  return data;
}
