/**
 * DATAEXTRACTION produce lo mismo que ve el despacho: una tabla en el dibujo y
 * un CSV, con los MISMOS números que `buildCadBimSchedule` calculó — no una
 * copia que alguien tecleó aparte.
 */
import { strict as assert } from "node:assert";
import type { CadWallEntity } from "../cad-entities-v6";
import { buildCadBimSchedule } from "../bim-schedule";
import {
  buildCadOpeningScheduleTable,
  buildCadRoomScheduleTable,
  buildCadDataExtractionCsv,
  buildCadDataExtractionTable,
  CAD_DATA_EXTRACTION_VOLUME_CAVEAT,
} from "./data-extraction";

/** Un cuarto de 4×3 m con muros de 200 mm, cerrado. */
function room(): CadWallEntity[] {
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadWallEntity => ({
    id,
    type: "wall",
    start: { x: x1, y: y1, z: 0 },
    end: { x: x2, y: y2, z: 0 },
    thickness: 200,
    height: 2600,
    layer: "MUROS",
  });
  return [
    wall("w1", 0, 0, 4000, 0),
    wall("w2", 4000, 0, 4000, 3000),
    wall("w3", 4000, 3000, 0, 3000),
    wall("w4", 0, 3000, 0, 0),
  ];
}

const schedule = buildCadBimSchedule({ entities: room() } as never);

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// --- CSV ---------------------------------------------------------------
const csv = buildCadDataExtractionCsv(schedule);
ok(csv.includes("MUROS"), "lleva la sección de muros");
ok(csv.includes("CARPINTERÍA"), "lleva la sección de carpintería");
ok(csv.includes("LOCALES"), "lleva la sección de locales");
ok(csv.includes(CAD_DATA_EXTRACTION_VOLUME_CAVEAT), "declara el sesgo de esquina de P1-6");

// El muro w1 mide 4 m: aparece en el CSV con longitud agregada (2×4 + 2×3 = 14 m).
ok(/14\.000/.test(csv), `la longitud total agregada de muro tiene que aparecer: ${csv}`);

// Una coma dentro de un valor se escapa entre comillas — se prueba con un
// documento que produce un problema con coma en el texto.
const withProblem = buildCadBimSchedule({
  entities: [
    ...room(),
    { id: "o1", type: "opening", kind: "door", hostId: "no-existe, en efecto", position: 0, width: 900, height: 2100, sill: 0 } as never,
  ],
} as never);
const csvWithProblem = buildCadDataExtractionCsv(withProblem);
ok(csvWithProblem.includes('"'), `un problema con coma se cita entre comillas: ${csvWithProblem}`);

// --- Tabla nativa --------------------------------------------------------
let nextId = 0;
const table = buildCadDataExtractionTable(schedule, { x: 100, y: 100 }, "0", () => `t${(nextId += 1)}`);
ok(table.type === "table", "la orden inserta una entidad TABLE nativa");
ok(table.id === "t1", "usa el generador de ids inyectado, no uno propio");
ok(table.insertion.x === 100 && table.insertion.y === 100 && table.insertion.z === 0, "inserción en el punto pedido, aplanada a z=0");
ok(table.layer === "0", "en la capa que pidió el comando");
ok(table.columns === 6, "seis columnas: capa, espesor, cantidad, longitud, área, volumen");
ok(table.rows === schedule.walls.length + 2, "cabecera + aviso + una fila por grupo de muro");
ok(
  table.cells.some((cell) => cell.text.includes(CAD_DATA_EXTRACTION_VOLUME_CAVEAT)),
  "el aviso de sesgo viaja DENTRO de la tabla, no sólo en el CSV",
);
const wallRowCells = table.cells.filter((cell) => cell.row === 2);
ok(wallRowCells.length === 6, "la primera fila de datos tiene sus seis celdas");
ok(
  wallRowCells.some((cell) => cell.text === "14.000"),
  `la longitud agregada tiene que estar en la tabla: ${JSON.stringify(wallRowCells)}`,
);

// --- Ola E (2026-09-02): cuadro de superficies con nombre y cuadro de carpintería
{
  const named = buildCadBimSchedule({
    entities: [
      ...room(),
      { id: "rotulo", type: "text", x: 2_000, y: 1_500, text: "COCINA", height: 150, layer: "0" },
      { id: "p1", type: "opening", kind: "door", hostId: "w1", position: 1_000, width: 900, height: 2_100, sill: 0, swing: "left", hinge: "start", layer: "MUROS" },
      { id: "v1", type: "opening", kind: "window", hostId: "w3", position: 2_000, width: 1_200, height: 1_200, sill: 900, swing: "left", hinge: "start", layer: "MUROS" },
    ],
  } as never);
  let ids = 0;
  const rooms = buildCadRoomScheduleTable(named, { x: 0, y: 0 }, "0", () => `s${(ids += 1)}`);
  ok(rooms.type === "table" && rooms.columns === 5 && rooms.rows === 3, "cuadro de superficies: título, cabecera y un local");
  const localRow = rooms.cells.filter((cell) => cell.row === 2).map((cell) => cell.text);
  ok(localRow[0] === "COCINA" && localRow[1] === "Cocina", `nombre y uso en la fila: ${JSON.stringify(localRow)}`);
  ok(localRow[2] === "12.00", `área a ejes 4 × 3 = 12,00 m²: ${localRow[2]}`);
  ok(rooms.cells.some((cell) => cell.row === 0 && cell.text.startsWith("Cuadro de superficies")), "con su título");

  const openings = buildCadOpeningScheduleTable(named, { x: 0, y: 0 }, "0", () => `c${(ids += 1)}`);
  ok(openings.columns === 6 && openings.rows === 4, "cuadro de carpintería: título, cabecera, puerta y ventana");
  const rowsText = [2, 3].map((row) => openings.cells.filter((cell) => cell.row === row).map((cell) => cell.text));
  ok(rowsText[0][0] === "P-090x210" && rowsText[0][1] === "Puerta" && rowsText[0][4] === "0", `la puerta: ${JSON.stringify(rowsText[0])}`);
  ok(rowsText[1][0] === "V-120x120" && rowsText[1][4] === "900", `la ventana con su antepecho: ${JSON.stringify(rowsText[1])}`);

  const csvNamed = buildCadDataExtractionCsv(named);
  ok(csvNamed.includes("COCINA,Cocina,12.00"), "el CSV lleva nombre y uso del local");
  ok(csvNamed.includes("Antepecho (mm)"), "y el antepecho en la carpintería");
}

console.log(`data-extraction.spec: ${checks} comprobaciones OK`);
