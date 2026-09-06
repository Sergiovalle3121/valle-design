import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";

/**
 * AUDITORÍA — EL PLANO EN PAPEL, A ESCALA.
 *
 * Quien la firma: un jefe de obra. No dibuja; necesita SACAR el plano. Sin
 * papel a escala no hay replanteo: el encargado mide sobre la hoja con el
 * escalímetro y si la hoja miente, el error se paga en hormigón.
 *
 * Este recorrido no pregunta «¿hay un botón de imprimir?». Pregunta las tres
 * cosas por las que se paga:
 *
 *   1. ¿Puedo ENCONTRAR la impresión sin que nadie me la enseñe?
 *   2. ¿Puedo ELEGIR la escala (1:50, 1:100)?
 *   3. ¿El PDF que sale RESPETA esa escala? — se mide DENTRO del PDF,
 *      no se cree lo que diga la pantalla.
 *
 * La medida es directa: el dibujo sembrado es un rectángulo de 10.000 × 8.000
 * mm. A 1:50 tiene que ocupar 200 × 160 mm de papel; a 1:100, 100 × 80. Se
 * abre el PDF descargado, se descomprimen sus flujos y se mide la caja de la
 * geometría trazada (operadores `m`/`l`, en puntos → mm). Un PDF que salga
 * «bonito» pero a otra escala se ve aquí en un número.
 *
 * QUÉ ENCONTRÓ (cada uno con su test aquí abajo):
 *   · SIRVE: el PDF sale y la escala es EXACTA. 1:50 → 200,00 × 160,00 mm;
 *     1:100 → 100,00 × 80,00 mm. Medido dentro del archivo.
 *   · SIRVE: teclear PLOT también saca la hoja, con el muro de 10 m como un
 *     tramo de 200 mm de papel.
 *   · FALLA: imprimir, cambiar algo y volver a imprimir → conflicto CAS, ni
 *     PDF ni guardado hasta recargar. Segundo test, marcado `test.fail()`.
 *   · FALLA: «PLOT Extensión» (y «Límites») no traza en ningún dibujo.
 *   · MOLESTA: la escala nace bloqueada y el candado que la abre no tiene ni
 *     rótulo ni tooltip.
 *
 * CÓMO SE CORRE (el puerto NO es opcional):
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/imprimir.spec.ts --project=chromium --reporter=line
 */

/** El local: 12 × 10 m. */
const FOOTPRINT = { footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100 };
/** La nave sembrada: un rectángulo EXACTO de 10.000 × 8.000 mm. */
const NAVE = { x0: 1_000, y0: 1_000, x1: 11_000, y1: 9_000 };
const NAVE_W = NAVE.x1 - NAVE.x0;
const NAVE_H = NAVE.y1 - NAVE.y0;

/** 1 mm de papel = 72/25.4 puntos PDF. */
const PT_POR_MM = 72 / 25.4;

function documentoSemilla(): CadDocument {
  const esquinas = [
    [NAVE.x0, NAVE.y0, NAVE.x1, NAVE.y0],
    [NAVE.x1, NAVE.y0, NAVE.x1, NAVE.y1],
    [NAVE.x1, NAVE.y1, NAVE.x0, NAVE.y1],
    [NAVE.x0, NAVE.y1, NAVE.x0, NAVE.y0],
  ];
  const entities = esquinas.map(([ax, ay, bx, by], index) => ({
    id: `muro-${index}`,
    type: "line" as const,
    start: { x: ax, y: ay, z: 0 },
    end: { x: bx, y: by, z: 0 },
    layer: "0",
  }));
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#111827", visible: true, locked: false }],
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
  } as unknown as CadDocument;
}

async function abrirEstudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    documentoSemilla(),
    FOOTPRINT,
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  const saltar = page.getByTestId("cad-guided-tour-skip");
  if (await saltar.count()) await saltar.click();
  return backend;
}

// ---------------------------------------------------------------------------
// EL ESCALÍMETRO SOBRE EL PDF
// ---------------------------------------------------------------------------

/** Devuelve los flujos del PDF ya descomprimidos (FlateDecode o crudos). */
function flujosDelPdf(pdf: Buffer): string[] {
  const crudo = pdf.toString("latin1");
  const fuera: string[] = [];
  let cursor = 0;
  for (;;) {
    const inicio = crudo.indexOf("stream", cursor);
    if (inicio < 0) break;
    if (crudo.slice(inicio - 3, inicio) === "end") {
      cursor = inicio + 6;
      continue;
    }
    let datos = inicio + "stream".length;
    if (crudo[datos] === "\r") datos += 1;
    if (crudo[datos] === "\n") datos += 1;
    const fin = crudo.indexOf("endstream", datos);
    if (fin < 0) break;
    let ultimo = fin;
    while (ultimo > datos && (crudo[ultimo - 1] === "\n" || crudo[ultimo - 1] === "\r"))
      ultimo -= 1;
    const trozo = pdf.subarray(datos, ultimo);
    try {
      fuera.push(inflateSync(trozo).toString("latin1"));
    } catch {
      fuera.push(trozo.toString("latin1"));
    }
    cursor = fin + "endstream".length;
  }
  return fuera;
}

/**
 * Caja envolvente, EN MILÍMETROS DE PAPEL, de la geometría trazada.
 *
 * Sólo mira los operadores de trazado `m` (mover) y `l` (línea): el marco de
 * la hoja, el recuadro de la ventana y las celdas del cajetín se dibujan con
 * `re`, y el texto con `Td`/`Tj`, así que ninguno contamina la medida.
 */
function cajaDelDibujoMm(pdf: Buffer): { ancho: number; alto: number; puntos: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let puntos = 0;
  const operador = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(m|l)(?![A-Za-z0-9])/g;
  for (const flujo of flujosDelPdf(pdf)) {
    for (const encontrado of flujo.matchAll(operador)) {
      const x = Number(encontrado[1]);
      const y = Number(encontrado[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      puntos += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    ancho: puntos ? (maxX - minX) / PT_POR_MM : 0,
    alto: puntos ? (maxY - minY) / PT_POR_MM : 0,
    puntos,
  };
}

/** Respuestas del backend que importan para el trazado, con su código. */
const red: string[] = [];

/**
 * Los avisos del producto DESAPARECEN solos a los pocos segundos, así que
 * preguntar por ellos después de un plazo agotado no prueba nada. Se anotan
 * según salen.
 */
async function anotarAvisos(page: Page) {
  await page.evaluate(() => {
    const ventana = window as unknown as { __avisos?: string[] };
    if (ventana.__avisos) return;
    ventana.__avisos = [];
    const recoger = () => {
      document.querySelectorAll('[data-testid="app-toast"]').forEach((nodo) => {
        const texto = (nodo as HTMLElement).innerText.trim();
        if (texto && !ventana.__avisos!.includes(texto)) ventana.__avisos!.push(texto);
      });
    };
    new MutationObserver(recoger).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    recoger();
  });
}

/**
 * Largos, EN MILÍMETROS DE PAPEL, de cada tramo recto trazado.
 *
 * La caja envolvente sirve cuando la hoja sólo lleva el dibujo, pero el PDF de
 * PLOT dibuja además el marco, el cajetín y el borde de la ventana, y entonces
 * la caja mide el papel y no el plano. Los TRAMOS sí son del dibujo: un muro de
 * 10.000 mm a 1:50 tiene que aparecer como un tramo de 200 mm, esté donde esté
 * en la hoja. Es la medición del escalímetro, hecha sobre el archivo.
 */
function tramosMm(pdf: Buffer): number[] {
  const tramos: number[] = [];
  const operador = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(m|l)(?![A-Za-z0-9])/g;
  for (const flujo of flujosDelPdf(pdf)) {
    let actual: { x: number; y: number } | null = null;
    for (const encontrado of flujo.matchAll(operador)) {
      const punto = { x: Number(encontrado[1]), y: Number(encontrado[2]) };
      if (encontrado[3] === "l" && actual)
        tramos.push(Math.hypot(punto.x - actual.x, punto.y - actual.y) / PT_POR_MM);
      actual = punto;
    }
  }
  return tramos;
}

/** ¿Hay algún tramo que mida `esperado` mm de papel (± 0,5 mm)? */
function hayTramo(tramos: readonly number[], esperado: number): boolean {
  return tramos.some((largo) => Math.abs(largo - esperado) <= 0.5);
}

async function publicarYMedir(page: Page, etiqueta: string) {
  const descarga = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: /Publicar PDF/ }).click();
  // Si no llega archivo, lo que el producto le dijo al usuario ES la prueba:
  // se recoge el aviso de la interfaz antes de declarar nada.
  const archivo = await descarga.catch(async (error: Error) => {
    const avisos = await page.evaluate(
      () => (window as unknown as { __avisos?: string[] }).__avisos ?? [],
    );
    throw new Error(
      `${etiqueta}: no llegó ningún PDF. Avisos que mostró la interfaz: ${
        avisos.length ? JSON.stringify(avisos) : "NINGUNO"
      }. Red: ${JSON.stringify(red)}. ${error.message}`,
    );
  });
  const ruta = await archivo.path();
  expect(ruta, `${etiqueta}: el navegador no recibió ningún archivo`).not.toBeNull();
  const pdf = await readFile(ruta!);
  // Un PDF vacío es el fracaso clásico de esta función: se comprueba que es un
  // PDF de verdad y que pesa algo antes de creerse nada de su contenido.
  expect(pdf.subarray(0, 5).toString("latin1"), `${etiqueta}: no es un PDF`).toBe("%PDF-");
  expect(pdf.toString("latin1")).toContain("%%EOF");
  // «No vacío» de verdad se comprueba abajo, contando la geometría trazada;
  // aquí sólo se descarta el archivo de cero bytes.
  expect(pdf.byteLength, `${etiqueta}: el PDF está vacío`).toBeGreaterThan(1_000);
  const caja = cajaDelDibujoMm(pdf);
  console.log(
    `[auditoría·imprimir] ${etiqueta}: ${archivo.suggestedFilename()} · ${pdf.byteLength} bytes · ` +
      `${caja.puntos} vértices trazados · caja ${caja.ancho.toFixed(2)} × ${caja.alto.toFixed(2)} mm de papel`,
  );
  return { pdf, caja, tramos: tramosMm(pdf), nombre: archivo.suggestedFilename() };
}

// ---------------------------------------------------------------------------


/**
 * Publica y NO se rinde si no llega archivo: devuelve lo que pasó, con los
 * avisos que el producto mostró y las respuestas del backend. Es lo que hace
 * falta para poder AFIRMAR un fallo en vez de sólo tropezar con él.
 */
async function intentarPublicar(page: Page, etiqueta: string) {
  const antes = red.length;
  const descarga = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /Publicar PDF/ }).click();
  const archivo = await descarga.catch(() => null);
  const pdf = archivo ? await readFile((await archivo.path())!) : null;
  const avisos = await page.evaluate(
    () => (window as unknown as { __avisos?: string[] }).__avisos ?? [],
  );
  return { etiqueta, pdf, avisos, red: red.slice(antes) };
}

/** Deja el estudio con la vigilancia de avisos y de red puesta. */
async function abrirEstudioVigilado(context: BrowserContext, page: Page) {
  red.length = 0;
  page.on("response", (respuesta) => {
    const url = respuesta.url();
    if (/\/v1\/cad\//.test(url) && respuesta.request().method() !== "GET")
      red.push(
        `${respuesta.request().method()} ${url.replace(/^https?:\/\/[^/]+/, "")} -> ${respuesta.status()}`,
      );
  });
  const backend = await abrirEstudio(context, page);
  await anotarAvisos(page);
  return backend;
}

/** Abre el paquete de entrega y deja la escala de la hoja activa editable. */
async function abrirHojaEditable(page: Page) {
  await page.getByTitle(/Paquete de entrega/).click();
  await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
  await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
  if (await page.getByTestId("cad-viewport-scale").isDisabled())
    await page.getByTestId("cad-viewport-lock").click();
  await expect(page.getByTestId("cad-viewport-scale")).toBeEnabled();
}

test("el plano sale en PDF y respeta la escala que elige el jefe de obra", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudioVigilado(context, page);

  await test.step("1. encontrar por dónde se imprime", async () => {
    // Lo que un jefe de obra busca es la palabra «Imprimir». No la hay: los
    // botones de salida de la barra superior no llevan rótulo, sólo icono y
    // `title`, y el que imprime se llama «Publicar conjunto PDF vectorial».
    await expect(page.getByTitle(/Publicar conjunto PDF vectorial/)).toBeVisible();
    await expect(page.getByTitle(/Paquete de entrega/)).toBeVisible();
  });

  await test.step("2. crear la hoja", async () => {
    await page.getByTitle(/Paquete de entrega/).click();
    await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
    // Sin hojas no hay nada que publicar, y el producto lo dice apagando el
    // botón en vez de dejarlo pulsar y fallar después. Bien.
    await expect(page.getByRole("button", { name: /Publicar PDF/ })).toBeDisabled();
    await page.getByRole("button", { name: "+ Hoja" }).click();
    await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
    // BIEN: la hoja nace con una escala que CABE, elegida sola (A3 apaisado,
    // 12 × 10 m → 1:50). El jefe de obra no parte de una hoja en blanco.
    await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("50");
  });

  await test.step("3. HALLAZGO: la escala nace bloqueada y nada lo explica", async () => {
    // El selector de escala está APAGADO en una hoja recién creada, porque la
    // ventana gráfica nace `locked: true` (`cadPlanViewport`, en
    // src/lib/cad/cad-paper-viewport.ts). No hay mensaje, ni tooltip, ni texto
    // de ayuda: el único indicio es un candado de 14 px junto al nombre de la
    // ventana, y ese botón NO TIENE nombre accesible — ni `title` ni
    // `aria-label` ni texto. Se descubre probando, o leyendo el código.
    await expect(page.getByTestId("cad-viewport-scale")).toBeDisabled();
    const candado = page.getByTestId("cad-viewport-lock");
    expect(await candado.getAttribute("title")).toBeNull();
    expect(await candado.getAttribute("aria-label")).toBeNull();
    expect((await candado.innerText()).trim()).toBe("");
    await candado.click();
    await expect(page.getByTestId("cad-viewport-scale")).toBeEnabled();
  });

  await test.step("4. elegir 1:50 a mano", async () => {
    await page.getByTestId("cad-viewport-scale").selectOption("50");
    await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("50");
  });

  const a50 = await test.step("5. publicar a 1:50 y medir el PDF", () =>
    publicarYMedir(page, "1:50"));

  // 10.000 mm a 1:50 = 200 mm de papel; 8.000 mm = 160 mm. Medido DENTRO del
  // PDF, no en pantalla.
  expect(a50.caja.puntos, "el PDF no trae geometría trazada").toBeGreaterThan(0);
  expect(a50.caja.ancho).toBeCloseTo(NAVE_W / 50, 0);
  expect(a50.caja.alto).toBeCloseTo(NAVE_H / 50, 0);
  // Y tramo a tramo, que es como se mide con el escalímetro sobre la hoja.
  expect(hayTramo(a50.tramos, NAVE_W / 50)).toBe(true);
  expect(hayTramo(a50.tramos, NAVE_H / 50)).toBe(true);

  const a100 = await test.step("6. recargar, poner 1:100 y volver a publicar", async () => {
    // LA RECARGA NO ES CAPRICHO: sin ella la segunda publicación muere con un
    // conflicto CAS. Está aislado y demostrado en el test siguiente; aquí se
    // rodea para poder medir la SEGUNDA escala, que es lo que este test mide.
    await page.reload();
    await expect(page.getByTestId("cad-canvas")).toBeVisible();
    const saltar = page.getByTestId("cad-guided-tour-skip");
    if (await saltar.count()) await saltar.click();
    await anotarAvisos(page);
    await abrirHojaEditable(page);
    // La hoja sobrevivió al refresco con su escala: eso también es producto.
    await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("50");
    await page.getByTestId("cad-viewport-scale").selectOption("100");
    await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("100");
    return publicarYMedir(page, "1:100");
  });

  expect(a100.caja.ancho).toBeCloseTo(NAVE_W / 100, 0);
  expect(a100.caja.alto).toBeCloseTo(NAVE_H / 100, 0);
  expect(hayTramo(a100.tramos, NAVE_W / 100)).toBe(true);
  expect(hayTramo(a100.tramos, NAVE_H / 100)).toBe(true);
  // La comprobación que no depende de saber nada del formato PDF: la mitad de
  // escala, la mitad de papel. Si esto no sale 2, la escala es decorativa.
  expect(a50.caja.ancho / a100.caja.ancho).toBeCloseTo(2, 1);

  // La hoja tiene que DECIR a qué escala está: un plano sin escala escrita no
  // se puede replantear con el escalímetro.
  expect(flujosDelPdf(a100.pdf).join("\n"), "la hoja no declara su escala").toContain(
    "1:100",
  );
});

/**
 * HALLAZGO AISLADO — DESPUÉS DE IMPRIMIR, EL DIBUJO SE QUEDA SIN GUARDAR.
 *
 * El recorrido es el de cualquier obra: se imprime la planta a 1:50, se ve que
 * para el detalle hace falta 1:100, se cambia la escala y se vuelve a imprimir.
 * El segundo PDF NO SALE.
 *
 * Marcado `test.fail()`: hoy falla, y falla POR UN DEFECTO, no por el entorno.
 * El día que se arregle, Playwright avisará de que este test «pasó cuando se
 * esperaba que fallara» — que es exactamente el aviso que se quiere.
 *
 * Evidencia recogida por este mismo test (se imprime en la corrida):
 *   · 1ª publicación:  PUT  /v1/cad/documents/…/content      -> 200
 *                      POST /v1/cad/documents/…/publications -> 201   (PDF OK)
 *   · edición normal (cambiar la escala de la ventana)
 *   · 2ª publicación:  PUT  /v1/cad/documents/…/content      -> 409
 *                      aviso «Conflicto CAS — El documento cambió en el
 *                      servidor. Recarga o resuelve el conflicto antes de
 *                      guardar.» y NINGÚN PDF.
 *
 * OJO: publicar dos veces SIN tocar nada entre medias sí funciona — el segundo
 * guardado no llega a viajar porque no hay nada nuevo que guardar. Hace falta
 * una edición por el medio, que es lo que hace cualquiera.
 *
 * Por qué pasa: publicar avanza la versión del documento en el servidor (el
 * recibo de publicación es server-managed y suma uno). `publishSheetSetPdf`
 * refresca `data.cadDocumentVersion` con la versión del recibo, pero el token
 * CAS que el guardado usa de verdad —`versionByDocumentRef`, en
 * `persistCanonicalSave`— se queda con el valor anterior, así que el siguiente
 * guardado llega con una versión caducada y el servidor lo rechaza.
 *
 * Por qué duele: no es sólo el segundo PDF. El conflicto deja el GUARDADO
 * enclavado —el propio producto enclava el autosave para no reintentar una
 * versión ya rechazada— así que a partir de la primera impresión el trabajo
 * que se siga haciendo no se guarda hasta recargar la página.
 */
test("imprimir, cambiar la escala y volver a imprimir", async ({ context, page }) => {
  // Dentro del cuerpo a propósito: a nivel de archivo marcaría TODOS los tests.
  test.fail();
  test.setTimeout(240_000);
  await abrirEstudioVigilado(context, page);

  await page.getByTitle(/Paquete de entrega/).click();
  await expect(page.getByTestId("cad-sheet-package")).toBeVisible();
  await page.getByRole("button", { name: "+ Hoja" }).click();
  await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");

  const primero = await publicarYMedir(page, "1ª publicación a 1:50");
  expect(primero.caja.ancho).toBeCloseTo(NAVE_W / 50, 0);

  // Una edición cualquiera. Aquí, la que el jefe de obra necesita: otra escala.
  await page.getByTestId("cad-viewport-lock").click();
  await page.getByTestId("cad-viewport-scale").selectOption("100");
  await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("100");

  const segundo = await intentarPublicar(page, "2ª publicación a 1:100");
  // El estado de guardado, DESPUÉS del intento: si esto no dice «Guardado», el
  // dibujo se ha quedado sin poder persistir, que es peor que no imprimir.
  const estado = await page.getByTestId("cad-save-status").innerText().catch(() => "(sin estado)");
  console.log(
    `[auditoría·imprimir] 2ª publicación · pdf=${segundo.pdf ? "sí" : "NO"} · ` +
      `estado de guardado=${JSON.stringify(estado.trim())} · avisos=${JSON.stringify(segundo.avisos)} · ` +
      `red=${JSON.stringify(segundo.red.filter((linea) => !linea.includes("presence")))}`,
  );

  expect(
    segundo.pdf,
    `no salió el segundo PDF. Avisos: ${JSON.stringify(segundo.avisos)}`,
  ).not.toBeNull();
});

/**
 * EL CAMINO DE SIEMPRE: teclear PLOT.
 *
 * Un jefe de obra con oficio no busca el botón: escribe PLOT y le da a trazar.
 * Ese camino es OTRO motor —`lib/cad/plot/plot-job` + `plot-pdf`, servido por
 * `CadPlotHost`— distinto del botón «Publicar conjunto PDF». Se mide igual:
 * ¿sale archivo, y a la escala que la hoja declara?
 */
test("teclear PLOT saca la hoja, pero «Extensión» no traza nunca", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await abrirEstudioVigilado(context, page);

  await test.step("hay una presentación que trazar", async () => {
    await page.getByTitle(/Paquete de entrega/).click();
    await page.getByRole("button", { name: "+ Hoja" }).click();
    await expect(page.getByTestId("cad-layout-manager")).toContainText("Viewports · 1");
    // La hoja nace a 1:50, elegida por el producto. Trazarla a tamaño real
    // (1:1 de papel a papel) tiene que dar el dibujo a 1:50.
    await expect(page.getByTestId("cad-viewport-custom-scale")).toHaveValue("50");
    await page.getByLabel("Cerrar paquete de entrega").click();
    await expect(page.getByTestId("cad-sheet-package")).toHaveCount(0);
  });

  const entrada = page.getByTestId("cad-command-input");

  const pdf = await test.step("PLOT ⏎ Trazar ⏎ nombre ⏎", async () => {
    const descarga = page.waitForEvent("download", { timeout: 45_000 });
    await entrada.click();
    await entrada.fill("PLOT");
    await entrada.press("Enter");
    // El prompt de PLOT ofrece sus opciones como BOTONES: se piden con el ratón.
    await expect(page.getByTestId("cad-command-keyword-Trazar")).toBeVisible();
    await page.getByTestId("cad-command-keyword-Trazar").click();
    await entrada.fill("planta-obra");
    await entrada.press("Enter");
    const archivo = await descarga.catch(async () => {
      const registro = await page.getByTestId("cad-command-line-log").innerText();
      throw new Error(`PLOT no entregó ningún archivo. Línea de comandos:\n${registro}`);
    });
    const bytes = await readFile((await archivo.path())!);
    const caja = cajaDelDibujoMm(bytes);
    const tramos = tramosMm(bytes);
    console.log(
      `[auditoría·imprimir] PLOT: ${archivo.suggestedFilename()} · ${bytes.byteLength} bytes · ` +
        `${caja.puntos} vértices · caja ${caja.ancho.toFixed(2)} × ${caja.alto.toFixed(2)} mm ` +
        `(incluye marco y cajetín) · tramos ${JSON.stringify(
          [...new Set(tramos.map((largo) => Number(largo.toFixed(2))))].sort((a, b) => a - b),
        )}`,
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(caja.puntos, "el PDF de PLOT no trae geometría").toBeGreaterThan(0);
    // El muro de 10.000 mm y el de 8.000, a 1:50, en el papel.
    expect(hayTramo(tramos, NAVE_W / 50), `no hay ningún tramo de ${NAVE_W / 50} mm`).toBe(true);
    expect(hayTramo(tramos, NAVE_H / 50), `no hay ningún tramo de ${NAVE_H / 50} mm`).toBe(true);
    return bytes;
  });
  expect(pdf.byteLength).toBeGreaterThan(1_000);

  await test.step("HALLAZGO: «PLOT Extensión» no puede trazar en ningún dibujo", async () => {
    // En AutoCAD, «trazar por extensión» es la forma normal de sacar el
    // dibujo. Aquí el motor la ofrece —es una de las seis opciones del prompt—
    // y siempre la rechaza: `buildCadPlotJob` construye las fuentes de área con
    // `cadPlotAreaSources(input.pageSetup, null)` (plot-job.ts:271 y :359), con
    // la envolvente del dibujo FIJADA A `null`. La función que la calcularía,
    // `cadPlotExtents` (plot-host.ts:397), está exportada y NO LA LLAMA NADIE.
    // Como `limits` reutiliza `extents`, «PLOT LÍmites» cae por lo mismo.
    await entrada.click();
    await entrada.fill("PLOT");
    await entrada.press("Enter");
    await page.getByTestId("cad-command-keyword-EXtensión").click();
    await page.getByTestId("cad-command-keyword-Trazar").click();
    await entrada.fill("por-extension");
    await entrada.press("Enter");
    await expect(page.getByTestId("cad-command-line-log")).toContainText(
      "No se puede trazar: El área de trazado «extents» no está definida en este dibujo.",
    );
  });
});
