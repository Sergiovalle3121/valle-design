/**
 * ESCÉPTICO — ¿de verdad el panel de bloques OBLIGA a cerrarse para designar?
 *
 * El hallazgo que se pone a prueba: «para redefinir hay que ir abriendo y
 * cerrando el panel, porque tapa la lista con la que designo». La evidencia
 * aportada era que con `cad-library-dock` abierto no existe
 * `cad-native-entity-<id>`.
 *
 * Eso último es CIERTO y aquí se comprueba (paso B). Pero la lista «Entidades
 * nativas» no es la forma de designar de un delineante: es el cajón que el
 * panel de propiedades enseña CUANDO NO HAY NADA DESIGNADO. Un delineante
 * designa PINCHANDO EL OBJETO EN EL LIENZO, y el lienzo sigue entero a la
 * izquierda del panel.
 *
 * Así que la pregunta de verdad es otra: con el panel de bloques ABIERTO y sin
 * tocarlo en ningún momento, ¿se puede designar y redefinir? Eso es lo que
 * mide esta prueba, de punta a punta y con un solo clic en el lienzo.
 *
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/zz-esceptico-panel-bloques-designar.spec.ts \
 *     --project=chromium --reporter=line
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { fitFootprint } from "../fixtures/camera-preset";
import { worldPoint } from "../fixtures/world-point";

const SILLA = {
  id: "block:silla",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  version: 1,
  entities: [
    {
      id: "block:silla/e0",
      type: "polyline",
      layer: "0",
      closed: true,
      vertices: [
        { x: -225, y: -225, z: 0 },
        { x: 225, y: -225, z: 0 },
        { x: 225, y: 225, z: 0 },
        { x: -225, y: 225, z: 0 },
      ],
    },
  ],
};

/** Centro y medio lado del recambio: se pincha en el punto medio de su lado sur. */
const RECAMBIO = { cx: 6_000, cy: 5_000, half: 500 };

function documentoSemilla() {
  return {
    schema: "valle.cad.v1",
    id: "doc-esceptico-panel-bloques",
    unit: "mm",
    layers: [
      { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false },
    ],
    entities: [
      {
        id: "puesta-1",
        type: "insert",
        block: SILLA.id,
        insertion: { x: 2_500, y: 2_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
      {
        id: "puesta-2",
        type: "insert",
        block: SILLA.id,
        insertion: { x: 9_500, y: 2_000, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: "0",
      },
      {
        // El recambio: un cuadrado de 1.000 mm en mitad de la huella, lejos de
        // las dos sillas, para que un solo clic no pueda designar otra cosa.
        id: "recambio",
        type: "polyline",
        layer: "0",
        closed: true,
        vertices: [
          { x: RECAMBIO.cx - RECAMBIO.half, y: RECAMBIO.cy - RECAMBIO.half, z: 0 },
          { x: RECAMBIO.cx + RECAMBIO.half, y: RECAMBIO.cy - RECAMBIO.half, z: 0 },
          { x: RECAMBIO.cx + RECAMBIO.half, y: RECAMBIO.cy + RECAMBIO.half, z: 0 },
          { x: RECAMBIO.cx - RECAMBIO.half, y: RECAMBIO.cy + RECAMBIO.half, z: 0 },
        ],
      },
    ],
    history: [],
    modelSpace: { entityIds: ["puesta-1", "puesta-2", "recambio"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [SILLA],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/**
 * Lo ÚNICO que esta prueba lee del documento guardado. Un tipo local y estrecho
 * en vez de `any`: el backend habla la forma de cable v1, no `CadDocument`, así
 * que tipar con el canónico sería mentir; y con `any` un cambio de formato se
 * descubriría a mitad del recorrido, en una aserción, en vez de en el typecheck.
 */
interface DocumentoLeido {
  blocks: { id: string; version?: number }[];
  entities: { type: string; block?: string }[];
}

async function instalarBackend(context: BrowserContext) {
  const { snapshot } = await installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    },
  });
  return () => snapshot().document as unknown as DocumentoLeido;
}

const botonBloques = (page: Page) => page.getByTitle(/^BLOCK\/INSERT:/);

test("con el panel de bloques ABIERTO se designa en el lienzo y se redefine sin cerrarlo", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const leerDocumento = await instalarBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  const palette = page.getByTestId("cad-block-palette");

  await test.step("A. abrir el panel de bloques y NO volver a tocarlo", async () => {
    await botonBloques(page).click();
    await expect(palette).toBeVisible();
    await expect(page.getByTestId("cad-library-dock")).toBeVisible();
  });

  await test.step("B. la premisa del compañero: con el panel abierto no hay lista", async () => {
    // Esto es verdad, y se deja escrito: la lista «Entidades nativas» y el
    // panel comparten hueco.
    await expect(page.getByTestId("cad-native-entity-recambio")).toHaveCount(0);
    await expect(page.getByTestId("cad-native-entity-list")).toHaveCount(0);
  });

  await test.step("C. designar el recambio PINCHÁNDOLO EN EL LIENZO, con el panel abierto", async () => {
    // El encuadre se hace con el panel YA abierto: el panel estrecha el
    // lienzo, así que la transformación mundo↔pantalla se mide después.
    await fitFootprint(page);
    // Punto medio del lado sur del recambio: el pickbox designa por proximidad
    // a la geometría, no por estar dentro del cuadrado.
    const punto = await worldPoint(page, {
      x: RECAMBIO.cx,
      y: RECAMBIO.cy - RECAMBIO.half,
    });
    await page.mouse.click(punto.x, punto.y);

    // El panel SIGUE abierto: designar no lo ha cerrado.
    await expect(palette).toBeVisible();
    // Y el contador de la barra de estado dice que hay un objeto designado.
    await expect(page.getByTestId("cad-selection-status-count")).toHaveText(
      "1 sel",
      { timeout: 15_000 },
    );
    // El propio panel de bloques ve la designación EN VIVO, sin cerrarse:
    await expect(palette).toContainText("Crear BLOCK desde selección (1)");
  });

  await test.step("D. redefinir sin haber cerrado el panel ni una sola vez", async () => {
    await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
    const redefinir = palette.getByRole("button", { name: "Redefinir" });
    await expect(
      redefinir,
      "con un bloque elegido y un objeto designado, Redefinir tiene que estar vivo",
    ).toBeEnabled();
    await redefinir.click();
    await expect(page.getByTestId("cad-library-dock")).toBeVisible();
  });

  await test.step("E. y la redefinición llegó al documento guardado", async () => {
    const boton = page.getByTestId("cad-save");
    if ((await boton.count()) && (await boton.isEnabled())) {
      await boton.click();
      await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
        timeout: 30_000,
      });
    }
    const documento = leerDocumento();
    const definicion = documento.blocks.find((b) => b.id === SILLA.id);
    // Se comprueba que la definición SIGUE ahí antes de leerle la versión. Sin
    // esto, un redefinir que borrase el bloque en vez de actualizarlo daría un
    // TypeError sobre `undefined` —que no dice nada— en vez de decir que el
    // bloque desapareció, que es el fallo de verdad.
    expect(
      definicion,
      `redefinir no puede hacer desaparecer ${SILLA.id} del documento`,
    ).toBeDefined();
    expect(definicion?.version, "redefinir tiene que subir la versión").toBe(2);
    const puestas = documento.entities.filter((e) => e.type === "insert");
    expect(puestas).toHaveLength(2);
    for (const puesta of puestas) expect(puesta.block).toBe(SILLA.id);
  });
});
