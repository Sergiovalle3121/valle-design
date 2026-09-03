/**
 * EL CATÁLOGO DE EQUIPOS DE UN P&ID, DIBUJADO DESDE CERO.
 *
 * ## Procedencia, dicha antes que nada
 *
 * Cada símbolo se dibuja aquí con primitivas —círculos, rectángulos, líneas y
 * arcos— a partir de la forma esquemática que cualquier libro de proceso
 * enseña: un recipiente es un rectángulo con los fondos redondeados, una bomba
 * un círculo con su triángulo de descarga, un intercambiador un círculo con dos
 * traviesas, un instrumento de campo un círculo con una raya horizontal. **No
 * se copia, traza ni adapta la biblioteca de nadie**, ni de AutoCAD Plant 3D ni
 * de ningún catálogo con dueño: son formas geométricas de dominio común, del
 * mismo modo que ya lo son la válvula y el difusor de `mep-symbols.ts`.
 *
 * Las medidas están en milímetros a escala de dibujo, como los demás bloques
 * del árbol, y sobre la capa `0` para que hereden la de la inserción.
 *
 * ## Por qué son BLOQUES y no dibujos sueltos
 *
 * Porque un equipo se inserta N veces, se cuenta en la lista por su nombre,
 * lleva sus ATRIBUTOS —la etiqueta `P-101`— y viaja al DXF como `INSERT` +
 * `BLOCK`, que es lo que abre cualquier despacho. Un símbolo que no es bloque
 * es un dibujo que hay que volver a contar a mano.
 */
import type { CadBlockDefinition, CadEntity, CadPoint2 } from "../cad-document";

export interface CadPidSymbol {
  /** Id del bloque en el documento; ESTABLE: viaja en los INSERT guardados. */
  id: string;
  name: string;
  keyword: { keyword: string; shortcut: string };
  /** Prefijo de etiqueta que le toca por convención de proyecto: `P`, `V`… */
  prefix: string;
  /** Capa sugerida para la inserción. */
  layer: string;
  entities: (blockId: string) => CadEntity[];
}

const L = "0";
const line = (id: string, a: CadPoint2, b: CadPoint2): CadEntity =>
  ({ id, type: "line", start: { ...a, z: 0 }, end: { ...b, z: 0 }, layer: L }) as CadEntity;
const circle = (id: string, center: CadPoint2, radius: number): CadEntity =>
  ({ id, type: "circle", center: { ...center, z: 0 }, radius, layer: L }) as CadEntity;
const ring = (id: string, points: CadPoint2[]): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: points.map((point) => ({ ...point, z: 0 })),
    closed: true,
    layer: L,
  }) as CadEntity;

/** Capa de los equipos de proceso. */
export const CAD_PL_EQUIP_LAYER = "TU-EQ";

/**
 * Seis símbolos, que son los que sostienen un P&ID de verdad.
 *
 * No pretenden ser un catálogo completo: son los que aparecen en casi todo
 * diagrama y con los que un proyecto puede empezar. Añadir uno es añadir una
 * entrada aquí, y por eso se dice cuántos hay en vez de prometer «todos».
 */
export const CAD_PID_SYMBOLS: readonly CadPidSymbol[] = [
  {
    id: "PID-RECIPIENTE",
    name: "Recipiente vertical",
    keyword: { keyword: "Vasija", shortcut: "V" },
    prefix: "V",
    layer: CAD_PL_EQUIP_LAYER,
    // Cuerpo cilíndrico de 1.200 × 2.400 con los fondos abombados dibujados
    // como dos arcos aproximados por sus cuerdas.
    entities: (id) => [
      line(`${id}-iz`, { x: -600, y: -1_000 }, { x: -600, y: 1_000 }),
      line(`${id}-de`, { x: 600, y: -1_000 }, { x: 600, y: 1_000 }),
      ring(`${id}-arriba`, [
        { x: -600, y: 1_000 },
        { x: -300, y: 1_200 },
        { x: 300, y: 1_200 },
        { x: 600, y: 1_000 },
      ]),
      ring(`${id}-abajo`, [
        { x: -600, y: -1_000 },
        { x: -300, y: -1_200 },
        { x: 300, y: -1_200 },
        { x: 600, y: -1_000 },
      ]),
    ],
  },
  {
    id: "PID-BOMBA",
    name: "Bomba centrífuga",
    keyword: { keyword: "Bomba", shortcut: "B" },
    prefix: "P",
    layer: CAD_PL_EQUIP_LAYER,
    // Círculo con el triángulo de descarga hacia arriba y su base.
    entities: (id) => [
      circle(`${id}-cuerpo`, { x: 0, y: 0 }, 400),
      ring(`${id}-descarga`, [
        { x: -400, y: 0 },
        { x: 0, y: 500 },
        { x: 400, y: 0 },
      ]),
      line(`${id}-base`, { x: -500, y: -400 }, { x: 500, y: -400 }),
    ],
  },
  {
    id: "PID-INTERCAMBIADOR",
    name: "Intercambiador de calor",
    keyword: { keyword: "Intercambiador", shortcut: "I" },
    prefix: "E",
    layer: CAD_PL_EQUIP_LAYER,
    // Círculo con dos traviesas: la forma esquemática de toda la vida.
    entities: (id) => [
      circle(`${id}-cuerpo`, { x: 0, y: 0 }, 500),
      line(`${id}-t1`, { x: -500, y: 170 }, { x: 500, y: 170 }),
      line(`${id}-t2`, { x: -500, y: -170 }, { x: 500, y: -170 }),
    ],
  },
  {
    id: "PID-TANQUE",
    name: "Tanque atmosférico",
    keyword: { keyword: "Tanque", shortcut: "T" },
    prefix: "TK",
    layer: CAD_PL_EQUIP_LAYER,
    entities: (id) => [
      ring(`${id}-cuerpo`, [
        { x: -900, y: -700 },
        { x: 900, y: -700 },
        { x: 900, y: 700 },
        { x: -900, y: 700 },
      ]),
      // Techo cónico, insinuado con dos líneas.
      line(`${id}-techo-iz`, { x: -900, y: 700 }, { x: 0, y: 950 }),
      line(`${id}-techo-de`, { x: 900, y: 700 }, { x: 0, y: 950 }),
    ],
  },
  {
    id: "PID-COMPRESOR",
    name: "Compresor",
    keyword: { keyword: "Compresor", shortcut: "C" },
    prefix: "K",
    layer: CAD_PL_EQUIP_LAYER,
    // Círculo con la cuña que indica la compresión.
    entities: (id) => [
      circle(`${id}-cuerpo`, { x: 0, y: 0 }, 450),
      ring(`${id}-cuna`, [
        { x: -450, y: 300 },
        { x: 450, y: 150 },
        { x: 450, y: -150 },
        { x: -450, y: -300 },
      ]),
    ],
  },
  {
    id: "PID-INSTRUMENTO",
    name: "Instrumento de campo",
    keyword: { keyword: "insTrumento", shortcut: "N" },
    prefix: "TI",
    layer: CAD_PL_EQUIP_LAYER,
    // Círculo con una raya horizontal: instrumento montado en campo. El de
    // panel lleva la raya y el de programa un cuadrado; aquí entra el de campo,
    // que es el que más se dibuja, y se dice que es sólo ése.
    entities: (id) => [
      circle(`${id}-globo`, { x: 0, y: 0 }, 300),
      line(`${id}-raya`, { x: -300, y: 0 }, { x: 300, y: 0 }),
    ],
  },
];

/** El símbolo por su palabra clave, sin distinguir mayúsculas. */
export function cadPidSymbolFor(keyword: string): CadPidSymbol | null {
  const clave = keyword.trim().toLowerCase();
  return (
    CAD_PID_SYMBOLS.find(
      (symbol) =>
        symbol.keyword.keyword.toLowerCase() === clave ||
        symbol.keyword.shortcut.toLowerCase() === clave ||
        symbol.id.toLowerCase() === clave,
    ) ?? null
  );
}

/** La definición de bloque de un símbolo, lista para `{type:"block"}`. */
export function cadPidBlockDefinition(symbol: CadPidSymbol): CadBlockDefinition {
  return {
    id: symbol.id,
    name: symbol.name,
    basePoint: { x: 0, y: 0, z: 0 },
    entities: symbol.entities(symbol.id),
    // El atributo de etiqueta se declara en la definición para que `ATTSYNC`
    // lo reconozca y para que la inserción nazca sabiendo que lo lleva.
    attributes: { TAG: { prompt: "Etiqueta del equipo", default: "" } },
  } as unknown as CadBlockDefinition;
}
