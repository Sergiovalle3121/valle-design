/**
 * Spec de demo-volume: la demostración arranca con muros y vanos.
 *
 * Verifica que `buildDemoVolumeDocument` reemplaza el cascarón de la
 * plantilla por 9 muros y 5 vanos, conserva los muebles y rótulos, y
 * produce un documento determinista con historial de una sola entrada.
 */
import { strict as assert } from "node:assert";
import { buildCadTemplateDocument } from "../template-document";
import { buildDemoVolumeDocument } from "./demo-volume";
import { detectCadRooms } from "../bim-schedule";

const built = buildCadTemplateDocument("casa-habitacion");
const doc = buildDemoVolumeDocument(built.document);

// ── Conteo de entidades ─────────────────────────────────────────────────
const walls = doc.entities.filter((e) => e.type === "wall");
const openings = doc.entities.filter((e) => e.type === "opening");
const preserved = doc.entities.filter(
  (e) => e.type !== "wall" && e.type !== "opening",
);

assert.equal(walls.length, 9, "9 muros");
assert.equal(openings.length, 5, "5 vanos");
assert.equal(preserved.length, 11, "11 conservadas");
assert.equal(doc.entities.length, 25, "25 entidades en total");

// ── Orden: entityIds === entities.map(id) ───────────────────────────────
assert.deepEqual(
  doc.modelSpace.entityIds,
  doc.entities.map((e) => e.id),
  "modelSpace.entityIds idéntico en contenido y orden a entities",
);

// ── Historial ────────────────────────────────────────────────────────────
assert.equal(doc.history.length, 1, "una sola entrada de historial");

// ── Detección de habitaciones ────────────────────────────────────────────
const roomResult = detectCadRooms(walls);
assert.ok(roomResult.exteriorRing !== null, "exteriorRing detectado");
assert.equal(roomResult.exteriorRing!.length, 10, "exteriorRing con 10 puntos");

// ── Determinismo ─────────────────────────────────────────────────────────
const doc2 = buildDemoVolumeDocument(built.document);
assert.deepEqual(
  JSON.parse(JSON.stringify(doc)),
  JSON.parse(JSON.stringify(doc2)),
  "dos llamadas producen el mismo JSON",
);

// ── Vanos referencian muros existentes ───────────────────────────────────
const wallIds = new Set(walls.map((w) => w.id));
for (const opening of openings) {
  if (opening.type !== "opening") throw new Error("tipo");
  assert.ok(wallIds.has(opening.hostId), `vano ${opening.id} referencia muro existente`);
}

console.log(`✅ demo-volume: 25 entidades (9 muros, 5 vanos, 11 conservadas), exteriorRing 10 pts, determinista`);
