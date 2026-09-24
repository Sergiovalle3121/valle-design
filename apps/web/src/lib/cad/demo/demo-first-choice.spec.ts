import { strict as assert } from "node:assert";
import { DEMO_STORAGE_KEY } from "./demo-constants";
import {
  DEMO_FIRST_CHOICE_STORAGE_KEY,
  DEMO_STARTING_CHOICES,
  readDemoFirstChoice,
  rememberDemoFirstChoice,
} from "./demo-first-choice";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
};

assert.deepEqual(DEMO_STARTING_CHOICES.map(({ id, label }) => [id, label]), [
  ["casa-habitacion", "Casa habitación"],
  ["departamento", "Departamento"],
  ["local-comercial", "Local comercial"],
  ["en-blanco", "En blanco"],
], "las cuatro elecciones de la primera visita son explícitas");
assert.equal(readDemoFirstChoice(storage), null, "la primera visita muestra el selector");

rememberDemoFirstChoice(storage, "en-blanco");
assert.equal(values.get(DEMO_FIRST_CHOICE_STORAGE_KEY), "en-blanco");
assert.equal(readDemoFirstChoice(storage), "en-blanco", "la siguiente visita no repite el selector");

values.clear();
values.set(DEMO_STORAGE_KEY, "{sobre heredado}");
assert.equal(readDemoFirstChoice(storage), "casa-habitacion",
  "quien ya dibujó antes conserva el arranque de casa y la recuperación voluntaria");

values.clear();
values.set(DEMO_FIRST_CHOICE_STORAGE_KEY, "valor-corrupto");
assert.equal(readDemoFirstChoice(storage), null,
  "una preferencia ajena no se interpreta como una plantilla arbitraria");
assert.equal(readDemoFirstChoice({ getItem: () => { throw new Error("bloqueado"); } }), null,
  "sin almacenamiento la visita puede elegir sin bloquear el editor");

console.log("demo-first-choice: cuatro tarjetas, primera visita, legado y almacenamiento bloqueado PASS");
