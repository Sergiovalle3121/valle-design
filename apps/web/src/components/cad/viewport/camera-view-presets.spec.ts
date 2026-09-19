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
 * para probar aritmética de posición. Reproduce el recorte polar que
 * OrbitControls.update() aplica en producción: maxPolarAngle por defecto es
 * π/2 (el tope que camera-policy.ts fija para 3D).
 */
function fakeControls(camera?: THREE.PerspectiveCamera): OrbitControls & { updateCalls: number; maxPolarAngle: number; minPolarAngle: number } {
  const cam = camera ?? new THREE.PerspectiveCamera();
  const controls: {
    target: THREE.Vector3;
    updateCalls: number;
    maxPolarAngle: number;
    minPolarAngle: number;
    update: () => void;
  } = {
    target: new THREE.Vector3(),
    updateCalls: 0,
    maxPolarAngle: Math.PI / 2.05,
    minPolarAngle: 0,
    update: () => {
      controls.updateCalls += 1;
      const offset = cam.position.clone().sub(controls.target);
      const r = offset.length();
      if (r < 1e-10) return;
      const phi = Math.acos(offset.y / r);
      const clamped = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, phi));
      if (Math.abs(phi - clamped) > 1e-10) {
        const sinPhi = Math.sin(clamped);
        cam.position.set(
          controls.target.x + r * sinPhi * (offset.x / (r * Math.sin(phi) || 1)),
          controls.target.y + r * Math.cos(clamped),
          controls.target.z + r * sinPhi * (offset.z / (r * Math.sin(phi) || 1)),
        );
      }
    },
  };
  return controls as unknown as OrbitControls & { updateCalls: number; maxPolarAngle: number; minPolarAngle: number };
}

// Contexto de escena conocido: d = max(W, H) * s = max(4, 3) * 1 = 4.
const ctx = { s: 1, W: 4, H: 3 };

function apply(preset: CadCameraViewPreset) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const controls = fakeControls(camera);
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
  checkPointClose("front: alzado horizontal en +Z", camera.position, { x: 0, y: 0, z: 5.2 });
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
    { x: 0, y: 0, z: -5.2 },
  );
}
{
  const { camera } = apply("left");
  checkPointClose("left: alzado en -X", camera.position, { x: -5.2, y: 0, z: 0 });
}
{
  const { camera } = apply("right");
  checkPointClose(
    "right: el espejo exacto de left, en +X",
    camera.position,
    { x: 5.2, y: 0, z: 0 },
  );
}

// --- los cuatro alzados están a la altura del objetivo -----------------------
for (const preset of ["front", "back", "left", "right"] as const) {
  const { camera, controls } = apply(preset);
  check(
    `${preset}: camera.y === target.y (alzado sin inclinación)`,
    Math.abs(camera.position.y - controls.target.y) < 1e-9,
  );
  check(
    `${preset}: maxPolarAngle restaurado a π/2.05 tras el preset`,
    controls.maxPolarAngle === Math.PI / 2.05,
  );
}

// --- content que se SUPERPONE al footprint: mismo resultado que sin content -
// (P0-3, hallado aparte tras la campaña 3D-M1: los presets también deben
// preferir el contenido real cuando el footprint no lo alcanza.)
{
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const controls = fakeControls();
  // Completamente dentro de [0,4]×[0,3]: se superpone, así que el footprint
  // sigue siendo lo que se encuadra — bit-idéntico al caso sin `content`.
  applyCadCameraViewPreset(camera, controls, ctx, "front", {
    minX: 1,
    minY: 1,
    maxX: 2,
    maxY: 2,
  });
  checkPointClose(
    "front con content SUPERPUESTO: mismo resultado que sin content",
    camera.position,
    { x: 0, y: 0, z: 5.2 },
  );
}

// --- content DISJUNTO del footprint: el preset encuadra sobre el contenido -
{
  // d = max(106-100, 104-100) = 6; centro de escena = (centro_mundo - mitad
  // del footprint) * s.
  const content = { minX: 100, minY: 100, maxX: 106, maxY: 104 };
  const cx = ((100 + 106) / 2 - ctx.W / 2) * ctx.s;
  const cz = ((100 + 104) / 2 - ctx.H / 2) * ctx.s;
  const d = 6;

  const front = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const frontControls = fakeControls();
  applyCadCameraViewPreset(front, frontControls, ctx, "front", content);
  checkPointClose(
    "front con content DISJUNTO: encuadra el contenido, no el footprint vacío",
    front.position,
    { x: cx, y: 0, z: cz + d * 1.3 },
  );
  checkPointClose(
    "front con content disjunto: el target es el centro del contenido",
    frontControls.target,
    { x: cx, y: 0, z: cz },
  );

  const top = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  const topControls = fakeControls();
  applyCadCameraViewPreset(top, topControls, ctx, "top", content);
  checkPointClose(
    "top con content disjunto: sigue casi vertical, pero sobre el contenido",
    top.position,
    { x: cx, y: d * 1.5, z: cz + 0.01 },
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

report("camera-view-presets", 24);
