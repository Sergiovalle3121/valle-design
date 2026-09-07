/**
 * LA «PREVIA EXACTA DE IMPRESIÓN» ENSEÑA LO MISMO QUE EL PDF.
 *
 * F4 metió en el plan el contorno real de una ventana poligonal (T-19·4) y lo
 * dibujado sobre el papel (T-30); `plot-pdf.ts` y `sheet-set-pdf.ts` los
 * honran. La previa en pantalla —`CadExactPrintPreview`, montada por
 * `CadLayoutManager` desde `props.preview`, que es la hoja que
 * `requestLayoutPreview` saca del MISMO `buildCadPublishPlan`— recortaba al
 * rectángulo envolvente y sólo pintaba los comandos de ventana: enseñaba una
 * cosa y el papel salía con otra.
 *
 * Se afirma sobre el marcado SVG que la previa emite, sin DOM interactivo
 * (mismo trato que los vecinos de esta carpeta).
 *
 * Correr: npx tsx src/components/cad/palettes/CadLayoutManager.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CadPaperSpace } from "@/lib/cad/cad-document";
import type { CadPublishSheet } from "@/lib/cad/paper-space";
import { CadLayoutManager } from "./CadLayoutManager";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const space: CadPaperSpace = {
  id: "layout:1",
  name: "Planta",
  entityIds: [],
  page: { width: 210, height: 297, unit: "mm", orientation: "portrait" },
  viewports: [],
};

const sheet: CadPublishSheet = {
  id: "layout:1",
  name: "Planta",
  width: 210,
  height: 297,
  orientation: "portrait",
  colorMode: "monochrome",
  lineweightScale: 1,
  titleBlock: {},
  viewports: [
    {
      id: "vp:rect",
      name: "Model",
      clip: { x: 10, y: 10, width: 90, height: 100 },
      scale: 50,
      locked: true,
      commands: [],
    },
    {
      id: "vp:poly",
      name: "Detalle",
      clip: { x: 110, y: 10, width: 90, height: 100 },
      clipPolygon: [
        { x: 120, y: 20 },
        { x: 190, y: 20 },
        { x: 190, y: 60 },
        { x: 155, y: 100 },
        { x: 120, y: 60 },
      ],
      scale: 20,
      locked: true,
      commands: [
        {
          kind: "path",
          entityId: "e-ventana",
          viewportId: "vp:poly",
          points: [{ x: 120, y: 40 }, { x: 190, y: 40 }],
          closed: false,
          style: { stroke: "#000000", lineWidth: 0.25 },
        },
      ],
    },
  ],
  paperCommands: [
    {
      kind: "path",
      entityId: "e-linea-papel",
      viewportId: "layout:1:paper",
      points: [{ x: 20, y: 255 }, { x: 190, y: 255 }],
      closed: false,
      style: { stroke: "#000000", lineWidth: 0.25 },
    },
    {
      kind: "text",
      entityId: "e-texto-papel",
      viewportId: "layout:1:paper",
      point: { x: 20, y: 252 },
      text: "NOTAS GENERALES",
      size: 4,
      rotation: 0,
      color: "#000000",
    },
  ],
};

const noop = () => undefined;
const html = renderToStaticMarkup(
  createElement(CadLayoutManager, {
    space,
    activeViewportId: null,
    layers: [],
    preflight: [],
    preview: sheet,
    onActivate: noop,
    onAdd: noop,
    onDuplicate: noop,
    onDelete: noop,
    onChange: noop,
    onLayerVisibility: noop,
    onLayerOverride: noop,
    onRequestPreview: noop,
  }),
);
const preview = html.slice(html.indexOf('data-testid="cad-exact-print-preview"'));
ok(preview.length > 0, "la previa exacta se monta desde `props.preview`");

// T-19·4: la ventana poligonal recorta con su contorno REAL, no con el rectángulo.
{
  const polygon = /<clipPath id="cad-clip-vp-poly"><polygon points="([^"]+)"><\/polygon><\/clipPath>/.exec(preview);
  ok(!!polygon, "la ventana poligonal lleva un <polygon> en su <clipPath>");
  ok(polygon?.[1] === "120,20 190,20 190,60 155,100 120,60", `los cinco vértices del contorno, en mm de papel: ${polygon?.[1]}`);
  // La rectangular sigue recortando con su rectángulo, como siempre.
  ok(
    /<clipPath id="cad-clip-vp-rect"><rect x="10" y="10" width="90" height="100"><\/rect><\/clipPath>/.test(preview),
    "la ventana rectangular sigue recortando con su rectángulo",
  );
  // Un solo polígono, y dentro de <defs>: la cuenta de <path> del golden 20
  // (ventanas múltiples) no cambia por el recorte.
  ok((preview.match(/<polygon/g) ?? []).length === 1, "un polígono por ventana poligonal, ninguno suelto");
  ok(preview.indexOf("<polygon") < preview.indexOf("</defs>"), "y vive en <defs>, no como geometría pintada");
}

// T-30: lo dibujado sobre el papel se pinta, y SIN recorte de ventana.
{
  const paperPath = preview.indexOf('d="M20,255 L190,255"');
  ok(paperPath >= 0, "la línea de papel se pinta en la previa");
  ok(preview.includes(">NOTAS GENERALES</text>"), "el rótulo de papel se pinta en la previa");
  ok(
    paperPath > preview.lastIndexOf('clip-path="url('),
    "la línea de papel va DESPUÉS de todos los grupos recortados: fuera de toda ventana",
  );
  // Y lo de ventana sigue dentro de su grupo recortado.
  const clipped = preview.indexOf('d="M120,40 L190,40"');
  ok(clipped >= 0 && clipped > preview.indexOf('clip-path="url(#cad-clip-vp-poly)"') && clipped < paperPath, "el comando de ventana sigue recortado por su ventana");
}

console.log(`CadLayoutManager.spec: OK — ${checks} comprobaciones`);
