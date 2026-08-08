/**
 * Proyección 2D ortográfica (Ola 1 del plan de paridad).
 *
 * Dos cosas se prueban aquí y una de ellas es la razón de ser de toda la ola:
 *
 * 1. **La proyección es paralela.** Bajo la cámara en perspectiva actual, dos
 *    rectas paralelas del dibujo convergen en pantalla y su separación medida
 *    depende de dónde se mida. Ese es el defecto que impide una regla exacta,
 *    un grosor de línea estable y un ploteo WYSIWYG. Aquí se fija la propiedad
 *    contraria como invariante comprobable.
 * 2. **`pixelsPerUnit` es literalmente la escala.** Duplicarlo duplica la
 *    distancia medida en píxeles, sin excepciones y sin depender de la posición.
 *
 * Además se **fija la orientación actual del plano** (Y del dibujo hacia abajo)
 * antes de que ninguna cámara cambie. Voltearla es un cambio visible al usuario
 * y no debe colarse dentro de la migración a ortográfica.
 */
import { strict as assert } from "node:assert";
import type { CadPoint2 } from "../cad-document";
import {
  CAD_VIEW_MAX_PIXELS_PER_UNIT,
  CAD_VIEW_MIN_PIXELS_PER_UNIT,
  cadViewBounds,
  cadViewForPlotScale,
  cadViewFromViewport,
  cadViewLengthToPixels,
  cadViewPanByPixels,
  cadViewPixelsToLength,
  cadViewScreenToWorld,
  cadViewToleranceWorld,
  cadViewWorldToScreen,
  cadViewZoomAtCursor,
  cadViewZoomToBounds,
  clampPixelsPerUnit,
  type CadView,
} from "./cad-view";

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}
function pointNear(a: CadPoint2, b: CadPoint2, tol = 1e-9): boolean {
  return near(a.x, b.x, tol) && near(a.y, b.y, tol);
}
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const base = cadViewFromViewport(1600, 900, 5000, 3000, 0.08);

// --- centro y orientación -----------------------------------------------------
assert.ok(
  pointNear(cadViewWorldToScreen(base, { x: base.centerX, y: base.centerY }), { x: 800, y: 450 }),
  "el centro de la vista cae en el centro del lienzo",
);

// LA ORIENTACIÓN ACTUAL, fijada a propósito: la +Y del dibujo se ve hacia ABAJO.
// La cámara vive en `(tx, d, tz + 0.01)` con `up = (0,1,0)`, así que subir en
// pantalla va hacia −Z y, como la Y del dibujo mapea a Z, subir baja la Y.
assert.equal(base.yScreenSign, 1, "la vista por defecto reproduce el plano Y-abajo de hoy");
assert.ok(
  cadViewWorldToScreen(base, { x: base.centerX, y: base.centerY + 100 }).y >
    cadViewWorldToScreen(base, { x: base.centerX, y: base.centerY }).y,
  "más Y de dibujo = más abajo en pantalla (comportamiento vigente)",
);
// Y la convención de AutoCAD, disponible pero NO por defecto.
const yUp: CadView = { ...base, yScreenSign: -1 };
assert.ok(
  cadViewWorldToScreen(yUp, { x: yUp.centerX, y: yUp.centerY + 100 }).y <
    cadViewWorldToScreen(yUp, { x: yUp.centerX, y: yUp.centerY }).y,
  "con yScreenSign -1 la +Y sube, que es la convención de AutoCAD",
);
assert.ok(
  cadViewWorldToScreen(base, { x: base.centerX + 100, y: base.centerY }).x >
    cadViewWorldToScreen(base, { x: base.centerX, y: base.centerY }).x,
  "más X de dibujo = más a la derecha, en ambas convenciones",
);

// --- ida y vuelta -------------------------------------------------------------
{
  const random = lcg(20260808);
  const views: CadView[] = [
    base,
    yUp,
    { ...base, twistDeg: 30 },
    { ...base, twistDeg: -127.5, yScreenSign: -1 },
    cadViewFromViewport(320, 240, -1200, 4400, 12.5),
  ];
  let checked = 0;
  for (const view of views)
    for (let i = 0; i < 200; i += 1) {
      const point = {
        x: view.centerX + (random() - 0.5) * 40000,
        y: view.centerY + (random() - 0.5) * 40000,
      };
      const screen = cadViewWorldToScreen(view, point);
      const back = cadViewScreenToWorld(view, screen.x, screen.y);
      const magnitude = Math.max(1, Math.abs(point.x), Math.abs(point.y));
      assert.ok(pointNear(back, point, 1e-9 * magnitude), "mundo → pantalla → mundo es la identidad");
      checked += 1;
    }
  assert.equal(checked, 1000, "ida y vuelta comprobada en las cinco vistas");
}

// --- LA propiedad: la proyección es PARALELA ---------------------------------
// Es exactamente lo que la cámara en perspectiva no cumple hoy.
{
  const view = { ...base, twistDeg: 23 };
  // Dos rectas paralelas del dibujo, separadas 250 unidades.
  const a1 = { x: 1000, y: 1000 };
  const a2 = { x: 9000, y: 5000 };
  const b1 = { x: 1000, y: 1250 };
  const b2 = { x: 9000, y: 5250 };

  const sa1 = cadViewWorldToScreen(view, a1);
  const sa2 = cadViewWorldToScreen(view, a2);
  const sb1 = cadViewWorldToScreen(view, b1);
  const sb2 = cadViewWorldToScreen(view, b2);

  const angleA = Math.atan2(sa2.y - sa1.y, sa2.x - sa1.x);
  const angleB = Math.atan2(sb2.y - sb1.y, sb2.x - sb1.x);
  assert.ok(near(angleA, angleB, 1e-12), "dos paralelas del dibujo salen paralelas en pantalla");

  // Y su separación es la MISMA medida en cualquier extremo. Bajo perspectiva
  // esto es falso: es la definición de fuga.
  const separation = (p: CadPoint2, q: CadPoint2) => Math.hypot(q.x - p.x, q.y - p.y);
  const atStart = separation(sa1, sb1);
  const atEnd = separation(sa2, sb2);
  assert.ok(near(atStart, atEnd, 1e-9), "la separación no depende de dónde se mida");
  assert.ok(
    near(atStart, 250 * view.pixelsPerUnit, 1e-9),
    "y vale exactamente la distancia del dibujo por pixelsPerUnit",
  );
}

// --- pixelsPerUnit ES la escala ----------------------------------------------
{
  const measure = (view: CadView, p: CadPoint2, q: CadPoint2) => {
    const sp = cadViewWorldToScreen(view, p);
    const sq = cadViewWorldToScreen(view, q);
    return Math.hypot(sq.x - sp.x, sq.y - sp.y);
  };
  const p = { x: 2000, y: 2000 };
  const q = { x: 2000, y: 2010 };
  const atOne = measure(base, p, q);
  assert.ok(near(atOne, 10 * base.pixelsPerUnit), "10 unidades miden 10·ppu píxeles");

  const doubled: CadView = { ...base, pixelsPerUnit: base.pixelsPerUnit * 2 };
  assert.ok(near(measure(doubled, p, q), atOne * 2), "duplicar el zoom duplica la medida en píxeles");

  // Y da igual dónde esté el par en la pantalla: en perspectiva, no.
  const farCorner = { x: base.centerX + 9000, y: base.centerY + 5000 };
  const farCornerOffset = { x: farCorner.x, y: farCorner.y + 10 };
  assert.ok(
    near(measure(base, farCorner, farCornerOffset), atOne),
    "la misma longitud mide lo mismo en el borde que en el centro",
  );

  assert.ok(near(cadViewLengthToPixels(base, 10), atOne), "cadViewLengthToPixels coincide con la medida");
  assert.ok(near(cadViewPixelsToLength(base, atOne), 10), "y su inversa devuelve la longitud");
}

// --- límites visibles ---------------------------------------------------------
{
  const plain = cadViewBounds(base, 0);
  const halfW = base.widthPx / 2 / base.pixelsPerUnit;
  const halfH = base.heightPx / 2 / base.pixelsPerUnit;
  assert.ok(near(plain.minX, base.centerX - halfW, 1e-9), "borde izquierdo en forma cerrada");
  assert.ok(near(plain.maxX, base.centerX + halfW, 1e-9), "borde derecho");
  assert.ok(near(plain.minY, base.centerY - halfH, 1e-9), "borde inferior");
  assert.ok(near(plain.maxY, base.centerY + halfH, 1e-9), "borde superior");

  const padded = cadViewBounds(base, 0.12);
  assert.ok(padded.minX < plain.minX && padded.maxX > plain.maxX, "el overscan ensancha");
  assert.ok(
    near(padded.maxX - padded.minX, (plain.maxX - plain.minX) * 1.24, 1e-6),
    "el overscan del 12% añade ese margen a cada lado",
  );

  // Con giro la huella alineada a ejes crece: es un rectángulo rotado.
  const turned = cadViewBounds({ ...base, twistDeg: 45 }, 0);
  assert.ok(
    turned.maxX - turned.minX > plain.maxX - plain.minX,
    "una vista girada abarca más en X medido a ejes",
  );
}

// --- tolerancia de snap: una división, invariante de posición ----------------
{
  assert.ok(
    near(cadViewToleranceWorld(base, 10), 10 / base.pixelsPerUnit),
    "la tolerancia es apertura / pixelsPerUnit",
  );
  // Lo que hoy NO se cumple: acercarse cambia la relación píxel↔mundo.
  const closer: CadView = { ...base, pixelsPerUnit: base.pixelsPerUnit * 4 };
  assert.ok(
    near(cadViewToleranceWorld(closer, 10), cadViewToleranceWorld(base, 10) / 4),
    "al acercarse 4×, 10 píxeles cubren 4× menos mundo — exacto, no aproximado",
  );
}

// --- encuadre -----------------------------------------------------------------
{
  const target = { minX: 0, minY: 0, maxX: 20000, maxY: 2000 };
  const fitted = cadViewZoomToBounds(base, target, 0);
  assert.ok(near(fitted.centerX, 10000) && near(fitted.centerY, 1000), "el encuadre centra la caja");
  const visible = cadViewBounds(fitted, 0);
  assert.ok(
    visible.minX <= target.minX + 1e-6 && visible.maxX >= target.maxX - 1e-6,
    "la caja cabe entera en horizontal",
  );
  assert.ok(
    visible.minY <= target.minY + 1e-6 && visible.maxY >= target.maxY - 1e-6,
    "y en vertical",
  );
  // Manda el eje más apretado: 20000 de ancho en 1600 px.
  assert.ok(near(fitted.pixelsPerUnit, 1600 / 20000, 1e-12), "el ajuste lo fija el eje limitante");
}

// --- zoom con la rueda: el punto bajo el cursor no se mueve -------------------
{
  const random = lcg(4242);
  for (let i = 0; i < 100; i += 1) {
    const view: CadView = i % 2 === 0 ? base : { ...base, twistDeg: 41, yScreenSign: -1 };
    const px = random() * view.widthPx;
    const py = random() * view.heightPx;
    const anchor = cadViewScreenToWorld(view, px, py);
    const zoomed = cadViewZoomAtCursor(view, px, py, i % 3 === 0 ? 1.1 : 1 / 1.1);
    const after = cadViewScreenToWorld(zoomed, px, py);
    const magnitude = Math.max(1, Math.abs(anchor.x), Math.abs(anchor.y));
    assert.ok(
      pointNear(after, anchor, 1e-8 * magnitude),
      `el punto bajo el cursor sobrevive al zoom (caso ${i})`,
    );
  }
}

// --- desplazamiento -----------------------------------------------------------
{
  const moved = cadViewPanByPixels(base, 160, 0);
  assert.ok(
    near(moved.centerX, base.centerX - 160 / base.pixelsPerUnit),
    "arrastrar 160 px mueve el centro esos píxeles convertidos a unidades",
  );
  assert.ok(near(moved.centerY, base.centerY), "un arrastre horizontal no toca la Y");
}

// --- ZOOM nXP: el WYSIWYG de ploteo deja de ser una impresión -----------------
{
  // Dibujo en milímetros (1 unidad = 1 mm), pantalla a 96 ppp ⇒ 96/25.4 px/mm.
  const screenPxPerMm = 96 / 25.4;
  const plotted = cadViewForPlotScale(base, 50, 1, screenPxPerMm);
  // A 1:50, un metro de dibujo (1000 mm) mide 20 mm sobre el papel.
  assert.ok(
    near(cadViewLengthToPixels(plotted, 1000), 20 * screenPxPerMm, 1e-9),
    "a 1:50 un metro de dibujo ocupa 20 mm de pantalla",
  );
  assert.equal(cadViewForPlotScale(base, 0, 1, screenPxPerMm), base, "un denominador inválido no cambia la vista");
}

// --- barandillas --------------------------------------------------------------
assert.equal(clampPixelsPerUnit(0), CAD_VIEW_MIN_PIXELS_PER_UNIT, "un zoom nulo se lleva al mínimo");
assert.equal(clampPixelsPerUnit(-3), CAD_VIEW_MIN_PIXELS_PER_UNIT, "un zoom negativo también");
assert.equal(clampPixelsPerUnit(Number.NaN), CAD_VIEW_MIN_PIXELS_PER_UNIT, "y un NaN, en vez de propagarse");
assert.equal(clampPixelsPerUnit(1e12), CAD_VIEW_MAX_PIXELS_PER_UNIT, "por arriba se topa");
assert.equal(
  cadViewZoomAtCursor(base, 0, 0, 1e30).pixelsPerUnit,
  CAD_VIEW_MAX_PIXELS_PER_UNIT,
  "el zoom con rueda respeta el tope",
);

console.log("cad view projection specs passed");
