/**
 * Gate de paridad geométrica interna: el volumen que factura
 * `buildCadBimSchedule` contra el volumen REAL del sólido 3D
 * (`wallSolidBodyLocal` + `bodyMassProperties`, integración por teselado —
 * el mismo camino que dibuja la vista 3D, no una fórmula paralela que
 * podría divergir de lo que el usuario VE).
 *
 * ## Por qué este gate empieza en ROJO a propósito
 *
 * Investigado y cuantificado con código real (campaña Paridad, OLA 0.5/1.3,
 * 2026-08-27): un cuarto de 5,0×4,0 m con muros de 250 mm da 10,65 m³ en el
 * cuadro de cantidades y 10,80 m³ en el sólido real — 1,39% de brecha. Causa
 * raíz: el inglete de esquina EXTIENDE la cara exterior de un muro y RECORTA
 * la interior en la misma medida (conserva el área propia de cada muro),
 * pero `bim-schedule.ts` sólo resta el solape interior medido
 * (`cadWallJunctionOverlaps`) y nunca suma de vuelta la extensión exterior
 * equivalente — así que el cuadro de cantidades UNDER-factura fábrica real.
 *
 * Arreglar `bim-schedule.ts` cambia qué se factura por muro: es una decisión
 * de NEGOCIO (qué extensión de esquina se cobra), no una corrección técnica
 * unilateral. Este gate no lo arregla — lo MIDE, con un TECHO: existe para
 * que la brecha NUNCA CREZCA en silencio mientras nadie decide arreglarla.
 * Ver BACKLOG.md (P1 · Volumen de fábrica sub-facturado en las esquinas).
 *
 * Documento de prueba: el MISMO cuarto (4 muros cerrando 5×4 m, una puerta
 * en el muro sur) que ya usa `glb-export.spec.ts` — misma geometría, dos
 * ángulos de verificación distintos (visual/GLB allá, cantidades aquí).
 */
import assert from "node:assert/strict";
import { bodyMassProperties } from "../brep";
import { buildCadBimSchedule } from "./bim-schedule";
import type { CadDocument, CadEntity } from "./cad-document";
import { CAD_DOCUMENT_SCHEMA } from "./cad-document";
import type { CadWallEntity } from "./cad-entities-v6";
import type { CadOpeningEntity } from "./cad-entities-v7";
import { wallJoins } from "./wall-joins";
import {
  wallSolidBodyLocalWithDiagnostics,
  type CadWallSolidOpening,
} from "./wall-solid";

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };

function wall(id: string, start: [number, number], end: [number, number]): CadWallEntity {
  return {
    id,
    type: "wall",
    start: { x: start[0], y: start[1], z: 0 },
    end: { x: end[0], y: end[1], z: 0 },
    thickness: 250,
    height: 2_400,
    layer: "0",
    material: "brick",
  };
}

function documentWith(entities: readonly CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities: [...entities],
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
  } as CadDocument;
}

const door: CadOpeningEntity = {
  id: "puerta",
  type: "opening",
  kind: "door",
  hostId: "sur",
  position: 2_500,
  width: 900,
  height: 2_100,
  sill: 0,
  swing: "left",
  hinge: "start",
  layer: "0",
};
const walls: CadWallEntity[] = [
  wall("sur", [0, 0], [5_000, 0]),
  wall("este", [5_000, 0], [5_000, 4_000]),
  wall("norte", [5_000, 4_000], [0, 4_000]),
  wall("oeste", [0, 4_000], [0, 0]),
];
const building = documentWith([...walls, door]);

/** Volumen REAL: suma de `bodyMassProperties(...).volume` por muro, en mm³. */
function realSolidVolumeMm3(): number {
  let total = 0;
  for (const w of walls) {
    const joins = wallJoins(w, walls);
    const openings: CadWallSolidOpening[] = building.entities
      .filter(
        (entity): entity is CadOpeningEntity =>
          entity.type === "opening" && entity.hostId === w.id,
      )
      .map((opening) => ({
        position: opening.position,
        width: opening.width,
        sill: opening.sill,
        height: opening.height,
      }));
    const { body } = wallSolidBodyLocalWithDiagnostics(w, openings, joins);
    assert.ok(body, `el muro "${w.id}" debe producir un sólido válido`);
    total += bodyMassProperties(body).volume;
  }
  return total;
}

/** Volumen del CUADRO DE CANTIDADES, en mm³ — misma unidad que el documento. */
function scheduleVolumeMm3(): number {
  const schedule = buildCadBimSchedule(building);
  return schedule.walls.reduce((sum, row) => sum + row.volume, 0);
}

const real = realSolidVolumeMm3();
const scheduled = scheduleVolumeMm3();
const gapPct = ((real - scheduled) / real) * 100;

// El cuadro SUB-factura, nunca sobre-factura: si esto se invirtiera sería
// una geometría distinta a la investigada, no la misma brecha.
assert.ok(
  scheduled < real,
  `el cuadro de cantidades (${(scheduled / 1e9).toFixed(3)} m³) debía quedar ` +
    `POR DEBAJO del sólido real (${(real / 1e9).toFixed(3)} m³) — si ya no es ` +
    "así, la brecha investigada cambió de forma y este gate necesita revisión, " +
    "no sólo el techo.",
);

// La brecha conocida es del orden de 1,39% (medida en la misma geometría
// durante la investigación de esta campaña). Un rango, no un punto exacto:
// el kernel de teselado puede variar en el último dígito sin que eso sea
// una regresión real.
assert.ok(
  gapPct > 0.5 && gapPct < 3,
  `brecha esperada ~1,39% (rango de vigilancia 0,5%–3%); midió ${gapPct.toFixed(3)}% ` +
    `— fuera de rango es señal de que la geometría de prueba cambió, no sólo el kernel.`,
);

// EL TECHO DE VERDAD: nunca crece más allá de esto sin que alguien lo note.
// 2% dobla holgadamente la brecha medida (1,39%) para absorber variación de
// punto flotante entre corridas, sin dejar pasar una regresión real que
// duplicara o triplicara el sub-conteo.
const CEILING_PCT = 2;
assert.ok(
  gapPct <= CEILING_PCT,
  `el volumen de fábrica del cuadro de cantidades se alejó del sólido real ` +
    `${gapPct.toFixed(3)}% (techo ${CEILING_PCT}%) — una unión de muros nueva o ` +
    "un cambio en cadWallJunctionOverlaps/bim-schedule.ts está sub-facturando " +
    "más de lo ya conocido. Ver BACKLOG.md.",
);

console.log(
  `wall-takeoff-solid-parity: cuadro ${(scheduled / 1e9).toFixed(3)} m³ vs sólido real ` +
    `${(real / 1e9).toFixed(3)} m³ — brecha ${gapPct.toFixed(3)}% dentro del techo (${CEILING_PCT}%)`,
);
