/**
 * LA LISTA DE MATERIALES (BOM) con sus globos (Ola I, 2026-09-02).
 *
 * Se lee del documento tal como está, con el criterio de `mep-schedule.ts` y
 * `bim-schedule.ts`: lo que está insertado se cuenta, lo que está anotado se
 * cree, y el cuadro dice de dónde sale cada número. Cada INSERT de un bloque
 * `MECH-…` cuenta una unidad de su normalizado (denominación y norma en la
 * `description` del bloque); cada globo (`context.metadata.mechanical =
 * "balloon"`, contado por su círculo para no contarlo cuatro veces) da la
 * POSICIÓN de la pieza que señala. Un normalizado sin globo recibe la
 * siguiente posición libre; un globo sobre algo que no es normalizado sale
 * como fila propia, porque el dibujante lo numeró a propósito.
 *
 * ## Por qué la tabla lleva marca (2026-09-04)
 *
 * Hasta hoy la lista se GENERABA y ahí acababa: insertar un tornillo más
 * dejaba el cuadro del plano diciendo dos donde había tres, y nadie avisaba —
 * que es exactamente la clase de mentira que se imprime y llega al taller.
 * Por eso la tabla nace marcada con `context.metadata.mechanical = "bom"`:
 * es lo que permite volver a encontrarla y sustituirla POR SU ID
 * (`findCadMechanicalBomTables` + el id forzado de `buildCadMechanicalBomTable`).
 */
import type { CadPoint2 } from "./cad-document";
import type { CadNativeEntity } from "./entity-runtime";
import type { CadCommandDocumentView } from "./engine/command-types";
import { scheduleTable } from "./data-extraction/data-extraction";
import { CAD_BALLOON_MARK } from "./mechanical-symbols";
import { CAD_MECHANICAL_BLOCK_PREFIX, cadMechanicalPartOf } from "./mechanical-parts";

export interface CadBomRow {
  item: number;
  count: number;
  name: string;
  standard: string;
  /** Id del bloque; vacío en un globo sobre un objeto sin normalizado. */
  blockId: string;
  /** `true` si la posición la dio un globo; `false` si se asignó aquí. */
  ballooned: boolean;
}

export interface CadMechanicalBom {
  rows: CadBomRow[];
  balloons: number;
}

type View = Pick<CadCommandDocumentView, "entities" | "blocks">;

/** Filas de la lista: normalizados insertados y globos, con su posición. */
export function buildCadMechanicalBom(view: View): CadMechanicalBom {
  const balloons: Array<{ item: number; part: string }> = [];
  const parts = new Map<string, { count: number; name: string; standard: string }>();
  for (const entity of view.entities) {
    const metadata = entity.context?.metadata;
    if (entity.type === "circle" && metadata?.mechanical === CAD_BALLOON_MARK) {
      const item = Number(metadata.balloon);
      if (Number.isFinite(item) && item > 0) balloons.push({ item, part: typeof metadata.balloonPart === "string" ? metadata.balloonPart : "" });
      continue;
    }
    if (entity.type !== "insert" || !entity.block.startsWith(CAD_MECHANICAL_BLOCK_PREFIX)) continue;
    const existing = parts.get(entity.block);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const block = view.blocks.find((candidate) => candidate.id === entity.block);
    const part = cadMechanicalPartOf(block) ?? { name: block?.name ?? entity.block, standard: "—" };
    parts.set(entity.block, { count: 1, name: part.name, standard: part.standard });
  }

  const rows: CadBomRow[] = [];
  let next = balloons.reduce((max, balloon) => Math.max(max, balloon.item), 0);
  for (const [blockId, part] of [...parts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const numbered = balloons.filter((balloon) => balloon.part === blockId).map((balloon) => balloon.item);
    const item = numbered.length > 0 ? Math.min(...numbered) : (next += 1);
    rows.push({ item, count: part.count, name: part.name, standard: part.standard, blockId, ballooned: numbered.length > 0 });
  }
  for (const balloon of balloons) {
    if (balloon.part && parts.has(balloon.part)) continue;
    if (rows.some((row) => row.item === balloon.item)) continue;
    rows.push({ item: balloon.item, count: 1, name: balloon.part || "Objeto designado sin normalizado", standard: "—", blockId: "", ballooned: true });
  }
  rows.sort((a, b) => a.item - b.item);
  return { rows, balloons: balloons.length };
}

export const BOM_HEADERS = ["Pos.", "Cant.", "Denominación", "Norma", "Bloque"] as const;

/**
 * La marca que la lista deja en SU tabla, hermana de `CAD_BALLOON_MARK`.
 *
 * Sin ella, el cuadro insertado por BOM es una tabla más entre las de muros,
 * superficies y carpintería: nadie puede volver a encontrarlo, y el día que se
 * inserta otro tornillo la lista se queda mintiendo en el plano. Con ella,
 * «Actualizar» sabe a qué entidad volver — y vuelve por `replace`, que conserva
 * el id, el orden de dibujo y las referencias que la apunten.
 */
export const CAD_BOM_MARK = "bom";

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

const BOM_TITLE =
  "Lista de materiales: normalizados insertados (bloques MECH-) y globos; la posición es la del globo";

/**
 * La lista como TABLE.
 *
 * `entityId` fuerza el id en vez de pedir uno nuevo: es lo que permite que
 * «Actualizar» reconstruya la tabla entera con las filas de hoy y la devuelva
 * al documento SIENDO LA MISMA entidad. Sin eso, actualizar sería borrar y
 * volver a insertar — otro id, otro sitio en el orden de dibujo y cualquier
 * cota o directriz que la señalara colgando en el vacío.
 */
export function buildCadMechanicalBomTable(
  bom: CadMechanicalBom,
  insertion: CadPoint2,
  layer: string,
  newEntityId: () => string,
  entityId?: string,
): CadTableEntity {
  const rows = bom.rows.map((row) => [String(row.item), String(row.count), row.name, row.standard, row.blockId || "—"]);
  const table = scheduleTable(BOM_TITLE, BOM_HEADERS, rows, insertion, layer, entityId ? () => entityId : newEntityId, 1_500);
  return { ...table, context: { ...table.context, metadata: { ...table.context?.metadata, mechanical: CAD_BOM_MARK } } };
}

/** Las tablas de lista de materiales del dibujo, en orden de dibujo. */
export function findCadMechanicalBomTables(view: Pick<View, "entities">): CadTableEntity[] {
  const tables: CadTableEntity[] = [];
  for (const entity of view.entities) {
    if (entity.type !== "table" || entity.context?.metadata?.mechanical !== CAD_BOM_MARK) continue;
    tables.push(entity as CadTableEntity);
  }
  return tables;
}

/** Lo que una tabla de lista DICE hoy: cuántas posiciones y cuántas unidades. */
export interface CadBomTableFigures {
  items: number;
  units: number;
}

/**
 * Se lee de las CELDAS y no de un contador guardado aparte: la tabla del
 * dibujo es la que el usuario ve, y comparar contra otra cosa dejaría el
 * renglón diciendo un «antes» que nadie tenía delante. Las dos primeras filas
 * son título y cabecera (`scheduleTable`), así que los datos empiezan en la 2.
 */
export function readCadMechanicalBomTable(table: CadTableEntity): CadBomTableFigures {
  const dataRows = new Set<number>();
  let units = 0;
  for (const cell of table.cells) {
    if (cell.row < 2) continue;
    dataRows.add(cell.row);
    if (cell.column !== 1) continue;
    const count = Number.parseInt(cell.text, 10);
    if (Number.isFinite(count)) units += count;
  }
  return { items: dataRows.size, units };
}
