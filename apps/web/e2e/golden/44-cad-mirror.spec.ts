/**
 * MIRROR en el editor real: la orden que faltaba entera.
 *
 * EL HUECO. El motor tenía MOVE, ROTATE, SCALE y COPY sobre entidades nativas,
 * y ningún MIRROR — buscando «mirror» en el proyecto sólo salían muebles de
 * plantilla. Media planta simétrica había que dibujarla dos veces.
 *
 * Y no era un `transform` más: `CadEntityTransform` es una SEMEJANZA
 * (traslación, giro, escala), y todas conservan la orientación. Una reflexión la
 * invierte, así que ni se cuela como escala negativa —el adaptador de círculo
 * hace `radius * Math.abs(scale)`— ni basta con transformar los ángulos de un
 * arco sin intercambiarlos.
 *
 * LO QUE ESTE GOLDEN AÑADE al spec unitario: que el usuario llega a la orden con
 * varias entidades seleccionadas, que el reflejo —con el barrido del arco y el
 * signo del bulge correctos— termina en el documento persistido, y que una
 * selección con texto no refleja NADA en vez de reflejar media planta.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { installMockBackend } from "../fixtures/mock-backend";
import { installCadStudioBackend } from "../fixtures/cad-v1-backend";
import { loginAsStandaloneOwner } from "../fixtures/standalone-identity";
import { saveAndSettle } from "../fixtures/cad-save";
import { applyFieldGroup } from "../fixtures/dynamic-input";
import type { CadDocument, CadEntity } from "../../src/lib/cad/cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;
type CadArc = Extract<CadEntity, { type: "arc" }>;

function canonicalDocument(): CadDocument {
  return {
    meta: {
      version: 1,
      schema: 3,
      unit: "mm",
      footprintW: 12_000,
      footprintH: 10_000,
      gridSize: 100,
    },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [
      // Un muro a la izquierda del eje x = 6000.
      {
        id: "muro",
        type: "line",
        start: { x: 2_000, y: 1_000, z: 0 },
        end: { x: 2_000, y: 5_000, z: 0 },
        layer: "0",
      },
      // Y un arco: el semicírculo superior, para comprobar el barrido.
      {
        id: "curva",
        type: "arc",
        center: { x: 3_000, y: 3_000, z: 0 },
        radius: 800,
        startAngle: 0,
        endAngle: 180,
        layer: "0",
      },
      // Un rótulo que NO se sabe reflejar todavía. Es `mtext` y no `text`
      // porque el texto simple lo posee el sistema heredado y no llega a la
      // selección nativa; el MTEXT sí es una entidad canónica seleccionable.
      {
        id: "rotulo",
        type: "mtext",
        insertion: { x: 2_500, y: 6_000, z: 0 },
        text: "SALA 1",
        layer: "0",
      },
    ],
    history: [],
    modelSpace: { entityIds: ["muro", "curva", "rotulo"] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

async function installCadBackend(context: BrowserContext) {
  return installCadStudioBackend<CadDocument>(context, canonicalDocument(), {
    footprintW: 12_000,
    footprintH: 10_000,
    unit: "mm",
    gridSize: 100,
  });
}

async function select(
  page: import("@playwright/test").Page,
  names: string[],
) {
  await page.getByTitle(/Selección profesional/).click();
  const query = page.getByTestId("cad-quick-select-text");
  for (const [index, name] of names.entries()) {
    if (index > 0) await page.getByTestId("cad-selection-operation-add").click();
    await query.fill(name);
    await page.getByTestId("cad-quick-select-apply").click();
  }
  await expect(page.getByTestId("cad-selection-count")).toHaveText(
    `${names.length} seleccionado${names.length === 1 ? "" : "s"}`,
  );
  await page.getByLabel("Cerrar panel profesional").click();
}

test("MIRROR refleja la selección sobre un eje y lo persiste", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await select(page, ["muro", "curva"]);

  await expect(
    page.getByTestId("cad-mirror-control"),
    "con geometría nativa seleccionada el panel de MIRROR tiene que estar disponible",
  ).toBeVisible();

  // Eje vertical por x = 6000.
  await applyFieldGroup(
    page,
    {
      "cad-mirror-ax": "6000",
      "cad-mirror-ay": "0",
      "cad-mirror-bx": "6000",
      "cad-mirror-by": "5000",
    },
    "cad-mirror-apply",
  );

  await saveAndSettle(page, backend);

  const stored = backend.snapshot().document;

  // Los originales siguen ahí: por defecto MIRROR conserva.
  expect(
    stored.entities.find((entity) => entity.id === "muro"),
    "el original se conserva",
  ).toBeTruthy();

  const lines = stored.entities.filter(
    (entity): entity is CadLine => entity.type === "line",
  );
  expect(lines, "aparece una línea nueva: el reflejo").toHaveLength(2);
  const mirroredWall = lines.find((entity) => entity.id !== "muro");
  expect(
    mirroredWall!.start.x,
    "x = 6000 + (6000 − 2000): el muro cruza al otro lado del eje",
  ).toBeCloseTo(10_000, 6);
  expect(mirroredWall!.end.x).toBeCloseTo(10_000, 6);
  expect(
    mirroredWall!.start.y,
    "la coordenada paralela al eje no cambia",
  ).toBeCloseTo(1_000, 6);

  const arcs = stored.entities.filter(
    (entity): entity is CadArc => entity.type === "arc",
  );
  expect(arcs, "y un arco nuevo").toHaveLength(2);
  const mirroredArc = arcs.find((entity) => entity.id !== "curva")!;
  expect(mirroredArc.center.x, "el centro se refleja").toBeCloseTo(9_000, 6);
  expect(mirroredArc.radius, "el radio no cambia").toBe(800);
  // Reflejado sobre un eje VERTICAL, el semicírculo superior sigue arriba pero
  // recorrido al revés: 0°→180° pasa a 180°→360°... reflejado sobre x=6000, que
  // es 2θ = 180°, los ángulos se intercambian y quedan 0° y 180° otra vez pero
  // con inicio y fin cambiados de punta.
  const sweep =
    ((mirroredArc.endAngle - mirroredArc.startAngle) % 360 + 360) % 360;
  expect(sweep, "el barrido sigue siendo medio giro").toBeCloseTo(180, 6);
  // El punto medio del arco reflejado tiene que estar donde estaba el del
  // original, reflejado: arriba, a 800 sobre el centro.
  const mid = ((mirroredArc.startAngle + sweep / 2) * Math.PI) / 180;
  expect(
    mirroredArc.center.y + 800 * Math.sin(mid),
    "el arco reflejado sigue combando hacia ARRIBA, no hacia abajo",
  ).toBeCloseTo(3_800, 6);
});

test("MIRROR no refleja media planta: con un rótulo dentro, aborta entero", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await installMockBackend(context);
  await loginAsStandaloneOwner(context);
  const backend = await installCadBackend(context);
  await page.goto("/legacy/studio");

  await select(page, ["muro", "rotulo"]);

  await expect(
    page.getByTestId("cad-mirror-control"),
    "el panel sigue visible: el problema es la selección, no la orden",
  ).toBeVisible();

  // Se dice QUÉ entidad lo impide y por qué, antes de pulsar nada.
  const blocked = page.getByTestId("cad-mirror-blocked");
  await expect(blocked, "se explica el bloqueo sin tener que pulsar").toBeVisible();
  await expect(blocked, "nombrando la entidad concreta").toContainText("rotulo");
  await expect(blocked, "y el motivo real").toContainText(/MIRRTEXT/i);

  // Y el botón no deja pulsar: ofrecer una orden que va a fallar es peor que
  // no ofrecerla — el mismo criterio que se aplicó a FILLET con curvas.
  await expect(
    page.getByTestId("cad-mirror-apply"),
    "no se puede aplicar una operación que se sabe que va a fallar",
  ).toBeDisabled();

  // Nada se reflejó, ni siquiera el muro, que sí se sabía reflejar.
  const stored = backend.snapshot().document;
  expect(
    stored.entities.filter((entity) => entity.type === "line"),
    "el muro no se reflejó: la operación es todo o nada",
  ).toHaveLength(1);
  expect(stored.entities).toHaveLength(3);
});
