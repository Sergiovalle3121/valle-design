/**
 * «Cuánto mide lo que acabas de cerrar», dicho por la línea de órdenes.
 *
 * La meta del encargo, literal: «alguien que nunca vio VALLECAD dibuja una
 * habitación cerrada y VE SUS M² en 60 segundos o menos». Antes de esto,
 * dibujar un rectángulo de 5900 × 4000 no enseñaba su superficie en ninguna
 * parte: había que abrir la paleta de propiedades, y allí sólo se leía la caja
 * que lo contiene.
 *
 * Aquí se fija lo que se dice, y —tan importante— cuándo se CALLA.
 *
 * Correr: npx tsx src/lib/cad/engine/commands/area-notice.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext } from "../command-types";
import { cadClosedShapeNotice, cadDrawingUnitOf } from "./area-notice";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

/** Un contexto mínimo: sólo se lee INSUNITS. */
function contexto(insunits?: number): CadCommandContext {
  const tabla = new Map<string, number>();
  if (insunits !== undefined) tabla.set("INSUNITS", insunits);
  return {
    variables: insunits === undefined ? undefined : { get: (k: string) => tabla.get(k) },
  } as unknown as CadCommandContext;
}

function rectangulo(w: number, h: number, closed = true): CadEntity {
  return {
    id: "e1",
    type: "polyline",
    layer: "0",
    closed,
    vertices: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  } as unknown as CadEntity;
}

// ── El caso del encargo ─────────────────────────────────────────────────────
{
  const aviso = cadClosedShapeNotice("Rectángulo", rectangulo(5_900, 4_000), contexto(4));
  eq(
    aviso,
    "Rectángulo · 23.60 m² · perímetro 19.80 m",
    "un cuarto de 5,9 × 4 m se anuncia en metros cuadrados, no en unidades de dibujo",
  );
}

// ── Lo que NO se anuncia ────────────────────────────────────────────────────
{
  eq(
    cadClosedShapeNotice("Polilínea", rectangulo(5_900, 4_000, false), contexto(4)),
    undefined,
    "una figura ABIERTA no se anuncia: su área es un número correcto sobre algo que el usuario no dibujó",
  );
  const degenerado = {
    id: "e2",
    type: "polyline",
    layer: "0",
    closed: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  } as unknown as CadEntity;
  eq(
    cadClosedShapeNotice("Polilínea", degenerado, contexto(4)),
    undefined,
    "dos vértices no encierran nada: se calla en vez de anunciar 0,00 m²",
  );
}

// ── La unidad sale de INSUNITS, como en el resto del motor ──────────────────
{
  eq(cadDrawingUnitOf(contexto(4)), "mm", "INSUNITS 4 son milímetros");
  eq(cadDrawingUnitOf(contexto(6)), "m", "INSUNITS 6 son metros");
  eq(cadDrawingUnitOf(contexto(1)), "in", "INSUNITS 1 son pulgadas");
  eq(cadDrawingUnitOf(contexto()), "mm", "sin tabla de variables manda el milímetro, y no revienta");

  // El mismo cuarto, dibujado en metros: mismo número en pantalla.
  const enMetros = cadClosedShapeNotice("Rectángulo", rectangulo(5.9, 4), contexto(6));
  ok(
    enMetros?.includes("23.60 m²"),
    `el mismo cuarto en un plano en metros dice los mismos m² (dijo: ${enMetros})`,
  );
  // Y en un plano en pies, en pies cuadrados.
  const enPies = cadClosedShapeNotice("Rectángulo", rectangulo(20, 12), contexto(2));
  ok(
    enPies?.includes("ft²"),
    `un plano en pies se dice en pies cuadrados (dijo: ${enPies})`,
  );
}

console.log(`✔ aviso de superficie: ${verdes} aserciones verdes`);
