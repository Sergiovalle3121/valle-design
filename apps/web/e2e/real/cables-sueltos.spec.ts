/**
 * OLA 2.3 — BARRIDO DE CABLES SUELTOS.
 *
 * ─── La clase de defecto que este barrido persigue ─────────────────────────
 *
 * «Calculan pero el anfitrión no las deja aplicar»: un control perfectamente
 * escrito —controlado, con su etiqueta, con su `title`— cuyo efecto no llega a
 * ninguna parte. Ya había aparecido dos veces en el producto antes de esta
 * campaña. La primera vez que se corrió este barrido apareció una tercera: el
 * selector «Papel del plano» de la barra superior guardaba la elección en un
 * estado (`plotPaper`) que NO LEÍA NADIE; el usuario pedía A0 y la publicación
 * seguía usando el papel de cada hoja. Se retiró de la superficie —el papel se
 * elige por hoja, en el panel de layouts, que es el control que sí funciona— y
 * la orden «imprime en A3» del copiloto, que escribía en ese mismo estado
 * muerto, pasó a aplicar el papel por la vía canónica.
 *
 * ─── Cómo se mide, y por qué así ───────────────────────────────────────────
 *
 * Un botón de CAD puede hacer su trabajo sin tocar el DOM: cambiar de vista
 * repinta el lienzo y nada más. Otro descarga un archivo. Otro abre el
 * selector de archivos del navegador. Por eso el barrido no mira una sola
 * señal, sino CINCO, y basta una para declarar el control vivo:
 *
 *   · el DOM o el texto de la página cambian;
 *   · los píxeles del lienzo cambian;
 *   · empieza una descarga;
 *   · se abre un selector de archivos;
 *   · sale una petición a la API real.
 *
 * Cada control se pulsa sobre una carga LIMPIA del estudio, para que el efecto
 * medido sea suyo y no arrastre el del anterior.
 *
 * ─── Y la otra mitad, que es la que de verdad importa ──────────────────────
 *
 * Que pase algo en pantalla no basta: la campaña exige que el efecto llegue al
 * DOCUMENTO PERSISTIDO. La segunda prueba crea una capa desde el gestor de
 * capas, guarda con el botón del estudio y vuelve a leer el documento POR LA
 * API: la capa tiene que estar ahí, con su nombre, en PostgreSQL.
 */

import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
  apiPost,
  apiPut,
  capturedToken,
  csrfHeaders,
  latestCapturedEmail,
} from "../fixtures/first-party";

test.describe.configure({ mode: "serial" });
test.skip(
  process.env.E2E_REAL_API !== "1",
  "Requiere E2E_REAL_API=1, la API real y PostgreSQL 16.",
);

/**
 * Controles que se dejan FUERA del barrido, con su razón. No son excepciones a
 * la regla: son controles cuyo efecto es abandonar la pantalla que se está
 * midiendo, con lo que medirlos destruiría la medición del resto.
 */
const FUERA_DEL_BARRIDO: Record<string, string> = {
  "Cerrar el CAD": "sale del estudio: su efecto es navegar fuera",
  "Cerrar editor": "cierra el editor: su efecto es navegar fuera",
  "Recorrido a pie por el modelo":
    "captura el puntero en modo inmersivo y no se puede soltar desde el DOM",
};

/**
 * Controles que NO producen efecto y es CORRECTO que no lo produzcan: pulsar
 * la pestaña que ya está abierta o la herramienta que ya está activa no puede
 * cambiar nada. Cada uno se declara con la razón por la que ya estaba activo
 * al cargar el estudio; sin esta lista, el barrido los cantaría como muertos
 * y la lista de muertos dejaría de significar algo.
 */
const NO_OPERAN_POR_ESTAR_ACTIVOS: Record<string, string> = {
  // Era «Vista 3D»: el estudio cargaba en volumen. Desde la campaña de firma
  // abre en PLANTA —la primera impresión de un CAD de planos es un plano—, así
  // que el botón ya activo al cargar es el otro. Comprobado, no supuesto: una
  // sonda sobre el estudio recién abierto devuelve la clase de activo en «2D» y
  // la de inactivo en «3D».
  "Vista de plano 2D (superior, solo paneo y zoom)":
    "el estudio carga ya en vista de planta",
  Model: "la pestaña de espacio modelo ya está seleccionada",
  "Seleccionar / mover (V)": "es la herramienta activa al cargar",
  Puntos: "es la pestaña abierta del panel izquierdo",
};

/**
 * Controles deshabilitados con razón al cargar: no hay nada que deshacer, nada
 * que rehacer y nada seleccionado que encuadrar. Un botón deshabilitado no
 * miente —se ve que no se puede pulsar—, así que el barrido los cuenta aparte.
 */
/**
 * Controles cuyo efecto sobre un documento LIMPIO es correcto que sea ninguno,
 * y cuyo cableado se demuestra aparte. No se declaran a la ligera: cada uno
 * dice qué prueba lo cubre, porque «no hace nada» sin prueba que lo respalde es
 * justo lo que este barrido existe para no aceptar.
 */
const SIN_NADA_QUE_HACER: Record<string, string> = {
  Guardar:
    "sobre un documento sin cambios, `persistCanonicalSave` corta antes de la red " +
    "a propósito (idempotencia documentada: guardar dos veces la misma generación " +
    "no debe gastar una escritura ni una versión CAS). El indicador pasa por " +
    "«Guardando…» y vuelve a «Guardado» en menos de lo que dura el muestreo. " +
    "Su cableado real lo prueba la segunda prueba de este mismo archivo, que lo " +
    "pulsa CON un cambio pendiente y comprueba el PUT y la capa en PostgreSQL.",
};

const DESHABILITADOS_CON_RAZON = new Set([
  "Deshacer (Ctrl+Z)",
  "Rehacer (Ctrl+Shift+Z)",
  "Ajustar a la selección — encuadra los objetos seleccionados",
]);

const WALL_MM = 3500;

function documentoDePrueba() {
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#000000", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro",
        type: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: WALL_MM, y: 0, z: 0 },
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro"] },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** La firma de la pantalla: identificadores visibles, texto y número de botones. */
function firma(): string {
  const visible = (element: Element) => {
    const box = (element as HTMLElement).getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const ids = [...document.querySelectorAll("[data-testid]")]
    .filter(visible)
    .map((element) => element.getAttribute("data-testid"))
    .sort()
    .join(",");
  const text = (document.body.innerText || "").replace(/\s+/gu, " ");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1)
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  const buttons = [...document.querySelectorAll("button")].filter(visible).length;
  return `${location.pathname}|${ids}|${hash}|${text.length}|${buttons}`;
}

async function huellaDelLienzo(page: Page): Promise<string> {
  const canvas = page.locator("canvas").first();
  if (!(await canvas.count())) return "sin-lienzo";
  try {
    const shot = await canvas.screenshot({ timeout: 5_000 });
    return createHash("sha256").update(shot).digest("hex").slice(0, 16);
  } catch {
    return "ilegible";
  }
}

async function abrirEstudio(page: Page, documentId: string): Promise<void> {
  await page.goto(`/studio/${documentId}`);
  await expect(page.getByTestId("cad-command-line")).toBeVisible({
    timeout: 120_000,
  });
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click().catch(() => undefined);
  await page.waitForTimeout(900);
}

test.describe("Cables sueltos: cada control visible produce su efecto", () => {
  let context: BrowserContext;
  let page: Page;
  let documentId = "";

  const runId = Date.now().toString(36);
  const email = `cables-${runId}@example.test`;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();

    await context.request.post(`${API_ORIGIN}/v1/auth/register`, {
      data: { email, password: E2E_PASSWORD, displayName: "Barrido" },
    });
    const message = await latestCapturedEmail(context.request, email);
    await context.request.post(`${API_ORIGIN}/v1/auth/verify-email`, {
      data: { token: capturedToken(message) },
    });
    await context.request.post(`${API_ORIGIN}/v1/auth/login`, {
      data: { email, password: E2E_PASSWORD },
    });
    const organization = await apiPost<{ id: string }>(
      context,
      "/v1/organizations",
      { name: `Barrido ${runId}`, slug: `barrido-${runId}` },
    );
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId: organization.body.id },
      headers: await csrfHeaders(context),
    });
    const created = await apiPost<{ id: string; cadDocumentVersion: number }>(
      context,
      "/v1/cad/documents",
      { name: "Barrido de cables" },
    );
    documentId = created.body.id;
    const saved = await apiPut<{ cadDocumentVersion: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: documentoDePrueba(),
        expectedCadDocumentVersion: created.body.cadDocumentVersion,
      },
    );
    expect(saved.status).toBe(200);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("1 · ningún control visible del estudio se pulsa sin consecuencia", async () => {
    test.setTimeout(1_800_000);

    await abrirEstudio(page, documentId);

    const nombres: string[] = await page.evaluate(() =>
      [...document.querySelectorAll("button, select")]
        .filter((element) => {
          const box = (element as HTMLElement).getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((element) => {
          const html = element as HTMLElement;
          return (
            html.getAttribute("aria-label") ||
            html.getAttribute("title") ||
            (html.textContent || "").trim().slice(0, 60)
          );
        })
        .filter((name): name is string => !!name),
    );
    const inventario = [...new Set(nombres)];

    // Si la superficie encoge de golpe, el barrido dejaría de barrer sin que
    // nadie se enterase: eso también es un fallo.
    expect(
      inventario.length,
      "el estudio debe seguir exponiendo su superficie completa",
    ).toBeGreaterThan(60);

    const muertos: string[] = [];
    const vivos: string[] = [];
    const noLocalizables: string[] = [];

    for (const nombre of inventario) {
      if (
        Object.keys(FUERA_DEL_BARRIDO).some((clave) => nombre.startsWith(clave))
      )
        continue;

      await abrirEstudio(page, documentId);
      const antes = await page.evaluate(firma);
      const lienzoAntes = await huellaDelLienzo(page);

      let descargas = 0;
      let selectores = 0;
      let peticiones = 0;
      const alDescargar = () => {
        descargas += 1;
      };
      const alElegirArchivo = () => {
        selectores += 1;
      };
      const alPedir = (request: { url: () => string }) => {
        if (request.url().startsWith(API_ORIGIN)) peticiones += 1;
      };
      page.on("download", alDescargar);
      page.on("filechooser", alElegirArchivo);
      page.on("request", alPedir);

      const escapado = nombre.replace(/"/gu, '\\"');
      const control = page
        .locator(`[aria-label="${escapado}"], [title="${escapado}"]`)
        .first();
      let pulsado = false;
      try {
        if (await control.count()) {
          const etiqueta = await control.evaluate((element) =>
            element.tagName.toLowerCase(),
          );
          if (etiqueta === "select") {
            const valores = await control
              .locator("option")
              .evaluateAll((options) =>
                options.map((option) => (option as HTMLOptionElement).value),
              );
            const actual = await control.inputValue();
            const otro = valores.find((valor) => valor !== actual);
            if (otro) {
              await control.selectOption(otro, { timeout: 5_000 });
              pulsado = true;
            }
          } else {
            await control.click({ timeout: 5_000 });
            pulsado = true;
          }
        } else {
          const porTexto = page
            .getByRole("button", { name: nombre, exact: true })
            .first();
          if (await porTexto.count()) {
            await porTexto.click({ timeout: 5_000 });
            pulsado = true;
          }
        }
      } catch {
        // Un control deshabilitado no se puede pulsar: es honesto y se declara.
        page.off("download", alDescargar);
        page.off("filechooser", alElegirArchivo);
        page.off("request", alPedir);
        if (!DESHABILITADOS_CON_RAZON.has(nombre)) noLocalizables.push(nombre);
        continue;
      }
      if (!pulsado) {
        page.off("download", alDescargar);
        page.off("filechooser", alElegirArchivo);
        page.off("request", alPedir);
        noLocalizables.push(nombre);
        continue;
      }

      await page.waitForTimeout(1_200);
      const despues = await page.evaluate(firma);
      const lienzoDespues = await huellaDelLienzo(page);
      page.off("download", alDescargar);
      page.off("filechooser", alElegirArchivo);
      page.off("request", alPedir);

      const efecto =
        antes !== despues ||
        lienzoAntes !== lienzoDespues ||
        descargas > 0 ||
        selectores > 0 ||
        peticiones > 0;
      if (efecto) vivos.push(nombre);
      else muertos.push(nombre);
    }

    const muertosSinRazon = muertos.filter(
      (nombre) =>
        !(nombre in NO_OPERAN_POR_ESTAR_ACTIVOS) && !(nombre in SIN_NADA_QUE_HACER),
    );

    console.log(
      `Barrido: ${inventario.length} controles · ${vivos.length} con efecto · ` +
        `${muertos.length} sin efecto (${muertos.length - muertosSinRazon.length} declarados) · ` +
        `${noLocalizables.length} no localizables`,
    );

    expect(
      muertosSinRazon,
      "Controles visibles que se pulsan y no producen NINGÚN efecto observable " +
        "(ni DOM, ni lienzo, ni descarga, ni selector de archivos, ni red). " +
        "FIX-OR-HIDE: o se cablean, o se quitan de la superficie. Si de verdad " +
        "no operan por estar ya activos, se declaran en NO_OPERAN_POR_ESTAR_ACTIVOS.",
    ).toEqual([]);

    // Los declarados tienen que seguir existiendo: una lista de excepciones que
    // sobrevive al control que la justificaba es basura que oculta defectos.
    for (const declarado of [
      ...Object.keys(NO_OPERAN_POR_ESTAR_ACTIVOS),
      ...Object.keys(SIN_NADA_QUE_HACER),
    ]) {
      expect(
        inventario,
        `«${declarado}» está declarado como sin efecto observable, pero ya no existe en la superficie: retira la declaración`,
      ).toContain(declarado);
    }

    expect(vivos.length).toBeGreaterThan(50);
  });

  test("2 · lo que hace un control llega al documento PERSISTIDO", async () => {
    test.setTimeout(300_000);

    await abrirEstudio(page, documentId);

    // El gestor de capas del documento vive en el menú «Vista, capas y plano».
    await page.locator('[title="Vista, capas y plano"]').first().click();
    await expect(page.getByTestId("cad-layer-manager")).toBeVisible({
      timeout: 30_000,
    });

    const nombreCapa = `CIMENTACION-${runId}`.toUpperCase();
    await page.getByTestId("cad-layer-new-name").fill(nombreCapa);
    await page.getByTestId("cad-layer-create").click();

    // La capa aparece en la paleta: el control hizo su trabajo en memoria.
    await expect(
      page.getByTestId(`cad-layer-row-${nombreCapa}`),
    ).toBeVisible({ timeout: 30_000 });

    // Y ahora la mitad que importa: GUARDAR con el botón del estudio y volver
    // a leer el documento por la API. Nada de estado local, nada de optimismo.
    await page.keyboard.press("Escape");
    const guardado = page.waitForResponse(
      (response) =>
        response.url().includes(`/v1/cad/documents/${documentId}/content`) &&
        response.request().method() === "PUT",
    );
    await page.getByTestId("cad-save").click();
    expect((await guardado).status()).toBe(200);

    const releido = await apiGet<{
      cadDocument: { layers: Array<{ id: string; name: string }> } | null;
    }>(context, `/v1/cad/documents/${documentId}`);
    expect(releido.status).toBe(200);
    const capas = releido.body.cadDocument?.layers ?? [];
    expect(
      capas.map((capa) => capa.name),
      "la capa creada desde la paleta tiene que estar en PostgreSQL, no sólo en la pantalla",
    ).toContain(nombreCapa);
  });
});
