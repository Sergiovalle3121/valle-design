import assert from "node:assert/strict";
import { buildDemoDocument } from "../../../components/cad/document-lifecycle/demo-port";
import { cadEssentialRoomLabelIds } from "./essential-room-preview";

const document = buildDemoDocument();
const original = JSON.stringify(document);
const ids = cadEssentialRoomLabelIds(document);
assert.equal(ids.size, 6, "las seis habitaciones del demo tienen un TEXT fuente asociado");
for (const id of ids) {
  const source = document.entities.find((entity) => entity.id === id);
  assert.ok(source?.type === "text" || source?.type === "mtext", `${id} sigue siendo texto CAD persistido`);
}
assert.equal(JSON.stringify(document), original, "el cálculo de exclusiones no altera el documento ni sus exportaciones");
console.log("essential-room-preview.spec: seis TEXT persistidos; sólo se excluyen de la vista Esencial");
