/**
 * Navegación 3D: las diez vistas, las dos órbitas y la invariante que las une.
 *
 * Lo que se ancla aquí con números:
 *
 *  1. **La distancia no cambia al orbitar.** Es la invariante que separa una
 *     órbita de un zoom, y la que más veces se rompe al mezclar los dos gestos.
 *     Se comprueba en la restringida, en la libre y sobre el controlador real.
 *  2. **Una isométrica es una isométrica.** El recorrido FRONTAL → SO/SE/NE/NO
 *     se hace orbitando y la cámara tiene que caer EXACTAMENTE donde dice la
 *     tabla de vistas predefinidas. Si no, o la tabla miente o la órbita deriva.
 *  3. **La vista SUPERIOR es 90° exactos**, y la órbita restringida no puede
 *     llegar ahí. Es el motivo por el que la tabla declara vectores en vez de
 *     ángulos, y se prueba enseñando el tope que la órbita sí aplica.
 *  4. **La órbita libre pasa por el cenit.** Cuatro pasos de 90° de elevación
 *     devuelven la cámara a su sitio, con `up` incluido. La restringida se
 *     habría quedado clavada en el tope.
 */
import * as THREE from "three";
import { check, checkClose, report } from "../../brep/spec-support";
import {
  CAD_ISOMETRIC_ELEVATION_DEG,
  CAD_STANDARD_VIEWS,
  cadStandardView,
  cadStandardViewPosition,
  cadVec3Length,
  constrainedOrbitTo,
  freeOrbitCameraPosition,
  freeOrbitFromCamera,
  freeOrbitStep,
  orbitCameraPosition,
  orbitDeltaToStandardView,
  orbitStateFromPosition,
  resolveCadStandardView,
  validateCadView3dRequest,
  type CadStandardViewId,
  type CadVec3,
} from "./view-3d";
import { CAD_ORBIT_ELEVATION_LIMIT, clampOrbitElevation } from "./visual-styles";
import { CadViewController } from "./view-controller";

const dot = (a: CadVec3, b: CadVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

// ---------------------------------------------------------------------------
// 1. La tabla de vistas predefinidas es una base ortonormal, las diez veces
// ---------------------------------------------------------------------------
{
  check("hay exactamente diez vistas predefinidas", CAD_STANDARD_VIEWS.length === 10);
  const ids = new Set(CAD_STANDARD_VIEWS.map((view) => view.id));
  check("sin ids repetidos", ids.size === 10);

  for (const view of CAD_STANDARD_VIEWS) {
    checkClose(`${view.label}: el desplazamiento es unitario`, cadVec3Length(view.offset), 1, 1e-12);
    checkClose(`${view.label}: el up es unitario`, cadVec3Length(view.up), 1, 1e-12);
    // Sin ortogonalidad no hay matriz de vista: es la condición que degenera en
    // el polo y la razón por la que estos vectores se declaran a mano.
    checkClose(`${view.label}: up ⟂ desplazamiento`, dot(view.offset, view.up), 0, 1e-12);
  }

  check("Superior se resuelve por nombre", resolveCadStandardView("Superior")?.id === "top");
  check("y sin acentos", resolveCadStandardView("isometrica so")?.id === "sw-iso");
  check("y por id", resolveCadStandardView("ne-iso")?.id === "ne-iso");
  // Igual que `resolveCadVisualStyle`: lo desconocido es `null`, no la planta.
  check("lo desconocido devuelve null", resolveCadStandardView("cenital-raro") === null);
}

// ---------------------------------------------------------------------------
// 2. El polo EXACTO, que la órbita restringida tiene prohibido
// ---------------------------------------------------------------------------
{
  checkClose("Superior declara 90° exactos", cadStandardView("top").elevationDeg, 90, 0);
  checkClose("Inferior declara −90° exactos", cadStandardView("bottom").elevationDeg, -90, 0);
  // ANCLA de por qué esa tabla no pasa por la órbita: el tope la habría movido.
  checkClose("y la órbita restringida se queda en 89,9", clampOrbitElevation(90), CAD_ORBIT_ELEVATION_LIMIT, 0);
  check("es decir, 0,1° por debajo del polo", Math.abs(90 - CAD_ORBIT_ELEVATION_LIMIT - 0.1) < 1e-12);
  // El `up` de SUPERIOR es el mismo que el de la cámara ortográfica del 2D
  // (`view-controller.applyOrthographic`): pasar de planta a SUPERIOR no puede
  // voltear el dibujo.
  const top = cadStandardView("top");
  check("Superior mira con la +Y del dibujo hacia abajo", top.up.z === -1 && top.up.x === 0 && top.up.y === 0);
}

// ---------------------------------------------------------------------------
// 3. El ángulo isométrico VERDADERO, y las cuatro esquinas
// ---------------------------------------------------------------------------
{
  checkClose("la elevación isométrica es atan(1/√2)", CAD_ISOMETRIC_ELEVATION_DEG, 35.264389682754654, 1e-12);
  const azimuths: Record<string, number> = {
    "sw-iso": 225,
    "se-iso": 135,
    "ne-iso": 45,
    "nw-iso": 315,
  };
  for (const [id, azimuth] of Object.entries(azimuths)) {
    const view = cadStandardView(id as CadStandardViewId);
    const recovered = orbitStateFromPosition({ x: 0, y: 0, z: 0 }, view.offset);
    checkClose(`${view.label}: azimut ${azimuth}`, recovered.azimuthDeg, azimuth, 1e-9);
    checkClose(`${view.label}: elevación isométrica`, recovered.elevationDeg, CAD_ISOMETRIC_ELEVATION_DEG, 1e-9);
  }
}

// ---------------------------------------------------------------------------
// 4. Orbitar de FRONTAL a cada isométrica cae EXACTAMENTE en la tabla
// ---------------------------------------------------------------------------
{
  const target = { x: 12, y: -4, z: 30 };
  const distance = 250;
  const front = cadStandardView("front");
  const start = orbitStateFromPosition(target, cadStandardViewPosition(target, front, distance));
  checkClose("FRONTAL tiene azimut 180", start.azimuthDeg, 180, 1e-9);
  checkClose("y elevación 0", start.elevationDeg, 0, 1e-9);
  checkClose("y la distancia pedida", start.distance, distance, 1e-9);

  for (const id of ["sw-iso", "se-iso", "ne-iso", "nw-iso"] as const) {
    const view = cadStandardView(id);
    const delta = orbitDeltaToStandardView(start, view);
    const orbited = constrainedOrbitTo(start, delta.azimuthDeg, delta.elevationDeg);
    checkClose(`${view.label}: azimut tras orbitar`, orbited.azimuthDeg, view.azimuthDeg, 1e-9);
    checkClose(`${view.label}: elevación tras orbitar`, orbited.elevationDeg, view.elevationDeg, 1e-9);
    // LA invariante: orbitar es girar, no acercarse.
    checkClose(`${view.label}: la distancia se conserva`, orbited.distance, distance, 1e-12);

    const position = orbitCameraPosition(target, orbited);
    const expected = cadStandardViewPosition(target, view, distance);
    checkClose(`${view.label}: la cámara cae en la X de la tabla`, position.x, expected.x, 1e-9);
    checkClose(`${view.label}: y en su Y`, position.y, expected.y, 1e-9);
    checkClose(`${view.label}: y en su Z`, position.z, expected.z, 1e-9);
  }

  // El camino CORTO en azimut: de 350° a 45° son +55°, no −305°.
  const near = { azimuthDeg: 350, elevationDeg: 0, distance };
  checkClose(
    "el incremento hacia NE va por el camino corto",
    orbitDeltaToStandardView(near, cadStandardView("ne-iso")).azimuthDeg,
    55,
    1e-9,
  );
  // Y una vista polar NO se alcanza orbitando: el incremento se queda en el tope.
  checkClose(
    "hacia SUPERIOR el incremento se detiene en el tope de la órbita",
    orbitDeltaToStandardView({ azimuthDeg: 0, elevationDeg: 0, distance }, cadStandardView("top"))
      .elevationDeg,
    CAD_ORBIT_ELEVATION_LIMIT,
    1e-12,
  );
}

// ---------------------------------------------------------------------------
// 5. Órbita libre: sin polo, con la distancia intacta
// ---------------------------------------------------------------------------
{
  const target = { x: 0, y: 0, z: 0 };
  const start = freeOrbitFromCamera(target, { x: 0, y: 0, z: 400 }, { x: 0, y: 1, z: 0 });
  check("el estado libre se construye desde una cámara", start !== null);
  if (start) {
    checkClose("arranca a 400 de distancia", cadVec3Length(start.offset), 400, 1e-9);

    // Cuatro cuartos de vuelta en elevación: la cámara vuelve al punto de
    // partida CON su `up`. La restringida se habría quedado clavada en 89,9°
    // en el primer paso, que es exactamente la diferencia entre las dos.
    let state = start;
    for (let step = 0; step < 4; step += 1) state = freeOrbitStep(state, 0, 90);
    const back = freeOrbitCameraPosition(target, state);
    checkClose("cuatro pasos de 90° devuelven la X", back.x, 0, 1e-9);
    checkClose("la Y", back.y, 0, 1e-9);
    checkClose("y la Z", back.z, 400, 1e-9);
    checkClose("el up vuelve a ser el de partida", state.up.y, 1, 1e-9);

    // El cenit EXACTO, que la restringida no puede pisar.
    const zenith = freeOrbitStep(start, 0, 90);
    checkClose("un paso de 90° pone la cámara sobre el cenit", zenith.offset.y, 400, 1e-9);
    checkClose("sin componente Z", zenith.offset.z, 0, 1e-9);
    check(
      "y la base sigue siendo finita en el polo",
      Number.isFinite(zenith.up.x) && Number.isFinite(zenith.up.y) && Number.isFinite(zenith.up.z),
    );
    checkClose("con up ortogonal a la mirada", dot(zenith.offset, zenith.up), 0, 1e-6);

    // Mil pasos: ni la distancia deriva ni el `up` se despega.
    let drifting = start;
    for (let step = 0; step < 1_000; step += 1) drifting = freeOrbitStep(drifting, 7, 5, 3);
    checkClose("tras mil pasos la distancia sigue siendo 400", cadVec3Length(drifting.offset), 400, 1e-6);
    checkClose("y el up sigue unitario", cadVec3Length(drifting.up), 1, 1e-9);
    checkClose("y sigue ortogonal", dot(drifting.offset, drifting.up), 0, 1e-6);
  }
}

// ---------------------------------------------------------------------------
// 6. Las peticiones se validan, y lo ambiguo se RECHAZA con un motivo
// ---------------------------------------------------------------------------
{
  const ok = validateCadView3dRequest({
    kind: "orbit",
    mode: "constrained",
    azimuthDeg: 30,
    elevationDeg: 10,
  });
  check("una órbita con ángulos válidos pasa", ok.request !== null);
  check(
    "una órbita sin giro se rechaza en vez de mover nada",
    validateCadView3dRequest({ kind: "orbit", mode: "free", azimuthDeg: 0, elevationDeg: 0 })
      .request === null,
  );
  check(
    "un ángulo no finito se rechaza",
    validateCadView3dRequest({
      kind: "orbit",
      mode: "constrained",
      azimuthDeg: Number.NaN,
      elevationDeg: 0,
    }).request === null,
  );
  check(
    "3DZOOM con factor cero se rechaza",
    validateCadView3dRequest({ kind: "zoom", factor: 0 }).request === null,
  );
  check(
    "3DZOOM desbocado se rechaza",
    validateCadView3dRequest({ kind: "zoom", factor: 1e9 }).request === null,
  );
  check(
    "3DPAN sin desplazamiento se rechaza",
    validateCadView3dRequest({ kind: "pan", dxPx: 0, dyPx: 0 }).request === null,
  );
  check(
    "una vista predefinida se acepta y se anuncia con su nombre",
    validateCadView3dRequest({ kind: "standard-view", view: "sw-iso" }).message.includes("SO"),
  );
}

// ---------------------------------------------------------------------------
// 7. Sobre el CONTROLADOR real: de FRONTAL a la isométrica SE, con la cámara
// ---------------------------------------------------------------------------
{
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.perspective.position.set(0, 0, 300);

  const front = controller.applyStandardView("front");
  check("la vista aplicada es la FRONTAL", front.id === "front");
  const target = controller.orbitTarget;
  checkClose("la cámara se coloca en −Z", controller.perspective.position.z, -300, 1e-9);
  checkClose("sin componente X", controller.perspective.position.x, 0, 1e-9);
  checkClose("ni altura", controller.perspective.position.y, 0, 1e-9);
  checkClose("y a la misma distancia de antes", controller.perspective.position.distanceTo(target), 300, 1e-9);

  const before = controller.orbitState;
  const seIso = cadStandardView("se-iso");
  const delta = orbitDeltaToStandardView(before, seIso);
  checkClose("el incremento de azimut hasta SE es −45°", delta.azimuthDeg, -45, 1e-9);
  checkClose("y el de elevación, el ángulo isométrico", delta.elevationDeg, CAD_ISOMETRIC_ELEVATION_DEG, 1e-9);

  const after = controller.orbitPerspective(delta.azimuthDeg, delta.elevationDeg);
  checkClose("azimut resultante", after.azimuthDeg, 135, 1e-9);
  checkClose("elevación resultante", after.elevationDeg, CAD_ISOMETRIC_ELEVATION_DEG, 1e-9);
  checkClose("distancia conservada", after.distance, 300, 1e-12);

  const expected = cadStandardViewPosition(
    { x: target.x, y: target.y, z: target.z },
    seIso,
    300,
  );
  checkClose("la cámara cae en la X de la isométrica SE", controller.perspective.position.x, expected.x, 1e-6);
  checkClose("en su Y", controller.perspective.position.y, expected.y, 1e-6);
  checkClose("y en su Z", controller.perspective.position.z, expected.z, 1e-6);
  checkClose(
    "y la distancia al objetivo sigue siendo 300",
    controller.perspective.position.distanceTo(target),
    300,
    1e-6,
  );

  // 3DZOOM es un travelín: cambia la distancia y NO el campo de visión.
  const fovBefore = controller.perspective.fov;
  controller.zoomPerspective(2);
  checkClose("3DZOOM 2× deja la cámara a la mitad de distancia", controller.perspective.position.distanceTo(controller.orbitTarget), 150, 1e-6);
  checkClose("y no toca el campo de visión", controller.perspective.fov, fovBefore, 0);

  // 3DPAN mueve cámara Y objetivo el mismo vector: la distancia no cambia.
  const distanceBefore = controller.perspective.position.distanceTo(controller.orbitTarget);
  const targetBefore = controller.orbitTarget;
  controller.panPerspective(100, -40);
  checkClose(
    "3DPAN conserva la distancia al objetivo",
    controller.perspective.position.distanceTo(controller.orbitTarget),
    distanceBefore,
    1e-6,
  );
  check(
    "y el objetivo se ha movido de verdad",
    controller.orbitTarget.distanceTo(targetBefore) > 1e-6,
  );

  // La órbita LIBRE sobre el controlador: pasa el cenit sin producir NaN. La
  // distancia se mide contra el objetivo VIVO, que el 3DPAN de arriba movió: es
  // justo lo que 3DPAN tiene que hacer y compararlo con 200 mediría otra cosa.
  controller.perspective.position.set(0, 0, 200);
  controller.perspective.up.set(0, 1, 0);
  const freeDistance = controller.perspective.position.distanceTo(controller.orbitTarget);
  for (let step = 0; step < 60; step += 1) controller.orbitFreePerspective(0, 6);
  const elements = controller.perspective.matrixWorld.elements;
  check("tras 360° de órbita libre la matriz sigue sin NaN", elements.every(Number.isFinite));
  checkClose(
    "y la distancia sigue intacta",
    controller.perspective.position.distanceTo(controller.orbitTarget),
    freeDistance,
    1e-6,
  );
  // Y el contraste: la restringida se habría quedado pegada al tope.
  const restringida = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  restringida.perspective.position.set(0, 0, 200);
  for (let step = 0; step < 60; step += 1) restringida.orbitPerspective(0, 6);
  checkClose(
    "la órbita restringida se detiene en el tope y no da la vuelta",
    orbitStateFromPosition(restringida.orbitTarget, restringida.perspective.position).elevationDeg,
    CAD_ORBIT_ELEVATION_LIMIT,
    1e-6,
  );
}

// ---------------------------------------------------------------------------
// 8. El proyector: un punto de dibujo cae donde la cámara lo pinta
// ---------------------------------------------------------------------------
{
  const controller = new CadViewController({ scale: 0.01, width: 1_000, height: 800 }, 1_200, 900);
  controller.setMode("3d");
  controller.perspective.position.set(0, 0, 300);
  controller.applyStandardView("front");
  const project = controller.createDrawingProjector();

  // El centro del dibujo con cota cero es el origen de la escena, y el objetivo
  // de la cámara: tiene que caer en el centro del lienzo.
  const centre = project({ x: 500, y: 400, z: 0 });
  check("el centro del dibujo se proyecta", centre !== null);
  if (centre) {
    checkClose("en el centro del lienzo, en X", centre.x, 600, 1e-6);
    checkClose("y en Y", centre.y, 450, 1e-6);
    checkClose("con la distancia de cámara como divisor homogéneo", centre.w, 300, 1e-6);
  }

  // Un punto DETRÁS de la cámara no se proyecta: se descarta. Sin esto saldría
  // al otro lado de la pantalla con el signo cambiado y produciría enganches
  // fantasma en la esquina opuesta.
  const behind = project({ x: 500, y: 400 - 300 / 0.01 - 100, z: 0 });
  check("lo que queda detrás de la cámara no se proyecta", behind === null);

  // Coherencia con el camino que ya existía: `worldToScreen` sobre cota 0.
  const sample = { x: 620, y: 350 };
  const projected = project({ ...sample, z: 0 });
  const legacy = controller.worldToScreen(sample);
  check("el proyector coincide con worldToScreen sobre cota cero", projected !== null);
  if (projected) {
    checkClose("en X", projected.x, legacy.x, 1e-6);
    checkClose("en Y", projected.y, legacy.y, 1e-6);
  }

  // Y la altura se ve: dos puntos con la misma planta y distinta cota NO caen
  // en el mismo píxel. Es el defecto que el enganche 3D viene a arreglar.
  const low = project({ x: 500, y: 300, z: 0 });
  const high = project({ x: 500, y: 300, z: 50 });
  check("dos cotas distintas se proyectan en píxeles distintos", low !== null && high !== null);
  if (low && high) check("y la diferencia es real", Math.abs(low.y - high.y) > 1);
}

// La cámara de THREE es la de verdad, no un doble: si el mapeo de escena
// cambiara, estas cuentas cambiarían con él.
check("el spec usó la cámara real de THREE", THREE.PerspectiveCamera !== undefined);

report("view-3d: vistas predefinidas, órbita restringida y órbita libre", 90);
