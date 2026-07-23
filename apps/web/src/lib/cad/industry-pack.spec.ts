/** Framework de Industry Packs + dos objetos contrastantes (CAD-NEXT-090). */
import { strict as assert } from "node:assert";
import {
  createDefaultIndustryRegistry,
  IndustryPackRegistry,
  manufacturingPack,
  type SmartObjectInstance,
} from "./industry-pack";
import { layoutToCadDocument, cadDocumentToLayout, type CadEntity } from "./cad-document";

const registry = createDefaultIndustryRegistry();

// --- el registro carga los packs y los aplana ------------------------------
assert.equal(registry.listPacks().length, 5, "cinco packs cargados");
assert.deepEqual(
  registry.listObjects().map((o) => o.id),
  [
    "civil.parking-stall",
    "logistics.forklift-aisle",
    "logistics.pallet-rack",
    "mfg.workstation",
    "process.tank",
    "retail.checkout-lane",
    "retail.gondola",
  ],
  "objetos aplanados y ordenados por id",
);
assert.equal(registry.getObject("mfg.workstation")?.industry, "manufactura");
assert.equal(registry.getObject("civil.parking-stall")?.industry, "civil");
assert.equal(registry.getObject("logistics.pallet-rack")?.industry, "logistica");

// --- objeto 1: estación de trabajo → CAJA rectangular ----------------------
const ws: SmartObjectInstance = {
  id: "w1",
  objectId: "mfg.workstation",
  x: 100,
  y: 200,
  props: { width: 1500, depth: 800, cycleTimeSec: 45, name: "Ensamble" },
};
const wsEntities = registry.instantiate(ws);
assert.equal(wsEntities.length, 1, "la estación produce una entidad");
const wsBox = wsEntities[0];
assert.equal(wsBox.type, "box");
assert.ok(wsBox.type === "box" && wsBox.shape === "rect", "la estación es rectangular");
assert.ok(wsBox.type === "box" && wsBox.w === 1500 && wsBox.h === 800, "toma sus dimensiones");
assert.ok(wsBox.type === "box" && wsBox.label === "Ensamble", "conserva el nombre");
const wsCalc = registry.calculate(ws);
assert.equal(wsCalc.areaM2, 1.2, "área 1.5×0.8 = 1.2 m²");
assert.equal(wsCalc.throughputPerHour, 80, "3600/45 = 80 piezas/h");

// --- objeto 2: tanque de proceso → CÍRCULO real ----------------------------
const tank: SmartObjectInstance = {
  id: "t1",
  objectId: "process.tank",
  x: 0,
  y: 0,
  props: { diameter: 3000, heightM: 6, product: "Glicerina" },
};
const tankEntities = registry.instantiate(tank);
const tankBox = tankEntities[0];
assert.ok(tankBox.type === "box" && tankBox.shape === "circle", "el tanque es un círculo real");
assert.ok(tankBox.type === "box" && tankBox.w === tankBox.h, "diámetro = ancho = alto (redondo)");
assert.ok(tankBox.type === "box" && tankBox.label === "Tanque · Glicerina", "etiqueta con producto");
const tankCalc = registry.calculate(tank);
assert.equal(tankCalc.footprintM2, 7.07, "π·1.5² ≈ 7.07 m²");
assert.equal(tankCalc.volumeM3, 42.42, "7.07 × 6 = 42.42 m³");
assert.equal(tankCalc.capacityLiters, 42420, "capacidad en litros");

// --- UN SOLO documento sostiene ambas industrias ---------------------------
const entities: CadEntity[] = [...wsEntities, ...tankEntities];
const doc = layoutToCadDocument({
  assets: entities.map((e) => {
    if (e.type !== "box") throw new Error("fixture: sólo cajas");
    return { id: e.id, kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h, rotation: e.rotation, layer: e.layer, shape: e.shape, label: e.label };
  }),
});
const back = cadDocumentToLayout(doc);
assert.equal(back.assets.length, 2, "las dos industrias conviven en el mismo documento");
assert.equal(back.assets.find((a) => a.id === "t1")?.shape, "circle", "el tanque sigue redondo tras el round-trip");
assert.equal(back.assets.find((a) => a.id === "w1")?.shape, undefined, "la estación sigue rectangular");

// --- validación de dominio --------------------------------------------------
const badWs: SmartObjectInstance = { id: "w2", objectId: "mfg.workstation", x: 0, y: 0, props: { cycleTimeSec: 0, operators: -1 } };
const wsFindings = registry.validate(badWs);
assert.ok(wsFindings.some((f) => f.level === "warning"), "ciclo 0 → aviso");
assert.ok(wsFindings.some((f) => f.level === "error"), "operarios negativos → error");

const badTank: SmartObjectInstance = { id: "t2", objectId: "process.tank", x: 0, y: 0, props: { diameter: 0 } };
assert.ok(registry.validate(badTank).some((f) => f.level === "error"), "diámetro 0 → error");

// --- objeto 3: cajón de estacionamiento → regla normativa de accesibilidad --
const stall: SmartObjectInstance = { id: "p1", objectId: "civil.parking-stall", x: 0, y: 0, props: { width: 2500, length: 5000 } };
const stallBox = registry.instantiate(stall)[0];
assert.ok(stallBox.type === "box" && stallBox.w === 2500 && stallBox.h === 5000, "cajón rectangular con sus medidas");
assert.equal(registry.calculate(stall).areaM2, 12.5, "área 2.5×5 = 12.5 m²");
assert.equal(registry.validate(stall).length, 0, "cajón normal de 2500 mm es válido");
// Marcado como accesible pero con ancho de cajón normal → error normativo.
const narrowAccessible: SmartObjectInstance = { id: "p2", objectId: "civil.parking-stall", x: 0, y: 0, props: { width: 2500, accessible: 1 } };
assert.ok(registry.validate(narrowAccessible).some((f) => f.level === "error"), "cajón accesible angosto → error");
// Ancho por debajo del mínimo recomendado (no accesible) → aviso.
const narrow: SmartObjectInstance = { id: "p3", objectId: "civil.parking-stall", x: 0, y: 0, props: { width: 2000 } };
assert.ok(registry.validate(narrow).some((f) => f.level === "warning"), "ancho < 2400 mm → aviso");

// --- pack 4: logística — rack de pallets y pasillo normativo -----------------
const rack: SmartObjectInstance = { id: "r1", objectId: "logistics.pallet-rack", x: 0, y: 0, props: { length: 8400, depth: 1100, levels: 4 } };
const rackBox = registry.instantiate(rack)[0];
assert.ok(rackBox.type === "box" && rackBox.w === 8400 && rackBox.h === 1100, "rack con su huella");
const rackCalc = registry.calculate(rack);
assert.equal(rackCalc.slotsPerLevel, 6, "8400 / (1200+100) = 6 posiciones por nivel");
assert.equal(rackCalc.palletPositions, 24, "6 × 4 niveles = 24 pallets");
assert.equal(registry.validate(rack).length, 0, "rack estándar válido");
const shallowRack: SmartObjectInstance = { id: "r2", objectId: "logistics.pallet-rack", x: 0, y: 0, props: { depth: 800 } };
assert.ok(registry.validate(shallowRack).some((f) => f.level === "warning"), "fondo < pallet → aviso");
const tinyRack: SmartObjectInstance = { id: "r3", objectId: "logistics.pallet-rack", x: 0, y: 0, props: { length: 1000 } };
assert.ok(registry.validate(tinyRack).some((f) => f.level === "error"), "frente sin posiciones → error");

const aisle: SmartObjectInstance = { id: "pa1", objectId: "logistics.forklift-aisle", x: 0, y: 0, props: { width: 3500, length: 20000 } };
assert.equal(registry.calculate(aisle).areaM2, 70, "3.5 × 20 = 70 m²");
assert.equal(registry.validate(aisle).length, 0, "pasillo de 3500 mm cumple");
const narrowAisle: SmartObjectInstance = { id: "pa2", objectId: "logistics.forklift-aisle", x: 0, y: 0, props: { width: 2500 } };
assert.ok(registry.validate(narrowAisle).some((f) => f.level === "error"), "pasillo angosto → error normativo");

// --- pack 5: retail — góndola con facings y línea de cajas con fila ----------
const gondola: SmartObjectInstance = { id: "g1", objectId: "retail.gondola", x: 0, y: 0, props: { length: 3600, depth: 600, levels: 5, facingWidth: 300 } };
const gondolaBox = registry.instantiate(gondola)[0];
assert.ok(gondolaBox.type === "box" && gondolaBox.w === 3600 && gondolaBox.h === 600, "góndola con su huella");
const gondolaCalc = registry.calculate(gondola);
assert.equal(gondolaCalc.facingsPerLevel, 12, "3600 / 300 = 12 facings por nivel");
assert.equal(gondolaCalc.totalFacings, 60, "12 × 5 niveles = 60 facings");
assert.equal(registry.validate(gondola).length, 0, "góndola estándar válida");
const tinyGondola: SmartObjectInstance = { id: "g2", objectId: "retail.gondola", x: 0, y: 0, props: { length: 200, facingWidth: 300 } };
assert.ok(registry.validate(tinyGondola).some((f) => f.level === "error"), "frente sin facings → error");

const lane: SmartObjectInstance = { id: "c1", objectId: "retail.checkout-lane", x: 100, y: 100, props: { width: 1500, depth: 2400, queueSpace: 4000 } };
const laneEntities = registry.instantiate(lane);
assert.equal(laneEntities.length, 2, "la caja de cobro emite mueble + zona de fila");
const laneQueue = laneEntities.find((e) => e.id === "c1:queue");
assert.ok(laneQueue && laneQueue.type === "box" && laneQueue.kind === "zone", "la fila es una zona propia");
assert.ok(laneQueue && laneQueue.type === "box" && laneQueue.y === 100 + 2400 && laneQueue.h === 4000, "la fila queda detrás del mueble con su espacio");
const laneCalc = registry.calculate(lane);
assert.equal(laneCalc.shoppersInQueue, 6, "4000 / 600 = 6 clientes en fila");
assert.equal(registry.validate(lane).length, 0, "fila de 4000 mm cumple");
const shortLane: SmartObjectInstance = { id: "c2", objectId: "retail.checkout-lane", x: 0, y: 0, props: { queueSpace: 2000 } };
assert.ok(registry.validate(shortLane).some((f) => f.level === "warning"), "fila corta → aviso");

// --- objeto desconocido ------------------------------------------------------
const unknown: SmartObjectInstance = { id: "x", objectId: "nope", x: 0, y: 0, props: {} };
assert.deepEqual(registry.instantiate(unknown), [], "objeto desconocido no produce entidades");
assert.equal(registry.validate(unknown)[0]?.level, "error", "objeto desconocido → error de validación");

// --- defaults: props vacías toman el valor por defecto del campo -----------
const wsDefault: SmartObjectInstance = { id: "w3", objectId: "mfg.workstation", x: 0, y: 0, props: {} };
const wsDefaultBox = registry.instantiate(wsDefault)[0];
assert.ok(wsDefaultBox.type === "box" && wsDefaultBox.w === 1500, "sin props usa el ancho por defecto");

// --- registro: registrar dos veces reemplaza con aviso ----------------------
const r2 = new IndustryPackRegistry();
assert.equal(r2.register(manufacturingPack).replaced, false, "primer registro no reemplaza");
assert.equal(r2.register(manufacturingPack).replaced, true, "segundo registro del mismo pack reemplaza");

console.log("cad industry-pack specs passed");
