import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createGunzip, gzip } from 'node:zlib';
import { CAD_DOCUMENT_LIMITS } from '@valle-design/contracts';
import {
  CAD_DOCUMENT_MAX_ARCHIVE_BYTES,
  PersistedCadDocument,
} from './cad-document-validation';

const gzipAsync = promisify(gzip);

// Números del contrato, no redeclarados: ver CAD_DOCUMENT_LIMITS.
export const CAD_DOCUMENT_BLOB_THRESHOLD_BYTES =
  CAD_DOCUMENT_LIMITS.blobThresholdBytes;
export const CAD_DOCUMENT_MAX_COMPRESSED_BYTES =
  CAD_DOCUMENT_LIMITS.maxCompressedUploadBytes;

export interface StoredCadDocumentBlobPointer extends Record<string, unknown> {
  _storage: {
    kind: 'document_blob';
    version: 1;
    blobKey: string;
    sha256: string;
    encoding: 'gzip';
    compressedBytes: number;
    uncompressedBytes: number;
  };
  summary: {
    schema: number;
    contentVersion: number;
    entityCount: number;
  };
}

export interface EncodedCadDocumentArchive {
  compressed: Buffer;
  compressedSha256: string;
  uncompressedBytes: number;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Extrae la blobKey de un valor `cadDocument` almacenado, o null si es un
 * documento inline (sin puntero). DELIBERADAMENTE laxa — solo exige
 * `kind === 'document_blob'` y una blobKey string, sin validar el manifiesto
 * completo como `isStoredCadDocumentBlobPointer`: la usa el GC de blobs para
 * marcar referencias vivas, y ante un puntero parcial/legacy es preferible
 * proteger el blob que barrerlo.
 */
export function cadBlobKeyFromStoredDocument(value: unknown): string | null {
  const storage = objectValue(objectValue(value)?._storage);
  return storage?.kind === 'document_blob' &&
    typeof storage.blobKey === 'string'
    ? storage.blobKey
    : null;
}

export function isStoredCadDocumentBlobPointer(
  value: unknown,
): value is StoredCadDocumentBlobPointer {
  const root = objectValue(value);
  const storage = objectValue(root?._storage);
  return (
    storage?.kind === 'document_blob' &&
    storage.version === 1 &&
    storage.encoding === 'gzip' &&
    typeof storage.blobKey === 'string' &&
    storage.blobKey.length > 0 &&
    typeof storage.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(storage.sha256) &&
    Number.isSafeInteger(storage.compressedBytes) &&
    Number(storage.compressedBytes) > 0 &&
    Number(storage.compressedBytes) <= CAD_DOCUMENT_MAX_COMPRESSED_BYTES &&
    Number.isSafeInteger(storage.uncompressedBytes) &&
    Number(storage.uncompressedBytes) > 0 &&
    Number(storage.uncompressedBytes) <= CAD_DOCUMENT_MAX_ARCHIVE_BYTES
  );
}

export async function encodeCadDocumentArchive(
  document: PersistedCadDocument,
): Promise<EncodedCadDocumentArchive> {
  const source = Buffer.from(JSON.stringify(document), 'utf8');
  if (source.length > CAD_DOCUMENT_MAX_ARCHIVE_BYTES) {
    throw new BadRequestException(
      `CadDocument excede ${CAD_DOCUMENT_MAX_ARCHIVE_BYTES} bytes.`,
    );
  }
  const compressed = await gzipAsync(source, { level: 6 });
  if (compressed.length > CAD_DOCUMENT_MAX_COMPRESSED_BYTES) {
    throw new BadRequestException(
      `El archivo CAD comprimido excede ${CAD_DOCUMENT_MAX_COMPRESSED_BYTES} bytes.`,
    );
  }
  return {
    compressed,
    compressedSha256: sha256(compressed),
    uncompressedBytes: source.length,
  };
}

async function gunzipBounded(data: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = createGunzip();
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > CAD_DOCUMENT_MAX_ARCHIVE_BYTES) {
        stream.destroy(
          new Error('CadDocument archive expansion limit exceeded'),
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.once('error', fail);
    stream.once('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, bytes));
    });
    stream.end(data);
  });
}

export async function decodeCadDocumentArchive(
  compressed: Buffer,
  expected?: StoredCadDocumentBlobPointer['_storage'],
): Promise<unknown> {
  if (
    !compressed.length ||
    compressed.length > CAD_DOCUMENT_MAX_COMPRESSED_BYTES
  ) {
    throw new BadRequestException(
      'El archivo CAD comprimido tiene un tamaño inválido.',
    );
  }
  if (expected) {
    if (
      compressed.length !== expected.compressedBytes ||
      sha256(compressed) !== expected.sha256
    ) {
      throw new ServiceUnavailableException(
        'La integridad del archivo CAD almacenado no pudo verificarse.',
      );
    }
  }
  let source: Buffer;
  try {
    source = await gunzipBounded(compressed);
  } catch (error) {
    if (error instanceof ServiceUnavailableException) throw error;
    throw new BadRequestException(
      'El archivo CAD gzip es inválido o excede el límite.',
    );
  }
  if (expected && source.length !== expected.uncompressedBytes) {
    throw new ServiceUnavailableException(
      'El tamaño del archivo CAD almacenado no coincide con su manifiesto.',
    );
  }
  try {
    return JSON.parse(source.toString('utf8')) as unknown;
  } catch {
    throw new BadRequestException('El archivo CAD no contiene JSON válido.');
  }
}

export function buildCadDocumentBlobPointer(
  document: PersistedCadDocument,
  archive: EncodedCadDocumentArchive,
  blobKey: string,
): StoredCadDocumentBlobPointer {
  const meta = objectValue(document.meta);
  return {
    _storage: {
      kind: 'document_blob',
      version: 1,
      blobKey,
      sha256: archive.compressedSha256,
      encoding: 'gzip',
      compressedBytes: archive.compressed.length,
      uncompressedBytes: archive.uncompressedBytes,
    },
    summary: {
      schema: Number(meta?.schema) || 1,
      contentVersion: Number(meta?.version) || 0,
      entityCount: Array.isArray(document.entities)
        ? document.entities.length
        : 0,
    },
  };
}
