/**
 * La geometría y el ajuste de una imagen adjunta contra papel (Ola H).
 *
 *   - Una imagen de 1000 × 500 px a 2 unidades por píxel, insertada en
 *     (100, 200): esquinas (100,200) (2100,200) (2100,1200) (100,1200); el
 *     píxel (250, 125) cae en (600, 450) y vuelve; girada 90° gira todo.
 *   - Un recorte tecleado en el plano vuelve a píxeles exactos, y una
 *     imagen sin área (U ∥ V) devuelve `null` en vez de dividir por cero.
 *   - Brillo 50 / contraste 50 dejan cada canal como está; contraste 0
 *     aplana a gris medio; brillo 100 sube 1 entero (todo blanco); la
 *     atenuación 25 es opacidad 0,75.
 *   - Qué URI se puede pintar: `data:image/png` sí, `asset://` no, un
 *     `https://…/plano.jpg` sí, un `https://…/plano.pdf` no.
 */
import { strict as assert } from "node:assert";
import type { CadImageEntity } from "./cad-entities-v4";
import {
  cadImageAdjust,
  cadImageAdjustLut,
  cadImageClipFromWorld,
  cadImageClipWorld,
  cadImageCorners,
  cadImageEmbeddedBytes,
  cadImageFileName,
  cadImageIsEmbedded,
  cadImageIsMirrored,
  cadImageIsNeutral,
  cadImageIsRaster,
  cadImageIsSkewed,
  cadImageOpacity,
  cadImagePixelPolygon,
  cadImagePixelToWorld,
  cadImagePolygonArea,
  cadImageRotationDeg,
  cadImageUnitsPerPixel,
  cadImageVisiblePolygon,
  cadImageWorldToPixel,
} from "./image-geometry";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

const image: CadImageEntity = {
  id: "i1",
  type: "image",
  definition: "d1",
  insertion: { x: 100, y: 200, z: 0 },
  uVector: { x: 2, y: 0, z: 0 },
  vVector: { x: 0, y: 2, z: 0 },
  size: { width: 1000, height: 500 },
  layer: "0",
};

/* ── Esquinas y píxeles ─────────────────────────────────────────────────── */
{
  eq(cadImageCorners(image), [{ x: 100, y: 200 }, { x: 2100, y: 200 }, { x: 2100, y: 1200 }, { x: 100, y: 1200 }], "las cuatro esquinas: inserción, +U, +U+V, +V");
  eq(cadImagePixelToWorld(image, 250, 125), { x: 600, y: 450 }, "el píxel (250, 125) a 2 unidades por píxel");
  eq(cadImageWorldToPixel(image, { x: 600, y: 450 }), { x: 250, y: 125 }, "y vuelve");
  eq(cadImageUnitsPerPixel(image), 2, "dos unidades por píxel");
  eq(cadImageRotationDeg(image), 0, "sin giro");
  ok(!cadImageIsSkewed(image) && !cadImageIsMirrored(image), "ni sesgada ni reflejada");
  eq(cadImagePixelPolygon(image), [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }], "sin recorte, el polígono en píxeles es el rectángulo entero");
  eq(cadImageClipWorld(image), null, "sin recorte");
  eq(cadImageVisiblePolygon(image), cadImageCorners(image), "lo visible es el rectángulo");

  const rotated: CadImageEntity = { ...image, uVector: { x: 0, y: 2, z: 0 }, vVector: { x: -2, y: 0, z: 0 } };
  eq(cadImageCorners(rotated), [{ x: 100, y: 200 }, { x: 100, y: 2200 }, { x: -900, y: 2200 }, { x: -900, y: 200 }], "girada 90°: U apunta a +Y y V a −X");
  ok(near(cadImageRotationDeg(rotated), 90), "90 grados");
  const back = cadImageWorldToPixel(rotated, cadImagePixelToWorld(rotated, 333, 77))!;
  ok(near(back.x, 333) && near(back.y, 77), "ida y vuelta con giro");
  ok(!cadImageIsMirrored(rotated), "girar no refleja");
  const mirrored: CadImageEntity = { ...image, vVector: { x: 0, y: -2, z: 0 } };
  ok(cadImageIsMirrored(mirrored), "V hacia −Y con U hacia +X: reflejada");
  const skewed: CadImageEntity = { ...image, vVector: { x: 1, y: 2, z: 0 } };
  ok(cadImageIsSkewed(skewed), "U y V no perpendiculares: sesgada");
}

/* ── El recorte ─────────────────────────────────────────────────────────── */
{
  const clip = cadImageClipFromWorld(image, [{ x: 300, y: 400 }, { x: 1100, y: 400 }, { x: 700, y: 1000 }])!;
  eq(clip, [{ x: 100, y: 100, z: 0 }, { x: 500, y: 100, z: 0 }, { x: 300, y: 400, z: 0 }], "el triángulo tecleado en el plano, en píxeles");
  const clipped: CadImageEntity = { ...image, clipBoundary: clip };
  eq(cadImageClipWorld(clipped), [{ x: 300, y: 400 }, { x: 1100, y: 400 }, { x: 700, y: 1000 }], "y de vuelta al plano, exacto");
  eq(cadImageVisiblePolygon(clipped).length, 3, "lo visible es el recorte");
  eq(cadImagePixelPolygon(clipped), [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 300, y: 400 }], "el polígono en píxeles es el recorte");
  eq(cadImagePolygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]), 6, "área con signo: antihorario positivo");
  eq(cadImagePolygonArea([{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 4, y: 0 }]), -6, "horario negativo");
  const flat: CadImageEntity = { ...image, vVector: { x: 4, y: 0, z: 0 } };
  eq(cadImageWorldToPixel(flat, { x: 500, y: 200 }), null, "U paralelo a V: sin píxel");
  eq(cadImageClipFromWorld(flat, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), null, "y sin recorte posible");
}

/* ── El ajuste ──────────────────────────────────────────────────────────── */
{
  ok(near(cadImageAdjust(0.3), 0.3) && near(cadImageAdjust(0.9, 50, 50), 0.9), "50/50 es neutro");
  ok(near(cadImageAdjust(0.1, 50, 0), 0.5) && near(cadImageAdjust(0.9, 50, 0), 0.5), "contraste 0 aplana a gris medio");
  ok(near(cadImageAdjust(0.75, 50, 100), 1) && near(cadImageAdjust(0.25, 50, 100), 0), "contraste 100 dobla la pendiente y satura");
  ok(near(cadImageAdjust(0.2, 100, 50), 1) && near(cadImageAdjust(0.2, 0, 50), 0), "brillo 100 es blanco y brillo 0 es negro");
  ok(near(cadImageAdjust(0.5, 75, 50), 1) && near(cadImageAdjust(0.5, 25, 50), 0), "brillo 75 sube medio: el gris medio queda blanco");
  ok(near(cadImageAdjust(0.4, 50, 75), 0.35), "contraste 75: pendiente 1,5 alrededor del medio");
  ok(near(cadImageAdjust(0.4, Number.NaN, 50), 0), "un brillo que no es número cae al mínimo, no a NaN");
  const lut = cadImageAdjustLut(50, 50);
  ok(lut.length === 256 && lut[0] === 0 && lut[128] === 128 && lut[255] === 255, "la tabla neutra es la identidad");
  const flatLut = cadImageAdjustLut(50, 0);
  ok(flatLut[0] === 128 && flatLut[255] === 128, "la tabla a contraste 0 es gris");
  ok(near(cadImageOpacity(25), 0.75) && cadImageOpacity() === 1 && cadImageOpacity(100) === 0 && cadImageOpacity(140) === 0, "la atenuación es opacidad, acotada");
  ok(cadImageIsNeutral(image) && cadImageIsNeutral({ brightness: 50, contrast: 50, fade: 0 }) && !cadImageIsNeutral({ fade: 10 }), "neutro sólo sin ajuste");
}

/* ── Qué se puede pintar ────────────────────────────────────────────────── */
{
  const png = { uri: "data:image/png;base64,iVBORw0KGgo=", name: "plano.png" };
  ok(cadImageIsRaster(png) && cadImageIsEmbedded(png), "un data:image/png se pinta y viaja dentro");
  ok(cadImageIsRaster({ uri: "https://ejemplo.mx/planos/plano.JPG?v=2" }), "un https a JPG se pinta");
  ok(!cadImageIsRaster({ uri: "https://ejemplo.mx/planos/plano.pdf" }), "un PDF no");
  ok(!cadImageIsRaster({ uri: "asset://tenant/plano.png" }), "un asset:// sin resolver no");
  ok(!cadImageIsRaster({ uri: "data:application/pdf;base64,AAAA" }), "un data: que no es imagen no");
  eq(cadImageFileName(png), "plano.png", "el nombre del archivo");
  eq(cadImageFileName({ uri: "data:image/jpeg;base64,/9j/", name: "" }), "imagen.jpg", "sin nombre, uno por el tipo");
  eq(cadImageFileName({ uri: "https://ejemplo.mx/planos/plano.png", name: "" }), "plano.png", "de la ruta");
  eq(cadImageEmbeddedBytes({ uri: "data:image/png;base64,AAAAAAAA" }), 6, "8 caracteres base64 son 6 bytes");
  eq(cadImageEmbeddedBytes({ uri: "asset://x" }), 0, "un asset no pesa dentro");
}

console.log(`image-geometry: ${checks} comprobaciones · esquinas, píxel ↔ plano con giro, recorte exacto, ajuste con sus extremos (50/50 neutro, contraste 0 gris, brillo 100 blanco), qué URI se pinta`);
