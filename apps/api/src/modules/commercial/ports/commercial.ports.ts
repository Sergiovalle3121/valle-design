/** Puertos comerciales standalone. No dependen de HTTP, Nest ni un producto anfitrión. */
export interface EntitlementContext {
  tenantId?: string | null;
  organizationId?: string | null;
  now?: Date;
}
/**
 * Un entitlement que EXISTIÓ y venció.
 *
 * La diferencia entre «nunca lo tuvo» y «lo tuvo y se le acabó» es lo único
 * que separa a un cliente cuya prueba terminó de un visitante cualquiera — y
 * es la que decide si sus documentos siguen siendo suyos. Sin este dato el
 * guard sólo puede responder sí/no, y el no cierra también abrir y exportar.
 */
export interface LapsedEntitlement {
  readonly planCode: string;
  readonly status: string;
  /** Instante en que dejó de estar vigente (fin de prueba o de periodo). */
  readonly lapsedAt: Date;
  readonly reason: 'trial_ended' | 'period_ended';
}

export interface EntitlementService {
  hasEntitlement(code: string, context?: EntitlementContext): Promise<boolean>;
  /**
   * OPCIONAL a propósito. Un adaptador que no la implemente conserva
   * exactamente el comportamiento anterior —fallo cerrado y completo—, así
   * que ningún doble de prueba ni adaptador futuro puede CONCEDER acceso de
   * lectura por descuido: el modo solo-lectura sólo existe donde alguien lo
   * implementó mirando el reloj y la suscripción real.
   */
  lapsedEntitlement?(
    code: string,
    context?: EntitlementContext,
  ): Promise<LapsedEntitlement | null>;
}
export interface SubscriptionProvider {
  currentSubscription(context: EntitlementContext): Promise<{
    planCode: string;
    status: string;
    trialEndsAt: Date | null;
  } | null>;
}
export interface TransactionContext {
  readonly native: unknown;
}
export interface UsageMeter {
  record(
    input: {
      organizationId: string;
      tenantId: string;
      metric: string;
      quantity?: number;
      idempotencyKey: string;
    },
    tx: TransactionContext,
  ): Promise<void>;
}
export interface CadEventPublisher {
  publish(
    input: {
      organizationId: string;
      tenantId: string;
      type: string;
      aggregateId: string;
      payload: unknown;
      idempotencyKey: string;
    },
    tx: TransactionContext,
  ): Promise<void>;
}
export interface EmailService {
  enqueue(
    input: {
      organizationId: string | null;
      tenantId: string | null;
      to: string;
      template: string;
      payload: unknown;
      idempotencyKey: string;
    },
    tx: TransactionContext,
  ): Promise<void>;
}
export const ENTITLEMENT_SERVICE = Symbol('ENTITLEMENT_SERVICE');
export const SUBSCRIPTION_PROVIDER = Symbol('SUBSCRIPTION_PROVIDER');
export const USAGE_METER = Symbol('USAGE_METER');
export const CAD_EVENT_PUBLISHER = Symbol('CAD_EVENT_PUBLISHER');
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
