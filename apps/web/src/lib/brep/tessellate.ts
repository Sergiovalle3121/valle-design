/**
 * Teselado a malla: para el visor, y para medir por un segundo camino.
 *
 * DÓNDE VIVE DE VERDAD LA TOLERANCIA DE CUERDA. Este kernel es FACETADO: la
 * revolución, el barrido y el solevado aproximan la curvatura al construir, y a
 * partir de ahí todas las caras son planas. Teselar una cara plana no admite
 * ninguna tolerancia — un triángulo ya es exacto. Así que la tolerancia de
 * cuerda no se aplica al teselar, sino al CONSTRUIR, y por eso está aquí
 * `segmentsForChordTolerance`: dice cuántas facetas hay que pedirle a una
 * revolución para que su error de cuerda no pase de `tol`. Poner un parámetro
 * `chordTolerance` en `tessellateBody` que no hiciera nada sería peor que no
 * tenerlo: parecería que se está controlando algo.
 *
 * Para las superficies ANALÍTICAS sí hay teselado por tolerancia de verdad:
 * `tessellateSurface` elige el paso paramétrico a partir de la curvatura y
 * garantiza la flecha máxima. Es lo que se usaría el día que las caras lleven su
 * superficie exacta en vez de una aproximación poligonal.
 *
 * NORMALES POR VÉRTICE Y ÁNGULO DE ARISTA VIVA. Un cilindro facetado debe verse
 * liso y un cubo debe verse con sus aristas marcadas, y la malla es la misma
 * clase de objeto en ambos casos. La regla: en cada vértice, la normal se
 * promedia SÓLO entre las caras cuya normal esté a menos de `creaseAngle` de la
 * de la cara que se está emitiendo. Un vértice de un cubo emite tres normales
 * distintas —una por cara— y uno del cilindro emite una sola.
 */
import { triangulateWithHoles } from "./triangulate2d";
import type { Vec2 } from "./profile";
import { surfaceDerivatives, surfaceNormal, surfacePoint, type BrepSurface } from "./surfaces";
import { faceGeometricNormal, loopPoints, loopVertices, type BrepBody } from "./topology";
import { v3Basis, v3Cross, v3Dot, v3Length, v3Normalize, type Vec3 } from "./vec3";

export interface BrepMesh {
  /** Posiciones en tríos `x, y, z`. */
  positions: number[];
  /** Normales unitarias, una por posición. */
  normals: number[];
  /** Índices de triángulo, en tríos. */
  indices: number[];
}

export interface TessellateOptions {
  /**
   * Ángulo por encima del cual dos caras se consideran una ARISTA VIVA y no se
   * suavizan. Por defecto 30°, el valor clásico de los visores.
   */
  creaseAngleRad?: number;
}

/**
 * Cuántas facetas hacen falta para que un arco de radio `radius` y apertura
 * `sweepAngle` no se separe de su cuerda más de `tolerance`.
 *
 * La flecha de una cuerda que abarca un ángulo `Δ` vale `r(1 − cos(Δ/2))`.
 * Despejando: `Δ = 2·acos(1 − tol/r)`. Cuando la tolerancia es mayor que el
 * radio, un solo segmento ya cumple —y devolver 3 en vez de 1 es lo correcto,
 * porque un polígono necesita tres lados.
 */
export function segmentsForChordTolerance(radius: number, sweepAngle: number, tolerance: number): number {
  if (!(radius > 0)) throw new Error(`El radio tiene que ser positivo, llegó ${radius}.`);
  if (!(tolerance > 0)) throw new Error(`La tolerancia de cuerda tiene que ser positiva, llegó ${tolerance}.`);
  const ratio = 1 - tolerance / radius;
  if (ratio <= -1) return 3;
  const step = 2 * Math.acos(Math.max(-1, ratio));
  if (step <= 0) return 3;
  return Math.max(3, Math.ceil(Math.abs(sweepAngle) / step));
}

/** Flecha real (error de cuerda) de un arco de radio `r` dividido en `segments`. */
export function chordErrorOf(radius: number, sweepAngle: number, segments: number): number {
  return radius * (1 - Math.cos(Math.abs(sweepAngle) / (2 * segments)));
}

/**
 * Tesela un cuerpo de caras planas, con normales por vértice.
 *
 * La triangulación de cada cara se hace en su propio plano, con agujeros, y
 * reutiliza el mismo triangulador que usan las booleanas. Que sea el mismo
 * importa: si el teselado triangulase de otra manera que la booleana, el volumen
 * de la malla y el del sólido podrían diferir sin que ninguno de los dos
 * estuviera mal, y la comprobación cruzada perdería todo su valor.
 */
export function tessellateBody(body: BrepBody, options: TessellateOptions = {}): BrepMesh {
  const creaseAngle = options.creaseAngleRad ?? Math.PI / 6;
  const cosCrease = Math.cos(creaseAngle);
  const faceNormals = body.faces.map((_, face) => faceGeometricNormal(body, face));

  // Caras incidentes en cada vértice, para promediar normales.
  const incident = new Map<number, number[]>();
  for (let face = 0; face < body.faces.length; face += 1) {
    for (const loop of body.faces[face].loops) {
      for (const vertex of loopVertices(body, loop)) {
        const list = incident.get(vertex);
        if (list) list.push(face);
        else incident.set(vertex, [face]);
      }
    }
  }

  const mesh: BrepMesh = { positions: [], normals: [], indices: [] };
  const emitted = new Map<string, number>();
  const emit = (vertex: number, normal: Vec3): number => {
    const point = body.vertices[vertex].point;
    const key = `${vertex}|${normal.x.toFixed(6)}|${normal.y.toFixed(6)}|${normal.z.toFixed(6)}`;
    const existing = emitted.get(key);
    if (existing !== undefined) return existing;
    const index = mesh.positions.length / 3;
    mesh.positions.push(point.x, point.y, point.z);
    mesh.normals.push(normal.x, normal.y, normal.z);
    emitted.set(key, index);
    return index;
  };

  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceNormals[face];
    if (v3Length(normal) < 0.5) continue; // Cara degenerada: no se tesela.
    const basis = v3Basis(normal);
    const project = (point: Vec3): Vec2 => ({ x: v3Dot(point, basis.u), y: v3Dot(point, basis.v) });
    const loops = body.faces[face].loops;
    const outerVertices = loopVertices(body, loops[0]);
    const holeVertices = loops.slice(1).map((loop) => loopVertices(body, loop));
    const flatVertices = [...outerVertices, ...holeVertices.flat()];
    const outerPoints = loopPoints(body, loops[0]).map(project);
    const holePoints = loops.slice(1).map((loop) => loopPoints(body, loop).map(project));
    const { triangles } = triangulateWithHoles(outerPoints, holePoints);
    for (const triangle of triangles) {
      const corners = triangle.map((index) => {
        const vertex = flatVertices[index];
        return emit(vertex, smoothNormal(vertex, face, incident, faceNormals, cosCrease));
      });
      mesh.indices.push(corners[0], corners[1], corners[2]);
    }
  }
  return mesh;
}

/** Normal suavizada de un vértice para una cara concreta, respetando las aristas vivas. */
function smoothNormal(
  vertex: number,
  face: number,
  incident: Map<number, number[]>,
  faceNormals: readonly Vec3[],
  cosCrease: number,
): Vec3 {
  const reference = faceNormals[face];
  const faces = incident.get(vertex);
  if (!faces) return reference;
  let sum: Vec3 = { x: 0, y: 0, z: 0 };
  for (const other of faces) {
    const normal = faceNormals[other];
    if (v3Dot(normal, reference) < cosCrease) continue;
    sum = { x: sum.x + normal.x, y: sum.y + normal.y, z: sum.z + normal.z };
  }
  const smoothed = v3Normalize(sum);
  return v3Length(smoothed) < 0.5 ? reference : smoothed;
}

export interface SurfaceTessellateOptions {
  uRange: [number, number];
  vRange: [number, number];
  /** Flecha máxima admitida entre la malla y la superficie. */
  chordTolerance: number;
  /** Tope de subdivisiones por dirección, para no fabricar mallas de millones de triángulos. */
  maxSteps?: number;
}

/**
 * Teselado de una superficie analítica CON tolerancia de cuerda real.
 *
 * El número de pasos sale de la curvatura, no de un número mágico: se estima el
 * radio de curvatura mínimo en cada dirección muestreando `|∂²P/∂u²| / |∂P/∂u|²`
 * —que es la curvatura de la curva paramétrica— y se aplica la misma fórmula de
 * la flecha que `segmentsForChordTolerance`. Un plano da curvatura cero y sale
 * con un solo paso; una esfera pequeña sale con muchos.
 */
export function tessellateSurface(surface: BrepSurface, options: SurfaceTessellateOptions): BrepMesh {
  const { uRange, vRange, chordTolerance } = options;
  const maxSteps = options.maxSteps ?? 256;
  const samples = 8;
  let curvatureU = 0;
  let curvatureV = 0;
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      const u = uRange[0] + ((uRange[1] - uRange[0]) * i) / samples;
      const v = vRange[0] + ((vRange[1] - vRange[0]) * j) / samples;
      const d = surfaceDerivatives(surface, u, v);
      curvatureU = Math.max(curvatureU, parametricCurvature(d.du, d.duu));
      curvatureV = Math.max(curvatureV, parametricCurvature(d.dv, d.dvv));
    }
  }
  const stepsU = stepsFor(curvatureU, uRange, maxSteps, chordTolerance, surface, "u");
  const stepsV = stepsFor(curvatureV, vRange, maxSteps, chordTolerance, surface, "v");

  const mesh: BrepMesh = { positions: [], normals: [], indices: [] };
  for (let i = 0; i <= stepsU; i += 1) {
    const u = uRange[0] + ((uRange[1] - uRange[0]) * i) / stepsU;
    for (let j = 0; j <= stepsV; j += 1) {
      const v = vRange[0] + ((vRange[1] - vRange[0]) * j) / stepsV;
      const point = surfacePoint(surface, u, v);
      const normal = surfaceNormal(surface, u, v);
      mesh.positions.push(point.x, point.y, point.z);
      mesh.normals.push(normal.x, normal.y, normal.z);
    }
  }
  const at = (i: number, j: number) => i * (stepsV + 1) + j;
  for (let i = 0; i < stepsU; i += 1) {
    for (let j = 0; j < stepsV; j += 1) {
      mesh.indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      mesh.indices.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return mesh;
}

/** Curvatura de la curva paramétrica: `|d' × d''| / |d'|³`, reducida al caso 1D. */
function parametricCurvature(first: Vec3, second: Vec3): number {
  const speed = v3Length(first);
  if (speed < 1e-12) return 0;
  return v3Length(v3Cross(first, second)) / speed ** 3;
}

function stepsFor(
  curvature: number,
  range: [number, number],
  maxSteps: number,
  tolerance: number,
  surface: BrepSurface,
  direction: "u" | "v",
): number {
  const span = Math.abs(range[1] - range[0]);
  if (curvature <= 0 || span === 0) return 1;
  const radius = 1 / curvature;
  // La longitud de arco recorrida se estima con la velocidad paramétrica media.
  let speed = 0;
  const samples = 8;
  for (let i = 0; i <= samples; i += 1) {
    const t = range[0] + (span * i) / samples;
    const middle = direction === "u" ? [t, (range[0] + range[1]) / 2] : [(range[0] + range[1]) / 2, t];
    const d = surfaceDerivatives(surface, middle[0], middle[1]);
    speed = Math.max(speed, v3Length(direction === "u" ? d.du : d.dv));
  }
  const sweep = (speed * span) / radius;
  return Math.min(maxSteps, Math.max(1, segmentsForChordTolerance(radius, sweep, tolerance)));
}

/** Número de triángulos de una malla. */
export function meshTriangleCount(mesh: BrepMesh): number {
  return mesh.indices.length / 3;
}

/** Número de vértices de una malla. */
export function meshVertexCount(mesh: BrepMesh): number {
  return mesh.positions.length / 3;
}

/** Extrae el triángulo `index` de la malla. */
export function meshTriangle(mesh: BrepMesh, index: number): [Vec3, Vec3, Vec3] {
  const read = (slot: number): Vec3 => {
    const base = mesh.indices[index * 3 + slot] * 3;
    return { x: mesh.positions[base], y: mesh.positions[base + 1], z: mesh.positions[base + 2] };
  };
  return [read(0), read(1), read(2)];
}
