/**
 * El eco del alias («L» → «LINE») sólo cuando lo tecleado abre una orden.
 *
 * La prueba de punta a punta —«Z», «E» sin «ERASE» en el diálogo; «C» que
 * cierra un LINE sin «CIRCLE»— está en `command-engine-host.spec.ts`. Aquí se
 * fija la regla sola, que es la misma que aplica el motor: libre, lo tecleado es
 * un comando; ocupado, sólo lo es un transparente con `'`.
 */
import { strict as assert } from "node:assert";
import { cadCommandAliasEcho } from "./command-echo";

const known = (name: string) => ["LINE", "CIRCLE", "ERASE", "ZOOM", "TRIM"].includes(name);

// --- motor libre: el alias abre su orden y se dice cuál -----------------------
assert.equal(cadCommandAliasEcho("L", false, known), "LINE");
assert.equal(cadCommandAliasEcho(" tr ", false, known), "TRIM", "sin distinguir mayúsculas ni espacios");
assert.equal(cadCommandAliasEcho("E", false, known), "ERASE");
assert.equal(cadCommandAliasEcho("C", false, known), "CIRCLE");
// El nombre completo no necesita eco: ya se lee en lo tecleado.
assert.equal(cadCommandAliasEcho("LINE", false, known), null);
// Un alias de una orden que el registro no tiene no se anuncia.
assert.equal(cadCommandAliasEcho("L", false, () => false), null);

// --- orden en curso: lo tecleado responde al prompt, no abre nada -------------
assert.equal(cadCommandAliasEcho("E", true, known), null, "la «E» de ZOOM es Extensión, no ERASE");
assert.equal(cadCommandAliasEcho("C", true, known), null, "la «C» de LINE es Cerrar, no CIRCLE");
assert.equal(cadCommandAliasEcho("L", true, known), null);

// --- el transparente sí abre una orden, con otra en curso o sin ella ----------
assert.equal(cadCommandAliasEcho("'Z", true, known), "ZOOM");
assert.equal(cadCommandAliasEcho("'z", false, known), "ZOOM");

console.log("cad command alias echo specs passed");
