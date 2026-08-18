/**
 * Cajetín paramétrico: cabe, se rellena solo y no pisa el dibujo.
 *
 * Lo que se afirma aquí son las tres formas en que un cajetín arruina una
 * entrega: que se salga del papel (la lámina va sin número de plano), que se
 * imprima encima del dibujo (ilegible justo donde hace falta) y que sus datos
 * no salgan del documento (veinte hojas rellenadas a mano, tres con la
 * revisión de hace un mes).
 */
import { strict as assert } from "node:assert";
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "../paper-space";
import { createCadLayout, CAD_LAYOUT_TEMPLATES } from "../layout/layout-operations";
import {
  CAD_TITLE_BLOCK_HEIGHT_MM,
  CAD_TITLE_BLOCK_MIN_TEXT_MM,
  CAD_TITLE_BLOCK_WIDTH_MM,
  cadSheetSeriesLabel,
  cadTitleBlockOverflowMm,
  layoutCadTitleBlock,
  resolveCadTitleBlockFields,
} from "./title-block";

const ISO_MARGINS = { top: 10, right: 10, bottom: 10, left: 20 };
const PAPERS = Object.keys(CAD_SHEET_PAPERS) as CadSheetPaper[];

// --- CABE EN CUALQUIER HOJA ---------------------------------------------------
{
  let checked = 0;
  for (const paper of PAPERS)
    for (const orientation of ["portrait", "landscape"] as const) {
      const base = CAD_SHEET_PAPERS[paper];
      const page =
        orientation === "portrait"
          ? { width: base.width, height: base.height }
          : { width: base.height, height: base.width };
      const layout = layoutCadTitleBlock({
        sheetId: `${paper}-${orientation}`,
        page,
        margins: ISO_MARGINS,
      });

      assert.equal(
        cadTitleBlockOverflowMm(layout, page),
        0,
        `${paper} ${orientation}: el cajetín se sale ${cadTitleBlockOverflowMm(layout, page)} mm del papel`,
      );
      // Y dentro del MARCO, no sólo dentro del papel: entre el borde del papel
      // y el marco está el margen de encuadernación, y un cajetín ahí se
      // perfora al archivar.
      assert.ok(layout.box.x >= layout.frame.x - 1e-9, `${paper} ${orientation}: cajetín fuera del marco`);
      assert.ok(
        layout.box.y + layout.box.height <= layout.frame.y + layout.frame.height + 1e-9,
        `${paper} ${orientation}: el cajetín rebasa el marco por abajo`,
      );

      // Todas las celdas, dentro del recuadro.
      for (const cell of layout.cells) {
        assert.ok(cell.x >= layout.box.x - 1e-9, `${paper}: celda ${cell.key} a la izquierda del cajetín`);
        assert.ok(
          cell.x + cell.width <= layout.box.x + layout.box.width + 1e-9,
          `${paper}: celda ${cell.key} desbordada por la derecha`,
        );
        assert.ok(
          cell.labelSizeMm >= CAD_TITLE_BLOCK_MIN_TEXT_MM,
          `${paper} ${orientation}: rótulo de ${cell.labelSizeMm} mm, ilegible al imprimir`,
        );
      }

      // En todos los papeles ISO el cajetín va a su tamaño nominal: es la
      // propiedad que hace que se vea igual en A4 y en A0.
      assert.equal(layout.shrink, 1, `${paper} ${orientation}: el cajetín tuvo que encoger`);
      assert.ok(Math.abs(layout.box.width - CAD_TITLE_BLOCK_WIDTH_MM) < 1e-9);
      assert.ok(Math.abs(layout.box.height - CAD_TITLE_BLOCK_HEIGHT_MM) < 1e-9);
      checked += 1;
    }
  assert.equal(checked, PAPERS.length * 2);
}

// --- UNA HOJA QUE NO DA PARA 180 mm ENCOGE, Y LO DICE -------------------------
{
  const page = { width: 120, height: 90 };
  const layout = layoutCadTitleBlock({ sheetId: "mini", page, margins: ISO_MARGINS });
  assert.ok(layout.shrink < 1, "una hoja de 120 mm no admite un cajetín de 180");
  assert.equal(cadTitleBlockOverflowMm(layout, page), 0, "aun encogido, cabe");
  assert.ok(
    layout.issues.some((issue) => issue.includes("se reduce")),
    "encoger en silencio produce un cajetín ilegible sin que nadie se entere",
  );
}

// --- NO PISA EL DIBUJO --------------------------------------------------------
{
  // La presentación reserva una franja bajo la ventana gráfica. El cajetín
  // tiene que caber EN esa franja: si sube, se imprime sobre el plano.
  for (const template of CAD_LAYOUT_TEMPLATES) {
    const space = createCadLayout([], {
      id: `layout:${template.id}`,
      name: template.label,
      templateId: template.id,
      modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
      unit: "mm",
      metadata: {
        project: "Casa Vallarta",
        drawingNumber: "A-0001",
        title: "Planta baja",
        sheetNumber: "A-101",
        revision: "B",
        discipline: "Arquitectura",
      },
      scale: 50,
    });
    const layout = layoutCadTitleBlock({
      sheetId: space.id,
      page: { width: space.page.width, height: space.page.height },
      margins: template.margins,
      layout: space,
    });
    const viewport = space.viewports![0];
    const viewportBottom = viewport.paperBounds.y + viewport.paperBounds.height;
    assert.ok(
      layout.box.y >= viewportBottom - 1e-9,
      `${template.label}: el cajetín empieza en ${layout.box.y} mm y la ventana llega hasta ${viewportBottom} mm — se solapan`,
    );
  }
}

// --- LOS CAMPOS SALEN DEL DOCUMENTO, NO DEL TECLADO ---------------------------
{
  const space = createCadLayout([], {
    id: "layout:planta",
    name: "Planta baja",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: {
      project: "Casa Vallarta",
      drawingNumber: "A-0001",
      title: "Planta baja acotada",
      sheetNumber: "A-101",
      revision: "B",
      discipline: "Arquitectura",
      preparedBy: "S. Valle",
    },
    scale: 50,
  });

  const { fields, sources } = resolveCadTitleBlockFields({
    layout: space,
    series: { index: 3, total: 6 },
    viewportScales: ["1:50"],
    units: "mm",
    overrides: { date: "2026-08-18" },
  });

  assert.equal(fields.project, "Casa Vallarta");
  assert.equal(fields.title, "Planta baja acotada");
  assert.equal(fields.revision, "B");
  assert.equal(fields.drawnBy, "S. Valle");
  assert.equal(sources.project, "layout", "el proyecto sale de la presentación");

  // La escala la manda la VENTANA, no un atributo copiado de ayer.
  assert.equal(fields.scale, "1:50");
  assert.equal(sources.scale, "viewport");

  // La numeración de la serie la manda la serie.
  assert.equal(fields.sheetOf, "3/6");
  assert.equal(sources.sheetOf, "series");

  // Lo inyectado gana a todo.
  assert.equal(fields.date, "2026-08-18");
  assert.equal(sources.date, "input");

  // Lo que nadie rellenó se declara ausente en vez de imprimirse en blanco.
  assert.equal(fields.client, "");
  assert.equal(sources.client, "missing");

  const placed = layoutCadTitleBlock({
    sheetId: space.id,
    page: { width: space.page.width, height: space.page.height },
    margins: { top: 10, right: 10, bottom: 10, left: 20 },
    layout: space,
    series: { index: 3, total: 6 },
    viewportScales: ["1:50"],
  });
  assert.ok(placed.missing.includes("client"), "el cliente ausente se enumera");
  const clientCell = placed.cells.find((cell) => cell.key === "client");
  assert.equal(clientCell?.value, "—", "un hueco en blanco pasa la revisión; un guion no");

  // Dos ventanas a distinta escala se dicen las dos: rotular sólo una es
  // exactamente lo que hace que un detalle se mida con el escalímetro
  // equivocado.
  const two = resolveCadTitleBlockFields({ layout: space, viewportScales: ["1:50", "1:20"] });
  assert.equal(two.fields.scale, "1:50 / 1:20");
}

// --- LA ETIQUETA DE SERIE -----------------------------------------------------
{
  assert.equal(cadSheetSeriesLabel(1, 6), "1/6");
  assert.equal(cadSheetSeriesLabel(6, 6), "6/6");
  // Fallo cerrado: una posición imposible no inventa una etiqueta plausible.
  assert.equal(cadSheetSeriesLabel(7, 6), "");
  assert.equal(cadSheetSeriesLabel(0, 6), "");
  assert.equal(cadSheetSeriesLabel(1.5, 6), "");
}

console.log(
  `cajetín paramétrico: ${PAPERS.length * 2} combinaciones de papel × orientación dentro del marco, ` +
    `nominal ${CAD_TITLE_BLOCK_WIDTH_MM} × ${CAD_TITLE_BLOCK_HEIGHT_MM} mm`,
);
