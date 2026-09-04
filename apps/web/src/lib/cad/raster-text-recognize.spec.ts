/**
 * El rótulo trazado vuelve a ser texto — y sólo cuando se puede demostrar
 * (Ola I, 2026-09-04).
 *
 * ## Qué se afirma aquí, y con qué prueba
 *
 * 1. **El círculo se cierra.** El rótulo «PREDIO 4-A · 1 240.50 m2» se traza
 *    con `cadHersheyTextStrokes` —la MISMA función con la que el producto
 *    dibuja su TEXT—, se rasteriza a un PNG de `cadPngFixture` y se vuelve a
 *    leer: la cadena coincide CARÁCTER A CARÁCTER con lo que la fuente dibujó,
 *    la altura de mayúscula sale exacta (el límite declarado es 5 %) y el
 *    punto de inserción cae a menos de un píxel del origen de la línea base.
 * 2. **El `·` no es una excepción escondida.** La colección Hershey no tiene
 *    punto medio y `cadHersheyGlyph` lo dibuja como `?` —conducta declarada de
 *    la fuente, no del lector—, así que lo que se lee de vuelta es `?`. La
 *    comparación se hace contra lo que SE DIBUJÓ, y el spec enseña cuál es la
 *    única posición en la que el original y lo dibujable difieren.
 * 3. **Aguanta tinta y suciedad.** El mismo rótulo con el trazo ENGROSADO una
 *    pasada y un 2 % de píxeles invertidos se lee igual, carácter a carácter,
 *    con la misma altura y la misma inserción.
 * 4. **Lo que no se puede leer NO se inventa.** Un garabato a mano metido en
 *    el hueco del rótulo se queda sin lectura —distancia 0,065 contra un corte
 *    de 0,04—, sus trazos salen como geometría, el recuento lo dice, y en su
 *    sitio NO aparece ninguna letra parecida.
 * 5. **La ambigüedad se declara.** `I` y `l` son el mismo trazo en el juego
 *    Simplex: se lee `I` y el glifo publica con quién se colapsó.
 * 6. **Un dibujo no es un rótulo.** El rectángulo con diagonal que prueba la
 *    tubería de vectorización no produce ni una letra.
 * 7. **El giro se mide.** El mismo rótulo inclinado 2° se lee entero y su giro
 *    sale a menos de una décima de grado; a 5° el renglón ya no se sostiene y
 *    se deja entero como geometría en vez de leerse a trozos.
 * 8. **La escala no está clavada.** El rótulo a 14 px y a 40 px de altura de
 *    mayúscula se lee igual, y la altura se mide en cada caso.
 */
import { strict as assert } from "node:assert";
import { cadHersheyTextWidth } from "./fonts/hershey-fonts";
import { cadPngFixture, cadPngHersheyLabel } from "./image-fixtures";
import { cadRasterDecode, cadRasterLuminance } from "./raster-decode";
import {
  CAD_RASTER_TEXT_ALPHABET,
  CAD_RASTER_TEXT_LIMITS,
  CAD_RASTER_TEXT_MARGIN,
  CAD_RASTER_TEXT_MAX_DISTANCE,
  CAD_RASTER_TEXT_MAX_SKEW_DEG,
  cadRasterRecognizeText,
  cadRasterTextReadBoxes,
  type CadRasterTextResult,
} from "./raster-text-recognize";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const LABEL = "PREDIO 4-A · 1 240.50 m2";
const CAP = 24;
const FAMILY = "Hershey Simplex";

/** Lo que la fuente PUEDE dibujar: lo que no tiene glifo lo dibuja como `?`. */
const drawable = (text: string) => [...text].map((character) => (character === " " || CAD_RASTER_TEXT_ALPHABET.includes(character) ? character : "?")).join("");
const DRAWN = drawable(LABEL);

const read = (png: Uint8Array, options = {}): CadRasterTextResult => cadRasterRecognizeText(cadRasterDecode(png), options);
const inkPixels = (png: Uint8Array): number => {
  const luminance = cadRasterLuminance(cadRasterDecode(png));
  let count = 0;
  for (const value of luminance) if (value < 128) count += 1;
  return count;
};

/* ── 1. El alfabeto, los cortes y los límites, declarados ───────────────── */
{
  eq(CAD_RASTER_TEXT_ALPHABET.length, 114, "95 ASCII menos el espacio, más los 20 compuestos del español y el dibujo");
  eq(CAD_RASTER_TEXT_ALPHABET[0], "A", "el orden de preferencia empieza por las mayúsculas");
  ok(
    CAD_RASTER_TEXT_ALPHABET.indexOf("I") < CAD_RASTER_TEXT_ALPHABET.indexOf("l"),
    "y la I va antes que la ele: es la lectura más probable de una vertical en un rótulo de plano",
  );
  ok(!CAD_RASTER_TEXT_ALPHABET.includes(" "), "el espacio no es candidato: no dibuja nada que comparar");
  ok(!CAD_RASTER_TEXT_ALPHABET.includes("·"), "y el punto medio NO está en el juego: por eso se dibuja como ?");
  eq(CAD_RASTER_TEXT_MAX_DISTANCE, 0.04, "el corte de distancia va escrito y es una constante, no un número suelto");
  eq(CAD_RASTER_TEXT_MARGIN, 0.12, "y el margen sobre la segunda plantilla también");
  eq(CAD_RASTER_TEXT_MAX_SKEW_DEG, 3, "y la inclinación máxima del renglón");
  ok(
    CAD_RASTER_TEXT_LIMITS.some((line) => line.includes("TRAZOS") && line.includes("manuscrito")),
    "el límite está dicho en el módulo: fuentes de trazos, ni manuscrito ni tipografías de relleno",
  );
  ok(CAD_RASTER_TEXT_LIMITS.some((line) => line.includes("se tocan")), "y que dos letras pegadas salen como una mancha");
}

/* ── 2. El `·` que la fuente no tiene ───────────────────────────────────── */
{
  const differ = [...LABEL].map((character, index) => (character === DRAWN[index] ? null : index)).filter((index) => index !== null);
  eq(differ, [11], "el original y lo dibujable difieren en UNA posición, y es la del punto medio");
  eq(DRAWN[11], "?", "que la fuente dibuja como interrogación, igual que una .shx sin el símbolo");
  eq(DRAWN, "PREDIO 4-A ? 1 240.50 m2", "lo que de verdad hay en el papel es esto, y esto es lo que se compara");
}

/* ── 3. El rótulo limpio: ida y vuelta ──────────────────────────────────── */
const clean = cadPngHersheyLabel({ text: LABEL, capHeightPx: CAP });
{
  const result = read(clean.png);
  eq(result.family, FAMILY, "se compara contra el juego de trazos declarado");
  eq(result.rows.length, 1, "un rótulo, un renglón");
  const row = result.rows[0];
  eq(row.text, DRAWN, `la cadena entera: ${JSON.stringify(row.text)}`);
  for (let index = 0; index < DRAWN.length; index += 1) eq(row.text[index], DRAWN[index], `carácter ${index}: ${JSON.stringify(DRAWN[index])}`);
  eq(result.readGlyphs, 19, "los 19 glifos con tinta (los cuatro espacios no dibujan nada)");
  eq(result.leftAsGeometry, 0, "y ni una mancha sin leer");

  // La altura: el límite declarado es 5 %, y de hecho sale EXACTA porque la
  // mayúscula del rótulo va de la línea base a la altura de mayúscula.
  ok(Math.abs(row.capHeightPx - CAP) <= 0.05 * CAP, `altura ${row.capHeightPx} px contra ${CAP} px pedidos: menos del 5 %`);
  eq(row.capHeightPx, CAP, "y aquí, exacta");
  eq(row.rotationDeg, 0, "el renglón no está torcido, y se dice que no lo está");

  // La inserción, en el sistema de la tubería: columna + ½ y `alto − 1 − fila + ½`.
  const expected = { x: clean.originX + 0.5, y: clean.height - 1 - clean.baselineY + 0.5 };
  const off = Math.hypot(row.insertion.x - expected.x, row.insertion.y - expected.y);
  ok(off < 1, `la inserción cae a ${off.toFixed(3)} px del origen de la línea base (${expected.x}, ${expected.y})`);
  eq(row.insertion, expected, "y de hecho, en el píxel exacto");

  // Las cajas de lo leído salen en el sistema de la vectorización (Y arriba).
  const boxes = cadRasterTextReadBoxes(result);
  eq(boxes.length, 19, "una caja por glifo leído, para que el calco no los repita");
  ok(
    boxes.every((box) => box.minY >= 0 && box.maxY < clean.height && box.maxY >= box.minY),
    "y todas dentro de la imagen, ya con la Y hacia arriba",
  );
}

/* ── 4. Trazo engrosado y 2 % de ruido: se sigue leyendo ────────────────── */
{
  const dirty = cadPngHersheyLabel({ text: LABEL, capHeightPx: CAP, thicken: 1, noise: 0.02, seed: 7 });
  const before = inkPixels(clean.png);
  const after = inkPixels(dirty.png);
  ok(after > before * 2, `el engrosado y el ruido triplican la tinta: ${before} px → ${after} px`);
  ok(after - before > 0.02 * dirty.width * dirty.height * 0.5, "y el 2 % de ruido está de verdad ahí, no es un adorno del nombre");

  const result = read(dirty.png);
  eq(result.rows.length, 1, "sigue siendo un renglón");
  const row = result.rows[0];
  eq(row.text, DRAWN, `y la misma cadena, carácter a carácter: ${JSON.stringify(row.text)}`);
  eq(result.readGlyphs, 19, "los 19 glifos");
  eq(result.leftAsGeometry, 0, "sin dejar ninguno como geometría");
  ok(Math.abs(row.capHeightPx - CAP) <= 0.05 * CAP, `altura ${row.capHeightPx} px: dentro del 5 % pese al engrosado`);
  const off = Math.hypot(row.insertion.x - (dirty.originX + 0.5), row.insertion.y - (dirty.height - 1 - dirty.baselineY + 0.5));
  ok(off < 1, `y la inserción a ${off.toFixed(3)} px`);
  const worst = Math.max(...row.glyphs.map((glyph) => glyph.distance));
  ok(worst < CAD_RASTER_TEXT_MAX_DISTANCE, `la peor distancia del renglón sucio es ${worst.toFixed(4)}, por debajo del corte ${CAD_RASTER_TEXT_MAX_DISTANCE}`);
}

/* ── 5. El glifo que no está en el juego NO se convierte en letra ───────── */
{
  // Un garabato a mano —cinco tramos de zigzag— metido en el hueco del
  // rótulo. Se coloca por MÉTRICA, no a ojo: el hueco empieza donde acaba
  // «PREDIO 4-A » según la misma métrica de trazos con la que se dibujó.
  const BASE = 48;
  const gap = Math.round(24 + cadHersheyTextWidth(FAMILY, "PREDIO 4-A ", CAP)) + 2;
  const scribbled = cadPngHersheyLabel({
    text: "PREDIO 4-A   1 240.50 m2",
    capHeightPx: CAP,
    originX: 24,
    baselineY: BASE,
    extra: (draw) => {
      draw(gap, BASE - 4, gap + 3, BASE - 16);
      draw(gap + 3, BASE - 16, gap + 6, BASE - 6);
      draw(gap + 6, BASE - 6, gap + 9, BASE - 18);
      draw(gap + 9, BASE - 18, gap + 12, BASE - 8);
      draw(gap + 12, BASE - 8, gap + 14, BASE - 14);
    },
  });
  const result = read(scribbled.png);
  eq(result.rows.length, 1, "el garabato no parte el renglón");
  const row = result.rows[0];
  eq(result.readGlyphs, 18, "los 18 glifos del rótulo se leen");
  eq(result.leftAsGeometry, 1, "y la mancha que no es letra se queda como geometría, contada");

  const refused = row.glyphs.filter((glyph) => glyph.character === null);
  eq(refused.length, 1, "una sola mancha sin lectura");
  const mark = refused[0];
  ok(mark.bbox.minX >= gap - 2 && mark.bbox.maxX <= gap + 16, `y es la del garabato: caja x ${mark.bbox.minX}..${mark.bbox.maxX}`);
  ok(
    mark.distance > CAD_RASTER_TEXT_MAX_DISTANCE,
    `su mejor plantilla queda a ${mark.distance.toFixed(4)}, por encima del corte ${CAD_RASTER_TEXT_MAX_DISTANCE}: no se parece a ninguna letra`,
  );
  ok(mark.runnerUp !== null && mark.runnerUpDistance > mark.distance, `y la segunda, «${mark.runnerUp}», todavía más lejos (${mark.runnerUpDistance.toFixed(4)})`);
  eq(row.text.replace(/\s+/g, ""), "PREDIO4-A1240.50m2", "en el sitio del garabato NO hay ninguna letra parecida: hay hueco");
  ok(row.text.includes("4-A  1"), `el hueco se conserva como espacios medidos: ${JSON.stringify(row.text)}`);
  eq(cadRasterTextReadBoxes(result).length, 18, "y su caja no entra en las de lo leído: sus trazos siguen siendo del calco");
}

/* ── 6. La ambigüedad que no se puede resolver, declarada ───────────────── */
{
  const result = read(clean.png);
  const row = result.rows[0];
  const ambiguous = row.glyphs.filter((glyph) => glyph.ambiguousWith.length > 0);
  eq(ambiguous.length, 1, "sólo un glifo del rótulo tiene un gemelo exacto");
  eq(ambiguous[0].character, "I", "se lee la I");
  eq([...ambiguous[0].ambiguousWith], ["l"], "y se declara que la ele minúscula dibuja exactamente lo mismo");
  ok(
    row.glyphs.every((glyph) => glyph.character === null || glyph.distance <= glyph.runnerUpDistance * (1 - CAD_RASTER_TEXT_MARGIN)),
    "todo lo leído ganó el margen a la segunda plantilla",
  );
}

/* ── 7. Un dibujo no es un rótulo ───────────────────────────────────────── */
{
  // El mismo rectángulo con diagonal con el que se prueba la vectorización.
  const RECT = { left: 5, top: 5, right: 34, bottom: 24 };
  const drawing = cadPngFixture(40, 30, (x, y) => {
    const edge = x >= RECT.left && x <= RECT.right && y >= RECT.top && y <= RECT.bottom && (x === RECT.left || x === RECT.right || y === RECT.top || y === RECT.bottom);
    const diagonal = x === y && x >= 10 && x <= 22;
    const value = edge || diagonal ? 30 : 240;
    return [value, value, value, 255];
  });
  const result = read(drawing);
  eq(result.rows.length, 0, "de un rectángulo y una diagonal no sale ni una letra");
  eq(result.readGlyphs, 0, "cero glifos leídos");
  eq(result.discardedRows, 1, "y la franja que llegó a mirarse se descarta entera, contada");
}

/* ── 8. El giro se mide, y donde ya no se sostiene se dice ──────────────── */
{
  const tilted = cadPngHersheyLabel({ text: LABEL, capHeightPx: CAP, skewDeg: 2, marginPx: 40 });
  const result = read(tilted.png);
  eq(result.rows.length, 1, "el renglón inclinado sigue siendo un renglón");
  const row = result.rows[0];
  eq(row.text, DRAWN, "y se lee entero, carácter a carácter");
  ok(Math.abs(row.rotationDeg - 2) < 0.1, `el giro medido es ${row.rotationDeg.toFixed(3)}°, a menos de una décima de los 2° trazados`);
  const off = Math.hypot(row.insertion.x - (tilted.originX + 0.5), row.insertion.y - (tilted.height - 1 - tilted.baselineY + 0.5));
  ok(off < 1.5, `y la inserción cae a ${off.toFixed(3)} px del origen de la base inclinada`);

  const fallen = read(cadPngHersheyLabel({ text: LABEL, capHeightPx: CAP, skewDeg: 5, marginPx: 60 }).png);
  eq(fallen.rows.length, 0, "a 5° no se lee NADA: por encima del límite declarado no se intenta");
  eq(fallen.readGlyphs, 0, "ni un glifo inventado");
  ok(fallen.discardedRows > 0, "y las franjas descartadas se cuentan, para que el aviso lo pueda decir");
}

/* ── 9. La escala no está clavada ───────────────────────────────────────── */
{
  for (const capHeight of [14, 40]) {
    const result = read(cadPngHersheyLabel({ text: "CUADRO DE CONSTRUCCION", capHeightPx: capHeight }).png);
    eq(result.rows.length, 1, `a ${capHeight} px de altura, un renglón`);
    eq(result.rows[0].text, "CUADRO DE CONSTRUCCION", `y la misma cadena a ${capHeight} px`);
    ok(
      Math.abs(result.rows[0].capHeightPx - capHeight) <= 0.05 * capHeight,
      `la altura medida a ${capHeight} px es ${result.rows[0].capHeightPx}: dentro del 5 %`,
    );
  }
}

/* ── 10. El umbral y el área mínima viajan con el resultado ─────────────── */
{
  const result = read(clean.png, { threshold: 120 });
  eq(result.threshold, 120, "un umbral dado se respeta");
  eq(result.thresholdAuto, false, "y se declara que lo dio la mano, no Otsu");
  eq(result.rows[0].text, DRAWN, "y con él se sigue leyendo lo mismo");
  eq(read(clean.png).thresholdAuto, true, "sin umbral, lo decide Otsu y también se declara");
  eq(result.minBlobPixels, 4, "el área mínima: cuatro píxeles, que es lo que mide el punto decimal de este rótulo");
  eq(result.limits, CAD_RASTER_TEXT_LIMITS, "y los límites viajan con el resultado, para que el aviso los pueda copiar");
}

console.log(
  `raster-text-recognize: ${checks} comprobaciones · «${LABEL}» trazado con cadHersheyTextStrokes a ${CAP} px y rasterizado vuelve como «${DRAWN}» ` +
    "carácter a carácter (el · no está en el juego Hershey y la fuente lo dibuja ?), con altura exacta y la inserción en el píxel exacto; " +
    "lo mismo con el trazo engrosado y 2 % de ruido; un garabato a mano queda a 0,065 del mejor glifo, por encima del corte 0,04, y sale como geometría contada; " +
    "I y l se declaran gemelas; un rectángulo con diagonal no produce letras; 2° de inclinación se miden a menos de 0,1° y 5° se rechazan enteros",
);
