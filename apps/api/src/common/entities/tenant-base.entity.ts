import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Fields are nullable during the migration phase (existing rows have no tenant).
// Once the tenant-management module ships, a migration will enforce NOT NULL.
export abstract class TenantBaseEntity {
  @Column({ type: 'varchar', length: 36, nullable: true, name: 'tenant_id' })
  tenant_id: string | null;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'organization_id',
  })
  organization_id: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, name: 'plant_id' })
  plant_id: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deleted_at: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'created_by' })
  created_by: string | null;
}
