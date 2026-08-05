/** Elipses y arcos elípticos (VD-CAD-DEPTH-B2). */
import { strict as assert } from "node:assert";
import type { CadVec2 } from "./primitives";
import {
  ellipseArea,
  ellipseBounds,
  ellipsePerimeter,
  ellipsePoint,
  ellipseTessellate,
  type CadEllipse,
} from "./ellipse";

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadVec2, b: CadVec2): boolean {
  return near(a.x, b.x) && near(a.y, b.y);
}

const el: CadEllipse = { center: { x: 0, y: 0 }, rx: 10, ry: 5, rotation: 0 };

// --- puntos ----------------------------------------------------------------
assert.ok(pointNear(ellipsePoint(el, 0), { x: 10, y: 0 }), "t=0 → (rx,0)");
assert.ok(pointNear(ellipsePoint(el, 90), { x: 0, y: 5 }), "t=90 → (0,ry)");
assert.ok(pointNear(ellipsePoint(el, 180), { x: -10, y: 0 }), "t=180 → (-rx,0)");

// --- área y perímetro ------------------------------------------------------
assert.ok(near(ellipseArea(el), Math.PI * 50), "área = π·rx·ry");
const circle: CadEllipse = { center: { x: 0, y: 0 }, rx: 5, ry: 5, rotation: 0 };
assert.ok(near(ellipsePerimeter(circle), 2 * Math.PI * 5, 1e-4), "perímetro de círculo = 2πr (Ramanujan exacto)");
const per = ellipsePerimeter(el);
assert.ok(per > 2 * Math.PI * 5 && per < 2 * Math.PI * 10, "perímetro de elipse entre 2πb y 2πa");

// --- caja envolvente (alineada) --------------------------------------------
const bb = ellipseBounds(el);
assert.ok(near(bb.minX, -10) && near(bb.maxX, 10) && near(bb.minY, -5) && near(bb.maxY, 5), "caja de elipse alineada");

// --- elipse rotada 90° ------------------------------------------------------
const rot: CadEllipse = { center: { x: 0, y: 0 }, rx: 10, ry: 5, rotation: 90 };
assert.ok(pointNear(ellipsePoint(rot, 0), { x: 0, y: 10 }), "rotada 90°: t=0 → (0,rx)");
const rb = ellipseBounds(rot);
assert.ok(near(rb.maxX, 5) && near(rb.maxY, 10), "caja de la elipse rotada intercambia ejes");

// --- arco elíptico (cuarto 0..90) ------------------------------------------
const arc: CadEllipse = { center: { x: 0, y: 0 }, rx: 10, ry: 5, rotation: 0, startAngle: 0, endAngle: 90 };
assert.equal(ellipseArea(arc), 0, "un arco no encierra área");
const ab = ellipseBounds(arc);
assert.ok(near(ab.minX, 0, 1e-2) && near(ab.maxX, 10) && near(ab.minY, 0, 1e-2) && near(ab.maxY, 5), "caja del cuarto de elipse en el primer cuadrante");

// --- teselado --------------------------------------------------------------
assert.equal(ellipseTessellate(el, 16).length, 16, "elipse completa: N puntos (sin repetir el cierre)");
assert.equal(ellipseTessellate(arc, 8).length, 9, "arco: segments+1 puntos");
assert.ok(
  ellipseTessellate(circle, 24).every((p) => near(Math.hypot(p.x, p.y), 5, 1e-9)),
  "todos los vértices del círculo teselado están sobre el radio",
);

console.log("cad ellipse specs passed");
