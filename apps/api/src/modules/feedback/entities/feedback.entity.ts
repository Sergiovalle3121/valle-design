import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/identity.entity';
import { DATE_COLUMN_TYPE } from '../../../common/database/date-column-type';
import { JSON_COLUMN_TYPE } from '../../../common/database/json-column-type';

/** Qué clase de comentario es. Lo elige quien escribe, en tres palabras. */
export type FeedbackKind = 'falla' | 'sugerencia' | 'duda';

/**
 * El estado, en el idioma en que se habla del backlog.
 *
 * Cuatro y no más. Un tablero con nueve columnas se abandona; con cuatro, el
 * dueño puede clasificar cien comentarios en diez minutos, que es la única
 * forma de que el canal siga vivo dentro de seis meses.
 *
 *   nuevo     · nadie lo ha leído todavía
 *   leido     · leído y entendido, sin decisión aún
 *   planeado  · va a hacerse; el usuario merece saberlo
 *   resuelto  · hecho, o cerrado con una razón
 */
export type FeedbackStatus = 'nuevo' | 'leido' | 'planeado' | 'resuelto';

/**
 * UN COMENTARIO DEL PRODUCTO.
 *
 * ── POR QUÉ SE PERSISTE, SI YA HAY UN BOTÓN DE «ALGO SALIÓ MAL» ─────────────
 * Porque aquel botón MANDA UN CORREO y se olvida. Sirve para un incidente —algo
 * se rompió, alguien tiene que mirarlo hoy— y no sirve para lo otro: la
 * sugerencia que alguien escribe un martes y que, si nadie la guarda, deja de
 * existir en cuanto se cierra la pestaña de quien la leyó.
 *
 * La diferencia que importa para el usuario es que aquí HAY VUELTA: su
 * comentario tiene estado, él lo ve, y saber que alguien lo leyó es la mitad de
 * lo que pide quien se toma la molestia de escribir. Un canal donde la gente
 * habla y nunca sabe si alguien escuchó se queda vacío solo.
 *
 * ── LO QUE NO GUARDA ────────────────────────────────────────────────────────
 * El plano. `context` es un objeto ACOTADO —ruta, navegador, versión— y sólo
 * viaja si quien escribe marca la casilla. El dibujo de un despacho es su
 * trabajo, y adjuntarlo «para depurar mejor» sin permiso explícito sería
 * exactamente la clase de cosa que un producto de CAD no puede permitirse.
 */
@Entity('product_feedback')
export class ProductFeedback {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * La organización activa cuando se escribió. Puede faltar: alguien recién
   * registrado, sin organización todavía, también tiene derecho a opinar — y a
   * menudo es quien más tiene que decir sobre el alta.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  organizationId!: string | null;

  /**
   * La relación se DECLARA aunque el código nunca la navegue.
   *
   * No es adorno: el arnés de pruebas construye el esquema desde las entidades
   * (`synchronize`) y producción lo construye desde las migraciones. Si la
   * entidad no declara la clave foránea, las dos formas divergen — y el `ON
   * DELETE SET NULL` que la migración escribe con cuidado no existe en las
   * pruebas, así que la prueba que verifica ese comportamiento pasa por
   * casualidad o falla sin motivo aparente. Este spec lo descubrió justo así.
   */
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organizationId' })
  organization!: Organization | null;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  /** Ver la nota de `organization`: la relación existe para que el esquema
   *  del arnés y el de la migración digan lo mismo. En CASCADE, no en SET
   *  NULL: el comentario es de su autor y se va con él. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /**
   * El correo, copiado aquí a propósito. El panel del dueño necesita poder
   * responder sin unir tres tablas, y un comentario que sobrevive a la baja de
   * su autor sigue siendo información útil sobre el producto.
   */
  @Column({ type: 'varchar', length: 254 })
  authorEmail!: string;

  @Column({ type: 'varchar', length: 16 })
  kind!: FeedbackKind;

  @Column({ type: 'text' })
  message!: string;

  /** Contexto técnico, sólo con permiso explícito. Ver la cabecera. */
  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  context!: Record<string, unknown> | null;

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'nuevo' })
  status!: FeedbackStatus;

  @CreateDateColumn({ type: DATE_COLUMN_TYPE })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COLUMN_TYPE })
  updatedAt!: Date;
}
