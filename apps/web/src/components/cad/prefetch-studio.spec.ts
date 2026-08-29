/**
 * La regla de cortesía de la precarga: cuándo NO se gasta la red de otro.
 *
 * Se prueba `shouldPrefetchCadStudio` y no `prefetchCadStudio` porque la
 * decisión es toda la lógica: lo demás es `requestIdleCallback` y un `import()`
 * que este entorno no puede ejercitar sin navegador. La decisión sí se puede
 * fijar, y es la parte que se rompe en silencio — nadie nota que se dejó de
 * respetar `saveData` hasta que un usuario con datos medidos se queja.
 *
 * Correr:  npx tsx src/components/cad/prefetch-studio.spec.ts
 */
import { strict as assert } from "node:assert";
import { shouldPrefetchCadStudio } from "./prefetch-studio";

// Sin información de red: adelante. Es el caso de la mayoría de los escritorios
// y de Safari entero; tratarlo como «no» dejaría la mejora sin efecto donde más
// se usa el producto.
assert.equal(shouldPrefetchCadStudio(undefined), true);
assert.equal(shouldPrefetchCadStudio({}), true);

// El usuario pidió ahorrar datos. No se discute.
assert.equal(shouldPrefetchCadStudio({ saveData: true }), false);
assert.equal(
  shouldPrefetchCadStudio({ saveData: true, effectiveType: "4g" }),
  false,
  "saveData manda aunque la conexión sea buena",
);

// En 2G, precargar compite con lo que se está usando y empeora la página.
assert.equal(shouldPrefetchCadStudio({ effectiveType: "2g" }), false);
assert.equal(shouldPrefetchCadStudio({ effectiveType: "slow-2g" }), false);

// 3G ya aguanta: es exactamente el caso —conexión mediocre— donde adelantar el
// editor más se nota.
assert.equal(shouldPrefetchCadStudio({ effectiveType: "3g" }), true);
assert.equal(shouldPrefetchCadStudio({ effectiveType: "4g" }), true);

console.log("precarga del estudio: 8/8");
