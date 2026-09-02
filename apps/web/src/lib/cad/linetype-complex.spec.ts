/**
 * TIPOS DE LÍNEA CON TEXTO, de punta a punta (Ola F, 2026-09-02).
 *
 * Medido antes: un `.lin` con `["GAS",…]` salía por `skipped` y ninguna
 * superficie sabía rotular una línea de gas. Aquí se fija, con el ciclo de
 * acad.lin (0,5 trazo · 0,2 hueco · texto · 0,25 hueco = 0,95) y una línea
 * de 10 m a LTSCALE 1000:
 *
 *   1. la aritmética de los rótulos: el primero en 700 − 100 = 600, luego cada
 *      950, tantos como quepan enteros (10 en 10.000 mm), altura 100;
 *   2. el visor pide un quad por rótulo con el tipo de línea de la CAPA;
 *   3. la lámina lleva un comando de texto por rótulo y el PDF los bytes «GAS»;
 *   4. el DXF escribe el 74 = 2 con S/R/X/Y y el texto sobre el tramo, y al
 *      volver a leerlo el patrón de trazos es el mismo (el texto vuelve por
 *      NOMBRE, no por el fichero: `linetype_complejo` lo declara);
 *   5. el lector `.lin` dice qué texto llevaba la definición que no carga.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "./cad-document";
import { CAD_BUILTIN_LINETYPES, parseCadLinetypeLibrary } from "./linetype-lin";
import { CAD_COMPLEX_LINETYPES, cadComplexLinetypeFor, cadLinetypeTextPlacements } from "./linetype-complex";
import { cadLinetypeTextRequestsFor } from "./render/linetype-text-requests";
import { createCadLayout } from "./layout/layout-operations";
import { buildCadPublishPlan } from "./paper-space";
import { cadPageSetupFromLayout } from "./plot/page-setup";
import { buildCadPlotJob } from "./plot/plot-job";
import { createCadMonochromeTable } from "./plot/plot-style-table";
import { renderCadPlotPdf } from "./plot/plot-pdf";
import { measureCadPdf } from "./plot/pdf-measure";
import { exportCadDocumentDxf } from "./dxf-document-export";
import { parseRawDxfProperties } from "./dxf-read-properties";
import type { CadNativeEntity } from "./entity-runtime";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

const GAS = cadComplexLinetypeFor("gas_line")!;

/* ── 1. La aritmética de los rótulos ────────────────────────────────────── */
{
  ok(!!GAS && GAS.pattern.length === 3 && near(GAS.pattern[0], 0.5) && near(GAS.pattern[1], -0.2) && near(GAS.pattern[2], -0.25), "GAS_LINE es el ciclo de acad.lin: 0,5 · −0,2 · texto · −0,25");
  ok(CAD_BUILTIN_LINETYPES.some((entry) => entry.name === "GAS_LINE" && entry.pattern.length === 3), "y sus trazos están entre los de fábrica, que es lo que reparten el visor, la lámina y el DXF");
  ok(CAD_COMPLEX_LINETYPES.every((entry) => CAD_BUILTIN_LINETYPES.some((builtin) => builtin.name === entry.name)), "los siete con texto están todos en la tabla de fábrica");
  const placements = cadLinetypeTextPlacements([{ x: 0, y: 0 }, { x: 10_000, y: 0 }], false, GAS, 1000);
  eq(placements.length, 10, "en 10 m caben 10 rótulos enteros (600, 1.550, … 9.150; el de 10.100 no)");
  ok(near(placements[0].x, 600) && near(placements[0].y, -50), "el primero arranca en 700 − 100 = 600, 50 por debajo");
  ok(near(placements[1].x - placements[0].x, 950), "y cada 950 (el ciclo × LTSCALE)");
  ok(placements.every((placement) => placement.height === 100 && placement.rotationDeg === 0 && placement.align === "left" && placement.text === "GAS"), "altura S × LTSCALE = 100, sin giro, alineados por su arranque");

  const up = cadLinetypeTextPlacements([{ x: 0, y: 0 }, { x: 0, y: 3000 }], false, GAS, 1000);
  eq(up.length, 3, "subiendo, 3 rótulos");
  ok(near(up[0].rotationDeg, 90) && near(up[0].x, 50) && near(up[0].y, 600), "girados 90°, y el −0,05 cae a la DERECHA del avance (la izquierda de +Y es −X, así que Y negativa va a +X)");

  const back = cadLinetypeTextPlacements([{ x: 10_000, y: 0 }, { x: 0, y: 0 }], false, GAS, 1000);
  eq(back.length, 10, "de derecha a izquierda, los mismos 10");
  ok(back.every((placement) => placement.rotationDeg === 0 && placement.align === "right"), "pero derechos: el tramo a 180° se lee a 0°, anclado por el otro extremo, para que GAS no se lea SAG");
  ok(near(back[0].x, 9400) && near(back[0].y, -50), "el primero en 10.000 − 600, y el −0,05 sigue quedando por debajo en el papel");

  const corner = cadLinetypeTextPlacements([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }], false, GAS, 1000);
  eq(corner.length, 2 + 2, "el patrón se reinicia en cada vértice (PLINEGEN 0): dos por tramo de 2 m");
  eq(cadLinetypeTextPlacements([{ x: 0, y: 0 }, { x: 500, y: 0 }], false, GAS, 1000).length, 0, "un tramo de 0,5 m no lleva ninguno: mejor sin rótulo que cortado");
  eq(cadLinetypeTextPlacements([{ x: 0, y: 0 }, { x: 10_000, y: 0 }], false, GAS, 0).length, 0, "escala cero: nada");
  eq(cadComplexLinetypeFor("CENTER"), undefined, "CENTER no lleva texto");
}

/* ── El documento de las pruebas: una línea de gas de 10 m en su capa ────── */
function documento(extra: CadEntity[] = []): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:inst",
    name: "Instalaciones",
    templateId: "a3-landscape",
    modelBounds: { x: -500, y: -1000, width: 11_000, height: 3_000 },
    unit: "mm",
    metadata: { project: "Casa", drawingNumber: "IH-01", title: "Gas", sheetNumber: "S-001", revision: "P01", discipline: "Instalaciones" },
    scale: 50,
  });
  const entities: CadEntity[] = [
    { id: "gas", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10_000, y: 0, z: 0 }, layer: "GAS" },
    { id: "eje", type: "line", start: { x: 0, y: 1000, z: 0 }, end: { x: 10_000, y: 1000, z: 0 }, layer: "EJES" },
    ...extra,
  ];
  return {
    meta: { version: 1, schema: 9, unit: "mm", linetypeScale: 10 },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "GAS", name: "GAS", color: "#f59e0b", visible: true, locked: false, linetype: "GAS_LINE" },
      { id: "EJES", name: "EJES", color: "#94a3b8", visible: true, locked: false, linetype: "CENTER" },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

/* ── 2. El visor pide los quads con el tipo de línea de la CAPA ─────────── */
{
  const document = documento();
  const colorOf = () => 0xf59e0b;
  const requests = cadLinetypeTextRequestsFor(document.entities[0] as CadNativeEntity, document, colorOf, 0.5);
  // LTSCALE 10 en el modelo: ciclo de 9,5 mm, texto de 1 mm; en 10 m caben ⌊(10.000 − 6 − 1,5)/9,5⌋ + 1.
  eq(requests.length, Math.floor((10_000 - 6 - 1.5) / 9.5) + 1, "un quad por rótulo, a la escala del modelo (LTSCALE × propia)");
  ok(requests[0].text === "GAS" && requests[0].fontSize === 1 && requests[0].color === 0xf59e0b && requests[0].depth === 0.5 && requests[0].fontKey === "Arial", "con la fuente de fábrica, el color del pipeline y la profundidad de la entidad");
  eq(cadLinetypeTextRequestsFor(document.entities[1] as CadNativeEntity, document, colorOf, 0.5), [], "la línea de eje (CENTER) no pide nada");
  const explicit: CadNativeEntity = { id: "x", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 2000, y: 0, z: 0 }, layer: "0", context: { presentation: { linetype: { source: "explicit", value: "agua_fria", scale: 10 } } } } as never;
  const own = cadLinetypeTextRequestsFor(explicit, document, colorOf, 0);
  ok(own.length > 0 && own[0].text === "AF" && own[0].fontSize === 10, "el tipo propio manda sobre la capa y su escala MULTIPLICA a LTSCALE (0,1 × 10 × 10 = 10)");
  const curved: CadNativeEntity = { id: "c", type: "polyline", vertices: [{ x: 0, y: 0, z: 0, bulge: 0.5 }, { x: 5000, y: 0, z: 0 }], closed: false, layer: "GAS" } as never;
  eq(cadLinetypeTextRequestsFor(curved, document, colorOf, 0), [], "un tramo con bulge lleva los trazos pero no el rótulo (declarado)");
}

/* ── 3. La lámina y el PDF ──────────────────────────────────────────────── */
{
  const document = documento();
  const plan = buildCadPublishPlan(document);
  const commands = plan.sheets[0].viewports[0].commands;
  const texts = commands.filter((command) => command.entityId === "gas" && command.kind === "text");
  const path = commands.find((command) => command.entityId === "gas" && command.kind === "path");
  assert.ok(path && path.kind === "path");
  // Sobre el papel, el guion es patrón × LTSCALE en mm (paper-space-style): a 1:50 la línea mide 200 mm.
  eq(path.style.dash, [5, 2, 2.5], "el guion del papel: 0,5 · 0,2 · 0,25 × LTSCALE 10, en mm");
  eq(path.style.linetype, "GAS_LINE", "y el estilo lleva el nombre con el que se rotula");
  eq(texts.length, Math.floor((200 - 6 - 1.5) / 9.5) + 1, "un comando de texto por ciclo de 9,5 mm en 200 mm de papel");
  ok(texts.every((command) => command.kind === "text" && command.text === "GAS" && near(command.size, 1)), "«GAS» a 1 mm de papel, el mismo LTSCALE que el guion");
  eq(commands.filter((command) => command.entityId === "eje" && command.kind === "text").length, 0, "el eje no se rotula");

  const pageSetup = { ...cadPageSetupFromLayout(document.paperSpaces[0]), paper: "A3" as const, orientation: "landscape" as const };
  const job = buildCadPlotJob({ document, pageSetup, plotStyleTable: createCadMonochromeTable("estudio") });
  void renderCadPlotPdf(job.sheets, { compress: false, metadata: { title: "Gas" } }).then((pdf) => {
    const read = measureCadPdf(pdf.bytes).labels.filter((label) => label.text === "GAS");
    ok(read.length === texts.length, `el PDF lleva los ${texts.length} «GAS» en sus bytes, leídos por el lector de medición (leyó ${read.length})`);
    console.log(`linetype-complex: ${checks} comprobaciones · GAS_LINE en 10 m a LTSCALE 1000 da 10 rótulos cada 950 desde 600; visor, lámina, PDF y DXF (74 = 2) de acuerdo`);
  });
}

/* ── 4. El DXF: 74 = 2 con S/R/X/Y sobre el tramo, y la vuelta ──────────── */
{
  const document = documento();
  const exported = exportCadDocumentDxf(document);
  const lines = exported.content.split(/\r?\n/);
  const at = lines.findIndex((line, index) => line.trim() === "2" && lines[index + 1]?.trim() === "GAS_LINE" && lines[index - 1]?.trim() === "LTYPE");
  ok(at > 0, "la tabla LTYPE lleva GAS_LINE porque la capa GAS la referencia");
  const record = lines.slice(at, at + 60).join("\n");
  ok(/\n\s*73\n\s*3\n/.test(record) && /\n\s*40\n\s*0\.95\n/.test(record), "tres tramos y 0,95 de ciclo");
  ok(/\n\s*49\n\s*-0\.25\n\s*74\n\s*2\n\s*75\n\s*0\n\s*46\n\s*0\.1\n\s*50\n\s*0\n\s*44\n\s*-0\.1\n\s*45\n\s*-0\.05\n\s*9\nGAS\n/.test(record), "el rótulo va sobre el tramo −0,25 con S = 0,1, R = 0, X = −0,1, Y = −0,05 y el texto");
  ok(/\n\s*49\n\s*0\.5\n\s*74\n\s*0\n/.test(record), "y los tramos sin texto llevan 74 = 0");
  const back = parseRawDxfProperties(exported.content);
  const gas = back.linetypes.find((entry) => entry.name === "GAS_LINE");
  eq(gas?.pattern, [0.5, -0.2, -0.25], "al volver a leerlo, los trazos son los mismos");
  ok(back.warnings.some((warning) => warning.code === "linetype_complejo" && warning.message.includes("GAS_LINE")), "y el importador declara que el texto del fichero no se conserva: vuelve por NOMBRE, desde la tabla de fábrica");
  const center = lines.findIndex((line, index) => line.trim() === "2" && lines[index + 1]?.trim() === "CENTER" && lines[index - 1]?.trim() === "LTYPE");
  ok(center > 0 && !/\n\s*74\n\s*2\n/.test(lines.slice(center, center + 40).join("\n")), "CENTER no lleva texto alguno");
}

/* ── 5. El lector .lin dice qué texto llevaba lo que no carga ───────────── */
{
  const library = parseCadLinetypeLibrary(`*GAS_LINE,Gas line ----GAS----GAS----GAS----\nA,.5,-.2,["GAS",STANDARD,S=.1,R=0.0,X=-0.1,Y=-.05],-.25\n*FENCELINE1,Fenceline circle ----0-----0----\nA,.25,-.1,[CIRC1,ltypeshp.shx,x=-.1,s=.1],-.1,1\n*MIO,Trazos\nA,.5,-.25\n`);
  eq(library.definitions.map((entry) => entry.name), ["MIO"], "sólo la de trazos entra en el documento");
  ok(library.skipped[0].includes("«GAS»") && library.skipped[0].includes("GAS_LINE") && library.skipped[0].includes("formato persistido"), `la razón nombra el texto y la familia de fábrica: ${library.skipped[0]}`);
  ok(library.skipped[1].includes("forma (.shx)"), `la forma pide un .shx: ${library.skipped[1]}`);
}
