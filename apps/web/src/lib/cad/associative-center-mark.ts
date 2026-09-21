/**
 * CENTERMARK y CENTERLINE asociativos.
 *
 * `engine/commands/center-marks.ts` deja escrito en `context.metadata` de qué
 * objetivo depende cada línea (`centerTarget`, y para CENTERLINE también
 * `centerTarget2`) y con qué sobresaliente se dibujó (`centerOvershoot`) desde
 * el día en que se registró el comando — pero hasta ahora NADIE los leía: al
 * mover o escalar el círculo, la cruz se quedaba donde nació. Este módulo es
 * quien por fin los lee, con el mismo patrón que `associative-dimension.ts` y
 * `hatch-associativity.ts` ya resuelven para cotas y sombreados:
 * `entity-commands.ts` llama a esto con las entidades YA editadas del lote y
 * la lista de ids que cambiaron, y la marca se recompone si su objetivo está
 * entre ellos.
 *
 * ## Qué significa «huérfana»
 *
 * Si el objetivo YA NO EXISTE — se borró en este mismo lote o en uno
 * anterior — la marca no se borra con él ni se queda congelada fingiendo que
 * sigue viva: se declara huérfana (`centerOrphaned: true` en su propio
 * metadata) y conserva la última geometría conocida. Es la misma filosofía
 * que `associationStatus: "broken"` en cotas y sombreados, adaptada a un tipo
 * — `line` — que no tiene ese campo en el esquema: la marca de centro es
 * geometría suelta con una nota, no una entidad de primera clase con su
 * propio estado de asociación.
 *
 * ## Por qué el eje se reconoce por su propia geometría
 *
 * CENTERMARK dibuja DOS líneas — horizontal y vertical — como dos entidades
 * independientes que comparten `centerTarget`. Al recomponer una de las dos no
 * hay en su metadata qué eje es: en vez de añadir un campo más, se lee de la
 * propia línea (`start`/`end`), porque una cruz de centro nace siempre
 * alineada a ejes y una edición de ESTE módulo nunca la gira. Detectar el eje
 * desde la metadata y desde la geometría serían dos fuentes de verdad que
 * podrían discreparse entre sí tras una edición manual; leer sólo la
 * geometría dejó una única fuente.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";
import {
  cadCenterlineAnchor,
  CAD_CENTER_OVERSHOOT_METADATA,
  CAD_CENTER_TARGET_2_METADATA,
} from "./engine/commands/center-marks";

const CENTER_ORPHAN_METADATA = "centerOrphaned";

export interface CadCenterMarkRegenerateResult {
  entities: CadEntity[];
  /** Marcas recompuestas porque su objetivo cambió y sigue existiendo. */
  regeneratedIds: string[];
  /** Marcas cuyo objetivo (o uno de los dos, en CENTERLINE) ya no existe. */
  orphanedIds: string[];
}

function metadataOf(entity: CadEntity): Record<string, string | number | boolean | null> | undefined {
  return entity.context?.metadata as Record<string, string | number | boolean | null> | undefined;
}

function readString(metadata: Record<string, string | number | boolean | null> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function readOvershoot(metadata: Record<string, string | number | boolean | null> | undefined): number {
  const value = metadata?.[CAD_CENTER_OVERSHOOT_METADATA];
  return typeof value === "number" && Number.isFinite(value) ? value : 3;
}

/**
 * Reescribe una línea de CENTERMARK entre `cx,cy` con la extensión `ext`,
 * conservando el eje que ya tenía: si sus dos extremos comparten `y`, era la
 * horizontal; si comparten `x`, la vertical. Una marca degenerada (extensión
 * cero en su día) que no declara ninguno de los dos se trata como horizontal,
 * que es la primera que crea `cadCenterMarkEntities`.
 */
function recomposeCenterMarkLine(
  entity: Extract<CadEntity, { type: "line" }>,
  cx: number,
  cy: number,
  ext: number,
): CadPoint2[] {
  const isVertical =
    Math.abs(entity.start.x - entity.end.x) < 1e-9 && Math.abs(entity.start.y - entity.end.y) >= 1e-9;
  return isVertical
    ? [{ x: cx, y: cy - ext }, { x: cx, y: cy + ext }]
    : [{ x: cx - ext, y: cy }, { x: cx + ext, y: cy }];
}

/**
 * Recompone CENTERMARK y CENTERLINE contra las entidades YA editadas del
 * lote. `changedEntityIds` es la lista que ya usan hatches y cotas —
 * `regenerationSourceIds` en `entity-commands.ts`— así que un objetivo
 * borrado llega aquí simplemente AUSENTE de `entities`, exactamente como para
 * `regenerateAssociativeHatches`.
 */
export function regenerateAssociativeCenterMarks(
  entities: readonly CadEntity[],
  changedEntityIds: readonly string[],
): CadCenterMarkRegenerateResult {
  const changed = new Set(changedEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const regeneratedIds: string[] = [];
  const orphanedIds: string[] = [];

  const next = entities.map((entity): CadEntity => {
    if (entity.type !== "line") return entity;
    const metadata = metadataOf(entity);
    const kind = metadata?.mechanical;
    if (kind !== "centermark" && kind !== "centerline") return entity;
    const targetId = readString(metadata, "centerTarget");
    if (!targetId) return entity;
    const targetId2 = kind === "centerline" ? readString(metadata, CAD_CENTER_TARGET_2_METADATA) : null;
    const relevant = changed.has(targetId) || (targetId2 !== null && changed.has(targetId2));
    if (!relevant) return entity;

    const overshoot = readOvershoot(metadata);
    const target = byId.get(targetId);
    const target2 = targetId2 ? byId.get(targetId2) : undefined;

    const declareOrphan = (): CadEntity => {
      orphanedIds.push(entity.id);
      return {
        ...entity,
        context: { ...entity.context, metadata: { ...metadata, [CENTER_ORPHAN_METADATA]: true } },
      };
    };

    if (kind === "centermark") {
      if (!target || (target.type !== "circle" && target.type !== "arc")) return declareOrphan();
      const ext = target.radius + overshoot;
      const [start, end] = recomposeCenterMarkLine(entity, target.center.x, target.center.y, ext);
      regeneratedIds.push(entity.id);
      const clearedMetadata = { ...metadata };
      delete clearedMetadata[CENTER_ORPHAN_METADATA];
      return {
        ...entity,
        start: { ...start, z: entity.start.z },
        end: { ...end, z: entity.end.z },
        context: { ...entity.context, metadata: clearedMetadata },
      };
    }

    // CENTERLINE: los dos objetivos tienen que resolver a un punto.
    if (!target || !target2) return declareOrphan();
    const anchorA = cadCenterlineAnchor(target);
    const anchorB = cadCenterlineAnchor(target2);
    if (!anchorA || !anchorB) return declareOrphan();
    const dx = anchorB.x - anchorA.x;
    const dy = anchorB.y - anchorA.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-9)) return declareOrphan();
    const ux = dx / len;
    const uy = dy / len;
    regeneratedIds.push(entity.id);
    const clearedMetadata = { ...metadata };
    delete clearedMetadata[CENTER_ORPHAN_METADATA];
    return {
      ...entity,
      start: { x: anchorA.x - ux * overshoot, y: anchorA.y - uy * overshoot, z: entity.start.z },
      end: { x: anchorB.x + ux * overshoot, y: anchorB.y + uy * overshoot, z: entity.end.z },
      context: { ...entity.context, metadata: clearedMetadata },
    };
  });

  return { entities: next, regeneratedIds, orphanedIds };
}
