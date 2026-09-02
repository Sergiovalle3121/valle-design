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

type CadTableEntity = Extract<CadNativeEntity, { type: "table" }>;

export function buildCadMechanicalBomTable(bom: CadMechanicalBom, insertion: CadPoint2, layer: string, newEntityId: () => string): CadTableEntity {
  const rows = bom.rows.map((row) => [String(row.item), String(row.count), row.name, row.standard, row.blockId || "—"]);
  return scheduleTable(
    "Lista de materiales: normalizados insertados (bloques MECH-) y globos; la posición es la del globo",
    BOM_HEADERS,
    rows,
    insertion,
    layer,
    newEntityId,
    1_500,
  );
}
