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

/**
 * Aceptación de un documento legal por un usuario, en el contexto de una
 * organización.
 *
 * Append-only y server-owned: el instante, el actor y el tenant salen de la
 * sesión verificada, nunca del cuerpo de la petición. Un registro legal que el
 * cliente puede fechar no es evidencia.
 *
 * Qué NO se guarda, y es una decisión, no un olvido: dirección IP, agente de
 * usuario ni ningún otro dato de navegación. El RUNBOOK prohíbe exportar PII
 * en señales operativas, y para acreditar una aceptación bastan *quién*
 * (usuario y organización), *qué* (documento y versión exacta) y *cuándo*. Un
 * despliegue que necesite más por exigencia jurídica local debe añadirlo con
 * una decisión explícita, no heredarlo por defecto.
 */
@Entity('legal_acceptances')
@Index('idx_legal_acceptances_user', ['tenantId', 'userId'])
@Index(
  'uq_legal_acceptances_version',
  ['tenantId', 'userId', 'document', 'version'],
  {
    unique: true,
  },
)
export class LegalAcceptance {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @BeforeInsert()
  assignIdentity(): void {
    if (!this.id) this.id = randomUUID();
  }

  /** ADR-0005: `tenant_id = organization_id` para datos de una organización. */
  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId: string;

  @Column({ name: 'organization_id', type: 'varchar', length: 36 })
  organizationId: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** `terms` | `privacy`; varchar + CHECK, como el resto de estados del repo. */
  @Column({ type: 'varchar', length: 40 })
  document: string;

  /** Versión EXACTA aceptada, nunca «la vigente». */
  @Column({ type: 'varchar', length: 40 })
  version: string;

  @Column({ name: 'accepted_at', type: DATE_COLUMN_TYPE })
  acceptedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: DATE_COLUMN_TYPE })
  createdAt: Date;
}
