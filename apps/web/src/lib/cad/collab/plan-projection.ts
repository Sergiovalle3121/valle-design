/**
 * Proyección del documento canónico a trazos y rótulos SVG, para la vista de revisión
 * del invitado.
 *
 * ## Por qué el invitado no abre el estudio
 *
 * El estudio es THREE + WebGL + 22.000 líneas de editor, y pide sesión. El
 * cliente que recibe un enlace de revisión no tiene cuenta, puede venir desde
 * un móvil y lo único que necesita es VER el plano y señalar un punto. Un
 * lienzo vectorial que se dibuja con las mismas rutas de render que el editor
 * —el registro de entidades, no una segunda geometría— le da eso sin WebGL,
 * sin descargar nada y sin poder tocar el dibujo, porque aquí no hay ninguna
 * ruta de edición que tocar.
 *
 * Que la geometría salga del MISMO registro es la parte que importa: si
 * saliera de un dibujante propio, el cliente comentaría sobre un plano que no
 * es el que el arquitecto tiene delante, y eso es peor que no enseñarle nada.
 *
 * ## El tope de segmentos
 *
 * Un plano grande puede pasar del millón de puntos o caracteres y el DOM de un móvil no lo
 * aguanta. Cuando se llega al tope, la proyección PARA y lo DECLARA
 * (`truncated`), y quien la usa tiene que decírselo a la persona. Dibujar
 * medio plano callando es la clase de resultado a medias que aquí no vale: el
 * cliente aprobaría un plano al que le falta un ala.
 */
import type { CadDocument, CadEntity, CadPoint2 } from "../cad-document";
import type { CadBounds } from "../entity-runtime";
import { CAD_ENTITY_REGISTRY } from "../entity-runtime";
import { layoutCadMText } from "../mtext-layout";
import { asMText } from "../text-entity-adapter";

/** Tope de puntos de trazo y caracteres de la vista de revisión. Ver cabecera. */
export const CAD_REVIEW_MAX_POINTS = 240_000;
/** Teselado de curvas: suficiente para que un arco no se vea poligonal. */
const SEGMENTS = 64;

export interface CadPlanStroke {
  points: CadPoint2[];
  closed: boolean;
  color: string;
  /** Id de la entidad de origen: el invitado puede señalar QUÉ comenta. */
  entityId: string;
}

/** Rótulo del documento, con líneas y métricas de la misma maqueta del editor. */
export interface CadPlanText {
  entityId: string;
  origin: CadPoint2;
  rotation: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lines: Array<{ text: string; x: number; y: number; width: number; justify: boolean }>;
}

/** Conserva el orden de dibujo al intercalar trazos y rótulos. */
export type CadPlanElement =
  | { kind: "stroke"; stroke: CadPlanStroke }
  | { kind: "text"; text: CadPlanText };

export interface CadPlanProjection {
  strokes: CadPlanStroke[];
  texts: CadPlanText[];
  elements: CadPlanElement[];
  bounds: CadBounds | null;
  /** Presupuesto consumido: puntos de trazo y caracteres de rótulos. */
  points: number;
  /** true ⇒ se alcanzó el tope y FALTA dibujo. Hay que decírselo a la persona. */
  truncated: boolean;
  /** Entidades que ningún adaptador sabe dibujar (formato futuro o dañado). */
  unsupported: number;
}

const DEFAULT_COLOR = "#e5e7eb";

/**
 * Proyecta el espacio modelo. Respeta el ORDEN de `modelSpace.entityIds` —que
 * es el orden de dibujo del documento— y salta las capas apagadas, igual que
 * el editor: un plano de revisión que enseñe la capa de replanteo que el autor
 * apagó no es el plano que el autor mandó.
 */
export function projectCadPlan(
  document: CadDocument,
  maxPoints = CAD_REVIEW_MAX_POINTS,
): CadPlanProjection {
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const layerColor = new Map<string, string>();
  const hiddenLayers = new Set<string>();
  for (const layer of document.layers) {
    layerColor.set(layer.id, layer.color || DEFAULT_COLOR);
    if (!layer.visible) hiddenLayers.add(layer.id);
  }

  const strokes: CadPlanStroke[] = [];
  const texts: CadPlanText[] = [];
  const elements: CadPlanElement[] = [];
  let points = 0;
  let truncated = false;
  let unsupported = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const includePoint = (point: CadPoint2) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  };

  for (const entityId of document.modelSpace.entityIds) {
    if (truncated) break;
    const entity = byId.get(entityId);
    if (!entity) continue;
    if (hiddenLayers.has(entityLayer(entity))) continue;
    if (!CAD_ENTITY_REGISTRY.supports(entity)) {
      unsupported += 1;
      continue;
    }
    const color = layerColor.get(entityLayer(entity)) ?? DEFAULT_COLOR;
    // El registro entrega cajas para hit-test: no son glifos. La maqueta de
    // texto del editor sí contiene las líneas, anclajes y esquinas reales.
    if (entity.type === "text" || entity.type === "mtext") {
      try {
        const source = entity.type === "text" ? asMText(entity) : entity;
        const layout = layoutCadMText(source);
        if (!layout.lines.some((line) => line.text.length > 0)) continue;
        if (
          !Number.isFinite(source.insertion.x) || !Number.isFinite(source.insertion.y) ||
          !Number.isFinite(source.rotation ?? 0) || !Number.isFinite(layout.fontSize) ||
          layout.corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)) ||
          layout.lines.some((line) =>
            !Number.isFinite(line.x) || !Number.isFinite(line.y) || !Number.isFinite(line.width))
        ) {
          unsupported += 1;
          continue;
        }
        // Un plano con miles de párrafos tampoco puede desbordar el DOM móvil.
        const cost = layout.lines.reduce((total, line) => total + Math.max(1, line.text.length), 0);
        if (points + cost > maxPoints) {
          truncated = true;
          break;
        }
        points += cost;
        layout.corners.forEach(includePoint);
        const text: CadPlanText = {
          entityId: entity.id,
          origin: { x: source.insertion.x, y: source.insertion.y },
          rotation: source.rotation ?? 0,
          color,
          fontSize: layout.fontSize,
          fontFamily: layout.fontStack,
          bold: source.bold ?? false,
          italic: source.italic ?? false,
          underline: source.underline ?? false,
          lines: layout.lines,
        };
        texts.push(text);
        elements.push({ kind: "text", text });
      } catch {
        unsupported += 1;
      }
      continue;
    }
    let paths;
    try {
      paths = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
        entity,
        SEGMENTS,
        document,
      );
    } catch {
      // Una entidad que revienta al dibujarse no puede llevarse el plano
      // entero por delante; se cuenta como no soportada y el visor lo dice.
      unsupported += 1;
      continue;
    }
    for (const path of paths) {
      if (path.points.length < 2) continue;
      if (points + path.points.length > maxPoints) {
        truncated = true;
        break;
      }
      points += path.points.length;
      path.points.forEach(includePoint);
      const stroke: CadPlanStroke = {
        points: path.points,
        closed: path.closed,
        color,
        entityId: entity.id,
      };
      strokes.push(stroke);
      elements.push({ kind: "stroke", stroke });
    }
  }

  const bounds =
    minX <= maxX && minY <= maxY ? { minX, minY, maxX, maxY } : null;
  return { strokes, texts, elements, bounds, points, truncated, unsupported };
}

/** `d` de un `<path>` SVG. Coordenadas de DIBUJO: la Y ya crece hacia abajo. */
export function cadPlanStrokePath(stroke: CadPlanStroke): string {
  const [first, ...rest] = stroke.points;
  const head = `M ${round(first.x)} ${round(first.y)}`;
  const body = rest.map((point) => `L ${round(point.x)} ${round(point.y)}`);
  return `${head} ${body.join(" ")}${stroke.closed ? " Z" : ""}`;
}

/**
 * `viewBox` que encuadra el plano con un margen relativo. Un dibujo
 * degenerado —una sola línea horizontal, o vacío— se encuadra igual en vez de
 * producir un viewBox de anchura cero, que en SVG no dibuja nada.
 */
export function cadPlanViewBox(
  bounds: CadBounds | null,
  marginRatio = 0.04,
): { x: number; y: number; width: number; height: number } {
  if (!bounds) return { x: 0, y: 0, width: 1_000, height: 1_000 };
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const margin = Math.max(width, height) * marginRatio;
  return {
    x: bounds.minX - margin,
    y: bounds.minY - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  };
}

function entityLayer(entity: CadEntity): string {
  return (entity as { layer?: string }).layer ?? "0";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
