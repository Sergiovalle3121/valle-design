import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Documento CAD propio (WP3) — la fila dueña del documento canónico en el
 * modelo de datos del producto Design, independiente de la tabla legacy MIXTA
 * `sf_line_layouts` (que sigue intacta; los datos históricos se copian en
 * Fase 4, no aquí).
 *
 * `cad_document` usa EXACTAMENTE el mismo formato que
 * `sf_line_layouts.cad_document`: JSON inline cuando es compacto, o el puntero
 * a blob (`_storage.kind === 'document_blob'`) que producen los helpers de
 * `cad-document-storage`. La referencia al blob store es por `blobKey` string
 * dentro del puntero — NUNCA una FK hacia `doc_blobs`.
 *
 * `legacy_source_id` = id de `sf_line_layouts` cuando la fila proviene de la
 * proyección de compatibilidad (CadLegacyProjectionService) o de la copia de
 * Fase 4; único por tenant cuando no es nulo (índice parcial + lane de sistema,
 * patrón `erp_bank_transactions`).
 */
@Entity('cad_documents')
@Index('idx_cad_document_scope', ['tenant_id', 'plant_id'])
@Index('idx_cad_document_project', ['tenant_id', 'projectId'])
@Index('uq_cad_document_tenant_legacy', ['tenant_id', 'legacySourceId'], {
  unique: true,
  where: '"legacy_source_id" IS NOT NULL',
})
@Index('uq_cad_document_legacy_lane', ['legacySourceId'], {
  unique: true,
  where: '"tenant_id" IS NULL AND "legacy_source_id" IS NOT NULL',
})
export class CadDocument extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_projects` (nullable por ahora: documentos sin proyecto). */
  @Column({ type: 'varchar', length: 36, nullable: true, name: 'project_id' })
  projectId: string | null;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  /** Modelo de origen (o el centinela 'AXOS-CAD-STUDIO' del CAD Studio). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  revision: string | null;

  /** Documento canónico: JSON inline o puntero a blob (mismo formato legacy). */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, name: 'cad_document' })
  cadDocument: Record<string, unknown> | null;

  /** Token CAS de concurrencia optimista (entero monótono, 0 = sin guardar). */
  @Column({ type: 'integer', default: 0, name: 'cad_document_version' })
  cadDocumentVersion: number;

  /** Capas CAD (id/nombre/color/visible/locked). NULL = capa implícita. */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  layers: Record<string, unknown>[] | null;

  /** Id de `sf_line_layouts` de origen. NULL = documento nativo. */
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'legacy_source_id',
  })
  legacySourceId: string | null;
}
