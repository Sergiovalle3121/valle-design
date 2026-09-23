import assert from "node:assert/strict";
import {
  cadDocumentToLayout, parseCadDocument, replaceEditorProjection, serializeCadDocument,
  type CadDocument, type CadEntity,
} from "./cad-document";
import { cadDocumentToEditorSnapshot, editorSnapshotToCadDocument } from "./editor-snapshot";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { buildCadBimSchedule } from "./bim-schedule";
import { cadRoomAreaLabels } from "./onboarding/room-area-labels";
import { cadDrawingVisibleMetrics } from "./onboarding/drawing-visible-metrics";
import { cadDocumentNativeDxfPrimitives } from "./dxf-cad-document";
import { cadDocumentDxfExportLosses } from "./dxf-export-loss-manifest";
import { exportCadDxf } from "./dxf-export";
import { exportCadDocumentToDwg, preflightCadDwgExport } from "./dwg-native-writer";
import { cadRoomNameCommands, cadRoomSpaceAnchor, isCadRoomSpaceAnchor } from "./room-space";
import { CanonicalHistory } from "./canonical-history";
import { createDefaultRuleEngine } from "./rule-engine";

const wall = (id: string, a: [number, number], b: [number, number]): CadEntity => ({
  id, type: "wall", start: { x: a[0], y: a[1], z: 0 }, end: { x: b[0], y: b[1], z: 0 },
  thickness: 200, height: 2400, layer: "MURO",
});
const shell = (): CadEntity[] => [
  wall("sur", [0, 0], [4000, 0]), wall("este", [4000, 0], [4000, 3000]),
  wall("norte", [4000, 3000], [0, 3000]), wall("oeste", [0, 3000], [0, 0]),
];
const document = (entities: CadEntity[]): CadDocument => ({
  meta: { version: 1, schema: 10, unit: "mm" },
  layers: [
    { id: "0", name: "0", color: "#fff", visible: true, locked: false },
    { id: "MURO", name: "Muros", color: "#999", visible: true, locked: false },
  ],
  entities, history: [], modelSpace: { entityIds: entities.map((entity) => entity.id) },
  paperSpaces: [], styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [], constraints: [], externalReferences: [], unsupportedEntities: [],
  lossManifest: [], publications: [],
});

const before = document(shell());
const label = cadRoomAreaLabels(before)[0];
assert.equal(label.name, "Cuarto 1");
const named = executeCadEntityCommandBatch(before, cadRoomNameCommands(before, label, "Estudio", "space-1"), "room name").document;
const anchor = named.entities.find((entity) => entity.id === "space-1");
assert.ok(anchor && isCadRoomSpaceAnchor(anchor), "la identidad es un box de cuarto sin superficie");
assert.equal(anchor?.type, "box");
if (anchor?.type !== "box") throw new Error("Falta el espacio nombrado");
assert.equal(anchor.label, "Estudio", "usa el mismo campo label de las plantillas");
assert.equal(buildCadBimSchedule(named, "mm").rooms[0].axisArea, 12_000_000);
assert.equal(cadRoomAreaLabels(named)[0].name, "Estudio");
assert.equal(cadDrawingVisibleMetrics(named).rooms[0].name, "Estudio",
  "la lectura visible combinada de cuartos, vanos y cotas conserva el nombre editable");
const history = new CanonicalHistory(before);
history.checkpoint(named);
assert.equal(cadRoomAreaLabels(history.undo(named))[0].name, "Cuarto 1", "Deshacer revierte nombre y marcador juntos");
assert.equal(cadRoomAreaLabels(history.redo())[0].name, "Estudio", "Rehacer recupera el espacio nombrado");
const measuredBefore = buildCadBimSchedule(before, "mm");
const measuredNamed = buildCadBimSchedule(named, "mm");
assert.deepEqual(measuredNamed.walls, measuredBefore.walls, "nombrar no altera cómputos de muros");
assert.deepEqual(measuredNamed.openings, measuredBefore.openings, "nombrar no altera cómputos de vanos");
assert.deepEqual(
  measuredNamed.rooms.map(({ axisArea, clearArea, builtArea, wallShareArea, perimeter }) =>
    ({ axisArea, clearArea, builtArea, wallShareArea, perimeter })),
  measuredBefore.rooms.map(({ axisArea, clearArea, builtArea, wallShareArea, perimeter }) =>
    ({ axisArea, clearArea, builtArea, wallShareArea, perimeter })),
  "el nombre no inventa superficie ni volumen BIM",
);

const reopened = parseCadDocument(serializeCadDocument(named));
assert.equal(cadRoomAreaLabels(reopened)[0].name, "Estudio", "el nombre sobrevive al guardado y reapertura");
assert.equal(cadDocumentToEditorSnapshot(reopened).assets.length, 0, "el ancla no se dibuja como asset");
assert.equal(cadDocumentToLayout(reopened).assets.length, 0, "el adaptador legado no la convierte en rectángulo");
const reprojected = replaceEditorProjection(reopened, editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(reopened)));
assert.equal(cadRoomAreaLabels(reprojected)[0].name, "Estudio", "snapshot del editor no borra el ancla");
assert.equal(cadDocumentNativeDxfPrimitives(reopened).length, cadDocumentNativeDxfPrimitives(before).length,
  "exportar DXF no añade un rectángulo por el nombre");
const geometryOnly = { ...reopened, entities: reopened.entities.filter((entity) => !isCadRoomSpaceAnchor(entity)) };
assert.equal(
  exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(reopened) }).content,
  exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(geometryOnly) }).content,
  "los bytes DXF de la geometría previa son idénticos aunque se añada un nombre de espacio",
);
assert.ok(!cadDocumentDxfExportLosses(reopened).some((loss) => loss.entityId === "space-1"),
  "el marcador no declara una pérdida geométrica falsa en DXF/DWG");
const opened = document(named.entities.filter((entity) => entity.id !== "este"));
assert.deepEqual(cadRoomAreaLabels(opened), [],
  "abrir el contorno quita el rótulo de área aunque el nombre persista");
assert.equal(opened.entities.find((entity) => entity.id === "space-1")?.type, "box", "abrir conserva la identidad nominal");
assert.equal(cadRoomAreaLabels(document([...opened.entities, wall("este", [4000, 0], [4000, 3000])]))[0].name,
  "Estudio", "al cerrar de nuevo reaparece el mismo nombre persistido");

const concave = document([
  wall("a", [0, 0], [4000, 0]), wall("b", [4000, 0], [4000, 1000]),
  wall("c", [4000, 1000], [1000, 1000]), wall("d", [1000, 1000], [1000, 3000]),
  wall("e", [1000, 3000], [0, 3000]), wall("f", [0, 3000], [0, 0]),
  cadRoomSpaceAnchor("space-L", "Laboratorio", { x: 500, y: 2000 }),
]);
assert.equal(buildCadBimSchedule(concave, "mm").rooms[0].axisArea, 6_000_000,
  "el área de la cara cóncava viene sólo de los muros");
assert.equal(cadRoomAreaLabels(concave)[0].name, "Laboratorio");

const templateRoom: CadEntity = {
  id: "sala", type: "box", kind: "room", x: 100, y: 100, w: 3800, h: 2800,
  rotation: 0, layer: "0", shape: "rect", label: "Sala", tags: ["room", "use:living"],
};
const withTemplate = document([...shell(), templateRoom]);
assert.equal(cadRoomAreaLabels(withTemplate)[0].name, "Sala", "un espacio de plantilla nombra la cara de muros");
const renamedTemplate = executeCadEntityCommandBatch(
  withTemplate,
  cadRoomNameCommands(withTemplate, cadRoomAreaLabels(withTemplate)[0], "Biblioteca", "unused"),
  "room name",
).document;
assert.equal(renamedTemplate.entities.find((entity) => entity.id === "sala")?.type, "box");
assert.equal(cadRoomAreaLabels(renamedTemplate)[0].name, "Biblioteca");
assert.equal(renamedTemplate.entities.length, withTemplate.entities.length, "renombra el mismo box sin duplicarlo");

const drawing = document([{ id: "trazo", type: "line", start: { x: 0, y: 0, z: 0 },
  end: { x: 1000, y: 0, z: 0 }, layer: "0" }]);
const withAnchor = document([...drawing.entities, cadRoomSpaceAnchor("space-dwg", "Estudio", { x: 500, y: 100 })]);
assert.equal(
  exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(withAnchor) }).content,
  exportCadDxf({ primitives: cadDocumentNativeDxfPrimitives(drawing) }).content,
  "los bytes DXF de un documento sin renombrar son iguales con el ancla no geométrica",
);
assert.deepEqual(preflightCadDwgExport(withAnchor), preflightCadDwgExport(drawing),
  "el marcador nominal no figura como geometría ni pérdida DWG");
const gates = { publicWriterExists: true, externalOracleVerified: true };
const dwgBefore = exportCadDocumentToDwg(drawing, { betaFlagOn: true, gates });
const dwgAfter = exportCadDocumentToDwg(withAnchor, { betaFlagOn: true, gates });
assert.ok(dwgBefore.estado !== "rechazado" && dwgAfter.estado !== "rechazado");
assert.deepEqual(dwgAfter.manifiestoDePerdidas, dwgBefore.manifiestoDePerdidas,
  "el marcador nominal no añade una pérdida DWG");
assert.deepEqual(dwgAfter.bytes, dwgBefore.bytes, "el nombre de espacio no cambia los bytes DWG geométricos");
const rules = createDefaultRuleEngine({ footprint: { w: 5000, h: 4000 }, minClearance: 100 });
const markerInsideBox = document([...withTemplate.entities, cadRoomSpaceAnchor("space-rule", "Nave", { x: 300, y: 300 })]);
assert.deepEqual(rules.run(markerInsideBox), rules.run(withTemplate),
  "el ancla no aparece en choques, límites ni holguras de la validación geométrica");

const withText = document([...shell(), { id: "text-name", type: "text", x: 2000, y: 1500, text: "Oficina", layer: "0" }]);
const textRoom = cadRoomAreaLabels(withText)[0];
const renamedText = executeCadEntityCommandBatch(withText, cadRoomNameCommands(withText, textRoom, "Consultorio", "space-2"), "room name").document;
assert.equal(cadRoomAreaLabels(renamedText)[0].name, "Consultorio");
assert.equal(renamedText.entities.find((entity) => entity.id === "text-name")?.type, "text");
assert.equal((renamedText.entities.find((entity) => entity.id === "text-name") as Extract<CadEntity, {type:"text"}>).text, "Consultorio",
  "el texto visible y el nombre canónico no discrepan");

console.log("room-space.spec: plantilla, ancla, exportación, apertura y nombre OK");
