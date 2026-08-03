/**
 * MANIFIESTO DE MARCA — fuente única de verdad de la identidad comercial.
 *
 * Regla de oro: NINGUNA superficie visible al cliente (web, correo, PDF,
 * metadata, exports) puede hardcodear el nombre comercial. Todas leen de aquí.
 * Así un rebranding (o el resultado de la revisión ante el IMPI) se aplica
 * cambiando UNA configuración, no cientos de componentes.
 *
 * Separación deliberada:
 *   • Los CÓDIGOS INTERNOS (`productCode`, columnas de BD y eventos) son
 *     neutrales y NO contienen la marca —
 *     ver `product-catalog.ts`. Sobreviven a cualquier cambio de nombre.
 *   • Los NOMBRES VISIBLES viven aquí y son provisionales hasta que exista
 *     registro marcario.
 *
 * Estado marcario: la marca NO está registrada. Por eso el símbolo por defecto
 * es CADENA VACÍA. `®` sólo es representable con `trademarkStatus:"registered"`
 * y el resolvedor lo RECHAZA en cualquier otro estado (afirmar un registro
 * inexistente es una declaración falsa, no un detalle tipográfico).
 */

import { PRODUCT_CODES, type ProductCode } from "./product-catalog";

/** Estado del expediente marcario. Sólo `registered` habilita `®`. */
export const TRADEMARK_STATUSES = [
  "unregistered",
  "filed",
  "registered",
] as const;

export type TrademarkStatus = (typeof TRADEMARK_STATUSES)[number];

/** Símbolo permitido junto al nombre de marca. */
export const TRADEMARK_SYMBOLS = ["", "™", "®"] as const;

export type TrademarkSymbol = (typeof TRADEMARK_SYMBOLS)[number];

export interface BrandLogoAssets {
  /** Marca gráfica principal (ruta pública servida por la web). */
  readonly mark: string;
  /** Icono de aplicación / favicon. */
  readonly icon: string;
  /** Icono para superficies oscuras, si difiere. */
  readonly iconDark: string;
}

export interface BrandManifest {
  /** Marca matriz visible. Provisional hasta resolución del IMPI. */
  readonly brandName: string;
  /** Razón social bajo la que se contrata. Provisional y configurable. */
  readonly legalEntityName: string;
  /** Propietario/fundador de la compañía. */
  readonly founderName: string;
  /** Descriptor de categoría que acompaña a la marca. */
  readonly descriptor: string;
  /** Nombre visible de cada producto, por código interno estable. */
  readonly productNames: Readonly<Record<ProductCode, string>>;
  /** Promesa comercial en los dos idiomas soportados. */
  readonly tagline: Readonly<Record<"en" | "es", string>>;
  readonly supportEmail: string;
  readonly salesEmail: string;
  readonly privacyEmail: string;
  readonly websiteUrl: string;
  /** Línea de copyright ya formada (incluye año y razón social). */
  readonly copyright: string;
  readonly logoAssets: BrandLogoAssets;
  readonly trademarkStatus: TrademarkStatus;
  /**
   * Símbolo autorizado por revisión legal. Vacío mientras no haya registro;
   * `™` sólo si el owner lo habilita explícitamente.
   */
  readonly trademarkSymbol: TrademarkSymbol;
}

/**
 * Nombres visibles PROVISIONALES por producto. La clave es el código interno
 * (neutral, estable); el valor es marca (cambiable). Ese contrato es lo que
 * permite renombrar sin tocar base de datos ni APIs.
 */
const DEFAULT_PRODUCT_NAMES: Record<ProductCode, string> = {
  design: "VALLE Design",
};

/** Año base del copyright; el resolvedor lo puede sobrescribir por entorno. */
const DEFAULT_COPYRIGHT_YEAR = 2026;

export const DEFAULT_BRAND_MANIFEST: BrandManifest = {
  brandName: "VALLE",
  legalEntityName: "Sergio Valle Enterprise Software",
  founderName: "Sergio Valle",
  descriptor: "Enterprise Software",
  productNames: DEFAULT_PRODUCT_NAMES,
  tagline: {
    en: "Enterprise software you can buy one product at a time.",
    es: "Software empresarial que puedes contratar un producto a la vez.",
  },
  supportEmail: "support@example.invalid",
  salesEmail: "sales@example.invalid",
  privacyEmail: "privacy@example.invalid",
  websiteUrl: "https://example.invalid",
  copyright: `© ${DEFAULT_COPYRIGHT_YEAR} Sergio Valle Enterprise Software`,
  logoAssets: {
    mark: "/icon.svg",
    icon: "/icon.svg",
    iconDark: "/icon.svg",
  },
  trademarkStatus: "unregistered",
  trademarkSymbol: "",
};

/** Fuente de variables de entorno (proceso, `.env`, config de despliegue). */
export type BrandEnv = Readonly<Record<string, string | undefined>>;

function str(env: BrandEnv, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isTrademarkStatus(value: unknown): value is TrademarkStatus {
  return (
    typeof value === "string" &&
    (TRADEMARK_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normaliza el símbolo marcario contra el estado del expediente.
 *
 * Reglas (no negociables mientras no exista registro):
 *   • `®` SOLO con `trademarkStatus === "registered"`. En cualquier otro
 *     estado se degrada a vacío — nunca se afirma un registro inexistente.
 *   • `™` requiere autorización explícita (`BRAND_TRADEMARK_SYMBOL=tm`), que
 *     representa el visto bueno de la revisión legal.
 *   • Default: sin símbolo.
 */
export function resolveTrademarkSymbol(
  requested: string | null,
  status: TrademarkStatus,
): TrademarkSymbol {
  const normalized = (requested ?? "").trim().toLowerCase();
  if (normalized === "r" || normalized === "®" || normalized === "registered") {
    return status === "registered" ? "®" : "";
  }
  if (normalized === "tm" || normalized === "™") return "™";
  return "";
}

/**
 * Resuelve el manifiesto para un entorno. Puro: mismo `env` ⇒ mismo resultado.
 * Todos los defaults son SEGUROS (dominios `.invalid`, sin símbolo marcario),
 * de modo que un despliegue mal configurado nunca publica datos inventados
 * como si fueran reales.
 */
export function resolveBrandManifest(env: BrandEnv = {}): BrandManifest {
  const base = DEFAULT_BRAND_MANIFEST;

  const statusRaw = str(env, "BRAND_TRADEMARK_STATUS");
  const trademarkStatus: TrademarkStatus = isTrademarkStatus(statusRaw)
    ? statusRaw
    : base.trademarkStatus;

  const brandName = str(env, "BRAND_NAME") ?? base.brandName;
  const legalEntityName =
    str(env, "BRAND_LEGAL_ENTITY") ?? base.legalEntityName;
  const copyrightYear =
    str(env, "BRAND_COPYRIGHT_YEAR") ?? String(DEFAULT_COPYRIGHT_YEAR);

  const productNames = { ...base.productNames } as Record<ProductCode, string>;
  for (const code of PRODUCT_CODES) {
    const override = str(env, `BRAND_PRODUCT_NAME_${envKeyFor(code)}`);
    if (override) productNames[code] = override;
  }

  return {
    brandName,
    legalEntityName,
    founderName: str(env, "BRAND_FOUNDER") ?? base.founderName,
    descriptor: str(env, "BRAND_DESCRIPTOR") ?? base.descriptor,
    productNames,
    tagline: {
      en: str(env, "BRAND_TAGLINE_EN") ?? base.tagline.en,
      es: str(env, "BRAND_TAGLINE_ES") ?? base.tagline.es,
    },
    supportEmail: str(env, "BRAND_SUPPORT_EMAIL") ?? base.supportEmail,
    salesEmail: str(env, "BRAND_SALES_EMAIL") ?? base.salesEmail,
    privacyEmail: str(env, "BRAND_PRIVACY_EMAIL") ?? base.privacyEmail,
    websiteUrl: (str(env, "BRAND_WEBSITE_URL") ?? base.websiteUrl).replace(
      /\/+$/,
      "",
    ),
    copyright:
      str(env, "BRAND_COPYRIGHT") ?? `© ${copyrightYear} ${legalEntityName}`,
    logoAssets: {
      mark: str(env, "BRAND_LOGO_MARK") ?? base.logoAssets.mark,
      icon: str(env, "BRAND_LOGO_ICON") ?? base.logoAssets.icon,
      iconDark: str(env, "BRAND_LOGO_ICON_DARK") ?? base.logoAssets.iconDark,
    },
    trademarkStatus,
    trademarkSymbol: resolveTrademarkSymbol(
      str(env, "BRAND_TRADEMARK_SYMBOL"),
      trademarkStatus,
    ),
  };
}

/** `design` → `DESIGN` (clave de entorno por producto). */
function envKeyFor(code: ProductCode): string {
  return code.replace(/-/g, "_").toUpperCase();
}

/** Nombre de marca con el símbolo autorizado (vacío mientras no haya registro). */
export function brandNameWithSymbol(manifest: BrandManifest): string {
  return `${manifest.brandName}${manifest.trademarkSymbol}`;
}

/** Nombre visible de un producto. Nunca devuelve el código interno crudo. */
export function productDisplayName(
  manifest: BrandManifest,
  code: ProductCode,
): string {
  return manifest.productNames[code] ?? manifest.brandName;
}

/**
 * Aviso de marcas de terceros. Se publica donde se mencionan formatos o
 * conectores nominativos: reconoce a sus titulares y niega afiliación.
 */
export function thirdPartyTrademarkNotice(
  manifest: BrandManifest,
  locale: "en" | "es",
): string {
  return locale === "es"
    ? `Las marcas, nombres de producto y logotipos de terceros mencionados pertenecen a sus respectivos titulares. Su mención describe interoperabilidad o compatibilidad de formato y no implica afiliación, patrocinio ni respaldo por parte de ${manifest.legalEntityName}.`
    : `Third-party trademarks, product names and logos mentioned here belong to their respective owners. They are referenced to describe interoperability or file-format compatibility and do not imply affiliation, sponsorship or endorsement by ${manifest.legalEntityName}.`;
}
