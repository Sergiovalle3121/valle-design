/**
 * Proyección de UNA entidad del modelo a los comandos vectoriales del papel.
 *
 * Salió de `paper-space.ts` por el trinquete de tamaño (`check-monolith-budget`),
 * no por un cambio de contrato: `buildCadPublishPlan` sigue siendo la puerta
 * pública y llama aquí por cada entidad de cada ventana. Este módulo importa de
 * `paper-space.ts` SÓLO tipos (se borran al compilar), así que no cierra ciclo.
 */
import {
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadEntityPresentation,
  type CadLayerDef,
  type CadPaperViewport,
  type CadPoint2,
} from "./cad-document";
import type { CadPublishWarning, CadVectorCommand, CadVectorStyle } from "./paper-space";
import { cadLayerShown } from "./cad-layer-visibility";
import { buildCadHatchPublishStrokes } from "./hatch-publish-strokes";
import { tessellateArc, tessellateEllipse, tessellateSpline } from "./curve-tessellate";
import { buildCadDimensionGeometry } from "./associative-dimension";
import { buildCadMleaderGeometry } from "./associative-mleader";
import { plotEntityFromRegistry } from "./paper-space-registry-fallback";
import { cadTableCellTextCommands } from "./paper-space-table";
import { cadLinetypeTextCommands } from "./paper-space-linetype-text";
import { cadImagePlotCommand } from "./paper-space-image";
import { multiply, point, type Affine } from "./paper-space-affine";
import { blockPresentation, styleFor, unitToMm } from "./paper-space-style";
import {
  cadAnnotativeDimensionSizes,
  cadAnnotativeHeightMm,
  cadAnnotativeModelHeight,
} from "./layout/annotative-scale";

/** Profundidad máxima de bloques anidados antes de cortar (y avisar). */
const MAX_BLOCK_DEPTH = 8;

/** Lo que `renderEntity` necesita para proyectar UNA entidad a una ventana. */
export interface CadRenderEntityContext {
  sheetId: string;
  viewport: CadPaperViewport;
  viewportMatrix: Affine;
  entityMatrix: Affine;
  layers: Map<string, CadLayerDef>;
  blocks: Map<string, CadBlockDefinition>;
  entities: Map<string, CadEntity>;
  /** Para la geometría DERIVADA (un muro mira a sus vecinos, un hueco a su anfitrión). */
  document: CadDocument;
  colorMode: "color" | "monochrome";
  lineweightScale: number;
  inheritedLayer?: string;
  inheritedPresentation?: CadEntityPresentation;
  depth: number;
  stack: string[];
  warnings: CadPublishWarning[];
}

function insertTransform(
  entity: Extract<CadEntity, { type: "insert" }>,
  block: CadBlockDefinition,
): Affine {
  const radians = (entity.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return multiply(
    { a: 1, b: 0, c: 0, d: 1, e: entity.insertion.x, f: entity.insertion.y },
    multiply(
      { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
      multiply(
        { a: entity.scale.x, b: 0, c: 0, d: entity.scale.y, e: 0, f: 0 },
        {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: -block.basePoint.x,
          f: -block.basePoint.y,
        },
      ),
    ),
  );
}

export function viewportTransform(viewport: CadPaperViewport, unit: string): Affine {
  const factor = unitToMm(unit) / Math.max(viewport.scale, 1e-9);
  const drawnWidth = viewport.modelBounds.width * factor;
  const drawnHeight = viewport.modelBounds.height * factor;
  const offsetX =
    viewport.paperBounds.x + (viewport.paperBounds.width - drawnWidth) / 2;
  const offsetY =
    viewport.paperBounds.y + (viewport.paperBounds.height - drawnHeight) / 2;
  return {
    a: factor,
    b: 0,
    c: 0,
    d: -factor,
    e: offsetX - viewport.modelBounds.x * factor,
    f:
      offsetY + (viewport.modelBounds.y + viewport.modelBounds.height) * factor,
  };
}

function entityLayer(entity: CadEntity, inherited?: string): string {
  return entity.layer === "0" && inherited ? inherited : entity.layer;
}

function visibleLayer(
  layerId: string,
  layers: Map<string, CadLayerDef>,
  viewport: CadPaperViewport,
): boolean {
  const layer = layers.get(layerId);
  // T-19·3: `plot:false` es del papel (se ve, nunca imprime, sin anulación
  // por ventana); la ventana SÍ anula apagada/congelada (cad-layer-visibility.ts).
  if (layer?.plot === false) return false;
  return viewport.layerVisibility?.[layerId] ?? (!layer || cadLayerShown(layer));
}

function rectPoints(
  entity: Extract<CadEntity, { type: "box" | "station" }>,
): CadPoint2[] {
  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const radians = (entity.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: -entity.h / 2 },
    { x: entity.w / 2, y: entity.h / 2 },
    { x: -entity.w / 2, y: entity.h / 2 },
  ].map((value) => ({
    x: cx + value.x * cos - value.y * sin,
    y: cy + value.x * sin + value.y * cos,
  }));
}

function centerOf(entity: CadEntity): CadPoint2 | null {
  if (entity.type === "box" || entity.type === "station")
    return { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 };
  if (
    entity.type === "circle" ||
    entity.type === "arc" ||
    entity.type === "ellipse"
  )
    return { x: entity.center.x, y: entity.center.y };
  return null;
}

function commandPath(
  entityId: string,
  viewportId: string,
  points: CadPoint2[],
  closed: boolean,
  matrix: Affine,
  style: CadVectorStyle,
  fill?: string,
): CadVectorCommand | null {
  if (points.length < 2) return null;
  return {
    kind: "path",
    entityId,
    viewportId,
    points: points.map((value) => point(matrix, value)),
    closed,
    style: { ...style, ...(fill ? { fill } : {}) },
  };
}

export function renderEntity(
  entity: CadEntity,
  context: CadRenderEntityContext,
): CadVectorCommand[] {
  const layerId = entityLayer(entity, context.inheritedLayer);
  if (!visibleLayer(layerId, context.layers, context.viewport)) return [];
  const matrix = multiply(context.viewportMatrix, context.entityMatrix);
  const style = styleFor(
    entity,
    layerId,
    context.layers,
    context.viewport,
    context.colorMode,
    context.lineweightScale,
    context.inheritedPresentation,
    context.document,
  );
  const path = (points: CadPoint2[], closed = false, fill?: string) =>
    commandPath(
      entity.id,
      context.viewport.id,
      points,
      closed,
      matrix,
      style,
      fill,
    );
  if (entity.type === "box" || entity.type === "station") {
    const fill =
      entity.type === "box" && entity.kind === "zone"
        ? context.colorMode === "monochrome"
          ? "#f3f4f6"
          : "#dbeafe"
        : undefined;
    return [path(rectPoints(entity), true, fill)].filter(
      (value): value is CadVectorCommand => !!value,
    );
  }
  // GAS_LINE y familia (Ola F): el guion va en `style.dash`; el texto, aquí.
  const linetypeTexts = (points: (CadPoint2 & { bulge?: number })[], closed: boolean) =>
    cadLinetypeTextCommands(points, closed, {
      entityId: entity.id, viewportId: context.viewport.id, linetype: style.linetype,
      toPaper: (anchor) => point(matrix, anchor), linetypeScale: context.document.meta.linetypeScale ?? 1, color: style.stroke,
    });
  if (entity.type === "line")
    return [...[path([entity.start, entity.end])].filter((value): value is CadVectorCommand => !!value), ...linetypeTexts([entity.start, entity.end], false)];
  if (entity.type === "polyline")
    return [...[path(entity.vertices, entity.closed)].filter((value): value is CadVectorCommand => !!value), ...linetypeTexts(entity.vertices, entity.closed)];
  if (entity.type === "circle") {
    const points = tessellateArc(entity.center, entity.radius, 0, 360, 96);
    return [path(points, true)].filter(
      (value): value is CadVectorCommand => !!value,
    );
  }
  if (entity.type === "arc") {
    const points = tessellateArc(
      entity.center,
      entity.radius,
      entity.startAngle,
      entity.endAngle,
      96,
    );
    return [path(points)].filter((value): value is CadVectorCommand => !!value);
  }
  if (entity.type === "ellipse") {
    const points = tessellateEllipse(
      entity.center,
      entity.majorAxis,
      entity.ratio,
      entity.startParameter,
      entity.endParameter,
      96,
    );
    return [
      path(
        points,
        Math.abs(entity.endParameter - entity.startParameter) >= 359.999,
      ),
    ].filter((value): value is CadVectorCommand => !!value);
  }
  if (entity.type === "spline") {
    const points = tessellateSpline(
      entity.controlPoints,
      entity.degree,
      entity.knots,
      96,
    );
    return [path(points, !!entity.closed)].filter(
      (value): value is CadVectorCommand => !!value,
    );
  }
  if (entity.type === "text" || entity.type === "mtext") {
    const anchor =
      entity.type === "text" ? { x: entity.x, y: entity.y } : entity.insertion;
    const paper = point(matrix, anchor);
    const scale = Math.hypot(matrix.a, matrix.b);
    // T-36: anotativa se resuelve POR VENTANA, sin tocar `entity.height`. La
    // altura persistida puede ser la que dejó otra ventana a otra escala; la
    // efectiva se recalcula aquí mismo para ÉSTA, cada vez que se traza.
    const annotativeMm = cadAnnotativeHeightMm(entity);
    const effectiveHeight =
      annotativeMm !== null
        ? cadAnnotativeModelHeight(annotativeMm, context.viewport.scale, context.document.meta.unit)
        : (entity.height ?? 120);
    return [
      {
        kind: "text",
        entityId: entity.id,
        viewportId: context.viewport.id,
        point: paper,
        text: entity.text,
        size: Math.max(1.5, Math.min(12, effectiveHeight * scale)),
        rotation: entity.rotation ?? 0,
        color: style.stroke,
        ...(entity.type === "mtext" ? {
          align: entity.paragraphAlignment ?? "left",
          maxWidth: (entity.width ?? effectiveHeight * 20) * scale,
          bold: entity.bold,
          italic: entity.italic,
          underline: entity.underline,
          backgroundMask: entity.backgroundMask,
          backgroundColor: entity.backgroundColor,
        } : {}),
      },
    ];
  }
  if (entity.type === "dimension") {
    // T-36: igual que el texto, pero el juego COMPLETO de tamaños (flecha,
    // huecos, exceso) — una copia efímera, nunca escrita al documento.
    const annotativeMm = cadAnnotativeHeightMm(entity);
    const effectiveEntity =
      annotativeMm !== null
        ? {
            ...entity,
            ...cadAnnotativeDimensionSizes(entity, annotativeMm, context.viewport.scale, context.document.meta.unit),
          }
        : entity;
    const geometry = buildCadDimensionGeometry(effectiveEntity);
    if (!geometry) return [];
    const commands = geometry.paths.map((item) => path(item.points, item.closed)).filter(
      (value): value is CadVectorCommand => !!value,
    );
    commands.push({
      kind: "text",
      entityId: entity.id,
      viewportId: context.viewport.id,
      point: point(matrix, geometry.textAnchor),
      text: geometry.label,
      size: Math.max(1.5, Math.min(8, (effectiveEntity.arrowSize ?? 180) * Math.hypot(matrix.a, matrix.b) * 0.55)),
      rotation: geometry.textAngle,
      color: style.stroke,
      align: "center",
    });
    return commands;
  }
  if (entity.type === "hatch") {
    const commands = entity.boundaries
      .map((boundary) =>
        path(
          boundary,
          true,
          entity.solid
            ? context.colorMode === "monochrome"
              ? "#d1d5db"
              : style.stroke
            : undefined,
        ),
      )
      .filter((value): value is CadVectorCommand => !!value);
    // El patrón viaja como trazos reales; la guarda de densidad degrada a
    // contorno con aviso honesto antes que fabricar un PDF imposible.
    const pattern = buildCadHatchPublishStrokes(entity, Math.hypot(matrix.a, matrix.b));
    // Las líneas de la trama son CONTINUAS aunque la capa lleve tipo de línea:
    // AutoCAD no raya un sombreado con el patrón de su capa.
    const hatchStyle: CadVectorStyle = { stroke: style.stroke, lineWidth: style.lineWidth, ...(style.fill ? { fill: style.fill } : {}) };
    for (const segment of pattern.strokes) {
      const stroke = commandPath(entity.id, context.viewport.id, [segment.a, segment.b], false, matrix, hatchStyle);
      if (stroke) commands.push(stroke);
    }
    if (pattern.warning)
      context.warnings.push({ ...pattern.warning, sheetId: context.sheetId, viewportId: context.viewport.id, entityId: entity.id });
    return commands;
  }
  if (entity.type === "mleader") {
    const geometry = buildCadMleaderGeometry(entity);
    if (!geometry) return [];
    const commands = geometry.paths.map((item) => path(item.points, item.closed)).filter((value): value is CadVectorCommand => !!value);
    const scale = Math.hypot(matrix.a, matrix.b);
    commands.push({
      kind: "text",
      entityId: entity.id,
      viewportId: context.viewport.id,
      point: point(matrix, geometry.textAnchor),
      text: entity.text,
      size: Math.max(1.5, Math.min(12, (entity.textHeight ?? 120) * scale)),
      rotation: entity.textRotation ?? 0,
      color: style.stroke,
      align: entity.textAlignment ?? "left",
      maxWidth: (entity.textWidth ?? 1800) * scale,
      bold: entity.bold,
      italic: entity.italic,
      underline: entity.underline,
      backgroundMask: entity.backgroundMask,
      backgroundColor: entity.backgroundColor,
    });
    return commands;
  }
  if (entity.type === "connector") {
    const from = context.entities.get(entity.from);
    const to = context.entities.get(entity.to);
    const a = from ? centerOf(from) : null;
    const b = to ? centerOf(to) : null;
    return a && b
      ? [path([a, b])].filter((value): value is CadVectorCommand => !!value)
      : [];
  }
  if (entity.type === "insert") {
    const block = context.blocks.get(entity.block);
    if (!block) {
      context.warnings.push({
        code: "block_definition_missing",
        sheetId: context.sheetId,
        viewportId: context.viewport.id,
        entityId: entity.id,
        detail: `Block ${entity.block} is not available.`,
      });
      return [];
    }
    if (context.depth >= MAX_BLOCK_DEPTH || context.stack.includes(block.id)) {
      context.warnings.push({
        code: "block_cycle_or_depth",
        sheetId: context.sheetId,
        viewportId: context.viewport.id,
        entityId: entity.id,
        detail: `Block ${block.name} exceeded nesting depth or contains a cycle.`,
      });
      return [];
    }
    const nestedMatrix = multiply(
      context.entityMatrix,
      insertTransform(entity, block),
    );
    const effectiveInsertPresentation = blockPresentation(
      entity.context?.presentation,
      context.inheritedPresentation,
    );
    const commands = block.entities.flatMap((child) =>
      renderEntity(child, {
        ...context,
        entityMatrix: nestedMatrix,
        inheritedLayer: layerId,
        inheritedPresentation: effectiveInsertPresentation,
        depth: context.depth + 1,
        stack: [...context.stack, block.id],
      }),
    );
    Object.entries(block.attributes ?? {}).forEach(([key, definition], index) => {
      if (definition.invisible) return;
      const value = definition.constant
        ? (definition.defaultValue ?? "")
        : (entity.attributes?.[key] ?? definition.defaultValue ?? "");
      if (!value) return;
      const anchor = definition.position ?? {
        x: block.basePoint.x,
        y: block.basePoint.y + index * 120,
      };
      commands.push({
        kind: "text",
        entityId: `${entity.id}:attribute:${key}`,
        viewportId: context.viewport.id,
        point: point(multiply(context.viewportMatrix, nestedMatrix), anchor),
        text: value,
        size: Math.max(1.5, Math.min(12, (definition.height ?? 120) * Math.hypot(nestedMatrix.a, nestedMatrix.b) * Math.hypot(context.viewportMatrix.a, context.viewportMatrix.b))),
        rotation: Math.atan2(nestedMatrix.b, nestedMatrix.a) * 180 / Math.PI,
        color: style.stroke,
      });
    });
    return commands;
  }

  // Ola H: la imagen adjunta va con sus píxeles DEBAJO de su marco, que sigue
  // saliendo del registro. Lo que no se puede incrustar se dice en un aviso.
  if (entity.type === "image") {
    const raster = cadImagePlotCommand(entity, context.document, context.viewport.id, (anchor) => point(matrix, anchor));
    if (raster.skipped)
      context.warnings.push({ code: raster.skipped.code, sheetId: context.sheetId, viewportId: context.viewport.id, entityId: entity.id, detail: raster.skipped.detail });
    const frame = plotEntityFromRegistry(entity, context.document, { sheetId: context.sheetId, viewportId: context.viewport.id }, (points, closed) => path(points, closed) ?? null);
    if (frame.warning) context.warnings.push(frame.warning);
    return [...(raster.command ? [raster.command] : []), ...frame.commands];
  }

  // Lo que la escalera no supo trazar lo traza el REGISTRO. Doce tipos —muro y
  // hueco entre ellos— desaparecían del PDF en silencio; el porqué, en la
  // cabecera de `paper-space-registry-fallback.ts`.
  const fallback = plotEntityFromRegistry(
    entity,
    context.document,
    { sheetId: context.sheetId, viewportId: context.viewport.id },
    (points, closed) => path(points, closed) ?? null,
  );
  if (fallback.warning) context.warnings.push(fallback.warning);
  // El registro aporta la rejilla de una TABLE; el texto de sus celdas iba
  // a ninguna parte (medido: 3 caminos, 0 textos). Ver paper-space-table.ts.
  if (entity.type === "table")
    return [
      ...fallback.commands,
      ...cadTableCellTextCommands(entity, {
        viewportId: context.viewport.id,
        toPaper: (anchor) => point(matrix, anchor),
        scale: Math.hypot(matrix.a, matrix.b),
        color: style.stroke,
      }),
    ];
  return fallback.commands;
}
