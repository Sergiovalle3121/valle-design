/**
 * PUBLISH y SHEETSET, probados como máquina de estados pura: qué petición
 * emiten al anfitrión para cada secuencia de entradas tecleadas.
 *
 * El anfitrión que de verdad publica y renumera —`plot-host.ts`— tiene sus
 * propias pruebas contra bytes de PDF y contra `CadSheetSet` reales; aquí lo
 * que se afirma es que el COMANDO compone la petición correcta, que es lo que
 * antes de esta campaña ningún nombre en el registro hacía.
 */
import { strict as assert } from "node:assert";
import { CAD_SHEET_SET_COMMANDS } from "./sheet-set-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const [publish, sheetSet] = CAD_SHEET_SET_COMMANDS;
ok(publish.name === "PUBLISH", "el primero es PUBLISH");
ok(sheetSet.name === "SHEETSET", "el segundo es SHEETSET");

const NOOP_CONTEXT = {
  entityIds: [],
  selection: [],
  activeLayer: "0",
  view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
  newEntityId: () => "x",
} as const;

// --- PUBLISH: id + Enter = todas las hojas ----------------------------------
{
  const begin = publish.begin(NOOP_CONTEXT);
  const withId = publish.step(begin.state, { kind: "text", value: "set:nave" }, NOOP_CONTEXT);
  ok(withId.result === undefined, "todavía pide las hojas antes de terminar");
  const finished = publish.step(withId.state, { kind: "enter" }, NOOP_CONTEXT);
  ok(finished.result?.kind === "host", "termina con una petición al anfitrión");
  if (finished.result?.kind === "host") {
    ok(finished.result.request.kind === "publish", "la petición es PUBLISH");
    if (finished.result.request.kind === "publish") {
      ok(finished.result.request.sheetSetId === "set:nave", "el identificador tecleado se respeta");
      ok(finished.result.request.sheetIds === undefined, "sin hojas escritas, se publican TODAS — no una lista vacía");
    }
  }
}

// --- PUBLISH: id + hojas concretas, separadas por coma ----------------------
{
  const begin = publish.begin(NOOP_CONTEXT);
  const withId = publish.step(begin.state, { kind: "text", value: "set:nave" }, NOOP_CONTEXT);
  const finished = publish.step(withId.state, { kind: "text", value: "s1, s2 ,s3" }, NOOP_CONTEXT);
  if (finished.result?.kind === "host" && finished.result.request.kind === "publish") {
    assert.deepEqual(finished.result.request.sheetIds, ["s1", "s2", "s3"], "se separan y se recortan los espacios");
    checks += 1;
  } else assert.fail("PUBLISH con hojas concretas tiene que terminar en una petición");
}

// --- PUBLISH: Esc cancela sin pedir nada al anfitrión -----------------------
{
  const begin = publish.begin(NOOP_CONTEXT);
  const cancelled = publish.step(begin.state, { kind: "cancel" }, NOOP_CONTEXT);
  ok(cancelled.result?.kind === "none", "Esc termina sin efecto, no en una petición");
}

// --- SHEETSET Renumerar: id + palabra clave ---------------------------------
{
  const begin = sheetSet.begin(NOOP_CONTEXT);
  const withId = sheetSet.step(begin.state, { kind: "text", value: "set:nave" }, NOOP_CONTEXT);
  ok(withId.prompt.options.some((option) => option.keyword === "Renumerar"), "ofrece Renumerar entre las opciones");
  const finished = sheetSet.step(withId.state, { kind: "keyword", keyword: "Renumerar" }, NOOP_CONTEXT);
  if (finished.result?.kind === "host" && finished.result.request.kind === "sheet-set-command") {
    assert.equal(finished.result.request.action, "renumber");
    assert.equal(finished.result.request.sheetSetId, "set:nave");
    checks += 1;
  } else assert.fail("Renumerar tiene que terminar en una petición sheet-set-command");
}

// --- SHEETSET Añadir: tres campos de texto y termina con la hoja completa --
{
  const begin = sheetSet.begin(NOOP_CONTEXT);
  const withId = sheetSet.step(begin.state, { kind: "text", value: "set:nave" }, NOOP_CONTEXT);
  const chosen = sheetSet.step(withId.state, { kind: "keyword", keyword: "Añadir" }, NOOP_CONTEXT);
  const withDoc = sheetSet.step(chosen.state, { kind: "text", value: "doc:planta" }, NOOP_CONTEXT);
  const withLayout = sheetSet.step(withDoc.state, { kind: "text", value: "layout:a-101" }, NOOP_CONTEXT);
  const finished = sheetSet.step(withLayout.state, { kind: "text", value: "Planta baja" }, NOOP_CONTEXT);
  if (finished.result?.kind === "host" && finished.result.request.kind === "sheet-set-command") {
    assert.equal(finished.result.request.action, "add");
    assert.deepEqual(finished.result.request.sheet, {
      documentId: "doc:planta",
      layoutId: "layout:a-101",
      title: "Planta baja",
    });
    checks += 1;
  } else assert.fail("Añadir tiene que terminar con la hoja completa");
}

console.log(`sheet-set-commands.spec: ${checks} comprobaciones OK`);
