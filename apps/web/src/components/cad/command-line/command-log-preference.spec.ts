/**
 * La reducción de F2, sin navegador: plegar/desplegar el registro y que la
 * elección sobreviva a la recarga.
 *
 * Correr: npx tsx src/components/cad/command-line/command-log-preference.spec.ts
 */
import assert from "node:assert/strict";
import {
  CAD_COMMAND_LOG_STORAGE_KEY,
  readCommandLogExpanded,
  toggleCommandLogExpanded,
  writeCommandLogExpanded,
} from "./command-log-preference";

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

// ANCLA ABSOLUTA: sin nada guardado, el registro nace PLEGADO. Si esta línea
// se cae, el registro vuelve a comerse el lienzo por defecto.
ok(readCommandLogExpanded(undefined) === false, "sin almacenamiento, plegado");
ok(readCommandLogExpanded(memoryStorage()) === false, "almacenamiento vacío, plegado");
ok(
  readCommandLogExpanded(memoryStorage({ [CAD_COMMAND_LOG_STORAGE_KEY]: "basura" })) === false,
  "un valor que no es \"1\" se lee como plegado",
);

// F2 invierte lo que había — sin depender de nada más.
ok(toggleCommandLogExpanded(false) === true, "F2 sobre plegado despliega");
ok(toggleCommandLogExpanded(true) === false, "F2 sobre desplegado pliega");

// «Sobrevive a la recarga»: escribir y volver a leer, como una pestaña nueva.
{
  const storage = memoryStorage();
  ok(readCommandLogExpanded(storage) === false, "recién abierto, plegado");
  writeCommandLogExpanded(storage, true);
  ok(
    storage.map.get(CAD_COMMAND_LOG_STORAGE_KEY) === "1",
    "F2 guarda con la clave publicada",
  );
  // Aquí es donde una recarga real perdería todo estado de React: sólo queda
  // lo que haya en `storage`, así que releerlo ES la prueba de que sobrevive.
  ok(readCommandLogExpanded(storage) === true, "tras \"recargar\", sigue desplegado");
  writeCommandLogExpanded(storage, false);
  ok(readCommandLogExpanded(storage) === false, "y F2 otra vez lo vuelve a plegar, persistido");
}

// Un almacenamiento que lanza —modo privado, cookies bloqueadas— no rompe nada.
const hostile: { getItem(): never; setItem(): never } = {
  getItem() {
    throw new Error("bloqueado");
  },
  setItem() {
    throw new Error("bloqueado");
  },
};
ok(readCommandLogExpanded(hostile) === false, "un almacenamiento que lanza cae a plegado");
writeCommandLogExpanded(hostile, true);
ok(true, "guardar en un almacenamiento que lanza no propaga la excepción");
writeCommandLogExpanded(null, true);
ok(true, "guardar sin almacenamiento es un no-op");

console.log(
  `command-log-preference: ${checks} comprobaciones — defecto plegado, F2 invierte, la elección persiste y ningún fallo de almacenamiento propaga.`,
);
