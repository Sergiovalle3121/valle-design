/**
 * La vivienda de la demostración, evaluada ENTERA en Node antes de que llegue
 * al navegador: si un muro no cierra o un vano rompe su perfil, aquí se ve con
 * su nombre, no como un grupo vacío en la escena.
 *
 * Lo que se afirma es la GEOMETRÍA, no la estética: cada árbol pasa el
 * validador, cada cuerpo es cerrado y de género conocido, y los volúmenes
 * cuadran con fórmulas cerradas (área de la región × grosor; losa; escalera
 * como suma de prismas; cubierta con `cadRoofVolume`). Los límites del
 * validador de la API (`cad-solid-invariants.ts`) se replican para que la
 * adopción al registrarse no rechace lo que la demo enseña.
 */
import { bodyMassProperties, eulerCounts, validateBody } from "../../brep";
import { serializeCadDocument, type CadDocument, CAD_DOCUMENT_SCHEMA } from "../cad-document";
import { check, checkClose, report } from "../../brep/spec-support";
import { clearSolidCache, evaluateSolidTree, validateSolidTree, CAD_SOLID_MAX_NODES } from "../solid3d-build";
import {
  buildDemoHouse,
  DEMO_HOUSE,
  DEMO_HOUSE_FOOTPRINT,
  DEMO_HOUSE_LEVELS,
  demoHouseSolidCount,
  demoHouseWalls,
  demoRoofVolume,
  demoWallRegionArea,
  demoWallProfile,
} from "./demo-house";

const MAX_PROFILE_POINTS = 20_000;

const house = buildDemoHouse();

check("la vivienda lleva los sólidos anunciados", house.solids.length === demoHouseSolidCount());
check("al menos 20 sólidos: muros de dos plantas, losas, escalera y cubierta", house.solids.length >= 20);

// --- cada árbol es válido, cabe en la API y produce un cuerpo cerrado ------
clearSolidCache();
const started = performance.now();
let totalFaces = 0;
for (const solid of house.solids) {
  const issues = validateSolidTree(solid);
  check(`${solid.id}: árbol sin problemas`, issues.length === 0, issues.map((issue) => issue.message).join(" · "));
  check(`${solid.id}: ≤ ${CAD_SOLID_MAX_NODES} nodos`, solid.nodes.length <= CAD_SOLID_MAX_NODES);
  check(`${solid.id}: lleva nombre y capa 3D`, !!solid.name && solid.layer.startsWith("3D-"));
  for (const node of solid.nodes) {
    if (node.op === "extrude") {
      check(`${solid.id}: perfil ≤ ${MAX_PROFILE_POINTS} puntos`, node.profile.outer.length <= MAX_PROFILE_POINTS);
      for (const ring of node.profile.inners ?? [])
        check(`${solid.id}: agujero ≤ ${MAX_PROFILE_POINTS} puntos`, ring.length <= MAX_PROFILE_POINTS);
    }
  }
  const body = evaluateSolidTree(solid);
  const validation = validateBody(body, { requireClosed: true, requirePlanarFaces: true });
  check(`${solid.id}: cuerpo cerrado y plano`, validation.ok, validation.violations.map((v) => v.message).join(" · "));
  const counts = eulerCounts(body);
  const genus = 1 - counts.characteristic / 2;
  const expectedGenus = solid.nodes.some((node) => node.op === "extrude" && (node.profile.inners?.length ?? 0) > 0)
    ? solid.nodes.reduce((sum, node) => sum + (node.op === "extrude" ? (node.profile.inners?.length ?? 0) : 0), 0)
    : 0;
  checkClose(`${solid.id}: género = agujeros del perfil`, genus, expectedGenus);
  check(`${solid.id}: volumen positivo`, bodyMassProperties(body).volume > 0);
  totalFaces += body.faces.length;
}
const elapsed = performance.now() - started;
console.log(`evaluación de ${house.solids.length} sólidos: ${elapsed.toFixed(1)} ms, ${totalFaces} caras`);
check("la vivienda entera se evalúa en menos de 5 s", elapsed < 5000);

// --- volúmenes contra fórmulas cerradas -------------------------------------
const byId = new Map(house.solids.map((solid) => [solid.id, solid] as const));
const volume = (id: string): number => {
  const solid = byId.get(id);
  if (!solid) throw new Error(`no existe el sólido ${id}`);
  return bodyMassProperties(evaluateSolidTree(solid)).volume;
};
const walls = demoHouseWalls();
for (const wall of [...walls.n1, ...walls.n2]) {
  checkClose(`demo-${wall.id}: volumen = área de la región × grosor`, volume(`demo-${wall.id}`), demoWallRegionArea(wall) * wall.thickness, 1e-3);
  // Vanos dentro del muro, separados de las esquinas y sin solaparse.
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  const sorted = [...wall.openings].sort((a, b) => a.at - b.at);
  sorted.forEach((opening, index) => {
    check(`${wall.id}: vano ${index} a ≥ 100 mm de las esquinas`, opening.at >= 100 && opening.at + opening.width <= length - 100);
    check(`${wall.id}: vano ${index} por debajo del techo`, opening.sill + opening.height <= DEMO_HOUSE.storey - 100);
    const next = sorted[index + 1];
    if (next) check(`${wall.id}: vanos ${index} y ${index + 1} no se solapan`, opening.at + opening.width <= next.at);
  });
  const profile = demoWallProfile(wall, DEMO_HOUSE.storey);
  check(`${wall.id}: el perfil arranca en (0,0) y cierra en (0,H)`, profile.outer[0].x === 0 && profile.outer[0].y === 0 && profile.outer[profile.outer.length - 1].y === DEMO_HOUSE.storey);
}
const slabArea = DEMO_HOUSE.width * DEMO_HOUSE.depth;
checkClose("losa de piso: área × espesor", volume("demo-losa-piso"), slabArea * DEMO_HOUSE.slab, 1e-3);
const well = house.stair.well;
const wellArea = Math.abs(well.reduce((sum, point, index) => {
  const next = well[(index + 1) % well.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);
checkClose("losa de entrepiso: (área − hueco de escalera) × espesor", volume("demo-losa-entrepiso"), (slabArea - wellArea) * DEMO_HOUSE.slab, 1e-3);
check("el hueco de la losa es la huella de la escalera (tramos + descanso)", (() => {
  const { design, layout } = house.stair;
  const run1 = layout.flights[0].run;
  const run2 = layout.flights[1].run;
  const expected = run1 * design.width + design.landing * design.width + design.width * run2;
  return Math.abs(wellArea - expected) < 1e-6;
})());
{
  const { design } = house.stair;
  const prism = (risers: number) => design.width * design.riser * design.tread * ((risers - 1) * risers) / 2;
  checkClose("escalera tramo 1: suma de prismas c·h·(n−1)·n/2 × ancho", volume("demo-escalera-tramo-1"), prism(design.flights[0]), 1e-3);
  checkClose("escalera tramo 2: suma de prismas", volume("demo-escalera-tramo-2"), prism(design.flights[1]), 1e-3);
  checkClose("descanso: fondo × ancho × cota", volume("demo-escalera-descanso-1"), design.landing * design.width * design.flights[0] * design.riser, 1e-3);
  checkClose("la escalera salva exactamente la altura de entrepiso", design.risers * design.riser, DEMO_HOUSE_LEVELS.upper, 1e-9);
  check("contrahuella dentro del reglamento", design.riser <= DEMO_HOUSE.stair.maxRiser + 1e-9);
  check("el hueco cabe en el vestíbulo", well.every((p) => p.x >= 5650 && p.x <= DEMO_HOUSE.width - DEMO_HOUSE.exteriorWall && p.y <= DEMO_HOUSE.depth - DEMO_HOUSE.exteriorWall));
}
checkClose("cubierta: volumen bajo los faldones = cadRoofVolume", volume("demo-cubierta"), demoRoofVolume(), 1e-3);
check("cubierta: nace sobre los muros del nivel 2", house.roof.node.op === "brep" && house.roof.node.points.every((p) => p.z >= DEMO_HOUSE_LEVELS.roof - 1e-9));

// --- planta 2D derivada y capas -----------------------------------------------
const twoD = house.entities.filter((entity) => entity.type !== "solid3d");
check("la planta 2D tiene muros, vanos, cancelería y rótulos", ["MURO", "VANO", "CANCEL", "TEXTO"].every((layer) => twoD.some((entity) => entity.layer === layer)));
check("rótulos de las dos plantas y del modelo", ["PLANTA BAJA", "PLANTA ALTA", "MODELO 3D", "SUBE", "BAJA"].every((text) => twoD.some((entity) => entity.type === "text" && entity.text === text)));
check("ids únicos y con prefijo demo-", new Set(house.entities.map((e) => e.id)).size === house.entities.length && house.entities.every((e) => e.id.startsWith("demo-")));
check("las capas 3D no se imprimen", house.layers.every((layer) => layer.plot === false && layer.id.startsWith("3D-")));
check("todo sólido vive en una capa declarada", house.solids.every((solid) => house.layers.some((layer) => layer.id === solid.layer)));
check("todo cabe en la huella del espacio modelo", house.entities.every((entity) => {
  if (entity.type === "line") return [entity.start, entity.end].every((p) => p.x >= 0 && p.x <= DEMO_HOUSE_FOOTPRINT.width && p.y >= 0 && p.y <= DEMO_HOUSE_FOOTPRINT.height);
  if (entity.type === "polyline") return entity.vertices.every((p) => p.x >= 0 && p.x <= DEMO_HOUSE_FOOTPRINT.width && p.y >= 0 && p.y <= DEMO_HOUSE_FOOTPRINT.height);
  if (entity.type === "text") return entity.x >= 0 && entity.x <= DEMO_HOUSE_FOOTPRINT.width && entity.y >= 0 && entity.y <= DEMO_HOUSE_FOOTPRINT.height;
  return true;
}));

// --- determinismo -------------------------------------------------------------
function asDocument(entities: CadDocument["entities"]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [...house.layers],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}
check("dos construcciones serializan idéntico", serializeCadDocument(asDocument(house.entities)) === serializeCadDocument(asDocument(buildDemoHouse().entities)));

report("demo-house", 120);
