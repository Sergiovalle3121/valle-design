/**
 * Extrusión de piso/cielorraso/techo desde muros: paridad de detección de
 * loops contra la maquinaria de hatch-boundary, y el dorado de una habitación
 * cerrada.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "./cad-document";
import { CAD_DOCUMENT_SCHEMA } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import {
  cadBoundarySignedArea,
  stitchCadBoundaryPaths,
  type CadBoundaryPath,
} from "./hatch-associativity";
import {
  CAD_CEILING_SLAB_THICKNESS,
  CAD_FLOOR_SLAB_THICKNESS,
  CAD_ROOF_SLAB_THICKNESS,
  buildArchitecturalMassPlan,
} from "./roof-floor-generation";

const wall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness = 200,
  height = 2400,
): CadWallEntity => ({
  id,
  type: "wall",
  start: { ...start, z: 0 },
  end: { ...end, z: 0 },
  thickness,
  height,
  layer: "0",
});

function documentOf(entities: CadWallEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities,
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

/** Cuarto rectangular de 4000×3000 a ejes, muros de 200 de grosor. */
function rectangularRoom(): CadWallEntity[] {
  return [
    wall("n", { x: 0, y: 0 }, { x: 4000, y: 0 }),
    wall("e", { x: 4000, y: 0 }, { x: 4000, y: 3000 }),
    wall("s", { x: 4000, y: 3000 }, { x: 0, y: 3000 }),
    wall("w", { x: 0, y: 3000 }, { x: 0, y: 0 }),
  ];
}

/** Los mismos trazos de contorno que alimentan `buildArchitecturalMassPlan`, para comparar aparte. */
function wallBoundaryPaths(document: CadDocument): CadBoundaryPath[] {
  const paths: CadBoundaryPath[] = [];
  for (const entity of document.entities) {
    if (entity.type !== "wall") continue;
    for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, 192, document))
      paths.push({ sourceId: entity.id, points: path.points, closed: path.closed });
  }
  return paths;
}

const asVertexSet = (points: readonly { x: number; y: number }[]) =>
  new Set(points.map((point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`));
const wallIdKey = (ids: readonly string[]) => [...ids].sort().join(",");
function verticesMatch(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const vertex of a) if (!b.has(vertex)) return false;
  return true;
}

/**
 * Paridad de DETECCIÓN DE LOOPS: cada anillo que cose
 * `stitchCadBoundaryPaths` —la misma costura que resuelve HATCH— aparece una
 * vez, y sólo una, como la envolvente o como un cuarto de este módulo. No se
 * compara contra `resolveCadHatchRegionWithSources` (con islas): esa función
 * resuelve OTRA pregunta —qué queda relleno alrededor de un punto, con agujeros
 * anidados— y una envolvente que RODEA a un cuarto no es un agujero del
 * cuarto, así que forzar esa comparación mezclaría dos semánticas distintas.
 *
 * El emparejamiento es por VÉRTICES, no por el conjunto de muros: un cuarto
 * simple y su propia envolvente citan EXACTAMENTE los mismos muros —la cara
 * interior y la exterior de los mismos cuatro— así que el conjunto de ids por
 * sí solo no basta para distinguir cuál anillo es cuál.
 */
function assertLoopParity(document: CadDocument, plan: ReturnType<typeof buildArchitecturalMassPlan>): void {
  const built = stitchCadBoundaryPaths(wallBoundaryPaths(document));
  const candidates = [
    ...(plan.envelope ? [{ label: "envolvente", wallIds: plan.envelope.wallIds, polygon: plan.envelope.polygon }] : []),
    ...plan.rooms.map((room) => ({ label: `cuarto [${room.wallIds.join(",")}]`, wallIds: room.wallIds, polygon: room.polygon })),
  ];
  assert.equal(
    built.loops.length,
    candidates.length,
    "cada anillo cosido por HATCH es, o la envolvente, o un cuarto — ninguno se pierde ni se inventa, ninguno sobra",
  );
  const remaining = [...candidates];
  built.loops.forEach((loop, index) => {
    const loopVertices = asVertexSet(loop);
    const matchAt = remaining.findIndex((candidate) => verticesMatch(asVertexSet(candidate.polygon), loopVertices));
    assert.ok(matchAt >= 0, `el anillo cosido en la posición ${index} no aparece ni como envolvente ni como cuarto`);
    const [match] = remaining.splice(matchAt, 1);
    assert.equal(
      wallIdKey(match.wallIds),
      wallIdKey(built.loopSourceIds[index] ?? []),
      `${match.label}: los muros que lo delimitan coinciden con los que cosió HATCH`,
    );
  });
}

// --- paridad: cada anillo que cose la maquinaria de HATCH sobre los muros ---
// --- aparece, sin perderse ni inventarse, como envolvente o como cuarto -----
{
  const document = documentOf(rectangularRoom());
  const plan = buildArchitecturalMassPlan(document);
  assert.equal(plan.rooms.length, 1, "un rectángulo cerrado de 4 muros es un cuarto");
  assertLoopParity(document, plan);
}

// --- el anillo de mayor área es la envolvente, no un cuarto -----------------
{
  const document = documentOf(rectangularRoom());
  const plan = buildArchitecturalMassPlan(document);
  assert.ok(plan.envelope, "cuatro muros cerrados producen una envolvente");
  const envelopeArea = Math.abs(cadBoundarySignedArea(plan.envelope!.polygon));
  const roomArea = Math.abs(cadBoundarySignedArea(plan.rooms[0].polygon));
  assert.ok(envelopeArea > roomArea, "la envolvente (caras exteriores) mide más que el cuarto (caras interiores)");
}

// --- dorado: una habitación cerrada por muros produce piso + cielorraso + techo
{
  const document = documentOf(rectangularRoom());
  const plan = buildArchitecturalMassPlan(document);
  const room = plan.rooms[0];
  assert.equal(room.levelZ, 0, "muros a z=0: el piso está en el nivel 0");
  assert.equal(room.height, 2400, "altura de habitación = altura de sus muros (los cuatro miden igual)");
  assert.equal(room.ceilingZ, 2400);
  assert.deepEqual(room.floor.polygon, room.polygon);
  assert.deepEqual(room.ceiling.polygon, room.polygon);
  assert.equal(room.floor.z, -CAD_FLOOR_SLAB_THICKNESS, "la losa de piso cuelga hacia abajo del nivel 0");
  assert.equal(room.floor.thickness, CAD_FLOOR_SLAB_THICKNESS);
  assert.equal(room.ceiling.z, 2400, "la cara de abajo del cielorraso es la altura de muro, sin desplazar");
  assert.equal(room.ceiling.thickness, CAD_CEILING_SLAB_THICKNESS);

  const envelope = plan.envelope!;
  assert.equal(envelope.roofZ, room.ceilingZ, "el techo arranca donde termina el único cielorraso");
  assert.deepEqual(envelope.roof.polygon, envelope.polygon);
  assert.equal(envelope.roof.z, envelope.roofZ);
  assert.equal(envelope.roof.thickness, CAD_ROOF_SLAB_THICKNESS);
}

// --- una habitación en L (6 muros, todo inglete de a dos) sigue siendo UN
// --- solo cuarto, y su altura es el mínimo de los SEIS muros ----------------
{
  const lShape = [
    wall("l1", { x: 0, y: 0 }, { x: 6000, y: 0 }, 200, 2400),
    wall("l2", { x: 6000, y: 0 }, { x: 6000, y: 3000 }, 200, 2400),
    wall("l3", { x: 6000, y: 3000 }, { x: 3000, y: 3000 }, 200, 2200), // el más bajo
    wall("l4", { x: 3000, y: 3000 }, { x: 3000, y: 5000 }, 200, 2400),
    wall("l5", { x: 3000, y: 5000 }, { x: 0, y: 5000 }, 200, 2400),
    wall("l6", { x: 0, y: 5000 }, { x: 0, y: 0 }, 200, 2400),
  ];
  const document = documentOf(lShape);
  const plan = buildArchitecturalMassPlan(document);
  assert.equal(plan.rooms.length, 1, "seis muros en inglete siguen cerrando un único cuarto no convexo");
  const room = plan.rooms[0];
  assert.deepEqual(new Set(room.wallIds), new Set(["l1", "l2", "l3", "l4", "l5", "l6"]));
  assert.equal(room.height, 2200, "la altura del cuarto es el mínimo de sus SEIS muros, no de los cuatro típicos");
  assert.equal(plan.envelope!.roofZ, room.ceilingZ);

  assertLoopParity(document, plan);
}

// --- un tabique en T (llega a la MITAD de un muro pasante) no parte la sala:
// --- es la misma limitación de `wall-joins.ts` ("el pasante no se toca en
// --- esta ola") que hereda HATCH sobre muros, y aquí se deja como contrato --
{
  const entities = [
    ...rectangularRoom(),
    wall("partition", { x: 2000, y: 0 }, { x: 2000, y: 3000 }, 150, 2200),
  ];
  const document = documentOf(entities);
  const plan = buildArchitecturalMassPlan(document);
  assert.equal(
    plan.rooms.length,
    1,
    "el tabique en T no cierra contra el muro pasante: la sala sigue completa, sin partir",
  );
  assert.ok(
    !plan.rooms[0].wallIds.includes("partition"),
    "el tabique no delimita el cuarto: sus caras quedan sueltas, no cosidas al anillo",
  );
  assert.equal(plan.rooms[0].height, 2400, "la altura ignora el tabique que no cerró nada");
}

// --- sin muros, o muros que no cierran nada: plan vacío, sin explotar -------
{
  const empty = buildArchitecturalMassPlan(documentOf([]));
  assert.deepEqual(empty, { rooms: [], envelope: null });

  const open = buildArchitecturalMassPlan(
    documentOf([wall("solo", { x: 0, y: 0 }, { x: 3000, y: 0 })]),
  );
  // Un único muro libre SÍ cierra su propio contorno (es su footprint, un
  // rectángulo delgado): sale como envolvente sin cuartos, y el techo cae de
  // la altura de ese mismo muro por el camino de reserva.
  assert.equal(open.rooms.length, 0);
  assert.ok(open.envelope);
  assert.equal(open.envelope!.roofZ, 2400);
}

console.log(
  "roof-floor-generation: paridad con HATCH sobre muros, envolvente por mayor área y dorado de piso+cielorraso+techo verificados",
);
