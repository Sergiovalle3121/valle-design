/**
 * LOS NORMALIZADOS como BLOQUES con geometría (Ola I, 2026-09-02): tornillería
 * ISO y perfiles de acero comerciales, dibujados a escala real en milímetros.
 *
 * Medido antes: la rúbrica decía «no hay biblioteca de normalizados» y el
 * único catálogo de bloques con geometría era el MEP de la Ola F. Un plano de
 * fabricación necesita el tornillo con su cabeza y su rosca, la tuerca con su
 * hexágono, el perfil con su sección; y necesita que cada uno sea un BLOQUE
 * —se inserta N veces, la lista de materiales lo cuenta por su nombre y viaja
 * al DXF como INSERT + BLOCK— con un id ESTABLE (`MECH-…`), que es lo que
 * persiste. Nada nuevo en el formato: son bloques como los demás, con la
 * denominación y la norma en `description`, que ya existía.
 *
 * Las medidas de la tornillería son las de ISO 4017 (tornillo hexagonal de
 * rosca completa), ISO 4032 (tuerca) e ISO 7089 (rondana plana): entrecaras
 * ISO, no DIN (M10 16 y no 17; M12 18 y no 19). Los perfiles se dibujan por
 * sus medidas tecleadas —la designación IMCA manda; los defaults son medidas
 * comerciales redondas—, sin radios de esquina ni de acuerdo, y se dice.
 */
import type { CadBlockDefinition, CadEntity, CadPoint2 } from "./cad-document";

export type CadMechanicalFamily = "tornillo" | "tuerca" | "rondana" | "perfil";

export interface CadMechanicalPart {
  /** Id del bloque en el documento; ESTABLE: viaja en los INSERT guardados. */
  id: string;
  /** Denominación: «Tornillo hexagonal M10 × 40». */
  name: string;
  /** Norma o designación: «ISO 4017». */
  standard: string;
  family: CadMechanicalFamily;
  /** Sección en mm² (perfiles) o `null`. */
  areaMm2: number | null;
  entities: CadEntity[];
}

const L = "0";
const flat = (point: CadPoint2) => ({ ...point, z: 0 });
const line = (id: string, a: CadPoint2, b: CadPoint2): CadEntity => ({ id, type: "line", start: flat(a), end: flat(b), layer: L });
const circle = (id: string, center: CadPoint2, radius: number): CadEntity => ({ id, type: "circle", center: flat(center), radius, layer: L });
const ring = (id: string, points: CadPoint2[]): CadEntity => ({ id, type: "polyline", vertices: points.map(flat), closed: true, layer: L });

/** Número para un id o un nombre: sin ceros de sobra, con punto decimal. */
export function cadMechanicalNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/* ───────────────────────────── Tornillería ───────────────────────────── */

export interface CadMetricSize {
  /** Paso grueso ISO 261 (mm). */
  pitch: number;
  /** Entrecaras s de tornillo y tuerca (ISO 4017 / ISO 4032). */
  s: number;
  /** Altura de cabeza k (ISO 4017). */
  k: number;
  /** Altura de tuerca m (ISO 4032). */
  m: number;
  /** Rondana plana ISO 7089: agujero d1, exterior d2, espesor h. */
  washer: { d1: number; d2: number; h: number };
}

export const CAD_METRIC_SIZES: Readonly<Record<number, CadMetricSize>> = {
  6: { pitch: 1, s: 10, k: 4, m: 5.2, washer: { d1: 6.4, d2: 12, h: 1.6 } },
  8: { pitch: 1.25, s: 13, k: 5.3, m: 6.8, washer: { d1: 8.4, d2: 16, h: 1.6 } },
  10: { pitch: 1.5, s: 16, k: 6.4, m: 8.4, washer: { d1: 10.5, d2: 20, h: 2 } },
  12: { pitch: 1.75, s: 18, k: 7.5, m: 10.8, washer: { d1: 13, d2: 24, h: 2.5 } },
  16: { pitch: 2, s: 24, k: 10, m: 14.8, washer: { d1: 17, d2: 30, h: 3 } },
  20: { pitch: 2.5, s: 30, k: 12.5, m: 18, washer: { d1: 21, d2: 37, h: 3 } },
  24: { pitch: 3, s: 36, k: 15, m: 21.5, washer: { d1: 25, d2: 44, h: 4 } },
};

export const CAD_METRIC_LIST = Object.keys(CAD_METRIC_SIZES).map(Number);

/** Diámetro menor de la rosca métrica ISO: d − 1,2269 p. */
export function cadMetricMinorDiameter(d: number, pitch: number): number {
  return d - 1.2269 * pitch;
}

/** Hexágono de entrecaras s: seis vértices a e/2 = s / (2 cos 30°). */
export function cadHexagon(center: CadPoint2, acrossFlats: number): CadPoint2[] {
  const radius = acrossFlats / 2 / Math.cos(Math.PI / 6);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/**
 * Tornillo hexagonal ISO 4017 en ALZADO, eje +X: la cabeza ocupa x ∈ [−k, 0]
 * (vista sobre una cara: silueta entre vértices e y las dos aristas a ±e/4) y
 * el vástago x ∈ [0, L] con chaflán de 0,1 d en la punta y las dos líneas del
 * diámetro menor como rosca. El punto base es el apoyo de la cabeza.
 */
export function cadMechanicalBolt(metric: number, length: number): CadMechanicalPart | null {
  const size = CAD_METRIC_SIZES[metric];
  if (!size || !(length > 0)) return null;
  const d = metric;
  const e = size.s / Math.cos(Math.PI / 6);
  const c = 0.1 * d;
  const minor = cadMetricMinorDiameter(d, size.pitch) / 2;
  const id = `MECH-TORNILLO-M${d}x${cadMechanicalNumber(length)}`;
  const prefix = id.toLowerCase();
  return {
    id,
    name: `Tornillo hexagonal M${d} × ${cadMechanicalNumber(length)}`,
    standard: "ISO 4017",
    family: "tornillo",
    areaMm2: null,
    entities: [
      ring(`${prefix}-cabeza`, [{ x: -size.k, y: -e / 2 }, { x: 0, y: -e / 2 }, { x: 0, y: e / 2 }, { x: -size.k, y: e / 2 }]),
      line(`${prefix}-arista-a`, { x: -size.k, y: e / 4 }, { x: 0, y: e / 4 }),
      line(`${prefix}-arista-b`, { x: -size.k, y: -e / 4 }, { x: 0, y: -e / 4 }),
      ring(`${prefix}-vastago`, [
        { x: 0, y: d / 2 },
        { x: length - c, y: d / 2 },
        { x: length, y: d / 2 - c },
        { x: length, y: -(d / 2 - c) },
        { x: length - c, y: -d / 2 },
        { x: 0, y: -d / 2 },
      ]),
      line(`${prefix}-rosca-a`, { x: 0, y: minor }, { x: length - c, y: minor }),
      line(`${prefix}-rosca-b`, { x: 0, y: -minor }, { x: length - c, y: -minor }),
    ],
  };
}

/** Tuerca hexagonal ISO 4032 en PLANTA: hexágono de entrecaras s, rosca como dos círculos. */
export function cadMechanicalNut(metric: number): CadMechanicalPart | null {
  const size = CAD_METRIC_SIZES[metric];
  if (!size) return null;
  const id = `MECH-TUERCA-M${metric}`;
  const prefix = id.toLowerCase();
  return {
    id,
    name: `Tuerca hexagonal M${metric}`,
    standard: "ISO 4032",
    family: "tuerca",
    areaMm2: null,
    entities: [
      ring(`${prefix}-hex`, cadHexagon({ x: 0, y: 0 }, size.s)),
      circle(`${prefix}-menor`, { x: 0, y: 0 }, cadMetricMinorDiameter(metric, size.pitch) / 2),
      circle(`${prefix}-mayor`, { x: 0, y: 0 }, metric / 2),
    ],
  };
}

/** Rondana plana ISO 7089 en PLANTA: dos círculos, d1 y d2. */
export function cadMechanicalWasher(metric: number): CadMechanicalPart | null {
  const size = CAD_METRIC_SIZES[metric];
  if (!size) return null;
  const id = `MECH-RONDANA-M${metric}`;
  const prefix = id.toLowerCase();
  return {
    id,
    name: `Rondana plana M${metric}`,
    standard: "ISO 7089",
    family: "rondana",
    areaMm2: null,
    entities: [circle(`${prefix}-int`, { x: 0, y: 0 }, size.washer.d1 / 2), circle(`${prefix}-ext`, { x: 0, y: 0 }, size.washer.d2 / 2)],
  };
}

/* ───────────────────────────── Perfiles ──────────────────────────────── */

export type CadSteelShapeKind = "PTR" | "OC" | "LI" | "CPS" | "IPR";

export interface CadSteelShapeParameter {
  key: string;
  prompt: string;
  fallback: number;
}

export interface CadSteelShape {
  kind: CadSteelShapeKind;
  keyword: { keyword: string; shortcut: string };
  /** Nombre largo para los mensajes. */
  label: string;
  standard: string;
  parameters: readonly CadSteelShapeParameter[];
}

/**
 * Los cinco perfiles del acero estructural mexicano (designación IMCA): PTR
 * y OC cerrados, LI, CPS e IPR abiertos. Los defaults son las medidas
 * comerciales más corrientes en milímetros (2" × 2" cal. 11, tubo de 2"
 * cédula 40, ángulo de 2" × 1/4"); canal y viga van con medidas redondas
 * porque el catálogo del fabricante manda y la orden las pide una a una.
 */
export const CAD_STEEL_SHAPES: readonly CadSteelShape[] = [
  {
    kind: "PTR",
    keyword: { keyword: "Ptr", shortcut: "P" },
    label: "Perfil tubular rectangular PTR",
    standard: "ASTM A500 / IMCA",
    parameters: [
      { key: "b", prompt: "Precise el ancho b (mm)", fallback: 50.8 },
      { key: "h", prompt: "Precise el peralte h (mm)", fallback: 50.8 },
      { key: "t", prompt: "Precise el espesor de pared t (mm)", fallback: 3 },
    ],
  },
  {
    kind: "OC",
    keyword: { keyword: "tubo OC", shortcut: "O" },
    label: "Tubo circular OC",
    standard: "ASTM A53 / IMCA",
    parameters: [
      { key: "d", prompt: "Precise el diámetro exterior D (mm)", fallback: 60.3 },
      { key: "t", prompt: "Precise el espesor de pared t (mm)", fallback: 3.9 },
    ],
  },
  {
    kind: "LI",
    keyword: { keyword: "ángulo LI", shortcut: "L" },
    label: "Ángulo de lados iguales LI",
    standard: "ASTM A36 / IMCA",
    parameters: [
      { key: "b", prompt: "Precise el lado b (mm)", fallback: 50.8 },
      { key: "t", prompt: "Precise el espesor t (mm)", fallback: 6.4 },
    ],
  },
  {
    kind: "CPS",
    keyword: { keyword: "Canal CPS", shortcut: "C" },
    label: "Canal CPS",
    standard: "ASTM A36 / IMCA",
    parameters: [
      { key: "d", prompt: "Precise el peralte d (mm)", fallback: 100 },
      { key: "bf", prompt: "Precise el ancho de patín bf (mm)", fallback: 50 },
      { key: "tw", prompt: "Precise el espesor del alma tw (mm)", fallback: 5 },
      { key: "tf", prompt: "Precise el espesor del patín tf (mm)", fallback: 7.5 },
    ],
  },
  {
    kind: "IPR",
    keyword: { keyword: "Ipr", shortcut: "I" },
    label: "Perfil IPR (viga I)",
    standard: "ASTM A992 / IMCA",
    parameters: [
      { key: "d", prompt: "Precise el peralte d (mm)", fallback: 150 },
      { key: "bf", prompt: "Precise el ancho de patín bf (mm)", fallback: 100 },
      { key: "tw", prompt: "Precise el espesor del alma tw (mm)", fallback: 5 },
      { key: "tf", prompt: "Precise el espesor del patín tf (mm)", fallback: 7 },
    ],
  },
];

export function cadSteelShapeFor(keywordOrKind: string | undefined): CadSteelShape | undefined {
  if (!keywordOrKind) return undefined;
  const wanted = keywordOrKind.trim().toUpperCase();
  return CAD_STEEL_SHAPES.find((shape) => shape.kind === wanted || shape.keyword.keyword.toUpperCase() === wanted);
}

/** Densidad del acero estructural, kg/m³, para el peso lineal del cuadro. */
export const CAD_STEEL_DENSITY_KG_M3 = 7850;

/** Peso lineal (kg/m) de una sección en mm². */
export function cadSteelKgPerMetre(areaMm2: number): number {
  return (areaMm2 / 1e6) * CAD_STEEL_DENSITY_KG_M3;
}

function positive(values: Record<string, number>, keys: readonly string[]): boolean {
  return keys.every((key) => Number.isFinite(values[key]) && values[key] > 0);
}

/**
 * La SECCIÓN del perfil como bloque, en mm. PTR, LI y CPS apoyan su esquina
 * inferior izquierda en el punto base (se colocan sobre una placa); OC e IPR
 * van centrados (se colocan sobre un eje). Devuelve `string` con el motivo
 * cuando las medidas no forman un perfil (una pared que se come el hueco).
 */
export function cadMechanicalSteelShape(kind: CadSteelShapeKind, values: Record<string, number>): CadMechanicalPart | string {
  const shape = CAD_STEEL_SHAPES.find((candidate) => candidate.kind === kind)!;
  const keys = shape.parameters.map((parameter) => parameter.key);
  if (!positive(values, keys)) return `${shape.label}: todas las medidas deben ser mayores que cero.`;
  const n = cadMechanicalNumber;
  const dims = keys.map((key) => n(values[key])).join("x");
  const id = `MECH-${kind}-${dims}`;
  const prefix = id.toLowerCase();
  const part = (name: string, areaMm2: number, entities: CadEntity[]): CadMechanicalPart => ({ id, name, standard: shape.standard, family: "perfil", areaMm2, entities });

  if (kind === "PTR") {
    const { b, h, t } = values;
    if (2 * t >= Math.min(b, h)) return `PTR ${n(b)} × ${n(h)}: una pared de ${n(t)} no deja hueco.`;
    return part(`PTR ${n(b)} × ${n(h)} × ${n(t)}`, b * h - (b - 2 * t) * (h - 2 * t), [
      ring(`${prefix}-ext`, [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: h }, { x: 0, y: h }]),
      ring(`${prefix}-int`, [{ x: t, y: t }, { x: b - t, y: t }, { x: b - t, y: h - t }, { x: t, y: h - t }]),
    ]);
  }
  if (kind === "OC") {
    const { d, t } = values;
    if (2 * t >= d) return `Tubo OC Ø${n(d)}: una pared de ${n(t)} no deja hueco.`;
    return part(`Tubo OC Ø${n(d)} × ${n(t)}`, Math.PI * ((d / 2) ** 2 - (d / 2 - t) ** 2), [
      circle(`${prefix}-ext`, { x: 0, y: 0 }, d / 2),
      circle(`${prefix}-int`, { x: 0, y: 0 }, d / 2 - t),
    ]);
  }
  if (kind === "LI") {
    const { b, t } = values;
    if (t >= b) return `Ángulo LI ${n(b)}: el espesor ${n(t)} no cabe en el lado.`;
    return part(`Ángulo LI ${n(b)} × ${n(t)}`, 2 * b * t - t * t, [
      ring(`${prefix}-seccion`, [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: t }, { x: t, y: t }, { x: t, y: b }, { x: 0, y: b }]),
    ]);
  }
  const { d, bf, tw, tf } = values;
  if (2 * tf >= d || tw >= bf) return `${shape.label} ${n(d)} × ${n(bf)}: los espesores no dejan alma ni patín.`;
  const area = 2 * bf * tf + (d - 2 * tf) * tw;
  if (kind === "CPS")
    return part(`Canal CPS ${n(d)} × ${n(bf)} × ${n(tw)} × ${n(tf)}`, area, [
      ring(`${prefix}-seccion`, [
        { x: 0, y: 0 },
        { x: bf, y: 0 },
        { x: bf, y: tf },
        { x: tw, y: tf },
        { x: tw, y: d - tf },
        { x: bf, y: d - tf },
        { x: bf, y: d },
        { x: 0, y: d },
      ]),
    ]);
  const hx = bf / 2;
  const hy = d / 2;
  const wx = tw / 2;
  return part(`Perfil IPR ${n(d)} × ${n(bf)} × ${n(tw)} × ${n(tf)}`, area, [
    ring(`${prefix}-seccion`, [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: -hy + tf },
      { x: wx, y: -hy + tf },
      { x: wx, y: hy - tf },
      { x: hx, y: hy - tf },
      { x: hx, y: hy },
      { x: -hx, y: hy },
      { x: -hx, y: hy - tf },
      { x: -wx, y: hy - tf },
      { x: -wx, y: -hy + tf },
      { x: -hx, y: -hy + tf },
    ]),
  ]);
}

/* ───────────────────────────── El bloque ─────────────────────────────── */

export const CAD_MECHANICAL_BLOCK_PREFIX = "MECH-";
const DESCRIPTION_SEPARATOR = " · ";

/** La definición de bloque: base en el origen, geometría en capa 0, denominación y norma en `description`. */
export function cadMechanicalBlockDefinition(part: CadMechanicalPart): CadBlockDefinition {
  return {
    id: part.id,
    name: part.id,
    basePoint: { x: 0, y: 0, z: 0 },
    entities: part.entities,
    description: `${part.name}${DESCRIPTION_SEPARATOR}${part.standard}`,
    keywords: ["MECH", part.family],
  };
}

/** Denominación y norma de un bloque `MECH-…`, leídas de su `description`; `null` si no es normalizado. */
export function cadMechanicalPartOf(block: Pick<CadBlockDefinition, "id" | "name" | "description"> | undefined): { name: string; standard: string } | null {
  if (!block || !block.id.startsWith(CAD_MECHANICAL_BLOCK_PREFIX)) return null;
  const description = block.description ?? "";
  const separator = description.indexOf(DESCRIPTION_SEPARATOR);
  if (separator < 0) return { name: description || block.name || block.id, standard: "—" };
  return { name: description.slice(0, separator), standard: description.slice(separator + DESCRIPTION_SEPARATOR.length) || "—" };
}
