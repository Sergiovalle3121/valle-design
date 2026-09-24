import { strict as assert } from "node:assert";
import {
  DEMO_SHARE_STORAGE_KEY,
  documentSignature,
  forgetStoredDemoShare,
  isDemoShareToken,
  readStoredDemoShare,
} from "./demo-share-repository";

/**
 * Lo que el navegador recuerda del enlace temporal de la demostración: sólo
 * mientras vive, y con una huella que decide si reutilizarlo.
 */
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

const NOW = Date.parse("2026-09-24T12:00:00Z");
const share = {
  shareToken: "vdds_lectura",
  manageToken: "vddm_gestion",
  expiresAt: "2026-10-01T12:00:00Z",
  signature: documentSignature('{"entities":[]}'),
};

const storage = memoryStorage();
assert.equal(readStoredDemoShare(storage, NOW), null, "sin enlace guardado no hay nada que leer");

storage.setItem(DEMO_SHARE_STORAGE_KEY, JSON.stringify(share));
assert.deepEqual(readStoredDemoShare(storage, NOW), share, "un enlace vigente se recuerda tal cual");

assert.equal(
  readStoredDemoShare(storage, Date.parse("2026-10-01T12:00:01Z")),
  null,
  "caducado no se ofrece",
);
assert.equal(storage.values.has(DEMO_SHARE_STORAGE_KEY), false, "y al leerlo caducado se olvida");

storage.setItem(DEMO_SHARE_STORAGE_KEY, "{roto");
assert.equal(readStoredDemoShare(storage, NOW), null, "un sobre ilegible no tumba el botón");

storage.setItem(DEMO_SHARE_STORAGE_KEY, JSON.stringify({ ...share, manageToken: 7 }));
assert.equal(readStoredDemoShare(storage, NOW), null, "sin token de gestión no se puede borrar ni reclamar");

storage.setItem(DEMO_SHARE_STORAGE_KEY, JSON.stringify(share));
forgetStoredDemoShare(storage);
assert.equal(storage.values.size, 0, "olvidar borra la única clave");

assert.equal(documentSignature("abc"), documentSignature("abc"), "la huella es estable");
assert.notEqual(documentSignature('{"a":1}'), documentSignature('{"a":2}'), "un cambio de dibujo cambia la huella");

assert.equal(isDemoShareToken("vdds_x"), true);
assert.equal(isDemoShareToken("vdrl_x"), false, "un review link no es un enlace de la demostración");

console.log("demo-share-repository: vigencia, olvido y huella verificados");
