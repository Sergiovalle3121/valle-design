import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';

/**
 * Última posición conocida de UN peer sobre UN documento — el relevo de red
 * que hace posible el fan-out entre réplicas (ver `CadPresenceBus`), no un
 * historial. La fila se SOBRESCRIBE en cada latido (upsert por
 * `(tenant_id, document_id, peer_id)`) y se BORRA por el barrido de TTL
 * (`CadPresenceCleanupService`): quien deja de latir desaparece de la tabla,
 * no queda marcado como "inactivo". Ninguna consulta de este módulo pide la
 * fila por su `id`; existe solo porque TypeORM exige una clave primaria.
 *
 * Sin columna de secuencia a propósito: `NOTIFY` solo lleva
 * `{tenantId, documentId}` (tope de 8 KB de PostgreSQL, y de sobra libre así)
 * y cada réplica reacciona releyendo el SNAPSHOT completo del documento —
 * unas pocas filas por plano— en vez de reconstruir una fila puntual por
 * secuencia. Es más simple y no hay ventana donde una fila ya borrada por el
 * TTL deje un `seq` sin dueño.
 */
@Entity('cad_presence_beats')
@Index('uq_cad_presence_beat_peer', ['tenant_id', 'documentId', 'peerId'], {
  unique: true,
})
@Index('idx_cad_presence_beat_document', ['tenant_id', 'documentId'])
@Index('idx_cad_presence_beat_updated', ['updatedAt'])
export class CadPresenceBeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, name: 'tenant_id' })
  tenant_id: string;

  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  /** Identidad de la PESTAÑA emisora (ver `presence.ts` del cliente), no de la persona. */
  @Column({ type: 'varchar', length: 100, name: 'peer_id' })
  peerId: string;

  /** Nombre visible, derivado server-side del email autenticado — nunca del body del cliente. */
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'double precision', name: 'cursor_x', nullable: true })
  cursorX: number | null;

  @Column({ type: 'double precision', name: 'cursor_y', nullable: true })
  cursorY: number | null;

  @Column({ type: 'double precision', name: 'viewport_min_x', nullable: true })
  viewportMinX: number | null;

  @Column({ type: 'double precision', name: 'viewport_min_y', nullable: true })
  viewportMinY: number | null;

  @Column({ type: 'double precision', name: 'viewport_max_x', nullable: true })
  viewportMaxX: number | null;

  @Column({ type: 'double precision', name: 'viewport_max_y', nullable: true })
  viewportMaxY: number | null;

  /**
   * Siempre `false` en esta versión: la superficie de presencia por servidor
   * exige sesión first-party (ver `cad-presence.controller.ts`), así que
   * ningún latido que llega por aquí puede venir de un invitado de review
   * link. La columna existe para no romper la forma de `CadPresenceBeat` del
   * cliente el día que la presencia de invitado exista (hoy declarada
   * "todavía no", ver PR).
   */
  @Column({ type: 'boolean', default: false })
  guest: boolean;

  @Column({ type: DATE_COLUMN_TYPE, name: 'updated_at' })
  updatedAt: Date;
}
