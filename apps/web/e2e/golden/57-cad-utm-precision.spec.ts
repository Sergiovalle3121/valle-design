import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import type { CadDocument } from "../../src/lib/cad/cad-document";

/**
 * EL ORIGEN FLOTANTE (P0-2) en un NAVEGADOR de verdad, no sólo en la sonda de
 * Node.
 *
 * `large-coordinate-precision.spec.ts` (unitario) prueba la aritmética exacta
 * contra el empaquetador real, en Node. Lo que NO puede probar desde Node: si
 * el WebGLRenderer, la cámara y `OrbitControls` —todos construidos con la
 * convención "el dibujo es pequeño y empieza cerca de cero"— se rompen de
 * alguna forma cuando las entidades del documento viven a magnitud UTM
 * (~2·10⁶) mientras el footprint del sitio sigue siendo un plano pequeño.
 *
 * El fixture reproduce exactamente ese caso: líneas y un círculo cuyas
 * coordenadas están desplazadas a magnitud UTM real de México (huso 14N,
 * ~2.150.000 al norte). Antes del origen flotante esto habría dibujado con
 * hasta 4 cm de error visible por vértice a esa magnitud — no crashea, pero
 * tiembla. Este golden no puede medir micras de un píxel, así que afirma lo
 * que SÍ puede verificar en un navegador real: que el documento con
 * coordenadas UTM se dibuja ENTERO, sin perder detalle ni caerse, y que las
 * coordenadas PERSISTIDAS siguen siendo las UTM exactas — el origen flotante
 * es puramente de render, nunca toca el documento.
 *
 * El footprint declarado (ver `openStudio`) no es el sitio real de 12 × 10 m
 * que sugeriría un caso de uso típico: hay que extenderlo hasta cubrir las
 * entidades UTM porque "Ajustar a la planta" encuadra sobre `[0,W]×[0,H]`,
 * no sobre los límites reales de las entidades. Es un gap real, aparte, que
 * este golden expone pero no arregla — ver la nota en `openStudio`.
 */
function utmDocument(): CadDocument {
  const east = 500_000;
  const north = 2_150_000;
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      {
        id: "linea-sur",
        type: "line",
        start: { x: east, y: north, z: 0 },
        end: { x: east + 8_000, y: north, z: 0 },
        layer: "0",
      },
      {
        id: "linea-este",
        type: "line",
        start: { x: east + 8_000, y: north, z: 0 },
        end: { x: east + 8_000, y: north + 6_000, z: 0 },
        layer: "0",
      },
      {
        id: "circulo",
        type: "circle",
        center: { x: east + 4_000, y: north + 3_000, z: 0 },
        radius: 900,
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["linea-sur", "linea-este", "circulo"] },
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

async function openStudio(context: BrowserContext, page: Page) {
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  // El footprint del sitio se ancla en (0,0) por diseño (ver Layout3DEditor.tsx,
  // `nativeViewportBoundsRef`): "Ajustar a la planta" encuadra sobre
  // `[0,W]×[0,H]`, no sobre los límites reales de las entidades — un gap
  // aparte (georreferenciación, P0-3), no el que prueba este golden. Para que
  // el encuadre SÍ llegue a las entidades UTM sin tocar esa lógica, el
  // footprint declarado se extiende hasta cubrirlas.
  const backend = await installCadStudioBackend<CadDocument>(
    context,
    utmDocument(),
    {
      footprintW: 520_000,
      footprintH: 2_160_000,
      unit: "mm",
      gridSize: 100,
    },
  );
  await page.goto("/legacy/studio");
  await expect(page.getByTestId("cad-canvas")).toBeVisible();
  await expect(page.getByTestId("cad-native-document-count")).toHaveText(
    "Native 3",
  );
  return backend;
}

const badge = (page: Page) => page.getByTestId("cad-render-pipeline");
async function settled(page: Page) {
  await expect(badge(page)).toHaveAttribute("data-settled", "true", {
    timeout: 30_000,
  });
}
const numberOf = async (page: Page, attribute: string) =>
  Number(await badge(page).getAttribute(attribute));

test("líneas y un círculo a magnitud UTM (~2,15·10⁶) se dibujan enteros, sin caerse ni perder coordenadas", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const backend = await openStudio(context, page);
  await page.getByTitle(/Vista superior/).click();
  await page.getByTitle(/Ajustar a la planta/).click();
  await settled(page);

  // 1. El pipeline por lotes —el que restó el origen flotante antes de
  //    empaquetar— es el que de verdad dibujó, no un camino distinto.
  await expect(badge(page)).toHaveAttribute("data-pipeline", "batched");

  // 2. Sin muestreo, ni siquiera a esta magnitud: las tres entidades, detalladas.
  const visible = await numberOf(page, "data-visible");
  const rendered = await numberOf(page, "data-rendered");
  expect(visible).toBe(3);
  expect(rendered).toBe(visible);
  expect(await numberOf(page, "data-batches")).toBeGreaterThan(0);
  expect(await numberOf(page, "data-instances")).toBeGreaterThan(0);

  // 3. El lienzo sigue vivo: ni excepción de WebGL ni contexto perdido por un
  //    número que se desbordó camino de la GPU.
  await expect(page.getByTestId("cad-native-entity-list")).toBeVisible();

  // 4. El origen flotante es puramente de RENDER: el documento persistido
  //    sigue teniendo las coordenadas UTM absolutas exactas, no las
  //    reducidas. Si algo hubiera escrito el origen restado de vuelta al
  //    documento, esto lo delataría.
  const saved = backend.snapshot().document;
  const line = saved.entities.find(
    (
      entity,
    ): entity is Extract<CadDocument["entities"][number], { type: "line" }> =>
      entity.type === "line" && entity.id === "linea-sur",
  );
  expect(line?.start.x).toBe(500_000);
  expect(line?.start.y).toBe(2_150_000);
  expect(line?.end.x).toBe(508_000);
});
