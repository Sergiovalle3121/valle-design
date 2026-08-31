/**
 * El recorrido guiado, medido.
 *
 * Lo que se afirma es lo que el recorrido promete y lo que rompería si fallara:
 *
 *  1. Los cinco pasos terminan en un PDF, y los cuatro del medio son ACCIONES
 *     sobre el dibujo, no explicaciones.
 *  2. El progreso se lee del DIBUJO: un muro dibujado con WA y otro dibujado a
 *     mano en la capa de muros cuentan los dos, porque el recorrido premia el
 *     resultado. Una puerta cuenta si el INSERT apunta a un bloque de puerta —la
 *     sembrada o la dinámica—, no si el usuario pulsó cierto botón.
 *  3. El paso ACTUAL es el primero sin hacer, no el siguiente al último hecho:
 *     quien acota antes de poner la puerta no se salta la puerta.
 *  4. Se puede SALTAR en cualquier momento, y saltado no reaparece.
 *  5. Se MIDE: el reloj entra por parámetro y la duración es exacta.
 */
import { strict as assert } from "node:assert";
import type { CadCommandDocumentView } from "../engine/command-types";
import {
  CAD_GUIDED_TOUR_STEPS,
  CAD_GUIDED_TOUR_TARGET_MS,
  EMPTY_CAD_TOUR_RECORD,
  cadGuidedTourDuration,
  cadGuidedTourProgress,
  cadGuidedTourReduce,
  cadGuidedTourStep,
  cadGuidedTourStepCopy,
  cadGuidedTourWithinTarget,
  cadTourBlockIsDoor,
  cadTourLaminaReady,
  cadTourStepDone,
  formatCadTourDuration,
  parseCadTourRecord,
  type CadTourRecord,
} from "./guided-tour";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function view(patch: Partial<CadCommandDocumentView> = {}): CadCommandDocumentView {
  return {
    meta: { version: 1, schema: 6, unit: "mm" },
    entities: [],
    blocks: [],
    layers: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    externalReferences: [],
    modelSpace: { entityIds: [] },
    ...patch,
  } as CadCommandDocumentView;
}

const wall = {
  id: "muro-1",
  type: "wall",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 4_000, y: 0, z: 0 },
  thickness: 200,
  height: 2_400,
  layer: "MURO",
} as unknown as CadCommandDocumentView["entities"][number];

const doorBlock = {
  id: "valle:arq:puerta-abatible-90",
  name: "Puerta abatible 0.90 m",
  basePoint: { x: 0, y: 0, z: 0 },
  entities: [],
  version: 1,
} as unknown as CadCommandDocumentView["blocks"][number];

const doorInsert = {
  id: "puerta-1",
  type: "insert",
  block: "valle:arq:puerta-abatible-90",
  insertion: { x: 1_000, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  layer: "architecture",
} as unknown as CadCommandDocumentView["entities"][number];

const dimension = {
  id: "cota-1",
  type: "dimension",
  layer: "COTA",
} as unknown as CadCommandDocumentView["entities"][number];

// --- 1. LOS CINCO PASOS ------------------------------------------------------
{
  assert.equal(CAD_GUIDED_TOUR_STEPS.length, 5);
  assert.deepEqual(
    CAD_GUIDED_TOUR_STEPS.map((step) => step.id),
    ["lamina", "muro", "puerta", "cota", "pdf"],
  );
  // Termina en un archivo, no en un globo de ayuda.
  assert.equal(CAD_GUIDED_TOUR_STEPS.at(-1)?.id, "pdf");
  for (const step of CAD_GUIDED_TOUR_STEPS) {
    assert.equal(cadGuidedTourStep(step.id), step);
    ok(step.instruction.length > 20, `${step.id} dice qué hacer`);
    ok(step.hint.length > 10, `${step.id} trae el detalle que desatasca`);
  }
  // Los cuatro pasos de acción tienen orden tecleable: el recorrido enseña el
  // producto, y en un CAD el producto se teclea.
  for (const id of ["muro", "puerta", "cota", "pdf"])
    ok(!!cadGuidedTourStep(id)?.command, `${id} tiene comando`);
  assert.equal(cadGuidedTourStep("lamina")?.command, undefined);
  assert.equal(cadGuidedTourStep("inexistente"), undefined);
}

// --- 2. EL PROGRESO SE LEE DEL DIBUJO ---------------------------------------
{
  // Vacío: nada hecho, y el paso actual es el primero.
  const inicial = cadGuidedTourProgress({ document: view() });
  assert.deepEqual(inicial.doneStepIds, []);
  assert.equal(inicial.currentStepId, "lamina");
  assert.equal(inicial.completed, false);
  assert.equal(inicial.percent, 0);

  // Sin documento no se inventa progreso.
  assert.equal(cadTourStepDone("muro", {}), false);
  assert.equal(cadTourStepDone("muro", { document: null }), false);

  // El muro paramétrico cuenta…
  assert.equal(cadTourStepDone("muro", { document: view({ entities: [wall] }) }), true);
  // …y el dibujado a mano en la capa de muros TAMBIÉN. Decirle «eso no cuenta»
  // a quien acaba de dibujar un muro sería mentirle.
  const aMano = {
    id: "muro-2",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 4_000, y: 0, z: 0 },
    layer: "MURO",
  } as unknown as CadCommandDocumentView["entities"][number];
  assert.equal(cadTourStepDone("muro", { document: view({ entities: [aMano] }) }), true);
  // Una línea en otra capa NO es un muro: si no, cualquier trazo cerraría el paso.
  const suelta = { ...(aMano as unknown as { layer: string }), layer: "AUXILIAR" };
  assert.equal(
    cadTourStepDone("muro", {
      document: view({ entities: [suelta as unknown as typeof aMano] }),
    }),
    false,
  );

  // La puerta necesita el INSERT **y** su definición: un INSERT huérfano no
  // dibuja nada, y darlo por bueno cerraría el paso con el plano vacío.
  assert.equal(
    cadTourStepDone("puerta", { document: view({ entities: [doorInsert] }) }),
    false,
  );
  assert.equal(
    cadTourStepDone("puerta", { document: view({ blocks: [doorBlock] }) }),
    false,
  );
  assert.equal(
    cadTourStepDone("puerta", {
      document: view({ entities: [doorInsert], blocks: [doorBlock] }),
    }),
    true,
  );
  // Un bloque que no es puerta no cuela.
  const wcBlock = { ...doorBlock, id: "valle:arq:wc", name: "WC" };
  assert.equal(
    cadTourStepDone("puerta", {
      document: view({
        entities: [{ ...(doorInsert as unknown as { block: string }), block: "valle:arq:wc" } as unknown as typeof doorInsert],
        blocks: [wcBlock],
      }),
    }),
    false,
  );
  // La sembrada, la dinámica y una propia llamada «PUERTA» cuentan las tres.
  ok(cadTourBlockIsDoor({ id: "valle:arq:puerta-abatible-90" }), "la sembrada es puerta");
  ok(
    cadTourBlockIsDoor({ id: "valle:din:puerta-abatible:claro=900" }),
    "la dinámica es puerta",
  );
  ok(cadTourBlockIsDoor({ id: "b-17", name: "PUERTA ACCESO" }), "la propia es puerta");
  ok(!cadTourBlockIsDoor({ id: "valle:arq:ventana-corrediza-120" }), "una ventana no");

  // La cota: vale la cota y vale la directriz acotada.
  assert.equal(cadTourStepDone("cota", { document: view({ entities: [dimension] }) }), true);

  // El PDF NO se lee del dibujo, y es correcto: trazar no cambia el documento.
  const conTodo = view({ entities: [wall, doorInsert, dimension], blocks: [doorBlock] });
  assert.equal(cadTourStepDone("pdf", { document: conTodo }), false);
  assert.equal(cadTourStepDone("pdf", { plotted: true }), true);
}

// --- 3. EL PASO ACTUAL ES EL PRIMERO SIN HACER ------------------------------
{
  // Quien acota ANTES de poner la puerta no se salta la puerta.
  const salteado = cadGuidedTourProgress({
    acknowledged: true,
    document: view({ entities: [wall, dimension] }),
  });
  assert.deepEqual(salteado.doneStepIds, ["lamina", "muro", "cota"]);
  assert.equal(salteado.currentStepId, "puerta");
  assert.equal(salteado.percent, 60);

  // Y con los cinco, no hay paso actual y el recorrido está completo.
  const completo = cadGuidedTourProgress({
    acknowledged: true,
    plotted: true,
    document: view({ entities: [wall, doorInsert, dimension], blocks: [doorBlock] }),
  });
  assert.deepEqual(completo.doneStepIds, ["lamina", "muro", "puerta", "cota", "pdf"]);
  assert.equal(completo.currentStepId, null);
  assert.equal(completo.completed, true);
  assert.equal(completo.percent, 100);
}

// --- 4. SALTABLE, Y SALTADO NO REAPARECE -------------------------------------
{
  let record: CadTourRecord = { ...EMPTY_CAD_TOUR_RECORD };
  assert.equal(record.status, "pending");
  record = cadGuidedTourReduce(record, { type: "start", now: 1_000 });
  assert.equal(record.status, "running");
  assert.equal(record.startedAt, 1_000);
  // Arrancar dos veces no reinicia el reloj: se devuelve el MISMO objeto.
  const otraVez = cadGuidedTourReduce(record, { type: "start", now: 9_999 });
  assert.equal(otraVez, record);

  record = cadGuidedTourReduce(record, { type: "skip", now: 61_000 });
  assert.equal(record.status, "skipped");
  assert.equal(record.finishedAt, 61_000);
  // Saltado NO vuelve a arrancar: un recorrido que reaparece es un anuncio.
  assert.equal(cadGuidedTourReduce(record, { type: "start", now: 70_000 }), record);
  assert.equal(cadGuidedTourReduce(record, { type: "complete", now: 70_000 }), record);
  // Sólo se reabre pidiéndolo.
  const reiniciado = cadGuidedTourReduce(record, { type: "reset" });
  assert.deepEqual(reiniciado, EMPTY_CAD_TOUR_RECORD);
}

// --- 5. SE MIDE --------------------------------------------------------------
{
  let record: CadTourRecord = { ...EMPTY_CAD_TOUR_RECORD };
  assert.equal(cadGuidedTourDuration(record), null);
  assert.equal(cadGuidedTourWithinTarget(record), null);

  record = cadGuidedTourReduce(record, { type: "start", now: 1_000_000 });
  // Mientras corre no hay duración: un cronómetro sin parar no es una medida.
  assert.equal(cadGuidedTourDuration(record), null);
  record = cadGuidedTourReduce(record, { type: "acknowledge" });
  record = cadGuidedTourReduce(record, { type: "plot", now: 1_000_000 });
  assert.equal(record.acknowledged, true);
  assert.equal(record.plotted, true);
  record = cadGuidedTourReduce(record, { type: "complete", now: 1_000_000 + 222_000 });
  assert.equal(record.status, "completed");
  assert.equal(cadGuidedTourDuration(record), 222_000);
  assert.equal(formatCadTourDuration(222_000), "3 min 42 s");
  assert.equal(formatCadTourDuration(41_000), "41 s");
  assert.equal(cadGuidedTourWithinTarget(record), true);
  assert.equal(CAD_GUIDED_TOUR_TARGET_MS, 300_000);

  // Y uno que se pasa del objetivo lo DICE. El objetivo es del recorrido, no
  // del usuario: si nadie lo cumple, el recorrido está mal.
  const lento = cadGuidedTourReduce(
    cadGuidedTourReduce({ ...EMPTY_CAD_TOUR_RECORD }, { type: "start", now: 1_000 }),
    { type: "complete", now: 401_000 },
  );
  assert.equal(cadGuidedTourWithinTarget(lento), false);
  assert.equal(cadGuidedTourDuration(lento), 400_000);
  // Un final ANTERIOR al inicio no es una duración negativa: es que no hay dato.
  assert.equal(
    cadGuidedTourDuration({ ...EMPTY_CAD_TOUR_RECORD, startedAt: 10, finishedAt: 5 }),
    null,
  );
}

// --- 6. EL REGISTRO PERSISTIDO TOLERA BASURA ---------------------------------
{
  assert.deepEqual(parseCadTourRecord(null), EMPTY_CAD_TOUR_RECORD);
  assert.deepEqual(parseCadTourRecord("{no es json"), EMPTY_CAD_TOUR_RECORD);
  assert.deepEqual(parseCadTourRecord('{"status":"inventado"}'), EMPTY_CAD_TOUR_RECORD);
  const guardado = JSON.stringify({
    status: "completed",
    startedAt: 5,
    finishedAt: 305,
    acknowledged: true,
    plotted: true,
  });
  const leido = parseCadTourRecord(guardado);
  assert.equal(leido.status, "completed");
  assert.equal(cadGuidedTourDuration(leido), 300);
  // Un registro a medias no se cuela con `true` de regalo.
  assert.equal(parseCadTourRecord('{"status":"running"}').acknowledged, false);
  assert.equal(parseCadTourRecord('{"status":"running"}').startedAt, 0);
}

// Regla 3 (AGENTS.md): ninguna capacidad se anuncia sin evidencia. El primer
// paso NO puede afirmar «tu lámina ya está puesta» delante de un documento en
// blanco — antes lo hacía siempre, sin mirar el documento.
{
  const laminaStep = CAD_GUIDED_TOUR_STEPS.find((step) => step.id === "lamina")!;

  ok(cadTourLaminaReady(null) === false, "sin documento, la lámina no está lista");
  ok(
    cadTourLaminaReady(view()) === false,
    "un documento en blanco (una capa, sin estilos de cota con nombre) no cuenta como listo",
  );
  ok(
    cadTourLaminaReady(
      view({ layers: [{ id: "0" }] as unknown as CadCommandDocumentView["layers"] }),
    ) === false,
    "una sola capa —la base de cualquier documento nuevo— tampoco cuenta",
  );
  ok(
    cadTourLaminaReady(
      view({
        layers: [{ id: "0" }, { id: "MURO" }] as unknown as CadCommandDocumentView["layers"],
      }),
    ) === true,
    "más de una capa es evidencia de que algo configuró la lámina",
  );
  ok(
    cadTourLaminaReady(
      view({
        styles: {
          text: {},
          dimension: { Standard: {}, "COTA-1:100": {} },
          mleader: {},
          table: {},
          plot: {},
        },
      }),
    ) === true,
    "más de un estilo de cota también cuenta",
  );

  const blanco = cadGuidedTourStepCopy(laminaStep, { document: view() });
  ok(
    blanco.title !== laminaStep.title && !/ya está puesta/.test(blanco.instruction),
    "sobre un documento en blanco, el título deja de afirmar que la lámina ya está puesta",
  );
  ok(!/No hay nada que configurar/.test(blanco.instruction), "y no dice que no hay nada que configurar");

  const conPlantilla = cadGuidedTourStepCopy(laminaStep, {
    document: view({
      layers: [{ id: "0" }, { id: "MURO" }] as unknown as CadCommandDocumentView["layers"],
    }),
  });
  ok(
    conPlantilla.title === laminaStep.title && conPlantilla.instruction === laminaStep.instruction,
    "con plantilla real, el mensaje original —cierto en ese caso— se mantiene",
  );

  // Los otros cuatro pasos son ACCIONES, no afirmaciones sobre el estado de
  // partida: su copia no cambia con la evidencia.
  const muroStep = CAD_GUIDED_TOUR_STEPS.find((step) => step.id === "muro")!;
  ok(
    cadGuidedTourStepCopy(muroStep, { document: view() }) === muroStep,
    "un paso que no es 'lamina' devuelve su propia copia sin tocar",
  );
}

console.log(`guided-tour.spec: ${checks} comprobaciones nombradas + aserciones directas OK`);
