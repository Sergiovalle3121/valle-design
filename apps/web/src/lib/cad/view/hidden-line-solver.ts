/**
 * Qué se ve y qué se tapa, cuando el cuerpo es CÓNCAVO y hay más de uno.
 *
 * ## Por qué existe este archivo teniendo ya `hidden-lines.ts`
 *
 * Aquél clasifica por caras traseras: una arista se oculta si sus DOS caras
 * miran para el otro lado. Es O(V+E+F), se puede llamar en cada cuadro y sobre
 * un cuerpo CONVEXO es la verdad. Sobre cualquier otra cosa no lo es, y su
 * propia cabecera lo dice: devuelve `exact: false` y manda al consumidor al
 * búfer de profundidad.
 *
 * Eso vale para sombrear una pantalla y no vale para EMITIR UN PLANO. Un alzado
 * con una arista oculta pintada como vista es un plano mal hecho: alguien lo
 * acota, lo imprime y descubre el error en obra. FLATSHOT y SOLPROF necesitan
 * saber la verdad sobre una pieza en L, sobre dos cajas que se tapan y sobre una
 * placa con un agujero. Eso cuesta más que una normal por cara, y por eso vive
 * en otro archivo con otro presupuesto: esto NO es un gesto por cuadro.
 *
 * ## El algoritmo, y por qué éste
 *
 * Eliminación de líneas ocultas ANALÍTICA sobre poliedros, en cuatro pasos:
 *
 *  1. **Aplanar.** Una base ortonormal convierte cada punto del mundo en
 *     `(u, v, profundidad)`. Eso lo hace `image-plane.ts`, incluida la
 *     corrección de perspectiva que aquí se da por buena.
 *  2. **Cortar.** La visibilidad de una arista proyectada sólo puede cambiar en
 *     dos sitios: donde su proyección cruza el CONTORNO de alguien —una arista
 *     de silueta o de borde, que es el perfil de la pieza en la imagen— y donde
 *     la arista ATRAVIESA el plano de una cara, que es la varilla que entra en
 *     una placa. Se calculan esos parámetros y se parte el segmento en trozos de
 *     visibilidad constante. Cortar sólo por siluetas deja mal el segundo caso;
 *     cortar por TODAS las aristas cuesta el doble y no añade ninguna verdad,
 *     porque cruzar una arista interior no cambia si la pieza tapa o no.
 *  3. **Preguntar por el punto medio.** Dentro de un trozo la respuesta no
 *     cambia, así que basta un punto: se mira si alguna cara lo cubre en la
 *     imagen y está MÁS CERCA. Es la única prueba que consulta geometría de
 *     verdad, y es exacta sobre caras planas.
 *  4. **Volver a unir.** Trozos contiguos con el mismo veredicto se funden, o un
 *     cubo saldría partido en veinte líneas que al trazar se ven como una sola y
 *     pesan veinte veces.
 *
 * El descarte de caras traseras SÓLO se aplica a cuerpos cerrados, y por una
 * razón demostrable: en un sólido cerrado el rayo entra por una cara delantera
 * antes de salir por una trasera, así que si una trasera tapa un punto, alguna
 * delantera lo tapa también y más cerca. En una lámina no hay «antes» y las dos
 * caras cuentan. Ésa es la única poda que se permite, y no es la que rompía en
 * los cóncavos: aquélla podaba ARISTAS, ésta poda OCLUSORES.
 *
 * ## Coste
 *
 * Sin aceleración sería O(A² + T·F): cada arista contra cada contorno, y cada
 * trozo contra cada cara. Con la rejilla uniforme de `image-plane.ts` las dos
 * consultas miran sólo lo que comparte celda, y el coste pasa a depender de la
 * DENSIDAD de la imagen y no del tamaño de la escena. El presupuesto medido y la
 * escena con la que se midió están en `hidden-line-solver.spec.ts`; `stats`
 * devuelve las cuentas para que ese presupuesto se mida y no se estime.
 *
 * ## Qué NO resuelve, dicho aquí y no en una nota al pie
 *
 *  · **Siluetas de superficies curvas.** El kernel es facetado: un cilindro es
 *    un prisma de N lados y su silueta es la generatriz de una faceta, no la
 *    tangente exacta. El error es la flecha de la faceta, que `chordErrorOf`
 *    cuantifica. No se corrige aquí porque corregirlo exige que el kernel deje
 *    de facetar.
 *  · **Aristas tangentes a la vista.** Una arista cuya proyección mide cero
 *    —apunta al ojo— se descarta: dibujarla sería un punto. Y una cara vista
 *    exactamente de canto no tapa nada, porque su proyección tiene área nula.
 *  · **Caras coplanarias de dos sólidos distintos.** Dos cajas que se tocan por
 *    una cara dejan aristas cuya profundidad empata dentro de la tolerancia; se
 *    resuelven a VISIBLE, que es lo conservador —dibujar de más se ve, dibujar
 *    de menos no—. Fundir esas caras es trabajo de una booleana, no de aquí.
 *  · **Sólidos que se interpenetran sin haber pasado por una booleana.** La
 *    curva donde dos superficies se cruzan no es arista de nadie, así que no se
 *    dibuja. Los cortes por plano de cara ponen bien el trozo de arista que
 *    entra en el otro cuerpo; lo que falta es el trazo de la propia
 *    intersección. La respuesta del producto es UNION antes de FLATSHOT.
 *  · **Aristas que se proyectan JUSTO encima de la silueta.** El alzado frontal
 *    de una caja pone las cuatro aristas del fondo exactamente sobre las cuatro
 *    de delante. El punto medio cae en el BORDE del polígono proyectado, donde
 *    el test de paridad es determinista pero arbitrario: esas cuatro pueden
 *    salir vistas u ocultas según el redondeo. Se dibujan encima de una línea
 *    que ya está, así que el plano sale igual; se dice aquí porque un golden que
 *    cuente aristas sobre una vista axial contará mal.
 *  · **El ojo DENTRO de un sólido, en perspectiva.** El descarte de caras
 *    traseras se apoya en que el rayo entra antes de salir, y eso deja de valer
 *    con el observador dentro del material. Una proyección paralela no tiene ese
 *    problema porque su origen está en el infinito.
 *  · **Caras no planas.** Se rechaza el cuerpo entero con un código de error en
 *    vez de proyectarlo mal: el test de profundidad de este archivo está
 *    definido sobre un plano y sobre nada más.
 */
import {
  NO_INDEX,
  bodyIsClosed,
  edgeDihedralAngle,
  faceCentroid,
  faceGeometricNormal,
  facePlanarity,
  halfEdgeSegment,
  loopPoints,
  type BrepBody,
  type Vec3,
} from "../../brep";
import type { CadPoint2 } from "../cad-document";
import type { CadHiddenLineView } from "./hidden-lines";
import {
  CAD_IMAGE_GRAZING,
  cadDepthAtImageParam,
  cadHiddenLineFailure,
  cadImageGrid,
  cadImageGridBucketAt,
  cadImageGridColumn,
  cadImageGridInsert,
  cadImageGridRow,
  cadImageParamAtPoint,
  cadPointAtImageParam,
  cadPointInProjectedLoops,
  cadProjectPoint,
  cadProjectionFrame,
  cadSegmentCrossParameter,
  v3dot,
  v3sub,
  v3unit,
  type CadHiddenLineFailure,
  type CadImageGrid,
  type CadProjectionFrame,
} from "./image-plane";

export type { CadHiddenLineErrorCode, CadHiddenLineFailure, CadProjectionFrame } from "./image-plane";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/** Un trozo de arista ya clasificado, en la imagen y en el mundo. */
export interface CadProjectedSegment {
  /** Extremos sobre el PLANO DE DIBUJO de la vista, en unidades de dibujo. */
  from: CadPoint2;
  to: CadPoint2;
  /** Los mismos extremos en el mundo, para quien necesite la cota original. */
  from3: Vec3;
  to3: Vec3;
  /** Índice del cuerpo en el array de entrada, y de la arista dentro de él. */
  body: number;
  edge: number;
  /** Arista de SILUETA: separa una cara de frente de otra de espaldas. */
  silhouette: boolean;
}

/** Cuentas de la corrida. Existen para que el presupuesto se mida, no se estime. */
export interface CadHiddenLineStats {
  bodies: number;
  faces: number;
  edges: number;
  /** Aristas que superaron el filtro de ángulo y entraron en el reparto. */
  candidates: number;
  /** Cortes introducidos por contorno y por plano de cara. */
  cuts: number;
  /** Trozos de visibilidad constante que se llegaron a clasificar. */
  pieces: number;
  /** Pruebas punto-en-cara realmente ejecutadas. Es el término que domina. */
  faceTests: number;
  elapsedMs: number;
}

export interface CadHiddenLineDrawing {
  ok: true;
  visible: readonly CadProjectedSegment[];
  hidden: readonly CadProjectedSegment[];
  frame: CadProjectionFrame;
  stats: CadHiddenLineStats;
}

export type CadHiddenLineOutcome = CadHiddenLineDrawing | CadHiddenLineFailure;

export interface CadHiddenLineOptions {
  /**
   * Vertical de la imagen. Por defecto la Z del mundo; si la mirada es cenital
   * —y entonces la Z no define ninguna vertical de pantalla— se usa la Y, que es
   * lo que convierte la vista desde arriba en la PLANTA de siempre.
   */
  up?: Vec3;
  /** Hacia dónde mira el ojo en perspectiva. Por defecto, al centro de la escena. */
  towards?: Vec3;
  /**
   * Aristas cuyo diedro se aparta de π menos que esto no se dibujan: son las
   * costuras de la faceta de un cilindro, que topológicamente existen y que
   * nadie quiere ver en un alzado. Las de silueta y las de borde se dibujan
   * siempre, pase lo que pase con su diedro.
   */
  featureAngleDeg?: number;
  /** `false` ahorra emitir lo que no se va a dibujar. */
  includeHidden?: boolean;
  /**
   * Tolerancia ABSOLUTA de profundidad, en unidades de dibujo. Por defecto se
   * escala con la diagonal de la escena: un valor fijo clasificaría bien una
   * pieza de milímetros y mal una nave de cien metros.
   */
  tolerance?: number;
}

const DEFAULT_FEATURE_ANGLE_DEG = 20;
/** Fracción de la diagonal de la escena que se acepta como empate de profundidad. */
const DEPTH_TOLERANCE_RATIO = 1e-7;
/** Desviación de planitud admitida, también relativa al tamaño de la escena. */
const PLANARITY_RATIO = 1e-6;

// ---------------------------------------------------------------------------
// Escena aplanada
// ---------------------------------------------------------------------------

interface ProjectedFace {
  body: number;
  face: number;
  /** Lazos proyectados en plano: `[u0,v0,u1,v1,…]`. El primero es el exterior. */
  loops: Float64Array[];
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
  normal: Vec3;
  /** Un punto del plano de la cara: su centroide. */
  origin: Vec3;
  front: boolean;
  /** Se puede descartar por estar de espaldas: sólo en un cuerpo CERRADO. */
  cullable: boolean;
}

interface CandidateEdge {
  body: number;
  edge: number;
  a: Vec3;
  b: Vec3;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  d0: number;
  d1: number;
  silhouette: boolean;
  /** Las dos caras que tocan la arista: no pueden taparse a sí mismas. */
  faceA: number;
  faceB: number;
}

interface ContourSegment {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

interface FlatScene {
  faces: ProjectedFace[];
  candidates: CandidateEdge[];
  contours: ContourSegment[];
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

/** Aplana caras y aristas de todos los cuerpos, o falla diciendo por qué. */
function flattenScene(
  bodies: readonly BrepBody[],
  frame: CadProjectionFrame,
  diagonal: number,
  featureThreshold: number,
): FlatScene | CadHiddenLineFailure {
  const perspective = frame.kind === "perspective";
  const faces: ProjectedFace[] = [];
  const candidates: CandidateEdge[] = [];
  const contours: ContourSegment[] = [];
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;

  for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
    const body = bodies[bodyIndex];
    const closed = bodyIsClosed(body);
    const front = new Array<boolean>(body.faces.length);
    const faceOf = new Array<number>(body.faces.length);

    for (let face = 0; face < body.faces.length; face += 1) {
      if (facePlanarity(body, face) > PLANARITY_RATIO * diagonal)
        return cadHiddenLineFailure(
          "cara-no-plana",
          `La cara ${face} del cuerpo ${bodyIndex} no es plana; la proyección analítica sólo está definida sobre caras planas.`,
        );
      const normal = faceGeometricNormal(body, face);
      const origin = faceCentroid(body, face);
      // Una cara mira al observador cuando su normal saliente se opone a la
      // mirada. En perspectiva se mide desde el centroide, y eso es EXACTO y no
      // una aproximación: en un plano, el signo de `n·(p − ojo)` es el mismo
      // para todos sus puntos, así que un punto cualquiera del plano decide.
      const gaze = perspective ? v3unit(v3sub(origin, frame.origin)) : frame.forward;
      front[face] = gaze !== null && v3dot(normal, gaze) < -CAD_IMAGE_GRAZING;

      const loops: Float64Array[] = [];
      let fMinU = Infinity;
      let fMinV = Infinity;
      let fMaxU = -Infinity;
      let fMaxV = -Infinity;
      for (const loop of body.faces[face].loops) {
        const points = loopPoints(body, loop);
        const flat = new Float64Array(points.length * 2);
        for (let i = 0; i < points.length; i += 1) {
          const projected = cadProjectPoint(frame, points[i]);
          if (!projected)
            return cadHiddenLineFailure(
              "detras-del-observador",
              `El cuerpo ${bodyIndex} tiene geometría en el plano del ojo o detrás de él; en perspectiva eso no se proyecta.`,
            );
          flat[i * 2] = projected.u;
          flat[i * 2 + 1] = projected.v;
          if (projected.u < fMinU) fMinU = projected.u;
          if (projected.v < fMinV) fMinV = projected.v;
          if (projected.u > fMaxU) fMaxU = projected.u;
          if (projected.v > fMaxV) fMaxV = projected.v;
        }
        loops.push(flat);
      }
      faceOf[face] = faces.length;
      faces.push({
        body: bodyIndex,
        face,
        loops,
        minU: fMinU,
        minV: fMinV,
        maxU: fMaxU,
        maxV: fMaxV,
        normal,
        origin,
        front: front[face],
        cullable: closed,
      });
      if (fMinU < minU) minU = fMinU;
      if (fMinV < minV) minV = fMinV;
      if (fMaxU > maxU) maxU = fMaxU;
      if (fMaxV > maxV) maxV = fMaxV;
    }

    for (let edge = 0; edge < body.edges.length; edge += 1) {
      const half = body.edges[edge].a;
      if (half === NO_INDEX) continue;
      const twin = body.edges[edge].b;
      const boundary = twin === NO_INDEX;
      const faceA = body.loops[body.halfEdges[half].loop].face;
      const faceB = boundary ? NO_INDEX : body.loops[body.halfEdges[twin].loop].face;
      const silhouette = !boundary && front[faceA] !== front[faceB];
      // El filtro de ángulo sólo puede callar aristas SUAVES de interior. La
      // silueta y el borde son el perfil de la pieza: se dibujan siempre.
      if (!boundary && !silhouette) {
        const dihedral = edgeDihedralAngle(body, edge);
        if (dihedral !== null && Math.abs(dihedral - Math.PI) < featureThreshold) continue;
      }
      const segment = halfEdgeSegment(body, half);
      const pa = cadProjectPoint(frame, segment.from);
      const pb = cadProjectPoint(frame, segment.to);
      if (!pa || !pb)
        return cadHiddenLineFailure(
          "detras-del-observador",
          `La arista ${edge} del cuerpo ${bodyIndex} cae en el plano del ojo o detrás; en perspectiva eso no se proyecta.`,
        );
      candidates.push({
        body: bodyIndex,
        edge,
        a: segment.from,
        b: segment.to,
        u0: pa.u,
        v0: pa.v,
        u1: pb.u,
        v1: pb.v,
        d0: pa.depth,
        d1: pb.depth,
        silhouette,
        faceA: faceOf[faceA],
        faceB: boundary ? NO_INDEX : faceOf[faceB],
      });
      if (silhouette || boundary)
        contours.push({
          u0: pa.u,
          v0: pa.v,
          u1: pb.u,
          v1: pb.v,
          minU: Math.min(pa.u, pb.u),
          minV: Math.min(pa.v, pb.v),
          maxU: Math.max(pa.u, pb.u),
          maxV: Math.max(pa.v, pb.v),
        });
    }
  }

  return { faces, candidates, contours, minU, minV, maxU, maxV };
}

// ---------------------------------------------------------------------------
// El solucionador
// ---------------------------------------------------------------------------

/**
 * Segmentos 2D del modelo, separados en VISTOS y OCULTOS.
 *
 * Es la función que consume todo lo demás —FLATSHOT, SOLPROF y la ventana
 * gráfica con dirección de vista—: pura, sin documento, sin THREE y sin estado.
 * Entran cuerpos ya colocados en el mundo y una vista; sale geometría de dibujo
 * en el plano de imagen, lista para convertirse en entidades.
 */
export function cadHiddenLineDrawing(
  bodies: readonly BrepBody[],
  view: CadHiddenLineView,
  options: CadHiddenLineOptions = {},
): CadHiddenLineOutcome {
  const started = performance.now();
  let totalEdges = 0;
  let totalFaces = 0;
  for (const body of bodies) {
    totalEdges += body.edges.length;
    totalFaces += body.faces.length;
  }
  if (totalEdges === 0)
    return cadHiddenLineFailure("escena-vacia", "No hay ninguna arista que proyectar.");

  // Centro y diagonal de la escena: fijan la tolerancia y, en perspectiva, la
  // distancia focal. Se calculan una vez sobre los vértices.
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const body of bodies)
    for (const vertex of body.vertices) {
      const { x, y, z } = vertex.point;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const diagonal = Math.max(1e-9, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ));
  const tolerance = options.tolerance ?? DEPTH_TOLERANCE_RATIO * diagonal;

  const frame = cadProjectionFrame({
    kind: view.kind,
    direction: view.kind === "parallel" ? view.direction : undefined,
    eye: view.kind === "perspective" ? view.eye : undefined,
    towards: options.towards ?? center,
    up: options.up,
    focal:
      view.kind === "perspective"
        ? Math.max(1e-9, Math.hypot(center.x - view.eye.x, center.y - view.eye.y, center.z - view.eye.z))
        : 1,
  });
  if ("ok" in frame) return frame;
  const perspective = frame.kind === "perspective";

  const scene = flattenScene(
    bodies,
    frame,
    diagonal,
    ((options.featureAngleDeg ?? DEFAULT_FEATURE_ANGLE_DEG) * Math.PI) / 180,
  );
  if ("ok" in scene) return scene;
  const { faces, candidates, contours } = scene;
  if (candidates.length === 0)
    return cadHiddenLineFailure(
      "escena-vacia",
      "Ninguna arista superó el filtro de ángulo: no hay nada que dibujar.",
    );

  const faceGrid = cadImageGrid(scene.minU, scene.minV, scene.maxU, scene.maxV, faces.length);
  for (let i = 0; i < faces.length; i += 1)
    cadImageGridInsert(faceGrid, i, faces[i].minU, faces[i].minV, faces[i].maxU, faces[i].maxV);
  const contourGrid = cadImageGrid(
    scene.minU,
    scene.minV,
    scene.maxU,
    scene.maxV,
    Math.max(1, contours.length),
  );
  for (let i = 0; i < contours.length; i += 1)
    cadImageGridInsert(contourGrid, i, contours[i].minU, contours[i].minV, contours[i].maxU, contours[i].maxV);

  const visible: CadProjectedSegment[] = [];
  const hidden: CadProjectedSegment[] = [];
  const includeHidden = options.includeHidden !== false;
  let cuts = 0;
  let pieces = 0;
  let faceTests = 0;

  for (const candidate of candidates) {
    const du = candidate.u1 - candidate.u0;
    const dv = candidate.v1 - candidate.v0;
    // Una arista que apunta al ojo se proyecta a un punto. Dibujarla sería un
    // punto suelto en el plano; se descarta y se dice en la cabecera.
    if (Math.hypot(du, dv) < tolerance) continue;

    const params = collectCuts(candidate, contours, contourGrid, faces, faceGrid, perspective);
    cuts += params.length - 2;

    let runStart = params[0];
    let runVisible: boolean | null = null;
    for (let i = 0; i + 1 < params.length; i += 1) {
      const s0 = params[i];
      const s1 = params[i + 1];
      if (s1 - s0 < 1e-12) continue;
      pieces += 1;
      const mid = (s0 + s1) / 2;
      const u = candidate.u0 + du * mid;
      const v = candidate.v0 + dv * mid;
      const depth = cadDepthAtImageParam(candidate.d0, candidate.d1, mid, perspective);

      let occluded = false;
      for (const index of cadImageGridBucketAt(faceGrid, u, v)) {
        if (index === candidate.faceA || index === candidate.faceB) continue;
        const face = faces[index];
        if (face.cullable && !face.front) continue;
        if (u < face.minU || u > face.maxU || v < face.minV || v > face.maxV) continue;
        faceTests += 1;
        if (!cadPointInProjectedLoops(face.loops, u, v)) continue;
        const faceDepth = depthOfFaceAt(face, frame, u, v, perspective);
        if (faceDepth === null) continue;
        if (faceDepth < depth - tolerance) {
          occluded = true;
          break;
        }
      }

      const nowVisible = !occluded;
      if (runVisible === null) {
        runVisible = nowVisible;
        runStart = s0;
        continue;
      }
      if (nowVisible !== runVisible) {
        emit(candidate, runStart, s0, runVisible, perspective, visible, hidden, includeHidden);
        runVisible = nowVisible;
        runStart = s0;
      }
    }
    if (runVisible !== null)
      emit(
        candidate,
        runStart,
        params[params.length - 1],
        runVisible,
        perspective,
        visible,
        hidden,
        includeHidden,
      );
  }

  return {
    ok: true,
    visible,
    hidden,
    frame,
    stats: {
      bodies: bodies.length,
      faces: totalFaces,
      edges: totalEdges,
      candidates: candidates.length,
      cuts,
      pieces,
      faceTests,
      elapsedMs: performance.now() - started,
    },
  };
}

/** Parámetros de corte del segmento, ordenados y con 0 y 1 incluidos. */
function collectCuts(
  candidate: CandidateEdge,
  contours: readonly ContourSegment[],
  contourGrid: CadImageGrid,
  faces: readonly ProjectedFace[],
  faceGrid: CadImageGrid,
  perspective: boolean,
): number[] {
  const params: number[] = [0, 1];
  const minU = Math.min(candidate.u0, candidate.u1);
  const maxU = Math.max(candidate.u0, candidate.u1);
  const minV = Math.min(candidate.v0, candidate.v1);
  const maxV = Math.max(candidate.v0, candidate.v1);

  const seenContours = new Set<number>();
  forEachCell(contourGrid, minU, minV, maxU, maxV, (index) => {
    if (seenContours.has(index)) return;
    seenContours.add(index);
    const contour = contours[index];
    if (contour.maxU < minU || contour.minU > maxU || contour.maxV < minV || contour.minV > maxV) return;
    const t = cadSegmentCrossParameter(
      candidate.u0,
      candidate.v0,
      candidate.u1,
      candidate.v1,
      contour.u0,
      contour.v0,
      contour.u1,
      contour.v1,
    );
    if (t !== null) params.push(t);
  });

  // Cortes por PLANO de cara: donde la arista atraviesa la cara, la visibilidad
  // cambia sin que se cruce ningún contorno. Es la varilla que entra en una
  // placa, y es lo que distingue esto de un recorte por siluetas.
  const seenFaces = new Set<number>();
  forEachCell(faceGrid, minU, minV, maxU, maxV, (index) => {
    if (seenFaces.has(index)) return;
    seenFaces.add(index);
    if (index === candidate.faceA || index === candidate.faceB) return;
    const face = faces[index];
    const da = v3dot(v3sub(candidate.a, face.origin), face.normal);
    const db = v3dot(v3sub(candidate.b, face.origin), face.normal);
    if (da * db >= 0) return;
    // `t` está sobre el SEGMENTO; hay que devolverlo al parámetro de imagen, que
    // en perspectiva no es el mismo.
    const s = cadImageParamAtPoint(candidate.d0, candidate.d1, da / (da - db), perspective);
    if (s > 1e-12 && s < 1 - 1e-12) params.push(s);
  });

  params.sort((a, b) => a - b);
  return params;
}

function forEachCell(
  grid: CadImageGrid,
  minU: number,
  minV: number,
  maxU: number,
  maxV: number,
  visit: (index: number) => void,
): void {
  const c0 = cadImageGridColumn(grid, minU);
  const c1 = cadImageGridColumn(grid, maxU);
  const r0 = cadImageGridRow(grid, minV);
  const r1 = cadImageGridRow(grid, maxV);
  for (let row = r0; row <= r1; row += 1)
    for (let col = c0; col <= c1; col += 1)
      for (const index of grid.buckets[row * grid.cols + col]) visit(index);
}

/** Profundidad de la cara bajo el punto de imagen, o `null` si se ve de canto. */
function depthOfFaceAt(
  face: ProjectedFace,
  frame: CadProjectionFrame,
  u: number,
  v: number,
  perspective: boolean,
): number | null {
  if (!perspective) {
    const denominator = v3dot(frame.forward, face.normal);
    if (Math.abs(denominator) < CAD_IMAGE_GRAZING) return null;
    const q = {
      x: frame.origin.x + frame.right.x * u + frame.up.x * v,
      y: frame.origin.y + frame.right.y * u + frame.up.y * v,
      z: frame.origin.z + frame.right.z * u + frame.up.z * v,
    };
    return v3dot(v3sub(face.origin, q), face.normal) / denominator;
  }
  const k = 1 / frame.focal;
  const direction = {
    x: frame.right.x * u * k + frame.up.x * v * k + frame.forward.x,
    y: frame.right.y * u * k + frame.up.y * v * k + frame.forward.y,
    z: frame.right.z * u * k + frame.up.z * v * k + frame.forward.z,
  };
  const denominator = v3dot(direction, face.normal);
  if (Math.abs(denominator) < CAD_IMAGE_GRAZING) return null;
  const depth = v3dot(v3sub(face.origin, frame.origin), face.normal) / denominator;
  return depth > 0 ? depth : null;
}

function emit(
  candidate: CandidateEdge,
  s0: number,
  s1: number,
  isVisible: boolean,
  perspective: boolean,
  visible: CadProjectedSegment[],
  hidden: CadProjectedSegment[],
  includeHidden: boolean,
): void {
  if (!isVisible && !includeHidden) return;
  if (s1 - s0 < 1e-12) return;
  const du = candidate.u1 - candidate.u0;
  const dv = candidate.v1 - candidate.v0;
  (isVisible ? visible : hidden).push({
    from: { x: candidate.u0 + du * s0, y: candidate.v0 + dv * s0 },
    to: { x: candidate.u0 + du * s1, y: candidate.v0 + dv * s1 },
    from3: cadPointAtImageParam(candidate.a, candidate.b, candidate.d0, candidate.d1, s0, perspective),
    to3: cadPointAtImageParam(candidate.a, candidate.b, candidate.d0, candidate.d1, s1, perspective),
    body: candidate.body,
    edge: candidate.edge,
    silhouette: candidate.silhouette,
  });
}

/**
 * Veredicto por ARISTA COMPLETA, para quien sólo quiera saber si una arista se
 * ve, se oculta o se parte.
 *
 * Existe porque la comprobación honesta de un golden es «esta arista concreta
 * sale oculta», y con la lista de trozos habría que reagrupar a mano en cada
 * spec. `dropped` no aparece nunca en el mapa: una arista sin ningún trozo
 * simplemente no está, y quien la busque obtiene `undefined`, que es un dato
 * distinto de «se ve» y de «se oculta».
 */
export type CadEdgeVerdict = "visible" | "hidden" | "partial";

export function cadEdgeVerdicts(
  drawing: CadHiddenLineDrawing,
  body = 0,
): Map<number, CadEdgeVerdict> {
  const seenVisible = new Set<number>();
  const seenHidden = new Set<number>();
  for (const segment of drawing.visible) if (segment.body === body) seenVisible.add(segment.edge);
  for (const segment of drawing.hidden) if (segment.body === body) seenHidden.add(segment.edge);
  const verdicts = new Map<number, CadEdgeVerdict>();
  for (const edge of seenVisible) verdicts.set(edge, seenHidden.has(edge) ? "partial" : "visible");
  for (const edge of seenHidden) if (!verdicts.has(edge)) verdicts.set(edge, "hidden");
  return verdicts;
}
