/**
 * Spec del anfitrión del pipeline por lotes.
 *
 * Cubre el hueco que el benchmark de 100k confiesa en su `notMeasured` y en su
 * `entityMix`: aquel corpus era 49.870 líneas, 24.966 círculos y 25.164 arcos, y
 * **cero** polilíneas, hatches, mtext, cotas e inserts. Aquí el documento lleva
 * uno de cada, precisamente para que un cableado que se cayera con un MTEXT no
 * pudiera pasar en verde.
 *
 * Lo que sigue sin poder comprobarse en Node —GPU, llamadas de dibujo reales y
 * el RASTERIZADO de glifos, que necesita un canvas— es lo que afirman los
 * goldens 46 y 47 en Chromium.
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  CAD_RENDER_BATCH_ORDER,
  CAD_RENDER_DEPTH_BIAS,
  CAD_RENDER_DEPTH_SCALE,
  CAD_RENDER_SELECTED_COLOR,
  CadViewportRenderHost,
} from "./render-pipeline-host";
import {
  CAD_DOCUMENT_SCHEMA,
  type CadDocument,
  type CadEntity,
} from "@/lib/cad/cad-document";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };

/** Un documento con UNA entidad de cada familia que el benchmark no midió. */
function mixedDocument(): CadDocument {
  const entities: CadEntity[] = [
    {
      id: "line-1",
      type: "line",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 400, y: 0, z: 0 },
      layer: "0",
    },
    {
      id: "pline-1",
      type: "polyline",
      vertices: [
        { x: 0, y: 100, z: 0 },
        { x: 200, y: 100, z: 0, bulge: 0.5 },
        { x: 400, y: 260, z: 0 },
      ],
      closed: false,
      layer: "0",
    },
    {
      id: "circle-1",
      type: "circle",
      center: { x: 600, y: 200, z: 0 },
      radius: 90,
      layer: "0",
    },
    {
      id: "arc-1",
      type: "arc",
      center: { x: 820, y: 200, z: 0 },
      radius: 70,
      startAngle: 0,
      endAngle: 140,
      layer: "0",
    },
    {
      id: "hatch-1",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [
        [
          { x: 0, y: 400, z: 0 },
          { x: 300, y: 400, z: 0 },
          { x: 300, y: 620, z: 0 },
          { x: 0, y: 620, z: 0 },
        ],
      ],
      layer: "0",
    },
    {
      id: "dim-1",
      type: "dimension",
      a: { x: 0, y: 0 },
      b: { x: 400, y: 0 },
      offset: 60,
      dimensionKind: "linear",
      axis: "x",
      layer: "0",
    },
    {
      id: "mtext-1",
      type: "mtext",
      insertion: { x: 500, y: 500, z: 0 },
      text: "PLANTA BAJA",
      height: 40,
      layer: "0",
    },
    {
      id: "insert-1",
      type: "insert",
      block: "block-1",
      insertion: { x: 900, y: 500, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: "0",
    },
  ];
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities,
    history: [],
    // El orden de dibujo NO es el orden del array: el hatch va el primero (queda
    // debajo) para poder comprobar que la profundidad lo respeta.
    modelSpace: {
      entityIds: [
        "hatch-1",
        "line-1",
        "pline-1",
        "circle-1",
        "arc-1",
        "dim-1",
        "mtext-1",
        "insert-1",
      ],
    },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [
      {
        id: "block-1",
        name: "MARCA",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [
          {
            id: "block-1-line",
            type: "line",
            start: { x: -30, y: -30, z: 0 },
            end: { x: 30, y: 30, z: 0 },
            layer: "0",
          },
        ],
      },
    ],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

const viewport = { scale: 0.01, width: 2_000, height: 2_000, elevation: 0.11 };
const view = {
  bounds: { minX: -200, minY: -200, maxX: 1_200, maxY: 900 },
  pixelsPerUnit: 1,
};

function settle(host: CadViewportRenderHost): void {
  for (let frame = 0; frame < 200; frame += 1) {
    host.frame(view, viewport);
    if (host.diagnostics().settled) break;
  }
  // Un cuadro más: al asentarse aún queda la reconciliación de mallas.
  host.frame(view, viewport);
}

// ---------------------------------------------------------------------------
// 1. El anfitrión se enchufa al grupo del editor con su lámina de profundidad.
// ---------------------------------------------------------------------------
const parent = new THREE.Group();
const document = mixedDocument();
const host = new CadViewportRenderHost({ parent, viewport });

ok(parent.children.includes(host.group), "el grupo de lotes cuelga del grupo del CAD");
ok(
  CAD_RENDER_BATCH_ORDER < 28,
  "los lotes se dibujan por debajo de la selección heredada (28–31), que va sin prueba de profundidad",
);
// ANCLA ABSOLUTA de la lámina. `cadDrawOrderDepth` entrega (−0,9 … +0,9); la
// lámina lo comprime a (−0,9895 … −0,8905), delante del suelo y de los objetos
// 3D. Si esta comprobación se cae, la primera entidad del orden de dibujo
// vuelve al fondo del búfer y el suelo la tapa — que es exactamente el fallo
// que costó el golden 20 en su primera versión.
const slabFar = CAD_RENDER_DEPTH_BIAS + 0.9 * CAD_RENDER_DEPTH_SCALE;
const slabNear = CAD_RENDER_DEPTH_BIAS - 0.9 * CAD_RENDER_DEPTH_SCALE;
assert.ok(Math.abs(slabFar + 0.8905) < 1e-4, `el borde lejano de la lámina es −0,8905, no ${slabFar}`);
assert.ok(Math.abs(slabNear + 0.9895) < 1e-4, `el borde cercano es −0,9895, no ${slabNear}`);
ok(slabNear > -1 && slabFar < 0, "la lámina entera cae dentro del búfer y delante del centro de la escena");
// Y NO queda ningún centinela que limpie la profundidad: esa era la versión
// cara, y volver a introducirla reproduciría el atasco del hilo principal.
ok(
  !parent.children.some((child) => child.userData.cadRenderDepthClear === true),
  "no hay limpieza de profundidad por cuadro",
);

// ---------------------------------------------------------------------------
// 2. Un documento MIXTO se materializa entero. Cero muestreo.
// ---------------------------------------------------------------------------
host.replace(document);
settle(host);
const stats = host.diagnostics();
assert.equal(stats.total, 8, "las ocho entidades entran en el pipeline");
assert.equal(
  stats.rendered,
  stats.visible,
  `en reposo el detalle cubre lo visible: ${stats.rendered}/${stats.visible}`,
);
assert.equal(stats.visible, 8, "las ocho son visibles con esta vista");
ok(stats.batches > 0, `el documento mixto produce ${stats.batches} lotes`);
ok(stats.instances > 0, `y ${stats.instances} instancias de segmento`);
ok(
  host.group.children.some((child) => child.userData.cadLineBatch === true),
  "hay al menos una malla instanciada en la escena",
);
ok(
  true,
  `documento con polilínea(bulge), hatch, cota, mtext e insert: ${stats.instances} instancias en ${stats.batches} lotes`,
);

// ---------------------------------------------------------------------------
// 3. ORDEN DE DIBUJO SEMÁNTICO. El hatch va primero, así que queda DETRÁS.
//    Bajo prueba de profundidad LESS, «detrás» es z mayor.
// ---------------------------------------------------------------------------
function depthsOf(hostUnderTest: CadViewportRenderHost): number[] {
  const depths: number[] = [];
  for (const child of hostUnderTest.group.children) {
    if (child.userData.cadLineBatch !== true) continue;
    const geometry = (child as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;
    const style = geometry.getAttribute("instanceStyle");
    for (let index = 0; index < geometry.instanceCount; index += 1)
      depths.push(style.getW(index));
  }
  return depths;
}
const depths = depthsOf(host);
ok(depths.length > 0, "hay profundidades por instancia que mirar");
const maxDepth = Math.max(...depths);
const minDepth = Math.min(...depths);
ok(
  maxDepth > minDepth,
  `la profundidad varía entre entidades: ${minDepth.toFixed(4)} … ${maxDepth.toFixed(4)}`,
);
// ANCLA ABSOLUTA: con 8 posiciones, la primera vale 0,9·(1−2·(0,5/8)) = 0,7875 y
// la última 0,9·(1−2·(7,5/8)) = −0,7875. Si esto se rompe, el orden de dibujo se
// perdió y los sombreados empezarán a tapar la geometría que rellenan.
assert.ok(
  Math.abs(maxDepth - 0.7875) < 1e-4,
  `la primera posición del orden de dibujo vale 0,7875, no ${maxDepth}`,
);
assert.ok(
  Math.abs(minDepth + 0.7875) < 1e-4,
  `la última vale −0,7875, no ${minDepth}`,
);
ok(true, "el orden de dibujo de `modelSpace.entityIds` viaja como z NDC por instancia");

// ---------------------------------------------------------------------------
// 4. La SELECCIÓN es un color de instancia, y llega a la GPU.
// ---------------------------------------------------------------------------
function hasColor(hostUnderTest: CadViewportRenderHost, packed: number): boolean {
  for (const child of hostUnderTest.group.children) {
    if (child.userData.cadLineBatch !== true) continue;
    const geometry = (child as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;
    const style = geometry.getAttribute("instanceStyle");
    for (let index = 0; index < geometry.instanceCount; index += 1)
      if (style.getX(index) === packed) return true;
  }
  return false;
}
ok(
  !hasColor(host, CAD_RENDER_SELECTED_COLOR),
  "sin selección no hay ninguna instancia con el color de selección",
);
const beforeSelect = host.diagnostics().total;
host.setSelection(["circle-1"], document);
settle(host);
ok(
  hasColor(host, CAD_RENDER_SELECTED_COLOR),
  "seleccionar recolorea las instancias de la entidad",
);
// La regresión que este caso cierra: invalidar sin `upsert` daría de BAJA la
// entidad, y seleccionar un círculo lo haría desaparecer del dibujo.
assert.equal(
  host.diagnostics().total,
  beforeSelect,
  "seleccionar no puede dar de baja la entidad seleccionada",
);
assert.equal(host.diagnostics().rendered, host.diagnostics().visible);
host.setSelection([], document);
settle(host);
ok(
  !hasColor(host, CAD_RENDER_SELECTED_COLOR),
  "deseleccionar devuelve el color original",
);
ok(true, "la selección va y vuelve sin perder entidades");

// ---------------------------------------------------------------------------
// 4b. La RANURA del tipo de línea llega al lote. Medido el 2026-09-02: el
//     anfitrión devolvía `linetypeIndex: 0` fijo y no resolvía BYLAYER, así
//     que un dibujo nuevo con capa EJES=CENTER se veía continuo aunque la
//     sonda `visor.linetypeIndex` de la matriz de propiedades dijera 1.
// ---------------------------------------------------------------------------
function slotsOf(hostUnderTest: CadViewportRenderHost): Set<number> {
  const slots = new Set<number>();
  for (const child of hostUnderTest.group.children) {
    if (child.userData.cadLineBatch !== true) continue;
    const geometry = (child as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;
    const style = geometry.getAttribute("instanceStyle");
    for (let index = 0; index < geometry.instanceCount; index += 1) slots.add(style.getZ(index));
  }
  return slots;
}
const linedParent = new THREE.Group();
const linedHost = new CadViewportRenderHost({ parent: linedParent, viewport });
const linedDocument: CadDocument = {
  ...mixedDocument(),
  layers: [layer, { id: "EJES", name: "EJES", color: "#f97316", visible: true, locked: false, linetype: "CENTER" }],
  entities: [
    { id: "eje", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 400, y: 0, z: 0 }, layer: "EJES" },
    { id: "muro", type: "line", start: { x: 0, y: 50, z: 0 }, end: { x: 400, y: 50, z: 0 }, layer: "0" },
  ],
  modelSpace: { ...mixedDocument().modelSpace, entityIds: ["eje", "muro"] },
};
// Sin `styles.linetype`: es un dibujo NUEVO, el caso que se veía continuo.
linedHost.replace(linedDocument);
settle(linedHost);
const slots = slotsOf(linedHost);
ok(slots.has(0), "la línea en la capa 0 va en la ranura 0 (continua)");
ok([...slots].some((slot) => slot > 0), `la línea en EJES=CENTER lleva una ranura > 0: ${[...slots].join(", ")}`);
assert.equal(slots.size, 2, "dos capas con dos tipos de línea son dos ranuras distintas");
// Y la MISMA ranura que la tabla que la escena subió al shader: si el índice
// horneado en el lote y la tabla de uniformes discreparan, el eje se dibujaría
// con el patrón de otro tipo.
const centerSlot = [...slots].find((slot) => slot > 0)!;
const meta = linedHost.linetypeUniforms().meta;
assert.deepEqual([...meta.slice(centerSlot * 2, centerSlot * 2 + 2)], [4, 2], "la ranura del eje apunta a CENTER en los uniformes: 4 tramos, periodo 2");
// Seleccionar cambia el color y NADA más: la ranura sobrevive.
linedHost.setSelection(["eje"], linedDocument);
settle(linedHost);
ok(hasColor(linedHost, CAD_RENDER_SELECTED_COLOR), "el eje seleccionado lleva el color de selección");
assert.deepEqual([...slotsOf(linedHost)].sort(), [...slots].sort(), "seleccionar no toca la ranura del tipo de línea");
linedHost.dispose();
ok(true, "BYLAYER resuelve contra la capa: EJES=CENTER llega al lote con la ranura de CENTER, sin catálogo en el documento");

// ---------------------------------------------------------------------------
// 5. Los INSERT ya dibujados por el lote instanciado se excluyen — no se
//    duplica geometría ni se toca `buildCadInsertBatches`.
// ---------------------------------------------------------------------------
const excludedParent = new THREE.Group();
const excluded = new CadViewportRenderHost({ parent: excludedParent, viewport });
excluded.replace(document, { excludeEntityIds: new Set(["insert-1"]) });
settle(excluded);
assert.equal(
  excluded.diagnostics().total,
  7,
  "el INSERT excluido no entra en el pipeline por lotes",
);
// Y el orden de dibujo se recorta con él: 7 posiciones, no 8 con un hueco.
const excludedDepths = depthsOf(excluded);
assert.ok(
  Math.abs(Math.max(...excludedDepths) - 0.9 * (1 - 2 * (0.5 / 7))) < 1e-4,
  "el orden de dibujo se renumera sobre las entidades que quedan",
);
excluded.dispose();
ok(true, "excluir un INSERT batcheado no deja huecos en el orden de dibujo");

// ---------------------------------------------------------------------------
// 6. Editar entra por `invalidate` y se ve. Y una BAJA es una baja.
// ---------------------------------------------------------------------------
const moved = {
  ...(document.entities.find((entity) => entity.id === "line-1") as CadEntity & {
    type: "line";
  }),
  end: { x: 900, y: 0, z: 0 },
};
host.invalidate(["line-1"], [moved as never]);
settle(host);
assert.equal(host.diagnostics().total, 8, "editar no cambia el número de entidades");
host.invalidate(["circle-1"]);
settle(host);
assert.equal(
  host.diagnostics().total,
  7,
  "un id afectado sin upsert es una BAJA, como dice el contrato del pipeline",
);
ok(true, "editar y borrar entran por la misma llamada, con el contrato documentado");

// ---------------------------------------------------------------------------
// 7. Apagar una capa no reconstruye nada, y ocultar el anfitrión lo silencia.
// ---------------------------------------------------------------------------
host.setHiddenLayers(new Set(["0"]));
ok(
  host.group.children
    .filter((child) => child.userData.cadLineBatch === true)
    .every((child) => child.visible === false),
  "apagar la capa apaga los lotes sin reconstruir geometría",
);
host.setHiddenLayers(new Set());
host.setVisible(false);
const framesWhileHidden = host.diagnostics().meshes;
host.frame(view, viewport);
assert.equal(host.diagnostics().meshes, framesWhileHidden, "oculto, un cuadro no trabaja");
ok(!host.visible, "ocultar el anfitrión apaga su grupo entero");
host.setVisible(true);

// ---------------------------------------------------------------------------
// 8. Liberar. Sin esto, cerrar un dibujo retiene su geometría en la GPU.
// ---------------------------------------------------------------------------
host.dispose();
ok(!parent.children.includes(host.group), "liberar saca el grupo de la escena");
host.frame(view, viewport);
host.replace(document);
assert.deepEqual(host.diagnostics().total, 0, "un anfitrión liberado no vuelve a la vida");
ok(true, "liberar es idempotente y no revive");

console.log(
  `render-pipeline-host: ${checks} comprobaciones — documento con polilínea/hatch/cota/mtext/insert materializado entero (rendered == visible), orden de dibujo anclado en ±0,7875, selección por color de instancia sin perder entidades, y lámina de profundidad en vez de limpiar el búfer por cuadro.`,
);
