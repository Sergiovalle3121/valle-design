import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadV1Backend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "../../src/lib/cad/cad-document-shared";
import { resolveCadInsert } from "../../src/lib/cad/professional-blocks";

/**
 * EL DELINEANTE QUE REUTILIZA MOBILIARIO — graduada de `e2e/auditoria/bloques.spec.ts`.
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
 *   7. REDEFINIR la definición y comprobar que CAMBIAN TODAS LAS COPIAS, y
 *      que se quedan DONDE ESTABAN
 *
 * LO QUE LA AUDITORÍA DEL 2026-09-01 MIDIÓ, y lo que este golden defiende:
 *   · Redefinir propagaba a todas las instancias pero NO preguntaba el punto
 *     base: cada silla se iba el vector que va del origen a donde uno dibujó
 *     el recambio, +9000,+8000 mm, fuera del comedor (paso 7b de entonces).
 *   · Teclear BLOCK con un nombre existente respondía «redefínalo» y no había
 *     ninguna orden con la que hacerlo (paso 7a de entonces).
 *   Ahora BLOCK con el nombre existente pregunta «¿Redefinirlo?», pide el
 *   punto base de la nueva definición y consume los objetos designados; el
 *   botón «Redefinir» del panel arranca ese mismo gesto.
 *
 * Los pasos 8a/8b de la auditoría («Mis bloques» muerto, «Silla» de Ctrl+K que
 * no es el bloque) NO se gradúan aquí: siguen rojos en sus propias pruebas
 * `refutacion-mis-bloques` y `refutacion-cmdk-silla`.
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

  /* ── 7. REDEFINIR: ¿CAMBIAN TODAS LAS COPIAS, Y SE QUEDAN DONDE ESTABAN? ── */
  await test.step("7a. BLOCK con un nombre que ya existe PREGUNTA, y Enter es No", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v2");
    await teclear(page, "B");
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "nombre del bloque",
    );
    await teclear(page, SILLA.name);
    // La pregunta de `-BLOCK` en AutoCAD, con No por defecto: pisar una
    // definición con todas sus inserciones no se acepta por descuido.
    await expect(page.getByTestId("cad-command-prompt")).toContainText("Redefinirlo");
    await terminar(page);
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "nombre del bloque",
    );
    await page.getByTestId("cad-command-input").press("Escape");
    const documento = await guardar(page, backend);
    expect(documento.blocks.find((b) => b.id === SILLA.id)!.version).toBe(1);
  });

  await test.step("7b. redefinir desde el panel: pide el punto base y las TRES se quedan en su sitio", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v2");
    // La selección tiene que SOBREVIVIR a abrir el panel: si abrir el panel de
    // bloques soltara lo designado, redefinir sería imposible.
    await abrirBloques(page);
    await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
    await palette.getByRole("button", { name: "Redefinir" }).click();

    // El gesto es el de AutoCAD: el panel arranca BLOCK → Sí, y el motor pide
    // el punto base de la NUEVA definición. Se teclea la esquina del recambio.
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      `punto base de la nueva definición de ${SILLA.name}`,
    );
    await teclear(page, "9000,8000");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("Designe objetos");
    await terminar(page);
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();

    const documento = await guardar(page, backend);
    const definicion = documento.blocks.find((b) => b.id === SILLA.id)!;

    // (a) la definición cambió, subió de versión y su punto base es el señalado
    expect(definicion.entities, "la definición no se sustituyó").toHaveLength(1);
    expect(definicion.version, "redefinir tiene que subir la versión").toBe(2);
    expect(definicion.basePoint).toMatchObject({ x: 9_000, y: 8_000 });

    // (b) el recambio pasó a SER el bloque: ya no está suelto en el plano
    expect(documento.entities.some((e) => e.id === "silla-v2")).toBe(false);

    // (c) siguen siendo tres referencias del mismo bloque: redefinir no aplana
    const puestas = inserciones(documento);
    expect(puestas).toHaveLength(3);
    for (const puesta of puestas) expect(puesta.block).toBe(SILLA.id);

    // (d) LAS TRES cambiaron de dibujo Y se quedaron en su punto de inserción.
    //     Con el punto base en la esquina del recambio, cada silla dibuja de su
    //     inserción hacia +X/+Y, 600 × 600. Es la propiedad que decide si el
    //     producto sirve para un despacho: el día 1 de septiembre salían a
    //     +9000, +8000.
    for (const id of [primera, segunda, tercera]) {
      const insercion = puestas.find((i) => i.id === id)!.insertion;
      const caja = envolvente(documento, id);
      expect(
        { x: caja.minX, y: caja.minY, w: caja.maxX - caja.minX, h: caja.maxY - caja.minY },
        `la silla ${id} no se quedó en su punto de inserción`,
      ).toEqual({ x: insercion.x, y: insercion.y, w: 600, h: 600 });
    }
  });

  await test.step("7c. testigo: con el recambio dibujado sobre el origen, el punto base 0,0 la deja centrada", async () => {
    await cerrarBloques(page);
    await designar(page, "silla-v3");
    await abrirBloques(page);
    await page.getByTestId(`cad-block-row-${SILLA.name}`).click();
    await palette.getByRole("button", { name: "Redefinir" }).click();
    await expect(page.getByTestId("cad-command-prompt")).toContainText(
      "punto base de la nueva definición",
    );
    await teclear(page, "0,0");
    await expect(page.getByTestId("cad-command-prompt")).toContainText("Designe objetos");
    await terminar(page);
    await expect(page.getByTestId("cad-command-prompt")).toBeHidden();

    const documento = await guardar(page, backend);
    expect(documento.blocks.find((b) => b.id === SILLA.id)!.version).toBe(3);

    const puestas = inserciones(documento);
    expect(puestas).toHaveLength(3);
    for (const id of [primera, segunda, tercera]) {
      const insercion = puestas.find((i) => i.id === id)!.insertion;
      const caja = envolvente(documento, id);
      // 700 × 700 centrada EXACTAMENTE en su punto de inserción.
      expect({ x: caja.minX, y: caja.minY, w: caja.maxX - caja.minX }).toEqual({
        x: insercion.x - 350,
        y: insercion.y - 350,
        w: 700,
      });
    }
  });
});
