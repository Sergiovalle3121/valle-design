/**
 * Punto único de acceso a los catálogos de mensajes por idioma. `request.ts`
 * de next-intl selecciona aquí el catálogo según la cookie de idioma.
 *
 * Design sólo trae los namespaces que su UI usa hoy:
 *
 *   · `language` — el switch EN/ES del dock del estudio.
 *   · `offline`  — la pantalla `/sin-conexion`, primera superficie del producto
 *                  traducida POR CLAVES en vez de por literales.
 *   · `appUpdate` — el aviso de versión nueva del service worker
 *                  (`src/app/(sw)/ServiceWorkerRegistrar.tsx`), la segunda.
 *
 * Las dos últimas siguen el mismo patrón, que es el que hay que seguir de aquí
 * en adelante: el `.tsx` no escribe ni una frase y `src/i18n/key-driven-copy.spec.ts`
 * —una fila por superficie— exige que los dos catálogos tengan el mismo juego de
 * claves, los mismos marcadores ICU, ninguna clave muerta y ningún namespace sin
 * vigilar.
 *
 * Los textos del editor CAD siguen viviendo inline en los componentes (patrón
 * del origen: literales EN/ES elegidos con useLocale); migrarlos es trabajo
 * pendiente, no una decisión de diseño.
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
