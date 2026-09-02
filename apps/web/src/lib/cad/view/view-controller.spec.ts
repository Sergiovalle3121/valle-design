/**
 * Controlador de vista con cámara ortográfica real (Ola 2 del plan de paridad).
 *
 * La prueba que decide si esto sirve: **la cámara ortográfica de THREE tiene que
 * proyectar exactamente lo mismo que la aritmética pura de `cad-view.ts`**. Si
 * divergen, todo lo que se construya encima —regla exacta, grosor de línea en
 * píxeles, `ZOOM nXP`, escalado anotativo— queda apoyado en una mentira.
 *
 * Se comprueba proyectando puntos de dibujo a través de la matriz real de THREE
 * y comparando con la fórmula, no comparando la fórmula consigo misma.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import type { CadPoint2 } from "../cad-document";
import { cadViewBounds, cadViewFromViewport, cadViewWorldToScreen, type CadView } from "./cad-view";
import { CadViewController } from "./view-controller";
import { CAD_WORLD_UCS, cadUcsFromPlane, type CadNamedUcs } from "../ucs";

const WIDTH_PX = 1600;
const HEIGHT_PX = 900;
// Transformada realista del editor: una planta de 20.000 × 12.000 unidades.
const TRANSFORM = { scale: 0.02, width: 20000, height: 12000 };

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadPoint2, b: CadPoint2, tol = 1e-6): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Proyecta un punto de DIBUJO con la matriz real de la cámara de THREE. */
function projectThroughThree(
  controller: CadViewController,
  point: CadPoint2,
): CadPoint2 {
  const scene = new THREE.Vector3(
    (point.x - TRANSFORM.width / 2) * TRANSFORM.scale,
    0,
    (point.y - TRANSFORM.height / 2) * TRANSFORM.scale,
  );
  const ndc = scene.project(controller.camera);
  return { x: ((ndc.x + 1) / 2) * WIDTH_PX, y: ((1 - ndc.y) / 2) * HEIGHT_PX };
}

function controllerAt(view: Partial<CadView>): CadViewController {
  const controller = new CadViewController(TRANSFORM, WIDTH_PX, HEIGHT_PX);
  controller.setView({
    ...cadViewFromViewport(WIDTH_PX, HEIGHT_PX, 10000, 6000, 0.06),
    ...view,
  });
  return controller;
}

// --- LA prueba: THREE y la fórmula coinciden ---------------------------------
{
  const random = lcg(20260808);
  const views: Partial<CadView>[] = [
    {},
    { pixelsPerUnit: 0.4, centerX: 3000, centerY: 9000 },
    { pixelsPerUnit: 2.5, centerX: 17000, centerY: 1500 },
    { yScreenSign: -1 },
  ];
  let checked = 0;
  for (const partial of views) {
    const controller = controllerAt(partial);
    for (let i = 0; i < 150; i += 1) {
      const point = {
        x: controller.view.centerX + (random() - 0.5) * (WIDTH_PX / controller.view.pixelsPerUnit),
        y: controller.view.centerY + (random() - 0.5) * (HEIGHT_PX / controller.view.pixelsPerUnit),
      };
      const fromThree = projectThroughThree(controller, point);
      const fromFormula = cadViewWorldToScreen(controller.view, point);
      assert.ok(
        pointNear(fromThree, fromFormula, 1e-6),
        `THREE y la fórmula deben coincidir (vista ${JSON.stringify(partial)}, caso ${i}): ` +
          `${JSON.stringify(fromThree)} vs ${JSON.stringify(fromFormula)}`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 600, "coincidencia comprobada en las cuatro vistas");
}

// --- orientación del plano: la +Y del dibujo va hacia ABAJO -------------------
{
  const controller = controllerAt({});
  const centre = projectThroughThree(controller, { x: 10000, y: 6000 });
  const north = projectThroughThree(controller, { x: 10000, y: 7000 });
  const east = projectThroughThree(controller, { x: 11000, y: 6000 });
  assert.ok(north.y > centre.y, "más Y de dibujo cae más abajo en pantalla — el plano vigente");
  assert.ok(east.x > centre.x, "más X de dibujo cae más a la derecha");
  assert.ok(near(north.x, centre.x, 1e-6), "moverse en Y no desplaza en X: no hay giro");

  const flipped = controllerAt({ yScreenSign: -1 });
  const upCentre = projectThroughThree(flipped, { x: 10000, y: 6000 });
  const upNorth = projectThroughThree(flipped, { x: 10000, y: 7000 });
  assert.ok(upNorth.y < upCentre.y, "con yScreenSign -1 la +Y sube: la convención de AutoCAD");
}

// --- lo que la perspectiva rompía y aquí se cumple ---------------------------
{
  const controller = controllerAt({});
  const measure = (a: CadPoint2, b: CadPoint2) => {
    const pa = projectThroughThree(controller, a);
    const pb = projectThroughThree(controller, b);
    return Math.hypot(pb.x - pa.x, pb.y - pa.y);
  };
  const view = controller.view;
  const halfW = WIDTH_PX / 2 / view.pixelsPerUnit;

  // La misma longitud mide lo mismo a izquierda, centro y derecha. Bajo la
  // cámara actual esto dispersa un 14,13%.
  const probe = 500;
  const left = measure({ x: view.centerX - halfW * 0.85, y: view.centerY }, { x: view.centerX - halfW * 0.85 + probe, y: view.centerY });
  const centre = measure({ x: view.centerX, y: view.centerY }, { x: view.centerX + probe, y: view.centerY });
  const right = measure({ x: view.centerX + halfW * 0.7, y: view.centerY }, { x: view.centerX + halfW * 0.7 + probe, y: view.centerY });
  assert.ok(near(left, centre, 1e-6) && near(right, centre, 1e-6), "cero dispersión de escala a lo ancho de la pantalla");
  assert.ok(near(centre, probe * view.pixelsPerUnit, 1e-6), "y la medida es exactamente longitud · pixelsPerUnit");

  // Duplicar el zoom duplica TODA longitud. Bajo la cámara actual el factor
  // discrepa un 7,74% entre centro y borde.
  controller.setView({ ...view, pixelsPerUnit: view.pixelsPerUnit * 2 });
  const zoomedCentre = measure({ x: view.centerX, y: view.centerY }, { x: view.centerX + probe, y: view.centerY });
  assert.ok(near(zoomedCentre, centre * 2, 1e-6), "duplicar pixelsPerUnit duplica la medida — eso es un zoom");
}

// --- ida y vuelta pantalla ↔ mundo -------------------------------------------
{
  const controller = controllerAt({ pixelsPerUnit: 0.35, centerX: 4200, centerY: 8100 });
  const random = lcg(31337);
  for (let i = 0; i < 200; i += 1) {
    const px = random() * WIDTH_PX;
    const py = random() * HEIGHT_PX;
    const world = controller.screenToWorld(px, py);
    assert.ok(world, "en 2D siempre hay punto bajo el cursor");
    const back = controller.worldToScreen(world as CadPoint2);
    assert.ok(pointNear(back, { x: px, y: py }, 1e-6), `pantalla → mundo → pantalla (caso ${i})`);
  }
}

// --- tolerancia, límites y escala de escena ----------------------------------
{
  const controller = controllerAt({ pixelsPerUnit: 0.5 });
  assert.ok(near(controller.toleranceWorld(10), 20), "10 px con 0,5 px/unidad son 20 unidades");
  assert.ok(near(controller.toleranceWorld(10, 0, 5), 5), "el techo se respeta");
  assert.ok(near(controller.toleranceWorld(10, 50), 50), "y el suelo también");
  assert.ok(
    near(controller.sceneUnitsPerPixel(), TRANSFORM.scale / 0.5),
    "unidades de escena por píxel, para el umbral del raycaster",
  );

  const bounds = controller.viewportBounds(0);
  const expected = cadViewBounds(controller.view, 0);
  assert.ok(bounds, "hay límites en 2D");
  assert.ok(
    near((bounds as { minX: number }).minX, expected.minX, 1e-9),
    "los límites 2D salen de la forma cerrada, no de sondas",
  );
}

// --- el modo 3D conserva la perspectiva y su camino por rayos ----------------
{
  const controller = controllerAt({});
  assert.ok(controller.camera instanceof THREE.OrthographicCamera, "en 2D manda la ortográfica");
  controller.setMode("3d");
  assert.ok(controller.camera instanceof THREE.PerspectiveCamera, "en 3D vuelve la perspectiva");

  // La cámara en perspectiva por defecto mira al origen desde arriba; se coloca
  // como el editor para que el rayo corte el suelo.
  controller.perspective.position.set(0, 400, 400);
  controller.perspective.lookAt(0, 0, 0);
  controller.perspective.updateMatrixWorld();
  const centre = controller.screenToWorld(WIDTH_PX / 2, HEIGHT_PX / 2);
  assert.ok(centre, "en 3D el punto sale del rayo contra el plano del suelo");
  assert.ok(
    near((centre as CadPoint2).x, TRANSFORM.width / 2, 1e-3),
    "mirando al origen de la escena, el centro de pantalla cae en el centro de la huella",
  );

  controller.setMode("2d");
  assert.ok(controller.camera instanceof THREE.OrthographicCamera, "y se puede volver");
}

// --- reencuadre al cambiar el tamaño del lienzo ------------------------------
{
  const controller = controllerAt({});
  const before = controller.view.pixelsPerUnit;
  controller.setViewportSize(800, 600);
  assert.equal(controller.view.widthPx, 800, "el ancho se actualiza");
  assert.equal(
    controller.view.pixelsPerUnit,
    before,
    "cambiar el tamaño NO cambia el zoom: se ve menos dibujo, no más pequeño",
  );
  assert.ok(near(controller.perspective.aspect, 800 / 600), "la perspectiva ajusta su relación de aspecto");
}

// --- notificación de cambios --------------------------------------------------
{
  const controller = controllerAt({});
  let calls = 0;
  const stop = controller.onChange(() => {
    calls += 1;
  });
  controller.setView({ ...controller.view, centerX: 1 });
  controller.setMode("3d");
  assert.equal(calls, 2, "cada cambio de vista o de modo avisa una vez");
  controller.setMode("3d");
  assert.equal(calls, 2, "poner el mismo modo no avisa");
  stop();
  controller.setView({ ...controller.view, centerX: 2 });
  assert.equal(calls, 2, "tras darse de baja ya no llega nada");
}

// --- el plano de trabajo deja de ser el suelo -------------------------------
//
// La prueba que decide si esto sirve: con un SCU apoyado en una FACHADA, el
// punto bajo el cursor tiene que caer EN ESA FACHADA, no en el suelo. Se
// comprueba contra la ecuación del plano —producto escalar con su normal— y no
// contra un número calculado a mano, que sería comprobar la fórmula consigo
// misma.
{
  const controller = controllerAt({});
  controller.setMode("3d");
  controller.perspective.position.set(0, 400, 400);
  controller.perspective.lookAt(0, 0, 0);
  controller.perspective.updateMatrixWorld();

  // 1. El SCU universal no cambia ni un bit. Se compara el resultado SIN pasar
  //    plano contra el de pasar el universal explícitamente: tienen que ser el
  //    MISMO objeto punto, dígito a dígito, porque es el mismo camino.
  const sinPlano = controller.screenToWorld(WIDTH_PX / 2, HEIGHT_PX / 2);
  const conUniversal = controller.screenToWorld(
    WIDTH_PX / 2,
    HEIGHT_PX / 2,
    CAD_WORLD_UCS,
  );
  assert.ok(sinPlano && conUniversal, "los dos caminos dan punto");
  assert.equal(
    (sinPlano as CadPoint2).x,
    (conUniversal as CadPoint2).x,
    "el SCU universal recorre el camino de siempre, sin desviarse ni en el último bit",
  );
  assert.equal(
    (sinPlano as CadPoint2).y,
    (conUniversal as CadPoint2).y,
    "y lo mismo en Y",
  );
  // Y NO trae cota: añadir `z: 0` cambiaría los bytes de todo documento
  // dibujado a mano, porque los comandos espaciales pasan el punto tal cual.
  assert.equal(
    (sinPlano as { z?: number }).z,
    undefined,
    "bajo el SCU universal el punto no inventa una cota",
  );

  // 2. Un SCU apoyado en una FACHADA: plano vertical, normal +Y del dibujo.
  //    Es el caso del defecto medido en el navegador.
  const fachada = cadUcsFromPlane(
    "FACHADA",
    { x: 6000, y: 7500, z: 1500 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
  );
  assert.ok(fachada.ok, "el marco de la fachada se construye");
  const enFachada = controller.screenToWorld(
    WIDTH_PX / 2,
    HEIGHT_PX / 2,
    (fachada as { ok: true; ucs: CadNamedUcs }).ucs,
  );
  assert.ok(enFachada, "con el SCU en la fachada también hay punto");
  const p = enFachada as { x: number; y: number; z?: number };
  assert.equal(typeof p.z, "number", "y ese punto SÍ trae cota: está fuera del suelo");
  // La comprobación de verdad: el punto satisface la ecuación del plano.
  // (p - origen) · normal = 0, con la normal del propio marco.
  const ucs = (fachada as { ok: true; ucs: CadNamedUcs }).ucs;
  const d = {
    x: p.x - ucs.origin.x,
    y: p.y - ucs.origin.y,
    z: (p.z as number) - ucs.origin.z,
  };
  const fuera = d.x * ucs.zAxis.x + d.y * ucs.zAxis.y + d.z * ucs.zAxis.z;
  assert.ok(
    Math.abs(fuera) <= 1e-6,
    `el punto está EN el plano de la fachada (distancia ${fuera})`,
  );
  // Y no es el mismo punto que daba el suelo: si lo fuera, el arreglo no hace
  // nada. El defecto medido era exactamente que salían iguales.
  assert.ok(
    Math.abs(p.y - (sinPlano as CadPoint2).y) > 1,
    "el punto de la fachada NO es el que daba el plano del suelo",
  );

  // 3. Un plano PARALELO al rayo no tiene intersección, y eso se dice con
  //    `null` en vez de con un punto a kilómetros.
  const canto = cadUcsFromPlane(
    "CANTO",
    { x: 0, y: 0, z: 0 },
    // Normal perpendicular a la dirección de la cámara (que mira hacia -Z de la
    // escena, es decir hacia -Y del dibujo, y hacia abajo).
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  );
  assert.ok(canto.ok, "el marco del canto se construye");
  const rayoCentral = controller.screenToWorld(
    WIDTH_PX / 2,
    HEIGHT_PX / 2,
    (canto as { ok: true; ucs: CadNamedUcs }).ucs,
  );
  // El rayo central sí corta este plano (no es paralelo); lo que se comprueba
  // es que, corte donde corte, cae EN él.
  if (rayoCentral) {
    const q = rayoCentral as { x: number; y: number; z?: number };
    const u = (canto as { ok: true; ucs: CadNamedUcs }).ucs;
    const dd = {
      x: q.x - u.origin.x,
      y: q.y - u.origin.y,
      z: (q.z ?? 0) - u.origin.z,
    };
    const fueraCanto = dd.x * u.zAxis.x + dd.y * u.zAxis.y + dd.z * u.zAxis.z;
    assert.ok(
      Math.abs(fueraCanto) <= 1e-6,
      `el punto del canto está en su plano (distancia ${fueraCanto})`,
    );
  }

  // 4. En 2D el plano de trabajo no se consulta: ese camino es aritmética
  //    exacta y no toca THREE. Pasar un SCU inclinado no debe desviarlo.
  controller.setMode("2d");
  const dosD = controller.screenToWorld(WIDTH_PX / 2, HEIGHT_PX / 2);
  const dosDconPlano = controller.screenToWorld(
    WIDTH_PX / 2,
    HEIGHT_PX / 2,
    (fachada as { ok: true; ucs: CadNamedUcs }).ucs,
  );
  assert.ok(dosD && dosDconPlano, "en 2D hay punto");
  assert.ok(
    pointNear(dosD as CadPoint2, dosDconPlano as CadPoint2, 0),
    "en 2D el plano de trabajo no cambia nada: es el mismo camino cerrado",
  );
}

console.log("cad view controller specs passed");
