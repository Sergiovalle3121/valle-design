#!/usr/bin/env tsx
/** TEMPORAL — inventario de objetivos táctiles. Se borra al terminar la ola. */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../../apps/web/e2e/fixtures/mock-backend";
import { installCadStudioBackend } from "../../apps/web/e2e/fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../../apps/web/e2e/fixtures/standalone-identity";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ONLY = process.env.ONLY_PROFILE;

const PROFILES = [
  { id: "tableta-apaisada", width: 1024, height: 768 },
  { id: "tableta-vertical", width: 768, height: 1024 },
  { id: "tableta-grande", width: 1366, height: 1024 },
].filter((p) => !ONLY || p.id === ONLY);

const SEED_LINES = [
  { id: "muro-sur", start: { x: 1_000, y: 1_000 }, end: { x: 7_000, y: 1_000 } },
  { id: "muro-este", start: { x: 7_000, y: 1_000 }, end: { x: 7_000, y: 5_000 } },
  { id: "muro-norte", start: { x: 7_000, y: 5_000 }, end: { x: 1_000, y: 5_000 } },
  { id: "muro-oeste", start: { x: 1_000, y: 5_000 }, end: { x: 1_000, y: 1_000 } },
];

function seedDocument() {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: SEED_LINES.map((line) => ({
      id: line.id,
      type: "line",
      start: { ...line.start, z: 0 },
      end: { ...line.end, z: 0 },
      layer: "0",
    })),
    history: [],
    modelSpace: { entityIds: SEED_LINES.map((line) => line.id) },
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend(context, seedDocument(), {
    footprintW: 8_000,
    footprintH: 6_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto(`${BASE_URL}/legacy/studio`);
  await page.getByTestId("cad-canvas").waitFor({ state: "visible", timeout: 120_000 });
  await page.getByTestId("cad-native-document-count").waitFor({ state: "visible", timeout: 120_000 });
}

const inventory = (page: Page) =>
  page.evaluate(() => {
    const media = {
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
      anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
      hoverNone: matchMedia("(hover: none)").matches,
    };
    const nodes = [...document.querySelectorAll("button, [role='button'], select, input")];
    const rows: Array<Record<string, unknown>> = [];
    let visible = 0;
    let small = 0;
    let smallest = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") continue;
      visible += 1;
      const side = Math.min(box.width, box.height);
      if (side < smallest) smallest = side;
      if (side >= 44) continue;
      small += 1;
      const owner = (node as HTMLElement).closest("[data-testid]") as HTMLElement | null;
      rows.push({
        w: Number(box.width.toFixed(1)),
        h: Number(box.height.toFixed(1)),
        tag: node.tagName.toLowerCase(),
        type: (node as HTMLInputElement).type ?? "",
        testId: (node as HTMLElement).dataset?.testid ?? "",
        owner: owner?.dataset?.testid ?? "(sin testid)",
        text: (node.textContent ?? "").trim().slice(0, 28),
        cls: (node.getAttribute("class") ?? "").slice(0, 150),
      });
    }
    return {
      media,
      controlesVisibles: visible,
      pordebajoDe44px: small,
      ladoMenorPx: Number.isFinite(smallest) ? Number(smallest.toFixed(1)) : null,
      rows,
    };
  });

for (const profile of PROFILES) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    hasTouch: true,
    isMobile: false,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await openStudio(context, page);
    const report = await inventory(page);
    console.log(`\n===== ${profile.id} (${profile.width}x${profile.height}) =====`);
    console.log(JSON.stringify(report.media));
    console.log(
      `visibles=${report.controlesVisibles} <44px=${report.pordebajoDe44px} ladoMenor=${report.ladoMenorPx}`,
    );
    const byOwner = new Map<string, Array<Record<string, unknown>>>();
    for (const row of report.rows) {
      const key = String(row.owner);
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key)!.push(row);
    }
    for (const [owner, rows] of [...byOwner].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n-- ${owner} (${rows.length})`);
      for (const row of rows)
        console.log(
          `   ${String(row.w).padStart(6)}x${String(row.h).padEnd(6)} ${row.tag}${row.type ? `[${row.type}]` : ""} «${row.text}» ${row.testId ? `#${row.testId}` : ""}\n        ${row.cls}`,
        );
    }
  } finally {
    await browser.close();
  }
}
