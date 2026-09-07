import {
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadPaperSpace,
  type CadPaperViewport,
  type CadPoint2,
} from "./cad-document";
import { cadPlanViewport } from "./cad-paper-viewport";
import type { CadImagePlotCommand } from "./paper-space-image";
import { IDENTITY } from "./paper-space-affine";
import { unitToMm } from "./paper-space-style";
import { renderEntity, viewportTransform } from "./paper-space-render";

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
  /** Nombre efectivo del tipo de línea; con él se rotulan los complejos (Ola F). */
  linetype?: string;
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
      align?: "left" | "center" | "right" | "justify";
      maxWidth?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      backgroundMask?: boolean;
      backgroundColor?: string;
    }
  // Ola H: los píxeles de una imagen adjunta. Ver paper-space-image.ts.
  | CadImagePlotCommand;

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
  /** Contorno REAL de una ventana no rectangular (T-19·4). Ausente = rectangular. */
  clipPolygon?: readonly CadPoint2[];
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
  /** Dibujado DIRECTAMENTE sobre el papel, fuera de toda ventana (T-30). */
  paperCommands?: CadVectorCommand[];
}

export interface CadPublishPlan {
  manifest: CadSheetSetManifest;
  sheets: CadPublishSheet[];
  warnings: CadPublishWarning[];
  vectorCommandCount: number;
  /** Comandos `image`: imágenes adjuntas que van al PDF con sus píxeles (Ola H). */
  rasterCommandCount: number;
}

const DEFAULT_MARGIN = 10;
const DEFAULT_TITLE_BLOCK_HEIGHT = 30;


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
    // Nace mirando en PLANTA y lo declara; el porqué, en `cadPlanViewport`.
    viewports: [cadPlanViewport(`${input.id}:viewport:1`, paperBounds, input.modelBounds, scale)],
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
  // T-19·4: una entidad de PAPEL (el contorno de una ventana poligonal, un
  // cajetín) puede quedar TAMBIÉN en `modelSpace.entityIds` por un defecto de
  // quien la insertó — el aplicador genérico de "insert" no distingue espacio
  // destino. Sin este filtro, esa entidad se proyecta como geometría de
  // MODELO con sus coordenadas de PAPEL dentro de CADA ventana del dibujo.
  const paperSpaceEntityIds = new Set(
    document.paperSpaces.flatMap((space) => space.entityIds ?? []),
  );
  const manifest = buildCadSheetSetManifest(document, generatedAt);
  const orderedSpaces = document.paperSpaces
    .filter((space) => space.includeInPublish !== false)
    .sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
  document.externalReferences.forEach((reference) => {
    const status = reference.status ?? (reference.loaded ? "loaded" : "unloaded");
    if (status === "loaded") return;
    orderedSpaces.forEach((space) => warnings.push({
      code: status === "unloaded" ? "xref_unloaded" : `xref_${status}_cache`,
      sheetId: space.id,
      entityId: reference.insertId,
      detail: status === "unloaded"
        ? `Xref ${reference.name} is unloaded and is omitted from publication.`
        : `Xref ${reference.name} is ${status}; publication uses its last loaded vector cache.`,
    }));
  });
  const sheets = orderedSpaces.map((space): CadPublishSheet => {
    const colorMode = space.pageSetup?.colorMode ?? "monochrome";
    const lineweightScale = space.pageSetup?.lineweightScale ?? 1;
    // La fuga se cuenta UNA vez por hoja, no por ventana: es la misma lista de
    // modelo para todas las ventanas de esta presentación.
    const modelEntityIds = document.modelSpace.entityIds.filter(
      (id) => !paperSpaceEntityIds.has(id),
    );
    for (const id of document.modelSpace.entityIds)
      if (paperSpaceEntityIds.has(id))
        warnings.push({
          code: "paper_space_entity_excluded_from_model",
          sheetId: space.id,
          entityId: id,
          detail: "Entity belongs to paper space and is excluded from every model viewport on this sheet.",
        });
    // T-31·d: `MVIEW Desactivada` (apagada, no borrada) también en PUBLISH —
    // antes sólo PLOT la respetaba; publicar dibujaba igual una ventana que
    // el usuario apagó a propósito. Misma regla que `cadViewportIsOn`
    // (`layout/viewport-operations.ts`), repetida a propósito: importar ese
    // módulo aquí cierra un ciclo real (él importa `CAD_SHEET_SCALES` de
    // ESTE archivo a nivel de módulo) que revienta en tiempo de carga.
    const viewports = (space.viewports ?? [])
      .filter((viewport) => viewport.layerVisibility?.["*"] !== false)
      .map((viewport): CadPublishViewport => {
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
        const commands = modelEntityIds
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
              document,
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
          // T-19·4: el contorno REAL de una ventana poligonal, no sólo su
          // rectángulo envolvente — para que el PDF recorte la forma exacta.
          ...(viewport.clipPolygon ? { clipPolygon: viewport.clipPolygon } : {}),
          scale: viewport.scale,
          locked: viewport.locked,
          commands,
        };
      },
    );
    // T-30: lo que se dibuja DIRECTAMENTE sobre el papel (líneas, texto, el
    // propio contorno de una ventana poligonal) — `space.entityIds`, nunca
    // proyectado por ninguna ventana. Ventana sintética 1:1 en identidad:
    // una entidad de papel ya está en mm de papel, no en unidades de modelo.
    const paperViewport: CadPaperViewport = {
      id: `${space.id}:paper`,
      name: "Papel",
      paperBounds: { x: 0, y: 0, width: space.page.width, height: space.page.height },
      modelBounds: { x: 0, y: 0, width: space.page.width, height: space.page.height },
      scale: 1,
      locked: true,
    };
    const paperCommands = (space.entityIds ?? [])
      .map((id) => entities.get(id))
      .filter((entity): entity is CadEntity => !!entity)
      .flatMap((entity) =>
        renderEntity(entity, {
          sheetId: space.id,
          viewport: paperViewport,
          viewportMatrix: IDENTITY,
          entityMatrix: IDENTITY,
          layers,
          blocks,
          entities,
          document,
          colorMode,
          lineweightScale,
          depth: 0,
          stack: [],
          warnings,
        }),
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
      paperCommands,
    };
  });
  const vectorCommandCount = sheets.reduce(
    (sheetTotal, sheet) =>
      sheetTotal +
      sheet.viewports.reduce(
        (viewportTotal, viewport) => viewportTotal + viewport.commands.filter((command) => command.kind !== "image").length,
        0,
      ) +
      (sheet.paperCommands?.length ?? 0),
    0,
  );
  const rasterCommandCount = sheets.reduce(
    (sheetTotal, sheet) =>
      sheetTotal +
      sheet.viewports.reduce(
        (viewportTotal, viewport) => viewportTotal + viewport.commands.filter((command) => command.kind === "image").length,
        0,
      ),
    0,
  );
  return {
    manifest,
    sheets,
    warnings,
    vectorCommandCount,
    rasterCommandCount,
  };
}
