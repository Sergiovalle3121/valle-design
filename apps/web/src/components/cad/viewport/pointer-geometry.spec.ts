import { strict as assert } from "node:assert";
import { cadLocalPoint, cadPointerWorldTolerance } from "./pointer-geometry";

// --- el punto local resta el origen del lienzo, no el de la ventana ---------
{
  const p = cadLocalPoint(
    { clientX: 130, clientY: 90 },
    { getBoundingClientRect: () => ({ left: 30, top: 20 }) },
  );
  assert.deepEqual(p, { x: 100, y: 70 }, "el punto es relativo al lienzo");
}

// --- los topes de la apertura, que son lo que de verdad se rompe ------------
{
  // Huella diminuta: sin suelo, la tolerancia colapsaría a cero y no se podría
  // designar nada.
  const min = cadPointerWorldTolerance(5, { W: 1, H: 1 }, (_px, lo) => lo);
  assert.ok(min >= 0.01, `el suelo evita una apertura nula; dio ${min}`);

  // Huella enorme: sin techo, la apertura se comería medio plano.
  const max = cadPointerWorldTolerance(5, { W: 1_000_000, H: 1_000_000 }, (_px, _lo, hi) => hi);
  assert.ok(max <= 1_000_000 * 0.02 + 1e-9, "el techo acota la apertura");

  // Y en el caso normal la conversión es la del controlador, sin tocarla.
  const normal = cadPointerWorldTolerance(8, { W: 10_000, H: 6_000 }, (px) => px * 3);
  assert.equal(normal, 24, "la conversión la hace el controlador de vista");
}

console.log("✔ geometría de puntero: 4 aserciones verdes");
