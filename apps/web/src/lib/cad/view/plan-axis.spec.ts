import { strict as assert } from "node:assert";
import {
  PLAN_AXIS_Y_SCREEN_SIGN,
  planAxisDrawingToScreen,
  planAxisScreenToDrawing,
} from "./plan-axis";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}

// --- Round-trip con el signo vigente ---

{
  const drawingY = 500;
  const screenDy = planAxisDrawingToScreen(drawingY);
  const back = planAxisScreenToDrawing(screenDy);
  ok(back === drawingY, `round-trip vigente: ${drawingY} → ${screenDy} → ${back}`);
}

// --- Round-trip con signo explícito -1 (preparación para T20) ---

{
  const drawingY = -300;
  const screenDy = planAxisDrawingToScreen(drawingY, -1);
  const back = planAxisScreenToDrawing(screenDy, -1);
  ok(back === drawingY, `round-trip Y-up: ${drawingY} → ${screenDy} → ${back}`);
}

// --- El signo vigente es 1 ---

ok(PLAN_AXIS_Y_SCREEN_SIGN === 1, "el signo vigente es 1 (Y-abajo)");

// --- Propiedad: ida y vuelta para cualquier valor ---

for (const y of [0, 1, -1, 42.5, -9999]) {
  const s = planAxisDrawingToScreen(y);
  const d = planAxisScreenToDrawing(s);
  ok(d === y, `propiedad ∀y: drawToScreen(${y})→${s}, screenToDraw(${s})→${d}`);
}

console.log(`${checks} comprobaciones — plan-axis OK`);