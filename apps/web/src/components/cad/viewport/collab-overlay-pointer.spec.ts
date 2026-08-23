import { strict as assert } from "node:assert";
import { cadCollabOverlayRootClass } from "./collab-overlay";

/*
 * EL CLIC TIENE QUE LLEGAR A LA CAPA CUANDO SE ESTÁ COLOCANDO.
 *
 * La capa de colaboración se dibuja encima del lienzo y alterna una sola cosa:
 * si se queda el ratón o lo deja pasar. Antes lo hacía CONCATENANDO
 * `pointer-events-auto` sobre una base que ya llevaba `pointer-events-none`, y
 * en el atributo `class` el orden no decide nada: decide el orden de las reglas
 * en la hoja de Tailwind, donde `pointer-events-none` gana.
 *
 * El efecto era invisible para cualquier aserción de dominio —la capa existía,
 * era visible, estaba donde tocaba y su `data-placing` decía «true»— y aun así
 * anclar un comentario sobre el plano NUNCA funcionó: el clic se lo quedaba el
 * lienzo de THREE. El golden 55 lo decía con todas sus letras
 * («<canvas … three.js r182> intercepts pointer events») y llevaba meses en
 * rojo sin que nadie lo leyera.
 *
 * Esta prueba es de una línea y no habría dejado que pasara.
 */

const idle = cadCollabOverlayRootClass(false);
const placing = cadCollabOverlayRootClass(true);

/** LA regla: nunca las dos utilidades a la vez, en ninguno de los dos estados. */
for (const [name, value] of [
  ["en reposo", idle],
  ["colocando", placing],
] as const) {
  const has = (utility: string) => value.split(/\s+/).includes(utility);
  assert.ok(
    !(has("pointer-events-none") && has("pointer-events-auto")),
    `${name}: las dos utilidades de pointer-events juntas — la hoja decide, no el atributo`,
  );
}

// En reposo la capa DEJA PASAR el ratón: si se lo quedara, no se podría dibujar
// con el editor abierto, que es peor que no poder anclar un comentario.
assert.ok(idle.split(/\s+/).includes("pointer-events-none"));
assert.ok(!idle.split(/\s+/).includes("pointer-events-auto"));

// Colocando SE LO QUEDA, que es justo lo que hace que la chincheta caiga donde
// se pincha, y enseña la cruz para decir que está esperando un punto.
assert.ok(placing.split(/\s+/).includes("pointer-events-auto"));
assert.ok(!placing.split(/\s+/).includes("pointer-events-none"));
assert.ok(placing.split(/\s+/).includes("cursor-crosshair"));

// Y lo que NO cambia entre los dos estados no puede cambiar: la capa sigue
// cubriendo el lienzo entero y en la misma altura de apilamiento.
for (const shared of ["absolute", "inset-0", "z-20", "overflow-hidden"]) {
  assert.ok(idle.includes(shared), `reposo conserva ${shared}`);
  assert.ok(placing.includes(shared), `colocando conserva ${shared}`);
}

console.log(
  "collab-overlay-pointer.spec: OK — la capa alterna pointer-events en vez de acumularlo",
);
