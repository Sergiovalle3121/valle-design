import { randomUUID } from 'node:crypto';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
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
  /**
   * Identidad generada por la APLICACIÓN.
   *
   * Declaraba `@PrimaryGeneratedColumn('uuid')`, que en PostgreSQL delega la
   * generación a la base: TypeORM omitía el valor y emitía `DEFAULT`. La
   * migración aplicada, en cambio, creó la columna como `varchar(36)` NOT NULL
   * SIN default, así que cada asiento moría con `null value in column "id"` y
   * el adaptador se lo tragaba: la auditoría CAD no registraba nada.
   *
   * Se genera aquí porque es la única estrategia idéntica en PostgreSQL y en
   * el adaptador SQLite de desarrollo, y porque deja la entidad, el tipo de
   * columna (`varchar(36)`) y la estrategia diciendo lo mismo. La migración
   * `20260805120000-DesignAuditLogIdentity` añade además un `DEFAULT` en
   * PostgreSQL como red para cualquier escritor que no pase por la entidad.
   */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @BeforeInsert()
  assignIdentity(): void {
    if (!this.id) this.id = randomUUID();
  }

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
