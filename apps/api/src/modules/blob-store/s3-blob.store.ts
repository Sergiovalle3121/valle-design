/**
 * Adaptador S3/MinIO del almacenamiento de blobs CAD.
 *
 * ## Por qué existe
 *
 * Hoy los bytes del documento canónico viven EN la base (`design_blobs`,
 * columna `bytea`). Funciona y está probado, pero tiene un techo que un cliente
 * grande alcanza: cada plano de 20 MB engorda el respaldo de PostgreSQL, el
 * `pg_dump` nocturno y el tiempo de restauración, y el pool de conexiones se
 * ocupa moviendo binarios en vez de atender consultas. Un despacho que sube el
 * histórico de diez años pregunta —con razón— dónde viven de verdad esos bytes.
 * Este adaptador responde: en un bucket S3 o MinIO que el cliente controla.
 *
 * ## Lo que NO se ha hecho, dicho aquí y no en una nota al pie
 *
 * **No hay credenciales de S3 en este entorno, ni Docker para levantar un
 * MinIO.** Este adaptador NO se ha ejecutado contra un servidor real: sus
 * pruebas verifican la firma SigV4 contra vectores conocidos y el protocolo
 * contra un cliente HTTP inyectado. Eso demuestra que las peticiones se
 * construyen y firman bien; no demuestra que un MinIO concreto las acepte. Es
 * la misma frontera que el repositorio ya declaró con la pasarela de pagos, y
 * se declara igual: por configuración, sin fingir.
 *
 * Por eso el modo POR DEFECTO sigue siendo la base de datos, y quien pida el
 * almacenamiento de objetos sin haberlo configurado recibe
 * {@link UnavailableS3BlobStore}: un adaptador que dice la verdad —«no estoy
 * configurado, faltan estas variables»— en vez de un stub que finge escribir.
 *
 * ## Direccionamiento por contenido y aislamiento por tenant
 *
 * La clave del objeto es `<prefijo><tenant>/<blobKey>`. El tenant va en la
 * clave y no sólo en una comprobación de código porque es la diferencia entre
 * un fallo de aislamiento y un objeto que sencillamente no existe: sin el
 * tenant en la ruta, dos organizaciones con el mismo plano compartirían objeto
 * y una podría deducir que la otra tiene ese archivo. La deduplicación por
 * contenido se conserva DENTRO de cada tenant, que es donde tiene valor.
 *
 * `put` devuelve como `blobKey` el propio sha256, así que subir dos veces el
 * mismo contenido escribe el mismo objeto: la operación es idempotente por
 * construcción y no hace falta un `HEAD` previo. Los blobs heredados llevan un
 * UUID por clave; `get` no distingue —resuelve la clave que le den— y por eso
 * la migración puede copiar lo viejo tal cual sin reescribir punteros.
 *
 * ## La transacción no cruza a S3
 *
 * `DatabaseBlobStore.put` participa en la transacción de quien llama: si el
 * guardado del documento falla, los bytes se van con el ROLLBACK. S3 no tiene
 * transacciones. Si la transacción del documento aborta después de un PUT
 * correcto, el objeto queda HUÉRFANO. No es una fuga silenciosa: al ser
 * direccionado por contenido, el objeto no lo referencia nadie y el barrido de
 * recolección lo retira. Se documenta en la guía de operación porque un
 * operador tiene derecho a saber por qué el bucket puede tener más objetos que
 * filas la tabla.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { EMPTY_PAYLOAD_SHA256, signAwsRequest } from './aws-signature-v4';

/** Manifiesto confirmado tras aceptar los bytes (mismo shape que el puerto CAD). */
export interface S3BlobPutResult {
  blobKey: string;
  sha256: string;
  size: number;
  /** false cuando el objeto ya existía con el mismo contenido. */
  created: boolean;
}

export interface S3BlobHead {
  blobKey: string;
  size: number;
  exists: boolean;
}

/** Modo de almacenamiento que el despliegue publica. Nunca se adivina. */
export interface BlobStoreDescriptor {
  readonly name: 'database' | 's3';
  readonly mode: 'database-bytea' | 'object-store';
  /** false ⇒ el almacenamiento de objetos NO está disponible en este despliegue. */
  readonly available: boolean;
  readonly endpoint: string | null;
  readonly bucket: string | null;
  readonly prefix: string | null;
  readonly reason: string | null;
}

export interface S3BlobStoreConfiguration {
  /** Origen del servicio: AWS S3, MinIO propio o cualquier compatible. */
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string | null;
  /** Prefijo de clave; siempre termina en `/` o está vacío. */
  readonly prefix: string;
  readonly timeoutMs: number;
  /**
   * MinIO y los despliegues locales sirven por ruta (`/bucket/clave`); AWS
   * prefiere el bucket en el host. Se declara en vez de deducirse del dominio
   * porque deducirlo falla justo en el caso raro y el error resultante
   * (`NoSuchBucket`) no señala la causa.
   */
  readonly forcePathStyle: boolean;
}

export class S3BlobStoreConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3BlobStoreConfigurationError';
  }
}

/** El servicio respondió con error; su cuerpo NUNCA se propaga al cliente. */
export class S3BlobStoreError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(
      `El almacenamiento de objetos rechazó ${operation} con HTTP ${status}.`,
    );
    this.name = 'S3BlobStoreError';
  }
}

export class S3BlobStoreUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(
      'El almacenamiento de objetos no está configurado. Faltan: ' +
        `${missing.join(', ')}. Mientras tanto los blobs viven en PostgreSQL ` +
        '(design_blobs), que es el modo por defecto y soportado.',
    );
    this.name = 'S3BlobStoreUnavailableError';
  }
}

/** Lo único que el adaptador consume de una respuesta HTTP. */
export interface S3HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  readonly headers: { get(name: string): string | null };
}

/** Cliente HTTP inyectable: la firma de `fetch`, sin acoplarse a globalThis. */
export type S3HttpClient = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: Buffer;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<S3HttpResponse>;

// `Response` cumple `S3HttpResponse` por estructura, así que la respuesta no
// necesita aserción: el tipo estrecho existe para poder sustituir el cliente
// por un doble en las pruebas sin fabricar un `Response` entero. El init sí la
// necesita porque `Buffer` no está en la unión `BodyInit` de las tipificaciones
// del DOM, aunque `fetch` de Node lo acepta.
export const globalS3HttpClient: S3HttpClient = (url, init) =>
  fetch(url, init as RequestInit);

const DEFAULT_TIMEOUT_MS = 30_000;
const REQUIRED_VARIABLES = [
  'S3_BLOB_ENDPOINT',
  'S3_BLOB_BUCKET',
  'S3_BLOB_ACCESS_KEY_ID',
  'S3_BLOB_SECRET_ACCESS_KEY',
] as const;

/** Variables presentes de la configuración de S3, sin revelar sus valores. */
function presentVariables(environment: NodeJS.ProcessEnv): string[] {
  return REQUIRED_VARIABLES.filter((name) =>
    Boolean(environment[name]?.trim()),
  );
}

/**
 * Configuración COMPLETA o nada.
 *
 * Una configuración a medias es el peor de los mundos: el despliegue arranca
 * creyendo que escribe en el bucket y falla en la primera subida de un cliente
 * real, con el plano ya en el navegador. Igual que la pasarela de pagos, o
 * está entera o el adaptador no se instancia.
 */
export function resolveS3BlobStoreConfiguration(
  environment: NodeJS.ProcessEnv,
): S3BlobStoreConfiguration | null {
  const present = presentVariables(environment);
  if (present.length === 0) return null;
  if (present.length !== REQUIRED_VARIABLES.length) {
    const missing = REQUIRED_VARIABLES.filter(
      (name) => !present.includes(name),
    );
    throw new S3BlobStoreConfigurationError(
      'Configuración de almacenamiento de objetos incompleta. Faltan: ' +
        `${missing.join(', ')}. Defínelas todas o ninguna: escribir en un ` +
        'bucket que no se puede leer después pierde el plano del cliente.',
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(environment.S3_BLOB_ENDPOINT!.trim());
  } catch {
    throw new S3BlobStoreConfigurationError(
      'S3_BLOB_ENDPOINT debe ser una URL absoluta (https://s3.region.amazonaws.com o http://minio:9000).',
    );
  }
  const loopback = ['localhost', '127.0.0.1', '::1', 'minio'].includes(
    endpoint.hostname,
  );
  if (
    endpoint.protocol !== 'https:' &&
    !(environment.NODE_ENV !== 'production' && loopback)
  ) {
    throw new S3BlobStoreConfigurationError(
      'S3_BLOB_ENDPOINT debe usar HTTPS: los planos del cliente no viajan en claro. ' +
        'HTTP sólo se admite contra un MinIO local fuera de producción.',
    );
  }

  const bucket = environment.S3_BLOB_BUCKET!.trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new S3BlobStoreConfigurationError(
      `S3_BLOB_BUCKET "${bucket}" no es un nombre de bucket válido (3-63 caracteres, minúsculas, dígitos, punto o guion).`,
    );
  }

  const rawPrefix = environment.S3_BLOB_PREFIX?.trim() ?? '';
  const prefix = rawPrefix
    ? `${rawPrefix.replace(/^\/+/, '').replace(/\/+$/, '')}/`
    : '';

  const timeoutMs = environment.S3_BLOB_TIMEOUT_MS
    ? Number(environment.S3_BLOB_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 300_000
  ) {
    throw new S3BlobStoreConfigurationError(
      'S3_BLOB_TIMEOUT_MS debe ser un entero de 1000 a 300000.',
    );
  }

  return {
    endpoint: endpoint.origin,
    region: environment.S3_BLOB_REGION?.trim() || 'us-east-1',
    bucket,
    accessKeyId: environment.S3_BLOB_ACCESS_KEY_ID!.trim(),
    secretAccessKey: environment.S3_BLOB_SECRET_ACCESS_KEY!.trim(),
    sessionToken: environment.S3_BLOB_SESSION_TOKEN?.trim() || null,
    prefix,
    timeoutMs,
    // Por defecto ruta: es lo que funciona en MinIO y en AWS a la vez. El
    // estilo de host sólo se activa cuando alguien lo pide.
    forcePathStyle: environment.S3_BLOB_FORCE_PATH_STYLE !== 'false',
  };
}

/** Modo publicado del almacenamiento, derivado SÓLO de la configuración. */
export function describeBlobStore(
  environment: NodeJS.ProcessEnv,
): BlobStoreDescriptor {
  let configuration: S3BlobStoreConfiguration | null = null;
  let reason: string | null = null;
  try {
    configuration = resolveS3BlobStoreConfiguration(environment);
    if (!configuration) {
      reason =
        'Sin configuración de S3/MinIO: los blobs viven en PostgreSQL (design_blobs, bytea).';
    }
  } catch (error) {
    reason =
      error instanceof Error
        ? error.message
        : 'Configuración de S3/MinIO inválida.';
  }
  if (!configuration) {
    return {
      name: 'database',
      mode: 'database-bytea',
      available: false,
      endpoint: null,
      bucket: null,
      prefix: null,
      reason,
    };
  }
  return {
    name: 's3',
    mode: 'object-store',
    available: true,
    endpoint: configuration.endpoint,
    bucket: configuration.bucket,
    prefix: configuration.prefix || null,
    reason: null,
  };
}

function digest(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Almacenamiento de blobs CAD sobre S3 o cualquier servicio compatible.
 *
 * Sólo se instancia con configuración completa, así que no tiene ninguna rama
 * «por si no hay credenciales»: esa rama vive en {@link UnavailableS3BlobStore}
 * y en la fábrica del módulo.
 */
@Injectable()
export class S3BlobStore {
  private readonly logger = new Logger(S3BlobStore.name);

  constructor(
    private readonly configuration: S3BlobStoreConfiguration,
    private readonly tenantCtx: TenantContextService,
    private readonly http: S3HttpClient = globalS3HttpClient,
  ) {}

  descriptor(): BlobStoreDescriptor {
    return {
      name: 's3',
      mode: 'object-store',
      available: true,
      endpoint: this.configuration.endpoint,
      bucket: this.configuration.bucket,
      prefix: this.configuration.prefix || null,
      reason: null,
    };
  }

  /** URL absoluta del objeto de ESTE tenant. El tenant nunca lo pone el cliente. */
  objectUrl(blobKey: string, tenantId: string): string {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(blobKey)) {
      throw new S3BlobStoreError(400, `una clave de objeto inválida`);
    }
    const key = `${this.configuration.prefix}${tenantId}/${blobKey}`;
    const { endpoint, bucket, forcePathStyle } = this.configuration;
    if (forcePathStyle) return `${endpoint}/${bucket}/${key}`;
    const url = new URL(endpoint);
    return `${url.protocol}//${bucket}.${url.host}/${key}`;
  }

  private async request(
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
    blobKey: string,
    options: { body?: Buffer; payloadSha256?: string } = {},
  ): Promise<S3HttpResponse> {
    const tenantId = this.tenantCtx.requireTenantId('design blob object store');
    const url = this.objectUrl(blobKey, tenantId);
    const headers = signAwsRequest({
      method,
      url,
      region: this.configuration.region,
      service: 's3',
      accessKeyId: this.configuration.accessKeyId,
      secretAccessKey: this.configuration.secretAccessKey,
      sessionToken: this.configuration.sessionToken,
      payloadSha256: options.payloadSha256 ?? EMPTY_PAYLOAD_SHA256,
      headers: options.body
        ? {
            'content-length': String(options.body.length),
            'content-type': 'application/octet-stream',
          }
        : {},
    });
    return this.http(url, {
      method,
      headers,
      body: options.body,
      signal: AbortSignal.timeout(this.configuration.timeoutMs),
      // Un redirect de un almacenamiento de objetos hacia otro host llevaría
      // credenciales firmadas para un host distinto: se rechaza en vez de
      // seguirlo.
      redirect: 'error',
    });
  }

  /**
   * Sube los bytes bajo su propio sha256.
   *
   * El `sha256` declarado por quien llama se comprueba contra los bytes ANTES
   * de salir a la red: subir algo cuyo hash no coincide convertiría el
   * direccionamiento por contenido en una mentira, y el error se descubriría
   * al leerlo, cuando ya no hay forma de saber qué se perdió.
   *
   * El puerto declara un tercer argumento de transacción; aquí NO se recibe a
   * propósito —una función con menos parámetros satisface igual la interfaz— y
   * así queda dicho en el código, y no sólo en un comentario, que S3 no
   * participa en la transacción de PostgreSQL. Ver la nota de la cabecera
   * sobre objetos huérfanos.
   */
  async put(data: Buffer, sha256: string): Promise<S3BlobPutResult> {
    const actual = digest(data);
    if (!/^[a-f0-9]{64}$/i.test(sha256) || actual !== sha256.toLowerCase()) {
      throw new S3BlobStoreError(409, 'una subida cuyo sha256 no coincide');
    }
    const existing = await this.head(actual);
    if (existing.exists && existing.size === data.length) {
      return {
        blobKey: actual,
        sha256: actual,
        size: data.length,
        created: false,
      };
    }
    const response = await this.request('PUT', actual, {
      body: data,
      payloadSha256: actual,
    });
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new S3BlobStoreError(response.status, 'la subida del blob');
    }
    return {
      blobKey: actual,
      sha256: actual,
      size: data.length,
      created: true,
    };
  }

  /**
   * Sube bytes CONSERVANDO una clave dada, sin derivarla del contenido.
   *
   * Existe SÓLO para la migración: los blobs heredados llevan un UUID por
   * clave y los punteros `_storage` de miles de documentos ya la referencian.
   * Reescribir esos punteros para renombrarlos a su hash sería una migración
   * de datos con riesgo real a cambio de estética; copiar el objeto bajo su
   * clave de siempre no rompe nada y deja el direccionamiento por contenido
   * para lo que se escriba a partir de ahora.
   */
  async putAtKey(blobKey: string, data: Buffer): Promise<S3BlobPutResult> {
    const sha256 = digest(data);
    const response = await this.request('PUT', blobKey, {
      body: data,
      payloadSha256: sha256,
    });
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new S3BlobStoreError(
        response.status,
        'la copia de un blob heredado',
      );
    }
    return { blobKey, sha256, size: data.length, created: true };
  }

  /**
   * Descarga los bytes y VERIFICA su integridad cuando la clave es un hash.
   *
   * Un blob heredado tiene por clave un UUID y no se puede verificar contra
   * ella; el caso se distingue y se registra en vez de fingir una comprobación
   * que no ocurrió.
   */
  async get(blobKey: string): Promise<Buffer> {
    const response = await this.request('GET', blobKey);
    if (response.status === 404) {
      throw new NotFoundException('El blob CAD no existe.');
    }
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new S3BlobStoreError(response.status, 'la lectura del blob');
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (/^[a-f0-9]{64}$/.test(blobKey) && digest(data) !== blobKey) {
      throw new S3BlobStoreError(
        502,
        'la lectura de un blob cuyo contenido no coincide con su hash',
      );
    }
    return data;
  }

  async head(blobKey: string): Promise<S3BlobHead> {
    const response = await this.request('HEAD', blobKey);
    if (response.status === 404) {
      return { blobKey, size: 0, exists: false };
    }
    if (!response.ok) {
      throw new S3BlobStoreError(response.status, 'la consulta del blob');
    }
    const length = Number(response.headers.get('content-length') ?? '0');
    return {
      blobKey,
      size: Number.isFinite(length) ? length : 0,
      exists: true,
    };
  }

  /**
   * Borrado del segundo barrido del recolector.
   *
   * A diferencia del adaptador de base de datos, aquí NO se exige una marca
   * previa: la marca vive en la fila de PostgreSQL, que es donde el recolector
   * lleva la contabilidad. El bucket es el destino del borrado, no su registro.
   */
  async delete(blobKey: string): Promise<void> {
    const response = await this.request('DELETE', blobKey);
    // S3 devuelve 204 tanto si el objeto existía como si no; un 404 explícito
    // de un servicio compatible se trata igual: el objetivo era que no exista.
    if (!response.ok && response.status !== 404) {
      throw new S3BlobStoreError(response.status, 'el borrado del blob');
    }
    this.logger.log(`Blob retirado del almacenamiento de objetos: ${blobKey}`);
  }
}

/**
 * Adaptador por defecto: el almacenamiento de objetos NO está configurado.
 *
 * Mismo papel que `NullPaymentProvider`. No es un stub que finge escribir —eso
 * perdería el plano de un cliente sin decirlo—: declara `available: false` y
 * cualquier llamada lanza un error tipado que NOMBRA las variables que faltan.
 * El producto sigue funcionando con los blobs en PostgreSQL, que es el modo
 * soportado hoy.
 */
@Injectable()
export class UnavailableS3BlobStore {
  constructor(private readonly missing: readonly string[]) {}

  descriptor(): BlobStoreDescriptor {
    return {
      name: 'database',
      mode: 'database-bytea',
      available: false,
      endpoint: null,
      bucket: null,
      prefix: null,
      reason: `Faltan ${this.missing.join(', ')}; los blobs viven en PostgreSQL (design_blobs).`,
    };
  }

  put(): Promise<S3BlobPutResult> {
    return Promise.reject(new S3BlobStoreUnavailableError(this.missing));
  }

  get(): Promise<Buffer> {
    return Promise.reject(new S3BlobStoreUnavailableError(this.missing));
  }

  head(): Promise<S3BlobHead> {
    return Promise.reject(new S3BlobStoreUnavailableError(this.missing));
  }

  delete(): Promise<void> {
    return Promise.reject(new S3BlobStoreUnavailableError(this.missing));
  }
}

/** Variables que faltan para poder ofrecer almacenamiento de objetos. */
export function missingS3Variables(
  environment: NodeJS.ProcessEnv,
): readonly string[] {
  const present = presentVariables(environment);
  return REQUIRED_VARIABLES.filter((name) => !present.includes(name));
}
