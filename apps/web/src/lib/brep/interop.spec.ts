/**
 * Ida y vuelta por STEP e IGES: el sólido que sale tiene que ser el que entró.
 *
 * La prueba fuerte no es "el archivo se escribe". Es que al reimportarlo salga un
 * sólido con LOS MISMOS INVARIANTES y EL MISMO VOLUMEN. Un exportador que emita
 * cada arista dos veces produce un archivo que se abre perfectamente y cuyo
 * reimportado no es una variedad; uno que se equivoque en la orientación de un
 * agujero produce un volumen mayor que el original. Las dos cosas se ven aquí y
 * en ningún otro sitio.
 *
 * Y a la vuelta, el sólido pasa por el MISMO cosido que un sólido recién
 * modelado: si el archivo describe caras del revés, `buildBody` lo rechaza en la
 * importación en lugar de fabricar un cuerpo inválido.
 */
import { exportIges, importIges, parseIges } from "./iges";
import { extrudeProfile, revolveProfile } from "./extrude";
import { booleanDifference } from "./boolean";
import { validateBody } from "./invariants";
import { circleProfile, vec2 } from "./profile";
import { makeBox, makeBoxWithThroughHole, makeTetrahedron } from "./primitives";
import { exportStep, stepExportBlockers } from "./step-export";
import { importStep, parseStepFile } from "./step-import";
import { check, checkClose, checkThrows, report } from "./spec-support";
import { bodyIsClosed, eulerCounts, planarBodyArea, planarBodyVolume, type BrepBody } from "./topology";
import { vec3 } from "./vec3";

const CASES: Array<[string, BrepBody]> = [
  ["caja", makeBox({ min: vec3(-1, -2, -3), max: vec3(4, 5, 6) })],
  ["tetraedro", makeTetrahedron(2)],
  [
    "caja con agujero pasante",
    makeBoxWithThroughHole({ min: vec3(0, 0, 0), max: vec3(10, 10, 4), holeMin: { x: 3, y: 3 }, holeMax: { x: 7, y: 6 } }),
  ],
  ["tubo facetado", revolveProfile({ profile: { outer: [vec2(2, 0), vec2(5, 0), vec2(5, 3), vec2(2, 3)] }, segments: 12 })],
  [
    "placa taladrada por una booleana",
    booleanDifference(
      makeBox({ min: vec3(-3, -3, 0), max: vec3(3, 3, 2) }),
      extrudeProfile({ profile: { outer: circleProfile(1.5, 12) }, height: 6, frame: undefined }),
    ),
  ],
];

// --- STEP ------------------------------------------------------------------
for (const [name, body] of CASES) {
  const text = exportStep(body, { timestamp: "2026-01-01T00:00:00", name: name.replace(/\s/g, "_") });
  check(`${name}: el STEP empieza por ISO-10303-21`, text.startsWith("ISO-10303-21;"));
  check(`${name}: y termina por END-ISO-10303-21`, text.trimEnd().endsWith("END-ISO-10303-21;"));
  check(`${name}: contiene un MANIFOLD_SOLID_BREP`, text.includes("MANIFOLD_SOLID_BREP"));

  // Cada arista del B-rep produce UNA sola EDGE_CURVE. Si salieran dos, el
  // archivo se abriría igual y el sólido reimportado no sería una variedad.
  const edgeCurves = (text.match(/EDGE_CURVE/g) ?? []).length;
  check(`${name}: ${body.edges.length} aristas → ${body.edges.length} EDGE_CURVE`, edgeCurves === body.edges.length, `${edgeCurves}`);
  const orientedEdges = (text.match(/ORIENTED_EDGE/g) ?? []).length;
  check(`${name}: y ${body.halfEdges.length} ORIENTED_EDGE (una por media-arista)`, orientedEdges === body.halfEdges.length, `${orientedEdges}`);

  const roundTrip = importStep(text);
  const validation = validateBody(roundTrip.body, { requireClosed: true });
  check(`${name}: el reimportado es válido`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  check(`${name}: y cerrado`, bodyIsClosed(roundTrip.body));
  checkClose(`${name}: mismo volumen`, planarBodyVolume(roundTrip.body), planarBodyVolume(body), 1e-9);
  checkClose(`${name}: misma área`, planarBodyArea(roundTrip.body), planarBodyArea(body), 1e-9);
  check(
    `${name}: mismo género`,
    eulerCounts(roundTrip.body).genus === eulerCounts(body).genus,
    `${eulerCounts(roundTrip.body).genus} vs ${eulerCounts(body).genus}`,
  );
  check(
    `${name}: misma característica de Euler`,
    eulerCounts(roundTrip.body).characteristic === eulerCounts(body).characteristic,
  );
}

// --- El analizador de la parte 21, en sus casos difíciles -----------------
{
  const text = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
    "ENDSEC;",
    "DATA;",
    "/* un comentario que parte la línea */",
    "#1 = CARTESIAN_POINT('con ''apóstrofos'' dentro',(1.,2.,3.));",
    "#2 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );",
    "#3 = ORIENTED_EDGE('',*,*,#1,.F.);",
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
  const file = parseStepFile(text);
  check("el analizador lee el esquema de la cabecera", file.schema === "AUTOMOTIVE_DESIGN", file.schema);
  check("y las tres instancias", file.instances.size === 3, `${file.instances.size}`);
  const point = file.instances.get(1);
  check(
    "los apóstrofos duplicados dentro de una cadena NO la cortan",
    point?.args[0]?.kind === "string" && point.args[0].value === "con 'apóstrofos' dentro",
    JSON.stringify(point?.args[0]),
  );
  const complex = file.instances.get(2);
  check("una entidad compleja se descompone en partes", (complex?.parts.length ?? 0) === 3, `${complex?.parts.length}`);
  check("con sus tipos", complex?.parts.map((part) => part.type).join(",") === "LENGTH_UNIT,NAMED_UNIT,SI_UNIT");
  const oriented = file.instances.get(3);
  check("los argumentos derivados `*` se conservan en su posición", oriented?.args[1]?.kind === "derived");
  check("de modo que la arista sigue siendo el argumento 3", oriented?.args[3]?.kind === "ref");
  check("y la orientación el 4", oriented?.args[4]?.kind === "enum" && oriented.args[4].value === "F");
}
checkThrows("un archivo sin sección DATA se rechaza", () => parseStepFile("hola"));
checkThrows("un STEP sin MANIFOLD_SOLID_BREP se rechaza", () =>
  importStep("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1 = CARTESIAN_POINT('',(0.,0.,0.));\nENDSEC;\nEND-ISO-10303-21;"),
);
{
  const blockers = stepExportBlockers(makeBox({ min: vec3(0, 0, 0), max: vec3(1, 1, 1) }));
  check("una caja no tiene impedimentos para exportarse", blockers.length === 0, blockers.join(" | "));
}
{
  // AP203 y AP214 sólo se diferencian en el esquema declarado; la geometría es
  // la misma, y eso se comprueba en vez de suponerse.
  const body = makeBox({ min: vec3(0, 0, 0), max: vec3(1, 2, 3) });
  const ap203 = exportStep(body, { schema: "AP203", timestamp: "2026-01-01T00:00:00" });
  const ap214 = exportStep(body, { schema: "AP214", timestamp: "2026-01-01T00:00:00" });
  check("AP203 declara CONFIG_CONTROL_DESIGN", ap203.includes("CONFIG_CONTROL_DESIGN"));
  check("AP214 declara AUTOMOTIVE_DESIGN", ap214.includes("AUTOMOTIVE_DESIGN"));
  checkClose("y los dos reimportan el mismo volumen", planarBodyVolume(importStep(ap203).body), 6, 1e-12);
  checkClose("los dos", planarBodyVolume(importStep(ap214).body), 6, 1e-12);
}
{
  // La exportación es DETERMINISTA con la misma marca de tiempo: es lo que
  // permite comparar archivos byte a byte en un test de regresión.
  const body = makeTetrahedron(1);
  const first = exportStep(body, { timestamp: "2026-01-01T00:00:00" });
  const second = exportStep(body, { timestamp: "2026-01-01T00:00:00" });
  check("dos exportaciones idénticas dan el mismo texto", first === second);
}

// --- IGES ------------------------------------------------------------------
for (const [name, body] of CASES) {
  const text = exportIges(body, { name: "PIEZA" });
  const lines = text.split("\n").filter(Boolean);
  const wrongWidth = lines.filter((line) => line.length !== 80);
  check(`${name}: todas las líneas IGES miden 80 columnas`, wrongWidth.length === 0, `${wrongWidth.length} no las miden`);
  const sections = new Set(lines.map((line) => line[72]));
  check(`${name}: están las cinco secciones`, ["S", "G", "D", "P", "T"].every((letter) => sections.has(letter)), [...sections].join(""));
  check(`${name}: la última línea es la de terminación`, lines[lines.length - 1][72] === "T");

  const parsed = parseIges(text);
  const trimmed = [...parsed.entities.values()].filter((entity) => entity.type === 144);
  check(`${name}: una superficie recortada por cara`, trimmed.length === body.faces.length, `${trimmed.length} vs ${body.faces.length}`);
  // Todos los punteros del directorio son IMPARES: cada entrada ocupa 2 líneas.
  const evenPointers = [...parsed.entities.keys()].filter((pointer) => pointer % 2 === 0);
  check(`${name}: todos los punteros de directorio son impares`, evenPointers.length === 0, `${evenPointers.length} pares`);

  const roundTrip = importIges(text);
  const validation = validateBody(roundTrip.body, { requireClosed: true });
  check(`${name}: el IGES reimportado es válido`, validation.ok, validation.violations.map((v) => v.message).join(" | "));
  checkClose(`${name}: mismo volumen por IGES`, planarBodyVolume(roundTrip.body), planarBodyVolume(body), 1e-9);
  check(
    `${name}: mismo género por IGES`,
    eulerCounts(roundTrip.body).genus === eulerCounts(body).genus,
    `${eulerCounts(roundTrip.body).genus} vs ${eulerCounts(body).genus}`,
  );
}
checkThrows("un IGES sin superficies recortadas se rechaza", () => importIges("S      1\n"));
{
  // Los agujeros viajan como contornos interiores del Tipo 144, y el recuento
  // tiene que cuadrar: dos tapas con un agujero cada una.
  const holed = makeBoxWithThroughHole({
    min: vec3(0, 0, 0),
    max: vec3(10, 10, 4),
    holeMin: { x: 3, y: 3 },
    holeMax: { x: 7, y: 6 },
  });
  const parsed = parseIges(exportIges(holed));
  const withInners = [...parsed.entities.values()].filter((entity) => entity.type === 144 && Number(entity.parameters[2]) > 0);
  check("dos caras del sólido llevan contorno interior", withInners.length === 2, `${withInners.length}`);
}

// --- Ida y vuelta CRUZADA: STEP → IGES → STEP -----------------------------
{
  const original = CASES[2][1];
  const viaStep = importStep(exportStep(original, { timestamp: "2026-01-01T00:00:00" })).body;
  const viaIges = importIges(exportIges(viaStep)).body;
  const back = importStep(exportStep(viaIges, { timestamp: "2026-01-01T00:00:00" })).body;
  const validation = validateBody(back, { requireClosed: true, expectedGenus: 1 });
  check("tras STEP → IGES → STEP el sólido sigue siendo válido", validation.ok, validation.violations.map((v) => v.message).join(" | "));
  checkClose("y conserva el volumen", planarBodyVolume(back), planarBodyVolume(original), 1e-9);
  check("y el género", eulerCounts(back).genus === 1, `${eulerCounts(back).genus}`);
}

report("brep/interop", 80);
