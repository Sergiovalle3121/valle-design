/**
 * MARCA EN LA WEB DE VALLE DESIGN — punto único desde el que las pantallas
 * leen la identidad (adaptado del origen; superficie recortada al producto
 * Design: aquí no hay ERP/MES ni catálogos comerciales).
 *
 * Ninguna página o PDF escribe el nombre comercial a mano: se resuelve el
 * manifiesto compartido (`@axos/contracts` → `brand.ts`) con las variables
 * `NEXT_PUBLIC_BRAND_*` — las únicas visibles en el navegador. Un rebranding
 * es un cambio de configuración, no de componentes.
 */
import {
  brandNameWithSymbol,
  productDisplayName,
  resolveBrandManifest,
  type BrandManifest,
  type ProductCode,
} from "@axos/contracts";

/**
 * Next sólo expone al navegador las variables con prefijo `NEXT_PUBLIC_`. Se
 * traducen a las claves que entiende el resolvedor compartido, de modo que la
 * API y la web resuelvan EL MISMO manifiesto sin duplicar la lógica.
 */
function publicEnv(): Record<string, string | undefined> {
  return {
    BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
    BRAND_LEGAL_ENTITY: process.env.NEXT_PUBLIC_BRAND_LEGAL_ENTITY,
    BRAND_FOUNDER: process.env.NEXT_PUBLIC_BRAND_FOUNDER,
    BRAND_DESCRIPTOR: process.env.NEXT_PUBLIC_BRAND_DESCRIPTOR,
    BRAND_TAGLINE_EN: process.env.NEXT_PUBLIC_BRAND_TAGLINE_EN,
    BRAND_TAGLINE_ES: process.env.NEXT_PUBLIC_BRAND_TAGLINE_ES,
    BRAND_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL,
    BRAND_SALES_EMAIL: process.env.NEXT_PUBLIC_BRAND_SALES_EMAIL,
    BRAND_PRIVACY_EMAIL: process.env.NEXT_PUBLIC_BRAND_PRIVACY_EMAIL,
    BRAND_WEBSITE_URL: process.env.NEXT_PUBLIC_BRAND_WEBSITE_URL,
    BRAND_COPYRIGHT: process.env.NEXT_PUBLIC_BRAND_COPYRIGHT,
    BRAND_COPYRIGHT_YEAR: process.env.NEXT_PUBLIC_BRAND_COPYRIGHT_YEAR,
    BRAND_TRADEMARK_STATUS: process.env.NEXT_PUBLIC_BRAND_TRADEMARK_STATUS,
    BRAND_TRADEMARK_SYMBOL: process.env.NEXT_PUBLIC_BRAND_TRADEMARK_SYMBOL,
    BRAND_LOGO_MARK: process.env.NEXT_PUBLIC_BRAND_LOGO_MARK,
    BRAND_LOGO_ICON: process.env.NEXT_PUBLIC_BRAND_LOGO_ICON,
    BRAND_PRODUCT_NAME_DESIGN:
      process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN,
  };
}

/** Manifiesto resuelto. Misma verdad en SSR y en el navegador. */
export const BRAND: BrandManifest = resolveBrandManifest(publicEnv());

/** Nombre de marca con el símbolo autorizado (vacío mientras no haya registro). */
export const BRAND_NAME_WITH_SYMBOL = brandNameWithSymbol(BRAND);

export function productName(code: ProductCode): string {
  return productDisplayName(BRAND, code);
}

/**
 * Fichas de sustitución que los catálogos i18n pueden usar en su texto
 * (`%BRAND%`, `%PRODUCT_DESIGN%`, …). Se resuelven ANTES de que next-intl
 * parsee el mensaje, así que no interfieren con los marcadores ICU.
 */
export const BRAND_TOKENS: Record<string, string> = {
  "%BRAND%": BRAND.brandName,
  "%BRAND_TM%": BRAND_NAME_WITH_SYMBOL,
  "%LEGAL_ENTITY%": BRAND.legalEntityName,
  "%FOUNDER%": BRAND.founderName,
  "%DESCRIPTOR%": BRAND.descriptor,
  "%SUPPORT_EMAIL%": BRAND.supportEmail,
  "%WEBSITE%": BRAND.websiteUrl,
  "%COPYRIGHT%": BRAND.copyright,
  "%PRODUCT_DESIGN%": BRAND.productNames.design,
};

/** Sustituye las fichas de marca en una cadena. */
export function applyBrandTokens(value: string): string {
  let out = value;
  for (const [token, replacement] of Object.entries(BRAND_TOKENS)) {
    if (out.includes(token)) out = out.split(token).join(replacement);
  }
  return out;
}

/** Aplica las fichas a un catálogo completo de mensajes (recursivo). */
export function applyBrandToMessages<T>(messages: T): T {
  if (typeof messages === "string") {
    return applyBrandTokens(messages) as unknown as T;
  }
  if (Array.isArray(messages)) {
    return messages.map((item) => applyBrandToMessages(item)) as unknown as T;
  }
  if (messages && typeof messages === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      messages as Record<string, unknown>,
    )) {
      out[key] = applyBrandToMessages(value);
    }
    return out as unknown as T;
  }
  return messages;
}

/**
 * Etiquetas de producto listas para usar en JSX. Se conserva la FORMA del
 * origen (`PRODUCT_LABEL.design`) porque el kernel CAD extraído la consume
 * (`src/lib/cad/interop-provider.ts`); en Design sólo tiene sentido `design`.
 */
export const PRODUCT_LABEL = {
  design: BRAND.productNames.design,
} as const;

/** Slug seguro para nombres de archivo exportados (sin espacios ni acentos). */
export const BRAND_FILE_SLUG = BRAND.brandName
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
