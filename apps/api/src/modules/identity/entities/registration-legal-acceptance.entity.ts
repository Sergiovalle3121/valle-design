import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * La aceptación inicial pertenece a la identidad: durante el alta aún no hay
 * organización. No tiene FK al usuario para conservar la constancia histórica
 * si se borra la cuenta. Las aceptaciones posteriores por organización siguen
 * en `legal_acceptances`, con su aislamiento de tenant intacto.
 */
@Entity('identity_registration_legal_acceptances')
export class RegistrationLegalAcceptance {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'terms_version', type: 'varchar', length: 40 })
  termsVersion!: string;

  /** Default de la base; el cliente nunca proporciona el instante. */
  @CreateDateColumn({ name: 'accepted_at', type: DATE_COLUMN_TYPE })
  acceptedAt!: Date;
}
