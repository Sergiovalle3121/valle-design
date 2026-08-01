import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Bitácora de auditoría PROPIA del producto Design (`design_audit_log`) —
 * sustituye al event ledger de Enterprise para los asientos CAD. Append-only y
 * server-owned: tenant y actor salen del contexto autenticado, nunca del body.
 * La auditoría server-owned de Fase 5 (comercialización) se apoya en esta
 * tabla.
 */
@Entity('design_audit_log')
@Index('idx_design_audit_scope', ['tenantId', 'createdAt'])
@Index('idx_design_audit_reference', [
  'tenantId',
  'referenceType',
  'referenceId',
])
export class DesignAuditLogEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  /** Identidad auditada (email) que ejecutó la acción; NULL = sistema. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  actor: string | null;

  /** Acción registrada, p. ej. `cad_document_saved`. */
  @Column({ type: 'varchar', length: 120 })
  action: string;

  /** Tipo de la entidad referenciada, p. ej. `CAD_DOCUMENT`. */
  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceType: string | null;

  @Column({
    name: 'reference_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referenceId: string | null;

  /** Contexto adicional del asiento (estados antes/después, etc.). */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt: Date;
}
