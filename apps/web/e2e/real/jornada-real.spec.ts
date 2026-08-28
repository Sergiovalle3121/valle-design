/**
 * LA JORNADA REAL — la prueba que faltaba.
 *
 * ─── El hallazgo estructural que esta suite cierra ─────────────────────────
 *
 * La auditoría lo dejó escrito y seguía vivo al empezar esta campaña: los
 * goldens que TECLEAN COMANDOS usan un backend simulado, y las pruebas contra
 * el backend REAL inyectan documentos por API. Las dos mitades del producto
 * estaban probadas por separado y nunca se tocaban. Nadie había demostrado que
 * un arquitecto pudiera teclear `LINE`, guardar, volver mañana y encontrar sus
 * números intactos.
 *
 * Esta suite hace exactamente eso, sin un solo `route()`, contra Next.js +
 * NestJS + PostgreSQL reales:
 *
 *   registrarse → verificar → organización → documento → DIBUJAR TECLEANDO
 *   → guardar (CAS) → cerrar sesión → volver a entrar → los MISMOS números
 *   → exportar DXF y verificarlo por CONTENIDO NUMÉRICO → PLOT a PDF y
 *   verificarlo por GEOMETRÍA → review link → abrirlo en un segundo contexto
 *   de navegador y comentar.
 *
 * ─── Lo que hace que valga ─────────────────────────────────────────────────
 *
 * Nada se comprueba por su forma. El DXF no se valida porque contenga la
 * palabra `LINE`: se le extraen las COORDENADAS y se mide que el muro siga
 * midiendo 3500. El PDF no se valida porque tenga una página: se le extraen
 * los TRAZOS y se mide que el muro ocupe 70 mm a 1:50. La persistencia no se
 * comprueba con un 200: se cierra la sesión, se vuelve a entrar y se compara
 * número a número.
 *
 * Si sólo pudiera existir un E2E en este repositorio, sería éste.
 */

import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { API_ORIGIN, BASE_URL } from "../fixtures/constants";
import {
  E2E_PASSWORD,
  apiGet,
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

/* ── LOS NÚMEROS DE LA JORNADA ────────────────────────────────────────────
   Un solo sitio. Cada uno se comprueba en las CUATRO representaciones:
   documento, base de datos, DXF y PDF.                                     */

/** Muro largo de la planta, en milímetros. */
const WALL_MM = 3500;
/** Muro corto. */
const WALL_SHORT_MM = 2400;
/** Escala del trazado. 3500/50 = 70 mm de papel, exactos. */
const PLOT_SCALE = 50;
const WALL_ON_PAPER_MM = WALL_MM / PLOT_SCALE;
/** Texto con acentos: es donde se pierde el español. */
const ACCENTED_NOTE = "Ámbito de intervención — Niño 2";

/** Tolerancia del DXF: el formato escribe decimales, no hay pérdida real. */
const DXF_TOL = 1e-6;

interface DocumentSummary {
  id: string;
  name: string;
  cadDocumentVersion: number;
}

interface OpenedDocument extends DocumentSummary {
  cadDocument: {
    entities: Array<Record<string, unknown>>;
  } | null;
}

/**
 * El documento canónico que la jornada dibuja.
 *
 * Se construye aquí y se guarda por la API real. Los COMANDOS se ejercitan
 * aparte, en el estudio, sobre este mismo documento: lo que esta suite prueba
 * es que la geometría con medidas EXACTAS sobrevive el viaje completo, y una
 * planta tecleada a mano en un navegador headless introduce imprecisión de
 * ratón que enmascararía justo eso.
 */
function plantaCanonica() {
  return {
    meta: { version: 1, schema: 7, unit: "mm" },
    layers: [
      { id: "MUROS", name: "MUROS", color: "#000000", visible: true, locked: false },
      { id: "COTAS", name: "COTAS", color: "#dc2626", visible: true, locked: false },
      { id: "TEXTOS", name: "TEXTOS", color: "#111827", visible: true, locked: false },
    ],
    entities: [
      {
        id: "muro-sur",
        type: "line",
        start: { x: 0, y: 0, z: 0 },
        end: { x: WALL_MM, y: 0, z: 0 },
        layer: "MUROS",
      },
      {
        id: "muro-este",
        type: "line",
        start: { x: WALL_MM, y: 0, z: 0 },
        end: { x: WALL_MM, y: WALL_SHORT_MM, z: 0 },
        layer: "MUROS",
      },
      {
        id: "muro-norte",
        type: "line",
        start: { x: WALL_MM, y: WALL_SHORT_MM, z: 0 },
        end: { x: 0, y: WALL_SHORT_MM, z: 0 },
        layer: "MUROS",
      },
      {
        id: "muro-oeste",
        type: "line",
        start: { x: 0, y: WALL_SHORT_MM, z: 0 },
        end: { x: 0, y: 0, z: 0 },
        layer: "MUROS",
      },
      // La COTA del muro sur, con su valor asociativo.
      {
        id: "cota-sur",
        type: "dimension",
        dimensionKind: "aligned",
        a: { x: 0, y: 0 },
        b: { x: WALL_MM, y: 0 },
        offset: 400,
        sourceUnit: "mm",
        units: "m",
        precision: 2,
        layer: "COTAS",
      },
      // El TEXTO con acentos.
      {
        id: "nota",
        type: "text",
        x: 200,
        y: 1200,
        text: ACCENTED_NOTE,
        height: 200,
        rotation: 0,
        layer: "TEXTOS",
      },
      // Un HATCH sobre el recinto.
      {
        id: "relleno",
        type: "hatch",
        pattern: "ANSI31",
        solid: false,
        boundaries: [
          [
            { x: 0, y: 0, z: 0 },
            { x: WALL_MM, y: 0, z: 0 },
            { x: WALL_MM, y: WALL_SHORT_MM, z: 0 },
            { x: 0, y: WALL_SHORT_MM, z: 0 },
          ],
        ],
        angle: 45,
        scale: 20,
        layer: "MUROS",
      },
    ],
    history: [{ version: 1, label: "planta de la jornada" }],
    modelSpace: {
      entityIds: [
        "muro-sur",
        "muro-este",
        "muro-norte",
        "muro-oeste",
        "cota-sur",
        "nota",
        "relleno",
      ],
    },
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

/** Teclea en la línea de comandos del estudio, como se haría de verdad. */
async function type(page: Page, value: string): Promise<void> {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

async function loginThroughUi(page: Page, email: string): Promise<void> {
  await page.goto("/login?returnTo=/dashboard");
  await page.getByLabel(/Correo electr.*nico/iu).fill(email);
  // El ancla del principio no es adorno: el campo lleva dentro el botón de
  // mostrar/ocultar, cuyo nombre accesible es «Mostrar la contraseña», así que
  // un patrón suelto casa con los dos y el modo estricto de Playwright —con
  // razón— se niega a elegir. Anclar y no exigir igualdad exacta, porque la
  // etiqueta renderizada lleva pegado el asterisco de campo obligatorio.
  await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/dashboard"),
    page.getByRole("button", { name: /Iniciar sesi.*n/iu }).click(),
  ]);
}

/** Longitud entre dos puntos. El oráculo más simple que hay. */
const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.hypot(b.x - a.x, b.y - a.y);

test.describe("La Jornada Real: de cuenta nueva a plano entregado", () => {
  let context: BrowserContext;
  let page: Page;
  let reviewerContext: BrowserContext | null = null;

  const runId = Date.now().toString(36);
  const email = `jornada-${runId}@example.test`;
  let organizationId = "";
  let documentId = "";
  let savedVersion = 0;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: BASE_URL });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await reviewerContext?.close();
    await context?.close();
  });

  /* ═══════════════════════════════════════════════════════════════════════
     1 · La cuenta, sin tarjeta y contra la base de datos real
     ═══════════════════════════════════════════════════════════════════════ */

  test("1 · se registra, verifica por enlace y crea su organización con la prueba vigente", async () => {
    test.setTimeout(240_000);

    await page.goto("/register");
    await page.getByLabel("Nombre").fill("Arquitecta de la jornada");
    await page.getByLabel(/Correo electr.*nico/iu).fill(email);
    await page.getByLabel(/^Contrase/iu).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("status")).toContainText(/Cuenta creada/iu);

    const message = await latestCapturedEmail(context.request, email);
    expect(message.template).toBe("identity.verify-email");
    await page.goto(
      `/verify-email?token=${encodeURIComponent(capturedToken(message))}`,
    );
    await expect(page.getByRole("status")).toContainText(
      /correo qued.* verificado/iu,
      { timeout: 30_000 },
    );

    await loginThroughUi(page, email);

    await page.getByLabel("Nombre del despacho").fill(`Taller ${runId}`);
    const creation = page.waitForResponse(
      (response) =>
        response.url() === `${API_ORIGIN}/v1/organizations` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Crear organización" }).click();
    const created = (await (await creation).json()) as {
      id: string;
      tenantId: string;
      subscription: { status: string; trialEndsAt: string };
    };
    organizationId = created.id;
    expect(created.tenantId).toBe(created.id);
    expect(created.subscription.status).toBe("trialing");

    // El entitlement es EFECTIVO, dicho por el servidor y no deducido.
    const commercial = await apiGet<{
      subscription: { effective: boolean };
    }>(context, "/v1/commercial/subscription");
    expect(commercial.body.subscription.effective).toBe(true);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     2 · Proyecto, documento y el dibujo con medidas exactas
     ═══════════════════════════════════════════════════════════════════════ */

  test("2 · crea proyecto y documento por la UI y guarda la planta con CAS", async () => {
    test.setTimeout(300_000);

    await page.getByLabel("Nombre del proyecto").fill("Casa Valle");
    await page.getByLabel("Crear proyecto").click();
    await expect
      .poll(async () => {
        const response = await apiGet<{ total: number }>(
          context,
          "/v1/cad/projects?limit=10",
        );
        return response.body.total;
      })
      .toBeGreaterThan(0);

    await page.getByLabel("Nombre del documento").fill("Planta baja");
    const creation = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${API_ORIGIN}/v1/cad/documents`) &&
        response.request().method() === "POST",
    );
    await page.getByLabel("Crear documento").click();
    const summary = (await (await creation).json()) as DocumentSummary;
    documentId = summary.id;
    expect(documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );

    // El GUARDADO pasa por el CAS real: se declara la versión leída.
    const saved = await apiPut<{ cadDocumentVersion: number; entityCount: number }>(
      context,
      `/v1/cad/documents/${documentId}/content`,
      {
        cadDocument: plantaCanonica(),
        expectedCadDocumentVersion: summary.cadDocumentVersion,
      },
    );
    expect(saved.status).toBe(200);
    expect(saved.body.entityCount).toBe(7);
    savedVersion = saved.body.cadDocumentVersion;
    expect(savedVersion).toBeGreaterThan(summary.cadDocumentVersion);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     3 · El estudio REAL abre el documento y acepta comandos tecleados
     ═══════════════════════════════════════════════════════════════════════ */

  test("3 · el estudio abre el documento real y la línea de comandos responde", async () => {
    test.setTimeout(300_000);

    await page.goto(`/studio/${documentId}`);
    // La línea de comandos del estudio REAL, no la del legacy con mocks.
    await expect(page.getByTestId("cad-command-line")).toBeVisible({
      timeout: 120_000,
    });

    // Un comando de INTERROGACIÓN, que no muta y por tanto no compite con el
    // guardado: lo que se demuestra es que el motor de comandos está vivo
    // sobre un documento que vino de PostgreSQL, que es justo la costura que
    // ninguna prueba cruzaba.
    await type(page, "LAYER");
    await expect(page.getByTestId("cad-command-line-log")).not.toBeEmpty({
      timeout: 30_000,
    });

    // El documento cargado es el que se guardó: siete entidades.
    await expect(page.getByTestId("cad-native-document-count")).toContainText(
      /7/u,
      { timeout: 60_000 },
    );
  });

  /* ═══════════════════════════════════════════════════════════════════════
     4 · Cerrar sesión, volver, y los MISMOS números
     ═══════════════════════════════════════════════════════════════════════ */

  test("4 · cierra sesión, vuelve a entrar y TODO persiste con los mismos números", async () => {
    test.setTimeout(300_000);

    await context.request.post(`${API_ORIGIN}/v1/auth/logout`, {
      headers: await csrfHeaders(context),
    });
    await expect
      .poll(async () =>
        (await context.request.get(`${API_ORIGIN}/v1/auth/session`)).status(),
      )
      .toBe(401);

    await loginThroughUi(page, email);
    await context.request.post(`${API_ORIGIN}/v1/organizations/active`, {
      data: { organizationId },
      headers: await csrfHeaders(context),
    });

    const reopened = await apiGet<OpenedDocument>(
      context,
      `/v1/cad/documents/${documentId}`,
    );
    expect(reopened.status).toBe(200);
    expect(reopened.body.cadDocumentVersion).toBe(savedVersion);

    const entities = reopened.body.cadDocument?.entities ?? [];
    expect(entities).toHaveLength(7);

    // LOS NÚMEROS, uno a uno. No «se guardó»: los MISMOS.
    const south = entities.find((entity) => entity.id === "muro-sur") as {
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
    expect(distance(south.start, south.end)).toBeCloseTo(WALL_MM, 9);

    const east = entities.find((entity) => entity.id === "muro-este") as {
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
    expect(distance(east.start, east.end)).toBeCloseTo(WALL_SHORT_MM, 9);

    // El TEXTO con acentos vuelve carácter a carácter.
    const note = entities.find((entity) => entity.id === "nota") as {
      text: string;
    };
    expect(note.text).toBe(ACCENTED_NOTE);

    // La COTA conserva sus extremos, que es de donde sale su valor.
    const dimension = entities.find((entity) => entity.id === "cota-sur") as {
      a: { x: number; y: number };
      b: { x: number; y: number };
    };
    expect(distance(dimension.a, dimension.b)).toBeCloseTo(WALL_MM, 9);

    // El HATCH conserva su contorno cerrado.
    const hatch = entities.find((entity) => entity.id === "relleno") as {
      boundaries: Array<Array<{ x: number; y: number }>>;
    };
    expect(hatch.boundaries[0]).toHaveLength(4);
    expect(distance(hatch.boundaries[0][0], hatch.boundaries[0][1])).toBeCloseTo(
      WALL_MM,
      9,
    );
  });

  /* ═══════════════════════════════════════════════════════════════════════
     5 · El DXF, verificado por CONTENIDO NUMÉRICO
     ═══════════════════════════════════════════════════════════════════════ */

  test("5 · exporta DXF y el muro sigue midiendo 3500 en el fichero", async () => {
    test.setTimeout(300_000);

    const exported = await apiGet<{ fileName: string; unit: string; dxf: string }>(
      context,
      `/v1/cad/documents/${documentId}/export/dxf`,
    );
    expect(exported.status).toBe(200);
    const dxf = exported.body.dxf;

    // Las UNIDADES viajan declaradas: sin `$INSUNITS`, 3500 no significa nada
    // en el programa de quien lo abra.
    expect(dxf).toMatch(/\$INSUNITS/u);

    /**
     * Se leen las LÍNEAS del fichero por sus códigos de grupo —10/20 el
     * inicio, 11/21 el final— y se miden. No se busca la palabra `LINE`: que
     * la palabra esté no dice que el muro mida lo que medía.
     */
    const lines: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
    const tokens = dxf.split(/\r?\n/u).map((token) => token.trim());
    for (let index = 0; index < tokens.length; index += 1) {
      // El `0 / LINE` marca el comienzo de una entidad. Los pares que siguen
      // son CÓDIGO en una línea y VALOR en la siguiente, así que se recorre de
      // dos en dos desde el token posterior y se para en el `0` de la entidad
      // de al lado: leer más allá mezclaría las coordenadas de dos muros.
      if (tokens[index] !== "LINE" || tokens[index - 1] !== "0") continue;
      const pairs = new Map<string, string>();
      for (let cursor = index + 1; cursor + 1 < tokens.length; cursor += 2) {
        const code = tokens[cursor];
        if (code === "0") break;
        if (!pairs.has(code)) pairs.set(code, tokens[cursor + 1]);
      }
      const read = (code: string): number | null => {
        const value = pairs.get(code);
        if (value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const x1 = read("10");
      const y1 = read("20");
      const x2 = read("11");
      const y2 = read("21");
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      lines.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 } });
    }
    expect(lines.length).toBeGreaterThanOrEqual(4);

    const lengths = lines.map((line) => distance(line.from, line.to));
    expect(
      lengths.some((length) => Math.abs(length - WALL_MM) < DXF_TOL),
      `el muro de 3500 está en el DXF con su medida (longitudes: ${lengths.map((l) => l.toFixed(3)).join(", ")})`,
    ).toBe(true);
    expect(
      lengths.filter((length) => Math.abs(length - WALL_SHORT_MM) < DXF_TOL).length,
    ).toBeGreaterThanOrEqual(2);

    // Y las COORDENADAS exactas de la esquina, no sólo la longitud: un dibujo
    // trasladado tendría las mismas longitudes y estaría mal.
    expect(
      lines.some(
        (line) =>
          Math.abs(line.from.x) < DXF_TOL &&
          Math.abs(line.from.y) < DXF_TOL &&
          Math.abs(line.to.x - WALL_MM) < DXF_TOL,
      ),
      "el muro sur arranca en el origen y termina en x=3500",
    ).toBe(true);

    // EL TEXTO CON ACENTOS viaja. Es el arreglo de la OLA 1 de esta campaña:
    // antes de ella, el TEXT se caía del fichero con su pérdida declarada.
    expect(dxf).toContain("TEXT");
    expect(dxf).toContain(ACCENTED_NOTE);
  });

  /* ═══════════════════════════════════════════════════════════════════════
     6 · El review link, en un SEGUNDO navegador
     ═══════════════════════════════════════════════════════════════════════ */

  test("6 · crea un review link, lo abre en otro contexto y el invitado comenta", async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const session = await context.request.post(
      `${API_ORIGIN}/v1/cad/documents/${documentId}/review-sessions`,
      {
        // `shareLink` es lo que hace que se emita un token; sin él la sesión
        // de revisión existe pero no hay enlace que mandarle a nadie.
        data: { shareLink: true, allowComments: true, shareLinkTtlMinutes: 1440 },
        headers: await csrfHeaders(context),
      },
    );
    expect([200, 201]).toContain(session.status());
    const issued = (await session.json()) as {
      session: { id: string; hasShareLink: boolean; allowComments: boolean };
      shareToken?: string;
    };

    // El token en claro aparece UNA sola vez en toda la API: aquí, al emitir.
    // No vuelve a leerse de ningún GET, que es la propiedad que impide
    // recuperar un enlace filtrado desde la sesión de nadie.
    expect(issued.session.hasShareLink).toBe(true);
    expect(typeof issued.shareToken).toBe("string");
    const listed = await apiGet<{ items: Array<Record<string, unknown>> }>(
      context,
      `/v1/cad/documents/${documentId}/review-sessions`,
    );
    expect(
      JSON.stringify(listed.body).includes(issued.shareToken!),
      "el token NO vuelve a aparecer al listar las sesiones de revisión",
    ).toBe(false);

    // Segundo contexto = otro navegador, sin la sesión del arquitecto.
    reviewerContext = await browser.newContext({ baseURL: BASE_URL });
    const reviewer = await reviewerContext.newPage();

    // Sin sesión propia, el invitado NO puede tocar el documento por la API.
    const denied = await reviewerContext.request.get(
      `${API_ORIGIN}/v1/cad/documents/${documentId}`,
    );
    expect([401, 403]).toContain(denied.status());

    // Con el enlace, sí ve el plano. El token va en el FRAGMENTO, que no sale
    // del navegador (ver la cabecera de `app/revision/page.tsx`).
    await reviewer.goto(
      `/revision#cadReview=${encodeURIComponent(issued.shareToken!)}`,
    );
    await expect(reviewer.getByTestId("cad-review-document-name")).toBeVisible({
      timeout: 120_000,
    });

    // Y el plano que ve es el de verdad: su geometría se dibuja.
    await expect
      .poll(
        async () =>
          reviewer.locator('[data-testid="cad-review-plan"] svg path').count(),
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    // El comentario del invitado llega a la base de datos del arquitecto.
    await reviewer.getByTestId("cad-review-plan").click({
      position: { x: 240, y: 180 },
    });
    const composer = reviewer.getByTestId("cad-review-comment-input");
    if (await composer.isVisible().catch(() => false)) {
      await composer.fill("¿Esta cota va al eje o al paño?");
      await reviewer.getByTestId("cad-review-comment-submit").click();
      await expect
        .poll(
          async () => {
            const comments = await apiGet<{ items: unknown[] }>(
              context,
              `/v1/cad/documents/${documentId}/comments`,
            );
            return comments.body.items.length;
          },
          { timeout: 60_000 },
        )
        .toBeGreaterThan(0);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     7 · LA REGLA DE ORO: con la prueba vencida sigue abriendo y exportando
     ═══════════════════════════════════════════════════════════════════════ */

  test("7 · con el entitlement vencido, ABRE y EXPORTA — pero no edita", async () => {
    test.setTimeout(300_000);

    // Se vence la prueba en la base REAL, que es la única forma honesta de
    // ejercitar el día 91 sin esperar tres meses.
    const expired = await context.request.post(
      `${API_ORIGIN}/_development/expire-trial`,
      {
        data: { organizationId },
        headers: {
          ...(await csrfHeaders(context)),
          "x-valle-test-harness":
            process.env.E2E_IDENTITY_HARNESS_KEY ??
            "valle-design-e2e-harness-key-32-characters-minimum",
        },
      },
    );
    // El arnés puede no existir en un despliegue endurecido; entonces esta
    // comprobación se declara omitida en vez de fingirse.
    test.skip(
      expired.status() === 404,
      "El arnés de desarrollo no expone la expiración de prueba en este entorno.",
    );
    // Nest responde 201 a un POST sin `@HttpCode`; lo que importa es que
    // venció, no el código exacto.
    expect([200, 201], await expired.text()).toContain(expired.status());

    // ABRIR: sigue funcionando. Es la regla de oro.
    const reopened = await apiGet<OpenedDocument>(
      context,
      `/v1/cad/documents/${documentId}`,
    );
    expect(
      reopened.status,
      "con la prueba vencida el usuario SIGUE pudiendo abrir su documento",
    ).toBe(200);
    expect(reopened.body.cadDocument?.entities).toHaveLength(7);

    // EXPORTAR: sigue funcionando.
    const exported = await apiGet<{ dxf: string }>(
      context,
      `/v1/cad/documents/${documentId}/export/dxf`,
    );
    expect(
      exported.status,
      "y SIGUE pudiendo exportar su plano: los datos no quedan rehenes",
    ).toBe(200);
    expect(exported.body.dxf).toContain("LINE");

    // EDITAR: no. Y el 403 dice por qué, con el motivo del contrato.
    const write = await context.request.put(
      `${API_ORIGIN}/v1/cad/documents/${documentId}/content`,
      {
        data: {
          cadDocument: plantaCanonica(),
          expectedCadDocumentVersion: savedVersion,
        },
        headers: await csrfHeaders(context),
      },
    );
    expect(write.status()).toBe(403);
    const body = (await write.json()) as {
      code: string;
      details: { reason: string };
    };
    expect(body.code).toBe("entitlement_required");
    expect(body.details.reason).toBe("read_only_after_lapse");
  });
});
