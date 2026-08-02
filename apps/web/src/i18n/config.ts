/**
 * Configuración central de i18n para AXOS OS.
 *
 * Estrategia: next-intl SIN routing por segmento `[locale]`. La app tiene ~113
 * rutas ya consolidadas bajo `/dashboard/*`; reescribirlas a `/[locale]/...`
 * sería invasivo y arriesgado. En su lugar el idioma vive en una COOKIE legible
 * por el servidor (SSR-safe, a diferencia de localStorage) y next-intl resuelve
 * los mensajes por petición desde `request.ts`.
 *
 * Default = inglés. El usuario puede cambiar a español con el switch EN/ES.
 */

/** Idiomas soportados. El primero es el default. */
export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

/** Idioma por defecto de la app (requisito: inglés por defecto). */
export const defaultLocale: Locale = "en";

/**
 * Nombre de la cookie de preferencia de idioma. Sigue el patrón `axos_*` del
 * resto de preferencias (axos_theme, axos_workspace). NO usamos localStorage
 * porque el servidor necesita leer el idioma para renderizar sin parpadeo.
 */
export const LOCALE_COOKIE = "axos_locale";

/** Etiquetas visibles del switch (nativas, no se traducen). */
export const localeLabels: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** Etiqueta corta para el toggle compacto. */
export const localeShortLabels: Record<Locale, string> = {
  en: "EN",
  es: "ES",
};

/** Locale BCP-47 para los formateadores Intl (fechas, números, moneda). */
export const localeIntlTag: Record<Locale, string> = {
  en: "en-US",
  es: "es-MX",
};

/** Type guard: ¿es un valor de cookie/param un locale soportado? */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
