import { strict as assert } from "node:assert";
import type { CadDocument } from "@/lib/cad/cad-document";
import { DEMO_RECOVERY_STORAGE_KEY, DEMO_STORAGE_KEY } from "@/lib/cad/demo/demo-constants";
import { buildDemoDocument, createDemoDocumentPort } from "./demo-port";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function withOwnDrawing(): CadDocument {
  const document = buildDemoDocument();
  const entity = {
    id: "mi-trazo-viejo",
    type: "line" as const,
    start: { x: 10, y: 10, z: 0 },
    end: { x: 3000, y: 10, z: 0 },
    layer: "0",
  };
  return {
    ...document,
    entities: [...document.entities, entity],
    modelSpace: {
      ...document.modelSpace,
      entityIds: [...document.modelSpace.entityIds, entity.id],
    },
  };
}

async function run() {
const storage = memoryStorage();
const oldDocument = withOwnDrawing();
const oldRaw = JSON.stringify({ version: 9, document: oldDocument }); // sobre heredado, sin `edited`
storage.setItem(DEMO_STORAGE_KEY, oldRaw);

const port = createDemoDocumentPort(storage);
assert.equal(port.hasRecoverableDocument, true, "un dibujo de una visita anterior se ofrece");
const first = await port.open("demo-local");
const clean = first.cadDocument as CadDocument;
assert.equal(clean.entities.some(entity => entity.id === "mi-trazo-viejo"), false,
  "la nueva visita abre casa limpia, no la entidad heredada");
assert.equal(storage.getItem(DEMO_RECOVERY_STORAGE_KEY), oldRaw,
  "el sobre heredado queda archivado byte por byte antes de iniciar limpio");
assert.ok(storage.getItem(DEMO_STORAGE_KEY), "la clave histórica sigue activa");
assert.equal((await port.open("demo-local")).cadDocument, clean,
  "reabrir el mismo puerto no borra el dibujo de esta visita");

const thisVisit = {
  ...clean,
  entities: [...clean.entities, {
    id: "mi-trazo-nuevo",
    type: "line" as const,
    start: { x: 20, y: 20, z: 0 },
    end: { x: 4000, y: 20, z: 0 },
    layer: "0",
  }],
  modelSpace: {
    ...clean.modelSpace,
    entityIds: [...clean.modelSpace.entityIds, "mi-trazo-nuevo"],
  },
};
await port.saveContent("demo-local", thisVisit, Number(first.cadDocumentVersion));
assert.equal(port.currentDocument(), thisVisit,
  "«Compartir» manda el último dibujo que el editor guardó, no la casa de arranque");
assert.equal(port.restorePrevious(), true, "recuperar es una elección explícita");
const restored = (await port.open("demo-local")).cadDocument as CadDocument;
assert.equal(restored.entities.some(entity => entity.id === "mi-trazo-viejo"), true);
assert.equal(restored.entities.some(entity => entity.id === "mi-trazo-nuevo"), false);
assert.equal(storage.values.has(DEMO_STORAGE_KEY), true);
assert.equal([...storage.values.values()].some(raw => raw.includes("mi-trazo-nuevo")), true,
  "recuperar conserva también el dibujo iniciado en la visita actual");

const nextVisit = createDemoDocumentPort(storage);
assert.equal(nextVisit.hasRecoverableDocument, true);
assert.equal(((await nextVisit.open("demo-local")).cadDocument as CadDocument)
  .entities.some(entity => entity.id === "mi-trazo-viejo"), false,
  "hasta el dibujo recuperado vuelve a abrir limpio en otra visita");

const firstTimer = createDemoDocumentPort(memoryStorage());
assert.equal(firstTimer.hasRecoverableDocument, false);
assert.equal(firstTimer.currentDocument(), null, "antes de abrir no hay dibujo que compartir");
const untouched = await firstTimer.open("demo-local");
assert.ok((untouched.cadDocument as CadDocument).entities.length > 0,
  "la visita nueva conserva la casa habitación de arranque");

const damagedStorage = memoryStorage();
damagedStorage.setItem(DEMO_STORAGE_KEY, "{sobre antiguo roto");
await createDemoDocumentPort(damagedStorage).open("demo-local");
assert.equal(damagedStorage.getItem(DEMO_RECOVERY_STORAGE_KEY), "{sobre antiguo roto",
  "hasta un sobre ilegible se conserva byte por byte antes de reemplazarlo");

console.log("demo-port: visita limpia, archivo heredado, recuperación y nueva visita verificados");
}

void run();
