/**
 * El rayo de la cámara, expresado en coordenadas de DIBUJO.
 *
 * El lienzo THREE vive en su propio espacio: el editor escala la huella por
 * `ctx.s` y la centra en el origen, así que el eje Y del dibujo es el Z de la
 * escena y las magnitudes están multiplicadas. `cadDocumentFaceUnderRay` trabaja
 * en coordenadas de dibujo —las mismas en las que el usuario acota y el
 * documento se guarda—, y este módulo es el único sitio donde vive esa
 * conversión.
 *
 * ## Por qué no lo hace el editor
 *
 * Porque entonces sólo se podría probar montando un lienzo. Aquí es aritmética:
 * entra un rayo de escena y el contexto de la huella, sale un rayo de dibujo, y
 * el spec comprueba que un rayo que baja por el centro de la escena baja por el
 * centro del dibujo. `Layout3DEditor.tsx` sólo pasa lo que ya tiene.
 *
 * ## La dirección NO se traduce igual que el origen
 *
 * El origen es un punto y lleva la traslación del centrado; la dirección es un
 * vector y NO la lleva. Meterle el `+W/2` a la dirección es el error clásico de
 * este tipo de conversión y produce rayos que apuntan a cualquier parte cuando
 * la huella no está centrada en el origen. El spec lo pincha con una huella
 * grande y un rayo oblicuo.
 */
import type { CadPickRay } from "./face-ray";
import { cadDocumentFaceUnderRay } from "./document-face-pick";

/** Escala y medio lienzo lógico: lo que el editor llama `ctx`. */
export interface CadSceneFrame {
  /** Escala escena/dibujo. */
  s: number;
  /** Ancho de la huella, en unidades de dibujo. */
  W: number;
  /** Alto de la huella, en unidades de dibujo. */
  H: number;
}

/** Un rayo en coordenadas de la escena THREE. */
export interface CadSceneRay {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/**
 * Rayo de escena → rayo de dibujo.
 *
 * El eje **Y del dibujo es el Z de la escena**, y el **Z del dibujo es el Y de
 * la escena** (la altura). Es la misma correspondencia que usa `floorWorld` del
 * editor para convertir un impacto contra el suelo; aquí se generaliza al rayo
 * entero para poder cruzarlo con las caras de un sólido y no sólo con el plano.
 */
export function cadSceneRayToDrawing(
  ray: CadSceneRay,
  frame: CadSceneFrame,
): CadPickRay {
  const s = frame.s || 1;
  return {
    origin: {
      x: ray.origin.x / s + frame.W / 2,
      y: ray.origin.z / s + frame.H / 2,
      z: ray.origin.y / s,
    },
    // Sin traslación: una dirección no se centra.
    direction: {
      x: ray.direction.x / s,
      y: ray.direction.z / s,
      z: ray.direction.y / s,
    },
  };
}

/**
 * El resolutor de cara listo para enchufar al puente del enrutador.
 *
 * Existe para que `Layout3DEditor.tsx` gane CUATRO líneas y no dieciséis: ese
 * archivo tiene un trinquete que sólo baja, y el orden de las comprobaciones
 * —modo 3D, documento cargado, huella conocida— no es del editor, es de la
 * designación. Aquí además se puede probar; allí no.
 */
export function cadFacePickerFor(deps: {
  /** Modo de vista vivo. En planta no se designan caras: no hay escorzo. */
  mode: () => "2d" | "3d";
  /** Documento canónico cargado, o `null` mientras no lo hay. */
  document: () => import("../cad-document").CadDocument | null;
  /** Contexto de huella (`ctx`), o `null` antes del primer encuadre. */
  frame: () => CadSceneFrame | null;
  /** Rayo de la cámara viva, en coordenadas de escena. */
  sceneRay: (event: PointerEvent | MouseEvent) => CadSceneRay;
}) {
  return (event: PointerEvent | MouseEvent) => {
    if (deps.mode() !== "3d") return null;
    const documento = deps.document();
    const frame = deps.frame();
    if (!documento || !frame) return null;
    return cadDocumentFaceUnderRay(
      documento,
      cadSceneRayToDrawing(deps.sceneRay(event), frame),
    );
  };
}

/**
 * Aplicar el filtro de modos FORZADOS a una captura ya resuelta.
 *
 * Un paso del motor puede exigir modos concretos —`CENTER` y nada más— y la
 * captura de escena no los conoce: devuelve el mejor candidato de los catorce.
 * Esta función decide si ese candidato vale. Si no vale, se devuelve el punto
 * CRUDO y sin modo, que es lo correcto: forzar `CENTER` y recibir un `ENDPOINT`
 * disfrazado de centro es peor que no capturar nada.
 *
 * Sale del editor por lo de siempre: es una regla, no un efecto, y allí no se
 * podía probar sin montar un lienzo.
 */
export function cadHonorSnapOverride<TSnap extends string>(
  resolved: { x: number; y: number; snap?: TSnap },
  raw: { x: number; y: number },
  override: readonly TSnap[] | null,
): { point: { x: number; y: number }; snap?: TSnap } {
  const snap = resolved.snap;
  if (override && override.length > 0 && (!snap || !override.includes(snap)))
    return { point: raw };
  return { point: { x: resolved.x, y: resolved.y }, ...(snap ? { snap } : {}) };
}

/**
 * El bit que declara «este paso espera una cara», reexportado.
 *
 * Vive en `engine/command-types.ts` y ahí sigue siendo la verdad. Se reexporta
 * aquí para que quien enchufa la designación —el editor— traiga UNA sola línea
 * de import de este módulo en vez de dos: ese archivo tiene un trinquete que
 * sólo baja, y una línea es una línea.
 */
export { CAD_ACCEPT_FACE_PICK as CAD_FACE_PICK_BIT } from "../engine/command-types";
