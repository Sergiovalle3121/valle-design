import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EMAIL_SERVICE,
  type EmailService,
} from '../commercial/ports/commercial.ports';
import {
  ProductFeedback,
  type FeedbackKind,
  type FeedbackStatus,
} from './entities/feedback.entity';

/** La plantilla del outbox. Misma familia que el resto del correo del producto. */
export const FEEDBACK_TEMPLATE = 'product.feedback';

/**
 * Contexto técnico permitido. Lista CERRADA a propósito.
 *
 * Un `Record<string, unknown>` que el navegador rellena a su gusto es una vía
 * abierta a que un día alguien meta ahí el documento entero «para depurar
 * mejor». Estos cinco campos responden las preguntas que de verdad se hacen al
 * reproducir un fallo —dónde estaba, con qué navegador, qué versión, qué
 * documento y qué tamaño de ventana— y ninguno contiene el dibujo.
 */
const CAMPOS_DE_CONTEXTO = [
  'ruta',
  'navegador',
  'version',
  'documentoId',
  'ventana',
] as const;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Sólo llega si quien escribe marcó la casilla. */
  context?: Record<string, unknown> | null;
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly db: DataSource,
    @InjectRepository(ProductFeedback)
    private readonly feedback: Repository<ProductFeedback>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  /**
   * Recorta el contexto a los campos declarados y a un tamaño sensato.
   *
   * Se hace en el SERVIDOR aunque el cliente ya mande sólo estos campos. La
   * regla del repositorio es que nada que venga del navegador se cree: un
   * cliente modificado puede mandar lo que quiera, y lo que se persiste es
   * responsabilidad de quien persiste.
   */
  private sanearContexto(
    context: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!context) return null;
    const limpio: Record<string, unknown> = {};
    for (const campo of CAMPOS_DE_CONTEXTO) {
      const valor = context[campo];
      if (typeof valor === 'string' && valor.trim()) {
        limpio[campo] = valor.trim().slice(0, 200);
      }
    }
    return Object.keys(limpio).length > 0 ? limpio : null;
  }

  /**
   * Guarda el comentario y AVISA, en la misma transacción.
   *
   * El orden importa: primero la fila, luego el correo, y los dos o ninguno. Un
   * aviso sin fila manda al dueño a buscar en un panel un comentario que no
   * existe; una fila sin aviso deja el comentario esperando a que alguien entre
   * al panel por casualidad. El outbox transaccional resuelve las dos mitades
   * con la misma garantía que ya usan la verificación de correo y el aviso de
   * inicio de sesión.
   *
   * Si no hay buzón configurado se guarda igual y se registra el aviso perdido:
   * al revés que en el botón de incidentes —que falla ruidoso porque un
   * incidente sin destinatario es un incidente perdido— aquí la fila ES la
   * entrega, y negarse a guardar por falta de correo sería tirar el comentario.
   */
  async create(
    input: FeedbackInput,
    author: { userId: string; email: string; organizationId: string | null },
  ): Promise<ProductFeedback> {
    const destinatario = process.env.SUPPORT_EMAIL?.trim();
    const context = this.sanearContexto(input.context);

    return this.db.transaction(async (manager) => {
      const guardado = await manager.save(
        ProductFeedback,
        manager.create(ProductFeedback, {
          organizationId: author.organizationId,
          userId: author.userId,
          authorEmail: author.email,
          kind: input.kind,
          message: input.message.trim().slice(0, 4000),
          context,
          status: 'nuevo',
        }),
      );

      if (destinatario) {
        await this.email.enqueue(
          {
            // No pertenece a un inquilino: es correo del PRODUCTO para quien lo
            // opera. Marcarlo con la organización lo dejaría fuera del alcance
            // de quien tiene que leerlo.
            organizationId: null,
            tenantId: null,
            to: destinatario,
            template: FEEDBACK_TEMPLATE,
            payload: {
              id: guardado.id,
              kind: guardado.kind,
              message: guardado.message,
              from: author.email,
              organizationId: author.organizationId,
              context,
            },
            idempotencyKey: `${FEEDBACK_TEMPLATE}:${guardado.id}`,
          },
          { native: manager },
        );
      } else {
        this.logger.warn(
          `Comentario ${guardado.id} guardado sin aviso: SUPPORT_EMAIL no está configurado.`,
        );
      }

      return guardado;
    });
  }

  /** Lo que ve el autor: lo suyo, lo último arriba, con el estado visible. */
  async listForUser(userId: string, limit = 50): Promise<ProductFeedback[]> {
    return this.feedback.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Lo que ve quien opera el producto: TODO, de todas las organizaciones.
   *
   * Es la materia prima del backlog real, y por eso cruza la frontera de
   * inquilino que el resto del producto respeta a rajatabla. Quién puede
   * llamarlo lo decide el controlador contra una lista de operadores
   * configurada fuera de la base de datos; aquí no hay comprobación de permiso
   * a propósito, para que la regla viva en UN sitio y no en dos que puedan
   * divergir.
   */
  async listAll(
    filtro: { status?: FeedbackStatus; kind?: FeedbackKind } = {},
    limit = 200,
  ): Promise<ProductFeedback[]> {
    return this.feedback.find({
      where: {
        ...(filtro.status ? { status: filtro.status } : {}),
        ...(filtro.kind ? { kind: filtro.kind } : {}),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  /** Cambia el estado. Devuelve `null` si el comentario no existe. */
  async setStatus(
    id: string,
    status: FeedbackStatus,
  ): Promise<ProductFeedback | null> {
    const result = await this.feedback.update({ id }, { status });
    if (!result.affected) return null;
    return this.feedback.findOneBy({ id });
  }
}
