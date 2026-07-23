/** Mapeo de capas DXF → capas CAD por nombre (CAD-NEXT-063b). */
import { strict as assert } from "node:assert";
import { mapDxfLayerToCadLayer } from "./dxf-layer-map";

// --- arquitectura ------------------------------------------------------------
assert.equal(mapDxfLayerToCadLayer("MUROS"), "architecture", "MUROS → architecture");
assert.equal(mapDxfLayerToCadLayer("A-WALL"), "architecture", "A-WALL → architecture");
assert.equal(mapDxfLayerToCadLayer("Walls"), "architecture", "Walls → architecture");
assert.equal(mapDxfLayerToCadLayer("PUERTAS"), "architecture", "PUERTAS → architecture");

// --- estructura antes que arquitectura --------------------------------------
assert.equal(mapDxfLayerToCadLayer("COLUMNAS"), "structure", "COLUMNAS → structure");
assert.equal(mapDxfLayerToCadLayer("S-COLS"), "structure", "S-COLS → structure");
assert.equal(mapDxfLayerToCadLayer("Cimentacion"), "structure", "cimentación → structure");

// --- instalaciones (MEP) -----------------------------------------------------
assert.equal(mapDxfLayerToCadLayer("ELEC-POWER"), "utilities", "eléctrico → utilities");
assert.equal(mapDxfLayerToCadLayer("HIDRAULICA"), "utilities", "hidráulica → utilities");
assert.equal(mapDxfLayerToCadLayer("HVAC-DUCT"), "utilities", "HVAC → utilities");

// --- seguridad / protección civil -------------------------------------------
assert.equal(mapDxfLayerToCadLayer("EGRESS"), "safety", "egress → safety");
assert.equal(mapDxfLayerToCadLayer("SALIDAS-EMERGENCIA"), "safety", "salidas → safety");
assert.equal(mapDxfLayerToCadLayer("EXTINTORES"), "safety", "extintores → safety");

// --- cotas / ejes / anotación → measurements --------------------------------
assert.equal(mapDxfLayerToCadLayer("DIMS"), "measurements", "DIMS → measurements");
assert.equal(mapDxfLayerToCadLayer("EJES"), "measurements", "EJES → measurements");
assert.equal(mapDxfLayerToCadLayer("A-ANNO-TEXT"), "measurements", "anotación → measurements");

// --- vialidad / pasillos -----------------------------------------------------
assert.equal(mapDxfLayerToCadLayer("PASILLOS"), "aisles", "pasillos → aisles");

// --- equipo / mobiliario -----------------------------------------------------
assert.equal(mapDxfLayerToCadLayer("MOBILIARIO"), "equipment", "mobiliario → equipment");
assert.equal(mapDxfLayerToCadLayer("RACKS"), "equipment", "racks → equipment");

// --- fallback: nombre desconocido y capa 0 ----------------------------------
assert.equal(mapDxfLayerToCadLayer("XYZ123"), "layout", "nombre desconocido → fallback por defecto");
assert.equal(mapDxfLayerToCadLayer("XYZ123", "architecture"), "architecture", "respeta el fallback dado");
assert.equal(mapDxfLayerToCadLayer("0"), "layout", "la capa 0 (sin semántica) usa el fallback");
assert.equal(mapDxfLayerToCadLayer("0", "architecture"), "architecture", "capa 0 respeta el fallback de muros");
assert.equal(mapDxfLayerToCadLayer(undefined), "layout", "sin capa → fallback");
assert.equal(mapDxfLayerToCadLayer(""), "layout", "capa vacía → fallback");

// --- determinista: mismo nombre → misma capa --------------------------------
assert.equal(mapDxfLayerToCadLayer("A-WALL"), mapDxfLayerToCadLayer("a-wall"), "insensible a mayúsculas");

// --- prioridad estructura > arquitectura cuando ambos coinciden -------------
assert.equal(
  mapDxfLayerToCadLayer("MURO-ESTRUCTURAL"),
  "structure",
  "un muro estructural pesa como estructura (regla de mayor prioridad primero)",
);

console.log("cad dxf-layer-map specs passed");
