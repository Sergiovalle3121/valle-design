import type { CadDocument } from './cad-document';

export type CadRecoveryPayloadFormat = 'gzip-json' | 'json';

export interface EncodedCadRecoveryPayload {
  format: CadRecoveryPayloadFormat;
  buffer: ArrayBuffer;
  uncompressedBytes: number;
  storedBytes: number;
  sha256: string;
  encoder: 'direct' | 'worker' | 'main-thread-fallback';
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const hash = await crypto.subtle.digest('SHA-256', source);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function encodeCadRecoveryPayload(
  document: CadDocument,
): Promise<EncodedCadRecoveryPayload> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(document));
  const sha256 = await sha256Hex(jsonBytes);
  if (typeof CompressionStream === 'undefined') {
    const buffer = jsonBytes.buffer.slice(
      jsonBytes.byteOffset,
      jsonBytes.byteOffset + jsonBytes.byteLength,
    ) as ArrayBuffer;
    return {
      format: 'json',
      buffer,
      uncompressedBytes: jsonBytes.byteLength,
      storedBytes: jsonBytes.byteLength,
      sha256,
      encoder: 'direct',
    };
  }
  const compressed = new Blob([jsonBytes])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(compressed).arrayBuffer();
  return {
    format: 'gzip-json',
    buffer,
    uncompressedBytes: jsonBytes.byteLength,
    storedBytes: buffer.byteLength,
    sha256,
    encoder: 'direct',
  };
}

export async function decodeCadRecoveryPayload(
  format: CadRecoveryPayloadFormat,
  buffer: ArrayBuffer,
): Promise<CadDocument> {
  let bytes = buffer;
  if (format === 'gzip-json') {
    if (typeof DecompressionStream === 'undefined')
      throw new Error('Este navegador no puede descomprimir la recuperación CAD.');
    bytes = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as CadDocument;
}
