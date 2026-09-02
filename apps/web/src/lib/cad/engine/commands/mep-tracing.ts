/**
 * DUCT, PIPE y CABLETRAY: el trazado MEP en planta (Ola F, 2026-09-02).
 *
 * Medido antes (`distancia-autocad-completo-20260901.md`, §4 2º MEP): no
 * había entidades ni órdenes MEP; un plano de instalaciones se dibujaba con
 * LINE en capas a mano y sin tipo de línea que dijera el servicio.
 *
 * Las tres se teclean como LINE —punto a punto, Intro para terminar, desHacer
 * retira el último vértice— y emiten UN lote al terminar:
 *
 *   - PIPE: una POLYLINE por tramo continuo, en la capa del servicio (agua
 *     Fría, agua Caliente, Sanitario, Pluvial, Gas, contra Incendio) cuyo tipo
 *     de línea con texto la rotula en planta; el `Diámetro` nominal viaja en
 *     `context.metadata` para el cuadro de instalaciones.
 *   - DUCT y CABLETRAY: el contorno a doble línea con las esquinas a inglete
 *     (`cadDoubleLineOutline`) y el EJE como polilínea con tipo de línea
 *     CENTER; el `aNcho` es geometría (en la unidad del documento). El cuadro
 *     mide la longitud por el eje, no por el contorno.
 *
 * La capa del servicio se da de alta si no existe, con su color y su tipo de
 * línea, y no se toca si ya existe. Nada se persiste fuera del formato: son
 * polilíneas, capas y metadatos que el esquema ya tiene.
 *
 * ## Lo que NO hacen, dicho aquí
 *
 *   - Sin accesorios automáticos (codos, tes, reducciones como símbolos): el
 *     codo es la esquina a inglete del propio contorno; una te se traza como
 *     dos tramos. Sin ruteo con colisiones ni diámetros por especificación:
 *     es la mitad 3D de MEP y queda fuera, como dice la distancia.
 *   - Sin tramos curvos (arcos) ni pendientes: la planta es 2D.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
  type CadKeyword,
  type CadPreviewPath,
} from "../command-types";
import { cadFromMillimetres, cadMillimetresLabel } from "./architecture-support";
import { cadDoubleLineOutline, cadMepLayerCommands, cadMepServicesOf, cadPathLength, type CadMepKind, type CadMepService } from "./mep-support";
import { formatMagnitude } from "./solids-support";

const SIZE_KEYWORD: Record<CadMepKind, CadKeyword> = {
  pipe: { keyword: "Diámetro", shortcut: "D" },
  duct: { keyword: "aNcho", shortcut: "N" },
  tray: { keyword: "aNcho", shortcut: "N" },
};
const UNDO = { keyword: "desHacer", shortcut: "H" } as const;

const NOUN: Record<CadMepKind, string> = { pipe: "la tubería", duct: "el ducto", tray: "la charola" };

interface TracingState {
  points: CadPoint2[];
  service: CadMepService;
  /** Diámetro nominal en mm (tubería) o ancho en unidades del documento (ducto y charola). */
  size: number;
  pending: "none" | "size";
}

function sizePrompt(kind: CadMepKind): string {
  return kind === "pipe" ? "Precise el diámetro nominal en mm" : `Precise el ancho de ${NOUN[kind].replace(/^(el|la) /, "")}`;
}

function preview(state: TracingState, kind: CadMepKind, cursor: CadPoint2 | undefined): CadPreviewPath[] {
  const points = cursor && state.points.length > 0 ? [...state.points, cursor] : state.points;
  if (points.length < 2) return [];
  if (kind === "pipe") return [{ points, closed: false }];
  const outline = cadDoubleLineOutline(points, state.size);
  return [{ points, closed: false }, ...(outline ? [{ points: outline, closed: true }] : [])];
}

function ask(state: TracingState, kind: CadMepKind, context: CadCommandContext): CadCommandStep<TracingState> {
  if (state.pending === "size")
    return { state, prompt: { message: sizePrompt(kind), options: [], defaultValue: String(state.size) }, accepts: CAD_ACCEPT_DISTANCE };
  const services = cadMepServicesOf(kind).flatMap((service) => (service.keyword ? [service.keyword] : []));
  const options = [...services, SIZE_KEYWORD[kind], ...(state.points.length > 0 ? [UNDO] : [])];
  const recipe = kind === "pipe" ? `${state.service.label} Ø${formatMagnitude(state.size)} mm en ${state.service.layer}.` : `${state.service.label}, ancho ${cadMillimetresLabel(state.size, context.unit)} mm en ${state.service.layer}.`;
  return {
    state,
    prompt: {
      message: state.points.length === 0 ? `${recipe} Precise el punto inicial de ${NOUN[kind]}` : `${recipe} Precise el punto siguiente`,
      options,
    },
    // Sin `CAD_ACCEPT_DISTANCE`, como LINE: un número suelto es entrada
    // directa sobre la dirección del cursor y la resuelve el pipeline.
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    preview: preview(state, kind, context.cursor),
  };
}

function lift(point: CadPoint2): CadPoint3 {
  return { x: point.x, y: point.y, z: 0 };
}

/** El lote de un trazado: la capa si falta, y la geometría con sus metadatos. */
export function cadMepTracingCommands(kind: CadMepKind, state: TracingState, context: CadCommandContext): { commands: CadEntityCommand[]; notice: string } | { refused: string } {
  const points = state.points.filter((point, index) => index === 0 || Math.hypot(point.x - state.points[index - 1].x, point.y - state.points[index - 1].y) > 1e-9);
  if (points.length < 2) return { refused: `${kind.toUpperCase()} necesita al menos dos puntos.` };
  const layer = state.service.layer;
  const length = cadPathLength(points);
  const metadata = { mep: kind, service: state.service.id, size: state.size };
  const commands: CadEntityCommand[] = [...cadMepLayerCommands(state.service, context)];
  if (kind === "pipe") {
    const pipe: CadNativeEntity = { id: context.newEntityId(), type: "polyline", vertices: points.map(lift), closed: false, layer, context: { metadata } };
    commands.push({ type: "insert", entity: pipe });
    return {
      commands,
      notice: `PIPE: ${points.length - 1} tramo(s) de ${state.service.label.toLowerCase()} Ø${formatMagnitude(state.size)} mm, ${cadMillimetresLabel(length, context.unit)} mm en la capa ${layer}.`,
    };
  }
  const outline = cadDoubleLineOutline(points, state.size);
  if (!outline) return { refused: `${kind === "duct" ? "DUCT" : "CABLETRAY"} necesita un ancho mayor que cero y dos puntos distintos.` };
  const ring: CadNativeEntity = { id: context.newEntityId(), type: "polyline", vertices: outline.map(lift), closed: true, layer, context: { metadata: { ...metadata, outline: true } } };
  const axis: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices: points.map(lift),
    closed: false,
    layer,
    context: { metadata: { ...metadata, axis: true }, presentation: { linetype: { source: "explicit", value: "CENTER" } } },
  };
  commands.push({ type: "insert", entity: ring }, { type: "insert", entity: axis });
  const label = kind === "duct" ? "DUCT" : "CABLETRAY";
  return {
    commands,
    notice: `${label}: ${points.length - 1} tramo(s) de ${state.service.label.toLowerCase()}, ancho ${cadMillimetresLabel(state.size, context.unit)} mm, ${cadMillimetresLabel(length, context.unit)} mm por el eje en la capa ${layer}.`,
  };
}

function finish(kind: CadMepKind, state: TracingState, context: CadCommandContext, label: string): CadCommandStep<TracingState> {
  if (state.points.length < 2)
    return { state, prompt: { message: "", options: [] }, accepts: 0, result: state.points.length === 0 ? { kind: "none" } : { kind: "message", text: `${label} necesita al menos dos puntos.` } };
  const built = cadMepTracingCommands(kind, state, context);
  if ("refused" in built) return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: built.refused } };
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "document", commands: built.commands, label, notice: built.notice } };
}

function tracingCommand(name: string, aliases: readonly string[], kind: CadMepKind): CadCommandDescriptor<TracingState> {
  const services = cadMepServicesOf(kind);
  return {
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => {
      const service = services[0];
      const size = kind === "pipe" ? service.defaultSize : cadFromMillimetres(service.defaultSize, context.unit);
      return ask({ points: [], service, size, pending: "none" }, kind, context);
    },
    step: (state, input: CadCommandInput, context) => {
      if (input.kind === "cancel") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
      if (state.pending === "size") {
        if (input.kind === "enter") return ask({ ...state, pending: "none" }, kind, context);
        if (input.kind !== "distance") return ask(state, kind, context);
        const value = Math.abs(input.value);
        if (!(value > 1e-9)) return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text: `${name}: ${kind === "pipe" ? "el diámetro" : "el ancho"} tiene que ser mayor que cero.` } };
        return ask({ ...state, size: value, pending: "none" }, kind, context);
      }
      if (input.kind === "keyword") {
        if (input.keyword === SIZE_KEYWORD[kind].keyword) return ask({ ...state, pending: "size" }, kind, context);
        if (input.keyword === UNDO.keyword) return ask({ ...state, points: state.points.slice(0, -1) }, kind, context);
        const service = services.find((candidate) => candidate.keyword?.keyword === input.keyword);
        if (!service) return ask(state, kind, context);
        // Cambiar de servicio conserva el tamaño tecleado si lo hubo; si no,
        // toma el de fábrica del servicio nuevo.
        const size = state.size === (kind === "pipe" ? state.service.defaultSize : cadFromMillimetres(state.service.defaultSize, context.unit))
          ? (kind === "pipe" ? service.defaultSize : cadFromMillimetres(service.defaultSize, context.unit))
          : state.size;
        return ask({ ...state, service, size }, kind, context);
      }
      if (input.kind === "enter") return finish(kind, state, context, name);
      if (input.kind !== "point") return ask(state, kind, context);
      return ask({ ...state, points: [...state.points, input.point] }, kind, context);
    },
  };
}

export const CAD_MEP_TRACING_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(tracingCommand("PIPE", ["PIPEADD", "TUBERIA"], "pipe")),
  asCadCommand(tracingCommand("DUCT", ["DUCTADD", "DUCTO"], "duct")),
  asCadCommand(tracingCommand("CABLETRAY", ["CABLETRAYADD", "CHAROLA"], "tray")),
];
