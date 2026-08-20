/**
 * Piezas puras del intérprete de lenguaje natural: unidades, números, puntos y
 * los guardas de ambigüedad.
 *
 * POR QUÉ ESTÁN AQUÍ Y NO EN `parser.ts`. El presupuesto de monolito congela
 * `parser.ts` en el tamaño que tenía —sólo puede encoger— y el banco de calidad
 * NL→CAD (`../nl-quality/`) obligó a añadir comprensión de unidades y tres
 * guardas de fallo cerrado. La respuesta correcta a «el archivo creció» no es
 * subirle el presupuesto: es sacar lo que se puede razonar por separado. Todo lo
 * de este módulo son FUNCIONES PURAS sobre la cadena que tecleó el usuario, sin
 * una sola referencia al plano ni al registro de comandos, así que se prueban y
 * se leen solas.
 */
import { parseCoordinate, type Point } from "../precision-input";
import type { CadParseResult } from "./types";

/**
 * Unidades que se dictan en un despacho mexicano, con las formas largas
 * primero.
 *
 * EL ORDEN NO ES COSMÉTICO: la alternancia de JavaScript gana con la primera
 * que encaje, así que `metros` tiene que ir antes que `m` o «3 metros» se leería
 * como «3 m» seguido de «etros». Y el `(?![a-záéíóúñ])` del final impide que
 * «3 muros» se lea como «3 metros»: sin él, la `m` de «muros» pasaba por unidad
 * y multiplicaba la cifra por mil.
 */
export const numberWithUnit =
  /(\d+(?:[.,]\d+)?)\s*(mil[ií]metros?|cent[ií]metros?|metros?|mts|mm|cm|m|in|ft)?(?![a-záéíóúñ])/i;

export const numberWithTimeUnit =
  /(\d+(?:[.,]\d+)?)\s*(s|sec|seg|segundos|min|mins|minutos)\b/i;

/**
 * Factor a milímetros de la unidad dictada.
 *
 * POR QUÉ ESTA FUNCIÓN EXISTE. El banco de calidad NL→CAD midió que «espesor de
 * 15 cm» producía un muro de 15 mm: la unidad no estaba en la alternativa, el
 * grupo quedaba vacío y el número se tomaba como milímetros. Diez veces más
 * delgado, sin una advertencia, y con la pantalla enseñando algo verosímil. En
 * México se dicta en centímetros y en metros —«muro de quince», «puerta de
 * noventa», «un claro de tres sesenta»— y tratar todo lo que no diga «m» como
 * milímetros convertía la forma normal de hablar en un error silencioso de un
 * orden de magnitud.
 *
 * PULGADAS Y PIES SIGUEN SIN CONVERTIRSE: estaban en la alternativa desde antes
 * y se cuentan como milímetros. Es deuda conocida y anotada en el banco; se deja
 * declarada en vez de arreglarla a medias, porque el producto es métrico y no
 * hay un solo caso de obra mexicana que las dicte.
 */
export function unitFactorToMm(unit: string | undefined): number {
  const u = unit?.toLocaleLowerCase("es-MX") ?? "";
  if (u === "cm" || u.startsWith("cent")) return 10;
  if (u === "m" || u === "mts" || u.startsWith("met")) return 1000;
  return 1;
}

export function unitValueToMm(
  match: RegExpMatchArray | null,
): number | undefined {
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  return value * unitFactorToMm(match[2]);
}

export function unitValueToSeconds(
  match: RegExpMatchArray | null,
): number | undefined {
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  const unit = match[2]?.toLowerCase() ?? "s";
  return unit.startsWith("min") ? value * 60 : value;
}

const explicitUnitRe =
  /\d+(?:[.,]\d+)?\s*(mil[ií]metros?|cent[ií]metros?|metros?|mts|mm|cm|m)(?![a-záéíóúñ])/gi;

/**
 * Cuántas unidades DISTINTAS declara la frase de forma explícita.
 *
 * Responde a una sola pregunta: ¿se dictó la misma cota dos veces con unidades
 * que no se pueden reconciliar? Los números sin unidad no cuentan —son
 * coordenadas, o milímetros— y por eso el patrón exige la unidad pegada al
 * número.
 */
export function distinctExplicitUnits(text: string): number {
  const factors = new Set<number>();
  for (const match of text.matchAll(explicitUnitRe))
    factors.add(unitFactorToMm(match[1]));
  return factors.size;
}

export function numberNear(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export const lastTwoTargets = (text: string) =>
  text
    .split(/\b(?:entre| y | e | a )\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-2);

export function parseDraftPointPair(
  raw: string,
): { from: Point; to: Point } | { error: string } {
  const tokens =
    raw.match(/@?-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?|<-?\d+(?:\.\d+)?)?/g) ?? [];
  if (tokens.length < 2)
    return { error: "Indica dos puntos, por ejemplo: 0,0 @5000,0" };
  const first = parseCoordinate(tokens[0]!);
  if (!first.ok) return { error: first.error };
  const second = parseCoordinate(tokens[1]!, { last: first.point });
  if (!second.ok) return { error: second.error };
  return { from: first.point, to: second.point };
}

export function labelAfter(raw: string): string | undefined {
  return raw.match(/(?:label|etiqueta|nombre)\s+(.+)$/i)?.[1]?.trim();
}

/**
 * Rechazo TIPADO.
 *
 * El texto es para la persona; el `code` es para el producto. La regla de la
 * casa —fallo cerrado, error tipado y explícito— se cumplía a medias mientras
 * los rechazos del parser fueran sólo prosa: una frase en español no se puede
 * ramificar, ni traducir, ni convertir en una sugerencia de la interfaz, ni
 * contar en una métrica sin comparar cadenas. El banco de calidad NL→CAD midió
 * que el 0 % de los rechazos traía código; por eso existe este helper y por eso
 * ninguna rama nueva debería devolver un `ok: false` a mano.
 */
export function reject(
  code: string,
  clarification: string,
  confidence = 0.6,
): CadParseResult {
  return { ok: false, code, confidence, clarification };
}

/**
 * ¿La orden delega en un criterio que el producto no puede emitir?
 *
 * «Acomódame el plano como se vea mejor» caía en el cajón de sastre de acomodar
 * y movía lo que hubiera seleccionado. El banco lo marcó como fallo grave, y con
 * razón: el usuario no pidió ESO, pidió un juicio estético. Se comprueba antes
 * que ninguna rama porque el problema no es qué verbo se usó, sino que la orden
 * no trae regla con la que ejecutarla.
 */
export function hasSubjectiveCriterion(q: string): boolean {
  return /\bcomo\s+(se\s+ve[ao]|quieras|sea|gustes|te\s+parezca|mejor)\b|\bse\s+ve[ao]\s+(mejor|bien|bonito)\b|\blo\s+que\s+(se\s+vea|creas|gustes)\b/.test(
    q,
  );
}

const ALIGNMENT_MODES: [RegExp, string][] = [
  [/derecha|right/, "right"],
  [/izquierda|left/, "left"],
  [/arriba|top/, "top"],
  [/abajo|bottom/, "bottom"],
  [/medio|middle/, "middle"],
  [/centro|center/, "center"],
];

/**
 * Alineaciones EXPLÍCITAMENTE pedidas en la frase.
 *
 * «Alinea los castillos a la izquierda y a la derecha» escogía la primera de la
 * cascada del parser y ejecutaba, callando la mitad de la orden — fallo grave
 * en el banco. `align_selection` tiene UN `mode`, así que las dos no se pueden
 * cumplir, y cumplir una en silencio deja al usuario creyendo que se hizo lo que
 * pidió. Con cero menciones el default sigue siendo centrar; con dos o más, la
 * orden se rechaza.
 */
export function alignmentModesRequested(q: string): string[] {
  return ALIGNMENT_MODES.filter(([pattern]) => pattern.test(q)).map(
    ([, name]) => name,
  );
}
