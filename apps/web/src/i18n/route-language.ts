/**
 * Qué rutas participan REALMENTE del selector de idioma EN/ES.
 *
 * `next-intl` está cableado en toda la app desde la campaña de la cinta CAD
 * (`i18n/config.ts`: «Default = inglés»), pero casi ningún componente lo
 * CONSUME: sólo `CadWorkspaceDock` (el estudio, bajo `/studio`) y la página
 * sin conexión (`/sin-conexion`) llaman `useTranslations`/`getTranslations`.
 * El resto del producto —portada, precios, tablero, cuenta, centro de
 * preguntas, alta, panel— es texto en español escrito a mano, sin una sola
 * clave de traducción.
 *
 * T-18d / T-63e: `<html lang>` tiene que declarar el idioma de lo que
 * REALMENTE hay en el DOM. Seguir la cookie de idioma del estudio en una
 * página que nunca la lee produce `<html lang="en">` sobre texto
 * íntegramente en español para cualquier visitante sin esa cookie — que es
 * todo primer visitante, porque el default es inglés.
 *
 * Se enumera la EXCEPCIÓN (lo bilingüe) y no la regla (todo lo demás) a
 * propósito: son dos rutas hoy, y una lista que intentara enumerar «todo lo
 * demás» creciendo con cada página nueva sería la misma deuda que tenía la
 * cinta de comandos antes de generarse del registro real.
 */
const BILINGUAL_ROUTE_PREFIXES = ["/studio"] as const;
const BILINGUAL_ROUTES = ["/sin-conexion"] as const;

export function isBilingualRoute(pathname: string): boolean {
  if ((BILINGUAL_ROUTES as readonly string[]).includes(pathname)) return true;
  return BILINGUAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Cabecera que `middleware.ts` reenvía con la ruta pedida, sin cuerpo ni cookies. */
export const PATHNAME_HEADER = "x-valle-pathname";
