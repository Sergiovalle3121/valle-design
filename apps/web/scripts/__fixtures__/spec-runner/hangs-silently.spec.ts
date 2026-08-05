/**
 * El falso verde: espera algo que nadie resolverá. El event loop se vacía,
 * Node sale con 0 y no imprime nada. Antes el runner lo marcaba ✅.
 */
import { strict as assert } from "node:assert";
void (async () => {
  assert.equal(1, 1);
  await new Promise<void>(() => {});
  console.log("inalcanzable");
})().catch(() => {
  process.exitCode = 1;
});
