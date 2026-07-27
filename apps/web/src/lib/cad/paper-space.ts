import {
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadLayerDef,
  type CadPaperSpace,
  type CadPaperViewport,
  type CadPoint2,
} from "./cad-document";
import {
  tessellateArc,
  tessellateEllipse,
  tessellateSpline,
} from "./curve-tessellate";

export const CAD_SHEET_PAPERS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
  letter: { width: 215.9, height: 279.4 },
  tabloid: { width: 279.4, height: 431.8 },
} as const;

export type CadSheetPaper = keyof typeof CAD_SHEET_PAPERS;

export const CAD_SHEET_SCALES = [
  1, 2, 5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000,
  5000,
] as const;

export interface CadModelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CadSheetMetadata {
  project: string;
  drawingNumber: string;
  title: string;
  sheetNumber: string;
  revision: string;
  discipline: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
  notes?: string;
}

export interface CadSheetSetManifestRow {
  id: string;
  order: number;
  name: string;
  sheetNumber: string;
  drawingNumber: string;
  title: string;
  revision: string;
  paper: string;
  orientation: "portrait" | "landscape";
  viewportCount: number;
  scales: number[];
}

export interface CadSheetSetManifest {
  schema: 1;
  documentVersion: number;
  generatedAt: string;
  sheets: CadSheetSetManifestRow[];
}

export interface CadVectorStyle {
  stroke: string;
  fill?: string;
  lineWidth: number;
  dash?: number[];
}

export type CadVectorCommand =
  | {
      kind: "path";
      entityId: string;
      viewportId: string;
      points: CadPoint2[];
      closed: boolean;
      style: CadVectorStyle;
    }
  | {
      kind: "text";
      entityId: string;
      viewportId: string;
      point: CadPoint2;
      text: string;
      size: number;
      rotation: number;
      color: string;
      align?: "left" | "center" | "right";
    };

export interface CadPublishWarning {
  code: string;
  sheetId: string;
  viewportId?: string;
  entityId?: string;
  detail: string;
}

export interface CadPublishViewport {
  id: string;
  name: string;
  clip: { x: number; y: number; width: number; height: number };
  scale: number;
  locked: boolean;
  commands: CadVectorCommand[];
}

export interface CadPublishSheet {
  id: string;
  name: string;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  colorMode: "color" | "monochrome";
  lineweightScale: number;
  titleBlock: Record<string, string>;
  viewports: CadPublishViewport[];
}

export interface CadPublishPlan {
  manifest: CadSheetSetManifest;
  sheets: CadPublishSheet[];
  warnings: CadPublishWarning[];
  vectorCommandCount: number;
  rasterCommandCount: 0;
}

const DEFAULT_MARGIN = 10;
const DEFAULT_TITLE_BLOCK_HEIGHT = 30;
const MAX_BLOCK_DEPTH = 8;

function unitToMm(unit: string): number {
  if (unit === "m") return 1000;
  if (unit === "cm") return 10;
  if (unit === "in") return 25.4;
  return 1;
}

function safeText(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function orientedPaper(
  paper: CadSheetPaper,
  orientation: "portrait" | "landscape",
): { width: number; height: number } {
  const base = CAD_SHEET_PAPERS[paper];
  return orientation === "portrait"
    ? { width: base.width, height: base.height }
    : { width: base.height, height: base.width };
}

export function fitCadViewportScale(
  bounds: CadModelBounds,
  paperBounds: { width: number; height: number },
  unit = "mm",
): number {
  const factor = unitToMm(unit);
  const minimum = Math.max(
    (Math.max(1e-9, bounds.width) * factor) / Math.max(1, paperBounds.width),
    (Math.max(1e-9, bounds.height) * factor) / Math.max(1, paperBounds.height),
  );
  return (
    CAD_SHEET_SCALES.find((scale) => scale >= minimum) ??
    CAD_SHEET_SCALES[CAD_SHEET_SCALES.length - 1]
  );
}

export function createCadPaperSpace(input: {
  id: string;
  name: string;
  order: number;
  paper?: CadSheetPaper;
  orientation?: "portrait" | "landscape";
  modelBounds: CadModelBounds;
  unit?: string;
  metadata: CadSheetMetadata;
  scale?: number;
}): CadPaperSpace {
  const paper = input.paper ?? "A1";
  const orientation = input.orientation ?? "landscape";
  const page = orientedPaper(paper, orientation);
  const paperBounds = {
    x: DEFAULT_MARGIN,
    y: DEFAULT_MARGIN,
    width: page.width - DEFAULT_MARGIN * 2,
    height: page.height - DEFAULT_MARGIN * 2 - DEFAULT_TITLE_BLOCK_HEIGHT,
  };
  const scale =
    input.scale ??
    fitCadViewportScale(input.modelBounds, paperBounds, input.unit);
  return {
    id: input.id,
    name: input.name,
    order: input.order,
    includeInPublish: true,
    entityIds: [],
    page: { ...page, unit: "mm", orientation },
    pageSetup: {
      paper,
      margins: {
        top: DEFAULT_MARGIN,
        right: DEFAULT_MARGIN,
        bottom: DEFAULT_MARGIN,
        left: DEFAULT_MARGIN,
      },
      colorMode: "monochrome",
      lineweightScale: 1,
    },
    viewports: [
      {
        id: `${input.id}:viewport:1`,
        name: "Model",
        paperBounds,
        modelBounds: { ...input.modelBounds },
        scale,
        locked: true,
      },
    ],
    titleBlock: {
      attributes: {
        PROJECT: safeText(input.metadata.project, "Untitled project"),
        DRAWING_NO: safeText(input.metadata.drawingNumber, "A-0001"),
        TITLE: safeText(input.metadata.title, input.name),
        SHEET_NO: safeText(input.metadata.sheetNumber, String(input.order + 1)),
        REVISION: safeText(input.metadata.revision, "P01"),
        DISCIPLINE: safeText(input.metadata.discipline, "General"),
        PREPARED_BY: safeText(input.metadata.preparedBy, "-"),
        CHECKED_BY: safeText(input.metadata.checkedBy, "-"),
        APPROVED_BY: safeText(input.metadata.approvedBy, "-"),
        NOTES: safeText(input.metadata.notes, "-"),
      },
    },
  };
}

export function createThreeSheetDemo(input: {
  bounds: CadModelBounds;
  unit?: string;
  metadata: Omit<CadSheetMetadata, "sheetNumber" | "title">;
}): CadPaperSpace[] {
  const halfWidth = Math.max(input.bounds.width / 2, 1);
  const left = { ...input.bounds, width: halfWidth };
  const right = {
    ...input.bounds,
    x: input.bounds.x + input.bounds.width - halfWidth,
    width: halfWidth,
  };
  return [
    createCadPaperSpace({
      id: "sheet-general",
      name: "General",
      order: 0,
      paper: "A1",
      modelBounds: input.bounds,
      unit: input.unit,
      metadata: {
        ...input.metadata,
        sheetNumber: "S-001",
        title: "General plan",
      },
    }),
    createCadPaperSpace({
      id: "sheet-detail-a",
      name: "Detail A",
      order: 1,
      paper: "A3",
      modelBounds: left,
      unit: input.unit,
      metadata: { ...input.metadata, sheetNumber: "S-101", title: "Detail A" },
    }),
    createCadPaperSpace({
      id: "sheet-detail-b",
      name: "Detail B",
      order: 2,
      paper: "A3",
      modelBounds: right,
      unit: input.unit,
      metadata: { ...input.metadata, sheetNumber: "S-102", title: "Detail B" },
    }),
  ];
}

export function reorderCadPaperSpaces(
  spaces: CadPaperSpace[],
  sourceId: string,
  direction: -1 | 1,
): CadPaperSpace[] {
  const ordered = [...spaces].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((space) => space.id === sourceId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((space, order) => ({ ...space, order }));
}

export function buildCadSheetSetManifest(
  document: CadDocument,
  generatedAt = new Date(0).toISOString(),
): CadSheetSetManifest {
  const sheets = document.paperSpaces
    .filter((space) => space.includeInPublish !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
    .map((space, index) => ({
      id: space.id,
      order: index,
      name: space.name,
      sheetNumber: safeText(
        space.titleBlock?.attributes.SHEET_NO,
        String(index + 1),
      ),
      drawingNumber: safeText(space.titleBlock?.attributes.DRAWING_NO, "-"),
      title: safeText(space.titleBlock?.attributes.TITLE, space.name),
      revision: safeText(space.titleBlock?.attributes.REVISION, "-"),
      paper: safeText(space.pageSetup?.paper, "custom"),
      orientation: space.page.orientation,
      viewportCount: space.viewports?.length ?? 0,
      scales: (space.viewports ?? []).map((viewport) => viewport.scale),
    }));
  return {
    schema: 1,
    documentVersion: document.meta.version,
    generatedAt,
    sheets,
  };
}

interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(left: Affine, right: Affine): Affine {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function point(matrix: Affine, value: CadPoint2): CadPoint2 {
  return {
    x: matrix.a * value.x + matrix.c * value.y + matrix.e,
    y: matrix.b * value.x + matrix.d * value.y + matrix.f,
  };
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

function viewportTransform(viewport: CadPaperViewport, unit: string): Affine {
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
  const override = viewport.layerVisibility?.[layerId];
  return override ?? layers.get(layerId)?.visible ?? true;
}

function styleFor(
  entity: CadEntity,
  layerId: string,
  layers: Map<string, CadLayerDef>,
  viewport: CadPaperViewport,
  colorMode: "color" | "monochrome",
  lineweightScale: number,
): CadVectorStyle {
  const layer = layers.get(layerId);
  const override = viewport.layerOverrides?.[layerId];
  const explicit = entity.context?.presentation?.color;
  const color =
    colorMode === "monochrome"
      ? "#111827"
      : (override?.color ??
        (explicit?.source === "explicit" ? explicit.value : undefined) ??
        layer?.color ??
        "#334155");
  const rawWidth =
    override?.lineweight ??
    entity.context?.presentation?.lineweight?.value ??
    layer?.lineweight ??
    0.18;
  return {
    stroke: color || "#334155",
    lineWidth: Math.max(0.05, rawWidth * Math.max(0.1, lineweightScale)),
  };
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

function renderEntity(
  entity: CadEntity,
  context: {
    sheetId: string;
    viewport: CadPaperViewport;
    viewportMatrix: Affine;
    entityMatrix: Affine;
    layers: Map<string, CadLayerDef>;
    blocks: Map<string, CadBlockDefinition>;
    entities: Map<string, CadEntity>;
    colorMode: "color" | "monochrome";
    lineweightScale: number;
    inheritedLayer?: string;
    depth: number;
    stack: string[];
    warnings: CadPublishWarning[];
  },
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
  if (entity.type === "line") {
    return [path([entity.start, entity.end])].filter(
      (value): value is CadVectorCommand => !!value,
    );
  }
  if (entity.type === "polyline") {
    return [path(entity.vertices, entity.closed)].filter(
      (value): value is CadVectorCommand => !!value,
    );
  }
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
    return [
      {
        kind: "text",
        entityId: entity.id,
        viewportId: context.viewport.id,
        point: paper,
        text: entity.text,
        size: Math.max(1.5, Math.min(12, (entity.height ?? 120) * scale)),
        rotation: entity.rotation ?? 0,
        color: style.stroke,
      },
    ];
  }
  if (entity.type === "dimension") {
    const label =
      entity.text ??
      `${Math.hypot(entity.b.x - entity.a.x, entity.b.y - entity.a.y).toFixed(0)} ${"mm"}`;
    const middle = {
      x: (entity.a.x + entity.b.x) / 2,
      y: (entity.a.y + entity.b.y) / 2,
    };
    const commands = [path([entity.a, entity.b])].filter(
      (value): value is CadVectorCommand => !!value,
    );
    commands.push({
      kind: "text",
      entityId: entity.id,
      viewportId: context.viewport.id,
      point: point(matrix, middle),
      text: label,
      size: 2.5,
      rotation:
        (Math.atan2(entity.b.y - entity.a.y, entity.b.x - entity.a.x) * 180) /
        Math.PI,
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
    if (!entity.solid)
      context.warnings.push({
        code: "hatch_pattern_outline_only",
        sheetId: context.sheetId,
        viewportId: context.viewport.id,
        entityId: entity.id,
        detail: `Pattern ${entity.pattern} is published as its vector boundary; pattern strokes are not yet emitted.`,
      });
    return commands;
  }
  if (entity.type === "mleader") {
    const commands = [path(entity.vertices)].filter(
      (value): value is CadVectorCommand => !!value,
    );
    commands.push({
      kind: "text",
      entityId: entity.id,
      viewportId: context.viewport.id,
      point: point(matrix, entity.textPosition),
      text: entity.text,
      size: 2.5,
      rotation: 0,
      color: style.stroke,
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
    const commands = block.entities.flatMap((child) =>
      renderEntity(child, {
        ...context,
        entityMatrix: nestedMatrix,
        inheritedLayer: layerId,
        depth: context.depth + 1,
        stack: [...context.stack, block.id],
      }),
    );
    const attributes = Object.entries(entity.attributes ?? {});
    attributes.forEach(([key, value], index) =>
      commands.push({
        kind: "text",
        entityId: `${entity.id}:attribute:${key}`,
        viewportId: context.viewport.id,
        point: point(multiply(context.viewportMatrix, context.entityMatrix), {
          x: entity.insertion.x,
          y: entity.insertion.y + index * 120,
        }),
        text: value,
        size: 2.2,
        rotation: entity.rotation,
        color: style.stroke,
      }),
    );
    return commands;
  }
  return [];
}

export function buildCadPublishPlan(
  document: CadDocument,
  generatedAt = new Date(0).toISOString(),
): CadPublishPlan {
  const warnings: CadPublishWarning[] = [];
  const layers = new Map(document.layers.map((layer) => [layer.id, layer]));
  const blocks = new Map<string, CadBlockDefinition>();
  document.blocks.forEach((block) => {
    blocks.set(block.id, block);
    blocks.set(block.name, block);
  });
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const manifest = buildCadSheetSetManifest(document, generatedAt);
  const orderedSpaces = document.paperSpaces
    .filter((space) => space.includeInPublish !== false)
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
  const sheets = orderedSpaces.map((space): CadPublishSheet => {
    const colorMode = space.pageSetup?.colorMode ?? "monochrome";
    const lineweightScale = space.pageSetup?.lineweightScale ?? 1;
    const viewports = (space.viewports ?? []).map(
      (viewport): CadPublishViewport => {
        const viewportMatrix = viewportTransform(viewport, document.meta.unit);
        const factor = unitToMm(document.meta.unit) / Math.max(viewport.scale, 1e-9);
        if (
          viewport.modelBounds.width * factor > viewport.paperBounds.width + 1e-6 ||
          viewport.modelBounds.height * factor > viewport.paperBounds.height + 1e-6
        )
          warnings.push({
            code: "viewport_model_clipped",
            sheetId: space.id,
            viewportId: viewport.id,
            detail: `Model bounds exceed viewport at 1:${viewport.scale}; geometry is clipped to paper bounds.`,
          });
        const commands = document.modelSpace.entityIds
          .map((id) => entities.get(id))
          .filter((entity): entity is CadEntity => !!entity)
          .flatMap((entity) =>
            renderEntity(entity, {
              sheetId: space.id,
              viewport,
              viewportMatrix,
              entityMatrix: IDENTITY,
              layers,
              blocks,
              entities,
              colorMode,
              lineweightScale,
              depth: 0,
              stack: [],
              warnings,
            }),
          );
        return {
          id: viewport.id,
          name: viewport.name ?? "Model",
          clip: { ...viewport.paperBounds },
          scale: viewport.scale,
          locked: viewport.locked,
          commands,
        };
      },
    );
    return {
      id: space.id,
      name: space.name,
      width: space.page.width,
      height: space.page.height,
      orientation: space.page.orientation,
      colorMode,
      lineweightScale,
      titleBlock: { ...(space.titleBlock?.attributes ?? {}) },
      viewports,
    };
  });
  const vectorCommandCount = sheets.reduce(
    (sheetTotal, sheet) =>
      sheetTotal +
      sheet.viewports.reduce(
        (viewportTotal, viewport) => viewportTotal + viewport.commands.length,
        0,
      ),
    0,
  );
  return {
    manifest,
    sheets,
    warnings,
    vectorCommandCount,
    rasterCommandCount: 0,
  };
}
