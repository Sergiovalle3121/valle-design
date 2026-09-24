import type { CadDocument, CadPoint2 } from "../cad-document";
import { buildCadBimSchedule, type CadBimSchedule } from "../bim-schedule";
import { CAD_MM_PER_UNIT } from "../engine/commands/architecture-support";
import { cadPointInBoundary } from "../hatch-associativity";

export interface CadRoomAreaLabel {
  id: string;
  name: string;
  nameFromDocument: boolean;
  /** ID del TEXT/MTEXT persistido que nombra este cuarto. */
  labelId?: string;
  axisAreaText: string;
  clearAreaText?: string;
  at: CadPoint2;
}

export function interiorPoint(ring: readonly CadPoint2[]): CadPoint2 {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  const centroid = { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
  if (Number.isFinite(centroid.x) && Number.isFinite(centroid.y) && cadPointInBoundary(centroid, ring))
    return centroid;
  const average = ring.reduce(
    (point, vertex) => ({ x: point.x + vertex.x / ring.length, y: point.y + vertex.y / ring.length }),
    { x: 0, y: 0 },
  );
  if (cadPointInBoundary(average, ring)) return average;
  // Un contorno cóncavo puede dejar ambos centros fuera. El triángulo local
  // junto a una esquina interior sí contiene un punto del propio cuarto.
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const candidate = { x: (a.x + b.x + average.x) / 3, y: (a.y + b.y + average.y) / 3 };
    if (cadPointInBoundary(candidate, ring)) return candidate;
  }
  return average;
}

/** Rótulos derivados del mismo grafo de muros que alimenta el cuadro de áreas. */
export function cadRoomAreaLabels(document: Pick<CadDocument, "entities" | "meta"> | null, schedule?: CadBimSchedule): CadRoomAreaLabel[] {
  if (!document?.entities.some((entity) => entity.type === "wall")) return [];
  // La orden de arquitectura trata una unidad desconocida como mm para sus
  // defaults; una superficie mostrada al usuario no puede hacer esa suposición.
  const unit = document.meta.unit?.trim().toLowerCase() ?? "";
  if (!Object.hasOwn(CAD_MM_PER_UNIT, unit)) return [];
  const mm = CAD_MM_PER_UNIT[unit];
  const areaText = (area: number) => new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((area * mm * mm) / 1_000_000);
  return (schedule ?? buildCadBimSchedule(document, document.meta.unit)).rooms.map((room) => ({
    id: room.id,
    name: room.name ?? `Cuarto ${Number(room.id.replace(/\D/g, "")) || 1}`,
    nameFromDocument: Boolean(room.name),
    ...(room.labelId ? { labelId: room.labelId } : {}),
    axisAreaText: areaText(room.axisArea),
    ...(room.clearArea === undefined ? {} : { clearAreaText: areaText(room.clearArea) }),
    at: interiorPoint(room.ring),
  }));
}
