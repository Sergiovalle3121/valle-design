import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { BINARY_COLUMN_TYPE } from '../../../common/database/binary-column-type';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Blob content-addressed PROPIO del producto Design (`design_blobs`), modelado
 * sobre el patrón `doc_blobs` del monorepo origen: una fila por contenido
 * único (sha256) por tenant, deduplicada, con marca de GC en dos barridos.
 *
 * Hoy los bytes viven EN LA BASE (bytea); MinIO del docker-compose queda
 * reservado para el adaptador S3 futuro sin cambiar este contrato. La
 * referencia desde `cad_documents` es SIEMPRE por `blob_key` string dentro del
 * puntero JSON `_storage` — nunca una FK.
 */
@Entity('design_blobs')
@Unique('uq_design_blob_tenant_hash', ['tenantId', 'sha256'])
@Index(['tenantId', 'blobKey'], { unique: true })
export class DesignBlob {
  @PrimaryColumn({ name: 'blob_key', type: 'varchar', length: 64 })
  blobKey: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId: string;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'integer' })
  size: number;

  @Column({
    type: BINARY_COLUMN_TYPE,
    select: false,
  })
  data: Buffer;

  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt: Date;

  /** Primera fase del borrado en dos barridos. Re-usar el blob la limpia. */
  @Column({ name: 'gc_marked_at', type: DATE_COLUMN_TYPE, nullable: true })
  gcMarkedAt: Date | null;
}
