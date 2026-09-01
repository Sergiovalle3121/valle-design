/**
 * DÓNDE CAE EL PUNTO, Y POR QUÉ.
 *
 * ## El problema, dicho con precisión
 *
 * En modo 3D el puntero se convierte hoy en coordenadas de dibujo lanzando un
 * rayo contra el plano del SUELO (`view/solid-snap.ts:14-18`). Eso basta
 * mientras se dibuja en planta y no basta para nada más: apoyar un trazo en el
 * faldón inclinado de una cubierta, en el costado de una pieza o en el canto de
 * una losa es imposible, porque el punto siempre aterriza abajo.
 *
 * `UCS > Cara` ya sabe fijar el plano de trabajo sobre una cara designada con
 * el rayo real. Lo que falta es que **el cursor obedezca a ese plano**, que es
 * la diferencia entre tener un SCU y poder dibujar con él.
 *
 * ## Qué hace este módulo, y qué NO hace
 *
 * Resuelve el punto 3D bajo el cursor **por prioridad**, y devuelve el punto
 * **y su razón**. La razón no es un adorno de registro: es lo que la insignia
 * pinta al lado del cursor, y sin ella el usuario ve un punto aparecer en un
 * sitio y no puede saber por qué. Un CAD que acierta sin explicarse enseña a
 * desconfiar de él.
 *
 * Aritmética pura, sin ciclo de vida ni estado propio: recibe un rayo, un
 * plano y unos candados, y devuelve un punto. Quien lo llama decide cuándo.
 *
 * **No es un motor de enganche nuevo.** `snap-engine.ts` es 2D de arriba abajo
 * y `solid-snap.ts` ya resolvió cómo mezclar 2D y 3D —proyectando a PÍXELES de
 * pantalla, porque la apertura de captura es una tolerancia de pantalla y no de
 * mundo—. Aquí no nace un tercero: este módulo COMPONE, decidiendo sobre qué
 * plano cae el punto, y deja el enganche a quien ya lo hace.
 *
 * ## La reutilización que sí es correcta, y la que no
 *
 * Una vez que el punto está sobre el plano de trabajo, **el problema vuelve a
 * ser bidimensional en el marco de ese plano**. Así que el bloqueo ortogonal y
 * el rastreo polar se resuelven con `polar-tracking.ts` TAL CUAL, en las
 * coordenadas del plano, y se devuelven al mundo. Eso es reutilización de
 * verdad: la misma aritmética sobre el mismo problema, expresado en el marco
 * donde vuelve a ser el mismo.
 *
 * Lo que NO se reutiliza es la intersección rayo-plano de `pick3d/face-ray.ts`,
 * y conviene decir por qué en vez de dejar dos funciones parecidas sin
 * explicación: aquella acota el impacto AL CONTORNO de la cara
 * (`containsProjected`), que es lo correcto para designar. Dibujar es otra
 * cosa — el trazo puede y debe salirse del borde de la cara en la que se
 * apoya, igual que un SCU no termina donde termina el objeto que lo definió—,
 * así que aquí el plano es INFINITO. Son dos trabajos distintos con la misma
 * fórmula en medio.
 */
import type { CadPoint3 } from "../cad-document";
import type { CadNamedUcs } from "../ucs";
import { orthoSnap, polarSnap } from "../polar-tracking";

/** Un rayo: de dónde sale y hacia dónde va. `direction` no necesita ser unitario. */
export interface CadInferenceRay {
  origin: CadPoint3;
  direction: CadPoint3;
}

/**
 * Por qué el punto cayó donde cayó.
 *
 * `plano` es el caso normal —el cursor sobre el plano de trabajo vigente— y por
 * eso NO se anuncia con insignia: pintar una etiqueta permanente que dice lo
 * que siempre pasa es ruido. Las otras tres sí se anuncian, porque las tres
 * significan que el punto se movió de donde el ratón lo puso.
 */
export type CadInferenceReason = "plano" | "eje-x" | "eje-y" | "eje-z" | "polar";

export interface CadInferredPoint {
  point: CadPoint3;
  reason: CadInferenceReason;
  /** Texto de la insignia. Vacío cuando la razón es el caso normal. */
  label: string;
}

export interface CadInferenceOptions {
  /**
   * Punto base del gesto en curso: el vértice anterior de una polilínea, el
   * primer punto de una línea. Sin él no hay eje que bloquear ni ángulo que
   * rastrear — un candado necesita algo de donde colgar.
   */
  base?: CadPoint3 | null;
  /** Restringir a los ejes del plano de trabajo (F8 de AutoCAD). */
  ortho?: boolean;
  /** Paso angular del rastreo polar, en grados. `0` o ausente lo apaga. */
  polarStepDegrees?: number;
}

/** Fracción de la escala por debajo de la cual el rayo se considera paralelo. */
const PARALLEL_EPSILON = 1e-9;

function dot(a: CadPoint3, b: CadPoint3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: CadPoint3, b: CadPoint3): CadPoint3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled(a: CadPoint3, b: CadPoint3, k: number): CadPoint3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

function finite(p: CadPoint3): boolean {
  return (
    Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  );
}

/**
 * Rayo contra el plano INFINITO del SCU.
 *
 * Devuelve `null` cuando el rayo es paralelo al plano —no hay punto, y decirlo
 * es mejor que devolver uno enorme— y también cuando el impacto queda DETRÁS
 * del origen del rayo: eso es el plano a la espalda de la cámara, y aceptarlo
 * pondría el trazo en un sitio que el usuario no está mirando.
 */
export function cadRayPlanePoint(
  ray: CadInferenceRay,
  plane: CadNamedUcs,
): CadPoint3 | null {
  if (!finite(ray.origin) || !finite(ray.direction)) return null;
  const normal = plane.zAxis;
  const denominator = dot(normal, ray.direction);
  if (Math.abs(denominator) <= PARALLEL_EPSILON) return null;
  const t = dot(sub(plane.origin, ray.origin), normal) / denominator;
  if (!Number.isFinite(t) || t < 0) return null;
  return addScaled(ray.origin, ray.direction, t);
}

/** Coordenadas del punto en el marco del plano. El eje Z se descarta: es 0. */
export function cadPointToPlane(
  plane: CadNamedUcs,
  point: CadPoint3,
): { x: number; y: number } {
  const d = sub(point, plane.origin);
  return { x: dot(d, plane.xAxis), y: dot(d, plane.yAxis) };
}

/** El camino de vuelta: coordenadas del plano → mundo. */
export function cadPointFromPlane(
  plane: CadNamedUcs,
  uv: { x: number; y: number },
): CadPoint3 {
  return {
    x: plane.origin.x + plane.xAxis.x * uv.x + plane.yAxis.x * uv.y,
    y: plane.origin.y + plane.xAxis.y * uv.x + plane.yAxis.y * uv.y,
    z: plane.origin.z + plane.xAxis.z * uv.x + plane.yAxis.z * uv.y,
  };
}

/** La etiqueta que ve el usuario. Vacía para el caso normal, a propósito. */
function labelFor(reason: CadInferenceReason): string {
  switch (reason) {
    case "eje-x":
      return "Orto · X del plano";
    case "eje-y":
      return "Orto · Y del plano";
    case "eje-z":
      return "Orto · normal del plano";
    case "polar":
      return "Polar";
    case "plano":
      return "";
  }
}

/**
 * El punto bajo el cursor, resuelto por prioridad, con su razón.
 *
 * El orden importa y es el de AutoCAD: **el candado explícito gana**. Quien
 * activó Orto pidió que el trazo vaya recto aunque su mano tiemble; devolverle
 * el punto crudo porque «está más cerca del ratón» es desobedecer una orden
 * directa. Por eso el bloqueo se aplica DESPUÉS de resolver el plano, nunca
 * como una alternativa a él.
 *
 * Devuelve `null` sólo cuando no hay punto que dar —rayo paralelo al plano, o
 * el plano a la espalda—. Un `null` es una respuesta honesta; un punto en el
 * infinito no lo es.
 */
export function cadInferPoint(
  ray: CadInferenceRay,
  plane: CadNamedUcs,
  options: CadInferenceOptions = {},
): CadInferredPoint | null {
  const raw = cadRayPlanePoint(ray, plane);
  if (raw === null) return null;

  const base = options.base ?? null;
  // Sin punto base no hay candado posible: un eje se bloquea RESPECTO DE algo.
  if (!base || !finite(base)) {
    return { point: raw, reason: "plano", label: "" };
  }

  // Aquí abajo el problema es 2D en el marco del plano, y `polar-tracking.ts`
  // vale sin adaptarlo: la misma aritmética sobre el mismo problema, sólo que
  // expresado donde vuelve a ser el mismo.
  const baseUv = cadPointToPlane(plane, base);
  const cursorUv = cadPointToPlane(plane, raw);

  if (options.ortho) {
    const snapped = orthoSnap(baseUv, cursorUv);
    const reason: CadInferenceReason =
      Math.abs(snapped.point.y - baseUv.y) < Math.abs(snapped.point.x - baseUv.x)
        ? "eje-x"
        : "eje-y";
    return {
      point: cadPointFromPlane(plane, snapped.point),
      reason,
      label: labelFor(reason),
    };
  }

  const step = options.polarStepDegrees ?? 0;
  if (step > 0) {
    const snapped = polarSnap(baseUv, cursorUv, step);
    if (snapped.snapped) {
      return {
        point: cadPointFromPlane(plane, snapped.point),
        reason: "polar",
        label: `${labelFor("polar")} ${snapped.angle.toFixed(0)}\u00b0`,
      };
    }
  }

  return { point: raw, reason: "plano", label: "" };
}
