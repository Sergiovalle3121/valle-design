/**
 * Booleanas: unión, diferencia e intersección.
 *
 * ALCANCE, DICHO ANTES QUE NADA. Estas booleanas operan sobre sólidos de caras
 * PLANAS. Todo lo que produce este kernel lo es —la revolución, el barrido y el
 * solevado facetan por construcción y parten los cuadriláteros alabeados—, así
 * que en la práctica cubren todo el catálogo. Lo que NO hay es intersección
 * exacta superficie-superficie: cortar un cilindro analítico contra una esfera
 * analítica y obtener la curva exacta de intersección no está implementado. Un
 * sólido con una cara curva no plana se rechaza con un mensaje que lo dice, en
 * lugar de producir un resultado que parece bueno.
 *
 * EL CICLO COMPLETO, y por qué cada paso está ahí:
 *
 *   1. TRIANGULAR. El BSP sólo sabe partir polígonos convexos. Además, partir
 *      una cara con agujeros exigiría clasificar sus lazos; triangulando, el
 *      problema desaparece.
 *   2. BSP. La clasificación dentro/fuera, en `csg-bsp.ts`.
 *   3. SOLDAR. Los fragmentos que salen del BSP comparten vértices
 *      geométricamente pero no como objetos. Sin soldar, cada arista queda
 *      partida en dos y el cuerpo sale lleno de bordes.
 *   4. COSER LAS T. Éste es el paso que casi nadie implementa y sin el cual el
 *      resultado NO es una variedad. Al partir un polígono por un plano aparece
 *      un vértice nuevo en mitad de una arista; el polígono vecino, que estaba
 *      entero a un lado, no se partió y sigue teniendo esa arista sin dividir. El
 *      vértice queda "colgando" en su interior: una unión en T. La arista corta
 *      tiene una sola cara y el validador la denuncia como borde, sobre un
 *      sólido que a la vista está perfectamente cerrado. Se arregla insertando
 *      cada vértice que caiga sobre una arista ajena en esa arista.
 *   5. VALIDAR. Euler-Poincaré y las normales, sobre el resultado. Una booleana
 *      que devuelve un sólido inválido tiene que fallar aquí, no en el teselado.
 *
 * LO QUE SE PIERDE POR EL CAMINO: las caras del resultado son triángulos. La
 * cara superior de un cubo al que se le ha restado algo deja de ser "una cara" y
 * pasa a ser un abanico de triángulos coplanarios. Es correcto —Euler-Poincaré
 * cuadra igual, y el volumen también— pero no es bonito, y una fusión de caras
 * coplanarias sería la mejora natural. No está hecha, y decirlo aquí es más útil
 * que dejar que se descubra mirando el resultado.
 */
import { BodyBuilder } from "./body-builder";
import { csgOperation, makePolygon, type CsgOperation, type CsgPolygon } from "./csg-bsp";
import { validateBody, type BrepValidation } from "./invariants";
import { attachPlanarSurfaces } from "./primitives";
import { resolveTolerance, type BrepTolerance } from "./tolerance";
import { triangulateWithHoles } from "./triangulate2d";
import type { Vec2 } from "./profile";
import {
  bodyBounds,
  faceGeometricNormal,
  facePlanarity,
  loopPoints,
  type BrepBody,
} from "./topology";
import { aabbDiagonal, aabbUnion, v3Basis, v3Cross, v3Dot, v3Length, v3Sub, type Vec3 } from "./vec3";

export interface BooleanOptions {
  tolerance?: Partial<BrepTolerance>;
  /**
   * Validar el resultado y lanzar si rompe algún invariante. Por defecto SÍ:
   * una booleana silenciosamente rota es el peor resultado posible, porque el
   * fallo aparece dos operaciones después.
   */
  validate?: boolean;
}

export interface BooleanResult {
  body: BrepBody;
  validation: BrepValidation;
}

/**
 * Convierte un cuerpo en la sopa de triángulos que come el BSP.
 *
 * Rechaza las caras no planas. Es la frontera del alcance declarado, y ponerla
 * aquí —en la entrada del algoritmo— hace que el mensaje señale la cara
 * concreta en lugar de aparecer como una malla rota al final.
 */
export function bodyToPolygons(body: BrepBody, tolerance?: Partial<BrepTolerance>): CsgPolygon[] {
  const tol = resolveTolerance(tolerance);
  const scale = Math.max(1, aabbDiagonal(bodyBounds(body)));
  const polygons: CsgPolygon[] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    const planarity = facePlanarity(body, face);
    if (planarity > tol.linear * scale) {
      throw new Error(
        `La cara ${face} se desvía ${planarity.toExponential(3)} de su plano: las booleanas de este kernel sólo operan sobre caras PLANAS. Facetea la geometría curva antes de combinarla.`,
      );
    }
    const normal = faceGeometricNormal(body, face);
    const basis = v3Basis(normal);
    const project = (point: Vec3): Vec2 => ({ x: v3Dot(point, basis.u), y: v3Dot(point, basis.v) });
    const loops = body.faces[face].loops.map((loop) => loopPoints(body, loop));
    const outer = loops[0];
    const holes = loops.slice(1);
    const flat = [...outer, ...holes.flat()];
    const { triangles } = triangulateWithHoles(outer.map(project), holes.map((hole) => hole.map(project)));
    for (const [i, j, k] of triangles) {
      const polygon = makePolygon([flat[i], flat[j], flat[k]]);
      if (polygon) polygons.push(polygon);
    }
  }
  return polygons;
}

/**
 * Reconstruye un cuerpo B-rep a partir de una sopa de polígonos: suelda, cose
 * las uniones en T y cierra la topología.
 */
export function polygonsToBody(polygons: readonly CsgPolygon[], tolerance: number): BrepBody {
  const welded = weldPolygons(polygons, tolerance);
  const healed = healTJunctions(welded.points, welded.loops, tolerance);
  const builder = new BodyBuilder(tolerance);
  for (const point of welded.points) builder.addVertex(point);
  for (const loop of healed) {
    if (loop.length >= 3) builder.addFace({ outer: loop });
  }
  return attachPlanarSurfaces(builder.build());
}

interface WeldedSoup {
  points: Vec3[];
  loops: number[][];
}

/** Funde vértices coincidentes con una rejilla espacial y descarta polígonos degenerados. */
function weldPolygons(polygons: readonly CsgPolygon[], tolerance: number): WeldedSoup {
  const points: Vec3[] = [];
  const grid = new Map<string, number[]>();
  const cellKey = (point: Vec3, dx: number, dy: number, dz: number) =>
    `${Math.floor(point.x / tolerance) + dx}|${Math.floor(point.y / tolerance) + dy}|${Math.floor(point.z / tolerance) + dz}`;
  const resolve = (point: Vec3): number => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = grid.get(cellKey(point, dx, dy, dz));
          if (!bucket) continue;
          for (const index of bucket) {
            if (v3Length(v3Sub(points[index], point)) <= tolerance) return index;
          }
        }
      }
    }
    const index = points.length;
    points.push({ ...point });
    const key = cellKey(point, 0, 0, 0);
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
    return index;
  };

  const loops: number[][] = [];
  for (const polygon of polygons) {
    const indices: number[] = [];
    for (const vertex of polygon.vertices) {
      const index = resolve(vertex);
      if (indices.length > 0 && indices[indices.length - 1] === index) continue;
      indices.push(index);
    }
    while (indices.length > 1 && indices[0] === indices[indices.length - 1]) indices.pop();
    if (indices.length < 3) continue;
    if (polygonArea(points, indices) <= tolerance * tolerance) continue;
    loops.push(indices);
  }
  return { points, loops };
}

function polygonArea(points: readonly Vec3[], indices: readonly number[]): number {
  let sum: Vec3 = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < indices.length; i += 1) {
    const a = points[indices[i]];
    const b = points[indices[(i + 1) % indices.length]];
    sum = { x: sum.x + (a.y * b.z - a.z * b.y), y: sum.y + (a.z * b.x - a.x * b.z), z: sum.z + (a.x * b.y - a.y * b.x) };
  }
  return v3Length(sum) / 2;
}

/**
 * Inserta en cada arista los vértices ajenos que caen sobre ella.
 *
 * Sin este paso el resultado de una booleana no es una variedad, y el síntoma
 * —"la arista 417 tiene una sola cara adyacente"— no dice nada sobre la causa.
 * La rejilla evita el O(aristas × vértices) que en un sólido de miles de caras
 * convierte una booleana en una espera.
 */
function healTJunctions(points: readonly Vec3[], loops: readonly number[][], tolerance: number): number[][] {
  if (points.length === 0) return loops.map((loop) => [...loop]);
  let box = { min: { ...points[0] }, max: { ...points[0] } };
  for (const point of points) {
    box = {
      min: { x: Math.min(box.min.x, point.x), y: Math.min(box.min.y, point.y), z: Math.min(box.min.z, point.z) },
      max: { x: Math.max(box.max.x, point.x), y: Math.max(box.max.y, point.y), z: Math.max(box.max.z, point.z) },
    };
  }
  const diagonal = Math.max(aabbDiagonal(box), tolerance);
  const cell = Math.max(diagonal / 40, tolerance * 4);
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`;
  const cellOf = (point: Vec3) => ({
    x: Math.floor(point.x / cell),
    y: Math.floor(point.y / cell),
    z: Math.floor(point.z / cell),
  });
  for (let i = 0; i < points.length; i += 1) {
    const c = cellOf(points[i]);
    const k = key(c.x, c.y, c.z);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  }

  const out: number[][] = [];
  for (const loop of loops) {
    const rebuilt: number[] = [];
    for (let i = 0; i < loop.length; i += 1) {
      const from = loop[i];
      const to = loop[(i + 1) % loop.length];
      rebuilt.push(from);
      const a = points[from];
      const b = points[to];
      const direction = v3Sub(b, a);
      const lengthSq = v3Dot(direction, direction);
      if (lengthSq === 0) continue;
      const lo = cellOf({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) });
      const hi = cellOf({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) });
      const candidates: Array<{ index: number; t: number }> = [];
      const seen = new Set<number>();
      for (let x = lo.x - 1; x <= hi.x + 1; x += 1) {
        for (let y = lo.y - 1; y <= hi.y + 1; y += 1) {
          for (let z = lo.z - 1; z <= hi.z + 1; z += 1) {
            const bucket = grid.get(key(x, y, z));
            if (!bucket) continue;
            for (const index of bucket) {
              if (index === from || index === to || seen.has(index)) continue;
              seen.add(index);
              const t = v3Dot(v3Sub(points[index], a), direction) / lengthSq;
              if (t <= 0 || t >= 1) continue;
              const distance = v3Length(v3Cross(v3Sub(points[index], a), direction)) / Math.sqrt(lengthSq);
              if (distance > tolerance) continue;
              candidates.push({ index, t });
            }
          }
        }
      }
      candidates.sort((p, q) => p.t - q.t);
      for (const candidate of candidates) {
        if (rebuilt[rebuilt.length - 1] !== candidate.index) rebuilt.push(candidate.index);
      }
    }
    const cleaned: number[] = [];
    for (const index of rebuilt) {
      if (cleaned.length > 0 && cleaned[cleaned.length - 1] === index) continue;
      cleaned.push(index);
    }
    while (cleaned.length > 1 && cleaned[0] === cleaned[cleaned.length - 1]) cleaned.pop();
    out.push(cleaned);
  }
  return out;
}

/** Núcleo común de las tres operaciones. */
function applyBoolean(operation: CsgOperation, a: BrepBody, b: BrepBody, options: BooleanOptions = {}): BooleanResult {
  const tol = resolveTolerance(options.tolerance);
  const scale = Math.max(1, aabbDiagonal(aabbUnion(bodyBounds(a), bodyBounds(b))));
  // La banda muerta del BSP se escala con el modelo. Un umbral absoluto que
  // funciona en milímetros clasifica mal en kilómetros, y al revés.
  const epsilon = tol.linear * scale;
  const polygons = csgOperation(operation, bodyToPolygons(a, options.tolerance), bodyToPolygons(b, options.tolerance), epsilon);
  if (polygons.length === 0) {
    throw new Error(
      `La operación «${operation}» no dejó ninguna cara: el resultado es el sólido VACÍO. Es un resultado legítimo (intersecar dos sólidos disjuntos, restar un sólido de sí mismo), pero no hay ningún B-rep que lo represente: un cuerpo sin caras no es un sólido vacío, es un cuerpo roto. Usa \`tryBoolean\`, que devuelve \`null\`, si el vacío entra en lo esperado.`,
    );
  }
  const body = polygonsToBody(polygons, epsilon);
  const validation = validateBody(body, { requireClosed: true, tolerance: options.tolerance });
  if ((options.validate ?? true) && !validation.ok) {
    const detail = validation.violations
      .slice(0, 8)
      .map((violation) => `  · [${violation.kind}] ${violation.message}`)
      .join("\n");
    throw new Error(
      `La operación «${operation}» produjo un sólido que rompe ${validation.violations.length} invariante(s):\n${detail}`,
    );
  }
  return { body, validation };
}

/** `A ∪ B`. */
export function booleanUnion(a: BrepBody, b: BrepBody, options?: BooleanOptions): BrepBody {
  return applyBoolean("union", a, b, options).body;
}

/** `A − B`. */
export function booleanDifference(a: BrepBody, b: BrepBody, options?: BooleanOptions): BrepBody {
  return applyBoolean("difference", a, b, options).body;
}

/** `A ∩ B`. */
export function booleanIntersection(a: BrepBody, b: BrepBody, options?: BooleanOptions): BrepBody {
  return applyBoolean("intersection", a, b, options).body;
}

/** Variante que devuelve también el parte de validación, para specs y diagnóstico. */
export function booleanWithReport(
  operation: CsgOperation,
  a: BrepBody,
  b: BrepBody,
  options?: BooleanOptions,
): BooleanResult {
  return applyBoolean(operation, a, b, options);
}

/**
 * Igual que las anteriores pero devolviendo `null` cuando el resultado es vacío.
 *
 * El vacío es un resultado LEGÍTIMO —intersecar dos sólidos disjuntos, restar un
 * sólido de sí mismo— que la representación B-rep no sabe expresar: un cuerpo
 * con cero caras no es "el sólido vacío", es un cuerpo roto. Devolver `null`
 * obliga a quien llama a decidir qué hacer, en vez de dejarle un objeto que
 * pasa los tipos y revienta en el primer recorrido.
 */
export function tryBoolean(
  operation: CsgOperation,
  a: BrepBody,
  b: BrepBody,
  options?: BooleanOptions,
): BrepBody | null {
  const tol = resolveTolerance(options?.tolerance);
  const epsilon = tol.linear * Math.max(1, aabbDiagonal(aabbUnion(bodyBounds(a), bodyBounds(b))));
  const polygons = csgOperation(operation, bodyToPolygons(a, options?.tolerance), bodyToPolygons(b, options?.tolerance), epsilon);
  if (polygons.length === 0) return null;
  return applyBoolean(operation, a, b, options).body;
}

/** Escala característica usada por las booleanas; expuesta para poder razonar sobre tolerancias. */
export function booleanEpsilon(a: BrepBody, b: BrepBody, tolerance?: Partial<BrepTolerance>): number {
  const tol = resolveTolerance(tolerance);
  return tol.linear * Math.max(1, aabbDiagonal(aabbUnion(bodyBounds(a), bodyBounds(b))));
}
