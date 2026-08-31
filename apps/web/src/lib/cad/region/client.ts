import { LEGACY_LOCALE_COOKIE, LOCALE_COOKIE } from "@/i18n/config";
import { getRegionProfile } from "./profiles";
import { regionFromLanguageTags } from "./resolve";
import type { RegionProfile } from "./types";

/** Lee una cookie legible desde `document.cookie` (no HttpOnly). */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Región resuelta en un Client Component. Misma cookie que el lado servidor
 * (`valle_locale` / `axos_locale`, identificadores congelados — no se lee
 * ninguna cookie nueva) y, a falta de preferencia guardada,
 * `navigator.languages` en vez de la cabecera `Accept-Language` — el navegador
 * no la expone a JavaScript, pero `navigator.languages` es la misma señal
 * ordenada por preferencia.
 *
 * SSR-safe: sin `document`/`navigator` (render de servidor, entorno de test)
 * devuelve el perfil por defecto en vez de fallar.
 */
export function getClientRegion(): RegionProfile {
  const savedLocale = readCookie(LOCALE_COOKIE) ?? readCookie(LEGACY_LOCALE_COOKIE);
  // Misma regla que el lado servidor (resolveRegionCode): "es" guardado
  // resuelve siempre a México, sin mirar el navegador.
  if (savedLocale === "es") return getRegionProfile("MX");
  const languages =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return getRegionProfile(regionFromLanguageTags(languages));
}
