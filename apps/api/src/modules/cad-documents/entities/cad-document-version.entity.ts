import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Historial inmutable de versiones del documento CAD propio (WP3): una fila por
 * versión CAS de `cad_documents.cad_document_version`, con el payload tal cual
 * vivía (JSON inline o puntero a blob — mismo formato que la fila viva). La
 * unicidad (document_id, version) hace la escritura idempotente: re-proyectar
 * la misma versión no duplica historial.
 *
 * `created_at`/`created_by` vienen de TenantBaseEntity — NO redeclararlos.
 * La referencia al blob store dentro del puntero es por `blobKey` string,
 * nunca FK hacia `doc_blobs`.
 */
@Entity('cad_document_versions')
@Index('idx_cad_document_version_scope', ['tenant_id', 'documentId'])
@Index('uq_cad_document_version', ['documentId', 'version'], { unique: true })
export class CadDocumentVersion extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a `cad_documents`. */
  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  /** Versión CAS (entera, monótona) que este payload representa. */
  @Column({ type: 'integer' })
  version: number;

  /** Documento canónico de esa versión: JSON inline o puntero a blob. */
  @Column({ type: JSON_COLUMN_TYPE, name: 'cad_document' })
  cadDocument: Record<string, unknown>;

  /** sha256 del archivo comprimido (puntero) o del JSON inline; NULL si n/d. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256: string | null;

  /**
   * Etiqueta humana de la versión (Fase 4): nombre del snapshot legacy del que
   * proviene. NULL en versiones nativas (guardados CAS normales).
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  /**
   * Id de origen de la versión importada (Fase 4): `<layoutId>:v<version>`
   * para la canónica o el id del snapshot legacy. NULL = versión nativa.
   */
  @Column({
    type: 'varchar',
    length: 96,
    nullable: true,
    name: 'legacy_source_id',
  })
  legacySourceId: string | null;
}
