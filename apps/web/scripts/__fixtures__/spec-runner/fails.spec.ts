/** Fallo normal: la aserción revienta y el proceso sale distinto de 0. */
import { strict as assert } from "node:assert";
assert.equal(1, 2, "el fixture falla a propósito");
