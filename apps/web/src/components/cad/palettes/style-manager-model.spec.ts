/**
 * Gestor de estilos: descriptores, creación, escritura y borrado.
 *
 * Anclas absolutas: qué campos concretos tiene cada familia, qué valor concreto
 * queda en la tabla y qué mensajes concretos rechazan lo inválido. Una
 * propiedad de ida y vuelta se cumpliría igual con un `writeCadStyleValue` que
 * no validara nada.
 *
 * Correr:  npx tsx src/components/cad/palettes/style-manager-model.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadStyleTable } from "@/lib/cad/cad-document";
import {
  CAD_STYLE_FAMILIES,
  assertCadStyleName,
  cadStyleFamilyDescriptor,
  cadStyleRows,
  createCadStyle,
  deleteCadStyle,
  writeCadStyleValue,
} from "./style-manager-model";

const empty = (): CadStyleTable => ({
  text: {},
  dimension: {},
  mleader: {},
  table: {},
  plot: {},
});

// --- las cinco familias del documento, con sus campos ------------------------
{
  assert.deepEqual(
    CAD_STYLE_FAMILIES.map((entry) => entry.family),
    ["text", "dimension", "mleader", "table", "plot"],
    "las mismas cinco que tiene `CadStyleTable`",
  );
  assert.deepEqual(
    cadStyleFamilyDescriptor("text").fields.map((field) => field.key),
    ["fontFamily", "height"],
  );
  assert.deepEqual(
    cadStyleFamilyDescriptor("dimension").fields.map((field) => field.key),
    ["textStyle", "arrowSize", "precision"],
  );
  assert.deepEqual(
    cadStyleFamilyDescriptor("plot").fields.find(
      (field) => field.key === "colorMode",
    )?.options,
    ["color", "monochrome"],
  );
  assert.throws(
    () => cadStyleFamilyDescriptor("nope" as never),
    /Unknown CAD style family/,
  );
}

// --- crear: nace vacío y hereda los valores de fábrica -----------------------
{
  const styles = createCadStyle(empty(), "text", "  Titulos  ");
  assert.deepEqual(
    styles.text,
    { Titulos: {} },
    "el nombre se recorta y el estilo nace SIN campos: sólo viaja lo que el usuario decida",
  );
  const [row] = cadStyleRows(styles, "text");
  assert.equal(row.name, "Titulos");
  assert.deepEqual(
    row.values,
    { fontFamily: "Arial", height: 120 },
    "y la interfaz enseña los de fábrica",
  );
  assert.deepEqual(row.explicit, [], "ninguno está fijado todavía");
}

// --- crear: nombres inválidos y duplicados -----------------------------------
{
  assert.throws(
    () => createCadStyle(empty(), "text", "   "),
    /1–96 caracteres/,
  );
  assert.throws(
    () => createCadStyle(empty(), "text", "mal/nombre"),
    /1–96 caracteres/,
  );
  assert.throws(
    () => createCadStyle(empty(), "text", "x".repeat(97)),
    /1–96 caracteres/,
  );
  const once = createCadStyle(empty(), "text", "Titulos");
  assert.throws(() => createCadStyle(once, "text", "titulos"), /ya existe/);
  assert.equal(assertCadStyleName("  Cotas  "), "Cotas");
}

// --- escribir: el valor concreto queda en la tabla ---------------------------
{
  let styles = createCadStyle(empty(), "text", "Titulos");
  styles = writeCadStyleValue(styles, "text", "Titulos", "height", 250);
  assert.deepEqual(styles.text.Titulos, { height: 250 });
  const [row] = cadStyleRows(styles, "text");
  assert.equal(row.values.height, 250);
  assert.equal(
    row.values.fontFamily,
    "Arial",
    "lo no fijado sigue siendo de fábrica",
  );
  assert.deepEqual(row.explicit, ["height"]);

  styles = writeCadStyleValue(styles, "text", "Titulos", "fontFamily", "Inter");
  assert.deepEqual(styles.text.Titulos, { height: 250, fontFamily: "Inter" });
  assert.deepEqual(cadStyleRows(styles, "text")[0].explicit.sort(), [
    "fontFamily",
    "height",
  ]);
}

// --- escribir: lo inválido se rechaza con el motivo --------------------------
{
  const styles = createCadStyle(empty(), "text", "Titulos");
  assert.throws(
    () => writeCadStyleValue(styles, "text", "Titulos", "height", 0),
    /Altura no puede bajar de/,
    "una altura de 0 no se dibuja",
  );
  assert.throws(
    () =>
      writeCadStyleValue(styles, "text", "Titulos", "height", "no" as never),
    /Altura tiene que ser un número/,
  );
  assert.throws(
    () => writeCadStyleValue(styles, "text", "Titulos", "inventado", 1),
    /no tiene el campo inventado/,
  );
  assert.throws(
    () => writeCadStyleValue(styles, "text", "Ausente", "height", 200),
    /no existe/,
  );
  const plot = createCadStyle(empty(), "plot", "Blanco y negro");
  assert.throws(
    () =>
      writeCadStyleValue(plot, "plot", "Blanco y negro", "colorMode", "sepia"),
    /no admite «sepia»/,
  );
  assert.deepEqual(
    writeCadStyleValue(
      plot,
      "plot",
      "Blanco y negro",
      "colorMode",
      "monochrome",
    ).plot["Blanco y negro"],
    { colorMode: "monochrome" },
  );
}

// --- un número que llega como texto se convierte -----------------------------
{
  let styles = createCadStyle(empty(), "dimension", "Arq");
  styles = writeCadStyleValue(
    styles,
    "dimension",
    "Arq",
    "precision",
    "3" as never,
  );
  assert.deepEqual(styles.dimension.Arq, { precision: 3 });
  assert.equal(typeof styles.dimension.Arq.precision, "number");
  styles = writeCadStyleValue(styles, "dimension", "Arq", "precision", 0);
  assert.equal(styles.dimension.Arq.precision, 0, "cero decimales es legítimo");
}

// --- booleanos de la directriz -----------------------------------------------
{
  let styles = createCadStyle(empty(), "mleader", "Detalle");
  styles = writeCadStyleValue(styles, "mleader", "Detalle", "landing", false);
  assert.deepEqual(styles.mleader?.Detalle, { landing: false });
  assert.equal(cadStyleRows(styles, "mleader")[0].values.landing, false);
}

// --- borrar -------------------------------------------------------------------
{
  let styles = createCadStyle(empty(), "text", "A");
  styles = createCadStyle(styles, "text", "B");
  assert.deepEqual(
    cadStyleRows(styles, "text").map((row) => row.name),
    ["A", "B"],
    "las filas salen ordenadas por nombre, no por orden de creación",
  );
  const without = deleteCadStyle(styles, "text", "A");
  assert.deepEqual(Object.keys(without.text), ["B"]);
  assert.deepEqual(
    Object.keys(styles.text),
    ["A", "B"],
    "el original no se muta",
  );
  assert.throws(() => deleteCadStyle(without, "text", "A"), /no existe/);
}

// --- una familia ausente en el documento no revienta -------------------------
{
  const partial = {
    text: {},
    dimension: {},
    table: {},
    plot: {},
  } as CadStyleTable;
  assert.deepEqual(cadStyleRows(partial, "mleader"), []);
  const created = createCadStyle(partial, "mleader", "Detalle");
  assert.deepEqual(Object.keys(created.mleader ?? {}), ["Detalle"]);
}

console.log(
  "cad style manager model specs passed: 5 familias con sus campos, creación que nace vacía y hereda de fábrica, escritura que rechaza altura 0 / enum desconocido / campo inexistente, y borrado inmutable",
);
