/**
 * SÍMBOLOS DE ESQUEMA ELÉCTRICO IEC 60617 (T16).
 *
 * Los doce símbolos que un tablero de control necesita para existir:
 * contacto NA, contacto NC, contacto NA temporizado, bobina, bobina
 * temporizada, relevador térmico, fusible, seccionador, guardamotor,
 * borne, piloto y motor.
 *
 * Cada símbolo es un bloque con geometría dibujada desde primitivas
 * (líneas, círculos, arcos) — formas geométricas descritas en la norma
 * IEC 60617, que es pública, igual que el difusor y la bomba que ya se
 * dibujan en `mep-symbols.ts` y `pid-symbols.ts`. No se copia de ninguna
 * biblioteca comercial.
 *
 * La capa es `IE-ESQ` (hermana de `IE-CIR` para conductores y de `IE-`
 * para instalaciones). El campo `family` permite que `AETAG` deduzca el
 * prefijo automáticamente (K para contactores, F para fusibles, M para
 * motores, etc.).
 */
import type { CadBlockDefinition, CadEntity, CadPoint2 } from "../cad-document";

export interface CadSchematicSymbol {
  id: string;
  name: string;
  keyword: { keyword: string; shortcut: string };
  label: string;
  /** Familia IEC: K=contactor, F=fusible, M=motor, Q=seccionador, X=borne, H=piloto. */
  family: string;
  layer: string;
  entities: (blockId: string) => CadEntity[];
}

const L = "IE-ESQ";
const line = (id: string, a: CadPoint2, b: CadPoint2): CadEntity =>
  ({ id, type: "line", start: { ...a, z: 0 }, end: { ...b, z: 0 }, layer: L } as CadEntity);
const circle = (id: string, center: CadPoint2, radius: number): CadEntity =>
  ({ id, type: "circle", center: { ...center, z: 0 }, radius, layer: L } as CadEntity);
const arc = (id: string, center: CadPoint2, radius: number, startAngle: number, endAngle: number): CadEntity =>
  ({ id, type: "arc", center: { ...center, z: 0 }, radius, startAngle, endAngle, layer: L } as CadEntity);
const polyline = (id: string, points: CadPoint2[], closed = false): CadEntity =>
  ({ id, type: "polyline", vertices: points.map((p) => ({ ...p, z: 0 })), closed, layer: L } as CadEntity);

/**
 * Los doce símbolos IEC 60617 para esquemas de control eléctrico.
 *
 * Las medidas están en milímetros y representan el tamaño comercial
 * estándar de cada símbolo en un esquema de control mexicano.
 */
export const CAD_SCHEMATIC_SYMBOLS: readonly CadSchematicSymbol[] = [
  {
    id: "IEC-CONTACTO-NA",
    name: "Contacto normalmente abierto",
    keyword: { keyword: "ContactoNA", shortcut: "NA" },
    label: "CONTACTO NA",
    family: "K",
    layer: L,
    entities: (id) => [
      // Dos líneas verticales (terminales) con un semicírculo (contacto NA)
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Semicírculo de contacto (abierto)
      arc(`${id}-c`, { x: 50, y: 0 }, 30, -90, 90),
    ],
  },
  {
    id: "IEC-CONTACTO-NC",
    name: "Contacto normalmente cerrado",
    keyword: { keyword: "ContactoNC", shortcut: "NC" },
    label: "CONTACTO NC",
    family: "K",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Línea de contacto cerrada (conecta los dos terminales)
      line(`${id}-c`, { x: 0, y: 0 }, { x: 100, y: 0 }),
      // Diagonal que indica NC
      line(`${id}-d`, { x: 30, y: -30 }, { x: 70, y: 30 }),
    ],
  },
  {
    id: "IEC-CONTACTO-NA-T",
    name: "Contacto NA temporizado",
    keyword: { keyword: "ContactoNAT", shortcut: "NT" },
    label: "CONTACTO NA T",
    family: "K",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      arc(`${id}-c`, { x: 50, y: 0 }, 30, -90, 90),
      // Arco de temporización
      arc(`${id}-t`, { x: 80, y: 25 }, 15, 0, 180),
    ],
  },
  {
    id: "IEC-BOBINA",
    name: "Bobina de contactor",
    keyword: { keyword: "Bobina", shortcut: "BO" },
    label: "BOBINA",
    family: "K",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Rectángulo de bobina
      polyline(`${id}-r`, [
        { x: 25, y: -25 }, { x: 75, y: -25 }, { x: 75, y: 25 }, { x: 25, y: 25 },
      ], true),
    ],
  },
  {
    id: "IEC-BOBINA-T",
    name: "Bobina temporizada",
    keyword: { keyword: "BobinaT", shortcut: "BT" },
    label: "BOBINA T",
    family: "K",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      polyline(`${id}-r`, [
        { x: 25, y: -25 }, { x: 75, y: -25 }, { x: 75, y: 25 }, { x: 25, y: 25 },
      ], true),
      arc(`${id}-t`, { x: 80, y: 25 }, 15, 0, 180),
    ],
  },
  {
    id: "IEC-RELEVADOR",
    name: "Relevador térmico",
    keyword: { keyword: "Relevador", shortcut: "RE" },
    label: "RELEVADOR",
    family: "F",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Semicírculo de relevador
      arc(`${id}-c`, { x: 50, y: 0 }, 25, -90, 90),
      // Línea diagonal interna (bimetal)
      line(`${id}-d`, { x: 50, y: -20 }, { x: 50, y: 20 }),
    ],
  },
  {
    id: "IEC-FUSIBLE",
    name: "Fusible",
    keyword: { keyword: "Fusible", shortcut: "FU" },
    label: "FUSIBLE",
    family: "F",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Rectángulo de fusible
      polyline(`${id}-r`, [
        { x: 35, y: -15 }, { x: 65, y: -15 }, { x: 65, y: 15 }, { x: 35, y: 15 },
      ], true),
    ],
  },
  {
    id: "IEC-SECCIONADOR",
    name: "Seccionador / interruptor",
    keyword: { keyword: "Seccionador", shortcut: "SE" },
    label: "SECCIONADOR",
    family: "Q",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Línea de contacto (cerrado por defecto)
      line(`${id}-c`, { x: 0, y: 0 }, { x: 100, y: 0 }),
      // Círculo de seccionador
      circle(`${id}-r`, { x: 50, y: 0 }, 8),
    ],
  },
  {
    id: "IEC-GUARDAMOTOR",
    name: "Guardamotor",
    keyword: { keyword: "Guardamotor", shortcut: "GM" },
    label: "GUARDAMOTOR",
    family: "F",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Rectángulo de guardamotor
      polyline(`${id}-r`, [
        { x: 25, y: -30 }, { x: 75, y: -30 }, { x: 75, y: 30 }, { x: 25, y: 30 },
      ], true),
      // Línea diagonal (mecanismo)
      line(`${id}-d`, { x: 25, y: -30 }, { x: 75, y: 30 }),
    ],
  },
  {
    id: "IEC-BORNE",
    name: "Borne de conexión",
    keyword: { keyword: "Borne", shortcut: "BN" },
    label: "BORNE",
    family: "X",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      // Círculo de borne
      circle(`${id}-c`, { x: 50, y: 0 }, 20),
      // Terminal de conexión
      line(`${id}-t2`, { x: 70, y: 0 }, { x: 100, y: 0 }),
    ],
  },
  {
    id: "IEC-PILOTO",
    name: "Piloto indicador (lámpara)",
    keyword: { keyword: "Piloto", shortcut: "PI" },
    label: "PILOTO",
    family: "H",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Círculo de lámpara
      circle(`${id}-c`, { x: 50, y: 0 }, 20),
      // Cruz de indicación
      line(`${id}-x1`, { x: 35, y: -15 }, { x: 65, y: 15 }),
      line(`${id}-x2`, { x: 35, y: 15 }, { x: 65, y: -15 }),
    ],
  },
  {
    id: "IEC-MOTOR",
    name: "Motor eléctrico",
    keyword: { keyword: "Motor", shortcut: "MO" },
    label: "MOTOR",
    family: "M",
    layer: L,
    entities: (id) => [
      line(`${id}-t1`, { x: 0, y: -50 }, { x: 0, y: 50 }),
      line(`${id}-t2`, { x: 100, y: -50 }, { x: 100, y: 50 }),
      // Círculo de motor
      circle(`${id}-c`, { x: 50, y: 0 }, 30),
      // Letra M dentro
      // (Se dibuja como líneas, no como texto, para que escale con el bloque)
      line(`${id}-m1`, { x: 38, y: -15 }, { x: 38, y: 15 }),
      line(`${id}-m2`, { x: 38, y: 15 }, { x: 50, y: -5 }),
      line(`${id}-m3`, { x: 50, y: -5 }, { x: 62, y: 15 }),
      line(`${id}-m4`, { x: 62, y: 15 }, { x: 62, y: -15 }),
    ],
  },
];

/** El símbolo por su id o palabra clave. */
export function cadSchematicSymbolFor(idOrKeyword: string | undefined): CadSchematicSymbol | undefined {
  if (!idOrKeyword) return undefined;
  const wanted = idOrKeyword.trim().toUpperCase();
  return CAD_SCHEMATIC_SYMBOLS.find(
    (s) => s.id.toUpperCase() === wanted || s.keyword.keyword.toUpperCase() === wanted,
  );
}

/** La definición de bloque de un símbolo de esquema. */
export function cadSchematicBlockDefinition(symbol: CadSchematicSymbol): CadBlockDefinition {
  return {
    id: symbol.id,
    name: symbol.id,
    basePoint: { x: 0, y: 0, z: 0 },
    entities: symbol.entities(symbol.id.toLowerCase()),
    attributes: { TAG: { prompt: "Etiqueta del componente", defaultValue: "" } },
  };
}
