import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DesignBlob } from './entities/design-blob.entity';
import {
  TenantScopedRepository,
  getTenantRepositoryToken,
} from '../../common/tenant/tenant-scoped.repository';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

/** Manifiesto confirmado tras aceptar los bytes (mismo shape que el puerto CAD). */
export interface DesignBlobPutResult {
  blobKey: string;
  sha256: string;
  size: number;
  /** false cuando la escritura se dedupli­có contra un blob existente. */
  created: boolean;
}

export interface DesignBlobHead {
  blobKey: string;
  sha256: string;
  size: number;
  gcMarkedAt: Date | null;
}

/**
 * BlobStore de Design sobre la base de datos (`design_blobs`), adaptado del
 * `DatabaseDocumentBlobStore` del origen:
 *
 * - `put` es content-addressed y DEDUPLICA por sha256 dentro del tenant; el
 *   mismo contenido dos veces devuelve la MISMA blobKey sin duplicar bytes.
 *   Una colisión de hash (mismo sha256, distinto tamaño) es un 409 explícito.
 *   Re-subir un blob marcado para GC lo resucita (limpia `gc_marked_at`).
 * - `get` devuelve los bytes o lanza 404 — el dominio CAD nunca recibe null.
 * - `delete` es la primitiva DESTRUCTIVA del segundo barrido del GC: se niega
 *   (409) a borrar un blob sin marca `gc_marked_at` previa (`markForGc`).
 *
 * Acotado deliberadamente al límite de 20 MiB del multipart del documento CAD;
 * el streaming/objeto (MinIO) queda para un adaptador S3 futuro con el mismo
 * contrato.
 */
@Injectable()
export class DatabaseBlobStore {
  constructor(
    @Inject(getTenantRepositoryToken(DesignBlob))
    private readonly repo: TenantScopedRepository<DesignBlob>,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async put(data: Buffer, sha256: string): Promise<DesignBlobPutResult> {
    const tenantId = this.tenantCtx.requireTenantId('design blob put');
    const existing = await this.repo.findOne({ where: { sha256 } });
    if (existing) {
      if (existing.size !== data.length) {
        throw new ConflictException('Colisión de hash de blob detectada.');
      }
      if (existing.gcMarkedAt) {
        existing.gcMarkedAt = null;
        await this.repo.save(existing);
      }
      return {
        blobKey: existing.blobKey,
        sha256: existing.sha256,
        size: existing.size,
        created: false,
      };
    }

    const entity = this.repo.create({
      blobKey: randomUUID(),
      tenantId,
      sha256,
      size: data.length,
      data,
      gcMarkedAt: null,
    });
    const saved = await this.repo.save(entity);
    return {
      blobKey: saved.blobKey,
      sha256: saved.sha256,
      size: saved.size,
      created: true,
    };
  }

  async get(blobKey: string): Promise<Buffer> {
    const row = await this.repo.findOne({
      where: { blobKey },
      select: {
        blobKey: true,
        tenantId: true,
        sha256: true,
        size: true,
        data: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException('El blob CAD no existe.');
    return row.data;
  }

  async head(blobKey: string): Promise<DesignBlobHead> {
    const row = await this.repo.findOne({ where: { blobKey } });
    if (!row) throw new NotFoundException('El blob CAD no existe.');
    return {
      blobKey: row.blobKey,
      sha256: row.sha256,
      size: row.size,
      gcMarkedAt: row.gcMarkedAt,
    };
  }

  /** Primer barrido del GC: marca el blob como huérfano candidato a borrado. */
  async markForGc(blobKey: string): Promise<void> {
    const row = await this.repo.findOne({ where: { blobKey } });
    if (!row) throw new NotFoundException('El blob CAD no existe.');
    if (!row.gcMarkedAt) {
      row.gcMarkedAt = new Date();
      await this.repo.save(row);
    }
  }

  /** Segundo barrido del GC. Borrar sin marca previa es un 409 (fail-closed). */
  async delete(blobKey: string): Promise<void> {
    const row = await this.repo.findOne({ where: { blobKey } });
    if (!row) return;
    if (!row.gcMarkedAt) {
      throw new ConflictException(
        'Borrar un blob exige la marca previa del GC (markForGc).',
      );
    }
    await this.repo.remove(row);
  }
}
