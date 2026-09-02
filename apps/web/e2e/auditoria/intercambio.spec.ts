/**
 * AUDITORÍA — INTERCAMBIO CON OTRO DESPACHO.
 *
 * El recorrido es el de siempre entre dos estudios: yo dibujo, exporto a DXF,
 * mando el fichero, y el otro despacho lo abre. La pregunta que decide si el
 * producto sirve para eso no es «¿exporta?», sino:
 *
 *   1. ¿Qué SOBREVIVE al viaje de ida y vuelta —geometría, capas, textos y
 *      cotas—, medido sobre el documento que el receptor acaba guardando?
 *   2. Lo que NO sobrevive, ¿estaba DECLARADO antes de mandar el fichero?
 *      Un intercambio que pierde cosas en silencio rompe la confianza.
 *
 * Las dos puertas son las del producto, sin atajos de código:
 *   ida    — barra del estudio, «Exportar a DXF» → cuadro → Descargar DXF.
 *   vuelta — tablero, «Importar como documento» con ESE MISMO fichero, que es
 *            exactamente lo que hace quien lo recibe.
 *
 * Lo que se afirma es lo que el SERVIDOR guardó del documento importado, no lo
 * que se ve en pantalla: una captura no distingue una cota de dos líneas y un
 * texto sueltos.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { API_ORIGIN } from "../fixtures/constants";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import {
  firstPartyRequestFailure,
  loginAsStandaloneOwner,
} from "../fixtures/standalone-identity";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../src/lib/cad/cad-document";

/* ───────────────────────── El dibujo que mando ───────────────────────── */

/**
 * Un plano mínimo pero COMPLETO en las cuatro familias que el encargo nombra:
 * geometría (línea, contorno cerrado, círculo, arco), capas de verdad (no
 * todo en «0»), texto y una cota lineal amarrada a la fachada sur.
 */
function planoQueMando(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 10, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "MUROS", name: "MUROS", color: "#60a5fa", visible: true, locked: false },
      { id: "COTAS", name: "COTAS", color: "#fbbf24", visible: true, locked: false },
      { id: "NOTAS", name: "NOTAS", color: "#22d3ee", visible: true, locked: false },
    ],
    entities: [
      {
        id: "fachada-sur",
        type: "line",
        start: { x: 1_000, y: 1_000, z: 0 },
        end: { x: 9_000, y: 1_000, z: 0 },
        layer: "MUROS",
      },
      {
        id: "sala",
        type: "polyline",
        vertices: [
          { x: 1_000, y: 1_000, z: 0 },
          { x: 9_000, y: 1_000, z: 0 },
          { x: 9_000, y: 6_000, z: 0 },
          { x: 1_000, y: 6_000, z: 0 },
        ],
        closed: true,
        layer: "MUROS",
      },
      {
        id: "columna",
        type: "circle",
        center: { x: 5_000, y: 3_500, z: 0 },
        radius: 300,
        layer: "MUROS",
      },
      {
        id: "barrido-puerta",
        type: "arc",
        center: { x: 2_000, y: 1_000, z: 0 },
        radius: 900,
        startAngle: 0,
        endAngle: 90,
        layer: "MUROS",
      },
      {
        id: "rotulo-sala",
        type: "text",
        x: 2_000, y: 4_500,
        text: "SALA DE JUNTAS",
        height: 250,
        layer: "NOTAS",
      },
      {
        id: "rotulo-mtext",
        type: "mtext",
        insertion: { x: 6_000, y: 4_500, z: 0 },
        text: "NIVEL +0.00",
        height: 250,
        layer: "NOTAS",
      },
      {
        id: "cota-fachada",
        type: "dimension",
        a: { x: 1_000, y: 1_000 },
        b: { x: 9_000, y: 1_000 },
        dimensionKind: "linear",
        axis: "x",
        offset: 600,
        layer: "COTAS",
      },
    ] as CadEntity[],
  });
}

/* ──────────────── El tablero del que recibe (puerta de vuelta) ──────────────── */

/**
 * Backend del TABLERO: proyectos + documentos, la superficie que necesita
 * «Importar como documento». Se registra DESPUÉS del backend del estudio, así
 * que gana en las rutas que comparten (Playwright da prioridad a la última).
 */
async function instalarTableroDelReceptor(context: BrowserContext) {
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
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const authFailure = firstPartyRequestFailure(request);
    if (authFailure) return json(authFailure.body, authFailure.status);
    if (url.pathname === "/v1/cad/projects" && method === "GET") return json({ items: projects });
    if (url.pathname === "/v1/cad/projects" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const project = { id: "10000000-0000-4000-8000-000000000901", name: body.name, status: "active" };
      projects.push(project);
      return json(project, 201);
    }
    if (url.pathname === "/v1/cad/documents" && method === "GET") return json({ items: documents });
    if (url.pathname === "/v1/cad/documents" && method === "POST") {
      const body = request.postDataJSON() as { name: string; projectId: string };
      const document = {
        id: `20000000-0000-4000-8000-${String(documents.length + 1).padStart(12, "0")}`,
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
    if (url.pathname === "/v1/cad/blocks" && method === "GET") return json({ items: [] });
    const match = url.pathname.match(/^\/v1\/cad\/documents\/([^/]+)(\/content)?$/);
    if (match && !match[2] && method === "GET") {
      const document = documents.find((item) => item.id === match[1]);
      return document ? json(document) : json({ message: "not found" }, 404);
    }
    if (match?.[2] && method === "PUT") {
      const document = documents.find((item) => item.id === match[1]);
      if (!document) return json({ message: "not found" }, 404);
      const body = request.postDataJSON() as {
        expectedCadDocumentVersion: number;
        cadDocument: CadDocument;
      };
      document.cadDocument = body.cadDocument;
      document.cadDocumentVersion += 1;
      return json({ cadDocumentVersion: document.cadDocumentVersion });
    }
    return json({ message: "not found" }, 404);
  });

  return documents;
}

/* ─────────────────────────────── Utilidades ─────────────────────────────── */

/** Pulsa «Descargar DXF» tantas veces como haga falta y devuelve el fichero. */
async function descargarDxf(page: Page): Promise<{ texto: string; perdidasDeclaradas: string[] }> {
  const manifiesto = page.getByTestId("cad-dxf-loss-manifest");
  const boton = page.getByTestId("cad-dxf-download");

  const primer = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
  await boton.click();
  let descarga = await primer;
  let perdidasDeclaradas: string[] = [];

  if (!descarga) {
    // Hubo comprobación previa: el producto enseña el informe ANTES de dar el
    // fichero. Se anota lo que declara y se vuelve a pulsar.
    await expect(manifiesto).toBeVisible();
    perdidasDeclaradas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
    if ((await manifiesto.getAttribute("data-blocking")) === "true")
      await page.getByTestId("cad-dxf-loss-accept").check();
    const segundo = page.waitForEvent("download");
    await boton.click();
    descarga = await segundo;
  } else if (await manifiesto.count()) {
    perdidasDeclaradas = await page.getByTestId("cad-dxf-loss-row").allInnerTexts();
  }

  const ruta = await descarga.path();
  expect(ruta, "el producto no entregó ningún fichero DXF").not.toBeNull();
  return { texto: await readFile(ruta!, "utf8"), perdidasDeclaradas };
}


/**
 * Lee el DXF como lo leería el otro despacho al abrirlo: qué capas declara su
 * tabla LAYER y en qué capa va cada entidad. Sin librerías: pares de códigos.
 */
function leerDxf(texto: string) {
  const lineas = texto.split(/\r?\n/).map((linea) => linea.trim());
  const capasDeLaTabla: string[] = [];
  const entidades: Array<{ tipo: string; capa?: string; texto?: string }> = [];
  let actual: { tipo: string; capa?: string; texto?: string } | null = null;
  let dentroDeLaTablaDeCapas = false;
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const codigo = lineas[i];
    const valor = lineas[i + 1];
    if (codigo === "0") {
      if (valor === "TABLE") dentroDeLaTablaDeCapas = false;
      if (valor === "ENDTAB") dentroDeLaTablaDeCapas = false;
      actual = { tipo: valor };
      if (valor === "LAYER") dentroDeLaTablaDeCapas = true;
      else if (!["SECTION", "ENDSEC", "TABLE", "ENDTAB", "EOF", "SEQEND", "VERTEX", "APPID", "LTYPE", "STYLE"].includes(valor))
        entidades.push(actual);
      continue;
    }
    if (!actual) continue;
    if (codigo === "2" && actual.tipo === "LAYER" && dentroDeLaTablaDeCapas) capasDeLaTabla.push(valor);
    if (codigo === "8") actual.capa = valor;
    if (codigo === "1" && (actual.tipo === "TEXT" || actual.tipo === "MTEXT")) actual.texto = valor;
  }
  return { capasDeLaTabla, entidades };
}

const tipos = (entities: readonly CadEntity[]) => {
  const cuenta: Record<string, number> = {};
  for (const entity of entities) cuenta[entity.type] = (cuenta[entity.type] ?? 0) + 1;
  return cuenta;
};

/* ═════════════════════════════════ EL VIAJE ═════════════════════════════════ */

test("un plano con capas, texto y cota va y vuelve por DXF sin pérdidas mudas", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const erroresDeConsola: string[] = [];
  page.on("pageerror", (error) => erroresDeConsola.push(String(error)));

  const original = planoQueMando();

  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  await installCadStudioBackend<CadDocument>(context, original, {
    footprintW: 12_000, footprintH: 10_000, unit: "mm", gridSize: 100,
  });

  /* ── IDA: abro mi plano y lo exporto ───────────────────────────────────── */

  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  await page.getByTitle(/Exportar a DXF/).click();
  await expect(page.getByTestId("cad-dxf-download")).toBeVisible();

  // Lo que el cuadro PROMETE que va a salir, tal cual lo lee el arquitecto.
  const cuadro = page.locator('[aria-labelledby="cad-exportar-dxf-titulo"]');
  const resumenDelCuadro = await cuadro.innerText();

  const { texto: dxf, perdidasDeclaradas } = await descargarDxf(page);

  console.log("\n===== LO QUE EL CUADRO DE EXPORTAR DICE =====\n" + resumenDelCuadro);
  console.log("\n===== PÉRDIDAS DECLARADAS ANTES DE MANDAR (" + perdidasDeclaradas.length + ") =====");
  for (const fila of perdidasDeclaradas) console.log("  · " + fila.replace(/\s+/g, " "));
  const copia = "/tmp/claude-0/-home-user-valle-design/2f4c06e1-2089-56de-9db7-cb15aabde438/scratchpad";
  await mkdir(copia, { recursive: true }).catch(() => {});
  await writeFile(`${copia}/exportado.dxf`, dxf, "utf8");
  console.log("\n===== EL FICHERO =====");
  console.log("  bytes: " + dxf.length);
  const enElFichero = leerDxf(dxf);
  console.log("  tabla LAYER: " + JSON.stringify(enElFichero.capasDeLaTabla));
  for (const fila of enElFichero.entidades)
    console.log(`  ${fila.tipo} · capa=${fila.capa ?? "?"}${fila.texto ? " · «" + fila.texto + "»" : ""}`);

  await test.step("el fichero lleva las capas que el cuadro prometió", async () => {
    // El «Paquete de capas» del cuadro es una PROMESA: dice, capa por capa,
    // cuántas entidades van dentro. Aquí se contrasta contra el fichero.
    expect.soft(resumenDelCuadro, "el cuadro no prometió la capa NOTAS").toContain("NOTAS");
    expect
      .soft(
        enElFichero.capasDeLaTabla,
        "el cuadro prometió NOTAS «1/1 incl.» y la tabla LAYER del fichero no la lleva",
      )
      .toContain("NOTAS");

    const rotulos = enElFichero.entidades.filter(
      (fila) => fila.tipo === "TEXT" || fila.tipo === "MTEXT",
    );
    const sala = rotulos.find((fila) => fila.texto === "SALA DE JUNTAS");
    expect.soft(sala, "el rótulo TEXT no está en el fichero").toBeDefined();
    expect
      .soft(sala?.capa, "el TEXT sale en una capa inventada en vez de la suya")
      .toBe("NOTAS");
    const nivel = rotulos.find((fila) => fila.texto?.includes("NIVEL"));
    expect.soft(nivel, "el rótulo MTEXT no está en el fichero").toBeDefined();
    expect.soft(nivel?.capa, "el MTEXT sale en otra capa").toBe("NOTAS");
  });

  await test.step("el resumen del cuadro cuenta lo que de verdad sale", async () => {
    const cotasEnElFichero = enElFichero.entidades.filter(
      (fila) => fila.tipo === "DIMENSION",
    ).length;
    expect.soft(cotasEnElFichero, "la cota no llegó al fichero").toBe(1);
    expect
      .soft(
        /Cotas\s*\n\s*0/.test(resumenDelCuadro),
        `el cuadro anuncia «Cotas 0» y el fichero lleva ${cotasEnElFichero} DIMENSION`,
      )
      .toBe(false);
  });

  await test.step("lo que no viaja igual, se declara antes de mandar el fichero", async () => {
    const rotulo = enElFichero.entidades.find(
      (fila) => fila.texto === "SALA DE JUNTAS",
    );
    if (rotulo && rotulo.capa !== "NOTAS")
      expect
        .soft(
          perdidasDeclaradas.join(" | ") || "(el preflight declaró CERO pérdidas)",
          `el TEXT sale en la capa «${rotulo.capa}» en vez de en «NOTAS» y nadie lo declara`,
        )
        .toMatch(/capa/i);
  });

  /* ── VUELTA: el otro despacho lo abre desde su tablero ─────────────────── */

  const documentosDelReceptor = await instalarTableroDelReceptor(context);

  await page.goto("/dashboard");
  await page.getByLabel("Nombre del proyecto").fill("Intercambio con el otro despacho");
  await page.getByLabel("Crear proyecto").click();

  await page.getByLabel(/Importar como documento/).setInputFiles({
    name: "planta-baja.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(dxf, "utf8"),
  });

  await expect(page.getByText(/Importado: \d+ entidades/)).toBeVisible({ timeout: 60_000 });
  const recibo = await page.getByTestId("cad-dxf-import-report").innerText();
  console.log("\n===== LO QUE VE EL QUE RECIBE =====\n" + recibo);

  await expect.poll(() => documentosDelReceptor[0]?.cadDocumentVersion, { timeout: 30_000 }).toBeGreaterThan(0);
  const recibido = documentosDelReceptor[0].cadDocument!;

  console.log("\n===== LO QUE LLEGÓ (documento guardado por el receptor) =====");
  console.log("  entidades: " + JSON.stringify(tipos(recibido.entities)));
  console.log("  capas: " + JSON.stringify(recibido.layers.map((l) => l.name)));
  console.log("  manifiesto de pérdidas del receptor: " + JSON.stringify(recibido.lossManifest));

  /* ── ¿QUÉ SOBREVIVIÓ? ─────────────────────────────────────────────────── */

  const salida = tipos(recibido.entities);
  const entrada = tipos(original.entities);

  await test.step("geometría", async () => {
    expect.soft(salida.line ?? 0, "la línea de fachada no volvió").toBeGreaterThanOrEqual(1);
    expect.soft(salida.polyline ?? 0, "el contorno cerrado no volvió").toBeGreaterThanOrEqual(1);
    expect.soft(salida.circle ?? 0, "el círculo de la columna no volvió").toBe(entrada.circle);
    expect.soft(salida.arc ?? 0, "el arco del barrido de puerta no volvió").toBe(entrada.arc);
    const contorno = recibido.entities.find(
      (e): e is Extract<CadEntity, { type: "polyline" }> => e.type === "polyline" && e.closed,
    );
    expect.soft(contorno, "el contorno volvió ABIERTO: deja de ser un recinto").toBeDefined();
    if (contorno)
      expect
        .soft(contorno.vertices.map((v) => [v.x, v.y]))
        .toEqual([[1_000, 1_000], [9_000, 1_000], [9_000, 6_000], [1_000, 6_000]]);
    const circulo = recibido.entities.find(
      (e): e is Extract<CadEntity, { type: "circle" }> => e.type === "circle",
    );
    if (circulo) {
      expect.soft(circulo.radius, "el radio de la columna cambió").toBeCloseTo(300, 3);
      expect.soft([circulo.center.x, circulo.center.y]).toEqual([5_000, 3_500]);
    }
  });

  await test.step("capas", async () => {
    const nombres = recibido.layers.map((layer) => layer.name);
    for (const capa of ["MUROS", "COTAS", "NOTAS"])
      expect.soft(nombres, `la capa ${capa} no llegó al otro despacho`).toContain(capa);
    const enMuros = recibido.entities.filter((e) => e.layer === "MUROS");
    expect.soft(enMuros.length, "la geometría perdió su capa MUROS").toBeGreaterThanOrEqual(4);
  });

  await test.step("textos", async () => {
    const textos = recibido.entities.filter(
      (e): e is Extract<CadEntity, { type: "text" | "mtext" }> =>
        e.type === "text" || e.type === "mtext",
    );
    expect.soft(textos.length, "el rótulo de la sala no volvió").toBeGreaterThanOrEqual(1);
    expect.soft(textos.map((t) => t.text)).toContain("SALA DE JUNTAS");
    if (textos[0])
      expect.soft(textos[0].layer, "el rótulo volvió en otra capa").toBe("NOTAS");
  });

  await test.step("cotas", async () => {
    const cotas = recibido.entities.filter(
      (e): e is Extract<CadEntity, { type: "dimension" }> => e.type === "dimension",
    );
    expect.soft(cotas.length, "la cota de la fachada no volvió como COTA").toBe(1);
    if (cotas[0]) {
      expect.soft([
        [cotas[0].a.x, cotas[0].a.y],
        [cotas[0].b.x, cotas[0].b.y],
      ]).toEqual([[1_000, 1_000], [9_000, 1_000]]);
      expect.soft(cotas[0].layer, "la cota volvió en otra capa").toBe("COTAS");
    }
  });

  await test.step("nada se perdió en silencio", async () => {
    const declarado = [...perdidasDeclaradas, ...(recibido.lossManifest ?? []).map((l) => JSON.stringify(l))]
      .join(" ")
      .toUpperCase();
    const perdidoDeVerdad: string[] = [];
    for (const [tipo, cuantos] of Object.entries(entrada)) {
      const llegaron = salida[tipo] ?? 0;
      if (llegaron < cuantos && !declarado.includes(tipo.toUpperCase()))
        perdidoDeVerdad.push(`${tipo}: mandé ${cuantos}, llegaron ${llegaron}, y NADIE lo declaró`);
    }
    expect.soft(perdidoDeVerdad, perdidoDeVerdad.join(" | ")).toEqual([]);
  });

  expect(erroresDeConsola, "errores de consola durante el intercambio").toEqual([]);
});
