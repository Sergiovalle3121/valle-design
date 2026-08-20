/**
 * Gestor de propiedades de capa: filas y filtros.
 *
 * Anclas absolutas: qué capas concretas sobreviven a cada filtro. Los estados
 * de capa ya no se prueban aquí: desde el esquema 9 viven en el documento y su
 * maquinaria —y sus specs— están en `lib/cad/layer-states` y en el comando
 * LAYERSTATE.
 *
 * Correr:  npx tsx src/components/cad/palettes/layer-manager-model.spec.ts
 */
import { strict as assert } from "node:assert";
import { CadLayerManagerHost } from "./layer-manager-host";
import {
  describeCadLineweight,
  filterCadLayerRows,
  type CadLayerManagerRow,
} from "./layer-manager-model";

function row(
  overrides: Partial<CadLayerManagerRow> & { id: string },
): CadLayerManagerRow {
  return {
    name: overrides.id,
    color: "#ffffff",
    visible: true,
    locked: false,
    linetype: "CONTINUOUS",
    lineweight: -1,
    plot: true,
    objectCount: 0,
    frozen: false,
    frozenInViewport: null,
    active: false,
    ...overrides,
  };
}

const rows: CadLayerManagerRow[] = [
  row({ id: "0", name: "0", objectCount: 12 }),
  row({ id: "Muros", name: "Muros", objectCount: 40, lineweight: 0.5 }),
  row({ id: "Cotas", name: "Cotas", visible: false, objectCount: 7 }),
  row({ id: "Ejes", name: "Ejes", locked: true, linetype: "CENTER" }),
  row({
    id: "Auxiliar",
    name: "Auxiliar",
    plot: false,
    frozenInViewport: true,
  }),
  row({ id: "Muros_Interiores", name: "Muros interiores", objectCount: 3 }),
  row({ id: "MEP", name: "MEP", frozen: true, objectCount: 9 }),
];

const names = (list: readonly CadLayerManagerRow[]) =>
  list.map((entry) => entry.id);

// --- filtro por nombre: subcadena y sin distinguir mayúsculas ----------------
{
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "muros", property: "all" })),
    ["Muros", "Muros_Interiores"],
    "«muros» en minúscula alcanza a «Muros» y a «Muros interiores»",
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "  INTER ", property: "all" })),
    ["Muros_Interiores"],
    "se recorta el espaciado y se busca dentro del nombre, no sólo al principio",
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "nada", property: "all" })),
    [],
  );
  assert.equal(
    filterCadLayerRows(rows, { text: "", property: "all" }).length,
    7,
    "sin filtro salen las siete",
  );
}

// --- filtro por propiedad ----------------------------------------------------
{
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "hidden" })),
    ["Cotas"],
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "locked" })),
    ["Ejes"],
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "noplot" })),
    ["Auxiliar"],
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "empty" })),
    ["Ejes", "Auxiliar"],
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "viewport-frozen" })),
    ["Auxiliar"],
    "una capa sin viewport activo (`null`) NO cuenta como congelada",
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "", property: "frozen" })),
    ["MEP"],
    "congelada A NIVEL DE DOCUMENTO es su propio filtro, distinto del de viewport",
  );
}

// --- los dos filtros se ACUMULAN --------------------------------------------
{
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "muros", property: "used" })),
    ["Muros", "Muros_Interiores"],
  );
  assert.deepEqual(
    names(filterCadLayerRows(rows, { text: "muros", property: "hidden" })),
    [],
    "ninguna capa de muros está oculta: el filtro de nombre no rescata al de propiedad",
  );
}

// --- grosores -----------------------------------------------------------------
{
  assert.equal(describeCadLineweight(-1), "Por defecto");
  assert.equal(describeCadLineweight(0.5), "0.50 mm");
  assert.equal(describeCadLineweight(2), "2.00 mm");
}

// --- el anfitrión: filtros y borradores sin ocupar un useState ----------------
{
  const host = new CadLayerManagerHost();
  const initial = host.getSnapshot();
  assert.equal(
    host.getSnapshot(),
    initial,
    "instantánea estable por identidad",
  );
  host.setFilterText("");
  assert.equal(
    host.getSnapshot(),
    initial,
    "poner lo que ya estaba no publica",
  );
  host.setFilterText("muros");
  assert.notEqual(host.getSnapshot(), initial);
  assert.equal(host.filter.text, "muros");
  host.clearFilter();
  assert.deepEqual(host.filter, { text: "", property: "all" });

  host.setDraftStateName("Impresión");
  assert.equal(host.draftStateName, "Impresión", "el borrador del nombre sí es suyo");
}

console.log(
  "cad layer manager model specs passed: filtros acumulativos por nombre y propiedad, congelada de documento " +
    "y de viewport como filtros distintos, y un anfitrión que sólo guarda filtros y borradores",
);
