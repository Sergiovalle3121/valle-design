/**
 * Estrés de NAVEGADOR con trazos densos a 100.000: seleccionar y modificar.
 *
 * ## Por qué hacía falta este archivo y no bastaba con lo que ya había
 *
 * El repositorio ya mide dos cosas a escala: `cad-viewport-100k.spec.ts` mide
 * ABRIR y PASEAR un corpus de 100.000, y `cad-plan-benchmark-20k.json` mide el
 * día real de un arquitecto —seleccionar, enganchar, mover, borrar— pero sobre
 * 20.000 entidades y EN NODE, sin navegador. Entre las dos queda el hueco donde
 * un CAD web se cae y uno de escritorio no: **modificar** un plano denso desde
 * el navegador. Un arquitecto abre el archivo una vez por la mañana; el resto
 * del día encierra habitaciones en una ventana y mueve lo que sale.
 *
 * Las cifras que este archivo pone a prueba son las de 20.000 en Node: paneo
 * p95 8,1 ms · zoom 5,6 ms · selección por ventana 0,32 ms · OSNAP 2,65 ms ·
 * mover grupo 11,0 ms · borrar grupo 10,6 ms. Las siete caben en un cuadro de
 * 60 Hz. La pregunta es si eso aguanta a 100.000 CON el navegador delante, y la
 * respuesta —sea la que sea— se publica con su número.
 *
 * ## El corpus y el cronómetro viven en el arnés
 *
 * `e2e/fixtures/dense-editing-harness.ts`. Ahí está el porqué de las 5.000
 * habitaciones, el porqué de medir con un `MutationObserver` dentro de la
 * página en vez de con `Date.now()` alrededor de un `expect`, y el porqué de
 * derivar el mapa mundo→pantalla UNA vez en lugar de por gesto. Ese último
 * punto no es una optimización de estilo: la primera versión de este spec usaba
 * `worldPoint` en cada esquina y no llegó a terminar su primer gesto en media
 * hora. El instrumento se estaba comiendo la medida.
 *
 * ## El artefacto se escribe a trozos, y por una razón
 *
 * Después de CADA fase. Un guion que sólo vuelca al final convierte cualquier
 * caducidad en cero evidencia, y a esta escala la caducidad es un resultado
 * probable: si el producto no aguanta, lo que hay que publicar es hasta dónde
 * llegó, no un archivo vacío.
 *
 * ## Presupuestos: por qué aquí NO hay gate de tiempo
 *
 * Los dos specs de `e2e/performance/` que ya existen están calibrados para el
 * runner de CI (2 vCPU). Éste se ha medido en un portátil de desarrollo CON
 * VECINOS —otros agentes trabajando en la misma máquina—, y convertir eso en
 * umbral produciría un gate que se pone rojo por contención y que alguien
 * desactivaría en dos semanas. Lo que SÍ bloquea son los invariantes
 * funcionales, que no dependen de la máquina: que las 100.000 entren, que la
 * designación masiva no trunque, que mover deje exactamente un paso de
 * historia, que borrar quite lo que dice y que deshacer lo devuelva.
 *
 * Ejecución:
 *   CAD_PERF_E2E=1 E2E_PROD=1 npx playwright test \
 *     e2e/performance/cad-dense-editing-100k.spec.ts --project=chromium
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type TestInfo } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend, seedFootprint } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import {
  createWorldMapper,
  denseCadDocument,
  denseSeries,
  denseSnapshot,
  DENSE_FOOTPRINT,
  dragWorld,
  ENTITY_COUNT,
  frameTopDown,
  measureDenseGesture,
  ROOM_COUNT,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  roomBlockWindow,
  setSelectionMode,
  STROKES_PER_ROOM,
  WALL_ENTITY_COUNT,
  WALL_INSET,
  type DenseSeries,
  type WorldMapper,
} from "../fixtures/dense-editing-harness";

/** Repeticiones por gesto dentro de una corrida. Impar para que haya mediana. */
const REPEATS = Number(process.env.CAD_DENSE_REPEATS ?? 3);
/**
 * Techo para que el dibujo termine de materializarse.
 *
 * No es un presupuesto: es el punto a partir del cual se deja de esperar y se
 * PUBLICA que no asentó. Un `expect` sin techo convertiría «el producto no
 * aguanta» en «la corrida caducó», que dice mucho menos.
 */
const SETTLE_BUDGET_MS = 900_000;

test.describe("CAD dense editing stress · 100k", () => {
  test.skip(process.env.CAD_PERF_E2E !== "1", "Run explicitly with CAD_PERF_E2E=1.");
  // Techo del PROCESO, no presupuesto. Quien juzga si el producto cumple son
  // los invariantes funcionales del final, y el guion vuelca su artefacto
  // tras CADA fase — un cuelgue publica hasta dónde llegó en vez de consumir
  // el techo del job entero (lo que pasó en CI del 21 al 26 de agosto con la
  // hora de techo + retry matando el job a los 100 min). 45 min NO es un
  // número cómodo sino ARITMÉTICA MEDIDA (corrida 2026-08-26, REPEATS=1,
  // 4 vCPU): ~8 min de fases medidas (lazo 198 s incluido) + ~100 s de arnés
  // por cambio de modo (abrir/cerrar la paleta a 100k, medido con sonda) ×
  // 5 modos + apertura/asentado/encuadre ≈ 35-38 min de punta a punta; la
  // corrida que rozó 35:00 murió despachando la última fase. El margen
  // restante es varianza de runner, no escondite: las fases legítimas están
  // contadas arriba y ninguna puede acercarse sola a este techo.
  test.setTimeout(2_700_000);

  test("selects and modifies 100k dense strokes", async ({ context, page }, testInfo) => {
    const measurements: Record<string, DenseSeries> = {};
    const findings: string[] = [];
    const failures: string[] = [];
    const browserErrors: string[] = [];
    const startedAt = new Date().toISOString();
    let mapper: WorldMapper | null = null;
    let open: Record<string, unknown> = {};
    let massiveSelected = 0;

    const cpus = os.cpus();
    const artifactDir = path.resolve(testInfo.project.testDir, ".artifacts/cad-dense-editing-100k");
    const runId = `${testInfo.project.name}-${startedAt.replace(/[:.]/g, "-")}`;

    /** Vuelca el artefacto con lo que haya. Se llama tras CADA fase. */
    const flush = async (final: boolean, info: TestInfo): Promise<Buffer> => {
      const artifact = {
        $schema: "urn:valle-design:schema:cad-dense-editing-run:v1",
        schemaVersion: 1,
        runId,
        project: info.project.name,
        startedAt,
        updatedAt: new Date().toISOString(),
        complete: final,
        corpus: {
          entities: ENTITY_COUNT,
          rooms: ROOM_COUNT,
          strokesPerRoom: STROKES_PER_ROOM,
          roomMm: { width: ROOM_WIDTH, height: ROOM_HEIGHT },
          wallInsetMm: WALL_INSET,
          footprintMm: { width: DENSE_FOOTPRINT.footprintW, height: DENSE_FOOTPRINT.footprintH },
          layers: { MURO: WALL_ENTITY_COUNT, ACABADO: ENTITY_COUNT - WALL_ENTITY_COUNT },
          rationale:
            "Densidad y agrupamiento, no cobertura: lo que encarece una selección es cuántos trazos " +
            "cortos comparten celda del índice espacial, y eso sólo se reproduce con habitaciones.",
        },
        environment: {
          node: process.version,
          platform: process.platform,
          osType: os.type(),
          osRelease: os.release(),
          cpuModel: cpus[0]?.model ?? "desconocido",
          logicalCpuCount: cpus.length,
          totalMemoryBytes: os.totalmem(),
          freeMemoryBytesNow: os.freemem(),
          declaredMachine:
            `${cpus[0]?.model?.trim() ?? "CPU desconocida"} (${cpus.length} hilos lógicos), ` +
            `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB de RAM, ${os.type()} ${os.release()}, ` +
            "portátil de desarrollo CON CARGA VECINA: otros agentes trabajando en el mismo equipo " +
            "durante la medición. Ninguna cifra de este archivo es un presupuesto.",
        },
        method: {
          repeats: REPEATS,
          clock:
            "MutationObserver dentro de la página, fechando con performance.now() cada cambio del " +
            "HUD. El reloj arranca en la página justo antes de que Playwright despache el gesto, " +
            "así que el número INCLUYE el viaje del comando por CDP (unos pocos milisegundos). No " +
            "se resta: restar una latencia que no se ha medido es inventarse precisión.",
          worldMapping:
            "El mapa mundo→pantalla se deriva UNA vez con cuatro lecturas del HUD y se reutiliza. " +
            "La cámara no se mueve durante el guion —la marquesina desactiva los controles de " +
            "órbita y editar cambia las entidades, no la vista— y el error del lazo cerrado se " +
            "publica en `worldMapper` para poder comprobarlo en vez de creerlo.",
          aggregation:
            "mediana de las repeticiones DENTRO de esta corrida; la evidencia publicada cruza " +
            "además tres corridas en procesos separados (scripts/cad/dense-editing-evidence.mjs).",
          openIsSingleSample:
            "La apertura se mide UNA vez: abrir 100.000 entidades tres veces multiplicaría por tres " +
            "una corrida que ya dura minutos. Se declara en vez de disimularlo.",
          settleBudgetMs: SETTLE_BUDGET_MS,
        },
        open,
        worldMapper: mapper
          ? {
              errorUnits: mapper.errorUnits,
              unitsPerPixel: mapper.unitsPerPixel,
              hudSamples: mapper.samples,
              buildMs: mapper.buildMs,
              criterion:
                "Se mapea un punto que NO participó en construir la afín y se compara con lo que " +
                "el HUD dice bajo ese píxel. El error se publica en unidades de dibujo.",
            }
          : null,
        measurements,
        findings,
        failures,
        browserErrors,
        scope: {
          measured: [
            "selección por ventana, por captura y por lazo con el ratón sobre el lienzo real",
            "designación con pickbox y lectura de la paleta de propiedades del objeto designado",
            "designación masiva de las 100.000 y su coste",
            "mover el grupo masivo y deshacerlo, con la profundidad de historial como testigo",
            "borrar una capa entera y deshacerlo, con el recuento del documento como testigo",
            "coste de abrir la paleta de selección, que reconstruye el universo entero",
            "coste de derivar el mapa mundo→pantalla, que a esta escala deja de ser gratis",
          ],
          notMeasured: [
            "OSNAP en el navegador: el enganche se dispara al mover el ratón y no deja huella en el " +
              "HUD, así que no hay señal que fechar sin instrumentar el producto para el test",
            "cuadros por segundo y composición de GPU: el runner dibuja por software",
            "red y API: el backend está interceptado en la frontera de red",
            "compatibilidad DWG",
          ],
        },
      };
      const body = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.writeFileSync(path.join(artifactDir, `${runId}.json`), body);
      return body;
    };

    /** Repite un gesto y publica la serie. Un fallo se registra, no se traga. */
    const repeat = async (
      key: string,
      label: string,
      run: (attempt: number) => Promise<{ elapsedMs: number; observed: unknown }>,
    ): Promise<void> => {
      const samples: number[] = [];
      let observed: unknown = null;
      for (let attempt = 0; attempt < REPEATS; attempt += 1) {
        try {
          const result = await run(attempt);
          samples.push(result.elapsedMs);
          observed = result.observed;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${label} (repetición ${attempt + 1}): ${message.split("\n")[0]}`);
          break;
        }
      }
      if (samples.length > 0) measurements[key] = denseSeries(label, samples, observed);
      await flush(false, testInfo);
    };

    // -----------------------------------------------------------------------
    // 1 · Apertura. Una sola muestra, y se dice que es una sola.
    // -----------------------------------------------------------------------
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    const cadDocument = seedFootprint(denseCadDocument(), DENSE_FOOTPRINT);
    await installCadV1Backend(context, { document: cadDocument, footprint: DENSE_FOOTPRINT });
    const payloadBytes = Buffer.byteLength(
      JSON.stringify({ cadDocument, cadDocumentVersion: 0, dxf: null }),
    );
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    const openedAt = Date.now();
    await page.goto("/legacy/studio");
    await expect(page.getByTestId("cad-native-document-count")).toHaveText(
      `Native ${ENTITY_COUNT}`,
      { timeout: 900_000 },
    );
    const documentReadyMs = Date.now() - openedAt;
    const pipeline = page.getByTestId("cad-render-pipeline");
    let settled = true;
    try {
      await expect(pipeline).toHaveAttribute("data-settled", "true", { timeout: SETTLE_BUDGET_MS });
    } catch {
      settled = false;
      findings.push(
        `El dibujo NO terminó de materializarse en ${SETTLE_BUDGET_MS / 1000} s. Se sigue midiendo ` +
          "selección y modificación —el índice espacial no depende del pipeline de dibujo— y se " +
          "publica que la vista seguía reconstruyéndose por debajo.",
      );
    }
    const firstDetailMs = Date.now() - openedAt;
    const atRest = await denseSnapshot(page);
    open = { documentReadyMs, firstDetailMs, settledWithinBudget: settled, atRest, payloadBytes };
    await flush(false, testInfo);

    // El tour guiado de primer arranque FLOTA SOBRE EL PLANO y captura el
    // pointerdown en su rectángulo. Medido con sonda (2026-08-26): las dos
    // esquinas superiores del bloque del lazo —mundo (36000,27000) y
    // (37800,27000)— caían en pantalla sobre su botón «Saltar», el lazo nunca
    // empezaba y el sondeo de `selection > 0` moría de hambre hasta el techo:
    // dos corridas enteras muertas en la fase `lasso` por un botón. Un usuario
    // real despacha el tour antes de trabajar; este guion también.
    const tourSkip = page.getByTestId("cad-guided-tour-skip");
    try {
      await tourSkip.waitFor({ state: "visible", timeout: 60_000 });
      await tourSkip.click();
      await expect(tourSkip).toBeHidden();
    } catch {
      findings.push(
        "El tour guiado no apareció en 60 s: nada que despachar (si reaparece " +
          "a mitad de guion, cualquier gesto sobre su rectángulo se lo comerá).",
      );
    }

    // -----------------------------------------------------------------------
    // 2 · Abrir la paleta de selección. El universo se reconstruye entero.
    // -----------------------------------------------------------------------
    const tool = page.getByTitle(/Selecci.n profesional/);
    const palette = page.getByTestId("cad-selection-palette");
    await repeat("paletteOpen", "abrir la paleta de selección profesional", async () => {
      const started = Date.now();
      await tool.click();
      await expect(palette).toBeVisible();
      const elapsedMs = Date.now() - started;
      await tool.click();
      await expect(palette).toBeHidden();
      return { elapsedMs, observed: { entities: ENTITY_COUNT } };
    });

    // -----------------------------------------------------------------------
    // 3 · Designación MASIVA: las 100.000 de una vez
    // -----------------------------------------------------------------------
    await repeat("selectAll", "designar las 100.000 con «Todo»", async () => {
      await tool.click();
      await expect(palette).toBeVisible();
      const clearButton = palette.getByRole("button", { name: "Limpiar" });
      if (await clearButton.isEnabled()) await clearButton.click();
      const result = await measureDenseGesture(
        page,
        "designación masiva",
        () => palette.getByRole("button", { name: "Todo", exact: true }).click(),
        (snapshot) => (snapshot.selection ?? 0) >= ENTITY_COUNT,
      );
      massiveSelected = result.snapshot.selection ?? 0;
      await tool.click();
      await expect(palette).toBeHidden();
      return { elapsedMs: result.elapsedMs, observed: { selected: massiveSelected } };
    });

    // -----------------------------------------------------------------------
    // 4 · Modificar el grupo grande: mover y deshacer
    // -----------------------------------------------------------------------
    // El desplazamiento va por la flecha del teclado y no por MOVE tecleado a
    // propósito: MOVE pide punto base y destino con el ratón, y eso metería dos
    // conversiones mundo↔pantalla dentro del cronómetro. La flecha entra por el
    // MISMO camino —transformNativeSelection → commitNativeCommands— así que
    // mide el trabajo de modificar y no el de apuntar.
    await repeat("moveMassive", "mover las 100.000 designadas un paso de rejilla", async () => {
      const before = await denseSnapshot(page);
      const baseline = before.undo ?? 0;
      const result = await measureDenseGesture(
        page,
        "mover grupo masivo",
        () => page.keyboard.press("ArrowRight"),
        (snapshot) => (snapshot.undo ?? 0) > baseline,
      );
      return {
        elapsedMs: result.elapsedMs,
        observed: {
          undoBefore: baseline,
          undoAfter: result.snapshot.undo,
          selection: result.snapshot.selection,
        },
      };
    });

    await repeat("undoMassive", "deshacer el desplazamiento de las 100.000", async () => {
      const before = await denseSnapshot(page);
      const baseline = before.undo ?? 0;
      const result = await measureDenseGesture(
        page,
        "deshacer masivo",
        () => page.keyboard.press("Control+z"),
        (snapshot) => (snapshot.undo ?? 0) < baseline,
      );
      // Se rehace el movimiento para que la repetición siguiente tenga algo que
      // deshacer. El rehacer NO entra en la medida.
      await page.keyboard.press("ArrowRight");
      await expect(page.getByTestId("cad-history-depth")).toHaveAttribute(
        "data-undo",
        String(baseline),
        { timeout: 900_000 },
      );
      return {
        elapsedMs: result.elapsedMs,
        observed: { undoBefore: baseline, undoAfter: result.snapshot.undo },
      };
    });

    // -----------------------------------------------------------------------
    // 5 · Borrar un grupo grande y deshacerlo
    // -----------------------------------------------------------------------
    await repeat("eraseLayer", `borrar la capa MURO (${WALL_ENTITY_COUNT} trazos)`, async () => {
      await tool.click();
      await expect(palette).toBeVisible();
      const clearButton = palette.getByRole("button", { name: "Limpiar" });
      if (await clearButton.isEnabled()) await clearButton.click();
      await palette.getByLabel("Filtrar por capa").selectOption("MURO");
      await page.getByTestId("cad-quick-select-apply").click();
      await expect(page.getByTestId("cad-selection-count")).toHaveText(
        `${WALL_ENTITY_COUNT} seleccionados`,
        { timeout: 900_000 },
      );
      await tool.click();
      await expect(palette).toBeHidden();
      const before = await denseSnapshot(page);
      const baseline = before.documentCount ?? ENTITY_COUNT;
      const result = await measureDenseGesture(
        page,
        "borrar la capa MURO",
        () => page.keyboard.press("Delete"),
        (snapshot) => (snapshot.documentCount ?? baseline) < baseline,
      );
      const after = result.snapshot.documentCount ?? 0;
      // Se deshace para que la repetición siguiente parta del mismo sitio; el
      // deshacer de aquí NO entra en la medida (tiene la suya propia abajo).
      await page.keyboard.press("Control+z");
      await expect(page.getByTestId("cad-native-document-count")).toHaveText(
        `Native ${baseline}`,
        { timeout: 900_000 },
      );
      return {
        elapsedMs: result.elapsedMs,
        observed: { before: baseline, after, removed: baseline - after },
      };
    });

    await repeat("undoErase", "deshacer el borrado de la capa MURO", async () => {
      // Se vuelve a borrar fuera del cronómetro para tener algo que deshacer.
      await tool.click();
      await expect(palette).toBeVisible();
      await palette.getByLabel("Filtrar por capa").selectOption("MURO");
      await page.getByTestId("cad-quick-select-apply").click();
      await expect(page.getByTestId("cad-selection-count")).toHaveText(
        `${WALL_ENTITY_COUNT} seleccionados`,
        { timeout: 900_000 },
      );
      await tool.click();
      await expect(palette).toBeHidden();
      await page.keyboard.press("Delete");
      await expect(page.getByTestId("cad-native-document-count")).toHaveText(
        `Native ${ENTITY_COUNT - WALL_ENTITY_COUNT}`,
        { timeout: 900_000 },
      );
      const before = await denseSnapshot(page);
      const baseline = before.documentCount ?? 0;
      const result = await measureDenseGesture(
        page,
        "deshacer el borrado",
        () => page.keyboard.press("Control+z"),
        (snapshot) => (snapshot.documentCount ?? baseline) > baseline,
      );
      return {
        elapsedMs: result.elapsedMs,
        observed: { before: baseline, after: result.snapshot.documentCount },
      };
    });

    // -----------------------------------------------------------------------
    // 6 · Encuadre y mapa mundo→pantalla: una vez, y se publica lo que cuesta
    // -----------------------------------------------------------------------
    await frameTopDown(page);
    mapper = await createWorldMapper(page);
    await flush(false, testInfo);

    // -----------------------------------------------------------------------
    // 7 · Selección geométrica: ventana chica, ventana grande, captura y lazo
    // -----------------------------------------------------------------------
    const small = roomBlockWindow(10, 10, 2, 2);
    const large = roomBlockWindow(30, 20, 8, 8);
    const loop = roomBlockWindow(60, 30, 3, 3);

    const geometric = async (
      key: string,
      label: string,
      mode: "window" | "crossing" | "lasso",
      corners: { x: number; y: number }[],
      expectedEntities: number,
    ) =>
      repeat(key, label, async () => {
        await setSelectionMode(page, mode);
        const result = await measureDenseGesture(
          page,
          label,
          () => dragWorld(page, mapper!, corners),
          (snapshot) => (snapshot.selection ?? 0) > 0,
        );
        return {
          elapsedMs: result.elapsedMs,
          observed: { selected: result.snapshot.selection, enclosedByDrawing: expectedEntities },
        };
      });

    await geometric(
      "windowSmall",
      "selección por VENTANA sobre 4 habitaciones",
      "window",
      [small.min, small.max],
      small.expectedEntities,
    );
    await geometric(
      "windowLarge",
      "selección por VENTANA sobre 64 habitaciones",
      "window",
      [large.min, large.max],
      large.expectedEntities,
    );
    await geometric(
      "crossingLarge",
      "selección por CAPTURA sobre 64 habitaciones",
      "crossing",
      [large.min, large.max],
      large.expectedEntities,
    );
    await geometric(
      "lasso",
      "selección por LAZO sobre 9 habitaciones",
      "lasso",
      [
        loop.min,
        { x: loop.max.x, y: loop.min.y },
        loop.max,
        { x: loop.min.x, y: loop.max.y },
        loop.min,
      ],
      loop.expectedEntities,
    );

    // -----------------------------------------------------------------------
    // 8 · Designación por pickbox y propiedades del objeto designado
    // -----------------------------------------------------------------------
    await repeat("pickAndGrips", "designar un trazo con el pickbox", async () => {
      await setSelectionMode(page, "pick");
      // Un punto sobre la cara inferior del muro de una habitación conocida.
      const target = mapper!.toScreen({
        x: 12 * ROOM_WIDTH + ROOM_WIDTH / 2,
        y: 12 * ROOM_HEIGHT + WALL_INSET,
      });
      const result = await measureDenseGesture(
        page,
        "pickbox",
        async () => {
          await page.mouse.click(target.x, target.y);
        },
        (snapshot) => (snapshot.selection ?? 0) > 0,
      );
      const properties = page.getByTestId("cad-properties-palette");
      const count = (await properties.count()) > 0 ? await properties.getAttribute("data-count") : null;
      return {
        elapsedMs: result.elapsedMs,
        observed: { selected: result.snapshot.selection, propertiesCount: count },
      };
    });

    // -----------------------------------------------------------------------
    // 9 · Hallazgos derivados de lo MEDIDO, no de lo esperado
    // -----------------------------------------------------------------------
    for (const key of ["windowSmall", "windowLarge", "crossingLarge", "lasso"] as const) {
      const observed = measurements[key]?.observed as
        | { selected?: number; enclosedByDrawing?: number }
        | undefined;
      if (!observed?.enclosedByDrawing) continue;
      if ((observed.selected ?? 0) < observed.enclosedByDrawing)
        findings.push(
          `${measurements[key].label}: el dibujo encierra ${observed.enclosedByDrawing} trazos y la ` +
            `selección devolvió ${observed.selected}. La selección geométrica trunca al tope de su ` +
            "índice espacial: lo que el arquitecto ve designado NO es lo que encerró, y el producto " +
            "no se lo dice.",
        );
    }
    if (massiveSelected === ENTITY_COUNT)
      findings.push(
        `La vía masiva («Todo» y quick-select) SÍ designa ${ENTITY_COUNT} sin truncar: el tope es de ` +
          "la selección geométrica, no del modelo de selección.",
      );
    if (mapper && mapper.errorUnits > mapper.unitsPerPixel * 1.5)
      findings.push(
        `El mapa mundo→pantalla cerró con ${mapper.errorUnits} unidades de error sobre ` +
          `${mapper.unitsPerPixel} por píxel: por encima de píxel y medio. Las coordenadas de los ` +
          "gestos de este artefacto son menos fiables de lo previsto.",
      );

    const body = await flush(true, testInfo);
    await testInfo.attach("cad-dense-editing-100k.json", { body, contentType: "application/json" });
    console.log(body.toString());
    for (const finding of findings) console.log(`HALLAZGO · ${finding}`);
    for (const failure of failures) console.log(`GESTO FALLIDO · ${failure}`);

    // -----------------------------------------------------------------------
    // 10 · Lo que SÍ bloquea: invariantes que no dependen de la máquina
    // -----------------------------------------------------------------------
    // Primero, QUÉ FASES llegaron a ejecutarse. Sin esto, una corrida cortada a
    // la mitad falla por el primer invariante que toque —«la designación masiva
    // no puede truncar», con cero designadas porque nunca se designó— y el
    // mensaje culpa al producto de un problema del guion.
    const expectedPhases = [
      "paletteOpen",
      "selectAll",
      "moveMassive",
      "undoMassive",
      "eraseLayer",
      "undoErase",
      "windowSmall",
      "windowLarge",
      "crossingLarge",
      "lasso",
      "pickAndGrips",
    ];
    expect(
      expectedPhases.filter((phase) => !measurements[phase]),
      "el guion no llegó a ejecutar todas sus fases: lo medido está en el artefacto de esta corrida",
    ).toEqual([]);
    expect(atRest.total, "el documento debe llegar entero al pipeline").toBe(ENTITY_COUNT);
    expect(
      mapper!.errorUnits,
      "sin un mapa mundo→pantalla fiable, ningún gesto de este guion significa nada",
    ).toBeLessThanOrEqual(mapper!.unitsPerPixel * 1.5);
    expect(massiveSelected, "la designación masiva no puede truncar").toBe(ENTITY_COUNT);
    const move = measurements.moveMassive?.observed as
      | { undoBefore?: number; undoAfter?: number }
      | undefined;
    expect(move?.undoAfter, "mover un grupo debe dejar EXACTAMENTE un paso de historia").toBe(
      (move?.undoBefore ?? 0) + 1,
    );
    const erase = measurements.eraseLayer?.observed as { removed?: number } | undefined;
    expect(erase?.removed, "borrar la capa MURO debe quitar sus trazos y sólo los suyos").toBe(
      WALL_ENTITY_COUNT,
    );
    const undo = measurements.undoErase?.observed as { after?: number } | undefined;
    expect(undo?.after, "deshacer un borrado debe devolver el documento a su tamaño").toBe(
      ENTITY_COUNT,
    );
    expect(failures, "ningún gesto del guion debe quedarse sin poder ejecutarse").toEqual([]);
    expect(browserErrors, "el navegador no debe registrar errores durante el estrés").toEqual([]);
  });
});
