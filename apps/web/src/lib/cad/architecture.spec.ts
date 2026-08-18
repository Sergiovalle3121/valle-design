import { strict as assert } from "node:assert";
import {
  buildCadArchitectureTakeoff,
  defaultCadLayerForAssetKind,
  describeCadArchitectureObject,
  roomUseTypeFromTags,
} from "./architecture";

assert.equal(
  defaultCadLayerForAssetKind("wall"),
  "architecture",
  "walls default to the Architecture layer",
);
assert.equal(
  defaultCadLayerForAssetKind("column"),
  "structure",
  "columns default to the Structure layer",
);
assert.equal(
  defaultCadLayerForAssetKind("power_panel"),
  "utilities",
  "utility fixtures default to the Utilities layer",
);
assert.equal(
  defaultCadLayerForAssetKind("room", "use:quality, dept:qa"),
  "architecture",
  "rooms default to the Architecture layer",
);

assert.equal(
  roomUseTypeFromTags("room, use:smt"),
  "smt",
  "room use tags are parsed",
);
assert.equal(
  roomUseTypeFromTags("cuarto, calidad"),
  "quality",
  "Spanish quality tags are parsed",
);

// ── Vocabulario de arquitectura (B2) ──
//
// El producto nació distribuyendo líneas de producción y su lista de usos de
// local no tenía recámara, baño ni cocina. Estas aserciones fijan las dos
// mitades del trato: el arquitecto puede clasificar sus locales, y el documento
// que alguien guardó con `use:smt` sigue clasificándose igual.

for (const [tags, esperado] of [
  ["room, use:recamara", "recamara"],
  ["room, use:recámara", "recamara"],
  ["room, use:bano", "bano"],
  ["room, use:baño", "bano"],
  ["room, use:medio-bano", "medio-bano"],
  ["room, use:cocina", "cocina"],
  ["room, use:sala", "sala"],
  ["room, use:comedor", "comedor"],
  ["room, use:estudio", "estudio"],
  ["room, use:cochera", "cochera"],
  ["room, use:garage", "cochera"],
  ["room, use:patio", "patio"],
  ["room, use:jardin", "jardin"],
  ["room, use:azotea", "azotea"],
  ["room, use:pasillo", "pasillo"],
  ["room, use:vestibulo", "vestibulo"],
  ["room, use:bodega", "bodega"],
  ["room, use:servicio", "cuarto-servicio"],
  ["room, use:lavado", "lavado"],
] as const)
  assert.equal(
    roomUseTypeFromTags(tags),
    esperado,
    `el local ${esperado} se clasifica desde ${tags}`,
  );

// Sin etiqueta explícita se adivina por el NOMBRE, con o sin acentos.
assert.equal(
  roomUseTypeFromTags("room", "Recámara principal"),
  "recamara",
  "el nombre del local basta para clasificarlo",
);
assert.equal(
  roomUseTypeFromTags("room", "Medio baño de visitas"),
  "medio-bano",
  "medio baño no se confunde con baño completo",
);
assert.equal(
  roomUseTypeFromTags("room", "Cuarto de lavado"),
  "lavado",
  "el cuarto de lavado se distingue del de servicio",
);
// Y lo industrial NO se pierde: un documento guardado con use:smt sigue
// abriendo clasificado, y el departamento por defecto sigue saliendo de él.
for (const [tags, esperado] of [
  ["room, use:smt", "smt"],
  ["room, use:quality", "quality"],
  ["room, use:warehouse", "warehouse"],
  ["room, use:packing", "packing"],
  ["room, use:shipping", "shipping"],
  ["room, use:ehs", "ehs"],
  ["room, use:office", "office"],
] as const)
  assert.equal(
    roomUseTypeFromTags(tags),
    esperado,
    `el uso industrial ${esperado} se conserva`,
  );

// El local sin clasificar avisa CON VOCABULARIO DE ARQUITECTO: sugerir
// `use:smt` a quien dibuja una casa era pedirle que hablara nuestro idioma.
const sinUso = describeCadArchitectureObject({
  id: "r9",
  kind: "room",
  label: "",
  x: 0,
  y: 0,
  width: 3000,
  height: 3000,
  layerId: "architecture",
  tags: "room",
});
assert.equal(sinUso?.roomUse, "unclassified", "un local sin pistas no se inventa");
assert.ok(
  sinUso?.warnings.some((warning) => warning.includes("use:recamara")),
  "el aviso sugiere locales de vivienda",
);
assert.ok(
  !sinUso?.warnings.some((warning) => warning.includes("use:smt")),
  "el aviso ya no sugiere vocabulario de fábrica",
);

const recamara = describeCadArchitectureObject({
  id: "r10",
  kind: "room",
  label: "Recámara 1",
  x: 0,
  y: 0,
  width: 3200,
  height: 3600,
  layerId: "architecture",
  tags: "room, use:recamara",
});
assert.equal(recamara?.roomUse, "recamara", "la recámara se clasifica");
assert.equal(
  recamara?.department,
  "Recámara",
  "el departamento por defecto usa la etiqueta en español",
);
assert.equal(recamara?.warnings.length, 0, "una recámara bien puesta no avisa");

const wall = describeCadArchitectureObject({
  id: "w1",
  kind: "wall",
  label: "North wall",
  x: 0,
  y: 0,
  width: 6000,
  height: 150,
  layerId: "architecture",
});
assert.equal(wall?.role, "wall", "wall role is detected");
assert.equal(wall?.length, 6000, "wall length uses the long side");
assert.equal(wall?.thickness, 150, "wall thickness uses the short side");

const room = describeCadArchitectureObject({
  id: "r1",
  kind: "room",
  label: "Quality lab",
  x: 0,
  y: 0,
  width: 5000,
  height: 4000,
  layerId: "architecture",
  tags: "room, use:quality, dept:qa",
});
assert.equal(room?.role, "room", "room role is detected");
assert.equal(room?.roomUse, "quality", "room use is exposed");
assert.equal(room?.department, "QA", "department tag is exposed");

const takeoff = buildCadArchitectureTakeoff({
  unit: "mm",
  footprintArea: 100_000_000,
  layers: [
    { id: "layout", label: "Layout" },
    { id: "architecture", label: "Architecture" },
    { id: "structure", label: "Structure" },
    { id: "utilities", label: "Utilities" },
  ],
  stations: [
    { id: "st1", kind: "station", x: 0, y: 0, width: 2000, height: 1000, layerId: "layout" },
  ],
  assets: [
    { id: "w1", kind: "wall", x: 0, y: 0, width: 6000, height: 150, layerId: "architecture" },
    { id: "c1", kind: "column", x: 0, y: 0, width: 400, height: 400, layerId: "structure" },
    { id: "d1", kind: "door", x: 0, y: 0, width: 1000, height: 120, layerId: "architecture" },
    { id: "r1", kind: "room", label: "SMT room", x: 0, y: 0, width: 9000, height: 5000, tags: "room, use:smt", layerId: "architecture" },
    { id: "u1", kind: "power_panel", x: 0, y: 0, width: 800, height: 350, layerId: "utilities" },
  ],
});

assert.equal(takeoff.wallCount, 1, "wall count is computed");
assert.equal(takeoff.columnCount, 1, "column count is computed");
assert.equal(takeoff.doorCount, 1, "door count is computed");
assert.equal(takeoff.roomCount, 1, "room count is computed");
assert.equal(takeoff.utilityCount, 1, "utility count is computed");
assert.equal(takeoff.wallLength, 6000, "wall length is totaled");
assert.equal(takeoff.byRoomUse[0]?.key, "smt", "room area is grouped by use");
assert.ok(
  takeoff.byLayer.some((layer) => layer.key === "architecture"),
  "architecture layer area is reported",
);

// Capa por biblioteca de símbolos (VD-CAD-LAYER-001): los símbolos
// universales aterrizan en su capa real, no todos en Equipos.
assert.equal(
  defaultCadLayerForAssetKind("door-90"),
  "architecture",
  "puerta universal → capa de arquitectura",
);
assert.equal(
  defaultCadLayerForAssetKind("stairs-straight"),
  "architecture",
  "escalera → capa de arquitectura",
);
assert.equal(
  defaultCadLayerForAssetKind("conveyor"),
  "flow",
  "conveyor → capa de flujo",
);
assert.equal(
  defaultCadLayerForAssetKind("sofa-3"),
  "equipment",
  "mobiliario → equipment",
);
assert.equal(
  defaultCadLayerForAssetKind("sofa-3", "safety"),
  "safety",
  "los tags especiales siguen ganando a la biblioteca",
);

console.log("cad architecture specs passed");
