/**
 * SECTIONPLANE tecleado de punta a punta, y la única pregunta que importa:
 * ¿el área de lo que corta es la que dice la geometría, o sólo «salió algo»?
 *
 * La regla de aceptación de esta ola es explícita: «salió un sólido», «volumen
 * > 0» o «no hubo error» NO cuentan — son exactamente las pruebas que dejaban
 * pasar el relleno. Así que cada corte de este archivo se MIDE contra su
 * fórmula: el área de la sección media de un cubo de 100 es 100×100 = 10.000,
 * y la de un cilindro de radio r es π·r², ambas por la ruta REAL del motor de
 * comandos (`CAD_COMMAND_REGISTRY_V2`) y aplicadas por
 * `executeCadEntityCommandBatch`, la única vía de mutación.
 */
import { strict as assert } from "node:assert";
import {
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
} from "../../cad-document";
import { planeOfSectionPlane, type CadSectionPlaneEntity } from "../../cad-entities-section-plane";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { regionArea } from "../../solid3d-adapter";
import { sectionLoopsOfSolid } from "../../solid3d-section";
import { solid3dBody } from "../../solid3d-build";
import { CAD_COMMAND_REGISTRY_V2 } from "../index";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";

// Las implementaciones llegan a demanda en el navegador; un `.spec.ts` se
// carga como CommonJS y no puede esperarlas con `await` de nivel superior.
import "@/lib/cad/engine/all-commands";

const LAYER = "MUROS";

function documentWith(entities: CadEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: LAYER, name: "Muros", color: "#fff", visible: true, locked: false }],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

let idCounter = 0;

function makeContext(document: CadDocument, selection: readonly string[] = []): CadCommandContext {
  return {
    entityIds: document.entities.map((entity) => entity.id),
    entity: (entityId) => document.entities.find((entity) => entity.id === entityId),
    selection,
    activeLayer: LAYER,
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => `sp${++idCounter}`,
  };
}

function run(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): CadCommandResult | undefined {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(name);
  assert.ok(descriptor, `${name} debe estar en el registro del producto`);
  const context = makeContext(document, selection);
  let step = descriptor.begin(context);
  for (const input of inputs) {
    if (step.result) break;
    step = descriptor.step(step.state, input, context);
  }
  return step.result;
}

/** Ejecuta el comando y APLICA su lote: la única ruta de mutación. */
function apply(
  name: string,
  inputs: readonly CadCommandInput[],
  document: CadDocument,
  selection: readonly string[] = [],
): { document: CadDocument; notice: string } {
  const result = run(name, inputs, document, selection);
  assert.ok(result, `${name} no terminó`);
  assert.equal(
    result.kind,
    "document",
    `${name} debía escribir: ${result.kind === "message" ? result.text : result.kind}`,
  );
  if (result.kind !== "document") throw new Error("tipo");
  return {
    document: executeCadEntityCommandBatch(document, result.commands, result.label).document,
    notice: result.notice ?? "",
  };
}

function soleSolid(document: CadDocument) {
  const solids = document.entities.filter((entity) => entity.type === "solid3d");
  assert.equal(solids.length, 1, `se esperaba UN sólido y hay ${solids.length}`);
  const solid = solids[0];
  if (solid.type !== "solid3d") throw new Error("tipo");
  return solid;
}

function regionsOf(document: CadDocument): Extract<CadEntity, { type: "region" }>[] {
  return document.entities.filter((entity): entity is Extract<CadEntity, { type: "region" }> => entity.type === "region");
}

function planesOf(document: CadDocument): CadSectionPlaneEntity[] {
  return document.entities.filter((entity): entity is CadSectionPlaneEntity => entity.type === "sectionplane");
}

const point = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const keyword = (value: string): CadCommandInput => ({ kind: "keyword", keyword: value });
const distance = (value: number): CadCommandInput => ({ kind: "distance", value });
const select = (...ids: string[]): CadCommandInput => ({ kind: "selection", entityIds: ids });
const ENTER: CadCommandInput = { kind: "enter" };

const near = (actual: number, expected: number, what: string, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${what}: ${actual}, se esperaba ${expected} ± ${tolerance}`,
  );

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

/** Rectángulo cerrado como polilínea, que es lo que un usuario dibuja. */
function rectangle(id: string, x: number, y: number, w: number, h: number): CadEntity {
  return {
    id,
    type: "polyline",
    vertices: [
      { x, y, z: 0 },
      { x: x + w, y, z: 0 },
      { x: x + w, y: y + h, z: 0 },
      { x, y: y + h, z: 0 },
    ],
    closed: true,
    layer: LAYER,
  };
}

// ---------------------------------------------------------------------------
// 1. Registro: SECTIONPLANE existe, con sus alias
// ---------------------------------------------------------------------------
{
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SECTIONPLANE");
  ok(descriptor !== undefined, "SECTIONPLANE está en el registro");
  ok(descriptor?.mutates === true, "SECTIONPLANE escribe en el documento");
  ok(CAD_COMMAND_REGISTRY_V2.get("SPLANE")?.name === "SECTIONPLANE", "SPLANE → SECTIONPLANE");
  ok(CAD_COMMAND_REGISTRY_V2.get("PLANOCORTE")?.name === "SECTIONPLANE", "PLANOCORTE → SECTIONPLANE");
}

// ---------------------------------------------------------------------------
// 2. LA MEDIDA QUE IMPORTA: un cubo de 100 por su plano medio da área 10.000
// ---------------------------------------------------------------------------
{
  let doc = documentWith([rectangle("base", 0, 0, 100, 100)]);
  const extruded = apply("EXTRUDE", [select("base"), distance(100)], doc, ["base"]);
  doc = extruded.document;
  const cuboId = soleSolid(doc).id;

  // El sólido llega PREDESIGNADO (semántica PICKFIRST, como las booleanas):
  // Intro cierra la designación sin repetirla, XY a cota 50 —el plano medio
  // de un cubo de 100 mm de alto—, Intro para el semilado por defecto.
  const { document: after, notice } = apply(
    "SECTIONPLANE",
    [ENTER, keyword("XY"), distance(50), ENTER],
    doc,
    [cuboId],
  );

  const planes = planesOf(after);
  ok(planes.length === 1, "SECTIONPLANE deja UN objeto sectionplane");
  const regions = regionsOf(after);
  ok(regions.length === 1, "y UNA región con la sección");

  // La medida: no «salió una región», sino que su ÁREA es la del cuadrado.
  const area = regionArea(regions[0]);
  near(area, 10_000, "el área de la sección media del cubo de 100", 1e-6);
  ok(/1 región/.test(notice), `el aviso cuenta la región: «${notice}»`);

  // La sección vive EXACTAMENTE a z = 50, la cota del corte — si el motor
  // cortara a otra altura, el área podría coincidir por casualidad (un cubo
  // tiene la misma sección a cualquier altura) pero la COTA lo delataría.
  ok(
    regions[0].outer.every((vertex) => Math.abs(vertex.z - 50) < 1e-9),
    "la sección queda a la cota del plano de corte, no a otra",
  );

  // El objeto SECTIONPLANE persistido reproduce el mismo plano: su normal es
  // (0,0,±1) y su origen está a cota 50, como el corte que acaba de hacer.
  const derived = planeOfSectionPlane(planes[0]);
  const normalLength = Math.hypot(derived.normal.x, derived.normal.y, derived.normal.z);
  ok(normalLength > 1e-6, "la normal derivada no es nula");
  const unitZ = Math.abs(derived.normal.z) / normalLength;
  near(unitZ, 1, "la normal del plano persistido es vertical, como XY", 1e-9);
  near(derived.origin.z, 50, "y su origen está a la cota 50", 1e-9);
}

// ---------------------------------------------------------------------------
// 3. Un cilindro de radio 50: área π·50², no una aproximación cualquiera
// ---------------------------------------------------------------------------
{
  let doc = documentWith([]);
  const drawn = apply("CYLINDER", [point(0, 0), distance(50), distance(100)], doc, []);
  doc = drawn.document;
  const cilindroId = soleSolid(doc).id;

  const { document: after } = apply(
    "SECTIONPLANE",
    [ENTER, keyword("XY"), distance(50), ENTER],
    doc,
    [cilindroId],
  );

  const regions = regionsOf(after);
  ok(regions.length === 1, "el cilindro da UNA región de sección");
  const area = regionArea(regions[0]);
  const expected = Math.PI * 50 * 50;
  // El perfil circular del kernel corrige su radio para que el ÁREA del
  // polígono de 48 lados coincida con la del círculo real (`circleProfile`,
  // `matchArea`), así que la sección de un prisma circular no es una
  // aproximación al 1 % — es la misma área hasta el redondeo de coma
  // flotante. Se comprueba con las DOS varas: la tolerancia que pide esta
  // ola (1 %) y la que el kernel promete de verdad (una parte en un millón).
  near(area, expected, "el área de la sección del cilindro se acerca a π·r² al 1 %", expected * 0.01);
  near(area, expected, "y en realidad coincide con π·r² mucho más fino que eso", expected * 1e-6);
}

// ---------------------------------------------------------------------------
// 4. Negación honesta: un plano que no atraviesa el sólido no inventa nada
// ---------------------------------------------------------------------------
{
  let doc = documentWith([rectangle("base", 0, 0, 100, 100)]);
  const extruded = apply("EXTRUDE", [select("base"), distance(100)], doc, ["base"]);
  doc = extruded.document;
  const cuboId = soleSolid(doc).id;

  const { document: after, notice } = apply(
    "SECTIONPLANE",
    [ENTER, keyword("XY"), distance(99_999), ENTER],
    doc,
    [cuboId],
  );
  ok(planesOf(after).length === 1, "el plano SÍ se define, aunque no corte nada");
  ok(regionsOf(after).length === 0, "y NO aparece ninguna región inventada");
  ok(
    /no atraviesa ningún sólido designado/.test(notice),
    `el aviso lo dice con todas las letras: «${notice}»`,
  );
}

// ---------------------------------------------------------------------------
// 5. Sin sólidos designados: SECTIONPLANE define el plano y nada más
// ---------------------------------------------------------------------------
{
  const doc = documentWith([]);
  const { document: after, notice } = apply(
    "SECTIONPLANE",
    [ENTER, keyword("XY"), distance(0), ENTER],
    doc,
  );
  ok(planesOf(after).length === 1, "el plano se crea sin ningún sólido en el documento");
  ok(regionsOf(after).length === 0, "no hay nada que cortar, y no se corta nada");
  ok(!/región/.test(notice), `sin sólidos designados, el aviso no habla de regiones: «${notice}»`);

  // Semilado por defecto: 1.000 mm, como documenta el prompt — se mide en las
  // esquinas del rectángulo persistido, no se da por supuesto.
  const plane = planesOf(after)[0];
  const half = Math.hypot(plane.corners[0].x - plane.corners[2].x, plane.corners[0].y - plane.corners[2].y) / 2;
  near(half, Math.SQRT2 * 1_000, "la diagonal implica un semilado de 1.000 mm por defecto", 1e-6);
}

// ---------------------------------------------------------------------------
// 6. Semilado tecleado a mano: se respeta, no se sustituye por el sugerido
// ---------------------------------------------------------------------------
{
  const doc = documentWith([]);
  const { document: after } = apply(
    "SECTIONPLANE",
    [ENTER, keyword("XY"), distance(0), distance(250)],
    doc,
  );
  const plane = planesOf(after)[0];
  const half = Math.hypot(plane.corners[0].x - plane.corners[2].x, plane.corners[0].y - plane.corners[2].y) / 2;
  near(half, Math.SQRT2 * 250, "el semilado tecleado (250) manda sobre el sugerido", 1e-6);
}

// ---------------------------------------------------------------------------
// 7. REUTILIZAR el plano: es la diferencia con SECTION, y se comprueba de verdad
// ---------------------------------------------------------------------------
{
  // Definir el plano SIN sólidos: sólo el objeto persistido.
  let doc = documentWith([]);
  const withPlane = apply("SECTIONPLANE", [ENTER, keyword("XY"), distance(50), ENTER], doc);
  doc = withPlane.document;
  const plane = planesOf(doc)[0];
  ok(plane !== undefined, "el plano queda persistido, listo para usarse otra vez");

  // Ahora aparece un cubo — el plano NO sabía que este sólido existiría — y se
  // reutiliza para cortarlo, por la MISMA función del núcleo que usa la orden
  // (`sectionLoopsOfSolid`), tomando el plano de la entidad guardada.
  const cubo: CadEntity = {
    id: "cubo-tardio",
    type: "solid3d",
    root: "caja",
    nodes: [{ id: "caja", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } }],
    layer: LAYER,
  };
  const body = solid3dBody(cubo as Extract<CadEntity, { type: "solid3d" }>);
  const loops = sectionLoopsOfSolid(body, planeOfSectionPlane(plane));
  ok(loops.length === 1, "el plano reutilizado SÍ corta el sólido que llegó después");
  const region: Extract<CadEntity, { type: "region" }> = {
    id: "r-tardia",
    type: "region",
    outer: loops[0],
    layer: LAYER,
  };
  near(regionArea(region), 10_000, "y el área que da es la misma que daría SECTIONPLANE de cero", 1e-6);
}

// ---------------------------------------------------------------------------
// 8. Cancelación, y persistencia a través de guardar y reabrir
// ---------------------------------------------------------------------------
{
  const doc = documentWith([]);
  const descriptor = CAD_COMMAND_REGISTRY_V2.get("SECTIONPLANE")!;
  const context = makeContext(doc);
  let step = descriptor.begin(context);
  step = descriptor.step(step.state, { kind: "cancel" }, context);
  ok(
    step.result?.kind === "message" && step.result.text.includes("cancelado"),
    "SECTIONPLANE se cancela limpiamente",
  );

  const { document: after } = apply("SECTIONPLANE", [ENTER, keyword("YZ"), distance(30), ENTER], doc);
  const reopened = migrateCadDocument(parseCadDocument(serializeCadDocument(after)));
  const plane = planesOf(reopened)[0];
  ok(plane !== undefined, "el plano sobrevive a serializar, cerrar y reabrir");
  const derived = planeOfSectionPlane(plane);
  near(derived.origin.x, 30, "y sigue siendo el plano YZ a cota 30", 1e-9);
}

// ---------------------------------------------------------------------------
// 9. El área también se mide bien fuera del plano XY (YZ y vertical inclinado)
//
// Las secciones 2 y 3 sólo cortaron por XY: un plano horizontal cuyos puntos,
// al perder la z, siguen dando el área correcta por pura coincidencia — así
// que por sí solas no demuestran que la MEDIDA sirva para los otros modos que
// el propio prompt de SECTIONPLANE ofrece (YZ, ZX, plano vertical por dos
// puntos). Aquí se corta por YZ y por un plano vertical oblicuo, y el área se
// compara con la fórmula analítica, no con «salió una región».
// ---------------------------------------------------------------------------
{
  let doc = documentWith([rectangle("base", 0, 0, 100, 100)]);
  const extruded = apply("EXTRUDE", [select("base"), distance(100)], doc, ["base"]);
  doc = extruded.document;
  const cuboId = soleSolid(doc).id;

  // Plano YZ a x=50: corta el cubo por su plano medio vertical — un cuadrado
  // de 100×100, igual que la sección 2 pero girado 90°.
  const { document: afterYZ } = apply("SECTIONPLANE", [ENTER, keyword("YZ"), distance(50), ENTER], doc, [cuboId]);
  const regionYZ = regionsOf(afterYZ)[0];
  ok(regionYZ !== undefined, "el corte por YZ SÍ produce una región");
  near(regionArea(regionYZ), 10_000, "y su área es la del cuadrado 100×100, no cero", 1e-6);
  ok(
    regionYZ.outer.every((vertex) => Math.abs(vertex.x - 50) < 1e-9),
    "la sección por YZ queda a x = 50, la cota del corte",
  );

  // Plano vertical por dos puntos NO alineados con los ejes: (20,0)→(80,100).
  // La recta de corte mide √(60² + 100²) dentro de la base, así que la
  // sección es un rectángulo de esa anchura por 100 mm de alto.
  const { document: afterOblicuo } = apply(
    "SECTIONPLANE",
    [ENTER, point(20, 0), point(80, 100), ENTER],
    doc,
    [cuboId],
  );
  const regionOblicua = regionsOf(afterOblicuo)[0];
  ok(regionOblicua !== undefined, "el corte por el plano vertical oblicuo SÍ produce una región");
  const anchoEsperado = Math.hypot(80 - 20, 100 - 0);
  near(regionArea(regionOblicua), anchoEsperado * 100, "y su área es ancho-de-corte × altura, medida contra la fórmula", 1e-6);
}

console.log(
  `✅ section-plane-commands.spec: ${checks} comprobaciones — cubo 100³ → sección 10.000 mm², ` +
    "cilindro r=50 → sección π·50² (al millón, no al 1 %), negación honesta y reutilización real del plano",
);
