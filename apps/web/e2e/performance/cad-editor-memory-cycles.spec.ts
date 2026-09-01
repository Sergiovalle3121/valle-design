/**
 * FASE 2 — Las dos medidas que faltaban del editor vivo:
 *
 *   1. MEMORIA en ciclos de abrir/cerrar: 20 ciclos de estudio con un dibujo
 *      de 10.000 entidades. Tras cada ciclo se fuerza GC por CDP y se lee el
 *      heap. INVARIANTE (bloqueante en esta corrida manual): el heap tras el
 *      ciclo 20 no supera al del ciclo 1 en más de max(25 MB, 10 %). Un editor
 *      que retiene escena tras cerrarla se come el portátil del arquitecto a
 *      media mañana — y sólo un ciclo repetido lo destapa.
 *
 *   2. SELECCIÓN a 10.000: una ventana con el ratón sobre un bloque conocido,
 *      cronometrada con el mismo MutationObserver del estrés denso. El
 *      objetivo comercial es ≤100 ms; el número se PUBLICA y se compara —
 *      en SwiftShader el arrastre paga cuadros por software, así que el
 *      veredicto contra el objetivo se declara con su hardware al lado.
 *
 * Corrida manual (mismo carril que el resto de e2e/performance):
 *   CAD_PERF_E2E=1 E2E_PROD=1 npx playwright test \
 *     e2e/performance/cad-editor-memory-cycles.spec.ts --project=chromium
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import {
  armDenseProbe,
  denseSnapshot,
  measureDenseGesture,
  setSelectionMode,
} from "../fixtures/dense-editing-harness";
import { fitFootprint } from "../fixtures/camera-preset";

const ENTITY_COUNT = 10_000;
const CYCLES = 20;
const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 } as const;

/**
 * 10.000 trazos cortos en rejilla de 100×100 (paso 100 mm): densidad
 * uniforme, coordenadas conocidas para apuntar la ventana sin mapa afín.
 */
function tenThousandDocument() {
  const entities = Array.from({ length: ENTITY_COUNT }, (_, index) => {
    const col = index % 100;
    const row = Math.floor(index / 100);
    const x = col * 100 + 100;
    const y = row * 80 + 100;
    return {
      id: `s-${String(index).padStart(5, "0")}`,
      type: "line" as const,
      start: { x, y, z: 0 },
      end: { x: x + 60, y: y + 40, z: 0 },
      layer: "ACABADO",
    };
  });
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "ACABADO", name: "ACABADO", color: "#60a5fa", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function openStudio(page: Page): Promise<void> {
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(
    `Native ${ENTITY_COUNT}`,
    { timeout: 300_000 },
  );
  const tourSkip = page.getByTestId("cad-guided-tour-skip");
  try {
    await tourSkip.waitFor({ state: "visible", timeout: 10_000 });
    await tourSkip.click();
  } catch {
    /* sin tour esta vez */
  }
}

test.describe("FASE 2 · memoria en ciclos y selección a 10k", () => {
  test.skip(process.env.CAD_PERF_E2E !== "1", "Run explicitly with CAD_PERF_E2E=1.");
  test.setTimeout(1_800_000);

  test("20 ciclos de abrir/cerrar no retienen más de max(25 MB, 10 %), y la ventana a 10k se publica contra 100 ms", async ({ context, page }, testInfo) => {
    await installMockBackend(context);
    await loginAsStandaloneOwner(context);
    await installCadV1Backend(context, { document: tenThousandDocument(), footprint: FOOTPRINT });

    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    await session.send("HeapProfiler.enable");
    const heapAfterGc = async (): Promise<number> => {
      // Dos pasadas: la primera suelta referencias, la segunda recoge lo que
      // la primera dejó alcanzable sólo desde finalizadores.
      await session.send("HeapProfiler.collectGarbage");
      await session.send("HeapProfiler.collectGarbage");
      const { metrics } = await session.send("Performance.getMetrics");
      const metric = metrics.find((entry) => entry.name === "JSHeapUsedSize");
      return metric?.value ?? Number.NaN;
    };

    // ── 1 · Los veinte ciclos ────────────────────────────────────────────
    const samples: number[] = [];
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      await openStudio(page);
      // Cerrar el estudio ES navegación completa en este producto (su onClose
      // hace window.location.assign): el ciclo navega al tablero — mismo
      // sitio, mismo proceso de renderer — y mide lo que ese diseño PUEDE
      // retener entre ciclos (proceso, GPU, workers), que es la fuga real
      // posible aquí; no hay desmontaje in-realm que medir por diseño.
      await page.goto("/dashboard");
      const heap = await heapAfterGc();
      samples.push(heap);
      console.log(`CICLO ${cycle}: heap tras GC = ${(heap / 1024 / 1024).toFixed(1)} MB`);
    }
    const baseline = samples[0];
    const final = samples[CYCLES - 1];
    const budget = Math.max(25 * 1024 * 1024, baseline * 0.1);
    const growth = final - baseline;
    console.log(
      `MEMORIA: base ${(baseline / 1024 / 1024).toFixed(1)} MB · final ${(final / 1024 / 1024).toFixed(1)} MB · ` +
        `crecimiento ${(growth / 1024 / 1024).toFixed(1)} MB · presupuesto ${(budget / 1024 / 1024).toFixed(1)} MB`,
    );

    // ── 2 · Selección por ventana a 10k, cronometrada en la página ──────
    await openStudio(page);
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await fitFootprint(page);
    // Modo VENTANA explícito, por la paleta — la primera corrida lo midió
    // mal: el arrastre por defecto desde el centro caía SOBRE un trazo y
    // era un move-drag de 1 entidad, no una marquesina.
    await setSelectionMode(page, "window");
    await armDenseProbe(page);
    const viewport = page.viewportSize()!;
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const selection = await measureDenseGesture(
      page,
      "ventana a 10k",
      async () => {
        await page.mouse.move(cx - 80, cy - 60);
        await page.mouse.down();
        await page.mouse.move(cx + 80, cy + 60, { steps: 4 });
        await page.mouse.up();
      },
      (snapshot) => (snapshot.selection ?? 0) > 0,
    );
    const snap = await denseSnapshot(page);
    const verdict = selection.elapsedMs <= 100 ? "CUMPLE" : "NO cumple";
    console.log(
      `SELECCIÓN 10k: ${selection.elapsedMs.toFixed(1)} ms (objetivo ≤100 ms → ${verdict} ` +
        `en ${os.cpus()[0]?.model?.trim() ?? "CPU desconocida"} · SwiftShader) · designados: ${snap.selection}`,
    );

    // ── 3 · Artefacto ────────────────────────────────────────────────────
    const artifactDir = path.resolve(testInfo.project.testDir, ".artifacts/cad-editor-memory-cycles");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, `${testInfo.project.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
      `${JSON.stringify(
        {
          $schema: "urn:valle-design:schema:cad-memory-cycles-run:v1",
          entities: ENTITY_COUNT,
          cycles: CYCLES,
          heapSamplesBytes: samples,
          baselineBytes: baseline,
          finalBytes: final,
          growthBytes: growth,
          budgetBytes: budget,
          selection10k: {
            elapsedMs: selection.elapsedMs,
            selected: snap.selection,
            targetMs: 100,
            meetsTarget: selection.elapsedMs <= 100,
            hardware: `${os.cpus()[0]?.model?.trim()} · ${os.cpus().length} hilos · SwiftShader (sin GPU real)`,
          },
        },
        null,
        2,
      )}\n`,
    );

    // El invariante de MEMORIA bloquea (no depende del hardware: retener
    // escena es retener escena). El de selección se PUBLICA: un umbral de
    // milisegundos sobre raster por software se pondría rojo por contención
    // y alguien lo desactivaría en dos semanas.
    expect(
      growth,
      `retención tras ${CYCLES} ciclos: ${(growth / 1024 / 1024).toFixed(1)} MB > presupuesto ${(budget / 1024 / 1024).toFixed(1)} MB`,
    ).toBeLessThanOrEqual(budget);
    expect(snap.selection ?? 0, "la ventana debe designar algo").toBeGreaterThan(0);
  });
});
