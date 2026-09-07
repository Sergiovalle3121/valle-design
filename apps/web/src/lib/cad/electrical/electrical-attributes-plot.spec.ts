/**
 * T-15 · LA ETIQUETA Y EL NÚMERO DE CONDUCTOR, EN LA LÁMINA TRAZADA.
 *
 * `mep-symbols.ts` y `electrical-wire.ts` ya prueban, por separado, que la
 * etiqueta del componente viaja al DXF como ATTRIB
 * (`electrical-attributes-dxf.spec.ts`) y que el número del conductor se
 * dibuja como TEXTO en el documento (`electrical-wire.spec.ts`). Lo que
 * ninguna de las dos prueba es lo único que de verdad le importa a un
 * electricista: si eso llega al PAPEL. Este spec sigue el mismo camino que
 * `paper-space-table.spec.ts` (Ola E) — documento → plan de publicación →
 * trazado real → PDF → `measureCadPdf` leyendo los BYTES — porque antes de
 * este cambio «el plano eléctrico que sale de Valle son rayas amarillas y
 * símbolos mudos» (T-15) y la única prueba que existía era la prosa de
 * `device-tags.ts`.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { cadMepBlockDefinition, cadMepSymbolFor } from "../mep-symbols";
import { CAD_IE_TAG } from "./device-tags";
import { CAD_IE_WIRE_LAYER, cadWireMetadata } from "./wire-numbering";
import { buildCadPublishPlan } from "../paper-space";
import { cadPageSetupFromLayout } from "../plot/page-setup";
import { buildCadPlotJob } from "../plot/plot-job";
import { createCadMonochromeTable } from "../plot/plot-style-table";
import { renderCadPlotPdf } from "../plot/plot-pdf";
import { measureCadPdf } from "../plot/pdf-measure";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const tablero = cadMepSymbolFor("Tablero");
assert.ok(tablero, "el símbolo MEP-TABLERO tiene que existir para esta prueba");

const componente: CadEntity = {
  id: "tb1",
  type: "insert",
  block: tablero!.id,
  insertion: { x: 500, y: 500, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  rotation: 0,
  layer: tablero!.layer,
  attributes: { [CAD_IE_TAG]: "-TB1" },
} as never;

// Lo que `wireCommands` (electrical-wire.ts) produce hoy para un conductor:
// la polilínea con sus metadatos y, desde T-15, el rótulo con el número.
const conductor: CadEntity = {
  id: "wire-1",
  type: "polyline",
  vertices: [{ x: 0, y: 2_000, z: 0 }, { x: 4_000, y: 2_000, z: 0 }],
  closed: false,
  layer: CAD_IE_WIRE_LAYER,
  context: { metadata: cadWireMetadata({ circuit: "C-1", number: 1, gauge: "12" }) },
} as never;

const rotuloConductor: CadEntity = {
  id: "wire-1-label",
  type: "text",
  x: 2_000,
  y: 2_060,
  text: "C-1-1 (12 AWG)",
  height: 100,
  layer: CAD_IE_WIRE_LAYER,
} as never;

function documento(): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:electrico",
    name: "Eléctrico",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: 5_000, height: 3_000 },
    unit: "mm",
    metadata: {
      project: "Nave", drawingNumber: "IE-001", title: "Instalación eléctrica",
      sheetNumber: "IE-01", revision: "P01", discipline: "Eléctrica",
    },
    scale: 50,
  });
  const entities = [componente, conductor, rotuloConductor];
  return {
    meta: { version: 1, schema: 9, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: CAD_IE_WIRE_LAYER, name: CAD_IE_WIRE_LAYER, color: "#eab308", visible: true, locked: false },
    ],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [layout],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [cadMepBlockDefinition(tablero!)],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

const document = documento();

// (1) El plan de publicación ya lleva la etiqueta del bloque como texto —el
// mismo mecanismo que `paper-space.spec.ts` prueba en general— ahora aplicado
// al bloque MEP real que antes se quedaba sin `attributes`.
{
  const plan = buildCadPublishPlan(document);
  const commands = plan.sheets[0].viewports[0].commands;
  ok(
    commands.some((command) => command.kind === "text" && command.text === "-TB1"),
    "el plan de publicación lleva la etiqueta -TB1 como texto vectorial",
  );
  ok(
    commands.some((command) => command.kind === "text" && command.text === "C-1-1 (12 AWG)"),
    "y el número de conductor, también como texto",
  );
}

// (2) El PDF trazado la lleva en sus BYTES: lo que un electricista de verdad
// recibe impreso, leído de vuelta por un lector que no comparte código con el
// emisor.
{
  const pageSetup = { ...cadPageSetupFromLayout(document.paperSpaces[0]), paper: "A3" as const, orientation: "landscape" as const };
  const job = buildCadPlotJob({ document, pageSetup, plotStyleTable: createCadMonochromeTable("estudio") });
  void renderCadPlotPdf(job.sheets, { compress: false, metadata: { title: "Eléctrico" } }).then((pdf) => {
    const measured = measureCadPdf(pdf.bytes);
    const read = measured.labels.map((label) => label.text);
    ok(
      read.includes("-TB1"),
      `el PDF trazado lleva la etiqueta del componente en sus bytes (leyó: ${read.join(" · ")})`,
    );
    ok(
      read.includes("C-1-1 (12 AWG)"),
      `y el número del conductor con su calibre (leyó: ${read.join(" · ")})`,
    );
    console.log(
      `electrical-attributes-plot: ${checks} comprobaciones verdes — la etiqueta del componente y el número del conductor llegan al PDF trazado, no sólo al renglón de la orden`,
    );
  });
}
