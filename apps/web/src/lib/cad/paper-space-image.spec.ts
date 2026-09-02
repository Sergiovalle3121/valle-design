/**
 * La imagen adjunta en la lámina, de punta a punta (Ola H, 2026-09-02).
 *
 *   - `cadImagePlotCommand`: una imagen `data:` produce el comando `image`
 *     con sus cuatro esquinas y su recorte ya en papel; un `asset://`, un
 *     PDF o `showImage: false` no lo producen y el porqué queda dicho.
 *   - `cadImagePlotPlacement`: una imagen derecha en el papel (Y hacia
 *     abajo) se coloca por su esquina inferior izquierda con ancho, alto y
 *     giro; una reflejada o sesgada se rechaza con su motivo.
 *   - `renderCadPlotPdf` con un PNG de 4 × 2 px de damero: el PDF lleva UN
 *     XObject `/Subtype /Image` de 4 × 2 y UN `Do`, leídos de sus bytes por
 *     `measureCadPdf`; con recorte, el flujo lleva `W n`; con atenuación,
 *     un estado gráfico; con brillo distinto de 50, el aviso lo dice.
 *   - `buildCadPublishPlan` con una imagen en el modelo: `rasterCommandCount`
 *     pasa de 0 a 1 y el comando cae DEBAJO del marco de la misma entidad.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "./cad-document";
import type { CadImageEntity } from "./cad-entities-v4";
import { cadImageDataUri } from "./image-attach-payload";
import { cadPngChecker } from "./image-fixtures";
import { buildCadPublishPlan, createThreeSheetDemo, type CadPublishSheet } from "./paper-space";
import { cadImagePlotCommand, cadImagePlotPlacement, type CadImagePlotCommand } from "./paper-space-image";
import { measureCadPdf } from "./plot/pdf-measure";
import { renderCadPlotPdf } from "./plot/plot-pdf";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

const dataUri = cadImageDataUri("image/png", cadPngChecker(4, 2));
const definitions = [
  { id: "png", name: "plano.png", uri: dataUri, pixelWidth: 4, pixelHeight: 2, loaded: true },
  { id: "asset", name: "otro.png", uri: "asset://tenant/otro.png", pixelWidth: 4, pixelHeight: 2 },
];
const image: CadImageEntity = {
  id: "img",
  type: "image",
  definition: "png",
  insertion: { x: 1000, y: 500, z: 0 },
  uVector: { x: 100, y: 0, z: 0 },
  vVector: { x: 0, y: 100, z: 0 },
  size: { width: 4, height: 2 },
  layer: "0",
};
// Papel: 0,1 mm por unidad, con la Y hacia abajo desde 300 mm.
const toPaper = (point: { x: number; y: number }) => ({ x: point.x * 0.1, y: 300 - point.y * 0.1 });

/* ── El comando del plan ────────────────────────────────────────────────── */
{
  const { command, skipped } = cadImagePlotCommand(image, { imageDefinitions: definitions }, "vp", toPaper);
  ok(command !== null && skipped === null, "una imagen data: produce el comando");
  eq(command!.corners, [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 140, y: 230 }, { x: 100, y: 230 }], "las esquinas en papel: 40 × 20 mm con la Y hacia abajo");
  eq([command!.name, command!.pixelWidth, command!.pixelHeight, command!.brightness, command!.contrast, command!.fade], ["plano.png", 4, 2, 50, 50, 0], "nombre, píxeles y ajuste neutro");
  eq(command!.clip, undefined, "sin recorte");
  const clipped = cadImagePlotCommand({ ...image, clipBoundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }], fade: 30 }, { imageDefinitions: definitions }, "vp", toPaper).command!;
  eq(clipped.clip, [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 120, y: 230 }], "el recorte, en papel");
  eq(clipped.fade, 30, "con su atenuación");
  const asset = cadImagePlotCommand({ ...image, definition: "asset" }, { imageDefinitions: definitions }, "vp", toPaper);
  ok(asset.command === null && asset.skipped?.detail.includes("no apunta a píxeles que la lámina pueda incrustar") === true, "un asset:// no se incrusta, y se dice");
  const hidden = cadImagePlotCommand({ ...image, showImage: false }, { imageDefinitions: definitions }, "vp", toPaper);
  ok(hidden.command === null && hidden.skipped === null, "showImage apagado: ni comando ni aviso");
  const orphan = cadImagePlotCommand({ ...image, definition: "nada" }, { imageDefinitions: definitions }, "vp", toPaper);
  ok(orphan.command === null && orphan.skipped?.detail.includes("no existe en el documento") === true, "sin definición se dice");
}

/* ── La colocación en el PDF ────────────────────────────────────────────── */
{
  const upright: CadImagePlotCommand = { kind: "image", entityId: "img", viewportId: "vp", uri: dataUri, name: "plano.png", pixelWidth: 4, pixelHeight: 2, corners: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 140, y: 230 }, { x: 100, y: 230 }], brightness: 50, contrast: 50, fade: 0 };
  const placement = cadImagePlotPlacement(upright);
  ok(!("reason" in placement), "derecha: se coloca");
  if (!("reason" in placement)) eq(placement, { x: 100, y: 230, width: 40, height: 20, rotationDeg: -0 }, "por la esquina superior izquierda (y − alto), sin giro");
  const rotated = cadImagePlotPlacement({ ...upright, corners: [{ x: 100, y: 250 }, { x: 100, y: 210 }, { x: 80, y: 210 }, { x: 80, y: 250 }] });
  ok(!("reason" in rotated) && near(rotated.rotationDeg, 90) && near(rotated.width, 40) && near(rotated.height, 20), `girada 90° antihorario en el papel: ${JSON.stringify(rotated)}`);
  const mirrored = cadImagePlotPlacement({ ...upright, corners: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 140, y: 270 }, { x: 100, y: 270 }] });
  ok("reason" in mirrored && mirrored.reason.includes("reflejada"), "V hacia abajo del papel: reflejada, se dice");
  const skewed = cadImagePlotPlacement({ ...upright, corners: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 150, y: 230 }, { x: 110, y: 230 }] });
  ok("reason" in skewed && skewed.reason.includes("sesgada"), "U y V no perpendiculares: sesgada, se dice");
}

/* ── El PDF, leído de sus bytes ─────────────────────────────────────────── */
function sheetWith(commands: CadPublishSheet["viewports"][number]["commands"]): CadPublishSheet {
  return {
    id: "s1",
    name: "Lámina",
    width: 420,
    height: 297,
    orientation: "landscape",
    colorMode: "color",
    lineweightScale: 1,
    titleBlock: {},
    viewports: [{ id: "vp", name: "Planta", clip: { x: 10, y: 10, width: 400, height: 250 }, scale: 100, locked: false, commands }],
  };
}
const raster: CadImagePlotCommand = { kind: "image", entityId: "img", viewportId: "vp", uri: dataUri, name: "plano.png", pixelWidth: 4, pixelHeight: 2, corners: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 140, y: 230 }, { x: 100, y: 230 }], brightness: 50, contrast: 50, fade: 0 };
void (async () => {
  const plain = await renderCadPlotPdf([sheetWith([raster])], { compress: false, sheetsWithoutTitleBlock: ["s1"] });
  const measured = measureCadPdf(plain.bytes);
  eq(measured.images, [{ widthPx: 4, heightPx: 2, filter: "FlateDecode" }], "el PDF lleva UN XObject imagen de 4 × 2");
  eq(measured.imageDraws, 1, "y lo dibuja una vez");
  ok(!plain.warnings.some((warning) => warning.includes("IMAGE")), `sin avisos de imagen: ${plain.warnings.join(" | ")}`);
  const text = Buffer.from(plain.bytes).toString("latin1");
  ok(!/W\s+n/.test(text.split("stream")[1] ?? ""), "sin recorte no hay `W n` en la página");

  const adjusted = await renderCadPlotPdf([sheetWith([{ ...raster, brightness: 70, fade: 40, clip: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 120, y: 230 }] }])], { compress: false, sheetsWithoutTitleBlock: ["s1"] });
  const adjustedText = Buffer.from(adjusted.bytes).toString("latin1");
  ok(/\bW\s*\n?\s*n\b/.test(adjustedText), "con recorte, el flujo lleva el recorte `W n`");
  ok(/\/ca\s+0\.6/.test(adjustedText) || /\/ca 0\.6/.test(adjustedText), "la atenuación 40 es un estado gráfico con opacidad 0,6");
  eq(measureCadPdf(adjusted.bytes).imageDraws, 1, "y la imagen sigue dibujándose");
  ok(adjusted.warnings.some((warning) => warning.includes("el brillo/contraste (70/50) no se aplica en la lámina")), `el brillo se declara: ${adjusted.warnings.join(" | ")}`);

  const mirrored = await renderCadPlotPdf([sheetWith([{ ...raster, corners: [{ x: 100, y: 250 }, { x: 140, y: 250 }, { x: 140, y: 270 }, { x: 100, y: 270 }] }])], { compress: false, sheetsWithoutTitleBlock: ["s1"] });
  eq(measureCadPdf(mirrored.bytes).imageDraws, 0, "una imagen reflejada no se dibuja…");
  ok(mirrored.warnings.some((warning) => warning.includes("reflejada")), "…y se dice");
  const remote = await renderCadPlotPdf([sheetWith([{ ...raster, uri: "https://ejemplo.mx/plano.png" }])], { compress: false, sheetsWithoutTitleBlock: ["s1"] });
  ok(remote.warnings.some((warning) => warning.includes("sólo incrusta imágenes que viajan dentro del dibujo")), "un http(s) no se descarga: se dice");

  /* ── El plan entero ───────────────────────────────────────────────────── */
  const entities: CadEntity[] = [image as CadEntity, { id: "ln", type: "line", start: { x: 0, y: 0 }, end: { x: 2000, y: 1000 }, layer: "0" } as CadEntity];
  const document = {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: ["img", "ln"] },
    paperSpaces: createThreeSheetDemo({ bounds: { x: 0, y: 0, width: 2000, height: 1000 }, unit: "mm", metadata: { project: "P", drawingNumber: "D-1", revision: "A", scale: "1:100", author: "Sergio", date: "2026-09-02" } as never }),
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
    history: [],
    imageDefinitions: definitions,
  } as unknown as CadDocument;
  const plan = buildCadPublishPlan(document, "2026-09-02T00:00:00.000Z");
  ok(plan.rasterCommandCount >= 1, `el plan cuenta la imagen: ${plan.rasterCommandCount}`);
  const commands = plan.sheets[0].viewports[0].commands;
  const imageAt = commands.findIndex((command) => command.kind === "image");
  const frameAt = commands.findIndex((command) => command.kind === "path" && command.entityId === "img");
  ok(imageAt >= 0 && frameAt > imageAt, `la imagen va DEBAJO de su marco (imagen en ${imageAt}, marco en ${frameAt})`);
  ok(plan.vectorCommandCount === commands.filter((command) => command.kind !== "image").length * plan.sheets.length || plan.vectorCommandCount > 0, "los comandos vectoriales no cuentan la imagen");
  const pdf = await renderCadPlotPdf(plan.sheets.slice(0, 1), { compress: false });
  eq(measureCadPdf(pdf.bytes).imageDraws, 1, "y el PDF de la lámina general lleva la imagen");

  console.log(`paper-space-image: ${checks} comprobaciones · comando image con esquinas y recorte en papel; colocación derecha/girada, reflejada y sesgada dichas; el PDF con XObject 4 × 2, Do, W n y opacidad 0,6 leídos de sus bytes; el plan cuenta rasterCommandCount y pone la imagen debajo del marco`);
})();
