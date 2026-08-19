/**
 * Enganche 3D a aristas y vértices de sólidos: exactitud y coste.
 *
 * ## Qué se ancla
 *
 *  1. **El punto devuelto es EXACTO.** Engancharse a un vértice devuelve el
 *     vértice tal cual está en el sólido, con su cota, error 0,000 mm. No es un
 *     detalle de precisión: un OSNAP que devuelve «casi» el vértice no sirve
 *     para acotar, que es para lo que existe.
 *  2. **Y el camino de hoy NO lo es.** El mismo píxel, resuelto como se resuelve
 *     hoy —rayo contra el plano del suelo— cae a decenas de milímetros del
 *     vértice, y el número se publica al lado. Ésa es la avería, medida.
 *  3. **El punto medio de una arista sale bien bajo perspectiva.** Interpolar
 *     linealmente en pantalla, que es el atajo obvio, lo pone en otro sitio; el
 *     spec compara las dos cuentas y publica la diferencia.
 *  4. **El coste cabe en un cuadro de 60 Hz.** Se mide por separado lo que
 *     cuesta proyectar (una vez por CÁMARA) y lo que cuesta consultar (una vez
 *     por MOVIMIENTO DEL RATÓN), sobre una escena de sólidos de tamaño
 *     realista, con 400 consultas y tres repeticiones.
 *
 * ## Condiciones de la medida
 *
 * Los presupuestos de este spec están puestos donde una REGRESIÓN duela sin que
 * la carga vecina dispare falsos positivos, siguiendo el mismo criterio que
 * `benchmark/plan-budget.ts`: el portátil de desarrollo (Ryzen 5 5500U, 6
 * núcleos, 7,4 GB) puede tener otras tres sesiones encima. Las cifras que este
 * spec IMPRIME son las de la corrida, no las del presupuesto; para una
 * comparación limpia hay que aislar la máquina y quedarse con la mediana.
 */
import { performance } from "node:perf_hooks";
import { check, checkClose, report } from "../../brep/spec-support";
import type { CadSolid3dEntity } from "../cad-entities-v5";
import { solid3dBody } from "../solid3d-build";
import { CadViewController } from "./view-controller";
import {
  CAD_SOLID_SNAP_MAX_EDGES,
  buildCadSolidSnapIndex,
  edgeParameterToScreenParameter,
  screenParameterToEdgeParameter,
  type CadSolidSnapSource,
} from "./solid-snap";

/** Unidades de dibujo = milímetros, como en el resto del CAD. */
const FOOTPRINT = { scale: 0.01, width: 1_000, height: 800 };
const VIEWPORT = { widthPx: 1_200, heightPx: 900 };
/** Apertura de captura: la de fábrica del editor. */
const APERTURE_PX = 12;
/** Cuadro de 60 Hz. El presupuesto contra el que se compara todo lo de abajo. */
const FRAME_60HZ_MS = 1000 / 60;

/** Prisma 200 × 100 × 50, con una esquina en (400, 350). */
const block: CadSolid3dEntity = {
  id: "bloque",
  type: "solid3d",
  root: "caja",
  nodes: [
    {
      id: "caja",
      op: "box",
      min: { x: 400, y: 350, z: 0 },
      max: { x: 600, y: 450, z: 50 },
    },
  ],
  layer: "0",
};

/** Polígono regular de `sides` lados, centrado y con radio dado. */
function polygon(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
): { x: number; y: number }[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

/**
 * Escena de tamaño realista: veinte columnas redondas teseladas a 32 lados.
 *
 * Veinte y no una: el coste del enganche depende del NÚMERO DE ARISTAS QUE HAY,
 * no de cómo estén repartidas, y una escena con veinte piezas es lo que hay en
 * la planta de un edificio de verdad. Suman 1.920 aristas y 1.280 vértices, que
 * es el orden en el que un sólido «cuesta caro» de verdad.
 */
function columnScene(): CadSolid3dEntity[] {
  const solids: CadSolid3dEntity[] = [];
  for (let index = 0; index < 20; index += 1) {
    const cx = 120 + (index % 5) * 190;
    const cy = 120 + Math.floor(index / 5) * 180;
    solids.push({
      id: `columna-${index}`,
      type: "solid3d",
      root: "fuste",
      nodes: [
        {
          id: "fuste",
          op: "extrude",
          profile: { outer: polygon(cx, cy, 45, 32) },
          height: 300,
        },
      ],
      layer: "0",
    });
  }
  return solids;
}

function sources(entities: readonly CadSolid3dEntity[]): CadSolidSnapSource[] {
  return entities.map((entity) => ({ entityId: entity.id, body: solid3dBody(entity) }));
}

function percentile(samples: readonly number[], ratio: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[at];
}

function controllerLookingAt(distanceScene: number): CadViewController {
  const controller = new CadViewController(FOOTPRINT, VIEWPORT.widthPx, VIEWPORT.heightPx);
  controller.setMode("3d");
  controller.perspective.position.set(0, 0, distanceScene);
  controller.applyStandardView("se-iso");
  return controller;
}

// ---------------------------------------------------------------------------
// 1. La interpolación con corrección de perspectiva, que es la trampa del módulo
// ---------------------------------------------------------------------------
{
  // Ida y vuelta: el parámetro de pantalla y el de la arista se convierten el
  // uno en el otro sin perder nada.
  for (const [wa, wb] of [
    [1, 1],
    [10, 40],
    [250, 3],
  ] as const) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const u = edgeParameterToScreenParameter(t, wa, wb);
      checkClose(
        `w=${wa}/${wb}, t=${t}: ida y vuelta`,
        screenParameterToEdgeParameter(u, wa, wb),
        t,
        1e-12,
      );
    }
  }
  // Bajo proyección paralela (w constante) los dos parámetros coinciden…
  checkClose("sin escorzo, pantalla y arista van a la par", edgeParameterToScreenParameter(0.5, 1, 1), 0.5, 1e-12);
  // …y bajo escorzo NO, que es justo lo que hay que corregir. Con un extremo a
  // 10 y el otro a 40, la mitad de la arista cae al 20 % de su proyección.
  const skewed = edgeParameterToScreenParameter(0.5, 10, 40);
  checkClose("con escorzo 4:1 la mitad cae al 80 % de la proyección", skewed, 0.8, 1e-12);
  check("y por tanto NO es 0,5", Math.abs(skewed - 0.5) > 0.29);
}

// ---------------------------------------------------------------------------
// 2. Engancharse a un VÉRTICE: el error, en milímetros
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAt(12);
  const build = buildCadSolidSnapIndex(sources([block]));
  check("el índice se construye", build.ok);
  if (!build.ok) throw new Error(build.reason);
  const index = build.index;
  check("indexa los ocho vértices más los seis centroides de cara", index.pointCount === 14);
  check("y las doce aristas", index.edgeCount === 12);

  const project = controller.createDrawingProjector();
  index.project(project, VIEWPORT);
  check("las doce aristas quedan delante de la cámara", index.projectedEdgeCount === 12);

  // El vértice SUPERIOR de una esquina: el caso que hoy es inalcanzable, porque
  // su sombra en el suelo está en otro sitio de la pantalla.
  const vertex = { x: 600, y: 350, z: 50 };
  const screen = project(vertex);
  check("el vértice se proyecta", screen !== null);
  if (!screen) throw new Error("el vértice no se proyecta");

  // El cursor NO cae encima del vértice: cae a cuatro píxeles, como un pulso
  // humano. El enganche tiene que devolver el vértice igualmente.
  const cursor = { x: screen.x + 3, y: screen.y - 2 };
  const hit = index.query(cursor.x, cursor.y, { aperturePx: APERTURE_PX });
  check("hay enganche", hit !== null);
  if (!hit) throw new Error("sin enganche");
  check("y es de tipo vértice", hit.type === "endpoint");
  check("sobre el sólido correcto", hit.entityId === "bloque");

  const errorMm = Math.hypot(hit.point.x - vertex.x, hit.point.y - vertex.y, hit.point.z - vertex.z);
  checkClose("el error del enganche al vértice es CERO milímetros", errorMm, 0, 0);
  checkClose("y la cota es la de verdad, no cero", hit.point.z, 50, 0);

  // El contraste: lo que devuelve HOY el mismo píxel. El puntero se convierte a
  // dibujo lanzando un rayo contra el plano del suelo, así que un vértice a 50
  // de altura se resuelve como el punto del suelo que hay detrás de él.
  const floor = controller.screenToWorld(cursor.x, cursor.y);
  check("el camino de hoy devuelve un punto del suelo", floor !== null);
  const legacyErrorMm = floor
    ? Math.hypot(floor.x - vertex.x, floor.y - vertex.y, 0 - vertex.z)
    : Number.POSITIVE_INFINITY;
  check(
    `el camino plano se equivoca en ${legacyErrorMm.toFixed(3)} mm sobre este vértice`,
    legacyErrorMm > 50,
  );

  // Dos vértices con la MISMA planta y distinta cota son dos enganches
  // distintos, que es lo que un motor 2D no puede expresar.
  const low = { x: 600, y: 350, z: 0 };
  const lowScreen = project(low);
  check("el vértice inferior se proyecta en otro píxel", lowScreen !== null);
  if (lowScreen) {
    check("y bien lejos del superior", Math.abs(lowScreen.y - screen.y) > 10);
    const lowHit = index.query(lowScreen.x, lowScreen.y, { aperturePx: APERTURE_PX });
    check("engancha al inferior", lowHit !== null);
    if (lowHit) {
      checkClose("con cota cero", lowHit.point.z, 0, 0);
      checkClose(
        "y error cero milímetros",
        Math.hypot(lowHit.point.x - low.x, lowHit.point.y - low.y, lowHit.point.z - low.z),
        0,
        0,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Engancharse al PUNTO MEDIO de una arista
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAt(12);
  const build = buildCadSolidSnapIndex(sources([block]));
  if (!build.ok) throw new Error(build.reason);
  const index = build.index;
  const project = controller.createDrawingProjector();
  index.project(project, VIEWPORT);

  // Arista superior larga: de (400,350,50) a (600,350,50). Su punto medio es
  // (500,350,50), y ése es el número contra el que se mide.
  const from = { x: 400, y: 350, z: 50 };
  const to = { x: 600, y: 350, z: 50 };
  const exact = { x: 500, y: 350, z: 50 };
  const a = project(from);
  const b = project(to);
  check("los dos extremos se proyectan", a !== null && b !== null);
  if (!a || !b) throw new Error("extremos sin proyectar");

  const u = edgeParameterToScreenParameter(0.5, a.w, b.w);
  const midScreen = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  const hit = index.query(midScreen.x + 2, midScreen.y + 2, {
    aperturePx: APERTURE_PX,
    modes: { endpoint: false, "geometric-center": false },
  });
  check("hay enganche al punto medio", hit !== null);
  if (!hit) throw new Error("sin punto medio");
  check("y es de tipo punto medio", hit.type === "midpoint");
  const errorMm = Math.hypot(hit.point.x - exact.x, hit.point.y - exact.y, hit.point.z - exact.z);
  checkClose("el error del enganche al punto medio es CERO milímetros", errorMm, 0, 0);

  // Y la diferencia que introduce el atajo: colocar el cursor en la mitad
  // LINEAL de la proyección y ver a qué punto del espacio corresponde.
  const naiveScreen = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const naiveT = screenParameterToEdgeParameter(0.5, a.w, b.w);
  const naivePoint = {
    x: from.x + (to.x - from.x) * naiveT,
    y: from.y + (to.y - from.y) * naiveT,
    z: from.z + (to.z - from.z) * naiveT,
  };
  const skewMm = Math.hypot(
    naivePoint.x - exact.x,
    naivePoint.y - exact.y,
    naivePoint.z - exact.z,
  );
  check(
    `la mitad de la proyección NO es la proyección de la mitad: ${skewMm.toFixed(3)} mm de desvío`,
    skewMm > 0,
  );
  check(
    "y los dos píxeles tampoco son el mismo",
    Math.hypot(naiveScreen.x - midScreen.x, naiveScreen.y - midScreen.y) > 0,
  );
}

// ---------------------------------------------------------------------------
// 4. El resto de modos, y la prioridad que los ordena
// ---------------------------------------------------------------------------
{
  const controller = controllerLookingAt(12);
  const build = buildCadSolidSnapIndex(sources([block]));
  if (!build.ok) throw new Error(build.reason);
  const index = build.index;
  const project = controller.createDrawingProjector();
  index.project(project, VIEWPORT);

  const from = { x: 400, y: 350, z: 50 };
  const to = { x: 600, y: 350, z: 50 };
  const a = project(from);
  const b = project(to);
  if (!a || !b) throw new Error("extremos sin proyectar");

  // Un punto a un cuarto de la arista: con `endpoint` y `midpoint` apagados,
  // gana `nearest`, y el punto tiene que caer SOBRE la arista.
  const u = edgeParameterToScreenParameter(0.25, a.w, b.w);
  const quarter = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  const nearest = index.query(quarter.x, quarter.y, {
    aperturePx: APERTURE_PX,
    modes: { endpoint: false, midpoint: false, "geometric-center": false, perpendicular: false },
  });
  check("con los demás apagados gana el punto más cercano", nearest?.type === "nearest");
  if (nearest) {
    checkClose("que está a la altura de la arista", nearest.point.z, 50, 1e-9);
    checkClose("y sobre su recta", nearest.point.y, 350, 1e-9);
    checkClose("al cuarto de su longitud", nearest.point.x, 450, 1e-6);
  }

  // La PRIORIDAD manda: en el mismo píxel del extremo hay `endpoint`, `nearest`
  // y `perpendicular` a la vez, y gana `endpoint`. Es la tabla de `SNAP_PRIORITY`
  // sin una segunda copia.
  const atEnd = index.query(a.x, a.y, {
    aperturePx: APERTURE_PX,
    from: { x: 0, y: 0, z: 0 },
  });
  check("en un extremo gana el vértice sobre todo lo demás", atEnd?.type === "endpoint");

  // El centroide de una cara es `geometric-center`, y se puede pedir solo.
  const centre = project({ x: 500, y: 400, z: 50 });
  if (centre) {
    const hit = index.query(centre.x, centre.y, {
      aperturePx: APERTURE_PX,
      modes: { endpoint: false, midpoint: false, nearest: false, "apparent-intersection": false },
    });
    check("el centro de la tapa es un geometric-center", hit?.type === "geometric-center");
    if (hit) checkClose("a la altura de la tapa", hit.point.z, 50, 1e-9);
  }

  // Un cursor lejos de todo no engancha, en vez de devolver lo más cercano.
  check("lejos del sólido no hay enganche", index.query(5, 5, { aperturePx: APERTURE_PX }) === null);
  // Y sin proyectar tampoco: proyectar dentro de un pointermove es el coste que
  // este reparto existe para no pagar, y esconderlo lo haría invisible.
  const fresh = buildCadSolidSnapIndex(sources([block]));
  if (fresh.ok) {
    check("un índice sin proyectar no responde", fresh.index.ready === false);
    check("y devuelve null en vez de proyectar a escondidas", fresh.index.query(600, 450, { aperturePx: APERTURE_PX }) === null);
  }
}

// ---------------------------------------------------------------------------
// 5. Fallo cerrado: por encima del tope se NIEGA, no indexa a medias
// ---------------------------------------------------------------------------
{
  const huge: CadSolidSnapSource[] = [
    {
      entityId: "imposible",
      body: {
        vertices: [],
        halfEdges: [],
        edges: new Array(CAD_SOLID_SNAP_MAX_EDGES + 1).fill({ a: 0, b: 0 }),
        loops: [],
        faces: [],
        shells: [],
      },
    },
  ];
  const refused = buildCadSolidSnapIndex(huge);
  check("un sólido por encima del tope se rechaza", refused.ok === false);
  if (!refused.ok) check("y dice cuántas aristas eran", refused.reason.includes(String(CAD_SOLID_SNAP_MAX_EDGES)));
}

// ---------------------------------------------------------------------------
// 6. El COSTE, sobre una escena de sólidos de tamaño realista
// ---------------------------------------------------------------------------
const scene = columnScene();
const sceneSources = sources(scene);
const totalEdges = sceneSources.reduce((sum, source) => sum + source.body.edges.length, 0);
const totalVertices = sceneSources.reduce((sum, source) => sum + source.body.vertices.length, 0);
check(`la escena suma ${totalEdges} aristas`, totalEdges >= 1_900);
check(`y ${totalVertices} vértices`, totalVertices >= 1_200);

const QUERIES = 400;
const REPEATS = 3;
const buildMs: number[] = [];
const projectMs: number[] = [];
const gridMs: number[] = [];
const queryP95: number[] = [];
const queryP50: number[] = [];
let resolved = 0;
let lastQueries = 0;

for (let repeat = 0; repeat < REPEATS; repeat += 1) {
  const controller = controllerLookingAt(14);
  const startedBuild = performance.now();
  const build = buildCadSolidSnapIndex(sceneSources);
  buildMs.push(performance.now() - startedBuild);
  if (!build.ok) throw new Error(build.reason);
  const index = build.index;

  const project = controller.createDrawingProjector();
  const startedProject = performance.now();
  index.project(project, VIEWPORT);
  projectMs.push(performance.now() - startedProject);

  // La rejilla es PEREZOSA: se construye en la primera consulta después de
  // mover la cámara, no al proyectar. Se mide aparte porque es un coste que se
  // paga una vez por parada del ratón, no una vez por cuadro de órbita.
  const startedGrid = performance.now();
  index.query(VIEWPORT.widthPx / 2, VIEWPORT.heightPx / 2, { aperturePx: APERTURE_PX });
  gridMs.push(performance.now() - startedGrid);

  // Los cursores se colocan SOBRE geometría de verdad: barrer píxeles al azar
  // mediría el camino sin candidatos, que es el barato. Se toman vértices del
  // corpus, se proyectan y se le suma un pulso de dos píxeles.
  const cursors: { x: number; y: number }[] = [];
  for (let query = 0; query < QUERIES; query += 1) {
    const source = sceneSources[query % sceneSources.length];
    const vertex = source.body.vertices[(query * 37) % source.body.vertices.length].point;
    const screen = project(vertex);
    if (screen) cursors.push({ x: screen.x + 2, y: screen.y - 1 });
  }
  lastQueries = cursors.length;

  // Pasada de calentamiento descartada, por el mismo motivo que en
  // `plan-budget.spec.ts`: con 400 consultas el p95 cae sobre la vigésima peor,
  // y en frío esas veinte peores SON las primeras — se estaría midiendo el JIT.
  for (const cursor of cursors) index.query(cursor.x, cursor.y, { aperturePx: APERTURE_PX });

  const samples: number[] = [];
  resolved = 0;
  for (const cursor of cursors) {
    const started = performance.now();
    const hit = index.query(cursor.x, cursor.y, {
      aperturePx: APERTURE_PX,
      from: { x: 0, y: 0, z: 0 },
    });
    samples.push(performance.now() - started);
    if (hit) resolved += 1;
  }
  queryP50.push(percentile(samples, 0.5));
  queryP95.push(percentile(samples, 0.95));
}

const median = (values: readonly number[]): number =>
  [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];

const buildMedianMs = median(buildMs);
const projectMedianMs = median(projectMs);
const gridMedianMs = median(gridMs);
const queryP95MedianMs = median(queryP95);
const queryP50MedianMs = median(queryP50);

// Que la medida sea de VERDAD: sin esto, un presupuesto se cumple vacío.
check(`las ${lastQueries} consultas resolvieron ${resolved} enganches`, resolved > lastQueries * 0.9);
check("y se midieron las 400 pedidas", lastQueries === QUERIES);

/**
 * Los presupuestos.
 *
 * · **Consultar** ocurre en cada `pointermove`, así que su techo es el cuadro de
 *   60 Hz — y muy por debajo, porque el enganche no es lo único que corre en ese
 *   cuadro. Se fija en 2 ms, que deja dentro la holgura que el OSNAP 2D todavía
 *   no gasta de su propio presupuesto (`plan-budget.ts` lo tiene en 8 ms con
 *   2,65 ms observados).
 * · **Proyectar** ocurre una vez por CÁMARA, es decir una vez por cuadro
 *   mientras se arrastra una órbita: su techo es el cuadro de 60 Hz entero.
 * · **La rejilla** se construye en la primera consulta tras mover la cámara —una
 *   vez por parada del ratón, no una por cuadro—, así que también cabe en un
 *   cuadro con sitio de sobra.
 * · **Construir** ocurre al cambiar el documento, que no es un gesto: 250 ms.
 */
check(
  `consultar cuesta p95 ${queryP95MedianMs.toFixed(4)} ms, por debajo de 2 ms`,
  queryP95MedianMs < 2,
);
check(
  `y muy por debajo del cuadro de 60 Hz (${FRAME_60HZ_MS.toFixed(2)} ms)`,
  queryP95MedianMs < FRAME_60HZ_MS,
);
check(
  `proyectar ${totalVertices} vértices cuesta ${projectMedianMs.toFixed(3)} ms, dentro del cuadro de 60 Hz`,
  projectMedianMs < FRAME_60HZ_MS,
);
check(
  `y la rejilla perezosa ${gridMedianMs.toFixed(3)} ms, también dentro`,
  gridMedianMs < FRAME_60HZ_MS,
);
check(
  `construir el índice de ${totalEdges} aristas cuesta ${buildMedianMs.toFixed(3)} ms`,
  buildMedianMs < 250,
);

console.log(
  `ok enganche 3D: ${scene.length} sólidos · ${totalVertices} vértices · ${totalEdges} aristas · ` +
    `construir ${buildMedianMs.toFixed(3)} ms · proyectar ${projectMedianMs.toFixed(3)} ms · ` +
    `rejilla ${gridMedianMs.toFixed(3)} ms · ` +
    `consultar p50 ${queryP50MedianMs.toFixed(4)} ms / p95 ${queryP95MedianMs.toFixed(4)} ms ` +
    `(${QUERIES} consultas × ${REPEATS} corridas, mediana) · cuadro 60 Hz = ${FRAME_60HZ_MS.toFixed(2)} ms`,
);

report("solid-snap: enganche 3D exacto y dentro del cuadro", 60);
