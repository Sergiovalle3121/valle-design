/**
 * DEL ESCANEO A POLILÍNEAS, contra un escaneo fabricado con vértices conocidos
 * (Ola I, 2026-09-04).
 *
 *   - Un PNG de 40 × 30 con un RECTÁNGULO de (5, 5) a (34, 24), una DIAGONAL
 *     de (10, 10) a (22, 22) y cinco motas de sal y pimienta sembradas a
 *     propósito. Tinta en dos grises (30 y 50) y papel en otros dos (210 y
 *     240): el umbral no se le dice a nadie, lo decide Otsu y cae ENTRE las
 *     dos jorobas.
 *   - Las cinco motas se van en el despeckle y el manifiesto dice cuántas.
 *   - Salen DOS trazos: el contorno como polilínea CERRADA de cuatro vértices
 *     —ni cinco, que sería la costura del recorrido— y la diagonal como
 *     polilínea abierta de dos.
 *   - Colocada la imagen a 1 px = 100 mm y girada 90°, cada vértice cae a
 *     menos de 1 px (100 mm) del vértice de origen EN COORDENADAS DEL DIBUJO.
 *   - Un escaneo que sólo tiene polvo no produce NI UNA entidad.
 *   - Un trazo de tres píxeles de grueso sale como UNA línea, no como su
 *     contorno: eso es lo que hace el adelgazamiento.
 */
import { strict as assert } from "node:assert";
import type { CadImageEntity } from "./cad-entities-v4";
import { cadImagePixelToWorld } from "./image-geometry";
import { cadPngFixture } from "./image-fixtures";
import { cadRasterDecode, cadRasterLuminance } from "./raster-decode";
import { CAD_RASTER_NOT_YET, cadRasterOtsuThreshold, cadRasterVectorize, type CadRasterStroke } from "./raster-vectorize";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/* ── El escaneo fabricado ───────────────────────────────────────────────── */
const WIDTH = 40;
const HEIGHT = 30;
const RECT = { left: 5, top: 5, right: 34, bottom: 24 };
const DIAGONAL = { from: { x: 10, y: 10 }, to: { x: 22, y: 22 } };
const SPECKS: ReadonlyArray<readonly [number, number]> = [[2, 2], [37, 2], [2, 27], [37, 27], [30, 15]];

function isRectangleEdge(x: number, y: number): boolean {
  const inside = x >= RECT.left && x <= RECT.right && y >= RECT.top && y <= RECT.bottom;
  return inside && (x === RECT.left || x === RECT.right || y === RECT.top || y === RECT.bottom);
}
function isDiagonal(x: number, y: number): boolean {
  return x === y && x >= DIAGONAL.from.x && x <= DIAGONAL.to.x;
}
function isSpeck(x: number, y: number): boolean {
  return SPECKS.some(([sx, sy]) => sx === x && sy === y);
}
/** Tinta en dos grises y papel en otros dos: un histograma con dos jorobas de verdad. */
function scanPixel(x: number, y: number): readonly [number, number, number, number] {
  const ink = isRectangleEdge(x, y) || isDiagonal(x, y) || isSpeck(x, y);
  const value = ink ? ((x + y) % 2 === 0 ? 30 : 50) : (x * 7 + y) % 3 === 0 ? 210 : 240;
  return [value, value, value, 255];
}

const scan = cadRasterDecode(cadPngFixture(WIDTH, HEIGHT, scanPixel));

/* ── El umbral lo decide Otsu ───────────────────────────────────────────── */
{
  const luminance = cadRasterLuminance(scan);
  const threshold = cadRasterOtsuThreshold(luminance);
  eq(threshold, 50, "Otsu parte por 50: la tinta (30 y 50) a un lado, el papel (210 y 240) al otro");
  const uniform = cadRasterOtsuThreshold(new Uint8Array(64).fill(255));
  eq(uniform, 0, "una hoja en blanco no tiene dos clases: el umbral queda en 0 y nada es tinta");
}

/* ── La tubería entera ──────────────────────────────────────────────────── */
const result = cadRasterVectorize(scan);
{
  const perimeter = 2 * (RECT.right - RECT.left + 1) + 2 * (RECT.bottom - RECT.top + 1) - 4;
  const diagonalPixels = DIAGONAL.to.x - DIAGONAL.from.x + 1;
  eq(result.threshold, 50, "el umbral aplicado");
  eq(result.thresholdAuto, true, "y se declara que lo decidió Otsu, no una persona");
  eq(result.inkPixels, perimeter + diagonalPixels + SPECKS.length, `${perimeter} del contorno + ${diagonalPixels} de la diagonal + ${SPECKS.length} motas`);
  eq(result.removedBlobs, SPECKS.length, "el despeckle se lleva las cinco motas");
  eq(result.removedPixels, SPECKS.length, "y son cinco píxeles: el manifiesto dice cuántos se descartaron");
  eq(result.keptBlobs, 2, "quedan dos manchas: el contorno y la diagonal");
  eq(result.skeletonPixels, perimeter + diagonalPixels, "el adelgazamiento no toca un trazo que ya mide un píxel");
  eq(result.minBlobPixels, 8, "el área mínima queda declarada");
  eq(result.tolerancePx, 1.5, "y la tolerancia con la que se ajustó");
  eq(result.notYet, CAD_RASTER_NOT_YET, "y lo que todavía no reconoce viaja con el resultado");
  ok(result.notYet.some((line) => line.includes("ARC")) && result.notYet.some((line) => line.includes("HATCH")), "arcos, círculos y sombreados están dichos");
}

/* ── Dos trazos: el contorno cerrado y la diagonal abierta ──────────────── */
const closed = result.strokes.find((stroke) => stroke.closed);
const open = result.strokes.find((stroke) => !stroke.closed);
{
  eq(result.strokes.length, 2, "dos trazos y ni uno más: el polvo no dejó entidades");
  assert.ok(closed && open, "uno cerrado y uno abierto");
  checks += 1;
  eq(closed.points.length, 4, "el rectángulo sale con CUATRO vértices: la costura del recorrido se funde por colineal");
  eq(open.points.length, 2, "la diagonal sale con dos");
}

/**
 * Los vértices en píxeles con la Y hacia ARRIBA, en el centro del píxel: es lo
 * que come `cadImagePixelToWorld`. Una fila `r` del archivo es `HEIGHT − 1 − r`.
 */
const up = (x: number, y: number) => ({ x: x + 0.5, y: HEIGHT - 1 - y + 0.5 });
const sameVertex = (a: { x: number; y: number }, b: { x: number; y: number }, tolerance: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
const hasVertex = (stroke: CadRasterStroke, point: { x: number; y: number }, tolerance = 0.01) => stroke.points.some((vertex) => sameVertex(vertex, point, tolerance));
{
  for (const [x, y] of [[RECT.left, RECT.top], [RECT.right, RECT.top], [RECT.right, RECT.bottom], [RECT.left, RECT.bottom]] as const)
    ok(hasVertex(closed!, up(x, y)), `la esquina (${x}, ${y}) del original es un vértice del trazo`);
  ok(hasVertex(open!, up(DIAGONAL.from.x, DIAGONAL.from.y)) && hasVertex(open!, up(DIAGONAL.to.x, DIAGONAL.to.y)), "y los dos extremos de la diagonal");
  ok(Math.abs(closed!.lengthPx - 2 * (RECT.right - RECT.left + RECT.bottom - RECT.top)) < 0.01, `el perímetro ajustado mide lo que mide el rectángulo: ${closed!.lengthPx}`);
}

/* ── En coordenadas del dibujo: 1 px = 100 mm y girada 90° ──────────────── */
{
  // IMAGEATTACH con ancho 4000 sobre 40 px son 100 unidades por píxel; a 90°
  // el vector U apunta a +Y y el V a −X. La rotación vive DENTRO de U y V, así
  // que la vectorización no sabe nada de ella y aun así cae en su sitio.
  const entity: CadImageEntity = {
    id: "img",
    type: "image",
    definition: "escaneo",
    insertion: { x: 1000, y: 500, z: 0 },
    uVector: { x: 0, y: 100, z: 0 },
    vVector: { x: -100, y: 0, z: 0 },
    size: { width: WIDTH, height: HEIGHT },
    layer: "ESCANEO",
  };
  const world = (stroke: CadRasterStroke) => stroke.points.map((point) => cadImagePixelToWorld(entity, point.x, point.y));
  const corners = world(closed!);
  // Calculado a mano: (5, 5) → píxel (5,5 · 24,5) → (1000 − 2450, 500 + 550).
  const expected = [
    { x: -1450, y: 1050 },
    { x: -1450, y: 3950 },
    { x: 450, y: 3950 },
    { x: 450, y: 1050 },
  ];
  for (const target of expected)
    ok(corners.some((corner) => sameVertex(corner, target, 100)), `(${target.x}, ${target.y}) mm tiene su vértice a menos de 1 px (100 mm)`);
  const ends = world(open!);
  ok(
    ends.some((point) => sameVertex(point, { x: -950, y: 1550 }, 100)) && ends.some((point) => sameVertex(point, { x: 250, y: 2750 }, 100)),
    `los extremos de la diagonal caen en (−950, 1550) y (250, 2750): ${ends.map((point) => `(${point.x}, ${point.y})`).join(" ")}`,
  );
  const exact = corners.every((corner) => expected.some((target) => sameVertex(corner, target, 1e-9)));
  ok(exact, "y de hecho caen EXACTOS, no sólo dentro de la tolerancia");
}

/* ── Sólo polvo: ni una entidad ─────────────────────────────────────────── */
{
  const dust: ReadonlyArray<readonly [number, number]> = [[3, 3], [9, 4], [15, 11], [4, 16], [18, 18], [11, 2], [2, 11]];
  const png = cadPngFixture(24, 24, (x, y) => {
    const ink = dust.some(([dx, dy]) => dx === x && dy === y);
    return ink ? [20, 20, 20, 255] : [235, 235, 235, 255];
  });
  const noisy = cadRasterVectorize(cadRasterDecode(png));
  eq(noisy.strokes.length, 0, "el ruido de sal y pimienta no produce ni una entidad");
  eq(noisy.removedBlobs, dust.length, `y el manifiesto dice cuántas manchas quitó: ${dust.length}`);
  eq(noisy.removedPixels, dust.length, "con sus píxeles");
  eq(noisy.skeletonPixels, 0, "no queda esqueleto que recorrer");
}

/* ── Un trazo grueso sale como UNA línea, no como su contorno ───────────── */
{
  const png = cadPngFixture(30, 12, (x, y) => (y >= 4 && y <= 6 && x >= 3 && x <= 26 ? [25, 25, 25, 255] : [245, 245, 245, 255]));
  const thick = cadRasterVectorize(cadRasterDecode(png));
  eq(thick.inkPixels, 24 * 3, "la barra mide 24 × 3 px");
  eq(thick.strokes.length, 1, "y sale UN trazo, no el contorno de la barra: eso es el adelgazamiento");
  const stroke = thick.strokes[0];
  eq(stroke.closed, false, "abierto");
  eq(stroke.points.length, 2, "y con dos vértices");
  ok(Math.abs(stroke.points[0].y - stroke.points[1].y) < 0.01, "los dos a la misma altura: la línea media de la barra");
  // La cifra REAL, no una holgada: Zhang-Suen come dos píxeles en cada punta
  // de una barra de tres de grueso, porque un extremo romo se pela como
  // cualquier otro borde. 24 px de barra dan 20 de línea media, y se dice.
  ok(Math.abs(stroke.lengthPx - 20) < 0.01, `la línea media mide 20 px: el adelgazamiento come 2 px en cada punta de una barra de 3 de grueso (medido: ${stroke.lengthPx})`);
}

/* ── El umbral y el área mínima se pueden fijar a mano ──────────────────── */
{
  const fixed = cadRasterVectorize(scan, { threshold: 40, minBlobPixels: 1, tolerancePx: 0.5 });
  eq(fixed.thresholdAuto, false, "un umbral dado se declara como dado");
  eq(fixed.threshold, 40, "y es el que se aplica");
  ok(fixed.inkPixels < result.inkPixels, `a 40 la mitad del trazo (los píxeles de 50) deja de ser tinta: ${fixed.inkPixels} < ${result.inkPixels}`);
  eq(fixed.removedBlobs, 0, "con área mínima 1 no se tira ninguna mancha, ni el polvo");
}

console.log(
  `raster-vectorize: ${checks} comprobaciones · umbral de Otsu en 50; 5 motas fuera con su recuento; rectángulo cerrado de 4 vértices y diagonal de 2; los 6 vértices caen EXACTOS en coordenadas del dibujo a 1 px = 100 mm girado 90°; sólo polvo → 0 entidades; barra de 3 px → 1 línea de 20 px (el adelgazamiento come 2 px por punta, dicho)`,
);
