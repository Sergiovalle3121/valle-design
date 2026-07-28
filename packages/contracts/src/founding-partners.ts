/**
 * PROGRAMA DE PRIMEROS CLIENTES — límites como código, no como documento.
 *
 * Un descuento de lanzamiento tiene una propiedad incómoda: es fácil de
 * conceder y difícil de retirar. Cada regla de abajo existe porque su ausencia
 * produce un problema concreto y conocido:
 *
 *   • sin CUPO, "los primeros clientes" acaba siendo cualquiera que negocie;
 *   • sin TOPE, el descuento crece en cada negociación difícil;
 *   • sin CADUCIDAD, se convierte en precio vitalicio — y un precio vitalicio
 *     es una obligación indefinida que nadie aprobó conscientemente;
 *   • sin RAZÓN escrita, en un año nadie sabe por qué esa empresa paga menos;
 *   • sin la prohibición de ACUMULAR, dos descuentos razonables se suman en uno
 *     que no lo es;
 *   • aplicado a la IMPLEMENTACIÓN, descuenta trabajo con coste directo real,
 *     que es exactamente donde un descuento deja de salir del margen y empieza
 *     a salir del bolsillo.
 *
 * El programa NO se publica en la web. Es un instrumento de negociación que se
 * concede y se registra, no una oferta abierta.
 */

/* ─────────────────────────────── Límites ──────────────────────────────────── */

/** Cupo total del programa. Tres organizaciones, no "las primeras que lleguen". */
export const FOUNDING_PARTNER_MAX_ORGANIZATIONS = 3;

/** Descuento máximo en basis points (2500 = 25%). */
export const FOUNDING_PARTNER_MAX_DISCOUNT_BPS = 2500;

/** Duración máxima en meses. */
export const FOUNDING_PARTNER_MAX_MONTHS = 12;

/**
 * El descuento se aplica SÓLO al recurrente. La implementación es trabajo con
 * coste directo: descontarla no reduce margen, reduce ingreso por debajo del
 * coste.
 */
export const FOUNDING_PARTNER_APPLIES_TO_IMPLEMENTATION = false;

/** Nunca se renueva solo. Extenderlo es una decisión nueva, con su propio rastro. */
export const FOUNDING_PARTNER_AUTO_RENEWS = false;

/* ─────────────────────────────── Estados ──────────────────────────────────── */

export const FOUNDING_PARTNER_STATUSES = [
  /** Propuesto por ventas, sin aprobar. No descuenta nada. */
  "proposed",
  /** Aprobado por un admin de plataforma y vigente. */
  "active",
  /** Vencido por fecha. */
  "expired",
  /** Retirado antes de tiempo. */
  "revoked",
] as const;

export type FoundingPartnerStatus = (typeof FOUNDING_PARTNER_STATUSES)[number];

/** ÚNICO estado que descuenta. Añadir un estado nuevo no abre descuento. */
export const DISCOUNTING_STATUSES: readonly FoundingPartnerStatus[] = ["active"];

export interface FoundingPartnerView {
  readonly id: string;
  readonly tenantId: string;
  readonly status: FoundingPartnerStatus;
  readonly discountBps: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly revokedAt: string | null;
}

/* ────────────────────────────── Validación ────────────────────────────────── */

export interface FoundingPartnerProposal {
  readonly tenantId: string;
  readonly discountBps: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly reason: string;
}

/**
 * Comprueba una propuesta contra la política. Devuelve los problemas
 * encontrados; vacío significa aceptable.
 *
 * `activeCount` lo aporta el llamador tras contar los acuerdos vigentes: el
 * cupo es un hecho de la base de datos, no del contrato.
 */
export function validateFoundingPartnerProposal(
  proposal: FoundingPartnerProposal,
  activeCount: number,
): string[] {
  const problems: string[] = [];

  if (activeCount >= FOUNDING_PARTNER_MAX_ORGANIZATIONS) {
    problems.push(
      `El programa admite ${FOUNDING_PARTNER_MAX_ORGANIZATIONS} organizaciones y ya hay ${activeCount} vigentes.`,
    );
  }

  if (
    !Number.isInteger(proposal.discountBps) ||
    proposal.discountBps <= 0 ||
    proposal.discountBps > FOUNDING_PARTNER_MAX_DISCOUNT_BPS
  ) {
    problems.push(
      `El descuento debe estar entre 1 y ${FOUNDING_PARTNER_MAX_DISCOUNT_BPS} basis points (${FOUNDING_PARTNER_MAX_DISCOUNT_BPS / 100}%).`,
    );
  }

  const start = proposal.startsAt?.getTime?.();
  const end = proposal.endsAt?.getTime?.();
  if (!Number.isFinite(start)) {
    problems.push("Falta la fecha de inicio.");
  }
  if (!Number.isFinite(end)) {
    problems.push("Falta la fecha de expiración.");
  }
  if (Number.isFinite(start) && Number.isFinite(end)) {
    if (end <= start) {
      problems.push("La expiración debe ser posterior al inicio.");
    } else {
      const months = monthsBetween(proposal.startsAt, proposal.endsAt);
      if (months > FOUNDING_PARTNER_MAX_MONTHS) {
        problems.push(
          `La duración máxima es de ${FOUNDING_PARTNER_MAX_MONTHS} meses; la propuesta cubre ${months}.`,
        );
      }
    }
  }

  if ((proposal.reason ?? "").trim().length < 12) {
    problems.push(
      "La razón es obligatoria: en un año nadie recordará por qué esta empresa paga menos.",
    );
  }

  return problems;
}

/** Meses completos entre dos fechas, redondeando hacia arriba. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() > from.getUTCDate() ? months + 1 : months;
}

/** ¿El acuerdo descuenta hoy? Fail-closed: fuera de ventana no descuenta. */
export function foundingPartnerIsActive(
  agreement: {
    readonly status: FoundingPartnerStatus;
    readonly startsAt: string | Date;
    readonly endsAt: string | Date;
    readonly revokedAt?: string | Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (agreement.revokedAt) return false;
  if (!DISCOUNTING_STATUSES.includes(agreement.status)) return false;
  const t = now.getTime();
  return (
    new Date(agreement.startsAt).getTime() <= t &&
    new Date(agreement.endsAt).getTime() > t
  );
}

/**
 * Descuento aplicable a un importe recurrente.
 *
 * Devuelve 0 para cualquier cosa que no sea un acuerdo vigente, y 0 también
 * para la implementación. No hay acumulación: la firma acepta UN acuerdo, no
 * una lista, precisamente para que sumar dos requiera escribir código nuevo y
 * justificarlo.
 */
export function foundingPartnerDiscountBps(
  agreement: Parameters<typeof foundingPartnerIsActive>[0] & {
    readonly discountBps: number;
  },
  target: "recurring" | "implementation",
  now: Date = new Date(),
): number {
  if (target === "implementation" && !FOUNDING_PARTNER_APPLIES_TO_IMPLEMENTATION) {
    return 0;
  }
  if (!foundingPartnerIsActive(agreement, now)) return 0;
  return Math.min(agreement.discountBps, FOUNDING_PARTNER_MAX_DISCOUNT_BPS);
}
