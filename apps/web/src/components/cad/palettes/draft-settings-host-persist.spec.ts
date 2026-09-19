/**
 * T9: las ayudas al dibujo se recuerdan entre sesiones.
 *
 * Comprueba que `CadDraftSettingsHost` persiste sus ajustes en `localStorage`
 * y los restaura al crear una nueva instancia.
 */
import { strict as assert } from "node:assert";

// Mock localStorage para Node (no existe fuera del navegador).
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

import { CadDraftSettingsHost } from "./draft-settings-host";

// --- Persistencia al mutar ---------------------------------------------------
{
  store.clear();
  const host = new CadDraftSettingsHost();
  host.setOrtho(true);
  host.setPolar(false);
  host.setPolarIncrement(30);
  host.setOsnap(false);
  host.setDynamicInput(false);

  const raw = store.get("valle_draft_settings");
  assert.ok(raw, "se guardó en localStorage");
  const saved = JSON.parse(raw);
  assert.equal(saved.ortho, true, "ortho persistido");
  assert.equal(saved.polar, false, "polar persistido");
  assert.equal(saved.polarStep, 30, "polarStep persistido");
  assert.equal(saved.osnap, false, "osnap persistido");
  assert.equal(saved.dynamicInput, false, "dynamicInput persistido");
}

// --- Restauración en nueva instancia -----------------------------------------
{
  const host2 = new CadDraftSettingsHost();
  assert.equal(host2.ortho, true, "ortho restaurado");
  assert.equal(host2.polar, false, "polar restaurado");
  assert.equal(host2.polarIncrement, 30, "polarStep restaurado");
  assert.equal(host2.osnap, false, "osnap restaurado");
  assert.equal(host2.dynamicInput, false, "dynamicInput restaurado");
}

// --- Defaults cuando no hay nada guardado ------------------------------------
{
  store.clear();
  const host3 = new CadDraftSettingsHost();
  assert.equal(host3.ortho, false, "ortho default: false");
  assert.equal(host3.polar, true, "polar default: true");
  assert.equal(host3.polarIncrement, 45, "polarStep default: 45");
  assert.equal(host3.osnap, true, "osnap default: true");
  assert.equal(host3.dynamicInput, true, "dynamicInput default: true");
}

// --- Datos corruptos no rompen la instancia ----------------------------------
{
  store.set("valle_draft_settings", "NOT JSON");
  const host4 = new CadDraftSettingsHost();
  assert.equal(host4.ortho, false, "corrupto: usa defaults");
}

console.log(
  "✅ draft-settings-host-persist.spec: T9 — persistencia de ayudas al dibujo (4 comprobaciones)",
);