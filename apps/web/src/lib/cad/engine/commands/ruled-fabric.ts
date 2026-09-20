/**
 * Tejido compartido de RULESURF, TABSURF y EDGESURF: una rejilla de puntos 3D
 * REALES se convierte en un sólido delgado cerrado.
 *
 * ## Por qué esto y no `extrude` de un contorno
 *
 * La auditoría del 19-sep midió que RULESURF, TABSURF y EDGESURF sólo leían
 * `x, y` de sus curvas —la Z se tiraba— y que el «espesor» se aplicaba
 * extruyendo un contorno PLANO en XY. Con dos curvas a distinta cota eso da una
 * lámina aplastada en el plano de una de las dos, no la superficie reglada
 * entre ambas.
 *
 * `extrudeProfile` no sirve para arreglarlo: extruye un perfil PLANO a lo largo
 * de la normal de un marco, y una superficie reglada entre curvas a distinta Z
 * no es plana. La cara de arriba de un RULESURF entre dos rectas a cotas
 * distintas es un cuadrilátero ALABEADO — sus cuatro vértices no están en un
 * plano común — y una cara del kernel B-rep tiene que ser plana
 * (`requirePlanarFaces`, ver `invariants.ts`).
 *
 * Así que esto teje la rejilla A MANO: cada celda `[i][j]-[i][j+1]-[i+1][j+1]-
 * [i+1][j]` se parte en dos triángulos —SIEMPRE planos, no hace falta
 * comprobarlo— con las posiciones REALES de la rejilla, sin aplanar nada. El
 * mismo tejido se desfasa `thickness` hacia dentro para dar la cara de abajo, y
 * el perímetro entre ambas cierra las paredes laterales. El resultado es un
 * sólido delgado —sigue haciendo falta un espesor para que el esquema 5 lo
 * acepte como SOLID3D— pero con la forma de verdad: sus vértices de la cara de
 * arriba son EXACTAMENTE los puntos de la rejilla que se le pasó, comprobables
 * uno a uno desde un spec.
 */
import {
  BodyBuilder,
  bodyToFaceSpecs,
  newellNormal,
  planarBodyVolume,
  reverseBody,
  v3Add,
  v3Length,
  v3Scale,
  vec3,
  type BrepBody,
  type Vec3,
} from "../../../brep";
import type { CadPoint3 } from "../../cad-document";

/** Espesor del sólido delgado que representa una superficie. Ver `surfaces.ts`. */
export const SURFACE_THICKNESS = 0.001;

export interface ThinGridSolid {
  points: CadPoint3[];
  faces: { outer: number[] }[];
}

export type ThinGridResult = { ok: true; solid: ThinGridSolid } | { ok: false; reason: string };

/**
 * Recorre el perímetro de una rejilla `rows × cols` una sola vez: fila 0
 * completa, columna última de arriba a abajo, fila última de vuelta, columna 0
 * de vuelta arriba. Con `rows = 2` esto es exactamente «fila A de ida, fila B
 * de vuelta» — el contorno de una banda reglada clásica.
 */
function boundaryPath(rows: number, cols: number): [number, number][] {
  const path: [number, number][] = [];
  for (let j = 0; j < cols; j += 1) path.push([0, j]);
  for (let i = 1; i < rows; i += 1) path.push([i, cols - 1]);
  for (let j = cols - 2; j >= 0; j -= 1) path.push([rows - 1, j]);
  for (let i = rows - 2; i >= 1; i -= 1) path.push([i, 0]);
  return path;
}

function toVec3(p: CadPoint3): Vec3 {
  return vec3(p.x, p.y, p.z);
}

/** Cara por CUATRO puntos `a→b→c→d`, teselada por la diagonal `a-c`. */
function addQuad(builder: BodyBuilder, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  builder.addPolygon([a, b, c]);
  builder.addPolygon([a, c, d]);
}

/**
 * Construye el sólido delgado de una rejilla `grid[i][j]` de puntos 3D reales.
 *
 * `grid` tiene que ser rectangular (todas las filas con el mismo número de
 * columnas) y al menos `2×2`. El espesor se resta a lo largo de la normal
 * MEDIA del contorno (Newell sobre el perímetro, que da una normal razonable
 * incluso si la rejilla no es exactamente plana) — la cara de arriba SON las
 * posiciones que se pasaron, sin desfasar, y sólo la de abajo se mueve.
 */
export function thinGridSolid(
  grid: readonly (readonly CadPoint3[])[],
  thickness: number,
): ThinGridResult {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  if (rows < 2 || cols < 2) {
    return { ok: false, reason: `la rejilla tiene ${rows}×${cols} puntos: hacen falta al menos 2×2.` };
  }
  for (const row of grid) {
    if (row.length !== cols) {
      return { ok: false, reason: "las filas de la rejilla no tienen todas el mismo número de puntos." };
    }
  }
  if (!(thickness > 0)) {
    return { ok: false, reason: `el espesor tiene que ser positivo (llegó ${thickness}).` };
  }

  const boundaryIndex = boundaryPath(rows, cols);
  const boundaryTop = boundaryIndex.map(([i, j]) => toVec3(grid[i][j]));
  const rawNormal = newellNormal(boundaryTop);
  const normalLength = v3Length(rawNormal);
  if (!(normalLength > 1e-9)) {
    return {
      ok: false,
      reason:
        "el contorno es degenerado (sus puntos son colineales o coincidentes): no define una superficie con área.",
    };
  }
  const down = v3Scale(rawNormal, -thickness / normalLength);

  const top = (i: number, j: number): Vec3 => toVec3(grid[i][j]);
  const bottom = (i: number, j: number): Vec3 => v3Add(top(i, j), down);

  const builder = new BodyBuilder();

  // Tejido de arriba: las posiciones REALES de la rejilla, sin desfasar.
  for (let i = 0; i < rows - 1; i += 1) {
    for (let j = 0; j < cols - 1; j += 1) {
      addQuad(builder, top(i, j), top(i, j + 1), top(i + 1, j + 1), top(i + 1, j));
    }
  }
  // Tejido de abajo: las mismas celdas desfasadas, con el sentido invertido.
  for (let i = 0; i < rows - 1; i += 1) {
    for (let j = 0; j < cols - 1; j += 1) {
      addQuad(builder, bottom(i, j), bottom(i + 1, j), bottom(i + 1, j + 1), bottom(i, j + 1));
    }
  }
  // Paredes laterales: el perímetro de arriba contra el mismo perímetro desfasado.
  // Cada pared es un paralelogramo —los dos lados difieren en el mismo vector
  // `down`— así que siempre es plana; no hace falta partirla en triángulos.
  //
  // El orden importa: el tejido de ARRIBA ya recorre cada arista del perímetro
  // en el sentido `k → siguiente` (es la arista exterior de su propio
  // triángulo). Una arista compartida la recorren sus dos caras en sentidos
  // OPUESTOS —es la regla de half-edge que exige `BodyBuilder`—, así que la
  // pared lateral tiene que recorrer esa misma arista al revés.
  const boundaryBottom = boundaryIndex.map(([i, j]) => v3Add(top(i, j), down));
  for (let k = 0; k < boundaryIndex.length; k += 1) {
    const next = (k + 1) % boundaryIndex.length;
    builder.addPolygon([boundaryTop[next], boundaryTop[k], boundaryBottom[k], boundaryBottom[next]]);
  }

  let body: BrepBody;
  try {
    body = builder.build();
  } catch (error) {
    return {
      ok: false,
      reason: `no se pudo coser la superficie: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // El sentido de la rejilla no se adivina a mano: se cose y, si el volumen
  // sale negativo, se le da la vuelta al cuerpo entero. Es la misma corrección
  // que documenta `extrude.ts` para la revolución, aplicada aquí por medición
  // en vez de por convenio de índices.
  if (planarBodyVolume(body) < 0) body = reverseBody(body);

  const specs = bodyToFaceSpecs(body);
  return {
    ok: true,
    solid: {
      points: body.vertices.map((vertex) => ({ x: vertex.point.x, y: vertex.point.y, z: vertex.point.z })),
      faces: specs.map((spec) => ({
        outer: spec.outer,
        ...(spec.inners && spec.inners.length > 0 ? { inners: spec.inners } : {}),
      })),
    },
  };
}

// --- Muestreo de curvas en 3D, preservando la Z --------------------------------

/** Puntos de una línea o polilínea, EN 3D. `null` si la entidad no es una curva. */
export function sampleCurve3D(entity: {
  type: string;
  vertices?: readonly CadPoint3[];
  start?: CadPoint3;
  end?: CadPoint3;
}): CadPoint3[] | string {
  if (entity.type === "polyline" && entity.vertices) {
    const verts = entity.vertices;
    if (verts.length < 2) return "la curva tiene menos de 2 vertices.";
    return verts.map((v) => ({ x: v.x, y: v.y, z: v.z }));
  }
  if (entity.type === "line" && entity.start && entity.end) {
    return [
      { x: entity.start.x, y: entity.start.y, z: entity.start.z },
      { x: entity.end.x, y: entity.end.y, z: entity.end.z },
    ];
  }
  return "solo se aceptan polilineas o lineas como curvas de contorno.";
}

export function segmentLength3D(points: readonly CadPoint3[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
  }
  return len;
}

function pointAtDistance3D(points: readonly CadPoint3[], dist: number): CadPoint3 {
  let acc = 0;
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z,
    );
    if (acc + seg >= dist || i === points.length - 1) {
      const t = seg > 0 ? (dist - acc) / seg : 0;
      return {
        x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
        y: points[i - 1].y + t * (points[i].y - points[i - 1].y),
        z: points[i - 1].z + t * (points[i].z - points[i - 1].z),
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

/** Remuestrea una curva 3D a `count` puntos repartidos por longitud de arco REAL (con Z). */
export function resample3D(points: readonly CadPoint3[], count: number): CadPoint3[] {
  if (points.length === count) return points.map((p) => ({ ...p }));
  if (count <= 1) return [{ ...points[0] }];
  const totalLen = segmentLength3D(points);
  const result: CadPoint3[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    result.push(pointAtDistance3D(points, t * totalLen));
  }
  return result;
}

/** ¿Van `a` y `b` en sentidos opuestos? (producto escalar de sus cuerdas extremo a extremo, en 3D). */
export function needsReverse3D(a: readonly CadPoint3[], b: readonly CadPoint3[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const chordA = { x: a[a.length - 1].x - a[0].x, y: a[a.length - 1].y - a[0].y, z: a[a.length - 1].z - a[0].z };
  const chordB = { x: b[b.length - 1].x - b[0].x, y: b[b.length - 1].y - b[0].y, z: b[b.length - 1].z - b[0].z };
  return chordA.x * chordB.x + chordA.y * chordB.y + chordA.z * chordB.z < 0;
}

/** Distancia 3D entre dos puntos, para comprobar que dos bordes empalman. */
export function distance3D(a: CadPoint3, b: CadPoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
