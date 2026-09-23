/**
 * Las medidas en lenguaje de obra.
 *
 * La meta del encargo es literal: «alguien que nunca vio VALLECAD dibuja una
 * habitación cerrada y VE SUS M² en 60 segundos o menos». Medido el 2026-09-23
 * sobre la compilación de producción, un rectángulo de 5900 × 4000 dibujado en
 * /demo no enseñaba su área en ninguna parte: la paleta decía «BOUNDS 5900 ×
 * 4000» y ahí se acababa. Este módulo es la mitad que faltaba, y lo que sigue
 * fija su contrato.
 *
 * Correr: npx tsx src/lib/cad/inquiry/human-units.spec.ts
 */
import { strict as assert } from "node:assert";
import { formatCadHumanArea, formatCadHumanLength } from "./human-units";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

// ── El caso del encargo: una habitación en un plano en milímetros ───────────
{
  // 5900 × 4000 mm = 23,6 m². Es el rectángulo que se dibujó al medir.
  eq(
    formatCadHumanArea(5_900 * 4_000, "mm"),
    "23.60 m²",
    "una habitación de 5,9 × 4 m se dice en metros cuadrados, no en 23 600 000",
  );
  eq(
    formatCadHumanLength(5_900, "mm"),
    "5.90 m",
    "y su lado, en metros",
  );
}

// ── Cada unidad métrica llega al mismo metro cuadrado ───────────────────────
{
  eq(formatCadHumanArea(23.6, "m"), "23.60 m²", "en metros, el número ya es el bueno");
  eq(formatCadHumanArea(236_000, "cm"), "23.60 m²", "en centímetros, lo mismo");
  eq(formatCadHumanArea(0.0000236, "km"), "23.60 m²", "y en kilómetros, también");
}

// ── Lo pequeño no se redondea a cero ────────────────────────────────────────
{
  // 40 × 40 mm = 1600 mm² = 0,0016 m². En m² sería «0.00 m²», que no es una
  // medida: es un cero que parece un fallo.
  eq(formatCadHumanArea(1_600, "mm"), "16 cm²", "por debajo de 0,01 m² se baja a cm²");
  eq(formatCadHumanLength(45, "mm"), "4.5 cm", "y una longitud corta, a centímetros");
}

// ── Un plano imperial se dice en pies ───────────────────────────────────────
{
  // 10 × 12 pies = 120 ft².
  eq(formatCadHumanArea(120, "ft"), "120.00 ft²", "en pies, pies cuadrados");
  eq(formatCadHumanLength(12, "ft"), "12.00 ft", "y la longitud en pies");
  // 6 × 6 pulgadas = 36 in² = 0,25 ft²: por debajo de medio pie, pulgadas.
  eq(formatCadHumanArea(36, "in"), "36 in²", "lo pequeño en imperial se dice en pulgadas");
  eq(formatCadHumanLength(6, "in"), "6.0 in", "y la longitud corta, también");
}

// ── Lo que NO se sabe no se inventa ─────────────────────────────────────────
{
  eq(
    formatCadHumanArea(23.6, "parsecs"),
    "23.60 u²",
    "una unidad desconocida se dice en unidades de dibujo: traducirla a ciegas sería mentir",
  );
  eq(formatCadHumanArea(23.6, undefined), "23.60 u²", "y sin unidad, lo mismo");
  eq(formatCadHumanLength(Number.NaN, "mm"), "—", "un número que no es número no se dibuja como cero");
  eq(formatCadHumanArea(Number.POSITIVE_INFINITY, "mm"), "—", "ni el infinito");
}

console.log(`✔ medidas en lenguaje de obra: ${verdes} aserciones verdes`);
