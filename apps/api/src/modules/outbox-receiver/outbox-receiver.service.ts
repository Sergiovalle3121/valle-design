import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { isUniqueViolation } from '../../common/database/unique-violation';
import {
  EmailTemplateError,
  renderEmailTemplate,
  type RenderedEmail,
} from './email-templates';
import {
  type DomainOutboxDelivery,
  type EmailOutboxDelivery,
} from './outbox-delivery';
import { WebhookReceipt } from './entities/webhook-receipt.entity';
import { type EmailSender } from './ports/email-sender.port';

export interface OutboxReceiverResult {
  status: 'processed' | 'accepted' | 'ignored' | 'duplicate';
  outcome: string;
}

/**
 * Procesa entregas YA verificadas (firma y frescura las comprobó el
 * controller). Su única obligación es la que ADR-0006 le impone a todo
 * receptor: deduplicar la clave y aceptar DURABLEMENTE antes del 2xx.
 *
 * El recibo se inserta PRIMERO y en la MISMA transacción que el efecto —
 * es el patrón de `payment_events` en billing-webhook.service.ts, con el
 * orden invertido porque el efecto aquí es EXTERNO (una llamada al proveedor
 * de correo), no una fila propia:
 *
 * - El único sobre `idempotency_key` es la barrera. Si dos entregas de la
 *   misma clave corren a la vez, la segunda queda bloqueada en el INSERT
 *   hasta que la primera commitea, y entonces recibe 23505: sólo una envía.
 * - Si el envío falla, la transacción entera se revierte: no queda recibo, y
 *   la siguiente reentrega del worker vuelve a intentar el envío. Un recibo
 *   sin correo enviado sería marcar como entregada una verificación que
 *   nadie recibió — el fallo silencioso exacto que este módulo evita.
 * - La ventana restante (correo enviado, commit perdido) la cubre la clave
 *   de idempotencia que viaja al proveedor: la reentrega repite la clave y
 *   el proveedor no duplica.
 *
 * Sí: la transacción abarca una llamada de red. Es deliberado y está acotado
 * (timeout del adaptador): la alternativa — commitear el recibo antes de
 * enviar — convierte cada caída del proveedor en correo perdido para
 * siempre, y eso es peor que retener una conexión unos segundos.
 */
export class OutboxReceiverService {
  constructor(
    private readonly database: DataSource,
    private readonly sender: EmailSender,
    /** null cuando no hay configuración de correo (el controller ya 503-ea). */
    private readonly linkBaseUrl: string | null,
  ) {}

  async processEmail(
    delivery: EmailOutboxDelivery,
    rawBody: Buffer,
  ): Promise<OutboxReceiverResult> {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    // El render es puro y ocurre FUERA de la transacción: una plantilla
    // desconocida o un payload malformado no mejoran reintentando (la
    // reentrega trae los mismos bytes), así que se apuntan y se aceptan —
    // nunca un 500 ni un reintento infinito, igual que el webhook de Stripe
    // con un tipo de evento desconocido. El recibo con su `outcome` deja el
    // rastro auditable para soporte.
    let rendered: RenderedEmail | null = null;
    let outcome = 'email_sent';
    try {
      rendered = renderEmailTemplate(
        delivery.template,
        delivery.payload,
        this.requireLinkBaseUrl(),
      );
    } catch (error) {
      if (!(error instanceof EmailTemplateError)) throw error;
      outcome = error.code;
    }

    try {
      return await this.database.transaction(async (manager) => {
        await manager.insert(WebhookReceipt, {
          queue: 'email',
          idempotencyKey: delivery.idempotencyKey,
          payloadHash,
          outcome,
        });
        if (rendered) {
          await this.sender.send({
            to: delivery.recipient,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            idempotencyKey: delivery.idempotencyKey,
          });
        }
        return {
          status: rendered ? ('processed' as const) : ('ignored' as const),
          outcome,
        };
      });
    } catch (error) {
      // La entrega repetida choca con el único, deshace su propio (no-)efecto
      // y se reporta como duplicada, nunca como error: el worker recibe 200 y
      // deja de reintentar.
      if (isUniqueViolation(error)) {
        return { status: 'duplicate', outcome: 'duplicate' };
      }
      throw error;
    }
  }

  /**
   * Cola `domain`, MVP deliberado: verificar (lo hizo el controller) +
   * aceptar durablemente + 200. No hay consumo todavía — ningún proyector de
   * eventos existe en este despliegue — y fingir uno sería peor que
   * declararlo. El recibo garantiza que cuando exista consumo, las entregas
   * antiguas ya aceptadas no se reprocesen.
   */
  async processDomain(
    delivery: DomainOutboxDelivery,
    rawBody: Buffer,
  ): Promise<OutboxReceiverResult> {
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      return await this.database.transaction(async (manager) => {
        await manager.insert(WebhookReceipt, {
          queue: 'domain',
          idempotencyKey: delivery.idempotencyKey,
          payloadHash,
          outcome: 'domain_accepted',
        });
        return { status: 'accepted' as const, outcome: 'domain_accepted' };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: 'duplicate', outcome: 'duplicate' };
      }
      throw error;
    }
  }

  private requireLinkBaseUrl(): string {
    if (this.linkBaseUrl) return this.linkBaseUrl;
    // Inalcanzable con el wiring todo-o-nada del módulo (sender disponible ⇔
    // configuración completa ⇔ base de enlaces presente), pero si un wiring
    // futuro rompe esa equivalencia, fallar aquí es retryable (500 → el
    // worker reintenta) y no envía correos con enlaces rotos.
    throw new Error(
      'OUTBOX_EMAIL_LINK_BASE_URL no está configurada: no se pueden construir enlaces absolutos.',
    );
  }
}
