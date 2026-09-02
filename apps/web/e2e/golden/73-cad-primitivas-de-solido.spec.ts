import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { planarBodyVolume } from "../../src/lib/brep";
import { solid3dBody } from "../../src/lib/cad/solid3d-build";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";

/**
 * OLA C — las primitivas de sólido existen y se TECLEAN como en AutoCAD.
 *
 * Medido antes (distancia-autocad-completo-20260901.md): faltaban las ocho
 * primitivas; el nodo `box` existía en el esquema y ningún comando lo creaba.
 * Este golden fija el gesto entero contra el producto de verdad:
 *
 *   BOX ⏎ · 0,0 ⏎ · 2000,1500 ⏎ · 500 ⏎        → una caja de 2000 × 1500 × 500
 *   CYLINDER ⏎ · 5000,5000 ⏎ · 400 ⏎ · 900 ⏎   → un cilindro de radio 400 y alto 900
 *
 * Lo que se afirma es lo que el SERVIDOR recibió: dos SOLID3D de un solo
 * nodo (reeditables, no mallas horneadas) cuyo volumen, recalculado por el
 * kernel B-rep sobre el árbol persistido, es el pedido — exacto en la caja y
 * en el cilindro (el perfil circular iguala el área a π·r²).
 *
 * Se teclea con el LIENZO enfocado, sin pulsar la caja, como en el golden 44.
 */
function seedDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

/** Teclea con el lienzo enfocado: la primera tecla enfoca la caja, Intro devuelve el foco. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await expect(input).not.toBeFocused();
  await page.keyboard.type(value);
  await expect(input).toHaveValue(value);
  await page.keyboard.press("Enter");
  await expect(input).not.toBeFocused();
}

test("BOX y CYLINDER tecleados crean sólidos reeditables con el volumen pedido", async ({ context, page }) => {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  const commandLine = page.getByTestId("cad-command-line");
  await expect(commandLine).toBeVisible();
  const prompt = page.getByTestId("cad-command-prompt");

  // --- BOX: esquina, esquina opuesta, altura ---------------------------------
  await type(page, "BOX");
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("esquina");
  await type(page, "0,0");
  await expect(prompt).toContainText("otra esquina");
  await type(page, "2000,1500");
  await expect(prompt).toContainText("altura");
  await type(page, "500");
  await expect(prompt).toBeHidden();

  // --- CYLINDER: centro, radio, altura ---------------------------------------
  await type(page, "CYLINDER");
  await expect(prompt).toContainText("centro");
  await type(page, "5000,5000");
  await expect(prompt).toContainText("radio");
  await type(page, "400");
  await expect(prompt).toContainText("altura");
  await type(page, "900");
  await expect(prompt).toBeHidden();

  // --- lo que el servidor recibió ---------------------------------------------
  await saveAndSettle(page, backend);
  const saved = backend.snapshot().document.entities;
  const solids = saved.filter((entity): entity is CadSolid3dEntity => entity.type === "solid3d");
  expect(solids).toHaveLength(2);

  const box = solids[0];
  expect(box.nodes).toHaveLength(1);
  expect(box.nodes[0].op).toBe("box");
  expect(box.root).toBe(box.nodes[0].id);
  if (box.nodes[0].op === "box") {
    expect(box.nodes[0].min).toEqual({ x: 0, y: 0, z: 0 });
    expect(box.nodes[0].max).toEqual({ x: 2000, y: 1500, z: 500 });
  }
  expect(Math.abs(planarBodyVolume(solid3dBody(box)))).toBeCloseTo(2000 * 1500 * 500, 3);

  const cylinder = solids[1];
  expect(cylinder.nodes).toHaveLength(1);
  expect(cylinder.nodes[0].op).toBe("extrude");
  if (cylinder.nodes[0].op === "extrude") {
    expect(cylinder.nodes[0].height).toBe(900);
    expect(cylinder.nodes[0].frame?.origin).toEqual({ x: 5000, y: 5000, z: 0 });
  }
  const volume = Math.abs(planarBodyVolume(solid3dBody(cylinder)));
  expect(Math.abs(volume - Math.PI * 400 * 400 * 900) / (Math.PI * 400 * 400 * 900)).toBeLessThan(1e-9);
});
