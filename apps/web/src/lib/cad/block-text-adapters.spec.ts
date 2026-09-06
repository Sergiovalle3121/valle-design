/**
 * T-19·1 · `blockChildPaths` NO TESELA `wall` NI `opening`.
 *
 * `blockChildPaths` (Ola 3) conoce nueve tipos —line, circle, arc, ellipse,
 * spline, polyline, hatch, mtext, dimension, mleader— y devuelve `[]` para
 * todo lo demás. `wall` y `opening` (esquema 6/7, la entidad BIM del
 * producto) no están en esa lista: un bloque que los contenga dibuja NADA de
 * ellos. Antes de esta ficha `grep -rn blockChildPaths` no encontraba ninguna
 * spec que cubriera `wall` ni `opening` — este archivo es esa cobertura, y es
 * la razón medida por la que `cadDefineBlockCommands` (`block-workflow.ts`)
 * ahora se NIEGA a incluirlos en una definición en vez de dejarlos
 * invisibles.
 */
import assert from "node:assert/strict";
import type { CadEntity } from "./cad-document";
import { blockChildPaths } from "./block-text-adapters";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const muro: CadEntity = {
  id: "muro-1", type: "wall",
  start: { x: 0, y: 0, z: 0 }, end: { x: 3_000, y: 0, z: 0 },
  thickness: 200, height: 2_600, layer: "0",
} as CadEntity;

const hueco: CadEntity = {
  id: "hueco-1", type: "opening", kind: "door", hostId: "muro-1",
  position: 1_500, width: 900, height: 2_100, sill: 0,
  swing: "left", hinge: "start", layer: "0",
} as CadEntity;

ok(
  blockChildPaths(muro).length === 0,
  "un muro dentro de un bloque no produce NINGÚN trazo: blockChildPaths no lo conoce",
);
ok(
  blockChildPaths(hueco).length === 0,
  "y un hueco tampoco: las dos entidades BIM del producto son invisibles dentro de un bloque",
);

// El resto de la lista SÍ tesela algo, para que quede escrito qué es lo
// especial de `wall`/`opening` y no una degradación general del teselador.
const linea: CadEntity = {
  id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, layer: "0",
} as CadEntity;
ok(blockChildPaths(linea).length > 0, "una línea, en cambio, sí produce trazos");

console.log(
  `block-text-adapters.spec: ${checks} comprobaciones OK — wall y opening no se dibujan dentro de un bloque, que es por lo que BLOCK ahora se niega a incluirlos`,
);
