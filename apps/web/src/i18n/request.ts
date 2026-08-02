import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";
import { messagesByLocale } from "../../messages";
import { applyBrandToMessages } from "../config/brand";

/**
 * Configuración por petición de next-intl (patrón del origen). Resuelve el
 * idioma desde la cookie (server-side, SSR-safe) y entrega los catálogos del
 * idioma correspondiente con las fichas de marca ya sustituidas.
 */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();

  return {
    locale,
    messages: applyBrandToMessages(messagesByLocale[locale]),
    timeZone: "UTC",
    onError() {
      // Intencionalmente vacío: no registramos MISSING_MESSAGE en consola.
    },
    getMessageFallback({ key }) {
      const segments = key.split(".");
      return segments[segments.length - 1] ?? key;
    },
  };
});
