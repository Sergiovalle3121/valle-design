import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { enter3DView } from "../fixtures/view-mode";
import { saveAndSettle } from "../fixtures/cad-save";
import { planarBodyVolume } from "../../src/lib/brep";
import { solid3dBody } from "../../src/lib/cad/solid3d-build";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import type { CadSolid3dEntity } from "../../src/lib/cad/cad-entities-v5";
import { topView, fitFootprint } from "../fixtures/camera-preset";

/**
 * EMPUJAR UNA CARA CON EL RATÓN — la promesa entera del modelado directo,
 * hecha ejecutable de punta a punta.
 *
 * ## Por qué este golden y no otro más
 *
 * La cadena que hace posible el gesto está probada por partes: el rayo contra
 * caras, la huella estable, el empujón del kernel, el comando, la política de
 * cámara y la conversión escena↔dibujo tienen cada uno su spec en Node. Nada
 * de eso prueba que las seis piezas estén ENCHUFADAS entre sí. Este golden
 * abre un navegador de verdad, pone el estudio en 3D, designa una cara con un
 * clic real y comprueba el resultado.
 *
 * ## Se afirma sobre el DOCUMENTO, no sobre una captura
 *
 * Una captura de pantalla no distingue un sólido que creció de un sólido que
 * se ve más grande. Lo que se comprueba es lo que el SERVIDOR recibió:
 *
 *   1. el árbol gana un nodo `push` — no una malla horneada, que es lo que
 *      haría irreeditable el empujón y reventaría el tope de puntos del CAS;
 *   2. ese nodo es la nueva raíz;
 *   3. y el volumen del cuerpo, recalculado por el kernel B-rep real sobre el
 *      árbol persistido, es el de antes más el del empujón.
 *
 * ## La cámara se coloca a propósito, no por suerte
 *
 * Vista superior + ajustar a la planta deja el sólido bajo el centro del
 * lienzo con la cara de arriba de frente al rayo. Sin ese encuadre el clic
 * caería donde cayera, y un golden que pasa por casualidad es peor que no
 * tenerlo.
 */

const CAJA_LADO = 2_000;
const CAJA_ALTO = 500;
const EMPUJON = 300;

function documentoConCaja(): CadDocument {
  const solido: CadSolid3dEntity = {
    id: "caja",
    type: "solid3d",
    layer: "0",
    root: "base",
    nodes: [
      {
        id: "base",
        op: "box",
        min: { x: 5_000, y: 4_000, z: 0 },
        max: { x: 5_000 + CAJA_LADO, y: 4_000 + CAJA_LADO, z: CAJA_ALTO },
      },
    ],
  };
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [solido],
    history: [],
    modelSpace: { entityIds: ["caja"] },
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

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(context, documentoConCaja(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

/** El sólido tal y como lo recibió el servidor. */
function solidoGuardado(document: CadDocument): CadSolid3dEntity {
  const solido = document.entities.find((e) => e.type === "solid3d");
  expect(solido, "el documento guardado conserva su sólido").toBeTruthy();
  return solido as CadSolid3dEntity;
}

test("se designa una cara con el ratón, se empuja, y el volumen crece en el documento", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await abrirEstudio(context, page);

  const volumenInicial = planarBodyVolume(solid3dBody(solidoGuardado(documentoConCaja())));
  expect(
    Math.abs(volumenInicial - CAJA_LADO * CAJA_LADO * CAJA_ALTO),
  ).toBeLessThan(1);

  await enter3DView(page);
  // Cenital y encuadrada: la cara de arriba queda de frente al rayo, y el
  // sólido bajo el centro del lienzo.
  await topView(page);
  await fitFootprint(page);

  await test.step("PRESSPULL pide una cara y el clic se la da", async () => {
    const entrada = page.getByTestId("cad-command-input");
    await entrada.fill("PRESSPULL");
    await entrada.press("Enter");
    // El prompt lo dice: el primer gesto puede ser una cara O unos contornos.
    await expect(page.getByTestId("cad-command-line")).toContainText(/cara/i);

    const caja = await page.getByTestId("cad-canvas").boundingBox();
    expect(caja, "el lienzo tiene caja").toBeTruthy();
    // El centro del lienzo encuadrado es el centro de la huella, y ahí está el
    // sólido: un clic ahí toca su cara de arriba.
    await page.mouse.click(caja!.x + caja!.width / 2, caja!.y + caja!.height / 2);

    // Designada la cara, el paso siguiente pide la distancia.
    await expect(page.getByTestId("cad-command-line")).toContainText(/distancia/i);
    await entrada.fill(String(EMPUJON));
    await entrada.press("Enter");
  });

  await saveAndSettle(page, backend);

  await test.step("el servidor recibió un NODO, no una malla", async () => {
    const guardado = backend.snapshot().document as unknown as CadDocument;
    const solido = solidoGuardado(guardado);

    const empuje = solido.nodes.find((n) => n.op === "push");
    expect(empuje, "el árbol persistido gana un nodo `push`").toBeTruthy();
    expect(solido.root, "y ese nodo es la nueva raíz").toBe(empuje!.id);
    expect(
      solido.nodes.some((n) => n.op === "brep"),
      "no se horneó una malla: eso reventaría el tope de puntos del CAS y sería irreeditable",
    ).toBe(false);

    // El número, calculado por el kernel real sobre el árbol que viajó.
    const volumen = planarBodyVolume(solid3dBody(solido));
    const esperado = CAJA_LADO * CAJA_LADO * (CAJA_ALTO + EMPUJON);
    expect(
      Math.abs(volumen - esperado),
      `empujar ${EMPUJON} sobre ${CAJA_LADO}×${CAJA_LADO} debía dar ${esperado}; dio ${volumen}`,
    ).toBeLessThan(1);
  });
});
