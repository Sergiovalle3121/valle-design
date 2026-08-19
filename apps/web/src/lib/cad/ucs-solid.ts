/**
 * De una CARA de un sólido a un SCU. Es la opción que justifica toda la ola.
 *
 * ## Por qué esta es la pieza que faltaba
 *
 * Todo lo que se hace en tres dimensiones empieza igual: se apoya el sistema de
 * coordenadas en una cara de la pieza y se dibuja encima como si fuera una hoja
 * de papel. Sin eso, taladrar un faldón inclinado obliga a calcular a mano las
 * coordenadas del mundo de cada agujero — que es exactamente el trabajo que un
 * CAD existe para no tener que hacer.
 *
 * El kernel B-rep ya sabía todo lo necesario —normal geométrica, centroide,
 * lazo exterior, planitud— y hasta esta ola nadie se lo preguntaba desde el
 * lado del SCU. Este archivo es esa pregunta, y es lo único que hay entre
 * `lib/brep` y el comando UCS.
 *
 * ## Qué se rechaza, y por qué se rechaza en vez de aproximarse
 *
 * Una cara NO PLANA no define un plano, por mucho que su normal media exista.
 * Aceptarla daría un SCU cuyo plano se separa de la cara unos milímetros que
 * nadie ve en pantalla y que aparecen al mecanizar. El kernel es facetado —una
 * cara curva llega ya troceada en facetas planas—, así que una cara alabeada
 * sólo puede venir de un cuerpo mal cosido: se dice y se para.
 */
import type { CadEntity, CadPoint2, CadPoint3 } from "./cad-document";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import {
  faceCentroid,
  faceGeometricNormal,
  faceHalfEdges,
  faceOuterLoop,
  facePlanarity,
  halfEdgeSegment,
  loopPoints,
  type BrepBody,
  type Vec3,
} from "../brep";
import { solid3dBody } from "./solid3d-build";
import {
  cadUcsFromPlane,
  CAD_WORLD_UCS,
  type CadNamedUcs,
  type CadUcsFailure,
  type CadUcsOutcome,
} from "./ucs";

/**
 * Cuánto puede separarse un vértice del plano medio de su cara para que la cara
 * siga contando como plana, en unidades de dibujo.
 *
 * Un milímetro sobre una pieza de metros es ruido de coma flotante acumulado en
 * quince operaciones booleanas; un centímetro ya es una cara que no existe. El
 * umbral es RELATIVO al tamaño de la cara para que la misma cifra valga en una
 * bisagra y en un forjado.
 */
export const CAD_UCS_FACE_PLANARITY_RATIO = 1e-6;

export interface CadSolidFaceSummary {
  face: number;
  normal: CadPoint3;
  centroid: CadPoint3;
  /** Desviación máxima de la cara respecto de su plano medio. */
  planarity: number;
}

function vec(point: Vec3): CadPoint3 {
  return { x: point.x, y: point.y, z: point.z };
}

function fail(code: CadUcsFailure["code"], message: string): CadUcsFailure {
  return { ok: false, code, message };
}

/** Diagonal de la envolvente de una cara: la escala con la que juzgar su planitud. */
function faceScale(body: BrepBody, face: number): number {
  const points = loopPoints(body, faceOuterLoop(body, face));
  if (points.length === 0) return 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

/**
 * La arista más larga del lazo exterior, como dirección sugerida para el eje X.
 *
 * Es lo que hace que el SCU de cara se sienta bien puesto: alineado con el lado
 * largo de la cara, que es como el dibujante mira la pieza. Un eje X salido del
 * algoritmo del eje arbitrario es igual de correcto y no se parece a nada de lo
 * que hay en pantalla.
 */
function longestEdgeDirection(body: BrepBody, face: number): CadPoint3 | undefined {
  let best: CadPoint3 | undefined;
  let bestLength = 0;
  for (const halfEdge of faceHalfEdges(body, face)) {
    const { from, to } = halfEdgeSegment(body, halfEdge);
    const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length > bestLength) {
      bestLength = length;
      best = direction;
    }
  }
  return bestLength > 0 ? best : undefined;
}

export function cadSolidFaceSummaries(body: BrepBody): CadSolidFaceSummary[] {
  return body.faces.map((_face, index) => ({
    face: index,
    normal: vec(faceGeometricNormal(body, index)),
    centroid: vec(faceCentroid(body, index)),
    planarity: facePlanarity(body, index),
  }));
}

export interface CadUcsFromFaceOptions {
  /** Nombre del SCU resultante. Vacío ⇒ sin nombre, como el SCU sin guardar. */
  name?: string;
  /**
   * Origen pedido, ya en coordenadas del mundo. Se PROYECTA sobre el plano de
   * la cara. Ausente ⇒ el centroide, que es el punto que no depende de dónde se
   * pinchó y hace reproducible el resultado en una prueba.
   */
  origin?: CadPoint3;
  /** `false` para dejar que el eje X lo elija el algoritmo del eje arbitrario. */
  alignToLongestEdge?: boolean;
}

/**
 * SCU sobre una cara de un cuerpo B-rep: origen en el plano de la cara y eje Z
 * igual a su normal geométrica.
 */
export function cadUcsFromBrepFace(
  body: BrepBody,
  face: number,
  options: CadUcsFromFaceOptions = {},
): CadUcsOutcome {
  if (!Number.isInteger(face) || face < 0 || face >= body.faces.length)
    return fail(
      "eje-nulo",
      `El sólido no tiene la cara ${face}: tiene ${body.faces.length} cara(s), numeradas desde 1.`,
    );

  const scale = faceScale(body, face);
  const deviation = facePlanarity(body, face);
  const limit = Math.max(CAD_UCS_FACE_PLANARITY_RATIO * Math.max(scale, 1), 1e-9);
  if (!(deviation <= limit))
    return fail(
      "puntos-alineados",
      `La cara ${face + 1} no es plana: sus vértices se separan ${deviation.toFixed(6)} unidades de su ` +
        `plano medio y el límite para esta cara es ${limit.toFixed(6)}. Un SCU sobre ella mentiría.`,
    );

  const normal = vec(faceGeometricNormal(body, face));
  const centroid = vec(faceCentroid(body, face));
  const hint = options.alignToLongestEdge === false ? undefined : longestEdgeDirection(body, face);
  const built = cadUcsFromPlane(options.name ?? "", centroid, normal, hint);
  if (!built.ok) return built;

  if (!options.origin) return built;
  // El origen pedido se lleva al plano restándole su distancia con signo: el
  // usuario señala en pantalla y el punto que señala casi nunca está EN el
  // plano, pero su proyección sí es el punto que quería.
  const ucs = built.ucs;
  const d =
    (options.origin.x - centroid.x) * ucs.zAxis.x +
    (options.origin.y - centroid.y) * ucs.zAxis.y +
    (options.origin.z - centroid.z) * ucs.zAxis.z;
  return {
    ok: true,
    ucs: {
      ...ucs,
      origin: {
        x: options.origin.x - ucs.zAxis.x * d,
        y: options.origin.y - ucs.zAxis.y * d,
        z: options.origin.z - ucs.zAxis.z * d,
      },
    },
  };
}

/** Lo mismo, partiendo de la entidad del documento. Evalúa su árbol de sólido. */
export function cadUcsFromSolidFace(
  entity: CadSolid3dEntity,
  face: number,
  options: CadUcsFromFaceOptions = {},
): CadUcsOutcome {
  return cadUcsFromBrepFace(solid3dBody(entity), face, options);
}

/**
 * Qué cara hay bajo un punto señalado en el lienzo 2D.
 *
 * El visor mira a lo largo de la Z del mundo, así que «la cara que se ve» es la
 * que mira hacia arriba y contiene el punto en su proyección; de las que
 * cumplan las dos cosas, la más ALTA en ese punto, porque es la que tapa a las
 * demás. Es una regla de designación, no de geometría exacta, y está aquí para
 * que el comando UCS pueda ofrecer «Cara» con un solo clic en vez de pedir un
 * número de cara que nadie sabe.
 */
export function cadSolidFaceUnderPoint(
  body: BrepBody,
  point: CadPoint2,
): { ok: true; face: number } | CadUcsFailure {
  let best = -1;
  let bestHeight = -Infinity;
  for (let face = 0; face < body.faces.length; face += 1) {
    const normal = faceGeometricNormal(body, face);
    if (!(normal.z > 1e-9)) continue;
    const points = loopPoints(body, faceOuterLoop(body, face));
    if (points.length < 3) continue;
    if (!containsInXY(points, point)) continue;
    const centroid = faceCentroid(body, face);
    // Altura del plano de la cara sobre la vertical del punto señalado.
    const height =
      centroid.z -
      ((point.x - centroid.x) * normal.x + (point.y - centroid.y) * normal.y) / normal.z;
    if (height > bestHeight) {
      bestHeight = height;
      best = face;
    }
  }
  if (best < 0)
    return fail(
      "plano-de-canto",
      "Bajo ese punto no hay ninguna cara visible del sólido. Señale dentro del contorno del sólido, " +
        "o precise el número de cara.",
    );
  return { ok: true, face: best };
}

/** Punto dentro de un polígono, mirando sólo su proyección en el plano XY. */
function containsInXY(points: readonly Vec3[], point: CadPoint2): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const t = (point.y - a.y) / (b.y - a.y);
    if (point.x < a.x + t * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

/**
 * SCU a partir de un OBJETO designado: la opción «Objeto» del comando UCS.
 *
 * El origen y el eje X salen de la geometría del objeto siguiendo las mismas
 * reglas que AutoCAD, porque son las que hacen predecible el resultado: en una
 * línea, el extremo más cercano al punto de designación manda; en un círculo o
 * un arco, el centro y el ángulo cero.
 *
 * Lo que NO se acepta se dice: un objeto del que no se puede deducir un plano
 * —un texto sin dirección, un bloque anidado— devuelve un fallo con su motivo
 * en vez de un SCU del mundo disfrazado.
 */
export function cadUcsFromEntity(
  entity: CadEntity,
  name = "",
  pick?: CadPoint2,
): CadUcsOutcome {
  const planeZ: CadPoint3 = { x: 0, y: 0, z: 1 };
  switch (entity.type) {
    case "line": {
      const start = entity.start;
      const end = entity.end;
      // El extremo más cercano al punto de designación es el origen: designar
      // cerca de una punta y que el sistema aparezca en la otra es el clásico
      // «¿por qué está al revés?» que hace desconfiar del comando.
      const near = pick && distance2(end, pick) < distance2(start, pick) ? end : start;
      const far = near === start ? end : start;
      return cadUcsFromPlane(name, near, planeZ, {
        x: far.x - near.x,
        y: far.y - near.y,
        z: far.z - near.z,
      });
    }
    case "circle":
    case "arc":
      return cadUcsFromPlane(name, entity.center, planeZ, { x: 1, y: 0, z: 0 });
    case "polyline": {
      if (entity.vertices.length < 2)
        return fail("eje-nulo", "La polilínea designada no tiene dos vértices distintos.");
      const a = entity.vertices[0];
      const b = entity.vertices[1];
      return cadUcsFromPlane(name, a, planeZ, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    }
    case "region": {
      if (entity.outer.length < 3)
        return fail("puntos-alineados", "La región designada no tiene contorno suficiente.");
      const normal = newellNormalOf(entity.outer);
      const a = entity.outer[0];
      const b = entity.outer[1];
      return cadUcsFromPlane(name, a, normal, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
    }
    case "solid3d":
      return fail(
        "plano-de-canto",
        "Un sólido no define un plano por sí solo: use la opción Cara para apoyarse en una de sus caras.",
      );
    default:
      return fail(
        "plano-de-canto",
        `De un objeto "${entity.type}" no se puede deducir un plano. Sirven líneas, círculos, arcos, ` +
          "polilíneas y regiones; para un sólido, use la opción Cara.",
      );
  }
}

function distance2(a: CadPoint3, b: CadPoint2): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Normal de Newell de un contorno cerrado: robusta aunque el contorno sea convexo o no. */
function newellNormalOf(points: readonly CadPoint3[]): CadPoint3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return { x, y, z };
}

/** El SCU del mundo con otro nombre, para el caso «no hay nada que deducir». */
export function cadWorldUcsNamed(name: string): CadNamedUcs {
  return { ...CAD_WORLD_UCS, name };
}
