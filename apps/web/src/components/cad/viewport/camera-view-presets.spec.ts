/**
 * `applyCadCameraViewPreset`: las seis posiciones de cámara del visor 3D.
 *
 * Lo único con lógica real es el signo de cada eje —"front"/"back" en Z,
 * "left"/"right" en X, "top"/"iso" con su propio encuadre— así que lo que se
 * prueba es justamente eso: la posición exacta que resulta para cada preset,
 * con un contexto de escena conocido, más que cualquier detalle de Three.js.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { check, checkPointClose, report } from "@/lib/brep/spec-support";
import {
  applyCadCameraViewPreset,
  CAD_CAMERA_VIEW_PRESET_BUTTONS,
  type CadCameraViewPreset,
} from "./camera-view-presets";

/**
 * `OrbitControls` real exige un `domElement` y engancha listeners — de más
 * para probar aritmética de posición. Sólo hace falta lo que
 * `applyCadCameraViewPreset` toca: `target` (un Vector3 real, mutado en
 * sitio) y `update()`.
 */
function fakeControls(): OrbitControls & { updateCalls: number } {
  const controls: {
    target: THREE.Vector3;
    updateCalls: number;
    update: () => void;
  } = {
    target: new THREE.Vector3(),
    updateCalls: 0,
    update: () => {
      controls.updateCalls += 1;
    },
  };
  return controls as unknown as OrbitControls & { updateCalls: number };
}

// Contexto de escena conocido: d = max(W, H) * s = max(4, 3) * 1 = 4.
const ctx = { s: 1, W: 4, H: 3 };

function apply(preset: CadCameraViewPreset) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const controls = fakeControls();
  applyCadCameraViewPreset(camera, controls, ctx, preset);
  return { camera, controls };
}

// --- las tres vistas que ya existían, ahora fuera del monolito -------------
{
  const { camera, controls } = apply("top");
  checkPointClose("top: cámara casi vertical sobre el origen", camera.position, {
    x: 0,
    y: 6,
    z: 0.01,
  });
  checkPointClose("top: apunta al origen", controls.target, { x: 0, y: 0, z: 0 });
  check("top: controls.update() se llamó", controls.updateCalls === 1);
}
{
  const { camera } = apply("front");
  checkPointClose("front: cámara en +Z", camera.position, { x: 0, y: 2, z: 5.2 });
}
{
  const { camera } = apply("iso");
  checkPointClose("iso: encuadre de esquina", camera.position, {
    x: 2.4,
    y: 3.4,
    z: 4,
  });
}

// --- las tres vistas NUEVAS de este corte -----------------------------------
{
  const { camera } = apply("back");
  checkPointClose(
    "back: el espejo exacto de front, en -Z",
    camera.position,
    { x: 0, y: 2, z: -5.2 },
  );
}
{
  const { camera } = apply("left");
  checkPointClose("left: cámara en -X", camera.position, { x: -5.2, y: 2, z: 0 });
}
{
  const { camera } = apply("right");
  checkPointClose(
    "right: el espejo exacto de left, en +X",
    camera.position,
    { x: 5.2, y: 2, z: 0 },
  );
}

// --- CAD_CAMERA_VIEW_PRESET_BUTTONS: lo que pinta la barra ------------------
{
  check(
    "seis botones, uno por preset",
    CAD_CAMERA_VIEW_PRESET_BUTTONS.length === 6,
  );
  const presets = CAD_CAMERA_VIEW_PRESET_BUTTONS.map(([preset]) => preset);
  check(
    "sin presets repetidos",
    new Set(presets).size === presets.length,
  );
  check(
    "cada botón trae un título en español, no vacío",
    CAD_CAMERA_VIEW_PRESET_BUTTONS.every(([, title]) => title.trim().length > 0),
  );
  check(
    "cada botón trae un ícono (componente, no undefined)",
    CAD_CAMERA_VIEW_PRESET_BUTTONS.every(([, , Icon]) => typeof Icon === "object" || typeof Icon === "function"),
  );
}

report("camera-view-presets", 12);
