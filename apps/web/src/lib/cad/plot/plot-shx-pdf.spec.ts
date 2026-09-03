/**
 * EL PLANO ENTREGADO CON UNA `.shx`: MEDIDO SOBRE LOS BYTES DEL PDF.
 *
 * Los dos specs de al lado prueban las piezas —`paper-space-stroke-text` los
 * trazos, `plot-stroke-text` la conversión del plan—. Este prueba lo que se
 * entrega: se toma un dibujo cuyo estilo de texto nombra `ISOCP.shx`, se traza
 * el PDF de verdad y se lee el archivo.
 *
 * Lo que tiene que ser cierto, y antes de esta ola no lo era:
 *
 * 1. el rótulo NO viaja como texto con una fuente de contorno — no hay `Tj`
 *    con su cadena;
 * 2. viaja como GEOMETRÍA — el archivo tiene muchos más trazos que el mismo
 *    plano en Arial;
 * 3. el informe de fuentes lo dice: `stroked`, no «sustituida por helvetica»;
 * 4. y ningún aviso anuncia una sustitución que ya no ocurre.
 *
 * El contraste con Arial es parte de la prueba: sin él, un emisor que se
 * comiera todos los rótulos pasaría los puntos 1 y 4.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { createCadLayout } from "../layout/layout-operations";
import { defaultCadPageSetup } from "./page-setup";
import { buildCadPlotJob } from "./plot-job";
import { renderCadPlotPdf } from "./plot-pdf";
import { describeCadPlotFonts } from "./plot-fonts";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Un dibujo con un muro y un rótulo, en la familia que se le pase. */
function drawing(family: string): CadDocument {
  const layout = createCadLayout([], {
    id: "layout:planta",
    name: "Planta",
    templateId: "a1-landscape",
    modelBounds: { x: 0, y: 0, width: 10_000, height: 6_000 },
    unit: "mm",
    metadata: { project: "Nave", drawingNumber: "A-0001", title: "Planta", sheetNumber: "S-001", revision: "P01", discipline: "Arquitectura" },
    scale: 50,
  });
  return {
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [{ id: "MURO", name: "MURO", color: "#000000", visible: true, locked: false, lineweight: 0.18 }],
    entities: [
      { id: "muro-sur", type: "line", layer: "MURO", start: { x: 0, y: 0, z: 0 }, end: { x: 10_000, y: 0, z: 0 } },
      { id: "rotulo", type: "text", layer: "MURO", x: 500, y: 2_000, text: "PLANTA BAJA", height: 250, style: "NOTAS" },
    ],
    history: [],
    modelSpace: { entityIds: ["muro-sur", "rotulo"] },
    paperSpaces: [layout],
    styles: { text: { NOTAS: { fontFamily: family } }, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

const pageSetup = defaultCadPageSetup({ paper: "A1", orientation: "landscape" });

/** Cuántos segmentos («l» de camino) lleva el flujo de contenido. */
function segmentos(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString("latin1").match(/\bl\b/g) ?? []).length;
}

async function correr(): Promise<void> {
  const shx = buildCadPlotJob({ document: drawing("ISOCP.shx"), pageSetup, generatedAt: "1970-01-01T00:00:00.000Z" });
  const arial = buildCadPlotJob({ document: drawing("Arial"), pageSetup, generatedAt: "1970-01-01T00:00:00.000Z" });

  eq(shx.strokedFamilies.join(","), "ISOCP.shx", "el trabajo declara qué familia se trazó");
  eq(arial.strokedFamilies.length, 0, "y Arial no se traza: seguiría siendo texto buscable");
  eq(
    shx.fontUsage.find((entry) => entry.family === "ISOCP.shx")?.usageCount,
    1,
    "el recuento de familias sigue contando el rótulo que el DIBUJO pedía",
  );

  const conTrazos = await renderCadPlotPdf(shx.sheets, {
    compress: false,
    fontUsage: shx.fontUsage,
    fontByEntity: shx.fontByEntity,
    strokedFamilies: shx.strokedFamilies,
    titleBlocks: shx.titleBlocks,
  });
  const conFuente = await renderCadPlotPdf(arial.sheets, {
    compress: false,
    fontUsage: arial.fontUsage,
    fontByEntity: arial.fontByEntity,
    strokedFamilies: arial.strokedFamilies,
    titleBlocks: arial.titleBlocks,
  });

  const textoTrazado = Buffer.from(conTrazos.bytes).toString("latin1");
  const textoFuente = Buffer.from(conFuente.bytes).toString("latin1");
  ok(textoFuente.includes("(PLANTA BAJA)"), "en Arial el rótulo viaja como texto, y se puede buscar");
  ok(!textoTrazado.includes("(PLANTA BAJA)"), "con ISOCP.shx ya NO viaja como texto");
  ok(
    segmentos(conTrazos.bytes) > segmentos(conFuente.bytes) + 30,
    `viaja como geometría: ${segmentos(conTrazos.bytes)} segmentos frente a ${segmentos(conFuente.bytes)}`,
  );

  const informe = conTrazos.fonts.find((font) => font.family === "ISOCP.shx");
  ok(informe, "el informe de fuentes sigue nombrando la familia del dibujo");
  eq(informe!.disposition, "stroked", "y dice que se DIBUJÓ, no que se sustituyó");
  eq(informe!.substitutedBy, "Hershey ISO", "con el juego de trazos que la reemplaza, por su nombre");
  ok(
    describeCadPlotFonts(conTrazos.fonts).some((linea) => /ISOCP\.shx: DIBUJADA con los trazos/.test(linea)),
    "y el renglón que se le enseña a quien traza lo cuenta igual",
  );
  ok(
    !conTrazos.warnings.some((aviso) => /ISOCP\.shx/.test(aviso) && /sustituye/.test(aviso)),
    "ningún aviso anuncia una sustitución que ya no ocurre",
  );
  // El cajetín SÍ sigue siendo texto, y necesita una fuente que exista: si la
  // familia trazada se colara como fuente base, jsPDF se quedaría sin ella y el
  // cajetín saldría en la tipografía que el visor quisiera.
  eq(informe!.baseFont, "helvetica", "la fuente base declarada es una real del PDF");
  ok(textoTrazado.includes("/F1"), "y el archivo trae una fuente con la que escribir el cajetín");
  ok(
    conFuente.fonts.find((font) => font.family === "Arial")?.disposition === "substituted",
    "y Arial sigue declarándose sustituida, que es lo que de verdad le pasa",
  );

  console.log(`plot-shx-pdf: ${verdes} comprobaciones verdes`);
}

void correr();
