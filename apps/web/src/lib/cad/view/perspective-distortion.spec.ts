/**
 * Qué gana de verdad la vista 2D al ser ortográfica (Ola 2 del plan de paridad).
 *
 * Esta spec existe porque la primera versión del argumento era **falsa** y
 * conviene dejarlo escrito en vez de borrarlo.
 *
 * ## La corrección
 *
 * La intuición decía: "el 2D se dibuja con una cámara en perspectiva de 50°
 * inclinada 0,05 rad, luego las paralelas convergen". Se midió esa pose y salió
 * un 14,13% de dispersión de escala. Pero **el producto no usa esa pose**:
 * `applyViewMode("2d")` coloca la cámara en `(0, d·1.6, 0.01)` mirando al
 * origen, o sea perpendicular al plano con 0,012° de inclinación. El
 * `maxPolarAngle = 0.05` de OrbitControls es un LÍMITE, no el ángulo real, y en
 * 2D la rotación está desactivada, así que nunca se alcanza.
 *
 * Y hay un hecho geométrico que remata el asunto: **un plano perpendicular al
 * eje óptico se proyecta con escala uniforme aunque la cámara sea en
 * perspectiva.** Es decir, para geometría a cota cero la vista 2D de hoy ya era
 * esencialmente paralela. Un golden que sólo comprobara "la proyección es afín"
 * pasaría con ambas cámaras y no probaría nada.
 *
 * ## Lo que sí cambia, y no es pequeño
 *
 * La geometría CAD tiene **elevación**: `CadPoint3` lleva `z`, el DXF la
 * transporta y el editor la proyecta. Bajo perspectiva, una entidad elevada está
 * más cerca de la cámara y se dibuja **más grande** que otra idéntica a cota
 * cero. En una vista de planta eso es sencillamente incorrecto: dos muros de la
 * misma longitud a distinta altura deben medir lo mismo sobre el plano.
 *
 * Bajo ortográfica miden lo mismo, exactamente, por construcción.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { cadViewFromViewport, cadViewWorldToScreen } from "./cad-view";

const WIDTH_PX = 1600;
const HEIGHT_PX = 900;

/** Reproduce `applyViewMode("2d")`: cámara sobre el origen, casi perpendicular. */
function plan2dCamera(distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, WIDTH_PX / HEIGHT_PX, 0.1, 4000);
  camera.position.set(0, distance, 0.01);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function project(camera: THREE.PerspectiveCamera, x: number, y: number, z: number) {
  const ndc = new THREE.Vector3(x, y, z).project(camera);
  return { x: ((ndc.x + 1) / 2) * WIDTH_PX, y: ((1 - ndc.y) / 2) * HEIGHT_PX };
}

function pixelLength(
  camera: THREE.PerspectiveCamera,
  a: [number, number, number],
  b: [number, number, number],
) {
  const pa = project(camera, ...a);
  const pb = project(camera, ...b);
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
}

// Escala del editor: `s = 30 / max(W, H)`, así que la planta ocupa 30 unidades
// de escena y la cámara se sitúa a `max(W,H)·s·1.6 = 48`.
const cameraHeight = 48;
const camera = plan2dCamera(cameraHeight);

// --- 1. A cota cero, la vista de hoy YA era esencialmente paralela -----------
{
  const probe = 1.2;
  const at = (x: number) => pixelLength(camera, [x, 0, 0], [x + probe, 0, 0]);
  const left = at(-12);
  const centre = at(0);
  const right = at(12);
  const spread = (Math.max(left, centre, right) - Math.min(left, centre, right)) / centre;
  console.log(
    `Pose 2D real: dispersión de escala a cota cero = ${(spread * 100).toFixed(4)}% ` +
      `(${left.toFixed(4)} / ${centre.toFixed(4)} / ${right.toFixed(4)} px).`,
  );
  assert.ok(
    spread < 0.001,
    "a cota cero la pose 2D vigente ya es casi paralela: el argumento de la fuga NO se sostiene",
  );
}

// --- 2. Con elevación, deja de serlo — y ese es el defecto real ---------------
{
  const probe = 1.2;
  // Elevaciones en unidades de ESCENA. Con `s = 30/20000`, 4,5 unidades de
  // escena son 3.000 mm de dibujo: la altura de un muro corriente.
  const flat = pixelLength(camera, [0, 0, 0], [probe, 0, 0]);
  const raised = pixelLength(camera, [0, 4.5, 0], [probe, 4.5, 0]);
  const error = (raised - flat) / flat;
  console.log(
    `Pose 2D real: el mismo segmento mide ${flat.toFixed(3)} px a cota cero y ` +
      `${raised.toFixed(3)} px a 3.000 mm de elevación — ${(error * 100).toFixed(2)}% más grande.`,
  );
  assert.ok(
    error > 0.05,
    "bajo perspectiva la elevación cambia el tamaño en planta: dos muros iguales a distinta altura no miden lo mismo",
  );

  // Bajo ortográfica la elevación no altera el tamaño: es la definición de
  // proyección paralela, y es lo que una vista de planta necesita.
  const view = cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 1);
  const orthoFlat =
    cadViewWorldToScreen(view, { x: probe, y: 0 }).x - cadViewWorldToScreen(view, { x: 0, y: 0 }).x;
  assert.ok(orthoFlat > 0, "la ortográfica mide una longitud positiva");
  // `cadViewWorldToScreen` no admite elevación por diseño: en una proyección
  // paralela la cota NO interviene en la posición sobre el plano. Esa ausencia
  // es la garantía, no una carencia.
}

// --- 3. Y la escala sigue sin ser un número que se pueda leer ----------------
{
  // La única forma de saber cuántos píxeles mide una unidad de dibujo bajo
  // perspectiva es proyectar y medir —que es exactamente lo que `ScaleBar.tsx`
  // hace, y por lo que su comentario admite que una regla exacta es frágil—.
  const measured = pixelLength(camera, [0, 0, 0], [1, 0, 0]);
  const fromCameraState =
    HEIGHT_PX / (2 * cameraHeight * Math.tan((50 * Math.PI) / 180 / 2));
  console.log(
    `Pose 2D real: la escala hay que deducirla proyectando (${measured.toFixed(4)} px/unidad); ` +
      `derivarla del estado de cámara exige distancia, FOV y alto de viewport (${fromCameraState.toFixed(4)}).`,
  );
  assert.ok(
    Math.abs(measured - fromCameraState) / measured < 0.01,
    "las dos vías coinciden a cota cero, pero ninguna es un valor que la vista posea",
  );

  // Bajo ortográfica ese número ES el estado de la vista: se lee y se fija.
  const view = cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 3.25);
  assert.equal(view.pixelsPerUnit, 3.25, "pixelsPerUnit es estado, no una medición");
}

console.log("cad 2D projection baseline recorded");
