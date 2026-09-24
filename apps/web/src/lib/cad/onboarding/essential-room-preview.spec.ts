import assert from "node:assert/strict";
import { buildDemoDocument } from "../../../components/cad/document-lifecycle/demo-port";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { cadRoomNameCommands } from "../room-space";
import { cadRoomAreaLabels } from "./room-area-labels";
import { cadEssentialRoomAssetLabelIds, cadEssentialRoomLabelIds } from "./essential-room-preview";

const document = buildDemoDocument();
const original = JSON.stringify(document);
const ids = cadEssentialRoomLabelIds(document);
assert.equal(ids.size, 6, "las seis habitaciones del demo tienen un TEXT fuente asociado");
for (const id of ids) {
  const source = document.entities.find((entity) => entity.id === id);
  assert.ok(source?.type === "text" || source?.type === "mtext", `${id} sigue siendo texto CAD persistido`);
}
assert.equal(JSON.stringify(document), original, "el cálculo de exclusiones no altera el documento ni sus exportaciones");
const salaAt = cadRoomAreaLabels(document).find((room) => room.name === "SALA")?.at;
assert.ok(salaAt, "el demo contiene una sala medida por muros");
const withTemplate = {
  ...document,
  entities: [...document.entities, {
    id: "tpl-room-sala", type: "box" as const, kind: "room", label: "SALA",
    x: salaAt.x - 50, y: salaAt.y - 50, w: 100, h: 100,
    rotation: 0, layer: "0", shape: "rect" as const,
  }],
  modelSpace: { ...document.modelSpace, entityIds: [...document.modelSpace.entityIds, "tpl-room-sala"] },
};
const sala = cadRoomAreaLabels(withTemplate).find((room) => room.name === "SALA" && room.spaceId === "tpl-room-sala");
assert.ok(sala?.spaceId && sala.textLabelId, "la sala tiene asset de plantilla y TEXT CAD distintos");
assert.ok(cadEssentialRoomAssetLabelIds(withTemplate).has(sala.spaceId),
  "Esencial oculta el sprite del asset de plantilla cuando hay un badge de área real");
const openTemplate = {
  ...withTemplate,
  entities: withTemplate.entities.filter((entity) => entity.type !== "wall"),
};
assert.equal(cadEssentialRoomAssetLabelIds(openTemplate).size, 0,
  "sin recinto medido, la etiqueta del asset de plantilla sigue visible");
const renamed = executeCadEntityCommandBatch(withTemplate,
  cadRoomNameCommands(withTemplate, sala, "Biblioteca", "space-sala-visual"), "rename room").document;
assert.equal(cadRoomAreaLabels(renamed).find((room) => room.id === sala.id)?.name, "Biblioteca");
assert.ok(cadEssentialRoomAssetLabelIds(renamed).has(sala.spaceId),
  "la etiqueta original de la plantilla sigue oculta tras renombrar sin mutar su box");
assert.ok(cadEssentialRoomLabelIds(renamed).has(sala.textLabelId),
  "el TEXT original sigue oculto en Esencial aun si el nombre visible cambia");
assert.equal(JSON.stringify(document), original, "renombrar no muta ni sobrescribe la plantilla original");
console.log("essential-room-preview.spec: TEXT y sprite de plantilla excluidos sólo en Esencial, aun tras renombrar");
