import { DEFAULT_REGION_CODE, REGION_PROFILES } from "./profiles";
import type { RegionCode } from "./types";

/**
 * Resolución de región, pura: sin `document`, sin `next/headers`, sin
 * `Intl` siquiera. Toma las dos señales que existen hoy y devuelve un
 * `RegionCode`, para que se pueda probar por resultado sin arrancar Next.
 *
 * ## Las señales, en orden
 *
 * 1. `savedLocale`: el valor YA LEÍDO de la cookie de idioma del producto
 *    (`valle_locale`, con `axos_locale` como respaldo — `src/i18n/config.ts`,
 *    identificadores congelados). Hoy esa cookie sólo guarda `"es"` o `"en"`
 *    (es idioma de interfaz, no región), así que sólo puede dar una señal
 *    parcial: `"es"` implica región hispanohablante, y en este producto TODA
 *    la convención hispanohablante vista hasta ahora fue `es-MX` — así que
 *    `"es"` resuelve a México y no a España. `"en"` NO resuelve a Estados
 *    Unidos por sí solo: el inglés es el idioma por defecto de la interfaz
 *    (`i18n/config.ts`) y un visitante con esa interfaz no declaró ningún
 *    país. Region.ts no inventa una cookie nueva para esto: lee la que ya
 *    existe, tal como pide la campaña, sin renombrarla ni escribirla.
 * 2. `acceptLanguage`: la cabecera `Accept-Language` del navegador, cuando no
 *    hubo cookie o la cookie no resolvió nada. Sólo cuenta una etiqueta
 *    INEQUÍVOCA (`es-MX`, `es-ES`, `en-US`, con cualquier mayúscula): un
 *    idioma sin país (`es`, `en`) o un país sin perfil (`en-GB`, `fr-FR`) no
 *    cuenta como señal — cae al paso 3 igual que si no hubiera cabecera.
 * 3. México. Nunca Estados Unidos: EE. UU. sólo se elige en el paso 2, con una
 *    etiqueta explícita que lo pida. El "arranque en México, universal para
 *    cualquier país" de IDENTITY.md se traduce aquí en que el silencio — sin
 *    cookie, sin cabecera, o con una cabecera que no dice nada reconocible —
 *    converge siempre en México y no en el mercado más grande.
 */
export function resolveRegionCode(input: {
  savedLocale?: string | null;
  acceptLanguage?: string | null;
}): RegionCode {
  if (input.savedLocale === "es") return "MX";
  return regionFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_REGION_CODE;
}

/**
 * Primer código de región que una etiqueta EXACTA de `Accept-Language`
 * resuelve, en el orden de preferencia del navegador. `undefined` si ninguna
 * etiqueta coincide con un perfil conocido — nunca lanza, nunca adivina.
 */
export function regionFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): RegionCode | undefined {
  if (!acceptLanguage) return undefined;
  for (const tag of parseAcceptLanguageTags(acceptLanguage)) {
    const match = matchRegionTag(tag);
    if (match) return match;
  }
  return undefined;
}

/** `navigator.languages`/`navigator.language` del lado del cliente, mismo criterio. */
export function regionFromLanguageTags(
  tags: readonly string[] | null | undefined,
): RegionCode | undefined {
  if (!tags) return undefined;
  for (const tag of tags) {
    const match = matchRegionTag(tag);
    if (match) return match;
  }
  return undefined;
}

function matchRegionTag(tag: string): RegionCode | undefined {
  const normalized = tag.trim().toLowerCase();
  for (const code of Object.keys(REGION_PROFILES) as RegionCode[]) {
    if (REGION_PROFILES[code].numberLocale.toLowerCase() === normalized) {
      return code;
    }
  }
  return undefined;
}

/**
 * `Accept-Language: es-MX,es;q=0.9,en;q=0.8` → `["es-MX", "es", "en"]`, ya
 * ordenadas por peso `q` (mayor primero) y sin el propio parámetro `q`.
 */
function parseAcceptLanguageTags(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}
