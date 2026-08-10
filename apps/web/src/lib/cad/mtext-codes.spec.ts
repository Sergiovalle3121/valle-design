/**
 * Códigos de control de MTEXT.
 *
 * Se afirma con ANCLAS ABSOLUTAS —qué tramos exactos salen, con qué texto y qué
 * atributos— y no sólo con propiedades de ida y vuelta. Una propiedad de
 * round-trip se cumple de forma VACÍA si el analizador no toca ningún código: un
 * `parse` que devolviera la cadena entera como un único tramo literal pasaría
 * cualquier «lo que entra, sale».
 */
import { strict as assert } from "node:assert";
import {
  cadMTextHasCodes,
  cadMTextPlainText,
  cadMTextRunHeight,
  cadMTextStackCode,
  escapeCadMText,
  parseCadMText,
} from "./mtext-codes";
import { layoutCadMText } from "./mtext-layout";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

// --- camino rápido: un texto sin códigos sale intacto --------------------------
{
  eq(cadMTextHasCodes("Muro cortafuego"), false, "sin barras ni llaves no hay códigos");
  eq(cadMTextPlainText("Muro cortafuego"), "Muro cortafuego", "texto llano intacto");
  const paragraphs = parseCadMText("uno\ndos");
  eq(paragraphs.length, 2, "un salto real separa párrafos");
  eq(paragraphs[0][0].text, "uno", "primer párrafo");
  eq(paragraphs[1][0].text, "dos", "segundo párrafo");
}

// --- \P parte párrafos ----------------------------------------------------------
{
  eq(cadMTextPlainText("A\\PB\\PC"), "A\nB\nC", "\\P es salto de párrafo");
  eq(parseCadMText("A\\PB").length, 2, "dos párrafos");
}

// --- subrayado y sobrerrayado abren y cierran -----------------------------------
{
  const [paragraph] = parseCadMText("normal\\Lsubrayado\\lnormal");
  eq(paragraph.length, 3, "tres tramos: antes, subrayado y después");
  eq(paragraph.map((run) => run.text), ["normal", "subrayado", "normal"], "textos de los tramos");
  eq(paragraph.map((run) => run.underline), [false, true, false], "sólo el de en medio va subrayado");
  const [over] = parseCadMText("\\Oalto\\obajo");
  eq(over.map((run) => run.overline), [true, false], "sobrerrayado abre y cierra");
}

// --- \S: el apilado, que es lo que permite escribir una tolerancia ---------------
{
  const [paragraph] = parseCadMText("Ø25\\S+0.05^-0.02;");
  eq(paragraph.length, 2, "el texto y el apilado son tramos distintos");
  eq(paragraph[0].text, "Ø25", "el prefijo se conserva");
  eq(paragraph[1].stack, { upper: "+0.05", lower: "-0.02", style: "tolerance" }, "tolerancia apilada");
  eq(paragraph[1].text, "+0.05/-0.02", "aplanado de una línea para medir");

  const [fraction] = parseCadMText("\\S1/2;");
  eq(fraction[0].stack?.style, "fraction", "la barra da fracción con raya");
  const [diagonal] = parseCadMText("\\S3#4;");
  eq(diagonal[0].stack?.style, "diagonal", "la almohadilla da fracción diagonal");

  // Sin `;` de cierre: apila hasta el final del PÁRRAFO, no del texto entero.
  const unterminated = parseCadMText("\\S1^2\\Psiguiente");
  eq(unterminated.length, 2, "un \\S sin cerrar no se come el salto de párrafo");
  eq(unterminated[0][0].stack, { upper: "1", lower: "2", style: "tolerance" }, "apilado cerrado por el salto");
  eq(unterminated[1][0].text, "siguiente", "el párrafo siguiente sobrevive");

  // Sin separador no hay apilado: se conserva literal en vez de desaparecer.
  const [literal] = parseCadMText("\\Sabc");
  eq(literal[0].text, "\\Sabc", "un \\S sin separador se conserva tal cual");
  eq(literal[0].stack, undefined, "y no produce apilado");
}

// --- fuente, color y altura ------------------------------------------------------
{
  const [paragraph] = parseCadMText("\\fArial|b1|i0;texto");
  eq(paragraph[0].fontFamily, "Arial", "se lee la familia y se ignora el resto del código");
  const [colored] = parseCadMText("\\C1;rojo");
  eq(colored[0].color, "1", "color ACI");

  const [relative] = parseCadMText("\\H2x;grande");
  eq(relative[0].heightScale, 2, "altura relativa: multiplicador");
  eq(cadMTextRunHeight(relative[0], 120), 240, "120 × 2 = 240");

  const [absolute] = parseCadMText("\\H300;fijo");
  eq(cadMTextRunHeight(absolute[0], 120), 300, "la altura absoluta ignora la de la entidad");
}

// --- llaves: el grupo devuelve los atributos a su valor anterior -------------------
{
  const [paragraph] = parseCadMText("a{\\Lb}c");
  eq(paragraph.map((run) => run.text), ["a", "b", "c"], "tres tramos");
  eq(paragraph.map((run) => run.underline), [false, true, false], "el subrayado no escapa del grupo");
  eq(cadMTextPlainText("a{\\Lb}c"), "abc", "las llaves no son contenido");
}

// --- literales escapados ----------------------------------------------------------
{
  eq(cadMTextPlainText("C:\\\\planos"), "C:\\planos", "\\\\ es una barra literal");
  eq(cadMTextPlainText("\\{no es grupo\\}"), "{no es grupo}", "llaves escapadas son literales");
  eq(escapeCadMText("a{b}c\\d"), "a\\{b\\}c\\\\d", "escapar y volver");
  eq(cadMTextPlainText(escapeCadMText("a{b}c\\d")), "a{b}c\\d", "ida y vuelta exacta");
}

// --- un código desconocido NO se come el contenido ----------------------------------
{
  // Es la diferencia entre «no lo entiendo» y «lo borro»: un dibujo importado
  // puede traer códigos que este módulo no conoce, y tragárselos quitaría texto
  // del plano sin que nada avisara.
  eq(cadMTextPlainText("\\Q30;inclinado"), "\\Q30;inclinado", "el código desconocido queda visible");
}

// --- constructor de apilados --------------------------------------------------------
{
  eq(cadMTextStackCode("+0.05", "-0.02"), "\\S+0.05^-0.02;", "tolerancia por defecto");
  eq(cadMTextStackCode("1", "2", "fraction"), "\\S1/2;", "fracción con raya");
  const [paragraph] = parseCadMText(cadMTextStackCode("+0.1", "-0.1"));
  eq(paragraph[0].stack, { upper: "+0.1", lower: "-0.1", style: "tolerance" }, "lo construido se vuelve a leer");
}

// --- la maqueta CONSUME los códigos ---------------------------------------------------
{
  // Rule 6 del repositorio: construir el módulo no es entregarlo. Si
  // `mtext-layout` no lo llamara, todo lo de arriba estaría verde y el producto
  // seguiría dibujando `\S1^2;` como diez caracteres.
  const layout = layoutCadMText({
    id: "m1", type: "mtext", insertion: { x: 0, y: 0, z: 0 },
    text: "Ø25\\S+0.05^-0.02;", height: 100, width: 10_000, layer: "0",
  });
  eq(layout.lines.length, 1, "una sola línea");
  eq(layout.lines[0].text, "Ø25+0.05/-0.02", "la maqueta ya no ve el código");

  const paragraphs = layoutCadMText({
    id: "m2", type: "mtext", insertion: { x: 0, y: 0, z: 0 },
    text: "primera\\Psegunda", height: 100, width: 10_000, layer: "0",
  });
  eq(paragraphs.lines.map((line) => line.text), ["primera", "segunda"], "\\P sigue partiendo párrafos");
}

console.log(
  `mtext-codes: ${checks} comprobaciones · \\P \\L \\l \\O \\o \\S(^ / #) \\f \\C \\H {} y escapes; ` +
    "códigos desconocidos conservados; `layoutCadMText` los consume",
);
