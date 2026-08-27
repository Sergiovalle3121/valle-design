/**
 * LAS TRES FASES DE UNA PRUEBA GRATUITA — y por qué ninguna es una pantalla
 * muerta.
 *
 * Una prueba de tres meses tiene un problema que las de catorce días no
 * tienen: el usuario se olvida. Empieza en agosto, entrega dos proyectos y en
 * noviembre abre el navegador y se encuentra con un 403. Si ese día descubre
 * que además no puede sacar sus planos, no vuelve — y con razón.
 *
 * Este módulo calcula, de la suscripción real, en cuál de las cuatro
 * situaciones está la cuenta. Es PURO: sin red, sin React, sin `Date.now()`
 * implícito —el reloj se pasa— para que las fronteras (14 días exactos, 1 día,
 * 0 días, vencido hace un minuto) se puedan probar sin esperar tres meses.
 *
 * La regla que ordena las cuatro: `expired` NO significa "se acabó". Significa
 * "se acabó la edición". El usuario entra, ve y exporta; ver
 * `READ_ONLY_AFTER_LAPSE_PERMISSIONS` en el contrato y la regla de oro del
 * guard.
 */
import type { components } from "@valle/design-sdk";
import { EXPIRY_NOTICE_DAYS } from "@/config/launch";

type Schemas = components["schemas"];
export type Subscription = Schemas["EffectiveSubscriptionView"];

export type TrialPhase =
  /** Ni prueba ni vencimiento a la vista: nada que anunciar. */
  | "none"
  /** Vigente y con holgura: se dice cuánto queda, sin alarma. */
  | "active"
  /** Vigente pero dentro de la ventana de aviso: el banner aparece. */
  | "ending-soon"
  /** Terminada: solo lectura. Abre, ve y exporta; no edita. */
  | "expired";

export interface TrialStatus {
  readonly phase: TrialPhase;
  /**
   * Días completos que faltan. Negativo cuando ya venció, `null` cuando no hay
   * fecha registrada — que no es lo mismo que cero y no se puede pintar igual.
   */
  readonly daysLeft: number | null;
  /** Instante del vencimiento, o `null` si la suscripción no lo declara. */
  readonly endsAt: Date | null;
  /** ¿La sesión puede editar? Es la pregunta que hace la interfaz. */
  readonly canEdit: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Días COMPLETOS que faltan, redondeando hacia arriba.
 *
 * Con 0.4 días por delante el usuario tiene «1 día», no «0 días»: decirle cero
 * cuando todavía puede trabajar esta tarde es una mentira que le hace cerrar
 * el programa antes de tiempo. Ya vencido, el número es negativo y quien lo
 * pinte decide qué hacer con él.
 */
export function daysUntil(endsAt: Date, now: Date): number {
  return Math.ceil((endsAt.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * La fecha que de verdad marca el final del acceso de edición.
 *
 * En prueba manda `trialEndsAt`; con un periodo pagado manda
 * `currentPeriodEnd`. Cuando existen las dos —una cuenta que pasó de prueba a
 * pago— la que importa es la MÁS TARDÍA: es hasta cuándo puede trabajar.
 */
export function accessEndsAt(subscription: Subscription): Date | null {
  const candidates = [subscription.trialEndsAt, subscription.currentPeriodEnd]
    .map((value) => (value ? new Date(value) : null))
    .filter((value): value is Date => !!value && !Number.isNaN(value.getTime()));
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

/**
 * La fase, del dato real.
 *
 * `effective` es la palabra del SERVIDOR sobre si el entitlement está vigente,
 * y manda sobre cualquier aritmética de fechas que haga el navegador: el reloj
 * del cliente puede estar mal, adelantado o en otra zona, y no es quien decide
 * si alguien puede editar. Las fechas sólo sirven para decir CUÁNTO FALTA.
 */
export function trialStatus(
  subscription: Subscription | null | undefined,
  now: Date = new Date(),
): TrialStatus {
  if (!subscription) {
    return { phase: "none", daysLeft: null, endsAt: null, canEdit: false };
  }
  const endsAt = accessEndsAt(subscription);
  const daysLeft = endsAt ? daysUntil(endsAt, now) : null;

  if (!subscription.effective) {
    return { phase: "expired", daysLeft, endsAt, canEdit: false };
  }
  // Vigente. Sin fecha registrada no se anuncia un vencimiento que nadie puede
  // comprobar: un banner que dice «tu prueba termina pronto» sin fecha es peor
  // que ningún banner.
  if (daysLeft === null) {
    return { phase: "active", daysLeft: null, endsAt: null, canEdit: true };
  }
  const phase: TrialPhase =
    daysLeft <= EXPIRY_NOTICE_DAYS ? "ending-soon" : "active";
  return { phase, daysLeft, endsAt, canEdit: true };
}

/**
 * El texto del aviso. Tres frases, una por fase que se anuncia, y cada una
 * dice lo que SIGUE funcionando — nunca sólo lo que se pierde.
 */
export function trialNotice(status: TrialStatus): string | null {
  switch (status.phase) {
    case "none":
    case "active":
      return null;
    case "ending-soon": {
      const left = status.daysLeft ?? 0;
      const quantity = left <= 0 ? "hoy" : left === 1 ? "mañana" : `en ${left} días`;
      return `Tu acceso de edición termina ${quantity}. Después seguirás pudiendo abrir y exportar todos tus planos; para volver a dibujar habrá que activar un plan.`;
    }
    case "expired":
      return "Tu periodo de edición terminó. Tus documentos siguen aquí y puedes abrirlos, imprimirlos y exportarlos a DXF cuando quieras; para volver a dibujar hay que activar un plan.";
  }
}
