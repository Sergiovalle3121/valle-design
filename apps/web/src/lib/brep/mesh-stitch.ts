/**
 * Cosedor de malla → sólido: la mitad que le faltaba al kernel para una
 * importación real de SketchUp/glTF/OBJ/STL/COLLADA.
 *
 * QUÉ RESUELVE. Un lector de malla (`lib/cad/interop/`) entrega triángulos o
 * polígonos sueltos, con vértices duplicados por cada cara que los toca y sin
 * ninguna noción de "esto es una sola cara". `polygonsToBody` (`boolean.ts`) ya
 * suelda y cose las uniones en T, pero construye UNA cara B-rep por cada
 * polígono de entrada: el techo plano de una caja triangulada por Blender o
 * SketchUp sale como un abanico de N triángulos, nunca como una cara. Esto es
 * exactamente lo que `lib/brep/index.ts` documenta como ausente ("fusión de
 * caras coplanarias") y lo que separa un visor de una migración: sin caras de
 * verdad no hay `EXTRUDE`, ni `FILLET` de una arista real, ni un STEP legible
 * en otro programa.
 *
 * EL CAMINO, y por qué en ese orden:
 *
 *   1. SOLDAR CON TOLERANCIA RELATIVA. `BodyBuilder.addVertex` suelda con
 *      tolerancia ABSOLUTA y devuelve el PRIMER vecino dentro de tolerancia,
 *      no el más cercano, sin unión de conjuntos: la soldadura no es
 *      transitiva. Un STL en float32 de un modelo de 10 000 unidades tiene
 *      ruido ~1e-7 relativo que una tolerancia absoluta de 1e-7 no cierra.
 *      Aquí se suelda con `scaledLinearTolerance` y unión-find: todo punto
 *      dentro de tolerancia de cualquier otro del mismo racimo cae en el
 *      mismo vértice, sin importar el orden de llegada, y el representante es
 *      el CENTROIDE del racimo — no "el primero que pasó por ahí".
 *   2. TRIANGULAR Y COSER. Cada cara de entrada (triángulo o polígono) se
 *      triangula con `triangulateWithHoles` y se entrega a `polygonsToBody`,
 *      que suelda de nuevo (ya casi no hay nada que soldar) y COSE LAS
 *      UNIONES EN T reutilizando su `healTJunctions` interno — no se reescribe
 *      aquí. El resultado es un cuerpo válido, pero con una cara por triángulo.
 *   3. FUSIONAR COPLANARIAS. Sobre ESE cuerpo ya cosido y con adyacencia por
 *      media-arista fiable, se agrupan las caras vecinas coplanarias
 *      (BFS acotado por ángulo y distancia al plano) y se disuelve el borde
 *      compartido de cada grupo para obtener un contorno exterior y sus
 *      agujeros — la detección de lazos interiores en 3D que tampoco existía.
 *      Un grupo cuyo borde no cierra en un contorno simple (vértice pinza,
 *      more de un lazo positivo) NO se fusiona: se queda como triángulos
 *      sueltos y se declara en el manifiesto, nunca se adivina.
 *   4. VALIDAR. `validateBody` corre siempre; por defecto, un cuerpo inválido
 *      hace LANZAR a esta función, con el mismo criterio que las booleanas:
 *      decirlo aquí es la diferencia entre "este archivo no es un sólido" y
 *      "el CAD se rompió al abrirlo".
 *
 * LÍMITES DECLARADOS, para no fingir más de lo que hay:
 *   · Un patrón coplanario con un vértice de pinza (dos lazos de borde que se
 *     tocan en un solo punto) no se fusiona: es una forma no simplemente
 *     conexa y fusionarla a ciegas arriesga una cara con la orientación mal
 *     resuelta. Se queda sin fusionar, declarado.
 *   · Los agujeros que detecta son los que aparecen como borde de un grupo
 *     coplanario real (una losa con un taladro pasante triangulada alrededor
 *     del hueco). Un agujero que la malla de origen nunca modeló como tal no
 *     se puede inventar aquí.
 */
import { makePolygon, type CsgPolygon } from "./csg-bsp";
import { polygonsToBody } from "./boolean";
import { buildBody, type FaceSpec } from "./body-builder";
import { attachPlanarSurfaces } from "./primitives";
import { validateBody, type BrepValidation } from "./invariants";
import { triangulateWithHoles } from "./triangulate2d";
import { BREP_TOLERANCE, resolveTolerance, scaledLinearTolerance, type BrepTolerance } from "./tolerance";
import {
  NO_INDEX,
  faceGeometricNormal,
  faceOuterLoop,
  loopSignedArea,
  loopVertices,
  type BrepBody,
} from "./topology";
import { aabbDiagonal, aabbFromPoints, v3Basis, v3Dot, v3Length, v3Scale, v3Sub, type Vec3 } from "./vec3";

export interface MeshStitchLossEntry {
  code: string;
  detail: string;
  severity: "info" | "warning" | "error";
  count?: number;
}

export interface MeshStitchInput {
  /** Vértices SIN soldar, en las unidades del documento destino. */
  points: readonly Vec3[];
  /**
   * Caras como lazos de índices en `points`, ANTIHORARIO visto desde fuera del
   * sólido (el convenio de todo `lib/brep/`). Triángulos (STL, glTF) o
   * polígonos (OBJ, COLLADA) por igual: se triangulan aquí.
   */
  faces: readonly (readonly number[])[];
}

export interface MeshStitchOptions {
  tolerance?: Partial<BrepTolerance>;
  /**
   * Factor relativo de soldadura, aplicado sobre la diagonal del modelo vía
   * `scaledLinearTolerance`. `1e-5` da margen holgado sobre el ruido de un
   * float32 (~1e-7 relativo) sin fundir vértices que de verdad están
   * separados. Se expone porque un modelo a escala de detalle (una bisagra en
   * metros con roscas en milímetros) puede necesitar un valor más fino.
   */
  weldRelativeFactor?: number;
  /** Validar el resultado y lanzar si rompe algún invariante. Por defecto SÍ. */
  validate?: boolean;
  /** Exigir cuerpo cerrado. Por defecto SÍ: una malla importada que no cierra es un fallo del archivo, no del cosedor. */
  requireClosed?: boolean;
  /** Techo defensivo de vértices de entrada, independiente de cualquier tope de producto. */
  maxInputVertices?: number;
  /** Techo defensivo de caras de entrada. */
  maxInputFaces?: number;
}

export interface MeshStitchStats {
  rawVertices: number;
  weldedVertices: number;
  rawFaces: number;
  triangleCount: number;
  stitchedFaces: number;
  coplanarGroupsMerged: number;
  tolerance: number;
}

export interface MeshStitchResult {
  body: BrepBody;
  validation: BrepValidation;
  loss: MeshStitchLossEntry[];
  stats: MeshStitchStats;
}

const DEFAULT_MAX_INPUT_VERTICES = 2_000_000;
const DEFAULT_MAX_INPUT_FACES = 2_000_000;
const DEFAULT_WELD_RELATIVE_FACTOR = 1e-5;

/** Unión-find con compresión de camino y unión por rango: soldadura TRANSITIVA. */
class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    let current = x;
    while (this.parent[current] !== root) {
      const next = this.parent[current];
      this.parent[current] = root;
      current = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
    } else if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
    } else {
      this.parent[rootB] = rootA;
      this.rank[rootA] += 1;
    }
  }
}

interface WeldedMesh {
  points: Vec3[];
  faces: number[][];
  loss: MeshStitchLossEntry[];
}

/**
 * Suelda vértices dentro de tolerancia con unión-find y representa cada
 * racimo por su CENTROIDE.
 *
 * La rejilla usa celdas de lado `tolerance`: dos puntos que caen en celdas
 * vecinas (a lo sumo una de separación) se comparan; los que caen a más de
 * una celda de distancia nunca se prueban entre sí porque ya están más lejos
 * que la tolerancia. Es la misma idea que `BodyBuilder`, con la diferencia que
 * importa: aquí CUALQUIER par dentro de tolerancia se une, no sólo el primero
 * que se encuentra, así que tres puntos A–B–C con A~B y B~C dentro de
 * tolerancia (aunque A y C no lo estén directamente) terminan en el mismo
 * vértice — que es justamente lo que hace falta para cerrar una costura de
 * malla con ruido de punto flotante repartido a lo largo de la arista.
 */
function weldMeshVertices(input: MeshStitchInput, tolerance: number): WeldedMesh {
  const raw = input.points;
  const uf = new UnionFind(raw.length);
  const cellOf = (p: Vec3) => ({
    x: Math.floor(p.x / tolerance),
    y: Math.floor(p.y / tolerance),
    z: Math.floor(p.z / tolerance),
  });
  const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < raw.length; i += 1) {
    const c = cellOf(raw[i]);
    const k = key(c.x, c.y, c.z);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }
  for (let i = 0; i < raw.length; i += 1) {
    const c = cellOf(raw[i]);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = grid.get(key(c.x + dx, c.y + dy, c.z + dz));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            if (v3Length(v3Sub(raw[i], raw[j])) <= tolerance) uf.union(i, j);
          }
        }
      }
    }
  }

  // Centroide por racimo: se calcula por acumulación para no guardar listas.
  const rootOf = new Array<number>(raw.length);
  const sum = new Map<number, Vec3>();
  const count = new Map<number, number>();
  for (let i = 0; i < raw.length; i += 1) {
    const root = uf.find(i);
    rootOf[i] = root;
    const s = sum.get(root);
    if (s) sum.set(root, { x: s.x + raw[i].x, y: s.y + raw[i].y, z: s.z + raw[i].z });
    else sum.set(root, { ...raw[i] });
    count.set(root, (count.get(root) ?? 0) + 1);
  }
  const weldedIndexOfRoot = new Map<number, number>();
  const points: Vec3[] = [];
  for (const [root, total] of sum) {
    const n = count.get(root) ?? 1;
    weldedIndexOfRoot.set(root, points.length);
    points.push(v3Scale(total, 1 / n));
  }
  const remap = (rawIndex: number) => weldedIndexOfRoot.get(rootOf[rawIndex])!;

  const loss: MeshStitchLossEntry[] = [];
  let degenerateAfterWeld = 0;
  const faces: number[][] = [];
  for (const face of input.faces) {
    const indices: number[] = [];
    for (const rawIndex of face) {
      const welded = remap(rawIndex);
      if (indices.length > 0 && indices[indices.length - 1] === welded) continue;
      indices.push(welded);
    }
    while (indices.length > 1 && indices[0] === indices[indices.length - 1]) indices.pop();
    if (indices.length < 3) {
      degenerateAfterWeld += 1;
      continue;
    }
    faces.push(indices);
  }
  if (degenerateAfterWeld > 0) {
    loss.push({
      code: "mesh_face_degenerate_after_weld",
      severity: "warning",
      count: degenerateAfterWeld,
      detail: `${degenerateAfterWeld} cara(s) de la malla quedaron con menos de 3 vértices distintos tras soldar y se descartaron.`,
    });
  }
  return { points, faces, loss };
}

/** Triangula cada cara de entrada (ya soldada) y arma los `CsgPolygon` para `polygonsToBody`. */
function triangulateFaces(points: readonly Vec3[], faces: readonly number[][]): { polygons: CsgPolygon[]; loss: MeshStitchLossEntry[] } {
  const polygons: CsgPolygon[] = [];
  let zeroArea = 0;
  for (const face of faces) {
    const loopPoints3 = face.map((index) => points[index]);
    if (face.length === 3) {
      const polygon = makePolygon(loopPoints3);
      if (polygon) polygons.push(polygon);
      else zeroArea += 1;
      continue;
    }
    // Polígono de más de 3 lados (OBJ, COLLADA): se proyecta a 2D sobre su
    // propio plano (Newell, vía `makePolygon` sólo para obtener la normal) y
    // se triangula reutilizando `triangulateWithHoles` en vez de escribir otro
    // ear-clipping — la misma técnica que `bodyToPolygons` usa para caras B-rep.
    const seed = makePolygon(loopPoints3);
    if (!seed) {
      zeroArea += 1;
      continue;
    }
    const basis = v3Basis(seed.plane.normal);
    const project = (p: Vec3) => ({ x: v3Dot(p, basis.u), y: v3Dot(p, basis.v) });
    const { triangles } = triangulateWithHoles(loopPoints3.map(project));
    for (const [i, j, k] of triangles) {
      const polygon = makePolygon([loopPoints3[i], loopPoints3[j], loopPoints3[k]]);
      if (polygon) polygons.push(polygon);
      else zeroArea += 1;
    }
  }
  const loss: MeshStitchLossEntry[] = [];
  if (zeroArea > 0) {
    loss.push({
      code: "mesh_triangle_zero_area",
      severity: "warning",
      count: zeroArea,
      detail: `${zeroArea} triángulo(s) de área nula (vértices colineales) se descartaron al triangular.`,
    });
  }
  return { polygons, loss };
}

interface CoplanarPatch {
  faces: number[];
}

/** Agrupa caras (triangulares) vecinas por adyacencia de arista Y coplanaridad, con BFS desde cada semilla no visitada. */
function groupCoplanarFaces(body: BrepBody, tolerance: number): CoplanarPatch[] {
  const scale = Math.max(1, aabbDiagonal(aabbFromPoints(body.vertices.map((v) => v.point))));
  const planarTolerance = tolerance * scale;
  const angularCos = Math.cos(Math.max(BREP_TOLERANCE.angular * 1_000, 1e-6));
  const faceCount = body.faces.length;
  const visited = new Array<boolean>(faceCount).fill(false);
  const patches: CoplanarPatch[] = [];

  // Adyacencia real por gemela de media-arista: ya validada 2-variedad por
  // `buildBody` al construir `body`, así que no hace falta reconstruirla.
  const neighborsOf = (face: number): number[] => {
    const out: number[] = [];
    for (const loop of body.faces[face].loops) {
      let he = body.loops[loop].first;
      const start = he;
      do {
        const twin = body.halfEdges[he].twin;
        if (twin !== NO_INDEX) out.push(body.loops[body.halfEdges[twin].loop].face);
        he = body.halfEdges[he].next;
      } while (he !== start);
    }
    return out;
  };

  for (let seed = 0; seed < faceCount; seed += 1) {
    if (visited[seed]) continue;
    visited[seed] = true;
    const refNormal = faceGeometricNormal(body, seed);
    const refPoint = loopVertices(body, faceOuterLoop(body, seed)).map((v) => body.vertices[v].point)[0];
    const group = [seed];
    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const neighbor of neighborsOf(current)) {
        if (visited[neighbor]) continue;
        const normal = faceGeometricNormal(body, neighbor);
        if (v3Dot(normal, refNormal) < angularCos) continue;
        const verts = loopVertices(body, faceOuterLoop(body, neighbor)).map((v) => body.vertices[v].point);
        const onPlane = verts.every((p) => Math.abs(v3Dot(v3Sub(p, refPoint), refNormal)) <= planarTolerance);
        if (!onPlane) continue;
        visited[neighbor] = true;
        group.push(neighbor);
        queue.push(neighbor);
      }
    }
    patches.push({ faces: group });
  }
  return patches;
}

/**
 * Disuelve el borde compartido de un grupo coplanario en un contorno exterior
 * y sus agujeros. Devuelve `null` si el borde no traza un contorno simple —
 * un vértice de pinza, o más de un lazo con área positiva — y entonces el
 * grupo se queda SIN fusionar en vez de adivinar una topología.
 */
function dissolvePatchBoundary(body: BrepBody, patch: CoplanarPatch): { outer: number[]; inners: number[][] } | null {
  const directedCount = new Map<string, number>();
  for (const face of patch.faces) {
    const verts = loopVertices(body, faceOuterLoop(body, face));
    for (let i = 0; i < verts.length; i += 1) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const k = `${a}>${b}`;
      directedCount.set(k, (directedCount.get(k) ?? 0) + 1);
    }
  }

  const boundaryFrom = new Map<number, number[]>();
  for (const [k, count] of directedCount) {
    const [aStr, bStr] = k.split(">");
    const a = Number(aStr);
    const b = Number(bStr);
    const reverse = directedCount.get(`${b}>${a}`) ?? 0;
    if (count > 1 || reverse > 1) return null; // arista repetida en el mismo grupo: anomalía, no se fusiona.
    if (reverse === 0) {
      const list = boundaryFrom.get(a) ?? [];
      list.push(b);
      boundaryFrom.set(a, list);
    }
  }
  if (boundaryFrom.size === 0) return null;

  const usedEdge = new Set<string>();
  const loops: number[][] = [];
  for (const [start, tos] of boundaryFrom) {
    for (const firstTo of tos) {
      if (usedEdge.has(`${start}>${firstTo}`)) continue;
      const loop = [start];
      let current = start;
      let next = firstTo;
      const limit = boundaryFrom.size + 4;
      let steps = 0;
      for (;;) {
        usedEdge.add(`${current}>${next}`);
        if (next === start) break;
        loop.push(next);
        const options = (boundaryFrom.get(next) ?? []).filter((option) => !usedEdge.has(`${next}>${option}`));
        if (options.length !== 1) return null; // borde ambiguo (pinza) o cortado: no se fusiona.
        current = next;
        next = options[0];
        steps += 1;
        if (steps > limit) return null;
      }
      loops.push(loop);
    }
  }

  const normal = faceGeometricNormal(body, patch.faces[0]);
  const withArea = loops.map((loop) => ({
    loop,
    area: loopSignedArea(loop.map((v) => body.vertices[v].point), normal),
  }));
  const outer = withArea.filter((w) => w.area > 0);
  const inner = withArea.filter((w) => w.area <= 0);
  if (outer.length !== 1) return null; // 0 o >1 contorno exterior: no es un disco simple con agujeros.
  return { outer: outer[0].loop, inners: inner.map((w) => w.loop) };
}

/**
 * Cose una malla (triángulos o polígonos sueltos, con vértices repetidos) en
 * un `BrepBody` con caras de verdad. Ver la cabecera del archivo para el
 * porqué de cada paso.
 */
export function stitchMeshToBody(input: MeshStitchInput, options: MeshStitchOptions = {}): MeshStitchResult {
  const maxVertices = options.maxInputVertices ?? DEFAULT_MAX_INPUT_VERTICES;
  const maxFaces = options.maxInputFaces ?? DEFAULT_MAX_INPUT_FACES;
  if (input.points.length > maxVertices) {
    throw new Error(`La malla tiene ${input.points.length} vértices; el cosedor acepta como mucho ${maxVertices}.`);
  }
  if (input.faces.length > maxFaces) {
    throw new Error(`La malla tiene ${input.faces.length} caras; el cosedor acepta como mucho ${maxFaces}.`);
  }
  for (const face of input.faces) {
    if (face.length < 3) throw new Error(`Una cara de la malla trae ${face.length} vértice(s); hacen falta al menos 3.`);
  }
  for (const point of input.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new Error("La malla trae una coordenada no finita (NaN o infinito): el archivo de origen está corrupto.");
    }
  }

  const baseTolerance = resolveTolerance(options.tolerance);
  const modelSize = aabbDiagonal(aabbFromPoints(input.points));
  const tolerance = scaledLinearTolerance(modelSize, baseTolerance, options.weldRelativeFactor ?? DEFAULT_WELD_RELATIVE_FACTOR);

  const welded = weldMeshVertices(input, tolerance);
  const { polygons, loss: triangulationLoss } = triangulateFaces(welded.points, welded.faces);
  if (polygons.length === 0) {
    throw new Error("Ninguna cara de la malla produjo un triángulo válido: no hay nada que coser.");
  }

  // `polygonsToBody` suelda de nuevo y cose las uniones en T con su
  // `healTJunctions` interno: una cara por triángulo, cuerpo ya válido.
  const triangulatedBody = polygonsToBody(polygons, tolerance);

  const patches = groupCoplanarFaces(triangulatedBody, tolerance);
  const finalFaces: FaceSpec[] = [];
  let unmergedTriangles = 0;
  let groupsMerged = 0;
  for (const patch of patches) {
    if (patch.faces.length === 1) {
      const [face] = patch.faces;
      finalFaces.push({ outer: loopVertices(triangulatedBody, faceOuterLoop(triangulatedBody, face)) });
      continue;
    }
    const dissolved = dissolvePatchBoundary(triangulatedBody, patch);
    if (!dissolved) {
      for (const face of patch.faces) {
        finalFaces.push({ outer: loopVertices(triangulatedBody, faceOuterLoop(triangulatedBody, face)) });
      }
      unmergedTriangles += patch.faces.length;
      continue;
    }
    finalFaces.push({ outer: dissolved.outer, inners: dissolved.inners.length > 0 ? dissolved.inners : undefined });
    groupsMerged += 1;
  }

  const loss: MeshStitchLossEntry[] = [...welded.loss, ...triangulationLoss];
  if (unmergedTriangles > 0) {
    loss.push({
      code: "mesh_coplanar_group_not_simple",
      severity: "info",
      count: unmergedTriangles,
      detail:
        `${unmergedTriangles} triángulo(s) coplanario(s) no se fusionaron en una cara porque su borde compartido ` +
        "no traza un contorno simple (vértice de pinza o más de un lazo exterior): quedaron como triángulos sueltos, " +
        "geométricamente idénticos pero sin fusionar, en vez de arriesgar una cara con la topología adivinada.",
    });
  }

  const body = attachPlanarSurfaces(buildBody(triangulatedBody.vertices.map((v) => v.point), finalFaces));
  const requireClosed = options.requireClosed ?? true;
  const validation = validateBody(body, { requireClosed, tolerance: options.tolerance });
  if ((options.validate ?? true) && !validation.ok) {
    const detail = validation.violations
      .slice(0, 8)
      .map((violation) => `  · [${violation.kind}] ${violation.message}`)
      .join("\n");
    throw new Error(
      `La malla cosida rompe ${validation.violations.length} invariante(s) de sólido:\n${detail}\n` +
        "Esto NO es un visor: sin un sólido válido no se puede exportar, restar ni redondear.",
    );
  }

  return {
    body,
    validation,
    loss,
    stats: {
      rawVertices: input.points.length,
      weldedVertices: welded.points.length,
      rawFaces: input.faces.length,
      triangleCount: polygons.length,
      stitchedFaces: body.faces.length,
      coplanarGroupsMerged: groupsMerged,
      tolerance,
    },
  };
}
