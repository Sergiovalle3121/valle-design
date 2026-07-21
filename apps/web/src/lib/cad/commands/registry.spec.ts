/** Pure CAD command registry smoke tests. Run: node_modules/.bin/ts-node --compiler-options '{"module":"commonjs"}' --project apps/web/tsconfig.json apps/web/src/lib/cad/commands/registry.spec.ts */
import { strict as assert } from "node:assert";
import {
  CAD_COMMAND_REGISTRY,
  executeCadCommand,
  parseCadCommand,
  previewCadCommand,
  splitCadCommandChain,
  pushHistory,
  createHistoryItem,
  undoHistory,
  redoHistory,
} from "./index";
import type { CadCommandContext } from "./types";
import type { CadCommandHistoryState } from "./history";

const ctx: CadCommandContext = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  selectedIds: ["smt", "aoi", "pack"],
  connectors: [],
  objects: [
    {
      id: "smt",
      type: "station",
      label: "SMT",
      x: 100,
      y: 100,
      w: 1000,
      h: 600,
      sequence: 1,
    },
    {
      id: "aoi",
      type: "station",
      label: "Inspección AOI",
      x: 1500,
      y: 100,
      w: 800,
      h: 600,
      sequence: 2,
    },
    {
      id: "pack",
      type: "station",
      label: "Empaque",
      x: 2600,
      y: 100,
      w: 900,
      h: 600,
      sequence: 3,
    },
  ],
};

assert.equal(
  new Set(CAD_COMMAND_REGISTRY.map((c) => c.id)).size,
  CAD_COMMAND_REGISTRY.length,
  "registry ids are unique",
);
assert.equal(CAD_COMMAND_REGISTRY.length, 44, "registry exposes 44 commands");

// Renombrar (AXOS-CAD-RENAME-001): primera coincidencia, con aviso si hay más.
{
  const parsed = parseCadCommand("renombra la smt a 'Línea Uno'");
  assert.equal(parsed.input?.id, "rename_object", "renombra parsea");
  if (parsed.input?.id === "rename_object") {
    assert.equal(parsed.input.target, "smt", "target del parser");
    assert.equal(parsed.input.name, "Línea Uno", "nombre sin comillas");
  }
  const p = previewCadCommand(
    { id: "rename_object", target: "smt", name: "Línea Uno" },
    ctx,
  );
  const op = p.operations[0];
  assert.equal(op.type, "rename", "emite rename");
  if (op.type === "rename") {
    assert.equal(op.objectId, "smt", "objeto correcto");
    assert.equal(op.label, "Línea Uno", "nombre nuevo");
  }
  const vague = parseCadCommand("renombra");
  assert.equal(vague.ok, false, "sin partes pide clarificación");
  const missing = previewCadCommand(
    { id: "rename_object", target: "nave espacial", name: "X" },
    ctx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "rename_not_found"),
    "objetivo inexistente → error",
  );
}

// Info de objeto (AXOS-CAD-QUERY-002): '¿cuánto mide X?' responde medidas.
{
  const parsed = parseCadCommand("¿cuánto mide la smt?");
  assert.equal(parsed.input?.id, "object_info", "cuánto mide parsea");
  if (parsed.input?.id === "object_info") {
    assert.equal(parsed.input.query, "smt", "query limpia");
  }
  const p = previewCadCommand({ id: "object_info", query: "smt" }, ctx);
  const op = p.operations[0];
  assert.equal(op.type, "report", "emite report");
  if (op.type === "report") {
    assert.ok(op.rows[0].value.includes("1000×600"), "medidas reales");
  }
  assert.ok(p.summary.includes("SMT"), "resumen con el objeto");
  const missing = previewCadCommand({ id: "object_info", query: "nave espacial" }, ctx);
  assert.ok(
    missing.issues.some((i) => i.code === "info_not_found"),
    "objetivo inexistente → error",
  );
}

// Acotar por nombre (AXOS-CAD-NAME-005).
{
  const parsed = parseCadCommand("acota las mesas");
  assert.equal(parsed.input?.id, "auto_dimension", "acota parsea");
  if (parsed.input?.id === "auto_dimension") {
    assert.equal(parsed.input.target, "mesas", "target del parser");
  }
  const plain = parseCadCommand("acota la selección");
  if (plain.input?.id === "auto_dimension") {
    assert.equal(plain.input.target, undefined, "'la selección' no es target");
  }
  const missing = previewCadCommand(
    { id: "auto_dimension", target: "nave espacial" },
    ctx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "target_not_found"),
    "objetivo inexistente → error",
  );
}

// Alinear/Distribuir por nombre (AXOS-CAD-NAME-004).
{
  const parsed = parseCadCommand("alinea las estaciones al centro");
  assert.equal(parsed.input?.id, "align_selection", "alinea parsea");
  if (parsed.input?.id === "align_selection") {
    assert.equal(parsed.input.mode, "center", "modo centro");
    assert.equal(parsed.input.target, "estaciones", "target del parser");
  }
  const plainAlign = parseCadCommand("alinea al centro");
  if (plainAlign.input?.id === "align_selection") {
    assert.equal(plainAlign.input.target, undefined, "sin residuo no hay target");
  }
  const mesasCtx = {
    ...ctx,
    selectedIds: [],
    objects: [
      { id: "t1", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 0, y: 0, w: 900, h: 900 },
      { id: "t2", type: "asset", kind: "restaurant-table-4", label: "Mesa 4 personas", x: 2000, y: 400, w: 900, h: 900 },
    ],
  } as CadCommandContext;
  const aligned = previewCadCommand(
    { id: "align_selection", mode: "center", target: "mesas" },
    mesasCtx,
  );
  assert.equal(
    aligned.affectedObjectIds.length,
    2,
    "resuelve mesas por nombre sin selección",
  );
  const missing = previewCadCommand(
    { id: "align_selection", mode: "center", target: "nave espacial" },
    ctx,
  );
  assert.ok(
    missing.issues.some((i) => i.code === "target_not_found"),
    "objetivo inexistente → error",
  );
}

// Zoom por nombre (AXOS-CAD-ZOOM-001): 'enfoca X' resuelve y manda zoom.
{
  const parsed = parseCadCommand("enfoca la cocina");
  assert.equal(parsed.input?.id, "fit_to_view", "enfoca parsea");
  if (parsed.input?.id === "fit_to_view") {
    assert.equal(parsed.input.target, "cocina", "target del parser");
  }
  const plain = parseCadCommand("enfoca la selección");
  if (plain.input?.id === "fit_to_view") {
    assert.equal(plain.input.target, undefined, "'la selección' no es target");
  }
  const p = previewCadCommand({ id: "fit_to_view", target: "smt" }, ctx);
  const op = p.operations[0];
  if (op?.type === "focus") {
    assert.equal(op.zoom, true, "fit_to_view manda zoom");
    assert.ok(op.objectIds.length >= 1, "resuelve el nombre");
  }
  const missing = previewCadCommand({ id: "fit_to_view", target: "nave espacial" }, ctx);
  assert.ok(
    missing.issues.some((i) => i.code === "focus_target_not_found"),
    "objetivo inexistente → error",
  );
}

// Guardar conversacional (AXOS-CAD-SAVE-001).
{
  const saved = parseCadCommand("guarda el plano");
  assert.equal(saved.input?.id, "studio_save", "guarda parsea");
  const bookmark = parseCadCommand("guarda la vista");
  assert.notEqual(
    bookmark.input?.id,
    "studio_save",
    "'guarda la vista' no es guardar el layout",
  );
}

// Vista conversacional (AXOS-CAD-VIEW-001).
{
  const planta = parseCadCommand("vista 2d");
  assert.equal(planta.input?.id, "studio_view", "vista 2d parsea");
  if (planta.input?.id === "studio_view") {
    assert.equal(planta.input.mode, "2d", "modo 2d");
  }
  const orbital = parseCadCommand("vista 3d");
  if (orbital.input?.id === "studio_view") {
    assert.equal(orbital.input.mode, "3d", "modo 3d");
  }
  const cenital = parseCadCommand("ponme la planta");
  if (cenital.input?.id === "studio_view") {
    assert.equal(cenital.input.mode, "2d", "'planta' es 2d");
  }
}

// Imprimir/Exportar (AXOS-CAD-PLOT-003): formato y papel desde la frase.
{
  const printed = parseCadCommand("imprime en a3");
  assert.equal(printed.input?.id, "studio_export", "imprime parsea");
  if (printed.input?.id === "studio_export") {
    assert.equal(printed.input.format, "pdf", "default pdf");
    assert.equal(printed.input.paper, "A3", "papel A3 de la frase");
  }
  const dxf = parseCadCommand("exporta el dxf");
  if (dxf.input?.id === "studio_export") {
    assert.equal(dxf.input.format, "dxf", "formato dxf");
    assert.equal(dxf.input.paper, undefined, "sin papel");
  }
  const carta = parseCadCommand("imprime en carta");
  if (carta.input?.id === "studio_export") {
    assert.equal(carta.input.paper, "letter", "carta → letter");
  }
  const p = previewCadCommand({ id: "studio_export", format: "pdf", paper: "A3" }, ctx);
  const op = p.operations[0];
  assert.equal(op.type, "studio_export", "emite studio_export");
  if (op.type === "studio_export") assert.equal(op.paper, "A3", "papel en la op");
}

// Deshacer conversacional (AXOS-CAD-UNDO-001).
{
  const parsedUndo = parseCadCommand("deshaz");
  assert.equal(parsedUndo.input?.id, "history_step", "deshaz parsea");
  if (parsedUndo.input?.id === "history_step") {
    assert.equal(parsedUndo.input.action, "undo", "acción undo");
  }
  const p = previewCadCommand({ id: "history_step", action: "redo" }, ctx);
  const op = p.operations[0];
  assert.equal(op.type, "history", "emite operación history");
  if (op.type === "history") assert.equal(op.action, "redo", "acción redo");
}

// Cadenas (AXOS-CAD-CHAIN-001): separadores explícitos; ' y ' pelón NO corta.
{
  const chain = splitCadCommandChain("pon una puerta y luego céntrala; quita las cotas");
  assert.deepEqual(
    chain,
    ["pon una puerta", "céntrala", "quita las cotas"],
    "separa por 'y luego' y ';'",
  );
  for (const part of chain) {
    assert.equal(parseCadCommand(part).ok, true, `'${part}' parsea solo`);
  }
  assert.deepEqual(
    splitCadCommandChain("mide de la barra y la mesa"),
    ["mide de la barra y la mesa"],
    "' y ' pelón no separa (nombres compuestos)",
  );
}

// Ayuda (AXOS-CAD-HELP-001): '¿qué puedes hacer?' lista el catálogo.
{
  const help = parseCadCommand("¿qué puedes hacer?");
  assert.equal(help.input?.id, "help_commands", "la pregunta parsea a ayuda");
  const p = previewCadCommand({ id: "help_commands" }, ctx);
  const op = p.operations[0];
  assert.equal(op.type, "report", "ayuda emite reporte");
  if (op.type === "report") {
    assert.ok(op.rows.length >= 30, "lista el catálogo completo");
    assert.ok(
      op.rows.some((row) => row.label === "Mover selección"),
      "incluye el kit universal",
    );
  }
}

const parsed = parseCadCommand("haz un pasillo de 1.2m entre SMT e inspección");
assert.equal(parsed.ok, true, "parser detects clearance aisle");
assert.equal(parsed.input?.id, "create_clearance_aisle");

const preview = previewCadCommand(parsed.input!, ctx);
assert.equal(
  preview.affectedObjectIds.length,
  2,
  "preview reports affected objects",
);
assert.equal(preview.operations[0]?.type, "move", "preview proposes a move");

const invalid = executeCadCommand(
  { id: "distribute_selection", axis: "horizontal", objectIds: ["smt"] },
  ctx,
);
assert.equal(invalid.applied, false, "executor does not apply invalid command");
assert.equal(
  invalid.issues.some((i) => i.code === "selection_too_small"),
  true,
  "validator reports selection issue",
);

const flowPreview = previewCadCommand(
  { id: "connect_flow", objectIds: ["smt", "aoi", "pack"] },
  ctx,
);
assert.equal(
  flowPreview.operations.some((op) => op.type === "report"),
  true,
  "connect flow includes flow metrics report",
);

const arrangePreview = previewCadCommand(
  { id: "arrange_line", direction: "left_to_right", objectIds: ["smt", "aoi"] },
  ctx,
);
assert.equal(
  arrangePreview.operations.some((op) => op.type === "report"),
  true,
  "arrange line includes post-flow score report",
);

const flowLinePreview = previewCadCommand(
  {
    id: "arrange_flow_line",
    direction: "left_to_right",
    objectIds: ["smt", "aoi", "pack"],
    gap: 250,
  },
  ctx,
);
assert.equal(
  flowLinePreview.operations.filter((op) => op.type === "move").length,
  3,
  "flow line moves every object",
);
assert.equal(
  flowLinePreview.operations.filter((op) => op.type === "connect").length,
  2,
  "flow line creates connectors between sequence steps",
);
assert.equal(
  flowLinePreview.operations.some(
    (op) => op.type === "report" && op.title === "Linea de flujo",
  ),
  true,
  "flow line includes score report",
);
assert.equal(
  parseCadCommand("acomoda y conecta la linea de flujo").input?.id,
  "arrange_flow_line",
  "parser recognizes arrange and connect flow line intent",
);

const rackCtx: CadCommandContext = {
  ...ctx,
  footprintW: 12000,
  footprintH: 9000,
  selectedIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  objects: [
    {
      id: "rack-1",
      type: "asset",
      label: "Rack A1",
      x: 5000,
      y: 100,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-2",
      type: "asset",
      label: "Rack A2",
      x: 5000,
      y: 1200,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-3",
      type: "asset",
      label: "Rack B1",
      x: 5000,
      y: 2300,
      w: 1200,
      h: 900,
    },
    {
      id: "rack-4",
      type: "asset",
      label: "Rack B2",
      x: 5000,
      y: 3400,
      w: 1200,
      h: 900,
    },
  ],
};

const lineBalancePreview = previewCadCommand(
  {
    id: "analyze_line_balance",
    taktTimeSec: 45,
    cycleTimes: { smt: 38, aoi: 52, pack: 41 },
  },
  ctx,
);
assert.equal(
  lineBalancePreview.operations.some(
    (op) => op.type === "report" && op.title === "Balanceo de linea",
  ),
  true,
  "line balance emits a balance report",
);
assert.equal(
  lineBalancePreview.issues.some(
    (issue) => issue.code === "line_balance_over_takt",
  ),
  true,
  "line balance warns when a station is over takt",
);
assert.equal(
  parseCadCommand("analiza balanceo de linea takt 45s").input?.id,
  "analyze_line_balance",
  "parser recognizes line balance intent",
);

const materialRoutePreview = previewCadCommand(
  { id: "trace_material_route" },
  {
    ...ctx,
    connectors: [
      { from: "smt", to: "aoi", kind: "flow" },
      { from: "aoi", to: "pack", kind: "material" },
    ],
  },
);
assert.equal(
  materialRoutePreview.operations.some(
    (op) => op.type === "report" && op.title === "Ruta material",
  ),
  true,
  "material route emits a from-to route report",
);
assert.equal(
  materialRoutePreview.affectedObjectIds.join(","),
  "smt,aoi,pack",
  "material route follows connector order",
);
assert.equal(
  parseCadCommand("traza ruta material").input?.id,
  "trace_material_route",
  "parser recognizes material route intent",
);

const rackParsed = parseCadCommand(
  "acomoda racks en 2 filas con pasillo de 3m",
);
assert.equal(
  rackParsed.input?.id,
  "arrange_rack_rows",
  "parser recognizes rack row intent before generic aisle commands",
);
assert.equal(
  rackParsed.input?.id === "arrange_rack_rows"
    ? rackParsed.input.aisleWidth
    : undefined,
  3000,
  "parser converts rack aisle metres to millimetres",
);
const rackPreview = previewCadCommand(
  {
    id: "arrange_rack_rows",
    rows: 2,
    baysPerRow: 2,
    aisleWidth: 3000,
    objectIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  },
  rackCtx,
);
assert.equal(
  rackPreview.operations.filter((op) => op.type === "move").length,
  4,
  "rack rows move every selected rack",
);
assert.equal(
  rackPreview.operations.some(
    (op) => op.type === "report" && op.title === "Filas de racks",
  ),
  true,
  "rack rows include a layout report",
);
const expandedRackPreview = previewCadCommand(
  {
    id: "arrange_rack_rows",
    rows: 1,
    baysPerRow: 2,
    objectIds: ["rack-1", "rack-2", "rack-3", "rack-4"],
  },
  rackCtx,
);
assert.equal(
  expandedRackPreview.issues.some(
    (issue) => issue.code === "rack_row_capacity_expanded",
  ),
  true,
  "rack rows warn when requested row capacity is too small",
);

const collisionPreview = previewCadCommand(
  { id: "find_collisions" },
  {
    ...ctx,
    objects: [
      ctx.objects[0],
      { ...ctx.objects[0], id: "overlap", label: "Overlap", x: 500 },
    ],
  },
);
assert.equal(
  collisionPreview.affectedObjectIds.includes("smt"),
  true,
  "collision preview reports object ids",
);
assert.equal(
  collisionPreview.issues.some((issue) => issue.code === "collisions_found"),
  true,
  "collision preview warns when overlaps exist",
);

const validatePreview = previewCadCommand(
  { id: "validate_layout" },
  {
    ...ctx,
    objects: [
      ctx.objects[0],
      { ...ctx.objects[0], id: "overlap", label: "Overlap", x: 500 },
    ],
  },
);
assert.equal(
  validatePreview.operations.some(
    (op) => op.type === "report" && op.title === "Validación de layout",
  ),
  true,
  "validate layout emits a combined validation report",
);
assert.equal(
  validatePreview.issues.some((issue) => issue.code === "layout_critical"),
  true,
  "validate layout flags critical severity on collisions",
);
assert.equal(
  parseCadCommand("valida el layout").input?.id,
  "validate_layout",
  "parser recognizes validate layout intent",
);

// — Comandos de creación por patrón (ADR §214) —
const gridParsed = parseCadCommand("matriz 3x4 con separación de 500");
assert.equal(
  gridParsed.input?.id,
  "array_rectangular",
  "parser recognizes rectangular array intent",
);
if (gridParsed.input?.id === "array_rectangular") {
  assert.equal(gridParsed.input.cols, 3, "parser reads cols");
  assert.equal(gridParsed.input.rows, 4, "parser reads rows");
  assert.equal(gridParsed.input.gapX, 500, "parser reads gap in mm");
}
const gridPreview = previewCadCommand(
  { id: "array_rectangular", cols: 3, rows: 2, objectIds: ["rack-1"] },
  rackCtx,
);
assert.equal(
  gridPreview.operations.filter((op) => op.type === "create").length,
  5,
  "3x2 array creates 5 copies (original stays)",
);
const stationArray = executeCadCommand(
  { id: "array_rectangular", cols: 2, rows: 2, objectIds: ["smt"] },
  ctx,
);
assert.equal(stationArray.applied, false, "stations are not copyable");
assert.equal(
  stationArray.issues.some((i) => i.code === "stations_not_copyable"),
  true,
  "station copy attempt explains why",
);

const polarParsed = parseCadCommand(
  "arreglo polar de 6 copias alrededor de Rack A1",
);
assert.equal(
  polarParsed.input?.id,
  "array_polar",
  "parser recognizes polar array intent",
);
if (polarParsed.input?.id === "array_polar") {
  assert.equal(polarParsed.input.count, 6, "parser reads polar count");
  assert.equal(
    polarParsed.input.centerLabel,
    "Rack A1",
    "parser captures center label",
  );
}
const polarPreview = previewCadCommand(
  {
    id: "array_polar",
    count: 4,
    centerLabel: "Rack A1",
    objectIds: ["rack-3"],
  },
  rackCtx,
);
assert.equal(
  polarPreview.operations.filter((op) => op.type === "create").length,
  2,
  "polar array keeps only in-bounds copies",
);
assert.equal(
  polarPreview.issues.some((i) => i.code === "copies_out_of_bounds"),
  true,
  "polar array warns about dropped out-of-bounds copies",
);

const offsetParsed = parseCadCommand("offset de 800 hacia abajo");
assert.equal(
  offsetParsed.input?.id,
  "offset_object",
  "parser recognizes offset intent",
);
if (offsetParsed.input?.id === "offset_object") {
  assert.equal(
    offsetParsed.input.distance,
    800,
    "parser reads offset distance",
  );
  assert.equal(offsetParsed.input.side, "down", "parser reads offset side");
}
const offsetPreview = previewCadCommand(
  { id: "offset_object", distance: 800, side: "down", objectIds: ["rack-1"] },
  rackCtx,
);
const offsetOp = offsetPreview.operations.find((op) => op.type === "create");
assert.equal(offsetOp?.type, "create", "offset proposes a create op");
if (offsetOp?.type === "create") {
  assert.equal(offsetOp.object.y, 900, "offset shifts copy 800 down");
  assert.equal(offsetOp.object.x, 5000, "offset keeps x for horizontal object");
}

const flowArrayCtx: CadCommandContext = {
  ...ctx,
  selectedIds: ["cart"],
  connectors: [
    { from: "smt", to: "aoi", kind: "flow" },
    { from: "aoi", to: "pack", kind: "flow" },
  ],
  objects: [
    ...ctx.objects,
    {
      id: "cart",
      type: "asset",
      label: "Carrito",
      x: 4000,
      y: 3000,
      w: 400,
      h: 300,
    },
  ],
};
assert.equal(
  parseCadCommand("coloca 5 copias a lo largo del flujo").input?.id,
  "array_along_flow",
  "parser recognizes array along flow intent",
);
const flowArrayPreview = previewCadCommand(
  { id: "array_along_flow", count: 3 },
  flowArrayCtx,
);
assert.equal(
  flowArrayPreview.operations.filter((op) => op.type === "create").length,
  3,
  "flow array creates the requested copies along the route",
);
assert.equal(
  flowArrayPreview.affectedObjectIds.includes("aoi"),
  true,
  "flow array reports the route stations",
);
const noRoute = executeCadCommand(
  { id: "array_along_flow", count: 3 },
  { ...flowArrayCtx, connectors: [] },
);
assert.equal(noRoute.applied, false, "flow array requires a connected route");
assert.equal(
  noRoute.issues.some((i) => i.code === "no_flow_route"),
  true,
  "flow array explains the missing route",
);

// — Edición de muros: extend/trim/chamfer (ADR §218) —
const wallCtx: CadCommandContext = {
  unit: "mm",
  footprintW: 10000,
  footprintH: 6000,
  selectedIds: ["wall-h", "wall-v"],
  connectors: [],
  objects: [
    // horizontal: línea central (1000,1000)→(3000,1000), grosor 20
    {
      id: "wall-h",
      type: "asset",
      kind: "wall",
      label: "Muro H",
      x: 1000,
      y: 990,
      w: 2000,
      h: 20,
      rotation: 0,
    },
    // vertical: centro (4000,2000), w=2000 rotado 90° → línea (4000,1000)→(4000,3000)
    {
      id: "wall-v",
      type: "asset",
      kind: "wall",
      label: "Muro V",
      x: 3000,
      y: 1990,
      w: 2000,
      h: 20,
      rotation: 90,
    },
  ],
};
const extendParsed = parseCadCommand("extiende Muro H hasta Muro V");
assert.equal(
  extendParsed.input?.id,
  "extend_wall",
  "parser recognizes extend intent",
);
if (extendParsed.input?.id === "extend_wall") {
  assert.equal(
    extendParsed.input.target,
    "Muro H",
    "parser reads extend target",
  );
  assert.equal(
    extendParsed.input.boundary,
    "Muro V",
    "parser reads extend boundary",
  );
}
const extendPreview = previewCadCommand(
  { id: "extend_wall", target: "Muro H", boundary: "Muro V" },
  wallCtx,
);
const extendOp = extendPreview.operations.find((op) => op.type === "move");
assert.equal(extendOp?.type, "move", "extend proposes a move");
if (extendOp?.type === "move") {
  assert.equal(
    extendOp.after.w,
    3000,
    "extend grows the wall to reach the boundary line",
  );
  assert.equal(extendOp.after.x, 1000, "extend keeps the anchored end");
}

const trimCtx: CadCommandContext = {
  ...wallCtx,
  objects: [
    {
      id: "wall-h",
      type: "asset",
      kind: "wall",
      label: "Muro H",
      x: 1000,
      y: 1990,
      w: 2000,
      h: 20,
      rotation: 0,
    },
    // vertical cruzando en (2000,2000)
    {
      id: "wall-v",
      type: "asset",
      kind: "wall",
      label: "Muro V",
      x: 1000,
      y: 1990,
      w: 2000,
      h: 20,
      rotation: 90,
    },
  ],
};
const trimPreview = previewCadCommand(
  { id: "trim_wall", target: "Muro H", cutter: "Muro V", keep: "start" },
  trimCtx,
);
const trimOp = trimPreview.operations.find((op) => op.type === "move");
assert.equal(trimOp?.type, "move", "trim proposes a move");
if (trimOp?.type === "move") {
  assert.equal(trimOp.after.w, 1000, "trim cuts the wall at the intersection");
}
assert.equal(
  parseCadCommand("recorta Muro H en Muro V").input?.id,
  "trim_wall",
  "parser recognizes trim intent",
);

const chamferCtx: CadCommandContext = {
  ...wallCtx,
  selectedIds: ["wall-a", "wall-b"],
  objects: [
    // L: horizontal (1000,1000)→(3000,1000) y vertical (3000,1000)→(3000,3000)
    {
      id: "wall-a",
      type: "asset",
      kind: "wall",
      label: "Muro A",
      x: 1000,
      y: 990,
      w: 2000,
      h: 20,
      rotation: 0,
    },
    {
      id: "wall-b",
      type: "asset",
      kind: "wall",
      label: "Muro B",
      x: 2000,
      y: 1990,
      w: 2000,
      h: 20,
      rotation: 90,
    },
  ],
};
const chamferParsed = parseCadCommand("chaflán de 400 entre Muro A y Muro B");
assert.equal(
  chamferParsed.input?.id,
  "chamfer_walls",
  "parser recognizes chamfer intent",
);
if (chamferParsed.input?.id === "chamfer_walls") {
  assert.equal(
    chamferParsed.input.distance,
    400,
    "parser reads chamfer distance",
  );
}
const chamferPreview = previewCadCommand(
  { id: "chamfer_walls", wallA: "Muro A", wallB: "Muro B", distance: 400 },
  chamferCtx,
);
assert.equal(
  chamferPreview.operations.filter((op) => op.type === "move").length,
  2,
  "chamfer trims both walls",
);
const chamferCreate = chamferPreview.operations.find(
  (op) => op.type === "create",
);
assert.equal(
  chamferCreate?.type,
  "create",
  "chamfer creates the diagonal segment",
);
if (chamferCreate?.type === "create") {
  assert.equal(
    Math.abs(chamferCreate.object.w - Math.round(Math.hypot(400, 400))) <= 1,
    true,
    "chamfer segment length is sqrt(2)·distance",
  );
}
const chamferTooBig = executeCadCommand(
  { id: "chamfer_walls", wallA: "Muro A", wallB: "Muro B", distance: 5000 },
  chamferCtx,
);
assert.equal(
  chamferTooBig.applied,
  false,
  "chamfer rejects distances that do not fit",
);

let history: CadCommandHistoryState = { undo: [], redo: [] };
history = pushHistory(
  history,
  createHistoryItem(parsed.input!, "applied", preview.summary, preview, {
    ...preview,
    applied: true,
    historyLabel: preview.summary,
  }),
);
const undone = undoHistory(history);
assert.equal(
  undone.item?.commandId,
  "create_clearance_aisle",
  "undo returns last command",
);
const redone = redoHistory(undone.state);
assert.equal(
  redone.item?.commandId,
  "create_clearance_aisle",
  "redo returns undone command",
);

// — Medición de regiones y zona envolvente (ADR §221) —
assert.equal(
  parseCadCommand("mide el área de la selección").input?.id,
  "measure_area",
  "parser recognizes area intent",
);
const areaOfTarget = parseCadCommand("mide el área de la zona Rack A1");
assert.equal(
  areaOfTarget.input?.id === "measure_area"
    ? areaOfTarget.input.targetLabel
    : undefined,
  "Rack A1",
  "parser captures the area target label",
);
const singleArea = previewCadCommand(
  { id: "measure_area", objectIds: ["rack-1"] },
  rackCtx,
);
const singleAreaReport = singleArea.operations.find(
  (op) => op.type === "report",
);
assert.equal(
  singleAreaReport?.type,
  "report",
  "single-object area emits a report",
);
if (singleAreaReport?.type === "report") {
  assert.equal(
    singleAreaReport.rows.some(
      (r) => r.label === "Área" && r.value.includes("1.08"),
    ),
    true,
    "1200×900 mm rack reports 1.08 m²",
  );
}
const hullArea = previewCadCommand(
  { id: "measure_area", objectIds: ["rack-1", "rack-2", "rack-3", "rack-4"] },
  rackCtx,
);
const hullReport = hullArea.operations.find((op) => op.type === "report");
if (hullReport?.type === "report") {
  assert.equal(
    hullReport.rows.some((r) => r.label.includes("casco convexo")),
    true,
    "multi-object area reports convex hull",
  );
}

assert.equal(
  parseCadCommand("crea una zona alrededor de la selección con margen de 800")
    .input?.id,
  "create_zone_around",
  "parser recognizes zone-around intent",
);
const zonePreview = previewCadCommand(
  { id: "create_zone_around", margin: 300, objectIds: ["rack-1", "rack-2"] },
  rackCtx,
);
const zoneOp = zonePreview.operations.find((op) => op.type === "create");
assert.equal(zoneOp?.type, "create", "zone-around proposes a create op");
if (zoneOp?.type === "create") {
  assert.equal(
    zoneOp.object.kind,
    "zone",
    "zone-around creates a fresh zone kind",
  );
  // racks 1-2: x 5000..6200, y 100..2100 → +300 de margen; arriba el margen
  // se recorta al borde del plano (100−300 → 0).
  assert.equal(zoneOp.object.x, 4700, "zone grows left by margin");
  assert.equal(zoneOp.object.w, 1800, "zone width covers group + margins");
  assert.equal(zoneOp.object.y, 0, "zone clamps to the footprint edge");
  assert.equal(
    zoneOp.object.h,
    2400,
    "zone height covers group + clipped margin",
  );
}
assert.equal(
  zonePreview.issues.some((i) => i.code === "zone_clipped"),
  true,
  "zone-around reports the clipped margin",
);
const emptyZone = executeCadCommand(
  { id: "create_zone_around", objectIds: [] },
  { ...rackCtx, selectedIds: [] },
);
assert.equal(emptyZone.applied, false, "zone-around requires a selection");

// — Auto-acotado (ADR §225) —
assert.equal(
  parseCadCommand("acota la selección").input?.id,
  "auto_dimension",
  "parser recognizes auto-dimension intent",
);
const dimParsed = parseCadCommand("acota los huecos entre racks");
assert.equal(
  dimParsed.input?.id === "auto_dimension" ? dimParsed.input.mode : undefined,
  "gaps",
  "parser reads gaps mode",
);
const dimPreview = previewCadCommand(
  { id: "auto_dimension", objectIds: ["rack-1", "rack-3"] },
  {
    ...rackCtx,
    objects: rackCtx.objects.map((o) =>
      o.id === "rack-3" ? { ...o, x: 7000, y: 100 } : o,
    ),
  },
);
// 2 objetos → 2 cotas de tamaño c/u + 1 de hueco (7000 − 6200 = 800)
assert.equal(
  dimPreview.operations.filter((op) => op.type === "annotate").length,
  5,
  "auto-dimension emits size dims per object plus the gap dim",
);
assert.equal(
  dimPreview.operations.some(
    (op) => op.type === "annotate" && op.annotation.text.includes("800"),
  ),
  true,
  "gap dim carries the 800 mm distance",
);
const dimSizeOnly = previewCadCommand(
  { id: "auto_dimension", mode: "size", objectIds: ["rack-1", "rack-2"] },
  rackCtx,
);
assert.equal(
  dimSizeOnly.operations.filter((op) => op.type === "annotate").length,
  4,
  "size mode emits only per-object dims",
);

// — Drafting por coordenadas precisas (Fase CAD 1) —
const wallDraftParsed = parseCadCommand("muro 0,0 @5000,0 espesor 120");
assert.equal(
  wallDraftParsed.input?.id,
  "draw_wall_segment",
  "parser recognizes coordinate wall drafting",
);
const wallDraftPreview = previewCadCommand(wallDraftParsed.input!, ctx);
const wallDraftCreate = wallDraftPreview.operations.find(
  (op) => op.type === "create",
);
assert.equal(
  wallDraftCreate?.type,
  "create",
  "coordinate wall emits a create op",
);
if (wallDraftCreate?.type === "create") {
  assert.equal(
    wallDraftCreate.object.kind,
    "wall",
    "coordinate wall creates wall asset",
  );
  assert.equal(
    wallDraftCreate.object.w,
    5000,
    "relative coordinate sets wall length",
  );
  assert.equal(wallDraftCreate.object.h, 120, "thickness is parsed");
}

const rectDraftParsed = parseCadCommand(
  "room 1000,1000 @4000,2500 etiqueta QA",
);
assert.equal(
  rectDraftParsed.input?.id,
  "draw_rect_zone",
  "parser recognizes coordinate room drafting",
);
const rectDraftPreview = previewCadCommand(rectDraftParsed.input!, ctx);
const rectDraftCreate = rectDraftPreview.operations.find(
  (op) => op.type === "create",
);
assert.equal(
  rectDraftCreate?.type,
  "create",
  "coordinate rect emits a create op",
);
if (rectDraftCreate?.type === "create") {
  assert.equal(
    rectDraftCreate.object.kind,
    "room",
    "room command creates room asset",
  );
  assert.equal(rectDraftCreate.object.x, 1000, "room x is absolute");
  assert.equal(rectDraftCreate.object.w, 4000, "relative room width is parsed");
  assert.equal(rectDraftCreate.object.label, "QA", "label is parsed");
}

// FILA/REPETIR (AXOS-CAD-ARRAY-001): repetición conversacional por nombre.
{
  const parsed = parseCadCommand(
    "repite la silla 3 veces cada 600 a la derecha",
  );
  assert.ok(parsed.ok, "repite parsea");
  assert.equal(
    parsed.input?.id,
    "array_rectangular",
    "repite → arreglo rectangular",
  );
  if (parsed.input?.id === "array_rectangular") {
    assert.equal(parsed.input.cols, 4, "3 repeticiones = 4 columnas");
    assert.equal(parsed.input.rows, 1, "fila horizontal");
    assert.equal(parsed.input.gapX, 600, "separación 'cada 600'");
    assert.equal(parsed.input.target, "silla", "objetivo por nombre");
  }
  const abajo = parseCadCommand("repite la mesa 2 veces hacia abajo");
  assert.equal(
    abajo.input?.id,
    "array_rectangular",
    "repite hacia abajo parsea",
  );
  if (abajo.input?.id === "array_rectangular") {
    assert.equal(abajo.input.rows, 3, "2 repeticiones hacia abajo = 3 filas");
    assert.equal(abajo.input.cols, 1, "columna única");
    assert.equal(abajo.input.target, "mesa", "objetivo hacia abajo");
  }
  const izq = parseCadCommand(
    "repite la silla 2 veces cada 100 a la izquierda",
  );
  assert.equal(izq.input?.id, "array_rectangular", "repite a la izquierda");
  if (izq.input?.id === "array_rectangular")
    assert.equal(izq.input.dirX, -1, "izquierda repite en negativo");
  const gridT = parseCadCommand("arreglo 2x3 de mesas");
  assert.equal(gridT.input?.id, "array_rectangular", "arreglo NxM parsea");
  if (gridT.input?.id === "array_rectangular")
    assert.equal(gridT.input.target, "mesas", "rejilla con objetivo por nombre");

  const sillasCtx: CadCommandContext = {
    unit: "mm",
    footprintW: 20000,
    footprintH: 10000,
    selectedIds: [],
    objects: [
      {
        id: "s1",
        type: "asset",
        kind: "chair",
        label: "Silla",
        x: 5000,
        y: 2000,
        w: 450,
        h: 450,
      },
    ],
  };
  const fila = previewCadCommand(
    { id: "array_rectangular", cols: 4, rows: 1, gapX: 600, target: "silla" },
    sillasCtx,
  );
  assert.ok(
    !fila.issues.some((i) => i.level === "error"),
    "fila por nombre sin errores",
  );
  const copias = fila.operations.filter((op) => op.type === "create");
  assert.equal(copias.length, 3, "repite crea 3 copias sin selección previa");
  if (copias[0]?.type === "create")
    assert.equal(
      copias[0].object.x,
      5000 + 450 + 600,
      "paso = ancho + separación",
    );
  const sinTal = previewCadCommand(
    { id: "array_rectangular", cols: 3, rows: 1, target: "tractor" },
    sillasCtx,
  );
  assert.ok(
    sinTal.issues.some((i) => i.code === "array_target_not_found"),
    "objetivo inexistente reporta error claro",
  );
}

// CAMBIAR TAMAÑO (AXOS-CAD-RESIZE-001): w×h exactos por nombre.
{
  const parsed = parseCadCommand("cambia el tamaño de la mesa a 1500x900");
  assert.ok(parsed.ok, "cambia el tamaño parsea");
  assert.equal(parsed.input?.id, "resize_object", "resize por nombre");
  if (parsed.input?.id === "resize_object") {
    assert.equal(parsed.input.w, 1500, "ancho del parser");
    assert.equal(parsed.input.h, 900, "alto del parser");
    assert.equal(parsed.input.target, "mesa", "objetivo del resize");
  }
  const sinDims = parseCadCommand("cambia el tamaño de la mesa");
  assert.equal(sinDims.ok, false, "sin dimensiones pide aclaración");

  const mesaCtx: CadCommandContext = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    selectedIds: [],
    objects: [
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa comedor",
        x: 3000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
  };
  const p = previewCadCommand(
    { id: "resize_object", target: "mesa", w: 1500, h: 900 },
    mesaCtx,
  );
  assert.ok(!p.issues.some((i) => i.level === "error"), "resize sin errores");
  const op = p.operations[0];
  assert.equal(op?.type, "move", "resize emite op move");
  if (op?.type === "move") {
    assert.equal(op.after.w, 1500, "ancho nuevo aplicado");
    assert.equal(op.after.h, 900, "alto nuevo aplicado");
    assert.equal(op.after.x, 3000, "posición x intacta");
    assert.equal(op.after.y, 2000, "posición y intacta");
  }
  const sinTal = previewCadCommand(
    { id: "resize_object", target: "piano", w: 1000, h: 1000 },
    mesaCtx,
  );
  assert.ok(
    sinTal.issues.some((i) => i.code === "resize_target_not_found"),
    "objetivo inexistente reporta error claro",
  );
}

// MOVER con ancla (AXOS-CAD-MOVE-003): 'mueve la silla junto a la mesa'.
{
  const parsed = parseCadCommand("mueve la silla junto a la mesa");
  assert.ok(parsed.ok, "mueve junto a parsea");
  assert.equal(parsed.input?.id, "move_selection", "sigue siendo move");
  if (parsed.input?.id === "move_selection") {
    assert.equal(parsed.input.target, "silla", "objetivo del move");
    assert.equal(parsed.input.anchor, "mesa", "ancla del move");
  }
  const izq = parseCadCommand("mueve la silla a la izquierda de la mesa");
  if (izq.input?.id === "move_selection")
    assert.equal(izq.input.anchorSide, "left", "lado izquierdo al mover");
  const rel = parseCadCommand("mueve la silla 500 a la derecha");
  if (rel.input?.id === "move_selection") {
    assert.equal(rel.input.dx, 500, "el relativo sigue igual");
    assert.equal(rel.input.anchor, undefined, "relativo no arrastra ancla");
  }

  const comedorCtx: CadCommandContext = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    selectedIds: [],
    objects: [
      {
        id: "s1",
        type: "asset",
        kind: "office-chair",
        label: "Silla",
        x: 500,
        y: 500,
        w: 500,
        h: 500,
      },
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa comedor",
        x: 4000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
  };
  const p = previewCadCommand(
    { id: "move_selection", target: "silla", anchor: "mesa" },
    comedorCtx,
  );
  assert.ok(!p.issues.some((i) => i.level === "error"), "move ancla sin errores");
  const op = p.operations[0];
  assert.equal(op?.type, "move", "emite op move");
  if (op?.type === "move") {
    assert.equal(op.after.x, 4000 + 1200 + 100, "aterriza a la derecha del ancla");
    assert.equal(op.after.y, 2000, "misma altura que el ancla");
  }
  const sinAncla = previewCadCommand(
    { id: "move_selection", target: "silla", anchor: "piano" },
    comedorCtx,
  );
  assert.ok(
    sinAncla.issues.some((i) => i.code === "move_anchor_not_found"),
    "ancla inexistente reporta error claro",
  );
}

// DISTRIBUIR con separación fija (AXOS-CAD-DIST-002): 'cada 800'.
{
  const parsed = parseCadCommand("distribuye las mesas cada 800");
  assert.ok(parsed.ok, "distribuye cada N parsea");
  assert.equal(parsed.input?.id, "distribute_selection", "sigue distribute");
  if (parsed.input?.id === "distribute_selection") {
    assert.equal(parsed.input.gap, 800, "separación fija del parser");
    assert.equal(parsed.input.target, "mesas", "objetivo sin 'cada N'");
  }
  const mesitasCtx: CadCommandContext = {
    unit: "mm",
    footprintW: 20000,
    footprintH: 10000,
    selectedIds: [],
    objects: [
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa 1",
        x: 1000,
        y: 1000,
        w: 900,
        h: 900,
      },
      {
        id: "m2",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa 2",
        x: 5000,
        y: 1000,
        w: 900,
        h: 900,
      },
    ],
  };
  const p = previewCadCommand(
    { id: "distribute_selection", axis: "horizontal", target: "mesa", gap: 800 },
    mesitasCtx,
  );
  assert.ok(
    !p.issues.some((i) => i.level === "error"),
    "gap fijo funciona con 2 objetos",
  );
  const second = p.operations.find(
    (op) => op.type === "move" && op.objectId === "m2",
  );
  if (second?.type === "move")
    assert.equal(second.after.x, 1000 + 900 + 800, "segunda a 800 del borde");
}

// ALINEAR con referencia (AXOS-CAD-ALIGN-002): 'alinea las sillas con la mesa'.
{
  const parsed = parseCadCommand("alinea las sillas con la mesa");
  assert.ok(parsed.ok, "alinea con parsea");
  assert.equal(parsed.input?.id, "align_selection", "sigue siendo align");
  if (parsed.input?.id === "align_selection") {
    assert.equal(parsed.input.target, "sillas", "objetivo del align");
    assert.equal(parsed.input.anchor, "mesa", "referencia del align");
    assert.equal(parsed.input.mode, "center", "modo default center");
  }
  const comedorCtx: CadCommandContext = {
    unit: "mm",
    footprintW: 10000,
    footprintH: 6000,
    selectedIds: [],
    objects: [
      {
        id: "s1",
        type: "asset",
        kind: "office-chair",
        label: "Silla",
        x: 500,
        y: 500,
        w: 500,
        h: 500,
      },
      {
        id: "m1",
        type: "asset",
        kind: "dining-table-4",
        label: "Mesa comedor",
        x: 4000,
        y: 2000,
        w: 1200,
        h: 1200,
      },
    ],
  };
  const p = previewCadCommand(
    { id: "align_selection", mode: "center", target: "silla", anchor: "mesa" },
    comedorCtx,
  );
  assert.ok(
    !p.issues.some((i) => i.level === "error"),
    "align con ancla funciona con 1 objeto",
  );
  const op = p.operations[0];
  if (op?.type === "move") {
    assert.equal(op.after.x, Math.round(4600 - 250), "centrada en x del ancla");
    assert.equal(op.after.y, 500, "y intacta en modo center");
  }
  const sinAncla = previewCadCommand(
    { id: "align_selection", mode: "center", target: "silla", anchor: "piano" },
    comedorCtx,
  );
  assert.ok(
    sinAncla.issues.some((i) => i.code === "align_anchor_not_found"),
    "referencia inexistente reporta error claro",
  );
}

console.log("cad command registry specs passed");
