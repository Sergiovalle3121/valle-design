/**
 * Láminas: serie A, zona de archivo y el cajetín a la vista al doblar.
 *
 * Las tres afirmaciones:
 *
 *  1. **Serie A y sólo serie A.** Un papel ANSI no se acepta en silencio: se
 *     rechaza con un error que dice por qué. En México los planos van en A.
 *  2. **La zona de archivo son 20 mm en el borde de encuadernación**, y es un
 *     rectángulo comprobable y no un número en un comentario. Un plano perforado
 *     sobre 10 mm se agujerea encima del dibujo, y eso no tiene arreglo.
 *  3. **El cajetín cabe entero en el panel A4 que queda a la vista** con la
 *     lámina doblada, en las cinco hojas y en las dos orientaciones. Si cayera
 *     al dorso, la carpeta del cliente serían veinte rectángulos idénticos.
 */
import { strict as assert } from "node:assert";
import { CAD_SHEET_PAPERS, type CadSheetPaper } from "../paper-space";
import { layoutCadTitleBlock } from "../plot/title-block";
import {
  CAD_A4_PANEL_MM,
  CAD_ISO_SHEET_MARGINS_MM,
  CAD_MEXICAN_PAPERS,
  CadMexicanPaperError,
  cadA4PanelCount,
  cadA4PanelDeviation,
  cadFitsInFrontPanel,
  cadMexicanPaperFact,
  cadMexicanPaperFacts,
  cadMexicanSheetSourceProblems,
  cadSheetFilingZone,
  cadSheetFrontPanel,
  cadSheetSize,
} from "./mexican-sheets";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- SERIE A Y SÓLO SERIE A -------------------------------------------------
{
  assert.deepEqual([...CAD_MEXICAN_PAPERS], ["A0", "A1", "A2", "A3", "A4"]);
  // Los ANSI existen en el producto —hay quien exporta para un cliente de
  // fuera— pero NO son papel de lámina mexicana, y la norma lo dice negándolos.
  for (const ansi of ["letter", "tabloid"]) {
    assert.throws(
      () => cadMexicanPaperFact(ansi as CadSheetPaper),
      (error: unknown) => {
        assert.ok(error instanceof CadMexicanPaperError);
        assert.equal(error.code, "cad_mexican_paper_unsupported");
        assert.match(error.message, /serie A/);
        return true;
      },
    );
    checks += 1;
  }
  assert.deepEqual(cadMexicanSheetSourceProblems(), []);
  for (const fact of cadMexicanPaperFacts()) {
    ok(fact.sources.length > 0, `${fact.paper} cita su fuente`);
    ok(fact.purpose.length > 10, `${fact.paper} dice para qué se usa`);
  }
}

// --- LOS TAMAÑOS SON LOS DE ISO 216 -----------------------------------------
{
  assert.equal(cadMexicanPaperFact("A0").width, 841);
  assert.equal(cadMexicanPaperFact("A0").height, 1189);
  assert.equal(cadMexicanPaperFact("A4").width, 210);
  assert.equal(cadMexicanPaperFact("A4").height, 297);
  // Cada formato es la mitad del anterior: el lado largo de uno es el corto del
  // siguiente. Es la propiedad que define la serie, y comprobarla es lo que
  // impide que un tamaño se teclee mal.
  const order: CadSheetPaper[] = ["A0", "A1", "A2", "A3", "A4"];
  for (let index = 0; index + 1 < order.length; index += 1) {
    const big = CAD_SHEET_PAPERS[order[index]];
    const small = CAD_SHEET_PAPERS[order[index + 1]];
    assert.equal(small.height, big.width, `${order[index + 1]} hereda el lado de ${order[index]}`);
    checks += 1;
  }
  // Y la orientación es un giro, no otro papel.
  assert.deepEqual(cadSheetSize("A1", "landscape"), { width: 841, height: 594 });
  assert.deepEqual(cadSheetSize("A1", "portrait"), { width: 594, height: 841 });
}

// --- DOBLADO A A4 ------------------------------------------------------------
{
  assert.deepEqual(CAD_A4_PANEL_MM, { width: 210, height: 297 });
  assert.equal(cadA4PanelCount("A0"), 16);
  assert.equal(cadA4PanelCount("A1"), 8);
  assert.equal(cadA4PanelCount("A2"), 4);
  assert.equal(cadA4PanelCount("A3"), 2);
  assert.equal(cadA4PanelCount("A4"), 1);
  // La serie se redondea a milímetros enteros, así que un A0 no son EXACTAMENTE
  // dieciséis A4: son 16,03. Se publica la desviación en vez de fingir que la
  // aritmética es exacta.
  for (const paper of CAD_MEXICAN_PAPERS)
    ok(cadA4PanelDeviation(paper) < 0.005, `${paper}: la desviación de doblado es despreciable`);
  ok(cadA4PanelDeviation("A0") > 0, "y no es cero: el redondeo de ISO 216 existe");
}

// --- LA ZONA DE ARCHIVO ------------------------------------------------------
{
  assert.deepEqual(CAD_ISO_SHEET_MARGINS_MM, { top: 10, right: 10, bottom: 10, left: 20 });
  const zona = cadSheetFilingZone("A1", "landscape");
  assert.deepEqual(zona, { x: 0, y: 0, width: 20, height: 594 });
  // Corre por TODO el borde: se perfora arriba y abajo, no sólo en el centro.
  assert.equal(zona.height, cadSheetSize("A1", "landscape").height);
  assert.equal(cadSheetFilingZone("A4", "portrait").height, 297);
}

// --- EL CAJETÍN QUEDA A LA VISTA AL DOBLAR ----------------------------------
{
  let combinations = 0;
  for (const paper of CAD_MEXICAN_PAPERS)
    for (const orientation of ["portrait", "landscape"] as const) {
      const page = cadSheetSize(paper, orientation);
      const panel = cadSheetFrontPanel(paper, orientation);
      // El panel es el de abajo a la derecha: es la esquina que queda arriba en
      // el pliegue, y por eso el cajetín se ancla ahí y no en otro sitio.
      assert.equal(panel.x + panel.width, page.width);
      assert.equal(panel.y + panel.height, page.height);

      for (const variant of ["iso", "mexicano"] as const) {
        const layout = layoutCadTitleBlock({
          sheetId: `${paper}-${orientation}`,
          page,
          margins: CAD_ISO_SHEET_MARGINS_MM,
          variant,
        });
        ok(
          cadFitsInFrontPanel(layout.box, paper, orientation),
          `${paper} ${orientation} · cajetín ${variant}: queda a la vista con la lámina doblada`,
        );
        combinations += 1;
      }
    }
  assert.equal(combinations, 20, "cinco hojas × dos orientaciones × dos cajetines");

  // Y el detector detecta: un rectángulo en la esquina CONTRARIA no cabe. Sin
  // esta comprobación, una función que devolviera siempre `true` pasaría.
  ok(
    !cadFitsInFrontPanel({ x: 0, y: 0, width: 180, height: 50 }, "A1", "landscape"),
    "un cajetín arriba a la izquierda quedaría en el dorso del plano doblado",
  );
}

console.log(
  `mexican-sheets.spec: ${CAD_MEXICAN_PAPERS.length} papeles de la serie A, ${checks} comprobaciones nombradas OK`,
);
