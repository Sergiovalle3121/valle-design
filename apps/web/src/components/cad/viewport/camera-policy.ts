import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAD_TOUCH_ONE_FINGER_IDLE } from "./touch-gestures";

/**
 * Qué gesto maneja la cámara en cada modo de vista.
 *
 * ## Por qué es una función y no dos bloques copiados
 *
 * Estaba escrito DOS veces dentro del monolito —al cambiar de modo y al aplicar
 * un modo desde una vista guardada— y las dos copias tenían que decir lo mismo.
 * Una regla de entrada duplicada es una regla que un día se contradice a sí
 * misma: basta con que alguien arregle el paneo en un sitio.
 *
 * ## La regla que cambia aquí, y por qué
 *
 * En modo PLANO, **un dedo ya no panea**. Estaba medido en
 * `docs/cad/evidence/touch-support.json`: un arrastre de un dedo sobre el fondo
 * movía la cámara 89-95 px, y eso tiene dos consecuencias caras en una tableta.
 * La primera es que designar por ventana con el dedo era imposible. La segunda,
 * peor: apuntar un punto con el dedo obliga a deslizar —no hay hover, así que
 * no hay otra forma de ver a dónde va a caer—, y ese deslizamiento arrastraba
 * el plano justo debajo del dedo que intentaba precisarlo.
 *
 * El reparto que queda es el universal, el que trae puesto cualquiera que haya
 * usado un mapa: **un dedo designa y arrastra, dos dedos son la cámara**
 * (paneo y pellizco, que OrbitControls ya resolvía y la sonda midió vivos).
 *
 * En modo 3D un dedo SIGUE orbitando. Ahí no se dibuja: es un visor, y girar
 * con un dedo es también el gesto universal en ese contexto.
 *
 * El ratón no se toca: en plano su botón izquierdo panea como siempre.
 */
export function applyCadCameraPolicy(
  controls: OrbitControls,
  mode: "2d" | "3d",
): void {
  const plan = mode === "2d";
  controls.minPolarAngle = 0;
  // En plano la cámara queda clavada mirando hacia abajo; en 3D se le deja
  // todo el hemisferio menos el rasante, que degenera la matriz de vista.
  controls.maxPolarAngle = plan ? 0.05 : Math.PI / 2.05;
  controls.enableRotate = !plan;
  controls.mouseButtons.LEFT = plan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = plan
    ? (CAD_TOUCH_ONE_FINGER_IDLE as unknown as THREE.TOUCH)
    : THREE.TOUCH.ROTATE;
}

/** Contexto mundo↔escena que deriva de la huella: escala y medio lienzo lógico. */
export interface CadSceneContext {
  s: number;
  W: number;
  H: number;
}

/** Punto o target de cámara, plano — ver `lib/cad/view/camera-continuity.ts`. */
export interface CadCameraPose {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/**
 * Encuadre de cámara para una huella dada: la última cámara conocida si hay
 * una (`restore`), o el encuadre por defecto si no.
 *
 * Vive fuera del ciclo de vida de la escena (`Layout3DEditor.tsx`) para poder
 * volver a llamarse en un cambio REAL de huella (un footprint distinto, no un
 * `data` que cambió de referencia por autosave) sin tumbar renderer, workers
 * ni el resto de anfitriones montados. `restore` es lo que permite además que
 * un remontaje conserve el encuadre del usuario en vez de reiniciarlo.
 */
export function applyInitialCameraFraming(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  footprintW: number,
  footprintH: number,
  restore?: CadCameraPose | null,
): CadSceneContext {
  const W = footprintW || 1;
  const H = footprintH || 1;
  const s = 30 / Math.max(W, H);
  const position = restore?.position ?? {
    x: W * s * 0.45,
    y: Math.max(W, H) * s * 0.8,
    z: H * s * 1.0 + 10,
  };
  const target = restore?.target ?? { x: 0, y: 0, z: 0 };
  camera.position.set(position.x, position.y, position.z);
  controls.target.set(target.x, target.y, target.z);
  controls.update();
  return { s, W, H };
}
