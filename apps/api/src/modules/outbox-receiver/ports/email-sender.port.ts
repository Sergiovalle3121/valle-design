/**
 * Puerto del proveedor de envío de correo.
 *
 * Se diseña como puerto por la misma razón que el de pagos y el del PAC: la
 * elección de proveedor (Resend hoy; Postmark, SES… mañana) es configuración
 * del despliegue, no arquitectura del producto, y el dueño debe poder cambiar
 * de proveedor sin tocar el receptor. Nada aquí depende de HTTP, Nest ni de un
 * proveedor concreto.
 *
 * `idempotencyKey` forma parte del contrato de envío, no es un adorno: el
 * recibo durable del receptor se confirma en la MISMA transacción que el
 * envío, pero si el proceso cae entre el envío y el commit, la reentrega del
 * worker volverá a llamar aquí. La clave estable permite que el proveedor
 * deduplique esa ventana — es la segunda mitad de la defensa, no un extra.
 */

export interface EmailSenderDescriptor {
  /** Nombre estable del adaptador (`null` sin configurar; `resend` hoy). */
  readonly name: string;
  /** false ⇒ este despliegue NO puede enviar correo y el receptor lo dice. */
  readonly available: boolean;
}

export interface EmailSendRequest {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Estable entre reintentos; viaja al proveedor como Idempotency-Key. */
  readonly idempotencyKey: string;
}

/** El proveedor no aceptó (o no contestó): la entrega debe reintentarse. */
export class EmailSendError extends Error {
  constructor(readonly status: number | null) {
    super(
      status === null
        ? 'No se pudo contactar al proveedor de correo.'
        : `El proveedor de correo rechazó el envío con HTTP ${status}.`,
    );
    this.name = 'EmailSendError';
  }
}

export interface EmailSender {
  descriptor(): EmailSenderDescriptor;
  send(request: EmailSendRequest): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
