/**
 * Filtros de selección, QSELECT y FILTER.
 *
 * ## La afirmación que más importa
 *
 * Que las propiedades filtrables SALGAN DEL REGISTRO. Se comprueba de la única
 * manera que no se cumple de forma vacía: registrando una entidad de un tipo
 * cuyas propiedades este archivo no nombra en ninguna parte —una ELLIPSE— y
 * afirmando que se puede filtrar por `ratio`, que sólo existe en su adaptador.
 * Si algún día alguien sustituye el registro por una lista escrita a mano, esta
 * spec cae.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "../cad-document";
import { CAD_COMMAND_REGISTRY_V2 } from "../engine";
import type {
  CadCommandContext,
  CadCommandInput,
  CadCommandStep,
} from "../engine/command-types";
import { parseCadFilterRules } from "../engine/commands/select-query";
import {
  applyCadSelectionFilter,
  cadEntityMatchesFilter,
  cadFilterableProperties,
  cadWildcardToRegExp,
  CadFilterCatalog,
  readCadFilterProperty,
} from "./selection-filter";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
function sameIds(actual: readonly string[], expected: readonly string[], what: string) {
  checks += 1;
  assert.deepEqual([...actual].sort(), [...expected].sort(), what);
}

const SCENE: CadEntity[] = [
  { id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "MUROS" },
  { id: "l2", type: "line", start: { x: 0, y: 5, z: 0 }, end: { x: 10, y: 5, z: 0 }, layer: "MUROS-INT" },
  {
    id: "l3",
    type: "line",
    start: { x: 0, y: 9, z: 0 },
    end: { x: 10, y: 9, z: 0 },
    layer: "EJES",
    context: { presentation: { color: { source: "explicit", value: "#ff0000" } } },
  },
  { id: "c1", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 3, layer: "MUROS" },
  { id: "c2", type: "circle", center: { x: 20, y: 0, z: 0 }, radius: 12, layer: "EJES" },
  {
    id: "e1",
    type: "ellipse",
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 10, y: 0, z: 0 },
    ratio: 0.5,
    startParameter: 0,
    endParameter: Math.PI * 2,
    layer: "EJES",
  },
];

// ---------------------------------------------------------------------------
// De dónde salen las propiedades
// ---------------------------------------------------------------------------

{
  const properties = cadFilterableProperties(SCENE);
  const names = properties.map((property) => property.name);
  for (const universal of ["type", "layer", "color", "linetype", "lineweight"])
    ok(names.includes(universal), `la propiedad universal ${universal} está siempre`);
  ok(names.includes("radius"), "`radius` sale del adaptador del círculo");
  // La prueba de que NO hay lista escrita a mano: `ratio` es de la elipse y no
  // aparece nombrada en ningún sitio de este subsistema.
  ok(names.includes("ratio"), "`ratio` sale del adaptador de la elipse, no de una lista");
  const ratio = properties.find((property) => property.name === "ratio");
  equal(ratio?.kind, "number", "y el registro dice que es numérica");
  sameIds(ratio?.types ?? [], ["ellipse"], "y de qué tipo procede");

  const empty = cadFilterableProperties([]);
  equal(empty.length, 5, "un dibujo vacío sólo ofrece las cinco universales");
}

equal(readCadFilterProperty(SCENE[0], "type"), "line", "`type` sale de la etiqueta de la unión");
equal(readCadFilterProperty(SCENE[2], "color"), "#ff0000", "el color explícito");
equal(readCadFilterProperty(SCENE[0], "color"), "byLayer", "y el heredado se lee como byLayer");
equal(readCadFilterProperty(SCENE[0], "radius"), undefined, "una LINE no tiene radio");

// ---------------------------------------------------------------------------
// Operadores
// ---------------------------------------------------------------------------

ok(cadWildcardToRegExp("MURO*").test("MUROS-INT"), "el comodín * casa con cualquier cola");
ok(!cadWildcardToRegExp("MURO*").test("TABIQUES"), "y no casa con lo que no empieza igual");
ok(cadWildcardToRegExp("EJE?").test("EJES"), "el ? es exactamente un carácter");
ok(!cadWildcardToRegExp("EJE?").test("EJE"), "y exige que esté");

{
  const rule = { property: "radius", operator: ">" as const, value: "5" };
  ok(cadEntityMatchesFilter(SCENE[4], { entityType: null, rules: [rule], combine: "and" }), "12 > 5");
  ok(!cadEntityMatchesFilter(SCENE[3], { entityType: null, rules: [rule], combine: "and" }), "3 no");
  // Una propiedad AUSENTE no se cumple: no se compara contra un valor inventado.
  ok(
    !cadEntityMatchesFilter(SCENE[0], { entityType: null, rules: [rule], combine: "and" }),
    "una LINE no tiene radio, así que la regla sobre el radio no se cumple",
  );
}

// Los reales se comparan con holgura: una coordenada girada no vale 10 exacto.
{
  const almost: CadEntity = {
    id: "c9",
    type: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 3 + 1e-13,
    layer: "MUROS",
  };
  ok(
    cadEntityMatchesFilter(almost, {
      entityType: null,
      rules: [{ property: "radius", operator: "=", value: "3" }],
      combine: "and",
    }),
    "3 + 1e-13 sigue siendo 3 para un filtro",
  );
}

// AND y OR combinan distinto y se nota.
{
  const rules = [
    { property: "layer", operator: "=" as const, value: "MUROS" },
    { property: "radius", operator: ">" as const, value: "5" },
  ];
  sameIds(
    applyCadSelectionFilter(SCENE, { entityType: null, rules, combine: "and" }).matched,
    [],
    "AND: no hay ningún círculo grande en MUROS",
  );
  sameIds(
    applyCadSelectionFilter(SCENE, { entityType: null, rules, combine: "or" }).matched,
    ["l1", "c1", "c2"],
    "OR: lo de MUROS más el círculo grande",
  );
}

// ---------------------------------------------------------------------------
// Combinar con la selección actual
// ---------------------------------------------------------------------------

{
  const filter = {
    entityType: "line",
    rules: [{ property: "layer", operator: "~" as const, value: "MURO*" }],
    combine: "and" as const,
  };
  sameIds(
    applyCadSelectionFilter(SCENE, filter).selection,
    ["l1", "l2"],
    "reemplazar deja sólo lo que casa",
  );
  sameIds(
    applyCadSelectionFilter(SCENE, filter, { mode: "append", current: ["c2"] }).selection,
    ["c2", "l1", "l2"],
    "añadir conserva lo que ya estaba designado",
  );
  sameIds(
    applyCadSelectionFilter(SCENE, filter, { mode: "exclude", current: ["l1", "l2", "c2"] }).selection,
    ["c2"],
    "excluir quita de la selección lo que casa",
  );
  const scoped = applyCadSelectionFilter(SCENE, filter, { scope: ["l2", "c1"] });
  sameIds(scoped.matched, ["l2"], "acotado a la selección actual, sólo examina eso");
  equal(scoped.examined, 2, "y lo cuenta");
}

// ---------------------------------------------------------------------------
// El analizador de condiciones de FILTER
// ---------------------------------------------------------------------------

{
  const parsed = parseCadFilterRules("type=circle, radius>=5, layer~MURO*");
  equal(parsed.rules.length, 3, "tres condiciones");
  // `>=` antes que `>`: sin ese orden, `radius>=5` daría `radius > "=5"`, que
  // no casa nunca y falla en silencio.
  equal(parsed.rules[1].operator, ">=", "los operadores de dos caracteres ganan");
  equal(parsed.rules[1].value, "5", "y el valor sale limpio");
  equal(parsed.errors.length, 0, "sin errores");

  const bad = parseCadFilterRules("sinoperador, =3");
  equal(bad.rules.length, 0, "nada válido");
  equal(bad.errors.length, 2, "dos errores, cada uno con su causa");
}

// ---------------------------------------------------------------------------
// El catálogo de filtros
// ---------------------------------------------------------------------------

{
  const catalog = new CadFilterCatalog();
  catalog.save({ name: "Muros", entityType: "line", rules: [], combine: "and" });
  catalog.save({ name: "muros", entityType: "circle", rules: [], combine: "and" });
  equal(catalog.list().length, 1, "el nombre no distingue mayúsculas: se sustituye, no se duplica");
  equal(catalog.get("MUROS")?.entityType, "circle", "y gana el último guardado");
  equal(catalog.remove("nada"), false, "borrar lo que no existe se dice con false");
  equal(catalog.remove("Muros"), true, "y lo que existe, con true");
  equal(catalog.list().length, 0, "y desaparece");
}

// ---------------------------------------------------------------------------
// QSELECT y FILTER a través del motor
// ---------------------------------------------------------------------------

function context(overrides: Partial<CadCommandContext> = {}): CadCommandContext {
  const byId = new Map(SCENE.map((entity) => [entity.id, entity]));
  return {
    entityIds: SCENE.map((entity) => entity.id),
    entity: (entityId) => byId.get(entityId),
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "nuevo",
    ...overrides,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  ctx: CadCommandContext = context(),
): CadCommandStep<unknown> {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `el registro conoce ${name}`);
  let step = descriptor.begin(ctx) as CadCommandStep<unknown>;
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state as never, input, ctx) as CadCommandStep<unknown>;
  }
  return step;
}

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });

// Camino feliz: todas las líneas de las capas MURO*, reemplazando.
{
  const step = run("QSELECT", [
    keyword("Dibujo"),
    text("line"),
    text("layer"),
    text("~"),
    text("MURO*"),
    keyword("No"),
    keyword("Reemplazar"),
  ]);
  ok(step.result?.kind === "selection", "QSELECT termina designando");
  if (step.result?.kind === "selection") {
    sameIds(step.result.entityIds, ["l1", "l2"], "las dos líneas de MURO*");
    ok(step.result.text!.includes("2 de 6"), `y dice cuántos examinó: ${step.result.text}`);
  }
}

// Añadir a la selección actual: la mitad del valor de QSELECT.
{
  const step = run(
    "QSELECT",
    [keyword("Dibujo"), text("circle"), text("radius"), text(">"), text("5"), keyword("No"), keyword("Añadir")],
    context({ selection: ["l1"] }),
  );
  if (step.result?.kind === "selection")
    sameIds(step.result.entityIds, ["l1", "c2"], "lo que ya había más lo que casa");
}

// Dos condiciones encadenadas.
{
  const step = run("QSELECT", [
    keyword("Dibujo"),
    text("*"),
    text("layer"),
    text("="),
    text("EJES"),
    keyword("Sí"),
    text("type"),
    text("="),
    text("circle"),
    keyword("No"),
    keyword("Reemplazar"),
  ]);
  if (step.result?.kind === "selection")
    sameIds(step.result.entityIds, ["c2"], "sólo el círculo de EJES");
}

// Rechazos con causa.
{
  const step = run("QSELECT", [keyword("Selección")], context({ selection: [] }));
  ok(
    step.result?.kind === "message" && step.result.text.includes("no hay ninguna selección actual"),
    "acotar a la selección sin selección se rechaza diciéndolo",
  );
}
{
  const step = run("QSELECT", [keyword("Dibujo"), text("*"), text("layer"), text("<>")]);
  ok(
    step.result?.kind === "message" && step.result.text.includes("no es un operador"),
    `un operador inventado se rechaza: ${step.result?.kind === "message" ? step.result.text : ""}`,
  );
}
{
  const step = run("QSELECT", [keyword("Dibujo"), text("*"), text("  ")]);
  ok(
    step.result?.kind === "message" && step.result.text.includes("hace falta una propiedad"),
    "una propiedad vacía se rechaza",
  );
}

// FILTER guarda, aplica y borra.
{
  const catalog = new CadFilterCatalog();
  const ctx = context({ catalogs: { filters: catalog } });
  const saved = run("FILTER", [keyword("Nuevo"), text("CírculosGrandes"), text("type=circle, radius>5")], ctx);
  ok(saved.result?.kind === "selection", "guardar un filtro además lo aplica");
  if (saved.result?.kind === "selection") sameIds(saved.result.entityIds, ["c2"], "y designa lo que casa");
  equal(catalog.list().length, 1, "y queda en el catálogo");

  const applied = run("FILTER", [keyword("Aplicar"), text("círculosgrandes")], ctx);
  ok(applied.result?.kind === "selection", "se puede volver a aplicar por su nombre");

  const missing = run("FILTER", [keyword("Aplicar"), text("NoExiste")], ctx);
  ok(
    missing.result?.kind === "message" && missing.result.text.includes("No hay ningún filtro"),
    "aplicar uno que no existe se dice",
  );

  const listed = run("FILTER", [keyword("Listar")], ctx);
  ok(
    listed.result?.kind === "message" && listed.result.text.includes("CírculosGrandes"),
    "listar los enseña",
  );

  const removed = run("FILTER", [keyword("Borrar"), text("CírculosGrandes")], ctx);
  ok(removed.result?.kind === "message" && removed.result.text.includes("borrado"), "y se borran");
  equal(catalog.list().length, 0, "el catálogo queda vacío");
}

// Sin catálogo, FILTER no finge: lo dice.
{
  const step = run("FILTER", [keyword("Aplicar")]);
  ok(
    step.result?.kind === "message" && step.result.text.includes("catálogo de filtros"),
    "sin catálogo, FILTER explica que no puede en vez de callarse",
  );
}

// Un filtro sin condiciones válidas no se guarda.
{
  const catalog = new CadFilterCatalog();
  const step = run(
    "FILTER",
    [keyword("Nuevo"), text("Vacío"), text("esto no lleva operador")],
    context({ catalogs: { filters: catalog } }),
  );
  ok(
    step.result?.kind === "message" && step.result.text.includes("no se ha guardado"),
    "y se dice por qué",
  );
  equal(catalog.list().length, 0, "el catálogo no lo recoge");
}

console.log(`selection-filter.spec: ${checks} comprobaciones verdes.`);
