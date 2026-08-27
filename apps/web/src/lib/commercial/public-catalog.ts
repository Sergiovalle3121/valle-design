/**
 * CATÁLOGO PÚBLICO — el único origen de los precios que ve un visitante.
 *
 * `GET /v1/commercial/public/plans` es una ruta SIN sesión: la página de
 * precios es la puerta de entrada del embudo y no puede pedir cuenta para
 * decir cuánto cuesta el producto. Por eso este módulo NO usa el cliente
 * autenticado del SDK (que manda cookies y CSRF en cada llamada) sino un
 * `fetch` desnudo contra el mismo origen configurado: sin credenciales la
 * respuesta es cacheable e idéntica para todo el mundo, que es justo lo que el
 * contrato promete de ella.
 *
 * Y valida lo que recibe. Un catálogo a medias no se pinta a medias: si el
 * cuerpo no encaja con el contrato, la página muestra un error honesto. La
 * alternativa —renderizar lo que llegue— es cómo una web acaba publicando
 * `undefined` donde iba un precio, o peor, un importe de otra moneda.
 */
import { API_BASE } from "@/lib/apiFetch";
import type { PlanPrice, PublicCatalog, PublicPlan } from "./pricing";

/** Moneda del catálogo mexicano. Filtrar evita mezclar divisas en la página. */
export const CATALOG_CURRENCY = "MXN";

/** Ruta canónica del contrato; el SDK aún no expone esta operación pública. */
export const PUBLIC_PLANS_PATH = "/v1/commercial/public/plans";

/** Cuerpo que no encaja con el contrato: se rechaza entero, no a trozos. */
export class CatalogContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogContractError";
  }
}

/** Error HTTP del catálogo, con el estado para poder decirlo en pantalla. */
export class CatalogHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`El catálogo público respondió ${status}.`);
    this.name = "CatalogHttpError";
    this.status = status;
  }
}

export type CatalogFailure =
  | { kind: "network" }
  | { kind: "http"; status: number }
  | { kind: "contract"; detail: string };

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: PublicCatalog }
  | { status: "unavailable"; failure: CatalogFailure };

/**
 * Texto para el visitante. Dice lo que pasó y lo que puede hacer; jamás
 * sustituye el catálogo por precios de ejemplo.
 */
export function catalogFailureMessage(failure: CatalogFailure): string {
  switch (failure.kind) {
    case "network":
      return "No pudimos contactar con el servicio para leer los precios. Vuelve a intentarlo en unos segundos.";
    case "http":
      return `El servicio de precios respondió con un error (${failure.status}). No mostramos importes que no vengan de él.`;
    case "contract":
      return "El servicio devolvió un catálogo que no podemos publicar sin riesgo de equivocarnos. Preferimos no enseñar precios antes que enseñar unos incorrectos.";
  }
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CatalogContractError(`${where} no es un objeto.`);
  }
  return value as Record<string, unknown>;
}

function readInteger(value: unknown, where: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new CatalogContractError(`${where} no es un entero seguro.`);
  }
  return value as number;
}

function readString(value: unknown, where: string): string {
  if (typeof value !== "string" || !value) {
    throw new CatalogContractError(`${where} no es una cadena no vacía.`);
  }
  return value;
}

function readBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") {
    throw new CatalogContractError(`${where} no es un booleano.`);
  }
  return value;
}

function parsePlan(raw: unknown, index: number): PublicPlan {
  const where = `items[${index}]`;
  const plan = asRecord(raw, where);
  const kind = plan.kind;
  if (kind !== "trial" && kind !== "paid") {
    throw new CatalogContractError(
      `${where}.kind desconocido: ${String(kind)}`,
    );
  }
  if (!Array.isArray(plan.prices)) {
    throw new CatalogContractError(`${where}.prices no es una lista.`);
  }
  const prices = plan.prices.map((rawPrice, priceIndex): PlanPrice => {
    const at = `${where}.prices[${priceIndex}]`;
    const price = asRecord(rawPrice, at);
    const period = price.period;
    if (period !== "monthly" && period !== "yearly") {
      throw new CatalogContractError(
        `${at}.period desconocido: ${String(period)}`,
      );
    }
    const currency = readString(price.currency, `${at}.currency`);
    if (!/^[A-Z]{3}$/u.test(currency)) {
      throw new CatalogContractError(
        `${at}.currency no es ISO-4217: ${currency}`,
      );
    }
    return {
      currency,
      period,
      amountCents: readInteger(price.amountCents, `${at}.amountCents`),
    };
  });
  return {
    code: readString(plan.code, `${where}.code`),
    name: readString(plan.name, `${where}.name`),
    kind,
    perSeat: readBoolean(plan.perSeat, `${where}.perSeat`),
    seatsMinimum: readInteger(plan.seatsMinimum, `${where}.seatsMinimum`),
    taxIncluded: readBoolean(plan.taxIncluded, `${where}.taxIncluded`),
    prices,
  };
}

/**
 * Valida el cuerpo del catálogo público.
 *
 * `checkout` se comprueba primero y contra la lista CERRADA del contrato: de
 * ese campo depende que la página ofrezca un botón de compra, así que un valor
 * inesperado no puede degradar a "supongo que sí se puede cobrar".
 */
export function parsePublicCatalog(payload: unknown): PublicCatalog {
  const body = asRecord(payload, "el cuerpo del catálogo");
  const checkout = body.checkout;
  if (checkout !== "external" && checkout !== "hosted") {
    throw new CatalogContractError(
      `checkout desconocido: ${String(checkout)}. Sin saber si el despliegue puede cobrar, no se ofrece comprar.`,
    );
  }
  if (!Array.isArray(body.items)) {
    throw new CatalogContractError("items no es una lista.");
  }
  // La duración de la oferta la publica el backend (`TRIAL_DAYS`). Se valida
  // con el mismo rigor que un precio y por la misma razón: «3 meses gratis» es
  // una promesa comercial, y una que el producto no pueda cumplir es peor que
  // no anunciar nada. Fuera del rango que el backend acepta, se rechaza el
  // catálogo entero en vez de publicar una oferta inventada.
  const trialDays = readInteger(body.trialDays, "trialDays");
  if (trialDays < 1 || trialDays > 90) {
    throw new CatalogContractError(
      `trialDays fuera del rango que el producto concede: ${trialDays}`,
    );
  }
  return { checkout, items: body.items.map(parsePlan), trialDays };
}

/**
 * Lee el catálogo publicado. `credentials: "omit"` es deliberado: mandar
 * cookies a una ruta pública sólo conseguiría que ninguna capa intermedia
 * pudiera cachear la respuesta.
 */
export async function fetchPublicCatalog(options?: {
  currency?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<PublicCatalog> {
  const currency = options?.currency ?? CATALOG_CURRENCY;
  const url = `${API_BASE}${PUBLIC_PLANS_PATH}?currency=${encodeURIComponent(currency)}`;
  const response = await (options?.fetchImpl ?? fetch)(url, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: options?.signal,
  });
  if (!response.ok) {
    throw new CatalogHttpError(response.status);
  }
  return parsePublicCatalog(await response.json());
}

/** Clasifica cualquier fallo de lectura en uno de los estados publicables. */
export function classifyCatalogFailure(error: unknown): CatalogFailure {
  if (error instanceof CatalogHttpError) {
    return { kind: "http", status: error.status };
  }
  if (error instanceof CatalogContractError) {
    return { kind: "contract", detail: error.message };
  }
  return { kind: "network" };
}
