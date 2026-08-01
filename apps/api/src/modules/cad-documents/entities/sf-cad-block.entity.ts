import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';
import { LayoutAsset } from '../cad-drawing-shapes';

/**
 * Bloque CAD reutilizable (ADR §224) — el "block definition" de AutoCAD: una
 * celda estándar (conveyor + printer + horno + AOI…) guardada UNA vez e
 * insertable en cualquier layout del tenant. Los assets se guardan con
 * coordenadas RELATIVAS al origen del bloque (esquina superior-izquierda del
 * bbox de la selección al guardar); el editor las traslada al insertar y agrupa
 * la inserción (§223) para que llegue como unidad.
 *
 * Tabla aditiva nueva: no toca layouts ni routing. Scoped por tenant/planta.
 * `created_at`/`created_by` vienen de TenantBaseEntity — NO redeclararlos
 * (duplicaría columnas en el CREATE TABLE de synchronize).
 */
@Entity('sf_cad_blocks')
@Index('idx_sf_cad_block_scope', ['tenant_id', 'plant_id'])
export class SfCadBlock extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Assets del bloque con posiciones relativas al origen (0,0). */
  @Column({ type: JSON_COLUMN_TYPE })
  assets: LayoutAsset[];

  /** Canonical CadBlockDefinition; NULL keeps legacy asset-only rows readable. */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  definition: Record<string, unknown> | null;

  /** Optimistic, monotonic library version incremented on redefine. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
