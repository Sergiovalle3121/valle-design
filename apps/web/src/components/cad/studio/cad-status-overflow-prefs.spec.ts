/**
 * Ola «estado»: qué avisos del desplegable «Más» fijó la persona en la fila
 * siempre visible. Sin navegador, como `cad-workspace.spec.ts` — un `Storage`
 * en memoria basta.
 *
 * Correr: node ../../node_modules/tsx/dist/cli.mjs
 *   src/components/cad/studio/cad-status-overflow-prefs.spec.ts
 * (desde apps/web).
 */
import assert from "node:assert/strict";
import {
  CAD_STATUS_OVERFLOW_ITEM_IDS,
  loadCadStatusOverflowPins,
  saveCadStatusOverflowPins,
  toggleCadStatusOverflowPin,
  type CadStatusOverflowStorage,
} from "./cad-status-overflow-prefs";

class MemoryStorage implements CadStatusOverflowStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

// ── Sin nada guardado: conjunto vacío, nunca lanza ──────────────────────────
{
  const storage = new MemoryStorage();
  const pins = loadCadStatusOverflowPins(storage);
  assert.equal(pins.size, 0);
}

// ── Guardar y releer: round-trip exacto ─────────────────────────────────────
{
  const storage = new MemoryStorage();
  saveCadStatusOverflowPins(storage, new Set(["connection", "safety"]));
  const pins = loadCadStatusOverflowPins(storage);
  assert.deepEqual([...pins].sort(), ["connection", "safety"]);
}

// ── Corrupto, ids desconocidos o forma inesperada: nunca lanza, cae a vacío ──
{
  const corrupto = new MemoryStorage();
  corrupto.setItem("valle_cad_status_pins:v1", "{not json");
  assert.equal(loadCadStatusOverflowPins(corrupto).size, 0);

  const formaRara = new MemoryStorage();
  formaRara.setItem("valle_cad_status_pins:v1", JSON.stringify({ no: "es un array" }));
  assert.equal(loadCadStatusOverflowPins(formaRara).size, 0);

  const idsViejos = new MemoryStorage();
  idsViejos.setItem(
    "valle_cad_status_pins:v1",
    JSON.stringify(["connection", "un-id-que-ya-no-existe", 42, null]),
  );
  assert.deepEqual([...loadCadStatusOverflowPins(idsViejos)], ["connection"]);
}

// ── Un `Storage` que lanza al escribir (cuota, modo privado) no rompe nada ──
{
  const storageQueLanza: CadStatusOverflowStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.doesNotThrow(() => saveCadStatusOverflowPins(storageQueLanza, new Set(["connection"])));
}

// ── Alternar: puro, no toca el almacenamiento ───────────────────────────────
{
  const vacio = new Set<(typeof CAD_STATUS_OVERFLOW_ITEM_IDS)[number]>();
  const conUno = toggleCadStatusOverflowPin(vacio, "grid-snap");
  assert.deepEqual([...conUno], ["grid-snap"]);
  assert.equal(vacio.size, 0, "el conjunto original no se muta");
  const sinNinguno = toggleCadStatusOverflowPin(conUno, "grid-snap");
  assert.equal(sinNinguno.size, 0);
}

// ── Los nueve ids son los nueve avisos que ya vivían en el desplegable ─────
{
  assert.equal(CAD_STATUS_OVERFLOW_ITEM_IDS.length, 9);
  assert.deepEqual(
    [...CAD_STATUS_OVERFLOW_ITEM_IDS].sort(),
    [
      "cad-validation",
      "clearances",
      "connection",
      "document-info",
      "dxf-warnings",
      "grid-snap",
      "safety",
      "snapshots",
      "validation",
    ].sort(),
  );
}

console.log("cad-status-overflow-prefs specs passed");
