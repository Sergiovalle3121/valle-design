/**
 * El sólido B-rep como ENTIDAD del documento.
 *
 * Lo que se comprueba aquí no es que el kernel funcione —para eso están los diez
 * specs de `lib/brep/`— sino que el kernel esté ENCHUFADO: que un árbol de
 * construcción persistido produzca el mismo sólido, que las cuentas de
 * Euler-Poincaré sobrevivan a cada operación, que el volumen coincida por los
 * DOS caminos independientes, y que las reglas de reflexión estén realmente
 * ejecutándose y no cumpliéndose de forma vacía.
 *
 * ## Por qué hay anclas absolutas y no sólo idas y vueltas
 *
 * Espejar dos veces devuelve el original TANTO SI se invierten las caras COMO SI
 * no: la propiedad de ida y vuelta pasa con la regla implementada y sin ella.
 * Por eso cada regla de reflexión se fija además con un número concreto —el
 * volumen sale POSITIVO, el área con signo del contorno sigue siendo POSITIVA—
 * que sólo se cumple si el código hizo el trabajo.
 *
 * ## Los dos caminos del volumen
 *
 * `compareMassProperties` integra sobre las caras planas del B-rep y suma sobre
 * los triángulos de la malla teselada. Son dos algoritmos distintos sobre dos
 * representaciones distintas; que coincidan hasta el ruido de coma flotante es
 * la comprobación más fuerte que este subsistema puede hacerse a sí mismo.
 */
import {
  eulerCounts,
  makeBoxWithThroughHole,
  validateBody,
} from "../brep";
import { check, checkClose, report } from "../brep/spec-support";
import type { CadRegionEntity, CadSolid3dEntity } from "./cad-entities-v5";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import { regionArea, ringSignedArea } from "./solid3d-adapter";
import {
  bodyToSolidNode,
  clearSolidCache,
  evaluateSolidTree,
  solid3dBody,
  solid3dMassComparison,
  solid3dMassProperties,
  validateSolidTree,
} from "./solid3d-build";
import { parseCadDocument, serializeCadDocument, type CadDocument } from "./cad-document";

const layer = "0";

function solid(id: string, nodes: CadSolid3dEntity["nodes"], root: string): CadSolid3dEntity {
  return { id, type: "solid3d", nodes, root, layer };
}

/** Caja 0..w × 0..d × 0..h por extrusión de su rectángulo de base. */
function extrudedBox(id: string, w: number, d: number, h: number): CadSolid3dEntity {
  return solid(
    id,
    [
      {
        id: "perfil",
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: d },
            { x: 0, y: d },
          ],
        },
        height: h,
      },
    ],
    "perfil",
  );
}

// ---------------------------------------------------------------------------
// 1. Euler-Poincaré: la identidad de un sólido
// ---------------------------------------------------------------------------
{
  const cube = extrudedBox("cubo", 10, 10, 10);
  const counts = eulerCounts(solid3dBody(cube));
  check("cubo V=8", counts.vertices === 8, `V=${counts.vertices}`);
  check("cubo E=12", counts.edges === 12, `E=${counts.edges}`);
  check("cubo F=6", counts.faces === 6, `F=${counts.faces}`);
  check("cubo χ=2", counts.characteristic === 2, `χ=${counts.characteristic}`);
  check("cubo género 0", counts.genus === 0, `G=${counts.genus}`);

  // Un agujero pasante baja la característica a 0 y sube el género a 1. El
  // detalle que se salta todo el mundo es que `V − E + F` a secas vale 2 también
  // aquí: hay que restar los lazos interiores. `eulerCounts` ya lo hace.
  const holed = solid(
    "perforado",
    [bodyToSolidNode(makeBoxWithThroughHole({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 },
      holeMin: { x: 3, y: 3 },
      holeMax: { x: 7, y: 7 },
    }), "n")],
    "n",
  );
  const holedCounts = eulerCounts(solid3dBody(holed));
  check("cubo perforado χ=0", holedCounts.characteristic === 0, `χ=${holedCounts.characteristic}`);
  check("cubo perforado género 1", holedCounts.genus === 1, `G=${holedCounts.genus}`);
}

// ---------------------------------------------------------------------------
// 2. Volumen por DOS caminos, y contra el valor cerrado
// ---------------------------------------------------------------------------
{
  const block = extrudedBox("bloque", 400, 300, 200);
  const comparison = solid3dMassComparison(block);
  checkClose("volumen por caras = 400·300·200", comparison.byFaces.volume, 24_000_000, 1e-3);
  checkClose("volumen por malla = 400·300·200", comparison.byMesh.volume, 24_000_000, 1e-3);
  check(
    "los dos caminos del volumen coinciden",
    comparison.volumeDrift < 1e-9,
    `deriva ${comparison.volumeDrift.toExponential(3)}`,
  );
  check(
    "los dos caminos del área coinciden",
    comparison.areaDrift < 1e-9,
    `deriva ${comparison.areaDrift.toExponential(3)}`,
  );
  // 2(400·300 + 300·200 + 200·400) = 2(120000 + 60000 + 80000) = 520000
  checkClose("área de la caja", comparison.byFaces.area, 520_000, 1e-3);
}

// ---------------------------------------------------------------------------
// 3. Corpus adversarial de booleanas
// ---------------------------------------------------------------------------
{
  // (a) Dos cajas que se tocan EXACTAMENTE en una cara. Es el caso que rompe las
  //     implementaciones ingenuas: la cara compartida está a la vez «dentro» y
  //     «fuera» y un clasificador sin tolerancia la duplica o la pierde.
  const touching = solid(
    "tocante",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      { id: "b", op: "box", min: { x: 10, y: 0, z: 0 }, max: { x: 20, y: 10, z: 10 } },
      { id: "u", op: "union", operands: ["a", "b"] },
    ],
    "u",
  );
  const touchingMass = solid3dMassProperties(touching);
  checkClose("unión de cajas que se tocan en una cara: volumen 2000", touchingMass.volume, 2_000, 1e-6);
  check(
    "la unión sigue siendo un sólido cerrado y válido",
    validateBody(solid3dBody(touching), { requireClosed: true, requirePlanarFaces: true }).ok,
  );
  // La cara compartida DESAPARECE: si sobreviviera, el área sería 1200 en vez de
  // 1000 y el sólido tendría una pared interior invisible.
  checkClose("la cara compartida no queda dentro del sólido", touchingMass.area, 1_000, 1e-6);

  // (b) Caras COPLANARIAS que se solapan parcialmente.
  const coplanar = solid(
    "coplanar",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      { id: "b", op: "box", min: { x: 5, y: 0, z: 10 }, max: { x: 15, y: 10, z: 20 } },
      { id: "u", op: "union", operands: ["a", "b"] },
    ],
    "u",
  );
  checkClose("unión con caras coplanarias: volumen 2000", solid3dMassProperties(coplanar).volume, 2_000, 1e-6);

  // (c) Caras CURVAS tangentes. El kernel es facetado, así que «dos cilindros
  //     tangentes» son dos prismas que se rozan por una generatriz — y el
  //     resultado de unirlos NO es un sólido: la arista compartida tendría
  //     cuatro caras y el cuerpo se pellizca sobre sí mismo. La respuesta
  //     correcta es NEGARSE, no devolver una topología plausible que reviente
  //     dos operaciones después, y eso es lo que se fija aquí.
  const cylinderProfile = {
    outer: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 20 },
      { x: 0, y: 20 },
    ],
  };
  const pinched = solid(
    "tangente-exacta",
    [
      { id: "c1", op: "revolve", profile: cylinderProfile, segments: 16 },
      {
        id: "c2",
        op: "revolve",
        profile: cylinderProfile,
        segments: 16,
        // A 10 unidades: los dos prismas comparten exactamente la generatriz
        // x = 5, que es el caso de tangencia pura.
        frame: { origin: { x: 10, y: 0, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } },
      },
      { id: "u", op: "union", operands: ["c1", "c2"] },
    ],
    "u",
  );
  let pinchRejected = false;
  try {
    evaluateSolidTree(pinched);
  } catch {
    pinchRejected = true;
  }
  check("dos prismas tangentes por una generatriz se rechazan: la unión sería no-variedad", pinchRejected);

  // Y con un solapamiento mínimo —el caso que sí es un sólido— la unión tiene
  // que salir válida y con el volumen coincidiendo por los dos caminos.
  const overlapping = solid(
    "tangente-solapada",
    [
      { id: "c1", op: "revolve", profile: cylinderProfile, segments: 16 },
      {
        id: "c2",
        op: "revolve",
        profile: cylinderProfile,
        segments: 16,
        frame: { origin: { x: 9, y: 0, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } },
      },
      { id: "u", op: "union", operands: ["c1", "c2"] },
    ],
    "u",
  );
  const overlapComparison = solid3dMassComparison(overlapping);
  check(
    "dos prismas que se solapan se unen en un sólido válido",
    validateBody(solid3dBody(overlapping), { requireClosed: true }).ok,
  );
  check(
    "y su volumen coincide por los dos caminos",
    overlapComparison.volumeDrift < 1e-9,
    `deriva ${overlapComparison.volumeDrift.toExponential(3)}`,
  );

  // (d) Resta que atraviesa de lado a lado: el resultado tiene género 1.
  const drilled = solid(
    "taladrado",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 20, z: 20 } },
      { id: "b", op: "box", min: { x: 8, y: 8, z: -5 }, max: { x: 12, y: 12, z: 25 } },
      { id: "d", op: "subtract", operands: ["a", "b"] },
    ],
    "d",
  );
  const drilledMass = solid3dMassProperties(drilled);
  // 20³ − 4·4·20 = 8000 − 320 = 7680
  checkClose("resta pasante: volumen 7680", drilledMass.volume, 7_680, 1e-6);
  check(
    "el taladro deja un sólido de género 1",
    eulerCounts(solid3dBody(drilled)).genus === 1,
    `G=${eulerCounts(solid3dBody(drilled)).genus}`,
  );

  // (e) Intersección de dos cuerpos DISJUNTOS: resultado vacío. No es un caso
  //     raro que haya que tolerar; es un error del usuario y hay que decírselo.
  const empty = solid(
    "vacia",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      { id: "b", op: "box", min: { x: 10, y: 10, z: 10 }, max: { x: 11, y: 11, z: 11 } },
      { id: "i", op: "intersect", operands: ["a", "b"] },
    ],
    "i",
  );
  let rejected = false;
  try {
    evaluateSolidTree(empty);
  } catch {
    rejected = true;
  }
  check("la intersección vacía se rechaza en vez de devolver un cuerpo roto", rejected);
}

// ---------------------------------------------------------------------------
// 4. Reflexión: ANCLA absoluta, no sólo ida y vuelta
// ---------------------------------------------------------------------------
{
  const adapter = CAD_ENTITY_REGISTRY.adapter(extrudedBox("espejo", 10, 20, 30));
  const original = extrudedBox("espejo", 10, 20, 30);
  const volume = solid3dMassProperties(original).volume;
  checkClose("volumen del original", volume, 6_000, 1e-6);

  const mirrored = adapter.commands.transform(original, {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } },
  }) as CadSolid3dEntity;

  // ANCLA. Sin invertir las caras el volumen saldría −6000: la reflexión cambia
  // la lateralidad del espacio y todas las normales pasan a apuntar hacia
  // dentro. El sólido se vería negro en el visor y cualquier booleana posterior
  // devolvería el complementario.
  checkClose("el sólido espejado conserva volumen POSITIVO", solid3dMassProperties(mirrored).volume, 6_000, 1e-6);
  check(
    "y sigue siendo un sólido válido y cerrado",
    validateBody(solid3dBody(mirrored), { requireClosed: true, requirePlanarFaces: true }).ok,
  );
  // Segunda ancla: la geometría está realmente al otro lado del eje.
  const bounds = adapter.bounds.bounds(mirrored);
  checkClose("la caja espejada está en x negativo", bounds.maxX, 0, 1e-9);
  checkClose("y llega hasta −10", bounds.minX, -10, 1e-9);

  // Complemento: espejar dos veces devuelve el original. Por sí sola esta
  // propiedad se cumpliría también SIN la inversión de caras, y por eso no es la
  // prueba principal.
  const back = adapter.commands.transform(mirrored, {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } },
  }) as CadSolid3dEntity;
  checkClose("espejar dos veces devuelve el volumen de partida", solid3dMassProperties(back).volume, 6_000, 1e-6);
  checkClose("y la posición de partida", adapter.bounds.bounds(back).maxX, 10, 1e-9);
}

// ---------------------------------------------------------------------------
// 5. REGION: la reflexión invierte los anillos
// ---------------------------------------------------------------------------
{
  const region: CadRegionEntity = {
    id: "r1",
    type: "region",
    outer: [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 50, z: 0 },
      { x: 0, y: 50, z: 0 },
    ],
    inners: [
      [
        { x: 20, y: 10, z: 0 },
        { x: 20, y: 40, z: 0 },
        { x: 40, y: 40, z: 0 },
        { x: 40, y: 10, z: 0 },
      ],
    ],
    layer,
  };
  const adapter = CAD_ENTITY_REGISTRY.adapter(region);
  checkClose("área neta de la región = 5000 − 600", regionArea(region), 4_400, 1e-9);
  check("el contorno exterior nace antihorario", ringSignedArea(region.outer) > 0);

  const mirrored = adapter.commands.transform(region, {
    mirror: { point: { x: 0, y: 0 }, direction: { x: 0, y: 1 } },
  }) as CadRegionEntity;

  // ANCLA. Sin invertir los anillos el área con signo saldría NEGATIVA y todo lo
  // que consuma la región después —EXTRUDE, REVOLVE— la tomaría por un agujero.
  check(
    "la región espejada conserva el contorno antihorario",
    ringSignedArea(mirrored.outer) > 0,
    `área con signo ${ringSignedArea(mirrored.outer)}`,
  );
  check("y el agujero sigue siendo horario", ringSignedArea(mirrored.inners![0]) < 0);
  checkClose("el área neta no cambia al espejar", regionArea(mirrored), 4_400, 1e-9);
  checkClose("y la geometría está al otro lado", adapter.bounds.bounds(mirrored).minX, -100, 1e-9);
}

// ---------------------------------------------------------------------------
// 6. El adaptador cumple el contrato del registro
// ---------------------------------------------------------------------------
{
  const block = extrudedBox("contrato", 100, 200, 300);
  const adapter = CAD_ENTITY_REGISTRY.adapter(block);
  check("el registro reclama el SOLID3D", CAD_ENTITY_REGISTRY.supports(block));

  const bounds = adapter.bounds.bounds(block);
  check(
    "la caja envolvente es FINITA: `CadSpatialIndex` se cuelga con un infinito",
    [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite),
  );
  checkClose("y es la proyección exacta de la caja 3D", bounds.maxX, 100, 1e-9);
  checkClose("en Y también", bounds.maxY, 200, 1e-9);

  check("se pincha por dentro", adapter.hitTester.hitTest(block, { x: 50, y: 100 }, 1));
  check("y no se pincha fuera", !adapter.hitTester.hitTest(block, { x: 500, y: 100 }, 1));
  check("una ventana que lo contiene lo designa", adapter.hitTester.intersectsWindow(block, { minX: -10, minY: -10, maxX: 210, maxY: 310 }, false));

  const grips = adapter.grips.grips(block);
  check("hay grip de punto base", grips.some((grip) => grip.id === "base"));
  const moved = adapter.grips.moveGrip(block, "base", { x: 1_000, y: 2_000 }) as CadSolid3dEntity;
  checkClose("mover el grip base traslada el sólido", adapter.bounds.bounds(moved).minX, 1_000, 1e-9);
  checkClose("sin reevaluar el árbol: el volumen es el mismo", solid3dMassProperties(moved).volume, 6_000_000, 1e-3);

  const properties = adapter.properties.read(block);
  check("las propiedades publican el volumen", typeof properties.volume === "number");
  check("el árbol se declara válido", properties.valid === true);
  const renamed = adapter.properties.write(block, { name: "Zócalo", layer: "MUROS" }) as CadSolid3dEntity;
  check("se puede renombrar", renamed.name === "Zócalo");
  check("y cambiar de capa", renamed.layer === "MUROS");

  check("los snaps incluyen los vértices proyectados", adapter.snaps.snaps(block).length > 4);
}

// ---------------------------------------------------------------------------
// 7. Un árbol roto se RECHAZA, no se arregla
// ---------------------------------------------------------------------------
{
  const broken = solid(
    "roto",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      { id: "u", op: "union", operands: ["a", "fantasma"] },
    ],
    "u",
  );
  const issues = validateSolidTree(broken);
  check("una referencia rota se detecta", issues.some((issue) => issue.code === "broken-reference"));
  check("y nombra el nodo culpable", issues[0].message.includes("fantasma"));

  const cyclic = solid(
    "ciclo",
    [
      { id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      { id: "u", op: "union", operands: ["a", "v"] },
      { id: "v", op: "union", operands: ["a", "u"] },
    ],
    "u",
  );
  check("un ciclo se detecta antes de colgar el hilo", validateSolidTree(cyclic).some((issue) => issue.code === "cycle"));

  const rootless = solid("sin-raiz", [{ id: "a", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }], "z");
  check("una raíz inexistente se detecta", validateSolidTree(rootless).some((issue) => issue.code === "missing-root"));

  // Y el dibujo NO se cae por una entidad corrupta: el adaptador enseña un
  // marcador con caja acotada, como hace un INSERT sin bloque.
  const adapter = CAD_ENTITY_REGISTRY.adapter(broken);
  const bounds = adapter.bounds.bounds(broken);
  check(
    "un sólido roto sigue teniendo caja finita",
    [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite),
  );
}

// ---------------------------------------------------------------------------
// 8. Ida y vuelta por el documento: el árbol y el volumen sobreviven
// ---------------------------------------------------------------------------
{
  const built = solid(
    "guardado",
    [
      { id: "base", op: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 60, y: 40, z: 20 } },
      { id: "hueco", op: "box", min: { x: 10, y: 10, z: -5 }, max: { x: 20, y: 20, z: 25 } },
      { id: "pieza", op: "subtract", operands: ["base", "hueco"] },
    ],
    "pieza",
  );
  const document: CadDocument = {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [built],
    history: [],
    modelSpace: { entityIds: [built.id] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
  const before = solid3dMassProperties(built).volume;
  // 60·40·20 − 10·10·20 = 48000 − 2000 = 46000
  checkClose("volumen antes de guardar", before, 46_000, 1e-6);

  const reopened = parseCadDocument(serializeCadDocument(document));
  const restored = reopened.entities.find((entity) => entity.id === "guardado");
  if (restored?.type !== "solid3d") throw new Error("el sólido no sobrevivió al documento");
  check("el árbol viaja con sus tres nodos", restored.nodes.length === 3);
  check("y con su raíz", restored.root === "pieza");

  // El caché se vacía a propósito: si el volumen coincidiera por estar cacheado,
  // esta comprobación no demostraría nada sobre lo que se persistió.
  clearSolidCache();
  checkClose("y el volumen se reconstruye idéntico al reabrir", solid3dMassProperties(restored).volume, 46_000, 1e-6);
}

report("solid3d: sólidos B-rep como entidad del documento", 45);
