import { BRAND } from "@/config/brand";

const configuredUrl = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const configuredEmail = (value: string): string | undefined => {
  const email = value.trim();
  if (!email || email.toLowerCase().endsWith(".invalid")) return undefined;
  return email;
};

/**
 * Enlaces configurables de la superficie pública. Cada fallback local tiene
 * una página real; un despliegue puede sustituirlo por su recurso externo.
 */
export const COMMERCIAL_LINKS = {
  sales: configuredUrl(
    process.env.NEXT_PUBLIC_SALES_URL,
    "/contact?topic=demo",
  ),
  documentation: configuredUrl(
    process.env.NEXT_PUBLIC_DOCUMENTATION_URL,
    "/docs",
  ),
  // La página de precios lee el catálogo REAL del producto; el enlace existe
  // para que la superficie pública pueda llevar a ella sin escribir la ruta a
  // mano en cada plantilla.
  pricing: configuredUrl(process.env.NEXT_PUBLIC_PRICING_URL, "/precios"),
  support: configuredUrl(process.env.NEXT_PUBLIC_SUPPORT_URL, "/support"),
  status: configuredUrl(process.env.NEXT_PUBLIC_STATUS_URL, "/status"),
  contact: configuredUrl(process.env.NEXT_PUBLIC_CONTACT_URL, "/contact"),
  privacy: configuredUrl(process.env.NEXT_PUBLIC_PRIVACY_URL, "/privacy"),
  terms: configuredUrl(process.env.NEXT_PUBLIC_TERMS_URL, "/terms"),
  licenses: configuredUrl(process.env.NEXT_PUBLIC_LICENSES_URL, "/licenses"),
} as const;

/**
 * Los correos `.invalid` del manifiesto de desarrollo nunca se presentan como
 * canales reales. Producción los configura mediante NEXT_PUBLIC_BRAND_*.
 */
export const COMMERCIAL_CONTACTS = {
  sales: configuredEmail(BRAND.salesEmail),
  support: configuredEmail(BRAND.supportEmail),
  privacy: configuredEmail(BRAND.privacyEmail),
} as const;
