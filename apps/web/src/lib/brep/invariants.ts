/**
 * Validador de invariantes topológicos y geométricos (Fase 1).
 *
 * Este archivo es la razón por la que la topología va antes que las booleanas.
 * Una booleana sin un validador que corra DESPUÉS de cada operación es un
 * generador industrial de mallas rotas: el fallo no se manifiesta donde ocurre,
 * sino tres operaciones más tarde, cuando ya es imposible saber cuál de ellas lo
 * causó. Con `validateBody` detrás de cada paso, la operación culpable se
 * identifica sola.
 *
 * Se comprueban siete familias de invariantes, de lo estructural a lo
 * geométrico:
 *
 *   1. REFERENCIAS. Todo índice apunta a algo, `next`/`prev` son inversos,
 *      `twin` es recíproco y nunca es uno mismo, y cada media-arista pertenece
 *      al lazo que dice.
 *   2. LAZOS QUE CIERRAN. Siguiendo `next` se vuelve al principio, y el destino
 *      de cada media-arista es el origen de la siguiente. Esto último no es
 *      redundante: es lo que distingue un ciclo bien cosido de un ciclo que
 *      simplemente da la vuelta.
 *   3. DOS CARAS POR ARISTA. En un cuerpo cerrado, exactamente dos. Ni una
 *      (borde) ni tres (no variedad).
 *   4. SENTIDOS OPUESTOS. Las dos medias-aristas de una arista la recorren en
 *      direcciones contrarias. Es la forma combinatoria de "las normales son
 *      coherentes", y se comprueba sin mirar ni una coordenada.
 *   5. NORMALES SALIENTES. La forma geométrica de lo mismo: el volumen con
 *      signo de un cuerpo cerrado tiene que ser POSITIVO. Un sólido del revés da
 *      volumen negativo y no hay ninguna otra señal que lo delate.
 *   6. EULER-POINCARÉ. `V − E + F − R = 2(S − G)` con género entero y no
 *      negativo, y con el número de cáscaras contrastado contra la conectividad
 *      real por aristas — no contra lo que diga el campo `shell`.
 *   7. CARAS SANAS. Área no nula y planitud dentro de tolerancia cuando la cara
 *      se declara plana.
 *
 * `validateBody` NO lanza: devuelve el parte de daños completo. Un validador que
 * aborta en el primer fallo obliga a arreglar de uno en uno; uno que los lista
 * todos deja ver que en realidad hay UN error causando quince síntomas.
 */
import { resolveTolerance, type BrepTolerance } from "./tolerance";
import {
  NO_INDEX,
  bodyBounds,
  bodyIsClosed,
  connectedComponentCount,
  eulerCounts,
  faceGeometricNormal,
  facePlanarity,
  halfEdgeDestination,
  loopHalfEdges,
  planarBodyVolume,
  planarFaceArea,
  type BrepBody,
  type EulerCounts,
} from "./topology";
import { aabbDiagonal, v3Length } from "./vec3";

export type BrepViolationKind =
  | "reference"
  | "loop-not-closed"
  | "edge-face-count"
  | "edge-orientation"
  | "normal-orientation"
  | "euler-poincare"
  | "degenerate-face"
  | "non-planar-face"
  | "shell-mismatch";

export interface BrepViolation {
  kind: BrepViolationKind;
  message: string;
  /** Entidad implicada, para poder ir directo a ella al depurar. */
  entity?: { type: "vertex" | "half-edge" | "edge" | "loop" | "face" | "shell"; index: number };
}

export interface BrepValidationOptions {
  tolerance?: Partial<BrepTolerance>;
  /** Exigir que el cuerpo sea cerrado. Una lámina legítima pasa `false`. */
  requireClosed?: boolean;
  /** Exigir que todas las caras sean planas dentro de tolerancia. */
  requirePlanarFaces?: boolean;
  /** Género esperado. Cuando se indica, un desvío es un fallo. */
  expectedGenus?: number;
  /** Número de cáscaras esperado. */
  expectedShells?: number;
}

export interface BrepValidation {
  ok: boolean;
  violations: BrepViolation[];
  counts: EulerCounts;
  closed: boolean;
  /** Volumen con signo por integración sobre caras planas; `null` si hay caras curvas. */
  signedVolume: number | null;
}

/** Comprueba TODOS los invariantes y devuelve el parte completo. */
export function validateBody(body: BrepBody, options: BrepValidationOptions = {}): BrepValidation {
  const tol = resolveTolerance(options.tolerance);
  const violations: BrepViolation[] = [];
  const add = (kind: BrepViolationKind, message: string, entity?: BrepViolation["entity"]) => {
    violations.push({ kind, message, entity });
  };

  const structureOk = checkReferences(body, add);
  const closed = bodyIsClosed(body);
  const counts = eulerCounts(body);

  // Con las referencias rotas, el resto de recorridos daría bucles infinitos o
  // errores sin sentido. Se corta aquí a propósito: informar de quince síntomas
  // de un `next` mal cosido no ayuda a nadie.
  if (!structureOk) {
    return { ok: false, violations, counts, closed, signedVolume: null };
  }

  checkLoops(body, add);
  checkEdges(body, closed, add);
  checkShells(body, options, add);
  const { signedVolume, planar } = checkFacesAndVolume(body, tol, options, add);
  checkEuler(body, counts, options, add);

  if (options.requireClosed && !closed) {
    add("edge-face-count", "El cuerpo tiene aristas de borde y se pidió que fuera cerrado.");
  }

  return { ok: violations.length === 0, violations, counts, closed, signedVolume: planar ? signedVolume : null };
}

type Reporter = (kind: BrepViolationKind, message: string, entity?: BrepViolation["entity"]) => void;

function inRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** Familia 1: referencias. Devuelve `false` si la estructura no es recorrible. */
function checkReferences(body: BrepBody, add: Reporter): boolean {
  let ok = true;
  const fail = (kind: BrepViolationKind, message: string, entity?: BrepViolation["entity"]) => {
    ok = false;
    add(kind, message, entity);
  };

  for (let i = 0; i < body.halfEdges.length; i += 1) {
    const halfEdge = body.halfEdges[i];
    const at = { type: "half-edge" as const, index: i };
    if (!inRange(halfEdge.origin, body.vertices.length)) fail("reference", `Media-arista ${i}: origen inválido.`, at);
    if (!inRange(halfEdge.loop, body.loops.length)) fail("reference", `Media-arista ${i}: lazo inválido.`, at);
    if (!inRange(halfEdge.edge, body.edges.length)) fail("reference", `Media-arista ${i}: arista inválida.`, at);
    if (!inRange(halfEdge.next, body.halfEdges.length)) fail("reference", `Media-arista ${i}: next inválido.`, at);
    if (!inRange(halfEdge.prev, body.halfEdges.length)) fail("reference", `Media-arista ${i}: prev inválido.`, at);
    if (halfEdge.twin !== NO_INDEX && !inRange(halfEdge.twin, body.halfEdges.length)) {
      fail("reference", `Media-arista ${i}: twin inválido.`, at);
    }
  }
  if (!ok) return false;

  for (let i = 0; i < body.halfEdges.length; i += 1) {
    const halfEdge = body.halfEdges[i];
    const at = { type: "half-edge" as const, index: i };
    if (body.halfEdges[halfEdge.next].prev !== i) fail("reference", `Media-arista ${i}: next y prev no son inversos.`, at);
    if (halfEdge.twin !== NO_INDEX) {
      if (halfEdge.twin === i) fail("reference", `Media-arista ${i}: es su propia gemela.`, at);
      else if (body.halfEdges[halfEdge.twin].twin !== i) fail("reference", `Media-arista ${i}: la gemela no es recíproca.`, at);
      else if (body.halfEdges[halfEdge.twin].edge !== halfEdge.edge) {
        fail("reference", `Media-arista ${i}: la gemela pertenece a otra arista.`, at);
      }
    }
  }
  for (let i = 0; i < body.loops.length; i += 1) {
    const loop = body.loops[i];
    if (!inRange(loop.face, body.faces.length)) fail("reference", `Lazo ${i}: cara inválida.`, { type: "loop", index: i });
    if (!inRange(loop.first, body.halfEdges.length)) fail("reference", `Lazo ${i}: primera media-arista inválida.`, { type: "loop", index: i });
  }
  for (let i = 0; i < body.faces.length; i += 1) {
    const face = body.faces[i];
    if (face.loops.length === 0) fail("reference", `Cara ${i}: sin lazos.`, { type: "face", index: i });
    for (const loop of face.loops) {
      if (!inRange(loop, body.loops.length)) fail("reference", `Cara ${i}: lazo inválido ${loop}.`, { type: "face", index: i });
      else if (body.loops[loop].face !== i) fail("reference", `Cara ${i}: el lazo ${loop} dice pertenecer a otra cara.`, { type: "face", index: i });
    }
  }
  for (let i = 0; i < body.edges.length; i += 1) {
    const edge = body.edges[i];
    if (!inRange(edge.a, body.halfEdges.length)) fail("reference", `Arista ${i}: media-arista A inválida.`, { type: "edge", index: i });
    if (edge.b !== NO_INDEX && !inRange(edge.b, body.halfEdges.length)) {
      fail("reference", `Arista ${i}: media-arista B inválida.`, { type: "edge", index: i });
    }
  }
  return ok;
}

/** Familia 2: los lazos cierran, y el último vértice conecta con el primero. */
function checkLoops(body: BrepBody, add: Reporter): void {
  for (let i = 0; i < body.loops.length; i += 1) {
    let halfEdges: number[];
    try {
      halfEdges = loopHalfEdges(body, i);
    } catch (error) {
      add("loop-not-closed", `Lazo ${i}: ${(error as Error).message}`, { type: "loop", index: i });
      continue;
    }
    if (halfEdges.length < 3) {
      add("loop-not-closed", `Lazo ${i}: sólo ${halfEdges.length} medias-aristas, hacen falta 3.`, { type: "loop", index: i });
      continue;
    }
    for (const halfEdge of halfEdges) {
      if (body.halfEdges[halfEdge].loop !== i) {
        add("loop-not-closed", `Lazo ${i}: la media-arista ${halfEdge} pertenece al lazo ${body.halfEdges[halfEdge].loop}.`, {
          type: "loop",
          index: i,
        });
      }
    }
    for (let k = 0; k < halfEdges.length; k += 1) {
      const current = halfEdges[k];
      const next = halfEdges[(k + 1) % halfEdges.length];
      if (halfEdgeDestination(body, current) !== body.halfEdges[next].origin) {
        add(
          "loop-not-closed",
          `Lazo ${i}: la media-arista ${current} termina en el vértice ${halfEdgeDestination(body, current)} pero la siguiente empieza en ${body.halfEdges[next].origin}.`,
          { type: "loop", index: i },
        );
      }
    }
  }
}

/** Familias 3 y 4: dos caras por arista, recorridas en sentidos opuestos. */
function checkEdges(body: BrepBody, closed: boolean, add: Reporter): void {
  for (let i = 0; i < body.edges.length; i += 1) {
    const { a, b } = body.edges[i];
    const at = { type: "edge" as const, index: i };
    if (a === NO_INDEX) {
      add("edge-face-count", `Arista ${i}: sin ninguna media-arista.`, at);
      continue;
    }
    if (b === NO_INDEX) {
      if (closed) add("edge-face-count", `Arista ${i}: sólo una cara adyacente en un cuerpo declarado cerrado.`, at);
      continue;
    }
    const fromA = body.halfEdges[a].origin;
    const toA = halfEdgeDestination(body, a);
    const fromB = body.halfEdges[b].origin;
    const toB = halfEdgeDestination(body, b);
    if (fromA !== toB || toA !== fromB) {
      add(
        "edge-orientation",
        `Arista ${i}: sus dos medias-aristas no son opuestas (${fromA}→${toA} frente a ${fromB}→${toB}). Una de las dos caras está del revés.`,
        at,
      );
    }
    const faceA = body.loops[body.halfEdges[a].loop].face;
    const faceB = body.loops[body.halfEdges[b].loop].face;
    if (faceA === faceB && body.halfEdges[a].loop === body.halfEdges[b].loop) {
      add("edge-orientation", `Arista ${i}: sus dos medias-aristas están en el MISMO lazo (arista colgante).`, at);
    }
  }
}

/** Familia 6 (parte): la conectividad real manda sobre el campo `shell`. */
function checkShells(body: BrepBody, options: BrepValidationOptions, add: Reporter): void {
  const declared = body.shells.length;
  const actual = connectedComponentCount(body);
  if (declared !== actual) {
    add(
      "shell-mismatch",
      `El cuerpo declara ${declared} cáscara(s) pero su conectividad por aristas da ${actual}. Euler-Poincaré usa este número: con él mal, el género sale mal.`,
    );
  }
  for (let i = 0; i < body.shells.length; i += 1) {
    for (const face of body.shells[i].faces) {
      if (body.faces[face]?.shell !== i) {
        add("shell-mismatch", `Cáscara ${i}: la cara ${face} dice pertenecer a la cáscara ${body.faces[face]?.shell}.`, {
          type: "shell",
          index: i,
        });
      }
    }
  }
  if (options.expectedShells !== undefined && actual !== options.expectedShells) {
    add("shell-mismatch", `Se esperaban ${options.expectedShells} cáscara(s) y hay ${actual}.`);
  }
}

/** Familias 5 y 7: caras sanas y normales salientes. */
function checkFacesAndVolume(
  body: BrepBody,
  tol: BrepTolerance,
  options: BrepValidationOptions,
  add: Reporter,
): { signedVolume: number; planar: boolean } {
  const scale = Math.max(1, aabbDiagonal(bodyBounds(body)));
  // La tolerancia de ÁREA es el CUADRADO de la longitud mínima resoluble, no la
  // longitud. Comparar un área contra una longitud es un error de dimensiones, y
  // no es teórico: con `tol.linear·escala` una placa de 14 unidades rechazaba
  // caras de 1,3e−6 —astillas legítimas que salen de fragmentar coplanarias en
  // una booleana encadenada— mientras que en una pieza de 1 unidad dejaba pasar
  // caras mil veces peores. Lo que se quiere detectar es el área CERO: vértices
  // colineales, o un agujero mal orientado que resta en vez de sumar.
  const areaTolerance = (tol.linear * scale) ** 2;
  let planar = true;
  for (let i = 0; i < body.faces.length; i += 1) {
    const at = { type: "face" as const, index: i };
    const normal = faceGeometricNormal(body, i);
    if (v3Length(normal) < 0.5) {
      add("degenerate-face", `Cara ${i}: sus vértices son colineales, no define ninguna normal.`, at);
      planar = false;
      continue;
    }
    const area = planarFaceArea(body, i);
    if (area <= areaTolerance) {
      add(
        "degenerate-face",
        `Cara ${i}: área ${area.toExponential(3)} ≤ tolerancia. Un agujero mal orientado da exactamente esto (resta en vez de sumar).`,
        at,
      );
    }
    const planarity = facePlanarity(body, i);
    if (planarity > tol.linear * scale) {
      planar = false;
      if (options.requirePlanarFaces) {
        add("non-planar-face", `Cara ${i}: se desvía ${planarity.toExponential(3)} de su plano medio.`, at);
      }
    }
  }
  const signedVolume = planar ? planarBodyVolume(body) : 0;
  if (planar && bodyIsClosed(body) && signedVolume <= 0) {
    add(
      "normal-orientation",
      `Volumen con signo ${signedVolume.toExponential(3)} ≤ 0 en un cuerpo cerrado: las caras miran hacia DENTRO.`,
    );
  }
  return { signedVolume, planar };
}

/** Familia 6: Euler-Poincaré. */
function checkEuler(body: BrepBody, counts: EulerCounts, options: BrepValidationOptions, add: Reporter): void {
  if (!bodyIsClosed(body)) return; // La fórmula sólo aplica a cuerpos cerrados.
  const shells = connectedComponentCount(body);
  const genus = shells - counts.characteristic / 2;
  if (!Number.isInteger(genus)) {
    add(
      "euler-poincare",
      `χ = V−E+F−R = ${counts.characteristic} es IMPAR, así que el género saldría ${genus}. Una superficie cerrada no puede tener característica impar: falta o sobra una entidad.`,
    );
    return;
  }
  if (genus < 0) {
    add("euler-poincare", `Género ${genus} negativo: V=${counts.vertices} E=${counts.edges} F=${counts.faces} R=${counts.rings} S=${shells}.`);
    return;
  }
  if (options.expectedGenus !== undefined && genus !== options.expectedGenus) {
    add(
      "euler-poincare",
      `Género ${genus}, se esperaba ${options.expectedGenus}. V=${counts.vertices} E=${counts.edges} F=${counts.faces} R=${counts.rings} S=${shells}, χ=${counts.characteristic}.`,
    );
  }
}

/**
 * Igual que `validateBody` pero LANZA con el parte completo.
 *
 * Es la forma que usan las operaciones de modelado internamente: una booleana
 * que produce un sólido inválido debe fallar donde ocurre, no devolver algo roto
 * que reventará más tarde en el teselado.
 */
export function assertValidBody(body: BrepBody, options: BrepValidationOptions = {}, context = "cuerpo"): BrepValidation {
  const validation = validateBody(body, options);
  if (!validation.ok) {
    const detail = validation.violations.map((violation) => `  · [${violation.kind}] ${violation.message}`).join("\n");
    throw new Error(`Invariantes B-rep rotos en ${context}:\n${detail}`);
  }
  return validation;
}

/** Resumen de una línea, para logs y specs. */
export function describeValidation(validation: BrepValidation): string {
  const { vertices, edges, faces, rings, shells, characteristic, genus } = validation.counts;
  const state = validation.ok ? "válido" : `${validation.violations.length} violación(es)`;
  return `V=${vertices} E=${edges} F=${faces} R=${rings} S=${shells} χ=${characteristic} G=${genus} — ${state}`;
}
