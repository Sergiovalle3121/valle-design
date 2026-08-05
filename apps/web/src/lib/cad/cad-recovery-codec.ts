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

/**
 * El payload recuperado no corresponde al hash con el que se guardó.
 *
 * Tipado a propósito: `loadCadRecovery` distingue «este registro no sirve, sigo
 * con el siguiente» de un fallo del navegador, y la interfaz puede decir al
 * usuario que se descartó un borrador dañado en vez de restaurarlo en silencio.
 */
export class CadRecoveryIntegrityError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `La recuperación CAD falló la comprobación de integridad: se esperaba ${expected.slice(0, 12)}… y se obtuvo ${actual.slice(0, 12)}…`,
    );
    this.name = 'CadRecoveryIntegrityError';
  }
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

/**
 * Decodifica un checkpoint y, si se le da el hash con el que se guardó, VERIFICA
 * que los bytes son los mismos.
 *
 * El SHA-256 se calculaba y se persistía desde el principio, pero no se
 * comprobaba nunca: era un metadato decorativo. Restaurar un borrador alterado
 * o truncado —pero todavía parseable— devuelve al usuario un plano que no es el
 * suyo, justo en el momento en que más confía en la herramienta. Fallar aquí es
 * lo correcto: `loadCadRecovery` ya descarta el registro que no decodifica y
 * continúa con el siguiente checkpoint válido.
 *
 * `expectedSha256` es opcional porque los registros heredados del journal no lo
 * traen. Esos no se rechazan —sería tirar el trabajo del usuario por un
 * metadato que nunca existió—, pero tampoco se consideran verificados.
 */
export async function decodeCadRecoveryPayload(
  format: CadRecoveryPayloadFormat,
  buffer: ArrayBuffer,
  expectedSha256?: string,
): Promise<CadDocument> {
  let bytes = buffer;
  if (format === 'gzip-json') {
    if (typeof DecompressionStream === 'undefined')
      throw new Error('Este navegador no puede descomprimir la recuperación CAD.');
    bytes = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
  }
  if (expectedSha256) {
    // Se comprueba sobre los bytes DESCOMPRIMIDOS, que es lo que se hasheó al
    // guardar: así el journal puede cambiar de formato (gzip ↔ json) sin
    // invalidar checkpoints previos.
    const actual = await sha256Hex(new Uint8Array(bytes));
    if (actual !== expectedSha256)
      throw new CadRecoveryIntegrityError(expectedSha256, actual);
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as CadDocument;
}
