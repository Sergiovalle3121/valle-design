import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BINARY_COLUMN_TYPE } from '../../../common/database/binary-column-type';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Enlace temporal compartido desde `/demo`, sin cuenta — ver la migración
 * `20260924120000-CadDemoShares` para el porqué de cada columna.
 *
 * Sin `tenant_id` a propósito: no es dato de ninguna organización. De los
 * tokens sólo se guarda su sha256; el claro viaja una única vez, en la
 * respuesta de creación.
 */
@Entity('cad_demo_shares')
@Index('uq_cad_demo_share_token', ['tokenHash'], { unique: true })
@Index('uq_cad_demo_share_manage', ['manageHash'], { unique: true })
@Index('idx_cad_demo_share_expires', ['expiresAt'])
export class CadDemoShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'varchar', length: 64, name: 'manage_hash' })
  manageHash: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  /** El documento canónico saneado, en gzip. No se lee salvo al canjear. */
  @Column({ type: BINARY_COLUMN_TYPE, name: 'document_gzip', select: false })
  documentGzip: Buffer;

  @Column({ type: 'integer', name: 'gzip_bytes' })
  gzipBytes: number;

  @Column({ type: 'integer', name: 'entity_count' })
  entityCount: number;

  @Column({ type: DATE_COLUMN_TYPE, name: 'created_at' })
  createdAt: Date;

  @Column({ type: DATE_COLUMN_TYPE, name: 'expires_at' })
  expiresAt: Date;
}
