/**
 * El adaptador S3/MinIO, comprobado SIN un bucket.
 *
 * En este entorno no hay credenciales de S3 ni Docker para levantar un MinIO,
 * y esta suite no finge lo contrario: no dice que el adaptador «funciona
 * contra S3», dice qué peticiones construye y cómo las firma. Eso es
 * exactamente lo que se puede demostrar sin servidor, y es la mitad que suele
 * estar mal.
 *
 * EL ANCLA ES UN VALOR PUBLICADO POR AWS. La firma se comprueba contra el
 * ejemplo documentado «GET Object» de la Signature Version 4: su hash de
 * petición canónica (`7344ae5b…`) está publicado por AWS, así que la spec lo
 * usa como punto fijo, deriva de él la firma esperada por el procedimiento del
 * estándar y exige que el adaptador produzca la misma. Si alguien toca el
 * orden de las cabeceras, la codificación de la ruta o la cadena de claves, el
 * número deja de cuadrar.
 *
 * Lo que NO queda demostrado, y por eso está escrito: que un MinIO o un S3
 * concretos acepten estas peticiones. Eso exige credenciales y queda pendiente
 * del dueño.
 */
import { createHash, createHmac } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { EMPTY_PAYLOAD_SHA256, signAwsRequest } from './aws-signature-v4';
import {
  describeBlobStore,
  missingS3Variables,
  resolveS3BlobStoreConfiguration,
  S3BlobStore,
  S3BlobStoreConfigurationError,
  S3BlobStoreError,
  S3BlobStoreUnavailableError,
  UnavailableS3BlobStore,
  type S3BlobStoreConfiguration,
  type S3HttpClient,
  type S3HttpResponse,
} from './s3-blob.store';
import {
  migrateBlobsToObjectStore,
  BlobMigrationIntegrityError,
  type MigratableBlobRow,
} from './blob-store-migration';
import {
  DesignBlobStoreAdapter,
  selectCadBlobStore,
} from '../cad-documents/design-blob-store.adapter';

/** Hash de la petición canónica del ejemplo «GET Object» publicado por AWS. */
const AWS_EXAMPLE_CANONICAL_HASH =
  '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972';
const AWS_EXAMPLE_SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

/** Firma esperada, derivada del hash publicado por el procedimiento estándar. */
function expectedSignatureForAwsExample(): string {
  const hmac = (key: Buffer | string, value: string) =>
    createHmac('sha256', key).update(value, 'utf8').digest();
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    '20130524T000000Z',
    '20130524/us-east-1/s3/aws4_request',
    AWS_EXAMPLE_CANONICAL_HASH,
  ].join('\n');
  const signingKey = hmac(
    hmac(
      hmac(hmac(`AWS4${AWS_EXAMPLE_SECRET}`, '20130524'), 'us-east-1'),
      's3',
    ),
    'aws4_request',
  );
  return createHmac('sha256', signingKey)
    .update(stringToSign, 'utf8')
    .digest('hex');
}

function jsonResponse(
  status: number,
  body: Buffer = Buffer.alloc(0),
  headers: Record<string, string> = {},
): S3HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () =>
      // `Buffer.buffer` se tipa como ArrayBufferLike (podría ser compartido);
      // el respaldo de un Buffer de Node nunca lo es.
      Promise.resolve(
        body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer,
      ),
    text: () => Promise.resolve(body.toString('utf8')),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

const CONFIGURATION: S3BlobStoreConfiguration = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'valle-planos',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: AWS_EXAMPLE_SECRET,
  sessionToken: null,
  prefix: 'cad/',
  timeoutMs: 30_000,
  forcePathStyle: true,
};

const TENANT = {
  tenant_id: 'org-1111',
  organization_id: 'org-1111',
  plant_id: null,
  user_email: 'integrador@despacho.mx',
  role: 'admin',
  permissions: null,
  scopes: null,
};

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Buffer;
}

function harness(responses: S3HttpResponse[]) {
  const calls: RecordedCall[] = [];
  const http: S3HttpClient = (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    const next = responses.shift();
    if (!next) throw new Error('El doble HTTP se quedó sin respuestas.');
    return Promise.resolve(next);
  };
  const tenantCtx = new TenantContextService();
  const store = new S3BlobStore(CONFIGURATION, tenantCtx, http);
  const run = <T>(fn: () => Promise<T>) => tenantCtx.run(TENANT, fn);
  return { calls, store, run };
}

describe('firma AWS Signature Version 4', () => {
  it('reproduce el ejemplo GET Object publicado por AWS', () => {
    const headers = signAwsRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: AWS_EXAMPLE_SECRET,
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      headers: { range: 'bytes=0-9' },
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(headers.authorization).toContain(
      'Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request',
    );
    expect(headers.authorization).toContain(
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date',
    );
    expect(headers.authorization).toContain(
      `Signature=${expectedSignatureForAwsExample()}`,
    );
  });

  it('cambia la firma si cambia el secreto', () => {
    const base = {
      method: 'GET' as const,
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      now: new Date('2013-05-24T00:00:00Z'),
    };
    const uno = signAwsRequest({
      ...base,
      secretAccessKey: AWS_EXAMPLE_SECRET,
    }).authorization;
    const otro = signAwsRequest({
      ...base,
      secretAccessKey: `${AWS_EXAMPLE_SECRET}x`,
    }).authorization;
    expect(uno).not.toEqual(otro);
  });

  it('incluye el token de sesión entre las cabeceras firmadas', () => {
    const headers = signAwsRequest({
      method: 'PUT',
      url: 'https://bucket.example.com/objeto',
      region: 'eu-west-1',
      service: 's3',
      accessKeyId: 'AKIA',
      secretAccessKey: 'secreto',
      sessionToken: 'token-temporal',
      payloadSha256: EMPTY_PAYLOAD_SHA256,
      now: new Date('2026-08-19T10:00:00Z'),
    });
    expect(headers['x-amz-security-token']).toBe('token-temporal');
    expect(headers.authorization).toContain('x-amz-security-token');
  });
});

describe('configuración del almacenamiento de objetos', () => {
  it('devuelve null cuando no hay ninguna variable', () => {
    expect(resolveS3BlobStoreConfiguration({})).toBeNull();
  });

  it('rechaza una configuración a medias en vez de arrancar a ciegas', () => {
    expect(() =>
      resolveS3BlobStoreConfiguration({
        S3_BLOB_ENDPOINT: 'https://s3.amazonaws.com',
        S3_BLOB_BUCKET: 'planos',
      }),
    ).toThrow(S3BlobStoreConfigurationError);
    expect(
      missingS3Variables({
        S3_BLOB_ENDPOINT: 'https://s3.amazonaws.com',
        S3_BLOB_BUCKET: 'planos',
      }),
    ).toEqual(['S3_BLOB_ACCESS_KEY_ID', 'S3_BLOB_SECRET_ACCESS_KEY']);
  });

  it('exige HTTPS salvo contra un MinIO local fuera de producción', () => {
    const base = {
      S3_BLOB_BUCKET: 'planos',
      S3_BLOB_ACCESS_KEY_ID: 'clave',
      S3_BLOB_SECRET_ACCESS_KEY: 'secreto',
    };
    expect(() =>
      resolveS3BlobStoreConfiguration({
        ...base,
        S3_BLOB_ENDPOINT: 'http://almacen.ejemplo.mx',
        NODE_ENV: 'development',
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      resolveS3BlobStoreConfiguration({
        ...base,
        S3_BLOB_ENDPOINT: 'http://localhost:9000',
        NODE_ENV: 'production',
      }),
    ).toThrow(/HTTPS/);
    expect(
      resolveS3BlobStoreConfiguration({
        ...base,
        S3_BLOB_ENDPOINT: 'http://localhost:9000',
        NODE_ENV: 'development',
      })?.endpoint,
    ).toBe('http://localhost:9000');
  });

  it('normaliza el prefijo y valida el nombre del bucket', () => {
    const configuration = resolveS3BlobStoreConfiguration({
      S3_BLOB_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      S3_BLOB_BUCKET: 'valle-planos',
      S3_BLOB_ACCESS_KEY_ID: 'clave',
      S3_BLOB_SECRET_ACCESS_KEY: 'secreto',
      S3_BLOB_PREFIX: '/cad/blobs/',
    });
    expect(configuration?.prefix).toBe('cad/blobs/');
    expect(() =>
      resolveS3BlobStoreConfiguration({
        S3_BLOB_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
        S3_BLOB_BUCKET: 'Bucket_Con_Mayúsculas',
        S3_BLOB_ACCESS_KEY_ID: 'clave',
        S3_BLOB_SECRET_ACCESS_KEY: 'secreto',
      }),
    ).toThrow(/bucket/);
  });

  it('publica el modo sin adivinarlo', () => {
    expect(describeBlobStore({})).toMatchObject({
      name: 'database',
      mode: 'database-bytea',
      available: false,
    });
    expect(
      describeBlobStore({
        S3_BLOB_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
        S3_BLOB_BUCKET: 'valle-planos',
        S3_BLOB_ACCESS_KEY_ID: 'clave',
        S3_BLOB_SECRET_ACCESS_KEY: 'secreto',
      }),
    ).toMatchObject({ name: 's3', mode: 'object-store', available: true });
  });
});

describe('adaptador no disponible (por defecto)', () => {
  const unavailable = new UnavailableS3BlobStore([
    'S3_BLOB_ENDPOINT',
    'S3_BLOB_BUCKET',
  ]);

  it('se declara no disponible en vez de fingir', () => {
    expect(unavailable.descriptor()).toMatchObject({
      name: 'database',
      available: false,
    });
    expect(unavailable.descriptor().reason).toContain('S3_BLOB_ENDPOINT');
  });

  it('lanza un error tipado que nombra lo que falta', async () => {
    await expect(unavailable.put()).rejects.toBeInstanceOf(
      S3BlobStoreUnavailableError,
    );
    await expect(unavailable.get()).rejects.toThrow(/S3_BLOB_BUCKET/);
  });
});

describe('S3BlobStore', () => {
  it('sitúa el objeto bajo el tenant y el prefijo declarados', () => {
    const { store } = harness([]);
    expect(store.objectUrl('abc123', 'org-1111')).toBe(
      'https://s3.us-east-1.amazonaws.com/valle-planos/cad/org-1111/abc123',
    );
  });

  it('usa el contenido como clave y no vuelve a subir lo que ya existe', async () => {
    const data = Buffer.from('plano de prueba');
    const sha256 = createHash('sha256').update(data).digest('hex');
    const { store, run, calls } = harness([
      jsonResponse(200, Buffer.alloc(0), {
        'content-length': String(data.length),
      }),
    ]);
    const result = await run(() => store.put(data, sha256));
    expect(result).toEqual({
      blobKey: sha256,
      sha256,
      size: data.length,
      created: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('HEAD');
    expect(calls[0].url).toContain(`/cad/org-1111/${sha256}`);
  });

  it('sube cuando el objeto no está, firmando el cuerpo real', async () => {
    const data = Buffer.from('otro plano');
    const sha256 = createHash('sha256').update(data).digest('hex');
    const { store, run, calls } = harness([
      jsonResponse(404),
      jsonResponse(200),
    ]);
    const result = await run(() => store.put(data, sha256));
    expect(result.created).toBe(true);
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].headers['x-amz-content-sha256']).toBe(sha256);
    expect(calls[1].headers['content-length']).toBe(String(data.length));
    expect(calls[1].body?.equals(data)).toBe(true);
  });

  it('rechaza una subida cuyo sha256 declarado no coincide', async () => {
    const { store, run } = harness([]);
    await expect(
      run(() => store.put(Buffer.from('a'), 'f'.repeat(64))),
    ).rejects.toBeInstanceOf(S3BlobStoreError);
  });

  it('traduce el 404 del bucket a un 404 del dominio', async () => {
    const { store, run } = harness([jsonResponse(404)]);
    await expect(run(() => store.get('a'.repeat(64)))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('detecta un objeto corrupto cuando su clave es el hash', async () => {
    const { store, run } = harness([
      jsonResponse(200, Buffer.from('contenido que no corresponde')),
    ]);
    await expect(run(() => store.get('a'.repeat(64)))).rejects.toThrow(
      /no coincide con su hash/,
    );
  });

  it('lee un blob heredado por UUID sin exigir que la clave sea su hash', async () => {
    const legacy = Buffer.from('plano heredado');
    const { store, run } = harness([jsonResponse(200, legacy)]);
    const read = await run(() =>
      store.get('4f6a1b2c-0000-4000-8000-000000000001'),
    );
    expect(read.equals(legacy)).toBe(true);
  });

  it('exige contexto de tenant: sin él no construye ninguna petición', async () => {
    const tenantCtx = new TenantContextService();
    const store = new S3BlobStore(CONFIGURATION, tenantCtx, () => {
      throw new Error('no debería llamarse');
    });
    await expect(store.get('a'.repeat(64))).rejects.toThrow();
  });
});

describe('selección del almacenamiento cableado en el puerto CAD', () => {
  const database = {
    put: () => Promise.reject(new Error('no debería usarse')),
    get: () => Promise.reject(new Error('no debería usarse')),
  };

  it('usa la base cuando el almacenamiento de objetos no está disponible', () => {
    const chosen = selectCadBlobStore(
      database,
      new UnavailableS3BlobStore(['S3_BLOB_ENDPOINT']),
    );
    expect(chosen).toBeInstanceOf(DesignBlobStoreAdapter);
  });

  it('usa el bucket en cuanto la configuración está completa', () => {
    const objects = new S3BlobStore(
      CONFIGURATION,
      new TenantContextService(),
      () => Promise.reject(new Error('sin red en la prueba')),
    );
    expect(selectCadBlobStore(database, objects)).toBe(objects);
  });
});

describe('migración de blobs a almacenamiento de objetos', () => {
  const rows: MigratableBlobRow[] = [];
  const bytes = new Map<string, Buffer>();
  for (let index = 0; index < 3; index += 1) {
    const data = Buffer.from(`plano-${index}`);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const blobKey = `blob-${index}`;
    rows.push({ blobKey, tenantId: 'org-1111', sha256, size: data.length });
    bytes.set(blobKey, data);
  }

  const source = {
    list: (afterKey: string | null, limit: number) =>
      Promise.resolve(
        rows
          .filter((row) => (afterKey ? row.blobKey > afterKey : true))
          .slice(0, limit),
      ),
    read: (blobKey: string) => Promise.resolve(bytes.get(blobKey)!),
  };

  it('copia, verifica en destino y nunca borra el origen', async () => {
    const stored = new Map<string, Buffer>();
    const report = await migrateBlobsToObjectStore({
      source,
      target: {
        head: (tenantId, blobKey) => {
          const found = stored.get(`${tenantId}/${blobKey}`);
          return Promise.resolve({
            exists: Boolean(found),
            size: found?.length ?? 0,
          });
        },
        put: (tenantId, blobKey, data) => {
          stored.set(`${tenantId}/${blobKey}`, data);
          return Promise.resolve();
        },
      },
      batchSize: 2,
    });
    expect(report.scanned).toBe(3);
    expect(report.copied).toBe(3);
    expect(stored.size).toBe(3);
    expect(bytes.size).toBe(3);
  });

  it('es idempotente: lo ya migrado se salta', async () => {
    const stored = new Map(
      rows.map((row) => [
        `${row.tenantId}/${row.blobKey}`,
        bytes.get(row.blobKey)!,
      ]),
    );
    const report = await migrateBlobsToObjectStore({
      source,
      target: {
        head: (tenantId, blobKey) => {
          const found = stored.get(`${tenantId}/${blobKey}`);
          return Promise.resolve({
            exists: Boolean(found),
            size: found?.length ?? 0,
          });
        },
        put: () => Promise.reject(new Error('no debería subir nada')),
      },
    });
    expect(report.copied).toBe(0);
    expect(report.skipped).toBe(3);
  });

  it('se detiene ante un blob corrupto en origen', async () => {
    await expect(
      migrateBlobsToObjectStore({
        source: {
          list: () =>
            Promise.resolve([
              {
                blobKey: 'blob-corrupto',
                tenantId: 'org-1111',
                sha256: 'a'.repeat(64),
                size: 5,
              },
            ]),
          read: () => Promise.resolve(Buffer.from('12345')),
        },
        target: {
          head: () => Promise.resolve({ exists: false, size: 0 }),
          put: () => Promise.reject(new Error('no debería llegar aquí')),
        },
      }),
    ).rejects.toBeInstanceOf(BlobMigrationIntegrityError);
  });

  it('en modo plan no escribe nada', async () => {
    const report = await migrateBlobsToObjectStore({
      source,
      target: {
        head: () => Promise.resolve({ exists: false, size: 0 }),
        put: () => Promise.reject(new Error('no debería subir en dry-run')),
      },
      dryRun: true,
    });
    expect(report.dryRun).toBe(true);
    expect(report.copied).toBe(0);
    expect(report.scanned).toBe(3);
  });
});
