/**
 * Arnés de PERFILADO POR ETAPA del pipeline de render.
 *
 * ## La pregunta que vino a contestar
 *
 * El benchmark de Node publicaba un `firstDetailMs` y el spec de navegador un
 * `detailReadyMs`, y entre los dos había dos órdenes de magnitud sin explicar.
 * Un solo número por corrida no dice dónde se van los segundos, y sin saberlo
 * cualquier optimización es una apuesta. Aquí el recorrido de siempre se corre
 * con la instrumentación de `render-profile.ts` encendida y se publica el
 * reparto: teselar, escribir instancias, recalcular la vista, encolar trabajo,
 * armar el lote del worker y sembrar su respuesta.
 *
 * ## Las tres cosas que mide y que el benchmark normal NO medía
 *
 * 1. **El reparto por etapa** del trabajo de CPU del hilo principal.
 * 2. **La reconciliación por cuadro.** El bucle de Node llamaba a `runFrame` y
 *    nada más; el navegador llama además a `CadRenderScene.sync()`, que deriva
 *    los lotes visibles de TODOS los tiles residentes en CADA cuadro. Ese coste
 *    es O(tiles) por cuadro y no aparecía en ninguna cifra. Aquí se paga la
 *    parte pura de `sync()` —`visibleBatches` y `visibleTextRequests`— porque el
 *    ensamblado THREE necesita WebGL y en Node decirlo sería inventárselo.
 * 3. **El clonado estructural del `postMessage`.** En Node no hay `Worker`, así
 *    que el carril de fuera de hilo no se ejercitaba nunca. Se inyecta un
 *    teselador que hace EXACTAMENTE lo que hace el emisor de un `postMessage`:
 *    `structuredClone` del lote —el mismo algoritmo, y síncrono en el hilo que
 *    envía— y después tesela con la misma función núcleo que el worker. El
 *    tiempo del clon es coste real del hilo principal; el del teselado NO lo
 *    sería en el navegador, y por eso viajan en campos distintos.
 *
 * ## Lo que sigue sin medirse, dicho aquí para que nadie lo deduzca al revés
 *
 * GPU, composición, subida de atributos y rasterizado de glifos. En Node no hay
 * canvas ni contexto WebGL. El corpus determinista tampoco emite MTEXT, así que
 * `textRequest` sale en cero por construcción y no por ser gratis.
 */
import { performance } from "node:perf_hooks";
import { setImmediate as deferToEventLoop } from "node:timers";
import { deserialize as v8Deserialize, serialize as v8Serialize } from "node:v8";
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { CadRenderPipeline, type CadRenderView } from "./pipeline";
import type { CadOffThreadTessellator } from "./pipeline-offthread";
import {
  cadRenderStageTotalMs,
  startCadRenderProfile,
  stopCadRenderProfile,
  type CadRenderStageProfile,
} from "./render-profile";
import { tessellateCadEntityBatch } from "./tessellate.worker";
import { cadRound3, type CadRenderScenario } from "../benchmark/scenario";

export interface CadRenderStageMeasurement {
  /** `sync` (todo en el hilo principal) u `offthread` (con clonado real). */
  label: "sync" | "offthread";
  /** Etiqueta legible del recorrido, para que la tabla no haya que descifrarla. */
  scenarioLabel: string;
  /** `true` si el presupuesto quedó clavado en 4 ms (la política de antes). */
  fixedFrameBudget: boolean;
  /** Con `true`, cada cuadro paga además la parte pura de `scene.sync()`. */
  reconciled: boolean;
  firstDetailMs: number;
  framesToFirstDetail: number;
  zoomSettleMs: number;
  framesToZoomSettle: number;
  visibleAtRest: number;
  detailedAtRest: number;
  segmentsAtRest: number;
  stages: CadRenderStageProfile;
  /** Suma de las etapas. Frente al reloj de pared dice cuánto queda sin explicar. */
  stageTotalMs: number;
  /**
   * Coste de cuadro de pantalla que se le inyectó al reloj del pipeline, o 0 si
   * la corrida usó el reloj real. Ver `browserFrameMs` en las opciones.
   */
  modelledFrameMs: number;
  /** `cuadros × modelledFrameMs`: la pantalla que proyecta esta corrida. */
  modelledWallClockMs: number;
  /** Presupuesto por cuadro que el planificador acabó usando. */
  lastFrameBudgetMs: number;
  /**
   * Serializar el mensaje: lo ÚNICO del clonado que el hilo principal paga.
   * Cero en el camino síncrono, donde no hay mensaje.
   */
  postMessageSerializeMs: number;
  /** Deserializarlo. En el navegador lo paga el worker; viaja para el reparto. */
  postMessageDeserializeMs: number;
  /** Teselado hecho por el receptor. En el navegador NO es del hilo principal. */
  offThreadTessellateMs: number;
  postMessageBatches: number;
  postMessageEntities: number;
  postMessageWireBytes: number;
}

/**
 * Cede el turno al bucle de eventos.
 *
 * `settle()` del pipeline es síncrono y sólo puede vaciar la cola del
 * planificador; con teselado fuera de hilo hay respuestas que llegan por
 * promesa, y sin ceder el turno no se resuelven nunca. Es `setImmediate` y no
 * `setTimeout(0)` a propósito: aquel tiene un suelo de ~1 ms por vuelta que a
 * cientos de cuadros falsearía el reloj de la medida entera.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    deferToEventLoop(resolve);
  });
}

interface OffThreadMeter {
  /** Serializar el mensaje. Es lo ÚNICO que el emisor paga síncronamente. */
  serializeMs: number;
  /** Deserializarlo. En el navegador lo paga el WORKER, no el hilo principal. */
  deserializeMs: number;
  tessellateMs: number;
  wireBytes: number;
  batches: number;
  entities: number;
}

/**
 * Teselador fuera de hilo SIMULADO que paga la serialización de verdad.
 *
 * No es un worker: corre en el mismo hilo, así que no demuestra paralelismo ni
 * lo pretende. Lo que sí reproduce con fidelidad es el reparto de costes:
 *
 * - La SERIALIZACIÓN ocurre dentro del turno del que llama, igual que dentro de
 *   `postMessage`. Se mide con el serializador de valores de V8, que es
 *   exactamente el que Chromium usa para el clonado estructurado, así que el
 *   número viaja de una máquina a otra mejor que cualquier estimación.
 * - La DESERIALIZACIÓN y el teselado se hacen DESPUÉS de ceder el turno, que es
 *   donde ocurren de verdad: en el otro hilo. Contarlos dentro del turno del
 *   emisor —como hacía la primera versión de este arnés— inflaba el número de
 *   cuadros del carril hasta 474 por un artefacto del simulador, no por el
 *   pipeline.
 *
 * Lo que este arnés NO puede demostrar es el paralelismo del pool: aquí el
 * teselado del receptor sigue ocupando el único hilo que hay. Por eso su reloj
 * de pared viaja aparte y no se compara con el del camino síncrono.
 */
function createCloningTessellator(meter: OffThreadMeter): CadOffThreadTessellator {
  return async (entities, segments) => {
    const serializeStarted = performance.now();
    // Viaja lo MISMO que en el mensaje real: las entidades y sus presupuestos de
    // segmentos. El documento no viaja nunca —ver
    // `cadEntityTessellatesWithoutDocument`— y por eso no entra aquí.
    const wire = v8Serialize({
      entities: entities as CadNativeEntity[],
      segments: [...segments],
    });
    meter.serializeMs += performance.now() - serializeStarted;
    meter.wireBytes += wire.byteLength;
    meter.batches += 1;
    meter.entities += entities.length;
    await yieldToEventLoop();
    const deserializeStarted = performance.now();
    const cloned = v8Deserialize(wire) as {
      entities: CadNativeEntity[];
      segments: number[];
    };
    meter.deserializeMs += performance.now() - deserializeStarted;
    const tessellateStarted = performance.now();
    const { results } = tessellateCadEntityBatch(cloned.entities, cloned.segments);
    meter.tessellateMs += performance.now() - tessellateStarted;
    return { results, source: "worker" };
  };
}

export interface CadRenderStageProfileOptions {
  entities: readonly CadNativeEntity[];
  drawOrderIds: readonly string[];
  scenario: CadRenderScenario;
  document?: CadDocument;
  /** `null` fuerza el camino síncrono; el simulado paga el clonado real. */
  offThread: "sync" | "offthread";
  /** Pagar por cuadro la parte pura de `CadRenderScene.sync()`. */
  reconcile: boolean;
  /**
   * Coste de PRESENTAR un cuadro, en ms, inyectado en el reloj del pipeline.
   *
   * Sin él, el bucle de Node encadena cuadros sin coste de pantalla y el
   * planificador ve intervalos de 5 ms: exactamente la situación en la que su
   * presupuesto adaptativo debe quedarse en el suelo de 4 ms. Eso está bien para
   * medir CPU, pero hace INDEMOSTRABLE en Node lo que el navegador sufre, donde
   * cada cuadro cuesta ~1.160 ms de rasterizado por software y el pipeline sólo
   * avanza 4.
   *
   * Con él, el reloj que ve el planificador avanza además `browserFrameMs` por
   * cuadro presentado. No mide la pantalla —eso sería inventárselo desde Node—:
   * reproduce la CADENCIA que la pantalla impone, que es lo que decide cuántos
   * cuadros hacen falta. El coste sale de la evidencia publicada del propio
   * repositorio; ver `CAD_RENDER_BROWSER_FRAME_MS_SWIFTSHADER`.
   */
  browserFrameMs?: number;
  /** Clava el presupuesto en 4 ms: es la política de ANTES de esta ola. */
  fixedFrameBudget?: boolean;
}

/**
 * Recorre el guion —apertura y zoom— con la instrumentación encendida.
 *
 * El paneo se deja fuera a propósito: su coste ya está medido y publicado con
 * percentiles por el benchmark de siempre, y meterlo aquí mezclaría en un mismo
 * reparto la apertura (que es donde están los segundos) con doce reencuadres
 * baratos.
 */
export async function profileCadRenderStages(
  options: CadRenderStageProfileOptions,
): Promise<CadRenderStageMeasurement> {
  const meter: OffThreadMeter = {
    serializeMs: 0,
    deserializeMs: 0,
    tessellateMs: 0,
    wireBytes: 0,
    batches: 0,
    entities: 0,
  };
  const modelledFrameMs = Math.max(0, options.browserFrameMs ?? 0);
  // Cuadros ya PRESENTADOS. El reloj del pipeline añade el coste de pantalla de
  // cada uno, de modo que el intervalo que el planificador observa entre dos
  // cuadros es el real de CPU más lo que la pantalla habría tardado.
  let presentedFrames = 0;
  const pipeline = new CadRenderPipeline({
    document: options.document,
    offThread:
      options.offThread === "sync" ? null : createCloningTessellator(meter),
    now: () => performance.now() + presentedFrames * modelledFrameMs,
    fixedFrameBudget: options.fixedFrameBudget,
  });
  pipeline.replace(options.entities, options.drawOrderIds, options.document);

  let lastFrameBudgetMs = 0;
  /** Un cuadro del navegador: trabajo del pipeline y, si toca, reconciliación. */
  const runFrame = (): void => {
    lastFrameBudgetMs = pipeline.runFrame().budgetMs;
    if (options.reconcile) {
      pipeline.visibleBatches();
      pipeline.visibleTextRequests();
    }
    presentedFrames += 1;
  };

  const settle = async (view: CadRenderView): Promise<number> => {
    pipeline.setView(view);
    let frames = 0;
    while (!pipeline.settled) {
      runFrame();
      frames += 1;
      // Sólo el camino de fuera de hilo necesita ceder el turno; hacerlo
      // siempre metería el coste del bucle de eventos en el camino síncrono y
      // los dos números dejarían de ser comparables.
      if (options.offThread !== "sync") await yieldToEventLoop();
    }
    return frames;
  };

  startCadRenderProfile();
  const openStarted = performance.now();
  const framesToFirstDetail = await settle(options.scenario.initial);
  const firstDetailMs = cadRound3(performance.now() - openStarted);

  const zoomStarted = performance.now();
  const framesToZoomSettle = await settle(options.scenario.zoom);
  const zoomSettleMs = cadRound3(performance.now() - zoomStarted);

  const stats = pipeline.stats();
  const stages = stopCadRenderProfile();
  pipeline.dispose();
  return {
    label: options.offThread === "sync" ? "sync" : "offthread",
    scenarioLabel: [
      options.offThread,
      options.reconcile ? "reconcilia" : "sin reconciliar",
      modelledFrameMs > 0 ? `cuadro ${modelledFrameMs} ms` : "reloj real",
      options.fixedFrameBudget ? "presupuesto 4 ms" : "presupuesto adaptativo",
    ].join(" · "),
    fixedFrameBudget: options.fixedFrameBudget === true,
    reconciled: options.reconcile,
    firstDetailMs,
    framesToFirstDetail,
    zoomSettleMs,
    framesToZoomSettle,
    visibleAtRest: stats.visibleEntities,
    detailedAtRest: stats.renderedEntities,
    segmentsAtRest: stats.instances,
    stages,
    stageTotalMs: cadRenderStageTotalMs(stages),
    modelledFrameMs,
    modelledWallClockMs: cadRound3(
      (framesToFirstDetail + framesToZoomSettle) * modelledFrameMs,
    ),
    lastFrameBudgetMs: cadRound3(lastFrameBudgetMs),
    postMessageSerializeMs: cadRound3(meter.serializeMs),
    postMessageDeserializeMs: cadRound3(meter.deserializeMs),
    offThreadTessellateMs: cadRound3(meter.tessellateMs),
    postMessageBatches: meter.batches,
    postMessageEntities: meter.entities,
    postMessageWireBytes: meter.wireBytes,
  };
}

/**
 * Coste de UN cuadro de navegador según la evidencia publicada del repositorio.
 *
 * Sale de `docs/cad/evidence/browser-slo-100k.json`, perfil
 * `baseline-line-circle-arc` a 100.000 entidades por el camino nuevo:
 * `fullDetailMs` 45.219,2 ms repartidos en `framesToFullDetail` 39 cuadros, de
 * los cuales `fullDetailCpuMs` fue 444,1 ms. Es decir: de cada cuadro de ~1.160
 * ms, el pipeline gastó ~11 y el resto se lo llevaron el rasterizador por
 * software y la composición.
 *
 * Se expone como CONSTANTE con su procedencia escrita al lado porque es el
 * factor que convierte «cuadros para asentar» —que Node sí mide— en tiempo de
 * pantalla. Quien la cambie tiene que cambiar también de dónde la saca.
 */
export const CAD_RENDER_BROWSER_FRAME_MS_SWIFTSHADER = 1_159.5;

/**
 * Proyección del reloj de pared del navegador a partir de los cuadros medidos.
 *
 * NO es una medida: es una multiplicación declarada. Existe porque el número
 * que el usuario sufre —208–221 s— es `cuadros × coste de cuadro`, y de los dos
 * factores el pipeline sólo gobierna el primero. Publicarla junto a los cuadros
 * permite discutir si una optimización que no mueve el reloj de Node mueve el de
 * pantalla, que es la pregunta que importa.
 */
export function projectCadBrowserWallClockMs(
  frames: number,
  frameMs = CAD_RENDER_BROWSER_FRAME_MS_SWIFTSHADER,
): number {
  return cadRound3(frames * frameMs);
}
