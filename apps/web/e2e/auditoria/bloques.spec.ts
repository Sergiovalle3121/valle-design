import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";
import { resolveCadInsert } from "../../src/lib/cad/professional-blocks";

/**
 * AUDITORÍA — EL DELINEANTE QUE REUTILIZA MOBILIARIO.
 *
 * Nadie dibuja la misma silla catorce veces. Se dibuja UNA, se guarda como
 * bloque y se coloca; y cuando el cliente cambia la silla, se cambia la
 * definición y cambian las catorce. Un CAD que no haga eso obliga a redibujar
 * el plano entero y queda descartado para un despacho antes de la comida.
 *
 * Recorrido, en el orden en que lo haría un delineante:
 *   1. Buscar la biblioteca y BUSCAR dentro de ella («silla», «comedor»)
 *   2. INSERTAR el mueble dos veces desde la biblioteca
 *   3. Comprobar que lo insertado es una REFERENCIA (INSERT), no geometría
 *      aplanada: si al insertar se copian las líneas, no hay bloques
 *   4. MOVER una copia con MOVE
 *   5. COPIAR una copia con COPY — y que la copia siga siendo del mismo bloque
 *   6. BEDIT: la puerta tecleable a editar la definición
 *   7. REDEFINIR la definición y comprobar que CAMBIAN TODAS LAS COPIAS
 *   8. Los OTROS dos sitios donde el estudio dice «bloque» o «símbolo»:
 *      el panel «Mis bloques» de la izquierda y la caja de buscar (Cmd-K)
 *
 * LO QUE ENCONTRÓ, resumido, para que no haya que leer 600 líneas:
 *   · Insertar, mover y copiar una referencia de bloque: exacto al milímetro.
 *   · Redefinir PROPAGA a todas las instancias —y eso es lo difícil— pero no
 *     pregunta el punto base, así que desplaza el mueble tantos metros como
 *     haya entre el origen y el sitio donde uno dibujó el recambio (paso 7b).
 *   · Teclear BLOCK con un nombre que ya existe manda «redefínalo» y no hay
 *     ningún comando con el que redefinir (paso 7a).
 *   · «Mis bloques» lista el bloque como «0 obj» y al pincharlo no hace nada
 *     ni dice por qué (paso 8a).
 *   · La caja de buscar ofrece un «Silla» que NO es el bloque: es un símbolo
 *     del catálogo antiguo y al colocarlo nace un `box`, no una referencia
 *     (paso 8b).
 *
 * CÓMO SE CORRE (el puerto no es opcional):
 *   cd apps/web
 *   E2E_PROD=1 E2E_API_ORIGIN=http://localhost:4000 \
 *     npx playwright test e2e/auditoria/bloques.spec.ts --project=chromium --reporter=line
 */

/* ─────────────────── la biblioteca que el producto publica ────────────────
 * Estas dos definiciones NO se las inventa la prueba: son las que siembra la
 * migración `20260817090000-ArchitecturalBlockLibrarySeed` en
 * `apps/api/src/migrations/seed/architectural-blocks/seed-furniture.ts`, con
 * sus medidas comerciales y su punto de inserción. Se copian aquí porque el
 * navegador de una prueba e2e no tiene base de datos: el fixture las publica
 * por `/v1/cad/blocks` igual que el servidor se las publica a cada inquilino.
 */

const SILLA = {
  id: "valle:arq:silla-comedor",
  name: "Silla",
  basePoint: { x: 0, y: 0, z: 0 },
  description:
    "Silla de 0.45 m de asiento y 0.50 m con respaldo. Se inserta por el centro del asiento.",
  keywords: ["silla", "comedor", "mobiliario", "asiento"],
  version: 1,
  attributes: {
    CLAVE: { defaultValue: "SL-01", prompt: "Clave en planta" },
    ANCHO: { defaultValue: "0.45", prompt: "Ancho (m)" },
    FONDO: { defaultValue: "0.50", prompt: "Fondo (m)" },
  },
  entities: [
    {
      // Asiento: 450 × 450 centrado en el origen.
      id: "valle:arq:silla-comedor:e0",
      type: "polyline",
      layer: "equipment",
      closed: true,
      vertices: [
        { x: -225, y: -225, z: 0 },
        { x: 225, y: -225, z: 0 },
        { x: 225, y: 225, z: 0 },
        { x: -225, y: 225, z: 0 },
      ],
    },
    {
      // Respaldo hacia +Y: la silla «mira» a −Y.
      id: "valle:arq:silla-comedor:e1",
      type: "polyline",
      layer: "equipment",
      closed: true,
      vertices: [
        { x: -225, y: 225, z: 0 },
        { x: 225, y: 225, z: 0 },
        { x: 225, y: 275, z: 0 },
        { x: -225, y: 275, z: 0 },
      ],
    },
  ],
};

const MESA = {
  id: "valle:arq:mesa-comedor-6",
  name: "Mesa de comedor 6 personas",
  basePoint: { x: 0, y: 0, z: 0 },
  description:
    "Mesa rectangular de 1.60 × 0.90 m para seis. Se inserta por su centro.",
  keywords: ["mesa", "comedor", "mobiliario", "seis personas"],
  version: 1,
  attributes: {
    CLAVE: { defaultValue: "MS-01", prompt: "Clave en planta" },
    ANCHO: { defaultValue: "1.60", prompt: "Largo (m)" },
    FONDO: { defaultValue: "0.90", prompt: "Ancho (m)" },
    LUGARES: { defaultValue: "6", prompt: "Comensales" },
  },
  entities: [
    {
      id: "valle:arq:mesa-comedor-6:e0",
      type: "polyline",
      layer: "equipment",
      closed: true,
      vertices: [
        { x: -800, y: -450, z: 0 },
        { x: 800, y: -450, z: 0 },
        { x: 800, y: 450, z: 0 },
        { x: -800, y: 450, z: 0 },
      ],
    },
  ],
};

/* ───────────────────── el plano que ya está sobre la mesa ───────────────── */

function documentoSemilla(): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      {
        id: "architecture",
        name: "architecture",
        color: "#64748b",
        visible: true,
        locked: false,
      },
      {
        id: "equipment",
        name: "equipment",
        color: "#a78bfa",
        visible: true,
        locked: false,
      },
    ],
    entities: [
      // Un comedor de 6 × 5 m: cuatro muros. El mobiliario va dentro.
      { id: "muro-sur", type: "line", start: { x: 1_000, y: 1_000, z: 0 }, end: { x: 7_000, y: 1_000, z: 0 }, layer: "architecture" },
      { id: "muro-este", type: "line", start: { x: 7_000, y: 1_000, z: 0 }, end: { x: 7_000, y: 6_000, z: 0 }, layer: "architecture" },
      { id: "muro-norte", type: "line", start: { x: 7_000, y: 6_000, z: 0 }, end: { x: 1_000, y: 6_000, z: 0 }, layer: "architecture" },
      { id: "muro-oeste", type: "line", start: { x: 1_000, y: 6_000, z: 0 }, end: { x: 1_000, y: 1_000, z: 0 }, layer: "architecture" },
      // LA SILLA NUEVA, dibujada al margen del plano, como se dibuja de verdad:
      // en un hueco libre de la lámina y no encima del comedor. Es un cuadrado
      // de 600 × 600 con la esquina en (9.000, 8.000), bien distinto del
      // asiento de 450 × 450 del catálogo para que no haya duda de cuál es cuál.
      {
        id: "silla-v2",
        type: "polyline",
        layer: "equipment",
        closed: true,
        vertices: [
          { x: 9_000, y: 8_000, z: 0 },
          { x: 9_600, y: 8_000, z: 0 },
          { x: 9_600, y: 8_600, z: 0 },
          { x: 9_000, y: 8_600, z: 0 },
        ],
      },
      // LA MISMA SILLA NUEVA, pero dibujada ALREDEDOR DEL ORIGEN (0,0), que es
      // donde está el punto de inserción del bloque del catálogo. 700 × 700
      // para distinguirla de las otras dos a simple vista. Sirve de testigo: si
      // redefinir con ésta sale bien y con la de al lado sale mal, lo que falla
      // no es la propagación —es que nadie pregunta el punto base.
      {
        id: "silla-v3",
        type: "polyline",
        layer: "equipment",
        closed: true,
        vertices: [
          { x: -350, y: -350, z: 0 },
          { x: 350, y: -350, z: 0 },
          { x: 350, y: 350, z: 0 },
          { x: -350, y: 350, z: 0 },
        ],
      },
    ] as CadEntity[],
    history: [],
    modelSpace: {
      entityIds: [
        "muro-sur",
        "muro-este",
        "muro-norte",
        "muro-oeste",
        "silla-v2",
        "silla-v3",
      ],
    },
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

async function instalarBackend(context: BrowserContext) {
  const { backend, snapshot } = await installCadV1Backend(context, {
    document: documentoSemilla() as unknown as Record<string, unknown>,
    footprint: {
      footprintW: 12_000,
      footprintH: 10_000,
      unit: "mm",
      gridSize: 100,
    },
  });
  // La biblioteca del inquilino llega SEMBRADA por el servidor, como en
  // producción: el delineante la encuentra llena, no la crea.
  backend.seedLibraryBlock({
    name: SILLA.name,
    definition: SILLA as unknown as Record<string, unknown>,
  });
  backend.seedLibraryBlock({
    name: MESA.name,
    definition: MESA as unknown as Record<string, unknown>,
  });
  return {
    snapshot: () => snapshot().document as unknown as CadDocument,
    version: () => snapshot().version,
  };
}

/* ────────────────────────── gestos de siempre ───────────────────────────── */

async function teclear(page: Page, valor: string) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill(valor);
  await input.press("Enter");
}

/** Intro en vacío: así se cierra un comando que sigue pidiendo más. */
async function terminar(page: Page) {
  const input = page.getByTestId("cad-command-input");
  await input.click();
  await input.fill("");
  await input.press("Enter");
}

const propiedades = (page: Page) => page.getByTestId("cad-native-properties");

/* El panel de bloques y la LISTA DE ENTIDADES comparten el mismo hueco: con el
 * panel abierto no hay lista, y con la lista delante no hay panel. Así que hay
 * que ir abriendo y cerrando, que es exactamente lo que hace quien trabaja. */
const botonBloques = (page: Page) => page.getByTitle(/^BLOCK\/INSERT:/);

async function abrirBloques(page: Page) {
  if (!(await page.getByTestId("cad-library-dock").count()))
    await botonBloques(page).click();
  await expect(page.getByTestId("cad-block-palette")).toBeVisible();
}

async function cerrarBloques(page: Page) {
  if (await page.getByTestId("cad-library-dock").count())
    await botonBloques(page).click();
  await expect(page.getByTestId("cad-block-palette")).toHaveCount(0);
}

async function soltarSeleccion(page: Page) {
  const soltar = propiedades(page).getByRole("button", { name: "Deseleccionar" });
  if (await soltar.count()) await soltar.click();
}

/** Designa un objeto pinchándolo en la lista del editor, como haría cualquiera. */
async function designar(page: Page, id: string) {
  await soltarSeleccion(page);
  await page.getByTestId(`cad-native-entity-${id}`).click();
  await expect(propiedades(page)).toBeVisible();
}

async function guardar(
  page: Page,
  backend: { snapshot(): CadDocument },
): Promise<CadDocument> {
  const boton = page.getByTestId("cad-save");
  if ((await boton.count()) && (await boton.isEnabled())) {
    await boton.click();
    await expect(page.getByTestId("cad-save-status")).toHaveText("Guardado", {
      timeout: 30_000,
    });
  }
  return backend.snapshot();
}

type CadInsert = Extract<CadEntity, { type: "insert" }>;

const inserciones = (documento: CadDocument): CadInsert[] =>
  documento.entities.filter(
    (entidad): entidad is CadInsert => entidad.type === "insert",
  );

/** Caja envolvente de la geometría a la que RESUELVE una inserción. */
function envolvente(documento: CadDocument, insertId: string) {
  const resuelto = resolveCadInsert(documento, insertId);
  expect(
    resuelto.diagnostics.filter((d) => d.severity === "error"),
    "la inserción no resuelve",
  ).toEqual([]);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const entidad of resuelto.entities) {
    if (entidad.type === "polyline")
      for (const v of entidad.vertices) {
        xs.push(v.x);
        ys.push(v.y);
      }
    else if (entidad.type === "line") {
      xs.push(entidad.start.x, entidad.end.x);
      ys.push(entidad.start.y, entidad.end.y);
    }
  }
  expect(xs.length, "la inserción no resolvió a ninguna geometría").toBeGreaterThan(0);
  return {
    minX: Math.round(Math.min(...xs)),
    minY: Math.round(Math.min(...ys)),
    maxX: Math.round(Math.max(...xs)),
    maxY: Math.round(Math.max(...ys)),
  };
}

/* ──────────────────────────── el recorrido ──────────────────────────────── */

test("la biblioteca de mobiliario: buscar, insertar, mover, copiar y redefinir", async ({
  context,
  page,
}) => {
  test.setTimeout(240_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await instalarBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-canvas")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("cad-command-line")).toBeVisible();
  if (await page.getByTestId("cad-guided-tour-skip").count())
    await page.getByTestId("cad-guided-tour-skip").click();

  const palette = page.getByTestId("cad-block-palette");

  /* ── 1. ¿DÓNDE ESTÁ LA BIBLIOTECA? ─────────────────────────────────────── */
  await test.step("1. encontrar la biblioteca y buscar dentro", async () => {
    await abrirBloques(page);

    // Llega llena: el servidor publicó el catálogo, nadie lo dibujó aquí.
    await expect(page.getByTestId(`cad-block-row-${SILLA.name}`)).toBeVisible();
    await expect(page.getByTestId(`cad-block-row-${MESA.name}`)).toBeVisible();

    const buscar = palette.getByLabel("Buscar bloques");
    await buscar.fill("silla");
    await expect(page.getByTestId(`cad-block-row-${SILLA.name}`)).toBeVisible();
    await expect(page.getByTestId(`cad-block-row-${MESA.name}`)).toBeHidden();

    // «comedor» es palabra clave de las dos piezas: la búsqueda mira las
    // keywords del catálogo, no sólo el nombre.
    await buscar.fill("comedor");
    await expect(page.getByTestId(`cad-block-row-${SILLA.name}`)).toBeVisible();
    await expect(page.getByTestId(`cad-block-row-${MESA.name}`)).toBeVisible();

    await buscar.fill("");
  });

  /* ── 2. INSERTAR DOS SILLAS ────────────────────────────────────────────── */
  await test.step("2. insertar la silla dos veces desde la biblioteca", async () => {
    for (const [x, y] of [
      [3_000, 2_000],
      [4_000, 2_000],
    ]) {
      await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
      await page.getByTestId("cad-block-insert-x").fill(String(x));
      await page.getByTestId("cad-block-insert-y").fill(String(y));
      await page.getByTestId("cad-block-insert").click();
    }
    await expect(page.getByTestId("cad-native-document-count")).toHaveText(
      "Native 8",
    );
  });

  /* ── 3. ¿ES UNA REFERENCIA O SON LÍNEAS COPIADAS? ──────────────────────── */
  let primera = "";
  let segunda = "";
  await test.step("3. lo colocado es una REFERENCIA de bloque, no geometría suelta", async () => {
    await cerrarBloques(page);
    const documento = await guardar(page, backend);
    const puestas = inserciones(documento);
    expect(puestas, "no hay dos INSERT en el documento").toHaveLength(2);
    for (const puesta of puestas) expect(puesta.block).toBe(SILLA.id);

    // La definición viajó de la biblioteca del inquilino al documento: el plano
    // se puede abrir en otro sitio sin la biblioteca detrás.
    expect(documento.blocks.map((b) => b.id)).toEqual([SILLA.id]);
    expect(documento.blocks[0].entities).toHaveLength(2);

    // Cada instancia lleva los atributos del catálogo.
    expect(puestas[0].attributes).toMatchObject({ CLAVE: "SL-01", ANCHO: "0.45" });

    const ordenadas = [...puestas].sort(
      (a, b) => a.insertion.x - b.insertion.x,
    );
    primera = ordenadas[0].id;
    segunda = ordenadas[1].id;
    expect(ordenadas[0].insertion).toMatchObject({ x: 3_000, y: 2_000 });
    expect(ordenadas[1].insertion).toMatchObject({ x: 4_000, y: 2_000 });

    // Y resuelve donde debe: asiento 450 × 450 centrado en el punto, respaldo
    // 50 mm hacia +Y.
    expect(envolvente(documento, ordenadas[0].id)).toEqual({
      minX: 2_775,
      minY: 1_775,
      maxX: 3_225,
      maxY: 2_275,
    });
  });

  /* ── 4. MOVER UNA COPIA ────────────────────────────────────────────────── */
  await test.step("4. MOVER una silla 700 mm hacia el norte", async () => {
    await designar(page, segunda);
    await teclear(page, "MOVE");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "punto base",
    );
    await teclear(page, "0,0");
    await teclear(page, "0,700");
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();

    const documento = await guardar(page, backend);
    const movida = inserciones(documento).find((i) => i.id === segunda)!;
    expect(
      movida.insertion,
      "MOVE tiene que mover la referencia entera",
    ).toMatchObject({ x: 4_000, y: 2_700 });
    // Y sigue siendo una referencia: mover no explota nada.
    expect(inserciones(documento)).toHaveLength(2);
    expect(envolvente(documento, segunda)).toEqual({
      minX: 3_775,
      minY: 2_475,
      maxX: 4_225,
      maxY: 2_975,
    });
  });

  /* ── 5. COPIAR UNA COPIA ───────────────────────────────────────────────── */
  let tercera = "";
  await test.step("5. COPIAR la silla 1.000 mm al este", async () => {
    await designar(page, segunda);
    await teclear(page, "COPY");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "punto base",
    );
    await teclear(page, "0,0");
    await teclear(page, "1000,0");
    await terminar(page);
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();

    const documento = await guardar(page, backend);
    const puestas = inserciones(documento);
    expect(puestas, "COPY no produjo una tercera referencia").toHaveLength(3);
    // Lo copiado es del MISMO bloque: si COPY aplanara la geometría, aquí
    // habría dos INSERT y un puñado de polilíneas sueltas.
    for (const puesta of puestas) expect(puesta.block).toBe(SILLA.id);
    expect(documento.blocks).toHaveLength(1);
    tercera = puestas.find((i) => ![primera, segunda].includes(i.id))!.id;
    expect(
      inserciones(documento).find((i) => i.id === tercera)!.insertion,
    ).toMatchObject({ x: 5_000, y: 2_700 });
  });

  /* ── 6. BEDIT ──────────────────────────────────────────────────────────── */
  await test.step("6. BEDIT: la puerta tecleable a editar el bloque", async () => {
    await soltarSeleccion(page);
    await cerrarBloques(page);
    await teclear(page, "BEDIT");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      /nombre del bloque/i,
    );
    await teclear(page, SILLA.name);
    // No se traga la orden: con el panel cerrado, BEDIT lo abre.
    await expect(page.getByTestId("cad-block-palette")).toBeVisible();
    console.log(
      `[auditoría] BEDIT responde: ${await page.getByTestId("cad-command-line").innerText()}`,
    );
  });

  /* ── 7. REDEFINIR: ¿CAMBIAN TODAS LAS COPIAS? ──────────────────────────── */
  await test.step("7a. BLOCK con un nombre que ya existe", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v2");
    await teclear(page, "B");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "nombre del bloque",
    );
    await teclear(page, SILLA.name);
    // Lo que conteste el producto queda registrado aquí: es el camino que un
    // usuario de AutoCAD prueba primero para redefinir.
    const linea = await page.getByTestId("cad-command-line").innerText();
    console.log(`[auditoría] BLOCK con nombre existente responde: ${linea}`);
    await page.getByTestId("cad-command-input").press("Escape");
  });

  await test.step("7b. redefinir desde el panel y ver si cambian las TRES", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v2");
    // La selección tiene que SOBREVIVIR a abrir el panel: si abrir el panel de
    // bloques soltara lo designado, redefinir sería imposible.
    await abrirBloques(page);
    await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
    await palette.getByRole("button", { name: "Redefinir" }).click();

    const documento = await guardar(page, backend);
    const definicion = documento.blocks.find((b) => b.id === SILLA.id)!;

    // (a) la definición cambió y subió de versión
    expect(definicion.entities, "la definición no se sustituyó").toHaveLength(1);
    expect(definicion.version, "redefinir tiene que subir la versión").toBe(2);

    // (b) siguen siendo tres referencias del mismo bloque: redefinir no aplana
    const puestas = inserciones(documento);
    expect(puestas).toHaveLength(3);
    for (const puesta of puestas) expect(puesta.block).toBe(SILLA.id);

    // (c) LAS TRES cambiaron de dibujo. Es la propiedad que decide si el
    //     producto sirve para un despacho.
    const cajas = [primera, segunda, tercera].map((id) => ({
      id,
      insercion: puestas.find((i) => i.id === id)!.insertion,
      caja: envolvente(documento, id),
    }));
    for (const { id, insercion, caja } of cajas)
      console.log(
        `[auditoría] ${id} insertado en (${insercion.x},${insercion.y}) dibuja en ` +
          `[${caja.minX}..${caja.maxX}] × [${caja.minY}..${caja.maxY}] ` +
          `(${caja.maxX - caja.minX} × ${caja.maxY - caja.minY} mm)`,
      );

    // Ninguna sigue midiendo 450 × 500: la silla vieja desapareció de las tres.
    for (const { caja } of cajas) {
      expect(caja.maxX - caja.minX).toBe(600);
      expect(caja.maxY - caja.minY).toBe(600);
    }

    // (d) LO QUE SÍ FALLA, Y ES GRAVE: ninguna se dibuja ya donde estaba.
    //
    // «Redefinir» toma la selección EN COORDENADAS DE MUNDO y la mete tal cual
    // en la definición, sin preguntar el punto base y sin restarlo. El bloque
    // conserva su punto base (0,0), así que cada instancia se desplaza el vector
    // que va del origen a donde uno dibujó el recambio: aquí (9.000, 8.000), o
    // sea NUEVE METROS a la derecha y OCHO hacia arriba, fuera del comedor.
    //
    // No es un detalle de precisión: es que la única forma de redefinir un
    // bloque tira el plano al monte salvo que el recambio se haya dibujado
    // encima del origen. Se afirma el desplazamiento medido para que el día que
    // se arregle esta prueba lo cante.
    for (const { id, insercion, caja } of cajas) {
      expect(
        { x: caja.minX - insercion.x, y: caja.minY - insercion.y },
        `DEFECTO: redefinir desplazó la silla ${id}; debería quedarse en su punto de inserción`,
      ).toEqual({ x: 9_000, y: 8_000 });
    }
  });

  await test.step("7c. testigo: con el recambio dibujado sobre el origen, redefinir es exacto", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v3");
    await abrirBloques(page);
    await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
    await palette.getByRole("button", { name: "Redefinir" }).click();

    const documento = await guardar(page, backend);
    expect(documento.blocks.find((b) => b.id === SILLA.id)!.version).toBe(3);

    const puestas = inserciones(documento);
    expect(puestas).toHaveLength(3);
    for (const id of [primera, segunda, tercera]) {
      const insercion = puestas.find((i) => i.id === id)!.insertion;
      const caja = envolvente(documento, id);
      // 700 × 700 centrada EXACTAMENTE en su punto de inserción: la máquina de
      // propagar es correcta al milímetro. Lo que falta es que el gesto de
      // redefinir pregunte el punto base, como lo pregunta el de crear.
      expect({ x: caja.minX, y: caja.minY, w: caja.maxX - caja.minX }).toEqual({
        x: insercion.x - 350,
        y: insercion.y - 350,
        w: 700,
      });
    }
  });

  /* ── 8. LOS OTROS DOS SITIOS DONDE PONE «BLOQUE» ───────────────────────── */
  await test.step("8a. «Mis bloques», el panel de la izquierda", async () => {
    await cerrarBloques(page);
    const contador = page.getByTestId("cad-native-document-count");
    const antes = await contador.innerText();

    // El MISMO bloque del catálogo, listado en el panel de la izquierda bajo
    // «Mis bloques» —el sitio con el nombre más obvio para buscarlo— pero
    // contado como «0 obj», que es lo que ve quien no sabe que hay otro panel.
    const fila = page.getByRole("button", { name: `${SILLA.name} 0 obj` });
    await expect(
      fila,
      "el bloque de la biblioteca aparece en «Mis bloques» como 0 obj",
    ).toBeVisible();

    await fila.click();
    await page.waitForTimeout(1_500);

    // Y no pasa NADA: ni se inserta, ni se avisa de por qué no.
    await expect(contador).toHaveText(antes);
    await expect(
      page.getByText(/insertado como grupo/i),
      "DEFECTO: «Mis bloques» no inserta el bloque y tampoco dice por qué",
    ).toHaveCount(0);
  });

  await test.step("8b. buscar «silla» en la caja de buscar del estudio", async () => {
    const antes = await guardar(page, backend);

    await page.getByTitle(/^Paleta de comandos/).click();
    const buscador = page.getByPlaceholder(
      "Buscar comando, herramienta o símbolo...",
    );
    await expect(buscador).toBeVisible();
    await buscador.fill("silla");

    // Las entradas de esta caja llevan su tipo a la derecha (SYMBOL, TOOL…).
    const cajaDeBuscar = buscador.locator("xpath=ancestor::div[2]");
    const entradas = cajaDeBuscar.getByRole("button");
    const rotulos = await entradas.allInnerTexts();
    console.log(`[auditoría] Cmd-K «silla» ofrece: ${JSON.stringify(rotulos)}`);

    // Hay una entrada que se llama exactamente «Silla» —igual que el bloque del
    // catálogo, y con sus mismas medidas— pero es un SÍMBOLO del catálogo
    // antiguo, no el bloque. Colocarla no crea ninguna referencia.
    const cual = rotulos.findIndex((texto) =>
      texto.startsWith(`${SILLA.name}\n`),
    );
    expect(
      cual,
      `la caja de buscar no ofrece ninguna «${SILLA.name}»`,
    ).toBeGreaterThanOrEqual(0);
    for (const texto of rotulos.filter((t) => t.includes(SILLA.name)))
      expect(
        texto.trim().endsWith("SYMBOL"),
        `la caja de buscar sólo ofrece símbolos para «${SILLA.name}»: ${texto}`,
      ).toBe(true);

    await entradas.nth(cual).click();
    const despues = await guardar(page, backend);
    expect(
      inserciones(despues).length,
      "DEFECTO: el «Silla» de la caja de buscar no es el bloque — no crea referencia",
    ).toBe(inserciones(antes).length);
    const nuevos = despues.entities
      .filter((e) => !antes.entities.some((viejo) => viejo.id === e.id))
      .map((e) => e.type);
    console.log(
      `[auditoría] colocar «Silla» desde Cmd-K añade: ${JSON.stringify(nuevos)}`,
    );
  });
});
