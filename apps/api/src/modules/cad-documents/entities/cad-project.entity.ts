import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';

/**
 * Proyecto CAD propio (WP3) — el contenedor organizativo del producto Design:
 * agrupa documentos CAD (`cad_documents`) de un mismo trabajo/cliente/planta.
 *
 * Tabla aditiva nueva del modelo de datos CAD propio: NO toca `sf_line_layouts`
 * ni ninguna tabla legacy. `legacy_source_id` guarda, cuando aplica, el id del
 * origen legacy del que se copió el proyecto (Fase 4); es único por tenant
 * cuando no es nulo (índice parcial), con el lane de sistema (`tenant IS NULL`)
 * protegido por su propio índice parcial — mismo patrón que
 * `erp_bank_transactions`.
 */
@Entity('cad_projects')
@Index('idx_cad_project_scope', ['tenant_id', 'plant_id'])
@Index('uq_cad_project_tenant_legacy', ['tenant_id', 'legacySourceId'], {
  unique: true,
  where: '"legacy_source_id" IS NOT NULL',
})
@Index('uq_cad_project_legacy_lane', ['legacySourceId'], {
  unique: true,
  where: '"tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL',
})
export class CadProject extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** Ciclo de vida del proyecto: 'active' | 'archived' (extensible). */
  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: string;

  /** Id del origen legacy (Fase 4). NULL = proyecto nativo del producto CAD. */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'legacy_source_id',
  })
  legacySourceId: string | null;
}
