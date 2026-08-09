/**
 * OVERKILL: borrar duplicados y fundir segmentos colineales solapados.
 *
 * ## Por qué un dibujo acumula basura invisible
 *
 * Un DXF importado de otro programa trae la misma línea dos veces. Una
 * polilínea explotada deja tramos que se tocan. Un copiar-pegar con el mismo
 * punto base deja un clon exacto encima del original. Nada de eso se VE —dos
 * líneas idénticas se dibujan como una— y todo eso pesa: multiplica el tiempo
 * de regeneración, duplica las mediciones de longitud y hace que TRIM tenga que
 * elegir entre dos bordes que ocupan el mismo sitio.
 *
 * ## La regla que no se puede romper
 *
 * UN LOTE. Limpiar trescientos duplicados y pulsar Ctrl+Z tiene que devolver
 * los trescientos. Con un lote por objeto, quien pulsa una vez cree que lo ha
 * deshecho todo y se lleva el dibujo a medio limpiar sin enterarse. Por eso
 * este módulo devuelve `CadEntityCommand[]` y no ejecuta nada: quien llama lo
 * pasa entero por `executeCadEntityCommandBatch`.
 *
 * ## Qué compara y qué NO
 *
 * Dos objetos son el mismo si coinciden su geometría y —salvo que se pida
 * ignorarlas— sus propiedades. Ignorar la capa es lo que se pide cuando la
 * importación repartió lo mismo entre dos capas; NO ignorarla es lo correcto
 * por defecto, porque una línea en MUROS y otra idéntica en EJES son dos cosas
 * distintas que casualmente se dibujan encima.
 */
import type { CadEntity, CadPoint2 } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import {
  CAD_ENTITY_REGISTRY,
  type CadEntityRegistry,
  type CadNativeEntity,
} from "./entity-runtime";

export interface CadOverkillOptions {
  /** Distancia por debajo de la cual dos puntos son el mismo. */
  tolerance?: number;
  ignoreLayer?: boolean;
  ignoreColor?: boolean;
  ignoreLinetype?: boolean;
  /**
   * Fundir tramos colineales que se solapan o se tocan por los extremos. Es la
   * mitad cara de OVERKILL y la que más limpia un dibujo explotado.
   */
  combineCollinear?: boolean;
  registry?: CadEntityRegistry;
}

export interface CadOverkillPlan {
  commands: readonly CadEntityCommand[];
  duplicatesRemoved: number;
  segmentsMerged: number;
  examined: number;
}

const DEFAULT_TOLERANCE = 1e-6;

/** Cuantiza a la tolerancia para que dos valores «iguales» den la misma clave. */
function quantize(value: number, tolerance: number): string {
  const step = Math.max(tolerance, Number.EPSILON);
  // `+0` normaliza el `-0` que sale de redondear un negativo diminuto: sin él,
  // dos puntos idénticos darían claves distintas por el signo del cero.
  return String(Math.round(value / step) * step + 0);
}

function presentationKey(entity: CadEntity, options: CadOverkillOptions): string {
  const presentation = "context" in entity ? entity.context?.presentation : undefined;
  const color = options.ignoreColor ? "" : (presentation?.color?.value ?? presentation?.color?.source ?? "");
  const linetype = options.ignoreLinetype
    ? ""
    : (presentation?.linetype?.value ?? presentation?.linetype?.source ?? "");
  const layer = options.ignoreLayer || !("layer" in entity) ? "" : entity.layer;
  return `${layer}|${color}|${linetype}`;
}

/**
 * Huella de la geometría de una entidad.
 *
 * Se construye con `properties.read` del registro para que un tipo nuevo entre
 * en OVERKILL sin tocar este archivo. La LÍNEA es el único caso especial y con
 * motivo: sus dos extremos se ordenan antes de firmar, porque una línea dibujada
 * al revés es la misma línea y sin ordenar no lo parecería.
 */
function geometryKey(
  entity: CadEntity,
  tolerance: number,
  registry: CadEntityRegistry,
): string | null {
  if (entity.type === "line") {
    const a = { x: entity.start.x, y: entity.start.y };
    const b = { x: entity.end.x, y: entity.end.y };
    const [first, second] =
      a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
    return `line:${quantize(first.x, tolerance)},${quantize(first.y, tolerance)},${quantize(second.x, tolerance)},${quantize(second.y, tolerance)}`;
  }
  if (!registry.supports(entity)) return null;
  const bag = registry.adapter(entity).properties.read(entity);
  const parts = Object.entries(bag)
    .filter(([key]) => key !== "layer")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) =>
      typeof value === "number" ? `${key}=${quantize(value, tolerance)}` : `${key}=${value}`,
    );
  return `${entity.type}:${parts.join("|")}`;
}

interface SegmentGroup {
  /** Dirección normalizada del grupo. */
  direction: CadPoint2;
  /** Un punto de la recta soporte. */
  anchor: CadPoint2;
  members: { entity: Extract<CadEntity, { type: "line" }>; from: number; to: number }[];
}

/**
 * Agrupa líneas por su RECTA SOPORTE.
 *
 * La clave es el ángulo llevado a `[0, π)` —una recta no tiene sentido, sólo
 * dirección— más la distancia con signo al origen. Dos tramos de la misma
 * pared caen en el mismo grupo aunque se dibujaran en sentidos opuestos.
 */
function groupCollinear(
  lines: readonly Extract<CadEntity, { type: "line" }>[],
  tolerance: number,
): SegmentGroup[] {
  const groups = new Map<string, SegmentGroup>();
  for (const entity of lines) {
    const dx = entity.end.x - entity.start.x;
    const dy = entity.end.y - entity.start.y;
    const length = Math.hypot(dx, dy);
    if (length < tolerance) continue;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI;
    if (angle >= Math.PI - 1e-12) angle = 0;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -direction.y, y: direction.x };
    const offset = entity.start.x * normal.x + entity.start.y * normal.y;
    const key = `${quantize(angle, tolerance)}|${quantize(offset, tolerance)}`;
    const group =
      groups.get(key) ??
      ({ direction, anchor: { x: entity.start.x, y: entity.start.y }, members: [] } as SegmentGroup);
    const project = (point: { x: number; y: number }) =>
      (point.x - group.anchor.x) * direction.x + (point.y - group.anchor.y) * direction.y;
    const from = project(entity.start);
    const to = project(entity.end);
    group.members.push({ entity, from: Math.min(from, to), to: Math.max(from, to) });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function pointAt(group: SegmentGroup, parameter: number): CadPoint2 {
  return {
    x: group.anchor.x + group.direction.x * parameter,
    y: group.anchor.y + group.direction.y * parameter,
  };
}

/**
 * Plan de OVERKILL. No toca el documento: devuelve el lote.
 *
 * El orden importa. Primero se quitan los duplicados exactos y sólo después se
 * funden los colineales, porque fundir antes tomaría dos clones de la misma
 * línea como «dos tramos que se solapan por completo» y produciría una fusión
 * que no era tal.
 */
export function planCadOverkill(
  entities: readonly CadEntity[],
  options: CadOverkillOptions = {},
): CadOverkillPlan {
  const registry = options.registry ?? CAD_ENTITY_REGISTRY;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const commands: CadEntityCommand[] = [];

  const seen = new Set<string>();
  const survivors: CadEntity[] = [];
  let duplicatesRemoved = 0;
  for (const entity of entities) {
    const geometry = geometryKey(entity, tolerance, registry);
    if (geometry === null) {
      survivors.push(entity);
      continue;
    }
    const key = `${geometry}#${presentationKey(entity, options)}`;
    if (seen.has(key)) {
      commands.push({ type: "delete", entityId: entity.id });
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    survivors.push(entity);
  }

  let segmentsMerged = 0;
  if (options.combineCollinear) {
    const lines = survivors.filter(
      (entity): entity is Extract<CadEntity, { type: "line" }> => entity.type === "line",
    );
    // Se agrupa además por presentación: fundir una línea de MUROS con otra de
    // EJES daría un objeto que no pertenece a ninguna de las dos capas.
    const byPresentation = new Map<string, Extract<CadEntity, { type: "line" }>[]>();
    for (const line of lines) {
      const key = presentationKey(line, options);
      byPresentation.set(key, [...(byPresentation.get(key) ?? []), line]);
    }

    for (const bucket of byPresentation.values())
      for (const group of groupCollinear(bucket, tolerance)) {
        const ordered = [...group.members].sort((a, b) => a.from - b.from);
        let run = [ordered[0]];
        const flush = () => {
          if (run.length < 2) return;
          const from = Math.min(...run.map((member) => member.from));
          const to = Math.max(...run.map((member) => member.to));
          const keeper = run[0].entity;
          commands.push({
            type: "replace",
            entityId: keeper.id,
            entity: {
              ...keeper,
              start: { ...keeper.start, ...pointAt(group, from) },
              end: { ...keeper.end, ...pointAt(group, to) },
            } as CadNativeEntity,
          });
          for (const member of run.slice(1))
            commands.push({ type: "delete", entityId: member.entity.id });
          segmentsMerged += run.length - 1;
        };
        for (const member of ordered.slice(1)) {
          const reach = Math.max(...run.map((entry) => entry.to));
          // `<= reach + tolerancia` cubre a la vez el solape y el contacto justo
          // por el extremo, que es como queda una polilínea explotada.
          if (member.from <= reach + tolerance) run.push(member);
          else {
            flush();
            run = [member];
          }
        }
        flush();
      }
  }

  return { commands, duplicatesRemoved, segmentsMerged, examined: entities.length };
}
