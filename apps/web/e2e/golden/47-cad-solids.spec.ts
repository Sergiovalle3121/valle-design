import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity, CadSolid3dEntity } from "../../src/lib/cad/cad-document";
import {
  clearSolidCache,
  solid3dBody,
  solid3dMassProperties,
} from "../../src/lib/cad/solid3d-build";
import { eulerCounts } from "../../src/lib/brep";

/**
 * MODELADO DE SÓLIDOS de punta a punta — y la prueba de que el kernel B-rep ya
 * no es una isla.
 *
 * El repositorio construyó `lib/brep/` entero —topología con invariantes,
 * extrusión, booleanas, teselado, STEP e IGES— y NADIE lo importaba: no se podía
 * crear un sólido, no se podía guardar y no se podía ver. Este golden es la
 * afirmación de que eso ha dejado de ser cierto, y por eso su forma es la que es:
 *
 *   1. Se TECLEA una orden en la línea de comandos del estudio. No se llama a una
 *      función: se escribe `EXTRUDE`, como lo haría un dibujante.
 *   2. Se GUARDA y se comprueba lo que llegó al servidor: el ÁRBOL DE
 *      CONSTRUCCIÓN, no una malla.
 *   3. Se CIERRA y se REABRE la página, y el sólido sigue ahí.
 *   4. Se reconstruye su volumen desde el documento persistido, con el caché de
 *      evaluación VACIADO — si coincidiera por estar cacheado, no probaría nada
 *      sobre lo que se guardó.
 *
 * La cuarta es la que convierte esto en una prueba de integración de verdad. Un
 * spec unitario puede demostrar que el kernel resta dos cajas; sólo esto
 * demuestra que un usuario llega hasta ahí tecleando y que el resultado
 * sobrevive al viaje completo hasta PostgreSQL y de vuelta.
 */
function seedDocument(): CadDocument {
  /** Rectángulo cerrado, que es lo que un dibujante extruye. */
  const rectangle = (id: string, x: number, y: number, w: number, h: number): CadEntity => ({
    id,
    type: "polyline",
    vertices: [
      { x, y, z: 0 },
      { x: x + w, y, z: 0 },
      { x: x + w, y: y + h, z: 0 },
      { x, y: y + h, z: 0 },
    ],
    closed: true,
    layer: "0",
  });
  const entities = [
    rectangle("perfil-base", 1_000, 1_000, 4_000, 3_000),
    rectangle("perfil-hueco", 2_000, 1_500, 1_000, 1_000),
  ];
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
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

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, seedDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

/** Teclea en la línea de comandos y confirma. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

/** Designa objetos por el panel profesional, sin depender del lienzo. */
async function select(page: Page, ids: readonly string[]) {
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId("cad-quick-select-text");
  for (const [index, id] of ids.entries()) {
    // La operación es PEGAJOSA entre aperturas del panel: hay que volver a
    // «Reemplazar» en el primero o la designación anterior se acumularía.
    await page
      .getByTestId(`cad-selection-operation-${index === 0 ? "replace" : "add"}`)
      .click();
    await query.fill(id);
    await page.getByTestId("cad-quick-select-apply").click();
  }
  await expect(page.getByTestId("cad-selection-count")).toHaveText(
    `${ids.length} seleccionados`,
  );
  await page.getByLabel("Cerrar panel profesional").click();
}

function solidsOf(document: CadDocument): CadSolid3dEntity[] {
  return document.entities.filter(
    (entity): entity is CadSolid3dEntity => entity.type === "solid3d",
  );
}

test("un sólido tecleado sobrevive a guardar, cerrar y reabrir — con su árbol y su volumen", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible();

  // --- 1. EXTRUDE: de una polilínea cerrada a un sólido ----------------------
  await select(page, ["perfil-base"]);
  await type(page, "EXTRUDE");
  await type(page, "500");
  await saveAndSettle(page, backend);

  let baseSolidId = "";
  {
    const saved = backend.snapshot().document;
    // El esquema sube a 5 en cuanto el documento viaja: la migración es aditiva
    // y lo único que cambia es este número.
    expect(saved.meta.schema).toBe(5);
    const solids = solidsOf(saved);
    expect(solids).toHaveLength(1);
    baseSolidId = solids[0].id;

    // Lo que se persiste es la RECETA. Ésta es la decisión que justifica el
    // esquema 5: una malla a tolerancia fina son decenas de miles de triángulos
    // por pieza, no se puede reeditar, y multiplicaría por cien el tamaño del
    // documento.
    expect(solids[0].nodes).toHaveLength(1);
    expect(solids[0].nodes[0].op).toBe("extrude");
    const node = solids[0].nodes[0];
    if (node.op !== "extrude") throw new Error("op");
    expect(node.height).toBeCloseTo(500, 6);
    expect(node.profile.outer).toHaveLength(4);

    // Y la malla NO viaja.
    const text = JSON.stringify(saved);
    expect(text).not.toContain('"positions"');
    expect(text).not.toContain('"indices"');

    // El perfil se consume: dejarlo debajo del sólido duplicaría la silueta en
    // pantalla, en la designación por ventana y en el exportado a DXF.
    expect(saved.entities.some((entity) => entity.id === "perfil-base")).toBe(false);

    // 4000 × 3000 × 500 = 6 000 000 000
    expect(solid3dMassProperties(solids[0]).volume).toBeCloseTo(6_000_000_000, 0);
    expect(eulerCounts(solid3dBody(solids[0])).characteristic).toBe(2);
  }

  // --- 2. Una segunda pieza y una RESTA -------------------------------------
  await select(page, ["perfil-hueco"]);
  await type(page, "EXTRUDE");
  await type(page, "500");
  await saveAndSettle(page, backend);

  let holeSolidId = "";
  {
    const saved = backend.snapshot().document;
    const solids = solidsOf(saved);
    expect(solids).toHaveLength(2);
    holeSolidId = solids.map((solid) => solid.id).find((id) => id !== baseSolidId)!;
  }

  await select(page, [baseSolidId, holeSolidId]);
  await type(page, "SUBTRACT");
  await saveAndSettle(page, backend);

  {
    const saved = backend.snapshot().document;
    const solids = solidsOf(saved);
    expect(solids).toHaveLength(1);
    const pieza = solids[0];

    // El árbol conserva los DOS operandos más la operación: la pieza sigue
    // siendo reeditable, no es una malla congelada.
    expect(pieza.nodes).toHaveLength(3);
    expect(pieza.nodes.some((node) => node.op === "subtract")).toBe(true);
    expect(pieza.nodes.filter((node) => node.op === "extrude")).toHaveLength(2);
    // Y los nodos homónimos se renombraron: las dos extrusiones traían un nodo
    // llamado `perfil` y sin prefijo uno habría pisado al otro, dejando una
    // resta plausible y equivocada.
    expect(new Set(pieza.nodes.map((node) => node.id)).size).toBe(3);

    // 4000·3000·500 − 1000·1000·500 = 6 000 000 000 − 500 000 000
    expect(solid3dMassProperties(pieza).volume).toBeCloseTo(5_500_000_000, 0);
    // Un hueco que no llega a los bordes deja un sólido de género 0 con una
    // cavidad pasante en Z: sus dos caras de arriba y abajo tienen un anillo.
    expect(eulerCounts(solid3dBody(pieza)).genus).toBe(1);
  }

  // --- 3. MASSPROP responde por la línea de comandos ------------------------
  {
    const saved = backend.snapshot().document;
    await select(page, [solidsOf(saved)[0].id]);
    await type(page, "MASSPROP");
    // La orden publica el volumen POR LOS DOS CAMINOS y su discrepancia: un solo
    // número escondería justo lo que sirve para saber si fiarse de él.
    await expect(page.getByTestId("cad-command-line")).toContainText(/volumen/i);
    await expect(page.getByTestId("cad-command-line")).toContainText(/deriva/i);
  }

  // --- 4. Cerrar y REABRIR: la prueba de que ya no es una isla --------------
  const beforeReload = backend.snapshot().document;
  const expectedVolume = solid3dMassProperties(solidsOf(beforeReload)[0]).volume;

  await page.reload();
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  // El sólido reabierto se puede volver a designar: existe en el documento vivo
  // del editor, no sólo en el JSON del servidor.
  await select(page, [solidsOf(beforeReload)[0].id]);
  await saveAndSettle(page, backend);

  {
    const reopened = backend.snapshot().document;
    const solids = solidsOf(reopened);
    expect(solids).toHaveLength(1);
    expect(solids[0].nodes).toHaveLength(3);
    expect(solids[0].id).toBe(solidsOf(beforeReload)[0].id);
    expect(solids[0].root).toBe(solidsOf(beforeReload)[0].root);

    // El caché de evaluación se vacía A PROPÓSITO. Si el volumen coincidiera por
    // estar cacheado de los pasos anteriores, esta comprobación no diría nada
    // sobre lo que sobrevivió al viaje: se reconstruye desde cero, a partir del
    // árbol que llegó del servidor.
    clearSolidCache();
    expect(solid3dMassProperties(solids[0]).volume).toBeCloseTo(expectedVolume, 0);
    expect(eulerCounts(solid3dBody(solids[0])).genus).toBe(1);
  }
});
