/**
 * Qué CARA de un sólido hay bajo el puntero — con un rayo de verdad.
 *
 * ## Por qué existe, y qué había antes
 *
 * `lib/cad/ucs-solid.ts` ya sabía responder «qué cara hay bajo este punto», y su
 * propio comentario declara el límite: mira a lo largo de la Z DEL MUNDO y se
 * queda con la cara más alta. Eso es correcto en planta y sólo en planta. En una
 * vista isométrica, la cara que el usuario VE bajo el cursor casi nunca es la
 * más alta en la vertical del mundo — es la primera que atraviesa el rayo que
 * sale del ojo. Con la regla vieja, empujar la cara frontal de una caja en
 * isométrica empujaría la tapa.
 *
 * Este módulo generaliza esa pregunta a una dirección arbitraria. No sustituye a
 * `cadSolidFaceUnderPoint`: aquélla sigue siendo la regla barata y correcta para
 * el visor ortográfico en planta, y ésta es la que el modo 3D necesita.
 *
 * ## La cara «no plana», y por qué se informa en vez de rechazarse
 *
 * `ucs-solid.ts` RECHAZA una cara alabeada, y hace bien: un SCU sobre ella
 * mentiría milímetros que nadie ve en pantalla pero que aparecen al mecanizar.
 * Aquí la decisión es distinta a propósito. Designar no es acotar: el usuario
 * necesita poder señalar la cara para ENTERARSE de que está mal cosida, y una
 * designación que no responde nada deja al arquitecto sin diagnóstico. Así que
 * el impacto se devuelve con su `planarityDeviation` medida, y quien vaya a
 * hacer algo irreversible con ella —empujarla, apoyar un SCU— decide con ese
 * número delante. Informar el defecto es más útil que ocultarlo, y más honesto
 * que fingir que la cara es plana.
 *
 * ## Cara trasera: no se designa lo que no se ve
 *
 * Por defecto se descartan las caras cuya normal se aleja del rayo. Es lo que
 * hace que pinchar una caja designe la cara de delante y no la de detrás, que
 * está a la vista de nadie. `cullBackFaces: false` existe para las herramientas
 * de diagnóstico, que sí quieren ver el reverso.
 *
 * ## Tolerancia RELATIVA al tamaño del cuerpo
 *
 * Un umbral absoluto en milímetros es correcto en una pieza de carpintería y
 * absurdo en un predio en coordenadas UTM. Todos los epsilon de aquí se escalan
 * con la diagonal de la envolvente del cuerpo, que es la única escala que el
 * módulo conoce sin preguntar.
 */
import {
  aabbDiagonal,
  bodyBounds,
  faceCentroid,
  faceGeometricNormal,
  faceInnerLoops,
  faceOuterLoop,
  facePlanarity,
  loopPoints,
  v3Add,
  v3Dot,
  v3Length,
  v3Scale,
  v3Sub,
  type BrepBody,
  type Vec3,
} from "../../brep";

/** Un rayo: de dónde sale y hacia dónde va. `direction` no necesita ser unitario. */
export interface CadPickRay {
  origin: Vec3;
  direction: Vec3;
}

export interface CadFaceHit {
  /** Índice de cara en `body.faces`, base 0. La UI numera desde 1. */
  face: number;
  /** Punto de impacto, en las mismas coordenadas que el cuerpo. */
  point: Vec3;
  /** Parámetro sobre el rayo: `origin + direction·t`. Siempre positivo. */
  t: number;
  /** Normal geométrica UNITARIA de la cara impactada. */
  normal: Vec3;
  /** `true` si el rayo entra por el reverso (sólo posible con `cullBackFaces: false`). */
  backFace: boolean;
  /**
   * Cuánto se separan los vértices de la cara de su plano medio. Cero en un
   * cuerpo bien cosido. Se devuelve SIEMPRE para que quien empuje decida.
   */
  planarityDeviation: number;
}

export interface CadFaceRayOptions {
  /** Descartar las caras que dan la espalda al rayo. Por defecto `true`. */
  cullBackFaces?: boolean;
  /**
   * Escala del mundo para los epsilon. Por defecto, la diagonal de la envolvente
   * del cuerpo. Se puede fijar cuando se sondean muchos cuerpos con una misma
   * tolerancia de escena.
   */
  scale?: number;
}

/** Fracción de la escala por debajo de la cual dos cantidades son la misma. */
const RELATIVE_EPSILON = 1e-9;

/** Escala mínima, para que un cuerpo degenerado no colapse los epsilon a cero. */
const MIN_SCALE = 1e-12;

function scaleOf(body: BrepBody, options: CadFaceRayOptions): number {
  if (
    options.scale !== undefined &&
    Number.isFinite(options.scale) &&
    options.scale > 0
  )
    return options.scale;
  const diagonal = aabbDiagonal(bodyBounds(body));
  return diagonal > MIN_SCALE ? diagonal : 1;
}

function isFiniteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * El eje que se DESCARTA para proyectar la cara a un plano 2D.
 *
 * Se tira la componente dominante de la normal, que es la que hace la proyección
 * más gorda y por tanto la más estable numéricamente: proyectar una cara casi
 * vertical sobre el plano XY la aplastaría a un hilo y el punto-en-polígono
 * decidiría a cara o cruz.
 */
function dominantAxis(normal: Vec3): 0 | 1 | 2 {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}

function project(point: Vec3, axis: 0 | 1 | 2): { u: number; v: number } {
  if (axis === 0) return { u: point.y, v: point.z };
  if (axis === 1) return { u: point.z, v: point.x };
  return { u: point.x, v: point.y };
}

/**
 * Punto dentro de un polígono por cruce de rayo, en el plano de proyección.
 *
 * El punto EXACTAMENTE sobre una arista es ambiguo por definición y aquí cuenta
 * como dentro: designar el borde de una cara tiene que designar la cara, no
 * fallar. Es la misma decisión que toma cualquier CAD con la apertura del
 * enganche.
 */
function containsProjected(
  points: readonly Vec3[],
  axis: 0 | 1 | 2,
  target: { u: number; v: number },
  epsilon: number,
): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = project(points[i], axis);
    const b = project(points[j], axis);

    // Sobre la arista (con holgura) ⇒ dentro, sin votar.
    if (onSegment(a, b, target, epsilon)) return true;

    const straddles = a.v > target.v !== b.v > target.v;
    if (!straddles) continue;
    const crossU = ((b.u - a.u) * (target.v - a.v)) / (b.v - a.v) + a.u;
    if (target.u < crossU) inside = !inside;
  }
  return inside;
}

function onSegment(
  a: { u: number; v: number },
  b: { u: number; v: number },
  p: { u: number; v: number },
  epsilon: number,
): boolean {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const lengthSq = du * du + dv * dv;
  if (lengthSq <= epsilon * epsilon) {
    const gu = p.u - a.u;
    const gv = p.v - a.v;
    return gu * gu + gv * gv <= epsilon * epsilon;
  }
  let s = ((p.u - a.u) * du + (p.v - a.v) * dv) / lengthSq;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cu = a.u + du * s - p.u;
  const cv = a.v + dv * s - p.v;
  return cu * cu + cv * cv <= epsilon * epsilon;
}

/**
 * ¿Cae `point` dentro de la cara `face`?
 *
 * Dentro del lazo exterior y FUERA de todos los interiores: un agujero pasante
 * no es cara, y designar por el hueco tiene que atravesar hasta lo que haya
 * detrás. Es la diferencia entre pinchar una arandela y pinchar un disco.
 */
export function cadFaceContainsPoint(
  body: BrepBody,
  face: number,
  point: Vec3,
  options: CadFaceRayOptions = {},
): boolean {
  const normal = faceGeometricNormal(body, face);
  if (v3Length(normal) < 0.5) return false;
  const scale = scaleOf(body, options);
  const epsilon = scale * 1e-7;
  const axis = dominantAxis(normal);
  const target = project(point, axis);

  const outer = loopPoints(body, faceOuterLoop(body, face));
  if (!containsProjected(outer, axis, target, epsilon)) return false;

  for (const loop of faceInnerLoops(body, face)) {
    const inner = loopPoints(body, loop);
    // El borde del agujero pertenece a la cara: sólo el INTERIOR estricto la perfora.
    if (containsProjected(inner, axis, target, 0)) return false;
  }
  return true;
}

/**
 * Todas las caras que el rayo atraviesa, ordenadas de más cercana a más lejana.
 *
 * Devolver la lista y no sólo la primera es lo que permite «designar lo de
 * detrás» pulsando repetidamente sobre el mismo punto — el ciclo de designación
 * que un CAD tiene desde siempre y que en 3D es imprescindible: la cara que se
 * quiere empujar está tapada la mitad de las veces.
 */
export function cadFaceRayHits(
  body: BrepBody,
  ray: CadPickRay,
  options: CadFaceRayOptions = {},
): CadFaceHit[] {
  if (!isFiniteVec(ray.origin) || !isFiniteVec(ray.direction)) return [];
  const dirLength = v3Length(ray.direction);
  if (!(dirLength > 0)) return [];
  const direction = v3Scale(ray.direction, 1 / dirLength);

  const cull = options.cullBackFaces ?? true;
  const scale = scaleOf(body, options);
  const parallelEpsilon = RELATIVE_EPSILON;
  const aheadEpsilon = scale * 1e-9;

  const hits: CadFaceHit[] = [];
  for (let face = 0; face < body.faces.length; face += 1) {
    const rawNormal = faceGeometricNormal(body, face);
    const normalLength = v3Length(rawNormal);
    if (normalLength < 0.5) continue; // cara degenerada: sin normal, no hay plano
    const normal = v3Scale(rawNormal, 1 / normalLength);

    const denominator = v3Dot(normal, direction);
    if (Math.abs(denominator) <= parallelEpsilon) continue; // rayo paralelo al plano

    const backFace = denominator > 0; // la normal apunta EN el sentido de avance
    if (cull && backFace) continue;

    const origin = faceCentroid(body, face);
    const t = v3Dot(v3Sub(origin, ray.origin), normal) / denominator;
    if (t <= aheadEpsilon) continue; // detrás del ojo, o justo encima

    const point = v3Add(ray.origin, v3Scale(direction, t));
    if (!cadFaceContainsPoint(body, face, point, { scale })) continue;

    hits.push({
      face,
      point,
      t,
      normal,
      backFace,
      planarityDeviation: facePlanarity(body, face),
    });
  }

  hits.sort((a, b) => a.t - b.t);
  return hits;
}

/** La primera cara que el rayo atraviesa, o `null` si no atraviesa ninguna. */
export function cadFaceRayHit(
  body: BrepBody,
  ray: CadPickRay,
  options: CadFaceRayOptions = {},
): CadFaceHit | null {
  const hits = cadFaceRayHits(body, ray, options);
  return hits.length > 0 ? hits[0] : null;
}
