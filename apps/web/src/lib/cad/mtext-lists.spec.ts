/**
 * Viñetas y listas numeradas de MTEXT: códigos de párrafo REALES
 * (`\pxi<primera>,l<izquierda>;`), no una convención inventada — y la maqueta
 * (`mtext-layout.ts`) que de verdad sangra la línea, medida en unidades de
 * dibujo contra la entrada.
 */
import { strict as assert } from "node:assert";
import {
  cadMTextBulletCode,
  cadMTextNumberedCode,
  cadMTextParagraphIndentCode,
  parseCadMText,
} from "./mtext-codes";
import { layoutCadMText, type CadMTextEntity } from "./mtext-layout";

let checks = 0;
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const close = (actual: number, expected: number, message: string, epsilon = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} ≠ ${expected}`);
  checks += 1;
};

function mtext(text: string, overrides: Partial<CadMTextEntity> = {}): CadMTextEntity {
  return {
    id: "m1",
    type: "mtext",
    insertion: { x: 0, y: 0, z: 0 },
    text,
    height: 100,
    width: 2_000,
    alignment: "top-left",
    layer: "0",
    ...overrides,
  } as CadMTextEntity;
}

// --- el código generado es el real de AutoCAD, no una invención ------------------------
{
  eq(cadMTextParagraphIndentCode(-6, 6), "\\pxi-6,l6;", "sangría francesa, tal cual la escribe AutoCAD");
  eq(
    cadMTextBulletCode("Zapata corrida"),
    "\\pxi-6,l6;•\\~Zapata corrida",
    "viñeta: sangría, el carácter, espacio duro y el texto",
  );
  eq(
    cadMTextNumberedCode(3, "Losa de cimentación"),
    "\\pxi-8,l8;3.\\~Losa de cimentación",
    "numerada: el número con punto en vez de viñeta",
  );
}

// --- el analizador lee i y l, y el texto plano ya no enseña el código ------------------
{
  const source = [cadMTextBulletCode("Uno"), cadMTextBulletCode("Dos")].join("\\P");
  const paragraphs = parseCadMText(source);
  eq(paragraphs.length, 2, "dos párrafos, uno por viñeta");
  eq(paragraphs[0][0].paragraphIndent, { first: -6, left: 6 }, "sangría francesa leída en el primero");
  eq(paragraphs[1][0].paragraphIndent, { first: -6, left: 6 }, "y en el segundo, cada uno con su propio código");
}

// --- la maqueta sangra de verdad: la viñeta en x=0, el texto tras la sangría -----------
{
  const entity = mtext(cadMTextBulletCode("Item corto"));
  const layout = layoutCadMText(entity);
  eq(layout.lines.length, 1, "cabe en una línea");
  close(layout.lines[0].x, 0, "la viñeta arranca en la columna 0 del párrafo (offset x)");
  eq(layout.lines[0].text.startsWith("•"), true, "la línea empieza por la viñeta");
}

// --- una lista de dos viñetas: dos líneas, misma sangría en las dos --------------------
{
  const entity = mtext([cadMTextBulletCode("Primera nota"), cadMTextBulletCode("Segunda nota")].join("\\P"));
  const layout = layoutCadMText(entity);
  eq(layout.lines.length, 2, "dos párrafos, dos líneas (caben cada una en su renglón)");
  close(layout.lines[0].x, 0, "primera viñeta en x=0");
  close(layout.lines[1].x, 0, "segunda viñeta también en x=0 (cada párrafo trae su propio código)");
  eq(layout.lines[0].text, "• Primera nota", "el espacio duro llega como carácter, no como \\~");
}

// --- una lista numerada que envuelve: la continuación queda sangrada, no en 0 ----------
{
  // Un texto largo con caja estrecha para forzar el ajuste de línea.
  const entity = mtext(
    cadMTextNumberedCode(1, "Excavación y retiro de material sobrante fuera de la obra"),
    { width: 600 },
  );
  const layout = layoutCadMText(entity);
  assert.ok(layout.lines.length >= 2, "el texto largo se parte en más de una línea");
  checks += 1;
  close(layout.lines[0].x, 0, "la primera línea (con «1.») arranca en 0");
  close(layout.lines[1].x, 8, "la continuación queda sangrada 8 — la anchura de `l`, no 0");
  assert.ok(!layout.lines[1].text.startsWith("1."), "la segunda línea no repite el número");
  checks += 1;
}

// --- sin código de párrafo, el comportamiento no cambia ni un punto --------------------
{
  const entity = mtext("Nota corriente\\Psin viñeta");
  const layout = layoutCadMText(entity);
  eq(layout.lines.length, 2, "dos párrafos llanos");
  close(layout.lines[0].x, 0, "sin sangría, x en 0 como siempre");
  close(layout.lines[1].x, 0, "las dos líneas");
}

console.log(
  `mtext-lists: ${checks} comprobaciones · \\pxi real, viñeta y numerada, sangría francesa medida en geometría`,
);
