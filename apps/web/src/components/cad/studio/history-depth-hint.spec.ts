/**
 * El indicador U/R distingue «diste un solo paso» de «el presupuesto de
 * memoria no deja conservar más» (T-24·2, F3-P-04).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CAD_HISTORY_FLOOR_ENTITIES, cadHistoryDepthHint } from "./history-depth-hint";

let checks = 0;
const ok = (c: boolean, m: string) => {
  assert.ok(c, m);
  checks += 1;
};

ok(!cadHistoryDepthHint(1, 500).floor, "un plano pequeño con un paso: es que diste un paso");
ok(!cadHistoryDepthHint(5, 60_000).floor, "un plano denso con cinco pasos: el suelo no manda todavía");
ok(cadHistoryDepthHint(1, CAD_HISTORY_FLOOR_ENTITIES).floor, "un plano denso con un paso: el presupuesto manda");
ok(cadHistoryDepthHint(0, 80_000).floor, "sin pasos en un plano denso también se explica");
ok(/no cabe más/.test(cadHistoryDepthHint(1, 50_000).title), "el título dice por qué, con palabras");
ok(cadHistoryDepthHint(3, 100).title === "Profundidad de deshacer/rehacer", "fuera del suelo, el título de siempre");

const evidencia = JSON.parse(readFileSync(new URL("../../../../../../docs/cad/evidence/document-limits.json", import.meta.url), "utf8")) as {
  undoDepthByTier?: { tiers?: Array<{ entities: number; steadyStateDepth: number }>; results?: unknown };
};
ok(typeof evidencia.undoDepthByTier === "object", "la evidencia medida existe (undoDepthByTier)");
const barra = readFileSync(new URL("./CadStatusBar.tsx", import.meta.url), "utf8");
ok(barra.includes("cadHistoryDepthHint(diagnostics.historyUndo, diagnostics.nativeEntityCount)"), "la barra de estado usa la pista con el recuento real de entidades");
ok(barra.includes('data-history-floor={'), "y lo publica en el DOM para que un golden lo lea");

console.log(`ok history-depth-hint: ${checks} comprobaciones`);
