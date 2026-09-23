import { strict as assert } from "node:assert";
import {
  CAD_CLICK_SLACK_DRAWING_PX,
  CAD_CLICK_SLACK_PX,
  cadLocalPoint,
  cadPointerIsClick,
  cadPointerWorldTolerance,
} from "./pointer-geometry";

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

// ── Clic contra arrastre ─────────────────────────────────────────────────────
//
// El defecto que esto cierra, medido el 2026-09-22 contra producción: con un
// comando abierto, un clic que deslizaba 5 px o más se descartaba EN SILENCIO
// y el punto no llegaba nunca al motor. Quien dibuja con un ratón de mesa
// desliza esos píxeles sin darse cuenta.
{
  // Designando, el margen corto: arrastrar tiene significado propio.
  assert.equal(cadPointerIsClick(0, 0, false), true, "sin mover, es clic");
  assert.equal(cadPointerIsClick(3, 3, false), true, "4,2 px designando sigue siendo clic");
  assert.equal(cadPointerIsClick(6, 0, false), false, "6 px designando ya es arrastre");

  // Esperando punto, el margen ancho: perder el punto es peor que sobrarlo.
  assert.equal(cadPointerIsClick(6, 0, true), true, "6 px con comando abierto SÍ pone el punto");
  assert.equal(cadPointerIsClick(8, 8, true), true, "11,3 px con comando abierto todavía pone el punto");
  assert.equal(cadPointerIsClick(9, 9, true), false, "12,7 px ya es un desplazamiento querido");
  assert.equal(cadPointerIsClick(0, 12, true), false, "12 px exactos ya es arrastre");

  // Y el margen ancho es ESTRICTAMENTE mayor que el corto: si alguien los
  // iguala, esta prueba lo dice antes de que el usuario pierda un punto.
  assert.ok(
    CAD_CLICK_SLACK_DRAWING_PX > CAD_CLICK_SLACK_PX,
    "el margen con comando abierto tiene que ser más ancho que el de designar",
  );
}

console.log("✔ geometría de puntero: 12 aserciones verdes");
