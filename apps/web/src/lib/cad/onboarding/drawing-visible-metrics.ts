import type { CadDocument, CadPoint2 } from "../cad-document";
import { buildCadDimensionGeometry } from "../associative-dimension";
import { buildCadBimSchedule } from "../bim-schedule";
import { formatCadHumanLength } from "../inquiry/human-units";
import { cadRoomAreaLabels } from "./room-area-labels";

export interface CadVisibleDimension {
  id: string;
  text: string;
  at: CadPoint2;
}

/** Una lectura del documento para rótulos y conteos; los huecos inválidos no suman. */
export function cadDrawingVisibleMetrics(document: CadDocument | null) {
  if (!document) return { rooms: [], openings: null, dimensions: [] as CadVisibleDimension[] };
  const hasWalls = document.entities.some((entity) => entity.type === "wall");
  const schedule = hasWalls ? buildCadBimSchedule(document, document.meta.unit) : null;
  const openings = schedule ? schedule.openings.reduce(
    (totals, row) => ({
      doors: totals.doors + (row.kind === "door" ? row.count : 0),
      windows: totals.windows + (row.kind === "window" ? row.count : 0),
    }),
    { doors: 0, windows: 0 },
  ) : null;
  const dimensions = document.entities.flatMap((entity): CadVisibleDimension[] => {
    if (entity.type !== "dimension") return [];
    if (entity.dimensionKind && entity.dimensionKind !== "linear" && entity.dimensionKind !== "aligned") return [];
    // Si el autor personalizó la cota, la rotulación canónica tiene prioridad.
    if (entity.text?.trim() || entity.prefix || entity.suffix || entity.units || entity.alternateUnits) return [];
    const geometry = buildCadDimensionGeometry(entity);
    if (!geometry || !Number.isFinite(geometry.measurement)) return [];
    return [{
      id: entity.id,
      text: formatCadHumanLength(geometry.measurement, entity.sourceUnit ?? document.meta.unit),
      at: geometry.textAnchor,
    }];
  });
  return { rooms: cadRoomAreaLabels(document, schedule ?? undefined), openings, dimensions };
}
