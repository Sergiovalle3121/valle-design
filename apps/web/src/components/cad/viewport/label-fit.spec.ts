/**
 * Que el rótulo quepa en su cartel.
 *
 * El defecto que cierra se veía en la portada: `makeNoteLabel` topaba la
 * anchura del cartel en 520 px y luego dibujaba el texto ENTERO centrado
 * encima, así que lo que sobraba se salía por los dos lados. En /demo se leía
 * «bitación — plantilla universal» en vez de «Casa habitación — plantilla
 * universal», en la primera pantalla que ve cualquiera.
 *
 * Correr: npx tsx src/components/cad/viewport/label-fit.spec.ts
 */
import { strict as assert } from "node:assert";
import { cadFitLabelText } from "./label-fit";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

/** Medidor de mentira, proporcional: cada carácter mide medio tamaño de letra. */
const medir = (texto: string, tamano: number) => texto.length * tamano * 0.5;

// ── Lo que cabe no se toca ──────────────────────────────────────────────────
{
  const corto = cadFitLabelText("SALA", 40, 520, medir);
  eq(corto.text, "SALA", "un rótulo corto se queda igual");
  eq(corto.fontSize, 40, "y con su tamaño de siempre");
  eq(corto.truncated, false, "sin recortar nada");
}

// ── Lo que no cabe, encoge antes que perder letras ──────────────────────────
{
  // 40 caracteres × 0,5 × 40 px = 800 px, más de los 520 del cartel.
  const largo = "Casa habitación — plantilla universal!!!";
  eq(medir(largo, 40), 800, "el caso de partida: 800 px contra un cartel de 520");
  const ajustado = cadFitLabelText(largo, 40, 520, medir);
  eq(ajustado.text, largo, "PRIMERO se encoge la letra: no se pierde ni una letra del rótulo");
  ok(ajustado.fontSize < 40, `y el tamaño baja (dio ${ajustado.fontSize})`);
  ok(
    medir(ajustado.text, ajustado.fontSize) <= 520,
    "y el resultado CABE, que es lo que no pasaba antes",
  );
  eq(ajustado.truncated, false, "sin recortar");
}

// ── Pero no encoge hasta lo ilegible: por debajo del 60 %, recorta ──────────
{
  // 200 caracteres: ni al 60 % del tamaño cabe en 520 px.
  const larguísimo = "a".repeat(200);
  const ajustado = cadFitLabelText(larguísimo, 40, 520, medir);
  eq(ajustado.fontSize, 24, "el suelo es el 60 % del tamaño: 24 px de 40");
  eq(ajustado.truncated, true, "y entonces sí se recorta");
  ok(ajustado.text.endsWith("…"), "recortar se DICE con puntos suspensivos, no en silencio");
  ok(
    medir(ajustado.text, ajustado.fontSize) <= 520,
    "y lo recortado cabe: ese era el defecto entero",
  );
  ok(
    ajustado.text.length > 10,
    `queda texto suficiente para reconocer el rótulo (dio ${ajustado.text.length} caracteres)`,
  );
}

// ── Casos de borde que no pueden reventar un plano ──────────────────────────
{
  eq(cadFitLabelText("", 40, 520, medir).text, "", "el texto vacío se queda vacío");
  eq(cadFitLabelText("SALA", 40, 0, medir).text, "SALA", "sin cartel que medir, no se toca nada");
  const unaLetra = cadFitLabelText("W", 40, 1, medir);
  ok(unaLetra.text.length <= 2, "con un cartel imposible, el rótulo no crece");
}

console.log(`✔ rótulos que caben: ${verdes} aserciones verdes`);
