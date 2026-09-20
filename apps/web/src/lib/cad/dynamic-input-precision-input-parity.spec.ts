import assert from 'node:assert/strict';
import { parseCoordinate, type ParseContext } from './precision-input';
import { parseCadDynamicScalar } from './dynamic-input';
import type { CadDrawingUnit } from './units-imperial';

/**
 * `precision-input.ts` (la línea de comandos) y `dynamic-input.ts` (los
 * campos junto al cursor) son DOS analizadores de la misma tecla. Antes del
 * 2026-09-19 no coincidían: `dynamic-input.ts` leía una coma como separador
 * decimal cuando el idioma empezaba por «es» o «de», y `precision-input.ts`
 * jamás — la reserva, como AutoCAD, para separar los componentes de una
 * coordenada (`5,300`). El mismo texto, «1,5», significaba media unidad
 * distinta según qué mitad del formulario lo leyera. Eso es F1 de la
 * campaña «que se sienta AutoCAD al teclear».
 *
 * Ahora los dos comparten gramática (`parseImperialLength`, de
 * `units-imperial.ts`) para el número desnudo de un campo. Este spec no dejar
 * que se vuelvan a separar: alimenta el mismo texto a los dos caminos y
 * exige la misma lectura de la coma, del punto decimal y de las marcas de
 * pie/pulgada.
 */

/**
 * La «distancia directa» de la línea de comandos: un número desnudo con
 * ángulo ya bloqueado y un punto previo, que es el mismo campo escalar que
 * `dynamic-input.ts` resuelve para «distance», «x» o «radius». Con el punto
 * previo en el origen y el ángulo bloqueado a 0°, el punto resultante cae
 * en (magnitud, 0) — así que su `x` ES la magnitud que se tecleó.
 */
function directDistance(text: string, drawingUnit?: CadDrawingUnit): number | null {
  const ctx: ParseContext = { last: { x: 0, y: 0 }, lockedAngleDeg: 0, drawingUnit };
  const result = parseCoordinate(text, ctx);
  return result.ok ? result.point.x : null;
}

// ── La coma jamás es decimal, en ninguna de las dos rutas ──────────────────
// Como campo YA AISLADO (el «x» o la «distancia» de la entrada dinámica no
// tienen un segundo componente que separar), «1,5» no significa nada — ni
// 1.5 ni ninguna otra cosa — así el idioma sea el que sea.
for (const locale of ['es-MX', 'en-US', 'de-DE']) {
  assert.equal(
    parseCadDynamicScalar('1,5', 'in', locale),
    null,
    `dynamic-input debe rechazar "1,5" (${locale}): la coma nunca es decimal`,
  );
}

// En `precision-input.ts` la MISMA coma SÍ tiene lectura — pero como
// COORDENADA (dos componentes), nunca como el decimal 1.5. Es la prueba de
// que la coma tiene un solo significado en todo el producto: separador,
// jamás decimal. (No hay forma de pedirle a `precision-input.ts` que lea
// «1,5» como un escalar suelto: en cuanto ve la coma, es una coordenada.)
const asCoordinate = parseCoordinate('1,5');
assert.ok(asCoordinate.ok && asCoordinate.mode === 'absolute');
if (asCoordinate.ok) {
  assert.equal(asCoordinate.point.x, 1);
  assert.equal(asCoordinate.point.y, 5);
}

// ── El punto SIEMPRE es decimal, y coinciden en el valor exacto ────────────
const drawingUnits: CadDrawingUnit[] = ['mm', 'in'];
for (const unit of drawingUnits) {
  for (const locale of ['es-MX', 'en-US']) {
    const fromCommandLine = directDistance('1.5', unit);
    const fromDynamicInput = parseCadDynamicScalar('1.5', unit, locale);
    assert.equal(fromCommandLine, 1.5, `precision-input lee "1.5" como 1.5 (${unit})`);
    assert.equal(fromDynamicInput, 1.5, `dynamic-input lee "1.5" como 1.5 (${unit}, ${locale})`);
  }
}

// ── Grillas de textos superpuestos: misma lectura exacta en las dos rutas ──
// (Sin sufijo de unidad de texto — «mm»/«cm»/mismos — que solo entiende
// `dynamic-input.ts`; el resto de la gramática, pies/pulgadas/fracciones
// incluidos, es AHORA la misma función en las dos.)
const sharedTexts = ['12', '-3.25', '1/2', '6"', "1'-6\"", "1'", '.5'];
for (const unit of drawingUnits) {
  for (const text of sharedTexts) {
    const fromCommandLine = directDistance(text, unit);
    const fromDynamicInput = parseCadDynamicScalar(text, unit, 'es-MX');
    assert.equal(
      fromDynamicInput,
      fromCommandLine,
      `"${text}" debe leerse igual en las dos rutas (unidad del dibujo = ${unit}): línea de comandos=${fromCommandLine}, entrada dinámica=${fromDynamicInput}`,
    );
  }
}

console.log('dynamic-input/precision-input: un solo analizador de coordenadas — la coma nunca es decimal');
