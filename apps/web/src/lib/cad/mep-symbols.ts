/**
 * LOS SÍMBOLOS MEP como BLOQUES con geometría (Ola F, 2026-09-02).
 *
 * Los símbolos del catálogo legado (`symbols.ts`) son cajas con nombre; un
 * plano de instalaciones necesita el símbolo DIBUJADO —la válvula con sus dos
 * triángulos, el difusor con sus aspas, el contacto con su semicírculo— y
 * necesita que ese dibujo sea un BLOQUE: se inserta N veces, se cuenta en el
 * cuadro por su nombre y viaja al DXF como INSERT + BLOCK, que es lo que
 * abre cualquier despacho.
 *
 * Aquí viven las definiciones (en milímetros, a escala real, sobre la capa
 * 0 para que hereden la de la inserción) y la orden `MEPSYMBOL` las define en
 * el documento la primera vez que se insertan. Nada nuevo en el formato: son
 * bloques como los demás, con id `MEP-…` estable, que es lo que persiste.
 */
import type { CadBlockDefinition, CadEntity, CadPoint2 } from "./cad-document";

export interface CadMepSymbol {
  /** Id del bloque en el documento; ESTABLE: viaja en los INSERT guardados. */
  id: string;
  name: string;
  keyword: { keyword: string; shortcut: string };
  label: string;
  /** Servicio al que pertenece, para el cuadro de instalaciones. */
  service: string;
  /** Capa sugerida para la inserción. */
  layer: string;
  entities: (blockId: string) => CadEntity[];
}

const L = "0";
const line = (id: string, a: CadPoint2, b: CadPoint2): CadEntity => ({ id, type: "line", start: { ...a, z: 0 }, end: { ...b, z: 0 }, layer: L });
const circle = (id: string, center: CadPoint2, radius: number): CadEntity => ({ id, type: "circle", center: { ...center, z: 0 }, radius, layer: L });
const ring = (id: string, points: CadPoint2[]): CadEntity => ({ id, type: "polyline", vertices: points.map((point) => ({ ...point, z: 0 })), closed: true, layer: L });
const text = (id: string, at: CadPoint2, value: string, height: number): CadEntity => ({ id, type: "text", x: at.x, y: at.y, text: value, height, layer: L });

/**
 * Los ocho de la primera entrega, con las medidas comerciales dominantes en
 * México anotadas: difusor y rejilla de 600 × 600 (plafón modular), luminaria
 * de 600 × 600 y de 1.200 × 300, contacto dúplex y apagador como los dibuja
 * la NOM-001-SEDE (semicírculo y círculo con línea), tablero de 300 × 500.
 */
export const CAD_MEP_SYMBOLS: readonly CadMepSymbol[] = [
  {
    id: "MEP-VALVULA",
    name: "Válvula de compuerta",
    keyword: { keyword: "Válvula", shortcut: "V" },
    label: "VALV",
    service: "IH",
    layer: "IH-AF",
    // Dos triángulos enfrentados por el vértice, sobre 200 de tubería.
    entities: (id) => [
      ring(`${id}-a`, [{ x: -100, y: -50 }, { x: 0, y: 0 }, { x: -100, y: 50 }]),
      ring(`${id}-b`, [{ x: 100, y: -50 }, { x: 0, y: 0 }, { x: 100, y: 50 }]),
      line(`${id}-vastago`, { x: 0, y: 0 }, { x: 0, y: 90 }),
      line(`${id}-volante`, { x: -40, y: 90 }, { x: 40, y: 90 }),
    ],
  },
  {
    id: "MEP-DIFUSOR",
    name: "Difusor de inyección 600 × 600",
    keyword: { keyword: "Difusor", shortcut: "D" },
    label: "DIF",
    service: "AA",
    layer: "AA-INY",
    entities: (id) => [
      ring(`${id}-marco`, [{ x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }]),
      line(`${id}-d1`, { x: -300, y: -300 }, { x: 300, y: 300 }),
      line(`${id}-d2`, { x: -300, y: 300 }, { x: 300, y: -300 }),
      ring(`${id}-cuello`, [{ x: -150, y: -150 }, { x: 150, y: -150 }, { x: 150, y: 150 }, { x: -150, y: 150 }]),
    ],
  },
  {
    id: "MEP-REJILLA",
    name: "Rejilla de retorno 600 × 600",
    keyword: { keyword: "Rejilla", shortcut: "R" },
    label: "REJ",
    service: "AA",
    layer: "AA-RET",
    entities: (id) => [
      ring(`${id}-marco`, [{ x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }]),
      ...[-200, -100, 0, 100, 200].map((y, index) => line(`${id}-lama-${index}`, { x: -300, y }, { x: 300, y })),
    ],
  },
  {
    id: "MEP-LUMINARIA",
    name: "Luminaria 600 × 600",
    keyword: { keyword: "Luminaria", shortcut: "L" },
    label: "LUM",
    service: "IE",
    layer: "IE-ILUM",
    entities: (id) => [
      ring(`${id}-marco`, [{ x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }]),
      line(`${id}-d1`, { x: -300, y: -300 }, { x: 300, y: 300 }),
      line(`${id}-d2`, { x: -300, y: 300 }, { x: 300, y: -300 }),
    ],
  },
  {
    id: "MEP-CONTACTO",
    name: "Contacto dúplex",
    keyword: { keyword: "Contacto", shortcut: "C" },
    label: "CONT",
    service: "IE",
    layer: "IE-CONT",
    // Círculo con las dos rayas del dúplex, sobre la línea del muro.
    entities: (id) => [
      circle(`${id}-c`, { x: 0, y: 0 }, 60),
      line(`${id}-r1`, { x: -20, y: 60 }, { x: -20, y: 130 }),
      line(`${id}-r2`, { x: 20, y: 60 }, { x: 20, y: 130 }),
      line(`${id}-base`, { x: -120, y: 0 }, { x: 120, y: 0 }),
    ],
  },
  {
    id: "MEP-APAGADOR",
    name: "Apagador sencillo",
    keyword: { keyword: "Apagador", shortcut: "A" },
    label: "APAG",
    service: "IE",
    layer: "IE-CONT",
    entities: (id) => [circle(`${id}-c`, { x: 0, y: 0 }, 60), line(`${id}-palanca`, { x: 0, y: 60 }, { x: 60, y: 150 }), text(`${id}-s`, { x: -30, y: -30 }, "S", 60)],
  },
  {
    id: "MEP-TABLERO",
    name: "Tablero eléctrico 300 × 500",
    keyword: { keyword: "Tablero", shortcut: "T" },
    label: "TAB",
    service: "IE",
    layer: "IE-TAB",
    entities: (id) => [
      ring(`${id}-caja`, [{ x: -150, y: -250 }, { x: 150, y: -250 }, { x: 150, y: 250 }, { x: -150, y: 250 }]),
      ring(`${id}-relleno`, [{ x: -150, y: -250 }, { x: 150, y: -250 }, { x: 150, y: 0 }, { x: -150, y: 0 }]),
      text(`${id}-t`, { x: -100, y: 80 }, "TAB", 80),
    ],
  },
  {
    id: "MEP-EXTRACTOR",
    name: "Extractor de aire",
    keyword: { keyword: "Extractor", shortcut: "E" },
    label: "EXT",
    service: "AA",
    layer: "AA-EXT",
    entities: (id) => [
      circle(`${id}-c`, { x: 0, y: 0 }, 150),
      ring(`${id}-aspa`, [{ x: -120, y: 0 }, { x: 0, y: 40 }, { x: 120, y: 0 }, { x: 0, y: -40 }]),
      line(`${id}-eje`, { x: 0, y: -150 }, { x: 0, y: 150 }),
    ],
  },
];

/** El símbolo de ese id de bloque o de esa palabra clave. */
export function cadMepSymbolFor(idOrKeyword: string | undefined): CadMepSymbol | undefined {
  if (!idOrKeyword) return undefined;
  const wanted = idOrKeyword.trim().toUpperCase();
  return CAD_MEP_SYMBOLS.find((symbol) => symbol.id.toUpperCase() === wanted || symbol.keyword.keyword.toUpperCase() === wanted);
}

/** La definición de bloque de un símbolo: base en su origen, geometría en capa 0. */
export function cadMepBlockDefinition(symbol: CadMepSymbol): CadBlockDefinition {
  return { id: symbol.id, name: symbol.id, basePoint: { x: 0, y: 0, z: 0 }, entities: symbol.entities(symbol.id.toLowerCase()) };
}
