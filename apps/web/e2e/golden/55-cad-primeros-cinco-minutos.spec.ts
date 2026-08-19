import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";
import { API_ORIGIN } from "../fixtures/constants";
import { saveAndSettle } from "../fixtures/cad-save";
import { inspectCadPdf } from "../../src/lib/cad/plot/plot-pdf";
import { createCadStarterDocument } from "../../src/lib/cad/starter-templates";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * LOS PRIMEROS CINCO MINUTOS — el recorrido que vende el producto.
 *
 * Un arquitecto mexicano paga 2.179 MXN al mes por AutoCAD y nosotros cobramos
 * 199. Nadie cambia por precio: cambia cuando el coste de cambiar es casi cero.
 * Este golden es esa afirmación hecha ejecutable — una cuenta nueva llega hasta
 * un PDF sin configurar nada.
 *
 * Son DOS pruebas porque son dos afirmaciones que se pueden falsificar por
 * separado, y juntarlas escondería cuál de las dos se rompió:
 *
 *  1. **La plantilla se elige y LLEGA AL DOCUMENTO.** Se conduce el diálogo real
 *     de «Nuevo documento» y se afirma sobre el JSON que el servidor recibió:
 *     sus capas, su estilo de cota, su lámina a 1:50 y su cajetín. Un selector
 *     que se pinta y no escribe nada pasaría cualquier prueba que sólo mirase la
 *     interfaz.
 *
 *  2. **El recorrido llega hasta el archivo.** Muro, puerta DE LA BIBLIOTECA
 *     SEMBRADA, cota y PDF, tecleando y pulsando como se haría de verdad, con el
 *     acompañante marcando cada paso. Lo que se afirma del PDF son sus BYTES
 *     —páginas y tamaño de hoja—, no una captura del visor: una captura no
 *     distingue un A1 de un A2 mal escalado.
 *
 * El recorrido guiado se afirma por su ESTADO, no por su texto: cada paso lleva
 * `data-state` y pasa a `done` cuando el dibujo lo demuestra. Así la prueba
 * comprueba que el acompañante lee el plano, que es su única razón de ser.
 */

/**
 * La puerta de 0,90 m tal y como la siembra la migración
 * `ArchitecturalBlockLibrarySeed`.
 *
 * Se copia aquí en vez de importarse de `apps/api`: el web no depende de la API
 * y hacer que un golden lo hiciera crearía una dependencia entre aplicaciones
 * por la puerta de atrás. Lo que garantiza que esta copia sigue siendo fiel es
 * la spec del sembrado en el lado de la API, que comprueba cada medida contra su
 * caja envolvente declarada. Aquí lo que se prueba es OTRA cosa: que un bloque
 * que llega por la biblioteca del inquilino se puede colocar en un plano.
 */
const SEEDED_DOOR = {
  id: "valle:arq:puerta-abatible-90",
  name: "Puerta abatible 0.90 m",
  basePoint: { x: 0, y: 0, z: 0 },
  description:
    "Puerta abatible de 0.90 m para acceso a la vivienda. Se inserta en el quicial; para el giro contrario, escala −1 en X.",
  keywords: ["puerta", "abatible", "acceso", "arquitectura"],
  version: 1,
  attributes: {
    CLAVE: { defaultValue: "P-01", prompt: "Clave en planta" },
    ANCHO: { defaultValue: "0.90", prompt: "Ancho (m)" },
    ALTO: { defaultValue: "2.10", prompt: "Alto (m)" },
    SENTIDO: { defaultValue: "izquierda", prompt: "Sentido de giro" },
  },
  entities: [
    {
      id: "valle:arq:puerta-abatible-90:e0",
      type: "polyline",
      layer: "architecture",
      closed: true,
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 45, y: 0, z: 0 },
        { x: 45, y: 900, z: 0 },
        { x: 0, y: 900, z: 0 },
      ],
    },
    {
      id: "valle:arq:puerta-abatible-90:e1",
      type: "arc",
      layer: "architecture",
      center: { x: 0, y: 0, z: 0 },
      radius: 900,
      startAngle: 0,
      endAngle: 90,
    },
    {
      id: "valle:arq:puerta-abatible-90:e2",
      type: "line",
      layer: "architecture",
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: -150, z: 0 },
    },
    {
      id: "valle:arq:puerta-abatible-90:e3",
      type: "line",
      layer: "architecture",
      start: { x: 900, y: 0, z: 0 },
      end: { x: 900, y: -150, z: 0 },
    },
  ],
} as const;

/** Teclea en la línea de comandos y confirma, como se haría de verdad. */
async function type(page: Page, value: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

const stepState = (page: Page, id: string) =>
  page.getByTestId(`cad-guided-tour-step-${id}`);

// ---------------------------------------------------------------------------
// 1. La plantilla se elige en el diálogo real y llega al documento
// ---------------------------------------------------------------------------

test("elegir plantilla al crear el documento deja capas, estilo de cota, escala y cajetín puestos", async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  await loginAsStandaloneOwner(context);

  const projects: Array<{ id: string; name: string; status: string }> = [];
  const documents: Array<{
    id: string;
    projectId: string;
    name: string;
    model: null;
    revision: null;
    cadDocumentVersion: number;
    cadDocument: CadDocument | null;
  }> = [];

  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (url.pathname === "/v1/cad/projects" && method === "GET")
      return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = {
        id: "10000000-0000-4000-8000-000000000001",
        name: body.name,
        status: "active",
      };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET")
      return json({ items: documents });
    if (url.pathname === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as { name: string; projectId: string };
      const document = {
        id: "20000000-0000-4000-8000-000000000001",
        projectId: body.projectId,
        name: body.name,
        model: null,
        revision: null,
        cadDocumentVersion: 0,
        cadDocument: null,
      };
      documents.push(document);
      return json(document, 201);
    }
    if (url.pathname === "/v1/cad/blocks" && method === "GET")
      return json({ items: [] });
    const match = url.pathname.match(/^\/v1\/cad\/documents\/([^/]+)(\/content)?$/);
    if (match && !match[2] && method === "GET") {
      const document = documents.find((item) => item.id === match[1]);
      return document ? json(document) : json({ message: "not found" }, 404);
    }
    if (match?.[2] && method === "PUT") {
      const document = documents.find((item) => item.id === match[1])!;
      const body = request.postDataJSON() as {
        expectedCadDocumentVersion: number;
        cadDocument: CadDocument;
      };
      expect(body.expectedCadDocumentVersion).toBe(document.cadDocumentVersion);
      document.cadDocument = body.cadDocument;
      document.cadDocumentVersion += 1;
      return json({ cadDocumentVersion: document.cadDocumentVersion });
    }
    return json({ message: "not found" }, 404);
  });

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del proyecto").fill("Casa Zaragoza");
  await page.getByLabel("Crear proyecto").click();

  // El selector ofrece las cuatro y describe la elegida: elegir a ciegas entre
  // cuatro nombres no es elegir.
  const picker = page.getByTestId("starter-template");
  await expect(picker).toBeVisible();
  await picker.selectOption("planta-arquitectonica");
  await expect(page.getByTestId("starter-template-detail")).toContainText("1:50");
  // La ubicación de la obra se teclea AQUÍ, en el minuto cero, no al ir a
  // ventanilla con veinte láminas ya trazadas.
  await page.getByTestId("starter-location").fill("Álvaro Obregón 145, Roma Norte");

  await page.getByLabel("Nombre del documento").fill("Planta baja");
  await page.getByLabel("Crear documento").click();
  // Margen ancho a propósito: en modo desarrollo esta navegación dispara la
  // compilación del estudio, que es el archivo más grande del repositorio. El
  // producto no tarda esto; el compilador sí.
  await expect(page).toHaveURL(/\/studio\/20000000-0000-4000-8000-000000000001$/, {
    timeout: 90_000,
  });

  // Lo que importa no es que la pantalla cambiara: es lo que el servidor recibió.
  await expect.poll(() => documents[0]?.cadDocumentVersion).toBe(1);
  const saved = documents[0].cadDocument!;

  // ── Capas: las de oficio Y el sustrato que exigen los bloques sembrados ──
  const layerIds = new Set(saved.layers.map((layer) => layer.id));
  for (const expected of ["MURO", "VANO", "COTA", "TEXTO", "EJE"])
    expect(layerIds.has(expected)).toBe(true);
  // Sin éstas, colocar una puerta sembrada produce un documento que la API
  // rechaza con 400: su geometría vive ahí.
  expect(layerIds.has("architecture")).toBe(true);
  expect(layerIds.has("equipment")).toBe(true);
  expect(saved.layers.find((layer) => layer.id === "MURO")?.lineweight).toBe(0.35);
  expect(saved.layers.find((layer) => layer.id === "EJE")?.linetype).toBe("CENTER");

  // ── Estilo de cota atado a la escala ──
  // La cota nace COMO SE ACOTA EN MÉXICO: metros con dos decimales y garrapata,
  // no milímetros con flecha. Es lo primero que un arquitecto mexicano corregiría
  // a mano si no viniera dado, cota por cota.
  expect(saved.styles.dimension["COTA 1:50"]).toMatchObject({
    textStyle: "ROTULO",
    precision: 2,
    units: "m",
    arrowhead: "architectural-tick",
  });
  // Y el documento trae estilo para 1:75, que en México se usa a diario y no
  // figura en ISO 5455: cambiar de escala no obliga a reacotar el plano.
  expect(saved.styles.dimension["COTA 1:75"]).toBeTruthy();
  // 2,5 mm de papel a 1:50 son 125 unidades de modelo. Ni 2,5 ni 125 elegidos a
  // ojo: es la conversión anotativa.
  expect(saved.styles.text.ROTULO.height).toBe(125);
  expect(saved.styles.dimension["COTA 1:50"].arrowSize).toBe(125);

  // ── Lámina, escala y cajetín ──
  expect(saved.paperSpaces).toHaveLength(1);
  const [sheet] = saved.paperSpaces;
  expect(sheet.page.width).toBe(841);
  expect(sheet.page.height).toBe(594);
  expect(sheet.pageSetup?.margins.left).toBe(20);
  const [viewport] = sheet.viewports ?? [];
  expect(viewport.scale).toBe(50);
  expect(viewport.annotationScale).toBe(50);
  expect(viewport.locked).toBe(true);
  expect(sheet.titleBlock?.attributes.PROJECT).toBe("Casa Zaragoza");
  expect(sheet.titleBlock?.attributes.TITLE).toBe("Planta baja");
  expect(sheet.titleBlock?.attributes.SHEET_NO).toBe("A-101");
  expect(sheet.titleBlock?.attributes.UNIDADES).toBe("mm");
  // El cajetín es el MEXICANO: la disposición viaja con la lámina, así que las
  // veinte del juego salen iguales sin que nadie tenga que acordarse.
  expect(sheet.titleBlock?.attributes.TITLE_BLOCK_VARIANT).toBe("mexicano");
  // Y la ubicación de la obra —que ISO 7200 no nombra y una alcaldía sí pide—
  // llega desde el formulario hasta el documento guardado.
  expect(sheet.titleBlock?.attributes.UBICACION).toBe("Álvaro Obregón 145, Roma Norte");

  // Y el lienzo arranca VACÍO: la plantilla configura, no dibuja.
  expect(saved.entities).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2. Muro, puerta sembrada, cota y PDF — con el acompañante marcando
// ---------------------------------------------------------------------------

function starterDocument(): CadDocument {
  return createCadStarterDocument({
    templateId: "planta-arquitectonica",
    project: "Casa Zaragoza",
    client: "Familia Zaragoza",
    title: "Planta baja",
    drawnBy: "S. Valle",
    date: "2026-08-19",
  });
}

async function installCadBackend(context: BrowserContext) {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: starterDocument() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 40_550,
      // 26.200 y no 27.200: el cajetín mexicano con responsiva mide 50 mm de
      // alto y no 30, y esos veinte milímetros se pagan en área de dibujo.
      footprintH: 26_200,
      unit: "mm",
      gridSize: 100,
    },
  });
  // La biblioteca del inquilino llega SEMBRADA, como en producción.
  backend.seedLibraryBlock({
    name: SEEDED_DOOR.name,
    definition: SEEDED_DOOR as unknown as Record<string, unknown>,
  });
  return {
    backend,
    snapshot: () => {
      const current = snapshot();
      return {
        document: current.document as unknown as CadDocument,
        version: current.version,
      };
    },
  };
}

test("de una cuenta nueva a un PDF: muro, puerta de la biblioteca sembrada, cota y trazado", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible({ timeout: 90_000 });

  /* ── 0. El acompañante sale solo, con sus cinco pasos ──────────────────── */
  const tour = page.getByTestId("cad-guided-tour");
  await expect(tour).toBeVisible();
  for (const id of ["lamina", "muro", "puerta", "cota", "pdf"])
    await expect(stepState(page, id)).toBeVisible();
  await expect(stepState(page, "lamina")).toHaveAttribute("data-state", "current");
  // Se puede saltar en cualquier momento: el botón está desde el primer paso.
  await expect(page.getByTestId("cad-guided-tour-skip")).toBeVisible();

  // El cronómetro del recorrido arranca aquí. Lo que se mide es el tiempo de
  // MÁQUINA de los cuatro gestos; una persona tarda más en decidir dónde pincha,
  // pero si la máquina ya se comiera los cinco minutos no habría recorrido que
  // valiera.
  const startedAt = Date.now();

  await page.getByTestId("cad-guided-tour-acknowledge").click();
  await expect(stepState(page, "lamina")).toHaveAttribute("data-state", "done");
  await expect(stepState(page, "muro")).toHaveAttribute("data-state", "current");

  /* ── 1. WA: el muro paramétrico, tecleado ──────────────────────────────── */
  await type(page, "WA");
  await expect(page.getByTestId("cad-command-prompt")).toContainText(
    "Precise el punto inicial del muro",
  );
  await type(page, "2000,2000");
  await type(page, "6000,2000");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cad-native-document-count")).toHaveText("Native 1");

  // El acompañante lee el DIBUJO: el muro cierra su paso sin que nadie se lo
  // diga.
  await expect(stepState(page, "muro")).toHaveAttribute("data-state", "done", {
    timeout: 15_000,
  });
  await expect(stepState(page, "puerta")).toHaveAttribute("data-state", "current");

  /* ── 2. La puerta, DE LA BIBLIOTECA SEMBRADA ───────────────────────────── */
  await page.getByTitle(/^BLOCK\/INSERT:/).click();
  const palette = page.getByTestId("cad-block-palette");
  await expect(palette).toBeVisible();
  // La fila existe porque el servidor la publicó, no porque este spec la creara.
  const doorRow = page.getByTestId(`cad-block-row-${SEEDED_DOOR.name}`);
  await expect(doorRow).toBeVisible();
  await doorRow.click();
  // Se engancha al extremo del muro: el punto de inserción del bloque ES el
  // quicial, así que la puerta cae donde el vano empieza.
  await page.getByTestId("cad-block-insert-x").fill("3000");
  await page.getByTestId("cad-block-insert-y").fill("2000");
  await page.getByTestId("cad-block-insert").click();

  await expect(stepState(page, "puerta")).toHaveAttribute("data-state", "done", {
    timeout: 15_000,
  });
  await expect(stepState(page, "cota")).toHaveAttribute("data-state", "current");

  /* ── 3. La cota ────────────────────────────────────────────────────────── */
  await type(page, "DLI");
  await type(page, "2000,2000");
  await type(page, "6000,2000");
  await type(page, "4000,1000");
  await expect(stepState(page, "cota")).toHaveAttribute("data-state", "done", {
    timeout: 15_000,
  });
  await expect(stepState(page, "pdf")).toHaveAttribute("data-state", "current");

  /* ── 4. Lo dibujado llega al servidor con su receta ────────────────────── */
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    const walls = saved.entities.filter((entity) => entity.type === "wall");
    expect(walls).toHaveLength(1);
    const inserts = saved.entities.filter((entity) => entity.type === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].type === "insert" && inserts[0].block).toBe(SEEDED_DOOR.id);
    // La DEFINICIÓN viajó con el documento: un INSERT que apunta a un bloque que
    // sólo vive en la biblioteca es un plano que se abre vacío en otra máquina.
    expect(saved.blocks.some((block) => block.id === SEEDED_DOOR.id)).toBe(true);
    expect(
      saved.entities.filter((entity) => entity.type === "dimension"),
    ).toHaveLength(1);
    // Y la lámina de la plantilla sigue ahí, con su escala.
    expect(saved.paperSpaces[0]?.viewports?.[0].scale).toBe(50);
  }

  /* ── 5. PLOT: sale un PDF y se afirma sobre sus BYTES ──────────────────── */
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await type(page, "PLOT");
  await type(page, "T");
  await type(page, "planta-arquitectonica");

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("planta-arquitectonica.pdf");
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = new Uint8Array(await readFile(path!));
  const pdf = inspectCadPdf(bytes);
  expect(pdf.pageCount).toBe(1);
  // A1 apaisado son 841 × 594 mm: la hoja que puso la plantilla, no «ajustar».
  expect(pdf.pageSizesMm[0].width).toBeGreaterThan(840.9);
  expect(pdf.pageSizesMm[0].width).toBeLessThan(841.1);
  expect(pdf.pageSizesMm[0].height).toBeGreaterThan(593.9);
  expect(pdf.pageSizesMm[0].height).toBeLessThan(594.1);
  // Sin recurso de fuente no hay cajetín impreso.
  expect(pdf.baseFonts.length).toBeGreaterThan(0);

  /* ── 6. El recorrido se cierra SOLO y no vuelve ────────────────────────── */
  // Terminar no es un botón más: el último paso lo cierra el archivo entregado.
  await expect(tour).toBeHidden({ timeout: 20_000 });

  const elapsedMs = Date.now() - startedAt;
  // El objetivo declarado del recorrido son cinco minutos de PERSONA. Aquí se
  // afirma el techo de MÁQUINA con holgura: si los cuatro gestos tardaran más de
  // tres minutos en un runner cargado, no quedaría margen para que los piense
  // nadie.
  expect(elapsedMs).toBeLessThan(180_000);
  console.log(
    `Recorrido guiado completo (muro → puerta → cota → PDF): ${(elapsedMs / 1000).toFixed(1)} s de máquina.`,
  );

  // Volver a entrar NO lo vuelve a sacar: un recorrido que reaparece es un
  // anuncio.
  await page.reload();
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  await expect(page.getByTestId("cad-guided-tour")).toBeHidden();
});
