import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

/**
 * DIBUJO PARAMÉTRICO de punta a punta.
 *
 * Lo que este golden fija es la promesa entera del trabajo: se restringe un
 * perfil ya dibujado, se le pone una cota atada a un PARÁMETRO, se cambia ese
 * parámetro tecleando en la línea de comandos, y **el documento canónico** —no
 * la pantalla— aparece con toda la geometría reajustada.
 *
 * Es la diferencia entre dibujar una pieza y dibujar una familia de piezas. Un
 * spec unitario puede demostrar que el solucionador converge; sólo esto
 * demuestra que un usuario llega hasta ahí tecleando.
 *
 * El perfil se siembra con ids legibles porque las restricciones se ponen sobre
 * objetos DESIGNADOS, y designarlos por el panel profesional (como hacen los
 * goldens de FILLET y CHAMFER) no depende de acertar un píxel del lienzo.
 */
function seedDocument(): CadDocument {
  const line = (
    id: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): CadEntity => ({
    id,
    type: "line",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    layer: "0",
  });
  // Rectángulo de 4000 × 2000 con las esquinas exactamente unidas.
  const entities = [
    line("perfil-abajo", 1_000, 1_000, 5_000, 1_000),
    line("perfil-derecha", 5_000, 1_000, 5_000, 3_000),
    line("perfil-arriba", 5_000, 3_000, 1_000, 3_000),
    line("perfil-izquierda", 1_000, 3_000, 1_000, 1_000),
  ];
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
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

/** Longitud de un segmento del documento persistido. */
function lengthOf(document: CadDocument, id: string): number {
  const entity = document.entities.find((candidate) => candidate.id === id);
  if (entity?.type !== "line") return Number.NaN;
  return Math.hypot(
    entity.end.x - entity.start.x,
    entity.end.y - entity.start.y,
  );
}

test("un parámetro tecleado reajusta el perfil restringido", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await expect(page.getByTestId("cad-command-line")).toBeVisible();

  // --- 1. AUTOCONSTRAIN deduce el perfil ------------------------------------
  // Es como se usa de verdad: se dibuja a ojo y después se le pide al programa
  // que reconozca lo que uno ya quería decir.
  await select(page, [
    "perfil-abajo",
    "perfil-derecha",
    "perfil-arriba",
    "perfil-izquierda",
  ]);
  await type(page, "AUTOCONSTRAIN");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    expect(saved.constraints.length).toBeGreaterThan(0);
    // Las esquinas se reconocen como coincidencias y los lados como
    // horizontales/verticales. Sin coincidencias, estirar el rectángulo lo
    // rompería en cuatro segmentos sueltos.
    expect(saved.constraints.some((c) => c.kind === "coincident")).toBe(true);
    expect(saved.constraints.some((c) => c.kind === "horizontal")).toBe(true);
    expect(saved.constraints.some((c) => c.kind === "vertical")).toBe(true);
    // Y la geometría NO se movió: el perfil ya cumplía lo que se acaba de decir.
    expect(lengthOf(saved, "perfil-abajo")).toBeCloseTo(4_000, 6);
    expect(lengthOf(saved, "perfil-izquierda")).toBeCloseTo(2_000, 6);
  }

  // --- 2. Los dos lados verticales, iguales ---------------------------------
  await select(page, ["perfil-izquierda", "perfil-derecha"]);
  await type(page, "GCEQUAL");
  await saveAndSettle(page, backend);
  expect(
    backend.snapshot().document.constraints.some((c) => c.kind === "equalLength"),
  ).toBe(true);

  // --- 3. Una cota atada a un parámetro nuevo -------------------------------
  await select(page, ["perfil-abajo"]);
  await type(page, "DCLINEAR");
  await type(page, "ancho = 2500");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    expect(saved.parameters?.map((p) => p.name)).toEqual(["ancho"]);
    expect(saved.parameters?.[0].value).toBeCloseTo(2_500, 6);
    // La cota apunta al parámetro POR NOMBRE. Si guardase el número, cambiar el
    // parámetro después no movería nada y todo esto sería decorado.
    const dimension = saved.constraints.find((c) => c.kind === "distance");
    expect(dimension?.parameter).toBe("ancho");
    // Y el perfil ya se estrechó a 2500 en el mismo gesto.
    expect(lengthOf(saved, "perfil-abajo")).toBeCloseTo(2_500, 6);
    expect(lengthOf(saved, "perfil-arriba")).toBeCloseTo(2_500, 6);
  }

  // --- 4. Cambiar el parámetro desde la línea de comandos -------------------
  await type(page, "PARAMETERS");
  await type(page, "F");
  await type(page, "ancho = 4200");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    expect(saved.parameters?.[0].value).toBeCloseTo(4_200, 6);
    // El perfil ENTERO se reajusta, no sólo el lado acotado.
    expect(lengthOf(saved, "perfil-abajo")).toBeCloseTo(4_200, 6);
    expect(lengthOf(saved, "perfil-arriba")).toBeCloseTo(4_200, 6);
    // Los verticales siguen midiendo lo mismo entre sí, que es lo que dice la
    // restricción de igualdad puesta en el paso 2.
    expect(lengthOf(saved, "perfil-izquierda")).toBeCloseTo(
      lengthOf(saved, "perfil-derecha"),
      6,
    );
    // Y el contorno sigue CERRADO: las esquinas no se despegaron al estirarlo.
    const abajo = saved.entities.find((e) => e.id === "perfil-abajo");
    const derecha = saved.entities.find((e) => e.id === "perfil-derecha");
    if (abajo?.type === "line" && derecha?.type === "line")
      expect(
        Math.hypot(
          abajo.end.x - derecha.start.x,
          abajo.end.y - derecha.start.y,
        ),
      ).toBeLessThan(1e-6);
  }

  // --- 5. Un parámetro derivado se recalcula solo ---------------------------
  await type(page, "PARAMETERS");
  await type(page, "F");
  await type(page, "alto = ancho / 2");
  await select(page, ["perfil-izquierda"]);
  await type(page, "DCLINEAR");
  await type(page, "alto");
  await saveAndSettle(page, backend);
  expect(lengthOf(backend.snapshot().document, "perfil-izquierda")).toBeCloseTo(
    2_100,
    6,
  );

  await type(page, "PARAMETERS");
  await type(page, "F");
  await type(page, "ancho = 6000");
  await saveAndSettle(page, backend);
  {
    const saved = backend.snapshot().document;
    expect(lengthOf(saved, "perfil-abajo")).toBeCloseTo(6_000, 6);
    // `alto = ancho / 2` se reevalúa en cadena y arrastra el lado vertical.
    expect(lengthOf(saved, "perfil-izquierda")).toBeCloseTo(3_000, 6);
    expect(lengthOf(saved, "perfil-derecha")).toBeCloseTo(3_000, 6);
  }
});
