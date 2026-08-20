/**
 * Migración de los blobs CAD desde PostgreSQL hacia el almacenamiento de
 * objetos.
 *
 * ## Las tres reglas
 *
 * **1. Copiar, nunca mover.** Esta función NO borra nada de `design_blobs`. La
 * retirada de los bytes de la base es una decisión posterior, humana y
 * reversible mientras no se ejecute; fundir copia y borrado en un solo paso
 * convierte cualquier fallo a mitad de camino en pérdida de planos.
 *
 * **2. Verificar en destino antes de dar por bueno.** Después de subir se
 * consulta el objeto y se compara el tamaño. Un PUT que devuelve 200 y un
 * bucket que no tiene el objeto es un fallo real de servicios compatibles mal
 * configurados (políticas de bucket, cuotas), y sin la comprobación se
 * descubriría el día que alguien intente abrir el plano.
 *
 * **3. Idempotente y reanudable.** Se avanza por clave ordenada, y un blob que
 * ya está en destino con el mismo tamaño se salta. Una migración de miles de
 * documentos se va a interrumpir —se interrumpen todas—, así que reanudarla
 * tiene que ser volver a lanzarla, no restaurar un estado intermedio.
 *
 * ## Lo que NO se ha ejecutado
 *
 * Este código no se ha corrido contra un bucket real: no hay credenciales de
 * S3 ni Docker para un MinIO en el entorno donde se escribió. Sus pruebas
 * verifican el recorrido, el salto de lo ya migrado, la verificación de
 * integridad y el corte ante el primer fallo, contra un destino simulado.
 */
import { createHash } from 'node:crypto';

export interface MigratableBlobRow {
  blobKey: string;
  tenantId: string;
  sha256: string;
  size: number;
}

/** Origen: la tabla `design_blobs`, leída en páginas ordenadas por clave. */
export interface BlobMigrationSource {
  list(afterKey: string | null, limit: number): Promise<MigratableBlobRow[]>;
  read(blobKey: string): Promise<Buffer>;
}

/** Destino: el almacenamiento de objetos, ya situado en el tenant correcto. */
export interface BlobMigrationTarget {
  head(
    tenantId: string,
    blobKey: string,
  ): Promise<{ exists: boolean; size: number }>;
  put(tenantId: string, blobKey: string, data: Buffer): Promise<void>;
}

export interface BlobMigrationOptions {
  source: BlobMigrationSource;
  target: BlobMigrationTarget;
  /** Filas por página. Un plano puede pesar 20 MB: páginas pequeñas. */
  batchSize?: number;
  /** Tope de blobs a copiar en esta pasada; `null` = todos. */
  limit?: number | null;
  /** Recorre y decide, pero no escribe. Es el primer paso de cualquier plan. */
  dryRun?: boolean;
  onProgress?: (report: BlobMigrationProgress) => void;
}

export interface BlobMigrationProgress {
  blobKey: string;
  tenantId: string;
  outcome: 'copiado' | 'ya-estaba' | 'sólo-plan';
  bytes: number;
}

export interface BlobMigrationReport {
  scanned: number;
  copied: number;
  skipped: number;
  bytesCopied: number;
  dryRun: boolean;
  /** Última clave procesada; reanudar es volver a lanzar sin más. */
  lastKey: string | null;
}

export class BlobMigrationIntegrityError extends Error {
  constructor(blobKey: string, detail: string) {
    super(`Blob ${blobKey}: ${detail}`);
    this.name = 'BlobMigrationIntegrityError';
  }
}

const DEFAULT_BATCH_SIZE = 25;

/**
 * Copia los blobs pendientes y devuelve el parte.
 *
 * Se detiene ANTE EL PRIMER FALLO en vez de seguir y resumir al final: un
 * error de integridad o de permisos en el bucket afecta a todos los blobs
 * siguientes, y una migración que continúa acumula miles de fallos idénticos
 * que esconden el primero, que es el único que dice qué pasó.
 */
export async function migrateBlobsToObjectStore(
  options: BlobMigrationOptions,
): Promise<BlobMigrationReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const dryRun = options.dryRun === true;
  const report: BlobMigrationReport = {
    scanned: 0,
    copied: 0,
    skipped: 0,
    bytesCopied: 0,
    dryRun,
    lastKey: null,
  };

  let cursor: string | null = null;
  for (;;) {
    if (options.limit !== null && options.limit !== undefined) {
      if (report.scanned >= options.limit) break;
    }
    const page: MigratableBlobRow[] = await options.source.list(
      cursor,
      batchSize,
    );
    if (page.length === 0) break;

    for (const row of page) {
      if (
        options.limit !== null &&
        options.limit !== undefined &&
        report.scanned >= options.limit
      ) {
        return report;
      }
      report.scanned += 1;
      cursor = row.blobKey;
      report.lastKey = row.blobKey;

      const existing = await options.target.head(row.tenantId, row.blobKey);
      if (existing.exists && existing.size === row.size) {
        report.skipped += 1;
        options.onProgress?.({
          blobKey: row.blobKey,
          tenantId: row.tenantId,
          outcome: 'ya-estaba',
          bytes: row.size,
        });
        continue;
      }

      if (dryRun) {
        options.onProgress?.({
          blobKey: row.blobKey,
          tenantId: row.tenantId,
          outcome: 'sólo-plan',
          bytes: row.size,
        });
        continue;
      }

      const data = await options.source.read(row.blobKey);
      // La integridad se comprueba EN ORIGEN: copiar un blob corrupto al
      // bucket lo convertiría en corrupción permanente en dos sitios y
      // borraría la pista de dónde empezó.
      if (data.length !== row.size) {
        throw new BlobMigrationIntegrityError(
          row.blobKey,
          `la fila declara ${row.size} bytes y se leyeron ${data.length}.`,
        );
      }
      const actual = createHash('sha256').update(data).digest('hex');
      if (actual !== row.sha256) {
        throw new BlobMigrationIntegrityError(
          row.blobKey,
          `la fila declara sha256 ${row.sha256} y los bytes dan ${actual}.`,
        );
      }

      await options.target.put(row.tenantId, row.blobKey, data);
      const confirmed = await options.target.head(row.tenantId, row.blobKey);
      if (!confirmed.exists || confirmed.size !== row.size) {
        throw new BlobMigrationIntegrityError(
          row.blobKey,
          'el destino no confirma el objeto tras la subida.',
        );
      }

      report.copied += 1;
      report.bytesCopied += data.length;
      options.onProgress?.({
        blobKey: row.blobKey,
        tenantId: row.tenantId,
        outcome: 'copiado',
        bytes: data.length,
      });
    }

    if (page.length < batchSize) break;
  }

  return report;
}
