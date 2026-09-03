/**
 * Las tablas de plumas del estudio: que estén, y que se encuentren.
 *
 * Lo que se afirma es lo que cambia para quien traza: que las tres que el
 * producto sabe construir están publicadas con el nombre con el que se conocen,
 * que un nombre tecleado con otra caja o sin extensión las encuentra igual, y
 * que la que NO está sigue diciendo que no está.
 */
import { strict as assert } from "node:assert";
import { cadBuiltinPlotStyleTables, CadPlotStyleCatalog } from "./plot-style-catalog";
import { cadFindPlotStyleTable, createCadColorTable } from "./plot-style-table";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const tablas = cadBuiltinPlotStyleTables();

// --- 1 · las tres, con su nombre de archivo -------------------------------
eq([...tablas.keys()].sort().join(","), "acad.ctb,acad.stb,monochrome.ctb", "las tres tablas del despacho");
eq(tablas.get("acad.ctb")!.kind, "ctb", "acad.ctb es una tabla por COLOR");
eq(tablas.get("acad.stb")!.kind, "stb", "y acad.stb una por NOMBRE");
eq(tablas.get("acad.ctb")!.styles.length, 255, "una CTB lleva los 255 colores");

// --- 2 · la monocroma es la que el despacho espera encontrar hecha --------
{
  const mono = tablas.get("monochrome.ctb")!;
  eq(mono.styles[0].lineweight, 0.25, "el color 1 sale a 0,25 mm");
  eq(mono.styles[3].lineweight, 0.13, "el 4 —ejes y tramas— a 0,13");
  eq(mono.styles[4].lineweight, 0.5, "y el 5 —secciones— a 0,50");
  ok(
    mono.styles.slice(0, 8).every((estilo) => estilo.color === "#000000" || estilo.convertToGrayscale || estilo.color !== null),
    "y todos salen con tinta resuelta, no «la del objeto»",
  );
}

// --- 3 · el nombre se busca como en Windows -------------------------------
for (const nombre of ["monochrome.ctb", "monochrome", "MONOCHROME.CTB", " Monochrome "])
  eq(
    cadFindPlotStyleTable(tablas, nombre)?.name,
    "monochrome",
    `«${nombre}» encuentra la tabla monocroma`,
  );

// --- 4 · pero el nombre EXACTO gana ---------------------------------------
{
  // `acad.ctb` y `acad.stb` sólo se distinguen por la extensión: escribirla
  // tiene que decidir, o elegir una tabla por nombre sería una lotería.
  eq(cadFindPlotStyleTable(tablas, "acad.ctb")!.kind, "ctb", "acad.ctb es la de color");
  eq(cadFindPlotStyleTable(tablas, "acad.stb")!.kind, "stb", "acad.stb es la de nombres");
}

// --- 5 · la que no está sigue sin estar -----------------------------------
eq(cadFindPlotStyleTable(tablas, "Estudio-2004.ctb"), null, "una tabla del despacho no se inventa");
eq(cadFindPlotStyleTable(new Map(), "monochrome"), null, "y sin catálogo no hay nada que encontrar");

// --- 6 · el catálogo de sesión: cargar sustituye y se DICE ----------------
{
  const catalogo = new CadPlotStyleCatalog();
  eq(catalogo.list().join(","), "acad.ctb,acad.stb,monochrome.ctb", "nace con las tres de fábrica");
  eq(catalogo.find("MONOCHROME")?.name, "monochrome", "y las encuentra con la regla de nombre");
  eq(catalogo.load(createCadColorTable("Estudio-2004")), "Estudio-2004.ctb", "cargar devuelve su nombre de archivo");
  eq(catalogo.list().length, 4, "y la del despacho se suma a las de fábrica");
  eq(catalogo.find("estudio-2004.ctb")?.name, "Estudio-2004", "se encuentra como cualquier otra");
  // Cargar un `acad.ctb` propio SUSTITUYE al de fábrica: eso es justo lo que
  // quiere quien lo carga, y `list()` sigue diciendo qué hay.
  catalogo.load(createCadColorTable("acad"));
  eq(catalogo.list().length, 4, "cargar el suyo no duplica la fila");
}

console.log(`plot-style-catalog: ${verdes} comprobaciones verdes`);
