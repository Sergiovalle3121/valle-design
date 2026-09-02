/**
 * LOS SÍMBOLOS DEL PLANO DE FABRICACIÓN como geometría (Ola I, 2026-09-02):
 * el globo de la lista de materiales, el símbolo de soldadura y el de acabado
 * superficial.
 *
 * Se materializan con lo que el documento SÍ sabe guardar —líneas, polilíneas,
 * círculos y MTEXT—, en UN lote por símbolo, igual que hizo el marco de
 * control de TOLERANCE: una entidad `weld` o `balloon` sería tocar el formato
 * persistido, decisión del titular. La consecuencia se dice: el símbolo no se
 * mueve como un objeto; para que no se pierda de qué símbolo es cada pieza,
 * todas llevan `context.metadata.mechanical` con la misma marca, y la lista de
 * materiales cuenta los globos por esa marca.
 *
 * Las proporciones salen de la altura de texto h: el globo es un círculo de
 * radio h; el símbolo de soldadura sigue la disposición de ISO 2553 / AWS
 * A2.4 (línea de referencia, flecha, símbolo de 1,6 h del lado de la flecha
 * DEBAJO de la línea y del otro lado ENCIMA, tamaño a la izquierda, longitud
 * a la derecha, círculo «todo alrededor» y bandera «en obra» en la unión,
 * cola con la nota); el de acabado sigue ISO 1302 (patas a 60°, la corta de
 * 1,4 h y la larga de 2,8 h, barra para «arranque de material obligatorio»,
 * círculo para «prohibido», Ra en la posición a, dirección de estrías en d).
 */
import type { CadEntityMetadata, CadPoint2 } from "./cad-document";
import type { CadNativeEntity } from "./entity-runtime";

const flat = (point: CadPoint2) => ({ x: point.x, y: point.y, z: 0 });

interface Pen {
  layer: string;
  metadata: CadEntityMetadata;
  newId: () => string;
}

function line(pen: Pen, a: CadPoint2, b: CadPoint2): CadNativeEntity {
  return { id: pen.newId(), type: "line", start: flat(a), end: flat(b), layer: pen.layer, context: { metadata: pen.metadata } };
}
function polyline(pen: Pen, points: CadPoint2[], closed = false): CadNativeEntity {
  return { id: pen.newId(), type: "polyline", vertices: points.map(flat), closed, layer: pen.layer, context: { metadata: pen.metadata } };
}
function circle(pen: Pen, center: CadPoint2, radius: number): CadNativeEntity {
  return { id: pen.newId(), type: "circle", center: flat(center), radius, layer: pen.layer, context: { metadata: pen.metadata } };
}
function mtext(
  pen: Pen,
  at: CadPoint2,
  text: string,
  height: number,
  alignment: "middle-left" | "middle-center" | "middle-right",
  rotation = 0,
): CadNativeEntity {
  return {
    id: pen.newId(),
    type: "mtext",
    insertion: flat(at),
    text,
    height,
    width: Math.max(height, text.length * height * 0.75),
    alignment,
    ...(rotation ? { rotation } : {}),
    layer: pen.layer,
    context: { metadata: pen.metadata },
  };
}

const norm = (a: CadPoint2, b: CadPoint2): CadPoint2 | null => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length > 1e-9 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : null;
};
const add = (a: CadPoint2, b: CadPoint2, k = 1): CadPoint2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** Flecha cerrada en `tip`, apuntando CONTRA `direction`, del mismo dibujo que las cotas. */
function arrowhead(pen: Pen, tip: CadPoint2, direction: CadPoint2, size: number): CadNativeEntity {
  const base = add(tip, direction, size);
  const perpendicular = { x: -direction.y, y: direction.x };
  return polyline(pen, [tip, add(base, perpendicular, size * 0.35), add(base, perpendicular, -size * 0.35)], true);
}

/* ─────────────────────────────── Globo ───────────────────────────────── */

export interface CadBalloonSpec {
  item: number;
  /** Donde apunta la flecha (la pieza). */
  target: CadPoint2;
  /** Centro del círculo. */
  center: CadPoint2;
  height: number;
  layer: string;
  /** Id del bloque `MECH-…` designado, si lo hubo; la lista de materiales lo lee. */
  part?: string;
  /** Id de la entidad designada, si la hubo. */
  targetId?: string;
}

export const CAD_BALLOON_MARK = "balloon";

export function cadBalloonMetadata(spec: Pick<CadBalloonSpec, "item" | "part" | "targetId">): CadEntityMetadata {
  return { mechanical: CAD_BALLOON_MARK, balloon: spec.item, balloonPart: spec.part ?? "", balloonTarget: spec.targetId ?? "" };
}

/** Flecha, directriz, círculo y número: cuatro entidades con la misma marca. */
export function cadBalloonEntities(spec: CadBalloonSpec, newId: () => string): CadNativeEntity[] {
  const pen: Pen = { layer: spec.layer, metadata: cadBalloonMetadata(spec), newId };
  const h = spec.height;
  const radius = h;
  const direction = norm(spec.center, spec.target);
  const entities: CadNativeEntity[] = [];
  if (direction) {
    const edge = add(spec.center, direction, radius);
    entities.push(line(pen, edge, spec.target), arrowhead(pen, spec.target, { x: -direction.x, y: -direction.y }, h * 0.8));
  }
  entities.push(circle(pen, spec.center, radius), mtext(pen, spec.center, String(spec.item), h, "middle-center"));
  return entities;
}

/* ─────────────────────────────── Soldadura ───────────────────────────── */

export type CadWeldType = "fillet" | "square" | "v" | "bevel" | "u" | "j" | "plug" | "spot" | "seam";
export type CadWeldSide = "arrow" | "other" | "both";

export const CAD_WELD_TYPES: readonly { type: CadWeldType; keyword: { keyword: string; shortcut: string }; label: string }[] = [
  { type: "fillet", keyword: { keyword: "Filete", shortcut: "F" }, label: "filete" },
  { type: "square", keyword: { keyword: "Cuadrada", shortcut: "C" }, label: "a tope cuadrada" },
  { type: "v", keyword: { keyword: "V", shortcut: "V" }, label: "en V" },
  { type: "bevel", keyword: { keyword: "Bisel", shortcut: "B" }, label: "en bisel" },
  { type: "u", keyword: { keyword: "U", shortcut: "U" }, label: "en U" },
  { type: "j", keyword: { keyword: "J", shortcut: "J" }, label: "en J" },
  { type: "plug", keyword: { keyword: "Tapón", shortcut: "T" }, label: "de tapón" },
  { type: "spot", keyword: { keyword: "Punto", shortcut: "P" }, label: "por puntos" },
  { type: "seam", keyword: { keyword: "cOstura", shortcut: "O" }, label: "de costura" },
];

export const CAD_WELD_SIDES: readonly { side: CadWeldSide; keyword: { keyword: string; shortcut: string }; label: string }[] = [
  { side: "arrow", keyword: { keyword: "Flecha", shortcut: "F" }, label: "del lado de la flecha" },
  { side: "other", keyword: { keyword: "Otro", shortcut: "O" }, label: "del otro lado" },
  { side: "both", keyword: { keyword: "Ambos", shortcut: "A" }, label: "de ambos lados" },
];

export interface CadWeldSpec {
  type: CadWeldType;
  side: CadWeldSide;
  /** Cateto o garganta; 0 = sin tamaño. */
  size: number;
  /** Longitud del cordón; 0 = continuo. */
  length: number;
  allAround: boolean;
  field: boolean;
  /** Nota de la cola (proceso, norma); vacía = sin cola. */
  tail: string;
  /** La junta (punta de la flecha). */
  arrow: CadPoint2;
  /** Unión de la flecha con la línea de referencia. */
  reference: CadPoint2;
  height: number;
  layer: string;
}

export const CAD_WELD_MARK = "weld";

export function cadWeldMetadata(spec: Omit<CadWeldSpec, "arrow" | "reference" | "height" | "layer">): CadEntityMetadata {
  return {
    mechanical: CAD_WELD_MARK,
    weldType: spec.type,
    weldSide: spec.side,
    weldSize: spec.size,
    weldLength: spec.length,
    weldAllAround: spec.allAround,
    weldField: spec.field,
    weldTail: spec.tail,
  };
}

/** El dibujo del símbolo de un tipo, con el vértice de arranque en `x0` sobre la línea y `sign` −1 debajo / +1 encima. */
function weldGlyph(pen: Pen, type: CadWeldType, x0: number, y0: number, s: number, sign: number, dir: number): CadNativeEntity[] {
  const p = (dx: number, dy: number): CadPoint2 => ({ x: x0 + dir * dx, y: y0 + sign * dy });
  switch (type) {
    case "fillet":
      return [polyline(pen, [p(0, 0), p(0, s), p(s, 0)], true)];
    case "square":
      return [line(pen, p(0.3 * s, 0), p(0.3 * s, 0.8 * s)), line(pen, p(0.9 * s, 0), p(0.9 * s, 0.8 * s))];
    case "v":
      return [polyline(pen, [p(0, 0), p(0.5 * s, s), p(s, 0)])];
    case "bevel":
      return [line(pen, p(0.2 * s, 0), p(0.2 * s, s)), line(pen, p(0.2 * s, s), p(s, 0))];
    case "u":
    case "j": {
      const center = { x: 0.5 * s, y: 0.5 * s };
      const arc = Array.from({ length: 9 }, (_, index) => {
        const angle = Math.PI + (Math.PI * index) / 8;
        return p(center.x + Math.cos(angle) * 0.5 * s, center.y + Math.sin(angle) * 0.5 * s);
      });
      if (type === "u") return [polyline(pen, [p(0, 0), ...arc, p(s, 0)])];
      return [line(pen, p(0.2 * s, 0), p(0.2 * s, s)), polyline(pen, [p(0.2 * s, s), ...arc.slice(4), p(s, 0)])];
    }
    case "plug":
      return [polyline(pen, [p(0, 0), p(0, 0.6 * s), p(s, 0.6 * s), p(s, 0)])];
    case "spot":
      return [circle(pen, p(0.5 * s, 0.5 * s), 0.4 * s)];
    case "seam":
      return [
        circle(pen, p(0.5 * s, 0.5 * s), 0.4 * s),
        line(pen, p(-0.2 * s, 0.35 * s), p(1.2 * s, 0.35 * s)),
        line(pen, p(-0.2 * s, 0.65 * s), p(1.2 * s, 0.65 * s)),
      ];
  }
}

/**
 * Línea de referencia, flecha con su punta, símbolo(s), tamaño, longitud,
 * «todo alrededor», bandera de obra y cola. La línea de referencia sale de la
 * unión hacia el lado CONTRARIO a la flecha, para que la cola quede lejos de
 * la junta. Devuelve `string` si la flecha y la unión coinciden.
 */
export function cadWeldSymbolEntities(spec: CadWeldSpec, newId: () => string): CadNativeEntity[] | string {
  const direction = norm(spec.reference, spec.arrow);
  if (!direction) return "La flecha y la línea de referencia no pueden arrancar en el mismo punto.";
  const pen: Pen = { layer: spec.layer, metadata: cadWeldMetadata(spec), newId };
  const h = spec.height;
  const s = 1.6 * h;
  const dir = spec.arrow.x > spec.reference.x + 1e-9 ? -1 : 1;
  const J = spec.reference;
  const px = (t: number) => J.x + dir * t;
  const referenceLength = 8 * h;
  const entities: CadNativeEntity[] = [
    line(pen, J, { x: px(referenceLength), y: J.y }),
    line(pen, J, spec.arrow),
    arrowhead(pen, spec.arrow, { x: -direction.x, y: -direction.y }, 1.2 * h),
  ];
  const x0 = px(2.5 * h);
  const sides: number[] = spec.side === "both" ? [-1, 1] : spec.side === "arrow" ? [-1] : [1];
  for (const sign of sides) entities.push(...weldGlyph(pen, spec.type, x0, J.y, s, sign, dir));
  const leftAnchor = dir > 0 ? "middle-right" : "middle-left";
  const rightAnchor = dir > 0 ? "middle-left" : "middle-right";
  const textY = sides[0] * (0.5 * s);
  if (spec.size > 0) entities.push(mtext(pen, { x: x0 - dir * 0.3 * h, y: J.y + textY }, formatWeldNumber(spec.size), h, leftAnchor));
  if (spec.length > 0) entities.push(mtext(pen, { x: x0 + dir * (s + 0.3 * h), y: J.y + textY }, formatWeldNumber(spec.length), h, rightAnchor));
  if (spec.allAround) entities.push(circle(pen, J, 0.35 * h));
  if (spec.field) entities.push(line(pen, J, { x: J.x, y: J.y + 2.2 * h }), polyline(pen, [{ x: J.x, y: J.y + 2.2 * h }, { x: J.x - dir * 1.2 * h, y: J.y + 1.7 * h }, { x: J.x, y: J.y + 1.2 * h }], true));
  if (spec.tail.trim()) {
    const end = { x: px(referenceLength), y: J.y };
    entities.push(
      line(pen, end, { x: px(referenceLength + 0.8 * h), y: J.y + 0.8 * h }),
      line(pen, end, { x: px(referenceLength + 0.8 * h), y: J.y - 0.8 * h }),
      mtext(pen, { x: px(referenceLength + 1.1 * h), y: J.y }, spec.tail.trim(), h, rightAnchor),
    );
  }
  return entities;
}

function formatWeldNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/* ─────────────────────────────── Acabado ─────────────────────────────── */

export type CadSurfaceFinishType = "basic" | "removal" | "prohibited";

export const CAD_SURFACE_TYPES: readonly { type: CadSurfaceFinishType; keyword: { keyword: string; shortcut: string }; label: string }[] = [
  { type: "removal", keyword: { keyword: "Mecanizado", shortcut: "M" }, label: "con arranque de material" },
  { type: "basic", keyword: { keyword: "Básico", shortcut: "B" }, label: "básico (cualquier proceso)" },
  { type: "prohibited", keyword: { keyword: "Prohibido", shortcut: "P" }, label: "sin arranque de material" },
];

/** Direcciones de las estrías de ISO 1302, con su símbolo. */
export const CAD_SURFACE_LAYS: readonly { keyword: { keyword: string; shortcut: string }; symbol: string; label: string }[] = [
  { keyword: { keyword: "Ninguna", shortcut: "N" }, symbol: "", label: "sin dirección" },
  { keyword: { keyword: "Paralela", shortcut: "P" }, symbol: "=", label: "paralela" },
  { keyword: { keyword: "peRpendicular", shortcut: "R" }, symbol: "⊥", label: "perpendicular" },
  { keyword: { keyword: "cruZada", shortcut: "Z" }, symbol: "X", label: "cruzada" },
  { keyword: { keyword: "Multidireccional", shortcut: "M" }, symbol: "M", label: "multidireccional" },
  { keyword: { keyword: "Circular", shortcut: "C" }, symbol: "C", label: "circular" },
  { keyword: { keyword: "rAdial", shortcut: "A" }, symbol: "R", label: "radial" },
];

export interface CadSurfaceSpec {
  type: CadSurfaceFinishType;
  /** Ra en µm; 0 = sin valor. */
  ra: number;
  /** Símbolo de dirección de estrías; vacío = ninguno. */
  lay: string;
  /** Punto de apoyo sobre la superficie. */
  at: CadPoint2;
  /** Giro en grados (el de la superficie). */
  rotation: number;
  height: number;
  layer: string;
}

export const CAD_SURFACE_MARK = "surface";

export function cadSurfaceMetadata(spec: Pick<CadSurfaceSpec, "type" | "ra" | "lay">): CadEntityMetadata {
  return { mechanical: CAD_SURFACE_MARK, surfaceType: spec.type, surfaceRa: spec.ra, surfaceLay: spec.lay };
}

/** Las dos patas a 60°, la barra o el círculo, la línea de requisitos, Ra y la dirección de estrías. */
export function cadSurfaceSymbolEntities(spec: CadSurfaceSpec, newId: () => string): CadNativeEntity[] {
  const pen: Pen = { layer: spec.layer, metadata: cadSurfaceMetadata(spec), newId };
  const h = spec.height;
  const radians = (spec.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const place = (x: number, y: number): CadPoint2 => ({ x: spec.at.x + x * cos - y * sin, y: spec.at.y + x * sin + y * cos });
  const cot60 = Math.tan(Math.PI / 6);
  const shortTop = 1.4 * h;
  const longTop = 2.8 * h;
  const entities: CadNativeEntity[] = [
    line(pen, place(0, 0), place(-shortTop * cot60, shortTop)),
    line(pen, place(0, 0), place(longTop * cot60, longTop)),
  ];
  if (spec.type === "removal") entities.push(line(pen, place(-shortTop * cot60, shortTop), place(shortTop * cot60, shortTop)));
  if (spec.type === "prohibited") entities.push(circle(pen, place(0, h), 0.5 * h));
  const hasRequirements = spec.ra > 0 || spec.lay.length > 0;
  if (hasRequirements) entities.push(line(pen, place(longTop * cot60, longTop), place(longTop * cot60 + 3.5 * h, longTop)));
  if (spec.ra > 0) entities.push(mtext(pen, place(longTop * cot60 + 0.3 * h, 2.1 * h), `Ra ${Number(spec.ra.toFixed(3))}`, h, "middle-left", spec.rotation));
  if (spec.lay) entities.push(mtext(pen, place(longTop * cot60 + 0.3 * h, 0.7 * h), spec.lay, h, "middle-left", spec.rotation));
  return entities;
}
