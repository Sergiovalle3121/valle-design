/** Paper space, viewports and deterministic vector publish (VD-CAD-PAPER-001). */
import { strict as assert } from "node:assert";
import {
  layoutToCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "./cad-document";
import {
  buildCadPublishPlan,
  buildCadSheetSetManifest,
  createThreeSheetDemo,
  fitCadViewportScale,
  reorderCadPaperSpaces,
} from "./paper-space";
import { cadPlanViewport } from "./cad-paper-viewport";
import { cadLayerShown } from "./cad-layer-visibility";

const entities: CadEntity[] = [
  {
    id: "line",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 200, y: 0, z: 0 },
    layer: "visible",
  },
  {
    id: "hidden-line",
    type: "line",
    start: { x: 0, y: 10, z: 0 },
    end: { x: 200, y: 10, z: 0 },
    layer: "hidden",
  },
  {
    id: "polyline",
    type: "polyline",
    vertices: [
      { x: 0, y: 20, z: 0 },
      { x: 50, y: 40, z: 0 },
      { x: 100, y: 20, z: 0 },
    ],
    closed: false,
    layer: "visible",
  },
  {
    id: "circle",
    type: "circle",
    center: { x: 40, y: 70, z: 0 },
    radius: 10,
    layer: "visible",
  },
  {
    id: "arc",
    type: "arc",
    center: { x: 80, y: 70, z: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: 180,
    layer: "visible",
  },
  {
    id: "ellipse",
    type: "ellipse",
    center: { x: 120, y: 70, z: 0 },
    majorAxis: { x: 20, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: 360,
    layer: "visible",
  },
  {
    id: "spline",
    type: "spline",
    degree: 2,
    controlPoints: [
      { x: 0, y: 100, z: 0 },
      { x: 50, y: 130, z: 0 },
      { x: 100, y: 100, z: 0 },
    ],
    knots: [],
    layer: "visible",
  },
  {
    id: "mtext",
    type: "mtext",
    insertion: { x: 10, y: 150, z: 0 },
    text: "General note",
    height: 5,
    layer: "visible",
  },
  {
    id: "dimension",
    type: "dimension",
    a: { x: 0, y: 160 },
    b: { x: 200, y: 160 },
    text: "200 mm",
    layer: "visible",
  },
  {
    id: "solid-hatch",
    type: "hatch",
    pattern: "SOLID",
    solid: true,
    boundaries: [
      [
        { x: 0, y: 170, z: 0 },
        { x: 20, y: 170, z: 0 },
        { x: 20, y: 190, z: 0 },
      ],
    ],
    layer: "visible",
  },
  {
    id: "pattern-hatch",
    type: "hatch",
    pattern: "ANSI31",
    solid: false,
    boundaries: [
      [
        { x: 30, y: 170, z: 0 },
        { x: 50, y: 170, z: 0 },
        { x: 50, y: 190, z: 0 },
      ],
    ],
    layer: "visible",
  },
  {
    id: "mleader",
    type: "mleader",
    vertices: [
      { x: 60, y: 180, z: 0 },
      { x: 80, y: 200, z: 0 },
    ],
    text: "Inspect",
    textPosition: { x: 82, y: 202, z: 0 },
    layer: "visible",
  },
  {
    id: "insert",
    type: "insert",
    block: "tag",
    insertion: { x: 100, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    attributes: { TAG: "P-101" },
    layer: "visible",
    context: { presentation: { color: { source: "explicit", value: "#ff0000" }, lineweight: { source: "explicit", value: 0.6 } } },
  },
  {
    id: "missing-insert",
    type: "insert",
    block: "missing",
    insertion: { x: 140, y: 180, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "visible",
  },
];

const base = layoutToCadDocument(
  {
    layers: [
      {
        id: "visible",
        name: "Visible",
        color: "#2563eb",
        visible: true,
        locked: false,
      },
      {
        id: "hidden",
        name: "Hidden",
        color: "#dc2626",
        visible: true,
        locked: false,
      },
    ],
  },
  { unit: "mm" },
);
const paperSpaces = createThreeSheetDemo({
  bounds: { x: 0, y: 0, width: 200, height: 220 },
  unit: "mm",
  metadata: {
    project: "Valle Design Demo",
    drawingNumber: "AX-CAD-001",
    revision: "P01",
    discipline: "Manufacturing",
  },
});
paperSpaces[0].viewports![0].layerVisibility = { hidden: false };
paperSpaces[1].pageSetup = { ...paperSpaces[1].pageSetup!, colorMode: "color" };

const document: CadDocument = {
  ...base,
  layers: base.layers.map((layer) =>
    layer.id === "visible" ? { ...layer, lineweight: 0.25 } : layer,
  ),
  entities,
  modelSpace: { entityIds: entities.map((entity) => entity.id) },
  paperSpaces,
  blocks: [
    {
      id: "block-tag",
      name: "tag",
      basePoint: { x: 0, y: 0, z: 0 },
      entities: [
        {
          id: "tag-line",
          type: "line",
          start: { x: 0, y: 0, z: 0 },
          end: { x: 20, y: 0, z: 0 },
          layer: "0",
          context: { presentation: { color: { source: "byBlock" }, lineweight: { source: "byBlock" } } },
        },
      ],
      attributes: { TAG: { required: true, position: { x: 5, y: 5, z: 0 }, height: 10 } },
    },
  ],
};

assert.equal(
  fitCadViewportScale(
    { x: 0, y: 0, width: 200, height: 100 },
    { width: 100, height: 100 },
  ),
  2,
  "ajusta a una escala CAD estandar",
);
assert.equal(
  buildCadSheetSetManifest(document).sheets.length,
  3,
  "manifiesto de tres hojas",
);

const reordered = reorderCadPaperSpaces(
  document.paperSpaces,
  "sheet-detail-b",
  -1,
);
assert.deepEqual(
  reordered.map((sheet) => sheet.id),
  ["sheet-general", "sheet-detail-b", "sheet-detail-a"],
  "reordena sin perder hojas",
);
assert.deepEqual(
  reordered.map((sheet) => sheet.order),
  [0, 1, 2],
  "normaliza el orden persistido",
);

const plan = buildCadPublishPlan(document, "2026-07-26T00:00:00.000Z");
assert.equal(plan.sheets.length, 3, "publica el conjunto completo");
assert.equal(plan.rasterCommandCount, 0, "la geometria nunca se rasteriza");
assert.ok(
  plan.vectorCommandCount > entities.length,
  "curvas, anotaciones y bloques generan comandos vectoriales",
);
assert.ok(
  plan.sheets[0].viewports[0].commands.every(
    (command) => command.entityId !== "hidden-line",
  ),
  "respeta visibilidad de capa por viewport",
);
assert.ok(
  plan.sheets[1].viewports[0].commands.some(
    (command) => command.entityId === "hidden-line",
  ),
  "la misma capa puede verse en otro viewport",
);
assert.ok(
  plan.sheets[0].viewports[0].commands.some(
    (command) => command.entityId === "tag-line",
  ),
  "expande la geometria viva del bloque",
);
const colorBlockViewport = plan.sheets.flatMap((sheet) => sheet.viewports).find((viewport) =>
  viewport.commands.some((command) => command.entityId === "tag-line" && command.kind === "path" && command.style.stroke === "#ff0000"),
);
const blockPath = colorBlockViewport?.commands.find((command) => command.entityId === "tag-line" && command.kind === "path");
const layerPath = colorBlockViewport?.commands.find((command) => command.entityId === "line" && command.kind === "path");
assert.ok(
  blockPath?.kind === "path" && layerPath?.kind === "path" && blockPath.style.lineWidth > layerPath.style.lineWidth,
  "resuelve color y lineweight ByBlock desde la presentacion de cada INSERT",
);
assert.ok(
  plan.sheets[0].viewports[0].commands.some(
    (command) =>
      command.entityId === "insert:attribute:TAG" &&
      command.kind === "text" &&
      command.text === "P-101",
  ),
  "publica atributos del bloque como texto vectorial",
);
// El patrón ya NO se degrada por defecto: el sombreado con patrón publica sus
// trazos además del contorno, y la advertencia de contorno-solo desapareció.
const patternHatchPaths = plan.sheets
  .flatMap((sheet) => sheet.viewports)
  .flatMap((viewport) => viewport.commands)
  .filter((command) => command.entityId === "pattern-hatch" && command.kind === "path");
assert.ok(
  patternHatchPaths.length > 1,
  `el hatch con patron publica trazos ademas del contorno (${patternHatchPaths.length} paths)`,
);
assert.ok(
  !plan.warnings.some((warning) => warning.code === "hatch_pattern_outline_only"),
  "la degradacion por defecto ya no existe; la guarda de densidad avisa aparte",
);
assert.ok(
  plan.warnings.some((warning) => warning.code === "block_definition_missing"),
  "declara referencia de bloque perdida",
);

const clipped = buildCadPublishPlan({
  ...document,
  paperSpaces: document.paperSpaces.map((space, index) =>
    index === 0
      ? {
          ...space,
          viewports: space.viewports?.map((viewport) => ({
            ...viewport,
            scale: 1,
            modelBounds: { ...viewport.modelBounds, width: 2_000 },
          })),
        }
      : space,
  ),
});
assert.ok(
  clipped.warnings.some((warning) => warning.code === "viewport_model_clipped"),
  "declara clipping cuando la escala no cabe",
);

const roundTrip = parseCadDocument(serializeCadDocument(document));
assert.equal(
  roundTrip.paperSpaces[0].viewports?.[0].locked,
  true,
  "persistencia conserva bloqueo de viewport",
);
assert.equal(
  roundTrip.paperSpaces[0].titleBlock?.attributes.PROJECT,
  "Valle Design Demo",
  "persistencia conserva cajetin",
);
assert.deepEqual(
  roundTrip.publications,
  [],
  "persistencia conserva registro de publicaciones",
);

// T-19·3: una capa "no imprime" (`plot: false`) se ve en pantalla pero NUNCA
// debe salir en el PDF, en NINGUNA ventana, aunque esa ventana no anule su
// visibilidad. `buildCadPublishPlan` es el plan que consumen los DOS
// emisores de PDF (PLOT/PUBLISH y el editor), así que arreglarlo aquí arregla
// los dos a la vez.
{
  const noPlotBase = layoutToCadDocument(
    {
      layers: [
        { id: "normal", name: "Normal", color: "#000000", visible: true, locked: false },
        { id: "no-plot", name: "NoPlot", color: "#ff0000", visible: true, locked: false },
      ],
    },
    { unit: "mm" },
  );
  // `LayoutLayerInput` (modelo histórico) no tiene `plot`: se añade después,
  // sobre el documento canónico ya construido — igual que hace la spec de
  // arriba con `lineweight`.
  noPlotBase.layers = noPlotBase.layers.map((layer) =>
    layer.id === "no-plot" ? { ...layer, plot: false } : layer,
  );
  const noPlotEntities: CadEntity[] = [
    { id: "e-normal", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "normal" },
    { id: "e-no-plot", type: "line", start: { x: 0, y: 50, z: 0 }, end: { x: 100, y: 50, z: 0 }, layer: "no-plot" },
  ];
  const viewport = cadPlanViewport(
    "vp-1",
    { x: 10, y: 10, width: 180, height: 180 },
    { x: -10, y: -10, width: 200, height: 200 },
    1,
  );
  const noPlotDocument: CadDocument = {
    ...noPlotBase,
    entities: noPlotEntities,
    modelSpace: { entityIds: noPlotEntities.map((entity) => entity.id) },
    paperSpaces: [
      {
        id: "sheet-1",
        name: "A-101",
        entityIds: [],
        page: { width: 210, height: 297, unit: "mm", orientation: "portrait" },
        viewports: [viewport],
      },
    ],
  };
  const noPlotPlan = buildCadPublishPlan(noPlotDocument, "2026-09-06T00:00:00.000Z");
  const publishedEntityIds = new Set(
    noPlotPlan.sheets[0]!.viewports[0]!.commands.map((command) => command.entityId),
  );
  assert.ok(publishedEntityIds.has("e-normal"), "la capa normal SÍ imprime");
  assert.ok(
    !publishedEntityIds.has("e-no-plot"),
    "T-19·3: una capa `plot:false` NUNCA imprime, aunque se vea en pantalla",
  );

  // La MISMA capa, vista en pantalla, sigue mostrándose: `plot:false` no es
  // `visible:false`. Si esto fallara, el arreglo habría confundido las dos.
  assert.equal(
    cadLayerShown(noPlotDocument.layers.find((layer) => layer.id === "no-plot")!),
    true,
    "`plot:false` no apaga la capa en el lienzo",
  );
}

// T-19·4 (fuga de espacio papel): una entidad que pertenece a una presentación
// (`paperSpace.entityIds` — el contorno de una ventana poligonal, un cajetín)
// puede quedar TAMBIÉN en `modelSpace.entityIds` por cómo el aplicador
// genérico de "insert" añade toda entidad nueva al dibujo. Sin filtro, esa
// entidad se proyecta como geometría de MODELO —con sus coordenadas de
// PAPEL— dentro de CADA ventana del documento.
{
  const leakBase = layoutToCadDocument({ layers: [{ id: "0", name: "0", color: "#000000", visible: true, locked: false }] }, { unit: "mm" });
  const leakEntities: CadEntity[] = [
    { id: "e-model", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0" },
    // Contorno de una ventana poligonal: vive en `paperSpace.entityIds`, pero
    // el aplicador genérico lo dejó TAMBIÉN en `modelSpace.entityIds`.
    { id: "e-clip", type: "polyline", closed: true, vertices: [{ x: 20, y: 20, z: 0 }, { x: 80, y: 20, z: 0 }, { x: 50, y: 60, z: 0 }], layer: "0" },
  ];
  const viewport = cadPlanViewport(
    "vp-leak",
    { x: 10, y: 10, width: 180, height: 180 },
    { x: -10, y: -10, width: 200, height: 200 },
    1,
  );
  const leakDocument: CadDocument = {
    ...leakBase,
    entities: leakEntities,
    modelSpace: { entityIds: leakEntities.map((entity) => entity.id) },
    paperSpaces: [
      {
        id: "sheet-leak",
        name: "A-101",
        entityIds: ["e-clip"],
        page: { width: 210, height: 297, unit: "mm", orientation: "portrait" },
        viewports: [viewport],
      },
    ],
  };
  const leakPlan = buildCadPublishPlan(leakDocument, "2026-09-06T00:00:00.000Z");
  const leakPublishedIds = new Set(
    leakPlan.sheets[0]!.viewports[0]!.commands.map((command) => command.entityId),
  );
  assert.ok(leakPublishedIds.has("e-model"), "la entidad de modelo real SÍ imprime");
  assert.ok(
    !leakPublishedIds.has("e-clip"),
    "T-19·4: una entidad de PAPEL nunca se proyecta como geometría de modelo",
  );
  assert.ok(
    leakPlan.warnings.some(
      (warning) =>
        warning.code === "paper_space_entity_excluded_from_model" && warning.entityId === "e-clip",
    ),
    "la exclusión se declara, nunca en silencio",
  );
}

console.log("cad paper space specs passed");
