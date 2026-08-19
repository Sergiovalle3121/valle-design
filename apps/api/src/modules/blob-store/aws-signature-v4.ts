/**
 * Firma AWS Signature Version 4 para peticiones S3, sin SDK.
 *
 * POR QUÉ A MANO Y NO CON `@aws-sdk/client-s3`. El SDK oficial de AWS arrastra
 * decenas de paquetes transitivos por hacer cuatro llamadas HTTP (PUT, GET,
 * HEAD, DELETE) contra un protocolo estable desde 2012. Este repositorio ya
 * tomó la misma decisión con Stripe —adaptador propio sobre `fetch`, sin el
 * SDK— por la misma razón: cada dependencia nueva es superficie de suministro
 * que hay que auditar, actualizar y explicar en el SBOM. Ciento cincuenta
 * líneas de firma con `node:crypto` cuestan menos que eso.
 *
 * QUÉ CUBRE Y QUÉ NO. Cubre lo que el adaptador de blobs necesita: firma de
 * cabecera (no de URL prefirmada), payload con hash conocido, y el estilo de
 * ruta que MinIO exige. NO cubre multipart upload, ni STS, ni la firma en
 * streaming con troceado (`STREAMING-AWS4-HMAC-SHA256-PAYLOAD`): el documento
 * canónico tiene un tope de 128 MiB y cabe en memoria, así que el troceado
 * sería complejidad sin caso de uso. Si algún día hay que subir más, esto se
 * queda corto A PROPÓSITO y habrá que decidirlo entonces.
 */
import { createHash, createHmac } from 'node:crypto';

export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface SignedRequestInput {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  /** URL absoluta, ya con el bucket y la clave del objeto. */
  url: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Token de sesión de credenciales temporales, si las hay. */
  sessionToken?: string | null;
  /** sha256 EN HEXADECIMAL del cuerpo. S3 lo exige, no es opcional. */
  payloadSha256: string;
  /** Cabeceras adicionales que deben quedar firmadas. */
  headers?: Record<string, string>;
  /** Reloj inyectable: sin él la firma no se puede probar de forma determinista. */
  now?: Date;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/**
 * Codificación de la ruta según SigV4: cada segmento se codifica, pero las
 * barras NO. `encodeURIComponent` deja pasar `!'()*`, que AWS sí codifica; sin
 * ese ajuste una clave con un apóstrofo produce una firma que no coincide y el
 * error que devuelve S3 (`SignatureDoesNotMatch`) no dice por qué.
 */
export function encodeS3Path(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

function amazonDate(now: Date): { stamp: string; dateOnly: string } {
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { stamp, dateOnly: stamp.slice(0, 8) };
}

/**
 * Cabeceras firmadas listas para `fetch`.
 *
 * Devuelve TODAS las cabeceras que deben viajar, incluida `Authorization`.
 * Quien llama no puede añadir ninguna más después sin invalidar la firma: eso
 * es propiedad del protocolo, no un descuido de esta función, y por eso el
 * parámetro `headers` existe.
 */
export function signAwsRequest(
  input: SignedRequestInput,
): Record<string, string> {
  const url = new URL(input.url);
  const { stamp, dateOnly } = amazonDate(input.now ?? new Date());

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': input.payloadSha256,
    'x-amz-date': stamp,
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([name, value]) => [
        name.toLowerCase(),
        value.trim(),
      ]),
    ),
  };
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  // Los parámetros de consulta van ordenados por nombre y luego por valor; el
  // adaptador de blobs no usa ninguno hoy, pero omitir la normalización haría
  // que el primer parámetro que alguien añadiera rompiese la firma en
  // producción y no en las pruebas.
  const canonicalQuery = [...url.searchParams.entries()]
    .map(
      ([name, value]) =>
        [encodeURIComponent(name), encodeURIComponent(value)] as const,
    )
    .sort((left, right) =>
      left[0] === right[0]
        ? left[1].localeCompare(right[1])
        : left[0].localeCompare(right[0]),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join('&');

  const canonicalRequest = [
    input.method,
    encodeS3Path(url.pathname),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadSha256,
  ].join('\n');

  const scope = `${dateOnly}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    stamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${input.secretAccessKey}`, dateOnly), input.region),
      input.service,
    ),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    ...headers,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
