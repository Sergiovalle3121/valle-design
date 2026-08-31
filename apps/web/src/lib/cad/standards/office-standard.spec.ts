import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { cadMexicanDimensionStyle, cadMexicanDimensionStyleName, cadMexicanScale, cadMexicanTextStyles } from "./mexican-annotation";
import { cadMexicanLayerDefs } from "./mexican-layers";
import { checkCadDocumentAgainstMexicanStandard } from "./office-standard";

let checks = 0;

function compliantStyles(): Pick<CadDocument, "layers" | "styles"> {
  const scale = cadMexicanScale(50);
  return {
    layers: cadMexicanLayerDefs(["MURO", "COTA"]),
    styles: {
      text: cadMexicanTextStyles(50, "mm", "Helvetica"),
      dimension: { [cadMexicanDimensionStyleName(scale)]: cadMexicanDimensionStyle(scale, "mm") },
      table: {},
      plot: {},
    },
  };
}

// --- un documento que sigue la norma no tiene desviaciones --------------------
{
  assert.deepEqual(checkCadDocumentAgainstMexicanStandard(compliantStyles()), []);
  checks += 1;
}

// --- reporta una capa de la norma con apariencia distinta ---------------------
{
  const document = compliantStyles();
  document.layers = document.layers.map((layer) => (layer.id === "MURO" ? { ...layer, color: "#000000" } : layer));
  const deviations = checkCadDocumentAgainstMexicanStandard(document);
  assert.equal(deviations.length, 1);
  assert.equal(deviations[0].code, "layer_appearance_mismatch");
  checks += 2;
}

// --- no opina de una capa que no está en la norma -----------------------------
{
  const document = compliantStyles();
  document.layers = [
    ...document.layers,
    { id: "CAPA-DEL-DESPACHO", name: "CAPA-DEL-DESPACHO", color: "#123456", visible: true, locked: false },
  ];
  assert.deepEqual(checkCadDocumentAgainstMexicanStandard(document), []);
  checks += 1;
}

// --- reporta el estilo de texto y de cota que faltan --------------------------
{
  const document = compliantStyles();
  document.styles = { text: {}, dimension: {}, table: {}, plot: {} };
  const codes = checkCadDocumentAgainstMexicanStandard(document).map((deviation) => deviation.code).sort();
  assert.deepEqual(codes, ["missing_dimension_style", "missing_text_style", "missing_text_style", "missing_text_style"]);
  checks += 1;
}

// --- reporta un estilo de texto con altura distinta a la de la escala ---------
{
  const document = compliantStyles();
  document.styles.text.ROTULO = { ...document.styles.text.ROTULO, height: 999 };
  const deviations = checkCadDocumentAgainstMexicanStandard(document);
  assert.equal(deviations.length, 1);
  assert.equal(deviations[0].code, "text_style_mismatch");
  checks += 2;
}

// --- se niega con un error tipado ante una escala que la norma no reconoce ----
{
  assert.throws(() => checkCadDocumentAgainstMexicanStandard(compliantStyles(), { scaleDenominator: 33 }), /no está en las escalas/);
  checks += 1;
}

console.log(`standards/office-standard.spec: ${checks} comprobaciones OK`);
