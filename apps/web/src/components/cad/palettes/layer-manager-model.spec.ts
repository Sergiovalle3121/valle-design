/**
 * Gestor de propiedades de capa: filtros y estados de capa.
 *
 * Anclas absolutas: qué capas concretas sobreviven a cada filtro y qué parches
 * concretos salen al restaurar un estado. Una propiedad de ida y vuelta
 * («guardar y restaurar deja el dibujo igual») se cumpliría de forma VACÍA con
 * un `planCadLayerStateRestore` que devolviera siempre cero parches, que es
 * justo el fallo que este repositorio ya se comió una vez.
 *
 * Correr:  npx tsx src/components/cad/palettes/layer-manager-model.spec.ts
 */
import { strict as assert } from "node:assert";
import { CadLayerManagerHost } from "./layer-manager-host";
import {
  captureCadLayerState,
  describeCadLineweight,
  filterCadLayerRows,
  planCadLayerStateRestore,
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
    6,
    "sin filtro salen las seis",
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

// --- capturar un estado toma TODAS las capas --------------------------------
{
  const filtered = filterCadLayerRows(rows, { text: "muros", property: "all" });
  const partial = captureCadLayerState("Sólo muros", filtered);
  assert.deepEqual(Object.keys(partial.entries).sort(), [
    "Muros",
    "Muros_Interiores",
  ]);
  const full = captureCadLayerState("  Impresión  ", rows);
  assert.equal(full.name, "Impresión", "el nombre se recorta");
  assert.equal(Object.keys(full.entries).length, 6);
  assert.deepEqual(full.entries.Muros, {
    visible: true,
    locked: false,
    color: "#ffffff",
    linetype: "CONTINUOUS",
    lineweight: 0.5,
    plot: true,
  });
}

// --- restaurar emite SÓLO lo que difiere ------------------------------------
{
  const saved = captureCadLayerState("Impresión", rows);
  const unchanged = planCadLayerStateRestore(saved, rows);
  assert.deepEqual(
    unchanged.patches,
    [],
    "restaurar el estado en el que ya se está no ensucia el documento ni añade un paso de deshacer vacío",
  );

  const moved = rows.map((entry) =>
    entry.id === "Cotas"
      ? { ...entry, visible: true, color: "#ff0000" }
      : entry.id === "Ejes"
        ? { ...entry, locked: false }
        : entry,
  );
  const plan = planCadLayerStateRestore(saved, moved);
  assert.deepEqual(
    plan.patches,
    [
      { id: "Cotas", patch: { visible: false, color: "#ffffff" } },
      { id: "Ejes", patch: { locked: true } },
    ],
    "dos capas cambiadas, dos parches, y sólo con los campos que cambiaron",
  );
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.unknown, []);
}

// --- capas nacidas después del estado se dejan en paz ------------------------
{
  const saved = captureCadLayerState("Antes", [rows[0], rows[1]]);
  const later = [...rows.slice(0, 2), row({ id: "Nueva", visible: false })];
  const plan = planCadLayerStateRestore(saved, later);
  assert.deepEqual(
    plan.patches,
    [],
    "nada que cambiar en las dos que sí recuerda",
  );
  assert.deepEqual(
    plan.unknown,
    ["Nueva"],
    "y la nueva se informa en vez de esconderse: el estado no dice nada de ella",
  );
}

// --- capas borradas desde que se guardó el estado ----------------------------
{
  const saved = captureCadLayerState("Antes", rows);
  const plan = planCadLayerStateRestore(saved, rows.slice(0, 2));
  assert.deepEqual(plan.missing.sort(), [
    "Auxiliar",
    "Cotas",
    "Ejes",
    "Muros_Interiores",
  ]);
  assert.deepEqual(plan.patches, []);
}

// --- grosores -----------------------------------------------------------------
{
  assert.equal(describeCadLineweight(-1), "Por defecto");
  assert.equal(describeCadLineweight(0.5), "0.50 mm");
  assert.equal(describeCadLineweight(2), "2.00 mm");
}

// --- el anfitrión: filtros y estados sin ocupar un useState -------------------
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

  host.saveState(captureCadLayerState("A", rows));
  host.saveState(captureCadLayerState("B", rows));
  assert.deepEqual(
    host.states.map((state) => state.name),
    ["A", "B"],
  );
  const replaced = captureCadLayerState("A", rows.slice(0, 1));
  host.saveState(replaced);
  assert.deepEqual(
    host.states.map((state) => state.name),
    ["A", "B"],
    "un nombre repetido SUSTITUYE en su sitio en vez de duplicar",
  );
  assert.deepEqual(Object.keys(host.findState("A")!.entries), ["0"]);
  host.deleteState("A");
  assert.deepEqual(
    host.states.map((state) => state.name),
    ["B"],
  );
  assert.equal(host.findState("A"), null);
  host.saveState(captureCadLayerState("   ", rows));
  assert.equal(host.states.length, 1, "un estado sin nombre no se guarda");
}

console.log(
  "cad layer manager model specs passed: filtros acumulativos por nombre y propiedad, estados que capturan las 6 capas y restauran sólo los 2 parches que difieren, y capas nuevas/borradas informadas en vez de silenciadas",
);
