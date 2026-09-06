/**
 * AUDITORÍA — EL MISMO `.dwg` RECIBE LA MISMA RESPUESTA POR LAS DOS PUERTAS (T-16).
 *
 * El producto tiene dos puertas de importación. La del TABLERO («Importar
 * como documento») pasa por `validateImportFile`, que conoce las betas DWG
 * firmadas y el tope de bytes de cada formato. La del ESTUDIO —el input del
 * plano DXF de fondo, con `accept=".dxf,.dwg"`— no llamaba a nadie: leía el
 * archivo entero como texto, medía 12 000 000 unidades UTF-16 escritas a mano
 * y contestaba SIEMPRE que el editor no lee DWG, aunque un despliegue con la
 * beta encendida lo admitiera por la otra puerta. Encima, el tablero decía
 * «formato no soportado» y el estudio la razón DWG: dos frases para un archivo.
 *
 * Desde T-16 el estudio entra por la misma puerta (`admitStudioBackdropFile`
 * → `validateImportFile`), por nombre y bytes, antes de leer nada. Aquí se
 * afirma lo que la ficha pide —el mismo archivo, la misma respuesta— con la
 * beta APAGADA, que es el único estado que CI construye
 * (`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` es variable de build y aquí no se
 * enciende nada). El estado con la beta encendida lo cubre
 * `document-import-door.spec.ts` contra la misma función que usa el tablero.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { API_ORIGIN } from "../fixtures/constants";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { firstPartyRequestFailure, loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };

/** Unos bytes con cabecera AC1015: la puerta decide por nombre y tamaño, sin leerlos. */
const ARCHIVO_DWG = {
  name: "planta-cliente.dwg",
  mimeType: "application/octet-stream",
  buffer: Buffer.from(`AC1015${"\0".repeat(64)}`, "latin1"),
};

function planoVacio(): CadDocument {
  return {
    meta: { version: 1, schema: 3, ...FOOTPRINT },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/** El tablero mínimo: sin proyectos, para crear uno y que el input se habilite. */
async function instalarTableroVacio(context: BrowserContext) {
  const projects: Array<{ id: string; name: string; status: string }> = [];
  await context.route(`${API_ORIGIN}/v1/cad/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (url.pathname === "/v1/cad/projects" && method === "GET") return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = { id: "10000000-0000-4000-8000-000000000001", name: body.name, status: "active" };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET") return json({ items: [] });
    if (url.pathname === "/v1/cad/blocks" && method === "GET") return json({ items: [] });
    return json({ message: "not found" }, 404);
  });
}

/**
 * La beta DWG es una variable de BUILD (`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`,
 * ADR-0009 §7): el CI construye con ella encendida y un despliegue con las
 * puertas cerradas la tiene apagada. La prueba afirma lo que el build dice en
 * los dos estados y comprueba que el selector del tablero coincide con él.
 */
const BETA_DWG = process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA === "true";

test("el tablero y el estudio contestan lo mismo al mismo .dwg: la razón DWG con la beta apagada, por dónde entra con la beta encendida", async ({
  context,
  page,
}) => {
  test.setTimeout(150_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);

  let respuestaDelTablero = "";
  await test.step("tablero: «Importar como documento» rechaza el .dwg y dice por qué", async () => {
    await instalarTableroVacio(context);
    await page.goto("/dashboard");
    await expect(page.getByText("Valle Design E2E")).toBeVisible();
    await page.getByLabel("Nombre del proyecto").fill("Organización / Dos puertas");
    await page.getByLabel("Crear proyecto").click();
    const entrada = page.getByLabel("Importar como documento");
    await expect(entrada).toBeEnabled();
    // El selector delata el build: ofrece `.dwg` sólo con la beta encendida.
    // Si el build y esta prueba no coinciden, que falle aquí y con nombre.
    const acepta = (await entrada.getAttribute("accept")) ?? "";
    expect(
      acepta.includes(".dwg"),
      `accept="${acepta}" con NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=${process.env.NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA ?? "(sin definir)"}`,
    ).toBe(BETA_DWG);
    // Con la beta encendida el tablero lo ADMITE y el .dwg sigue el camino de
    // importación (ADR-0009), que no es el asunto de esta prueba.
    if (BETA_DWG) return;
    // Con la beta apagada el selector ni ofrece `.dwg`; `setInputFiles` se lo
    // salta, como se lo salta quien arrastra el archivo o elige «todos».
    await entrada.setInputFiles(ARCHIVO_DWG);
    const aviso = page.getByRole("alert").filter({ hasText: "DWG" });
    await expect(aviso).toBeVisible();
    respuestaDelTablero = (await aviso.textContent())?.trim() ?? "";
    expect(respuestaDelTablero, "la razón DWG del contrato, no «formato no soportado»").toMatch(
      /DWG requiere un proveedor con licencia/,
    );
    expect(respuestaDelTablero).toMatch(/convierte el archivo a DXF/);
  });

  await test.step("estudio: el input del plano de fondo contesta exactamente lo mismo", async () => {
    // Registrado DESPUÉS del tablero: Playwright consulta las rutas de la más
    // nueva a la más vieja, así que el estudio ve su propio servidor.
    await installCadStudioBackend(context, planoVacio(), FOOTPRINT);
    const subidas: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && /\/dxf$/.test(new URL(request.url()).pathname))
        subidas.push(request.url());
    });
    await page.goto("/legacy/studio");
    await expect(page.getByTestId("cad-canvas")).toBeVisible();
    const saltar = page.getByTestId("cad-guided-tour-skip");
    if (await saltar.count()) await saltar.click();
    await page.getByTestId("cad-dxf-input").setInputFiles(ARCHIVO_DWG);
    if (BETA_DWG) {
      // La puerta compartida lo admite y el fondo no lo pinta: dice por dónde
      // entra (D-12), en vez de la mentira vieja «el editor no lee DWG».
      const toast = page.getByTestId("app-toast").filter({ hasText: "entra como documento" });
      await expect(toast).toBeVisible();
      await expect(toast).toContainText("Este DWG entra como documento, no como plano de fondo");
    } else {
      const toast = page.getByTestId("app-toast").filter({ hasText: "DWG requiere" });
      await expect(toast).toBeVisible();
      const respuestaDelEstudio = (await toast.textContent()) ?? "";
      expect(respuestaDelEstudio, "la misma frase, palabra por palabra").toContain(respuestaDelTablero);
    }
    // Lo que la puerta rechaza no se lee ni se sube: antes el estudio
    // materializaba el archivo entero como texto para decirle que no.
    expect(subidas, "un archivo rechazado en la puerta no viaja al servidor").toEqual([]);
  });
});
