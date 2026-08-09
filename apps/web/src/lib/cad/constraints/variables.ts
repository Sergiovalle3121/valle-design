/**
 * Parametrización de las entidades: de geometría a variables y vuelta.
 *
 * Un solucionador no restringe «una línea»: restringe NÚMEROS. Este módulo
 * decide qué números son, y esa decisión tiene consecuencias que se notan al
 * usarlo.
 *
 * Una línea se podría describir por sus dos extremos (ax, ay, bx, by). Son
 * cuatro variables igual que aquí, pero con esa elección la corrección de norma
 * mínima de «hazte paralela a aquélla» —cuando se parte de perpendicular— es
 * ENCOGER la línea hasta longitud cero, porque el punto más cercano de la recta
 * solución es el origen. Con (centro, ángulo, longitud) el paralelismo sólo
 * depende del ángulo, así que la corrección gira la línea sobre su punto medio y
 * conserva su longitud: exactamente lo que espera quien dibuja, y lo que hacía
 * el aplicador de una sola restricción que había antes.
 *
 * Cada forma declara además su TAMAÑO CARACTERÍSTICO. Sirve para que un radián
 * y un milímetro sean comparables al medir «cuánto se ha movido» la solución: en
 * una línea de un metro, girar 0,001 rad desplaza el extremo 1 mm. Sin esa
 * escala, el solucionador prefiere sistemáticamente girar antes que trasladar en
 * los dibujos grandes, y al revés en los pequeños.
 */
import type { CadEntity } from "../cad-document";
import { dualConst, dualVar, type Dual } from "./autodiff";

const DEG = Math.PI / 180;

export type CadVariableRole = "length" | "angle" | "ratio";

/**
 * Forma geométrica de la parametrización. NO es el tipo de entidad: un muro
 * heredado y una LINE comparten la forma `segment`, y por eso comparten
 * restricciones sin que nada más lo sepa.
 */
export type CadParametrizationForm = "segment" | "circle" | "arc" | "ellipse" | "points";

export interface CadEntityParametrization {
  entityId: string;
  form: CadParametrizationForm;
  /** Tipo de entidad del documento, para los mensajes de rechazo. */
  entityType: CadEntity["type"];
  values: number[];
  roles: CadVariableRole[];
  scale: number;
  /** Reconstruye la entidad. `null` si los valores son degenerados o no finitos. */
  build(values: readonly number[]): CadEntity | null;
}

const finiteAll = (values: readonly number[]): boolean => values.every(Number.isFinite);

/**
 * Parametriza una entidad, o devuelve `null` si su tipo no participa en el
 * dibujo paramétrico (texto, cota, bloque insertado…).
 */
export function parametrizeCadEntity(entity: CadEntity): CadEntityParametrization | null {
  if (entity.type === "line") return segmentParametrization(entity);
  if (entity.type === "box") return entity.kind === "wall" && entity.w > 0 ? wallParametrization(entity) : null;
  if (entity.type === "circle") return circleParametrization(entity);
  if (entity.type === "arc") return arcParametrization(entity);
  if (entity.type === "ellipse") return ellipseParametrization(entity);
  if (entity.type === "polyline") return polylineParametrization(entity);
  if (entity.type === "spline") return splineParametrization(entity);
  return null;
}

function segmentParametrization(
  entity: Extract<CadEntity, { type: "line" }>,
): CadEntityParametrization {
  const dx = entity.end.x - entity.start.x;
  const dy = entity.end.y - entity.start.y;
  const length = Math.hypot(dx, dy);
  const values = [
    (entity.start.x + entity.end.x) / 2,
    (entity.start.y + entity.end.y) / 2,
    length > 0 ? Math.atan2(dy, dx) : 0,
    length,
  ];
  return {
    entityId: entity.id,
    form: "segment",
    entityType: "line",
    values,
    roles: ["length", "length", "angle", "length"],
    scale: Math.max(length, 1e-6),
    build([cx, cy, angle, len]) {
      if (!finiteAll([cx, cy, angle, len]) || !(len > 1e-9)) return null;
      const hx = (Math.cos(angle) * len) / 2;
      const hy = (Math.sin(angle) * len) / 2;
      return {
        ...entity,
        start: { ...entity.start, x: cx - hx, y: cy - hy },
        end: { ...entity.end, x: cx + hx, y: cy + hy },
      };
    },
  };
}

/**
 * Muro heredado (`box` con `kind: "wall"`). Su eje es el segmento que va de
 * lado a lado a media altura, que es como lo trataba el solucionador anterior;
 * el grosor `h` no es una variable y se conserva intacto.
 */
function wallParametrization(
  entity: Extract<CadEntity, { type: "box" }>,
): CadEntityParametrization {
  const values = [
    entity.x + entity.w / 2,
    entity.y + entity.h / 2,
    entity.rotation * DEG,
    entity.w,
  ];
  return {
    entityId: entity.id,
    form: "segment",
    entityType: "box",
    values,
    roles: ["length", "length", "angle", "length"],
    scale: Math.max(entity.w, 1e-6),
    build([cx, cy, angle, len]) {
      if (!finiteAll([cx, cy, angle, len]) || !(len > 1e-9)) return null;
      return {
        ...entity,
        w: len,
        x: cx - len / 2,
        y: cy - entity.h / 2,
        rotation: (angle * 180) / Math.PI,
      };
    },
  };
}

function circleParametrization(
  entity: Extract<CadEntity, { type: "circle" }>,
): CadEntityParametrization {
  return {
    entityId: entity.id,
    form: "circle",
    entityType: "circle",
    values: [entity.center.x, entity.center.y, entity.radius],
    roles: ["length", "length", "length"],
    scale: Math.max(entity.radius, 1e-6),
    build([cx, cy, radius]) {
      if (!finiteAll([cx, cy, radius]) || !(radius > 1e-9)) return null;
      return { ...entity, center: { ...entity.center, x: cx, y: cy }, radius };
    },
  };
}

function arcParametrization(
  entity: Extract<CadEntity, { type: "arc" }>,
): CadEntityParametrization {
  return {
    entityId: entity.id,
    form: "arc",
    entityType: "arc",
    // Los ángulos se llevan en RADIANES dentro del solucionador y vuelven a
    // grados al reconstruir: mezclar unidades en el jacobiano es un error que
    // no se ve, sólo se sufre.
    values: [
      entity.center.x,
      entity.center.y,
      entity.radius,
      entity.startAngle * DEG,
      entity.endAngle * DEG,
    ],
    roles: ["length", "length", "length", "angle", "angle"],
    scale: Math.max(entity.radius, 1e-6),
    build([cx, cy, radius, start, end]) {
      if (!finiteAll([cx, cy, radius, start, end]) || !(radius > 1e-9)) return null;
      const deg = (radians: number) => {
        const value = ((radians / DEG) % 360 + 360) % 360;
        return value;
      };
      return {
        ...entity,
        center: { ...entity.center, x: cx, y: cy },
        radius,
        startAngle: deg(start),
        endAngle: deg(end),
      };
    },
  };
}

function ellipseParametrization(
  entity: Extract<CadEntity, { type: "ellipse" }>,
): CadEntityParametrization {
  const major = Math.hypot(entity.majorAxis.x, entity.majorAxis.y);
  return {
    entityId: entity.id,
    form: "ellipse",
    entityType: "ellipse",
    values: [
      entity.center.x,
      entity.center.y,
      major > 0 ? Math.atan2(entity.majorAxis.y, entity.majorAxis.x) : 0,
      major,
      entity.ratio,
    ],
    roles: ["length", "length", "angle", "length", "ratio"],
    scale: Math.max(major, 1e-6),
    build([cx, cy, angle, major2, ratio]) {
      if (!finiteAll([cx, cy, angle, major2, ratio])) return null;
      if (!(major2 > 1e-9) || !(ratio > 1e-9)) return null;
      return {
        ...entity,
        center: { ...entity.center, x: cx, y: cy },
        majorAxis: { ...entity.majorAxis, x: Math.cos(angle) * major2, y: Math.sin(angle) * major2 },
        ratio,
      };
    },
  };
}

function polylineParametrization(
  entity: Extract<CadEntity, { type: "polyline" }>,
): CadEntityParametrization | null {
  if (entity.vertices.length < 2) return null;
  const values = entity.vertices.flatMap((vertex) => [vertex.x, vertex.y]);
  return {
    entityId: entity.id,
    form: "points",
    entityType: "polyline",
    values,
    roles: values.map(() => "length" as const),
    scale: Math.max(pointsScale(values), 1e-6),
    build(next) {
      if (!finiteAll([...next])) return null;
      return {
        ...entity,
        vertices: entity.vertices.map((vertex, index) => ({
          ...vertex,
          x: next[index * 2],
          y: next[index * 2 + 1],
        })),
      };
    },
  };
}

function splineParametrization(
  entity: Extract<CadEntity, { type: "spline" }>,
): CadEntityParametrization | null {
  if (entity.controlPoints.length < 2) return null;
  const values = entity.controlPoints.flatMap((point) => [point.x, point.y]);
  return {
    entityId: entity.id,
    form: "points",
    entityType: "spline",
    values,
    roles: values.map(() => "length" as const),
    scale: Math.max(pointsScale(values), 1e-6),
    build(next) {
      if (!finiteAll([...next])) return null;
      return {
        ...entity,
        controlPoints: entity.controlPoints.map((point, index) => ({
          ...point,
          x: next[index * 2],
          y: next[index * 2 + 1],
        })),
      };
    },
  };
}

/** Radio del conjunto de puntos respecto de su centroide. */
function pointsScale(values: readonly number[]): number {
  const count = values.length / 2;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < count; index += 1) {
    cx += values[index * 2];
    cy += values[index * 2 + 1];
  }
  cx /= count;
  cy /= count;
  let max = 0;
  for (let index = 0; index < count; index += 1)
    max = Math.max(max, Math.hypot(values[index * 2] - cx, values[index * 2 + 1] - cy));
  return max;
}

// ---------------------------------------------------------------------------
// Vista dual: los mismos números, ya derivables
// ---------------------------------------------------------------------------

export interface DualPoint {
  x: Dual;
  y: Dual;
}

/**
 * Lo que una restricción puede pedirle a una entidad. Un campo `null` significa
 * «esta forma no tiene eso», y el constructor de residuos lo convierte en un
 * rechazo con nombre en vez de inventarse una geometría.
 */
export interface DualGeometry {
  form: CadParametrizationForm;
  entityId: string;
  entityType: CadEntity["type"];
  center: DualPoint;
  start: DualPoint | null;
  end: DualPoint | null;
  /** Dirección principal como ángulo (segmento, eje mayor de la elipse). */
  angle: Dual | null;
  /** Vector director sin normalizar del segmento. */
  direction: DualPoint | null;
  length: Dual | null;
  /** Radio de círculo/arco; semieje mayor de la elipse. */
  radius: Dual | null;
  points: DualPoint[];
}

/**
 * Construye la vista dual de una entidad sobre un vector local de variables.
 * `offset` es dónde empieza su bloque; `size` el tamaño del vector local.
 */
export function dualGeometry(
  parametrization: CadEntityParametrization,
  offset: number,
  size: number,
  values: readonly number[],
): DualGeometry {
  const at = (index: number) => dualVar(values[offset + index], offset + index, size);
  const base = {
    form: parametrization.form,
    entityId: parametrization.entityId,
    entityType: parametrization.entityType,
  };

  if (parametrization.form === "segment") {
    const cx = at(0);
    const cy = at(1);
    const angle = at(2);
    const length = at(3);
    const half = { v: length.v / 2, g: length.g.map((value) => value / 2) };
    const cos = { v: Math.cos(angle.v), g: angle.g.map((value) => -Math.sin(angle.v) * value) };
    const sin = { v: Math.sin(angle.v), g: angle.g.map((value) => Math.cos(angle.v) * value) };
    const hx = mul(half, cos);
    const hy = mul(half, sin);
    const start = { x: sub(cx, hx), y: sub(cy, hy) };
    const end = { x: add(cx, hx), y: add(cy, hy) };
    return {
      ...base,
      center: { x: cx, y: cy },
      start,
      end,
      angle,
      direction: { x: mul(length, cos), y: mul(length, sin) },
      length,
      radius: null,
      points: [start, end],
    };
  }

  if (parametrization.form === "circle") {
    const cx = at(0);
    const cy = at(1);
    return {
      ...base,
      center: { x: cx, y: cy },
      start: null,
      end: null,
      angle: null,
      direction: null,
      length: null,
      radius: at(2),
      points: [{ x: cx, y: cy }],
    };
  }

  if (parametrization.form === "arc") {
    const cx = at(0);
    const cy = at(1);
    const radius = at(2);
    const startAngle = at(3);
    const endAngle = at(4);
    const onCircle = (angle: Dual): DualPoint => ({
      x: add(cx, mul(radius, { v: Math.cos(angle.v), g: angle.g.map((g) => -Math.sin(angle.v) * g) })),
      y: add(cy, mul(radius, { v: Math.sin(angle.v), g: angle.g.map((g) => Math.cos(angle.v) * g) })),
    });
    const start = onCircle(startAngle);
    const end = onCircle(endAngle);
    return {
      ...base,
      center: { x: cx, y: cy },
      start,
      end,
      angle: null,
      direction: null,
      length: null,
      radius,
      points: [start, end],
    };
  }

  if (parametrization.form === "ellipse") {
    const cx = at(0);
    const cy = at(1);
    return {
      ...base,
      center: { x: cx, y: cy },
      start: null,
      end: null,
      angle: at(2),
      direction: null,
      length: null,
      radius: at(3),
      points: [{ x: cx, y: cy }],
    };
  }

  const count = parametrization.values.length / 2;
  const points: DualPoint[] = [];
  for (let index = 0; index < count; index += 1)
    points.push({ x: at(index * 2), y: at(index * 2 + 1) });
  let cx = dualConst(0, size);
  let cy = dualConst(0, size);
  for (const point of points) {
    cx = add(cx, point.x);
    cy = add(cy, point.y);
  }
  const scale = 1 / count;
  return {
    ...base,
    center: { x: { v: cx.v * scale, g: cx.g.map((g) => g * scale) }, y: { v: cy.v * scale, g: cy.g.map((g) => g * scale) } },
    start: points[0],
    end: points[points.length - 1],
    angle: null,
    direction: { x: sub(points[points.length - 1].x, points[0].x), y: sub(points[points.length - 1].y, points[0].y) },
    length: null,
    radius: null,
    points,
  };
}

// Aritmética local mínima; `autodiff.ts` tiene la versión pública y comentada.
const add = (a: Dual, b: Dual): Dual => ({ v: a.v + b.v, g: a.g.map((value, i) => value + b.g[i]) });
const sub = (a: Dual, b: Dual): Dual => ({ v: a.v - b.v, g: a.g.map((value, i) => value - b.g[i]) });
const mul = (a: Dual, b: Dual): Dual => ({
  v: a.v * b.v,
  g: a.g.map((value, i) => b.v * value + a.v * b.g[i]),
});
