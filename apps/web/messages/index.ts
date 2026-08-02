/**
 * Punto único de acceso a los catálogos de mensajes por idioma. `request.ts`
 * de next-intl selecciona aquí el catálogo según la cookie de idioma.
 *
 * Design sólo trae los namespaces que su UI usa hoy: `language` (switch EN/ES
 * del workspace CAD). Los textos del editor CAD viven inline en los
 * componentes (patrón del origen: literales EN/ES elegidos con useLocale).
 */
import type { Locale } from "../src/i18n/config";
import en from "./en";
import es from "./es";

/** El catálogo en inglés define la forma canónica de las claves. */
export type Messages = typeof en;

export const messagesByLocale: Record<Locale, Messages> = {
  en,
  es: es as Messages,
};
