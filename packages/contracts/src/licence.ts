/**
 * LICENCIA DE DESPLIEGUE EN CLIENTE — lo que falta para poder vender on-premise.
 *
 * En SaaS compartido y nube privada, quién puede usar qué lo decide el
 * proveedor de pagos: hay un webhook firmado, una suscripción y una tabla de
 * grants. En un despliegue en la infraestructura del cliente no hay nada de
 * eso. El software corre en una máquina ajena, posiblemente sin salida a
 * internet, y nadie puede consultarle a Stripe si ese cliente sigue pagando.
 *
 * La licencia firmada es la que sustituye a esa consulta: un documento emitido
 * FUERA de la aplicación, con una llave privada que no vive en el repositorio,
 * que dice qué contrató esa organización y hasta cuándo. El despliegue lo
 * verifica sin red y produce sus grants a partir de él.
 *
 * ─── Qué NO es ───────────────────────────────────────────────────────────────
 * No es una protección anticopia. Quien tenga el código puede quitar la
 * verificación. Su propósito es que un cliente honesto SEPA qué contrató y que
 * un uso fuera de contrato sea visible y demostrable, no impedir el
 * incumplimiento deliberado de quien controla la máquina. Presentarlo como lo
 * segundo sería vender una garantía que no existe.
 *
 * ─── Por qué no caduca de golpe ──────────────────────────────────────────────
 * Una licencia vencida no apaga la planta. El día que expira empieza una
 * ventana de gracia con avisos cada vez más visibles; sólo al agotarse dejan de
 * renovarse los grants. Cortarle la producción a una fábrica a medio turno por
 * una renovación administrativa que lleva dos días de retraso convierte un
 * problema de cobranza en un problema de seguridad industrial.
 *
 * ─── Qué vive aquí y qué no ──────────────────────────────────────────────────
 * Aquí: la forma del documento, su codificación canónica y todas las
 * comprobaciones que no necesitan criptografía. La verificación de la FIRMA
 * vive en la API, porque usa `node:crypto` y este paquete también lo consume el
 * navegador.
 */

import type { DeploymentModel } from "./product-catalog";

/* ────────────────────────────── Documento ─────────────────────────────────── */

export const LICENCE_FORMAT_VERSION = 1;

/** Entornos que una licencia puede autorizar. */
export const LICENCE_ENVIRONMENTS = ["production", "non_production"] as const;

export type LicenceEnvironment = (typeof LICENCE_ENVIRONMENTS)[number];

/**
 * Nivel de soporte comprometido. Es parte de la licencia y no de un correo
 * suelto porque el soporte es la obligación que más se olvida al firmar y la
 * primera que se reclama cuando algo falla.
 */
export const LICENCE_SUPPORT_TIERS = ["standard", "priority"] as const;

export type LicenceSupportTier = (typeof LICENCE_SUPPORT_TIERS)[number];

export interface LicensedOffer {
  readonly offerCode: string;
  /** Cantidad contratada en la métrica de la oferta. `0` = sin tope pactado. */
  readonly quantity: number;
}

/**
 * Contenido firmado. Todo lo que el despliegue necesita saber, y nada que
 * requiera consultar a nadie.
 */
export interface LicencePayload {
  readonly version: number;
  /** Identificador del documento. Viaja a la auditoría y a los grants. */
  readonly licenceId: string;
  /** Organización a la que se emitió, tal y como aparece en el contrato. */
  readonly customer: string;
  /** Tenant al que aplica dentro del despliegue. */
  readonly tenantId: string;
  readonly deploymentModel: DeploymentModel;
  readonly environment: LicenceEnvironment;
  readonly supportTier: LicenceSupportTier;
  readonly offers: readonly LicensedOffer[];
  /** ISO-8601. */
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly notAfter: string;
  /**
   * Días de gracia tras `notAfter` durante los que el despliegue sigue
   * operando con avisos. Acotado por `LICENCE_MAX_GRACE_DAYS` al verificar.
   */
  readonly graceDays: number;
}

/** Documento completo: contenido + firma. */
export interface SignedLicence {
  readonly payload: LicencePayload;
  /** Firma Ed25519 del encoding canónico, en base64url. */
  readonly signature: string;
  /** Identificador de la llave con la que se firmó, para poder rotarla. */
  readonly keyId: string;
}

/* ─────────────────────────────── Límites ──────────────────────────────────── */

/**
 * Tope de la ventana de gracia. Una licencia no puede pactar una gracia
 * indefinida: eso convertiría la caducidad en decorativa, que es exactamente lo
 * que la licencia existe para evitar.
 */
export const LICENCE_MAX_GRACE_DAYS = 45;

/** A partir de aquí el aviso deja de ser informativo y pasa a ser urgente. */
export const LICENCE_WARN_DAYS_BEFORE_EXPIRY = 30;

/* ────────────────────────── Codificación canónica ─────────────────────────── */

/**
 * Serialización DETERMINISTA del contenido.
 *
 * `JSON.stringify` sobre un objeto no garantiza el orden de las claves entre
 * versiones ni entre motores, y una firma sobre bytes que cambian de orden es
 * una firma que a veces no valida. Aquí las claves se ordenan explícitamente:
 * el emisor y el verificador producen los MISMOS bytes o la licencia se
 * rechaza, que es el comportamiento correcto.
 */
export function canonicalLicenceBytes(payload: LicencePayload): string {
  const offers = [...payload.offers]
    .map((o) => ({ offerCode: o.offerCode, quantity: o.quantity }))
    .sort((a, b) => a.offerCode.localeCompare(b.offerCode));

  return JSON.stringify([
    payload.version,
    payload.licenceId,
    payload.customer,
    payload.tenantId,
    payload.deploymentModel,
    payload.environment,
    payload.supportTier,
    offers.map((o) => [o.offerCode, o.quantity]),
    payload.issuedAt,
    payload.notBefore,
    payload.notAfter,
    payload.graceDays,
  ]);
}

/* ───────────────────────────── Comprobaciones ─────────────────────────────── */

/**
 * Por qué una licencia no sirve. Se enumeran porque «licencia inválida» sin
 * más obliga a quien opera el despliegue a adivinar, normalmente de noche.
 */
export const LICENCE_REJECTIONS = [
  "malformed",
  "unsupported_version",
  "bad_signature",
  "unknown_key",
  "not_yet_valid",
  "expired",
  "wrong_deployment_model",
  "tenant_mismatch",
  "no_offers",
] as const;

export type LicenceRejection = (typeof LICENCE_REJECTIONS)[number];

export type LicenceState =
  /** Vigente y sin avisos. */
  | "valid"
  /** Vigente, pero se acaba pronto. */
  | "expiring"
  /** Vencida y dentro de la ventana de gracia: sigue operando con avisos. */
  | "grace"
  /** Fuera de toda ventana. */
  | "invalid";

export interface LicenceStatus {
  readonly state: LicenceState;
  readonly rejection: LicenceRejection | null;
  /** Días hasta `notAfter`; negativo si ya venció. */
  readonly daysToExpiry: number;
  /** Días que quedan de gracia; 0 fuera de ella. */
  readonly graceDaysLeft: number;
  /** Texto accionable para el log y la pantalla de administración. */
  readonly message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function days(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS);
}

/**
 * Comprobaciones que no dependen de la firma: forma, versión, ventana temporal
 * y correspondencia con el despliegue. La firma se verifica ANTES, en la API;
 * esta función asume que ya se validó y por eso nunca devuelve `bad_signature`.
 */
export function evaluateLicence(
  payload: LicencePayload | null,
  context: { tenantId: string; deploymentModel: DeploymentModel },
  now: Date = new Date(),
): LicenceStatus {
  const t = now.getTime();

  if (!payload) {
    return reject(
      "malformed",
      "Este despliegue no tiene licencia instalada. Sin licencia no se conceden productos.",
    );
  }
  if (payload.version !== LICENCE_FORMAT_VERSION) {
    return reject(
      "unsupported_version",
      `La licencia usa el formato ${payload.version} y esta versión entiende el ${LICENCE_FORMAT_VERSION}. Actualiza el software o pide una licencia reemitida.`,
    );
  }
  if (payload.deploymentModel !== context.deploymentModel) {
    return reject(
      "wrong_deployment_model",
      `La licencia se emitió para ${payload.deploymentModel} y este despliegue es ${context.deploymentModel}.`,
    );
  }
  if (payload.tenantId !== context.tenantId) {
    return reject(
      "tenant_mismatch",
      "La licencia se emitió para otra organización.",
    );
  }
  if (payload.offers.length === 0) {
    return reject(
      "no_offers",
      "La licencia no incluye ningún producto: no hay nada que conceder.",
    );
  }

  const notBefore = new Date(payload.notBefore).getTime();
  const notAfter = new Date(payload.notAfter).getTime();
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter)) {
    return reject("malformed", "Las fechas de la licencia no son válidas.");
  }
  if (t < notBefore) {
    return reject(
      "not_yet_valid",
      `La licencia empieza a regir el ${payload.notBefore}.`,
    );
  }

  const daysToExpiry = days(t, notAfter);
  const grace = Math.min(
    Math.max(0, Math.trunc(payload.graceDays)),
    LICENCE_MAX_GRACE_DAYS,
  );
  const graceEnds = notAfter + grace * DAY_MS;

  if (t > graceEnds) {
    return {
      state: "invalid",
      rejection: "expired",
      daysToExpiry,
      graceDaysLeft: 0,
      message: `La licencia venció el ${payload.notAfter} y su periodo de gracia de ${grace} días también terminó. Los productos dejan de renovarse.`,
    };
  }

  if (t > notAfter) {
    const graceDaysLeft = Math.max(0, days(t, graceEnds));
    return {
      state: "grace",
      rejection: null,
      daysToExpiry,
      graceDaysLeft,
      message: `La licencia venció el ${payload.notAfter}. El sistema sigue operando ${graceDaysLeft} día(s) más por cortesía; renuévala antes de que termine.`,
    };
  }

  if (daysToExpiry <= LICENCE_WARN_DAYS_BEFORE_EXPIRY) {
    return {
      state: "expiring",
      rejection: null,
      daysToExpiry,
      graceDaysLeft: grace,
      message: `La licencia vence en ${daysToExpiry} día(s) (${payload.notAfter}).`,
    };
  }

  return {
    state: "valid",
    rejection: null,
    daysToExpiry,
    graceDaysLeft: grace,
    message: `Licencia vigente hasta ${payload.notAfter}.`,
  };
}

function reject(rejection: LicenceRejection, message: string): LicenceStatus {
  return {
    state: "invalid",
    rejection,
    daysToExpiry: 0,
    graceDaysLeft: 0,
    message,
  };
}

/** ¿El estado permite conceder productos? Gracia SÍ; inválida NO. */
export function licenceGrantsAccess(status: LicenceStatus): boolean {
  return status.state !== "invalid";
}

/* ───────────────── Requisitos para comercializar on-premise ───────────────── */

/**
 * Los cuatro requisitos que el dueño puso como condición para vender
 * `customer_hosted` como disponibilidad general.
 *
 * Esta tabla es descriptiva, NO un interruptor. `DEPLOYMENT_AVAILABILITY` sigue
 * siendo la única autoridad y sigue diciendo `limited`: cambiarla es una
 * decisión comercial que se toma mirando esta lista, no una consecuencia
 * automática de que el código exista.
 */
export const CUSTOMER_HOSTED_PREREQUISITES = [
  {
    id: "signed_licence",
    label: "Licencia firmada verificable sin red",
    met: true,
    evidence: "packages/contracts/src/licence.ts + modules/licensing",
  },
  {
    id: "technical_enforcement",
    label: "Enforcement técnico: sin licencia no hay productos",
    met: true,
    evidence: "LicenceGrantsService materializa los grants desde la licencia",
  },
  {
    id: "update_procedure",
    label: "Procedimiento de actualización y renovación",
    met: true,
    evidence: "docs/runbooks/CUSTOMER_HOSTED_LICENCE.md",
  },
  {
    id: "support_commitment",
    label: "Soporte definido y operable a distancia",
    met: false,
    evidence:
      "El nivel viaja en la licencia, pero no existe guardia, canal ni acuerdo de tiempos de respuesta para un despliegue que no podemos observar.",
  },
] as const;

/** ¿Se cumplen los cuatro requisitos? Informativo para la decisión del dueño. */
export function customerHostedReady(): boolean {
  return CUSTOMER_HOSTED_PREREQUISITES.every((r) => r.met);
}
