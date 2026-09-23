/**
 * Preajuste de ayudas del modo Esencial: una capa de sesión que NO se guarda.
 *
 * Es el contrato que el golden 228 mide en el navegador: con el preajuste
 * puesto sólo capturan extremo y medio, OTRACK y la entrada dinámica están
 * apagados, `valle_draft_settings` ni aparece ni cambia, los conmutadores del
 * usuario mutan la sesión y `setPreset(null)` devuelve la base de Pro intacta.
 *
 * Correr:  npx tsx src/components/cad/palettes/draft-settings-host-preset.spec.ts
 */
import { strict as assert } from "node:assert";

// Mock localStorage para Node, como en draft-settings-host-persist.spec.ts.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

import { SNAP_PRIORITY } from "@/lib/cad/snap-engine";
import {
  CAD_DRAFT_PRESET_ESENCIAL,
  CadDraftSettingsHost,
  defaultCadOsnapModes,
} from "./draft-settings-host";

const STORAGE_KEY = "valle_draft_settings";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/** Los modos encendidos, en orden del motor, para comparar de un vistazo. */
const encendidos = (host: CadDraftSettingsHost): string[] =>
  SNAP_PRIORITY.filter((mode) => host.snapModes()[mode] === true);

// --- el preajuste en sí ------------------------------------------------------
{
  const { modes } = CAD_DRAFT_PRESET_ESENCIAL;
  eq(Object.keys(modes).length, 14, "describe los catorce modos, el resto explícitamente apagado");
  eq(
    SNAP_PRIORITY.filter((mode) => modes[mode] === true),
    ["endpoint", "midpoint"],
    "sólo extremo y medio",
  );
  eq(modes.extension, false, "la prolongación infinita queda apagada");
  eq(modes.nearest, false, "y pegarse al segmento también");
  eq(CAD_DRAFT_PRESET_ESENCIAL.tracking, false, "OTRACK apagado");
  eq(CAD_DRAFT_PRESET_ESENCIAL.dynamicInput, false, "entrada dinámica apagada");
  ok(
    Object.isFrozen(CAD_DRAFT_PRESET_ESENCIAL) && Object.isFrozen(modes),
    "es una constante: nadie la muta por accidente",
  );
}

// --- entrar en el preajuste con la base de fábrica ---------------------------
{
  store.clear();
  const host = new CadDraftSettingsHost();
  host.setTrackingPoints([{ x: 1, y: 2 }]);
  eq(host.getSnapshot().acquiredTrackingPoints, 1, "Pro adquirió un punto");
  ok(!store.has(STORAGE_KEY), "adquirir puntos no escribe: no son un ajuste");
  eq(host.presetActive, false, "sin preajuste al arrancar");

  let avisos = 0;
  host.subscribe(() => {
    avisos += 1;
  });

  host.setPreset(CAD_DRAFT_PRESET_ESENCIAL);
  eq(host.presetActive, true, "preajuste puesto");
  ok(avisos >= 1, "la interfaz se entera");
  eq(Object.keys(host.snapModes()).length, 14, "snapModes() sigue describiendo los catorce");
  eq(encendidos(host), ["endpoint", "midpoint"], "sólo extremo y medio capturan");
  eq(host.objectSnapTracking, false, "OTRACK apagado en la ruta del puntero");
  eq(host.dynamicInput, false, "DYN apagado en la ruta del puntero");
  eq(host.getSnapshot().acquiredTrackingPoints, 0, "los puntos de Pro se sueltan al entrar");
  eq(
    SNAP_PRIORITY.filter((mode) => host.getSnapshot().osnapModes[mode]),
    ["endpoint", "midpoint"],
    "y la instantánea dice lo mismo que los getters",
  );
  eq(host.getSnapshot().objectSnapTracking, false, "instantánea: OTRACK apagado");
  eq(host.getSnapshot().dynamicInput, false, "instantánea: DYN apagado");
  ok(!store.has(STORAGE_KEY), "entrar en el preajuste NO escribe valle_draft_settings");

  const antes = host.getSnapshot();
  host.setPreset(CAD_DRAFT_PRESET_ESENCIAL);
  eq(host.getSnapshot(), antes, "repetir el mismo preajuste no republica");

  const forzado = host.snapModes(["center"]);
  eq(forzado.center, true, "un `CEN` tecleado sigue mandando sobre el preajuste");
  eq(forzado.endpoint, false, "y sólo a ese");

  // --- los conmutadores mutan la sesión, no la clave -------------------------
  host.toggleObjectSnapTracking();
  eq(host.objectSnapTracking, true, "F11 enciende OTRACK en sesión");
  eq(host.getSnapshot().objectSnapTracking, true, "y la barra de ayudas lo ve");
  ok(!store.has(STORAGE_KEY), "sin tocar valle_draft_settings");

  host.toggleDynamicInput();
  eq(host.dynamicInput, true, "F12 enciende DYN en sesión");
  ok(!store.has(STORAGE_KEY), "sin tocar valle_draft_settings");

  host.setOsnapMode("intersection", true);
  eq(encendidos(host), ["endpoint", "midpoint", "intersection"], "una casilla de DSETTINGS suma un modo");
  ok(!store.has(STORAGE_KEY), "sin tocar valle_draft_settings");

  host.setAllOsnapModes(false);
  eq(encendidos(host), [], "«ninguno» apaga los catorce");
  host.setAllOsnapModes(true);
  eq(encendidos(host).length, 14, "«todos» enciende los catorce");

  host.resetOsnapModes();
  eq(encendidos(host), ["endpoint", "midpoint"], "«Por defecto» con preajuste vuelve al preajuste, no a fábrica");
  ok(!store.has(STORAGE_KEY), "nada de esto escribió");

  // Ortho no forma parte del preajuste: cambia la base y SÍ se guarda, y lo
  // guardado lleva la base (13 modos, OTRACK y DYN encendidos), no el overlay.
  host.setOrtho(true);
  const guardado = JSON.parse(store.get(STORAGE_KEY) ?? "{}") as {
    ortho?: boolean;
    modes?: Record<string, boolean>;
    tracking?: boolean;
    dynamicInput?: boolean;
  };
  eq(guardado.ortho, true, "ortho sí se persiste con preajuste");
  eq(guardado.modes, defaultCadOsnapModes(), "pero los modos guardados son los de la base");
  eq(guardado.tracking, true, "OTRACK guardado = base");
  eq(guardado.dynamicInput, true, "DYN guardado = base");
  const raw = store.get(STORAGE_KEY);

  // --- salir: la base intacta --------------------------------------------------
  host.setPreset(null);
  eq(host.presetActive, false, "preajuste quitado");
  eq(host.snapModes(), defaultCadOsnapModes(), "Pro recupera sus 13 modos");
  eq(host.objectSnapTracking, true, "OTRACK vuelve a la base");
  eq(host.dynamicInput, true, "DYN vuelve a la base");
  eq(host.ortho, true, "lo que sí cambió en la base se queda");
  eq(store.get(STORAGE_KEY), raw, "salir tampoco escribe");

  const trasSalir = host.getSnapshot();
  host.setPreset(null);
  eq(host.getSnapshot(), trasSalir, "quitar dos veces no republica");

  // --- volver a entrar da el preajuste limpio ----------------------------------
  host.setPreset(CAD_DRAFT_PRESET_ESENCIAL);
  eq(host.objectSnapTracking, false, "las conmutaciones de la sesión anterior no sobreviven");
  eq(encendidos(host), ["endpoint", "midpoint"], "el reparto vuelve a ser el del preajuste");
  eq(store.get(STORAGE_KEY), raw, "y sigue sin escribir");
}

// --- una base personalizada no se contamina ----------------------------------
{
  store.clear();
  store.set(
    STORAGE_KEY,
    JSON.stringify({ modes: { intersection: false }, tracking: false, polarStep: 30 }),
  );
  const raw = store.get(STORAGE_KEY);
  const host = new CadDraftSettingsHost();
  eq(host.snapModes().intersection, false, "base: intersección apagada por el usuario");
  eq(host.objectSnapTracking, false, "base: OTRACK apagado por el usuario");

  host.setPreset(CAD_DRAFT_PRESET_ESENCIAL);
  eq(encendidos(host), ["endpoint", "midpoint"], "el preajuste manda mientras está puesto");
  host.toggleObjectSnapTracking();
  eq(host.objectSnapTracking, true, "conmutar en sesión");
  eq(store.get(STORAGE_KEY), raw, "la clave guardada no cambió ni un byte");

  host.setPreset(null);
  eq(host.snapModes().intersection, false, "vuelve la base del usuario, no la de fábrica");
  eq(host.snapModes().endpoint, true, "con lo que tenía encendido");
  eq(host.objectSnapTracking, false, "OTRACK como el usuario lo dejó");
  eq(host.polarIncrement, 30, "polar nunca entró en el juego");
  eq(store.get(STORAGE_KEY), raw, "y sigue sin cambiar");
}

// --- una instancia nueva no hereda el preajuste: nada se guardó ---------------
{
  store.clear();
  const anterior = new CadDraftSettingsHost();
  anterior.setPreset(CAD_DRAFT_PRESET_ESENCIAL);
  anterior.toggleObjectSnapTracking();
  const nuevo = new CadDraftSettingsHost();
  eq(nuevo.presetActive, false, "el preajuste es de la instancia, no del navegador");
  eq(nuevo.snapModes(), defaultCadOsnapModes(), "y arranca de fábrica");
  ok(!store.has(STORAGE_KEY), "sin rastro en localStorage");
}

console.log(`draft-settings-host-preset: ${checks}/${checks} comprobaciones verdes`);
