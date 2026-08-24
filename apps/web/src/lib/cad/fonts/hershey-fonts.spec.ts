/**
 * Fuentes de trazos Hershey: el mapeo `.shx` → familia y el render básico.
 *
 * ## Qué se afirma aquí
 *
 * 1. **El dato es el que se cita.** La tabla transcrita de la colección Hershey
 *    (dominio público, NBS 1967) cubre los 95 ASCII imprimibles con la retícula
 *    declarada: línea base en 0, mayúscula de 21, descendentes hasta −7.
 * 2. **El mapeo de las cinco `.shx` comunes** —txt, simplex, romans, isocp,
 *    monotxt— llega a su familia Hershey, y Mono es de paso FIJO de verdad.
 * 3. **La métrica es la de los trazos.** El ancho de un renglón es la suma de
 *    avances de sus glifos, no una estimación por clases de carácter.
 * 4. **Los trazos de un renglón se pueden dibujar.** Polilíneas escaladas y
 *    avanzadas glifo a glifo, con `y` hacia arriba desde la base.
 * 5. **Lo compuesto por este módulo** —acentos del español, ñ, °, ±, Ø, ¿¡— es
 *    distinto del relleno `?` de lo desconocido, y lo desconocido cae en `?`
 *    (la conducta de una `.shx` sin el símbolo), no en un hueco.
 */
import { strict as assert } from "node:assert";
import {
  CAD_HERSHEY_CAP_HEIGHT,
  CAD_HERSHEY_FAMILIES,
  CAD_HERSHEY_MONO_ADVANCE,
  CAD_HERSHEY_SHX_FAMILIES,
  cadHersheyFamilyByName,
  cadHersheyFamilyForShx,
  cadHersheyGlyph,
  cadHersheyTextStrokes,
  cadHersheyTextWidth,
} from "./hershey-fonts";
import { CAD_HERSHEY_SIMPLEX_GLYPHS } from "./hershey-simplex-data";

let checks = 0;
function eq<T>(actual: T, expected: T, what: string) {
  checks += 1;
  assert.deepEqual(actual, expected, what);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}

// --- 1. El dato citado: 95 ASCII con la retícula declarada -------------------
{
  const characters = Object.keys(CAD_HERSHEY_SIMPLEX_GLYPHS);
  eq(characters.length, 95, "los 95 ASCII imprimibles, del espacio a la virgulilla");
  for (let code = 32; code <= 126; code += 1)
    ok(String.fromCharCode(code) in CAD_HERSHEY_SIMPLEX_GLYPHS, `ASCII ${code} presente`);
  for (const [character, glyph] of Object.entries(CAD_HERSHEY_SIMPLEX_GLYPHS)) {
    ok(glyph.advance > 0, `avance positivo en ${JSON.stringify(character)}`);
    for (const stroke of glyph.strokes) {
      ok(stroke.length >= 4 && stroke.length % 2 === 0, "cada trazo es pares (x,y) y al menos un segmento");
      for (let index = 1; index < stroke.length; index += 2)
        ok(stroke[index] >= -12 && stroke[index] <= 25, "y dentro de la retícula Hershey");
    }
  }
  const spanOf = (character: string): [number, number] => {
    const ys = CAD_HERSHEY_SIMPLEX_GLYPHS[character].strokes.flatMap((stroke) =>
      stroke.filter((_, index) => index % 2 === 1),
    );
    return [Math.min(...ys), Math.max(...ys)];
  };
  eq(spanOf("A"), [0, CAD_HERSHEY_CAP_HEIGHT], "la A pisa la base y toca la altura de mayúscula");
  eq(spanOf("g")[0], -7, "la g baja al descendente de la retícula");
  eq(CAD_HERSHEY_SIMPLEX_GLYPHS[" "].strokes.length, 0, "el espacio avanza sin dibujar");
}

// --- 2. El mapeo de las cinco .shx comunes -----------------------------------
{
  eq(cadHersheyFamilyForShx("txt"), "Hershey Simplex", "txt.shx va a Simplex");
  eq(cadHersheyFamilyForShx("simplex"), "Hershey Simplex", "simplex.shx, a su descendiente directo");
  eq(cadHersheyFamilyForShx("romans"), "Hershey Roman Simplex", "romans.shx, al Roman Simplex");
  eq(cadHersheyFamilyForShx("isocp"), "Hershey ISO", "isocp.shx, a la aproximación ISO declarada");
  eq(cadHersheyFamilyForShx("monotxt"), "Hershey Mono", "monotxt.shx, al paso fijo");
  eq(cadHersheyFamilyForShx("ROMANS"), "Hershey Roman Simplex", "sin distinguir mayúsculas");
  eq(cadHersheyFamilyForShx("gdt"), null, "una de símbolos NO tiene familia de letras");
  eq(cadHersheyFamilyForShx("estudio-2004"), null, "y una desconocida tampoco");
  eq(Object.keys(CAD_HERSHEY_SHX_FAMILIES).length, 5, "exactamente las cinco: ni una más se afirma");

  eq(cadHersheyFamilyByName("hershey simplex"), "Hershey Simplex", "la familia por su nombre");
  eq(cadHersheyFamilyByName("Hershey Mono"), "Hershey Mono", "tal cual también");
  eq(cadHersheyFamilyByName("Arial"), null, "una TTF no es una familia Hershey");
  eq(CAD_HERSHEY_FAMILIES.length, 4, "cuatro familias compiladas");

  // Roman Simplex ES el mismo repertorio que Simplex en la colección: se
  // afirma para que nadie crea que hay dos tablas distintas escondidas.
  eq(
    cadHersheyGlyph("Hershey Roman Simplex", "R"),
    cadHersheyGlyph("Hershey Simplex", "R"),
    "Roman Simplex y Simplex comparten trazos, y se dice",
  );
}

// --- 3. La métrica es la suma de avances -------------------------------------
{
  // C(21) + O(22) + T(16) + A(18) = 77 unidades; a escala 1 (altura 21) son 77.
  eq(cadHersheyTextWidth("Hershey Simplex", "COTA", CAD_HERSHEY_CAP_HEIGHT), 77, "COTA mide sus avances");
  eq(cadHersheyTextWidth("Hershey Simplex", "COTA", 42), 154, "y escala lineal con la altura");
  eq(cadHersheyTextWidth("Hershey Simplex", "", 42), 0, "el renglón vacío mide cero");

  // Mono: TODO glifo avanza lo mismo, el avance de los dígitos del juego.
  for (const character of "iMW1.ñ°")
    eq(
      cadHersheyGlyph("Hershey Mono", character).advance,
      CAD_HERSHEY_MONO_ADVANCE,
      `paso fijo también para ${JSON.stringify(character)}`,
    );
  eq(
    cadHersheyTextWidth("Hershey Mono", "iM", CAD_HERSHEY_CAP_HEIGHT),
    2 * CAD_HERSHEY_MONO_ADVANCE,
    "dos caracteres mono = dos células",
  );
  // Y el glifo centrado en su célula: la i estrecha gana margen simétrico.
  const narrow = CAD_HERSHEY_SIMPLEX_GLYPHS.i;
  const mono = cadHersheyGlyph("Hershey Mono", "i");
  const shift = (CAD_HERSHEY_MONO_ADVANCE - narrow.advance) / 2;
  eq(mono.strokes[0][0], narrow.strokes[0][0] + shift, "la célula mono centra el trazo");
}

// --- 4. Los trazos de un renglón entero --------------------------------------
{
  const line = cadHersheyTextStrokes("Hershey Simplex", "AV", CAD_HERSHEY_CAP_HEIGHT);
  eq(line.width, 36, "A(18) + V(18) avanzan 36 unidades");
  const xs = line.strokes.flat().map((point) => point.x);
  const ys = line.strokes.flat().map((point) => point.y);
  ok(Math.max(...xs) > 18, "la V se dibuja DESPUÉS del avance de la A, no encima");
  eq(Math.max(...ys), CAD_HERSHEY_CAP_HEIGHT, "y hacia ARRIBA hasta la mayúscula");
  eq(Math.min(...ys), 0, "desde la línea base");

  const scaled = cadHersheyTextStrokes("Hershey Simplex", "AV", 42);
  eq(scaled.width, 72, "el ancho escala con la altura pedida");
  eq(Math.max(...scaled.strokes.flat().map((point) => point.y)), 42, "y la altura también");
}

// --- 5. Lo compuesto es distinto del relleno de lo desconocido ---------------
{
  const question = cadHersheyGlyph("Hershey Simplex", "?");
  eq(cadHersheyGlyph("Hershey Simplex", "☃"), question, "lo desconocido se dibuja como ?, no como hueco");

  for (const character of ["á", "é", "í", "ó", "ú", "Á", "Ñ", "ñ", "ü", "°", "±", "Ø", "ø", "¿", "¡"])
    ok(
      !Object.is(cadHersheyGlyph("Hershey Simplex", character), question) &&
        cadHersheyGlyph("Hershey Simplex", character).strokes.length > 0,
      `${character} tiene glifo propio compuesto, no el relleno`,
    );

  const n = CAD_HERSHEY_SIMPLEX_GLYPHS.n;
  const enye = cadHersheyGlyph("Hershey Simplex", "ñ");
  eq(enye.strokes.length, n.strokes.length + 1, "la ñ es la n más su virgulilla");
  eq(enye.advance, n.advance, "sin cambiar el avance");

  // La í pierde el punto de la i (el acento lo reemplaza): ningún trazo suyo
  // vive en la franja del punto (y ≥ 19 pegado al tope) salvo el acento, que
  // es un solo segmento ascendente hacia la derecha.
  const iAcute = cadHersheyGlyph("Hershey Simplex", "í");
  const accent = iAcute.strokes.filter(
    (stroke) => stroke.length === 4 && stroke[2] > stroke[0] && stroke[3] > stroke[1],
  );
  eq(accent.length, 1, "un solo segmento de acento, y sube hacia la derecha");
  ok(
    !iAcute.strokes.some((stroke) => stroke.length > 4 && stroke.every((_, i) => i % 2 === 0 || stroke[i] > 18)),
    "el punto de la i ya no está",
  );

  const upper = cadHersheyGlyph("Hershey Simplex", "Á");
  ok(
    Math.max(...upper.strokes.flatMap((stroke) => stroke.filter((_, i) => i % 2 === 1))) > CAD_HERSHEY_CAP_HEIGHT,
    "el acento de la mayúscula vive POR ENCIMA de la altura de mayúscula",
  );

  const openQuestion = cadHersheyGlyph("Hershey Simplex", "¿");
  const questionYs = openQuestion.strokes.flatMap((stroke) => stroke.filter((_, i) => i % 2 === 1));
  ok(Math.min(...questionYs) < 0, "la ¿ desciende bajo la base, como en la caja tipográfica");
  eq(openQuestion.advance, question.advance, "girada dentro de su misma célula");
}

console.log(
  `hershey-fonts: ${checks} comprobaciones verdes · 95 ASCII del juego Simplex (dominio público, ` +
    "NBS 1967) + compuestos áéíóúü ñÑ °±Øø ¿¡ propios; txt/simplex→Simplex, romans→Roman Simplex, " +
    "isocp→ISO (aproximación declarada), monotxt→Mono de paso fijo; anchura = suma de avances.",
);
