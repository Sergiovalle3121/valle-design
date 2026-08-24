import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface CadSceneContext {
  s: number;
  W: number;
  H: number;
}

/**
 * Encuadre inicial de cámara + contexto mundo↔escena, derivados de la
 * huella. Vive aparte del ciclo de vida de la escena en Layout3DEditor: ese
 * efecto sólo debe reconstruir renderer/controles al abrir un documento
 * nuevo, nunca en cada autosave — pero un resize REAL de la huella sí debe
 * reencuadrar la cámara, y este helper es lo que ese efecto separado llama
 * para lograrlo sin tumbar nada.
 */
export function applyInitialCameraFraming(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  footprintW: number,
  footprintH: number,
): CadSceneContext {
  const W = footprintW || 1;
  const H = footprintH || 1;
  const s = 30 / Math.max(W, H);
  camera.position.set(W * s * 0.45, Math.max(W, H) * s * 0.8, H * s * 1.0 + 10);
  controls.target.set(0, 0, 0);
  controls.update();
  return { s, W, H };
}
