/**
 * AUDIT, primera mitad: geometría degenerada.
 *
 * ## Qué detecta y qué NO
 *
 * `degenerate-geometry-corpus.spec.ts` ya fijó, entidad por entidad, cuáles de
 * estos casos el motor CORRIGE en silencio (un arco de barrido nulo se
 * normaliza a vuelta completa), cuáles DEGRADA declarándolo (un círculo de
 * radio cero sigue archivado en su centro, pero no dibuja nada) y cuáles
 * RECHAZA de plano. Este módulo no repite ese trabajo: sólo nombra las
 * entidades que, tras esas reglas, siguen sin aportar NADA al dibujo — un
 * trazo que no traza — para que AUDIT pueda ofrecer borrarlas con el usuario
 * mirando la lista, en vez de que seas quien las tropieza en el render.
 *
 * Los duplicados de geometría (dos líneas idénticas) NO se detectan aquí:
 * ésa es la otra mitad de OVERKILL (`../overkill.ts`), y AUDIT la reutiliza
 * desde `report.ts` en vez de duplicar el análisis.
 */
import type { CadEntity, CadPoint2 } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";

export type CadAuditGeometryDefectKind =
  | "zero-length-line"
  | "degenerate-polyline"
  | "zero-radius-circle"
  | "zero-radius-arc"
  | "degenerate-ellipse"
  | "degenerate-spline";

export interface CadAuditGeometryDefect {
  /** Identidad estable: `${kind}:${entityId}`. */
  id: string;
  kind: CadAuditGeometryDefectKind;
  entityId: string;
  layer: string;
  detail: string;
}

const DEFAULT_TOLERANCE = 1e-6;

/** Cuántas posiciones DISTINTAS hay en la lista, con tolerancia. */
function distinctPointCount(points: readonly CadPoint2[], tolerance: number): number {
  const distinct: CadPoint2[] = [];
  for (const point of points) {
    if (distinct.some((seen) => Math.hypot(seen.x - point.x, seen.y - point.y) <= tolerance))
      continue;
    distinct.push(point);
  }
  return distinct.length;
}

/**
 * Recorre las entidades y nombra las que no trazan nada.
 *
 * Cualquier coordenada NaN o infinita cae aquí también, sin caso especial: una
 * comparación `> tolerancia` contra NaN es siempre falsa, así que una LINE con
 * un extremo no finito se reporta igual que una de longitud cero — que es
 * exactamente lo correcto, porque ninguna de las dos traza un segmento real.
 */
export function detectCadAuditGeometryDefects(
  entities: readonly CadEntity[],
  tolerance: number = DEFAULT_TOLERANCE,
): CadAuditGeometryDefect[] {
  const defects: CadAuditGeometryDefect[] = [];
  const push = (kind: CadAuditGeometryDefectKind, entity: CadEntity, detail: string) => {
    defects.push({ id: `${kind}:${entity.id}`, kind, entityId: entity.id, layer: entity.layer, detail });
  };

  for (const entity of entities) {
    if (entity.type === "line") {
      const length = Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y);
      if (!(length > tolerance))
        push(
          "zero-length-line",
          entity,
          `LINE de longitud ${Number.isFinite(length) ? length.toExponential(2) : "no finita"}: sus dos extremos son el mismo punto.`,
        );
      continue;
    }
    if (entity.type === "polyline") {
      const distinct = distinctPointCount(entity.vertices, tolerance);
      if (distinct < 2)
        push(
          "degenerate-polyline",
          entity,
          `POLYLINE con ${entity.vertices.length} vértice(s) pero sólo ${distinct} posición(es) distinta(s): no traza ningún tramo.`,
        );
      continue;
    }
    if (entity.type === "circle") {
      if (!(entity.radius > tolerance))
        push("zero-radius-circle", entity, `CIRCLE de radio ${entity.radius}: no encierra ninguna superficie.`);
      continue;
    }
    if (entity.type === "arc") {
      if (!(entity.radius > tolerance))
        push("zero-radius-arc", entity, `ARC de radio ${entity.radius}: no traza ningún tramo.`);
      continue;
    }
    if (entity.type === "ellipse") {
      const majorLength = Math.hypot(entity.majorAxis.x, entity.majorAxis.y);
      if (!(majorLength > tolerance) || !(Math.abs(entity.ratio) > tolerance))
        push(
          "degenerate-ellipse",
          entity,
          `ELLIPSE con eje mayor de longitud ${majorLength} y razón ${entity.ratio}: colapsada a un punto.`,
        );
      continue;
    }
    if (entity.type === "spline") {
      const distinct = distinctPointCount(
        entity.controlPoints.map((point) => ({ x: point.x, y: point.y })),
        tolerance,
      );
      if (distinct < 2)
        push(
          "degenerate-spline",
          entity,
          `SPLINE con ${entity.controlPoints.length} punto(s) de control pero sólo ${distinct} posición(es) distinta(s): no define ninguna curva.`,
        );
    }
  }
  return defects;
}

/** Un `delete` por defecto. AUDIT decide cuándo emitirlos; esto sólo los construye. */
export function cadAuditGeometryRepairCommands(
  defects: readonly CadAuditGeometryDefect[],
): CadEntityCommand[] {
  return defects.map((defect) => ({ type: "delete", entityId: defect.entityId }));
}
