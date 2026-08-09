import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TenantBaseEntity } from '../../../common/entities/tenant-base.entity';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/**
 * Conjunto de planos (`cad_sheet_sets`) — el equivalente del `.dst` de AutoCAD.
 *
 * ## Por qué es una tabla propia y no una columna del documento
 *
 * Un conjunto agrupa hojas de VARIOS dibujos: la planta viene de un archivo,
 * las instalaciones de otro, los detalles de un tercero. Guardarlo dentro de un
 * `cad_documents` obligaría a elegir cuál de ellos es su dueño, y a cargar un
 * documento entero —que puede ser de decenas de megabytes— para leer una lista
 * de veinte filas. AutoCAD llegó a la misma conclusión hace veinte años.
 *
 * ## Qué guarda `content`
 *
 * Las hojas, la numeración, los subconjuntos y los campos comunes, como los
 * modela `lib/cad/sheet-set/sheet-set.ts` en el cliente. Es un documento JSON y
 * no una tabla de hojas normalizada a propósito: se lee y se escribe SIEMPRE
 * entero —reordenar el conjunto cambia el número de casi todas las hojas— y una
 * tabla aparte obligaría a un `DELETE`+`INSERT` masivo en cada guardado sin
 * ganar ninguna consulta que alguien vaya a hacer.
 *
 * `version` es el CAS: toda escritura manda la que cree tener, y una que no
 * coincide se responde con 409 y la vigente. Dos personas ordenando el mismo
 * conjunto a la vez se resuelven; jamás se sobrescriben.
 */
@Entity('cad_sheet_sets')
@Index('idx_cad_sheet_set_scope', ['tenant_id', 'projectId'])
export class CadSheetSet extends TenantBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK opcional a `cad_projects`. Un conjunto puede no colgar de ninguno. */
  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  /** El conjunto entero: hojas, numeración, campos y subconjuntos. */
  @Column({ type: JSON_COLUMN_TYPE })
  content: Record<string, unknown>;

  /** Versión monótona para el CAS optimista. Empieza en 1. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
