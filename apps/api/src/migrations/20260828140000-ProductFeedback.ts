import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LA MESA DONDE ATERRIZA LA VOZ DEL USUARIO.
 *
 * ── POR QUÉ UNA TABLA Y NO OTRO CORREO ──────────────────────────────────────
 * El producto ya tenía un canal de vuelta: el botón «algo salió mal», que manda
 * un correo por el outbox y se olvida. Sirve para un incidente. No sirve para
 * una sugerencia, que es lo que el dueño pidió recoger — porque una sugerencia
 * sin estado ni destinatario deja de existir en cuanto se cierra la pestaña de
 * quien la leyó, y porque quien la escribe merece saber que alguien la leyó.
 * Esa vuelta es la mitad del valor del canal.
 *
 * ── LAS DECISIONES DEL ESQUEMA ──────────────────────────────────────────────
 *  · `organization_id` NULLABLE. Alguien recién registrado, sin organización
 *    todavía, también opina — y suele ser quien más tiene que decir sobre el
 *    alta. Exigirla habría cerrado la puerta justo al comentario más valioso.
 *  · `user_id` con CASCADE, `organization_id` con SET NULL. Si alguien se da de
 *    baja, su comentario se va con él (es suyo). Si una organización desaparece,
 *    el comentario sobrevive sin ella: lo que dice sobre el producto sigue
 *    siendo cierto.
 *  · `author_email` copiado. El panel del dueño responde sin unir tres tablas.
 *  · `context` JSON y NULLABLE, y sólo se rellena con permiso explícito: nunca
 *    lleva el plano. El dibujo de un despacho es su trabajo.
 *  · CHECK en `kind` y `status`. Los dos son vocabularios cerrados, y un estado
 *    inventado en un UPDATE a mano dejaría al usuario mirando una etiqueta que
 *    la interfaz no sabe pintar.
 *
 * ── EL ÍNDICE QUE IMPORTA ───────────────────────────────────────────────────
 * `(status, created_at DESC)`. Las dos consultas reales son «lo nuevo primero»
 * en el panel del dueño y «lo mío, lo último arriba» en la lista del usuario;
 * un índice por estado solo obligaría a ordenar en memoria en cuanto haya
 * cientos de filas.
 *
 * `down()` borra la tabla y con ella los comentarios. Es una pérdida real y no
 * hay forma de evitarla —la tabla ES el dato—, pero conviene saberlo antes de
 * revertir.
 */
export class ProductFeedback20260828140000 implements MigrationInterface {
  name = 'ProductFeedback20260828140000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_feedback" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organizationId" uuid NULL,
        "userId" uuid NOT NULL,
        "authorEmail" varchar(254) NOT NULL,
        "kind" varchar(16) NOT NULL,
        "message" text NOT NULL,
        "context" jsonb NULL,
        "status" varchar(16) NOT NULL DEFAULT 'nuevo',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_product_feedback_user"
          FOREIGN KEY ("userId") REFERENCES "identity_users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_product_feedback_organization"
          FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_product_feedback_kind"
          CHECK ("kind" IN ('falla', 'sugerencia', 'duda')),
        CONSTRAINT "chk_product_feedback_status"
          CHECK ("status" IN ('nuevo', 'leido', 'planeado', 'resuelto')),
        CONSTRAINT "chk_product_feedback_message"
          CHECK (char_length("message") BETWEEN 1 AND 4000)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_product_feedback_status_created"
      ON "product_feedback"("status", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_product_feedback_user_created"
      ON "product_feedback"("userId", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_product_feedback_organization"
      ON "product_feedback"("organizationId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_feedback"`);
  }
}
