/**
 * DATOS FISCALES — lo que un arquitecto mexicano necesita para deducir.
 *
 * Este módulo es la mitad de navegador de la captura del CFDI 4.0. Sus reglas
 * son un ESPEJO de las del servidor, nunca su sustituto: la API valida otra vez
 * y es la que manda. Existe por una razón concreta de producto — que el cliente
 * no descubra un error de captura después de tres pantallas y un redirect a la
 * pasarela — y por otra de honestidad: el desplegable de usos de CFDI debe
 * mostrar sólo los que su régimen admite, porque ofrecerle uno que el SAT
 * rechazará es prepararle una factura inválida con su propio consentimiento.
 *
 * Lo que este módulo NO hace, y la interfaz debe decir: no consulta al SAT. Un
 * RFC bien formado puede no existir. Se valida la FORMA, que es lo que la
 * captura estropea.
 */
import type { components } from "@valle/design-sdk";

type Schemas = components["schemas"];

export type TaxPersonType = Schemas["TaxPersonType"];
export type SatTaxRegime = Schemas["SatTaxRegime"];
export type SatCfdiUse = Schemas["SatCfdiUse"];
export type SatTaxCatalogs = Schemas["SatTaxCatalogs"];
export type TaxProfileView = Schemas["TaxProfileView"];
export type TaxProfileSave = Schemas["TaxProfileSave"];
export type TaxProfileResponse = Schemas["TaxProfileResponse"];
export type CfdiIssuance = Schemas["CfdiIssuance"];

export type FiscalField = keyof TaxProfileSave;

/** Etiquetas del formulario, en el vocabulario de la Constancia del SAT. */
export const FISCAL_LABELS: Record<FiscalField, string> = {
  rfc: "RFC",
  legalName: "Razón social o nombre completo",
  taxRegimeCode: "Régimen fiscal",
  cfdiUseCode: "Uso del CFDI",
  postalCode: "Código postal del domicilio fiscal",
};

/**
 * Ayuda por campo. Cada una responde a «¿de dónde saco esto?», que es la
 * pregunta real de alguien que tiene la Constancia abierta en otra pestaña.
 */
export const FISCAL_HINTS: Record<FiscalField, string> = {
  rfc: "13 caracteres si eres persona física, 12 si eres persona moral. Con homoclave.",
  legalName:
    "Tal y como aparece en tu Constancia de Situación Fiscal. No hace falta el régimen de capital (S.A. de C.V.).",
  taxRegimeCode: "El que aparece en tu Constancia de Situación Fiscal.",
  cfdiUseCode:
    "Para una suscripción de software lo habitual es «Gastos en general».",
  postalCode: "Los cinco dígitos del domicilio fiscal, no los de tu obra.",
};

const RFC_SEPARATORS = /[\s-]+/g;

/** Normaliza como lo escribe la gente: `vecj-880326-xx4` es un RFC válido. */
export function normalizeRfcInput(raw: string): string {
  return raw.replace(RFC_SEPARATORS, "").toUpperCase();
}

/**
 * Tipo de persona DEDUCIDO de la longitud del RFC, o `null` mientras se
 * escribe. Es lo que decide qué regímenes tiene sentido ofrecer, así que
 * mientras no haya un RFC completo el formulario no filtra nada: esconder
 * opciones a alguien que aún no ha terminado de teclear es peor que enseñarlas
 * todas.
 */
export function personTypeOf(rfc: string): TaxPersonType | null {
  const normalized = normalizeRfcInput(rfc);
  if (normalized.length === 13) return "fisica";
  if (normalized.length === 12) return "moral";
  return null;
}

export function personTypeLabel(personType: TaxPersonType): string {
  return personType === "fisica" ? "Persona física" : "Persona moral";
}

/** Regímenes que el SAT permite a ese tipo de persona. */
export function regimesFor(
  catalogs: SatTaxCatalogs,
  personType: TaxPersonType | null,
): SatTaxRegime[] {
  if (!personType) return [...catalogs.taxRegimes];
  return catalogs.taxRegimes.filter((regime) =>
    regime.personTypes.includes(personType),
  );
}

/**
 * Usos de CFDI que ese régimen admite como receptor.
 *
 * Sin régimen elegido no se ofrece ninguno: elegir un uso antes que el régimen
 * es elegir a ciegas, y la combinación equivocada la descubre el PAC al
 * timbrar, cuando el cobro ya ocurrió.
 */
export function cfdiUsesFor(
  catalogs: SatTaxCatalogs,
  taxRegimeCode: string,
): SatCfdiUse[] {
  if (!taxRegimeCode) return [];
  return catalogs.cfdiUses.filter((use) =>
    use.taxRegimeCodes.includes(taxRegimeCode),
  );
}

/**
 * Si el uso elegido deja de ser legal al cambiar el régimen, se OLVIDA.
 *
 * Conservarlo dejaría el formulario en un estado que el servidor va a
 * rechazar, y con un desplegable que ya no muestra el valor seleccionado: el
 * cliente vería un campo aparentemente relleno y un error que no sabe atribuir.
 */
export function keepCompatibleCfdiUse(
  catalogs: SatTaxCatalogs,
  taxRegimeCode: string,
  cfdiUseCode: string,
): string {
  const allowed = cfdiUsesFor(catalogs, taxRegimeCode);
  return allowed.some((use) => use.code === cfdiUseCode) ? cfdiUseCode : "";
}

/**
 * Comprobación LOCAL antes de enviar. Deliberadamente más laxa que la del
 * servidor: aquí sólo se atajan los errores obvios para no gastar un viaje de
 * red, y la validación de verdad —catálogos, coherencia régimen/uso, forma
 * completa del RFC— vive en la API, que es quien puede garantizarla.
 */
export function localFiscalIssues(
  input: TaxProfileSave,
): Partial<Record<FiscalField, string>> {
  const issues: Partial<Record<FiscalField, string>> = {};
  const rfc = normalizeRfcInput(input.rfc ?? "");
  if (rfc.length !== 12 && rfc.length !== 13) {
    issues.rfc =
      "El RFC tiene 13 caracteres (persona física) o 12 (persona moral), con homoclave.";
  }
  if ((input.legalName ?? "").trim().length < 3) {
    issues.legalName =
      "Escribe la razón social o tu nombre completo como en tu Constancia.";
  }
  if (!input.taxRegimeCode) {
    issues.taxRegimeCode = "Elige tu régimen fiscal.";
  }
  if (!input.cfdiUseCode) {
    issues.cfdiUseCode = "Elige el uso del CFDI.";
  }
  if (!/^\d{5}$/u.test((input.postalCode ?? "").trim())) {
    issues.postalCode = "El código postal son cinco dígitos.";
  }
  return issues;
}

interface ApiIssueShape {
  code?: unknown;
  body?: { code?: unknown; issues?: unknown } | null;
}

/**
 * Traduce el 400 `tax_profile_invalid` a errores POR CAMPO.
 *
 * Se lee por forma y no por `instanceof` para no arrastrar el cliente del SDK
 * a un módulo que sólo decide texto. Un error que no traiga `issues` devuelve
 * un mapa vacío: quien llama enseñará el mensaje general en vez de inventarse
 * a qué campo culpar.
 */
export function fiscalIssuesFromError(
  error: unknown,
): Partial<Record<FiscalField, string>> {
  const shaped = (error ?? {}) as ApiIssueShape;
  const issues = shaped.body?.issues;
  if (!Array.isArray(issues)) return {};
  const mapped: Partial<Record<FiscalField, string>> = {};
  for (const entry of issues) {
    if (!entry || typeof entry !== "object") continue;
    const { field, message } = entry as Record<string, unknown>;
    if (typeof field !== "string" || typeof message !== "string") continue;
    if (field in FISCAL_LABELS) {
      mapped[field as FiscalField] = message;
    }
  }
  return mapped;
}

/**
 * QUÉ PROMETE EL PRODUCTO sobre la factura, dicho por el adaptador.
 *
 * Es la frase más delicada de toda la ola. Mientras no haya PAC contratado, la
 * web NO puede decir «te enviamos tu factura automáticamente»: no la envía.
 * Dice lo que hace —guardar y validar los datos para emitir el CFDI— y lo dice
 * sin adornos, porque prometer un comprobante fiscal que no llega es un
 * problema legal del cliente, no una decepción de marketing.
 */
export function issuanceNotice(issuance: CfdiIssuance): string {
  if (issuance.available && issuance.mode === "automatic") {
    return "Tu CFDI se emite automáticamente con estos datos en cuanto se registra el cobro.";
  }
  return (
    "Guardamos y validamos estos datos para emitir tu CFDI. Todavía no timbramos " +
    "automáticamente: la factura la emite nuestro equipo con los datos que capturaste " +
    "y la recibes por correo. Sin ellos no podemos facturarte, y el pago no sería deducible."
  );
}

/** Aviso permanente: forma sí, existencia no. La interfaz no puede mentir. */
export const RFC_VALIDATION_NOTICE =
  "Comprobamos que el RFC tenga la estructura del SAT y que el régimen y el uso del CFDI sean compatibles. No consultamos el padrón del SAT: si el RFC no existe o está cancelado, lo veremos al facturar.";

/** ¿Se puede cobrar ya a esta organización? */
export function isTaxProfileComplete(
  profile: TaxProfileView | null | undefined,
): boolean {
  return !!profile;
}

/** Resumen de una línea para el portal, sin repetir el formulario entero. */
export function taxProfileSummary(profile: TaxProfileView): string {
  return `${profile.rfc} · ${profile.legalName} · Régimen ${profile.taxRegimeCode} · Uso ${profile.cfdiUseCode} · CP ${profile.postalCode}`;
}

/** Valores iniciales del formulario a partir de lo ya capturado. */
export function toFormValues(
  profile: TaxProfileView | null,
): TaxProfileSave {
  return {
    rfc: profile?.rfc ?? "",
    legalName: profile?.legalName ?? "",
    taxRegimeCode: profile?.taxRegimeCode ?? "",
    cfdiUseCode: profile?.cfdiUseCode ?? "",
    postalCode: profile?.postalCode ?? "",
  };
}
