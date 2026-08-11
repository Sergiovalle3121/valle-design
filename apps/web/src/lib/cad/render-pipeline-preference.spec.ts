import assert from "node:assert/strict";
import {
  CAD_RENDER_PIPELINE_DEFAULT,
  CAD_RENDER_PIPELINE_STORAGE_KEY,
  normalizeCadRenderPipeline,
  resolveCadRenderPipeline,
  storeCadRenderPipeline,
} from "./render-pipeline-preference";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

// ANCLA ABSOLUTA: el defecto del producto es el pipeline NUEVO. Si esta línea
// se cae, la ola volvió a dejar el módulo construido y apagado.
ok(CAD_RENDER_PIPELINE_DEFAULT === "batched", "el defecto es el pipeline por lotes");
ok(resolveCadRenderPipeline() === "batched", "sin fuentes, se resuelve a batched");
ok(
  resolveCadRenderPipeline({ storage: memoryStorage() }) === "batched",
  "almacenamiento vacío cae al defecto",
);

ok(normalizeCadRenderPipeline("legacy") === "legacy", "legacy se normaliza");
ok(normalizeCadRenderPipeline("batched") === "batched", "batched se normaliza");
ok(normalizeCadRenderPipeline("tiles") === null, "un valor desconocido se rechaza");
ok(normalizeCadRenderPipeline(undefined) === null, "undefined se rechaza");

// La preferencia guardada manda sobre el defecto.
ok(
  resolveCadRenderPipeline({
    storage: memoryStorage({ [CAD_RENDER_PIPELINE_STORAGE_KEY]: "legacy" }),
  }) === "legacy",
  "lo guardado gana al defecto",
);
// Y un valor corrupto guardado NO impide abrir el dibujo: cae al defecto.
ok(
  resolveCadRenderPipeline({
    storage: memoryStorage({ [CAD_RENDER_PIPELINE_STORAGE_KEY]: "{{roto" }),
  }) === "batched",
  "una preferencia corrupta cae al defecto",
);

// La URL gana a lo guardado, en las dos direcciones.
ok(
  resolveCadRenderPipeline({
    storage: memoryStorage({ [CAD_RENDER_PIPELINE_STORAGE_KEY]: "batched" }),
    search: "?cadRenderPipeline=legacy",
  }) === "legacy",
  "la URL fuerza legacy sobre una preferencia batched",
);
ok(
  resolveCadRenderPipeline({
    storage: memoryStorage({ [CAD_RENDER_PIPELINE_STORAGE_KEY]: "legacy" }),
    search: "cadRenderPipeline=batched",
  }) === "batched",
  "la URL fuerza batched sin el interrogante inicial",
);
ok(
  resolveCadRenderPipeline({
    storage: memoryStorage({ [CAD_RENDER_PIPELINE_STORAGE_KEY]: "legacy" }),
    search: "?cadRenderPipeline=nope",
  }) === "legacy",
  "un override ilegible no borra la preferencia guardada",
);

// Un almacenamiento que lanza —modo privado, cookies bloqueadas— no rompe nada.
const hostile = {
  getItem() {
    throw new Error("bloqueado");
  },
  setItem() {
    throw new Error("bloqueado");
  },
};
ok(
  resolveCadRenderPipeline({ storage: hostile }) === "batched",
  "un almacenamiento que lanza cae al defecto",
);
storeCadRenderPipeline(hostile, "legacy");
ok(true, "guardar en un almacenamiento que lanza no propaga la excepción");

const storage = memoryStorage();
storeCadRenderPipeline(storage, "legacy");
ok(
  storage.map.get(CAD_RENDER_PIPELINE_STORAGE_KEY) === "legacy",
  "la elección se persiste con la clave publicada",
);
storeCadRenderPipeline(null, "batched");
ok(true, "guardar sin almacenamiento es un no-op");

console.log(
  `render-pipeline-preference: ${checks} comprobaciones — defecto batched, precedencia URL > guardado > defecto, y ningún fallo de almacenamiento propaga.`,
);
