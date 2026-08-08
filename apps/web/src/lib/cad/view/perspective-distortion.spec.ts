/**
 * Línea base de la cámara actual (Ola 1 del plan de paridad).
 *
 * El editor dibuja los planos 2D con `new THREE.PerspectiveCamera(50, …)` y el
 * "modo 2D" sólo limita OrbitControls a `maxPolarAngle = 0.05`. Esta spec
 * reconstruye esa cámara y **mide** qué se rompe y qué no, para que la
 * migración a ortográfica se justifique con números y no con intuición.
 *
 * ## Lo que la medición corrigió
 *
 * La intuición dice "perspectiva ⇒ las paralelas convergen mucho". Es falso en
 * este encuadre, y conviene decirlo: **un plano perpendicular al eje óptico se
 * proyecta con escala uniforme aunque la cámara sea en perspectiva.** Como el
 * modo 2D deja la cámara a sólo 0,05 rad (2,9°) de la vertical, la deformación
 * visible es pequeña. Medirla y publicarla evita defender la ola con un
 * argumento que no se sostiene.
 *
 * El problema que sí bloquea no es la fuga: es que **no existe un factor de
 * escala que se pueda leer ni fijar**. El zoom es un desplazamiento de cámara,
 * y el factor por el que crece una longitud al acercarse depende de dónde esté
 * esa longitud en la pantalla. De ahí que hoy sean inalcanzables `ZOOM nXP`,
 * el escalado anotativo, un grosor de línea en píxeles y una regla exacta.
 *
 * No prueba código de producción: mide un defecto. Vive junto a `cad-view.ts`,
 * que es su reemplazo.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { cadViewFromViewport, cadViewWorldToScreen } from "./cad-view";

const WIDTH_PX = 1600;
const HEIGHT_PX = 900;
/** Inclinación que OrbitControls deja en modo 2D: `maxPolarAngle = 0.05`. */
const POLAR = 0.05;

function editorCamera(distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, WIDTH_PX / HEIGHT_PX, 0.1, 4000);
  // La inclinación va en el plano X–Y, así que el gradiente de escorzo corre
  // por X. Medir por Z —el eje perpendicular a la inclinación— da 0% y engaña.
  camera.position.set(distance * Math.sin(POLAR), distance * Math.cos(POLAR), 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

function project(camera: THREE.PerspectiveCamera, x: number, z: number): { x: number; y: number } {
  const ndc = new THREE.Vector3(x, 0, z).project(camera);
  return { x: ((ndc.x + 1) / 2) * WIDTH_PX, y: ((1 - ndc.y) / 2) * HEIGHT_PX };
}

function pixelLength(camera: THREE.PerspectiveCamera, x0: number, z0: number, x1: number, z1: number): number {
  const a = project(camera, x0, z0);
  const b = project(camera, x1, z1);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

const distance = 1000;
const camera = editorCamera(distance);
const halfVisibleZ = distance * Math.tan((50 * Math.PI) / 180 / 2);
const halfVisibleX = halfVisibleZ * (WIDTH_PX / HEIGHT_PX);
const probe = halfVisibleZ * 0.05;

// --- 1. La escala NO es uniforme, pero el error es pequeño -------------------
{
  const left = -halfVisibleX * 0.85;
  const right = halfVisibleX * 0.85;
  const atLeft = pixelLength(camera, left, 0, left + probe, 0);
  const atRight = pixelLength(camera, right, 0, right + probe, 0);
  const atCenter = pixelLength(camera, 0, 0, probe, 0);
  const spread = (Math.max(atLeft, atRight) - Math.min(atLeft, atRight)) / atCenter;

  console.log(
    `Perspectiva: el mismo segmento mide ${atLeft.toFixed(3)} px a la izquierda, ` +
      `${atCenter.toFixed(3)} px en el centro y ${atRight.toFixed(3)} px a la derecha ` +
      `— ${(spread * 100).toFixed(2)}% de dispersión de escala a lo ancho de la pantalla.`,
  );
  assert.ok(spread > 0, "la escala varía a lo ancho de la pantalla: no hay UN factor de escala");

  // La ortográfica que la sustituye no tiene esa dispersión, por construcción.
  const view = cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 1);
  const orthoAt = (x: number) =>
    cadViewWorldToScreen(view, { x: x + probe, y: 0 }).x - cadViewWorldToScreen(view, { x, y: 0 }).x;
  assert.ok(
    Math.abs(orthoAt(left) - orthoAt(right)) < 1e-9,
    "bajo ortográfica el mismo segmento mide exactamente lo mismo en cualquier punto de la pantalla",
  );
}

// --- 2. Las paralelas convergen, poco pero de forma medible ------------------
{
  // Dos rectas paralelas al eje X (z constante), separadas en Z. Se miden a lo
  // largo de su recorrido, que es donde se ve si convergen.
  const separation = halfVisibleZ * 0.3;
  const zA = -separation / 2;
  const zB = separation / 2;
  const xNear = -halfVisibleX * 0.85;
  const xFar = halfVisibleX * 0.85;

  const gapNear = Math.hypot(
    project(camera, xNear, zB).x - project(camera, xNear, zA).x,
    project(camera, xNear, zB).y - project(camera, xNear, zA).y,
  );
  const gapFar = Math.hypot(
    project(camera, xFar, zB).x - project(camera, xFar, zA).x,
    project(camera, xFar, zB).y - project(camera, xFar, zA).y,
  );
  const convergence = Math.abs(gapFar - gapNear) / Math.max(gapNear, gapFar);

  const angleOf = (z: number) => {
    const a = project(camera, xNear, z);
    const b = project(camera, xFar, z);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const angleSkewDeg = Math.abs(((angleOf(zA) - angleOf(zB)) * 180) / Math.PI);

  console.log(
    `Perspectiva: dos paralelas separadas ${separation.toFixed(0)} unidades se ven a ` +
      `${gapNear.toFixed(2)} px en un extremo y ${gapFar.toFixed(2)} px en el otro ` +
      `— ${(convergence * 100).toFixed(2)}% de fuga, con ${angleSkewDeg.toFixed(3)}° de desalineación angular.`,
  );
  assert.ok(convergence > 0.01, "las paralelas convergen de forma medible");

  // Bajo ortográfica, ni fuga ni desalineación.
  const view = cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 1);
  const orthoGap = (x: number) =>
    Math.hypot(
      cadViewWorldToScreen(view, { x, y: zB }).x - cadViewWorldToScreen(view, { x, y: zA }).x,
      cadViewWorldToScreen(view, { x, y: zB }).y - cadViewWorldToScreen(view, { x, y: zA }).y,
    );
  assert.ok(
    Math.abs(orthoGap(xNear) - orthoGap(xFar)) < 1e-9,
    "bajo ortográfica dos paralelas conservan su separación de extremo a extremo",
  );
}

// --- 3. El zoom es un dolly: no existe UN factor de zoom ---------------------
// Esta es la propiedad que de verdad bloquea el producto, y no es sutil.
{
  const closer = editorCamera(distance / 2);
  const factorAt = (x: number) =>
    pixelLength(closer, x, 0, x + probe, 0) / pixelLength(camera, x, 0, x + probe, 0);
  const centerFactor = factorAt(0);
  const edgeFactor = factorAt(halfVisibleX * 0.85);
  const disagreement = Math.abs(centerFactor - edgeFactor) / centerFactor;

  console.log(
    `Perspectiva: al acercar la cámara a la mitad, el centro escala ×${centerFactor.toFixed(4)} ` +
      `y el borde ×${edgeFactor.toFixed(4)} — ${(disagreement * 100).toFixed(2)}% de desacuerdo. ` +
      `No hay un número que se pueda llamar "el zoom".`,
  );
  assert.ok(
    disagreement > 0,
    "acercar la cámara no escala por igual: por eso no se puede leer ni fijar una escala de ploteo",
  );

  // Y lo decisivo: la distancia de cámara no dice cuántos píxeles mide una
  // unidad de dibujo sin conocer además el FOV, el alto del viewport y la
  // posición del punto. Bajo ortográfica ese número ES el estado de la vista.
  const view = cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 0, 0, 3);
  const zoomed = { ...view, pixelsPerUnit: view.pixelsPerUnit * 2 };
  const orthoFactorAt = (x: number) => {
    const before = cadViewWorldToScreen(view, { x: x + probe, y: 0 }).x - cadViewWorldToScreen(view, { x, y: 0 }).x;
    const after = cadViewWorldToScreen(zoomed, { x: x + probe, y: 0 }).x - cadViewWorldToScreen(zoomed, { x, y: 0 }).x;
    return after / before;
  };
  assert.ok(
    Math.abs(orthoFactorAt(0) - 2) < 1e-12 && Math.abs(orthoFactorAt(halfVisibleX * 0.85) - 2) < 1e-12,
    "bajo ortográfica duplicar pixelsPerUnit duplica TODA longitud, en cualquier punto: eso es un zoom",
  );
}

console.log("cad perspective distortion baseline recorded");
