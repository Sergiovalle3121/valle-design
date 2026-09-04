/**
 * Catálogo de MEDIDAS NORMALIZADAS de puertas y ventanas (2026-09-04).
 *
 * Medido antes: DOOR y WINDOW sólo sabían de tres números sueltos —`Anchura`,
 * `alTura`, `antePecho`— y cada hueco del plano se tecleaba a mano. Un
 * despacho mexicano no trabaja así: trabaja con una carpintería normalizada
 * («la de 90», «la de baño») y la escribe en el cuadro con su marca. Teclear
 * 900 y 2.100 en cada puerta es, además, la manera fiable de acabar con
 * P-090x210 y P-090x211 en la misma planta y dos filas donde había una pieza.
 *
 * ## Por qué la tabla es CERRADA
 *
 * Por la misma razón que `wall-materials.ts`: una clave que no resuelve no
 * debe poder cruzar la frontera del servidor. Aquí el motivo es todavía más
 * directo que allí, porque de la clave salen MEDIDAS: un `Tipo` inventado que
 * cayera a un default en silencio colocaría un hueco de un tamaño que nadie
 * pidió, y el plano y la tabla de cantidades lo darían por bueno. Un tipo que
 * no está se RECHAZA nombrando los que sí están
 * ({@link cadOpeningTypeRefusal}); nunca se aproxima al más parecido.
 *
 * ## Una sola marca, no dos vocabularios
 *
 * Cada entrada nombra su marca con `openingMark`, que es LA MISMA función con
 * la que `bim-schedule.ts` agrupa el cuadro de carpintería. No hay una tabla
 * de marcas aquí y otra allá: elegir `P-090` del catálogo y teclear 900 × 2.100
 * a mano producen la misma marca y, por tanto, la MISMA fila del cuadro. Por
 * eso tampoco hay campo nuevo en el documento canónico: el hueco sigue
 * persistiendo sus tres medidas y nada más, y la marca se DERIVA de ellas.
 * Guardar la clave habría creado la posibilidad de que un hueco dijera «P-090»
 * midiendo 850.
 *
 * Y por eso mismo el mark de una entrada es aceptado como clave
 * ({@link cadOpeningType} resuelve `P-090` y `P-090x210` a la misma entrada):
 * lo que el cuadro imprime se puede volver a teclear.
 *
 * ## Los milímetros son la verdad; la unidad del documento es la vista
 *
 * Las medidas viven aquí en MILÍMETROS, que es como se piden en obra y como
 * están escritas en el reglamento, y se convierten a la unidad del documento
 * con `cadFromMillimetres` —el mismo camino que `defaultOpeningSize`— justo al
 * colocar. Una P-090 en un plano en metros mide 0,9, no 900.
 *
 * ## Lo que NO trae, dicho aquí
 *
 *  - No hay puertas de dos hojas, corredizas ni abatibles dobles: la anchura
 *    del catálogo es la del HUECO de obra, y una de dos hojas de 1,60 no está.
 *  - No hay ventanales ni cancelería de piso a techo (antepecho 0).
 *  - La marca (`openingMark`) lee sus números como milímetros, así que el
 *    cuadro de carpintería de un documento en metros o en pies imprime hoy
 *    P-000x000. Es un límite VIEJO de `bim-schedule.ts`, anterior a este
 *    catálogo, y sigue en pie: aquí sólo se garantiza que la marca del
 *    catálogo y la de un hueco tecleado a mano coinciden, no que sea legible
 *    en cualquier unidad.
 */
import { openingMark } from "./bim-schedule";
import type { CadOpeningKind } from "./cad-entities-v7";
import { cadFromMillimetres } from "./engine/commands/architecture-support";
import { formatRegionMagnitude } from "./region/format";

/** Claves del catálogo. Cerradas: lo que no está aquí no se coloca. */
export type CadOpeningTypeKey =
  | "P-060"
  | "P-070"
  | "P-080"
  | "P-090"
  | "P-100"
  | "V-060x040"
  | "V-120x120"
  | "V-150x120"
  | "V-180x120";

export interface CadOpeningType {
  readonly key: CadOpeningTypeKey;
  readonly kind: CadOpeningKind;
  /** Anchura del hueco de obra, en milímetros. */
  readonly widthMm: number;
  /** Altura del hueco de obra, en milímetros. */
  readonly heightMm: number;
  /** Antepecho sobre el suelo, en milímetros (0 en una puerta). */
  readonly sillMm: number;
  /** Para qué se usa, que es como se pide: «la de baño», «la de acceso». */
  readonly use: string;
}

/**
 * El catálogo.
 *
 * Puertas: todas de 2.100 de altura, que es la de una hoja normalizada, y
 * escalonadas de 10 en 10 cm desde el baño hasta el acceso principal.
 * Ventanas: la alta de baño con antepecho de 1,80 —la altura a la que deja de
 * verse desde fuera— y las tres de estancia con el antepecho corriente de 900.
 */
const P060: CadOpeningType = { key: "P-060", kind: "door", widthMm: 600, heightMm: 2_100, sillMm: 0, use: "Baño" };
const P070: CadOpeningType = { key: "P-070", kind: "door", widthMm: 700, heightMm: 2_100, sillMm: 0, use: "Servicio" };
const P080: CadOpeningType = { key: "P-080", kind: "door", widthMm: 800, heightMm: 2_100, sillMm: 0, use: "Recámara" };
const P090: CadOpeningType = { key: "P-090", kind: "door", widthMm: 900, heightMm: 2_100, sillMm: 0, use: "Acceso" };
const P100: CadOpeningType = { key: "P-100", kind: "door", widthMm: 1_000, heightMm: 2_100, sillMm: 0, use: "Acceso principal" };
const V060x040: CadOpeningType = { key: "V-060x040", kind: "window", widthMm: 600, heightMm: 400, sillMm: 1_800, use: "Baño" };
const V120x120: CadOpeningType = { key: "V-120x120", kind: "window", widthMm: 1_200, heightMm: 1_200, sillMm: 900, use: "Recámara" };
const V150x120: CadOpeningType = { key: "V-150x120", kind: "window", widthMm: 1_500, heightMm: 1_200, sillMm: 900, use: "Sala" };
const V180x120: CadOpeningType = { key: "V-180x120", kind: "window", widthMm: 1_800, heightMm: 1_200, sillMm: 900, use: "Sala y comedor" };

export const CAD_OPENING_TYPES: readonly CadOpeningType[] = [
  P060,
  P070,
  P080,
  P090,
  P100,
  V060x040,
  V120x120,
  V150x120,
  V180x120,
];

/**
 * El tipo con el que arranca cada orden.
 *
 * No es un tamaño suelto que casualmente coincida con una entrada: el default
 * de DOOR y WINDOW **es** una entrada del catálogo —la MISMA entrada, por
 * referencia, no una copia de sus números—, de modo que ni siquiera quien no
 * toca `Tipo` coloca un hueco fuera de la carpintería normalizada, y no hay
 * forma de que el default se despegue de la tabla al editarla.
 */
export const CAD_OPENING_DEFAULT_TYPE: Readonly<Record<CadOpeningKind, CadOpeningType>> = {
  door: P090,
  window: V120x120,
};

/** Los tipos de una clase de hueco, en el orden en que se ofrecen. */
export function cadOpeningTypes(kind: CadOpeningKind): readonly CadOpeningType[] {
  return CAD_OPENING_TYPES.filter((type) => type.kind === kind);
}

/** Las claves de una clase de hueco. */
export function cadOpeningTypeKeys(kind: CadOpeningKind): readonly CadOpeningTypeKey[] {
  return cadOpeningTypes(kind).map((type) => type.key);
}

/**
 * La marca del cuadro de carpintería de esta entrada: `P-090x210`, `V-120x120`.
 *
 * La calcula `openingMark`, no una tabla paralela: si un día cambia cómo se
 * escribe una marca, cambia en los dos sitios a la vez porque sólo hay uno.
 */
export function cadOpeningTypeMark(type: CadOpeningType): string {
  return openingMark({ kind: type.kind, width: type.widthMm, height: type.heightMm });
}

/**
 * Resuelve lo tecleado a una entrada, o `null`.
 *
 * Acepta la clave (`P-090`) y también la marca (`P-090x210`), sin distinguir
 * mayúsculas ni espacios sobrantes: lo que el cuadro imprime se puede volver a
 * teclear. `kind` acota la búsqueda a la clase de hueco de la orden en curso,
 * porque pedirle a DOOR una `V-120x120` es un error que merece decirse, no una
 * ventana colocada por una puerta.
 */
export function cadOpeningType(raw: string, kind?: CadOpeningKind): CadOpeningType | null {
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  const pool = kind ? cadOpeningTypes(kind) : CAD_OPENING_TYPES;
  return (
    pool.find(
      (type) => type.key.toUpperCase() === value || cadOpeningTypeMark(type).toUpperCase() === value,
    ) ?? null
  );
}

/** Las medidas de la entrada, ya en la unidad del documento. */
export function cadOpeningTypeSize(
  type: CadOpeningType,
  unit: string | undefined,
): { width: number; height: number; sill: number } {
  return {
    width: cadFromMillimetres(type.widthMm, unit),
    height: cadFromMillimetres(type.heightMm, unit),
    sill: cadFromMillimetres(type.sillMm, unit),
  };
}

/** Cómo se lee una entrada en un aviso: «P-090 (acceso), 900 × 2.100 mm». */
export function cadOpeningTypeLabel(type: CadOpeningType): string {
  // El separador de millares sale del perfil regional (`region/format.ts`) y no
  // de un `es-MX` cableado aquí: la convención de números es configuración, no
  // constante del código.
  return (
    `${type.key} (${type.use.toLowerCase()}), ` +
    `${formatRegionMagnitude(type.widthMm)} × ${formatRegionMagnitude(type.heightMm)} mm`
  );
}

/**
 * El rechazo de un tipo que no existe, con las claves válidas escritas.
 *
 * Se niega con la lista delante porque la alternativa —colocar el hueco por
 * defecto— es exactamente el fallo que el gate de integridad persigue: un
 * comando que responde algo razonable a una entrada que no entendió.
 */
export function cadOpeningTypeRefusal(raw: string, kind: CadOpeningKind): string {
  const noun = kind === "door" ? "puerta" : "ventana";
  const keys = cadOpeningTypeKeys(kind);
  const list = keys.length > 1 ? `${keys.slice(0, -1).join(", ")} y ${keys[keys.length - 1]}` : keys.join("");
  const asked = raw.trim();
  const head = asked
    ? `No hay tipo de ${noun} «${asked}» en el catálogo`
    : `No se dijo qué tipo de ${noun} colocar`;
  return `${head}: los tipos de ${noun} son ${list}. Una medida que no esté en el catálogo se teclea a mano.`;
}
