"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Loader2,
  X,
  Save,
  Grid3x3,
  Grid2x2,
  ShieldAlert,
  RotateCw,
  RotateCcw,
  Trash2,
  Download,
  FileDown,
  Magnet,
  FlipHorizontal,
  FlipVertical,
  BrickWall,
  Box as BoxIcon,
  Eye,
  MapPin,
  Maximize2,
  Layers,
  Copy,
  Crosshair,
  Settings2,
  Boxes,
  ChevronRight,
  Ruler,
  MousePointer2,
  SlidersHorizontal,
  Undo2,
  Redo2,
  Spline,
  ClipboardList,
  Package,
  StickyNote,
  PersonStanding,
  HelpCircle,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  RulerDimensionLine,
  Rows3,
  Waypoints,
  ShieldCheck,
  CircleCheck,
  CircleAlert,
  Printer,
  ChartLine,
  FileText,
  WandSparkles,
  Stamp,
  Upload,
  ImageOff,
  Activity,
  History,
  Group,
  Search,
  Expand,
  Frame,
  Focus,
  PanelLeft,
  PanelLeftClose,
  ScanEye,
  GitMerge,
} from "lucide-react";
import type { CadDocumentInline } from "@valle/design-sdk";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { legacyCadFetch } from "@/lib/cad/legacy/layout-http-adapter";
import {
  layoutFromDocument,
  type OpenedDocument,
} from "@/lib/cad/legacy/layout-mapper";
import {
  CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES,
  CadCasConflictError,
  DocumentLifecycleController,
} from "@/components/cad/document-lifecycle/controller";
import {
  createDebouncedAutosave,
  type AutosaveStatus,
} from "@/components/cad/document-lifecycle/autosave";
import { observeCadSaveFlush } from "@/components/cad/document-lifecycle/connectivity";
import { CanonicalHistory } from "@/components/cad/document-lifecycle/history-controller";
import {
  ASSET_CATEGORIES,
  assetMeta,
  type AssetArchetype,
} from "./asset-catalog";
import { parseDxf, type DxfModel } from "./dxf";
import { dxfPointToFootprint, dxfToWalls } from "./dxf-walls";
import { dxfSnapPoints } from "./dxf-snap";
import { autoDimensions, type DimBox } from "./auto-dimensions";
import { arrangeLine, type ArrangeStation } from "./arrange-line";
import { connectLine, type ConnStation } from "./connect-line";
import {
  designChecks,
  type CheckBox,
  type DesignReport,
} from "./design-checks";
import { flowMetrics, type FlowCenter } from "./flow-metrics";
import { plotSheetModel } from "./plot-sheet";
import {
  describeCadIntent,
  normalizeToolCalls,
  type CadIntent,
} from "./cad-intent";
import { parseCoordinate, constrainPoint } from "./precision-input";
import {
  startCommand,
  feedPoint,
  feedDistance,
  commit as commitDrawCommand,
  closePolyline as closeDrawPolyline,
  cancel as cancelDrawCommand,
  type CommandId as CadDrawCommandId,
  type CommandState as CadDrawCommandState,
  type DrawAction,
} from "./cad-command";
import {
  canonicalEntityFromDrawAction,
  DRAW_ACTION_HISTORY_LABEL,
  DRAW_ACTION_REJECTION_MESSAGE,
  offsetCanonicalEntity,
  OFFSET_REJECTION_MESSAGE,
  type CanonicalDrawAction,
} from "@/lib/cad/draw-action-entities";
import {
  snap as resolveOsnap,
  rectGeometry,
  type SnapType,
} from "./snap-engine";
import {
  cadSnapSceneAddEntities,
  cadSnapSceneFromBoxes,
} from "@/lib/cad/snap-scene";
import { normalizeVision, type VisionResult } from "./cad-vision";
import { detectCadFormat } from "./cad-format-detect";
import { worldToPaper, type PlotLayout } from "./plot-scale";
import {
  createHistoryItem as createCadHistoryItem,
  executeCadCommand,
  parseCadCommand,
  previewCadCommand,
  splitCadCommandChain,
  type CadCommandHistoryItem,
  type CadCommandInput,
  type CadCommandPreview,
  type CadOperation,
} from "@/lib/cad/commands";
import {
  measureBoxes,
  measurementLabel,
  type CadMeasureMode,
} from "@/lib/cad/measurements";
import { maybeSnapScalarToGrid } from "@/lib/cad/snapping";
import {
  assignObjectsToLayer,
  DEFAULT_CAD_LAYERS,
  isObjectLayerLocked,
  summarizeCadLayers,
  type CadLayer,
  type CadLayerAssignments,
  type CadLayerId,
} from "@/lib/cad/layers";
import {
  CAD_TOOLBAR_ACTIONS,
  type CadToolbarActionId,
} from "@/lib/cad/toolbar";
import {
  searchCadPalette,
  type CadPaletteEntry,
} from "@/lib/cad/command-palette";
import {
  suggestCadCommands,
  type CadCommandSuggestion,
} from "@/lib/cad/command-line-assist";
import { matchCadShortcut } from "@/lib/cad/keyboard-shortcuts";
import {
  CAD_WORKSPACE_DEFAULTS,
  applyCadWorkspaceProfile,
  buildCadWorkspaceShortcuts,
  cadWorkspaceStorageKey,
  loadCadWorkspacePreferences,
  normalizeCadWorkspacePreferences,
  type CadWorkspacePreferences,
  type CadWorkspaceProfile,
} from "@/lib/cad/cad-workspace";
import { readRenamedStorageKey } from "@/lib/storage-rename";
import { createCadCheckpointQueue } from "@/lib/cad/recovery-checkpoint-queue";
import {
  archiveCadConflictsExcept,
  cadAutosaveBlockedForDocument,
  cadConflictIncidentLabel,
  closeCadConflictIncident,
  openCadConflictIncident,
  type CadConflictRegistry,
} from "@/lib/cad/cad-conflict-incident";
import {
  cadCommandHistoryStorageKey,
  navigateCadCommandHistory,
  prependCadCommandHistory,
  readCadCommandHistory,
  repeatableCadCommand,
  serializeCadCommandHistory,
} from "@/lib/cad/command-session";
import {
  gzipCadDocumentJson,
  serializeCadDocumentForTransport,
} from "@/lib/cad/large-document-transport";
import {
  cadRecoveryLaneId,
  clearCadRecoveryLaneThrough,
  discardCadRecoveryThrough,
  CadRecoveryQuotaError,
  loadCadRecovery,
  saveCadRecovery,
  type CadRecoveryRecord,
} from "@/lib/cad/cad-recovery";
import {
  classifyCadRecoveryCandidate,
  LEGACY_LANE as LEGACY_RECOVERY_LANE,
} from "@/lib/cad/cad-recovery-journal";
import { planCadNativeRenderBudget } from "@/lib/cad/native-render-budget";
import { CadNativeSelectionIndex } from "@/lib/cad/native-selection-index";
import {
  EMPTY_CAD_SELECTION,
  reduceCadSelection,
  type CadSelectableItem,
  type CadSelectionAction,
  type CadSelectionOperation,
  type CadSelectionState,
} from "@/lib/cad/selection-controller";
import { cadSelectionPathMatchesPolygon } from "@/lib/cad/selection-shapes";
import {
  acquireCadTrackingPoint,
  resolveCadPolarTracking,
  trackFromAcquiredPoints,
} from "@/lib/cad/precision-tracking";
import {
  defaultCadDynamicValues,
  type CadDynamicInputResult,
} from "@/lib/cad/dynamic-input";
import {
  cadPointInBoundary,
  resolveCadHatchRegionWithSources,
  stitchCadBoundaryPaths,
} from "@/lib/cad/hatch-associativity";
import { cadViewportBoundsChanged } from "@/lib/cad/native-viewport";
import { exportCadLayoutDxf } from "@/lib/cad/layout-export-adapter";
import {
  buildPlotSheet,
  CAD_PAPER_SIZES,
  type CadPaperId,
} from "@/lib/cad/plot-sheet";
import {
  evaluateCadDxfExportReadiness,
  type CadDxfExportLayerSummary,
  type CadDxfExportReadinessEntity,
  type CadDxfExportReadinessIssue,
} from "@/lib/cad/dxf-export-readiness";
import {
  importDxfPrimitives,
  summarizeDxfImportWarnings,
  type CadDxfImportResult,
  type CadDxfImportWarning,
  type CadDxfPoint,
  type CadDxfPrimitive,
} from "@/lib/cad/dxf-import";
import {
  CAD_SYMBOL_LIBRARY,
  getCadSymbol,
  type CadSymbolCategory,
} from "@/lib/cad/symbols";
import {
  createDefaultIndustryRegistry,
  type SmartObjectInstance,
} from "@/lib/cad/industry-pack";
import {
  summarizeIndustryObjects,
  industryRollupToCsv,
  type IndustrySummary,
} from "@/lib/cad/industry-rollup";
import { tessellateDxfPrimitive } from "@/lib/cad/curve-tessellate";
import { DWG_UNAVAILABLE_REASON } from "@/lib/cad/interop-provider";
import { mapDxfLayerToCadLayer } from "@/lib/cad/dxf-layer-map";
import {
  solveCadConstraints,
  upsertCadConstraint,
} from "@/lib/cad/live-constraints";
import {
  cadMleaderAssociationAnchor,
  type CadMleaderReference,
} from "@/lib/cad/associative-mleader";
import {
  defineCadBlock,
  explodeCadInsert,
  insertCadBlock as insertCanonicalCadBlock,
  purgeUnusedCadBlocks,
  redefineCadBlock,
  replaceCadBlock,
} from "@/lib/cad/professional-blocks";
import {
  CAD_LAYOUT_TEMPLATES,
  instantiateCadLayoutTemplate,
  type CadLayoutTemplateId,
} from "@/lib/cad/templates";
import {
  generateWarehouseDockStaging,
  generateWarehouseRackRows,
  generateWarehouseSupermarketKitting,
  type CadDockStagingGeneratorInput,
  type CadRackRowGeneratorInput,
  type CadSupermarketGeneratorInput,
} from "@/lib/cad/warehouse-generators";
import {
  type CadClearanceIssue,
  type CadCollisionHit,
} from "@/lib/cad/collisions";
import {
  buildFlowSegments,
  scoreFlowLayout,
  type CadFlowNode,
  type CadFlowScore,
  type CadFlowSegment,
} from "@/lib/line-engineering/flow-optimization";
import type {
  CadSafetyIssue,
  CadSafetyZone,
  CadSafetyZoneKind,
} from "@/lib/cad/safety-zones";
import {
  createCadSnapshot,
  diffCadSnapshots,
  pushCadSnapshot,
  restoreCadSnapshot,
  type CadSnapshotDiff,
  type CadSnapshotHistory,
} from "@/lib/cad/snapshots";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
} from "@/lib/cad/editor-snapshot";
import {
  commitChange,
  preserveDrawOrder,
  migrateCadDocument,
  replaceEditorProjection,
  type CadConstraintKind,
  type CadBlockDefinition,
  type CadDocument,
  type CadEntity,
  type CadExternalReference,
  type CadLayerDef,
  type CadLossManifestEntry,
  type CadPaperSpace,
  type CadPublicationRecord,
} from "@/lib/cad/cad-document";
import { type CadEntityDiffRow } from "@/lib/cad/cad-collaboration";
import { applyCadLineFillet } from "@/lib/cad/cad-fillet";
import { applyCadLineChamfer } from "@/lib/cad/cad-chamfer";
import {
  applyCadLineEdit,
  type CadLineEndpoint,
} from "@/lib/cad/cad-line-edit";
import {
  cadLayerIdFromName,
  createCadDocumentLayer,
  deleteCadDocumentLayer,
  updateCadDocumentLayer,
} from "@/lib/cad/cad-layer-manager";
import {
  CAD_SHEET_PAPERS,
  buildCadPublishPlan,
  createCadPaperSpace,
  createThreeSheetDemo,
  reorderCadPaperSpaces,
  type CadPublishSheet,
  type CadPublishWarning,
  type CadSheetPaper,
} from "@/lib/cad/paper-space";
import {
  createCadPaperViewport,
  deleteCadPaperViewport,
  duplicateCadPaperViewport,
  normalizeCadViewportPaperBounds,
  preflightCadPaperSpace,
  setCadViewportLayerOverride,
  setCadViewportLayerVisibility,
  updateCadPaperViewport,
} from "@/lib/cad/cad-layout-manager";
import {
  analyzeCadXrefGraph,
  attachCadXref,
  bindCadXref,
  compareCadXrefVersion,
  detachCadXref,
  hashCadXrefDocument,
  markCadXrefStatus,
  reloadCadXref,
  unloadCadXref,
  type CadXrefAssetSnapshot,
  type CadXrefVersionComparison,
} from "@/lib/cad/cad-xrefs";
import {
  CAD_ENTITY_REGISTRY,
  CadSceneSynchronizer,
  cadEntityBoundaryPaths,
  type CadNativeEntity,
  type CadBounds,
  type CadPropertyBag,
  type CadScenePatch,
} from "@/lib/cad/entity-runtime";
import {
  executeCadEntityCommand,
  executeCadEntityCommandBatch,
} from "@/lib/cad/entity-commands";
import { assertCadLockedLayerInvariant } from "@/lib/cad/locked-layer-guard";
import {
  propagateCadConstraints,
  propagateCadConstraintsByDiff,
} from "@/lib/cad/constraint-propagation";
import { CadViewController } from "@/lib/cad/view/view-controller";
import { CadCommandLineDock } from "@/components/cad/command-line/CadCommandLineDock";
import { useCadCommandEngine } from "@/components/cad/command-line/use-command-engine";
import { formatCadPrompt } from "@/lib/cad/engine/prompt";
import { useCadStudioCommandEngine } from "@/components/cad/command-line/use-command-engine";
import {
  CadOverlayLegends,
  CadViewportHint,
  CadViewportPrompt,
} from "@/components/cad/studio/viewport-hints";
import { CadDraftToolbar } from "@/components/cad/studio/draft-toolbar";
import {
  AlignBtn,
  DimInput,
  NumField,
  ReadField,
  Stat,
  T3Btn,
} from "@/components/cad/studio/field-controls";
import {
  buildCadInsertBatchObject,
  buildCadNativeOverviewObject,
  buildCadNativeObject,
  disposeCadNativeObject,
  setCadInsertBatchHiddenLayers,
  setCadNativeOverviewHiddenLayers,
  setCadNativeObjectSelected,
  updateCadNativeOverviewObject,
} from "@/lib/cad/entity-three";
import {
  CadRenderHostSlot,
  CadViewportRenderHost,
} from "@/components/cad/viewport/render-pipeline-host";
import {
  CadSolidShadeHost,
  cadSolidEntityIds,
} from "@/components/cad/viewport/solid-shade-host";
import {
  HELP_SECTIONS,
  THEMES,
  type Theme3D,
} from "@/components/cad/studio/editor-presentation";
import {
  buildAssetGroup,
  buildDim,
  disposeObject,
  makeLabel,
  makeNoteLabel,
  type Ann,
  type Asset,
} from "@/components/cad/viewport/scene-objects";
import { CadEnginePreview } from "@/components/cad/viewport/engine-preview";
import { CadLiveCursorOverlay } from "@/components/cad/viewport/live-cursor";
import {
  CadEnginePointerRouter,
  EMPTY_CAD_POINTER_SESSION,
  cadEngineCommandForTool,
  type CadPointerSession,
} from "@/components/cad/viewport/pointer-router";
import { CadNativeGripController } from "@/components/cad/viewport/native-grip-controller";
import { CadGripMenuOverlay } from "@/components/cad/viewport/grip-menu-host";
import { CadTouchGestures, cadDispatchContextMenu } from "@/components/cad/viewport/touch-gestures";
import { applyCadCameraPolicy } from "@/components/cad/viewport/camera-policy";
import {
  CadRenderPipelineBadge,
  CadRenderPipelineStats,
} from "@/components/cad/viewport/RenderPipelineBadge";
import {
  resolveCadRenderPipeline,
  type CadRenderPipelineChoice,
} from "@/lib/cad/render-pipeline-preference";
import {
  cadDocumentNativeDxfHatches,
  cadDocumentDxfBlocks,
  cadDocumentDxfInserts,
  cadDocumentNativeDxfMTexts,
  cadDocumentNativeDxfMleaders,
  cadDocumentDxfExportLosses,
  cadDocumentNativeDxfPrimitives,
  cadDocumentNativeDxfSemanticDimensions,
  cadDxfCurvesToNativeEntities,
  cadDxfBlocksToCadDocumentParts,
  cadDxfHatchesToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfMleadersToNativeEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "@/lib/cad/dxf-cad-document";
import {
  describeCadObjectProperties,
  summarizeCadSelectionProperties,
  type CadObjectProperties,
  type CadPropertyObject,
  type CadSelectionProperties,
} from "@/lib/cad/object-properties";
import {
  buildCadArchitectureTakeoff,
  defaultCadLayerForAssetKind,
  type CadArchitectureTakeoffSummary,
} from "@/lib/cad/architecture";
import {
  buildCadValidationReport,
  type CadValidationIssueRow,
  type CadValidationReport,
} from "@/lib/cad/validation-report";
import {
  FACTORY_PRESETS,
  presetToUnit,
  clampFootprintUnit,
  clampGridUnit,
  unitToMeters,
  metersToUnit,
  formatMeters,
  type WorldUnit,
  type FactoryPreset,
} from "@/lib/cad/world-scale";
import PlantMinimap from "./PlantMinimap";
import ScaleBar from "./ScaleBar";
import {
  CadCommandDock,
  type CadAiProposal,
} from "./cad-workbench/CadCommandDock";
import {
  CadSelectionPalette,
  type CadSelectionGeometryMode,
} from "./cad-workbench/CadSelectionPalette";
import { CadHatchPalette } from "./cad-workbench/CadHatchPalette";
import {
  CadMTextEditor,
  type CadMTextDraft,
} from "./cad-workbench/CadMTextEditor";
import {
  CadDimensionPalette,
  type CadDimensionDraft,
} from "./cad-workbench/CadDimensionPalette";
import {
  CadMLeaderPalette,
  type CadMLeaderDraft,
} from "./cad-workbench/CadMLeaderPalette";
import {
  CadBlockPalette,
  type CadBlockDefinitionDraft,
  type CadBlockInsertDraft,
} from "./cad-workbench/CadBlockPalette";
import { CadLayoutManager } from "./cad-workbench/CadLayoutManager";
import {
  CadXrefPalette,
  type CadXrefAttachDraft,
} from "./cad-workbench/CadXrefPalette";
import { CadCollaborationPalette } from "./cad-workbench/CadCollaborationPalette";
import { CadWorkspaceDock } from "./cad-workbench/CadWorkspaceDock";
import { CadEntityPropertiesPanel } from "@/components/cad/palettes/CadEntityPropertiesPanel";
import type {
  CadPropertyRow,
  CadPropertyValue,
} from "@/components/cad/palettes/property-model";
import { CadDraftStatusBar } from "@/components/cad/palettes/CadDraftStatusBar";
import { CadPaletteOverlays } from "@/components/cad/palettes/CadPaletteOverlays";
import {
  CAD_OSNAP_HUD_LABELS,
  CAD_POLAR_INCREMENTS,
} from "@/components/cad/palettes/draft-settings-host";
import {
  useCadDraftSettings,
  useCadDraftSettingsHost,
  useCadLayerManager,
  useCadLayerManagerHost,
  useCadPalette,
  useCadPaletteHost,
  useCadStyleManager,
  useCadStyleManagerHost,
} from "@/components/cad/palettes/use-palettes";
import { CadLayerManagerPalette } from "@/components/cad/palettes/CadLayerManagerPalette";
import { useCadLayerActions } from "@/components/cad/palettes/use-layer-actions";
import { useCadStyleActions } from "@/components/cad/palettes/use-style-actions";
import {
  CadEditorLayerToggles,
  type CadEditorLayerKey,
} from "@/components/cad/palettes/CadEditorLayerToggles";
import {
  captureCadLayerState,
  filterCadLayerRows,
  planCadLayerStateRestore,
  type CadLayerFilterProperty,
  type CadLayerManagerRow,
} from "@/components/cad/palettes/layer-manager-model";
import { cadEntityAssociationAnchor } from "@/lib/cad/associative-dimension";
import {
  cadViewportFocusBounds,
  createCadViewportBookmark,
  describeCadViewportFocus,
  removeCadViewportBookmark,
  sanitizeCadViewportBookmarks,
  upsertCadViewportBookmark,
  type CadViewportBookmark,
} from "@/lib/cad/viewport-bookmarks";
// EDICIÓN DESIGN: aquí NO se instala la analítica industrial (flujo, balanceo,
// ruta material) que el workbench enterprise registraba al cargar este chunk —
// ese paquete es ENTERPRISE_OWNED y no existe en este repo. Sin registro, los
// comandos de análisis del kernel degradan con su aviso contractual
// (`analysis_pack_missing`) — comportamiento probado en analysis-extensions.spec.
// El overlay de flujo del propio editor sigue vivo: usa
// `@/lib/line-engineering/flow-optimization` por import directo (línea ~140).

/**
 * Contrato de EXTENSIÓN de paneles de análisis (WP6 — inversión de dependencias).
 *
 * Los paneles industriales (balanceo, costos, escenarios, expediente…) son
 * ENTERPRISE_OWNED: el editor CAD ya no los importa. El anfitrión los
 * inyecta como descriptores por la prop `analysisPanels`; el editor sólo
 * construye el menú "Análisis" con ellos y monta el activo bajo demanda con el
 * contexto mínimo que los paneles siempre usaron (modelo/revisión, estaciones
 * colocadas y unidad del plano, y el cierre del panel). Sin descriptores el
 * menú de análisis industrial no se renderiza.
 */
export interface CadAnalysisPanelContext {
  /** Modelo y revisión activos en el editor. */
  model: string;
  /** Revisión activa en el editor. */
  revision: string;
  /** Estaciones COLOCADAS en el plano (id + etiqueta), en el orden del plan.
   *  Es lo que el panel local de balance de línea lee en lugar de ir al server. */
  placedStations: { id: string; label: string }[];
  /** Unidad del footprint del layout activo ('mm' mientras no haya datos). */
  unit: string;
  /** Cierra el panel activo (el editor lo desmonta). */
  onClose: () => void;
}

export interface CadAnalysisPanelDescriptor {
  /** Clave estable del panel — identifica el panel activo en el estado del editor. */
  key: string;
  /** Etiqueta visible en el menú "Análisis". */
  label: string;
  /** Render del panel. El editor lo invoca sólo mientras el panel está activo,
   *  con el contexto mínimo de arriba; el descriptor decide qué props recibe
   *  su componente (los paneles hoy toman model/revision u estaciones+unidad,
   *  más open/onClose). */
  render: (ctx: CadAnalysisPanelContext) => React.ReactNode;
}

/** Sin inyección no hay análisis industrial (referencia estable). */
const NO_ANALYSIS_PANELS: CadAnalysisPanelDescriptor[] = [];

/**
 * Full-screen interactive 3D layout editor — the "CAD" view of the plant floor.
 *
 * Stations are extruded, labelled blocks; non-station equipment (benches,
 * conveyors, racks, robots, walls, columns, AGVs, operators…) are placed from a
 * categorised palette and rendered with distinctive geometry per archetype.
 * Anything on the floor can be dragged (a raycast against the ground gives the
 * new world x/y — exactly the placement data the 2D editor uses, so both views
 * stay in sync), selected, nudged, rotated, duplicated, resized from the
 * properties panel, or removed. Saves back through the shared layout endpoint:
 * stations via positions/cleared, equipment via the additive `assets` array.
 *
 * three.js + OrbitControls, lazy-loaded so the engine only ships when opened.
 */

/* ──────────────────────── Review links (server-owned) ────────────────────── */

/** Clave de sesión donde vive el token canjeado (nunca localStorage). */
const REVIEW_TOKEN_SESSION_KEY = "cad.reviewToken";

/**
 * Extrae el token de review de la URL y lo SACA de ella de inmediato.
 *
 * El enlace compartible lo lleva en el FRAGMENTO (`#cadReview=…`): un
 * fragmento no se envía al servidor, no aparece en los logs ni en la cabecera
 * `Referer` hacia terceros. Aun así se borra de la barra de direcciones nada
 * más leerlo (`history.replaceState`) y se guarda en `sessionStorage`, que
 * muere con la pestaña — así una recarga mantiene la sesión de revisión sin
 * volver a exponer la credencial.
 *
 * Se acepta también el `?cadReview=` HEREDADO con un único propósito: borrarlo
 * de la URL. Aquellos tokens los generaba el navegador y no existen en
 * `cad_review_sessions`, así que su canje falla — como debe.
 */
function takeReviewTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get(
    "cadReview",
  );
  const fromQuery = url.searchParams.get("cadReview");
  const token = (fromHash || fromQuery || "").trim();
  if (fromHash || fromQuery) {
    url.searchParams.delete("cadReview");
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    hash.delete("cadReview");
    url.hash = hash.toString();
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash ? `#${url.hash}` : ""}`,
    );
  }
  if (!token) return null;
  try {
    window.sessionStorage.setItem(REVIEW_TOKEN_SESSION_KEY, token);
  } catch {
    /* sessionStorage bloqueado: el token vive sólo en esta navegación */
  }
  return token;
}

/**
 * CANJE del review link contra el servidor. Antes esto lo decidía el
 * navegador comparando el token de la query string con los tokens que el
 * propio documento traía EN CLARO — autorización cosmética sobre una fuente de
 * verdad insegura. Ahora `GET /v1/cad/review/context` revalida hash,
 * expiración y revocación en `cad_review_sessions` y es su respuesta la que
 * pone el editor en solo lectura (que además el backend impone por su cuenta:
 * fuera de `@ReviewLinkSurface` todo es 403 `review_read_only`).
 */
async function redeemReviewLink(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  let token = takeReviewTokenFromLocation();
  if (!token) {
    try {
      token = window.sessionStorage.getItem(REVIEW_TOKEN_SESSION_KEY);
    } catch {
      token = null;
    }
  }
  if (!token) return false;
  try {
    const res = await legacyCadFetch("layout/review-context", {
      headers: { "X-Review-Token": token },
    });
    if (!res.ok) {
      // Enlace vencido, revocado o desconocido: se olvida el token.
      try {
        window.sessionStorage.removeItem(REVIEW_TOKEN_SESSION_KEY);
      } catch {
        /* noop */
      }
      return false;
    }
    const body = (await res.json()) as { readOnly?: boolean } | null;
    return body?.readOnly === true;
  } catch {
    return false;
  }
}

// Etiquetas del glifo OSNAP (Fase 66 cableada, ADR §216) — se muestran en el HUD.

// Portapapeles CAD (ADR §220) — a nivel de módulo para que Ctrl+C/Ctrl+V
// funcione también ENTRE layouts (copiar en AX-1000/A, pegar en AX-2000/B).
const CAD_CLIPBOARD: {
  items: {
    kind: string;
    label?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
    layer?: string;
    tags?: string;
    group?: string;
  }[];
} = { items: [] };

// Approval / sign-off (ported from the 2D host, unify)
type ApprovalStatus = "draft" | "in_review" | "approved";
interface LayoutApproval {
  status: ApprovalStatus;
  by: string | null;
  at: string | null;
  note: string | null;
}
const APPROVAL_META: Record<ApprovalStatus, { label: string; color: string }> =
  {
    draft: { label: "Borrador", color: "#94a3b8" },
    in_review: { label: "En revisión", color: "#f59e0b" },
    approved: { label: "Aprobado", color: "#10b981" },
  };

// Live station-status overlays (ported from the 2D host, unify). Each colours the
// station blocks by a per-station value from its API; we use the solid stroke hex.
type OverlayKind = "mes" | "heat" | "completeness" | "bays" | "quality";
const hexToInt = (h: string): number => parseInt(h.replace("#", ""), 16);
const OVERLAY_DEFS: {
  key: OverlayKind;
  label: string;
  endpoint: string;
  legend: { label: string; hex: string }[];
}[] = [
  {
    key: "mes",
    label: "MES en vivo",
    endpoint: "status",
    legend: [
      { label: "Paro", hex: "#ef4444" },
      { label: "Alerta", hex: "#f59e0b" },
      { label: "OK", hex: "#10b981" },
      { label: "Inactivo", hex: "#94a3b8" },
    ],
  },
  {
    key: "heat",
    label: "Calor de ciclo / utilización",
    endpoint: "heatmap",
    legend: [
      { label: "Holgado", hex: "#3b82f6" },
      { label: "Ligero", hex: "#06b6d4" },
      { label: "Medio", hex: "#f59e0b" },
      { label: "Alto", hex: "#f97316" },
      { label: "Sobre takt", hex: "#ef4444" },
    ],
  },
  {
    key: "completeness",
    label: "Completitud documental",
    endpoint: "completeness",
    legend: [
      { label: "Completa", hex: "#10b981" },
      { label: "Incompleta", hex: "#f59e0b" },
    ],
  },
  {
    key: "bays",
    label: "Bahía que surte",
    endpoint: "bays",
    legend: [
      { label: "B1", hex: "#3b82f6" },
      { label: "B2", hex: "#8b5cf6" },
      { label: "B3", hex: "#ec4899" },
      { label: "B4", hex: "#f59e0b" },
      { label: "B5", hex: "#10b981" },
      { label: "B6", hex: "#06b6d4" },
    ],
  },
  {
    key: "quality",
    label: "Calidad acumulada",
    endpoint: "quality",
    legend: [
      { label: "OK", hex: "#10b981" },
      { label: "Menor", hex: "#f59e0b" },
      { label: "Mayor", hex: "#ef4444" },
    ],
  },
];
const MES_HEX: Record<string, string> = {
  down: "#ef4444",
  warn: "#f59e0b",
  ok: "#10b981",
  idle: "#94a3b8",
  unknown: "#cbd5e1",
};
const HEAT_HEX: Record<string, string> = {
  cold: "#3b82f6",
  cool: "#06b6d4",
  warm: "#f59e0b",
  hot: "#f97316",
  over: "#ef4444",
};
const BAY_HEX: Record<number, string> = {
  1: "#3b82f6",
  2: "#8b5cf6",
  3: "#ec4899",
  4: "#f59e0b",
  5: "#10b981",
  6: "#06b6d4",
};
const QUAL_HEX: Record<string, string> = {
  ok: "#10b981",
  minor: "#f59e0b",
  major: "#ef4444",
};
/* eslint-disable @typescript-eslint/no-explicit-any */
// Build a stationName→hex map from an overlay response (shapes mirror the 2D host).
function overlayColorMap(kind: OverlayKind, d: any): Map<string, string> {
  const m = new Map<string, string>();
  const rows: any[] = Array.isArray(d?.stations) ? d.stations : [];
  for (const s of rows) {
    if (!s || typeof s.station !== "string") continue;
    let hex: string | undefined;
    if (kind === "mes") hex = MES_HEX[s.status];
    else if (kind === "heat") hex = HEAT_HEX[s.level];
    else if (kind === "completeness") hex = s.complete ? "#10b981" : "#f59e0b";
    else if (kind === "bays")
      hex = s.bahia != null ? BAY_HEX[s.bahia as number] : "#94a3b8";
    else if (kind === "quality") hex = QUAL_HEX[s.level];
    if (hex) m.set(s.station, hex);
  }
  return m;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface St {
  id: string;
  station: string;
  line: string;
  ctq: boolean;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  rotation: number | null;
}
interface Cell {
  id: string;
  name: string;
  color: string;
  stationIds: string[];
}
interface Conn {
  from: string;
  to: string;
  kind?: string;
}
/** Bloque CAD reutilizable de la biblioteca del tenant (ADR §224). */
interface CadBlockRow {
  id: string;
  name: string;
  assets: (Asset & { layer?: string })[];
  definition?: CadBlockDefinition | null;
  version?: number;
  createdAt?: string;
}
/** A pair of objects flagged by the clearance analysis (Fase 43). */
interface ClearancePair {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  gap: number;
}
/** A free-text note or a dimension line (cota) on the plan — world coords. */
interface Footprint {
  footprintW: number;
  footprintH: number;
  unit: string;
  gridSize: number;
}
/** Placement of the read-only DXF floor plan behind the layout (Fase 2). */
interface DxfMeta {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  visible: boolean;
  opacity: number;
}
interface Layout {
  footprint: Footprint;
  stations: St[];
  cells?: Cell[];
  connectors?: Conn[];
  assets?: Asset[];
  annotations?: Ann[];
  dxf?: DxfMeta | null;
  cadDocument?: Record<string, unknown> | null;
  cadDocumentVersion?: number;
}
interface CanonicalSaveRequest {
  documentId: string;
  document: CadDocument;
  generation: number;
  base: Layout;
}
interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
/** One selectable object (a station block or an equipment asset). */
interface SelItem {
  type: "station" | "asset";
  id: string;
}
const sameSel = (a: SelItem, b: SelItem) => a.type === b.type && a.id === b.id;
/** A point-in-time copy of every editable collection, for undo/redo. */
interface Snapshot {
  placements: [string, Placement][];
  assets: Asset[];
  annotations: Ann[];
  connectors: Conn[];
  layers: CadLayerAssignments;
  tags: Record<string, string>;
  /** Grupo por objeto: sin esto moría en la reproyección de cada guardado. */
  groups?: Record<string, string>;
  /** Nota por objeto: sin esto no se guardaba en ningún sitio, en absoluto. */
  notes?: Record<string, string>;
}
/**
 * ¿Dos mapas de cadenas por objeto tienen el MISMO contenido?
 *
 * Sirve para no disparar un re-render cuando una restauración devuelve lo que
 * ya había. Comparación superficial y suficiente: los valores son cadenas.
 */
function sameStringMap(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

interface CommandPreviewState {
  input: CadCommandInput;
  preview: CadCommandPreview;
  chain?: CadCommandInput[];
  rawInput: string;
}
interface DxfExportOptions {
  scope: "all" | "selection";
  includeHidden: boolean;
  includeMeasurements: boolean;
  includeLabels: boolean;
  units: "mm" | "m";
  fileName: string;
}
interface DxfExportSummary {
  objects: number;
  connectors: number;
  measurements: number;
  labels: number;
  layers: number;
  canExport: boolean;
  includedLayers: string[];
  layerSummary: CadDxfExportLayerSummary[];
  issues: CadDxfExportReadinessIssue[];
}
interface MeasurementRow {
  id: string;
  label: string;
  length: string;
}
interface CadSheetPackageDraft {
  project: string;
  drawingNo: string;
  discipline: string;
  sheet: string;
  revision: string;
  scale: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  notes: string;
}
/** Live quantity take-off computed from the editor's current state. */
interface LocalTakeoff {
  unit: string;
  footprintArea: number;
  totalStations: number;
  placedStations: number;
  stationArea: number;
  equipmentCount: number;
  equipArea: number;
  usedArea: number;
  util: number;
  wallLen: number;
  dimCount: number;
  flowLen: number;
  flowMaxHop: number;
  flowCount: number;
  architecture: CadArchitectureTakeoffSummary;
  byKind: { kind: string; label: string; count: number; area: number }[];
  byLayer: { id: CadLayerId; label: string; count: number; area: number }[];
}
/** A render-safe snapshot of the current selection for the properties panel. */
interface SelSnap {
  type: "station" | "asset";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  title: string;
  subtitle: string;
  kind?: string;
  height?: number;
  canDuplicate: boolean;
}

function assetSafetyZoneKind(
  asset: Asset,
  tagsValue: string | undefined,
): CadSafetyZoneKind | null {
  const meta = assetMeta(asset.kind);
  const text = `${asset.kind} ${asset.label ?? ""} ${tagsValue ?? ""}`
    .toLowerCase()
    .replace(/_/g, "-");
  if (text.includes("no-go")) return "no_go";
  if (text.includes("restricted")) return "restricted";
  if (text.includes("esd")) return "esd_zone";
  if (
    text.includes("emergency") ||
    text.includes("egress") ||
    text.includes("evacuation")
  )
    return "emergency_exit";
  if (text.includes("forklift") || text.includes("montacargas"))
    return "forklift_path";
  if (text.includes("aisle") || text.includes("pasillo")) return "aisle";
  if (text.includes("clearance")) return "safety_clearance";
  return meta.archetype === "zone" && text.includes("safety")
    ? "restricted"
    : null;
}

function cadTags(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const ROSE = 0xf43f5e;
const AMBER = 0xf59e0b;
const SELECT = 0x22d3ee;


const TOOLBAR_SHORTCUT_IDS = new Set<CadToolbarActionId>([
  "select",
  "measure",
  "line",
  "polyline",
  "rect",
  "circle",
  "offset",
  "aisle",
  "connector",
  "zone",
  "equipment",
  "text",
  "fit_view",
  "undo",
  "redo",
]);

const READ_ONLY_TOOLBAR_ACTION_IDS = new Set<CadToolbarActionId>([
  "select",
  "pan",
  "fit_view",
]);
const READ_ONLY_SHORTCUT_IDS = new Set([
  "grid_toggle",
  "object_snap_toggle",
  "ortho_toggle",
  "polar_tracking_toggle",
  "object_tracking_toggle",
  "validate_layout",
  "export_dxf",
  ...READ_ONLY_TOOLBAR_ACTION_IDS,
]);

function isReadOnlyMutationKey(
  event: KeyboardEvent,
  shortcutId?: string,
): boolean {
  if (shortcutId) return !READ_ONLY_SHORTCUT_IDS.has(shortcutId);
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey)
    return ["s", "z", "y", "d", "c", "v", "g"].includes(key);
  return [
    "backspace",
    "delete",
    "enter",
    "arrowleft",
    "arrowright",
    "arrowup",
    "arrowdown",
    "m",
    "r",
    "w",
  ].includes(key);
}

type EditorTool = "select" | "measure" | "wall" | CadDrawCommandId;
const CAD_DRAW_TOOLS = new Set<EditorTool>([
  "line",
  "polyline",
  "rect",
  "circle",
  "move",
  "copy",
  "offset",
]);
const isCadDrawTool = (tool: EditorTool): tool is CadDrawCommandId =>
  CAD_DRAW_TOOLS.has(tool);

const DXF_LABEL_REQUIRED_ASSET_KINDS = new Set([
  "workbench",
  "conveyor",
  "rack",
  "robot",
  "aoi",
  "oven",
  "printer",
  "machine",
  "gantry",
  "cabinet",
  "pallet",
  "desk",
  "bin",
  "safety",
  "wall",
  "column",
  "door",
  "room",
  "fence",
  "agv",
  "agvpath",
  "zone",
]);

/** An amber "sticky note" sprite for a free-text annotation on the plan. */
/** Build a positioned, rotated, pickable asset group (base at floor). */
/** Registro de Industry Packs (CAD-NEXT-090): objetos inteligentes por industria. */
const INDUSTRY_REGISTRY = createDefaultIndustryRegistry();
const newId = (p: string) =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const fmtDist = (d: number, unit: string) =>
  `${Math.round(d).toLocaleString("es-MX")} ${unit}`;
const fmtArea = (v: number, unit: string) => {
  const m2 = unit === "mm" ? v / 1e6 : unit === "cm" ? v / 1e4 : v; // → m²
  return `${m2.toLocaleString("es-MX", { maximumFractionDigits: m2 < 100 ? 2 : 0 })} m²`;
};
const fmtLen = (v: number, unit: string) => {
  const m = unit === "mm" ? v / 1000 : unit === "cm" ? v / 100 : v; // → m
  return `${m.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m`;
};
const defaultCadClearance = (unit: string) => {
  if (unit === "m") return 0.8;
  if (unit === "cm") return 80;
  if (unit === "in") return 32;
  if (unit === "ft") return 2.6;
  return 800;
};

/** Floor-plane line + end ticks + distance label for a dimension annotation. */

/**
 * Props de PLATAFORMA del editor CAD (WP5 — inversión de dependencias).
 *
 * El editor ya NO lee los contextos enterprise (Auth/Workspace/Theme/Toast),
 * ni el chrome global (`operatorChrome`), ni la marca (`config/brand`): todo
 * llega por estas props opcionales. En el despliegue enterprise las inyecta
 * `Layout3DEditorHost` (el adaptador que lee los contextos reales); el repo
 * Design montará el editor con su propia plataforma. Si una prop falta se
 * aplica un fallback inofensivo — los fallbacks nunca se ejercitan en
 * enterprise porque el Host siempre inyecta.
 */
export interface Layout3DEditorPlatformProps {
  /** Identidad plataforma: claves de storage del workspace CAD, historial de
   *  comandos, recovery local y scoping de la biblioteca de bloques tenant.
   *  Campos ausentes se comportan como la sesión sin autenticar de enterprise
   *  (los helpers de storage aplican sus propias claves neutras). */
  identity?: { userId?: string; tenantId?: string };
  /** Alcance de trabajo (edificio/proyecto): scoping de snapshots de
   *  recuperación e historial de comandos. */
  scope?: { buildingId?: string; projectId?: string };
  /** Esquema visual resuelto por la plataforma anfitriona. Fallback: 'light'. */
  theme?: "light" | "dark";
  /** Canal de notificaciones. Mapea 1:1 el toast enterprise real
   *  (success/error/info + mensaje + título opcional). Fallback: no-op. */
  onNotify?: (
    level: "success" | "error" | "info",
    message: string,
    title?: string,
  ) => void;
  /** Aviso de apertura/cierre a pantalla completa, para que el shell anfitrión
   *  oculte su chrome (dock, widgets flotantes). Fallback: no-op. */
  onFullscreenChange?: (open: boolean) => void;
  /** Marca del cajetín PDF (brandName/legalEntityName), del comentario DXF y
   *  de los títulos/pies de sheets (productLabel). */
  branding?: {
    brandName: string;
    legalEntityName: string;
    productLabel: string;
  };
  /** Paneles de análisis industrial inyectados por el anfitrión (WP6). El menú
   *  "Análisis" se construye desde aquí; ausente o vacío, el menú no aparece. */
  analysisPanels?: CadAnalysisPanelDescriptor[];
}

export interface Layout3DEditorProps extends Layout3DEditorPlatformProps {
  /** Identificador estable del contrato standalone. Evita resolver por model+revision. */
  documentId?: string;
  model: string;
  revision: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  models?: { model: string; revision: string }[];
  standalone?: boolean;
  title?: string;
  subtitle?: string;
  /**
   * Read-only product role. This is independent from review-link auth: both
   * lanes share the same drawing-mutation gate, while review surfaces may
   * still expose their explicitly scoped collaboration controls.
   */
  readOnly?: boolean;
}

/** Marca por defecto cuando el editor se monta sin plataforma (nunca en enterprise). */
const DEFAULT_BRANDING: NonNullable<Layout3DEditorPlatformProps["branding"]> = {
  brandName: "Valle Design",
  legalEntityName: "",
  productLabel: "Valle Design",
};

export default function Layout3DEditor({
  documentId,
  model,
  revision,
  open,
  onClose,
  onSaved,
  models = [],
  standalone = false,
  title,
  subtitle,
  readOnly = false,
  identity,
  scope: platformScope,
  theme: resolvedScheme = "light",
  onNotify,
  onFullscreenChange,
  branding = DEFAULT_BRANDING,
  analysisPanels = NO_ANALYSIS_PANELS,
}: Layout3DEditorProps) {
  const documentLifecycle = useMemo(
    () =>
      new DocumentLifecycleController(
        {
          open: (id) => designClient.documents.open(id),
          saveContent: (id, document, expectedVersion) =>
            designClient.documents.saveContent(
              id,
              document as unknown as CadDocumentInline,
              expectedVersion,
            ),
          saveArchive: (id, archive, expectedVersion) =>
            designClient.documents.saveArchive(id, archive, expectedVersion),
          versionConflict: (error) =>
            error instanceof DesignApiError && error.isVersionConflict()
              ? { current: error.body.current }
              : null,
        },
        {
          record: (name, durationMs, detail) => {
            if (typeof performance !== "undefined")
              performance.measure(`cad.document.${name}`, {
                start: performance.now() - durationMs,
                duration: durationMs,
                detail,
              });
          },
        },
      ),
    [],
  );
  // Plataforma invertida (WP5): identidad, alcance y notificaciones llegan por
  // props. Los nombres locales conservan los del código enterprise original
  // para que el resto del editor no cambie.
  const toast = useMemo(
    () => ({
      success: (message: string, title?: string) =>
        onNotify?.("success", message, title),
      error: (message: string, title?: string) =>
        onNotify?.("error", message, title),
      info: (message: string, title?: string) =>
        onNotify?.("info", message, title),
    }),
    [onNotify],
  );
  const userId = identity?.userId;
  const tenantId = identity?.tenantId;
  const buildingId = platformScope?.buildingId;
  const projectId = platformScope?.projectId;
  const recoveryScope = useMemo(
    () =>
      tenantId && userId
        ? {
            tenantId,
            userId,
            buildingId,
            projectId,
            model,
            revision,
          }
        : null,
    [buildingId, model, projectId, revision, tenantId, userId],
  );
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<Layout | null>(null);
  const dataRef = useRef<Layout | null>(null);
  const currentDocumentIdRef = useRef(documentId);
  const editorOpenRef = useRef(open);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    currentDocumentIdRef.current = documentId;
  }, [documentId]);
  useEffect(() => {
    editorOpenRef.current = open;
    return () => {
      editorOpenRef.current = false;
    };
  }, [open]);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [snap, setSnap] = useState(true);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const editGenerationRef = useRef(0);
  const scheduleAutosaveRef = useRef<() => void>(() => undefined);
  const [cadReviewReadOnly, setCadReviewReadOnly] = useState(false);
  const drawingReadOnly = readOnly || cadReviewReadOnly;
  const drawingReadOnlyRef = useRef(drawingReadOnly);
  drawingReadOnlyRef.current = drawingReadOnly;
  const readOnlyNoticeAtRef = useRef(0);
  const notifyReadOnly = useCallback(() => {
    const now = Date.now();
    if (now - readOnlyNoticeAtRef.current < 1_000) return;
    readOnlyNoticeAtRef.current = now;
    toast.info(
      cadReviewReadOnly
        ? "El enlace permite revisar el dibujo, no modificarlo."
        : "Tu rol permite consultar el dibujo, no modificarlo.",
      "Solo lectura",
    );
  }, [cadReviewReadOnly, toast]);
  const guardReadOnlyUi = useCallback(
    (event: React.SyntheticEvent<HTMLElement>) => {
      if (!drawingReadOnly) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-cad-readonly-allowed]")) return;
      if (cadReviewReadOnly && target.closest("[data-cad-review-allowed]"))
        return;
      if (
        !target.closest(
          'button, input, textarea, select, form, [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      notifyReadOnly();
    },
    [cadReviewReadOnly, drawingReadOnly, notifyReadOnly],
  );
  const markDirty = useCallback(() => {
    if (drawingReadOnlyRef.current) return;
    editGenerationRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    // Some editor commands mutate several refs in one synchronous turn. Capture
    // the immutable save request after that turn, never halfway through it.
    queueMicrotask(() => scheduleAutosaveRef.current());
  }, []);
  const [recoveryCandidate, setRecoveryCandidate] =
    useState<CadRecoveryRecord | null>(null);
  /**
   * ¿El borrador ofrecido parte de una versión que el servidor ya superó? Es
   * una RAMA local, no un borrador al día, y el aviso tiene que decirlo: sus
   * cambios no se pueden guardar encima sin decidir antes qué pasa con lo que
   * la otra sesión escribió.
   */
  const [recoveryDivergent, setRecoveryDivergent] = useState(false);
  const [recoverySavedAt, setRecoverySavedAt] = useState<string | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(null);
  /**
   * Carril de recuperación de ESTA pestaña y momento en que empezó a editar
   * ESTE documento. Los dos acotan qué puede borrar un guardado: sólo lo que
   * esta pestaña escribió en esta sesión. Antes se borraba el ámbito entero.
   *
   * Se rellenan en un efecto, no en el render: `cadRecoveryLaneId()` toca
   * `sessionStorage` y `Date.now()` no es puro, y ninguna de las dos cosas
   * puede pasar mientras React está renderizando.
   */
  const recoveryLaneRef = useRef<string | null>(null);
  const recoverySessionStartedAtRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("idle");
  const [saveIssue, setSaveIssue] = useState<{
    kind: "conflict" | "offline" | "server";
    message: string;
    serverVersion?: number;
  } | null>(null);
  /**
   * Incidentes de conflicto CAS, UNO POR DOCUMENTO.
   *
   * Antes era un solo `saveConflictRef` comparado sólo por número de versión.
   * Los números de versión no son únicos entre documentos —cada dibujo tiene su
   * contador y todos arrancan en 0—, así que un conflicto en el plano A con
   * base v3 detenía el autosave del plano B en cuanto B pasaba por su propia
   * v3: un dibujo sin conflicto cuyo trabajo dejaba de subir al servidor.
   *
   * Vive en un ref porque lo consulta el programador de autosave, que corre
   * fuera del ciclo de render.
   */
  const conflictRegistryRef = useRef<CadConflictRegistry>({});
  const versionByDocumentRef = useRef(new Map<string, number>());
  const savedGenerationByDocumentRef = useRef(new Map<string, number>());
  const autosaveSchedulerRef = useRef<ReturnType<
    typeof createDebouncedAutosave
  > | null>(null);
  const captureCanonicalSaveRequestRef = useRef<
    () => CanonicalSaveRequest | null
  >(() => null);
  const persistCanonicalSaveRef = useRef<
    (
      request: CanonicalSaveRequest,
      origin: "manual" | "autosave",
    ) => Promise<Layout | null>
  >(async () => null);
  if (autosaveSchedulerRef.current === null)
    autosaveSchedulerRef.current = createDebouncedAutosave(2_000, {
      onStateChange: (state) => {
        setSaveStatus(state.status);
        setSaving(state.status === "saving");
      },
    });
  useEffect(() => {
    if (!drawingReadOnly) return;
    // Revoking edit permission must also revoke already scheduled client work.
    // The API remains authoritative for an in-flight request.
    autosaveSchedulerRef.current?.cancel();
    dirtyRef.current = false;
    setDirty(false);
  }, [drawingReadOnly]);
  const [serverBusy, setServerBusy] = useState(false); // server auto-arrange/optimize in flight (unify)
  const [approval, setApproval] = useState<LayoutApproval | null>(null); // sign-off status (unify)
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [dxfBusy, setDxfBusy] = useState(false); // DXF backdrop upload/remove in flight (unify)
  const [dxfWarnings, setDxfWarnings] = useState<CadDxfImportWarning[]>([]);
  const [dxfImportPreview, setDxfImportPreview] =
    useState<CadDxfImportResult | null>(null);
  const [showDxfExport, setShowDxfExport] = useState(false);
  const [plotPaper, setPlotPaper] = useState<CadPaperId>("A4");
  const [showSheetPackage, setShowSheetPackage] = useState(false);
  const [paperSpaces, setPaperSpaces] = useState<CadPaperSpace[]>([]);
  const [paperSpaceLayers, setPaperSpaceLayers] = useState<CadLayerDef[]>([]);
  /**
   * Gestor de capas: filtros, borradores y estados de capa.
   *
   * El nombre y el color de la capa nueva eran dos `useState` del monolito;
   * viven ahora en el anfitrión junto al resto del estado del gestor, que de
   * otro modo habría sumado cuatro más (dos filtros y el nombre del estado).
   */
  const layerManagerHost = useCadLayerManagerHost();
  const layerManager = useCadLayerManager(layerManagerHost);
  const styleManagerHost = useCadStyleManagerHost();
  const styleManager = useCadStyleManager(styleManagerHost);
  // Las filas del gestor se calculan al final del render; las acciones se
  // montan mucho antes, así que las leen por referencia viva.
  const cadLayerRowsRef = useRef<CadLayerManagerRow[]>([]);
  const [cadXrefs, setCadXrefs] = useState<CadExternalReference[]>([]);
  const [publicationRecords, setPublicationRecords] = useState<
    CadPublicationRecord[]
  >([]);
  const [activePaperSpaceId, setActivePaperSpaceId] = useState<string | null>(
    null,
  );
  const [activePaperViewportId, setActivePaperViewportId] = useState<
    string | null
  >(null);
  const [layoutPreviewSheet, setLayoutPreviewSheet] =
    useState<CadPublishSheet | null>(null);
  const [cadLibraryTab, setCadLibraryTab] = useState<"blocks" | "xrefs">(
    "blocks",
  );
  const [showCollaborationDock, setShowCollaborationDock] = useState(false);
  // CANJE DEL REVIEW LINK — efecto de montaje, deliberadamente independiente
  // de la carga del documento. El invitado que llega con `#cadReview=` no debe
  // depender de que la rama del documento canónico se ejecute: su modo de sólo
  // lectura lo decide el SERVIDOR (`GET /v1/cad/review/context` revalida hash,
  // expiración y revocación) y debe aplicarse aunque el dibujo tarde o falle.
  useEffect(() => {
    let cancelled = false;
    const redeem = async () => {
      const readOnlyReview = await redeemReviewLink();
      if (cancelled || !readOnlyReview) return;
      setCadReviewReadOnly(true);
      setShowCollaborationDock(true);
    };
    void redeem();
    // Un enlace pegado en la MISMA pestaña sólo cambia el fragmento: no hay
    // recarga ni remonte, así que sin esto el invitado se quedaría en modo
    // edición con un token válido en la barra.
    const onHashChange = () => void redeem();
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
  const [filletRadius, setFilletRadius] = useState(100);
  const [chamferDistanceA, setChamferDistanceA] = useState(100);
  const [chamferDistanceB, setChamferDistanceB] = useState(100);
  const [lineEditOperation, setLineEditOperation] = useState<"trim" | "extend">(
    "trim",
  );
  const [lineEditEndpoint, setLineEditEndpoint] =
    useState<CadLineEndpoint>("start");
  const [lineEditTargetId, setLineEditTargetId] = useState("");
  const [publishingSheetSet, setPublishingSheetSet] = useState(false);
  const [publicationWarnings, setPublicationWarnings] = useState<
    CadPublishWarning[]
  >([]);
  const [dxfExportOptions, setDxfExportOptions] = useState<DxfExportOptions>({
    scope: "all",
    includeHidden: true,
    includeMeasurements: true,
    includeLabels: true,
    units: "mm",
    fileName: "",
  });
  const [dxfExportSummary, setDxfExportSummary] = useState<DxfExportSummary>({
    objects: 0,
    connectors: 0,
    measurements: 0,
    labels: 0,
    layers: 0,
    canExport: false,
    includedLayers: [],
    layerSummary: [],
    issues: [],
  });
  /**
   * PREFLIGHT de pérdidas del DXF.
   *
   * El flujo era: generar Blob → `a.click()` → cerrar el modal → decir "listo"
   * → y SÓLO entonces calcular qué se había perdido. El usuario recibía el
   * fichero y el mensaje de éxito antes de saber que había geometría dentro
   * que el DXF no representa, y con el modal ya cerrado no quedaba superficie
   * donde leer el detalle.
   *
   * Ahora las pérdidas se calculan ANTES de existir el Blob, con exactamente
   * el mismo alcance, selección, capas y opciones con los que se exportaría.
   * `token` describe esa entrada: si cambia el documento, la selección, el
   * alcance o las opciones, la aceptación anterior deja de ser válida.
   */
  const [dxfPreflight, setDxfPreflight] = useState<{
    token: string;
    losses: CadLossManifestEntry[];
    blocking: boolean;
  } | null>(null);
  const [dxfPreflightAccepted, setDxfPreflightAccepted] = useState<string | null>(
    null,
  );
  const [sheetPackageDraft, setSheetPackageDraft] =
    useState<CadSheetPackageDraft>({
      project: branding.productLabel,
      drawingNo: "A-0001",
      discipline: "Architecture / Engineering",
      sheet: "S-001",
      revision: "P01",
      scale: "Fit to sheet",
      preparedBy: "",
      checkedBy: "",
      approvedBy: "",
      notes: "",
    });
  const dxfInputRef = useRef<HTMLInputElement | null>(null);
  // Visión plano→muros (Fase 71 cableada, ADR §217): imagen → CIDE multimodal
  // → normalizeVision → muros/zonas editables. El humano revisa antes de insertar.
  const visionInputRef = useRef<HTMLInputElement | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionPreview, setVisionPreview] = useState<
    (VisionResult & { imageName: string }) | null
  >(null);
  const [showVersions, setShowVersions] = useState(false); // versions/scenarios modal (unify)
  const [localSnapshots, setLocalSnapshots] = useState<
    CadSnapshotHistory<Snapshot>
  >({ snapshots: [] });
  const [snapshotDiff, setSnapshotDiff] = useState<CadSnapshotDiff | null>(
    null,
  );
  const [versions, setVersions] = useState<
    {
      id: string;
      name: string;
      createdAt: string;
      stationCount: number;
      assetCount: number;
    }[]
  >([]);
  const [versName, setVersName] = useState("");
  const [versBusy, setVersBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0); // bump to re-run the load effect (after restore)
  const [cellsView, setCellsView] = useState<Cell[]>([]);
  const [showCells, setShowCells] = useState(false); // cells/zones panel
  const [showClone, setShowClone] = useState(false); // clone-from-template modal
  const [cloneSrc, setCloneSrc] = useState("");
  const [cloneBusy, setCloneBusy] = useState(false);
  const [showCommand, setShowCommand] = useState(true); // always-accessible deterministic command dock
  const [showPalette, setShowPalette] = useState(false); // Cmd-K CAD palette (local registry/search)
  const [paletteQuery, setPaletteQuery] = useState("");
  const [recentPaletteActions, setRecentPaletteActions] = useState<string[]>(
    [],
  );
  const paletteOpenRef = useRef(false);
  const [commandText, setCommandText] = useState("");
  const [commandPreview, setCommandPreview] =
    useState<CommandPreviewState | null>(null);
  const [commandLog, setCommandLog] = useState<CadCommandHistoryItem[]>([]);
  const [commandHistoryCursor, setCommandHistoryCursor] = useState(-1);
  const [commandHistoryHydratedKey, setCommandHistoryHydratedKey] = useState<
    string | null
  >(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const commandPreviewRef = useRef<CommandPreviewState | null>(null);
  const commandTextRef = useRef("");
  // Copiloto IA (ADR §215): propuesta NL→CAD / optimización — humano aprueba.
  const [aiBusy, setAiBusy] = useState<null | "intent" | "optimize">(null);
  const [aiProposal, setAiProposal] = useState<CadAiProposal | null>(null);
  const [selList, setSelList] = useState<SelItem[]>([]);
  const [selSnap, setSelSnap] = useState<SelSnap | null>(null);
  const [selSummary, setSelSummary] = useState<CadSelectionProperties | null>(
    null,
  );
  const [nativeSelectionIds, setNativeSelectionIds] = useState<string[]>([]);
  const [nativeDocumentRevision, setNativeDocumentRevision] = useState(0);
  const [nativeEntities, setNativeEntities] = useState<CadNativeEntity[]>([]);
  const [nativeRenderStats, setNativeRenderStats] = useState({
    total: 0,
    visible: 0,
    rendered: 0,
    omitted: 0,
    batching: false,
  });
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [assetIds, setAssetIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"stations" | "equipment">(
    standalone ? "equipment" : "stations",
  );
  const [symbolSearch, setSymbolSearch] = useState("");
  const [symbolCategory, setSymbolCategory] = useState<
    CadSymbolCategory | "all"
  >("all");
  const [rackGenerator, setRackGenerator] = useState<CadRackRowGeneratorInput>({
    rows: 2,
    baysPerRow: 4,
    bayWidth: 2400,
    rackDepth: 1100,
    aisleWidth: 3000,
    orientation: "horizontal",
    labelPrefix: "R",
  });
  const [dockGenerator, setDockGenerator] =
    useState<CadDockStagingGeneratorInput>({
      dockCount: 4,
      stagingLanes: 4,
      dockWidth: 3200,
      dockDepth: 900,
      stagingDepth: 5000,
      aisleWidth: 3600,
      side: "south",
      mode: "receiving",
      labelPrefix: "D",
    });
  const [supermarketGenerator, setSupermarketGenerator] =
    useState<CadSupermarketGeneratorInput>({
      lanes: 3,
      cartsPerLane: 1,
      laneLength: 3600,
      laneWidth: 750,
      cartWidth: 1100,
      cartDepth: 750,
      aisleWidth: 1200,
      orientation: "horizontal",
      labelPrefix: "K",
      includeEsdZone: true,
      includeQuarantine: true,
    });
  const [tool, setTool] = useState<EditorTool>("select");
  const [showSelectionPalette, setShowSelectionPalette] = useState(false);
  const [selectionGeometryMode, setSelectionGeometryMode] =
    useState<CadSelectionGeometryMode>("pick");
  const [selectionOperation, setSelectionOperation] =
    useState<CadSelectionOperation>("replace");
  const [quickSelectionType, setQuickSelectionType] = useState("");
  const [quickSelectionLayer, setQuickSelectionLayer] = useState("");
  const [quickSelectionText, setQuickSelectionText] = useState("");
  const [professionalSelection, setProfessionalSelection] =
    useState<CadSelectionState>(EMPTY_CAD_SELECTION);
  const [hatchPickMode, setHatchPickMode] = useState(false);
  const [showHatchPalette, setShowHatchPalette] = useState(false);
  const [hatchPickSolid, setHatchPickSolid] = useState(false);
  const [hatchIslandStyle, setHatchIslandStyle] = useState<
    "normal" | "outer" | "ignore"
  >("normal");
  const [mtextEditorOpen, setMTextEditorOpen] = useState(false);
  const [editingMTextId, setEditingMTextId] = useState<string | null>(null);
  const [showDimensionPalette, setShowDimensionPalette] = useState(false);
  const [showMleaderPalette, setShowMleaderPalette] = useState(false);
  const [showBlockPalette, setShowBlockPalette] = useState(false);
  const [showWorkspaceDock, setShowWorkspaceDock] = useState(false);
  const [workspacePreferences, setWorkspacePreferences] =
    useState<CadWorkspacePreferences>(CAD_WORKSPACE_DEFAULTS);
  const [workspaceHydratedKey, setWorkspaceHydratedKey] = useState<
    string | null
  >(null);
  const [cadContextMenu, setCadContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d"); // 2D = locked top-down plan view (CAD unificado)
  const [walk, setWalk] = useState(false); // first-person walkthrough mode
  const [showHelp, setShowHelp] = useState(false); // keyboard shortcuts overlay
  const [focusMode, setFocusMode] = useState(false); // hide side panels — maximise the canvas (EPIC 0)
  const [showMinimap, setShowMinimap] = useState(true); // plant overview minimap (EPIC 0)
  const [measureLive, setMeasureLive] = useState<string | null>(null);
  const [dimCount, setDimCount] = useState(0);
  const [measurementRowsView, setMeasurementRowsView] = useState<
    MeasurementRow[]
  >([]);
  const [theme, setTheme] = useState<Theme3D>("dark");
  const [sun, setSun] = useState({ az: 35, el: 55 }); // sun azimuth/elevation (deg)
  const [showView, setShowView] = useState(false);
  const [viewMenuPosition, setViewMenuPosition] = useState({
    left: 8,
    top: 56,
  });
  const [fpDraft, setFpDraft] = useState<{ w: number; h: number; g: number }>({
    w: 0,
    h: 0,
    g: 0,
  });
  const [plantDisplayUnit, setPlantDisplayUnit] = useState<"m" | "mm">("m"); // readout-only toggle, no cambia el footprint guardado
  const [viewportBookmarks, setViewportBookmarks] = useState<
    CadViewportBookmark[]
  >([]);
  const [layers, setLayers] = useState({
    stations: true,
    equipment: true,
    connectors: true,
    dims: true,
    notes: true,
    labels: true,
    grid: true,
    dxf: true,
  });
  /**
   * La rejilla NO se ha movido al anfitrión de ayudas al dibujo, aunque
   * DSETTINGS la conmute: la dibuja la escena y la leen veinte sitios del
   * editor. Mover un estado que veinte llamadas leen es otra ola; mezclar esa
   * migración con la de OSNAP habría hecho el diff imposible de verificar.
   * Aquí sólo quedan los dos conmutadores, estables por identidad para no
   * anular la memoización del cuadro.
   */
  const toggleGridVisible = useCallback(
    () => setLayers((current) => ({ ...current, grid: !current.grid })),
    [],
  );
  const toggleGridSnap = useCallback(() => setSnap((value) => !value), []);
  const toggleEditorLayer = useCallback(
    (key: CadEditorLayerKey, value: boolean) =>
      setLayers((current) => ({ ...current, [key]: value })),
    [],
  );
  const [cadLayers, setCadLayers] = useState<CadLayer[]>(DEFAULT_CAD_LAYERS);
  const [layerAssignments, setLayerAssignments] = useState<CadLayerAssignments>(
    {},
  );
  // Grupos CAD (Ctrl+G, ADR §223): assetId → groupId. Clic en un miembro
  // selecciona el grupo completo (Alt+clic entra al objeto individual).
  const [objectGroups, setObjectGroups] = useState<Record<string, string>>({});
  // Biblioteca de bloques reutilizables del tenant (ADR §224).
  const [cadBlocks, setCadBlocks] = useState<CadBlockRow[]>([]);
  const loadCadBlocks = useCallback(async () => {
    try {
      const response = await legacyCadFetch("cad-blocks");
      if (response.ok) setCadBlocks((await response.json()) as CadBlockRow[]);
    } catch {
      /* transitorio — la sección muestra "sin bloques" */
    }
  }, []);
  const [activeCadLayer, setActiveCadLayer] = useState<CadLayerId>("equipment");
  /**
   * El efecto de la escena se monta con `[open, data]` y captura las funciones
   * de dibujo de ese render. Leer `activeCadLayer` (estado) desde dentro de esa
   * clausura devolvía la capa ACTIVA AL MONTAR: cambiar de capa y dibujar con
   * el ratón seguía escribiendo en la anterior, y el usuario sólo lo descubría
   * al recargar. El commit consulta el ref, así que ratón, entrada dinámica y
   * entrada de precisión comparten una única frontera canónica.
   */
  const activeCadLayerRef = useRef<CadLayerId>(activeCadLayer);
  useEffect(() => {
    activeCadLayerRef.current = activeCadLayer;
  }, [activeCadLayer]);
  const cadLayersRef = useRef<CadLayer[]>(DEFAULT_CAD_LAYERS);
  const syncCadLayerState = useCallback((document: CadDocument) => {
    const projected = document.layers.length
      ? document.layers.map((layer) => ({
          id: layer.id,
          label: layer.name,
          color: layer.color,
          visible: layer.visible,
          locked: layer.locked,
        }))
      : DEFAULT_CAD_LAYERS.map((layer) => ({ ...layer }));
    cadLayersRef.current = projected;
    setCadLayers(projected);
    setPaperSpaceLayers(document.layers.map((layer) => ({ ...layer })));
    setActiveCadLayer((current) =>
      projected.some((layer) => layer.id === current)
        ? current
        : (projected.find((layer) => !layer.locked)?.id ??
          projected[0]?.id ??
          "0"),
    );
  }, []);
  const layerAssignmentsRef = useRef<CadLayerAssignments>({});
  const objectGroupsRef = useRef<Record<string, string>>({});
  const [objectTags, setObjectTags] = useState<Record<string, string>>({});
  const [objectNotes, setObjectNotes] = useState<Record<string, string>>({});
  const objectTagsRef = useRef<Record<string, string>>({});
  const objectNotesRef = useRef<Record<string, string>>({});
  const [aisleWidth, setAisleWidth] = useState(1200);
  const [hist, setHist] = useState({ undo: 0, redo: 0 }); // depths, for button enablement
  const [takeoff, setTakeoff] = useState<LocalTakeoff | null>(null); // quantities panel (null = closed)
  const [report, setReport] = useState<DesignReport | null>(null); // design-check report (null = closed) (Fase 63)
  const [collisionHits, setCollisionHits] = useState<CadCollisionHit[]>([]);
  const [clearanceIssues, setClearanceIssues] = useState<CadClearanceIssue[]>(
    [],
  );
  const [safetyIssues, setSafetyIssues] = useState<CadSafetyIssue[]>([]);
  const [cadValidationReport, setCadValidationReport] =
    useState<CadValidationReport | null>(null);
  const [industrySummary, setIndustrySummary] =
    useState<IndustrySummary | null>(null);
  const [validationHighlightIds, setValidationHighlightIds] = useState<
    Set<string>
  >(new Set());
  const [flowHealth, setFlowHealth] = useState<CadFlowScore | null>(null);
  const [flowSequence, setFlowSequence] = useState<CadFlowNode[]>([]);
  const [flowSegments, setFlowSegments] = useState<CadFlowSegment[]>([]);
  const [analysisPanel, setAnalysisPanel] = useState<string | null>(null); // active analysis panel key (unify)
  const [showAnalysis, setShowAnalysis] = useState(false); // analysis dropdown open
  const analysisMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<OverlayKind | null>(null); // active station-status overlay (unify)
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const overlayMenuRef = useRef<HTMLDivElement | null>(null);
  const overlayColorRef = useRef<Map<string, number>>(new Map()); // stationName → hex int (empty = no overlay)
  const validationHighlightRef = useRef<Set<string>>(new Set());
  const [showHeat, setShowHeat] = useState(false); // occupancy heat-map overlay on the floor (Fase 51)
  const [arr, setArr] = useState({
    cols: 3,
    rows: 1,
    gap: 500,
    dx: 1000,
    dy: 0,
  }); // array/offset params (Fase 55)
  const [showGaps, setShowGaps] = useState(false); // clearance/safety gap markers overlay (Fase 52)
  const viewportBookmarkStorageKey = `valle:cad:viewport-bookmarks:${model}:${revision}`;
  // Las vistas guardadas se persistieron con el prefijo del nombre de
  // producto anterior; se migran al leerlas (ver lib/storage-rename.ts).
  const legacyViewportBookmarkStorageKey = `axos:cad:viewport-bookmarks:${model}:${revision}`;
  useEffect(() => {
    paletteOpenRef.current = showPalette;
  }, [showPalette]);
  useEffect(() => {
    commandPreviewRef.current = commandPreview;
  }, [commandPreview]);
  useEffect(() => {
    commandTextRef.current = commandText;
  }, [commandText]);
  const commandHistoryStorageKey = cadCommandHistoryStorageKey({
    tenantId,
    userId,
    buildingId,
    projectId,
    model,
    revision,
  });
  useEffect(() => {
    let active = true;
    let restoredHistory: CadCommandHistoryItem[] = [];
    if (open && commandHistoryStorageKey)
      restoredHistory = readCadCommandHistory(window.localStorage, {
        tenantId,
        userId,
        buildingId,
        projectId,
        model,
        revision,
      });
    queueMicrotask(() => {
      if (!active) return;
      setCommandHistoryHydratedKey(open ? commandHistoryStorageKey : null);
      setCommandHistoryCursor(-1);
      setCommandLog(restoredHistory);
    });
    return () => {
      active = false;
    };
  }, [
    buildingId,
    commandHistoryStorageKey,
    model,
    open,
    projectId,
    revision,
    tenantId,
    userId,
  ]);
  useEffect(() => {
    if (
      !open ||
      !commandHistoryStorageKey ||
      commandHistoryHydratedKey !== commandHistoryStorageKey
    )
      return;
    try {
      window.localStorage.setItem(
        commandHistoryStorageKey,
        serializeCadCommandHistory(commandLog),
      );
    } catch {
      // Private browsing/storage pressure keeps the in-memory audit available.
    }
  }, [commandHistoryHydratedKey, commandHistoryStorageKey, commandLog, open]);
  const readViewportBookmarks = () => {
    try {
      const raw = readRenamedStorageKey(
        window.localStorage,
        viewportBookmarkStorageKey,
        legacyViewportBookmarkStorageKey,
      );
      return sanitizeCadViewportBookmarks(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  };
  const persistViewportBookmarks = (bookmarks: CadViewportBookmark[]) => {
    try {
      window.localStorage.setItem(
        viewportBookmarkStorageKey,
        JSON.stringify(bookmarks),
      );
    } catch {
      // Browser storage can be disabled; saved views stay usable for this session.
    }
  };

  // three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  // Dueño de las DOS cámaras. En 2D manda la ortográfica: proyección paralela,
  // `pixelsPerUnit` legible y tolerancia de snap exacta. En 3D sigue mandando
  // la perspectiva de siempre. OrbitControls continúa siendo el dispositivo de
  // entrada; de su objetivo y su distancia se deriva la vista ortográfica.
  const viewControllerRef = useRef<CadViewController | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // El viewport 3D exige WebGL. Cuando el navegador no lo ofrece (WebGL
  // deshabilitado, sin GPU, headless sin fallback software) NO se puede
  // romper el editor completo: el documento, las paletas y las propiedades
  // siguen siendo utilizables sin render. Este flag conmuta el aviso honesto.
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const controlsRef = useRef<OrbitControls | null>(null);
  const blocksRef = useRef<THREE.Group | null>(null);
  const assetsGroupRef = useRef<THREE.Group | null>(null);
  const nativeGroupRef = useRef<THREE.Group | null>(null);
  const nativeInsertBatchRef = useRef<THREE.Group | null>(null);
  const nativeOverviewRef = useRef<THREE.LineSegments | null>(null);
  const nativeOverviewDocumentRef = useRef<CadDocument | null>(null);
  const dimsGroupRef = useRef<THREE.Group | null>(null);
  const notesGroupRef = useRef<THREE.Group | null>(null);
  const connsGroupRef = useRef<THREE.Group | null>(null);
  const cellsGroupRef = useRef<THREE.Group | null>(null); // rebuildable cell tints (unify)
  const rebuildCellsRef = useRef<() => void>(() => {});
  const connectorsRef = useRef<Conn[]>([]); // mutable line connectors (auto-connect, Fase 62)
  const cellsRef = useRef<Cell[]>([]); // mutable cells/zones (unify — editable + round-trip)
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const dxfGroupRef = useRef<THREE.Group | null>(null);
  const heatGroupRef = useRef<THREE.Group | null>(null); // occupancy heat-map tiles
  const heatLoadedRef = useRef(false); // lazy-load the density grid only once per scene
  const showHeatRef = useRef(false); // current toggle, read inside the scene-init effect
  const loadHeatRef = useRef<() => void>(() => {}); // latest loadHeat, callable from init
  const gapsGroupRef = useRef<THREE.Group | null>(null); // clearance gap markers
  const gapsLoadedRef = useRef(false);
  const showGapsRef = useRef(false);
  const loadGapsRef = useRef<() => void>(() => {});
  const guidesGroupRef = useRef<THREE.Group | null>(null); // object-snap alignment guides (Fase 54)
  const dxfModelRef = useRef<DxfModel | null>(null);
  const dxfMetaRef = useRef<DxfMeta | null>(null);
  const rebuildDxfRef = useRef<() => void>(() => {});
  const [hasDxf, setHasDxf] = useState(false); // a DXF backdrop is loaded → can trace it into walls (Fase 58)
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.Object3D | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const walkRef = useRef(false);
  const walkYawRef = useRef(0);
  const walkPitchRef = useRef(0);
  const walkKeysRef = useRef({ f: false, b: false, l: false, r: false });
  const savedCamRef = useRef<{
    px: number;
    py: number;
    pz: number;
    tx: number;
    ty: number;
    tz: number;
  } | null>(null);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const snapMarkerRef = useRef<THREE.Mesh | null>(null); // ring shown when the cursor snaps to the DXF underlay (Fase 60)
  const dxfSnapRef = useRef<{ x: number; y: number }[]>([]); // precomputed DXF snap targets (footprint coords)
  const meshByIdRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const groupByAssetRef = useRef<Map<string, THREE.Group>>(new Map());
  const layersRef = useRef(layers);
  const applyLayersRef = useRef<() => void>(() => {});
  // El historial retiene estados canónicos inmutables mediante referencias y
  // structural sharing; aplica presupuesto estricto en vez de clonar hasta 80
  // documentos completos por gesto.
  const canonicalHistoryRef = useRef<CanonicalHistory<CadDocument> | null>(
    null,
  );
  const loadedCadDocumentRef = useRef<CadDocument | null>(null);
  const nativeSelectionIdsRef = useRef<string[]>([]);
  const professionalSelectionRef =
    useRef<CadSelectionState>(EMPTY_CAD_SELECTION);
  const selectionGeometryModeRef = useRef<CadSelectionGeometryMode>("pick");
  const selectionOperationRef = useRef<CadSelectionOperation>("replace");
  const hatchPickModeRef = useRef(false);
  const hatchPickCallbackRef = useRef<
    (point: { x: number; y: number }) => void
  >(() => {});
  const nativeSceneSyncRef =
    useRef<CadSceneSynchronizer<THREE.Object3D> | null>(null);
  /**
   * Pipeline de render por lotes, encendido por defecto (ver
   * `render-pipeline-preference.ts`). El anfitrión vive en una ref porque lo
   * conduce el bucle de cuadros, no React: un `useState` por cuadro sería un
   * render por cuadro, y el presupuesto de `check:cad` sólo permite bajar.
   */
  const renderPipelineRef = useRef<CadRenderPipelineChoice>("batched");
  const renderPipelineResolvedRef = useRef(false);
  const renderPipelineHostRef = useRef<CadViewportRenderHost | null>(null);
  const solidShadeHostRef = useRef<CadSolidShadeHost | null>(null);
  /**
   * Reproyecta los objetos heredados de la SELECCIÓN.
   *
   * Con el pipeline por lotes, la proyección por entidad se reduce a lo
   * designado —es lo único que aporta grips y realce por encima del lote—, así
   * que designar tiene que crear ese objeto. `refreshNativeSelectionVisuals`
   * sólo recoloreaba los que ya existían, y con el camino nuevo la entidad
   * recién designada no existía todavía: se quedaba sin grips y no se podía
   * arrastrar. La cierra `syncNativeScene`, que deja aquí su proyección.
   */
  const nativeSelectionProjectionRef = useRef<
    ((selected: ReadonlySet<string>) => void) | null
  >(null);
  const renderPipelineSlotRef = useRef<CadRenderHostSlot | null>(null);
  /**
   * Enrutado del puntero al motor de comandos (FASE 2). Vive en refs porque lo
   * conducen manejadores de evento a 60 Hz: un `useState` por movimiento del
   * ratón sería un render del árbol entero por muestra.
   */
  const enginePointerRouterRef = useRef<CadEnginePointerRouter | null>(null);
  const nativeGripControllerRef = useRef<CadNativeGripController | null>(null);
  const enginePreviewRef = useRef<CadEnginePreview | null>(null);
  const engineLiveCursorRef = useRef<CadLiveCursorOverlay | null>(null);
  const engineCursorPointRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Estado del comando en curso: último punto confirmado y si lo arrancó la
   * barra. Vive AQUÍ y no dentro del enrutador porque el enrutador se recrea con
   * el lienzo THREE —que se vuelve a montar al cambiar de documento o de
   * planta— y el comando del motor no: su anfitrión es un `useMemo` sin
   * dependencias. Con esto dentro, un remontaje a mitad de un comando dejaba al
   * motor con su comando abierto y al enrutador con la memoria en blanco.
   */
  const engineSessionRef = useRef<CadPointerSession>(EMPTY_CAD_POINTER_SESSION);
  const engineOsnapOverrideRef = useRef<readonly SnapType[] | null>(null);
  /** Hueco del aviso superior donde el cursor vivo escribe el modo capturado. */
  const engineSnapLabelRef = useRef<HTMLSpanElement | null>(null);
  if (renderPipelineSlotRef.current === null)
    renderPipelineSlotRef.current = new CadRenderHostSlot();
  if (typeof window !== "undefined" && !renderPipelineResolvedRef.current) {
    renderPipelineResolvedRef.current = true;
    renderPipelineRef.current = resolveCadRenderPipeline({
      storage: window.localStorage,
      search: window.location.search,
    });
  }
  const nativeSelectionIndexRef = useRef<CadNativeSelectionIndex | null>(null);
  const nativeViewportBoundsRef = useRef<CadBounds | null>(null);
  const nativeIndexedDocumentRef = useRef<CadDocument | null>(null);
  const workspacePreferencesRef = useRef<CadWorkspacePreferences>(
    CAD_WORKSPACE_DEFAULTS,
  );
  const workspaceShortcutsRef = useRef(
    buildCadWorkspaceShortcuts(CAD_WORKSPACE_DEFAULTS),
  );
  const crosshairOverlayRef = useRef<HTMLDivElement | null>(null);
  const cursorCoordinateRef = useRef<HTMLSpanElement | null>(null);
  if (nativeSceneSyncRef.current === null)
    nativeSceneSyncRef.current = new CadSceneSynchronizer<THREE.Object3D>();
  if (nativeSelectionIndexRef.current === null)
    nativeSelectionIndexRef.current = new CadNativeSelectionIndex();

  // layout state refs (drive both the scene and the save)
  const placementsRef = useRef<Map<string, Placement>>(new Map());
  const assetsRef = useRef<Map<string, Asset>>(new Map());
  const annotationsRef = useRef<Map<string, Ann>>(new Map());
  const stationsByIdRef = useRef<Map<string, St>>(new Map());
  const loadedPlacedRef = useRef<Set<string>>(new Set());
  const ctxRef = useRef<{ s: number; W: number; H: number } | null>(null);
  const measureARef = useRef<{ wx: number; wy: number } | null>(null);
  const wallChainRef = useRef<{ wx: number; wy: number } | null>(null);
  const selRef = useRef<SelItem[]>([]);
  const snapRef = useRef(snap);
  const toolRef = useRef(tool);
  const themeRef = useRef(theme);
  const sunRef = useRef(sun);
  // El ciclo de vida de la escena se monta una sola vez y necesita saber en qué
  // modo arranca la vista sin volver a montarse cuando el modo cambia.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    selectionGeometryModeRef.current = selectionGeometryMode;
  }, [selectionGeometryMode]);
  useEffect(() => {
    selectionOperationRef.current = selectionOperation;
  }, [selectionOperation]);
  useEffect(() => {
    hatchPickModeRef.current = hatchPickMode;
  }, [hatchPickMode]);
  /**
   * Núcleo de precisión (Fase 66 cableada, ADR §216): OSNAP por modo, orto
   * 0/90/180/270, rastreo polar y OTRACK.
   *
   * Vivían aquí como SEIS `useState` con su `ref` espejo y su `useEffect` de
   * sincronía cada uno, porque la ruta del puntero corre en un manejador nativo
   * y no puede leer estado de React. Ahora el estado vive fuera —ver
   * `draft-settings-host.ts`—: el puntero lee los getters directamente y la
   * interfaz se suscribe con `useSyncExternalStore`. Seis estados, cinco refs y
   * cinco efectos menos, y a cambio los catorce modos de captura se pueden
   * configurar, que es lo que DSETTINGS venía a resolver.
   */
  const draftSettingsHost = useCadDraftSettingsHost();
  const draftSettings = useCadDraftSettings(draftSettingsHost);
  /** Qué paleta/gestor está abierto. También fuera de React, por lo mismo. */
  const paletteHost = useCadPaletteHost();
  const activePalette = useCadPalette(paletteHost).open;
  // Los métodos de los anfitriones son propiedades flecha por instancia, así que
  // ya son estables por identidad y se pasan directos: envolverlos en
  // `useCallback` no habría añadido estabilidad, sólo ruido.
  // El único que sí necesita envoltorio: el cuadro habla en `string` para no
  // importar `SnapType` de `lib/cad`, y aquí se estrecha.
  const toggleDraftOsnapMode = useCallback(
    (mode: string, value: boolean) =>
      draftSettingsHost.setOsnapMode(mode as SnapType, value),
    [draftSettingsHost],
  );
  const lastWallAngleRef = useRef<number | null>(null); // ángulo del último tramo → entrada directa de distancia
  const [precisionText, setPrecisionText] = useState("");
  const [drawPrompt, setDrawPrompt] = useState<string | null>(null);
  const [canCloseDraftPolyline, setCanCloseDraftPolyline] = useState(false);
  const drawCommandRef = useRef<CadDrawCommandState | null>(null);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);
  useEffect(() => {
    setTheme(resolvedScheme === "light" ? "light" : "dark");
  }, [resolvedScheme]);

  const workspacePreferenceKey = useMemo(
    () => cadWorkspaceStorageKey({ tenantId, userId }),
    [tenantId, userId],
  );
  useEffect(() => {
    if (!open) {
      setWorkspaceHydratedKey(null);
      return;
    }
    const restored = loadCadWorkspacePreferences(window.localStorage, {
      tenantId,
      userId,
    });
    workspacePreferencesRef.current = restored;
    workspaceShortcutsRef.current = buildCadWorkspaceShortcuts(restored);
    setWorkspacePreferences(restored);
    setShowCommand(restored.commandDock);
    setShowMinimap(restored.minimap);
    setWorkspaceHydratedKey(workspacePreferenceKey);
  }, [open, tenantId, userId, workspacePreferenceKey]);
  useEffect(() => {
    workspacePreferencesRef.current = workspacePreferences;
    workspaceShortcutsRef.current =
      buildCadWorkspaceShortcuts(workspacePreferences);
    if (!open || workspaceHydratedKey !== workspacePreferenceKey) return;
    try {
      window.localStorage.setItem(
        workspacePreferenceKey,
        JSON.stringify(workspacePreferences),
      );
    } catch {
      /* local workspace persistence is best-effort */
    }
  }, [
    open,
    workspaceHydratedKey,
    workspacePreferenceKey,
    workspacePreferences,
  ]);

  const updateWorkspacePreferences = useCallback(
    (next: CadWorkspacePreferences) => {
      const normalized = normalizeCadWorkspacePreferences(next);
      workspacePreferencesRef.current = normalized;
      workspaceShortcutsRef.current = buildCadWorkspaceShortcuts(normalized);
      setWorkspacePreferences(normalized);
      setShowCommand(normalized.commandDock);
      setShowMinimap(normalized.minimap);
    },
    [],
  );
  /**
   * Revela la paleta de propiedades (Ctrl+1).
   *
   * El panel derecho es un recurso compartido: lo ocupan los paneles
   * profesionales —selección, hatch, cotas, bloques…— y el modo enfoque lo
   * esconde entero. Enseñar propiedades es, literalmente, dejarlo libre.
   */
  const revealPropertiesPalette = useCallback(() => {
    setShowSelectionPalette(false);
    setShowHatchPalette(false);
    setShowDimensionPalette(false);
    setShowMleaderPalette(false);
    setShowBlockPalette(false);
    setShowCollaborationDock(false);
    setShowWorkspaceDock(false);
    setFocusMode(false);
    if (!workspacePreferencesRef.current.rightDock)
      updateWorkspacePreferences({
        ...workspacePreferencesRef.current,
        rightDock: true,
      });
  }, [updateWorkspacePreferences]);
  const applyWorkspaceProfile = useCallback(
    (profile: CadWorkspaceProfile) => {
      updateWorkspacePreferences(
        applyCadWorkspaceProfile(workspacePreferencesRef.current, profile),
      );
      setFocusMode(false);
    },
    [updateWorkspacePreferences],
  );
  const resetWorkspacePreferences = useCallback(() => {
    updateWorkspacePreferences(CAD_WORKSPACE_DEFAULTS);
    setFocusMode(false);
  }, [updateWorkspacePreferences]);

  // Workbench full-screen: el CAD (`fixed inset-0`) se monta DENTRO de una ruta
  // standard (pestaña CAD de line-engineering). Mientras está abierto se avisa a
  // la plataforma (en enterprise, `setWorkbenchChrome`) para que el shell oculte
  // el dock y los widgets flotantes (que si no quedan ENCIMA del lienzo). Se
  // restablece al cerrarse/desmontarse.
  useEffect(() => {
    onFullscreenChange?.(open);
    return () => onFullscreenChange?.(false);
  }, [open, onFullscreenChange]);

  // ---- sun position (azimuth/elevation) → directional light + shadows ----
  const applySun = useCallback(() => {
    const L = dirLightRef.current;
    const ctx = ctxRef.current;
    if (!L || !ctx) return;
    const { az, el } = sunRef.current;
    const D = Math.max(ctx.W, ctx.H) * ctx.s * 1.4;
    const a = (az * Math.PI) / 180,
      e = (el * Math.PI) / 180;
    L.position.set(
      D * Math.cos(e) * Math.sin(a),
      Math.max(0.5, D * Math.sin(e)),
      D * Math.cos(e) * Math.cos(a),
    );
  }, []);
  useEffect(() => {
    sunRef.current = sun;
    applySun();
  }, [sun, applySun]);

  // ---- layer visibility (cheap: toggles object/group visibility, no rebuild) ----
  const defaultLayerForAsset = useCallback((assetId: string): CadLayerId => {
    const asset = assetsRef.current.get(assetId);
    return asset
      ? defaultCadLayerForAssetKind(asset.kind, objectTagsRef.current[assetId])
      : "equipment";
  }, []);
  const applyLayers = useCallback(() => {
    const L = layersRef.current;
    const cadVisible = (objectId: string, fallback: CadLayerId) => {
      const layerId = layerAssignmentsRef.current[objectId] ?? fallback;
      return (
        cadLayersRef.current.find((layer) => layer.id === layerId)?.visible ??
        true
      );
    };
    const cadLayerVisible = (layerId: CadLayerId) =>
      cadLayersRef.current.find((layer) => layer.id === layerId)?.visible ??
      true;
    if (blocksRef.current) {
      blocksRef.current.visible = true;
      blocksRef.current.children.forEach((child) => {
        const stationId = child.userData?.stationId as string | undefined;
        const labelFor = child.userData?.labelFor as string | undefined;
        if (stationId)
          child.visible = L.stations && cadVisible(stationId, "layout");
        else if (labelFor)
          child.visible =
            L.labels && L.stations && cadVisible(labelFor, "layout");
      });
    }
    if (assetsGroupRef.current) {
      assetsGroupRef.current.visible = true;
      assetsGroupRef.current.children.forEach((child) => {
        const assetId = child.userData?.assetId as string | undefined;
        if (assetId)
          child.visible =
            L.equipment && cadVisible(assetId, defaultLayerForAsset(assetId));
      });
    }
    if (nativeGroupRef.current) {
      const document = loadedCadDocumentRef.current;
      nativeGroupRef.current.visible = L.equipment;
      nativeGroupRef.current.children.forEach((child) => {
        if (child.userData?.nativeOverview === true) {
          child.visible = L.equipment;
          setCadNativeOverviewHiddenLayers(
            child as THREE.LineSegments,
            new Set(
              document?.layers
                .filter((layer) => layer.visible === false)
                .map((layer) => layer.id) ?? [],
            ),
          );
          return;
        }
        // El pipeline por lotes apaga capas por LOTE, no por objeto: es un
        // booleano en unos pocos hijos en vez de reconstruir la geometría.
        if (child.userData?.cadRenderScene === true) {
          child.visible = L.equipment;
          renderPipelineHostRef.current?.setHiddenLayers(
            new Set(
              document?.layers
                .filter((layer) => layer.visible === false)
                .map((layer) => layer.id) ?? [],
            ),
          );
          return;
        }
        if (child.userData?.nativeBlockBatch === true) {
          child.visible = L.equipment;
          setCadInsertBatchHiddenLayers(
            child as THREE.Group,
            new Set(
              document?.layers
                .filter((layer) => layer.visible === false)
                .map((layer) => layer.id) ?? [],
            ),
          );
          return;
        }
        const entityId = child.userData?.nativeEntityId as string | undefined;
        const entity = entityId
          ? nativeSelectionIndexRef.current?.entity(entityId)
          : undefined;
        const layer = entity
          ? document?.layers.find((candidate) => candidate.id === entity.layer)
          : undefined;
        child.visible = L.equipment && layer?.visible !== false;
      });
    }
    if (connsGroupRef.current)
      connsGroupRef.current.visible = L.connectors && cadLayerVisible("flow");
    if (dimsGroupRef.current)
      dimsGroupRef.current.visible = L.dims && cadLayerVisible("measurements");
    if (notesGroupRef.current) notesGroupRef.current.visible = L.notes;
    if (dxfGroupRef.current) dxfGroupRef.current.visible = L.dxf;
    if (gridGroupRef.current) gridGroupRef.current.visible = L.grid;
    sceneRef.current?.traverse((o) => {
      if (!o.userData?.isLabel) return;
      const labelFor = o.userData?.labelFor as string | undefined;
      o.visible = labelFor
        ? L.labels && L.stations && cadVisible(labelFor, "layout")
        : L.labels;
    });
  }, [defaultLayerForAsset]);
  useEffect(() => {
    applyLayersRef.current = applyLayers;
  }, [applyLayers]);
  useEffect(() => {
    layersRef.current = layers;
    applyLayers();
  }, [layers, applyLayers]);
  useEffect(() => {
    cadLayersRef.current = cadLayers;
    applyLayers();
  }, [cadLayers, applyLayers]);
  useEffect(() => {
    layerAssignmentsRef.current = layerAssignments;
    applyLayers();
  }, [layerAssignments, applyLayers]);
  useEffect(() => {
    objectGroupsRef.current = objectGroups;
  }, [objectGroups]);
  useEffect(() => {
    objectTagsRef.current = objectTags;
  }, [objectTags]);
  useEffect(() => {
    objectNotesRef.current = objectNotes;
  }, [objectNotes]);

  // close the view/layers popover when clicking outside it
  useEffect(() => {
    if (!showView) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        viewMenuRef.current &&
        !viewMenuRef.current.contains(target) &&
        !viewMenuPanelRef.current?.contains(target)
      )
        setShowView(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showView]);
  useEffect(() => {
    if (!showAnalysis) return;
    const onDoc = (e: MouseEvent) => {
      if (
        analysisMenuRef.current &&
        !analysisMenuRef.current.contains(e.target as Node)
      )
        setShowAnalysis(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showAnalysis]);

  // ---- visual theme (background / fog / floor / grid colours) ----
  const applyTheme = useCallback(() => {
    const sc = sceneRef.current;
    const ctx = ctxRef.current;
    const gg = gridGroupRef.current;
    if (!sc || !ctx) return;
    const th = THEMES[themeRef.current];
    sc.background = new THREE.Color(th.bg);
    if (sc.fog instanceof THREE.Fog) sc.fog.color.setHex(th.fog);
    const ground = groundRef.current;
    if (ground)
      (ground.material as THREE.MeshStandardMaterial).color.setHex(th.ground);
    if (gg) {
      while (gg.children.length) {
        const o = gg.children[gg.children.length - 1];
        gg.remove(o);
        disposeObject(o);
      }
      const { s, W, H } = ctx;
      const fpGrid = data?.footprint.gridSize || 1;
      // Rectangular grid that matches the footprint exactly. A square GridHelper
      // (side = max dimension) used to overhang non-square plants, drawing cells
      // outside the placeable area — the user could see the cells but the drag
      // clamp (ctx.W/ctx.H) refused to drop objects there. Now every visible cell
      // is inside the plant, with ~square world cells, line count capped for perf.
      const halfW = (W * s) / 2,
        halfH = (H * s) / 2;
      const nx = Math.min(60, Math.max(2, Math.round(W / fpGrid)));
      const nz = Math.min(60, Math.max(2, Math.round(H / fpGrid)));
      const gridPts: THREE.Vector3[] = [];
      for (let i = 0; i <= nx; i++) {
        const x = -halfW + (i / nx) * (W * s);
        gridPts.push(
          new THREE.Vector3(x, 0, -halfH),
          new THREE.Vector3(x, 0, halfH),
        );
      }
      for (let j = 0; j <= nz; j++) {
        const z = -halfH + (j / nz) * (H * s);
        gridPts.push(
          new THREE.Vector3(-halfW, 0, z),
          new THREE.Vector3(halfW, 0, z),
        );
      }
      const grid = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(gridPts),
        new THREE.LineBasicMaterial({
          color: th.gridB,
          transparent: true,
          opacity: 0.6,
        }),
      );
      grid.position.y = 0.01;
      gridHelperRef.current = grid;
      gg.add(grid);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(W * s, H * s)),
        new THREE.LineBasicMaterial({ color: 0x64748b }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.y = 0.02;
      gg.add(edge);
      gg.visible = layersRef.current.grid;
    }
  }, [data]);
  useEffect(() => {
    applyTheme();
  }, [theme, applyTheme]);

  const getPlaceRef = useCallback(
    (it: SelItem) =>
      it.type === "station"
        ? placementsRef.current.get(it.id)
        : assetsRef.current.get(it.id),
    [],
  );
  const computePropertyObject = useCallback(
    (item: SelItem): CadPropertyObject | null => {
      const place = getPlaceRef(item);
      if (!place) return null;
      const fallbackLayer: CadLayerId =
        item.type === "station" ? "layout" : defaultLayerForAsset(item.id);
      const layerId = layerAssignmentsRef.current[item.id] ?? fallbackLayer;
      const layer = cadLayersRef.current.find(
        (candidate) => candidate.id === layerId,
      );

      if (item.type === "station") {
        const station = stationsByIdRef.current.get(item.id);
        return {
          id: item.id,
          type: "station",
          label: station?.station ?? item.id,
          kind: station?.line,
          x: place.x,
          y: place.y,
          width: place.w,
          height: place.h,
          rotation: place.rotation,
          layerId,
          layerLabel: layer?.label ?? layerId,
          layerVisible: layer?.visible ?? true,
          layerLocked: layer?.locked ?? false,
          tags: objectTagsRef.current[item.id],
          notes: objectNotesRef.current[item.id],
        };
      }

      const asset = assetsRef.current.get(item.id);
      if (!asset) return null;
      const meta = assetMeta(asset.kind);
      return {
        id: item.id,
        type: "asset",
        label: asset.label || meta.label,
        kind: asset.kind,
        x: place.x,
        y: place.y,
        width: place.w,
        height: place.h,
        rotation: place.rotation,
        layerId,
        layerLabel: layer?.label ?? layerId,
        layerVisible: layer?.visible ?? true,
        layerLocked: layer?.locked ?? false,
        tags: objectTagsRef.current[item.id],
        notes: objectNotesRef.current[item.id],
      };
    },
    [defaultLayerForAsset, getPlaceRef],
  );

  // Snapshot the selection's geometry into render-safe state (reads refs only
  // from event handlers, never during render — the Minimap/2D editor pattern).
  const computeSnap = useCallback((next: SelItem): SelSnap | null => {
    if (next.type === "station") {
      const p = placementsRef.current.get(next.id);
      const st = stationsByIdRef.current.get(next.id);
      if (!p || !st) return null;
      return {
        type: "station",
        id: next.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        rotation: p.rotation,
        title: st.station,
        subtitle: `Estación · ${st.line}${st.ctq ? " · CTQ" : ""}`,
        canDuplicate: false,
      };
    }
    const a = assetsRef.current.get(next.id);
    if (!a) return null;
    const def = assetMeta(a.kind);
    return {
      type: "asset",
      id: next.id,
      x: a.x,
      y: a.y,
      w: a.w,
      h: a.h,
      rotation: a.rotation,
      title: a.label || def.label,
      subtitle: `Equipo · ${a.kind}${a.label ? ` · ${def.label}` : ""}`,
      kind: a.kind,
      height: def.height,
      canDuplicate: true,
    };
  }, []);
  const refreshSelectionSnapshot = useCallback(
    (next: SelItem[]) => {
      setSelSnap(next.length === 1 ? computeSnap(next[0]) : null);
      const objects = next
        .map(computePropertyObject)
        .filter((item): item is CadPropertyObject => !!item);
      setSelSummary(summarizeCadSelectionProperties(objects));
    },
    [computePropertyObject, computeSnap],
  );
  const recordProfessionalSelection = useCallback((keys: readonly string[]) => {
    const next = reduceCadSelection(professionalSelectionRef.current, {
      type: "apply",
      keys,
    });
    professionalSelectionRef.current = next;
    setProfessionalSelection(next);
  }, []);
  // Replace the whole selection (selSnap mirrors the single-object case).
  const select = useCallback(
    (next: SelItem[]) => {
      selRef.current = next;
      setSelList(next);
      refreshSelectionSnapshot(next);
      recordProfessionalSelection([
        ...next.map((item) => `${item.type}:${item.id}`),
        ...nativeSelectionIdsRef.current.map((id) => `native:${id}`),
      ]);
    },
    [recordProfessionalSelection, refreshSelectionSnapshot],
  );
  const refreshSnap = useCallback(
    () => refreshSelectionSnapshot(selRef.current),
    [refreshSelectionSnapshot],
  );

  // ---- first-person walkthrough: drop to eye level, look by dragging, WASD ----
  const toggleWalk = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    setWalk((prev) => {
      const next = !prev;
      walkRef.current = next;
      if (next) {
        savedCamRef.current = {
          px: cam.position.x,
          py: cam.position.y,
          pz: cam.position.z,
          tx: ctrl.target.x,
          ty: ctrl.target.y,
          tz: ctrl.target.z,
        };
        ctrl.enabled = false;
        const eyeY = Math.max(ctx.W, ctx.H) * ctx.s * 0.06;
        cam.position.set(0, eyeY, Math.max(ctx.W, ctx.H) * ctx.s * 0.4);
        walkYawRef.current = 0;
        walkPitchRef.current = -0.05; // looking toward -Z (the plant), slightly down
        walkKeysRef.current = { f: false, b: false, l: false, r: false };
        selRef.current = [];
        setSelList([]);
        setSelSnap(null);
      } else {
        const s = savedCamRef.current;
        if (s) {
          cam.position.set(s.px, s.py, s.pz);
          ctrl.target.set(s.tx, s.ty, s.tz);
        }
        ctrl.enabled = true;
        ctrl.update();
      }
      return next;
    });
  }, []);

  // ---- data ----
  useEffect(() => {
    if (!open || !model) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setData(null);
      dataRef.current = null;
      setError(null);
      setConnectionState("checking");
      setSelList([]);
      setSelSnap(null);
      setNativeSelectionIds([]);
      setNativeEntities([]);
      setDirty(false);
      dirtyRef.current = false;
      editGenerationRef.current = 0;
      setSaveIssue(null);
      setSaveStatus("idle");
      // Un incidente del documento anterior no puede sobrevivir al cambio: su
      // panel ofrece recargar y sobrescribir, y aplicarlos sobre el dibujo que
      // ahora está delante destruiría el que no es.
      conflictRegistryRef.current = archiveCadConflictsExcept(
        conflictRegistryRef.current,
        documentId,
      );
      setRecoveryCandidate(null);
      setRecoveryDivergent(false);
      setRecoverySavedAt(null);
      setTab("stations");
      setOverlay(null);
      setTool("select");
      setMeasureLive(null);
      setWalk(false);
      setHist({ undo: 0, redo: 0 });
      setCellsView([]);
      setPaperSpaces([]);
      setPaperSpaceLayers([]);
      setCadXrefs([]);
      setPublicationRecords([]);
      setActivePaperSpaceId(null);
      setActivePaperViewportId(null);
      setLayoutPreviewSheet(null);
      setPublicationWarnings([]);
      setValidationHighlightIds(new Set());
      setCollisionHits([]);
      setClearanceIssues([]);
      setSafetyIssues([]);
      setCadValidationReport(null);
      setIndustrySummary(null);
      setFlowHealth(null);
      setFlowSequence([]);
      setFlowSegments([]);
      setSnapshotDiff(null);
      setReport(null);
      setShowCollaborationDock(false);
      setCadReviewReadOnly(false);
    });
    selRef.current = [];
    nativeSelectionIdsRef.current = [];
    overlayColorRef.current = new Map();
    validationHighlightRef.current = new Set();
    toolRef.current = "select";
    measureARef.current = null;
    wallChainRef.current = null;
    walkRef.current = false;
    savedCamRef.current = null;
    canonicalHistoryRef.current = null;
    loadedCadDocumentRef.current = null;
    (async () => {
      try {
        let d: Layout;
        if (documentId) {
          const opened = await documentLifecycle.open(documentId);
          const row = {
            ...opened.metadata,
            cadDocument: opened.document,
            cadDocumentVersion: opened.version,
          } as unknown as OpenedDocument;
          d = layoutFromDocument(
            model,
            revision,
            row,
            (opened.metadata.dxf ?? null) as Parameters<
              typeof layoutFromDocument
            >[3],
          ) as Layout;
        } else {
          const r = await legacyCadFetch(
            `layout?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
          );
          if (!r.ok) {
            setError("No se pudo cargar el layout.");
            return;
          }
          d = (await r.json()) as Layout;
        }
        if (!alive) return;
        setConnectionState("online");
        const pl = new Map<string, Placement>();
        d.stations.forEach((s) => {
          if (s.x !== null && s.y !== null) {
            pl.set(s.id, {
              x: s.x,
              y: s.y,
              w: s.w ?? Math.round(d.footprint.footprintW * 0.06),
              h: s.h ?? Math.round(d.footprint.footprintH * 0.08),
              rotation: s.rotation ?? 0,
            });
          }
        });
        const am = new Map<string, Asset>();
        (d.assets ?? []).forEach((a) =>
          am.set(a.id, { ...a, rotation: a.rotation ?? 0 }),
        );
        const an = new Map<string, Ann>();
        (d.annotations ?? []).forEach((a) => {
          if (a && a.id) an.set(a.id, a);
        });
        placementsRef.current = pl;
        assetsRef.current = am;
        annotationsRef.current = an;
        stationsByIdRef.current = new Map(d.stations.map((s) => [s.id, s]));
        connectorsRef.current = (d.connectors ?? []).map((c) => ({ ...c }));
        // El documento canónico manda cuando trae la sección: es donde se
        // guardan desde que dejaron de perderse por la vía moderna. El modelo
        // heredado sigue alimentando a los documentos que nunca la tuvieron.
        const canonicalCells = d.cadDocument
          ? (migrateCadDocument(d.cadDocument).cells ?? null)
          : null;
        cellsRef.current = (canonicalCells ?? d.cells ?? []).map((c) => ({
          ...c,
          stationIds: [...(c.stationIds ?? [])],
        }));
        setCellsView(
          cellsRef.current.map((c) => ({
            ...c,
            stationIds: [...c.stationIds],
          })),
        );
        setApproval(
          (d as { approval?: LayoutApproval }).approval ?? {
            status: "draft",
            by: null,
            at: null,
            note: null,
          },
        );
        loadedPlacedRef.current = new Set(pl.keys());
        setPlacedIds(new Set(pl.keys()));
        setAssetIds(new Set(am.keys()));
        setDimCount([...an.values()].filter((a) => a.type === "dim").length);
        // Restaura la capa CAD y el grupo por asset persistidos (ADR §219/§223).
        const restoredLayers: CadLayerAssignments = {};
        const restoredGroups: Record<string, string> = {};
        const restoredTags: Record<string, string> = {};
        const restoredNotes: Record<string, string> = {};
        (d.assets ?? []).forEach((a) => {
          const layer = (a as { layer?: string }).layer;
          if (layer?.trim()) restoredLayers[a.id] = layer;
          const group = (a as { group?: string }).group;
          if (group) restoredGroups[a.id] = group;
          if (a.tags?.length) restoredTags[a.id] = a.tags.join(", ");
        });
        // El documento CANÓNICO manda para los grupos cuando existe: el
        // guardado canónico los escribe en `box.group`, mientras que
        // `d.assets[].group` sólo lo actualiza la vía heredada y por tanto se
        // queda viejo en cuanto se guarda por la moderna.
        //
        // Las NOTAS sólo viven ahí: no hay campo heredado del que sacarlas, así
        // que el documento canónico es su ÚNICA fuente.
        if (d.cadDocument) {
          try {
            const canonical = cadDocumentToEditorSnapshot(
              migrateCadDocument(d.cadDocument),
            );
            if (canonical.groups && Object.keys(canonical.groups).length)
              Object.assign(restoredGroups, canonical.groups);
            if (canonical.notes) Object.assign(restoredNotes, canonical.notes);
          } catch {
            // Documento inválido: la rama de abajo ya avisa y cae a la
            // proyección compatible. Aquí se conserva lo heredado.
          }
        }
        setLayerAssignments(restoredLayers);
        setObjectGroups(restoredGroups);
        objectGroupsRef.current = restoredGroups;
        objectTagsRef.current = restoredTags;
        setObjectTags(restoredTags);
        objectNotesRef.current = restoredNotes;
        setObjectNotes(restoredNotes);
        const projection = editorSnapshotToCadDocument(
          {
            placements: [...pl.entries()],
            assets: [...am.values()],
            annotations: [...an.values()],
            connectors: connectorsRef.current,
            layers: restoredLayers,
            tags: restoredTags,
            // Sin esto, abrir REPROYECTABA sin grupos y los borraba del
            // documento canónico en memoria; el siguiente guardado persistía
            // la versión ya mutilada. Las notas van por el mismo motivo.
            groups: restoredGroups,
            notes: restoredNotes,
          },
          { unit: d.footprint.unit },
        );
        try {
          loadedCadDocumentRef.current = d.cadDocument
            ? replaceEditorProjection(
                migrateCadDocument(d.cadDocument),
                projection,
              )
            : projection;
        } catch {
          loadedCadDocumentRef.current = projection;
          toast.error(
            "El documento CAD canónico no era válido; se cargó la proyección compatible.",
            "CAD",
          );
        }
        const restoredPaperSpaces =
          loadedCadDocumentRef.current.paperSpaces.map((space) => ({
            ...space,
            entityIds: [...space.entityIds],
            viewports: space.viewports?.map((viewport) => ({
              ...viewport,
              paperBounds: { ...viewport.paperBounds },
              modelBounds: { ...viewport.modelBounds },
              layerVisibility: viewport.layerVisibility
                ? { ...viewport.layerVisibility }
                : undefined,
              layerOverrides: viewport.layerOverrides
                ? { ...viewport.layerOverrides }
                : undefined,
            })),
            titleBlock: space.titleBlock
              ? {
                  ...space.titleBlock,
                  attributes: { ...space.titleBlock.attributes },
                }
              : undefined,
          }));
        setPaperSpaces(restoredPaperSpaces);
        syncCadLayerState(loadedCadDocumentRef.current);
        setCadXrefs(
          loadedCadDocumentRef.current.externalReferences.map((reference) => ({
            ...reference,
          })),
        );
        setPublicationRecords([...loadedCadDocumentRef.current.publications]);
        // El canje del review link NO vive aquí: ver el efecto de montaje
        // `redeemReviewLink`. Colgarlo de esta rama lo ataba a que el
        // documento canónico cargara, y un invitado que llega con un enlace
        // necesita su modo de sólo lectura ANTES e INDEPENDIENTEMENTE de eso.
        setActivePaperSpaceId(restoredPaperSpaces[0]?.id ?? null);
        setActivePaperViewportId(
          restoredPaperSpaces[0]?.viewports?.[0]?.id ?? null,
        );
        setLayoutPreviewSheet(null);
        setNativeEntities(
          (loadedCadDocumentRef.current?.entities ?? []).filter(
            (entity): entity is CadNativeEntity =>
              CAD_ENTITY_REGISTRY.supports(entity),
          ),
        );
        setNativeDocumentRevision((value) => value + 1);
        canonicalHistoryRef.current = new CanonicalHistory(
          loadedCadDocumentRef.current!,
          {
            maxEntries: 80,
            maxRetainedBytes: 32 * 1024 * 1024,
            groupWindowMs: 400,
            onMetric: (metric) => {
              if (typeof performance === "undefined") return;
              performance.measure(`cad.history.${metric.event}`, {
                start: performance.now(),
                duration: 0,
                detail: metric,
              });
            },
          },
        );
        if (documentId) {
          versionByDocumentRef.current.set(
            documentId,
            d.cadDocumentVersion ?? 0,
          );
          savedGenerationByDocumentRef.current.set(documentId, 0);
        }
        dataRef.current = d;
        setData(d);
        // fetch + parse the read-only DXF backdrop (the endpoint already serves
        // the raw drawing); render it on the floor once ready.
        dxfModelRef.current = null;
        dxfMetaRef.current = null;
        dxfSnapRef.current = [];
        setHasDxf(false);
        setDxfWarnings([]);
        setDxfImportPreview(null);
        if (d.dxf) {
          try {
            const rd = await legacyCadFetch(
              `layout/dxf?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
            );
            if (alive && rd.ok) {
              const raw = (await rd.json()) as { data?: string } | null;
              dxfModelRef.current = raw?.data ? parseDxf(raw.data) : null;
              dxfMetaRef.current = d.dxf;
              setHasDxf(!!dxfModelRef.current && !!dxfMetaRef.current);
              dxfSnapRef.current =
                dxfModelRef.current && dxfMetaRef.current
                  ? dxfSnapPoints(dxfModelRef.current, dxfMetaRef.current)
                  : [];
              rebuildDxfRef.current();
            }
          } catch {
            /* ignore — backdrop is optional */
          }
        }
      } catch {
        if (alive) {
          setConnectionState("offline");
          setError("No se pudo cargar el layout.");
        }
      }
    })();
    return () => {
      alive = false;
      if (documentId && dirtyRef.current && !drawingReadOnlyRef.current) {
        const request = captureCanonicalSaveRequestRef.current();
        if (request?.documentId === documentId)
          void autosaveSchedulerRef
            .current!.run(async () => {
              const saved = await persistCanonicalSaveRef.current(
                request,
                "autosave",
              );
              if (!saved) throw new Error("cad_document_change_flush_failed");
            })
            .catch(() => undefined);
      }
    };
    // `toast` intentionally stays out: the provider object is not referentially
    // stable and would reload the complete drawing after every notification.
  }, [
    open,
    model,
    revision,
    documentId,
    documentLifecycle,
    reloadTick,
    syncCadLayerState,
  ]);

  const snapWorld = useCallback(
    (v: number) => {
      const g = data?.footprint.gridSize || 1;
      return maybeSnapScalarToGrid(v, g, snapRef.current);
    },
    [data],
  );

  // ---- (re)build the station blocks + connectors ----
  const rebuildBlocks = useCallback(() => {
    const blocks = blocksRef.current;
    const conns = connsGroupRef.current;
    const ctx = ctxRef.current;
    if (!blocks || !ctx || !data) return;
    while (blocks.children.length) {
      const o = blocks.children[blocks.children.length - 1];
      blocks.remove(o);
      disposeObject(o);
    }
    if (conns)
      while (conns.children.length) {
        const o = conns.children[conns.children.length - 1];
        conns.remove(o);
        disposeObject(o);
      }
    meshByIdRef.current = new Map();
    const { s, W, H } = ctx;
    const byId = new Map(data.stations.map((st) => [st.id, st]));
    placementsRef.current.forEach((p, id) => {
      const st = byId.get(id);
      if (!st) return;
      const hgt = Math.max(0.6, Math.min(p.w * s, p.h * s) * 0.7);
      const isSel = selRef.current.some(
        (s) => s.type === "station" && s.id === id,
      );
      const isAlert = validationHighlightRef.current.has(id);
      const ov = overlayColorRef.current.get(st.station); // station-status overlay tint (unify)
      const color = isAlert
        ? 0xf87171
        : isSel
          ? SELECT
          : ov !== undefined
            ? ov
            : st.ctq
              ? AMBER
              : ROSE;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(p.w * s, hgt, p.h * s),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.45,
          metalness: 0.12,
          emissive: isAlert ? 0x7f1d1d : isSel ? 0x0e7490 : 0x000000,
        }),
      );
      mesh.castShadow = true;
      mesh.userData.stationId = id;
      const cx = (p.x + p.w / 2 - W / 2) * s;
      const cz = (p.y + p.h / 2 - H / 2) * s;
      mesh.position.set(cx, hgt / 2, cz);
      mesh.rotation.y = -(p.rotation * Math.PI) / 180;
      blocks.add(mesh);
      meshByIdRef.current.set(id, mesh);
      const label = makeLabel(st.station);
      label.position.set(cx, hgt + 1.1, cz);
      label.userData.labelFor = id;
      blocks.add(label);
    });
    // connectors as arched tubes between stations or generated assets
    const connectorEndpoint = (id: string): THREE.Vector3 | null => {
      const station = placementsRef.current.get(id);
      if (station) {
        const height = Math.max(
          0.6,
          Math.min(station.w * s, station.h * s) * 0.7,
        );
        return new THREE.Vector3(
          (station.x + station.w / 2 - W / 2) * s,
          height + 0.2,
          (station.y + station.h / 2 - H / 2) * s,
        );
      }
      const asset = assetsRef.current.get(id);
      if (!asset) return null;
      const def = assetMeta(asset.kind);
      const flat = def.archetype === "zone" || def.archetype === "path";
      const height = flat ? 0.55 : Math.max(0.4, def.height * s);
      return new THREE.Vector3(
        (asset.x + asset.w / 2 - W / 2) * s,
        height + 0.2,
        (asset.y + asset.h / 2 - H / 2) * s,
      );
    };
    connectorsRef.current.forEach((cn) => {
      const start = connectorEndpoint(cn.from);
      const end = connectorEndpoint(cn.to);
      if (!start || !end) return;
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y += start.distanceTo(end) * 0.22 + 0.8;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.QuadraticBezierCurve3(start, mid, end),
          24,
          0.09,
          7,
          false,
        ),
        new THREE.MeshStandardMaterial({
          color:
            cn.kind === "conveyor"
              ? 0x7c3aed
              : cn.kind === "return"
                ? 0x94a3b8
                : 0x3b82f6,
          roughness: 0.4,
        }),
      );
      (conns ?? blocks).add(tube);
    });
    applyLayersRef.current();
  }, [data]);

  // ---- (re)build the equipment/asset group ----
  const rebuildAssets = useCallback(() => {
    const group = assetsGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) {
      const o = group.children[group.children.length - 1];
      group.remove(o);
      disposeObject(o);
    }
    groupByAssetRef.current = new Map();
    const { s, W, H } = ctx;
    assetsRef.current.forEach((a) => {
      const isSel = selRef.current.some(
        (s) => s.type === "asset" && s.id === a.id,
      );
      const g = buildAssetGroup(
        a,
        s,
        W,
        H,
        isSel,
        validationHighlightRef.current.has(a.id),
      );
      group.add(g);
      groupByAssetRef.current.set(a.id, g);
    });
  }, []);

  // ---- (re)build the dimension/cota overlay (preserves the live preview line) ----
  const rebuildDims = useCallback(() => {
    const group = dimsGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    const preview = previewLineRef.current;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const o = group.children[i];
      if (o === preview) continue;
      group.remove(o);
      disposeObject(o);
    }
    const { s, W, H } = ctx;
    const unit = data?.footprint.unit || "mm";
    annotationsRef.current.forEach((a) => {
      if (a.type !== "dim") return;
      buildDim(a, s, W, H, unit).forEach((o) => group.add(o));
    });
    if (preview && !group.children.includes(preview)) group.add(preview);
  }, [data]);
  const refreshMeasurementRows = useCallback(() => {
    const unit = data?.footprint.unit || "mm";
    setMeasurementRowsView(
      [...annotationsRef.current.values()]
        .filter((ann) => ann.type === "dim" && ann.x2 != null && ann.y2 != null)
        .map((ann) => ({
          id: ann.id,
          label:
            ann.text ||
            fmtDist(
              Math.hypot((ann.x2 ?? ann.x) - ann.x, (ann.y2 ?? ann.y) - ann.y),
              unit,
            ),
          length: fmtDist(
            Math.hypot((ann.x2 ?? ann.x) - ann.x, (ann.y2 ?? ann.y) - ann.y),
            unit,
          ),
        }))
        .slice(0, 8),
    );
  }, [data]);
  useEffect(() => {
    refreshMeasurementRows();
  }, [dimCount, refreshMeasurementRows]);

  // ---- (re)build the free-text notes overlay ----
  const rebuildNotes = useCallback(() => {
    const group = notesGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) {
      const o = group.children[group.children.length - 1];
      group.remove(o);
      disposeObject(o);
    }
    const { s, W, H } = ctx;
    annotationsRef.current.forEach((a) => {
      if (a.type !== "text" || !a.text) return;
      const lab = makeNoteLabel(a.text);
      lab.position.set((a.x - W / 2) * s, 1.2, (a.y - H / 2) * s);
      lab.userData.noteId = a.id;
      group.add(lab);
    });
  }, []);

  const refreshNativeSelectionVisuals = useCallback(() => {
    const selected = new Set(nativeSelectionIdsRef.current);
    // Con el pipeline por lotes la selección NO es una malla que recolorear:
    // es un color por instancia, así que se le pide al anfitrión que vuelva a
    // teselar lo que entra y sale de la selección. Los objetos heredados siguen
    // existiendo para los grips y el realce, y se recolorean abajo.
    renderPipelineHostRef.current?.setSelection(
      nativeSelectionIdsRef.current,
      loadedCadDocumentRef.current,
    );
    if (renderPipelineHostRef.current)
      nativeSelectionProjectionRef.current?.(selected);
    for (const [id, object] of nativeSceneSyncRef.current?.entries() ?? []) {
      setCadNativeObjectSelected(object, selected.has(id));
      if (object.userData.nativeBlockBatched === true)
        object.traverse((child) => {
          if (child.userData.nativePath === true)
            child.visible = selected.has(id);
        });
    }
  }, []);
  const selectNative = useCallback(
    (ids: string[]) => {
      const document = loadedCadDocumentRef.current;
      const next = [...new Set(ids)]
        .filter((id) => {
          const entity =
            nativeSelectionIndexRef.current?.entity(id) ??
            document?.entities.find((candidate) => candidate.id === id);
          return !!entity && CAD_ENTITY_REGISTRY.supports(entity);
        })
        .slice(0, 300);
      nativeSelectionIdsRef.current = next;
      setNativeSelectionIds(next);
      selRef.current = [];
      setSelList([]);
      setSelSnap(null);
      setSelSummary(null);
      recordProfessionalSelection(next.map((id) => `native:${id}`));
      refreshNativeSelectionVisuals();
    },
    [recordProfessionalSelection, refreshNativeSelectionVisuals],
  );
  const clearNativeSelection = useCallback(() => {
    nativeSelectionIdsRef.current = [];
    setNativeSelectionIds([]);
    recordProfessionalSelection(
      selRef.current.map((item) => `${item.type}:${item.id}`),
    );
    refreshNativeSelectionVisuals();
  }, [recordProfessionalSelection, refreshNativeSelectionVisuals]);
  const syncNativeScene = useCallback(
    (document = loadedCadDocumentRef.current, patch?: CadScenePatch) => {
      const group = nativeGroupRef.current;
      const context = ctxRef.current;
      const synchronizer = nativeSceneSyncRef.current;
      const selectionIndex = nativeSelectionIndexRef.current;
      if (!document || !group || !context || !synchronizer || !selectionIndex)
        return;
      if (nativeInsertBatchRef.current) {
        group.remove(nativeInsertBatchRef.current);
        disposeCadNativeObject(nativeInsertBatchRef.current);
      }
      const insertBatches = buildCadInsertBatchObject(document, {
        scale: context.s,
        width: context.W,
        height: context.H,
      });
      group.add(insertBatches);
      nativeInsertBatchRef.current = insertBatches;
      const batchedInsertIds = new Set<string>(
        (insertBatches.userData.nativeBlockBatchInsertIds as
          string[] | undefined) ?? [],
      );
      const render = (entity: CadNativeEntity) => {
        const object = buildCadNativeObject(
          entity,
          {
            scale: context.s,
            width: context.W,
            height: context.H,
          },
          nativeSelectionIdsRef.current.includes(entity.id),
          document,
        );
        if (entity.type === "insert" && batchedInsertIds.has(entity.id)) {
          object.userData.nativeBlockBatched = true;
          object.traverse((child) => {
            if (child.userData.nativePath === true)
              child.visible = nativeSelectionIdsRef.current.includes(entity.id);
          });
        }
        object.visible =
          document.layers.find((layer) => layer.id === entity.layer)
            ?.visible !== false;
        group.add(object);
        return object;
      };
      const sink: Parameters<typeof synchronizer.sync>[1] = {
        create: render,
        update: (entity, projection) => {
          disposeCadNativeObject(projection);
          return render(entity);
        },
        remove: (_id, projection) => {
          disposeCadNativeObject(projection);
        },
      };
      const nativeDocumentEntities = document.entities.filter(
        (entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
      );
      const documentChanged = nativeIndexedDocumentRef.current !== document;
      if (documentChanged) {
        if (patch && nativeIndexedDocumentRef.current)
          selectionIndex.applyPatch(patch, document);
        else selectionIndex.replace(nativeDocumentEntities, document);
        nativeIndexedDocumentRef.current = document;
      }
      /**
       * PIPELINE POR LOTES. Cuando está encendido, el espacio modelo lo dibuja
       * él entero y la proyección por entidad se reduce a la SELECCIÓN — que es
       * lo único que aporta que el lote no tiene: grips y realce por encima.
       *
       * Sin presupuesto, sin muestreo y sin overview: ésa es toda la diferencia.
       * `planCadNativeRenderBudget` existía para no morir dibujando 100.000
       * objetos de escena; aquí no hay 100.000 objetos, hay lotes por tile.
       *
       * Un cambio de vista NO entra por aquí: el pipeline lo resuelve con
       * `setView` en el bucle de cuadros. Reemplazar en cada paneo vaciaría la
       * caché de teselado y convertiría el paneo en la reconstrucción completa
       * que este camino existe para eliminar.
       */
      const shadedSolidIds = new Set(cadSolidEntityIds(document));
      solidShadeHostRef.current?.sync(
        document,
        new Set(nativeSelectionIdsRef.current),
      );
      const batchedHost = renderPipelineHostRef.current;
      if (batchedHost) {
        if (patch && batchedHost.loaded)
          batchedHost.invalidate(
            [...patch.upsert.map((entity) => entity.id), ...patch.remove],
            patch.upsert.filter(
              (entity) =>
                !batchedInsertIds.has(entity.id) && !shadedSolidIds.has(entity.id),
            ),
            // El documento de DESPUÉS: sin él, los vecinos de lo editado se
            // rederivan contra la vecindad de antes (uniones de muro).
            document,
          );
        else if (documentChanged || !batchedHost.loaded)
          batchedHost.replace(document, {
            excludeEntityIds: new Set([...batchedInsertIds, ...shadedSolidIds]),
          });
        batchedHost.setHiddenLayers(
          new Set(
            document.layers
              .filter((layer) => layer.visible === false)
              .map((layer) => layer.id),
          ),
        );
        setNativeRenderStats((current) =>
          current.total === nativeDocumentEntities.length &&
          current.omitted === 0 &&
          current.batching === false
            ? current
            : {
                total: nativeDocumentEntities.length,
                visible: nativeDocumentEntities.length,
                rendered: nativeDocumentEntities.length,
                omitted: 0,
                batching: false,
              },
        );
        // La proyección de la selección queda disponible para que designar la
        // vuelva a ejecutar sin repetir el lote de INSERT ni recorrer el
        // documento entero: designar es frecuente y el documento no cambia.
        let projected: string | null = null;
        const projectSelection = (selected: ReadonlySet<string>) => {
          // Sin esta memoria, `refreshNativeSelectionVisuals` reproyectaría
          // dentro de la propia proyección: una vuelta de más en cada
          // designación, sobre el documento entero.
          const key = [...selected].sort().join("|");
          if (key === projected) return;
          projected = key;
          synchronizer.sync(
            {
              ...document,
              entities: nativeDocumentEntities.filter((entity) =>
                selected.has(entity.id),
              ),
            },
            sink,
          );
        };
        nativeSelectionProjectionRef.current = projectSelection;
        projectSelection(new Set(nativeSelectionIdsRef.current));
        refreshNativeSelectionVisuals();
        applyLayersRef.current();
        return;
      }
      const visibleEntities = nativeViewportBoundsRef.current
        ? selectionIndex.search(nativeViewportBoundsRef.current)
        : undefined;
      const renderPlan = planCadNativeRenderBudget(
        nativeDocumentEntities,
        nativeSelectionIdsRef.current,
        undefined,
        visibleEntities ? { visibleEntities } : undefined,
      );
      const rebuildNativeOverview = () => {
        if (nativeOverviewRef.current)
          disposeCadNativeObject(nativeOverviewRef.current);
        const overview = buildCadNativeOverviewObject(
          nativeDocumentEntities,
          {
            scale: context.s,
            width: context.W,
            height: context.H,
          },
          8,
          new Set(
            document.layers
              .filter((layer) => layer.visible === false)
              .map((layer) => layer.id),
          ),
        );
        group.add(overview);
        nativeOverviewRef.current = overview;
        nativeOverviewDocumentRef.current = document;
      };
      if (renderPlan.limited) {
        if (!nativeOverviewRef.current) rebuildNativeOverview();
        else if (patch) {
          if (!updateCadNativeOverviewObject(nativeOverviewRef.current, patch))
            rebuildNativeOverview();
          else nativeOverviewDocumentRef.current = document;
        } else if (nativeOverviewDocumentRef.current !== document)
          rebuildNativeOverview();
      } else if (nativeOverviewRef.current) {
        disposeCadNativeObject(nativeOverviewRef.current);
        nativeOverviewRef.current = null;
        nativeOverviewDocumentRef.current = null;
      }
      const progressive = renderPlan.rendered > 500;
      setNativeRenderStats((current) =>
        current.total === renderPlan.total &&
        current.visible === renderPlan.visible &&
        current.rendered === renderPlan.rendered &&
        current.omitted === renderPlan.omitted &&
        current.batching === progressive
          ? current
          : {
              total: renderPlan.total,
              visible: renderPlan.visible,
              rendered: renderPlan.rendered,
              omitted: renderPlan.omitted,
              batching: progressive,
            },
      );
      const projectedDocument = { ...document, entities: renderPlan.entities };
      if (progressive) {
        void synchronizer
          .syncProgressive(projectedDocument, sink, {
            batchSize: 160,
          })
          .then((stats) => {
            if (stats.cancelled) return;
            refreshNativeSelectionVisuals();
            applyLayersRef.current();
            setNativeRenderStats((current) => ({
              ...current,
              batching: false,
            }));
          });
      } else if (patch && !renderPlan.limited)
        synchronizer.applyPatch(patch, sink);
      else synchronizer.sync(projectedDocument, sink);
      refreshNativeSelectionVisuals();
      applyLayersRef.current();
    },
    [refreshNativeSelectionVisuals],
  );

  // ---- (re)build the read-only DXF floor-plan overlay (lines on the floor) ----
  const rebuildDxf = useCallback(() => {
    const group = dxfGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) {
      const o = group.children[group.children.length - 1];
      group.remove(o);
      disposeObject(o);
    }
    const model = dxfModelRef.current;
    const meta = dxfMetaRef.current;
    if (!model || !meta) return;
    group.visible = layersRef.current.dxf && meta.visible !== false;
    const { s, W, H } = ctx;
    const { scale, offsetX: ox, offsetY: oy } = meta;
    const cx = (model.width * scale) / 2 + ox,
      cy = (model.height * scale) / 2 + oy; // rotation pivot (world)
    const rad = ((meta.rotation || 0) * Math.PI) / 180,
      cos = Math.cos(rad),
      sin = Math.sin(rad);
    const mat3 = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: Math.min(1, Math.max(0.15, meta.opacity ?? 0.6)),
    });
    model.polylines.forEach((flat) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const wx0 = flat[i] * scale + ox,
          wy0 = flat[i + 1] * scale + oy;
        const dx = wx0 - cx,
          dy = wy0 - cy;
        const wx = cx + dx * cos - dy * sin,
          wy = cy + dx * sin + dy * cos; // footprint world coords
        pts.push(new THREE.Vector3((wx - W / 2) * s, 0.045, (wy - H / 2) * s));
      }
      if (pts.length >= 2)
        group.add(
          new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat3),
        );
    });
  }, []);
  useEffect(() => {
    rebuildDxfRef.current = rebuildDxf;
  }, [rebuildDxf]);

  // ---- occupancy heat-map: paint the floor by zone density (Fase 51) ----
  // Reuses the density grid (Fase 48) and the same rose intensity ramp as the 2D
  // panel, so a packed corner glows solid and dead floor stays bare.
  const buildHeatTiles = useCallback((grid: number[][]) => {
    const group = heatGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    group.children.slice().forEach((c) => {
      group.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material)?.dispose?.();
    });
    const { s, W, H } = ctx;
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (!rows || !cols) return;
    const cw = W / cols,
      ch = H / rows; // footprint units per cell
    const rose = new THREE.Color(0xf43f5e);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pct = grid[r][c];
        if (pct < 1) continue; // bare floor stays bare
        const t = Math.min(1, pct / 100);
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(cw * s * 0.92, ch * s * 0.92),
          new THREE.MeshBasicMaterial({
            color: rose,
            transparent: true,
            opacity: 0.12 + 0.6 * t,
            depthWrite: false,
          }),
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(
          ((c + 0.5) * cw - W / 2) * s,
          0.05,
          ((r + 0.5) * ch - H / 2) * s,
        );
        group.add(plane);
      }
    }
  }, []);

  const loadHeat = useCallback(async () => {
    try {
      const r = await legacyCadFetch(
        `layout/density?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
      );
      if (!r.ok) return;
      const d = (await r.json()) as { grid?: number[][] };
      buildHeatTiles(d.grid ?? []);
    } catch {
      /* heat-map is a non-critical overlay — ignore fetch errors */
    }
  }, [model, revision, buildHeatTiles]);

  useEffect(() => {
    loadHeatRef.current = loadHeat;
  }, [loadHeat]);
  // Toggle visibility; lazy-load the grid the first time it's switched on.
  useEffect(() => {
    showHeatRef.current = showHeat;
    const group = heatGroupRef.current;
    if (!group) return;
    group.visible = showHeat;
    if (showHeat && !heatLoadedRef.current) {
      heatLoadedRef.current = true;
      loadHeat();
    }
  }, [showHeat, loadHeat]);

  // ---- clearance / safety gap markers on the floor (Fase 52) ----
  // Reuses the clearance analysis (Fase 43): draws a link between each pair of
  // objects flagged as too close (amber, with the gap) or overlapping (red), so
  // the safety problems the 2D panel lists become visible in the 3D scene.
  const buildGapMarkers = useCallback(
    (tightPairs: ClearancePair[], overlaps: ClearancePair[]) => {
      const group = gapsGroupRef.current;
      const ctx = ctxRef.current;
      if (!group || !ctx) return;
      group.children.slice().forEach((c) => {
        group.remove(c);
        const m = c as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x?.dispose?.());
        else mat?.dispose?.();
      });
      const { s, W, H } = ctx;
      const centerOf = (id: string): { cx: number; cy: number } | null => {
        const p = placementsRef.current.get(id);
        if (p) return { cx: p.x + p.w / 2, cy: p.y + p.h / 2 };
        const a = assetsRef.current.get(id);
        if (a) return { cx: a.x + a.w / 2, cy: a.y + a.h / 2 };
        return null;
      };
      const y = 0.08;
      const draw = (pair: ClearancePair, color: number, withLabel: boolean) => {
        const ca = centerOf(pair.a);
        const cb = centerOf(pair.b);
        if (!ca || !cb) return;
        const ax = (ca.cx - W / 2) * s,
          az = (ca.cy - H / 2) * s;
        const bx = (cb.cx - W / 2) * s,
          bz = (cb.cy - H / 2) * s;
        group.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(ax, y, az),
              new THREE.Vector3(bx, y, bz),
            ]),
            new THREE.LineBasicMaterial({ color }),
          ),
        );
        [
          [ax, az],
          [bx, bz],
        ].forEach(([px, pz]) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 10, 10),
            new THREE.MeshBasicMaterial({ color }),
          );
          dot.position.set(px, y, pz);
          group.add(dot);
        });
        if (withLabel) {
          const label = makeLabel(`${Math.round(pair.gap)}`, 0.85);
          label.position.set((ax + bx) / 2, y + 0.7, (az + bz) / 2);
          group.add(label);
        }
      };
      overlaps.forEach((p) => draw(p, 0xef4444, false)); // red = overlap (most severe)
      tightPairs.forEach((p) => draw(p, 0xf59e0b, true)); // amber = too close, with the gap
    },
    [],
  );

  const loadGaps = useCallback(async () => {
    try {
      const r = await legacyCadFetch(
        `layout/clearance?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
      );
      if (!r.ok) return;
      const d = (await r.json()) as {
        tightPairs?: ClearancePair[];
        overlaps?: ClearancePair[];
      };
      buildGapMarkers(d.tightPairs ?? [], d.overlaps ?? []);
    } catch {
      /* clearance overlay is non-critical — ignore fetch errors */
    }
  }, [model, revision, buildGapMarkers]);

  useEffect(() => {
    loadGapsRef.current = loadGaps;
  }, [loadGaps]);
  useEffect(() => {
    showGapsRef.current = showGaps;
    const group = gapsGroupRef.current;
    if (!group) return;
    group.visible = showGaps;
    if (showGaps && !gapsLoadedRef.current) {
      gapsLoadedRef.current = true;
      loadGaps();
    }
  }, [showGaps, loadGaps]);

  const rebuildAll = useCallback(() => {
    rebuildBlocks();
    rebuildAssets();
    rebuildDims();
    rebuildNotes();
    syncNativeScene();
    rebuildCellsRef.current();
  }, [
    rebuildBlocks,
    rebuildAssets,
    rebuildDims,
    rebuildNotes,
    syncNativeScene,
  ]);

  const buildSelectionUniverse = useCallback((): CadSelectableItem[] => {
    const result: CadSelectableItem[] = [];
    placementsRef.current.forEach((_placement, id) => {
      const station = stationsByIdRef.current.get(id);
      result.push({
        key: `station:${id}`,
        type: "station",
        layer: layerAssignmentsRef.current[id] ?? "layout",
        label: station?.station ?? id,
        properties: { line: station?.line ?? "", ctq: station?.ctq ?? false },
      });
    });
    assetsRef.current.forEach((asset, id) => {
      result.push({
        key: `asset:${id}`,
        type: "asset",
        layer: layerAssignmentsRef.current[id] ?? defaultLayerForAsset(id),
        label: asset.label || assetMeta(asset.kind).label,
        properties: {
          kind: asset.kind,
          tags: objectTagsRef.current[id] ?? "",
          notes: objectNotesRef.current[id] ?? "",
        },
      });
    });
    for (const entity of loadedCadDocumentRef.current?.entities ?? []) {
      if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
      result.push({
        key: `native:${entity.id}`,
        type: entity.type,
        layer: entity.layer,
        label: `${entity.type.toUpperCase()} ${entity.id}`,
        properties: CAD_ENTITY_REGISTRY.adapter(entity).properties.read(entity),
      });
    }
    return result;
  }, [defaultLayerForAsset]);

  const applyProfessionalSelection = useCallback(
    (action: CadSelectionAction) => {
      const next = reduceCadSelection(professionalSelectionRef.current, action);
      professionalSelectionRef.current = next;
      setProfessionalSelection(next);
      const legacy: SelItem[] = [];
      const nativeIds: string[] = [];
      for (const key of next.current) {
        const separator = key.indexOf(":");
        const type = key.slice(0, separator);
        const id = key.slice(separator + 1);
        if (!id) continue;
        if (type === "native") nativeIds.push(id);
        else if (type === "station" || type === "asset")
          legacy.push({ type, id });
      }
      selRef.current = legacy;
      setSelList(legacy);
      refreshSelectionSnapshot(legacy);
      nativeSelectionIdsRef.current = nativeIds;
      setNativeSelectionIds(nativeIds);
      refreshNativeSelectionVisuals();
    },
    [refreshNativeSelectionVisuals, refreshSelectionSnapshot],
  );

  const runQuickSelection = useCallback(() => {
    applyProfessionalSelection({
      type: "quick",
      universe: buildSelectionUniverse(),
      filter: {
        ...(quickSelectionType ? { types: [quickSelectionType] } : {}),
        ...(quickSelectionLayer ? { layers: [quickSelectionLayer] } : {}),
        ...(quickSelectionText ? { text: quickSelectionText } : {}),
      },
      operation: selectionOperation,
    });
  }, [
    applyProfessionalSelection,
    buildSelectionUniverse,
    quickSelectionLayer,
    quickSelectionText,
    quickSelectionType,
    selectionOperation,
  ]);

  // ---- live station-status overlay: colour blocks by MES / heat / etc. (unify) ----
  const loadOverlay = useCallback(
    async (kind: OverlayKind | null) => {
      setOverlay(kind);
      setShowOverlayMenu(false);
      if (!kind || !model) {
        overlayColorRef.current = new Map();
        rebuildBlocks();
        return;
      }
      const def = OVERLAY_DEFS.find((o) => o.key === kind);
      if (!def) return;
      try {
        const r = await legacyCadFetch(
          `layout/${def.endpoint}?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
        );
        if (!r.ok) {
          toast.error("No se pudo cargar la capa de estado.", "3D");
          return;
        }
        const cm = overlayColorMap(kind, await r.json());
        overlayColorRef.current = new Map(
          [...cm.entries()].map(([name, hex]) => [name, hexToInt(hex)]),
        );
        rebuildBlocks();
      } catch {
        toast.error("No se pudo cargar la capa de estado.", "3D");
      }
    },
    [model, revision, rebuildBlocks, toast],
  );
  useEffect(() => {
    if (!showOverlayMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (
        overlayMenuRef.current &&
        !overlayMenuRef.current.contains(e.target as Node)
      )
        setShowOverlayMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showOverlayMenu]);

  // ---- cells / zones: rebuildable tints + create/remove (ported from 2D, unify) ----
  const rebuildCells = useCallback(() => {
    const group = cellsGroupRef.current;
    const ctx = ctxRef.current;
    if (!group || !ctx) return;
    while (group.children.length) {
      const o = group.children[group.children.length - 1];
      group.remove(o);
      disposeObject(o);
    }
    const { s, W, H } = ctx;
    const pad = data?.footprint.gridSize || 0;
    cellsRef.current.forEach((c) => {
      const members = c.stationIds
        .map((id) => placementsRef.current.get(id))
        .filter(Boolean) as Placement[];
      if (!members.length) return;
      const x0 = Math.min(...members.map((m) => m.x)) - pad,
        y0 = Math.min(...members.map((m) => m.y)) - pad;
      const x1 = Math.max(...members.map((m) => m.x + m.w)) + pad,
        y1 = Math.max(...members.map((m) => m.y + m.h)) + pad;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(c.color),
          transparent: true,
          opacity: 0.18,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(
        ((x0 + x1) / 2 - W / 2) * s,
        0.03,
        ((y0 + y1) / 2 - H / 2) * s,
      );
      group.add(plane);
    });
  }, [data]);
  useEffect(() => {
    rebuildCellsRef.current = rebuildCells;
  }, [rebuildCells]);
  const createCellFromSelection = () => {
    const ids = selRef.current
      .filter((it) => it.type === "station")
      .map((it) => it.id);
    if (ids.length === 0) {
      toast.error("Selecciona estaciones para agrupar en una celda.", "3D");
      return;
    }
    const palette = [
      "#22d3ee",
      "#a78bfa",
      "#f472b6",
      "#fbbf24",
      "#34d399",
      "#60a5fa",
      "#fb7185",
      "#4ade80",
    ];
    const color = palette[cellsRef.current.length % palette.length];
    commitCells(
      [
        ...cellsRef.current,
        {
          id: newId("cell"),
          name: `Celda ${cellsRef.current.length + 1}`,
          color,
          stationIds: [...new Set(ids)],
        },
      ],
      "crear celda",
    );
    toast.success("Celda creada.", "3D");
  };
  const deleteCell = (id: string) => {
    commitCells(
      cellsRef.current.filter((c) => c.id !== id),
      "borrar celda",
    );
  };

  // ---- undo / redo (memento of the editable collections) ----
  const snapshot = useCallback(
    (): Snapshot => ({
      placements: [...placementsRef.current.entries()].map(([id, p]) => [
        id,
        { ...p },
      ]),
      assets: [...assetsRef.current.values()].map((a) => ({ ...a })),
      annotations: [...annotationsRef.current.values()].map((a) => ({ ...a })),
      connectors: connectorsRef.current.map((c) => ({ ...c })),
      // Capa, tags y GRUPO viajan en el snapshot: al deshacer un dibujo recién
      // creado, su capa/tag ya no quedan colgando (bug §3.1b, CAD-NEXT-021), y
      // el grupo deja de morir en la reproyección de cada guardado canónico.
      layers: { ...layerAssignmentsRef.current },
      tags: { ...objectTagsRef.current },
      groups: { ...objectGroupsRef.current },
      // La NOTA no tenía sitio en ningún esquema: era estado de React y nada
      // más, así que se perdía al recargar y al cambiar de documento.
      notes: { ...objectNotesRef.current },
    }),
    [],
  );
  const recordLocalSnapshot = useCallback(
    (
      label: string,
      reason: "manual" | "command" | "import" | "restore" = "manual",
    ) => {
      const snap = createCadSnapshot(
        snapshot(),
        label,
        reason,
        `local-${Date.now()}`,
      );
      setLocalSnapshots((history) => pushCadSnapshot(history, snap, 20));
      return snap.id;
    },
    [snapshot],
  );
  const snapshotDocument = useCallback(
    (value: Snapshot = snapshot()) => {
      // La huella viaja con la proyección: `replaceEditorProjection` reconstruye
      // `meta` desde el documento base, así que sin pasarla aquí el tamaño de
      // planta y el paso de rejilla del documento CARGADO se reimponían sobre
      // cualquier cambio. Sólo llegaban al servidor por `saveLegacy`, que no
      // corre cuando hay `documentId` — o sea, nunca en el estudio moderno.
      const projection = editorSnapshotToCadDocument(value, {
        unit: data?.footprint.unit || "mm",
        footprintW: data?.footprint.footprintW,
        footprintH: data?.footprint.footprintH,
        gridSize: data?.footprint.gridSize,
      });
      return replaceEditorProjection(loadedCadDocumentRef.current, projection);
    },
    [
      data?.footprint.unit,
      data?.footprint.footprintW,
      data?.footprint.footprintH,
      data?.footprint.gridSize,
      snapshot,
    ],
  );
  const recordHistoryDocument = useCallback(
    (document: CadDocument, groupKey?: string) => {
      const history = canonicalHistoryRef.current;
      if (!history) {
        canonicalHistoryRef.current = new CanonicalHistory(document, {
          maxEntries: 80,
          maxRetainedBytes: 32 * 1024 * 1024,
          groupWindowMs: 400,
        });
        setHist({ undo: 0, redo: 0 });
        return;
      }
      history.recordCurrent(document, { groupKey });
      setHist(history.depths());
    },
    [],
  );
  const pushHistory = useCallback(
    (groupKey?: string) => {
      if (drawingReadOnlyRef.current) return;
      recordHistoryDocument(snapshotDocument(), groupKey);
    },
    [recordHistoryDocument, snapshotDocument],
  );
  /**
   * Un punto de deshacer por SESIÓN de edición, no por pulsación.
   *
   * Los campos del panel de propiedades —nombre, tags, notas, coordenadas, el
   * texto de una cota— se disparan en `onChange`, o sea en cada tecla. Sólo
   * ensuciaban: nunca dejaban checkpoint. El daño no es que el cambio se
   * pierda —se guarda— sino que un Ctrl+Z posterior salta al checkpoint
   * ANTERIOR y revierte a la vez lo escrito y la acción de antes, sin avisar; y
   * si hay autosave por medio, esa reversión llega al servidor.
   *
   * Llamar a `pushHistory()` en cada tecla NO es la respuesta: reconstruye el
   * documento entero, y el agrupamiento de `CanonicalHistory` fusiona la
   * ENTRADA pero no ahorra ese trabajo. Ese coste por pulsación es justo el que
   * remontó el formulario de entrada dinámica y rompió el golden 33.
   *
   * Así que el checkpoint se toma UNA vez, al empezar a editar. La clave lleva
   * objeto y campo, de modo que cambiar de objeto o de campo abre sesión nueva;
   * `endFieldEdit` (en el `onBlur`) la cierra para que volver al mismo campo
   * después de hacer otra cosa vuelva a dejar su punto.
   */
  const fieldEditKeyRef = useRef<string | null>(null);
  const beginFieldEdit = useCallback(
    (key: string) => {
      if (fieldEditKeyRef.current === key) return;
      fieldEditKeyRef.current = key;
      pushHistory();
    },
    [pushHistory],
  );
  const endFieldEdit = useCallback(() => {
    fieldEditKeyRef.current = null;
  }, []);
  const cancelHistoryCheckpoint = useCallback(() => {
    const history = canonicalHistoryRef.current;
    if (!history) return;
    history.cancelLastCheckpoint();
    setHist(history.depths());
  }, []);
  const restore = useCallback(
    (s: Snapshot) => {
      placementsRef.current = new Map(
        s.placements.map(([id, p]) => [id, { ...p }]),
      );
      assetsRef.current = new Map(s.assets.map((a) => [a.id, { ...a }]));
      annotationsRef.current = new Map(
        s.annotations.map((a) => [a.id, { ...a }]),
      );
      connectorsRef.current = (s.connectors ?? []).map((c) => ({ ...c }));
      // Restaura capa/tags/GRUPO junto al resto (defensivo con snapshots
      // antiguos que no los llevaban). Se fija el ref además del estado para
      // que el rebuild síncrono siguiente ya use los valores restaurados.
      //
      // El grupo faltaba aquí: se añadió al snapshot para que sobreviviera al
      // guardado canónico, pero sin aplicarlo en la restauración deshacer
      // seguía sin devolverlo — el snapshot lo llevaba y nadie lo leía.
      const restoredLayers = { ...(s.layers ?? {}) };
      const restoredTags = { ...(s.tags ?? {}) };
      const restoredGroups = { ...(s.groups ?? {}) };
      const restoredNotes = { ...(s.notes ?? {}) };
      // Los REFS se fijan siempre —el rebuild síncrono siguiente los lee—, pero
      // el ESTADO sólo cuando cambia de verdad. `restore` corre en cada orden
      // canónica (vía `commitBlockMutation`), y sustituir estos cuatro mapas por
      // objetos nuevos cada vez remonta el formulario de entrada dinámica a
      // mitad de un punto: el mismo mecanismo que ya rompió el golden 33.
      // Añadir aquí las notas sumaba un cuarto re-render por orden, así que los
      // cuatro dejan de dispararse cuando el contenido coincide.
      layerAssignmentsRef.current = restoredLayers;
      setLayerAssignments((current) =>
        sameStringMap(current, restoredLayers) ? current : restoredLayers,
      );
      objectTagsRef.current = restoredTags;
      setObjectTags((current) =>
        sameStringMap(current, restoredTags) ? current : restoredTags,
      );
      objectGroupsRef.current = restoredGroups;
      setObjectGroups((current) =>
        sameStringMap(current, restoredGroups) ? current : restoredGroups,
      );
      objectNotesRef.current = restoredNotes;
      setObjectNotes((current) =>
        sameStringMap(current, restoredNotes) ? current : restoredNotes,
      );
      setPlacedIds(new Set(placementsRef.current.keys()));
      setAssetIds(new Set(assetsRef.current.keys()));
      setDimCount(
        [...annotationsRef.current.values()].filter((a) => a.type === "dim")
          .length,
      );
      // drop any selected items that no longer exist after the restore
      const kept = selRef.current.filter((c) =>
        c.type === "station"
          ? placementsRef.current.has(c.id)
          : assetsRef.current.has(c.id),
      );
      selRef.current = kept;
      setSelList(kept);
      setSelSnap(kept.length === 1 ? computeSnap(kept[0]) : null);
      const nativeIds = new Set(
        (loadedCadDocumentRef.current?.entities ?? [])
          .filter((entity) => CAD_ENTITY_REGISTRY.supports(entity))
          .map((entity) => entity.id),
      );
      const keptNative = nativeSelectionIdsRef.current.filter((id) =>
        nativeIds.has(id),
      );
      nativeSelectionIdsRef.current = keptNative;
      setNativeSelectionIds(keptNative);
      markDirty();
      rebuildAll();
    },
    [computeSnap, markDirty, rebuildAll],
  );
  /**
   * Devuelve la huella del documento al estado del editor.
   *
   * Deshacer restaura un `CadDocument` completo y lo derrama sobre el estado,
   * pero `meta.footprintW/H/gridSize` no tenía a nadie que lo leyera de vuelta.
   * Sin esto, poner un punto de historial al redimensionar la planta crearía un
   * checkpoint que al deshacerlo no devuelve nada — un arreglo a medias, peor
   * que no tenerlo.
   *
   * SALE SIN TOCAR NADA cuando la huella no cambia, que es el caso de CADA
   * orden de dibujo. No es una micro-optimización: `data` es el objeto de
   * estado más ancho del editor, y sustituirlo en cada orden remonta el
   * formulario de entrada dinámica a mitad de un punto. El propio golden 33 lo
   * documenta —"si el formulario se sustituyó a mitad, los campos vuelven
   * vacíos"— y así fue como esto se cayó en CI: la figura no llegaba a crearse.
   * Devolver la MISMA referencia hace que React se salte el re-render.
   */
  const applyDocumentFootprint = useCallback((document: CadDocument) => {
    const { footprintW, footprintH, gridSize } = document.meta;
    if (
      footprintW === undefined &&
      footprintH === undefined &&
      gridSize === undefined
    )
      return;
    setData((current) => {
      if (!current) return current;
      const next = {
        footprintW: footprintW ?? current.footprint.footprintW,
        footprintH: footprintH ?? current.footprint.footprintH,
        gridSize: gridSize ?? current.footprint.gridSize,
      };
      return next.footprintW === current.footprint.footprintW &&
        next.footprintH === current.footprint.footprintH &&
        next.gridSize === current.footprint.gridSize
        ? current
        : { ...current, footprint: { ...current.footprint, ...next } };
    });
    setFpDraft((draft) => {
      const w = footprintW ?? draft.w;
      const h = footprintH ?? draft.h;
      const g = gridSize ?? draft.g;
      return w === draft.w && h === draft.h && g === draft.g
        ? draft
        : { w, h, g };
    });
  }, []);
  const undo = useCallback(() => {
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return;
    }
    const history = canonicalHistoryRef.current;
    if (!history || history.depths().undo === 0) return;
    const document = history.undo(snapshotDocument());
    loadedCadDocumentRef.current = document;
    setPaperSpaces(document.paperSpaces.map((space) => ({ ...space })));
    syncCadLayerState(document);
    setCadXrefs(
      document.externalReferences.map((reference) => ({ ...reference })),
    );
    setPublicationRecords([...document.publications]);
    setActivePaperSpaceId((current) =>
      document.paperSpaces.some((space) => space.id === current)
        ? current
        : (document.paperSpaces[0]?.id ?? null),
    );
    setActivePaperViewportId((current) =>
      document.paperSpaces.some((space) =>
        space.viewports?.some((viewport) => viewport.id === current),
      )
        ? current
        : (document.paperSpaces[0]?.viewports?.[0]?.id ?? null),
    );
    setLayoutPreviewSheet(null);
    setNativeEntities(
      document.entities.filter((entity): entity is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(entity),
      ),
    );
    setNativeDocumentRevision((value) => value + 1);
    applyDocumentFootprint(document);
    restore(cadDocumentToEditorSnapshot<CadLayerId>(document));
    setHist(history.depths());
  }, [
    applyDocumentFootprint,
    notifyReadOnly,
    restore,
    snapshotDocument,
    syncCadLayerState,
  ]);
  const redo = useCallback(() => {
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return;
    }
    const history = canonicalHistoryRef.current;
    if (!history || history.depths().redo === 0) return;
    const document = history.redo(snapshotDocument());
    loadedCadDocumentRef.current = document;
    setPaperSpaces(document.paperSpaces.map((space) => ({ ...space })));
    syncCadLayerState(document);
    setCadXrefs(
      document.externalReferences.map((reference) => ({ ...reference })),
    );
    setPublicationRecords([...document.publications]);
    setActivePaperSpaceId((current) =>
      document.paperSpaces.some((space) => space.id === current)
        ? current
        : (document.paperSpaces[0]?.id ?? null),
    );
    setActivePaperViewportId((current) =>
      document.paperSpaces.some((space) =>
        space.viewports?.some((viewport) => viewport.id === current),
      )
        ? current
        : (document.paperSpaces[0]?.viewports?.[0]?.id ?? null),
    );
    setLayoutPreviewSheet(null);
    setNativeEntities(
      document.entities.filter((entity): entity is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(entity),
      ),
    );
    setNativeDocumentRevision((value) => value + 1);
    applyDocumentFootprint(document);
    restore(cadDocumentToEditorSnapshot<CadLayerId>(document));
    setHist(history.depths());
  }, [
    applyDocumentFootprint,
    notifyReadOnly,
    restore,
    snapshotDocument,
    syncCadLayerState,
  ]);

  const applyCollaborationDocument = useCallback(
    (next: CadDocument, label: string) => {
      if (drawingReadOnly) {
        notifyReadOnly();
        return;
      }
      pushHistory();
      const document = commitChange(next, label);
      loadedCadDocumentRef.current = document;
      setPaperSpaces(document.paperSpaces.map((space) => ({ ...space })));
      syncCadLayerState(document);
      setCadXrefs(
        document.externalReferences.map((reference) => ({ ...reference })),
      );
      setPublicationRecords([...document.publications]);
      setNativeEntities(
        document.entities.filter((entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
        ),
      );
      setNativeDocumentRevision((value) => value + 1);
      applyDocumentFootprint(document);
      restore(cadDocumentToEditorSnapshot<CadLayerId>(document));
      toast.success(label, "Compare / Merge");
    },
    [
      applyDocumentFootprint,
      drawingReadOnly,
      notifyReadOnly,
      pushHistory,
      restore,
      syncCadLayerState,
      toast,
    ],
  );
  /**
   * Alta del review link en el SERVIDOR (`POST /v1/cad/documents/:id/
   * review-sessions` vía el adaptador legacy→v1). El navegador ya no fabrica
   * tokens: recibe el que emite el servidor, lo entrega al panel para copiarlo
   * UNA vez y no lo persiste en el documento ni en la URL.
   */
  const createServerReviewLink = useCallback(async () => {
    const res = await legacyCadFetch(
      `layout/review-sessions?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowComments: true }),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      session?: { id?: string; expiresAt?: string | null };
      shareToken?: string;
      message?: string;
    } | null;
    if (!res.ok || !body?.session?.id) {
      throw new Error(
        body?.message ?? "El servidor rechazó crear el enlace de revisión.",
      );
    }
    return {
      id: body.session.id,
      expiresAt: body.session.expiresAt ?? null,
      shareToken: body.shareToken,
    };
  }, [model, revision]);
  /** Revocación server-side: cerrar la sesión mata el token de inmediato. */
  const revokeServerReviewLink = useCallback(async (sessionId: string) => {
    const res = await legacyCadFetch(
      `layout/review-sessions/${encodeURIComponent(sessionId)}/close`,
      { method: "POST" },
    );
    if (!res.ok && res.status !== 409) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        body?.message ?? "El servidor rechazó revocar el enlace de revisión.",
      );
    }
  }, []);
  const visualizeCollaborationDiff = useCallback(
    (rows: CadEntityDiffRow[]) => {
      const ids = new Set(rows.map((row) => row.entityId));
      validationHighlightRef.current = ids;
      setValidationHighlightIds(ids);
      rebuildAll();
    },
    [rebuildAll],
  );
  const navigateCollaborationDiff = useCallback(
    (entityId: string) => {
      validationHighlightRef.current = new Set([entityId]);
      setValidationHighlightIds(new Set([entityId]));
      if (placementsRef.current.has(entityId)) {
        clearNativeSelection();
        select([{ type: "station", id: entityId }]);
      } else if (assetsRef.current.has(entityId)) {
        clearNativeSelection();
        select([{ type: "asset", id: entityId }]);
      } else if (
        loadedCadDocumentRef.current?.entities.some(
          (entity) => entity.id === entityId,
        )
      ) {
        select([]);
        nativeSelectionIdsRef.current = [entityId];
        setNativeSelectionIds([entityId]);
      }
      rebuildAll();
    },
    [clearNativeSelection, rebuildAll, select],
  );

  // La sesión de recuperación se reinicia con el documento, igual que
  // `editGenerationRef`: un guardado sólo confirma lo que se escribió después
  // de abrir esto.
  useEffect(() => {
    recoveryLaneRef.current = cadRecoveryLaneId();
    recoverySessionStartedAtRef.current = Date.now();
  }, [documentId, model, revision]);

  useEffect(() => {
    if (!open || !data || !recoveryScope || dirty) return;
    let active = true;
    void loadCadRecovery(recoveryScope)
      .then((candidate) => {
        if (!active || !candidate) return;
        // ANTES: si la versión base del borrador no coincidía con la del
        // servidor, se BORRABA. Es decir, que otra sesión guardase bastaba para
        // destruir trabajo local que sólo existía ahí. Un borrador sobre una
        // versión superada no es basura: es una rama, y el journal es su única
        // copia. Se ofrece igual, diciendo lo que es.
        const kind = classifyCadRecoveryCandidate(candidate, {
          serverVersion: data.cadDocumentVersion ?? 0,
          savedGeneration:
            (currentDocumentIdRef.current
              ? savedGenerationByDocumentRef.current.get(
                  currentDocumentIdRef.current,
                )
              : undefined) ?? -1,
        });
        if (kind === "confirmed") return;
        setRecoveryCandidate(candidate);
        setRecoveryDivergent(kind === "divergent");
        setRecoverySavedAt(candidate.savedAt);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [data, dirty, open, recoveryScope]);

  useEffect(() => {
    if (!open || !dirty || !data || !recoveryScope || drawingReadOnly) return;
    let active = true;
    // Un solo escritor CON escritura final: la petición que llega mientras hay
    // otra en vuelo se encola en vez de tirarse. Descartarla perdía justo el
    // checkpoint de ocultar la pestaña o cerrar, que es el que se le ofrece
    // después a la persona.
    const queue = createCadCheckpointQueue({
      snapshot: () => snapshotDocument(),
      write: (document) =>
        // La generación se lee AQUÍ, junto al documento que se está
        // persistiendo: es lo que permite después distinguir un checkpoint ya
        // confirmado por un guardado de uno que capturó una edición posterior.
        saveCadRecovery(
          recoveryScope,
          document,
          data.cadDocumentVersion ?? 0,
          editGenerationRef.current,
        ).then((record) => {
          if (!active) return;
          setRecoverySavedAt(record.savedAt);
          setRecoveryWarning(null);
        }),
      onError: (cause) => {
        if (!active) return;
        setRecoveryWarning(
          cause instanceof CadRecoveryQuotaError
            ? cause.message
            : "No se pudo actualizar la recuperación local. Guarda el dibujo en el servidor.",
        );
      },
    });
    const checkpoint = () => queue.request();
    const checkpointWhenHidden = () => {
      if (document.visibilityState === "hidden") checkpoint();
    };
    const initialTimer = window.setTimeout(checkpoint, 3_000);
    const interval = window.setInterval(checkpoint, 15_000);
    window.addEventListener("beforeunload", checkpoint);
    document.addEventListener("visibilitychange", checkpointWhenHidden);
    return () => {
      active = false;
      queue.stop();
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", checkpoint);
      document.removeEventListener("visibilitychange", checkpointWhenHidden);
    };
  }, [data, dirty, drawingReadOnly, open, recoveryScope, snapshotDocument]);

  const restoreRecoveryCandidate = useCallback(() => {
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return;
    }
    if (!recoveryCandidate) return;
    try {
      const document = migrateCadDocument(recoveryCandidate.document);
      loadedCadDocumentRef.current = document;
      setPaperSpaces(document.paperSpaces.map((space) => ({ ...space })));
      syncCadLayerState(document);
      setCadXrefs(
        document.externalReferences.map((reference) => ({ ...reference })),
      );
      setPublicationRecords([...document.publications]);
      setActivePaperSpaceId(document.paperSpaces[0]?.id ?? null);
      setActivePaperViewportId(
        document.paperSpaces[0]?.viewports?.[0]?.id ?? null,
      );
      setLayoutPreviewSheet(null);
      setNativeEntities(
        document.entities.filter((entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
        ),
      );
      setNativeDocumentRevision((value) => value + 1);
      applyDocumentFootprint(document);
      restore(cadDocumentToEditorSnapshot<CadLayerId>(document));
      setRecoveryCandidate(null);
      setRecoveryDivergent(false);
      toast.success(
        "Borrador local recuperado. Guárdalo para confirmar.",
        "CAD",
      );
    } catch {
      toast.error("El borrador local no pudo restaurarse.", "CAD");
    }
  }, [
    applyDocumentFootprint,
    notifyReadOnly,
    recoveryCandidate,
    restore,
    syncCadLayerState,
    toast,
  ]);

  /**
   * Descartar es una acción EXPLÍCITA sobre un borrador concreto, así que borra
   * ese registro y los anteriores de SU carril — no el ámbito entero, que se
   * llevaba por delante los checkpoints de las demás pestañas abiertas.
   */
  const discardRecoveryCandidate = useCallback(() => {
    const discarded = recoveryCandidate;
    setRecoveryCandidate(null);
    setRecoveryDivergent(false);
    setRecoverySavedAt(null);
    if (!recoveryScope || !discarded) return;
    void discardCadRecoveryThrough(
      recoveryScope,
      discarded.lane ?? LEGACY_RECOVERY_LANE,
      discarded.savedAtMs,
    ).catch(() => undefined);
  }, [recoveryCandidate, recoveryScope]);

  /**
   * Única frontera de mutación de celdas.
   *
   * Antes `createCell`/`deleteCell` sólo tocaban `cellsRef` y llamaban a
   * `markDirty()`. En un documento moderno el guardado va por la vía canónica,
   * donde las celdas no existían: el autosave respondía 200, limpiaba `dirty` y
   * la celda no llegaba al servidor — pérdida con confirmación positiva de
   * guardado. Y sin entrada de historial, deshacer tampoco la alcanzaba.
   *
   * Ahora es una sola transacción: historial, documento canónico, proyección y
   * dirty, en ese orden y sin estados intermedios visibles.
   */
  const commitCells = useCallback(
    (next: Cell[], label: string) => {
      if (drawingReadOnlyRef.current) {
        notifyReadOnly();
        return;
      }
      const checkpoint = snapshotDocument();
      recordHistoryDocument(checkpoint);
      const cells = next.map((cell) => ({
        ...cell,
        stationIds: [...cell.stationIds],
      }));
      loadedCadDocumentRef.current = commitChange(
        { ...checkpoint, cells },
        label,
      );
      cellsRef.current = cells;
      setCellsView(cells.map((c) => ({ ...c, stationIds: [...c.stationIds] })));
      markDirty();
      rebuildCells();
    },
    [
      markDirty,
      notifyReadOnly,
      rebuildCells,
      recordHistoryDocument,
      snapshotDocument,
    ],
  );

  const commitPaperSpaces = useCallback(
    (next: CadPaperSpace[], label: string) => {
      if (drawingReadOnlyRef.current) {
        notifyReadOnly();
        return;
      }
      const checkpoint = snapshotDocument();
      recordHistoryDocument(checkpoint);
      const normalized = next
        .map((space, order) => ({ ...space, order }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      loadedCadDocumentRef.current = commitChange(
        { ...checkpoint, paperSpaces: normalized },
        label,
      );
      setPaperSpaces(normalized);
      setActivePaperSpaceId((current) =>
        normalized.some((space) => space.id === current)
          ? current
          : (normalized[0]?.id ?? null),
      );
      setActivePaperViewportId((current) => {
        if (
          normalized.some((space) =>
            space.viewports?.some((viewport) => viewport.id === current),
          )
        )
          return current;
        const selected =
          normalized.find((space) => space.id === activePaperSpaceId) ??
          normalized[0];
        return selected?.viewports?.[0]?.id ?? null;
      });
      setLayoutPreviewSheet(null);
      markDirty();
    },
    [
      activePaperSpaceId,
      markDirty,
      notifyReadOnly,
      recordHistoryDocument,
      snapshotDocument,
    ],
  );

  const seedThreeSheetSet = useCallback(() => {
    if (!data) return;
    if (paperSpaces.length) {
      toast.info(
        "El documento ya tiene hojas. Elimina o edita las existentes antes de crear el demo.",
        "Hojas",
      );
      return;
    }
    const created = createThreeSheetDemo({
      bounds: {
        x: 0,
        y: 0,
        width: data.footprint.footprintW,
        height: data.footprint.footprintH,
      },
      unit: data.footprint.unit,
      metadata: {
        project: sheetPackageDraft.project,
        drawingNumber: sheetPackageDraft.drawingNo,
        revision: sheetPackageDraft.revision,
        discipline: sheetPackageDraft.discipline,
        preparedBy: sheetPackageDraft.preparedBy,
        checkedBy: sheetPackageDraft.checkedBy,
        approvedBy: sheetPackageDraft.approvedBy,
        notes: sheetPackageDraft.notes,
      },
    });
    commitPaperSpaces(created, "Crear conjunto de tres hojas");
    setActivePaperSpaceId(created[0]?.id ?? null);
    setActivePaperViewportId(created[0]?.viewports?.[0]?.id ?? null);
  }, [commitPaperSpaces, data, paperSpaces.length, sheetPackageDraft, toast]);

  const addPaperSpace = useCallback(() => {
    if (!data) return;
    const id = newId("sheet");
    const created = createCadPaperSpace({
      id,
      name: `Hoja ${paperSpaces.length + 1}`,
      order: paperSpaces.length,
      paper: "A3",
      modelBounds: {
        x: 0,
        y: 0,
        width: data.footprint.footprintW,
        height: data.footprint.footprintH,
      },
      unit: data.footprint.unit,
      metadata: {
        project: sheetPackageDraft.project,
        drawingNumber: sheetPackageDraft.drawingNo,
        title: `Hoja ${paperSpaces.length + 1}`,
        sheetNumber: `S-${String(paperSpaces.length + 1).padStart(3, "0")}`,
        revision: sheetPackageDraft.revision,
        discipline: sheetPackageDraft.discipline,
        preparedBy: sheetPackageDraft.preparedBy,
        checkedBy: sheetPackageDraft.checkedBy,
        approvedBy: sheetPackageDraft.approvedBy,
        notes: sheetPackageDraft.notes,
      },
    });
    commitPaperSpaces([...paperSpaces, created], "Agregar espacio de papel");
    setActivePaperSpaceId(id);
    setActivePaperViewportId(created.viewports?.[0]?.id ?? null);
  }, [commitPaperSpaces, data, paperSpaces, sheetPackageDraft]);

  const updateActivePaperSpace = useCallback(
    (update: (space: CadPaperSpace) => CadPaperSpace, label: string) => {
      if (!activePaperSpaceId) return;
      commitPaperSpaces(
        paperSpaces.map((space) =>
          space.id === activePaperSpaceId ? update(space) : space,
        ),
        label,
      );
    },
    [activePaperSpaceId, commitPaperSpaces, paperSpaces],
  );

  const applyActiveTitleBlock = useCallback(() => {
    updateActivePaperSpace(
      (space) => ({
        ...space,
        titleBlock: {
          ...space.titleBlock,
          attributes: {
            ...(space.titleBlock?.attributes ?? {}),
            PROJECT: sheetPackageDraft.project,
            DRAWING_NO: sheetPackageDraft.drawingNo,
            SHEET_NO: sheetPackageDraft.sheet,
            REVISION: sheetPackageDraft.revision,
            DISCIPLINE: sheetPackageDraft.discipline,
            PREPARED_BY: sheetPackageDraft.preparedBy,
            CHECKED_BY: sheetPackageDraft.checkedBy,
            APPROVED_BY: sheetPackageDraft.approvedBy,
            NOTES: sheetPackageDraft.notes,
          },
        },
      }),
      "Actualizar cajetín de hoja",
    );
  }, [sheetPackageDraft, updateActivePaperSpace]);

  const selectPaperSpace = useCallback((space: CadPaperSpace) => {
    setActivePaperSpaceId(space.id);
    setActivePaperViewportId(space.viewports?.[0]?.id ?? null);
    setLayoutPreviewSheet(null);
    const attributes = space.titleBlock?.attributes ?? {};
    setSheetPackageDraft((draft) => ({
      ...draft,
      project: attributes.PROJECT ?? draft.project,
      drawingNo: attributes.DRAWING_NO ?? draft.drawingNo,
      discipline: attributes.DISCIPLINE ?? draft.discipline,
      sheet: attributes.SHEET_NO ?? draft.sheet,
      revision: attributes.REVISION ?? draft.revision,
      preparedBy: attributes.PREPARED_BY ?? "",
      checkedBy: attributes.CHECKED_BY ?? "",
      approvedBy: attributes.APPROVED_BY ?? "",
      notes: attributes.NOTES ?? "",
    }));
  }, []);

  const changeActivePaper = useCallback(
    (paper: CadSheetPaper) => {
      updateActivePaperSpace((space) => {
        const base = CAD_SHEET_PAPERS[paper];
        const landscape = space.page.orientation === "landscape";
        const width = landscape ? base.height : base.width;
        const height = landscape ? base.width : base.height;
        const margins = space.pageSetup?.margins ?? {
          top: 10,
          right: 10,
          bottom: 10,
          left: 10,
        };
        const nextSpace: CadPaperSpace = {
          ...space,
          page: { ...space.page, width, height },
          pageSetup: {
            paper,
            margins,
            colorMode: space.pageSetup?.colorMode ?? "monochrome",
            lineweightScale: space.pageSetup?.lineweightScale ?? 1,
          },
        };
        return {
          ...nextSpace,
          viewports: (space.viewports ?? []).map((viewport) => ({
            ...viewport,
            paperBounds: normalizeCadViewportPaperBounds(
              nextSpace,
              viewport.paperBounds,
            ),
          })),
        };
      }, `Cambiar papel a ${paper}`);
    },
    [updateActivePaperSpace],
  );

  const changeActiveOrientation = useCallback(
    (orientation: "portrait" | "landscape") => {
      updateActivePaperSpace((space) => {
        if (space.page.orientation === orientation) return space;
        const width = space.page.height;
        const height = space.page.width;
        const nextSpace: CadPaperSpace = {
          ...space,
          page: { ...space.page, width, height, orientation },
        };
        return {
          ...nextSpace,
          viewports: (space.viewports ?? []).map((viewport) => ({
            ...viewport,
            paperBounds: normalizeCadViewportPaperBounds(
              nextSpace,
              viewport.paperBounds,
            ),
          })),
        };
      }, `Cambiar orientación a ${orientation}`);
    },
    [updateActivePaperSpace],
  );

  const updateActivePageMargin = useCallback(
    (edge: "top" | "right" | "bottom" | "left", value: number) => {
      if (!Number.isFinite(value) || value < 0) return;
      updateActivePaperSpace((space) => {
        const margins = {
          ...(space.pageSetup?.margins ?? {
            top: 10,
            right: 10,
            bottom: 10,
            left: 10,
          }),
          [edge]: value,
        };
        const nextSpace: CadPaperSpace = {
          ...space,
          pageSetup: {
            paper: space.pageSetup?.paper ?? "custom",
            margins,
            colorMode: space.pageSetup?.colorMode ?? "monochrome",
            lineweightScale: space.pageSetup?.lineweightScale ?? 1,
          },
        };
        return {
          ...nextSpace,
          viewports: (space.viewports ?? []).map((viewport) => ({
            ...viewport,
            paperBounds: normalizeCadViewportPaperBounds(
              nextSpace,
              viewport.paperBounds,
            ),
          })),
        };
      }, `Actualizar margen ${edge}`);
    },
    [updateActivePaperSpace],
  );

  const addPaperViewport = useCallback(() => {
    if (!data || !activePaperSpaceId) return;
    const id = newId("viewport");
    updateActivePaperSpace(
      (space) => ({
        ...space,
        viewports: [
          ...(space.viewports ?? []),
          createCadPaperViewport({
            space,
            id,
            modelBounds: space.viewports?.[0]?.modelBounds ?? {
              x: 0,
              y: 0,
              width: data.footprint.footprintW,
              height: data.footprint.footprintH,
            },
            unit: data.footprint.unit,
          }),
        ],
      }),
      "Agregar viewport",
    );
    setActivePaperViewportId(id);
  }, [activePaperSpaceId, data, updateActivePaperSpace]);

  const changePaperViewport = useCallback(
    (
      id: string,
      update: (
        viewport: NonNullable<CadPaperSpace["viewports"]>[number],
      ) => NonNullable<CadPaperSpace["viewports"]>[number],
      label: string,
    ) => {
      updateActivePaperSpace(
        (space) => updateCadPaperViewport(space, id, update),
        label,
      );
    },
    [updateActivePaperSpace],
  );

  const duplicatePaperViewport = useCallback(
    (id: string) => {
      const duplicateId = newId("viewport");
      updateActivePaperSpace(
        (space) => duplicateCadPaperViewport(space, id, duplicateId),
        "Duplicar viewport",
      );
      setActivePaperViewportId(duplicateId);
    },
    [updateActivePaperSpace],
  );

  const removePaperViewport = useCallback(
    (id: string) => {
      const activeSpace = paperSpaces.find(
        (space) => space.id === activePaperSpaceId,
      );
      const nextViewport =
        activeSpace?.viewports?.find((viewport) => viewport.id !== id)?.id ??
        null;
      updateActivePaperSpace(
        (space) => deleteCadPaperViewport(space, id),
        "Eliminar viewport",
      );
      setActivePaperViewportId(nextViewport);
    },
    [activePaperSpaceId, paperSpaces, updateActivePaperSpace],
  );

  const changePaperViewportLayerVisibility = useCallback(
    (id: string, layerId: string, visible: boolean) => {
      updateActivePaperSpace(
        (space) => setCadViewportLayerVisibility(space, id, layerId, visible),
        visible ? "Descongelar capa en viewport" : "Congelar capa en viewport",
      );
    },
    [updateActivePaperSpace],
  );

  const changePaperViewportLayerOverride = useCallback(
    (
      id: string,
      layerId: string,
      override: {
        color?: string;
        linetype?: string;
        lineweight?: number;
      } | null,
    ) => {
      updateActivePaperSpace(
        (space) => setCadViewportLayerOverride(space, id, layerId, override),
        override
          ? "Actualizar override de capa"
          : "Restablecer override de capa",
      );
    },
    [updateActivePaperSpace],
  );

  const requestLayoutPreview = useCallback(() => {
    if (!activePaperSpaceId) return;
    const document = snapshotDocument();
    const plan = buildCadPublishPlan({
      ...document,
      paperSpaces: paperSpaces.map((space) =>
        space.id === activePaperSpaceId
          ? { ...space, includeInPublish: true }
          : space,
      ),
    });
    setLayoutPreviewSheet(
      plan.sheets.find((sheet) => sheet.id === activePaperSpaceId) ?? null,
    );
  }, [activePaperSpaceId, paperSpaces, snapshotDocument]);

  const movePaperSpace = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const ordered = [...paperSpaces].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
      );
      const sourceIndex = ordered.findIndex((space) => space.id === sourceId);
      const targetIndex = ordered.findIndex((space) => space.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const [source] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, source);
      commitPaperSpaces(ordered, "Reordenar hojas por arrastre");
    },
    [commitPaperSpaces, paperSpaces],
  );

  /**
   * FRONTERA TRANSACCIONAL ÚNICA de la autoría canónica.
   *
   * Cada mutación canónica repetía la misma secuencia por su cuenta, y las que
   * se llamaban entre sí la ejecutaban DOS veces: `applyDrawState` hacía
   * `pushHistory()` + `markDirty()` alrededor de un `insertNativeEntities()`
   * que ya registraba su propio checkpoint. El resultado eran dos entradas de
   * historial por dibujo (el primer Undo no deshacía nada), dos generaciones
   * sucias, dos autosaves programados y —cuando la acción se rechazaba— un
   * checkpoint sin ninguna mutación detrás.
   *
   * A partir de aquí, una operación canónica correcta produce EXACTAMENTE:
   * una mutación, una entrada de historial, una transición sucia, una
   * selección coherente y una sincronización de escena. Una operación
   * rechazada no llega hasta aquí y por tanto produce exactamente cero.
   */
  const commitCanonicalDocument = useCallback(
    (
      checkpoint: CadDocument,
      document: CadDocument,
      options: {
        selection: string[];
        upsert?: CadNativeEntity[];
        remove?: string[];
        groupKey?: string;
      },
    ) => {
      recordHistoryDocument(checkpoint, options.groupKey);
      loadedCadDocumentRef.current = document;
      const existing = new Set(document.entities.map((entity) => entity.id));
      const selected = options.selection.filter((id) => existing.has(id));
      nativeSelectionIdsRef.current = selected;
      setNativeSelectionIds(selected);
      setNativeEntities(
        document.entities.filter((entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
        ),
      );
      setNativeDocumentRevision((value) => value + 1);
      markDirty();
      syncNativeScene(document, {
        upsert: options.upsert ?? [],
        remove: options.remove ?? [],
      });
    },
    [markDirty, recordHistoryDocument, syncNativeScene],
  );

  const commitNativeCommands = useCallback(
    (
      commands: Parameters<typeof executeCadEntityCommand>[1][],
      nextSelection?: string[],
      groupKey?: string,
    ) => {
      if (drawingReadOnlyRef.current) {
        notifyReadOnly();
        return false;
      }
      if (!commands.length) return false;
      const checkpoint = snapshotDocument();
      try {
        // Capa bloqueada: se comprueba TODO el lote contra el estado de
        // partida, antes de aplicar nada. Un lote es atómico respecto de su
        // punto de partida, así que preguntar por el documento intermedio no
        // añadía información y obligaba a aplicar los comandos de uno en uno.
        for (const command of commands) {
          // `insert` trae su entidad; `image-definition` no toca ninguna capa.
          const target = "entityId" in command
            ? checkpoint.entities.find((entity) => entity.id === command.entityId)
            : "entity" in command ? command.entity : undefined;
          const lockedLayer =
            target && checkpoint.layers.find((layer) => layer.id === target.layer)?.locked;
          if (lockedLayer)
            throw new Error(
              `Layer ${target.layer} is locked. Unlock it before editing ${target.id}.`,
            );
        }
        /**
         * UN lote, UN `commitChange`.
         *
         * Esto aplicaba los comandos EN BUCLE, uno por llamada a
         * `executeCadEntityCommand`, y cada vuelta hacía su propio
         * `commitChange`: mover veinte entidades dejaba veinte entradas en
         * `document.history` y subía `meta.version` veinte veces para UNA orden
         * del usuario, además de pagar veinte `structuredClone` completos de
         * bloques, estilos, hojas y referencias. El paso de DESHACER sí era uno
         * —lo fija `recordHistoryDocument(checkpoint)` más abajo—, así que el
         * defecto era invisible en la interfaz y sólo salía en el documento
         * guardado.
         *
         * `executeCadEntityCommandBatch` existe justo para esto y su propia
         * documentación lo dice; simplemente nadie lo había enchufado aquí.
         * Con UN comando se sigue llamando a `executeCadEntityCommand` para
         * conservar exactamente la misma etiqueta de historia que antes.
         */
        const result =
          commands.length === 1
            ? executeCadEntityCommand(checkpoint, commands[0])
            : executeCadEntityCommandBatch(
                checkpoint,
                commands,
                `${new Set(commands.map((command) => command.type)).size === 1 ? commands[0].type : "batch"}:${commands.length}`,
              );
        const touchedIds = new Set<string>([
          ...result.affectedEntityIds,
          ...result.createdEntityIds,
          ...result.deletedEntityIds,
        ]);
        const propagated = propagateCadConstraints(result.document, touchedIds);
        const document = propagated.document;
        for (const id of propagated.movedEntityIds) touchedIds.add(id);
        const upsert = document.entities.filter(
          (entity): entity is CadNativeEntity =>
            touchedIds.has(entity.id) && CAD_ENTITY_REGISTRY.supports(entity),
        );
        const remove = checkpoint.entities
          .filter(
            (entity) =>
              touchedIds.has(entity.id) &&
              !document.entities.some(
                (candidate) => candidate.id === entity.id,
              ),
          )
          .map((entity) => entity.id);
        commitCanonicalDocument(checkpoint, document, {
          selection: nextSelection ?? nativeSelectionIdsRef.current,
          upsert,
          remove,
          groupKey,
        });
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : "No se pudo editar la entidad.",
          "Entidad CAD",
        );
        return false;
      }
    },
    [commitCanonicalDocument, notifyReadOnly, snapshotDocument, toast],
  );

  /**
   * Motor de comandos, conectado por la línea de comandos **y por el puntero**.
   *
   * La ola 3 lo dejó sólo de teclado y lo dijo aquí: «el puntero sigue yendo a
   * la máquina heredada de `cad-command.ts`… enrutar el puntero exige la banda
   * elástica y el cursor vivo». Las dos cosas existen ya
   * (`components/cad/viewport/`), y con ellas el enrutado: el ratón, la entrada
   * dinámica y la línea de precisión entran todos por aquí. `cad-command.ts`
   * sólo conserva las herramientas de `CAD_LEGACY_POINTER_TOOLS`, que son las
   * que no tienen equivalente en el motor y están listadas por su nombre.
   *
   * `apply` va por `commitNativeCommands`, que es la MISMA puerta que usa el
   * panel de propiedades: un checkpoint, un `commitChange`, un paso de deshacer.
   * No hay una segunda ruta de mutación, que es justo lo que el motor venía a
   * eliminar.
   */
  const commandEngine = useCadStudioCommandEngine({
    document: loadedCadDocumentRef,
    selection: nativeSelectionIdsRef,
    view: viewControllerRef,
    activeLayer: activeCadLayer,
    newEntityId: () => newId("cad"),
    apply: (commands) => {
      // Un dibujo con la BARRA termina con lo dibujado designado, igual que en
      // el camino heredado que sustituye: es lo que hace que el panel de
      // propiedades describa la entidad recién creada sin ir a buscarla.
      //
      // Tecleado NO, y la diferencia importa: la línea de comandos nunca
      // designó nada, y designar cambia lo que ve la orden siguiente. Un HATCH
      // tecleado detrás de un MTEXT sombrearía el rótulo en vez de pedir su
      // punto interior.
      const created = enginePointerRouterRef.current?.startedByPointer
        ? commands.flatMap((command) =>
            command.type === "insert" ? [command.entity.id] : [],
          )
        : [];
      commitNativeCommands([...commands], created.length ? created : undefined);
    },
    // El puntero ya alimenta al motor: éstas son las tres cosas que su puente
    // ignoraba «a conciencia hasta que el puntero llegue».
    cursor: engineCursorPointRef,
    preview: (paths) => enginePreviewRef.current?.draw(paths),
    osnapOverride: (modes) => {
      engineOsnapOverrideRef.current = modes;
    },
    // VSCURRENT/SHADEMODE: estado del visor, no del documento.
    visualStyle: (styleId) =>
      solidShadeHostRef.current?.applyVisualStyle(styleId) ?? null,
  });

  /**
   * El anfitrión del motor, alcanzable desde el efecto de la escena.
   *
   * `useCadStudioCommandEngine` devuelve SIEMPRE la misma instancia —su `useMemo`
   * no tiene dependencias, y por buenas razones—, pero el efecto que monta el
   * lienzo no la lista en sus dependencias. La ref lo hace explícito en vez de
   * apoyarse en una estabilidad que no se ve desde ahí.
   */
  const commandEngineRef = useRef(commandEngine);
  commandEngineRef.current = commandEngine;
  const commandEngineSnapshot = useCadCommandEngine(commandEngine);
  /**
   * Al terminar un comando del motor, la herramienta vuelve a designar — el
   * mismo gesto que tenía la máquina heredada. Sin esto, la barra seguiría
   * mostrando LINE encendido con el comando ya cerrado.
   */
  const engineBusy = commandEngineSnapshot.activeCommand !== null;
  useEffect(() => {
    if (engineBusy || !isCadDrawTool(toolRef.current)) return;
    toolRef.current = "select";
    setTool("select");
  }, [engineBusy]);

  const updateNativeProperties = useCallback(
    (entityId: string, patch: Partial<CadPropertyBag>) => {
      commitNativeCommands([{ type: "properties", entityId, patch }]);
    },
    [commitNativeCommands],
  );
  /**
   * Edición desde la paleta de propiedades, con selección múltiple.
   *
   * Sale UN lote con una orden por entidad, no una llamada por entidad: el
   * ejecutor lo aplica como una transacción y deja UN paso de deshacer. Si esto
   * hiciera un `commitNativeCommands` por objeto, editar la capa de veinte
   * entidades dejaría veinte pasos que habría que deshacer uno a uno — y esa es
   * justamente la propiedad central que el embudo de mutación protege.
   */
  const editNativeProperty = useCallback(
    (row: CadPropertyRow, value: CadPropertyValue) => {
      commitNativeCommands(
        row.entityIds.map((entityId) => ({
          type: "properties" as const,
          entityId,
          patch: { [row.key]: value },
        })),
      );
    },
    [commitNativeCommands],
  );
  const transformNativeSelection = useCallback(
    (transform: {
      translation?: { x: number; y: number };
      rotationDeg?: number;
      scale?: number;
      origin?: { x: number; y: number };
    }) => {
      commitNativeCommands(
        nativeSelectionIdsRef.current.map((entityId) => ({
          type: "transform" as const,
          entityId,
          transform,
        })),
      );
    },
    [commitNativeCommands],
  );
  const copyNativeSelection = useCallback(() => {
    const offset = Math.max(1, data?.footprint.gridSize ?? 100);
    const ids = nativeSelectionIdsRef.current.map(() => newId("cad"));
    commitNativeCommands(
      nativeSelectionIdsRef.current.map((entityId, index) => ({
        type: "copy" as const,
        entityId,
        newEntityId: ids[index],
        offset: { x: offset, y: offset },
      })),
      ids,
    );
  }, [commitNativeCommands, data?.footprint.gridSize]);
  const removeNativeSelection = useCallback(() => {
    commitNativeCommands(
      nativeSelectionIdsRef.current.map((entityId) => ({
        type: "delete" as const,
        entityId,
      })),
      [],
    );
  }, [commitNativeCommands]);
  const commitBlockMutation = useCallback(
    (
      mutate: (document: CadDocument) => CadDocument,
      selection: string[],
      success: string,
      notificationTitle = "BLOCK",
      rethrow = false,
    ): boolean => {
      if (drawingReadOnlyRef.current) {
        notifyReadOnly();
        return false;
      }
      const checkpoint = snapshotDocument();
      try {
        const mutated = mutate(checkpoint);
        if (mutated === checkpoint) {
          toast.success("No había cambios que aplicar.", notificationTitle);
          return false;
        }
        assertCadLockedLayerInvariant(checkpoint, mutated);
        const document = propagateCadConstraintsByDiff(checkpoint, mutated).document;
        recordHistoryDocument(checkpoint);
        loadedCadDocumentRef.current = document;
        syncCadLayerState(document);
        setCadXrefs(
          document.externalReferences.map((reference) => ({ ...reference })),
        );
        const selectable = new Set(
          document.entities
            .filter((entity) => CAD_ENTITY_REGISTRY.supports(entity))
            .map((entity) => entity.id),
        );
        nativeSelectionIdsRef.current = selection.filter((id) =>
          selectable.has(id),
        );
        setNativeSelectionIds(nativeSelectionIdsRef.current);
        setNativeEntities(
          document.entities.filter((entity): entity is CadNativeEntity =>
            CAD_ENTITY_REGISTRY.supports(entity),
          ),
        );
        setNativeDocumentRevision((value) => value + 1);
        markDirty();
        applyDocumentFootprint(document);
        restore(cadDocumentToEditorSnapshot<CadLayerId>(document));
        syncNativeScene(document);
        toast.success(success, notificationTitle);
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error
            ? cause.message
            : `No se pudo completar la operación ${notificationTitle}.`,
          notificationTitle,
        );
        if (rethrow) throw cause;
        return false;
      }
    },
    [
      applyDocumentFootprint,
      markDirty,
      notifyReadOnly,
      recordHistoryDocument,
      restore,
      snapshotDocument,
      syncCadLayerState,
      syncNativeScene,
      toast,
    ],
  );
  /**
   * Acciones del gestor de capas que faltaban: tipo de línea, grosor, plot,
   * congelación por viewport y estados de capa. Viven en
   * `components/cad/palettes/use-layer-actions.ts` porque este archivo sólo
   * puede encoger; `commit` les pasa la MISMA puerta canónica que usa el resto
   * del editor, así que no hay una segunda ruta de mutación.
   */
  const layerActions = useCadLayerActions({
    host: layerManagerHost,
    rows: cadLayerRowsRef,
    commit: (mutate, success) =>
      commitBlockMutation(
        mutate,
        nativeSelectionIdsRef.current,
        success,
        "Capas",
      ),
    notify: {
      success: (message) => toast.success(message, "Capas"),
      info: (message) => toast.info(message, "Capas"),
      error: (message) => toast.error(message, "Capas"),
    },
    activeViewportId: activePaperViewportId,
    setViewportLayerVisibility: changePaperViewportLayerVisibility,
  });
  const styleActions = useCadStyleActions({
    host: styleManagerHost,
    commit: (mutate, success) =>
      commitBlockMutation(
        mutate,
        nativeSelectionIdsRef.current,
        success,
        "Estilos",
      ),
  });
  const filletNativeLines = useCallback(
    (lineIds: [string, string]) => {
      const arcId = newId("fillet");
      commitBlockMutation(
        (document) =>
          applyCadLineFillet(document, {
            lineAId: lineIds[0],
            lineBId: lineIds[1],
            radius: filletRadius,
            arcId,
          }),
        [arcId],
        `FILLET R${filletRadius} aplicado como ARC tangente.`,
        "FILLET",
      );
    },
    [commitBlockMutation, filletRadius],
  );
  const chamferNativeLines = useCallback(
    (lineIds: [string, string]) => {
      const chamferId = newId("chamfer");
      commitBlockMutation(
        (document) =>
          applyCadLineChamfer(document, {
            lineAId: lineIds[0],
            lineBId: lineIds[1],
            distanceA: chamferDistanceA,
            distanceB: chamferDistanceB,
            chamferId,
          }),
        [chamferId],
        `CHAMFER ${chamferDistanceA}×${chamferDistanceB} aplicado como LINE.`,
        "CHAMFER",
      );
    },
    [chamferDistanceA, chamferDistanceB, commitBlockMutation],
  );
  const editNativeLines = useCallback(
    (lineIds: [string, string]) => {
      const targetId = lineIds.includes(lineEditTargetId)
        ? lineEditTargetId
        : lineIds[0];
      const boundaryId = lineIds.find((id) => id !== targetId)!;
      commitBlockMutation(
        (document) =>
          applyCadLineEdit(document, {
            operation: lineEditOperation,
            targetId,
            boundaryId,
            endpoint: lineEditEndpoint,
          }),
        [targetId],
        `${lineEditOperation.toUpperCase()} aplicado a ${targetId}.`,
        lineEditOperation.toUpperCase(),
      );
    },
    [
      commitBlockMutation,
      lineEditEndpoint,
      lineEditOperation,
      lineEditTargetId,
    ],
  );
  const defineProfessionalBlock = useCallback(
    (draft: CadBlockDefinitionDraft) => {
      const entityIds = [
        ...new Set([
          ...selRef.current.map((item) => item.id),
          ...nativeSelectionIdsRef.current,
        ]),
      ];
      const source = snapshotDocument();
      const selectedEntities = source.entities.filter((entity) =>
        entityIds.includes(entity.id),
      );
      const bounds = selectedEntities.reduce<CadBounds | null>(
        (current, entity) => {
          const next = CAD_ENTITY_REGISTRY.supports(entity)
            ? CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity, source)
            : entity.type === "box" || entity.type === "station"
              ? {
                  minX: entity.x,
                  minY: entity.y,
                  maxX: entity.x + entity.w,
                  maxY: entity.y + entity.h,
                }
              : null;
          return !next
            ? current
            : !current
              ? next
              : {
                  minX: Math.min(current.minX, next.minX),
                  minY: Math.min(current.minY, next.minY),
                  maxX: Math.max(current.maxX, next.maxX),
                  maxY: Math.max(current.maxY, next.maxY),
                };
        },
        null,
      );
      if (!entityIds.length || !bounds) {
        toast.error(
          "Selecciona al menos una entidad geométrica para crear el bloque.",
          "BLOCK",
        );
        return;
      }
      const blockId = newId("block");
      const insertId = newId("insert");
      const basePoint = { x: bounds.minX, y: bounds.minY, z: 0 };
      let libraryDefinition: CadBlockDefinition | undefined;
      commitBlockMutation(
        (document) => {
          const next = defineCadBlock(document, {
            id: blockId,
            name: draft.name,
            entityIds,
            basePoint,
            insertId,
            description: draft.description,
            keywords: draft.keywords,
            library: {
              scope: draft.tenantLibrary ? "tenant" : "document",
              ...(draft.tenantLibrary && tenantId ? { tenantId } : {}),
            },
            ...(draft.attributeTag
              ? {
                  attributes: {
                    [draft.attributeTag]: {
                      defaultValue: draft.attributeDefault ?? "",
                      prompt: draft.attributeTag,
                      position: {
                        x: basePoint.x,
                        y:
                          basePoint.y +
                          Math.max(1, data?.footprint.gridSize ?? 100),
                        z: 0,
                      },
                    },
                  },
                }
              : {}),
            ...(draft.businessEntityType && draft.businessEntityId
              ? {
                  businessLink: {
                    ...(tenantId ? { tenantId } : {}),
                    entityType: draft.businessEntityType,
                    entityId: draft.businessEntityId,
                  },
                }
              : {}),
          });
          libraryDefinition = next.blocks.find((block) => block.id === blockId);
          return next;
        },
        [insertId],
        `BLOCK ${draft.name} creado como una definición y una instancia viva.`,
      );
      if (draft.tenantLibrary && libraryDefinition)
        void legacyCadFetch("cad-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            definition: libraryDefinition,
          }),
        })
          .then((response) =>
            response.ok
              ? loadCadBlocks()
              : toast.error(
                  "El BLOCK quedó en el dibujo, pero no se pudo publicar en la biblioteca tenant.",
                  "BLOCK",
                ),
          )
          .catch(() =>
            toast.error(
              "El BLOCK quedó en el dibujo, pero falló la biblioteca tenant.",
              "BLOCK",
            ),
          );
    },
    [
      commitBlockMutation,
      data?.footprint.gridSize,
      snapshotDocument,
      tenantId,
      toast,
    ],
  );
  const insertProfessionalBlock = useCallback(
    (blockId: string, draft: CadBlockInsertDraft) => {
      const insertId = newId("insert");
      commitBlockMutation(
        (document) => {
          const libraryRow = cadBlocks.find(
            (row) => row.definition?.id === blockId,
          );
          const libraryDefinition = libraryRow?.definition;
          const source =
            libraryDefinition &&
            !document.blocks.some((block) => block.id === blockId)
              ? {
                  ...document,
                  blocks: [
                    ...document.blocks,
                    {
                      ...structuredClone(libraryDefinition),
                      version:
                        libraryRow?.version ?? libraryDefinition.version ?? 1,
                      library: {
                        ...libraryDefinition.library,
                        scope: "tenant" as const,
                        sourceId: libraryRow?.id,
                      },
                    },
                  ].sort((a, b) => a.id.localeCompare(b.id)),
                }
              : document;
          return insertCanonicalCadBlock(source, {
            id: insertId,
            block: blockId,
            insertion: { x: draft.x, y: draft.y, z: 0 },
            scale: { x: draft.scaleX, y: draft.scaleY, z: 1 },
            rotation: draft.rotation,
            layer: activeCadLayer,
            attributes: draft.attributes,
          });
        },
        [insertId],
        "INSERT creado sin explotar su definición.",
      );
    },
    [activeCadLayer, cadBlocks, commitBlockMutation],
  );
  const redefineProfessionalBlock = useCallback(
    (blockId: string) => {
      const entityIds = [
        ...new Set([
          ...selRef.current.map((item) => item.id),
          ...nativeSelectionIdsRef.current,
        ]),
      ];
      commitBlockMutation(
        (document) => {
          const entities = entityIds
            .map((id) => document.entities.find((entity) => entity.id === id))
            .filter((entity): entity is CadEntity => !!entity);
          return redefineCadBlock(document, blockId, entities);
        },
        nativeSelectionIdsRef.current,
        "Definición actualizada; todas sus instancias se regeneraron.",
      );
      const updatedDefinition = loadedCadDocumentRef.current?.blocks.find(
        (block) => block.id === blockId,
      );
      const libraryRow = cadBlocks.find(
        (candidate) => candidate.definition?.id === blockId,
      );
      if (updatedDefinition && libraryRow)
        void legacyCadFetch(`cad-blocks/${libraryRow.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ definition: updatedDefinition }),
        })
          .then((response) =>
            response.ok
              ? loadCadBlocks()
              : toast.error(
                  "Redefinición local guardada; la biblioteca tenant no pudo versionarse.",
                  "BLOCK",
                ),
          )
          .catch(() =>
            toast.error(
              "Redefinición local guardada; falló la biblioteca tenant.",
              "BLOCK",
            ),
          );
    },
    [cadBlocks, commitBlockMutation, toast],
  );
  const replaceProfessionalBlock = useCallback(
    (sourceBlock: string, targetBlock: string) => {
      commitBlockMutation(
        (document) => replaceCadBlock(document, sourceBlock, targetBlock),
        nativeSelectionIdsRef.current,
        "Instancias reemplazadas conservando transformaciones y atributos compatibles.",
      );
    },
    [commitBlockMutation],
  );
  const explodeProfessionalInsert = useCallback(
    (insertId: string) => {
      commitBlockMutation(
        (document) => explodeCadInsert(document, insertId),
        [],
        "INSERT explotado en geometría editable independiente.",
      );
    },
    [commitBlockMutation],
  );
  const purgeProfessionalBlocks = useCallback(() => {
    commitBlockMutation(
      (document) => purgeUnusedCadBlocks(document).document,
      nativeSelectionIdsRef.current,
      "Definiciones no usadas purgadas.",
    );
  }, [commitBlockMutation]);

  const fetchCadXrefSnapshot = useCallback(
    async (
      assetId: string,
      sourceRevision: string,
      displayName = assetId,
    ): Promise<CadXrefAssetSnapshot> => {
      const response = await legacyCadFetch(
        `layout?model=${encodeURIComponent(assetId)}&revision=${encodeURIComponent(sourceRevision)}`,
      );
      if (response.status === 401 || response.status === 403)
        throw new Error("Permission denied for this tenant CAD asset.");
      if (response.status === 404)
        throw new Error("Referenced tenant CAD asset is missing.");
      if (!response.ok)
        throw new Error("The tenant CAD asset could not be resolved.");
      const source = (await response.json()) as Layout;
      if (!source.cadDocument)
        throw new Error(
          "Referenced tenant CAD asset has no canonical CAD document.",
        );
      const document = migrateCadDocument(source.cadDocument);
      return {
        tenantId: tenantId ?? "tenant-context",
        assetId,
        name: displayName,
        revision: sourceRevision,
        version: source.cadDocumentVersion ?? document.meta.version,
        contentHash: await hashCadXrefDocument(document),
        document,
        fetchedAt: new Date().toISOString(),
      };
    },
    [tenantId],
  );

  const attachProfessionalXref = useCallback(
    async (draft: CadXrefAttachDraft) => {
      const source = await fetchCadXrefSnapshot(
        draft.assetId,
        draft.revision,
        draft.name,
      );
      const id = newId("xref");
      commitBlockMutation(
        (document) =>
          attachCadXref(document, {
            id,
            snapshot: source,
            mode: draft.mode,
            hostAssetId: `${model}@${revision}`,
            insertion: { x: draft.x, y: draft.y, z: 0 },
            scale: draft.scale,
            rotation: draft.rotation,
          }),
        [`xref:${id}:insert`],
        `${draft.mode === "overlay" ? "Overlay" : "Attachment"} ${draft.assetId}@${draft.revision} vinculado.`,
        "XREF",
        true,
      );
    },
    [commitBlockMutation, fetchCadXrefSnapshot, model, revision],
  );

  const compareProfessionalXref = useCallback(
    async (
      reference: CadExternalReference,
    ): Promise<CadXrefVersionComparison | null> => {
      try {
        const source = await fetchCadXrefSnapshot(
          reference.assetId ?? reference.name,
          reference.revision ?? "UNIVERSAL",
          reference.name,
        );
        const comparison = compareCadXrefVersion(
          snapshotDocument(),
          reference.id,
          source,
        );
        commitBlockMutation(
          (current) =>
            markCadXrefStatus(
              current,
              reference.id,
              comparison.changed ? "stale" : "loaded",
            ),
          nativeSelectionIdsRef.current,
          comparison.changed
            ? "La referencia tiene una versión más reciente."
            : "La referencia está actualizada.",
          "XREF",
        );
        return comparison;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Xref compare failed.";
        const status = /permission/i.test(message) ? "denied" : "missing";
        commitBlockMutation(
          (current) =>
            markCadXrefStatus(current, reference.id, status, message),
          nativeSelectionIdsRef.current,
          message,
          "XREF",
        );
        throw cause;
      }
    },
    [commitBlockMutation, fetchCadXrefSnapshot, snapshotDocument],
  );

  const reloadProfessionalXref = useCallback(
    async (reference: CadExternalReference) => {
      try {
        const source = await fetchCadXrefSnapshot(
          reference.assetId ?? reference.name,
          reference.revision ?? "UNIVERSAL",
          reference.name,
        );
        commitBlockMutation(
          (document) =>
            reloadCadXref(
              document,
              reference.id,
              source,
              `${model}@${revision}`,
            ),
          [reference.insertId ?? `xref:${reference.id}:insert`],
          `${reference.name} recargada a v${source.version}.`,
          "XREF",
          true,
        );
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Xref reload failed.";
        const status = /permission/i.test(message) ? "denied" : "missing";
        commitBlockMutation(
          (current) =>
            markCadXrefStatus(current, reference.id, status, message),
          nativeSelectionIdsRef.current,
          message,
          "XREF",
        );
        throw cause;
      }
    },
    [commitBlockMutation, fetchCadXrefSnapshot, model, revision],
  );

  const unloadProfessionalXref = useCallback(
    (id: string) => {
      commitBlockMutation(
        (document) => unloadCadXref(document, id),
        [],
        "Referencia descargada; vínculo y caché conservados.",
        "XREF",
      );
    },
    [commitBlockMutation],
  );

  const detachProfessionalXref = useCallback(
    (id: string) => {
      commitBlockMutation(
        (document) => detachCadXref(document, id),
        [],
        "Referencia y proyección eliminadas del dibujo.",
        "XREF",
      );
    },
    [commitBlockMutation],
  );

  const bindProfessionalXref = useCallback(
    (id: string) => {
      commitBlockMutation(
        (document) => bindCadXref(document, id),
        [],
        "Referencia ligada como geometría local editable.",
        "XREF",
      );
    },
    [commitBlockMutation],
  );
  const insertNativeEntities = useCallback(
    (incoming: CadNativeEntity[], label: string) => {
      if (!incoming.length) return false;
      if (drawingReadOnlyRef.current) {
        notifyReadOnly();
        return false;
      }
      const checkpoint = snapshotDocument();
      // Una capa bloqueada no recibe geometría. La comprobación vivía sólo en
      // las herramientas de dibujo, así que todo lo que insertaba por otra vía
      // —OFFSET sobre una entidad de una capa bloqueada, cotas, MLEADER—
      // escribía igualmente sobre la capa bloqueada.
      const lockedTarget = incoming.find(
        (entity) =>
          checkpoint.layers.find((layer) => layer.id === entity.layer)?.locked,
      );
      if (lockedTarget) {
        toast.error(
          `Layer ${lockedTarget.layer} is locked. Unlock it before writing to it.`,
          "Capa bloqueada",
        );
        return false;
      }
      const existingIds = new Set(
        checkpoint.entities.map((entity) => entity.id),
      );
      // El lote debe ser consistente consigo mismo, no sólo contra el
      // documento: dos entidades con el mismo id dentro de `incoming` se
      // colaban y dejaban `modelSpace.entityIds` con un fantasma y una entidad
      // inalcanzable.
      const incomingIds = new Set(incoming.map((entity) => entity.id));
      if (
        incomingIds.size !== incoming.length ||
        incoming.some((entity) => existingIds.has(entity.id))
      ) {
        toast.error(
          "Una entidad nativa ya existe en el documento.",
          "Entidad CAD",
        );
        return false;
      }
      const entities = [...checkpoint.entities, ...incoming].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      const document = commitChange(
        {
          ...checkpoint,
          entities,
          // Las entidades insertadas (MTEXT, DIMENSION, MLEADER…) se dibujan
          // AL FRENTE. Ordenar alfabéticamente reordenaba el plano entero cada
          // vez que el usuario añadía una anotación.
          modelSpace: {
            entityIds: preserveDrawOrder(checkpoint.modelSpace.entityIds, [
              ...new Set([
                ...checkpoint.modelSpace.entityIds,
                ...incoming.map((entity) => entity.id),
              ]),
            ]),
          },
        },
        label,
      );
      commitCanonicalDocument(checkpoint, document, {
        selection: incoming.map((entity) => entity.id),
        upsert: incoming,
      });
      return true;
    },
    [commitCanonicalDocument, notifyReadOnly, snapshotDocument, toast],
  );
  const openMTextEditor = useCallback((entityId: string | null = null) => {
    setEditingMTextId(entityId);
    setMTextEditorOpen(true);
  }, []);
  const saveMTextDraft = useCallback(
    (draft: CadMTextDraft) => {
      const patch: Partial<CadPropertyBag> = {
        text: draft.text.trim(),
        insertionX: draft.insertionX,
        insertionY: draft.insertionY,
        width: draft.width,
        height: draft.height,
        rotation: draft.rotation,
        alignment: draft.alignment,
        paragraphAlignment: draft.paragraphAlignment,
        style: draft.style,
        fontFamily: draft.fontFamily,
        lineSpacing: draft.lineSpacing,
        bold: draft.bold,
        italic: draft.italic,
        underline: draft.underline,
        backgroundMask: draft.backgroundMask,
        backgroundColor: draft.backgroundColor,
        backgroundPadding: draft.backgroundPadding,
        columns: draft.columns,
        layer: draft.layer,
      };
      if (editingMTextId)
        commitNativeCommands([
          { type: "properties", entityId: editingMTextId, patch },
        ]);
      else {
        const entity: CadNativeEntity = {
          id: newId("mtext"),
          type: "mtext",
          insertion: { x: draft.insertionX, y: draft.insertionY, z: 0 },
          text: draft.text.trim(),
          width: draft.width,
          height: draft.height,
          rotation: draft.rotation,
          alignment: draft.alignment,
          paragraphAlignment: draft.paragraphAlignment,
          style: draft.style,
          fontFamily: draft.fontFamily,
          lineSpacing: draft.lineSpacing,
          bold: draft.bold,
          italic: draft.italic,
          underline: draft.underline,
          backgroundMask: draft.backgroundMask,
          backgroundColor: draft.backgroundColor,
          backgroundPadding: draft.backgroundPadding,
          columns: draft.columns,
          layer: draft.layer,
          context: {
            provenance: { provider: "cad-editor" },
            metadata: { sourceType: "MTEXT" },
          },
        };
        insertNativeEntities([entity], "create:mtext");
      }
      setEditingMTextId(null);
      setMTextEditorOpen(false);
    },
    [commitNativeCommands, editingMTextId, insertNativeEntities],
  );
  const createAssociativeDimension = useCallback(
    (draft: CadDimensionDraft) => {
      const document = loadedCadDocumentRef.current;
      if (!document) return;
      const selectedSources = nativeSelectionIdsRef.current
        .map((id) => document.entities.find((entity) => entity.id === id))
        .filter(
          (entity): entity is CadEntity =>
            !!entity &&
            entity.type !== "dimension" &&
            entity.type !== "hatch" &&
            entity.type !== "mtext",
        );
      const primary = selectedSources[0];
      type DimensionReference = NonNullable<
        Extract<CadEntity, { type: "dimension" }>["references"]
      >[number];
      let references: DimensionReference[] = [];
      if (
        primary?.type === "line" &&
        (draft.kind === "linear" ||
          draft.kind === "aligned" ||
          draft.kind === "ordinate")
      )
        references = [
          { entityId: primary.id, anchor: "start" },
          { entityId: primary.id, anchor: "end" },
        ];
      else if (
        (primary?.type === "arc" || primary?.type === "circle") &&
        (draft.kind === "radius" || draft.kind === "diameter")
      )
        references = [
          { entityId: primary.id, anchor: "center" },
          { entityId: primary.id, anchor: "arc-start" },
        ];
      else if (
        primary?.type === "arc" &&
        (draft.kind === "angular" || draft.kind === "arc-length")
      )
        references = [
          { entityId: primary.id, anchor: "center" },
          { entityId: primary.id, anchor: "arc-start" },
          { entityId: primary.id, anchor: "arc-end" },
        ];
      else if (
        selectedSources.length >= 2 &&
        (draft.kind === "linear" ||
          draft.kind === "aligned" ||
          draft.kind === "ordinate")
      ) {
        const referenceFor = (entity: CadEntity): DimensionReference | null => {
          if (entity.type === "line" || entity.type === "spline")
            return { entityId: entity.id, anchor: "start" };
          if (
            entity.type === "circle" ||
            entity.type === "arc" ||
            entity.type === "ellipse"
          )
            return { entityId: entity.id, anchor: "center" };
          return null;
        };
        const first = referenceFor(selectedSources[0]);
        const second = referenceFor(selectedSources[1]);
        if (first && second) references = [first, second];
      }
      const definitionPoints = references.map((reference) => {
        const source = document.entities.find(
          (entity) => entity.id === reference.entityId,
        );
        return source ? cadEntityAssociationAnchor(source, reference) : null;
      });
      const required =
        draft.kind === "angular" || draft.kind === "arc-length" ? 3 : 2;
      if (
        definitionPoints.length < required ||
        definitionPoints.some((point) => !point)
      ) {
        toast.error(
          "La selección no aporta referencias compatibles con ese tipo de cota.",
          "Dimensión",
        );
        return;
      }
      const style = document.styles.dimension[draft.style] ?? {};
      const entity: CadNativeEntity = {
        id: newId("dim"),
        type: "dimension",
        dimensionKind: draft.kind,
        a: definitionPoints[0]!,
        b: definitionPoints[1]!,
        ...(definitionPoints[2] ? { c: definitionPoints[2]! } : {}),
        axis: draft.axis,
        offset: draft.offset,
        ...(draft.kind === "radius" || draft.kind === "diameter"
          ? {
              radius: Math.hypot(
                definitionPoints[1]!.x - definitionPoints[0]!.x,
                definitionPoints[1]!.y - definitionPoints[0]!.y,
              ),
            }
          : {}),
        style: draft.style,
        precision: style.precision ?? draft.precision,
        sourceUnit: data?.footprint.unit === "m" ? "m" : "mm",
        units: draft.units,
        ...(draft.alternateUnits
          ? { alternateUnits: draft.alternateUnits }
          : {}),
        prefix: draft.prefix,
        suffix: draft.suffix,
        extensionLines: draft.extensionLines,
        arrowhead: draft.arrowhead,
        arrowSize:
          style.arrowSize ??
          Math.max(1, (data?.footprint.gridSize ?? 100) * 1.8),
        associative: true,
        references,
        associationStatus: "associated",
        layer: activeCadLayer,
        context: {
          provenance: { provider: "cad-editor" },
          metadata: { sourceType: "ASSOCIATIVE_DIMENSION" },
        },
      };
      if (insertNativeEntities([entity], `create:dimension:${draft.kind}`)) {
        setShowDimensionPalette(false);
        toast.success(
          `Cota ${draft.kind} asociada a ${new Set(references.map((reference) => reference.entityId)).size} fuente(s).`,
          "Dimensión",
        );
      }
    },
    [
      activeCadLayer,
      data?.footprint.gridSize,
      data?.footprint.unit,
      insertNativeEntities,
      toast,
    ],
  );
  const createAssociativeMleader = useCallback(
    (draft: CadMLeaderDraft) => {
      const document = loadedCadDocumentRef.current;
      if (!document || !draft.text.trim()) return;
      const selectedIds = [
        ...new Set([
          ...nativeSelectionIdsRef.current,
          ...selRef.current.map((item) => item.id),
        ]),
      ];
      const sources = selectedIds
        .map((id) => document.entities.find((entity) => entity.id === id))
        .filter(
          (entity): entity is CadEntity =>
            !!entity && entity.type !== "mleader",
        );
      const referenceFor = (entity: CadEntity): CadMleaderReference | null => {
        if (entity.type === "box" || entity.type === "station")
          return { entityId: entity.id, anchor: "corner-ne" };
        if (
          entity.type === "line" ||
          entity.type === "circle" ||
          entity.type === "arc" ||
          entity.type === "ellipse" ||
          entity.type === "hatch" ||
          entity.type === "dimension"
        )
          return { entityId: entity.id, anchor: "center" };
        if (entity.type === "polyline")
          return { entityId: entity.id, anchor: "start" };
        if (entity.type === "spline")
          return { entityId: entity.id, anchor: "control", index: 0 };
        if (
          entity.type === "mtext" ||
          entity.type === "insert" ||
          entity.type === "text"
        )
          return { entityId: entity.id, anchor: "insertion" };
        return null;
      };
      const resolved = sources.flatMap((source) => {
        const reference = referenceFor(source);
        const point = reference
          ? cadMleaderAssociationAnchor(source, reference)
          : null;
        return reference && point ? [{ reference, point }] : [];
      });
      if (!resolved.length) {
        toast.error("La selección no aporta destinos compatibles.", "MLEADER");
        return;
      }
      const base = Math.max(1, data?.footprint.gridSize ?? 100);
      const center = resolved.reduce(
        (sum, item) => ({
          x: sum.x + item.point.x / resolved.length,
          y: sum.y + item.point.y / resolved.length,
        }),
        { x: 0, y: 0 },
      );
      const style = document.styles.mleader?.[draft.style] ?? {};
      const doglegLength = style.doglegLength ?? draft.doglegLength;
      const elbow = { x: center.x + base * 5, y: center.y - base * 4, z: 0 };
      const leaderLines = resolved.map((item) => [
        { ...item.point, z: 0 },
        { ...elbow },
      ]);
      const entity: CadNativeEntity = {
        id: newId("mleader"),
        type: "mleader",
        vertices: leaderLines[0],
        leaderLines,
        text: draft.text.trim(),
        textPosition: { x: elbow.x + doglegLength, y: elbow.y, z: 0 },
        contentType: draft.contentType,
        style: draft.style,
        landing: style.landing ?? draft.landing,
        doglegLength,
        arrowhead: draft.arrowhead,
        arrowSize: style.arrowSize ?? draft.arrowSize,
        textWidth: draft.textWidth,
        textHeight: draft.textHeight,
        textAlignment: draft.textAlignment,
        fontFamily: "Arial",
        lineSpacing: 1.2,
        backgroundMask: draft.backgroundMask,
        backgroundColor: "#111827",
        backgroundPadding: 0.15,
        associative: true,
        references: resolved.map((item) => item.reference),
        associationStatus: "associated",
        layer: activeCadLayer,
        context: {
          provenance: { provider: "cad-editor" },
          metadata: { sourceType: "MLEADER" },
        },
      };
      if (insertNativeEntities([entity], "create:mleader")) {
        setShowMleaderPalette(false);
        toast.success(
          `MLEADER asociado con ${leaderLines.length} línea(s).`,
          "MLEADER",
        );
      }
    },
    [activeCadLayer, data?.footprint.gridSize, insertNativeEntities, toast],
  );

  // ---- scene lifecycle ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!open || !data || !mount) return;
    let raf = 0;
    let disposed = false;
    const width = mount.clientWidth || 1200;
    const height = mount.clientHeight || 700;
    const fp = data.footprint;
    const W = fp.footprintW || 1;
    const H = fp.footprintH || 1;
    const s = 30 / Math.max(W, H);
    ctxRef.current = { s, W, H };
    nativeViewportBoundsRef.current = { minX: 0, minY: 0, maxX: W, maxY: H };
    nativeSceneSyncRef.current?.clear({
      remove: (_id, projection) => disposeCadNativeObject(projection),
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1e);
    scene.fog = new THREE.Fog(
      0x0a0f1e,
      Math.max(W, H) * s * 1.4,
      Math.max(W, H) * s * 3.4,
    );
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 4000);
    camera.position.set(
      W * s * 0.45,
      Math.max(W, H) * s * 0.8,
      H * s * 1.0 + 10,
    );
    cameraRef.current = camera;

    // THREE.WebGLRenderer LANZA si no consigue contexto. Sin este guard la
    // excepción escapa del efecto, tumba el árbol React y el usuario pierde
    // TODO el editor (no sólo el viewport) sin explicación.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch (cause) {
      console.error("Valle Design: WebGL no disponible en este navegador", cause);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      // La disponibilidad de WebGL sólo se conoce tras montar (depende del
      // DOM real). Detectarla en render provocaría un desajuste de hidratación
      // entre servidor y cliente, así que aquí el setState es deliberado.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebglUnavailable(true);
      return;
    }
    setWebglUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.cursor = "none";
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0x9bbcff, 0x1e293b, 0.5);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(W * s * 0.6, Math.max(W, H) * s * 1.2, H * s * 0.4);
    dir.castShadow = true;
    const sh = Math.max(W, H) * s;
    dir.shadow.camera.left = -sh;
    dir.shadow.camera.right = sh;
    dir.shadow.camera.top = sh;
    dir.shadow.camera.bottom = -sh;
    dir.shadow.camera.near = 0.1;
    dir.shadow.camera.far = sh * 4;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);
    dirLightRef.current = dir;

    // floor + grid + footprint outline (grid built by applyTheme so it follows the theme)
    const deco = new THREE.Group();
    scene.add(deco);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W * s, H * s),
      new THREE.MeshStandardMaterial({
        color: 0x14203a,
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    groundRef.current = ground;
    deco.add(ground);
    const gridGroup = new THREE.Group();
    deco.add(gridGroup);
    gridGroupRef.current = gridGroup;
    // cell floor tints — rebuildable so cells can be created/removed live (unify)
    const cellsGroup = new THREE.Group();
    deco.add(cellsGroup);
    cellsGroupRef.current = cellsGroup;
    rebuildCellsRef.current();

    const assetsGroup = new THREE.Group();
    scene.add(assetsGroup);
    assetsGroupRef.current = assetsGroup;
    const nativeGroup = new THREE.Group();
    scene.add(nativeGroup);
    nativeGroupRef.current = nativeGroup;
    // El pipeline por lotes se enchufa aquí, con el mapeo mundo→XZ intacto: lo
    // único que recibe es el mismo `{ scale, width, height }` que ya usaba
    // `scenePoint`. `yScreenSign: 1` reproduce la convención vigente (+Y del
    // dibujo hacia abajo); voltearla es un cambio con su propio PR.
    if (renderPipelineRef.current === "batched") {
      const host = new CadViewportRenderHost({
        parent: nativeGroup,
        viewport: { scale: s, width: W, height: H, elevation: 0.11 },
        yScreenSign: 1,
        // 4 ms de 16,7 es el defecto del planificador y está pensado para que
        // el usuario no note nada mientras dibuja. Cargar un plano de 100.000
        // entidades con ese presupuesto tarda minutos, y durante la carga NO
        // hay nadie dibujando: lo que hay es alguien esperando a ver su plano.
        // 8 ms sigue dejando la mitad del cuadro libre.
        frameBudgetMs: 8,
      });
      renderPipelineHostRef.current = host;
      renderPipelineSlotRef.current?.set(host);
    }
    // Sólidos SOMBREADOS: grupo aparte con z real y luz, excluidos del batch
    // (que vive comprimido en una lámina de profundidad NDC). Patrón INSERT.
    const solidShadeHost = new CadSolidShadeHost(
      () => ({ scale: s, width: W, height: H }),
      () => viewControllerRef.current,
    );
    nativeGroup.add(solidShadeHost.group);
    solidShadeHostRef.current = solidShadeHost;
    const connsGroup = new THREE.Group();
    scene.add(connsGroup);
    connsGroupRef.current = connsGroup;
    const dimsGroup = new THREE.Group();
    scene.add(dimsGroup);
    dimsGroupRef.current = dimsGroup;
    const previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({ color: 0xfcd34d }),
    );
    previewLine.visible = false;
    previewLineRef.current = previewLine;
    dimsGroup.add(previewLine);
    // Marquee de selección (ADR §220): rectángulo en el piso — cian = ventana
    // (izq→der, todo contenido), verde = cruce (der→izq, basta intersectar).
    const marqueeLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false }),
    );
    marqueeLine.renderOrder = 998;
    marqueeLine.visible = false;
    scene.add(marqueeLine);
    // Snap-to-underlay marker — a flat ring that lights up on a DXF snap target.
    // Added to the scene (not dimsGroup) so dim rebuilds never dispose it.
    const snapMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.28, 24),
      new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    snapMarker.rotation.x = -Math.PI / 2;
    snapMarker.renderOrder = 999;
    snapMarker.visible = false;
    snapMarkerRef.current = snapMarker;
    scene.add(snapMarker);
    const notesGroup = new THREE.Group();
    scene.add(notesGroup);
    notesGroupRef.current = notesGroup;
    const dxfGroup = new THREE.Group();
    scene.add(dxfGroup);
    dxfGroupRef.current = dxfGroup;
    const heatGroup = new THREE.Group();
    heatGroup.visible = showHeatRef.current;
    scene.add(heatGroup);
    heatGroupRef.current = heatGroup;
    heatLoadedRef.current = false;
    if (showHeatRef.current) {
      heatLoadedRef.current = true;
      loadHeatRef.current();
    }
    const gapsGroup = new THREE.Group();
    gapsGroup.visible = showGapsRef.current;
    scene.add(gapsGroup);
    gapsGroupRef.current = gapsGroup;
    gapsLoadedRef.current = false;
    if (showGapsRef.current) {
      gapsLoadedRef.current = true;
      loadGapsRef.current();
    }
    const guidesGroup = new THREE.Group();
    scene.add(guidesGroup);
    guidesGroupRef.current = guidesGroup;
    const blocks = new THREE.Group();
    scene.add(blocks);
    blocksRef.current = blocks;
    rebuildAssets();
    syncNativeScene();
    rebuildDims();
    rebuildNotes();
    rebuildDxf();
    rebuildBlocks();
    applyTheme();
    applyLayers();
    applySun();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    const viewController = new CadViewController(
      { scale: s, width: W, height: H },
      renderer.domElement.clientWidth || width,
      renderer.domElement.clientHeight || height,
      camera,
    );
    viewControllerRef.current = viewController;
    let batchedViewBounds: CadBounds | null = null;
    let batchedViewDirty = true;
    const unsubscribeBatchedView = viewController.onChange(() => {
      batchedViewDirty = true;
    });
    viewController.setMode(viewModeRef.current);
    /** La cámara que se dibuja y contra la que se lanzan los rayos. */
    const activeCamera = () => viewController.camera;
    const syncViewFromOrbit = () =>
      viewController.adoptPerspectiveFraming(
        controls.target,
        renderer.domElement.clientWidth || width,
        renderer.domElement.clientHeight || height,
      );
    syncViewFromOrbit();

    let viewportSyncTimer: ReturnType<typeof setTimeout> | null = null;
    const queueNativeViewportSync = () => {
      if (viewportSyncTimer) clearTimeout(viewportSyncTimer);
      viewportSyncTimer = setTimeout(() => {
        const bounds = viewController.viewportBounds();
        if (
          !bounds ||
          !cadViewportBoundsChanged(nativeViewportBoundsRef.current, bounds)
        )
          return;
        nativeViewportBoundsRef.current = bounds;
        // Con el pipeline por lotes, un cambio de vista NO reproyecta nada: lo
        // resuelve `setView` en el bucle de cuadros, que es justamente lo que
        // convierte un paneo en cuatro uniformes en vez de una reconstrucción.
        if (!renderPipelineHostRef.current) syncNativeScene();
      }, 80);
    };
    controls.addEventListener("change", () => {
      syncViewFromOrbit();
      queueNativeViewportSync();
    });
    queueNativeViewportSync();

    // ---- drag a station block or an asset on the floor ----
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.22 };
    const ptr = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let drag: {
      lead: SelItem;
      items: SelItem[];
      grabDX: number;
      grabDZ: number;
      start: Map<string, { x: number; y: number }>;
      xEdges: number[];
      yEdges: number[];
    } | null = null;
    // Snap a moving box's edges/centre to other objects' edges/centres + the
    // footprint, returning the offset to apply and the world axis to draw a guide.
    const snap1D = (
      lo: number,
      len: number,
      edges: number[],
      tol: number,
    ): { off: number; axis: number } | null => {
      const pts = [lo, lo + len / 2, lo + len];
      let best: { off: number; axis: number; d: number } | null = null;
      for (const p of pts)
        for (const ed of edges) {
          const d = Math.abs(p - ed);
          if (d <= tol && (!best || d < best.d))
            best = { off: ed - p, axis: ed, d };
        }
      return best ? { off: best.off, axis: best.axis } : null;
    };
    const setGuides = (vx: number | null, hy: number | null) => {
      const grp = guidesGroupRef.current;
      const ctx = ctxRef.current;
      if (!grp || !ctx) return;
      grp.children.slice().forEach((c) => {
        grp.remove(c);
        (c as THREE.Line).geometry?.dispose?.();
      });
      const { s, W, H } = ctx;
      const yy = 0.06;
      const mat = () => new THREE.LineBasicMaterial({ color: 0x22d3ee });
      if (vx !== null) {
        const x = (vx - W / 2) * s;
        grp.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(x, yy, (-H / 2) * s),
              new THREE.Vector3(x, yy, (H / 2) * s),
            ]),
            mat(),
          ),
        );
      }
      if (hy !== null) {
        const z = (hy - H / 2) * s;
        grp.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3((-W / 2) * s, yy, z),
              new THREE.Vector3((W / 2) * s, yy, z),
            ]),
            mat(),
          ),
        );
      }
    };
    let downX = 0,
      downY = 0;
    let dragMoved = false;
    let dragSnap: Snapshot | null = null;
    let marquee: { x0: number; y0: number; x1: number; y1: number } | null =
      null;
    let selectionPath: { x: number; y: number }[] | null = null;
    const updateMarqueeGeometry = (points: readonly THREE.Vector3[]) => {
      const geometry = marqueeLine.geometry as THREE.BufferGeometry;
      let position = geometry.getAttribute("position") as
        THREE.BufferAttribute | undefined;
      if (!position || position.count < points.length) {
        const capacity = 2 ** Math.ceil(Math.log2(Math.max(4, points.length)));
        position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
        geometry.setAttribute("position", position);
      }
      points.forEach((point, index) =>
        position!.setXYZ(index, point.x, point.y, point.z),
      );
      position.needsUpdate = true;
      geometry.setDrawRange(0, points.length);
      geometry.computeBoundingSphere();
    };
    const drawMarquee = (m: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }) => {
      const ctx = ctxRef.current!;
      const toWorld = (x: number, y: number) =>
        new THREE.Vector3(
          (x - ctx.W / 2) * ctx.s,
          0.05,
          (y - ctx.H / 2) * ctx.s,
        );
      updateMarqueeGeometry([
        toWorld(m.x0, m.y0),
        toWorld(m.x1, m.y0),
        toWorld(m.x1, m.y1),
        toWorld(m.x0, m.y1),
      ]);
      (marqueeLine.material as THREE.LineBasicMaterial).color.set(
        m.x1 >= m.x0 ? 0x22d3ee : 0x34d399,
      );
      marqueeLine.visible = true;
    };
    const drawSelectionPath = (points: readonly { x: number; y: number }[]) => {
      const ctx = ctxRef.current!;
      updateMarqueeGeometry(
        points.map(
          (point) =>
            new THREE.Vector3(
              (point.x - ctx.W / 2) * ctx.s,
              0.05,
              (point.y - ctx.H / 2) * ctx.s,
            ),
        ),
      );
      (marqueeLine.material as THREE.LineBasicMaterial).color.set(
        selectionGeometryModeRef.current === "fence" ? 0xf59e0b : 0xa78bfa,
      );
      marqueeLine.visible = true;
    };
    const unit = data.footprint.unit || "mm";

    const resolveAssetId = (o: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = o;
      while (cur) {
        if (cur.userData?.assetId) return cur.userData.assetId as string;
        cur = cur.parent;
      }
      return null;
    };
    const resolveNativeEntityId = (o: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = o;
      while (cur) {
        if (cur.userData?.nativeEntityId)
          return cur.userData.nativeEntityId as string;
        cur = cur.parent;
      }
      return null;
    };
    const getPlace = (it: SelItem) =>
      it.type === "station"
        ? placementsRef.current.get(it.id)
        : assetsRef.current.get(it.id);
    // Move an item's three.js object to match its current placement (no rebuild).
    const repositionItem = (it: SelItem) => {
      const ctx = ctxRef.current!;
      const p = getPlace(it);
      if (!p) return;
      const ncx = (p.x + p.w / 2 - ctx.W / 2) * ctx.s,
        ncz = (p.y + p.h / 2 - ctx.H / 2) * ctx.s;
      if (it.type === "station") {
        const mesh = meshByIdRef.current.get(it.id);
        if (mesh) {
          mesh.position.x = ncx;
          mesh.position.z = ncz;
        }
        const lab = blocks.children.find(
          (o) => (o as THREE.Sprite).userData?.labelFor === it.id,
        );
        if (lab) {
          lab.position.x = ncx;
          lab.position.z = ncz;
        }
      } else {
        const g = groupByAssetRef.current.get(it.id);
        if (g) {
          g.position.x = ncx;
          g.position.z = ncz;
        }
      }
    };
    const eyeY = Math.max(W, H) * s * 0.06;
    let walkLook = false,
      lookX = 0,
      lookY = 0;
    const setPtr = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    /** World (x,y) of the floor point under the pointer, or null. */
    const floorWorld = (e: PointerEvent): { wx: number; wy: number } | null => {
      setPtr(e);
      if (viewController.mode === "2d") {
        // Aritmética exacta: ni rayo, ni plano, ni escorzo.
        const rect = renderer.domElement.getBoundingClientRect();
        const point = viewController.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        return point ? { wx: point.x, wy: point.y } : null;
      }
      // En 3D se conserva el rayo original tal cual: los goldens corren en 3D y
      // el NDC debe salir del rectángulo real del lienzo, no de un tamaño
      // cacheado que puede ir un frame por detrás.
      raycaster.setFromCamera(ptr, activeCamera());
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
      const ctx = ctxRef.current!;
      return { wx: hit.x / ctx.s + ctx.W / 2, wy: hit.z / ctx.s + ctx.H / 2 };
    };
    /**
     * OSNAP de escena completa (Fase 66 cableada, ADR §216): esquinas, puntos
     * medios y centros de estaciones/assets + los puntos del DXF como nodos.
     * Solo los ~48 objetos más cercanos alimentan el motor (plantas grandes no
     * degradan el pointermove). Sin candidato dentro de tolerancia → grid-snap.
     */
    const pointerWorldTolerance = (pixels: number) => {
      const ctx = ctxRef.current!;
      // Una división en 2D: la apertura mide los mismos píxeles a cualquier
      // zoom. Antes se aproximaba con distancia de cámara y FOV, y derivaba al
      // acercarse porque la relación píxel↔mundo no es constante en perspectiva.
      return viewController.toleranceWorld(
        pixels,
        Math.max(0.01, Math.min(ctx.W, ctx.H) * 0.00001),
        Math.max(ctx.W, ctx.H) * 0.02,
      );
    };
    /** Hit-test canónico bajo un punto de DIBUJO, con la apertura del pickbox. */
    const hitCanonical = (point: { x: number; y: number }, limit: number) =>
      nativeSelectionIndexRef.current?.hitTest(
        point,
        pointerWorldTolerance(workspacePreferencesRef.current.pickBoxPx),
        limit,
      ) ?? [];
    const snapFloor = (
      wx: number,
      wy: number,
      acquire = false,
    ): {
      wx: number;
      wy: number;
      onDxf: boolean;
      snapType?: SnapType;
      tracking?: "object" | "polar" | "ortho";
      trackingAngle?: number;
    } => {
      const ctx = ctxRef.current!;
      const tol = pointerWorldTolerance(
        workspacePreferencesRef.current.aperturePx,
      );
      if (draftSettingsHost.osnap) {
        // Enganche 3D primero: en perspectiva la arista de un sólido se ve
        // donde la pinta la cámara, no sobre su sombra en el suelo.
        const solid = solidShadeHostRef.current?.snapAtDrawingPoint(wx, wy, {
          aperturePx: workspacePreferencesRef.current.aperturePx,
          modes: draftSettingsHost.snapModes(),
        });
        if (solid) return solid;
        const scene = cadSnapSceneFromBoxes(
          [...placementsRef.current.values(), ...assetsRef.current.values()],
          { x: wx, y: wy },
          dxfSnapRef.current,
        );
        // El ancla del rastreo: el último punto confirmado. Con el puntero ya
        // enrutado, ese punto lo tiene el motor —no `drawCommandRef`—, así que
        // se pregunta primero por ahí. Sin esto, el rastreo polar y de objeto
        // se apagarían justo en los comandos que sí pasan por el motor.
        const anchor =
          enginePointerRouterRef.current?.anchor ??
          drawCommandRef.current?.points.at(-1) ??
          (wallChainRef.current
            ? { x: wallChainRef.current.wx, y: wallChainRef.current.wy }
            : null);
        const nativeCandidates =
          nativeSelectionIndexRef.current?.search(
            {
              minX: wx - tol * 4,
              minY: wy - tol * 4,
              maxX: wx + tol * 4,
              maxY: wy + tol * 4,
            },
            48,
          ) ?? [];
        cadSnapSceneAddEntities(scene, nativeCandidates, anchor ?? { x: wx, y: wy });
        const hit = resolveOsnap({ x: wx, y: wy }, scene, {
          tolerance: tol,
          from: anchor,
          maxSegments: 96,
          // `grid` lo cubre el fallback snapWorld de siempre; el resto sale
          // ahora de DSETTINGS, cuyo reparto de fábrica es exactamente el que
          // estaba cableado aquí (todo encendido salvo `grid`).
          modes: draftSettingsHost.snapModes(),
        });
        if (hit) {
          if (acquire && draftSettingsHost.objectSnapTracking) {
            draftSettingsHost.setTrackingPoints(
              acquireCadTrackingPoint(
                draftSettingsHost.trackingPoints,
                hit.point,
                tol * 0.25,
              ),
            );
          }
          setGuides(null, null);
          return {
            wx: hit.point.x,
            wy: hit.point.y,
            onDxf: true,
            snapType: hit.type,
          };
        }
      }
      const anchor =
        enginePointerRouterRef.current?.anchor ??
        drawCommandRef.current?.points.at(-1) ??
        (wallChainRef.current
          ? { x: wallChainRef.current.wx, y: wallChainRef.current.wy }
          : null);
      if (
        draftSettingsHost.objectSnapTracking &&
        draftSettingsHost.trackingPoints.length
      ) {
        const tracked = trackFromAcquiredPoints(
          { x: wx, y: wy },
          draftSettingsHost.trackingPoints,
          tol,
        );
        if (tracked.snapped) {
          setGuides(
            tracked.guides.find((guide) => guide.axis === "x")?.value ?? null,
            tracked.guides.find((guide) => guide.axis === "y")?.value ?? null,
          );
          return {
            wx: tracked.point.x,
            wy: tracked.point.y,
            onDxf: false,
            tracking: "object",
          };
        }
      }
      setGuides(null, null);
      if (anchor && (draftSettingsHost.ortho || draftSettingsHost.polar)) {
        const increment = draftSettingsHost.ortho ? 90 : draftSettingsHost.polarIncrement;
        const tracked = resolveCadPolarTracking(
          anchor,
          { x: wx, y: wy },
          increment,
          draftSettingsHost.ortho ? 45 : Math.min(6, increment / 4),
        );
        if (tracked.snapped)
          return {
            wx: tracked.point.x,
            wy: tracked.point.y,
            onDxf: false,
            tracking: draftSettingsHost.ortho ? "ortho" : "polar",
            trackingAngle: tracked.angle,
          };
      }
      return { wx: snapWorld(wx), wy: snapWorld(wy), onDxf: false };
    };
    const showSnapMarker = (wx: number | null, wy?: number) => {
      const m = snapMarkerRef.current;
      const ctx = ctxRef.current;
      if (!m || !ctx) return;
      if (wx === null || wy === undefined) {
        m.visible = false;
        return;
      }
      m.position.set((wx - ctx.W / 2) * ctx.s, 0.07, (wy - ctx.H / 2) * ctx.s);
      m.visible = true;
    };

    // ---- FASE 2: el puntero entra en el motor de comandos ------------------
    // La banda elástica y el cursor vivo son la condición que hacía deliberado
    // el «sólo por teclado» de la ola 3. Aquí están, y con ellas el enrutado.
    const enginePreview = new CadEnginePreview(scene, {
      scale: s,
      width: W,
      height: H,
    });
    enginePreviewRef.current = enginePreview;
    const engineLiveCursor = new CadLiveCursorOverlay(mount, {
      commit: (values) => enginePointerRouterRef.current?.commitMeasurements(values),
      keyword: (shortcut) => enginePointerRouterRef.current?.keyword(shortcut),
      cancel: () => enginePointerRouterRef.current?.cancel(),
    });
    engineLiveCursor.setMirror(() => engineSnapLabelRef.current);
    engineLiveCursorRef.current = engineLiveCursor;
    const enginePointerRouter = new CadEnginePointerRouter({
      host: commandEngineRef.current!,
      preview: enginePreview,
      cursor: engineLiveCursor,
      worldPoint: (event) => {
        const world = floorWorld(event as PointerEvent);
        return world ? { x: world.wx, y: world.wy } : null;
      },
      // La captura la resuelve `snapFloor`, con los catorce modos ya
      // implementados. El motor no sabe de snaps: los pide por paso y aquí se
      // le devuelve el punto ya capturado junto con el modo que ganó.
      snap: (point, override) => {
        const resolved = snapFloor(point.x, point.y, true);
        const snap = resolved.snapType;
        if (override && override.length > 0 && (!snap || !override.includes(snap)))
          return { point };
        return { point: { x: resolved.wx, y: resolved.wy }, ...(snap ? { snap } : {}) };
      },
      hitEntity: (point) => hitCanonical(point, 1)[0]?.id ?? null,
      setCursor: (point) => {
        engineCursorPointRef.current = point;
      },
      localPoint: (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      session: engineSessionRef,
    });
    enginePointerRouterRef.current = enginePointerRouter;
    // ---- Grips nativos: arrastre + ciclo con Espacio + menú por pinzamiento.
    // Mismo patrón que el enrutador: estado fuera de React, deps por closure.
    const gripMenu = new CadGripMenuOverlay(mount, {
      choose: (kind) => nativeGripController.chooseMenuAction(kind),
      dismiss: () => nativeGripController.dismissMenu(),
    });
    const nativeGripController = new CadNativeGripController({
      document: () => loadedCadDocumentRef.current,
      setDocument: (document) => {
        loadedCadDocumentRef.current = document;
      },
      snapshotDocument: () => snapshotDocument(),
      readOnly: () => drawingReadOnlyRef.current,
      worldPoint: (event) => floorWorld(event as PointerEvent),
      snapPoint: (wx, wy) => {
        const snapped = snapFloor(wx, wy);
        return { wx: snapped.wx, wy: snapped.wy };
      },
      localPoint: (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      selectNative,
      setNativeEntities,
      bumpDocumentRevision: () => setNativeDocumentRevision((value) => value + 1),
      syncScene: (document, patch) => syncNativeScene(document, patch),
      recordHistory: recordHistoryDocument,
      markDirty,
      commitCommands: (commands, groupKey) =>
        commitNativeCommands(commands, undefined, groupKey),
      setOrbitEnabled: (enabled) => {
        controls.enabled = enabled;
      },
      capturePointer: (id) => renderer.domElement.setPointerCapture(id),
      releasePointer: (id) => {
        try {
          renderer.domElement.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
      },
      notify: (message) => toast.error(message, "Grips"),
      menu: gripMenu,
    });
    nativeGripControllerRef.current = nativeGripController;
    const onContextMenu = (event: MouseEvent) => {
      if (!enginePointerRouter.contextMenu(event)) return;
      event.preventDefault();
    };
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    // Los dedos tienen sus propias reglas: `touch-gestures.ts` explica cuáles y
    // con qué cifras. Mantener pulsado no abre un menú nuevo — emite el
    // `contextmenu` que estos mismos oyentes ya atendían.
    const touchGestures = new CadTouchGestures({
      openContextMenu: (origin) => cadDispatchContextMenu(renderer.domElement, origin),
      closeContextMenu: () => {
        setCadContextMenu(null);
        engineLiveCursor.closeMenu();
      },
      engineActive: () => enginePointerRouter.active,
    });

    const onDown = (e: PointerEvent) => {
      // El segundo dedo de un pellizco NO es un `pointerdown` del editor: si lo
      // fuera, encuadrar limpiaría la selección o arrancaría otro arrastre.
      if (touchGestures.pointerDown(e)) return;
      downX = e.clientX;
      downY = e.clientY;
      if (walkRef.current) {
        walkLook = true;
        lookX = e.clientX;
        lookY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }
      if (drawingReadOnlyRef.current && toolRef.current !== "select") return;
      if (toolRef.current !== "select") return; // measure/wall resolve on click (pointerup); drag still orbits
      if (nativeGripController.handlePointerDown(e)) return;
      if (e.button === 0 && hatchPickModeRef.current) {
        const world = floorWorld(e);
        if (world) hatchPickCallbackRef.current({ x: world.wx, y: world.wy });
        return;
      }
      const selectionMode = selectionGeometryModeRef.current;
      if (
        e.button === 0 &&
        (selectionMode === "window" || selectionMode === "crossing")
      ) {
        const world = floorWorld(e);
        if (world) {
          marquee = { x0: world.wx, y0: world.wy, x1: world.wx, y1: world.wy };
          controls.enabled = false;
          renderer.domElement.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (
        e.button === 0 &&
        (selectionMode === "polygon" ||
          selectionMode === "fence" ||
          selectionMode === "lasso")
      ) {
        const world = floorWorld(e);
        if (world) {
          selectionPath = [{ x: world.wx, y: world.wy }];
          controls.enabled = false;
          renderer.domElement.setPointerCapture(e.pointerId);
        }
        return;
      }
      setPtr(e);
      raycaster.setFromCamera(ptr, activeCamera());
      // clicking a dimension label removes that cota
      const dimHit = raycaster
        .intersectObjects(dimsGroup.children, false)
        .find((h) => (h.object as THREE.Sprite).userData?.dimId);
      if (dimHit && !drawingReadOnlyRef.current) {
        const id = (dimHit.object as THREE.Sprite).userData.dimId as string;
        pushHistory();
        annotationsRef.current.delete(id);
        setDimCount(
          [...annotationsRef.current.values()].filter((x) => x.type === "dim")
            .length,
        );
        markDirty();
        rebuildDims();
        toast.success("Cota eliminada.", "3D");
        return;
      }
      // clicking a text note removes it
      const noteHit = raycaster
        .intersectObjects(notesGroup.children, false)
        .find((h) => (h.object as THREE.Sprite).userData?.noteId);
      if (noteHit && !drawingReadOnlyRef.current) {
        const id = (noteHit.object as THREE.Sprite).userData.noteId as string;
        pushHistory();
        annotationsRef.current.delete(id);
        markDirty();
        rebuildNotes();
        toast.success("Nota eliminada.", "3D");
        return;
      }
      const stationHits = raycaster
        .intersectObjects(blocks.children, false)
        .filter((h) => (h.object as THREE.Mesh).userData?.stationId)
        .map((h) => ({
          d: h.distance,
          type: "station" as const,
          id: (h.object as THREE.Mesh).userData.stationId as string,
          obj: h.object,
        }));
      const assetHits = raycaster
        .intersectObjects(assetsGroup.children, true)
        .map((h) => ({ d: h.distance, id: resolveAssetId(h.object) }))
        .filter((h) => h.id)
        .map((h) => ({
          d: h.d,
          type: "asset" as const,
          id: h.id as string,
          obj: groupByAssetRef.current.get(h.id as string)!,
        }));
      const nativeHits = raycaster
        .intersectObjects(
          nativeGroup.children.filter(
            (child) => child.userData.nativeOverview !== true,
          ),
          true,
        )
        .map((h) => ({
          d: h.distance,
          id: resolveNativeEntityId(h.object),
          gripId: h.object.userData?.nativeGripId as string | undefined,
        }))
        .filter((h) => h.id)
        .map((h) => ({
          d: h.d,
          type: "native" as const,
          id: h.id as string,
          obj: h,
          gripId: h.gripId,
        }));
      if (!stationHits.length && !assetHits.length && !nativeHits.length) {
        const world = floorWorld(e);
        const canonicalHit =
          world && ctxRef.current
            ? hitCanonical({ x: world.wx, y: world.wy }, 1)[0]
            : undefined;
        if (canonicalHit)
          nativeHits.push({
            d: 0,
            type: "native",
            id: canonicalHit.id,
            obj: { d: 0, id: canonicalHit.id, gripId: undefined },
            gripId: undefined,
          });
      }
      const all = [...stationHits, ...assetHits, ...nativeHits].sort(
        (a, b) => a.d - b.d,
      );
      if (all.length) {
        const top = all[0];
        if (top.type === "native") {
          if (top.gripId && nativeGripController.start(top.id, top.gripId, e))
            return;
          const world = floorWorld(e);
          const canonicalCandidates =
            world && ctxRef.current
              ? hitCanonical({ x: world.wx, y: world.wy }, 16).map(
                  (entity) => `native:${entity.id}`,
                )
              : [];
          const operation =
            e.ctrlKey || e.metaKey
              ? "remove"
              : e.shiftKey
                ? "toggle"
                : selectionOperationRef.current;
          applyProfessionalSelection(
            canonicalCandidates.length > 1
              ? { type: "cycle", candidates: canonicalCandidates, operation }
              : { type: "apply", keys: [`native:${top.id}`], operation },
          );
          rebuildAll();
          return;
        }
        const item: SelItem = { type: top.type, id: top.id };
        // Grupos (ADR §223): clic selecciona el grupo completo; Alt+clic entra
        // al objeto individual sin disolver nada.
        const groupItems = e.altKey ? [item] : expandGroupMembers(item);
        const operation =
          e.ctrlKey || e.metaKey
            ? "remove"
            : e.shiftKey
              ? "toggle"
              : selectionOperationRef.current;
        // Membership operations never start a move; they only mutate the set.
        if (operation !== "replace") {
          applyProfessionalSelection({
            type: "apply",
            keys: groupItems.map(
              (candidate) => `${candidate.type}:${candidate.id}`,
            ),
            operation,
          });
          rebuildAll();
          return;
        }
        const inSel = selRef.current.some((s) => sameSel(s, item));
        const items =
          inSel && selRef.current.length > 1 ? [...selRef.current] : groupItems;
        if (!inSel)
          applyProfessionalSelection({
            type: "apply",
            keys: groupItems.map(
              (candidate) => `${candidate.type}:${candidate.id}`,
            ),
          });
        if (drawingReadOnlyRef.current) {
          rebuildAll();
          return;
        }
        if (
          isObjectLayerLocked(
            cadLayersRef.current,
            layerAssignmentsRef.current,
            item.id,
            item.type === "station" ? "layout" : defaultLayerForAsset(item.id),
          )
        ) {
          toast.error(
            "El objeto está en una capa bloqueada. Desbloquea la capa para moverlo.",
            "Capas",
          );
          rebuildAll();
          return;
        }
        const unlockedItems = items.filter(
          (it) =>
            !isObjectLayerLocked(
              cadLayersRef.current,
              layerAssignmentsRef.current,
              it.id,
              it.type === "station" ? "layout" : defaultLayerForAsset(it.id),
            ),
        );
        if (unlockedItems.length !== items.length)
          toast.error(
            "Algunos objetos no se moverán porque su capa está bloqueada.",
            "Capas",
          );
        raycaster.ray.intersectPlane(floorPlane, hit);
        const start = new Map<string, { x: number; y: number }>();
        unlockedItems.forEach((it) => {
          const p = getPlace(it);
          if (p) start.set(`${it.type}:${it.id}`, { x: p.x, y: p.y });
        });
        // Collect alignment candidates from every OTHER object + the footprint.
        const ctxD = ctxRef.current!;
        const excl = new Set(unlockedItems.map((it) => `${it.type}:${it.id}`));
        const xEdges: number[] = [0, ctxD.W / 2, ctxD.W];
        const yEdges: number[] = [0, ctxD.H / 2, ctxD.H];
        placementsRef.current.forEach((p, id) => {
          if (excl.has(`station:${id}`)) return;
          xEdges.push(p.x, p.x + p.w / 2, p.x + p.w);
          yEdges.push(p.y, p.y + p.h / 2, p.y + p.h);
        });
        assetsRef.current.forEach((a) => {
          if (excl.has(`asset:${a.id}`)) return;
          xEdges.push(a.x, a.x + a.w / 2, a.x + a.w);
          yEdges.push(a.y, a.y + a.h / 2, a.y + a.h);
        });
        drag = {
          lead: item,
          items: unlockedItems,
          grabDX: top.obj.position.x - hit.x,
          grabDZ: top.obj.position.z - hit.z,
          start,
          xEdges,
          yEdges,
        };
        dragMoved = false;
        dragSnap = snapshot();
        controls.enabled = false;
        rebuildAll();
        renderer.domElement.setPointerCapture(e.pointerId);
      } else if (e.button === 0 && e.shiftKey) {
        // Shift+arrastre en el fondo = marquee (ADR §220). Shift+clic simple
        // sobre el fondo no hace nada (se resuelve en onUp por distancia).
        const w = floorWorld(e);
        if (w) {
          marquee = { x0: w.wx, y0: w.wy, x1: w.wx, y1: w.wy };
          controls.enabled = false;
          renderer.domElement.setPointerCapture(e.pointerId);
        }
      } else if (e.button === 0 && !e.shiftKey) {
        if (selectionOperationRef.current === "replace") {
          applyProfessionalSelection({ type: "clear" });
          rebuildAll();
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      // Sólo el contacto PRINCIPAL mueve el cursor vivo. Sin esto, durante un
      // pellizco el cursor saltaba entre las dos manos.
      if (touchGestures.pointerMove(e)) return;
      const overlay = crosshairOverlayRef.current;
      if (overlay) {
        const rect = renderer.domElement.getBoundingClientRect();
        overlay.style.display = "block";
        overlay.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
      }
      const cursorWorld = floorWorld(e);
      if (cursorCoordinateRef.current) {
        cursorCoordinateRef.current.dataset.x = cursorWorld
          ? String(cursorWorld.wx)
          : "";
        cursorCoordinateRef.current.dataset.y = cursorWorld
          ? String(cursorWorld.wy)
          : "";
        cursorCoordinateRef.current.textContent = cursorWorld
          ? `X ${cursorWorld.wx.toFixed(2)} · Y ${cursorWorld.wy.toFixed(2)}`
          : "X — · Y —";
      }
      // REGLA DURA: con un comando del motor abierto, el movimiento es suyo.
      // La máquina heredada no ve nada — no hay dos máquinas escuchando.
      if (enginePointerRouter.move(e)) return;
      if (walkRef.current) {
        if (!walkLook) return;
        walkYawRef.current -= (e.clientX - lookX) * 0.005;
        walkPitchRef.current = Math.max(
          -1.3,
          Math.min(1.3, walkPitchRef.current - (e.clientY - lookY) * 0.005),
        );
        lookX = e.clientX;
        lookY = e.clientY;
        return;
      }
      if (marquee) {
        const w = floorWorld(e);
        if (w) {
          marquee.x1 = w.wx;
          marquee.y1 = w.wy;
          drawMarquee(marquee);
        }
        return;
      }
      if (selectionPath) {
        const world = floorWorld(e);
        const previous = selectionPath.at(-1);
        if (
          world &&
          previous &&
          Math.hypot(world.wx - previous.x, world.wy - previous.y) >= 2
        ) {
          selectionPath.push({ x: world.wx, y: world.wy });
          drawSelectionPath(selectionPath);
        }
        return;
      }
      if (nativeGripController.handlePointerMove(e)) return;
      if (
        toolRef.current === "measure" ||
        toolRef.current === "wall" ||
        isCadDrawTool(toolRef.current)
      ) {
        const w = floorWorld(e);
        if (!w) {
          showSnapMarker(null);
          return;
        }
        const s = snapFloor(w.wx, w.wy); // snap the live endpoint to the underlay
        showSnapMarker(s.onDxf || s.tracking ? s.wx : null, s.wy);
        const a =
          toolRef.current === "measure"
            ? measureARef.current
            : toolRef.current === "wall"
              ? wallChainRef.current
              : drawCommandRef.current?.points.at(-1)
                ? {
                    wx: drawCommandRef.current.points.at(-1)!.x,
                    wy: drawCommandRef.current.points.at(-1)!.y,
                  }
                : null;
        if (!a) return; // marker shown for the first point; wait for the anchor to draw a segment
        const ctx = ctxRef.current!;
        const ax = (a.wx - ctx.W / 2) * ctx.s,
          az = (a.wy - ctx.H / 2) * ctx.s;
        const ex = (s.wx - ctx.W / 2) * ctx.s,
          ez = (s.wy - ctx.H / 2) * ctx.s;
        const pl = previewLineRef.current;
        if (pl) {
          (pl.geometry as THREE.BufferGeometry).setFromPoints([
            new THREE.Vector3(ax, 0.06, az),
            new THREE.Vector3(ex, 0.06, ez),
          ]);
          pl.visible = true;
        }
        const dist = Math.hypot(s.wx - a.wx, s.wy - a.wy);
        const tag = s.onDxf
          ? ` · ${s.snapType ? CAD_OSNAP_HUD_LABELS[s.snapType] : "plano"}`
          : "";
        if (toolRef.current === "wall" || isCadDrawTool(toolRef.current)) {
          const deg =
            ((((Math.atan2(s.wy - a.wy, s.wx - a.wx) * 180) / Math.PI) % 360) +
              360) %
            360;
          setMeasureLive(`${fmtDist(dist, unit)} · ${Math.round(deg)}°${tag}`);
        } else setMeasureLive(`${fmtDist(dist, unit)}${tag}`);
        return;
      }
      if (!drag) return;
      setPtr(e);
      raycaster.setFromCamera(ptr, activeCamera());
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return;
      const ctx = ctxRef.current!;
      const leadP = getPlace(drag.lead);
      const startLead = drag.start.get(`${drag.lead.type}:${drag.lead.id}`);
      if (!leadP || !startLead) return;
      const worldCX = (hit.x + drag.grabDX) / ctx.s + ctx.W / 2;
      const worldCY = (hit.z + drag.grabDZ) / ctx.s + ctx.H / 2;
      // group delta from the lead's snapped position, clamped so all stay in bounds
      let targetX = snapWorld(worldCX - leadP.w / 2);
      let targetY = snapWorld(worldCY - leadP.h / 2);
      // Object snap: align the lead's edges/centre to other objects + the footprint.
      let gvx: number | null = null,
        ghy: number | null = null;
      if (draftSettingsHost.osnap && drag.xEdges) {
        const tol = Math.max(ctx.W, ctx.H) * 0.012;
        const sx = snap1D(targetX, leadP.w, drag.xEdges, tol);
        if (sx) {
          targetX += sx.off;
          gvx = sx.axis;
        }
        const sy = snap1D(targetY, leadP.h, drag.yEdges, tol);
        if (sy) {
          targetY += sy.off;
          ghy = sy.axis;
        }
      }
      setGuides(gvx, ghy);
      let dx = targetX - startLead.x;
      let dy = targetY - startLead.y;
      let dxLo = -Infinity,
        dxHi = Infinity,
        dyLo = -Infinity,
        dyHi = Infinity;
      drag.items.forEach((it) => {
        const sp = drag!.start.get(`${it.type}:${it.id}`);
        const pp = getPlace(it);
        if (!sp || !pp) return;
        dxLo = Math.max(dxLo, -sp.x);
        dxHi = Math.min(dxHi, ctx.W - pp.w - sp.x);
        dyLo = Math.max(dyLo, -sp.y);
        dyHi = Math.min(dyHi, ctx.H - pp.h - sp.y);
      });
      dx = Math.min(Math.max(dx, dxLo), dxHi);
      dy = Math.min(Math.max(dy, dyLo), dyHi);
      if (dx !== 0 || dy !== 0) dragMoved = true;
      drag.items.forEach((it) => {
        const sp = drag!.start.get(`${it.type}:${it.id}`);
        const pp = getPlace(it);
        if (!sp || !pp) return;
        pp.x = sp.x + dx;
        pp.y = sp.y + dy;
        repositionItem(it);
      });
    };
    const onUp = (e: PointerEvent) => {
      const touchRelease = touchGestures.pointerUp(e);
      if (walkRef.current) {
        walkLook = false;
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (selectionPath) {
        const points = selectionPath;
        selectionPath = null;
        marqueeLine.visible = false;
        controls.enabled = true;
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const mode = selectionGeometryModeRef.current;
        const pathMode =
          mode === "polygon" || mode === "fence" || mode === "lasso"
            ? mode
            : "lasso";
        const minimum = pathMode === "fence" ? 2 : 3;
        if (points.length < minimum) return;
        const legacyKeys: string[] = [];
        placementsRef.current.forEach((placement, id) => {
          if (
            cadSelectionPathMatchesPolygon(
              points,
              rectGeometry(placement).corners,
              pathMode,
              pathMode !== "polygon",
            )
          )
            legacyKeys.push(`station:${id}`);
        });
        assetsRef.current.forEach((asset, id) => {
          if (
            cadSelectionPathMatchesPolygon(
              points,
              rectGeometry(asset).corners,
              pathMode,
              pathMode !== "polygon",
            )
          )
            legacyKeys.push(`asset:${id}`);
        });
        const nativeKeys = (
          nativeSelectionIndexRef.current?.path(
            points,
            pathMode,
            pathMode !== "polygon",
            300,
          ) ?? []
        ).map((entity) => `native:${entity.id}`);
        applyProfessionalSelection({
          type: "apply",
          keys: [...legacyKeys, ...nativeKeys],
          operation: selectionOperationRef.current,
        });
        toast.success(
          `${legacyKeys.length + nativeKeys.length} objeto(s) por ${pathMode}.`,
          "Selección",
        );
        return;
      }
      if (nativeGripController.handlePointerUp(e)) return;
      if (marquee) {
        const m = marquee;
        marquee = null;
        marqueeLine.visible = false;
        controls.enabled = true;
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const minX = Math.min(m.x0, m.x1),
          maxX = Math.max(m.x0, m.x1);
        const minY = Math.min(m.y0, m.y1),
          maxY = Math.max(m.y0, m.y1);
        if (maxX - minX < 5 && maxY - minY < 5) return; // fue un shift+clic, no un arrastre
        const explicitMode = selectionGeometryModeRef.current;
        const crossing =
          explicitMode === "crossing" ||
          (explicitMode === "pick" && m.x1 < m.x0); // der→izq = cruce (semántica AutoCAD)
        const inWindow = (box: {
          x: number;
          y: number;
          w: number;
          h: number;
          rotation?: number;
        }) => {
          const g = rectGeometry(box);
          const contained = g.corners.every(
            (c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY,
          );
          if (contained || !crossing) return contained;
          const xs = g.corners.map((c) => c.x);
          const ys = g.corners.map((c) => c.y);
          return (
            Math.min(...xs) <= maxX &&
            Math.max(...xs) >= minX &&
            Math.min(...ys) <= maxY &&
            Math.max(...ys) >= minY
          );
        };
        const found: SelItem[] = [];
        placementsRef.current.forEach((p, id) => {
          if (inWindow(p)) found.push({ type: "station", id });
        });
        assetsRef.current.forEach((a) => {
          if (inWindow(a)) found.push({ type: "asset", id: a.id });
        });
        const nativeWindow = { minX, minY, maxX, maxY };
        const nativeFound = (
          nativeSelectionIndexRef.current?.intersecting(
            nativeWindow,
            crossing,
            300,
          ) ?? []
        ).map((entity) => entity.id);
        applyProfessionalSelection({
          type: "apply",
          keys: [
            ...found.map((item) => `${item.type}:${item.id}`),
            ...nativeFound.map((id) => `native:${id}`),
          ],
          operation:
            explicitMode === "pick" ? "add" : selectionOperationRef.current,
        });
        rebuildAll();
        if (found.length + nativeFound.length)
          toast.success(
            `${found.length + nativeFound.length} objeto(s) seleccionados por ${crossing ? "cruce" : "ventana"}.`,
            "Selección",
          );
        return;
      }
      // Con RATÓN, clic es «no se movió»: 5 px, tolerancia de aparato apoyado.
      // Con DEDO manda el reconocedor táctil, porque deslizar es APUNTAR —sin
      // hover no hay otra forma de ver dónde va a caer el punto— y esos 5 px
      // anulaban justo el punto que el gesto acababa de señalar.
      const isClick = touchRelease
        ? touchRelease.commits
        : Math.hypot(e.clientX - downX, e.clientY - downY) < 5;
      // Sólo el CLIC: arrastrar sigue orbitando la cámara aunque haya un
      // comando abierto, que es como se encuadra mientras se dibuja.
      if (isClick && enginePointerRouter.click(e)) {
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (drawingReadOnlyRef.current) {
        drag = null;
        dragSnap = null;
        controls.enabled = true;
        return;
      }
      if (toolRef.current === "measure") {
        if (isClick) {
          const w = floorWorld(e);
          if (w) {
            const sp = snapFloor(w.wx, w.wy, true);
            const pt = { wx: sp.wx, wy: sp.wy };
            if (!measureARef.current) {
              measureARef.current = pt;
              setMeasureLive(fmtDist(0, unit));
            } else {
              const a = measureARef.current;
              if (Math.hypot(pt.wx - a.wx, pt.wy - a.wy) > 1) {
                pushHistory();
                const id = newId("dim");
                annotationsRef.current.set(id, {
                  id,
                  type: "dim",
                  x: a.wx,
                  y: a.wy,
                  x2: pt.wx,
                  y2: pt.wy,
                });
                setDimCount(
                  [...annotationsRef.current.values()].filter(
                    (x) => x.type === "dim",
                  ).length,
                );
                markDirty();
                rebuildDims();
              }
              measureARef.current = null;
              setMeasureLive(null);
              if (previewLineRef.current)
                previewLineRef.current.visible = false;
            }
          }
        }
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (isCadDrawTool(toolRef.current)) {
        if (isClick) {
          const w = floorWorld(e);
          if (w) {
            const sp = snapFloor(w.wx, w.wy, true);
            let pt = { wx: sp.wx, wy: sp.wy };
            const prev = drawCommandRef.current?.points.at(-1);
            if (prev && (e.shiftKey || draftSettingsHost.ortho) && !sp.onDxf) {
              const c = constrainPoint(
                { x: prev.x, y: prev.y },
                { x: pt.wx, y: pt.wy },
                e.shiftKey ? { polarIncrementDeg: 45 } : { ortho: true },
              );
              pt = { wx: Math.round(c.point.x), wy: Math.round(c.point.y) };
            }
            if (!drawCommandRef.current) {
              const cmd = startCommand(toolRef.current);
              drawCommandRef.current = cmd;
              setDrawPrompt(cmd.prompt);
            }
            feedDraftPoint(pt.wx, pt.wy);
          }
        }
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (toolRef.current === "wall") {
        if (isClick) {
          const w = floorWorld(e);
          if (w) {
            const sp = snapFloor(w.wx, w.wy, true);
            let pt = { wx: sp.wx, wy: sp.wy };
            const prev = wallChainRef.current;
            // Shift = incrementos de 45°; ORTO (toggle) = ejes 0/90/180/270 — pero
            // un snap explícito a objeto/plano gana sobre el bloqueo de ángulo.
            if (prev && (e.shiftKey || draftSettingsHost.ortho) && !sp.onDxf) {
              const c = constrainPoint(
                { x: prev.wx, y: prev.wy },
                { x: pt.wx, y: pt.wy },
                e.shiftKey ? { polarIncrementDeg: 45 } : { ortho: true },
              );
              pt = { wx: Math.round(c.point.x), wy: Math.round(c.point.y) };
            }
            if (prev && Math.hypot(pt.wx - prev.wx, pt.wy - prev.wy) > 1) {
              const thick = assetMeta("wall").h;
              const len = Math.hypot(pt.wx - prev.wx, pt.wy - prev.wy);
              const cx = (prev.wx + pt.wx) / 2,
                cy = (prev.wy + pt.wy) / 2;
              const angle =
                (Math.atan2(pt.wy - prev.wy, pt.wx - prev.wx) * 180) / Math.PI;
              pushHistory();
              const id = newId("as");
              assetsRef.current.set(id, {
                id,
                kind: "wall",
                x: cx - len / 2,
                y: cy - thick / 2,
                w: len,
                h: thick,
                rotation: angle,
              });
              setAssetIds((s) => new Set(s).add(id));
              setLayerAssignments((cur) =>
                assignObjectsToLayer(cur, [id], "architecture"),
              );
              setObjectTags((cur) => ({ ...cur, [id]: "wall, architecture" }));
              lastWallAngleRef.current = angle;
              markDirty();
              rebuildAssets();
            }
            wallChainRef.current = pt;
            setMeasureLive(fmtDist(0, unit));
          }
        }
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (drag) {
        if (dragMoved && dragSnap) {
          recordHistoryDocument(snapshotDocument(dragSnap));
          const changedIds = selRef.current.map((item) => item.id);
          const currentDocument = snapshotDocument();
          if (currentDocument.constraints.length) {
            const solved = solveCadConstraints(currentDocument, changedIds);
            if (solved.converged) {
              loadedCadDocumentRef.current = solved.document;
              restore(cadDocumentToEditorSnapshot(solved.document));
              markDirty();
            } else {
              const beforeDrag = snapshotDocument(dragSnap);
              loadedCadDocumentRef.current = beforeDrag;
              restore(cadDocumentToEditorSnapshot(beforeDrag));
              cancelHistoryCheckpoint();
              toast.error(
                solved.issues[0]?.message ||
                  "El movimiento contradice una restricción y fue revertido.",
                "Restricciones",
              );
            }
          } else {
            markDirty();
          }
        }
        drag = null;
        dragSnap = null;
        controls.enabled = true;
        setGuides(null, null);
        refreshSnap();
        rebuildAll();
      }
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onPointerLeave = () => {
      if (crosshairOverlayRef.current)
        crosshairOverlayRef.current.style.display = "none";
      // El puntero se fue del lienzo: no hay cursor que ofrecer al motor, y
      // decirlo es mejor que dejar el último punto conocido colgando.
      engineCursorPointRef.current = null;
      engineLiveCursor.setSnap(null);
    };
    const onPointerCancel = (e: PointerEvent) => touchGestures.pointerCancel(e);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("pointerup", onUp);

    // WASD movement while walking
    const onWalkKey = (down: boolean) => (e: KeyboardEvent) => {
      if (!walkRef.current) return;
      const k = walkKeysRef.current;
      const key = e.key.toLowerCase();
      if (key === "w") k.f = down;
      else if (key === "s") k.b = down;
      else if (key === "a") k.l = down;
      else if (key === "d") k.r = down;
      else return;
      e.preventDefault();
    };
    const walkKd = onWalkKey(true),
      walkKu = onWalkKey(false);
    window.addEventListener("keydown", walkKd);
    window.addEventListener("keyup", walkKu);

    const onResize = () => {
      const w = mount.clientWidth || width;
      const hh = mount.clientHeight || height;
      renderer.setSize(w, hh);
      camera.aspect = w / hh;
      camera.updateProjectionMatrix();
      // Redimensionar muestra más o menos dibujo; NO cambia el zoom.
      viewController.setViewportSize(w, hh);
      queueNativeViewportSync();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const animate = () => {
      if (disposed) return;
      if (walkRef.current) {
        const yaw = walkYawRef.current,
          pitch = walkPitchRef.current,
          k = walkKeysRef.current;
        const sp = Math.max(W, H) * s * 0.006;
        const fx = Math.sin(yaw),
          fz = -Math.cos(yaw); // forward (flat); rx,rz = right
        const rx = -fz,
          rz = fx;
        if (k.f) {
          camera.position.x += fx * sp;
          camera.position.z += fz * sp;
        }
        if (k.b) {
          camera.position.x -= fx * sp;
          camera.position.z -= fz * sp;
        }
        if (k.l) {
          camera.position.x -= rx * sp;
          camera.position.z -= rz * sp;
        }
        if (k.r) {
          camera.position.x += rx * sp;
          camera.position.z += rz * sp;
        }
        const lim = Math.max(W, H) * s * 0.62;
        camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
        camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));
        camera.position.y = eyeY;
        camera.lookAt(
          camera.position.x + Math.sin(yaw) * Math.cos(pitch),
          camera.position.y + Math.sin(pitch),
          camera.position.z - Math.cos(yaw) * Math.cos(pitch),
        );
        if (k.f || k.b || k.l || k.r) queueNativeViewportSync();
      } else {
        controls.update();
      }
      // Un cuadro del pipeline por lotes: fija la vista, gasta su presupuesto
      // de teselado y reconcilia mallas SÓLO si hubo algo que reconciliar.
      // Va antes de `render` para que lo materializado en este cuadro se vea en
      // este cuadro y no en el siguiente.
      const batchedHost = renderPipelineHostRef.current;
      if (batchedHost) {
        // Recalcular la huella visible en CADA cuadro costaría cinco rayos por
        // cuadro en 3D. Sólo se recalcula cuando la vista cambió de verdad; el
        // resto de cuadros reusan la última y siguen gastando su presupuesto de
        // teselado, que es el trabajo que realmente hay que repartir.
        if (batchedViewDirty) {
          batchedViewBounds = viewController.viewportBounds() ?? batchedViewBounds;
          batchedViewDirty = false;
        }
        if (batchedViewBounds)
          batchedHost.frame({
            bounds: batchedViewBounds,
            pixelsPerUnit: viewController.view.pixelsPerUnit,
          });
      }
      renderer.render(scene, activeCamera());
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (viewportSyncTimer) clearTimeout(viewportSyncTimer);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      touchGestures.dispose();
      enginePointerRouterRef.current = null;
      enginePreviewRef.current = null;
      engineLiveCursorRef.current = null;
      engineCursorPointRef.current = null;
      enginePreview.dispose();
      engineLiveCursor.dispose();
      nativeGripControllerRef.current = null;
      nativeGripController.dispose();
      gripMenu.dispose();
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", walkKd);
      window.removeEventListener("keyup", walkKu);
      controls.removeEventListener("change", queueNativeViewportSync);
      controls.dispose();
      disposeObject(scene);
      nativeSceneSyncRef.current?.clear({ remove: () => {} });
      unsubscribeBatchedView();
      // El pipeline retiene geometría en la GPU y una caché de teselado: sin
      // esto, cerrar el editor deja el dibujo entero en memoria.
      renderPipelineSlotRef.current?.set(null);
      renderPipelineHostRef.current?.dispose();
      renderPipelineHostRef.current = null;
      solidShadeHostRef.current?.dispose();
      solidShadeHostRef.current = null;
      nativeSelectionProjectionRef.current = null;
      nativeInsertBatchRef.current = null;
      nativeOverviewRef.current = null;
      nativeOverviewDocumentRef.current = null;
      nativeViewportBoundsRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      viewControllerRef.current = null;
      blocksRef.current = null;
      assetsGroupRef.current = null;
      nativeGroupRef.current = null;
      controlsRef.current = null;
      dimsGroupRef.current = null;
      previewLineRef.current = null;
      snapMarkerRef.current = null;
      connsGroupRef.current = null;
      gridGroupRef.current = null;
      groundRef.current = null;
      gridHelperRef.current = null;
      dirLightRef.current = null;
      notesGroupRef.current = null;
      dxfGroupRef.current = null;
      heatGroupRef.current = null;
      heatLoadedRef.current = false;
      gapsGroupRef.current = null;
      gapsLoadedRef.current = false;
      guidesGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  // selection highlight refresh
  useEffect(() => {
    if (open && data) rebuildAll();
  }, [selList, open, data, rebuildAll]);

  // cancels any half-drawn cota or wall chain (called when leaving a draw tool)
  const endDraw = useCallback(() => {
    measureARef.current = null;
    wallChainRef.current = null;
    drawCommandRef.current = null;
    setMeasureLive(null);
    setDrawPrompt(null);
    setCanCloseDraftPolyline(false);
    lastWallAngleRef.current = null;
    if (previewLineRef.current) previewLineRef.current.visible = false;
    if (snapMarkerRef.current) snapMarkerRef.current.visible = false;
    // Salir de una herramienta cancela también el comando del motor: dejarlo
    // abierto haría que el siguiente clic en otra herramienta designara un
    // punto del comando anterior.
    enginePointerRouterRef.current?.cancel();
    enginePointerRouterRef.current?.end();
  }, []);
  const setToolMode = useCallback(
    (next: EditorTool) => {
      // La herramienta se resuelve FUERA del actualizador de estado. Arrancar
      // el comando dentro de él metía un efecto secundario en una función que
      // React puede volver a ejecutar, y el motor despachaba —y publicaba su
      // instantánea— en mitad de un render.
      const t =
        toolRef.current === next && next !== "select" ? "select" : next;
      toolRef.current = t;
      endDraw();
      // Modification commands need the picked source to survive tool entry.
      if (t !== "select" && t !== "move" && t !== "copy" && t !== "offset") {
        select([]);
        clearNativeSelection();
      }
      setTool(t);
      if (!isCadDrawTool(t)) return;
      // El botón de la barra invoca el comando del MOTOR, con su prompt, sus
      // palabras clave y su banda elástica. La máquina heredada sólo arranca si
      // el motor no conoce la herramienta —hoy no ocurre para ninguna de las
      // siete—, y entonces se dice en voz alta en vez de caer al camino viejo
      // por omisión.
      const engineCommand = cadEngineCommandForTool(t);
      if (
        engineCommand !== null &&
        enginePointerRouterRef.current?.invoke(engineCommand) === true
      )
        return;
      const cmd = startCommand(t);
      drawCommandRef.current = cmd;
      setDrawPrompt(cmd.prompt);
      setMeasureLive(cmd.prompt);
    },
    [clearNativeSelection, endDraw, select],
  );
  const toggleMeasure = useCallback(
    () => setToolMode("measure"),
    [setToolMode],
  );
  const toggleWall = useCallback(() => setToolMode("wall"), [setToolMode]);
  const startCadDrawTool = useCallback(
    (id: CadDrawCommandId) => setToolMode(id),
    [setToolMode],
  );
  /**
   * PRIORIDAD 2 — las herramientas neutras escriben el documento CANÓNICO.
   *
   * LINE creaba un muro, POLYLINE varios muros desconectados, RECT una zona y
   * CIRCLE una zona con `shape: 'circle'`: el documento describía mobiliario
   * industrial en vez de geometría, y propiedades, grips, OSNAP, DXF y el
   * round-trip operaban sobre una proyección heredada.
   *
   * La conversión vive en `draw-action-entities.ts` (pura y probada aparte);
   * aquí sólo queda el contexto que el kernel no puede conocer: permisos, capa
   * activa e inserción en UNA transacción canónica — que además deja la entidad
   * seleccionada y produce una sola entrada de undo.
   *
   * WALL y ZONE/ROOM NO pasan por aquí: siguen siendo comandos arquitectónicos
   * explícitos con su propia semántica.
   */
  const createCanonicalDrawEntity = (action: CanonicalDrawAction): boolean => {
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return false;
    }
    // La capa se lee del REF, no del estado: el efecto de la escena capturó
    // esta función al montarse y el estado que ve es el de ese momento.
    const layerId = activeCadLayerRef.current;
    if (cadLayersRef.current.find((layer) => layer.id === layerId)?.locked) {
      toast.error(
        `Layer ${layerId} is locked. Unlock it before drawing on it.`,
        "Capa bloqueada",
      );
      return false;
    }
    const result = canonicalEntityFromDrawAction(action, {
      layer: layerId,
      newId: () => newId("ent"),
    });
    if (!result.ok) {
      toast.error(DRAW_ACTION_REJECTION_MESSAGE[result.reason], "Dibujo");
      return false;
    }
    return insertNativeEntities(
      [result.entity as CadNativeEntity],
      DRAW_ACTION_HISTORY_LABEL[action.type],
    );
  };
  /**
   * MOVE/COPY del flujo de comandos NORMAL sobre la selección CANÓNICA.
   *
   * `moveBy`/`copyBy` sólo recorrían `selRef` —la selección HEREDADA de
   * assets/estaciones—, mientras la selección canónica vive en
   * `nativeSelectionIdsRef`. Con una línea o una polilínea seleccionada, el
   * comando MOVE del editor no hacía absolutamente nada: ni error, ni
   * historial, ni movimiento. Los botones del panel nativo sí funcionaban, pero
   * un botón aparte no sustituye al comando.
   *
   * Se enruta a la misma mutación canónica que ya usa el panel, así que hereda
   * capa bloqueada, atomicidad del lote, orden de dibujo, una sola entrada de
   * historial y undo/redo.
   */
  const moveOrCopyCanonicalSelection = (
    action: Extract<DrawAction, { type: "moveBy" | "copyBy" }>,
  ): boolean => {
    const ids = nativeSelectionIdsRef.current;
    if (!ids.length) return false;
    if (!Number.isFinite(action.dx) || !Number.isFinite(action.dy)) {
      toast.error("El desplazamiento indicado no es válido.", "Dibujo");
      return false;
    }
    if (action.type === "copyBy") {
      const created = ids.map(() => newId("ent"));
      return commitNativeCommands(
        ids.map((entityId, index) => ({
          type: "copy" as const,
          entityId,
          newEntityId: created[index],
          offset: { x: action.dx, y: action.dy },
        })),
        created,
      );
    }
    return commitNativeCommands(
      ids.map((entityId) => ({
        type: "transform" as const,
        entityId,
        transform: { translation: { x: action.dx, y: action.dy } },
      })),
      ids,
    );
  };
  /**
   * OFFSET canónico de la selección — ATÓMICO.
   *
   * Antes se filtraba lo que no salía (`.filter(Boolean)`): con una selección
   * mixta el usuario veía desfasarse una parte y desaparecer el resto sin
   * ninguna explicación, y una polilínea con arcos perdía los arcos en
   * silencio. Ahora, si un solo miembro no puede procesarse, no se modifica
   * NINGUNO y se dice exactamente por qué.
   */
  const offsetCanonicalSelection = (distance: number): boolean => {
    const ids = nativeSelectionIdsRef.current;
    if (!ids.length) return false;
    const document = snapshotDocument();
    const selected = new Set(ids);
    const sources = document.entities.filter((entity) =>
      selected.has(entity.id),
    );
    const offsets: CadNativeEntity[] = [];
    for (const source of sources) {
      const locked = document.layers.find(
        (layer) => layer.id === source.layer,
      )?.locked;
      if (locked) {
        toast.error(
          `Layer ${source.layer} is locked. Unlock it before offsetting ${source.id}.`,
          "OFFSET",
        );
        return false;
      }
      const result = offsetCanonicalEntity(source, distance, () =>
        newId("ent"),
      );
      if (!result.ok) {
        toast.error(
          `${source.id}: ${OFFSET_REJECTION_MESSAGE[result.reason]}`,
          "OFFSET",
        );
        return false;
      }
      offsets.push(result.entity as CadNativeEntity);
    }
    if (!offsets.length) return false;
    return insertNativeEntities(offsets, "offset");
  };
  /**
   * Una selección que mezcla geometría CANÓNICA con objetos HEREDADOS no tiene
   * una sola mutación que la cubra: cada mundo tiene su propia transacción. Si
   * se procesara la parte canónica y se ignorara el resto, el usuario vería
   * moverse la mitad del dibujo sin ninguna explicación. Se rechaza entera.
   */
  const mixedSelectionRefused = (operation: string): boolean => {
    if (!nativeSelectionIdsRef.current.length || !selRef.current.length)
      return false;
    toast.error(
      `${operation} no puede aplicarse a la vez sobre geometría y objetos de layout. Selecciona sólo uno de los dos.`,
      operation,
    );
    return true;
  };
  const applyDrawAction = (action: DrawAction) => {
    if (
      action.type === "addSegment" ||
      action.type === "addPolyline" ||
      action.type === "addRect" ||
      action.type === "addCircle"
    )
      return createCanonicalDrawEntity(action);
    if (action.type === "moveBy" || action.type === "copyBy") {
      if (mixedSelectionRefused("MOVE/COPY")) return false;
      if (nativeSelectionIdsRef.current.length)
        return moveOrCopyCanonicalSelection(action);
      const isCopy = action.type === "copyBy";
      return selRef.current
        .map((item) => {
          const place = getPlaceRef(item);
          if (!place) return false;
          if (isCopy && item.type === "asset") {
            const src = assetsRef.current.get(item.id);
            if (!src) return false;
            const id = newId("as");
            assetsRef.current.set(id, {
              ...src,
              id,
              x: src.x + action.dx,
              y: src.y + action.dy,
              label: src.label ? `${src.label} copia` : src.label,
            });
            setAssetIds((set) => new Set(set).add(id));
            setLayerAssignments((cur) =>
              assignObjectsToLayer(
                cur,
                [id],
                layerAssignmentsRef.current[item.id] ??
                  defaultCadLayerForAssetKind(src.kind),
              ),
            );
            return true;
          }
          place.x += action.dx;
          place.y += action.dy;
          return true;
        })
        .some(Boolean);
    }
    if (action.type === "offsetBy") {
      // La geometría canónica seleccionada se desplaza de verdad (perpendicular,
      // con unión miter), no trasladando su caja como hacía el camino heredado.
      if (mixedSelectionRefused("OFFSET")) return false;
      if (nativeSelectionIdsRef.current.length)
        return offsetCanonicalSelection(action.distance);
      return selRef.current
        .filter((item) => item.type === "asset")
        .map((item) => {
          const src = assetsRef.current.get(item.id);
          if (!src) return false;
          const id = newId("as");
          assetsRef.current.set(id, {
            ...src,
            id,
            x: src.x + action.distance,
            y: src.y,
            label: src.label ? `${src.label} offset` : src.label,
          });
          setAssetIds((set) => new Set(set).add(id));
          setLayerAssignments((cur) =>
            assignObjectsToLayer(
              cur,
              [id],
              layerAssignmentsRef.current[item.id] ??
                defaultCadLayerForAssetKind(src.kind),
            ),
          );
          return true;
        })
        .some(Boolean);
    }
    return false;
  };
  /**
   * Quién es dueño de la transacción de esta acción.
   *
   * La vía CANÓNICA registra su propio checkpoint dentro de
   * `commitCanonicalDocument`, y sólo si de verdad muta. La vía HEREDADA muta
   * refs en el sitio, así que su checkpoint hay que tomarlo antes; si al final
   * no cambia nada, se cancela para no dejar un Undo fantasma.
   */
  const drawActionOwner = (
    action: DrawAction,
  ): "canonical" | "legacy" | "none" => {
    if (
      action.type === "addSegment" ||
      action.type === "addPolyline" ||
      action.type === "addRect" ||
      action.type === "addCircle"
    )
      return "canonical";
    if (nativeSelectionIdsRef.current.length) return "canonical";
    return selRef.current.length ? "legacy" : "none";
  };
  const applyDrawState = (state: CadDrawCommandState) => {
    if (!state.emitted.length) return false;
    const owners = state.emitted.map(drawActionOwner);
    const expectsLegacy = owners.includes("legacy");
    if (expectsLegacy) pushHistory();
    let legacyChanged = false;
    let canonicalChanged = false;
    state.emitted.forEach((action, index) => {
      if (!applyDrawAction(action)) return;
      if (owners[index] === "legacy") legacyChanged = true;
      else canonicalChanged = true;
    });
    // Ni historial ni generación sucia por una acción que no mutó: una acción
    // degenerada o rechazada deja el documento exactamente como estaba.
    if (expectsLegacy && !legacyChanged) cancelHistoryCheckpoint();
    if (legacyChanged) markDirty();
    const changed = legacyChanged || canonicalChanged;
    if (changed) {
      rebuildAssets();
      rebuildBlocks();
      refreshSnap();
    }
    return changed;
  };
  /**
   * Un punto ya resuelto —tecleado, de la entrada dinámica o del ratón— entra
   * en el comando activo.
   *
   * Con el motor abierto va AL MOTOR. Es la otra mitad de la regla dura: no
   * basta con que el clic no llegue a la máquina heredada; una coordenada
   * tecleada tampoco puede llegar, o el mismo gesto haría dos cosas distintas
   * según por dónde entrase.
   */
  function feedDraftPoint(x: number, y: number) {
    if (enginePointerRouterRef.current?.pick({ x, y })) return true;
    const active = drawCommandRef.current;
    if (!active) return false;
    const next = feedPoint(active, { x, y });
    drawCommandRef.current = next.done ? null : next;
    setCanCloseDraftPolyline(
      !next.done && next.id === "polyline" && next.points.length >= 3,
    );
    setDrawPrompt(next.done ? null : next.prompt);
    setMeasureLive(next.done ? null : next.prompt);
    applyDrawState(next);
    if (next.done) {
      setTool("select");
      toolRef.current = "select";
    }
    return true;
  }
  function commitActiveDraftCommand() {
    if (enginePointerRouterRef.current?.active) {
      enginePointerRouterRef.current.accept();
      return true;
    }
    const active = drawCommandRef.current;
    if (!active) return false;
    const next = commitDrawCommand(active);
    drawCommandRef.current = null;
    setDrawPrompt(null);
    setMeasureLive(null);
    setCanCloseDraftPolyline(false);
    applyDrawState(next);
    setTool("select");
    toolRef.current = "select";
    return true;
  }
  function closeActiveDraftPolyline() {
    if (enginePointerRouterRef.current?.active) {
      // `Cerrar` es una palabra clave del paso, no una operación aparte: entra
      // por la misma puerta que si se tecleara `C`.
      enginePointerRouterRef.current.keyword("C");
      return true;
    }
    const active = drawCommandRef.current;
    if (!active) return false;
    const next = closeDrawPolyline(active);
    if (next === active) return false;
    drawCommandRef.current = null;
    setDrawPrompt(null);
    setMeasureLive(null);
    setCanCloseDraftPolyline(false);
    applyDrawState(next);
    setTool("select");
    toolRef.current = "select";
    return true;
  }

  // Entrada de precisión (ADR §216): agrega un vértice del muro desde una
  // coordenada tecleada — misma matemática que el clic del wall tool.
  const appendWallTo = (x: number, y: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const nx = Math.max(0, Math.min(ctx.W, Math.round(x)));
    const ny = Math.max(0, Math.min(ctx.H, Math.round(y)));
    const prev = wallChainRef.current;
    if (prev && Math.hypot(nx - prev.wx, ny - prev.wy) > 1) {
      const thick = assetMeta("wall").h;
      const len = Math.hypot(nx - prev.wx, ny - prev.wy);
      const cx = (prev.wx + nx) / 2,
        cy = (prev.wy + ny) / 2;
      const angle = (Math.atan2(ny - prev.wy, nx - prev.wx) * 180) / Math.PI;
      pushHistory();
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: "wall",
        x: cx - len / 2,
        y: cy - thick / 2,
        w: len,
        h: thick,
        rotation: angle,
      });
      setAssetIds((s) => new Set(s).add(id));
      setLayerAssignments((cur) =>
        assignObjectsToLayer(cur, [id], "architecture"),
      );
      setObjectTags((cur) => ({ ...cur, [id]: "wall, architecture" }));
      lastWallAngleRef.current = angle;
      markDirty();
      rebuildAssets();
      setMeasureLive(`Muro hasta (${nx}, ${ny})`);
    } else if (!prev) {
      setMeasureLive(`Inicio en (${nx}, ${ny})`);
    }
    wallChainRef.current = { wx: nx, wy: ny };
  };
  const submitPrecisionPoint = () => {
    const raw = precisionText.trim();
    if (!raw) {
      if (enginePointerRouterRef.current?.active || drawCommandRef.current)
        commitActiveDraftCommand();
      return;
    }
    // Con el motor abierto, la línea de precisión entrega el texto TAL CUAL al
    // motor. No lo analiza aquí: el pipeline de entrada del motor ya resuelve
    // coordenadas absolutas y relativas, polares, palabras clave, overrides de
    // captura y entrada directa de distancia — y hacerlo dos veces con dos
    // gramáticas distintas es exactamente cómo se acaba con dos productos.
    if (enginePointerRouterRef.current?.active) {
      commandEngineRef.current.submit(raw);
      setPrecisionText("");
      return;
    }
    if (drawCommandRef.current) {
      const last = drawCommandRef.current.points.at(-1) ?? null;
      const parsed = parseCoordinate(raw, {
        last,
        lockedAngleDeg: lastWallAngleRef.current,
      });
      if (!parsed.ok) {
        const d = Number(raw.replace(",", "."));
        if (Number.isFinite(d)) {
          const next = feedDistance(drawCommandRef.current, d);
          drawCommandRef.current = next.done ? null : next;
          setCanCloseDraftPolyline(
            !next.done && next.id === "polyline" && next.points.length >= 3,
          );
          applyDrawState(next);
          if (next.done) {
            setTool("select");
            toolRef.current = "select";
            setDrawPrompt(null);
            setMeasureLive(null);
          }
          setPrecisionText("");
          return;
        }
        toast.error(parsed.error, "Precisión");
        return;
      }
      feedDraftPoint(parsed.point.x, parsed.point.y);
      setPrecisionText("");
      return;
    }
    const chain = wallChainRef.current;
    const parsed = parseCoordinate(raw, {
      last: chain ? { x: chain.wx, y: chain.wy } : null,
      lockedAngleDeg: lastWallAngleRef.current,
    });
    if (!parsed.ok) {
      toast.error(parsed.error, "Precisión");
      return;
    }
    appendWallTo(parsed.point.x, parsed.point.y);
    setPrecisionText("");
  };
  const commitDynamicInput = (
    result: Extract<CadDynamicInputResult, { ok: true }>,
  ) => {
    if ("point" in result) {
      // `feedDraftPoint` decide a quién va: al motor si tiene un comando
      // abierto, y si no a la máquina heredada. Preguntar aquí por
      // `drawCommandRef` era preguntar SÓLO por la heredada, y con el puntero
      // enrutado ese ref está vacío: el punto se perdía en silencio y el
      // comando se quedaba pidiendo el mismo dato para siempre.
      if (
        !feedDraftPoint(result.point.x, result.point.y) &&
        toolRef.current === "wall"
      )
        appendWallTo(result.point.x, result.point.y);
      setPrecisionText("");
      return;
    }
    if (enginePointerRouterRef.current?.active) {
      // Un escalar —radio, diámetro ya reducido a radio, desfase— entra como
      // número por la misma puerta que si se tecleara. El paso decide si es una
      // distancia o entrada directa sobre la dirección del cursor; el editor no
      // tiene por qué saberlo.
      commandEngineRef.current.submit(String(result.scalar));
      setPrecisionText("");
      return;
    }
    const active = drawCommandRef.current;
    if (!active) return;
    const next = feedDistance(active, result.scalar);
    drawCommandRef.current = next.done ? null : next;
    setCanCloseDraftPolyline(
      !next.done && next.id === "polyline" && next.points.length >= 3,
    );
    applyDrawState(next);
    setDrawPrompt(next.done ? null : next.prompt);
    setMeasureLive(next.done ? null : next.prompt);
    if (next.done) {
      setTool("select");
      toolRef.current = "select";
    }
    setPrecisionText("");
  };
  // Live quantity take-off from the current (possibly unsaved) editor state.
  const openTakeoff = useCallback(() => {
    const fp = data?.footprint;
    if (!fp) return;
    const placements = [...placementsRef.current.values()];
    const assets = [...assetsRef.current.values()];
    const map = new Map<string, { count: number; area: number }>();
    for (const a of assets) {
      const area = a.w * a.h;
      const c = map.get(a.kind) ?? { count: 0, area: 0 };
      c.count += 1;
      c.area += area;
      map.set(a.kind, c);
    }
    const byKind = [...map.entries()]
      .map(([kind, v]) => ({
        kind,
        label: assetMeta(kind).label,
        count: v.count,
        area: v.area,
      }))
      .sort((p, q) => q.count - p.count || p.label.localeCompare(q.label));
    const footprintArea = fp.footprintW * fp.footprintH;
    const architecture = buildCadArchitectureTakeoff({
      unit: fp.unit || "mm",
      footprintArea,
      layers: cadLayers.map((layer) => ({ id: layer.id, label: layer.label })),
      stations: [...placementsRef.current.entries()].map(([id, p]) => ({
        id,
        kind: "station",
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x,
        y: p.y,
        width: p.w,
        height: p.h,
        rotation: p.rotation,
        layerId: layerAssignmentsRef.current[id] ?? "layout",
        tags: objectTagsRef.current[id],
      })),
      assets: assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        label: asset.label || assetMeta(asset.kind).label,
        x: asset.x,
        y: asset.y,
        width: asset.w,
        height: asset.h,
        rotation: asset.rotation,
        layerId:
          layerAssignmentsRef.current[asset.id] ??
          defaultCadLayerForAssetKind(
            asset.kind,
            objectTagsRef.current[asset.id],
          ),
        tags: objectTagsRef.current[asset.id],
      })),
    });
    const byLayer = architecture.byLayer
      .map((row) => {
        const layer = cadLayers.find((candidate) => candidate.id === row.key);
        return layer
          ? {
              id: layer.id,
              label: layer.label,
              count: row.count,
              area: row.area,
            }
          : null;
      })
      .filter(
        (
          row,
        ): row is {
          id: CadLayerId;
          label: string;
          count: number;
          area: number;
        } => !!row,
      );
    // material-flow travel metrics from the line connectors (Fase 64)
    const centers: Record<string, FlowCenter> = {};
    placementsRef.current.forEach((p, id) => {
      centers[id] = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    });
    assets.forEach((asset) => {
      centers[asset.id] = {
        x: asset.x + asset.w / 2,
        y: asset.y + asset.h / 2,
      };
    });
    const flow = flowMetrics(connectorsRef.current, centers);
    setTakeoff({
      unit: fp.unit || "mm",
      footprintArea,
      totalStations: data!.stations.length,
      placedStations: placements.length,
      stationArea: architecture.stationArea,
      equipmentCount: assets.length,
      equipArea: architecture.equipmentArea,
      usedArea: architecture.occupiedArea,
      util: architecture.occupiedPct,
      wallLen: architecture.wallLength,
      dimCount: [...annotationsRef.current.values()].filter(
        (a) => a.type === "dim",
      ).length,
      flowLen: flow.totalLen,
      flowMaxHop: flow.maxHop,
      flowCount: flow.count,
      architecture,
      byKind,
      byLayer,
    });
  }, [data, cadLayers]);

  const currentCollisionBoxes = useCallback(() => {
    const boxes = [
      ...[...placementsRef.current.entries()].map(([id, p]) => ({
        id,
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        width: p.w,
        height: p.h,
        layer: layerAssignments[id] ?? "layout",
        tags: cadTags(objectTags[id]),
      })),
      ...[...assetsRef.current.values()]
        .filter((asset) => {
          const arch = assetMeta(asset.kind).archetype;
          return (
            arch !== "zone" &&
            arch !== "path" &&
            !assetSafetyZoneKind(asset, objectTags[asset.id])
          );
        })
        .map((asset) => ({
          id: asset.id,
          label: asset.label || assetMeta(asset.kind).label,
          x: asset.x + asset.w / 2,
          y: asset.y + asset.h / 2,
          width: asset.w,
          height: asset.h,
          layer:
            layerAssignments[asset.id] ??
            defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]),
          tags: cadTags(objectTags[asset.id]),
        })),
    ];
    return boxes;
  }, [layerAssignments, objectTags]);
  const currentSafetyZones = useCallback((): CadSafetyZone[] => {
    const zones: CadSafetyZone[] = [];
    assetsRef.current.forEach((asset) => {
      const tags = (objectTags[asset.id] ?? "").toLowerCase();
      const kind = assetSafetyZoneKind(asset, tags);
      if (!kind) return;
      zones.push({
        id: asset.id,
        kind,
        label: asset.label || assetMeta(asset.kind).label,
        x: asset.x + asset.w / 2,
        y: asset.y + asset.h / 2,
        width: asset.w,
        height: asset.h,
        layer: "Safety",
        requiredClearance:
          kind === "safety_clearance"
            ? Math.max(asset.w, asset.h) / 2
            : undefined,
      });
    });
    return zones;
  }, [objectTags]);
  const currentFlowNodes = useCallback((): CadFlowNode[] => {
    return [...placementsRef.current.entries()]
      .map(([id, p]) => ({
        id,
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x + p.w / 2,
        y: p.y + p.h / 2,
        sequence: data?.stations.findIndex((s) => s.id === id) ?? 0,
      }))
      .sort((a, b) => a.sequence - b.sequence)
      .map((node) => ({
        id: node.id,
        label: node.label,
        x: node.x,
        y: node.y,
      }));
  }, [data]);
  const configureOrbitControlsForMode = (mode: "3d" | "2d") => {
    viewControllerRef.current?.setMode(mode);
    if (controlsRef.current) applyCadCameraPolicy(controlsRef.current, mode);
  };
  const focusViewportItems = (items: SelItem[]) => {
    const ctx = ctxRef.current;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const fp = data?.footprint;
    if (!ctx || !cam || !ctrl || !fp) return false;
    const objects = items
      .map((item) => {
        const place = getPlaceRef(item);
        return place
          ? { id: item.id, x: place.x, y: place.y, w: place.w, h: place.h }
          : null;
      })
      .filter(
        (
          item,
        ): item is { id: string; x: number; y: number; w: number; h: number } =>
          !!item,
      );
    const bounds = cadViewportFocusBounds(objects, {
      padding: Math.max(
        fp.gridSize || 0,
        Math.max(fp.footprintW, fp.footprintH) * 0.015,
      ),
      footprintW: fp.footprintW,
      footprintH: fp.footprintH,
    });
    if (!bounds) return false;
    if (walkRef.current) {
      setWalk(false);
      walkRef.current = false;
    }
    configureOrbitControlsForMode(viewMode);
    const targetX = (bounds.centerX - ctx.W / 2) * ctx.s;
    const targetZ = (bounds.centerY - ctx.H / 2) * ctx.s;
    const span = Math.max(bounds.width, bounds.height) * ctx.s;
    const distance = Math.max(6, span * 1.9);
    if (viewMode === "2d") cam.position.set(targetX, distance, targetZ + 0.01);
    else
      cam.position.set(
        targetX + distance * 0.42,
        Math.max(5, distance * 0.58),
        targetZ + distance * 0.72,
      );
    ctrl.target.set(targetX, 0, targetZ);
    ctrl.update();
    return true;
  };
  const focusCurrentSelection = () => {
    if (!selRef.current.length) {
      toast.error("Selecciona objetos para enfocar la vista.", "Vistas CAD");
      return;
    }
    const focused = focusViewportItems(selRef.current);
    if (!focused) {
      toast.error("No pude enfocar la seleccion actual.", "Vistas CAD");
      return;
    }
    const fp = data?.footprint;
    const objects = selRef.current
      .map((item) => {
        const place = getPlaceRef(item);
        return place
          ? { id: item.id, x: place.x, y: place.y, w: place.w, h: place.h }
          : null;
      })
      .filter(
        (
          item,
        ): item is { id: string; x: number; y: number; w: number; h: number } =>
          !!item,
      );
    const bounds = cadViewportFocusBounds(objects, {
      padding: fp?.gridSize ?? 0,
      footprintW: fp?.footprintW,
      footprintH: fp?.footprintH,
    });
    toast.success(
      bounds
        ? describeCadViewportFocus(bounds, fp?.unit || "mm")
        : "Seleccion enfocada.",
      "Vistas CAD",
    );
  };
  const selectCollisionPair = (hit: CadCollisionHit) => {
    const pair: SelItem[] = [hit.aId, hit.bId]
      .map((id) =>
        placementsRef.current.has(id)
          ? { type: "station" as const, id }
          : assetsRef.current.has(id)
            ? { type: "asset" as const, id }
            : null,
      )
      .filter((item): item is SelItem => !!item);
    if (!pair.length) return;
    select(pair);
    rebuildAll();
    focusViewportItems(pair);
    toast.success(`${hit.aLabel} ↔ ${hit.bLabel} seleccionado.`, "Colisiones");
  };
  const selectClearanceIssue = (issue: CadClearanceIssue) => {
    const pair: SelItem[] = [issue.aId, issue.bId]
      .map((id) =>
        placementsRef.current.has(id)
          ? { type: "station" as const, id }
          : assetsRef.current.has(id)
            ? { type: "asset" as const, id }
            : null,
      )
      .filter((item): item is SelItem => !!item);
    if (!pair.length) return;
    select(pair);
    rebuildAll();
    focusViewportItems(pair);
    toast.success("Par de holgura seleccionado.", "Clearance");
  };
  const selectSafetyIssue = (issue: CadSafetyIssue) => {
    const items: SelItem[] = [issue.objectId, issue.zoneId]
      .map((id) =>
        placementsRef.current.has(id)
          ? { type: "station" as const, id }
          : assetsRef.current.has(id)
            ? { type: "asset" as const, id }
            : null,
      )
      .filter((item): item is SelItem => !!item);
    if (!items.length) return;
    select(items);
    rebuildAll();
    focusViewportItems(items);
    toast.success("Issue de seguridad seleccionado.", "Safety");
  };
  const selectValidationIssue = (issue: CadValidationIssueRow) => {
    if (issue.category === "flow") {
      if (cadValidationReport?.flow) {
        setFlowHealth(cadValidationReport.flow);
        setReport(null);
        toast.success(
          "Flow Health abierto desde validacion.",
          "CAD validation",
        );
      }
      return;
    }
    const items: SelItem[] = issue.affectedObjectIds
      .map((id) =>
        placementsRef.current.has(id)
          ? { type: "station" as const, id }
          : assetsRef.current.has(id)
            ? { type: "asset" as const, id }
            : null,
      )
      .filter((item): item is SelItem => !!item);
    if (!items.length) return;
    select(items);
    rebuildAll();
    focusViewportItems(items);
    toast.success(issue.actionLabel, "CAD validation");
  };
  const analyzeFlowHealth = () => {
    const nodes = currentFlowNodes();
    if (nodes.length < 2) {
      toast.error(
        "Coloca al menos 2 estaciones para analizar flujo.",
        "Flow Health",
      );
      return;
    }
    setFlowSequence(nodes);
    setFlowSegments(buildFlowSegments(nodes));
    setFlowHealth(scoreFlowLayout(nodes));
  };

  // Design-check / validation review of the current (possibly unsaved) state (Fase 63).
  const openChecks = useCallback(() => {
    const fp = data?.footprint;
    if (!fp) return;
    const stations: CheckBox[] = [];
    placementsRef.current.forEach((p, id) => {
      stations.push({
        id,
        label: stationsByIdRef.current.get(id)?.station ?? id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
      });
    });
    const assets: CheckBox[] = [];
    assetsRef.current.forEach((a) => {
      const arch = assetMeta(a.kind).archetype;
      if (arch === "zone" || arch === "path") return; // floor tints / lanes are meant to be large
      assets.push({
        id: a.id,
        label: a.label || assetMeta(a.kind).label,
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
      });
    });
    const unplaced = Math.max(
      0,
      (data?.stations.length ?? 0) - placementsRef.current.size,
    );
    const collisionBoxes = currentCollisionBoxes();
    const flowNodes = currentFlowNodes();
    // Re-evaluación normativa de Industry Packs (CAD-NEXT-095): los assets
    // soltados desde la paleta llevan su objectId como tag; las reglas
    // geométricas del pack se re-corren con el tamaño ACTUAL del objeto.
    const placedIndustry = [...assetsRef.current.values()].flatMap((asset) => {
      const tags = (objectTagsRef.current[asset.id] ?? "")
        .split(/[,\n]/)
        .map((t) => t.trim());
      const objectId = tags.find((t) => INDUSTRY_REGISTRY.getObject(t));
      return objectId ? [{ asset, objectId }] : [];
    });
    const industryFindings = placedIndustry.flatMap(({ asset, objectId }) => {
      const def = INDUSTRY_REGISTRY.getObject(objectId)!;
      return INDUSTRY_REGISTRY.validatePlaced(objectId, asset.w, asset.h).map(
        (finding) => ({
          assetId: asset.id,
          objectLabel: def.label,
          level: finding.level,
          message: finding.message,
        }),
      );
    });
    // BOM de objetos inteligentes (CAD-NEXT-098): conteo + métricas de negocio
    // sumadas con el tamaño actual de cada objeto — lo que un CAD genérico no
    // puede dar (total de posiciones de pallet, facings, camas…).
    setIndustrySummary(
      summarizeIndustryObjects(
        placedIndustry.map(({ asset, objectId }) => ({
          objectId,
          w: asset.w,
          h: asset.h,
        })),
        INDUSTRY_REGISTRY,
      ),
    );
    const cadReport = buildCadValidationReport({
      boxes: collisionBoxes,
      zones: currentSafetyZones(),
      flowNodes: flowNodes.length >= 2 ? flowNodes : undefined,
      requiredClearance: defaultCadClearance(fp.unit || "mm"),
      unit: fp.unit || "mm",
      // El documento canónico del estado actual habilita las reglas de
      // documento (ids duplicados, fuera del área — estaciones incluidas).
      document: snapshotDocument(),
      footprint: { w: fp.footprintW, h: fp.footprintH },
      industryFindings,
      dimensionCount: [...annotationsRef.current.values()].filter(
        (a) => a.type === "dim",
      ).length,
      architectureObjects: [
        ...[...placementsRef.current.entries()].map(([id, p]) => ({
          id,
          kind: "station",
          label: stationsByIdRef.current.get(id)?.station ?? id,
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          rotation: p.rotation,
          layerId: layerAssignmentsRef.current[id] ?? "layout",
          tags: objectTagsRef.current[id],
        })),
        ...[...assetsRef.current.values()].map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          label: asset.label,
          x: asset.x,
          y: asset.y,
          width: asset.w,
          height: asset.h,
          rotation: asset.rotation,
          layerId:
            layerAssignmentsRef.current[asset.id] ??
            defaultCadLayerForAssetKind(
              asset.kind,
              objectTagsRef.current[asset.id],
            ),
          tags: objectTagsRef.current[asset.id],
        })),
      ],
    });
    const highlightIds = new Set<string>();
    cadReport.collisions.forEach((hit) => {
      highlightIds.add(hit.aId);
      highlightIds.add(hit.bId);
    });
    cadReport.clearances.forEach((issue) => {
      highlightIds.add(issue.aId);
      highlightIds.add(issue.bId);
    });
    cadReport.safety.forEach((issue) => {
      highlightIds.add(issue.objectId);
      highlightIds.add(issue.zoneId);
    });
    cadReport.architecture.forEach((issue) => {
      issue.affectedObjectIds.forEach((id) => highlightIds.add(id));
    });
    cadReport.document.forEach((finding) => {
      finding.entityIds.forEach((id) => highlightIds.add(id));
    });
    cadReport.industry.forEach((finding) => {
      highlightIds.add(finding.assetId);
    });
    validationHighlightRef.current = highlightIds;
    setValidationHighlightIds(highlightIds);
    setCadValidationReport(cadReport);
    setCollisionHits(cadReport.collisions);
    setClearanceIssues(cadReport.clearances);
    setSafetyIssues(cadReport.safety);
    rebuildAll();
    setReport(
      designChecks({
        stations,
        assets,
        unplacedStations: unplaced,
        footprintW: fp.footprintW,
        footprintH: fp.footprintH,
        connectors: connectorsRef.current,
      }),
    );
  }, [
    data,
    currentCollisionBoxes,
    currentFlowNodes,
    currentSafetyZones,
    snapshot,
    snapshotDocument,
    rebuildAll,
  ]);
  const clearValidationHighlights = () => {
    validationHighlightRef.current = new Set();
    setValidationHighlightIds(new Set());
    rebuildAll();
  };
  // Restricciones geométricas vivas (CAD-GL-030): persisten la relación en el
  // documento y la reevalúan después de editar o ejecutar comandos. El
  // PRIMER muro seleccionado es la referencia (para paralelo/perpendicular/
  // igualar/colineal); horizontal y vertical no necesitan referencia y se
  // aplican a todos. Cada muro se guarda como centro+rotación+largo, así que la
  // solver sobre segmentos se traduce de vuelta conservando el centro.
  const solveAndRestoreConstraints = (
    document: CadDocument,
    changedIds: string[],
  ) => {
    const solved = solveCadConstraints(document, changedIds);
    if (!solved.converged) {
      toast.error(
        solved.issues[0]?.message || "Las restricciones son inconsistentes.",
        "Restricciones",
      );
      return false;
    }
    loadedCadDocumentRef.current = solved.document;
    restore(cadDocumentToEditorSnapshot<CadLayerId>(solved.document));
    return true;
  };
  const applyWallConstraint = (
    kind:
      | "horizontal"
      | "vertical"
      | "parallel"
      | "perpendicular"
      | "equal"
      | "collinear",
  ) => {
    const walls = selRef.current
      .filter((it) => it.type === "asset")
      .map((it) => assetsRef.current.get(it.id))
      .filter((a): a is Asset => !!a && a.kind === "wall");
    const needsRef = kind !== "horizontal" && kind !== "vertical";
    if (needsRef && walls.length < 2) {
      toast.error(
        "Selecciona al menos dos muros: el primero es la referencia.",
        "Restricciones",
      );
      return;
    }
    if (!needsRef && walls.length < 1) {
      toast.error("Selecciona uno o más muros.", "Restricciones");
      return;
    }
    const historyBefore =
      canonicalHistoryRef.current?.createRecoveryPoint() ?? null;
    pushHistory();
    const targets = needsRef ? walls.slice(1) : walls;
    const constraintKind: CadConstraintKind =
      kind === "equal" ? "equalLength" : kind;
    let document = snapshotDocument();
    for (const wall of targets) {
      const entityIds = needsRef ? [walls[0].id, wall.id] : [wall.id];
      document = upsertCadConstraint(document, {
        id: `${constraintKind}:${entityIds.join(":")}`,
        kind: constraintKind,
        entityIds,
        enabled: true,
      });
    }
    if (!solveAndRestoreConstraints(document, [walls[0].id])) {
      if (historyBefore && canonicalHistoryRef.current) {
        canonicalHistoryRef.current.restoreRecoveryPoint(historyBefore);
        setHist(canonicalHistoryRef.current.depths());
      } else cancelHistoryCheckpoint();
      return;
    }
    markDirty();
    refreshSnap();
    toast.success(
      `Restricción aplicada a ${targets.length} muro(s).`,
      "Restricciones",
    );
  };

  // Restricción dimensional viva: fija longitud o ángulo exactos y conserva la
  // relación al editar después el muro.
  const applyWallDimension = (kind: "length" | "angle", value: number) => {
    if (!Number.isFinite(value)) return;
    const sel = selRef.current.find((it) => it.type === "asset");
    const wall = sel && assetsRef.current.get(sel.id);
    if (!wall || wall.kind !== "wall") {
      toast.error("Selecciona un muro para fijar su dimensión.", "Dimensiones");
      return;
    }
    if (kind === "length" && !(value > 0)) {
      toast.error("La longitud debe ser mayor que cero.", "Dimensiones");
      return;
    }
    const historyBefore =
      canonicalHistoryRef.current?.createRecoveryPoint() ?? null;
    pushHistory();
    const constraintKind: CadConstraintKind =
      kind === "length" ? "distance" : "angle";
    const document = upsertCadConstraint(snapshotDocument(), {
      id: `${constraintKind}:${wall.id}`,
      kind: constraintKind,
      entityIds: [wall.id],
      value,
      enabled: true,
    });
    if (!solveAndRestoreConstraints(document, [wall.id])) {
      if (historyBefore && canonicalHistoryRef.current) {
        canonicalHistoryRef.current.restoreRecoveryPoint(historyBefore);
        setHist(canonicalHistoryRef.current.depths());
      } else cancelHistoryCheckpoint();
      return;
    }
    markDirty();
    refreshSnap();
    toast.success(
      kind === "length"
        ? `Longitud fijada a ${Math.round(value)} mm.`
        : `Ángulo fijado a ${value}°.`,
      "Dimensiones",
    );
  };

  // Entregable de capacidad (CAD-NEXT-099): el BOM de objetos inteligentes a CSV.
  const exportIndustryCsv = () => {
    if (!industrySummary || industrySummary.totalInstances === 0) return;
    const csv = industryRollupToCsv(industrySummary);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      `capacidad-${model}-${revision}`.replace(/[^\w.\-]+/g, "_") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("BOM de capacidad exportado a CSV.", "Objetos inteligentes");
  };
  const selectFlowNode = (id: string) => {
    if (!placementsRef.current.has(id)) return;
    select([{ type: "station", id }]);
    rebuildAll();
  };
  const selectFlowSequence = () => {
    const items: SelItem[] = flowSequence
      .filter((node) => placementsRef.current.has(node.id))
      .map((node) => ({ type: "station", id: node.id }));
    if (!items.length) return;
    select(items);
    rebuildAll();
    toast.success(
      `${items.length} estación(es) del flujo seleccionadas.`,
      "Flow Health",
    );
  };
  const selectFlowSegment = (segment: CadFlowSegment) => {
    const items: SelItem[] = [segment.from.id, segment.to.id]
      .filter((id) => placementsRef.current.has(id))
      .map((id) => ({ type: "station", id }));
    if (items.length < 2) return;
    select(items);
    rebuildAll();
    toast.success(
      `Tramo seleccionado: ${segment.from.label ?? segment.from.id} → ${segment.to.label ?? segment.to.id}.`,
      "Flow Health",
    );
  };

  const applyFlowReorderPreview = () => {
    const preview = flowHealth?.reorderPreview;
    if (!preview?.improves) return;
    const moves = preview.moves.filter((move) =>
      placementsRef.current.has(move.id),
    );
    if (moves.length < 2) {
      toast.error(
        "No hay suficientes estaciones movibles para aplicar la recomendacion.",
        "Flow Health",
      );
      return;
    }
    const locked = moves.filter((move) =>
      isItemLayerLocked({ type: "station", id: move.id }),
    );
    if (locked.length) {
      select(locked.map((move) => ({ type: "station", id: move.id })));
      rebuildAll();
      toast.error(
        `${locked.length} estacion(es) estan en capas bloqueadas; desbloquealas antes de reordenar.`,
        "Flow Health",
      );
      return;
    }
    const fp = data?.footprint;
    recordLocalSnapshot("Auto - antes de aplicar orden Flow Health", "command");
    pushHistory();
    let moved = 0;
    moves.forEach((move) => {
      const placement = placementsRef.current.get(move.id);
      if (!placement) return;
      const maxX = Math.max(
        0,
        (fp?.footprintW ?? move.to.x + placement.w) - placement.w,
      );
      const maxY = Math.max(
        0,
        (fp?.footprintH ?? move.to.y + placement.h) - placement.h,
      );
      placement.x = Math.max(
        0,
        Math.min(maxX, snapWorld(move.to.x - placement.w / 2)),
      );
      placement.y = Math.max(
        0,
        Math.min(maxY, snapWorld(move.to.y - placement.h / 2)),
      );
      moved += 1;
    });
    const nextNodes = currentFlowNodes();
    setFlowSequence(nextNodes);
    setFlowSegments(buildFlowSegments(nextNodes));
    setFlowHealth(scoreFlowLayout(nextNodes));
    select(moves.map((move) => ({ type: "station", id: move.id })));
    markDirty();
    refreshSnap();
    rebuildAll();
    toast.success(
      `Orden Flow Health aplicado en eje ${preview.axis.toUpperCase()} (${moved} estaciones).`,
      "Flow Health",
    );
  };

  // Resize the plant footprint / grid from the CAD; the scene rebuilds at the
  // new scale and the change persists on save (objects keep their world coords).
  const applyFootprint = useCallback(() => {
    // El checkpoint va ANTES de mutar: captura la huella vieja, que es lo que
    // deshacer tiene que devolver. Sólo marcaba dirty, así que redimensionar la
    // planta no entraba en el historial.
    pushHistory();
    setData((d) => {
      if (!d) return d;
      const unit = (d.footprint.unit || "mm") as WorldUnit;
      const w = clampFootprintUnit(
        Math.round(fpDraft.w) || d.footprint.footprintW,
        unit,
      );
      const h = clampFootprintUnit(
        Math.round(fpDraft.h) || d.footprint.footprintH,
        unit,
      );
      const g = clampGridUnit(
        Math.round(fpDraft.g) || d.footprint.gridSize,
        unit,
      );
      return {
        ...d,
        footprint: {
          ...d.footprint,
          footprintW: w,
          footprintH: h,
          gridSize: g,
        },
      };
    });
    markDirty();
    setShowView(false);
  }, [fpDraft, markDirty, pushHistory]);

  // One-click factory-scale presets — set the plant to a workcell … full nave
  // size in real metres regardless of the layout's stored unit (EPIC 0). The
  // scene rebuilds at the new scale and the change persists on save.
  const applyPreset = useCallback(
    (preset: FactoryPreset) => {
      const unit = (data?.footprint.unit || "mm") as WorldUnit;
      const u = presetToUnit(preset, unit);
      pushHistory();
      setData((d) =>
        d
          ? {
              ...d,
              footprint: {
                ...d.footprint,
                footprintW: u.width,
                footprintH: u.height,
                gridSize: u.grid,
              },
            }
          : d,
      );
      setFpDraft({ w: u.width, h: u.height, g: u.grid });
      markDirty();
      setShowView(false);
    },
    [data, markDirty, pushHistory],
  );

  // Add a free-text note at the point the camera is looking at (round-trips 2D).
  const addNote = () => {
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    if (!ctx) return;
    const text = (
      typeof window !== "undefined" ? window.prompt("Texto de la nota:") : ""
    )?.trim();
    if (!text) return;
    const tx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const ty = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId("nt");
    annotationsRef.current.set(id, {
      id,
      type: "text",
      text: text.slice(0, 240),
      x: Math.max(0, Math.min(ctx.W, snapWorld(tx))),
      y: Math.max(0, Math.min(ctx.H, snapWorld(ty))),
    });
    markDirty();
    rebuildNotes();
  };

  // La composición histórica de dos DIM + TEXT deja de crearse: el editor abre
  // la paleta de una entidad MLEADER canónica, seleccionable y persistente.
  const createLeaderForSelection = () => {
    if (!selSnap && !nativeSelectionIdsRef.current.length) {
      toast.error("Selecciona uno o más destinos para anotarlos.", "MLEADER");
      return;
    }
    setShowMleaderPalette(true);
  };

  const createHatchForSelection = (solid: boolean) => {
    const document = loadedCadDocumentRef.current;
    const selectedNativeSources = (document?.entities ?? [])
      .filter((entity) => nativeSelectionIdsRef.current.includes(entity.id))
      .filter((entity) => entity.type !== "hatch");
    const nativeBoundaries = stitchCadBoundaryPaths(
      selectedNativeSources.flatMap((entity) => cadEntityBoundaryPaths(entity)),
    );
    const assets = selRef.current
      .filter(
        (item): item is SelItem & { type: "asset" } => item.type === "asset",
      )
      .map((item) => assetsRef.current.get(item.id))
      .filter((asset): asset is Asset => !!asset)
      .filter(
        (asset) =>
          !isObjectLayerLocked(
            cadLayersRef.current,
            layerAssignmentsRef.current,
            asset.id,
            defaultCadLayerForAssetKind(
              asset.kind,
              objectTagsRef.current[asset.id],
            ),
          ),
      );
    if (!assets.length && !nativeBoundaries.loops.length) {
      toast.error(
        nativeBoundaries.openSourceIds.length
          ? `Boundary abierto: ${nativeBoundaries.openSourceIds.join(", ")}.`
          : "Selecciona assets o curvas que formen al menos un boundary cerrado.",
        "HATCH",
      );
      return;
    }
    const assetHatches: CadNativeEntity[] = assets.map((asset) => {
      const center = { x: asset.x + asset.w / 2, y: asset.y + asset.h / 2 };
      const angle = ((asset.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const local =
        asset.shape === "circle"
          ? Array.from({ length: 48 }, (_, index) => {
              const theta = (index / 48) * Math.PI * 2;
              return {
                x: (Math.cos(theta) * asset.w) / 2,
                y: (Math.sin(theta) * asset.h) / 2,
              };
            })
          : [
              { x: -asset.w / 2, y: -asset.h / 2 },
              { x: asset.w / 2, y: -asset.h / 2 },
              { x: asset.w / 2, y: asset.h / 2 },
              { x: -asset.w / 2, y: asset.h / 2 },
            ];
      return {
        id: newId("hatch"),
        type: "hatch",
        pattern: solid ? "SOLID" : "ANSI31",
        solid,
        boundaries: [
          local.map((point) => ({
            x: center.x + point.x * cos - point.y * sin,
            y: center.y + point.x * sin + point.y * cos,
            z: 0,
          })),
        ],
        scale: Math.max(1, data?.footprint.gridSize ?? 100),
        angle: 45,
        origin: { x: center.x, y: center.y, z: 0 },
        islandStyle: "normal",
        associative: false,
        associationStatus: "detached",
        layer:
          layerAssignmentsRef.current[asset.id] ??
          defaultCadLayerForAssetKind(
            asset.kind,
            objectTagsRef.current[asset.id],
          ),
        context: {
          provenance: { provider: "cad-editor" },
          metadata: {
            sourceAssetId: asset.id,
            sourceType: "CLOSED_ASSET_BOUNDARY",
          },
        },
      };
    });
    const nativeHatches: CadNativeEntity[] = nativeBoundaries.loops.map(
      (boundary, boundaryIndex) => ({
        id: newId("hatch"),
        type: "hatch",
        pattern: solid ? "SOLID" : "ANSI31",
        solid,
        boundaries: [boundary.map((point) => ({ ...point, z: 0 }))],
        scale: Math.max(1, data?.footprint.gridSize ?? 100),
        angle: 45,
        origin: { ...boundary[0], z: 0 },
        islandStyle: "normal",
        associative: true,
        boundaryRefs: [
          ...(nativeBoundaries.loopSourceIds[boundaryIndex] ??
            nativeBoundaries.sourceIds),
        ],
        associationStatus: "associated",
        layer: selectedNativeSources[0]?.layer ?? activeCadLayer,
        context: {
          provenance: { provider: "cad-editor" },
          metadata: { sourceType: "ASSOCIATIVE_CLOSED_BOUNDARY" },
        },
      }),
    );
    const entities = [...assetHatches, ...nativeHatches];
    if (
      insertNativeEntities(
        entities,
        `create:hatch:${solid ? "solid" : "ANSI31"}`,
      )
    )
      toast.success(
        `${entities.length} HATCH ${solid ? "SOLID" : "ANSI31"} creado(s).`,
        "HATCH",
      );
  };

  const createHatchAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const legacyEntities = new Map<string, CadEntity>();
      assetsRef.current.forEach((asset, id) => {
        legacyEntities.set(id, {
          id,
          type: "box",
          kind: asset.kind,
          x: asset.x,
          y: asset.y,
          w: asset.w,
          h: asset.h,
          rotation: asset.rotation,
          layer:
            layerAssignmentsRef.current[id] ??
            defaultCadLayerForAssetKind(asset.kind, objectTagsRef.current[id]),
          shape: asset.shape ?? "rect",
        });
      });
      placementsRef.current.forEach((placement, id) => {
        if (legacyEntities.has(id)) return;
        legacyEntities.set(id, {
          id,
          type: "station",
          x: placement.x,
          y: placement.y,
          w: placement.w,
          h: placement.h,
          rotation: placement.rotation,
          layer: layerAssignmentsRef.current[id] ?? "layout",
        });
      });

      const closedPaths = (entities: readonly CadEntity[]) =>
        entities
          .flatMap((entity) => cadEntityBoundaryPaths(entity))
          .filter((path) => path.closed && path.points.length >= 3);
      const pointBounds = {
        minX: point.x,
        minY: point.y,
        maxX: point.x,
        maxY: point.y,
      };
      const pointNative = (
        nativeSelectionIndexRef.current?.search(pointBounds, 256) ?? []
      ).filter((entity) => entity.type !== "hatch");
      const pointLegacy = [...legacyEntities.values()].filter((entity) =>
        closedPaths([entity]).some((path) =>
          cadPointInBoundary(point, path.points),
        ),
      );
      const preliminary = stitchCadBoundaryPaths(
        closedPaths([...pointNative, ...pointLegacy]),
      );
      const preliminaryRegion = resolveCadHatchRegionWithSources(
        preliminary,
        point,
        "ignore",
      );
      const outer = preliminaryRegion.boundaries[0];
      if (!outer) {
        toast.error(
          "No se encontró una región cerrada bajo el punto. Revisa gaps del boundary.",
          "HATCH",
        );
        return;
      }
      const regionBounds = outer.reduce(
        (bounds, vertex) => ({
          minX: Math.min(bounds.minX, vertex.x),
          minY: Math.min(bounds.minY, vertex.y),
          maxX: Math.max(bounds.maxX, vertex.x),
          maxY: Math.max(bounds.maxY, vertex.y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      const nativeRegion = (
        nativeSelectionIndexRef.current?.search(regionBounds, 4_096) ?? []
      ).filter((entity) => entity.type !== "hatch");
      const legacyRegion = [...legacyEntities.values()].filter((entity) =>
        closedPaths([entity]).some((path) =>
          path.points.some(
            (vertex) =>
              vertex.x >= regionBounds.minX &&
              vertex.x <= regionBounds.maxX &&
              vertex.y >= regionBounds.minY &&
              vertex.y <= regionBounds.maxY,
          ),
        ),
      );
      const built = stitchCadBoundaryPaths(
        closedPaths([...nativeRegion, ...legacyRegion]),
      );
      const region = resolveCadHatchRegionWithSources(
        built,
        point,
        hatchIslandStyle,
      );
      if (!region.boundaries.length) {
        toast.error(
          "No se encontró una región cerrada bajo el punto. Revisa gaps del boundary.",
          "HATCH",
        );
        return;
      }
      const hatch: CadNativeEntity = {
        id: newId("hatch"),
        type: "hatch",
        pattern: hatchPickSolid ? "SOLID" : "ANSI31",
        solid: hatchPickSolid,
        boundaries: region.boundaries.map((boundary) =>
          boundary.map((vertex) => ({ ...vertex, z: 0 })),
        ),
        scale: Math.max(1, data?.footprint.gridSize ?? 100),
        angle: 45,
        origin: { ...point, z: 0 },
        islandStyle: hatchIslandStyle,
        associative: true,
        boundaryRefs: region.sourceIds,
        associationStatus: "associated",
        layer: activeCadLayer,
        context: {
          provenance: { provider: "cad-editor" },
          metadata: {
            sourceType: "HATCH_PICK_POINT",
            sourceCount: region.sourceIds.length,
          },
        },
      };
      if (
        insertNativeEntities(
          [hatch],
          `create:hatch:pick:${hatchPickSolid ? "solid" : "ANSI31"}`,
        )
      ) {
        setHatchPickMode(false);
        hatchPickModeRef.current = false;
        toast.success(
          `HATCH por punto creado con ${region.boundaries.length} loop(s).`,
          "HATCH",
        );
      }
    },
    [
      activeCadLayer,
      data?.footprint.gridSize,
      hatchIslandStyle,
      hatchPickSolid,
      insertNativeEntities,
      toast,
    ],
  );
  useEffect(() => {
    hatchPickCallbackRef.current = createHatchAtPoint;
  }, [createHatchAtPoint]);

  const clearDims = useCallback(() => {
    const hasDim = [...annotationsRef.current.values()].some(
      (a) => a.type === "dim",
    );
    if (!hasDim) return;
    pushHistory();
    annotationsRef.current.forEach((a, id) => {
      if (a.type === "dim") annotationsRef.current.delete(id);
    });
    setDimCount(0);
    markDirty();
    rebuildDims();
  }, [markDirty, rebuildDims, pushHistory]);

  // ---- actions ----
  const placeStation = (st: St) => {
    const ctx = ctxRef.current;
    if (!ctx || !data) return;
    pushHistory();
    const w = Math.round(data.footprint.footprintW * 0.06);
    const h = Math.round(data.footprint.footprintH * 0.08);
    const x = snapWorld(ctx.W / 2 - w / 2);
    const y = snapWorld(ctx.H / 2 - h / 2);
    placementsRef.current.set(st.id, { x, y, w, h, rotation: 0 });
    setPlacedIds((prev) => new Set(prev).add(st.id));
    select([{ type: "station", id: st.id }]);
    markDirty();
    rebuildAll();
  };
  const addAsset = (
    kind: string,
    overrides?: {
      label?: string;
      w?: number;
      h?: number;
      shape?: "rect" | "circle";
    },
  ) => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    pushHistory();
    const def = assetMeta(kind);
    const w = overrides?.w ?? def.w;
    const h = overrides?.h ?? def.h;
    const x = snapWorld(ctx.W / 2 - w / 2);
    const y = snapWorld(ctx.H / 2 - h / 2);
    const id = newId("as");
    assetsRef.current.set(id, {
      id,
      kind,
      x,
      y,
      w,
      h,
      rotation: 0,
      label: overrides?.label,
      ...(overrides?.shape === "circle" ? { shape: "circle" as const } : {}),
    });
    setAssetIds((prev) => new Set(prev).add(id));
    const defaultLayer = defaultCadLayerForAssetKind(kind);
    setLayerAssignments((cur) =>
      assignObjectsToLayer(
        cur,
        [id],
        activeCadLayer === "equipment" ? defaultLayer : activeCadLayer,
      ),
    );
    select([{ type: "asset", id }]);
    markDirty();
    rebuildAll();
    return id;
  };
  const addArchitectureAsset = (kind: "column" | "door" | "room") => {
    const labels: Record<"column" | "door" | "room", string> = {
      column: "Structural column",
      door: "Door opening",
      room: "Room / area",
    };
    const tags: Record<"column" | "door" | "room", string> = {
      column: "structure, column",
      door: "architecture, door, opening",
      room: "room, use:unclassified",
    };
    const id = addAsset(kind, { label: labels[kind] });
    if (!id) return;
    const layer = defaultCadLayerForAssetKind(kind, tags[kind]);
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], layer));
    setObjectTags((cur) => ({ ...cur, [id]: tags[kind] }));
    toast.success(`${labels[kind]} agregado.`, "Arquitectura CAD");
  };
  const addCadSymbol = (symbolId: string) => {
    const symbol = getCadSymbol(symbolId);
    if (!symbol) return;
    const kindBySymbol: Record<string, string> = {
      "smt-line": "conveyor",
      inspection: "machine",
      aoi: "aoi",
      "warehouse-rack": "rack",
      packing: "workbench",
      "forklift-path": "agvpath",
      "operator-station": "operator",
      "esd-area": "zone",
      "safety-zone": "zone",
      conveyor: "conveyor",
      "test-station": "machine",
      "rework-station": "workbench",
    };
    const kind = kindBySymbol[symbol.id] ?? "machine";
    const id = addAsset(kind, {
      label: symbol.label,
      w: symbol.defaultWidth,
      h: symbol.defaultHeight,
    });
    if (id) {
      const layer = symbol.layer as CadLayerId;
      if (DEFAULT_CAD_LAYERS.some((item) => item.id === layer))
        setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], layer));
      toast.success(`${symbol.label} agregado al layout.`, "Símbolos CAD");
    }
  };
  // Suelta un objeto inteligente de un Industry Pack (CAD-NEXT-090/091): el pack
  // proyecta la instancia a una entidad canónica y reutilizamos addAsset. El
  // tanque llega con shape:'circle' → se dibuja como disco (CAD-NEXT-020). El
  // toast muestra los cálculos de negocio del propio objeto.
  const addIndustryObject = (objectId: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const def = INDUSTRY_REGISTRY.getObject(objectId);
    if (!def) return;
    const instance: SmartObjectInstance = {
      id: newId("as"),
      objectId,
      x: 0,
      y: 0,
      props: {},
    };
    // TODAS las cajas del objeto inteligente (CAD-NEXT-094): la línea de cajas
    // trae mueble + zona de fila; antes sólo la primera sobrevivía al drop.
    const entities = def
      .toEntities(instance)
      .filter(
        (e): e is Extract<CadEntity, { type: "box" }> => e.type === "box",
      );
    if (!entities.length) return;
    pushHistory();
    const primary = entities[0];
    const baseX = snapWorld(ctx.W / 2 - primary.w / 2);
    const baseY = snapWorld(ctx.H / 2 - primary.h / 2);
    const created: SelItem[] = [];
    const tagUpdates: Record<string, string> = {};
    for (const entity of entities) {
      const id = newId("as");
      const renderKind =
        entity.shape === "circle" || entity.kind === "zone"
          ? "zone"
          : "machine";
      // Offset relativo al primario: la fila queda DETRÁS de la caja, como la
      // definió el pack, no encimada en el centro.
      assetsRef.current.set(id, {
        id,
        kind: renderKind,
        x: baseX + (entity.x - primary.x),
        y: baseY + (entity.y - primary.y),
        w: entity.w,
        h: entity.h,
        rotation: entity.rotation ?? 0,
        label: entity.label,
        ...(entity.shape === "circle" ? { shape: "circle" as const } : {}),
      });
      created.push({ type: "asset", id });
      tagUpdates[id] = `industry:${def.industry}, ${objectId}`;
    }
    setAssetIds((prev) => {
      const next = new Set(prev);
      for (const c of created) next.add(c.id);
      return next;
    });
    const defaultLayer = defaultCadLayerForAssetKind("machine");
    setLayerAssignments((cur) =>
      assignObjectsToLayer(
        cur,
        created.map((c) => c.id),
        activeCadLayer === "equipment" ? defaultLayer : activeCadLayer,
      ),
    );
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    select(created);
    markDirty();
    rebuildAll();
    const calc = def.calculate?.(instance) ?? {};
    const summary = Object.entries(calc)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ");
    toast.success(
      `${def.label} agregada${entities.length > 1 ? ` (${entities.length} objetos)` : ""}${summary ? ` — ${summary}` : ""}.`,
      "Industry Pack",
    );
  };
  const applyCadTemplate = (templateId: CadLayoutTemplateId) => {
    const ctx = ctxRef.current;
    const fp = data?.footprint;
    if (!ctx || !fp) {
      toast.error(
        "No hay footprint listo para aplicar la plantilla.",
        "Plantillas CAD",
      );
      return;
    }
    const generated = instantiateCadLayoutTemplate(templateId, {
      width: fp.footprintW || ctx.W,
      height: fp.footprintH || ctx.H,
      gridSize: fp.gridSize || 100,
    });
    recordLocalSnapshot(
      `Auto · antes de plantilla ${generated.template.label}`,
      "command",
    );
    pushHistory();
    const created: SelItem[] = [];
    const idByRef = new Map<string, string>();
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};
    for (const item of generated.assets) {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      idByRef.set(item.ref, id);
      created.push({ type: "asset", id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = [generated.template.id, ...item.tags].join(", ");
    }
    let noteCount = 0;
    for (const item of generated.annotations) {
      const id = newId("nt");
      annotationsRef.current.set(id, {
        id,
        type: "text",
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)
          ?.color,
      });
      noteCount++;
    }
    let connectorCount = 0;
    for (const connector of generated.connectors) {
      const from = idByRef.get(connector.fromRef);
      const to = idByRef.get(connector.toRef);
      if (!from || !to) continue;
      connectorsRef.current = [
        ...connectorsRef.current,
        { from, to, kind: connector.kind },
      ];
      connectorCount++;
    }
    const flowRefs = generated.connectors.flatMap((connector, idx) =>
      idx === 0 ? [connector.fromRef, connector.toRef] : [connector.toRef],
    );
    const flowNodes = [...new Set(flowRefs)]
      .map((ref): CadFlowNode | null => {
        const id = idByRef.get(ref);
        if (!id) return null;
        const item = assetsRef.current.get(id);
        return item
          ? {
              id,
              label: item.label ?? item.id,
              x: item.x + item.w / 2,
              y: item.y + item.h / 2,
            }
          : null;
      })
      .filter((node): node is CadFlowNode => !!node);
    if (flowNodes.length >= 2) {
      setFlowSequence(flowNodes);
      setFlowSegments(buildFlowSegments(flowNodes));
      setFlowHealth(scoreFlowLayout(flowNodes));
    }
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 80));
    markDirty();
    rebuildAll();
    refreshSnap();
    const scaled =
      generated.scale < 1
        ? ` · escala ${Math.round(generated.scale * 100)}%`
        : "";
    toast.success(
      `${generated.template.label}: ${created.length} objetos, ${connectorCount} flujos, ${noteCount} notas${scaled}.`,
      "Plantillas CAD",
    );
    if (generated.warnings[0])
      toast.error(generated.warnings[0], "Plantillas CAD");
  };
  const setRackGeneratorField = <K extends keyof CadRackRowGeneratorInput>(
    field: K,
    value: CadRackRowGeneratorInput[K],
  ) => {
    setRackGenerator((state) => ({ ...state, [field]: value }));
  };
  const setDockGeneratorField = <K extends keyof CadDockStagingGeneratorInput>(
    field: K,
    value: CadDockStagingGeneratorInput[K],
  ) => {
    setDockGenerator((state) => ({ ...state, [field]: value }));
  };
  const setSupermarketGeneratorField = <
    K extends keyof CadSupermarketGeneratorInput,
  >(
    field: K,
    value: CadSupermarketGeneratorInput[K],
  ) => {
    setSupermarketGenerator((state) => ({ ...state, [field]: value }));
  };
  const applyRackRowGenerator = () => {
    const ctx = ctxRef.current;
    const fp = data?.footprint;
    if (!ctx || !fp) {
      toast.error(
        "No hay footprint listo para generar racks.",
        "Generador warehouse",
      );
      return;
    }
    const generated = generateWarehouseRackRows(rackGenerator, {
      width: fp.footprintW || ctx.W,
      height: fp.footprintH || ctx.H,
      gridSize: fp.gridSize || 100,
    });
    recordLocalSnapshot("Auto - antes de generar racks warehouse", "command");
    pushHistory();
    const created: SelItem[] = [];
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};

    for (const item of generated.assets) {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      created.push({ type: "asset", id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = item.tags.join(", ");
    }
    for (const item of generated.annotations) {
      const id = newId("nt");
      annotationsRef.current.set(id, {
        id,
        type: "text",
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)
          ?.color,
      });
    }

    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 120));
    markDirty();
    rebuildAll();
    refreshSnap();
    const scaled =
      generated.scale < 1
        ? ` - escala ${Math.round(generated.scale * 100)}%`
        : "";
    toast.success(
      `${generated.summary.rackCount} racks, ${generated.summary.aisleCount} pasillos y ${generated.summary.labelCount} etiquetas${scaled}.`,
      "Generador warehouse",
    );
    if (generated.warnings[0])
      toast.error(generated.warnings[0], "Generador warehouse");
  };
  const applyDockStagingGenerator = () => {
    const ctx = ctxRef.current;
    const fp = data?.footprint;
    if (!ctx || !fp) {
      toast.error(
        "No hay footprint listo para generar docks.",
        "Generador dock",
      );
      return;
    }
    const generated = generateWarehouseDockStaging(dockGenerator, {
      width: fp.footprintW || ctx.W,
      height: fp.footprintH || ctx.H,
      gridSize: fp.gridSize || 100,
    });
    recordLocalSnapshot("Auto - antes de generar docks y staging", "command");
    pushHistory();
    const created: SelItem[] = [];
    const idByRef = new Map<string, string>();
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};

    for (const item of generated.assets) {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      idByRef.set(item.ref, id);
      created.push({ type: "asset", id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = item.tags.join(", ");
    }

    for (const item of generated.annotations) {
      const id = newId("nt");
      annotationsRef.current.set(id, {
        id,
        type: "text",
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)
          ?.color,
      });
    }

    const nextConnectors = [...connectorsRef.current];
    let connectorCount = 0;
    for (const connector of generated.connectors) {
      const from = idByRef.get(connector.fromRef);
      const to = idByRef.get(connector.toRef);
      if (!from || !to) continue;
      if (
        !nextConnectors.some(
          (item) =>
            item.from === from &&
            item.to === to &&
            (item.kind ?? "flow") === connector.kind,
        )
      ) {
        nextConnectors.push({ from, to, kind: connector.kind });
        connectorCount++;
      }
    }
    connectorsRef.current = nextConnectors;

    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 140));
    markDirty();
    rebuildAll();
    refreshSnap();
    const scaled =
      generated.scale < 1
        ? ` - escala ${Math.round(generated.scale * 100)}%`
        : "";
    toast.success(
      `${generated.summary.dockCount} docks, ${generated.summary.stagingLaneCount} staging, ${generated.summary.palletCount} pallets, ${connectorCount} flujos${scaled}.`,
      "Generador dock",
    );
    if (generated.warnings[0])
      toast.error(generated.warnings[0], "Generador dock");
  };
  const applySupermarketGenerator = () => {
    const ctx = ctxRef.current;
    const fp = data?.footprint;
    if (!ctx || !fp) {
      toast.error(
        "No hay footprint listo para generar kitting.",
        "Generador kitting",
      );
      return;
    }
    const generated = generateWarehouseSupermarketKitting(
      supermarketGenerator,
      {
        width: fp.footprintW || ctx.W,
        height: fp.footprintH || ctx.H,
        gridSize: fp.gridSize || 100,
      },
    );
    recordLocalSnapshot(
      "Auto - antes de generar supermarket/kitting",
      "command",
    );
    pushHistory();
    const created: SelItem[] = [];
    const idByRef = new Map<string, string>();
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};

    for (const item of generated.assets) {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: item.kind,
        label: item.label,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation ?? 0,
      });
      idByRef.set(item.ref, id);
      created.push({ type: "asset", id });
      layerUpdates[id] = item.layer;
      tagUpdates[id] = item.tags.join(", ");
    }

    for (const item of generated.annotations) {
      const id = newId("nt");
      annotationsRef.current.set(id, {
        id,
        type: "text",
        text: item.text,
        x: item.x,
        y: item.y,
        color: cadLayersRef.current.find((layer) => layer.id === item.layer)
          ?.color,
      });
    }

    let connectorCount = 0;
    for (const connector of generated.connectors) {
      const from = idByRef.get(connector.fromRef);
      const to = idByRef.get(connector.toRef);
      if (!from || !to) continue;
      connectorsRef.current = [
        ...connectorsRef.current,
        { from, to, kind: connector.kind },
      ];
      connectorCount++;
    }

    const flowRefs = generated.connectors.flatMap((connector, idx) =>
      idx === 0 ? [connector.fromRef, connector.toRef] : [connector.toRef],
    );
    const flowNodes = [...new Set(flowRefs)]
      .map((ref): CadFlowNode | null => {
        const id = idByRef.get(ref);
        if (!id) return null;
        const item = assetsRef.current.get(id);
        return item
          ? {
              id,
              label: item.label ?? item.id,
              x: item.x + item.w / 2,
              y: item.y + item.h / 2,
            }
          : null;
      })
      .filter((node): node is CadFlowNode => !!node);
    if (flowNodes.length >= 2) {
      setFlowSequence(flowNodes);
      setFlowSegments(buildFlowSegments(flowNodes));
      setFlowHealth(scoreFlowLayout(flowNodes));
    }

    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (created.length) select(created.slice(0, 120));
    markDirty();
    rebuildAll();
    refreshSnap();
    const scaled =
      generated.scale < 1
        ? ` - escala ${Math.round(generated.scale * 100)}%`
        : "";
    toast.success(
      `${generated.summary.laneCount} lanes, ${generated.summary.cartCount} carts y ${connectorCount} conectores${scaled}.`,
      "Generador kitting",
    );
    if (generated.warnings[0])
      toast.error(generated.warnings[0], "Generador kitting");
  };
  const fallbackLayerForItem = (item: SelItem): CadLayerId =>
    item.type === "station" ? "layout" : defaultLayerForAsset(item.id);
  const isItemLayerLocked = (item: SelItem) =>
    isObjectLayerLocked(
      cadLayersRef.current,
      layerAssignmentsRef.current,
      item.id,
      fallbackLayerForItem(item),
    );
  const editableItems = (items: SelItem[], action: string) => {
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return [];
    }
    const locked = items.filter(isItemLayerLocked);
    if (locked.length)
      toast.error(
        `${locked.length} objeto(s) omitido(s): su capa está bloqueada para ${action}.`,
        "Capas",
      );
    return items.filter((item) => !isItemLayerLocked(item));
  };

  const removeSelected = () => {
    const items = editableItems(selRef.current, "eliminar");
    if (!items.length) return;
    pushHistory();
    let delSt = false,
      delAs = false;
    items.forEach((it) => {
      if (it.type === "station") {
        placementsRef.current.delete(it.id);
        delSt = true;
      } else {
        assetsRef.current.delete(it.id);
        delAs = true;
      }
    });
    if (delSt) setPlacedIds(new Set(placementsRef.current.keys()));
    if (delAs) setAssetIds(new Set(assetsRef.current.keys()));
    select([]);
    markDirty();
    rebuildAll();
  };
  const rotateSelected = (deg: number) => {
    const items = editableItems(selRef.current, "rotar");
    const ctx = ctxRef.current;
    if (!items.length || !ctx) return;
    pushHistory();
    if (items.length >= 2) {
      // Rotación de GRUPO (ADR §223): los centros orbitan el centroide de la
      // selección además de girar cada objeto — antes cada uno giraba en su
      // sitio y la celda se deshacía.
      const boxes = items
        .map((it) => getPlaceRef(it))
        .filter((p): p is NonNullable<typeof p> => !!p);
      const cx = boxes.reduce((s, p) => s + p.x + p.w / 2, 0) / boxes.length;
      const cy = boxes.reduce((s, p) => s + p.y + p.h / 2, 0) / boxes.length;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      boxes.forEach((p) => {
        const ox = p.x + p.w / 2 - cx;
        const oy = p.y + p.h / 2 - cy;
        p.x = Math.max(
          0,
          Math.min(ctx.W - p.w, Math.round(cx + ox * cos - oy * sin - p.w / 2)),
        );
        p.y = Math.max(
          0,
          Math.min(ctx.H - p.h, Math.round(cy + ox * sin + oy * cos - p.h / 2)),
        );
        p.rotation = (((p.rotation + deg) % 360) + 360) % 360;
      });
    } else {
      items.forEach((it) => {
        const p = getPlaceRef(it);
        if (p) p.rotation = (((p.rotation + deg) % 360) + 360) % 360;
      });
    }
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  // Bloques CAD reutilizables (ADR §224): celdas estándar guardadas UNA vez e
  // insertables en cualquier layout del tenant. La inserción llega agrupada.
  const saveSelectionAsBlock = async () => {
    const assets = selRef.current.filter((s) => s.type === "asset");
    if (!assets.length) {
      toast.error(
        "Selecciona los equipos/activos que forman el bloque.",
        "Bloques",
      );
      return;
    }
    const name = (
      typeof window !== "undefined"
        ? window.prompt("Nombre del bloque (ej. Celda SMT estándar):")
        : ""
    )?.trim();
    if (!name) return;
    const sources = assets
      .map((it) => assetsRef.current.get(it.id))
      .filter((a): a is Asset => !!a);
    const minX = Math.min(...sources.map((a) => a.x));
    const minY = Math.min(...sources.map((a) => a.y));
    const payload = sources.map((a) => ({
      ...a,
      x: a.x - minX,
      y: a.y - minY,
      ...(layerAssignmentsRef.current[a.id]
        ? { layer: layerAssignmentsRef.current[a.id] }
        : {}),
    }));
    try {
      const r = await legacyCadFetch("cad-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, assets: payload }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d?.message || "No se pudo guardar el bloque.", "Bloques");
        return;
      }
      toast.success(
        `Bloque "${name}" guardado (${payload.length} objetos) — disponible en todos los layouts.`,
        "Bloques",
      );
      void loadCadBlocks();
    } catch {
      toast.error("Error de red al guardar el bloque.", "Bloques");
    }
  };
  const insertCadBlock = (block: CadBlockRow) => {
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    if (!ctx || !block.assets.length) return;
    pushHistory();
    const bw = Math.max(...block.assets.map((a) => a.x + a.w));
    const bh = Math.max(...block.assets.map((a) => a.y + a.h));
    const cx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const cy = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    const ox = Math.max(0, Math.min(ctx.W - bw, Math.round(cx - bw / 2)));
    const oy = Math.max(0, Math.min(ctx.H - bh, Math.round(cy - bh / 2)));
    const gid = newId("grp");
    const created: SelItem[] = [];
    const groupUpdates: Record<string, string> = {};
    block.assets.forEach((a) => {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: a.kind,
        label: a.label,
        x: ox + a.x,
        y: oy + a.y,
        w: a.w,
        h: a.h,
        rotation: a.rotation ?? 0,
      });
      const layer =
        a.layer && DEFAULT_CAD_LAYERS.some((l) => l.id === a.layer)
          ? (a.layer as CadLayerId)
          : defaultCadLayerForAssetKind(a.kind);
      setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], layer));
      groupUpdates[id] = gid;
      created.push({ type: "asset", id });
    });
    setObjectGroups((cur) => ({ ...cur, ...groupUpdates }));
    setAssetIds(new Set(assetsRef.current.keys()));
    select(created);
    markDirty();
    rebuildAll();
    toast.success(
      `Bloque "${block.name}" insertado como grupo (${created.length} objetos).`,
      "Bloques",
    );
  };
  const deleteCadBlock = async (block: CadBlockRow) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `¿Borrar el bloque "${block.name}" de la biblioteca del tenant?`,
      )
    )
      return;
    try {
      const r = await legacyCadFetch(`cad-blocks/${block.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        toast.error("No se pudo borrar el bloque.", "Bloques");
        return;
      }
      setCadBlocks((cur) => cur.filter((b) => b.id !== block.id));
      toast.success(`Bloque "${block.name}" borrado.`, "Bloques");
    } catch {
      toast.error("Error de red.", "Bloques");
    }
  };
  // La biblioteca se refresca al abrir el editor (no por layout: es del tenant).

  useEffect(() => {
    if (open) void loadCadBlocks();
  }, [loadCadBlocks, open]);
  // Grupos CAD (Ctrl+G, ADR §223): los miembros se seleccionan/mueven/copian
  // como unidad; Alt+clic entra al objeto individual. Solo assets — las
  // estaciones se agrupan con Celdas (concepto de manufactura, no de dibujo).
  const groupSelection = () => {
    const assets = selRef.current.filter((s) => s.type === "asset");
    const stations = selRef.current.length - assets.length;
    if (assets.length < 2) {
      toast.error(
        "Selecciona al menos 2 equipos/activos para agrupar.",
        "Grupos",
      );
      return;
    }
    // Agrupar es una acción DELIBERADA y discreta, así que deja su punto de
    // deshacer. No lo tenía: sólo ensuciaba, de modo que un Ctrl+Z posterior
    // saltaba al checkpoint ANTERIOR y se llevaba por delante la acción previa
    // además del grupo. Desde que los grupos sobreviven al guardado (PR #33),
    // poder deshacerlos importa de verdad.
    pushHistory();
    const gid = newId("grp");
    setObjectGroups((cur) => {
      const next = { ...cur };
      assets.forEach((it) => {
        next[it.id] = gid;
      });
      return next;
    });
    markDirty();
    toast.success(
      `Grupo creado con ${assets.length} objeto(s)${stations ? ` (${stations} estación(es) fuera — usa Celdas)` : ""}. Alt+clic selecciona individual.`,
      "Grupos",
    );
  };
  const ungroupSelection = () => {
    const gids = new Set(
      selRef.current
        .map((it) => objectGroupsRef.current[it.id])
        .filter(Boolean),
    );
    if (!gids.size) {
      toast.error("La selección no tiene grupos.", "Grupos");
      return;
    }
    // Igual que agrupar: disolver es discreto y deshacerlo tiene que devolver
    // los grupos, no la acción de antes.
    pushHistory();
    setObjectGroups((cur) =>
      Object.fromEntries(
        Object.entries(cur).filter(([, gid]) => !gids.has(gid)),
      ),
    );
    markDirty();
    toast.success(`${gids.size} grupo(s) disueltos.`, "Grupos");
  };
  /** Expande un item a su grupo completo (v1: grupos solo de assets). */
  const expandGroupMembers = (item: SelItem): SelItem[] => {
    if (item.type !== "asset") return [item];
    const gid = objectGroupsRef.current[item.id];
    if (!gid) return [item];
    const members: SelItem[] = [];
    assetsRef.current.forEach((_, id) => {
      if (objectGroupsRef.current[id] === gid)
        members.push({ type: "asset", id });
    });
    return members.length ? members : [item];
  };
  // Portapapeles CAD (ADR §220): Ctrl+C copia los assets seleccionados (las
  // estaciones son del routing, no viajan); Ctrl+V pega aquí o en OTRO layout.
  const copySelection = () => {
    const assets = selRef.current.filter((s) => s.type === "asset");
    const stations = selRef.current.length - assets.length;
    if (!assets.length) {
      toast.error(
        stations
          ? "Las estaciones no se copian (routing); selecciona equipos/activos."
          : "Selecciona objetos para copiar.",
        "Portapapeles",
      );
      return;
    }
    CAD_CLIPBOARD.items = assets.flatMap((it) => {
      const src = assetsRef.current.get(it.id);
      if (!src) return [];
      return [
        {
          kind: src.kind,
          label: src.label,
          x: src.x,
          y: src.y,
          w: src.w,
          h: src.h,
          rotation: src.rotation,
          layer: layerAssignmentsRef.current[it.id],
          tags: objectTagsRef.current[it.id],
          group: objectGroupsRef.current[it.id],
        },
      ];
    });
    toast.success(
      `${CAD_CLIPBOARD.items.length} objeto(s) copiados${stations ? ` (${stations} estación(es) omitidas)` : ""}.`,
      "Portapapeles",
    );
  };
  const pasteClipboard = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!CAD_CLIPBOARD.items.length) {
      toast.error(
        "El portapapeles CAD está vacío (Ctrl+C primero).",
        "Portapapeles",
      );
      return;
    }
    pushHistory();
    const off = data?.footprint.gridSize || 200;
    const created: SelItem[] = [];
    const tagUpdates: Record<string, string> = {};
    const gidMap = new Map<string, string>();
    const groupUpdates: Record<string, string> = {};
    CAD_CLIPBOARD.items.forEach((clip) => {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: clip.kind,
        label: clip.label,
        x: Math.max(0, Math.min(ctx.W - clip.w, clip.x + off)),
        y: Math.max(0, Math.min(ctx.H - clip.h, clip.y + off)),
        w: clip.w,
        h: clip.h,
        rotation: clip.rotation,
      });
      const layer =
        (clip.layer as CadLayerId | undefined) ??
        defaultCadLayerForAssetKind(clip.kind, clip.tags);
      setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], layer));
      if (clip.tags) tagUpdates[id] = clip.tags;
      if (clip.group) {
        if (!gidMap.has(clip.group)) gidMap.set(clip.group, newId("grp"));
        groupUpdates[id] = gidMap.get(clip.group)!;
      }
      created.push({ type: "asset", id });
    });
    if (Object.keys(tagUpdates).length)
      setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (Object.keys(groupUpdates).length)
      setObjectGroups((cur) => ({ ...cur, ...groupUpdates }));
    setAssetIds(new Set(assetsRef.current.keys()));
    select(created);
    markDirty();
    rebuildAll();
    toast.success(`${created.length} objeto(s) pegados.`, "Portapapeles");
  };
  const duplicateSelected = () => {
    const assets = editableItems(
      selRef.current.filter((s) => s.type === "asset"),
      "duplicar",
    );
    if (!assets.length) return;
    const ctx = ctxRef.current!;
    const off = data?.footprint.gridSize || 200;
    pushHistory();
    const created: SelItem[] = [];
    // Las copias de un grupo forman un grupo NUEVO (ADR §223) — no se cuelgan
    // del original, o mover la copia arrastraría la celda fuente.
    const gidMap = new Map<string, string>();
    const groupUpdates: Record<string, string> = {};
    assets.forEach((it) => {
      const src = assetsRef.current.get(it.id);
      if (!src) return;
      const id = newId("as");
      assetsRef.current.set(id, {
        ...src,
        id,
        x: Math.max(0, Math.min(ctx.W - src.w, src.x + off)),
        y: Math.max(0, Math.min(ctx.H - src.h, src.y + off)),
      });
      const gid = objectGroupsRef.current[it.id];
      if (gid) {
        if (!gidMap.has(gid)) gidMap.set(gid, newId("grp"));
        groupUpdates[id] = gidMap.get(gid)!;
      }
      created.push({ type: "asset", id });
    });
    if (Object.keys(groupUpdates).length)
      setObjectGroups((cur) => ({ ...cur, ...groupUpdates }));
    setAssetIds(new Set(assetsRef.current.keys()));
    if (created.length) select(created);
    markDirty();
    rebuildAll();
  };
  // ---- array / mirror / offset of the selected equipment (Fase 55) ----
  // Stations can't be cloned (they're tied to routing), so these act on assets.
  const commitCreated = (created: SelItem[], msg: string) => {
    setAssetIds(new Set(assetsRef.current.keys()));
    if (created.length) {
      select(created);
      markDirty();
      rebuildAll();
      toast.success(`${created.length} ${msg}`, "3D");
    }
  };
  // ---- trace the DXF backdrop into editable walls (Fase 58) ----
  // Turns the read-only plan behind the layout into real `wall` assets placed
  // exactly over it — the leap from "drawing on top of a plan" to editing it.
  const importDxfWalls = () => {
    const dm = dxfModelRef.current;
    const meta = dxfMetaRef.current;
    if (!dm || !meta) {
      toast.error("Primero carga un plano DXF de fondo.", "DXF");
      return;
    }
    const { walls, truncated, segmentsConsidered } = dxfToWalls(dm, meta, {
      thickness: assetMeta("wall").h,
    });
    if (!walls.length) {
      toast.error(
        segmentsConsidered
          ? "El plano sólo tiene tramos muy cortos para muros."
          : "El plano no tiene líneas para convertir.",
        "DXF",
      );
      return;
    }
    pushHistory();
    const created: SelItem[] = [];
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};
    for (const wl of walls) {
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: "wall",
        x: wl.x,
        y: wl.y,
        w: wl.w,
        h: wl.h,
        rotation: wl.rotation,
        label: "Muro (plano)",
      });
      layerUpdates[id] = "architecture";
      tagUpdates[id] = "dxf, editable-wall, architecture";
      created.push({ type: "asset", id });
    }
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    commitCreated(
      created,
      truncated
        ? `muros del plano (recortado a ${walls.length})`
        : "muros importados del plano",
    );
  };
  const dxfPrimitiveBounds = (primitives: CadDxfPrimitive[]) => {
    // Las curvas aportan su EXTENSIÓN real (teselada), no sólo su centro: así la
    // normalización coincide con la del backdrop (parseDxf también tesela) y lo
    // convertido cae encima de lo que se ve (CAD-NEXT-062).
    const points = primitives.flatMap((primitive) => {
      const curve = tessellateDxfPrimitive(primitive, 24);
      if (curve && curve.length) return curve;
      if (
        primitive.kind === "circle" &&
        primitive.points[0] &&
        primitive.radius
      ) {
        const c = primitive.points[0];
        return [
          { x: c.x - primitive.radius, y: c.y - primitive.radius },
          { x: c.x + primitive.radius, y: c.y + primitive.radius },
        ];
      }
      return primitive.points;
    });
    if (!points.length) return null;
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  };
  const projectDxfPoint = (
    point: CadDxfPoint,
    bounds: NonNullable<ReturnType<typeof dxfPrimitiveBounds>>,
    modelRef: DxfModel,
    meta: DxfMeta,
  ) =>
    dxfPointToFootprint(
      point.x - bounds.minX,
      bounds.maxY - point.y,
      modelRef,
      meta,
    );
  const createDxfWallAsset = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    label: string,
  ) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 60) return null;
    const thick = assetMeta("wall").h;
    const id = newId("as");
    assetsRef.current.set(id, {
      id,
      kind: "wall",
      label,
      x: (a.x + b.x) / 2 - len / 2,
      y: (a.y + b.y) / 2 - thick / 2,
      w: len,
      h: thick,
      rotation: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
    return id;
  };
  const convertDxfPrimitivesToEditable = () => {
    const preview = dxfImportPreview;
    const dm = dxfModelRef.current;
    const meta = dxfMetaRef.current;
    if (!preview || !dm || !meta) {
      toast.error("Carga un DXF antes de convertir entidades.", "DXF");
      return;
    }
    const hatchBoundaryPrimitives: CadDxfPrimitive[] = preview.hatches.flatMap(
      (hatch) =>
        hatch.boundaries.map((points) => ({
          kind: "polyline" as const,
          layer: hatch.layer,
          points,
        })),
    );
    const mtextAnchorPrimitives: CadDxfPrimitive[] = preview.mtexts.map(
      (mtext) => ({
        kind: "text",
        layer: mtext.layer,
        points: [mtext.insertion],
        text: mtext.text,
      }),
    );
    const dimensionPointPrimitives: CadDxfPrimitive[] =
      preview.semanticDimensions.map((dimension) => ({
        kind: "polyline",
        layer: dimension.layer,
        points: [
          dimension.a,
          dimension.b,
          ...(dimension.c ? [dimension.c] : []),
        ],
      }));
    const mleaderPointPrimitives: CadDxfPrimitive[] = preview.mleaders.flatMap(
      (mleader) => [
        ...(mleader.leaderLines ?? [mleader.vertices]).map((points) => ({
          kind: "polyline" as const,
          layer: mleader.layer,
          points,
        })),
        {
          kind: "text" as const,
          layer: mleader.layer,
          points: [mleader.textPosition],
          text: mleader.text,
        },
      ],
    );
    const bounds = dxfPrimitiveBounds([
      ...preview.primitives,
      ...hatchBoundaryPrimitives,
      ...mtextAnchorPrimitives,
      ...dimensionPointPrimitives,
      ...mleaderPointPrimitives,
    ]);
    if (!bounds) {
      toast.error(
        "El DXF no tiene entidades soportadas para convertir.",
        "DXF",
      );
      return;
    }
    recordLocalSnapshot("Auto · antes de convertir DXF", "import");
    pushHistory();
    const created: SelItem[] = [];
    const nativeHatches = cadDxfHatchesToNativeEntities(preview.hatches, {
      idPrefix: newId("cad"),
      projection: {
        point: (point) => projectDxfPoint(point, bounds, dm, meta),
      },
      provider: "dxf",
    }).slice(0, 850);
    const nativeMTexts = cadDxfMTextsToNativeEntities(preview.mtexts, {
      idPrefix: newId("cad"),
      projection: {
        point: (point) => projectDxfPoint(point, bounds, dm, meta),
      },
      provider: "dxf",
    }).slice(0, Math.max(0, 850 - nativeHatches.length));
    const nativeDimensions = cadDxfSemanticDimensionsToNativeEntities(
      preview.semanticDimensions,
      {
        idPrefix: newId("cad"),
        projection: {
          point: (point) => projectDxfPoint(point, bounds, dm, meta),
        },
        provider: "dxf",
      },
    ).slice(0, Math.max(0, 850 - nativeHatches.length - nativeMTexts.length));
    const nativeMleaders = cadDxfMleadersToNativeEntities(preview.mleaders, {
      idPrefix: newId("cad"),
      projection: {
        point: (point) => projectDxfPoint(point, bounds, dm, meta),
      },
      provider: "dxf",
    }).slice(
      0,
      Math.max(
        0,
        850 -
          nativeHatches.length -
          nativeMTexts.length -
          nativeDimensions.length,
      ),
    );
    const importedBlockParts = cadDxfBlocksToCadDocumentParts(
      preview.blocks,
      preview.inserts,
      {
        idPrefix: newId("cad"),
        projection: {
          point: (point) => projectDxfPoint(point, bounds, dm, meta),
        },
        provider: "dxf",
      },
    );
    const nativeCreated: CadNativeEntity[] = [
      ...nativeHatches,
      ...nativeMTexts,
      ...nativeDimensions,
      ...nativeMleaders,
      ...importedBlockParts.inserts,
    ];
    const layerUpdates: Record<string, CadLayerId> = {};
    const tagUpdates: Record<string, string> = {};
    let notes = 0;
    let truncated =
      preview.hatches.length +
        preview.mtexts.length +
        preview.semanticDimensions.length +
        preview.mleaders.length >
      nativeCreated.length;
    const cap = 850;
    for (const [primitiveIndex, primitive] of preview.primitives.entries()) {
      if (
        preview.inserts.length &&
        preview.primitiveSources[primitiveIndex] === "insert"
      )
        continue;
      if (created.length + nativeCreated.length >= cap) {
        truncated = true;
        break;
      }
      const points = primitive.points.map((point) =>
        projectDxfPoint(point, bounds, dm, meta),
      );
      if (primitive.kind === "text" && points[0] && primitive.text) {
        const id = newId("nt");
        annotationsRef.current.set(id, {
          id,
          type: "text",
          x: snapWorld(points[0].x),
          y: snapWorld(points[0].y),
          text: primitive.text.slice(0, 80),
        });
        notes++;
        continue;
      }
      if (
        primitive.kind === "arc" ||
        primitive.kind === "ellipse" ||
        primitive.kind === "spline"
      ) {
        const imported = cadDxfCurvesToNativeEntities([primitive], {
          idPrefix: newId("cad"),
          projection: {
            point: (point) => projectDxfPoint(point, bounds, dm, meta),
          },
          provider: "dxf",
        });
        nativeCreated.push(...imported);
        continue;
      }
      if (primitive.kind === "rect" && points.length >= 4) {
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        if (maxX - minX >= 80 && maxY - minY >= 80) {
          const id = newId("as");
          assetsRef.current.set(id, {
            id,
            kind: "zone",
            label: `DXF zone · ${primitive.layer}`,
            x: snapWorld(minX),
            y: snapWorld(minY),
            w: snapWorld(maxX - minX),
            h: snapWorld(maxY - minY),
            rotation: 0,
          });
          created.push({ type: "asset", id });
          layerUpdates[id] = mapDxfLayerToCadLayer(primitive.layer, "layout");
          tagUpdates[id] = `dxf, dxf-layer:${primitive.layer}, editable-zone`;
        }
        continue;
      }
      // Un CIRCLE del DXF llega como centro (points[0]) + radio: se materializa
      // como un asset redondo de verdad (shape:'circle', CAD-NEXT-020) en vez de
      // perderse por tener un solo punto. Cierra el round-trip dibujo→DXF→reimport.
      if (primitive.kind === "circle" && points[0] && primitive.radius) {
        const r = primitive.radius * (Number(meta.scale) || 1);
        if (r * 2 >= 80) {
          const d = snapWorld(r * 2);
          const id = newId("as");
          assetsRef.current.set(id, {
            id,
            kind: "zone",
            label: `DXF círculo · ${primitive.layer}`,
            x: snapWorld(points[0].x - r),
            y: snapWorld(points[0].y - r),
            w: d,
            h: d,
            rotation: 0,
            shape: "circle",
          });
          created.push({ type: "asset", id });
          layerUpdates[id] = mapDxfLayerToCadLayer(primitive.layer, "layout");
          tagUpdates[id] = `dxf, dxf-layer:${primitive.layer}, editable-circle`;
        }
        continue;
      }
      const chain = points;
      for (let i = 0; i + 1 < chain.length; i++) {
        if (created.length + nativeCreated.length >= cap) {
          truncated = true;
          break;
        }
        const id = createDxfWallAsset(
          chain[i],
          chain[i + 1],
          `DXF line · ${primitive.layer}`,
        );
        if (id) {
          created.push({ type: "asset", id });
          layerUpdates[id] = mapDxfLayerToCadLayer(
            primitive.layer,
            "architecture",
          );
          tagUpdates[id] =
            `dxf, dxf-layer:${primitive.layer}, editable-wall, architecture`;
        }
      }
    }
    if (!created.length && !nativeCreated.length && !notes) {
      toast.error(
        "No se encontraron entidades DXF seguras para convertir.",
        "DXF",
      );
      return;
    }
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => ({ ...cur, ...layerUpdates }));
    setObjectTags((cur) => ({ ...cur, ...tagUpdates }));
    if (notes) {
      setDimCount(
        [...annotationsRef.current.values()].filter((ann) => ann.type === "dim")
          .length,
      );
      rebuildDims();
    }
    const importLossManifest = preview.warnings.map((warning) => ({
      code: `dxf_import:${warning.code}`,
      sourceType: warning.entityType ?? "DXF",
      detail: warning.layer
        ? `${warning.message} · layer ${warning.layer}`
        : warning.message,
      severity: "warning" as const,
    }));
    if (truncated)
      importLossManifest.push({
        code: "dxf_import:conversion_truncated",
        sourceType: "DXF",
        detail: `La conversión editable se limitó a ${cap} entidades por seguridad.`,
        severity: "warning",
      });
    if (nativeCreated.length || importLossManifest.length) {
      const current = snapshotDocument();
      const nativeIds = new Set(nativeCreated.map((entity) => entity.id));
      const entities = [
        ...current.entities.filter((entity) => !nativeIds.has(entity.id)),
        ...nativeCreated,
      ].sort((a, b) => a.id.localeCompare(b.id));
      const document = commitChange(
        {
          ...current,
          entities,
          blocks: [...current.blocks, ...importedBlockParts.blocks].sort(
            (a, b) => a.id.localeCompare(b.id),
          ),
          // `entities` va ordenado por id para serializar determinista, pero
          // derivar de ahí el Z-ORDER alfabetizaba el plano ENTERO al importar
          // un DXF: lo que ya estaba dibujado se reordenaba por id y la
          // geometría importada se intercalaba en medio. Lo previo conserva su
          // orden y lo importado entra al frente.
          modelSpace: {
            entityIds: preserveDrawOrder(current.modelSpace.entityIds, [
              ...current.modelSpace.entityIds.filter(
                (id) => !nativeIds.has(id),
              ),
              ...nativeCreated.map((entity) => entity.id),
            ]),
          },
          lossManifest: [...current.lossManifest, ...importLossManifest],
        },
        "import:dxf-native-entities",
      );
      loadedCadDocumentRef.current = document;
      nativeSelectionIdsRef.current = nativeCreated
        .map((entity) => entity.id)
        .slice(0, 80);
      setNativeSelectionIds(nativeSelectionIdsRef.current);
      setNativeEntities(
        document.entities.filter((entity): entity is CadNativeEntity =>
          CAD_ENTITY_REGISTRY.supports(entity),
        ),
      );
      setNativeDocumentRevision((value) => value + 1);
      syncNativeScene(document);
    }
    if (!nativeCreated.length && created.length) select(created.slice(0, 80));
    markDirty();
    rebuildAll();
    toast.success(
      `${created.length} objeto(s), ${nativeCreated.length} entidad(es) nativa(s), ${importedBlockParts.blocks.length} bloque(s) y ${notes} nota(s) convertidos${truncated ? " (recortado por seguridad)" : ""}.`,
      "DXF editable",
    );
  };
  // ---- auto-dimension the layout into a measured drawing (Fase 59) ----
  // Acota lo seleccionado (o todo el layout): medidas generales + cotas
  // encadenadas centro a centro, fuera del recuadro — un plano acotado de un clic.
  const autoDimension = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const sel = selRef.current;
    const boxes: DimBox[] = [];
    const add = (
      b: { x: number; y: number; w: number; h: number } | undefined,
    ) => {
      if (b) boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    };
    if (sel.length > 0) {
      sel.forEach((it) =>
        add(
          it.type === "station"
            ? placementsRef.current.get(it.id)
            : assetsRef.current.get(it.id),
        ),
      );
    } else {
      placementsRef.current.forEach((p) => add(p));
      assetsRef.current.forEach((a) => add(a));
    }
    const fp = data?.footprint;
    const dims = autoDimensions(
      {
        boxes,
        footprintW: fp?.footprintW ?? ctx.W,
        footprintH: fp?.footprintH ?? ctx.H,
        gridSize: fp?.gridSize,
      },
      {},
    );
    if (!dims.length) {
      toast.error("No hay nada que acotar todavía.", "3D");
      return;
    }
    pushHistory();
    for (const d of dims) {
      const id = newId("dim");
      annotationsRef.current.set(id, {
        id,
        type: "dim",
        x: d.x,
        y: d.y,
        x2: d.x2,
        y2: d.y2,
      });
    }
    setDimCount(
      [...annotationsRef.current.values()].filter((a) => a.type === "dim")
        .length,
    );
    markDirty();
    rebuildDims();
    toast.success(
      `${dims.length} ${dims.length === 1 ? "cota generada" : "cotas generadas"}${sel.length ? " (selección)" : ""}`,
      "3D",
    );
  };
  // ---- auto-arrange the placed stations into a tidy line (Fase 61) ----
  // Reacomoda las estaciones colocadas, en el orden en que las entrega el modelo
  // (secuencia de línea), en filas equiespaciadas dentro de la huella.
  const arrangeLineLayout = () => {
    const fp = data?.footprint;
    if (!fp) return;
    const list: ArrangeStation[] = [];
    data!.stations.forEach((st, idx) => {
      const p = placementsRef.current.get(st.id);
      if (p) list.push({ id: st.id, sequence: idx, w: p.w, h: p.h }); // idx = orden de secuencia del API
    });
    if (list.length < 2) {
      toast.error("Coloca al menos 2 estaciones para acomodar la línea.", "3D");
      return;
    }
    const pos = arrangeLine(
      {
        stations: list,
        footprintW: fp.footprintW,
        footprintH: fp.footprintH,
        gridSize: fp.gridSize,
      },
      {},
    );
    recordLocalSnapshot("Auto · antes de acomodar línea", "command");
    pushHistory();
    let moved = 0;
    for (const [id, p] of Object.entries(pos)) {
      const pl = placementsRef.current.get(id);
      if (pl) {
        pl.x = p.x;
        pl.y = p.y;
        moved++;
      }
    }
    markDirty();
    rebuildBlocks();
    refreshSnap();
    toast.success(
      `Línea acomodada — ${moved} ${moved === 1 ? "estación" : "estaciones"}`,
      "3D",
    );
  };
  // ---- auto-connect the placed stations in sequence (material flow) (Fase 62) ----
  // Crea un conector de cada estación a la siguiente en secuencia, fusionando con
  // los conectores existentes (sin duplicar) — el flujo de la línea de un clic.
  const connectLineLayout = () => {
    const list: ConnStation[] = [];
    data?.stations.forEach((st, idx) => {
      if (placementsRef.current.has(st.id))
        list.push({ id: st.id, sequence: idx });
    });
    if (list.length < 2) {
      toast.error("Coloca al menos 2 estaciones para conectar la línea.", "3D");
      return;
    }
    const next = connectLine(list, connectorsRef.current, "flow");
    if (next.length === connectorsRef.current.length) {
      toast.success("La línea ya estaba conectada.", "3D");
      return;
    }
    const added = next.length - connectorsRef.current.length;
    pushHistory();
    connectorsRef.current = next;
    markDirty();
    rebuildBlocks();
    toast.success(
      `Línea conectada — ${added} ${added === 1 ? "enlace nuevo" : "enlaces nuevos"}`,
      "3D",
    );
  };
  // ---- server-side optimisation: minimise material travel (ported from 2D, unify) ----
  const runOptimize = async () => {
    if (!model) return;
    setServerBusy(true);
    try {
      const r = await legacyCadFetch(
        `layout/optimize?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
      );
      if (!r.ok) {
        toast.error("No se pudo optimizar.", "3D");
        return;
      }
      const d = (await r.json()) as {
        positions: {
          id: string;
          x: number;
          y: number;
          w: number;
          h: number;
          rotation: number;
        }[];
        improvedPct: number;
      };
      if (!d.positions?.length) {
        toast.error("No hay estaciones para optimizar.", "3D");
        return;
      }
      recordLocalSnapshot("Auto · antes de optimizar flujo", "command");
      pushHistory();
      d.positions.forEach((p) =>
        placementsRef.current.set(p.id, {
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          rotation: p.rotation,
        }),
      );
      setPlacedIds(new Set(placementsRef.current.keys()));
      markDirty();
      rebuildBlocks();
      refreshSnap();
      toast.success(
        d.improvedPct > 0
          ? `Flujo optimizado: −${d.improvedPct}% de recorrido — revisa y guarda.`
          : "El layout ya estaba óptimo para el flujo.",
        "3D",
      );
    } catch {
      toast.error("No se pudo optimizar.", "3D");
    } finally {
      setServerBusy(false);
    }
  };
  // ---- DXF backdrop upload / remove (ported from 2D, unify) ----
  const onDxfFile = async (file: File) => {
    if (!data) return;
    setDxfBusy(true);
    try {
      const text = await file.text();
      if (text.length > 12_000_000) {
        toast.error("El DXF supera 12 MB.", "3D");
        return;
      }
      // Detección de formato (Fase 74 cableada, ADR §222): un DWG binario jamás
      // pasará el parser de texto — mejor un mensaje accionable que "sin líneas".
      const fmt = detectCadFormat(text);
      // DWG: la razón viene del contrato de interoperabilidad (D5, fuente única
      // de verdad) — nunca se finge soporte sin proveedor licenciado.
      if (fmt.format === "dwg") {
        toast.error(DWG_UNAVAILABLE_REASON, "DXF");
        return;
      }
      if (fmt.format === "unknown")
        toast.error(`${fmt.message} Intentaré leerlo de todos modos.`, "DXF");
      const importPreview = importDxfPrimitives(text);
      setDxfImportPreview(importPreview);
      setDxfWarnings(importPreview.warnings);
      if (importPreview.warnings.length)
        toast.error(
          `DXF cargado con ${importPreview.warnings.length} advertencia(s); revisa el panel DXF para detalles.`,
          "DXF",
        );
      const dxfModel = parseDxf(text);
      if (!dxfModel) {
        toast.error("No se reconocieron líneas en el DXF.", "3D");
        return;
      }
      // La colocación se calcula ANTES de subir y viaja CON la subida. Antes se
      // computaba después, así que el servidor guardaba el plano con su
      // colocación por defecto (`scale: 1` en el origen) mientras el editor
      // mostraba el encaje centrado: al recargar, el plano saltaba de sitio y
      // de escala. Sólo lo repescaba `propagateDxfPlacement` desde el guardado
      // HEREDADO, que no corre cuando hay `documentId`.
      const fp = data.footprint;
      const scale =
        Math.min(
          fp.footprintW / dxfModel.width,
          fp.footprintH / dxfModel.height,
        ) * 0.9 || 1;
      const meta: DxfMeta = {
        offsetX: Math.max(0, (fp.footprintW - dxfModel.width * scale) / 2),
        offsetY: Math.max(0, (fp.footprintH - dxfModel.height * scale) / 2),
        scale,
        rotation: 0,
        visible: true,
        opacity: 0.5,
      };
      const res = await legacyCadFetch("layout/dxf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          revision,
          name: file.name,
          data: text,
          placement: meta,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo guardar el DXF.", "3D");
        return;
      }
      dxfModelRef.current = dxfModel;
      dxfMetaRef.current = meta;
      setHasDxf(true);
      dxfSnapRef.current = dxfSnapPoints(dxfModel, meta);
      rebuildDxfRef.current();
      markDirty();
      toast.success("Plano DXF cargado de fondo.", "3D");
    } catch {
      toast.error("No se pudo leer el archivo DXF.", "3D");
    } finally {
      setDxfBusy(false);
    }
  };
  const removeDxf = async () => {
    setDxfBusy(true);
    try {
      const res = await legacyCadFetch(
        `layout/dxf?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error("No se pudo quitar el DXF.", "3D");
        return;
      }
      dxfModelRef.current = null;
      dxfMetaRef.current = null;
      dxfSnapRef.current = [];
      setHasDxf(false);
      setDxfWarnings([]);
      setDxfImportPreview(null);
      rebuildDxfRef.current();
      markDirty();
      toast.success("Plano DXF quitado.", "3D");
    } catch {
      toast.error("Error de red.", "3D");
    } finally {
      setDxfBusy(false);
    }
  };
  // ---- visión plano→muros (Fase 71 cableada, ADR §217) ----
  const onVisionFile = async (file: File) => {
    if (!data) return;
    if (file.size > 4_000_000) {
      toast.error("La imagen supera 4 MB; reduce la resolución.", "Visión");
      return;
    }
    setVisionBusy(true);
    setVisionPreview(null);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const r = await legacyCadFetch("layout/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, revision, imageDataUrl }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as {
        available: boolean;
        raw: string;
        message?: string;
      };
      if (!body.available || !body.raw) {
        toast.error(
          body.message || "El motor de visión (CIDE) no está disponible.",
          "Visión",
        );
        return;
      }
      // El modelo a veces envuelve el JSON en ```json ... ``` — extrae el bloque.
      const raw = body.raw.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1");
      const result = normalizeVision(raw, data.footprint);
      if (!result.walls.length && !result.zones.length) {
        toast.error(
          result.errors[0] ||
            "El modelo no detectó muros ni zonas en el plano.",
          "Visión",
        );
        return;
      }
      setVisionPreview({ ...result, imageName: file.name });
    } catch {
      toast.error("No se pudo vectorizar el plano.", "Visión");
    } finally {
      setVisionBusy(false);
    }
  };
  const applyVisionResult = () => {
    const ctx = ctxRef.current;
    const vp = visionPreview;
    if (!ctx || !vp) return;
    recordLocalSnapshot(`Auto · Visión ${vp.imageName}`, "command");
    pushHistory();
    const thick = assetMeta("wall").h;
    const created: string[] = [];
    for (const wall of vp.walls) {
      const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
      if (len < 1) continue;
      const cx = (wall.a.x + wall.b.x) / 2,
        cy = (wall.a.y + wall.b.y) / 2;
      const angle =
        (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI;
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: "wall",
        x: cx - len / 2,
        y: cy - thick / 2,
        w: len,
        h: thick,
        rotation: angle,
        label: "Muro (visión)",
      });
      created.push(id);
    }
    const zoneIds: string[] = [];
    for (const zone of vp.zones) {
      const xs = zone.points.map((p) => p.x);
      const ys = zone.points.map((p) => p.y);
      const minX = Math.max(0, Math.min(...xs));
      const maxX = Math.min(ctx.W, Math.max(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxY = Math.min(ctx.H, Math.max(...ys));
      if (maxX - minX < 1 || maxY - minY < 1) continue;
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind: "zone",
        label: zone.name || "Zona (visión)",
        x: Math.round(minX),
        y: Math.round(minY),
        w: Math.round(maxX - minX),
        h: Math.round(maxY - minY),
        rotation: 0,
      });
      zoneIds.push(id);
    }
    setAssetIds(new Set(assetsRef.current.keys()));
    if (created.length)
      setLayerAssignments((cur) =>
        assignObjectsToLayer(cur, created, "architecture"),
      );
    if (zoneIds.length)
      setLayerAssignments((cur) =>
        assignObjectsToLayer(cur, zoneIds, defaultCadLayerForAssetKind("zone")),
      );
    setObjectTags((cur) => {
      const next = { ...cur };
      created.forEach((id) => {
        next[id] = "wall, architecture, vision";
      });
      zoneIds.forEach((id) => {
        next[id] = "zone, vision";
      });
      return next;
    });
    setVisionPreview(null);
    markDirty();
    rebuildAll();
    toast.success(
      `Visión: ${created.length} muro(s) y ${zoneIds.length} zona(s) insertados como objetos editables.`,
      "Visión",
    );
  };
  // ---- versions / scenarios (ported from 2D, unify) ----
  const scopeQs = `model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`;
  const loadVersions = async () => {
    if (!model) return;
    try {
      const r = await legacyCadFetch(`layout/snapshots?${scopeQs}`);
      if (r.ok) setVersions((await r.json()) as typeof versions);
    } catch {
      /* transient */
    }
  };
  const openVersions = () => {
    setShowVersions(true);
    loadVersions();
  };

  const saveLocalSnapshot = (
    reason: "manual" | "command" | "import" | "restore" = "manual",
  ) => {
    const label =
      versName.trim() || `Local ${localSnapshots.snapshots.length + 1}`;
    recordLocalSnapshot(label, reason);
    setVersName("");
    toast.success("Snapshot local guardado en esta sesión.", "Snapshots CAD");
  };
  const restoreLocalSnapshot = (id: string) => {
    const restored = restoreCadSnapshot(localSnapshots, id);
    if (!restored.layout) {
      toast.error("No se encontró el snapshot local.", "Snapshots CAD");
      return;
    }
    pushHistory();
    restore(restored.layout);
    setLocalSnapshots(restored.history);
    setShowVersions(false);
    toast.success("Snapshot local restaurado.", "Snapshots CAD");
  };
  const compareLocalSnapshot = (id: string) => {
    const base = localSnapshots.snapshots.find((item) => item.id === id);
    if (!base) {
      toast.error("No se encontró el snapshot local.", "Snapshots CAD");
      return;
    }
    const current = createCadSnapshot(
      snapshot(),
      "Actual",
      "manual",
      "current",
    );
    const diff = diffCadSnapshots(base, current);
    setSnapshotDiff(diff);
    toast.success(
      diff.changed
        ? "El layout cambió desde ese snapshot."
        : "El layout coincide con ese snapshot.",
      "Snapshots CAD",
    );
  };
  const deleteLocalSnapshot = (id: string) => {
    setLocalSnapshots((history) => ({
      activeId: history.activeId === id ? undefined : history.activeId,
      snapshots: history.snapshots.filter((item) => item.id !== id),
    }));
  };
  const saveVersion = async () => {
    if (!model || drawingReadOnly) return;
    setVersBusy(true);
    try {
      const r = await legacyCadFetch("layout/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          revision,
          name: versName.trim() || undefined,
        }),
      });
      if (!r.ok) {
        toast.error("No se pudo guardar la versión.", "3D");
        return;
      }
      setVersName("");
      toast.success("Versión guardada.", "3D");
      loadVersions();
    } catch {
      toast.error("Error de red.", "3D");
    } finally {
      setVersBusy(false);
    }
  };
  const restoreVersion = async (id: string) => {
    if (!model || drawingReadOnly) return;
    setVersBusy(true);
    try {
      const r = await legacyCadFetch(
        `layout/snapshots/${id}/restore?${scopeQs}`,
        { method: "POST" },
      );
      if (!r.ok) {
        toast.error("No se pudo restaurar la versión.", "3D");
        return;
      }
      toast.success("Versión restaurada.", "3D");
      setShowVersions(false);
      setReloadTick((t) => t + 1); // re-run the load effect
    } catch {
      toast.error("Error de red.", "3D");
    } finally {
      setVersBusy(false);
    }
  };
  const deleteVersion = async (id: string) => {
    if (!model || drawingReadOnly) return;
    try {
      const r = await legacyCadFetch(`layout/snapshots/${id}?${scopeQs}`, {
        method: "DELETE",
      });
      if (r.ok) setVersions((await r.json()) as typeof versions);
    } catch {
      /* transient */
    }
  };
  // ---- clone from another model's layout as a template (ported from 2D, unify) ----
  const cloneFrom = async () => {
    if (!cloneSrc || !model || drawingReadOnly) return;
    const [fromModel, fromRevision] = cloneSrc.split("|");
    setCloneBusy(true);
    try {
      const r = await legacyCadFetch("layout/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromModel,
          fromRevision,
          toModel: model,
          toRevision: revision,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d?.message || "No se pudo clonar.", "3D");
        return;
      }
      toast.success("Layout clonado desde la plantilla.", "3D");
      setShowClone(false);
      setReloadTick((t) => t + 1);
    } catch {
      toast.error("Error de red.", "3D");
    } finally {
      setCloneBusy(false);
    }
  };
  // ---- approval / sign-off (ported from 2D, unify) ----
  const setApprovalStatus = async (status: ApprovalStatus) => {
    if (!model || drawingReadOnly) return;
    setApprovalBusy(true);
    try {
      const r = await legacyCadFetch("layout/approval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, revision, status }),
      });
      if (!r.ok) {
        toast.error("No se pudo cambiar el estado.", "3D");
        return;
      }
      const d = (await r.json()) as { approval?: LayoutApproval };
      setApproval(d.approval ?? { status, by: null, at: null, note: null });
      toast.success(`Layout: ${APPROVAL_META[status].label}.`, "3D");
    } catch {
      toast.error("Error de red.", "3D");
    } finally {
      setApprovalBusy(false);
    }
  };
  // ---- export the station schedule as CSV (ported from 2D, unify) ----
  const exportCsvSchedule = () => {
    if (!data) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const unit = data.footprint.unit || "mm";
    const header = [
      "estacion",
      "linea",
      "colocada",
      `x_${unit}`,
      `y_${unit}`,
      `w_${unit}`,
      `h_${unit}`,
      "rotacion_deg",
      "ctq",
    ];
    const rows = data.stations.map((s) => {
      const p = placementsRef.current.get(s.id);
      return [
        s.station,
        s.line,
        p ? "si" : "no",
        p?.x ?? "",
        p?.y ?? "",
        p?.w ?? "",
        p?.h ?? "",
        p?.rotation ?? "",
        s.ctq ? "si" : "no",
      ]
        .map(esc)
        .join(",");
    });
    const csv = [header.join(","), ...rows].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `estaciones-${model}-${revision}.csv`.replace(
      /[^\w.\-]+/g,
      "_",
    );
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Estaciones exportadas (CSV).", "3D");
  };
  const arrayAssets = (cols: number, rows: number, gap: number) => {
    const sel = selRef.current.filter((s) => s.type === "asset");
    const c = Math.max(1, Math.min(50, Math.round(cols))),
      r = Math.max(1, Math.min(50, Math.round(rows)));
    if (!sel.length || c * r <= 1) return;
    const ctx = ctxRef.current!;
    const g = Math.max(0, Math.round(gap) || 0);
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id);
      if (!src) return;
      for (let i = 0; i < c; i++)
        for (let j = 0; j < r; j++) {
          if (i === 0 && j === 0) continue; // keep the original in place
          const nx = src.x + i * (src.w + g),
            ny = src.y + j * (src.h + g);
          if (nx + src.w > ctx.W || ny + src.h > ctx.H) continue; // skip copies off the plan
          const id = newId("as");
          assetsRef.current.set(id, { ...src, id, x: nx, y: ny });
          created.push({ type: "asset", id });
        }
    });
    commitCreated(created, "copia(s) en arreglo.");
  };
  const mirrorAssets = (axis: "h" | "v") => {
    const sel = editableItems(
      selRef.current.filter((s) => s.type === "asset"),
      "crear espejos",
    );
    if (!sel.length) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id);
      if (!src) return;
      const id = newId("as");
      const nx = axis === "h" ? ctx.W - src.x - src.w : src.x;
      const ny = axis === "v" ? ctx.H - src.y - src.h : src.y;
      const rot =
        axis === "h"
          ? (180 - src.rotation + 360) % 360
          : (360 - src.rotation) % 360;
      assetsRef.current.set(id, {
        ...src,
        id,
        x: Math.max(0, Math.min(ctx.W - src.w, nx)),
        y: Math.max(0, Math.min(ctx.H - src.h, ny)),
        rotation: rot,
      });
      created.push({ type: "asset", id });
    });
    commitCreated(created, "copia(s) en espejo.");
  };
  const offsetAssets = (dx: number, dy: number) => {
    const sel = editableItems(
      selRef.current.filter((s) => s.type === "asset"),
      "crear copias desfasadas",
    );
    const ox = Math.round(dx) || 0,
      oy = Math.round(dy) || 0;
    if (!sel.length || (ox === 0 && oy === 0)) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const created: SelItem[] = [];
    sel.forEach((it) => {
      const src = assetsRef.current.get(it.id);
      if (!src) return;
      const id = newId("as");
      assetsRef.current.set(id, {
        ...src,
        id,
        x: Math.max(0, Math.min(ctx.W - src.w, src.x + ox)),
        y: Math.max(0, Math.min(ctx.H - src.h, src.y + oy)),
      });
      created.push({ type: "asset", id });
    });
    commitCreated(created, "copia(s) desfasada(s).");
  };
  const nudgeSelected = (dx: number, dy: number) => {
    const items = editableItems(selRef.current, "mover");
    const ctx = ctxRef.current;
    if (!items.length || !ctx) return;
    pushHistory(
      `nudge:${items
        .map((item) => `${item.type}:${item.id}`)
        .sort()
        .join(",")}`,
    );
    // clamp the group delta so everything stays in bounds
    let dxLo = -Infinity,
      dxHi = Infinity,
      dyLo = -Infinity,
      dyHi = Infinity;
    items.forEach((it) => {
      const p = getPlaceRef(it);
      if (!p) return;
      dxLo = Math.max(dxLo, -p.x);
      dxHi = Math.min(dxHi, ctx.W - p.w - p.x);
      dyLo = Math.max(dyLo, -p.y);
      dyHi = Math.min(dyHi, ctx.H - p.h - p.y);
    });
    const ndx = Math.min(Math.max(dx, dxLo), dxHi),
      ndy = Math.min(Math.max(dy, dyLo), dyHi);
    items.forEach((it) => {
      const p = getPlaceRef(it);
      if (p) {
        p.x += ndx;
        p.y += ndy;
      }
    });
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  const selectedMeasureBox = (item: SelItem) => {
    const p = getPlaceRef(item);
    if (!p) return null;
    return {
      id: item.id,
      label:
        item.type === "station"
          ? (stationsByIdRef.current.get(item.id)?.station ?? item.id)
          : assetsRef.current.get(item.id)?.label ||
            assetMeta(assetsRef.current.get(item.id)?.kind || "machine").label,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
    };
  };
  const createSelectionMeasurement = (mode: CadMeasureMode = "direct") => {
    const dimensionKind = mode.startsWith("edge-")
      ? "borde-a-borde"
      : "centro-a-centro";
    if (selRef.current.length !== 2) {
      toast.error(
        `Selecciona exactamente 2 objetos para crear una cota ${dimensionKind}.`,
        "Medición",
      );
      return;
    }
    const [aItem, bItem] = selRef.current;
    const a = selectedMeasureBox(aItem);
    const b = selectedMeasureBox(bItem);
    if (!a || !b) {
      toast.error("No pude medir la selección actual.", "Medición");
      return;
    }
    const unit = data?.footprint.unit === "m" ? "m" : "mm";
    const measurement = measureBoxes(a, b, mode, unit);
    pushHistory();
    const id = newId("dim");
    annotationsRef.current.set(id, {
      id,
      type: "dim",
      x: measurement.from.x,
      y: measurement.from.y,
      x2: measurement.to.x,
      y2: measurement.to.y,
      text: measurementLabel(a, b, measurement),
    });
    setDimCount(
      [...annotationsRef.current.values()].filter((ann) => ann.type === "dim")
        .length,
    );
    markDirty();
    rebuildDims();
    refreshMeasurementRows();
    toast.success(`Cota creada: ${measurement.label}`, "Medición");
  };
  const updateMeasurementText = (id: string, text: string) => {
    const ann = annotationsRef.current.get(id);
    if (!ann || ann.type !== "dim") return;
    beginFieldEdit(`dim-text:${id}`);
    ann.text = text;
    markDirty();
    rebuildDims();
    refreshMeasurementRows();
  };
  const deleteMeasurement = (id: string) => {
    const ann = annotationsRef.current.get(id);
    if (!ann || ann.type !== "dim") return;
    pushHistory();
    annotationsRef.current.delete(id);
    setDimCount(
      [...annotationsRef.current.values()].filter((item) => item.type === "dim")
        .length,
    );
    markDirty();
    rebuildDims();
    refreshMeasurementRows();
    toast.success("Cota eliminada.", "Medición");
  };
  const focusMeasurement = (id: string) => {
    const ann = annotationsRef.current.get(id);
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    if (
      !ann ||
      ann.type !== "dim" ||
      ann.x2 == null ||
      ann.y2 == null ||
      !ctx ||
      !ctrl
    )
      return;
    const mx = (ann.x + ann.x2) / 2;
    const my = (ann.y + ann.y2) / 2;
    ctrl.target.set((mx - ctx.W / 2) * ctx.s, 0, (my - ctx.H / 2) * ctx.s);
    ctrl.update();
    select([]);
    rebuildAll();
    toast.success("Vista centrada en la cota.", "Medición");
  };

  const createAisleBetweenSelection = () => {
    if (selRef.current.length !== 2) {
      toast.error(
        "Selecciona 2 objetos para crear un pasillo entre ellos.",
        "Pasillos",
      );
      return;
    }
    const [aItem, bItem] = selRef.current;
    const a = selectedMeasureBox(aItem);
    const b = selectedMeasureBox(bItem);
    const ctx = ctxRef.current;
    if (!a || !b || !ctx) {
      toast.error(
        "No pude calcular el pasillo para esta selección.",
        "Pasillos",
      );
      return;
    }
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const len = Math.hypot(bc.x - ac.x, bc.y - ac.y);
    if (len < 1) {
      toast.error(
        "Los objetos están demasiado cerca para crear un pasillo.",
        "Pasillos",
      );
      return;
    }
    const width = Math.max(100, Math.round(aisleWidth) || 1200);
    const angle = (Math.atan2(bc.y - ac.y, bc.x - ac.x) * 180) / Math.PI;
    pushHistory();
    const id = newId("as");
    assetsRef.current.set(id, {
      id,
      kind: "agvpath",
      label: `Pasillo ${Math.round(width).toLocaleString("es-MX")}`,
      x: Math.max(0, Math.min(ctx.W - len, (ac.x + bc.x) / 2 - len / 2)),
      y: Math.max(0, Math.min(ctx.H - width, (ac.y + bc.y) / 2 - width / 2)),
      w: len,
      h: width,
      rotation: angle,
    });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], "aisles"));
    setObjectTags((cur) => ({
      ...cur,
      [id]: "aisle, clearance, material-flow",
    }));
    select([{ type: "asset", id }]);
    markDirty();
    rebuildAll();
    toast.success("Pasillo editable creado entre la selección.", "Pasillos");
  };
  const createSafetyZoneAsset = (kind: "no-go" | "restricted" | "esd") => {
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    if (!ctx) return;
    const w = kind === "esd" ? 4200 : kind === "no-go" ? 2400 : 3000;
    const h = kind === "esd" ? 2800 : kind === "no-go" ? 1800 : 2200;
    const cx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const cy = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId("as");
    const label =
      kind === "esd"
        ? "ESD controlled zone"
        : kind === "no-go"
          ? "No-go zone"
          : "Restricted zone";
    assetsRef.current.set(id, {
      id,
      kind: "zone",
      label,
      x: Math.max(0, Math.min(ctx.W - w, snapWorld(cx - w / 2))),
      y: Math.max(0, Math.min(ctx.H - h, snapWorld(cy - h / 2))),
      w,
      h,
      rotation: 0,
    });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], "safety"));
    setObjectTags((cur) => ({
      ...cur,
      [id]:
        kind === "esd"
          ? "esd, safety, controlled-area"
          : `${kind}, safety, controlled-area`,
    }));
    select([{ type: "asset", id }]);
    markDirty();
    rebuildAll();
    toast.success(`${label} creada.`, "Safety");
  };
  const createSafetyPathAsset = (kind: "forklift" | "emergency") => {
    const ctx = ctxRef.current;
    const ctrl = controlsRef.current;
    if (!ctx) return;
    const w = kind === "forklift" ? 6200 : 5200;
    const h = kind === "forklift" ? 1800 : 1100;
    const cx = ctrl ? ctrl.target.x / ctx.s + ctx.W / 2 : ctx.W / 2;
    const cy = ctrl ? ctrl.target.z / ctx.s + ctx.H / 2 : ctx.H / 2;
    pushHistory();
    const id = newId("as");
    const label =
      kind === "forklift" ? "Forklift safety path" : "Emergency exit path";
    assetsRef.current.set(id, {
      id,
      kind: "agvpath",
      label,
      x: Math.max(0, Math.min(ctx.W - w, snapWorld(cx - w / 2))),
      y: Math.max(0, Math.min(ctx.H - h, snapWorld(cy - h / 2))),
      w,
      h,
      rotation: 0,
    });
    setAssetIds(new Set(assetsRef.current.keys()));
    setLayerAssignments((cur) => assignObjectsToLayer(cur, [id], "safety"));
    setObjectTags((cur) => ({
      ...cur,
      [id]:
        kind === "forklift"
          ? "forklift, safety, aisle, keep-clear"
          : "emergency, exit, safety, keep-clear",
    }));
    select([{ type: "asset", id }]);
    markDirty();
    rebuildAll();
    toast.success(`${label} creado.`, "Safety");
  };

  const setField = (
    field: "x" | "y" | "w" | "h" | "rotation",
    value: number,
  ) => {
    const cur = selList[0];
    if (!cur) return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto está bloqueada. Desbloquéala para editar propiedades.",
        "Capas",
      );
      return;
    }
    const p =
      cur.type === "station"
        ? placementsRef.current.get(cur.id)
        : assetsRef.current.get(cur.id);
    const ctx = ctxRef.current;
    if (!p || !ctx) return;
    beginFieldEdit(`geom:${cur.id}:${field}`);
    const v = Number.isFinite(value) ? value : 0;
    if (field === "rotation") p.rotation = ((v % 360) + 360) % 360;
    else if (field === "w") p.w = Math.max(50, Math.min(ctx.W, Math.round(v)));
    else if (field === "h") p.h = Math.max(50, Math.min(ctx.H, Math.round(v)));
    else if (field === "x")
      p.x = Math.max(0, Math.min(ctx.W - p.w, Math.round(v)));
    else if (field === "y")
      p.y = Math.max(0, Math.min(ctx.H - p.h, Math.round(v)));
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  const updateSelectedAssetLabel = (value: string) => {
    const cur = selList[0];
    if (!cur || cur.type !== "asset") return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto está bloqueada. Desbloquéala para renombrar.",
        "Capas",
      );
      return;
    }
    const asset = assetsRef.current.get(cur.id);
    if (!asset) return;
    beginFieldEdit(`label:${cur.id}`);
    asset.label = value.trim() || undefined;
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  const updateSelectedTags = (value: string) => {
    const cur = selList[0];
    if (!cur) return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto está bloqueada. Desbloquéala para editar tags.",
        "Capas",
      );
      return;
    }
    beginFieldEdit(`tags:${cur.id}`);
    setObjectTags((state) => {
      const next = { ...state, [cur.id]: value };
      objectTagsRef.current = next;
      return next;
    });
    refreshSnap();
    markDirty();
  };
  const updateSelectedNotes = (value: string) => {
    const cur = selList[0];
    if (!cur) return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto esta bloqueada. Desbloqueala para editar notas.",
        "Capas",
      );
      return;
    }
    beginFieldEdit(`notes:${cur.id}`);
    setObjectNotes((state) => {
      const next = { ...state, [cur.id]: value };
      objectNotesRef.current = next;
      return next;
    });
    refreshSnap();
    markDirty();
  };
  /**
   * Única frontera para cambiar la capa de objetos heredados.
   *
   * Antes `setSelectionLayer` era una línea: `setLayerAssignments(...)`. Sin
   * historial, sin dirty, sin guarda de solo-lectura y sin comprobar el
   * bloqueo. Cambiar de capa NO ensuciaba el documento, así que no se
   * programaba autosave y el cambio sólo llegaba al servidor si alguna OTRA
   * edición ensuciaba después. Cambiar la capa y cerrar la pestaña lo perdía:
   * la guarda de cierre mira `dirtyRef`, que seguía en falso.
   *
   * Las entidades nativas ya iban por `commitNativeCommands`, con su
   * transacción. Esto pone a las heredadas al mismo nivel: una entrada de
   * historial, una transición de dirty, y rechazo atómico si la capa de origen
   * está bloqueada.
   */
  const commitLayerAssignment = (
    items: SelItem[],
    layerId: CadLayerId,
  ): boolean => {
    if (!items.length) return false;
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return false;
    }
    if (items.some((item) => isItemLayerLocked(item))) {
      toast.error(
        "La capa actual del objeto está bloqueada. Desbloquéala antes de recategorizar.",
        "Capas",
      );
      return false;
    }
    pushHistory();
    setLayerAssignments((state) =>
      assignObjectsToLayer(
        state,
        items.map((item) => item.id),
        layerId,
      ),
    );
    markDirty();
    return true;
  };

  const assignSelectedToActiveLayer = () => {
    const cur = selList[0];
    if (!cur) return;
    if (!commitLayerAssignment([cur], activeCadLayer)) return;
    toast.success(
      `Objeto asignado a ${cadLayers.find((layer) => layer.id === activeCadLayer)?.label ?? activeCadLayer}.`,
      "Capas",
    );
  };
  const resetSelectedRotation = () => {
    const cur = selList[0];
    if (!cur) return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto está bloqueada. Desbloquéala para rotar.",
        "Capas",
      );
      return;
    }
    const p = getPlaceRef(cur);
    if (!p) return;
    pushHistory();
    p.rotation = 0;
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  const centerSelectedInFootprint = () => {
    const cur = selList[0];
    const ctx = ctxRef.current;
    if (!cur || !ctx) return;
    if (isItemLayerLocked(cur)) {
      toast.error(
        "La capa del objeto está bloqueada. Desbloquéala para mover.",
        "Capas",
      );
      return;
    }
    const p = getPlaceRef(cur);
    if (!p) return;
    pushHistory();
    p.x = Math.max(0, Math.min(ctx.W - p.w, Math.round(ctx.W / 2 - p.w / 2)));
    p.y = Math.max(0, Math.min(ctx.H - p.h, Math.round(ctx.H / 2 - p.h / 2)));
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  // Align the selected objects to the selection's bounding box (≥2 objects).
  const alignSelected = (
    mode: "left" | "right" | "top" | "bottom" | "cx" | "cy",
  ) => {
    const places = editableItems(selRef.current, "alinear")
      .map(getPlaceRef)
      .filter(Boolean) as Placement[];
    if (places.length < 2) return;
    pushHistory();
    const minX = Math.min(...places.map((p) => p.x)),
      maxX = Math.max(...places.map((p) => p.x + p.w));
    const minY = Math.min(...places.map((p) => p.y)),
      maxY = Math.max(...places.map((p) => p.y + p.h));
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    places.forEach((p) => {
      if (mode === "left") p.x = minX;
      else if (mode === "right") p.x = maxX - p.w;
      else if (mode === "cx") p.x = Math.round(cx - p.w / 2);
      else if (mode === "top") p.y = minY;
      else if (mode === "bottom") p.y = maxY - p.h;
      else if (mode === "cy") p.y = Math.round(cy - p.h / 2);
    });
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  // Distribute the selection with EQUAL GAPS along an axis (Fase 56): keeps the
  // first and last fixed and evens the edge-to-edge spacing between the rest —
  // the standard "distribute" that align (above) doesn't do. Needs >= 3 objects.
  const distributeSelected = (axis: "h" | "v") => {
    const places = editableItems(selRef.current, "distribuir")
      .map(getPlaceRef)
      .filter(Boolean) as Placement[];
    if (places.length < 3) return;
    const ctx = ctxRef.current!;
    pushHistory();
    const sorted = [...places].sort((a, b) =>
      axis === "h" ? a.x - b.x : a.y - b.y,
    );
    const n = sorted.length;
    const size = (p: Placement) => (axis === "h" ? p.w : p.h);
    const start = axis === "h" ? sorted[0].x : sorted[0].y;
    const end =
      axis === "h"
        ? sorted[n - 1].x + sorted[n - 1].w
        : sorted[n - 1].y + sorted[n - 1].h;
    const gap =
      (end - start - sorted.reduce((s, p) => s + size(p), 0)) / (n - 1);
    let cursor = start;
    sorted.forEach((p) => {
      const pos = Math.round(cursor);
      if (axis === "h") p.x = Math.max(0, Math.min(ctx.W - p.w, pos));
      else p.y = Math.max(0, Math.min(ctx.H - p.h, pos));
      cursor += size(p) + gap;
    });
    markDirty();
    refreshSnap();
    rebuildAll();
  };
  const buildCommandContext = () => ({
    unit: data?.footprint.unit || "mm",
    footprintW: data?.footprint.footprintW || ctxRef.current?.W || 0,
    footprintH: data?.footprint.footprintH || ctxRef.current?.H || 0,
    selectedIds: selRef.current.map((it) => it.id),
    connectors: connectorsRef.current.map((c) => ({ ...c })),
    objects: [
      ...[...placementsRef.current.entries()].map(([id, p]) => {
        const st = stationsByIdRef.current.get(id);
        return {
          id,
          type: "station" as const,
          label: st?.station ?? id,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          rotation: p.rotation,
          sequence: data?.stations.findIndex((s) => s.id === id) ?? 0,
        };
      }),
      ...[...assetsRef.current.values()].map((a) => ({
        id: a.id,
        type: "asset" as const,
        kind: a.kind,
        label: a.label || assetMeta(a.kind).label,
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
        rotation: a.rotation,
      })),
    ],
  });
  const previewCommandText = (rawText: string) => {
    const raw = rawText.trim();
    if (!raw) return;
    // Cadenas (VD-CAD-CHAIN-001): 'pon una puerta y luego céntrala' —
    // todos los pasos deben parsear; el preview muestra el primero y el
    // apply los ejecuta en orden contra el contexto vivo.
    const parts = splitCadCommandChain(raw);
    if (parts.length > 1) {
      const inputs: CadCommandInput[] = [];
      for (const part of parts) {
        const parsedPart = parseCadCommand(part);
        if (!parsedPart.ok || !parsedPart.input) {
          toast.error(
            `Paso "${part}": ${parsedPart.clarification || parsedPart.error || "no lo reconocí"}`,
            "Comando CAD",
          );
          setCommandPreview(null);
          return false;
        }
        inputs.push(parsedPart.input);
      }
      const preview = previewCadCommand(inputs[0], buildCommandContext());
      setCommandPreview({
        input: inputs[0],
        preview,
        chain: inputs,
        rawInput: raw,
      });
      setCommandLog((items) =>
        prependCadCommandHistory(
          items,
          createCadHistoryItem(
            inputs[0],
            "previewed",
            `${preview.summary} (+${inputs.length - 1} paso(s) más)`,
            preview,
            undefined,
            { rawInput: raw, affectedObjectIds: preview.affectedObjectIds },
          ),
        ),
      );
      return true;
    }
    const parsed = parseCadCommand(raw);
    if (!parsed.ok || !parsed.input) {
      toast.error(
        parsed.clarification || parsed.error || "No reconocí el comando CAD.",
        "Comando CAD",
      );
      setCommandPreview(null);
      return false;
    }
    const preview = previewCadCommand(parsed.input, buildCommandContext());
    setCommandPreview({ input: parsed.input, preview, rawInput: raw });
    setCommandLog((items) =>
      prependCadCommandHistory(
        items,
        createCadHistoryItem(
          parsed.input!,
          "previewed",
          preview.summary,
          preview,
          undefined,
          { rawInput: raw, affectedObjectIds: preview.affectedObjectIds },
        ),
      ),
    );
    return true;
  };
  const repeatLastCommand = () => {
    const raw = repeatableCadCommand(commandLog);
    if (!raw) {
      toast.error("No hay un comando aplicado para repetir.", "Comando CAD");
      return false;
    }
    setCommandText(raw);
    setCommandHistoryCursor(-1);
    return previewCommandText(raw);
  };
  const interpretCommand = () => {
    setCommandHistoryCursor(-1);
    if (!commandText.trim()) repeatLastCommand();
    else previewCommandText(commandText);
  };
  const navigateCommandLineHistory = (direction: "older" | "newer") => {
    const next = navigateCadCommandHistory(
      commandLog,
      commandHistoryCursor,
      direction,
    );
    setCommandHistoryCursor(next.cursor);
    setCommandText(next.value);
    setCommandPreview(null);
  };
  const applyCommandSuggestion = (suggestion: CadCommandSuggestion) => {
    setCommandText(suggestion.example);
    if (!suggestion.ready) {
      setCommandPreview(null);
      toast.error(suggestion.reason, "Comando CAD");
      return;
    }
    previewCommandText(suggestion.example);
  };
  const applyCommandOperation = (op: CadOperation) => {
    if (op.type === "move") {
      const type = placementsRef.current.has(op.objectId)
        ? "station"
        : assetsRef.current.has(op.objectId)
          ? "asset"
          : null;
      if (type && isItemLayerLocked({ type, id: op.objectId })) {
        toast.error(
          `Movimiento omitido: ${op.objectId} está en una capa bloqueada.`,
          "Capas",
        );
        return false;
      }
      const p = placementsRef.current.get(op.objectId);
      if (p) {
        p.x = op.after.x;
        p.y = op.after.y;
        p.w = op.after.w;
        p.h = op.after.h;
        p.rotation = op.after.rotation ?? p.rotation;
        return true;
      }
      const a = assetsRef.current.get(op.objectId);
      if (a) {
        a.x = op.after.x;
        a.y = op.after.y;
        a.w = op.after.w;
        a.h = op.after.h;
        a.rotation = op.after.rotation ?? a.rotation;
        return true;
      }
    } else if (op.type === "connect") {
      if (
        !connectorsRef.current.some(
          (c) =>
            c.from === op.from &&
            c.to === op.to &&
            (c.kind ?? "flow") === op.kind,
        )
      )
        connectorsRef.current = [
          ...connectorsRef.current,
          { from: op.from, to: op.to, kind: op.kind },
        ];
      return true;
    } else if (op.type === "create") {
      // Con sourceId copia kind/etiqueta/capa del origen (duplicación); sin él,
      // op.object.kind crea un asset fresco (zonas envolventes, muros nuevos).
      if (op.object.type !== "asset") return false;
      const src = op.object.sourceId
        ? assetsRef.current.get(op.object.sourceId)
        : undefined;
      const kind = src?.kind ?? op.object.kind;
      if (!kind) return false;
      const id = newId("as");
      assetsRef.current.set(id, {
        id,
        kind,
        label: op.object.label || src?.label,
        x: op.object.x,
        y: op.object.y,
        w: op.object.w,
        h: op.object.h,
        rotation: op.object.rotation ?? src?.rotation ?? 0,
      });
      setAssetIds(new Set(assetsRef.current.keys()));
      const srcLayer = op.object.sourceId
        ? layerAssignmentsRef.current[op.object.sourceId]
        : undefined;
      setLayerAssignments((cur) =>
        assignObjectsToLayer(
          cur,
          [id],
          srcLayer ?? defaultCadLayerForAssetKind(kind),
        ),
      );
      return true;
    } else if (op.type === "annotate") {
      if (op.annotation.kind === "text") {
        // TEXT conversacional (VD-CAD-TEXT-001): misma nota que el botón de
        // notas — editable/arrastrable/borrable como cualquier otra.
        const id = newId("nt");
        annotationsRef.current.set(id, {
          id,
          type: "text",
          x: op.annotation.x,
          y: op.annotation.y,
          text: op.annotation.text.slice(0, 240),
        });
        rebuildNotes();
        return true;
      }
      // Auto-acotado (ADR §225): cada cota entra como anotación dim normal —
      // editable/borrable desde el panel de mediciones como cualquier otra.
      const id = newId("dim");
      annotationsRef.current.set(id, {
        id,
        type: "dim",
        x: op.annotation.x,
        y: op.annotation.y,
        x2: op.annotation.x2,
        y2: op.annotation.y2,
        text: op.annotation.text,
      });
      setDimCount(
        [...annotationsRef.current.values()].filter((ann) => ann.type === "dim")
          .length,
      );
      refreshMeasurementRows();
      return true;
    } else if (op.type === "history") {
      // 'deshaz' / 'rehaz' (VD-CAD-UNDO-001): el mismo historial de Ctrl+Z.
      if (op.action === "undo") undo();
      else redo();
      return true;
    } else if (op.type === "studio_view") {
      // 'vista 2d' / 'vista 3d' (VD-CAD-VIEW-001): el mismo toggle del toolbar.
      setViewMode(op.mode);
      applyViewMode(op.mode);
      return true;
    } else if (op.type === "rename") {
      // "renombra la mesa a 'Mesa VIP'" (VD-CAD-RENAME-001): solo assets —
      // las estaciones toman su nombre del routing.
      const asset = assetsRef.current.get(op.objectId);
      if (!asset) {
        toast.error(
          "Las estaciones toman su nombre del routing; solo puedo renombrar equipos y objetos.",
          "Comando CAD",
        );
        return false;
      }
      asset.label = op.label.slice(0, 80);
      return true;
    } else if (op.type === "studio_save") {
      // 'guarda' (VD-CAD-SAVE-001): el mismo botón Guardar del estudio.
      void save();
      return true;
    } else if (op.type === "studio_export") {
      // 'imprime en a3' (VD-CAD-PLOT-003): dispara el export real; el papel
      // pedido se sincroniza al selector y se pasa directo (el estado es async).
      if (op.format === "pdf") {
        const paper = op.paper as CadPaperId | undefined;
        if (paper) setPlotPaper(paper);
        void publishSheetSetPdf();
      } else if (op.format === "dxf") {
        void exportDxf();
      } else if (op.format === "png") {
        exportPng();
      } else {
        void exportGltf();
      }
      return true;
    } else if (op.type === "clear_annotations") {
      // Limpieza conversacional (VD-CAD-CLEAN-001): mismo contrato que el
      // botón de limpiar cotas — si no había nada que quitar, no aplica.
      let cleared = false;
      annotationsRef.current.forEach((a, id) => {
        if (
          (op.kind === "dims" && a.type === "dim") ||
          (op.kind === "notes" && a.type === "text") ||
          op.kind === "all"
        ) {
          annotationsRef.current.delete(id);
          cleared = true;
        }
      });
      if (!cleared) return false;
      setDimCount(
        [...annotationsRef.current.values()].filter((ann) => ann.type === "dim")
          .length,
      );
      refreshMeasurementRows();
      rebuildDims();
      rebuildNotes();
      return true;
    } else if (op.type === "delete") {
      // ERASE conversacional (VD-CAD-DELETE-001): mismo contrato que Supr —
      // respeta capas bloqueadas y saca al objeto de la selección viva.
      const type = placementsRef.current.has(op.objectId)
        ? ("station" as const)
        : assetsRef.current.has(op.objectId)
          ? ("asset" as const)
          : null;
      if (!type) return false;
      if (isItemLayerLocked({ type, id: op.objectId })) {
        toast.error(
          `Borrado omitido: ${op.objectId} está en una capa bloqueada.`,
          "Capas",
        );
        return false;
      }
      if (type === "station") {
        placementsRef.current.delete(op.objectId);
        setPlacedIds(new Set(placementsRef.current.keys()));
      } else {
        assetsRef.current.delete(op.objectId);
        setAssetIds(new Set(assetsRef.current.keys()));
      }
      if (selRef.current.some((s) => s.id === op.objectId))
        select(selRef.current.filter((s) => s.id !== op.objectId));
      return true;
    } else if (op.type === "focus") {
      const items: SelItem[] = op.objectIds
        .map((id) =>
          placementsRef.current.has(id)
            ? { type: "station" as const, id }
            : assetsRef.current.has(id)
              ? { type: "asset" as const, id }
              : null,
        )
        .filter((it): it is SelItem => !!it);
      if (items.length) select(items);
      // 'enfoca la cocina' (VD-CAD-ZOOM-001): fit_to_view manda zoom:true;
      // seleccionar por nombre NO mueve la cámara (select_objects sin zoom).
      if (op.zoom) fitView(items.length ? "selection" : "all");
    }
    return false;
  };
  const isMutatingCommandOperation = (op: CadOperation) =>
    op.type === "move" ||
    op.type === "connect" ||
    op.type === "create" ||
    op.type === "annotate" ||
    op.type === "delete" ||
    op.type === "clear_annotations" ||
    op.type === "rename";
  const canApplyCommandOperation = (op: CadOperation) => {
    if (!isMutatingCommandOperation(op)) return true;
    if (op.type === "move" || op.type === "delete") {
      const type = placementsRef.current.has(op.objectId)
        ? ("station" as const)
        : assetsRef.current.has(op.objectId)
          ? ("asset" as const)
          : null;
      return !!type && !isItemLayerLocked({ type, id: op.objectId });
    }
    if (op.type === "connect") {
      const exists = (id: string) =>
        placementsRef.current.has(id) || assetsRef.current.has(id);
      return exists(op.from) && exists(op.to);
    }
    if (op.type === "create")
      return (
        op.object.type === "asset" &&
        !!(
          op.object.kind ||
          (op.object.sourceId && assetsRef.current.has(op.object.sourceId))
        )
      );
    if (op.type === "rename") return assetsRef.current.has(op.objectId);
    if (op.type === "clear_annotations") {
      return [...annotationsRef.current.values()].some(
        (annotation) =>
          op.kind === "all" ||
          (op.kind === "dims" && annotation.type === "dim") ||
          (op.kind === "notes" && annotation.type === "text"),
      );
    }
    return true;
  };
  const applyCommand = () => {
    if (!commandPreview) return;
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return;
    }
    // Cadena o comando suelto (VD-CAD-CHAIN-001): cada paso se ejecuta
    // contra el contexto YA mutado por el anterior ('pon una puerta y luego
    // céntrala' centra la puerta recién creada); un solo snapshot → un undo.
    const inputs =
      commandPreview.chain && commandPreview.chain.length > 1
        ? commandPreview.chain
        : [commandPreview.input];
    const transactionCheckpoint = snapshotDocument();
    const transactionWasDirty = dirty;
    const transactionHistory =
      canonicalHistoryRef.current?.createRecoveryPoint() ?? null;
    let snapshotTaken = false;
    let anyChanged = false;
    const rollbackCommandTransaction = () => {
      loadedCadDocumentRef.current = transactionCheckpoint;
      restore(cadDocumentToEditorSnapshot(transactionCheckpoint));
      if (snapshotTaken) {
        if (transactionHistory && canonicalHistoryRef.current) {
          canonicalHistoryRef.current.restoreRecoveryPoint(transactionHistory);
          setHist(canonicalHistoryRef.current.depths());
        } else cancelHistoryCheckpoint();
      }
      dirtyRef.current = transactionWasDirty;
      setDirty(transactionWasDirty);
    };
    for (const input of inputs) {
      const commandStartedAt = Date.now();
      const result = executeCadCommand(input, buildCommandContext());
      const audit = () => ({
        rawInput: commandPreview.rawInput,
        durationMs: Date.now() - commandStartedAt,
        affectedObjectIds: result.affectedObjectIds,
        completedAt: new Date().toISOString(),
      });
      if (!result.applied) {
        if (snapshotTaken) rollbackCommandTransaction();
        anyChanged = false;
        toast.error(
          result.issues.find((i) => i.level === "error")?.message ||
            "El comando no es válido.",
          "Comando CAD",
        );
        setCommandLog((items) =>
          prependCadCommandHistory(
            items,
            createCadHistoryItem(
              input,
              "failed",
              result.historyLabel,
              commandPreview.preview,
              result,
              audit(),
            ),
          ),
        );
        break;
      }
      const mutatingOperations = result.operations.filter(
        isMutatingCommandOperation,
      );
      const blockedOperation = mutatingOperations.find(
        (op) => !canApplyCommandOperation(op),
      );
      if (blockedOperation) {
        if (snapshotTaken) rollbackCommandTransaction();
        anyChanged = false;
        setCommandLog((items) =>
          prependCadCommandHistory(
            items,
            createCadHistoryItem(
              input,
              "failed",
              `Transacción cancelada: ${result.historyLabel}`,
              commandPreview.preview,
              result,
              audit(),
            ),
          ),
        );
        toast.error(
          "No se aplicó ningún cambio: una operación no pudo validarse.",
          "Comando CAD",
        );
        break;
      }
      const mutates = mutatingOperations.length > 0;
      if (mutates && !snapshotTaken) {
        recordLocalSnapshot(
          `Auto · ${result.historyLabel}${inputs.length > 1 ? ` (cadena de ${inputs.length})` : ""}`,
          "command",
        );
        pushHistory();
        snapshotTaken = true;
      }
      // map + some: .some(applyCommandOperation) directo corta en la primera op
      // aplicada y dejaba a medias los comandos multi-objeto (align, flow line).
      const operationResults = result.operations.map(applyCommandOperation);
      const changed = operationResults.some(Boolean);
      const partialFailure = mutatingOperations.some((operation) => {
        const index = result.operations.indexOf(operation);
        return !operationResults[index];
      });
      if (partialFailure) {
        rollbackCommandTransaction();
        setCommandLog((items) =>
          prependCadCommandHistory(
            items,
            createCadHistoryItem(
              input,
              "failed",
              `Rollback: ${result.historyLabel}`,
              commandPreview.preview,
              result,
              audit(),
            ),
          ),
        );
        toast.error(
          "La operación falló y la transacción completa fue revertida.",
          "Comando CAD",
        );
        anyChanged = false;
        break;
      }
      if (changed && snapshotDocument().constraints.length) {
        const solved = solveCadConstraints(
          snapshotDocument(),
          result.affectedObjectIds,
        );
        if (!solved.converged) {
          rollbackCommandTransaction();
          setCommandLog((items) =>
            prependCadCommandHistory(
              items,
              createCadHistoryItem(
                input,
                "failed",
                `Restricción incompatible: ${result.historyLabel}`,
                commandPreview.preview,
                result,
                audit(),
              ),
            ),
          );
          toast.error(
            solved.issues[0]?.message ||
              "Las restricciones no pudieron resolverse; se revirtió la transacción.",
            "Restricciones",
          );
          anyChanged = false;
          break;
        }
        loadedCadDocumentRef.current = solved.document;
        restore(cadDocumentToEditorSnapshot(solved.document));
      }
      anyChanged = anyChanged || changed;
      setCommandLog((items) =>
        prependCadCommandHistory(
          items,
          createCadHistoryItem(
            input,
            "applied",
            result.historyLabel,
            commandPreview.preview,
            result,
            audit(),
          ),
        ),
      );
      if (changed) {
        refreshSnap();
      }
      toast.success(result.historyLabel, "Comando CAD");
    }
    if (anyChanged) {
      markDirty();
      refreshSnap();
      rebuildAll();
    }
    setCommandPreview(null);
    setCommandText("");
  };
  const undoLastCommand = () => {
    const item = commandLog.find((c) => c.status === "applied");
    if (!item || hist.undo === 0) return;
    undo();
    setCommandLog((items) =>
      items.map((c) => (c.id === item.id ? { ...c, status: "undone" } : c)),
    );
    toast.success(`Deshecho: ${item.label}`, "Comando CAD");
  };
  const redoLastCommand = () => {
    const item = commandLog.find((c) => c.status === "undone");
    if (!item || hist.redo === 0) return;
    redo();
    setCommandLog((items) =>
      items.map((c) => (c.id === item.id ? { ...c, status: "applied" } : c)),
    );
    toast.success(`Rehecho: ${item.label}`, "Comando CAD");
  };
  const buildAiIntentProposalDescription = (intent: CadIntent) => {
    if (intent.kind !== "cleanupGeometry") return describeCadIntent(intent);
    const preview = previewCadCommand(
      {
        id: "cleanup_geometry",
        tolerance: intent.tolerance,
        angleToleranceDeg: intent.angleToleranceDeg,
        minLength: intent.minLength,
      },
      buildCommandContext(),
    );
    const evidence = preview.issues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join(" · ");
    return `${preview.summary}${evidence ? ` Evidencia: ${evidence}` : ""}`;
  };
  // ── Copiloto IA (ADR §215): NL→CAD y optimización vía backend CIDE. El modelo
  // solo PROPONE tool-calls; normalizeToolCalls valida y el humano aplica. ──
  const requestAiProposal = async (source: "intent" | "optimize") => {
    const prompt = commandText.trim();
    if (source === "intent" && !prompt) {
      toast.error("Escribe la instrucción para la IA.", "Copiloto IA");
      return;
    }
    setAiBusy(source);
    setAiProposal(null);
    try {
      const r =
        source === "intent"
          ? await legacyCadFetch("layout/cad-intent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model, revision, prompt }),
            })
          : await legacyCadFetch(
              `layout/optimize-copilot?model=${encodeURIComponent(model)}&revision=${encodeURIComponent(revision)}`,
            );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as {
        available: boolean;
        toolCalls: { name: string; arguments: unknown }[];
        message?: string;
      };
      if (!body.available) {
        setAiProposal({
          source,
          intents: [],
          errors: [],
          message: body.message || "El motor de IA (CIDE) no está disponible.",
        });
        return;
      }
      const { intents, errors } = normalizeToolCalls(body.toolCalls ?? []);
      if (!intents.length && !errors.length) {
        setAiProposal({
          source,
          intents: [],
          errors: [],
          message:
            body.message || "La IA no propuso acciones para esta instrucción.",
        });
        return;
      }
      setAiProposal({
        source,
        intents,
        descriptions: intents.map(buildAiIntentProposalDescription),
        errors,
        message: body.message,
      });
    } catch {
      setAiProposal({
        source,
        intents: [],
        errors: [],
        message: "No se pudo contactar el copiloto IA.",
      });
    } finally {
      setAiBusy(null);
    }
  };
  const applyAiIntent = (intent: CadIntent): boolean => {
    const ctx = ctxRef.current;
    if (!ctx) return false;
    switch (intent.kind) {
      case "setFootprint": {
        const unit = (data?.footprint.unit || "mm") as WorldUnit;
        setData((d) =>
          d
            ? {
                ...d,
                footprint: {
                  ...d.footprint,
                  footprintW: clampFootprintUnit(
                    Math.round(intent.footprintW),
                    unit,
                  ),
                  footprintH: clampFootprintUnit(
                    Math.round(intent.footprintH),
                    unit,
                  ),
                  ...(intent.gridSize
                    ? {
                        gridSize: clampGridUnit(
                          Math.round(intent.gridSize),
                          unit,
                        ),
                      }
                    : {}),
                },
              }
            : d,
        );
        return true;
      }
      case "placeAsset": {
        const a = intent.asset;
        const id = newId("as");
        assetsRef.current.set(id, {
          id,
          kind: a.kind,
          x: Math.max(0, Math.min(ctx.W - a.w, snapWorld(a.x))),
          y: Math.max(0, Math.min(ctx.H - a.h, snapWorld(a.y))),
          w: a.w,
          h: a.h,
          rotation: a.rotation,
          ...(a.label ? { label: a.label } : {}),
        });
        setAssetIds((s) => new Set(s).add(id));
        setLayerAssignments((cur) =>
          assignObjectsToLayer(cur, [id], defaultCadLayerForAssetKind(a.kind)),
        );
        return true;
      }
      case "draw": {
        const seg = intent.action;
        if (seg.type !== "addSegment") return false;
        const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
        if (len < 1) return false;
        const thick = assetMeta("wall").h;
        const cx = (seg.a.x + seg.b.x) / 2,
          cy = (seg.a.y + seg.b.y) / 2;
        const angle =
          (Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180) / Math.PI;
        const id = newId("as");
        assetsRef.current.set(id, {
          id,
          kind: "wall",
          x: cx - len / 2,
          y: cy - thick / 2,
          w: len,
          h: thick,
          rotation: angle,
        });
        setAssetIds((s) => new Set(s).add(id));
        setLayerAssignments((cur) =>
          assignObjectsToLayer(cur, [id], "architecture"),
        );
        return true;
      }
      case "arrangeLine":
      case "connectLine": {
        // Sin selección explícita: el registry cae a TODAS las estaciones por secuencia.
        const input: CadCommandInput =
          intent.kind === "arrangeLine"
            ? { id: "arrange_line" }
            : { id: "connect_flow" };
        const result = executeCadCommand(input, {
          ...buildCommandContext(),
          selectedIds: [],
        });
        if (!result.applied) return false;
        return result.operations.map(applyCommandOperation).some(Boolean);
      }
      case "moveStation": {
        const wanted = intent.station.trim().toLocaleLowerCase("es-MX");
        let sid: string | null = null;
        stationsByIdRef.current.forEach((st, id) => {
          if (!sid && (st.station ?? "").toLocaleLowerCase("es-MX") === wanted)
            sid = id;
        });
        if (!sid)
          stationsByIdRef.current.forEach((st, id) => {
            if (
              !sid &&
              (st.station ?? "").toLocaleLowerCase("es-MX").includes(wanted)
            )
              sid = id;
          });
        const p = sid ? placementsRef.current.get(sid) : undefined;
        if (!sid || !p) return false;
        if (isItemLayerLocked({ type: "station", id: sid })) return false;
        p.x = Math.max(0, Math.min(ctx.W - p.w, snapWorld(intent.x)));
        p.y = Math.max(0, Math.min(ctx.H - p.h, snapWorld(intent.y)));
        return true;
      }
      case "cleanupGeometry": {
        const input: CadCommandInput = {
          id: "cleanup_geometry",
          tolerance: intent.tolerance,
          angleToleranceDeg: intent.angleToleranceDeg,
          minLength: intent.minLength,
        };
        const result = executeCadCommand(input, buildCommandContext());
        if (!result.applied) return false;
        return result.operations.map(applyCommandOperation).some(Boolean);
      }
    }
  };
  const applyAiProposal = () => {
    if (!aiProposal || !aiProposal.intents.length) return;
    if (drawingReadOnlyRef.current) {
      notifyReadOnly();
      return;
    }
    const checkpoint = snapshotDocument();
    const footprintBefore = data?.footprint ? { ...data.footprint } : null;
    const wasDirty = dirty;
    const proposalHistory =
      canonicalHistoryRef.current?.createRecoveryPoint() ?? null;
    recordLocalSnapshot(
      `Auto · Copiloto IA (${aiProposal.source === "intent" ? "instrucción" : "optimización"})`,
      "command",
    );
    pushHistory();
    const applied = aiProposal.intents
      .map(applyAiIntent)
      .filter(Boolean).length;
    const rollbackProposal = (message: string) => {
      loadedCadDocumentRef.current = checkpoint;
      restore(cadDocumentToEditorSnapshot(checkpoint));
      if (footprintBefore)
        setData((current) =>
          current ? { ...current, footprint: footprintBefore } : current,
        );
      if (proposalHistory && canonicalHistoryRef.current) {
        canonicalHistoryRef.current.restoreRecoveryPoint(proposalHistory);
        setHist(canonicalHistoryRef.current.depths());
      } else cancelHistoryCheckpoint();
      dirtyRef.current = wasDirty;
      setDirty(wasDirty);
      toast.error(message, "Copiloto IA");
    };
    if (applied !== aiProposal.intents.length) {
      rollbackProposal(
        "La propuesta no era aplicable completa; se revirtió sin cambios parciales.",
      );
      return;
    }
    const constrained = solveCadConstraints(snapshotDocument());
    if (!constrained.converged) {
      rollbackProposal(
        constrained.issues[0]?.message ||
          "La propuesta contradice las restricciones y fue revertida.",
      );
      return;
    }
    loadedCadDocumentRef.current = constrained.document;
    restore(cadDocumentToEditorSnapshot(constrained.document));
    markDirty();
    refreshSnap();
    rebuildAll();
    toast.success(
      `Copiloto IA: ${applied}/${aiProposal.intents.length} acción(es) aplicadas como una transacción.`,
      "Copiloto IA",
    );
    if (aiProposal.source === "intent" && applied) setCommandText("");
    setAiProposal(null);
  };
  const toggleCadLayerVisibility = (id: CadLayerId) => {
    const layer = cadLayers.find((candidate) => candidate.id === id);
    if (!layer) return;
    commitBlockMutation(
      (document) =>
        updateCadDocumentLayer(document, id, { visible: !layer.visible }),
      nativeSelectionIdsRef.current,
      `Capa ${layer.label} ${layer.visible ? "oculta" : "visible"}.`,
      "Capas",
    );
  };
  const updateCadLayerLabel = (id: CadLayerId, label: string) => {
    if (cadLayers.find((layer) => layer.id === id)?.label === label.trim())
      return;
    commitBlockMutation(
      (document) => updateCadDocumentLayer(document, id, { name: label }),
      nativeSelectionIdsRef.current,
      `Capa ${id} renombrada.`,
      "Capas",
    );
  };
  const updateCadLayerColor = (id: CadLayerId, color: string) => {
    if (cadLayers.find((layer) => layer.id === id)?.color === color) return;
    commitBlockMutation(
      (document) => updateCadDocumentLayer(document, id, { color }),
      nativeSelectionIdsRef.current,
      `Color de ${id} actualizado.`,
      "Capas",
    );
  };
  const toggleCadLayerLock = (id: CadLayerId) => {
    const layer = cadLayers.find((candidate) => candidate.id === id);
    if (!layer) return;
    commitBlockMutation(
      (document) =>
        updateCadDocumentLayer(document, id, { locked: !layer.locked }),
      nativeSelectionIdsRef.current,
      `Capa ${layer.label} ${layer.locked ? "desbloqueada" : "bloqueada"}.`,
      "Capas",
    );
  };
  const createCanonicalCadLayer = () => {
    try {
      const id = cadLayerIdFromName(layerManagerHost.draftName);
      const created = commitBlockMutation(
        (document) =>
          createCadDocumentLayer(document, {
            name: layerManagerHost.draftName,
            color: layerManagerHost.draftColor,
          }),
        nativeSelectionIdsRef.current,
        `Capa ${layerManagerHost.draftName.trim()} creada.`,
        "Capas",
      );
      if (created) {
        setActiveCadLayer(id);
        layerManagerHost.setDraftName("");
      }
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No se pudo crear la capa.",
        "Capas",
      );
    }
  };
  const deleteCanonicalCadLayer = (id: CadLayerId) => {
    const target =
      cadLayers.find((layer) => layer.id === "0" && layer.id !== id)?.id ??
      cadLayers.find((layer) => layer.id !== id)?.id;
    if (!target) {
      toast.error(
        "Debe existir otra capa para reasignar el contenido.",
        "Capas",
      );
      return;
    }
    commitBlockMutation(
      (document) => deleteCadDocumentLayer(document, id, target),
      nativeSelectionIdsRef.current,
      `Capa ${id} eliminada; contenido reasignado a ${target}.`,
      "Capas",
    );
  };
  const resetCadLayerPresentation = () => {
    setLayers((cur) => ({
      ...cur,
      stations: true,
      equipment: true,
      connectors: true,
      dims: true,
    }));
    const document = loadedCadDocumentRef.current;
    if (document?.layers.length) {
      commitBlockMutation(
        (current) =>
          commitChange(
            {
              ...current,
              layers: current.layers.map((layer) => ({
                ...layer,
                visible: true,
                locked: false,
              })),
            },
            "layer:reset-presentation",
          ),
        nativeSelectionIdsRef.current,
        "Capas visibles y desbloqueadas.",
        "Capas",
      );
    } else setCadLayers(DEFAULT_CAD_LAYERS.map((layer) => ({ ...layer })));
  };
  const assignSelectionToCadLayer = (id: CadLayerId) => {
    const items = selRef.current;
    const nativeIds = [...nativeSelectionIdsRef.current];
    if (!items.length && !nativeIds.length) {
      toast.error("Selecciona objetos para asignarlos a una capa.", "Capas");
      return;
    }
    // Las nativas ya iban por su transacción; las heredadas escribían el estado
    // a pelo. Ahora las dos mitades cruzan una frontera, y si la heredada se
    // rechaza —capa de origen bloqueada— no se aplica tampoco la nativa.
    if (items.length && !commitLayerAssignment(items, id)) return;
    if (nativeIds.length)
      commitNativeCommands(
        nativeIds.map((entityId) => ({
          type: "properties" as const,
          entityId,
          patch: { layer: id },
        })),
      );
    toast.success(
      `${items.length + nativeIds.length} objeto(s) asignados a ${cadLayers.find((l) => l.id === id)?.label ?? id}.`,
      "Capas",
    );
  };
  const selectCadLayerObjects = (id: CadLayerId) => {
    const items: SelItem[] = [];
    placementsRef.current.forEach((_, objectId) => {
      if ((layerAssignmentsRef.current[objectId] ?? "layout") === id)
        items.push({ type: "station", id: objectId });
    });
    assetsRef.current.forEach((_, objectId) => {
      if (
        (layerAssignmentsRef.current[objectId] ??
          defaultLayerForAsset(objectId)) === id
      )
        items.push({ type: "asset", id: objectId });
    });
    const nativeIds = nativeEntities
      .filter((entity) => entity.layer === id)
      .map((entity) => entity.id);
    if (!items.length && !nativeIds.length) {
      toast.error("No hay objetos visibles en esa capa.", "Capas");
      return;
    }
    if (nativeIds.length) selectNative(nativeIds.slice(0, 200));
    else select(items.slice(0, 200));
    toast.success(
      `${items.length + nativeIds.length} objeto(s) seleccionados en la capa.`,
      "Capas",
    );
  };
  const isolateCadLayer = (id: CadLayerId) => {
    setLayers((cur) => ({
      ...cur,
      stations: id === "layout",
      equipment:
        id === "equipment" ||
        id === "architecture" ||
        id === "structure" ||
        id === "utilities" ||
        id === "aisles" ||
        id === "safety",
      connectors: id === "flow",
      dims: id === "measurements",
    }));
    commitBlockMutation(
      (document) =>
        commitChange(
          {
            ...document,
            layers: document.layers.map((layer) => ({
              ...layer,
              visible: layer.id === id,
            })),
          },
          `layer:isolate:${id}`,
        ),
      nativeSelectionIdsRef.current,
      `Capa ${cadLayers.find((layer) => layer.id === id)?.label ?? id} aislada.`,
      "Capas",
    );
  };
  const showAllCadLayerVisibility = () => {
    setLayers((cur) => ({
      ...cur,
      stations: true,
      equipment: true,
      connectors: true,
      dims: true,
    }));
    commitBlockMutation(
      (document) =>
        commitChange(
          {
            ...document,
            layers: document.layers.map((layer) => ({
              ...layer,
              visible: true,
            })),
          },
          "layer:show-all",
        ),
      nativeSelectionIdsRef.current,
      "Todas las capas CAD visibles.",
      "Capas",
    );
  };
  const unlockAllCadLayerVisibility = () => {
    commitBlockMutation(
      (document) =>
        commitChange(
          {
            ...document,
            layers: document.layers.map((layer) => ({
              ...layer,
              locked: false,
            })),
          },
          "layer:unlock-all",
        ),
      nativeSelectionIdsRef.current,
      "Todas las capas CAD desbloqueadas.",
      "Capas",
    );
  };
  const defaultLayerFor = (item: SelItem): CadLayerId => {
    if (item.type === "station") return "layout";
    const selectedKind = selSnap?.id === item.id ? selSnap.kind : undefined;
    return selectedKind
      ? defaultCadLayerForAssetKind(selectedKind, objectTags[item.id])
      : "equipment";
  };
  const selectionLayer = (item: SelItem): CadLayerId =>
    layerAssignments[item.id] ?? defaultLayerFor(item);
  const setSelectionLayer = (item: SelItem, layerId: CadLayerId) => {
    commitLayerAssignment([item], layerId);
  };
  const runToolbarAction = (id: CadToolbarActionId) => {
    if (drawingReadOnlyRef.current && !READ_ONLY_TOOLBAR_ACTION_IDS.has(id)) {
      notifyReadOnly();
      return;
    }
    if (id === "select" || id === "pan") setToolMode("select");
    else if (id === "measure") setToolMode("measure");
    else if (
      id === "line" ||
      id === "polyline" ||
      id === "rect" ||
      id === "circle" ||
      id === "move" ||
      id === "copy" ||
      id === "offset"
    )
      startCadDrawTool(id);
    else if (id === "aisle") {
      setShowCommand(true);
      setCommandText("haz un pasillo de 1.2m entre ");
    } else if (id === "connector") connectLineLayout();
    else if (id === "zone") {
      setTab("equipment");
      addAsset("zone");
    } else if (id === "equipment") setTab("equipment");
    else if (id === "text") addNote();
    else if (id === "fit_view") fitView("all");
    else if (id === "undo") undo();
    else if (id === "redo") redo();
  };
  const rememberPaletteAction = (entry: CadPaletteEntry) => {
    setRecentPaletteActions((items) =>
      [
        `${entry.kind}:${entry.id}`,
        ...items.filter((item) => item !== `${entry.kind}:${entry.id}`),
      ].slice(0, 5),
    );
  };
  const runPaletteEntry = (entry: CadPaletteEntry) => {
    if (drawingReadOnlyRef.current && entry.kind !== "tool") {
      notifyReadOnly();
      return;
    }
    setShowPalette(false);
    setPaletteQuery("");
    rememberPaletteAction(entry);
    if (entry.kind === "tool") {
      runToolbarAction(entry.id as CadToolbarActionId);
      return;
    }
    if (entry.kind === "command") {
      const example =
        entry.keywords.find((kw) => kw.includes(" ")) ?? entry.label;
      const parsed = parseCadCommand(example);
      setShowCommand(true);
      setCommandText(example);
      if (parsed.ok && parsed.input) {
        const preview = previewCadCommand(parsed.input, buildCommandContext());
        setCommandPreview({ input: parsed.input, preview, rawInput: example });
        setCommandLog((items) =>
          prependCadCommandHistory(
            items,
            createCadHistoryItem(
              parsed.input!,
              "previewed",
              preview.summary,
              preview,
              undefined,
              {
                rawInput: example,
                affectedObjectIds: preview.affectedObjectIds,
              },
            ),
          ),
        );
        toast.success("Preview listo en el Copiloto CAD.", "Cmd-K CAD");
      } else {
        setCommandPreview(null);
        toast.error(
          parsed.clarification ||
            parsed.error ||
            "El comando necesita más contexto.",
          "Cmd-K CAD",
        );
      }
      return;
    }
    addCadSymbol(entry.id);
    setTab("equipment");
    toast.success(`${entry.label} insertado desde Cmd-K.`, "Cmd-K CAD");
  };
  const selectAll = () => {
    applyProfessionalSelection({
      type: "all",
      universe: buildSelectionUniverse(),
    });
    rebuildAll();
  };
  const viewPreset = (preset: "top" | "iso" | "front") => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const ctx = ctxRef.current;
    if (!cam || !ctrl || !ctx) return;
    const d = Math.max(ctx.W, ctx.H) * ctx.s;
    if (preset === "top") cam.position.set(0, d * 1.5, 0.01);
    else if (preset === "front") cam.position.set(0, d * 0.5, d * 1.3);
    else cam.position.set(d * 0.6, d * 0.85, d * 1.0);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  // World-space bounding box (footprint coords) of all content, or just the
  // selection — used to frame the camera on plants too big to eyeball (EPIC 0).
  const worldBounds = useCallback(
    (
      scope: "all" | "selection",
    ): { minX: number; minY: number; maxX: number; maxY: number } | null => {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const add = (x: number, y: number, w: number, h: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      };
      const sel = selRef.current;
      const wantStation = (id: string) =>
        scope === "all" ||
        sel.some((it) => it.type === "station" && it.id === id);
      const wantAsset = (id: string) =>
        scope === "all" ||
        sel.some((it) => it.type === "asset" && it.id === id);
      placementsRef.current.forEach((p, id) => {
        if (wantStation(id)) add(p.x, p.y, p.w, p.h);
      });
      assetsRef.current.forEach((a) => {
        if (wantAsset(a.id)) add(a.x, a.y, a.w, a.h);
      });
      const selectedNative = new Set(nativeSelectionIdsRef.current);
      for (const entity of loadedCadDocumentRef.current?.entities ?? []) {
        if (
          !CAD_ENTITY_REGISTRY.supports(entity) ||
          (scope === "selection" && !selectedNative.has(entity.id))
        )
          continue;
        const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(
          entity, loadedCadDocumentRef.current ?? undefined);
        // XLINE y RAY declaran bounds INFINITOS, que es lo que son. Sin este
        // descarte `minX` pasa a −Infinity, el guardia de abajo devuelve `null`
        // y ZOOM EXTENTS muere para el dibujo ENTERO en cuanto alguien traza una
        // recta de construcción. AutoCAD también las excluye del encuadre.
        if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) continue;
        add(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      }
      if (!Number.isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    },
    [],
  );

  // Frame a world-space box: centre the orbit target on it and pull the camera
  // back far enough that the box fits the current FOV, keeping the view angle.
  const fitToBounds = useCallback(
    (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      const ctx = ctxRef.current;
      if (!cam || !ctrl || !ctx) return;
      const { s, W, H } = ctx;
      const cx = (b.minX + b.maxX) / 2,
        cy = (b.minY + b.maxY) / 2;
      const targetX = (cx - W / 2) * s,
        targetZ = (cy - H / 2) * s;
      const spanX = Math.max((b.maxX - b.minX) * s, s);
      const spanZ = Math.max((b.maxY - b.minY) * s, s);
      const fov = (cam.fov * Math.PI) / 180;
      const aspect = cam.aspect || 1;
      const fitForZ = spanZ / 2 / Math.tan(fov / 2);
      const fitForX = spanX / 2 / Math.tan(fov / 2) / aspect;
      const dist =
        Math.max(fitForZ, fitForX) * 1.25 + Math.max(spanX, spanZ) * 0.12;
      const dir = new THREE.Vector3().subVectors(cam.position, ctrl.target);
      if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.85, 1.0);
      dir.normalize().multiplyScalar(dist);
      ctrl.target.set(targetX, 0, targetZ);
      cam.position.set(
        targetX + dir.x,
        Math.max(dir.y, dist * 0.15),
        targetZ + dir.z,
      );
      ctrl.update();
    },
    [],
  );

  const fitView = useCallback(
    (scope: "all" | "selection" | "plant") => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const plant = { minX: 0, minY: 0, maxX: ctx.W, maxY: ctx.H };
      const b = scope === "plant" ? plant : (worldBounds(scope) ?? plant);
      fitToBounds(b);
    },
    [worldBounds, fitToBounds],
  );
  // ---- 2D⇄3D view toggle: the CAD unifica plano (2D) y modelo (3D) (unify) ----
  // 2D = vista superior bloqueada (solo pan+zoom), como un plano CAD; 3D = órbita libre.
  const saveCurrentViewportBookmark = () => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    const base = selRef.current.length
      ? `${selRef.current.length} selected`
      : viewMode === "2d"
        ? "2D plan"
        : "3D view";
    const bookmark = createCadViewportBookmark({
      id: newId("view"),
      label: `${base} ${viewportBookmarks.length + 1}`,
      camera: {
        mode: viewMode,
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target: { x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z },
      },
    });
    const next = upsertCadViewportBookmark(viewportBookmarks, bookmark);
    setViewportBookmarks(next);
    persistViewportBookmarks(next);
    toast.success(`${bookmark.label} guardada.`, "Vistas CAD");
  };
  const restoreViewportBookmark = (bookmark: CadViewportBookmark) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!cam || !ctrl) return;
    if (walkRef.current) {
      setWalk(false);
      walkRef.current = false;
    }
    setViewMode(bookmark.camera.mode);
    configureOrbitControlsForMode(bookmark.camera.mode);
    cam.position.set(
      bookmark.camera.position.x,
      bookmark.camera.position.y,
      bookmark.camera.position.z,
    );
    ctrl.target.set(
      bookmark.camera.target.x,
      bookmark.camera.target.y,
      bookmark.camera.target.z,
    );
    ctrl.update();
    toast.success(`Vista restaurada: ${bookmark.label}.`, "Vistas CAD");
  };
  const deleteViewportBookmark = (bookmark: CadViewportBookmark) => {
    const next = removeCadViewportBookmark(viewportBookmarks, bookmark.id);
    setViewportBookmarks(next);
    persistViewportBookmarks(next);
    toast.success(`Vista eliminada: ${bookmark.label}.`, "Vistas CAD");
  };
  const toggleViewMenu = () => {
    const next = !showView;
    if (next) {
      const bounds = viewMenuRef.current?.getBoundingClientRect();
      if (bounds)
        setViewMenuPosition({
          left: Math.max(8, Math.min(bounds.left, window.innerWidth - 304)),
          top: bounds.bottom + 6,
        });
      setViewportBookmarks(readViewportBookmarks());
      if (data)
        setFpDraft({
          w: data.footprint.footprintW,
          h: data.footprint.footprintH,
          g: data.footprint.gridSize,
        });
    }
    setShowView(next);
  };
  const applyViewMode = useCallback((mode: "3d" | "2d") => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const ctx = ctxRef.current;
    viewControllerRef.current?.setMode(mode);
    if (!cam || !ctrl || !ctx) return;
    const d = Math.max(ctx.W, ctx.H) * ctx.s;
    if (mode === "2d") {
      // exit walkthrough if active, lock to a straight-down plan view
      if (walkRef.current) {
        setWalk(false);
        walkRef.current = false;
      }
      cam.position.set(0, d * 1.6, 0.01); // straight above, due-south → footprint axis-aligned (no 45° diamond)
    } else {
      cam.position.set(d * 0.6, d * 0.85, d * 1.0);
    }
    // Ángulos, botón del ratón y gesto de un dedo: una sola regla, en un solo
    // sitio. Estaba escrita dos veces y las dos copias tenían que coincidir.
    applyCadCameraPolicy(ctrl, mode);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  }, []);
  const toggleViewMode = useCallback(() => {
    setViewMode((m) => {
      const next = m === "3d" ? "2d" : "3d";
      applyViewMode(next);
      return next;
    });
  }, [applyViewMode]);
  const exportPng = () => {
    const r = rendererRef.current,
      sc = sceneRef.current,
      cam = cameraRef.current;
    if (!r || !sc || !cam) return;
    r.render(sc, cam);
    const a = document.createElement("a");
    a.href = r.domElement.toDataURL("image/png");
    a.download = `layout3d-${model}-${revision}.png`.replace(/[^\w.\-]+/g, "_");
    a.click();
  };
  // Plot a printable PDF sheet: the rendered view + a title block (Fase 65).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained only as rollback code; user-facing PDF uses publishSheetSetPdf.
  const exportPdf = async (paperOverride?: CadPaperId) => {
    const r = rendererRef.current,
      sc = sceneRef.current,
      cam = cameraRef.current,
      fp = data?.footprint;
    if (!r || !sc || !cam || !fp) return;
    try {
      r.render(sc, cam);
      const img = r.domElement.toDataURL("image/png");
      const placements = [...placementsRef.current.values()];
      const stationArea = placements.reduce((acc, p) => acc + p.w * p.h, 0);
      const assets = [...assetsRef.current.values()];
      const equipArea = assets.reduce(
        (acc, x) =>
          x.kind !== "zone" && x.kind !== "agvpath" ? acc + x.w * x.h : acc,
        0,
      );
      const footprintArea = fp.footprintW * fp.footprintH;
      const util =
        footprintArea > 0
          ? Math.min(100, ((stationArea + equipArea) / footprintArea) * 100)
          : 0;
      const centers: Record<string, FlowCenter> = {};
      placementsRef.current.forEach((p, id) => {
        centers[id] = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
      });
      const flow = flowMetrics(connectorsRef.current, centers);
      const annotations = [...annotationsRef.current.values()];
      const dimensionCount = annotations.filter(
        (item) => item.type === "dim",
      ).length;
      const labelCount = annotations.filter(
        (item) => item.type === "text",
      ).length;
      const validationIssueCount = cadValidationReport
        ? cadValidationReport.issues.length
        : 0;
      const activeLayerLabel =
        cadLayers.find((layer) => layer.id === activeCadLayer)?.label ??
        activeCadLayer;
      const approvalLabel = approval
        ? APPROVAL_META[approval.status].label
        : "Borrador";
      // Motor universal de ploteo: papel elegido por el usuario, orientación
      // según la forma del dibujo y la MAYOR escala estándar que quepa.
      const unitStr = fp.unit === "m" ? "m" : "mm";
      const wMm = unitStr === "m" ? fp.footprintW * 1000 : fp.footprintW;
      const hMm = unitStr === "m" ? fp.footprintH * 1000 : fp.footprintH;
      const plot = buildPlotSheet({
        drawingW: wMm,
        drawingH: hMm,
        paper: paperOverride ?? plotPaper,
        orientation: wMm >= hMm ? "landscape" : "portrait",
        project: `Layout ${model}`,
        drawnBy: branding.legalEntityName,
        date: new Date().toLocaleDateString("es-MX"),
        revision,
        sheetNumber: "1/2",
      });
      if (!plot.scale) {
        toast.error(
          plot.issues[0] ??
            "El plano no cabe en este papel; usa uno más grande.",
          "3D",
        );
        return;
      }
      const plotScale = plot.scale;
      const paperOrientationLabel =
        plot.orientation === "landscape" ? "horizontal" : "vertical";
      const sheet = plotSheetModel({
        model,
        revision,
        unit: fp.unit || "mm",
        footprintW: fp.footprintW,
        footprintH: fp.footprintH,
        placedStations: placements.length,
        totalStations: data!.stations.length,
        equipmentCount: assets.length,
        utilPct: util,
        flowLen: flow.totalLen,
        date: new Date(),
        sheetSize: `${plot.paperLabel} ${paperOrientationLabel}`,
        exportFormat: "PDF",
        approvalStatus: approvalLabel,
        activeLayer: activeLayerLabel,
        layerCount: cadLayers.length,
        visibleLayerCount: cadLayers.filter((layer) => layer.visible).length,
        lockedLayerCount: cadLayers.filter((layer) => layer.locked).length,
        connectorCount: connectorsRef.current.length,
        dimensionCount,
        labelCount,
        validationSeverity: cadValidationReport?.severity ?? "pending",
        validationIssueCount,
        dxfWarningCount: dxfWarnings.length,
      });
      const { jsPDF } = await import("jspdf");
      const paperBase = CAD_PAPER_SIZES[plot.paper];
      const doc = new jsPDF({
        orientation: plot.orientation,
        unit: "mm",
        format: [paperBase.w, paperBase.h],
      });
      const pageW = plot.sheetW,
        pageH = plot.sheetH,
        margin = 10;
      const drawHeader = () => {
        doc.setFillColor(17, 24, 39);
        doc.rect(0, 0, pageW, 16, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(`${branding.brandName} · ${sheet.title}`, margin, 11);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(sheet.subtitle, pageW - margin, 11, { align: "right" });
      };
      // ── Página 1: HOJA UNIVERSAL A ESCALA ESTÁNDAR (motor lib/cad/plot-sheet) ──
      // Sin banner web: marco, dibujo centrado por el motor y cajetín inferior
      // clásico, como una lámina de arquitectura. La ficha EMS vive en la pág. 2.
      const layout: PlotLayout = {
        scale: plotScale,
        drawingWmm: plot.placement.w,
        drawingHmm: plot.placement.h,
        offsetXmm: plot.placement.x,
        offsetYmm: plot.placement.y,
        paper: { w: pageW, h: pageH },
      };
      // worldToPaper asume origen abajo-izquierda; el editor usa Y hacia abajo —
      // se compensa con footprintH − y para que el papel coincida con la pantalla.
      const toPaper = (x: number, y: number) =>
        worldToPaper(
          { x, y: fp.footprintH - y },
          { footprintH: fp.footprintH, unit: unitStr },
          layout,
        );
      const drawPoly = (
        box: { x: number; y: number; w: number; h: number; rotation?: number },
        style: "S" | "F" | "FD",
      ) => {
        const pts = rectGeometry(box).corners.map((c) => toPaper(c.x, c.y));
        const deltas = pts
          .slice(1)
          .map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]);
        doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], style, true);
      };
      // borde de la huella
      doc.setDrawColor(60);
      doc.setLineWidth(0.4);
      doc.rect(
        layout.offsetXmm,
        layout.offsetYmm,
        layout.drawingWmm,
        layout.drawingHmm,
      );
      doc.setLineWidth(0.2);
      const assetList = [...assetsRef.current.values()];
      // zonas y pasillos al fondo
      doc.setDrawColor(160);
      doc.setFillColor(235, 242, 250);
      assetList
        .filter((a) => a.kind === "zone")
        .forEach((a) => drawPoly(a, "FD"));
      doc.setFillColor(252, 243, 219);
      assetList
        .filter((a) => a.kind === "agvpath" || a.kind === "path")
        .forEach((a) => drawPoly(a, "FD"));
      // equipo
      doc.setDrawColor(90);
      doc.setFillColor(246, 248, 250);
      assetList
        .filter(
          (a) =>
            a.kind !== "zone" &&
            a.kind !== "agvpath" &&
            a.kind !== "path" &&
            a.kind !== "wall",
        )
        .forEach((a) => drawPoly(a, "FD"));
      // muros — trazo grueso
      doc.setDrawColor(20);
      doc.setFillColor(40, 44, 52);
      doc.setLineWidth(0.3);
      assetList
        .filter((a) => a.kind === "wall")
        .forEach((a) => drawPoly(a, "FD"));
      doc.setLineWidth(0.2);
      // conectores de flujo
      doc.setDrawColor(37, 99, 235);
      connectorsRef.current.forEach((c) => {
        const a = placementsRef.current.get(c.from);
        const b = placementsRef.current.get(c.to);
        if (!a || !b) return;
        const pa = toPaper(a.x + a.w / 2, a.y + a.h / 2);
        const pb = toPaper(b.x + b.w / 2, b.y + b.h / 2);
        doc.line(pa.x, pa.y, pb.x, pb.y);
      });
      // estaciones + etiqueta cuando el tamaño en papel lo permite
      doc.setDrawColor(30, 64, 175);
      doc.setFillColor(219, 234, 254);
      placementsRef.current.forEach((p, id) => {
        drawPoly(p, "FD");
        const paperW = (unitStr === "m" ? p.w * 1000 : p.w) / plotScale;
        if (paperW >= 10) {
          const ccenter = toPaper(p.x + p.w / 2, p.y + p.h / 2);
          doc.setFontSize(6);
          doc.setTextColor(15, 23, 42);
          doc.setFont("helvetica", "normal");
          doc.text(
            (stationsByIdRef.current.get(id)?.station ?? id).slice(0, 14),
            ccenter.x,
            ccenter.y,
            { align: "center" },
          );
        }
      });
      // marco de la lámina
      doc.setDrawColor(20);
      doc.setLineWidth(0.5);
      doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
      doc.setLineWidth(0.2);
      // cajetín inferior clásico: marca + 2 filas × 4 campos
      const tb = {
        x: margin,
        y: pageH - margin - 30,
        w: pageW - margin * 2,
        h: 30,
      };
      doc.setDrawColor(20);
      doc.setLineWidth(0.4);
      doc.rect(tb.x, tb.y, tb.w, tb.h);
      doc.setLineWidth(0.2);
      const brandW = Math.min(60, tb.w * 0.22);
      doc.line(tb.x + brandW, tb.y, tb.x + brandW, tb.y + tb.h);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 24, 32);
      doc.text(branding.brandName, tb.x + brandW / 2, tb.y + 13, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(110, 116, 128);
      doc.text(sheet.title, tb.x + brandW / 2, tb.y + 19, { align: "center" });
      const tbFields = [
        { label: "Proyecto", value: plot.titleBlock.project },
        { label: "Huella", value: sheet.footprintLabel },
        { label: "Escala", value: plot.scaleLabel },
        {
          label: "Papel",
          value: `${plot.paperLabel} ${paperOrientationLabel}`,
        },
        { label: "Fecha", value: plot.titleBlock.date },
        { label: "Dibujó", value: plot.titleBlock.drawnBy },
        { label: "Hoja", value: plot.titleBlock.sheetNumber },
        { label: "Revisión", value: plot.titleBlock.revision },
      ];
      const cellW = (tb.w - brandW) / 4,
        cellH = tb.h / 2;
      tbFields.forEach((f, i) => {
        const cx = tb.x + brandW + (i % 4) * cellW,
          cy = tb.y + Math.floor(i / 4) * cellH;
        doc.setDrawColor(150);
        doc.rect(cx, cy, cellW, cellH);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(110, 116, 128);
        doc.text(f.label.toUpperCase(), cx + 2, cy + 4.5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 24, 32);
        doc.text(String(f.value).slice(0, 34), cx + 2, cy + 10.5);
      });
      // escalímetro del motor: tramos redondos (1/2/5×10^n) alternados sobre el cajetín
      if (plot.scaleBar) {
        const bar = plot.scaleBar;
        const barY = tb.y - 6;
        let barX = margin + 2;
        doc.setDrawColor(20);
        for (let i = 0; i < bar.segments; i++) {
          if (i % 2 === 0) doc.setFillColor(20, 24, 32);
          else doc.setFillColor(255, 255, 255);
          doc.rect(barX, barY, bar.segmentSheetMm, 2, "FD");
          barX += bar.segmentSheetMm;
        }
        doc.setFontSize(6.5);
        doc.setTextColor(60, 66, 76);
        doc.setFont("helvetica", "normal");
        for (let i = 0; i <= bar.segments; i++) {
          const real = bar.segmentMm * i;
          doc.text(
            real >= 1000 ? `${real / 1000}` : `${real}`,
            margin + 2 + bar.segmentSheetMm * i,
            barY - 1,
            { align: "center" },
          );
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(20, 24, 32);
        doc.text(
          `Escala ${plot.scaleLabel} · tramo ${bar.label}`,
          barX + 5,
          barY + 2,
        );
      }
      // ── Página 2: vista 3D + ficha técnica EMS (el cajetín extendido) ──
      doc.addPage([paperBase.w, paperBase.h], plot.orientation);
      drawHeader();
      const fields = [
        ...sheet.fields,
        { label: "Escala", value: plot.scaleLabel },
        {
          label: "Papel",
          value: `${plot.paperLabel} ${paperOrientationLabel}`,
        },
      ];
      const tbW = 70,
        tbX = pageW - margin - tbW,
        tbY = 22,
        rowH = 8;
      const tbH = Math.min(fields.length * rowH + 6, pageH - tbY - margin);
      doc.setDrawColor(150);
      doc.setFillColor(246, 248, 250);
      doc.rect(tbX, tbY, tbW, tbH, "FD");
      doc.setFontSize(8);
      let y = tbY + 6;
      for (const f of fields) {
        if (y > tbY + tbH - 3) break;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 116, 128);
        doc.text(f.label, tbX + 3, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 24, 32);
        doc.text(f.value, tbX + tbW - 3, y, { align: "right" });
        y += rowH;
      }
      const vX = margin,
        vY = 22,
        vW = tbX - margin - 6,
        vH = pageH - vY - margin;
      const props = doc.getImageProperties(img);
      const ar = (props.width || 4) / (props.height || 3);
      let w = vW,
        h = w / ar;
      if (h > vH) {
        h = vH;
        w = h * ar;
      }
      doc.setDrawColor(205);
      doc.rect(vX, vY, vW, vH);
      doc.addImage(img, "PNG", vX + (vW - w) / 2, vY + (vH - h) / 2, w, h);
      doc.save(`layout-${model}-${revision}.pdf`.replace(/[^\w.\-]+/g, "_"));
      toast.success(
        `Plano ${plot.paperLabel} ${paperOrientationLabel} a escala 1:${plotScale} (PDF, 2 páginas).`,
        "3D",
      );
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF.", "3D");
    }
  };
  // Export the 3D model as binary glTF (.glb) — opens in Blender, other CAD, etc.
  const exportGltf = async () => {
    const groups = [
      blocksRef.current,
      assetsGroupRef.current,
      connsGroupRef.current,
      groundRef.current,
    ].filter(Boolean) as THREE.Object3D[];
    if (!groups.length) return;
    try {
      const { GLTFExporter } =
        await import("three/examples/jsm/exporters/GLTFExporter.js");
      // hide labels + the live preview line so the model is clean geometry
      const hidden: THREE.Object3D[] = [];
      sceneRef.current?.traverse((o) => {
        if (
          (o.userData?.isLabel || o === previewLineRef.current) &&
          o.visible
        ) {
          o.visible = false;
          hidden.push(o);
        }
      });
      const restore = () =>
        hidden.forEach((o) => {
          o.visible = true;
        });
      new GLTFExporter().parse(
        groups,
        (result) => {
          restore();
          const blob = new Blob([result as ArrayBuffer], {
            type: "model/gltf-binary",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `layout3d-${model}-${revision}.glb`.replace(
            /[^\w.\-]+/g,
            "_",
          );
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Modelo 3D exportado (.glb).", "3D");
        },
        (err) => {
          restore();
          console.error(err);
          toast.error("No se pudo exportar el modelo 3D.", "3D");
        },
        { binary: true, onlyVisible: true },
      );
    } catch {
      toast.error("No se pudo exportar el modelo 3D.", "3D");
    }
  };
  const computeDxfExportSummary = (
    options: DxfExportOptions,
  ): DxfExportSummary => {
    const selectedIds = new Set(selRef.current.map((item) => item.id));
    const selectedNativeIds = new Set(nativeSelectionIdsRef.current);
    const layerLabel = (id: CadLayerId) =>
      cadLayers.find((layer) => layer.id === id)?.label ?? id;
    const layerVisible = (id: CadLayerId) =>
      cadLayers.find((layer) => layer.id === id)?.visible ?? true;
    const entities: CadDxfExportReadinessEntity[] = [
      ...[...placementsRef.current.keys()].map((id) => {
        const layerId = layerAssignments[id] ?? "layout";
        return {
          id,
          kind: "object" as const,
          layer: layerLabel(layerId),
          label: stationsByIdRef.current.get(id)?.station,
          requiresLabel: true,
          selected: selectedIds.has(id),
          visible: layerVisible(layerId),
        };
      }),
      ...[...assetsRef.current.values()].map((asset) => {
        const layerId =
          layerAssignments[asset.id] ??
          defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]);
        return {
          id: asset.id,
          kind: "object" as const,
          layer: layerLabel(layerId),
          label: asset.label,
          requiresLabel: DXF_LABEL_REQUIRED_ASSET_KINDS.has(asset.kind),
          selected: selectedIds.has(asset.id),
          visible: layerVisible(layerId),
        };
      }),
      ...connectorsRef.current.map((conn) => ({
        id: `${conn.from}:${conn.to}`,
        kind: "connector" as const,
        layer: layerLabel("flow"),
        selected: selectedIds.has(conn.from) && selectedIds.has(conn.to),
        visible: layerVisible("flow"),
      })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === "dim" && ann.x2 != null && ann.y2 != null)
        .map((ann) => ({
          id: ann.id,
          kind: "measurement" as const,
          layer: layerLabel("measurements"),
          label: ann.text,
          selected: true,
          visible: layerVisible("measurements"),
        })),
      ...[...annotationsRef.current.values()]
        .filter((ann) => ann.type === "text")
        .map((ann) => ({
          id: ann.id,
          kind: "label" as const,
          layer: "Text",
          label: ann.text,
          selected: true,
          visible: layersRef.current.notes,
        })),
      ...(loadedCadDocumentRef.current?.entities ?? [])
        .filter((entity) => CAD_ENTITY_REGISTRY.supports(entity))
        .map((entity) => {
          const layer = loadedCadDocumentRef.current?.layers.find(
            (candidate) => candidate.id === entity.layer,
          );
          return {
            id: entity.id,
            kind: "object" as const,
            layer: layer?.name ?? entity.layer,
            label: entity.type.toUpperCase(),
            selected: selectedNativeIds.has(entity.id),
            visible: layer?.visible !== false,
          };
        }),
    ];
    const readiness = evaluateCadDxfExportReadiness({
      scope: options.scope,
      includeHidden: options.includeHidden,
      includeMeasurements: options.includeMeasurements,
      includeLabels: options.includeLabels,
      selectedObjectCount: selectedIds.size + selectedNativeIds.size,
      entities,
      validationBlockers:
        (report?.errors ?? 0) + collisionHits.length + safetyIssues.length,
      validationWarnings:
        (report?.warnings ?? 0) +
        dxfWarnings.length +
        (flowHealth && flowHealth.score < 80 ? 1 : 0),
      dxfImportWarnings: dxfWarnings.length,
      selectionKeepsAnnotations: true,
    });
    return {
      objects: readiness.counts.object,
      connectors: readiness.counts.connector,
      measurements: readiness.counts.measurement,
      labels: readiness.counts.label,
      layers: readiness.includedLayers.length,
      canExport: readiness.canExport,
      includedLayers: readiness.includedLayers,
      layerSummary: readiness.layerSummary,
      issues: readiness.issues,
    };
  };
  const setDxfOption = (patch: Partial<DxfExportOptions>) => {
    setDxfExportOptions((cur) => {
      const next = { ...cur, ...patch };
      setDxfExportSummary(computeDxfExportSummary(next));
      return next;
    });
  };
  const openDxfExport = () => {
    const next = {
      ...dxfExportOptions,
      units: data?.footprint.unit === "m" ? ("m" as const) : ("mm" as const),
      fileName: `layout-${model}-${revision}`.replace(/[^\w.\-]+/g, "_"),
    };
    setDxfExportOptions(next);
    setDxfExportSummary(computeDxfExportSummary(next));
    setShowDxfExport(true);
  };
  /**
   * Huella de la ENTRADA del preflight: documento, alcance, selección, capas
   * ocultas y opciones. Aceptar unas pérdidas vale sólo para esta huella; en
   * cuanto cambia algo que puede alterar lo que se pierde, hay que volver a
   * mirar. Se usa la versión del documento —que sube en cada `commitChange`—
   * en vez de serializarlo entero, que en un plano grande sería caro.
   */
  const dxfPreflightToken = (
    options: DxfExportOptions,
    document: CadDocument,
  ) =>
    JSON.stringify({
      documentId: currentDocumentIdRef.current,
      version: document.meta.version,
      entities: document.entities.length,
      scope: options.scope,
      includeHidden: options.includeHidden,
      includeMeasurements: options.includeMeasurements,
      includeLabels: options.includeLabels,
      units: options.units,
      selection:
        options.scope === "selection"
          ? [...nativeSelectionIdsRef.current].sort()
          : null,
      hiddenLayers: document.layers
        .filter((layer) => layer.visible === false)
        .map((layer) => layer.id)
        .sort(),
    });
  const exportDxf = async (options: DxfExportOptions = dxfExportOptions) => {
    try {
      const summary = computeDxfExportSummary(options);
      setDxfExportSummary(summary);
      const blocker = summary.issues.find((issue) => issue.level === "blocker");
      if (blocker) {
        toast.error(blocker.message, "DXF");
        return;
      }
      const layerLabel = (id: CadLayerId) =>
        cadLayers.find((layer) => layer.id === id)?.label ?? id;
      const layerVisible = (id: CadLayerId) =>
        cadLayers.find((layer) => layer.id === id)?.visible ?? true;
      const includeLayer = (id: CadLayerId) =>
        options.includeHidden || layerVisible(id);
      const centerFor = (id: string): { x: number; y: number } | null => {
        const p = placementsRef.current.get(id);
        if (p) return { x: p.x, y: p.y };
        const asset = assetsRef.current.get(id);
        if (asset) return { x: asset.x, y: asset.y };
        return null;
      };
      const selectedIds = new Set(selRef.current.map((item) => item.id));
      const selectedNativeIds = new Set(nativeSelectionIdsRef.current);
      const includeObject = (id: string, fallback: CadLayerId) => {
        if (options.scope === "selection" && !selectedIds.has(id)) return false;
        return includeLayer(layerAssignments[id] ?? fallback);
      };
      const boxes = [
        ...[...placementsRef.current.entries()]
          .filter(([id]) => includeObject(id, "layout"))
          .map(([id, p]) => ({
            id,
            label: stationsByIdRef.current.get(id)?.station ?? id,
            x: p.x,
            y: p.y,
            width: p.w,
            height: p.h,
            rotation: p.rotation,
            layer: layerLabel(layerAssignments[id] ?? "layout"),
          })),
        ...[...assetsRef.current.values()]
          .filter((asset) =>
            includeObject(
              asset.id,
              defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]),
            ),
          )
          .map((asset) => ({
            id: asset.id,
            label: asset.label || assetMeta(asset.kind).label,
            x: asset.x,
            y: asset.y,
            width: asset.w,
            height: asset.h,
            rotation: asset.rotation,
            layer: layerLabel(
              layerAssignments[asset.id] ??
                defaultCadLayerForAssetKind(asset.kind, objectTags[asset.id]),
            ),
            ...(asset.shape === "circle" ? { shape: "circle" as const } : {}),
            ...(assetMeta(asset.kind).archetype === "zone"
              ? { hatch: true }
              : {}),
          })),
      ];
      const connectors = connectorsRef.current
        .map((conn) => {
          if (!includeLayer("flow")) return null;
          if (
            options.scope === "selection" &&
            (!selectedIds.has(conn.from) || !selectedIds.has(conn.to))
          )
            return null;
          const from = centerFor(conn.from);
          const to = centerFor(conn.to);
          return from && to ? { from, to, layer: layerLabel("flow") } : null;
        })
        .filter(
          (
            conn,
          ): conn is {
            from: { x: number; y: number };
            to: { x: number; y: number };
            layer: string;
          } => !!conn,
        );
      const labels =
        options.includeLabels &&
        (options.includeHidden || layersRef.current.notes)
          ? [...annotationsRef.current.values()]
              .filter((ann) => ann.type === "text")
              .map((ann) => ({
                text: ann.text || "Nota",
                x: ann.x,
                y: ann.y,
                layer: "Text",
              }))
          : [];
      const measurements =
        options.includeMeasurements && includeLayer("measurements")
          ? [...annotationsRef.current.values()]
              .filter(
                (ann) => ann.type === "dim" && ann.x2 != null && ann.y2 != null,
              )
              .map((ann) => ({
                from: { x: ann.x, y: ann.y },
                to: { x: ann.x2!, y: ann.y2! },
                label: ann.text,
                layer: layerLabel("measurements"),
              }))
          : [];
      const dxfDocument = snapshotDocument();
      // Un único predicado: el informe de pérdidas DEBE mirar exactamente las
      // mismas entidades que se exportan, o avisaría de cosas que no viajan.
      const dxfExportEntityFilter = (entity: CadEntity) => {
        if (!CAD_ENTITY_REGISTRY.supports(entity)) return false;
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = loadedCadDocumentRef.current?.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      };
      const primitives = cadDocumentNativeDxfPrimitives(
        dxfDocument,
        dxfExportEntityFilter,
      );
      const hatches = cadDocumentNativeDxfHatches(dxfDocument, (entity) => {
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = loadedCadDocumentRef.current?.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      });
      const mtexts = options.includeLabels
        ? cadDocumentNativeDxfMTexts(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const semanticDimensions = options.includeMeasurements
        ? cadDocumentNativeDxfSemanticDimensions(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const mleaders = options.includeLabels
        ? cadDocumentNativeDxfMleaders(dxfDocument, (entity) => {
            if (
              options.scope === "selection" &&
              !selectedNativeIds.has(entity.id)
            )
              return false;
            const layer = loadedCadDocumentRef.current?.layers.find(
              (candidate) => candidate.id === entity.layer,
            );
            return options.includeHidden || layer?.visible !== false;
          })
        : [];
      const blocks = cadDocumentDxfBlocks(dxfDocument);
      const inserts = cadDocumentDxfInserts(dxfDocument, (entity) => {
        if (options.scope === "selection" && !selectedNativeIds.has(entity.id))
          return false;
        const layer = dxfDocument.layers.find(
          (candidate) => candidate.id === entity.layer,
        );
        return options.includeHidden || layer?.visible !== false;
      });
      const exported = exportCadLayoutDxf(
        {
          boxes,
          connectors,
          labels,
          measurements,
          primitives,
          hatches,
          mtexts,
          semanticDimensions,
          mleaders,
          blocks,
          inserts,
        },
        {
          units: options.units,
          fileComment: `${branding.productLabel} ${model} ${revision}`,
        },
      );
      // ── PREFLIGHT ──────────────────────────────────────────────────────
      // Las pérdidas se calculan con el MISMO filtro que se acaba de usar para
      // construir el modelo, y ANTES de que exista el Blob. Un DXF limpio
      // descarga directamente; uno con pérdidas exige verlas primero, y si
      // alguna elimina geometría, aceptarlas explícitamente.
      const exportLosses = cadDocumentDxfExportLosses(
        dxfDocument,
        dxfExportEntityFilter,
      );
      const token = dxfPreflightToken(options, dxfDocument);
      if (exportLosses.length > 0) {
        const blocking = exportLosses.some((loss) => loss.severity === "error");
        const alreadyReported = dxfPreflight?.token === token;
        setDxfPreflight({ token, losses: exportLosses, blocking });
        // Primera pulsación sobre una entrada con pérdidas: se ENSEÑA el
        // informe y no se descarga nada. Nunca se anuncia éxito antes de que
        // el usuario haya podido ver lo que el DXF no representa.
        if (!alreadyReported) {
          toast.error(
            blocking
              ? `El DXF no puede representar ${exportLosses.filter((loss) => loss.severity === "error").length} entidad(es). Revisa el informe y confirma si quieres descargarlo igualmente.`
              : `El DXF degrada ${exportLosses.length} entidad(es). Revisa el informe antes de descargar.`,
            "DXF",
          );
          return;
        }
        // Una pérdida que ELIMINA geometría exige además aceptación explícita;
        // una degradación se descarga tras haberse mostrado. La aceptación es
        // de ESTA entrada: si cambió el documento, la selección, el alcance o
        // las opciones, el token cambia y vuelve a pedirse.
        if (blocking && dxfPreflightAccepted !== token) {
          toast.error(
            "Confirma que aceptas las pérdidas antes de descargar el DXF.",
            "DXF",
          );
          return;
        }
      } else {
        setDxfPreflight(null);
      }

      const blob = new Blob([exported.content], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(options.fileName.trim() || `layout-${model}-${revision}`).replace(/[^\w.\-]+/g, "_")}.dxf`;
      a.click();
      URL.revokeObjectURL(url);
      setShowDxfExport(false);
      setDxfPreflight(null);
      setDxfPreflightAccepted(null);
      toast.success(
        exportLosses.length
          ? `Layout exportado a DXF (${exported.entityCount} entidades) con ${exportLosses.length} pérdida(s) aceptada(s). Conserva el documento de Valle Design como original.`
          : `Layout exportado a DXF (${exported.entityCount} entidades).`,
        "DXF",
      );
    } catch {
      toast.error("No se pudo exportar el DXF.", "DXF");
    }
  };
  const captureCanonicalSaveRequest = (): CanonicalSaveRequest | null => {
    if (drawingReadOnlyRef.current) return null;
    const targetDocumentId = currentDocumentIdRef.current;
    const base = dataRef.current;
    if (!targetDocumentId || !base) return null;
    return {
      documentId: targetDocumentId,
      document: commitChange(snapshotDocument(), "save"),
      generation: editGenerationRef.current,
      base,
    };
  };
  const persistCanonicalSave = async (
    request: CanonicalSaveRequest,
    origin: "manual" | "autosave",
  ): Promise<Layout | null> => {
    if (drawingReadOnlyRef.current) return null;
    const lastSavedGeneration =
      savedGenerationByDocumentRef.current.get(request.documentId) ?? -1;
    if (lastSavedGeneration >= request.generation) {
      return currentDocumentIdRef.current === request.documentId
        ? dataRef.current
        : request.base;
    }
    const expectedVersion =
      versionByDocumentRef.current.get(request.documentId) ??
      request.base.cadDocumentVersion ??
      0;
    try {
      const result = await documentLifecycle.save(
        request.documentId,
        request.document,
        expectedVersion,
      );
      versionByDocumentRef.current.set(request.documentId, result.version);
      savedGenerationByDocumentRef.current.set(
        request.documentId,
        request.generation,
      );
      const saved: Layout = {
        ...(editorOpenRef.current &&
        currentDocumentIdRef.current === request.documentId
          ? (dataRef.current ?? request.base)
          : request.base),
        cadDocument: request.document as unknown as Record<string, unknown>,
        cadDocumentVersion: result.version,
      };
      const requestIsActive =
        editorOpenRef.current &&
        currentDocumentIdRef.current === request.documentId;
      if (requestIsActive) {
        // Un guardado con generación obsoleta actualiza el token CAS, nunca el
        // estado del editor: el snapshot en vuelo es más viejo que lo que el
        // usuario ya tiene en pantalla y reponerlo pisaría sus ediciones.
        if (editGenerationRef.current === request.generation) {
          loadedCadDocumentRef.current = request.document;
          syncCadLayerState(request.document);
          setCadXrefs(
            request.document.externalReferences.map((reference) => ({
              ...reference,
            })),
          );
          setPublicationRecords([...request.document.publications]);
          setNativeEntities(
            request.document.entities.filter(
              (entity): entity is CadNativeEntity =>
                CAD_ENTITY_REGISTRY.supports(entity),
            ),
          );
          setNativeDocumentRevision((value) => value + 1);
          dataRef.current = saved;
          setData((current) =>
            current
              ? {
                  ...current,
                  cadDocument: saved.cadDocument,
                  cadDocumentVersion: result.version,
                }
              : saved,
          );
          loadedPlacedRef.current = new Set(placementsRef.current.keys());
          dirtyRef.current = false;
          setDirty(false);
          setRecoveryCandidate(null);
          setRecoveryDivergent(false);
          setRecoverySavedAt(null);
          setRecoveryWarning(null);
          // Sólo MI carril y sólo hasta la generación que el servidor acaba de
          // confirmar. Antes se borraba el ámbito entero: guardar aquí
          // destruía los checkpoints de las demás pestañas abiertas sobre este
          // dibujo, que ni habían guardado y cuyo trabajo sólo existía ahí.
          if (recoveryScope && recoveryLaneRef.current)
            void clearCadRecoveryLaneThrough(
              recoveryScope,
              recoveryLaneRef.current,
              request.generation,
              recoverySessionStartedAtRef.current,
            ).catch(() => undefined);
        } else {
          // A newer edit landed while the request was in flight. Preserve
          // dirty and queue that generation against the new CAS version.
          scheduleAutosaveRef.current();
        }
        setConnectionState("online");
        // Sólo el de ESTE documento: otro dibujo puede seguir en conflicto y
        // desenclavarlo aquí le devolvería un autosave que el servidor ya
        // rechazó.
        conflictRegistryRef.current = closeCadConflictIncident(
          conflictRegistryRef.current,
          request.documentId,
        );
        setSaveIssue(null);
      }
      if (origin === "manual" && requestIsActive) {
        const bytes = serializeCadDocumentForTransport(request.document).bytes;
        toast.success(
          bytes > CAD_DOCUMENT_ARCHIVE_THRESHOLD_BYTES
            ? `Dibujo grande guardado (${(bytes / 1_000_000).toFixed(1)} MB).`
            : "Layout 3D guardado.",
          "3D",
        );
      }
      if (requestIsActive) onSaved?.();
      return saved;
    } catch (saveError) {
      const requestIsActive =
        editorOpenRef.current &&
        currentDocumentIdRef.current === request.documentId;
      if (saveError instanceof CadCasConflictError) {
        // Enclavar ANTES de informar: a partir de aquí el autosave deja de
        // reintentar esta misma versión, que el servidor ya rechazó.
        conflictRegistryRef.current = openCadConflictIncident(
          conflictRegistryRef.current,
          {
            documentId: request.documentId,
            baseVersion: expectedVersion,
            serverVersion: saveError.serverVersion,
          },
        );
        if (requestIsActive) {
          setSaveIssue({
            kind: "conflict",
            message: saveError.message,
            serverVersion: saveError.serverVersion,
          });
          toast.error(saveError.message, "Conflicto CAS");
        }
        return null;
      }
      const message =
        saveError instanceof Error ? saveError.message : "Error de red.";
      const offline =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        saveError instanceof TypeError ||
        /network|fetch|red\b/i.test(message);
      if (requestIsActive) {
        if (offline) setConnectionState("offline");
        setSaveIssue({ kind: offline ? "offline" : "server", message });
        toast.error(message, offline ? "Sin conexión" : "3D");
      }
      return null;
    }
  };
  const runCanonicalSave = async (
    request: CanonicalSaveRequest,
    origin: "manual" | "autosave",
  ): Promise<Layout | null> => {
    const result: { value: Layout | null } = { value: null };
    try {
      await autosaveSchedulerRef.current!.run(async () => {
        result.value = await persistCanonicalSave(request, origin);
        if (!result.value) throw new Error("cad_save_failed");
      });
    } catch {
      // persistCanonicalSave already exposes a recoverable conflict/offline
      // state. Callers use null to abort publication or closing safely.
    }
    return result.value;
  };
  const saveLegacy = async (): Promise<Layout | null> => {
    const currentData = dataRef.current;
    if (!model || !currentData) return null;
    if (drawingReadOnly) {
      notifyReadOnly();
      return null;
    }
    setSaving(true);
    try {
      const positions = [...placementsRef.current.entries()].map(([id, p]) => ({
        id,
        ...p,
      }));
      const cleared = [...loadedPlacedRef.current].filter(
        (id) => !placementsRef.current.has(id),
      );
      // La capa CAD y el grupo viajan por asset (ADR §219/§223): sin esto las
      // asignaciones morían en cada recarga.
      const assets = [...assetsRef.current.values()].map((a) => ({
        ...a,
        ...(layerAssignments[a.id] ? { layer: layerAssignments[a.id] } : {}),
        ...(objectGroups[a.id] ? { group: objectGroups[a.id] } : {}),
        ...(objectTagsRef.current[a.id]
          ? { tags: cadTags(objectTagsRef.current[a.id]) }
          : {}),
      }));
      const annotations = [...annotationsRef.current.values()];
      const cadDocument = commitChange(snapshotDocument(), "save");
      const layoutPayload = {
        model,
        revision,
        footprint: currentData.footprint,
        positions,
        cleared,
        connectors: connectorsRef.current,
        assets,
        annotations,
        cells: cellsRef.current,
        expectedCadDocumentVersion: currentData.cadDocumentVersion ?? 0,
        // persist the DXF backdrop placement so saving from the CAD never drops it (unify fix)
        ...(dxfMetaRef.current ? { dxf: dxfMetaRef.current } : {}),
      };
      const serializedCadDocument =
        serializeCadDocumentForTransport(cadDocument);
      let r: Response;
      if (serializedCadDocument.useArchive) {
        const archive = await gzipCadDocumentJson(serializedCadDocument.json);
        const form = new FormData();
        form.append("layout", JSON.stringify(layoutPayload));
        form.append("file", archive, "cad-document.json.gz");
        r = await legacyCadFetch("layout/cad-archive", {
          method: "PUT",
          body: form,
        });
      } else {
        r = await legacyCadFetch("layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...layoutPayload, cadDocument }),
        });
      }
      setConnectionState("online");
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d?.message || "No se pudo guardar.", "3D");
        return null;
      }
      const saved = (await r.json()) as Layout;
      if (saved.cadDocument) {
        const document = migrateCadDocument(saved.cadDocument);
        loadedCadDocumentRef.current = document;
        syncCadLayerState(document);
        setCadXrefs(
          document.externalReferences.map((reference) => ({ ...reference })),
        );
        setPublicationRecords([...document.publications]);
        setNativeEntities(
          document.entities.filter((entity): entity is CadNativeEntity =>
            CAD_ENTITY_REGISTRY.supports(entity),
          ),
        );
        setNativeDocumentRevision((value) => value + 1);
      }
      dataRef.current = saved;
      setData(saved);
      toast.success(
        serializedCadDocument.useArchive
          ? `Dibujo grande guardado (${(serializedCadDocument.bytes / 1_000_000).toFixed(1)} MB).`
          : "Layout 3D guardado.",
        "3D",
      );
      loadedPlacedRef.current = new Set(placementsRef.current.keys());
      dirtyRef.current = false;
      setDirty(false);
      setRecoveryCandidate(null);
      setRecoveryDivergent(false);
      setRecoverySavedAt(null);
      setRecoveryWarning(null);
      if (recoveryScope && recoveryLaneRef.current)
        void clearCadRecoveryLaneThrough(
          recoveryScope,
          recoveryLaneRef.current,
          editGenerationRef.current,
          recoverySessionStartedAtRef.current,
        ).catch(() => undefined);
      onSaved?.();
      return saved;
    } catch (saveError) {
      if (saveError instanceof CadCasConflictError) {
        toast.error(saveError.message, "Conflicto CAS");
        return null;
      }
      const message =
        saveError instanceof Error ? saveError.message : "Error de red.";
      if (message === "Error de red.") setConnectionState("offline");
      toast.error(message, "3D");
      return null;
    } finally {
      setSaving(false);
    }
  };
  const save = async (): Promise<Layout | null> => {
    if (documentId) {
      if (drawingReadOnly) {
        notifyReadOnly();
        return null;
      }
      const request = captureCanonicalSaveRequest();
      return request ? runCanonicalSave(request, "manual") : null;
    }
    return saveLegacy();
  };

  useEffect(() => {
    captureCanonicalSaveRequestRef.current = captureCanonicalSaveRequest;
    persistCanonicalSaveRef.current = persistCanonicalSave;
  });

  useEffect(() => {
    scheduleAutosaveRef.current = () => {
      if (!open || !documentId || drawingReadOnly || !dirtyRef.current) return;
      const scheduledDocumentId = documentId;
      // Un conflicto CAS enclavado significa que ESTA versión base ya fue
      // rechazada. Reprogramarla es gastar una petición para que la nieguen
      // otra vez; el guardado manual sigue disponible para quien decida actuar.
      const baseVersion =
        versionByDocumentRef.current.get(scheduledDocumentId) ??
        dataRef.current?.cadDocumentVersion ??
        0;
      if (
        cadAutosaveBlockedForDocument(
          conflictRegistryRef.current,
          scheduledDocumentId,
          baseVersion,
        )
      )
        return;
      autosaveSchedulerRef.current!.schedule(async () => {
        const request = captureCanonicalSaveRequestRef.current();
        if (!request || request.documentId !== scheduledDocumentId) return;
        const saved = await persistCanonicalSaveRef.current(
          request,
          "autosave",
        );
        if (!saved) throw new Error("cad_autosave_failed");
      });
    };
  }, [documentId, drawingReadOnly, open]);

  useEffect(() => {
    if (!open || !documentId || drawingReadOnly) return;
    // La política —incluido reanudar cuando VUELVE la red, que es el momento
    // que no depende de que nadie mire— vive en document-lifecycle/connectivity.
    return observeCadSaveFlush({
      isDirty: () => dirtyRef.current,
      scheduleAutosave: () => scheduleAutosaveRef.current(),
      flush: () => autosaveSchedulerRef.current!.flush(),
    });
  }, [documentId, drawingReadOnly, open]);

  const closeEditor = async () => {
    if (documentId && dirtyRef.current && !drawingReadOnly) {
      scheduleAutosaveRef.current();
      await autosaveSchedulerRef.current!.flush().catch(() => undefined);
      if (dirtyRef.current) {
        toast.error(
          "No se pudo confirmar el guardado. El borrador sigue abierto y conserva recovery local.",
          "Cambios pendientes",
        );
        return;
      }
    }
    onClose();
  };

  const publishSheetSetPdf = async () => {
    if (!data || publishingSheetSet) return;
    if (!paperSpaces.some((space) => space.includeInPublish !== false)) {
      toast.error(
        "Crea o incluye al menos una hoja antes de publicar.",
        "Hojas",
      );
      return;
    }
    setPublishingSheetSet(true);
    setPublicationWarnings([]);
    try {
      // Persist the definition first; publication advances the same CAS token.
      const saved = await save();
      const canonical = loadedCadDocumentRef.current;
      if (!saved || !canonical) return;
      const plan = buildCadPublishPlan(canonical, new Date().toISOString());
      setPublicationWarnings(plan.warnings);
      if (!plan.sheets.length) {
        toast.error("El conjunto no contiene hojas publicables.", "Hojas");
        return;
      }
      const { jsPDF } = await import("jspdf");
      const first = plan.sheets[0];
      const pdf = new jsPDF({
        orientation: first.orientation,
        unit: "mm",
        format: [first.width, first.height],
        compress: true,
        putOnlyUsedFonts: true,
      });
      const color = (hex: string): [number, number, number] => {
        const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "334155";
        return [
          Number.parseInt(clean.slice(0, 2), 16),
          Number.parseInt(clean.slice(2, 4), 16),
          Number.parseInt(clean.slice(4, 6), 16),
        ];
      };
      plan.sheets.forEach((sheet, sheetIndex) => {
        if (sheetIndex > 0)
          pdf.addPage([sheet.width, sheet.height], sheet.orientation);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, sheet.width, sheet.height, "F");
        pdf.setDrawColor(17, 24, 39);
        pdf.setLineWidth(0.45);
        pdf.rect(6, 6, sheet.width - 12, sheet.height - 12);
        sheet.viewports.forEach((viewport) => {
          pdf.saveGraphicsState();
          pdf.rect(
            viewport.clip.x,
            viewport.clip.y,
            viewport.clip.width,
            viewport.clip.height,
          );
          pdf.clip();
          pdf.discardPath();
          viewport.commands.forEach((command) => {
            if (command.kind === "path") {
              if (command.points.length < 2) return;
              const [strokeR, strokeG, strokeB] = color(command.style.stroke);
              pdf.setDrawColor(strokeR, strokeG, strokeB);
              pdf.setLineWidth(command.style.lineWidth);
              pdf.setLineDashPattern(command.style.dash ?? [], 0);
              if (command.style.fill) {
                const [fillR, fillG, fillB] = color(command.style.fill);
                pdf.setFillColor(fillR, fillG, fillB);
              }
              const [origin, ...rest] = command.points;
              const deltas = rest.map((point, index) => [
                point.x - command.points[index].x,
                point.y - command.points[index].y,
              ]);
              const style: "S" | "FD" = command.style.fill ? "FD" : "S";
              pdf.lines(
                deltas,
                origin.x,
                origin.y,
                [1, 1],
                style,
                command.closed,
              );
            } else {
              const [r, g, b] = color(command.color);
              const maxWidth = Math.max(
                1,
                Math.min(
                  command.maxWidth ?? viewport.clip.width,
                  viewport.clip.width,
                ),
              );
              const lines = command.text.replace(/\r\n?/g, "\n").split("\n");
              const lineHeight = command.size * 0.4;
              const alignOffset =
                command.align === "center"
                  ? maxWidth / 2
                  : command.align === "right"
                    ? maxWidth
                    : 0;
              if (command.backgroundMask) {
                const [mr, mg, mb] = color(
                  command.backgroundColor ?? "#ffffff",
                );
                pdf.setFillColor(mr, mg, mb);
                pdf.rect(
                  command.point.x - alignOffset - 0.8,
                  command.point.y - command.size * 0.32,
                  maxWidth + 1.6,
                  Math.max(lineHeight, lines.length * lineHeight) + 1.2,
                  "F",
                );
              }
              pdf.setTextColor(r, g, b);
              pdf.setFont(
                "helvetica",
                command.bold && command.italic
                  ? "bolditalic"
                  : command.bold
                    ? "bold"
                    : command.italic
                      ? "italic"
                      : "normal",
              );
              pdf.setFontSize(command.size);
              pdf.text(command.text, command.point.x, command.point.y, {
                align: command.align ?? "left",
                angle: command.rotation,
                maxWidth,
              });
              if (command.underline && Math.abs(command.rotation) < 1e-9) {
                pdf.setDrawColor(r, g, b);
                pdf.setLineWidth(Math.max(0.08, command.size * 0.015));
                lines.forEach((line, index) => {
                  const width = Math.min(maxWidth, pdf.getTextWidth(line));
                  const x =
                    command.point.x -
                    (command.align === "center"
                      ? width / 2
                      : command.align === "right"
                        ? width
                        : 0);
                  const y = command.point.y + index * lineHeight + 0.5;
                  pdf.line(x, y, x + width, y);
                });
              }
            }
          });
          pdf.restoreGraphicsState();
          pdf.setLineDashPattern([], 0);
          pdf.setDrawColor(100, 116, 139);
          pdf.setLineWidth(0.15);
          pdf.rect(
            viewport.clip.x,
            viewport.clip.y,
            viewport.clip.width,
            viewport.clip.height,
          );
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6);
          pdf.setTextColor(71, 85, 105);
          pdf.text(
            `${viewport.name} · 1:${viewport.scale}${viewport.locked ? " · LOCK" : ""}`,
            viewport.clip.x + 1.5,
            viewport.clip.y + 4,
          );
        });
        const titleBlockEntries = [
          ["PROJECT", sheet.titleBlock.PROJECT ?? `Layout ${model}`],
          ["TITLE", sheet.titleBlock.TITLE ?? sheet.name],
          ["DRAWING_NO", sheet.titleBlock.DRAWING_NO ?? "-"],
          ["SHEET_NO", sheet.titleBlock.SHEET_NO ?? String(sheetIndex + 1)],
          ["REVISION", sheet.titleBlock.REVISION ?? revision],
          ["DISCIPLINE", sheet.titleBlock.DISCIPLINE ?? "-"],
          ["PREPARED_BY", sheet.titleBlock.PREPARED_BY ?? "-"],
          ["CHECKED_BY", sheet.titleBlock.CHECKED_BY ?? "-"],
        ] as const;
        const blockX = 8,
          blockY = sheet.height - 34,
          blockW = sheet.width - 16,
          cellW = blockW / 4,
          cellH = 13;
        pdf.setDrawColor(17, 24, 39);
        titleBlockEntries.forEach(([label, value], index) => {
          const x = blockX + (index % 4) * cellW,
            y = blockY + Math.floor(index / 4) * cellH;
          pdf.rect(x, y, cellW, cellH);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(5.5);
          pdf.setTextColor(100, 116, 139);
          pdf.text(label, x + 2, y + 4);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(17, 24, 39);
          pdf.text(String(value).slice(0, 42), x + 2, y + 9.5, {
            maxWidth: cellW - 4,
          });
        });
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.text(
          `${branding.productLabel} · ${sheetIndex + 1}/${plan.sheets.length}`,
          sheet.width - 8,
          5,
          { align: "right" },
        );
      });
      const buffer = pdf.output("arraybuffer");
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const fileName = `${model}-${revision}-sheet-set.pdf`.replace(
        /[^\w.\-]+/g,
        "_",
      );
      const receiptResponse = await legacyCadFetch("layout/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          revision,
          expectedCadDocumentVersion: saved.cadDocumentVersion ?? 0,
          paperSpaceIds: plan.sheets.map((sheet) => sheet.id),
          fileName,
          sha256,
          bytes: buffer.byteLength,
        }),
      });
      if (!receiptResponse.ok) {
        const failure = await receiptResponse.json().catch(() => ({}));
        toast.error(
          failure?.message ||
            "No se pudo auditar la publicación; el PDF no se descargó.",
          "Hojas",
        );
        return;
      }
      const receipt = (await receiptResponse.json()) as {
        publication: CadPublicationRecord;
        cadDocumentVersion: number;
      };
      const nextCanonical = commitChange(
        { ...canonical, publications: [...canonical.publications, receipt.publication] },
        `Publicar ${fileName}`,
      );
      loadedCadDocumentRef.current = nextCanonical;
      setPublicationRecords([...nextCanonical.publications]);
      setData((current) =>
        current
          ? {
              ...current,
              cadDocumentVersion: receipt.cadDocumentVersion,
              cadDocument: nextCanonical as unknown as Record<string, unknown>,
            }
          : current,
      );
      const blob = new Blob([buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(
        `${plan.sheets.length} hojas vectoriales publicadas · SHA-256 ${sha256.slice(0, 12)}…`,
        "Hojas",
      );
    } catch (error) {
      console.error(error);
      toast.error("No se pudo publicar el conjunto de hojas.", "Hojas");
    } finally {
      setPublishingSheetSet(false);
    }
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      )
        return;
      const cadShortcut = matchCadShortcut(e, workspaceShortcutsRef.current);
      if (
        drawingReadOnlyRef.current &&
        isReadOnlyMutationKey(e, cadShortcut?.id)
      ) {
        e.preventDefault();
        notifyReadOnly();
        return;
      }
      /**
       * Ctrl+1 abre la paleta de PROPIEDADES, como en AutoCAD.
       *
       * No pasa por `matchCadShortcut` porque su registro vive en `lib/cad`,
       * que esta sesión no toca. Cuando ese registro admita la combinación,
       * este bloque se sustituye por un `cadShortcut?.id === "properties"` y no
       * cambia nada más.
       *
       * Abrirla es revelar el panel derecho: cerrar el panel profesional que lo
       * esté ocupando, salir del modo enfoque y encender la preferencia. Si sólo
       * se encendiera la preferencia, pulsar Ctrl+1 con el panel de bloques
       * abierto no enseñaría propiedad ninguna y parecería que el atajo no hace
       * nada.
       */
      if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        e.preventDefault();
        revealPropertiesPalette();
        return;
      }
      // Ctrl+8 → gestor de estilos; Ctrl+9 → DSETTINGS. Misma familia.
      if ((e.ctrlKey || e.metaKey) && e.key === "8") {
        e.preventDefault();
        paletteHost.toggleStyles();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "9") {
        e.preventDefault();
        paletteHost.toggleDraftSettings();
        return;
      }
      if (cadShortcut?.id === "palette") {
        e.preventDefault();
        setShowPalette(true);
        return;
      }
      // in walkthrough mode WASD/look take over; only Esc (exit) reaches here
      if (walkRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          toggleWalk();
        }
        return;
      }
      if (
        cadShortcut &&
        TOOLBAR_SHORTCUT_IDS.has(cadShortcut.id as CadToolbarActionId)
      ) {
        e.preventDefault();
        runToolbarAction(cadShortcut.id as CadToolbarActionId);
        return;
      }
      if (cadShortcut?.id === "save") {
        e.preventDefault();
        void save();
        return;
      }
      if (cadShortcut?.id === "grid_toggle") {
        e.preventDefault();
        setLayers((cur) => ({ ...cur, grid: !cur.grid }));
        return;
      }
      if (cadShortcut?.id === "object_snap_toggle") {
        e.preventDefault();
        draftSettingsHost.toggleOsnap();
        return;
      }
      if (cadShortcut?.id === "ortho_toggle") {
        e.preventDefault();
        draftSettingsHost.toggleOrtho();
        return;
      }
      if (cadShortcut?.id === "polar_tracking_toggle") {
        e.preventDefault();
        draftSettingsHost.togglePolar();
        return;
      }
      if (cadShortcut?.id === "object_tracking_toggle") {
        e.preventDefault();
        draftSettingsHost.toggleObjectSnapTracking();
        return;
      }
      if (cadShortcut?.id === "validate_layout") {
        e.preventDefault();
        openChecks();
        return;
      }
      if (cadShortcut?.id === "export_dxf") {
        e.preventDefault();
        openDxfExport();
        return;
      }
      // El motor manda mientras tenga un comando abierto: Esc cancela, Enter
      // acepta y Tab salta entre distancia y ángulo. Va ANTES de la cascada de
      // Esc del editor, que si no cancelaría la herramienta heredada y dejaría
      // el comando del motor abierto sin dueño.
      if (enginePointerRouterRef.current?.keyDown(e)) return;
      if (nativeGripControllerRef.current?.keyDown(e)) return;
      const g = data?.footprint.gridSize || 100;
      const step = e.shiftKey ? g * 5 : g;
      const hasNativeSelection = nativeSelectionIdsRef.current.length > 0;
      const hasSel = selRef.current.length > 0 || hasNativeSelection;
      if (e.key === "Escape") {
        e.preventDefault();
        if (hatchPickModeRef.current) {
          hatchPickModeRef.current = false;
          setHatchPickMode(false);
        } else if (paletteOpenRef.current) {
          setShowPalette(false);
          setPaletteQuery("");
        } else if (commandPreviewRef.current) {
          setCommandPreview(null);
        } else if (commandTextRef.current.trim()) {
          setCommandText("");
          setCommandHistoryCursor(-1);
        } else if (drawCommandRef.current) {
          const cancelled = cancelDrawCommand(drawCommandRef.current);
          drawCommandRef.current = null;
          setDrawPrompt(null);
          setMeasureLive(null);
          setCanCloseDraftPolyline(false);
          setPrecisionText("");
          if (!cancelled.emitted.length)
            toast.success("Comando de dibujo cancelado.", "CAD");
          setTool("select");
          toolRef.current = "select";
        } else if (toolRef.current !== "select") {
          endDraw();
          setTool("select");
          toolRef.current = "select";
        } else if (hasSel) {
          select([]);
          clearNativeSelection();
          rebuildAll();
        }
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAll();
      } else if (
        (e.key === "z" || e.key === "Z") &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undo();
      } else if (
        ((e.key === "z" || e.key === "Z") &&
          (e.ctrlKey || e.metaKey) &&
          e.shiftKey) ||
        ((e.key === "y" || e.key === "Y") && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Enter" && drawCommandRef.current) {
        e.preventDefault();
        commitActiveDraftCommand();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMeasure();
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        toggleWall();
      } else if (e.key === "f" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        fitView(hasSel ? "selection" : "all");
      } else if (
        (e.key === "F" || (e.key === "f" && e.shiftKey)) &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        fitView("plant");
      } else if (e.key === "\\") {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if ((e.key === "Delete" || e.key === "Backspace") && hasSel) {
        e.preventDefault();
        if (hasNativeSelection) removeNativeSelection();
        else removeSelected();
      } else if ((e.key === "r" || e.key === "R") && hasSel) {
        e.preventDefault();
        if (hasNativeSelection)
          transformNativeSelection({ rotationDeg: e.shiftKey ? -15 : 15 });
        else rotateSelected(e.shiftKey ? -15 : 15);
      } else if (
        (e.key === "d" || e.key === "D") &&
        (e.ctrlKey || e.metaKey) &&
        hasSel
      ) {
        e.preventDefault();
        if (hasNativeSelection) copyNativeSelection();
        else duplicateSelected();
      } else if (
        (e.key === "c" || e.key === "C") &&
        (e.ctrlKey || e.metaKey) &&
        hasSel &&
        !window.getSelection()?.toString()
      ) {
        e.preventDefault();
        if (hasNativeSelection) copyNativeSelection();
        else copySelection();
      } else if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        pasteClipboard();
      } else if (
        (e.key === "g" || e.key === "G") &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        hasSel
      ) {
        e.preventDefault();
        ungroupSelection();
      } else if (
        (e.key === "g" || e.key === "G") &&
        (e.ctrlKey || e.metaKey) &&
        hasSel
      ) {
        e.preventDefault();
        groupSelection();
      } else if (e.key === "ArrowLeft" && hasSel) {
        e.preventDefault();
        if (hasNativeSelection)
          transformNativeSelection({ translation: { x: -step, y: 0 } });
        else nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight" && hasSel) {
        e.preventDefault();
        if (hasNativeSelection)
          transformNativeSelection({ translation: { x: step, y: 0 } });
        else nudgeSelected(step, 0);
      } else if (e.key === "ArrowUp" && hasSel) {
        e.preventDefault();
        if (hasNativeSelection)
          transformNativeSelection({ translation: { x: 0, y: -step } });
        else nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown" && hasSel) {
        e.preventDefault();
        if (hasNativeSelection)
          transformNativeSelection({ translation: { x: 0, y: step } });
        else nudgeSelected(0, step);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  if (!open || typeof document === "undefined") return null;

  const allNativeEntities = nativeEntities;
  const nativeById = new Map(
    allNativeEntities.map((entity) => [entity.id, entity]),
  );
  const nativeSelectedEntities = nativeSelectionIds
    .map((id) => nativeById.get(id))
    .filter((entity): entity is CadNativeEntity => !!entity);
  /**
   * TRIM/EXTEND admite como OBJETIVO una línea o un arco, y como FRONTERA una
   * línea, un círculo o un arco. Empezó exigiendo dos `line`, así que con una
   * línea y un arco el panel ni siquiera aparecía — pese a que la matemática de
   * intersección ya existía.
   *
   * El CÍRCULO y la POLILÍNEA no pueden ser objetivo: el círculo no tiene
   * extremos que recortar —cortarlo lo convertiría en un arco, que es cambiar el
   * tipo de la entidad— y recortar una polilínea exige decidir qué tramo se
   * corta y qué pasa con los vértices intermedios, que es otra operación.
   */
  const selectedNativeLineIds =
    nativeSelectedEntities.length === 2 &&
    nativeSelectedEntities.some(
      (entity) => entity.type === "line" || entity.type === "arc",
    ) &&
    nativeSelectedEntities.every(
      (entity) =>
        entity.type === "line" ||
        entity.type === "circle" ||
        entity.type === "arc" ||
        entity.type === "polyline",
    )
      ? (nativeSelectedEntities.map((entity) => entity.id) as [string, string])
      : null;
  /**
   * FILLET y CHAMFER exigen DOS LÍNEAS, y por eso no comparten compuerta con
   * TRIM/EXTEND. Al abrir TRIM a círculos, arcos y polilíneas, la compuerta
   * común empezó a mostrar el panel «FILLET · 2 LINE» con una línea y un
   * círculo seleccionados: la orden se ofrecía y al pulsarla sólo salía un
   * error. Las dos órdenes redondean o cortan la esquina de dos rectas —una
   * curva no tiene esa esquina— así que la compuerta se estrecha aquí en vez de
   * fingir que están disponibles.
   */
  const selectedNativeCornerLineIds =
    nativeSelectedEntities.length === 2 &&
    nativeSelectedEntities.every((entity) => entity.type === "line")
      ? (nativeSelectedEntities.map((entity) => entity.id) as [string, string])
      : null;
  const primaryNativeEntity =
    nativeSelectedEntities.length === 1 ? nativeSelectedEntities[0] : null;
  const primaryNativeAdapter = primaryNativeEntity
    ? CAD_ENTITY_REGISTRY.adapter(primaryNativeEntity)
    : null;
  // Las propiedades y los grips del objeto designado los lee ahora la paleta,
  // que además memoiza esa lectura. Aquí sólo quedan los bounds, que usa el
  // botón de giro para tomar el centro como origen.
  const primaryNativeBounds =
    primaryNativeEntity && primaryNativeAdapter
      ? primaryNativeAdapter.bounds.bounds(
          primaryNativeEntity,
          loadedCadDocumentRef.current ?? undefined,
        )
      : null;
  const professionalBlockDefinitions = [
    ...(loadedCadDocumentRef.current?.blocks ?? []),
  ].filter((block) => !block.id.startsWith("xref:"));
  for (const row of cadBlocks) {
    if (
      row.definition &&
      !professionalBlockDefinitions.some(
        (block) => block.id === row.definition!.id,
      )
    )
      professionalBlockDefinitions.push({
        ...row.definition,
        version: row.version ?? row.definition.version ?? 1,
        library: {
          ...row.definition.library,
          scope: "tenant",
          sourceId: row.id,
        },
      });
  }
  const editingMTextEntity = editingMTextId
    ? nativeById.get(editingMTextId)
    : null;
  const editingMText =
    editingMTextEntity?.type === "mtext" ? editingMTextEntity : null;
  const mtextContext = ctxRef.current;
  const mtextControl = controlsRef.current;
  const mtextDefaultInsertion = mtextContext
    ? {
        x: Math.max(
          0,
          Math.min(
            mtextContext.W,
            snapWorld(
              mtextControl
                ? mtextControl.target.x / mtextContext.s + mtextContext.W / 2
                : mtextContext.W / 2,
            ),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            mtextContext.H,
            snapWorld(
              mtextControl
                ? mtextControl.target.z / mtextContext.s + mtextContext.H / 2
                : mtextContext.H / 2,
            ),
          ),
        ),
      }
    : { x: 0, y: 0 };
  const professionalSelectionUniverse = showSelectionPalette
    ? buildSelectionUniverse()
    : [];
  const professionalSelectionTypes = [
    ...new Set(professionalSelectionUniverse.map((item) => item.type)),
  ].sort();
  const professionalSelectionLayers = [
    ...new Set(
      professionalSelectionUniverse
        .map((item) => item.layer)
        .filter((layer): layer is string => !!layer),
    ),
  ].sort();
  const activeProfessionalDock = showSelectionPalette
    ? "selection"
    : showHatchPalette
      ? "hatch"
      : showDimensionPalette
        ? "dimension"
        : showMleaderPalette
          ? "mleader"
          : showBlockPalette
            ? "blocks"
            : showCollaborationDock
              ? "collaboration"
              : showWorkspaceDock
                ? "workspace"
                : null;
  const closeProfessionalDocks = () => {
    setShowSelectionPalette(false);
    setShowHatchPalette(false);
    setShowDimensionPalette(false);
    setShowMleaderPalette(false);
    setShowBlockPalette(false);
    setShowCollaborationDock(false);
    setShowWorkspaceDock(false);
  };
  const toggleProfessionalDock = (
    dock: NonNullable<typeof activeProfessionalDock>,
  ) => {
    const wasOpen = activeProfessionalDock === dock;
    closeProfessionalDocks();
    if (wasOpen) return;
    setFocusMode(false);
    if (!workspacePreferencesRef.current.rightDock) {
      updateWorkspacePreferences({
        ...workspacePreferencesRef.current,
        rightDock: true,
      });
    }
    if (dock === "selection") {
      setToolMode("select");
      setShowSelectionPalette(true);
    } else if (dock === "hatch") setShowHatchPalette(true);
    else if (dock === "dimension") setShowDimensionPalette(true);
    else if (dock === "mleader") setShowMleaderPalette(true);
    else if (dock === "blocks") setShowBlockPalette(true);
    else if (dock === "collaboration") setShowCollaborationDock(true);
    else setShowWorkspaceDock(true);
  };
  const handleCadContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Con un comando del motor abierto, el botón derecho ya ha ofrecido las
    // palabras clave DEL PASO junto al cursor. Abrir además el menú general
    // del editor lo tapaba y dejaba el gesto sin efecto: dos menús para el
    // mismo clic es la misma clase de duplicidad que la de las dos máquinas.
    if (enginePointerRouterRef.current?.active) return;
    const action = workspacePreferencesRef.current.rightClickAction;
    if (action === "repeat") {
      repeatLastCommand();
      return;
    }
    if (action === "enter") {
      // `commitActiveDraftCommand` ya sabe si manda el motor o la máquina
      // heredada; preguntar por `drawCommandRef` dejaba a Enter sin efecto
      // sobre los comandos del motor, que son todos los del ratón.
      if (!commitActiveDraftCommand()) repeatLastCommand();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setCadContextMenu({
      x: Math.max(8, Math.min(rect.width - 180, event.clientX - rect.left)),
      y: Math.max(8, Math.min(rect.height - 176, event.clientY - rect.top)),
    });
  };
  /**
   * La entrada dinámica y el aviso del viewport, ahora alimentados por el
   * MOTOR cuando es él quien lleva el comando.
   *
   * `commandEngineSnapshot` cambia una vez por PASO, no por movimiento del
   * ratón —`refreshPreview` no despacha—, así que esto no mete un render por
   * muestra del puntero. El ancla se lee de la ref en ese mismo render: es el
   * punto que el enrutador acaba de confirmar.
   */
  const engineCommand = commandEngineSnapshot.activeCommand;
  const engineAnchor = engineCommand
    ? (enginePointerRouterRef.current?.anchor ?? null)
    : null;
  const enginePromptText = commandEngineSnapshot.prompt
    ? formatCadPrompt(commandEngineSnapshot.prompt)
    : null;
  const engineCanClose = !!commandEngineSnapshot.prompt?.options.some((option) =>
    /^close$/i.test(option.keyword) || /^cerrar$/i.test(option.keyword),
  );
  const activeDynamicCommand = drawCommandRef.current;
  const dynamicInputKind: "point" | "radius" | "offset" = engineCommand
    ? engineCommand === "OFFSET"
      ? "offset"
      : engineCommand === "CIRCLE" && engineAnchor
        ? "radius"
        : "point"
    : activeDynamicCommand?.id === "offset"
      ? "offset"
      : activeDynamicCommand?.id === "circle" &&
          activeDynamicCommand.awaitingRadius
        ? "radius"
        : "point";
  const dynamicAnchor =
    engineAnchor ??
    activeDynamicCommand?.points.at(-1) ??
    (wallChainRef.current
      ? { x: wallChainRef.current.wx, y: wallChainRef.current.wy }
      : null);
  const dynamicGridDefault = data?.footprint.gridSize || 1;
  const dynamicInputDefaults = {
    ...defaultCadDynamicValues(
      dynamicAnchor,
      dynamicAnchor
        ? { x: dynamicAnchor.x + dynamicGridDefault, y: dynamicAnchor.y }
        : { x: 0, y: 0 },
    ),
    angle: lastWallAngleRef.current ?? draftSettings.polarIncrement,
    radius: dynamicGridDefault,
    diameter: dynamicGridDefault * 2,
    offset: dynamicGridDefault,
  };
  const paletteResults = searchCadPalette(paletteQuery).slice(0, 9);
  const commandAssistLabels = selList.map((item) => {
    if (item.type === "station")
      return (
        data?.stations.find((station) => station.id === item.id)?.station ??
        item.id
      );
    if (selSnap?.type === "asset" && selSnap.id === item.id)
      return selSnap.title;
    return item.id;
  });
  const commandAssistSuggestions = showCommand
    ? suggestCadCommands({
        query: commandText,
        selectedCount: selList.length,
        selectedObjectLabels: commandAssistLabels,
        maxItems: commandText.trim() ? 4 : 3,
      })
    : [];
  const tray = (data?.stations ?? []).filter((s) => !placedIds.has(s.id));
  const cadTitle =
    title?.trim() ||
    (standalone ? branding.productLabel : `CAD · ${model} · ${revision}`);
  const cadSubtitle =
    subtitle?.trim() ||
    (standalone
      ? "Diseño universal 2D/3D para arquitectura, ingeniería, almacenes, plantas y layouts técnicos."
      : "Workbench CAD conectado al gemelo industrial y al balanceo de línea.");
  const placedCount = placedIds.size;
  const assetCount = assetIds.size;
  const mleaderSelectedCount = new Set([
    ...nativeSelectionIds,
    ...selList.map((item) => item.id),
  ]).size;
  const dxfWarningSummary = summarizeDxfImportWarnings(dxfWarnings).slice(0, 6);
  const dxfPrimitiveSummary = dxfImportPreview
    ? dxfImportPreview.primitives.reduce<Record<string, number>>(
        (acc, primitive) => {
          acc[primitive.kind] = (acc[primitive.kind] ?? 0) + 1;
          return acc;
        },
        {
          ...(dxfImportPreview.hatches.length
            ? { hatch: dxfImportPreview.hatches.length }
            : {}),
          ...(dxfImportPreview.mtexts.length
            ? { mtext: dxfImportPreview.mtexts.length }
            : {}),
          ...(dxfImportPreview.semanticDimensions.length
            ? { dimension: dxfImportPreview.semanticDimensions.length }
            : {}),
          ...(dxfImportPreview.mleaders.length
            ? { mleader: dxfImportPreview.mleaders.length }
            : {}),
        },
      )
    : null;
  const orderedPaperSpaces = [...paperSpaces].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
  );
  const activePaperSpace =
    orderedPaperSpaces.find((space) => space.id === activePaperSpaceId) ??
    orderedPaperSpaces[0] ??
    null;
  const activeLayoutLayers = paperSpaceLayers.length
    ? paperSpaceLayers
    : cadLayers.map((layer) => ({
        id: layer.id,
        name: layer.label,
        color: layer.color,
        visible: layer.visible,
        locked: layer.locked,
      }));
  const activeLayoutPreflight = activePaperSpace
    ? preflightCadPaperSpace(
        activePaperSpace,
        activeLayoutLayers.map((layer) => layer.id),
      )
    : [];
  const cadXrefGraph = analyzeCadXrefGraph(
    { externalReferences: cadXrefs },
    `${model}@${revision}`,
  );
  const sheetPackageChecks = [
    {
      label: "Title block",
      ok:
        !!sheetPackageDraft.project.trim() &&
        !!sheetPackageDraft.drawingNo.trim() &&
        !!sheetPackageDraft.sheet.trim() &&
        !!sheetPackageDraft.revision.trim(),
      detail: `${sheetPackageDraft.drawingNo || "sin plano"} · ${sheetPackageDraft.sheet || "sin hoja"} · rev ${sheetPackageDraft.revision || "—"}`,
    },
    {
      label: "Conjunto de hojas",
      ok: paperSpaces.some(
        (space) =>
          space.includeInPublish !== false &&
          (space.viewports?.length ?? 0) > 0,
      ),
      detail: `${paperSpaces.filter((space) => space.includeInPublish !== false).length} publicables · ${paperSpaces.reduce((total, space) => total + (space.viewports?.length ?? 0), 0)} viewports`,
    },
    {
      label: "Capas visibles",
      ok: cadLayers.some((layer) => layer.visible),
      detail: `${cadLayers.filter((layer) => layer.visible).length}/${cadLayers.length} visibles`,
    },
    {
      label: "Geometría editable",
      ok: placedCount + assetCount > 0,
      detail: `${placedCount} puntos · ${assetCount} objetos`,
    },
    {
      label: "Cotas / anotaciones",
      ok: annotationsRef.current.size > 0,
      detail: `${annotationsRef.current.size} anotaciones`,
    },
    {
      label: "Validación CAD",
      ok: cadValidationReport
        ? cadValidationReport.severity !== "critical"
        : false,
      detail: cadValidationReport
        ? `${cadValidationReport.severity} · ${cadValidationReport.issues.length} issues`
        : "pendiente de ejecutar",
    },
    {
      label: "Aprobación",
      ok: approval?.status === "approved",
      detail: approval ? APPROVAL_META[approval.status].label : "sin estado",
    },
    {
      label: "DXF / entrega",
      ok: dxfExportSummary.canExport || placedCount + assetCount > 0,
      detail: dxfExportSummary.canExport
        ? `${dxfExportSummary.objects} entidades listas`
        : "exportable bajo demanda",
    },
  ];
  const sheetPackageReadyCount = sheetPackageChecks.filter(
    (check) => check.ok,
  ).length;
  const sheetPackageReadyPct = Math.round(
    (sheetPackageReadyCount / sheetPackageChecks.length) * 100,
  );
  const sheetPackageManifest = {
    project: sheetPackageDraft.project,
    drawingNo: sheetPackageDraft.drawingNo,
    discipline: sheetPackageDraft.discipline,
    model,
    revision,
    sheet: sheetPackageDraft.sheet,
    sheetRevision: sheetPackageDraft.revision,
    scale: sheetPackageDraft.scale,
    preparedBy: sheetPackageDraft.preparedBy,
    checkedBy: sheetPackageDraft.checkedBy,
    approvedBy: sheetPackageDraft.approvedBy,
    packageReadyPct: sheetPackageReadyPct,
    generatedAt: new Date().toISOString(),
    footprint: data?.footprint ?? null,
    counts: {
      stations: placedCount,
      assets: assetCount,
      annotations: annotationsRef.current.size,
      connectors: connectorsRef.current.length,
      cadLayers: cadLayers.length,
    },
    validation: cadValidationReport
      ? {
          severity: cadValidationReport.severity,
          issues: cadValidationReport.issues.length,
          collisions: cadValidationReport.collisions.length,
          clearances: cadValidationReport.clearances.length,
          safety: cadValidationReport.safety.length,
          architecture: cadValidationReport.architecture.length,
          document: cadValidationReport.document.length,
        }
      : null,
    dxf: {
      canExport: dxfExportSummary.canExport,
      objects: dxfExportSummary.objects,
      layers: dxfExportSummary.layers,
      issues: dxfExportSummary.issues.length,
    },
    lossManifest: {
      count: loadedCadDocumentRef.current?.lossManifest.length ?? 0,
      entries: loadedCadDocumentRef.current?.lossManifest ?? [],
    },
    sheets: orderedPaperSpaces.map((space, index) => ({
      id: space.id,
      order: index,
      name: space.name,
      includeInPublish: space.includeInPublish !== false,
      paper: space.pageSetup?.paper ?? "custom",
      orientation: space.page.orientation,
      viewports: (space.viewports ?? []).map((viewport) => ({
        id: viewport.id,
        scale: viewport.scale,
        locked: viewport.locked,
      })),
    })),
    publications: publicationRecords.map((publication) => ({
      id: publication.id,
      fileName: publication.fileName,
      sha256: publication.sha256,
      publishedAt: publication.publishedAt,
      publishedBy: publication.publishedBy,
    })),
    notes: sheetPackageDraft.notes,
  };
  const symbolCategories: Array<CadSymbolCategory | "all"> = [
    "all",
    "equipment",
    "flow",
    "safety",
    "storage",
    "operator",
  ];
  const filteredSymbols = CAD_SYMBOL_LIBRARY.filter((symbol) => {
    const q = symbolSearch.trim().toLowerCase();
    const matchesCategory =
      symbolCategory === "all" || symbol.category === symbolCategory;
    const matchesSearch =
      !q ||
      [symbol.label, symbol.id, symbol.layer, symbol.category, ...symbol.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    return matchesCategory && matchesSearch;
  });
  const cadLayerCounts = cadLayers.reduce<Record<CadLayerId, number>>(
    (acc, layer) => ({ ...acc, [layer.id]: 0 }),
    {} as Record<CadLayerId, number>,
  );
  const incrementCadLayerCount = (id: CadLayerId) => {
    cadLayerCounts[id] = (cadLayerCounts[id] ?? 0) + 1;
  };
  placedIds.forEach((id) =>
    incrementCadLayerCount(layerAssignments[id] ?? "layout"),
  );
  assetIds.forEach((id) =>
    incrementCadLayerCount(layerAssignments[id] ?? "equipment"),
  );
  nativeEntities.forEach((entity) => incrementCadLayerCount(entity.layer));
  const cadLayerSummary = summarizeCadLayers(cadLayers, cadLayerCounts);
  /**
   * Filas del gestor de capas.
   *
   * `cadLayers` es la PROYECCIÓN del editor (id, nombre, color, visible,
   * bloqueada) y `paperSpaceLayers` son las `CadLayerDef` completas del
   * documento, que además traen tipo de línea, grosor y plot. Se juntan aquí
   * porque un documento sin capas propias todavía enseña las de fábrica, y en
   * ese caso sólo existe la proyección.
   *
   * `frozenInViewport` es `null` —no `false`— cuando no hay viewport activo:
   * en espacio modelo no hay ventana que congelar, y la columna se apaga en
   * vez de ofrecer un interruptor que no iría a ninguna parte.
   */
  const activeCadViewport =
    activePaperSpace?.viewports?.find(
      (viewport) => viewport.id === activePaperViewportId,
    ) ?? null;
  const activeCadViewportName = activeCadViewport
    ? (activeCadViewport.name ?? activeCadViewport.id)
    : null;
  const cadLayerManagerRows: CadLayerManagerRow[] = cadLayers.map((layer) => {
    const definition = paperSpaceLayers.find((entry) => entry.id === layer.id);
    return {
      id: layer.id,
      name: layer.label,
      color: layer.color,
      visible: layer.visible,
      locked: layer.locked,
      linetype: definition?.linetype ?? "CONTINUOUS",
      lineweight: definition?.lineweight ?? -1,
      plot: definition?.plot !== false,
      objectCount: cadLayerCounts[layer.id] ?? 0,
      frozenInViewport: activeCadViewport
        ? activeCadViewport.layerVisibility?.[layer.id] === false
        : null,
      active: activeCadLayer === layer.id,
    };
  });
  cadLayerRowsRef.current = cadLayerManagerRows;
  const visibleCadLayerRows = filterCadLayerRows(
    cadLayerManagerRows,
    layerManager.filter,
  );
  // Plant-scale safety: flag objects that sit outside the saved factory footprint (EPIC 0).
  const plantBoundsW = data?.footprint.footprintW ?? 0;
  const plantBoundsH = data?.footprint.footprintH ?? 0;
  const outOfPlantBounds =
    plantBoundsW > 0 && plantBoundsH > 0
      ? (() => {
          const outside = (o?: {
            x: number;
            y: number;
            w: number;
            h: number;
          }) =>
            !!o &&
            (o.x < 0 ||
              o.y < 0 ||
              o.x + o.w > plantBoundsW ||
              o.y + o.h > plantBoundsH);
          let n = 0;
          placedIds.forEach((id) => {
            if (outside(placementsRef.current.get(id))) n += 1;
          });
          assetIds.forEach((id) => {
            if (outside(assetsRef.current.get(id))) n += 1;
          });
          return n;
        })()
      : 0;
  const selectedObjectProperties: CadObjectProperties | null =
    selSnap && selList[0]
      ? (() => {
          const layerId = selectionLayer(selList[0]);
          const layer = cadLayers.find((candidate) => candidate.id === layerId);
          return describeCadObjectProperties({
            id: selSnap.id,
            type: selSnap.type,
            label: selSnap.title,
            kind: selSnap.kind,
            x: selSnap.x,
            y: selSnap.y,
            width: selSnap.w,
            height: selSnap.h,
            rotation: selSnap.rotation,
            layerId,
            layerLabel: layer?.label ?? layerId,
            layerVisible: layer?.visible ?? true,
            layerLocked: layer?.locked ?? false,
            tags: objectTags[selSnap.id],
            notes: objectNotes[selSnap.id],
          });
        })()
      : null;
  // Bloque Industry Pack VIVO (CAD-NEXT-096): métricas y primera norma del
  // pack re-calculadas con el tamaño actual del asset seleccionado.
  const selectedIndustryInfo =
    selSnap && selSnap.type === "asset"
      ? (() => {
          const tags = (objectTags[selSnap.id] ?? "")
            .split(/[,\n]/)
            .map((t) => t.trim());
          const objectId = tags.find((t) => INDUSTRY_REGISTRY.getObject(t));
          if (!objectId) return null;
          const def = INDUSTRY_REGISTRY.getObject(objectId)!;
          return {
            label: def.label,
            metrics: INDUSTRY_REGISTRY.calculatePlaced(
              objectId,
              selSnap.w,
              selSnap.h,
            ),
            findings: INDUSTRY_REGISTRY.validatePlaced(
              objectId,
              selSnap.w,
              selSnap.h,
            ),
          };
        })()
      : null;
  const validationFlow = cadValidationReport?.flow ?? flowHealth;
  const safetyBlockers = safetyIssues.filter(
    (issue) => issue.code === "zone_invasion",
  ).length;
  const safetyWarnings = safetyIssues.length - safetyBlockers;
  const architectureIssues =
    cadValidationReport?.issues.filter(
      (issue) => issue.category === "architecture",
    ) ?? [];
  const architectureBlockers = architectureIssues.filter(
    (issue) => issue.severity === "critical",
  ).length;
  const architectureWarnings = architectureIssues.length - architectureBlockers;
  const releaseBlockers =
    (report?.errors ?? 0) +
    collisionHits.length +
    safetyBlockers +
    architectureBlockers;
  const releaseWarnings =
    (report?.warnings ?? 0) +
    clearanceIssues.length +
    safetyWarnings +
    architectureWarnings +
    dxfWarnings.length +
    (validationFlow && validationFlow.score < 80 ? 1 : 0) +
    (outOfPlantBounds > 0 ? 1 : 0);

  const releaseState = !report
    ? "Sin validar"
    : releaseBlockers > 0
      ? "Bloqueado"
      : releaseWarnings > 0
        ? "Con avisos"
        : "Listo";
  const releaseTone =
    releaseState === "Listo"
      ? "text-emerald-300"
      : releaseState === "Bloqueado"
        ? "text-rose-300"
        : releaseState === "Con avisos"
          ? "text-amber-300"
          : "text-gray-500 dark:text-gray-400";
  const releaseChecks = [
    {
      label: "Diseño base",
      value: report
        ? `${report.errors} errores · ${report.warnings} avisos`
        : "Pendiente",
      tone:
        report?.score === "error"
          ? "text-rose-300"
          : report?.score === "warn"
            ? "text-amber-300"
            : report
              ? "text-emerald-300"
              : "text-gray-500 dark:text-gray-400",
    },
    {
      label: "CAD validation",
      value: cadValidationReport
        ? cadValidationReport.severity === "critical"
          ? "Critico"
          : cadValidationReport.severity === "warning"
            ? "Con avisos"
            : "OK"
        : "Pendiente",
      tone:
        cadValidationReport?.severity === "critical"
          ? "text-rose-300"
          : cadValidationReport?.severity === "warning"
            ? "text-amber-300"
            : cadValidationReport
              ? "text-emerald-300"
              : "text-gray-500 dark:text-gray-400",
    },
    {
      label: "Colisiones",
      value: collisionHits.length
        ? `${collisionHits.length} choque(s)`
        : "Sin choques activos",
      tone: collisionHits.length ? "text-rose-300" : "text-emerald-300",
    },
    {
      label: "Holguras",
      value: clearanceIssues.length
        ? `${clearanceIssues.length} bajo minimo`
        : "Dentro de minimo",
      tone: clearanceIssues.length ? "text-amber-300" : "text-emerald-300",
    },
    {
      label: "Arquitectura",
      value: architectureIssues.length
        ? `${architectureIssues.length} issue(s)`
        : "Lista",
      tone: architectureBlockers
        ? "text-rose-300"
        : architectureIssues.length
          ? "text-amber-300"
          : "text-emerald-300",
    },
    {
      label: "Safety zones",
      value: safetyIssues.length
        ? `${safetyIssues.length} issue(s)`
        : "Sin invasiones activas",
      tone: safetyBlockers
        ? "text-rose-300"
        : safetyIssues.length
          ? "text-amber-300"
          : "text-emerald-300",
    },
    {
      label: "Flow Health",
      value: validationFlow ? `${validationFlow.score}/100` : "No analizado",
      tone: !validationFlow
        ? "text-gray-500 dark:text-gray-400"
        : validationFlow.score >= 80
          ? "text-emerald-300"
          : validationFlow.score >= 55
            ? "text-amber-300"
            : "text-rose-300",
    },
    {
      label: "DXF import",
      value: dxfWarnings.length
        ? `${dxfWarnings.length} warning(s)`
        : "Sin warnings activos",
      tone: dxfWarnings.length ? "text-amber-300" : "text-emerald-300",
    },
    {
      label: "Límites de planta",
      value: outOfPlantBounds
        ? `${outOfPlantBounds} fuera de límites`
        : "Dentro de la planta",
      tone: outOfPlantBounds ? "text-amber-300" : "text-emerald-300",
    },
  ];
  const flowSegmentRows = [...flowSegments]
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 5);
  const flowReorderPreview = flowHealth?.reorderPreview;
  const flowReorderMoveRows =
    flowReorderPreview?.moves
      .filter((move) => move.from.x !== move.to.x || move.from.y !== move.to.y)
      .slice(0, 5) ?? [];
  const dxfExportLayerRows = dxfExportSummary.layerSummary
    .filter((layer) => layer.included > 0 || layer.hidden > 0)
    .slice(0, 5);
  const dxfExportIssueRows = dxfExportSummary.issues.slice(0, 5);
  const professionalDockTitle =
    activeProfessionalDock === "selection"
      ? "Selección"
      : activeProfessionalDock === "hatch"
        ? "Hatch"
        : activeProfessionalDock === "dimension"
          ? "Dimensiones"
          : activeProfessionalDock === "mleader"
            ? "MLeader"
            : activeProfessionalDock === "blocks"
              ? "Bloques / Xrefs"
              : activeProfessionalDock === "collaboration"
                ? "Compare / Merge / Review"
                : "Workspace";
  const professionalDockContent =
    activeProfessionalDock === "selection" ? (
      <CadSelectionPalette
        docked
        selectedCount={professionalSelection.current.length}
        previousCount={professionalSelection.previous.length}
        mode={selectionGeometryMode}
        operation={selectionOperation}
        quickType={quickSelectionType}
        quickLayer={quickSelectionLayer}
        quickText={quickSelectionText}
        entityTypes={professionalSelectionTypes}
        layers={professionalSelectionLayers}
        onModeChange={(mode) => {
          selectionGeometryModeRef.current = mode;
          setSelectionGeometryMode(mode);
        }}
        onOperationChange={(operation) => {
          selectionOperationRef.current = operation;
          setSelectionOperation(operation);
        }}
        onQuickTypeChange={setQuickSelectionType}
        onQuickLayerChange={setQuickSelectionLayer}
        onQuickTextChange={setQuickSelectionText}
        onPrevious={() => applyProfessionalSelection({ type: "previous" })}
        onLast={() =>
          applyProfessionalSelection({
            type: "last",
            operation: selectionOperation,
          })
        }
        onAll={() =>
          applyProfessionalSelection({
            type: "all",
            universe: professionalSelectionUniverse,
          })
        }
        onInvert={() =>
          applyProfessionalSelection({
            type: "invert",
            universe: professionalSelectionUniverse,
          })
        }
        onQuick={runQuickSelection}
        onClear={() => applyProfessionalSelection({ type: "clear" })}
      />
    ) : activeProfessionalDock === "hatch" ? (
      <CadHatchPalette
        docked
        pickMode={hatchPickMode}
        solid={hatchPickSolid}
        islandStyle={hatchIslandStyle}
        onSolidChange={setHatchPickSolid}
        onIslandStyleChange={setHatchIslandStyle}
        onPickModeChange={(active) => {
          hatchPickModeRef.current = active;
          setHatchPickMode(active);
          if (active) setShowHatchPalette(false);
        }}
        onCreateAtPoint={(point) => {
          createHatchAtPoint(point);
          setShowHatchPalette(false);
        }}
        onCreateFromSelection={(solid) => {
          createHatchForSelection(solid);
          setShowHatchPalette(false);
        }}
      />
    ) : activeProfessionalDock === "dimension" ? (
      <CadDimensionPalette
        docked
        selectedCount={nativeSelectionIds.length}
        defaultOffset={Math.max(1, (data?.footprint.gridSize ?? 100) * 2)}
        styles={Object.keys(
          loadedCadDocumentRef.current?.styles.dimension ?? {},
        )}
        onCreate={createAssociativeDimension}
      />
    ) : activeProfessionalDock === "mleader" ? (
      <CadMLeaderPalette
        docked
        selectedCount={mleaderSelectedCount}
        defaultSize={Math.max(1, (data?.footprint.gridSize ?? 100) * 1.8)}
        styles={Object.keys(
          loadedCadDocumentRef.current?.styles.mleader ?? { Standard: {} },
        )}
        onCreate={createAssociativeMleader}
      />
    ) : activeProfessionalDock === "blocks" ? (
      <div
        data-testid="cad-library-dock"
        className="flex h-full min-h-0 flex-col"
      >
        <div className="grid grid-cols-2 border-b border-white/10 p-1.5">
          <button
            data-testid="cad-library-tab-blocks"
            onClick={() => setCadLibraryTab("blocks")}
            className={`rounded-lg px-2 py-1 text-[10.5px] font-semibold ${cadLibraryTab === "blocks" ? "bg-cyan-400/15 text-cyan-100" : "text-gray-500 hover:bg-white/[0.05]"}`}
          >
            BLOCK / INSERT
          </button>
          <button
            data-testid="cad-library-tab-xrefs"
            onClick={() => setCadLibraryTab("xrefs")}
            className={`rounded-lg px-2 py-1 text-[10.5px] font-semibold ${cadLibraryTab === "xrefs" ? "bg-cyan-400/15 text-cyan-100" : "text-gray-500 hover:bg-white/[0.05]"}`}
          >
            XREF ({cadXrefs.length})
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {cadLibraryTab === "blocks" ? (
            <CadBlockPalette
              docked
              blocks={professionalBlockDefinitions}
              selectedEntityCount={
                new Set([
                  ...selList.map((item) => item.id),
                  ...nativeSelectionIds,
                ]).size
              }
              selectedInsert={
                primaryNativeEntity?.type === "insert"
                  ? {
                      id: primaryNativeEntity.id,
                      block: primaryNativeEntity.block,
                    }
                  : null
              }
              defaultPoint={{
                x: Math.max(
                  0,
                  Math.min(
                    ctxRef.current?.W ?? 0,
                    controlsRef.current && ctxRef.current
                      ? controlsRef.current.target.x / ctxRef.current.s +
                          ctxRef.current.W / 2
                      : (ctxRef.current?.W ?? 0) / 2,
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    ctxRef.current?.H ?? 0,
                    controlsRef.current && ctxRef.current
                      ? controlsRef.current.target.z / ctxRef.current.s +
                          ctxRef.current.H / 2
                      : (ctxRef.current?.H ?? 0) / 2,
                  ),
                ),
              }}
              onDefine={defineProfessionalBlock}
              onInsert={insertProfessionalBlock}
              onRedefine={redefineProfessionalBlock}
              onReplace={replaceProfessionalBlock}
              onExplode={explodeProfessionalInsert}
              onPurge={purgeProfessionalBlocks}
            />
          ) : (
            <CadXrefPalette
              references={cadXrefs}
              graph={cadXrefGraph}
              defaultPoint={{
                x: Math.max(
                  0,
                  Math.min(
                    ctxRef.current?.W ?? 0,
                    controlsRef.current && ctxRef.current
                      ? controlsRef.current.target.x / ctxRef.current.s +
                          ctxRef.current.W / 2
                      : (ctxRef.current?.W ?? 0) / 2,
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    ctxRef.current?.H ?? 0,
                    controlsRef.current && ctxRef.current
                      ? controlsRef.current.target.z / ctxRef.current.s +
                          ctxRef.current.H / 2
                      : (ctxRef.current?.H ?? 0) / 2,
                  ),
                ),
              }}
              onAttach={attachProfessionalXref}
              onCompare={compareProfessionalXref}
              onReload={reloadProfessionalXref}
              onUnload={unloadProfessionalXref}
              onDetach={detachProfessionalXref}
              onBind={bindProfessionalXref}
            />
          )}
        </div>
      </div>
    ) : activeProfessionalDock === "collaboration" &&
      loadedCadDocumentRef.current ? (
      <CadCollaborationPalette
        document={snapshotDocument()}
        actor={userId ?? "authenticated-user"}
        reviewReadOnly={drawingReadOnly}
        onDocumentChange={applyCollaborationDocument}
        onVisualize={visualizeCollaborationDiff}
        onNavigate={navigateCollaborationDiff}
        onCreateReviewLink={createServerReviewLink}
        onRevokeReviewLink={revokeServerReviewLink}
      />
    ) : activeProfessionalDock === "workspace" ? (
      <CadWorkspaceDock
        preferences={workspacePreferences}
        onChange={updateWorkspacePreferences}
        onProfile={applyWorkspaceProfile}
        onReset={resetWorkspacePreferences}
      />
    ) : null;

  // Portal to <body> so the full-screen overlay escapes the editor's glass
  // container (backdrop-filter would otherwise be the containing block for our
  // position:fixed and trap it inside the box instead of the viewport).
  return createPortal(
    <div
      data-color-scheme={resolvedScheme}
      data-cad-drawing-read-only={drawingReadOnly ? "true" : "false"}
      aria-readonly={drawingReadOnly}
      onClickCapture={guardReadOnlyUi}
      onChangeCapture={guardReadOnlyUi}
      onInputCapture={guardReadOnlyUi}
      onSubmitCapture={guardReadOnlyUi}
      onPointerDownCapture={guardReadOnlyUi}
      onKeyDownCapture={guardReadOnlyUi}
      className={`fixed inset-0 z-[70] flex flex-col ${resolvedScheme === "light" ? "bg-slate-100 text-slate-950" : "bg-gray-950 text-white"}`}
    >
      {/* top bar (relative z-30 so dropdown popovers paint above the 3D content,
          which would otherwise stack over the backdrop-blur'd bar) */}
      <div
        data-testid="cad-top-toolbar"
        className={`relative z-30 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap border-b px-4 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 ${resolvedScheme === "light" ? "border-slate-300 bg-white/90" : "border-white/10 bg-gray-900/80"} ${workspacePreferences.toolbarDensity === "compact" ? "h-12 py-1.5" : "h-14 py-2.5"}`}
      >
        {/* Cierre persistente y SIEMPRE visible (X clara) anclado al inicio de la
            barra. La barra usa flex-wrap para que las herramientas NUNCA recorten
            ni choquen. Regla: ninguna pantalla a foco total puede atrapar. */}
        <button
          data-cad-readonly-allowed
          onClick={onClose}
          title="Cerrar el CAD — volver al dashboard (Esc)"
          aria-label="Cerrar el CAD"
          className="sticky left-0 z-20 inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-rose-500/95 px-3 py-1.5 text-[13px] font-semibold text-white shadow-xl hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <X className="w-4 h-4" /> Cerrar
        </button>
        <div className="w-px h-5 bg-white/10" />
        <BoxIcon className="w-4 h-4" style={{ color: "#f43f5e" }} />
        <span className="font-semibold text-sm">{cadTitle}</span>
        {drawingReadOnly && (
          <span
            data-testid={
              cadReviewReadOnly ? "cad-review-banner" : "cad-readonly-banner"
            }
            className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
          >
            {cadReviewReadOnly ? "REVIEW" : "VIEWER"} · SOLO LECTURA
          </span>
        )}
        <span className="hidden xl:inline text-[11px] text-gray-500 dark:text-gray-400 max-w-[520px] truncate">
          {cadSubtitle}
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
          {placedCount} estaciones · {assetCount} equipos
        </span>
        <div className="inline-flex items-center rounded-lg bg-white/[0.06] p-0.5 text-[12px] font-semibold ml-1">
          <button
            data-cad-readonly-allowed
            onClick={() => {
              if (viewMode !== "2d") toggleViewMode();
            }}
            className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === "2d" ? "bg-white/15 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-200"}`}
            title="Vista de plano 2D (superior, solo paneo y zoom)"
          >
            2D
          </button>
          <button
            data-cad-readonly-allowed
            onClick={() => {
              if (viewMode !== "3d") toggleViewMode();
            }}
            className={`px-2.5 py-1 rounded-md transition-colors ${viewMode === "3d" ? "bg-white/15 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-200"}`}
            title="Vista 3D (órbita libre)"
          >
            3D
          </button>
        </div>
        <div
          data-cad-readonly-allowed
          data-testid="cad-space-tabs"
          className="inline-flex items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-[10.5px] font-semibold"
        >
          <button
            onClick={() => setShowSheetPackage(false)}
            className={`px-2 py-1 ${!showSheetPackage ? "bg-cyan-500/20 text-cyan-100" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
          >
            Model
          </button>
          {orderedPaperSpaces.slice(0, 3).map((space) => (
            <button
              key={space.id}
              onClick={() => {
                selectPaperSpace(space);
                setShowSheetPackage(true);
              }}
              className={`border-l border-white/10 px-2 py-1 ${showSheetPackage && space.id === activePaperSpace?.id ? "bg-cyan-500/20 text-cyan-100" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
            >
              {space.name}
            </button>
          ))}
          <button
            onClick={() => setShowSheetPackage(true)}
            className="border-l border-white/10 px-2 py-1 text-gray-400 hover:bg-white/10 hover:text-white"
            title="Administrar layouts, viewports y publicación"
          >
            Layout
            {orderedPaperSpaces.length
              ? ` · ${orderedPaperSpaces.length}`
              : " +"}
          </button>
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn
          active={tool === "select"}
          onClick={() => setToolMode("select")}
          title="Seleccionar / mover (V)"
        >
          <MousePointer2 className="w-4 h-4" />
        </T3Btn>
        <div className="relative">
          <T3Btn
            active={
              showSelectionPalette ||
              selectionGeometryMode !== "pick" ||
              selectionOperation !== "replace"
            }
            onClick={() => toggleProfessionalDock("selection")}
            title="Selección profesional: ventana, cruce, polígono, fence, lasso, filtros y cycling"
          >
            <ScanEye className="h-4 w-4" />
          </T3Btn>
        </div>
        <T3Btn
          active={tool === "measure"}
          onClick={toggleMeasure}
          title="Medir / acotar (M)"
        >
          <Ruler className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={tool === "wall"}
          onClick={toggleWall}
          title="Dibujar muros (W) — clic en puntos, Esc termina"
        >
          <Spline className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={() => openMTextEditor()}
          title="MTEXT: texto multilínea semántico, estilos y máscara"
        >
          <StickyNote className="w-4 h-4" />
        </T3Btn>
        <div className="relative">
          <T3Btn
            active={showHatchPalette || hatchPickMode}
            onClick={() => toggleProfessionalDock("hatch")}
            title="HATCH: selección, pick point, islands y asociatividad"
          >
            <BrickWall className="h-4 w-4" />
          </T3Btn>
        </div>
        <div className="relative">
          <T3Btn
            active={showDimensionPalette}
            onClick={() => toggleProfessionalDock("dimension")}
            title="Dimensiones asociativas: linear, aligned, angular, radius, diameter, ordinate y arc length"
          >
            <RulerDimensionLine className="w-4 h-4" />
          </T3Btn>
        </div>
        <div className="relative">
          <T3Btn
            active={showMleaderPalette}
            onClick={() => toggleProfessionalDock("mleader")}
            title="MLEADER: directriz semántica asociativa con una o múltiples líneas"
          >
            <Waypoints className="h-4 w-4" />
          </T3Btn>
        </div>
        <div className="relative">
          <T3Btn
            active={showBlockPalette}
            onClick={() => toggleProfessionalDock("blocks")}
            title="BLOCK/INSERT: definiciones vivas, atributos, biblioteca y XREF, redefine, replace, explode y purge"
          >
            <Boxes className="h-4 w-4" />
          </T3Btn>
        </div>
        <div className="relative">
          <T3Btn
            active={showCollaborationDock}
            onClick={() => toggleProfessionalDock("collaboration")}
            title="Compare / Merge / Review: base, mine, theirs, conflictos, comentarios, markups y links de revisión"
          >
            <GitMerge className="h-4 w-4" />
          </T3Btn>
        </div>
        <T3Btn
          onClick={autoDimension}
          title="Acotar automáticamente — medidas generales y pasos del layout (o de la selección)"
        >
          <RulerDimensionLine className="w-4 h-4" />
        </T3Btn>
        {dimCount > 0 && (
          <button
            onClick={clearDims}
            title="Quitar todas las cotas"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-gray-300 hover:bg-white/10"
          >
            {dimCount} {dimCount === 1 ? "cota" : "cotas"}{" "}
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn
          onClick={undo}
          disabled={hist.undo === 0}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={redo}
          disabled={hist.redo === 0}
          title="Rehacer (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn
          active={layers.grid}
          onClick={() => setLayers((v) => ({ ...v, grid: !v.grid }))}
          title={
            layers.grid
              ? "Ocultar grilla del plano"
              : "Mostrar grilla del plano"
          }
        >
          <Grid3x3 className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={snap}
          onClick={() => setSnap((v) => !v)}
          title="Snap a grilla"
        >
          <Crosshair className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={draftSettings.osnap}
          onClick={() => draftSettingsHost.toggleOsnap()}
          title="Snap a objetos y al plano DXF — alinea con bordes/centros y engancha a vértices y puntos medios del plano al medir o trazar muros"
        >
          <Magnet className="w-4 h-4" />
        </T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        {viewMode === "3d" && (
          <>
            <T3Btn onClick={() => viewPreset("iso")} title="Vista isométrica">
              <Maximize2 className="w-4 h-4" />
            </T3Btn>
            <T3Btn
              onClick={() => viewPreset("top")}
              title="Vista superior (planta)"
            >
              <Eye className="w-4 h-4" />
            </T3Btn>
            <T3Btn onClick={() => viewPreset("front")} title="Vista frontal">
              <Layers className="w-4 h-4" />
            </T3Btn>
            <T3Btn
              active={walk}
              onClick={toggleWalk}
              title="Recorrido en primera persona — arrastra para mirar, WASD para caminar, Esc para salir"
            >
              <PersonStanding className="w-4 h-4" />
            </T3Btn>
          </>
        )}
        <T3Btn
          onClick={() => fitView("all")}
          title="Ajustar a contenido — encuadra todo el layout (F)"
        >
          <Expand className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={() => fitView("plant")}
          title="Ajustar a la planta — encuadra toda la huella (Shift+F)"
        >
          <Frame className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={() => fitView("selection")}
          disabled={selList.length === 0}
          title="Ajustar a la selección — encuadra los objetos seleccionados"
        >
          <Focus className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={focusMode}
          onClick={() => setFocusMode((v) => !v)}
          title="Modo foco — oculta los paneles laterales (\\)"
        >
          {focusMode ? (
            <PanelLeft className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </T3Btn>
        <T3Btn
          active={showWorkspaceDock}
          onClick={() => toggleProfessionalDock("workspace")}
          title="Workspace profesional: docks, tema, idioma, puntero, clic derecho y atajos"
        >
          <Settings2 className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={showMinimap}
          onClick={() =>
            updateWorkspacePreferences({
              ...workspacePreferencesRef.current,
              minimap: !workspacePreferencesRef.current.minimap,
            })
          }
          title="Minimapa de la planta — vista general y navegación"
        >
          <MapPin className="w-4 h-4" />
        </T3Btn>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <T3Btn
          active={showHeat}
          onClick={() => setShowHeat((v) => !v)}
          title="Mapa de calor de ocupación en el piso"
        >
          <Grid2x2 className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={showGaps}
          onClick={() => setShowGaps((v) => !v)}
          title="Holguras de seguridad — marca los objetos demasiado juntos (ámbar) o traslapados (rojo)"
        >
          <ShieldAlert className="w-4 h-4" />
        </T3Btn>
        <div className="relative" ref={overlayMenuRef}>
          <T3Btn
            active={showOverlayMenu || !!overlay}
            onClick={() => setShowOverlayMenu((v) => !v)}
            title="Estado de estación — MES en vivo, calor de ciclo, completitud, bahías, calidad"
          >
            <Activity className="w-4 h-4" />
          </T3Btn>
          {showOverlayMenu && (
            <div className="absolute top-full mt-1 left-0 z-50 w-60 rounded-xl border border-white/10 bg-gray-900 shadow-2xl py-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500">
                Estado de estación
              </div>
              <button
                onClick={() => loadOverlay(null)}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-white/[0.08] ${overlay === null ? "text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                Ninguno
              </button>
              {OVERLAY_DEFS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => loadOverlay(o.key)}
                  className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-white/[0.08] ${overlay === o.key ? "text-white" : "text-gray-200"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={viewMenuRef}>
          <T3Btn
            active={showView}
            onClick={toggleViewMenu}
            title="Vista, capas y plano"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </T3Btn>
          {showView &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                ref={viewMenuPanelRef}
                data-testid="cad-layer-manager"
                style={viewMenuPosition}
                className="fixed z-[90] w-72 max-h-[78vh] overflow-y-auto rounded-xl border border-white/10 bg-gray-900 shadow-2xl p-3 text-[12px]"
              >
                <CadEditorLayerToggles
                  layers={layers}
                  stationsLabel={standalone ? "Puntos" : "Estaciones"}
                  onToggle={toggleEditorLayer}
                />
                <CadLayerManagerPalette
                  rows={visibleCadLayerRows}
                  totalRows={cadLayerManagerRows.length}
                  filter={layerManager.filter}
                  draftName={layerManager.draftName}
                  draftColor={layerManager.draftColor}
                  draftStateName={layerManager.draftStateName}
                  states={layerManager.states}
                  readOnly={drawingReadOnly}
                  activeViewportName={activeCadViewportName}
                  onFilterText={layerManagerHost.setFilterText}
                  onFilterProperty={layerManagerHost.setFilterProperty}
                  onClearFilter={layerManagerHost.clearFilter}
                  onDraftName={layerManagerHost.setDraftName}
                  onDraftColor={layerManagerHost.setDraftColor}
                  onCreate={createCanonicalCadLayer}
                  onRename={updateCadLayerLabel}
                  onColor={updateCadLayerColor}
                  onLinetype={layerActions.setLinetype}
                  onLineweight={layerActions.setLineweight}
                  onPlot={layerActions.setPlot}
                  onToggleVisible={toggleCadLayerVisibility}
                  onToggleLock={toggleCadLayerLock}
                  onToggleViewportFreeze={layerActions.toggleViewportFreeze}
                  onActivate={setActiveCadLayer}
                  onSelectObjects={selectCadLayerObjects}
                  onIsolate={isolateCadLayer}
                  onAssignSelection={assignSelectionToCadLayer}
                  onDelete={deleteCanonicalCadLayer}
                  onDraftStateName={layerManagerHost.setDraftStateName}
                  onSaveState={layerActions.saveState}
                  onRestoreState={layerActions.restoreState}
                  onDeleteState={layerActions.deleteState}
                  summary={{
                    assigned: Object.keys(layerAssignments).length,
                    hiddenObjects: cadLayerSummary.hiddenObjectCount,
                    lockedObjects: cadLayerSummary.lockedObjectCount,
                  }}
                  onShowAll={showAllCadLayerVisibility}
                  onHideEmpty={layerActions.hideEmpty}
                  onUnlockAll={unlockAllCadLayerVisibility}
                  onResetPresentation={resetCadLayerPresentation}
                />
                <div className="mt-2.5 mb-1.5 flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">
                    Vistas
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {viewportBookmarks.length}/8
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={saveCurrentViewportBookmark}
                    className="rounded-md bg-white/[0.06] px-2 py-1.5 text-[11px] font-medium text-gray-200 hover:bg-white/[0.12]"
                  >
                    Guardar vista
                  </button>
                  <button
                    onClick={focusCurrentSelection}
                    disabled={!selList.length}
                    className="rounded-md bg-white/[0.06] px-2 py-1.5 text-[11px] font-medium text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
                  >
                    Fit seleccion
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  {viewportBookmarks.length ? (
                    viewportBookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5"
                      >
                        <button
                          onClick={() => restoreViewportBookmark(bookmark)}
                          className="min-w-0 text-left"
                        >
                          <div className="truncate text-[11.5px] font-medium text-gray-100">
                            {bookmark.label}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {bookmark.camera.mode.toUpperCase()} ·{" "}
                            {new Date(bookmark.savedAt).toLocaleTimeString(
                              "es-MX",
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </div>
                        </button>
                        <button
                          onClick={() => deleteViewportBookmark(bookmark)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-white/[0.08] hover:text-white"
                          title="Eliminar vista guardada"
                        >
                          Del
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10.5px] text-gray-500">
                      Guarda vistas de una planta grande para volver rapido a
                      areas, issues o revisiones.
                    </div>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1.5">
                  Tema
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(THEMES) as Theme3D[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-2 py-1 rounded-md text-[12px] ${theme === t ? "bg-cyan-600 text-white" : "bg-white/[0.06] text-gray-300 hover:bg-white/[0.12]"}`}
                    >
                      {THEMES[t].label}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1.5">
                  Escala de planta
                </div>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  {FACTORY_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      title={p.hint}
                      className="px-2 py-1 rounded-md text-left bg-white/[0.06] text-gray-200 hover:bg-cyan-600/30"
                    >
                      <span className="block text-[12px] leading-tight">
                        {p.label}
                      </span>
                      <span className="block text-[9px] text-gray-400 leading-tight">
                        {p.widthM}×{p.heightM} m
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    Plano ({data?.footprint.unit ?? "mm"})
                  </span>
                  <div className="inline-flex overflow-hidden rounded-md border border-white/10 text-[9px]">
                    {(["m", "mm"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setPlantDisplayUnit(u)}
                        className={`px-1.5 py-0.5 ${plantDisplayUnit === u ? "bg-cyan-600/40 text-cyan-100" : "text-gray-500 hover:text-white"}`}
                        title={`Mostrar tamaño en ${u === "m" ? "metros" : "milímetros"}`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-1">
                  <DimInput
                    label="Ancho"
                    testId="cad-footprint-w"
                    value={fpDraft.w}
                    onChange={(v) => setFpDraft((s) => ({ ...s, w: v }))}
                  />
                  <DimInput
                    label="Largo"
                    testId="cad-footprint-h"
                    value={fpDraft.h}
                    onChange={(v) => setFpDraft((s) => ({ ...s, h: v }))}
                  />
                  <DimInput
                    label="Rejilla"
                    testId="cad-footprint-grid"
                    value={fpDraft.g}
                    onChange={(v) => setFpDraft((s) => ({ ...s, g: v }))}
                  />
                </div>
                <div className="text-[10px] text-gray-500 mb-2">
                  ≈{" "}
                  {(() => {
                    const unit = (data?.footprint.unit ?? "mm") as WorldUnit;
                    const fmt = (v: number) =>
                      plantDisplayUnit === "m"
                        ? formatMeters(unitToMeters(v || 0, unit))
                        : `${Math.round(metersToUnit(unitToMeters(v || 0, unit), "mm")).toLocaleString()} mm`;
                    return `${fmt(fpDraft.w)} × ${fmt(fpDraft.h)}`;
                  })()}
                </div>
                <button
                  data-testid="cad-footprint-apply"
                  onClick={applyFootprint}
                  className="w-full px-2 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium"
                >
                  Aplicar tamaño
                </button>
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2.5 mb-1">
                  Sol / sombras
                </div>
                <label className="block mb-1.5">
                  <span className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                    <span>Azimut</span>
                    <span>{sun.az}°</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={sun.az}
                    onChange={(e) =>
                      setSun((s) => ({ ...s, az: Number(e.target.value) }))
                    }
                    className="w-full accent-amber-400"
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                    <span>Altura</span>
                    <span>{sun.el}°</span>
                  </span>
                  <input
                    type="range"
                    min={12}
                    max={88}
                    value={sun.el}
                    onChange={(e) =>
                      setSun((s) => ({ ...s, el: Number(e.target.value) }))
                    }
                    className="w-full accent-amber-400"
                  />
                </label>
              </div>,
              document.body,
            )}
        </div>
        <div className="w-px h-5 bg-white/10 mx-1" />
        {!standalone && (
          <T3Btn
            onClick={arrangeLineLayout}
            title="Acomodar la línea — ordena las estaciones por secuencia en filas equiespaciadas"
          >
            <Rows3 className="w-4 h-4" />
          </T3Btn>
        )}
        {!standalone && (
          <T3Btn
            onClick={connectLineLayout}
            title="Conectar la línea — enlaza cada estación con la siguiente en secuencia (flujo)"
          >
            <Waypoints className="w-4 h-4" />
          </T3Btn>
        )}
        <T3Btn
          onClick={runOptimize}
          disabled={serverBusy}
          title="Optimizar flujo — reordena para minimizar el recorrido (servidor)"
        >
          <WandSparkles className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={showCommand && workspacePreferences.commandDock}
          onClick={() => {
            setFocusMode(false);
            updateWorkspacePreferences({
              ...workspacePreferencesRef.current,
              commandDock: true,
            });
            window.requestAnimationFrame(() =>
              commandInputRef.current?.focus(),
            );
          }}
          title="Línea de comandos determinística — historial, preview y repetición"
        >
          <ChevronRight className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={showPalette}
          onClick={() => setShowPalette((v) => !v)}
          title="Paleta de comandos (⌘K / Ctrl K) — busca comandos, herramientas y símbolos"
        >
          <Search className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={openChecks}
          title="Revisión de diseño — valida colocación, límites, traslapes y flujo"
        >
          <ShieldCheck className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={!!flowHealth}
          onClick={analyzeFlowHealth}
          title="Flow Health — score, cruces y backtracking"
        >
          <ChartLine className="w-4 h-4" />
        </T3Btn>
        <T3Btn onClick={openTakeoff} title="Cantidades / lista de materiales">
          <ClipboardList className="w-4 h-4" />
        </T3Btn>
        {analysisPanels.length > 0 && (
          <div className="relative" ref={analysisMenuRef}>
            <T3Btn
              active={showAnalysis || !!analysisPanel}
              onClick={() => setShowAnalysis((v) => !v)}
              title="Análisis del layout — balanceo, costos, flujo, escenarios, salud…"
            >
              <ChartLine className="w-4 h-4" />
            </T3Btn>
            {showAnalysis && (
              <div className="absolute top-full mt-1 left-0 z-50 w-64 max-h-[62vh] overflow-y-auto rounded-xl border border-white/10 bg-gray-900 shadow-2xl py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500">
                  Análisis del layout
                </div>
                {analysisPanels.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setAnalysisPanel(p.key);
                      setShowAnalysis(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] text-gray-200 hover:bg-white/[0.08] transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <T3Btn
          active={showSheetPackage}
          onClick={() => setShowSheetPackage(true)}
          title="Paquete de entrega — cajetín, checklist, manifiesto y readiness"
        >
          <Stamp className="w-4 h-4" />
        </T3Btn>
        <select
          value={plotPaper}
          onChange={(e) => setPlotPaper(e.target.value as CadPaperId)}
          title="Papel del plano (A4–A0, carta, tabloide) — la escala estándar se elige sola"
          className="h-7 self-center rounded-lg border border-white/10 bg-white/[0.06] px-1 text-[11px] text-gray-300 focus:outline-none"
        >
          {(Object.keys(CAD_PAPER_SIZES) as CadPaperId[]).map((id) => (
            <option key={id} value={id} className="bg-gray-900">
              {CAD_PAPER_SIZES[id].label}
            </option>
          ))}
        </select>
        <T3Btn
          disabled={drawingReadOnly}
          onClick={() => void publishSheetSetPdf()}
          title="Publicar conjunto PDF vectorial — hojas, viewports y cajetines"
        >
          <Printer className="w-4 h-4" />
        </T3Btn>
        <T3Btn onClick={exportPng} title="Exportar imagen (PNG)">
          <Download className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={exportGltf}
          title="Exportar modelo 3D (.glb) — Blender, otros CAD"
        >
          <Package className="w-4 h-4" />
        </T3Btn>
        <input
          ref={dxfInputRef}
          data-testid="cad-dxf-input"
          type="file"
          accept=".dxf,.dwg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onDxfFile(f);
            e.target.value = "";
          }}
        />
        <T3Btn
          onClick={() => dxfInputRef.current?.click()}
          disabled={dxfBusy}
          title="Cargar plano DXF de fondo (calcar el plano del cliente)"
        >
          <Upload className="w-4 h-4" />
        </T3Btn>
        <input
          ref={visionInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onVisionFile(f);
            e.target.value = "";
          }}
        />
        <T3Btn
          onClick={() => visionInputRef.current?.click()}
          disabled={visionBusy}
          title="Vectorizar plano con IA: sube una foto/imagen del plano y la visión (CIDE) propone muros y zonas editables"
        >
          {visionBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ScanEye className="w-4 h-4" />
          )}
        </T3Btn>
        {hasDxf && (
          <T3Btn
            onClick={importDxfWalls}
            title="Convertir el plano DXF de fondo en muros editables"
          >
            <BrickWall className="w-4 h-4" />
          </T3Btn>
        )}
        {hasDxf && (
          <T3Btn
            onClick={removeDxf}
            disabled={dxfBusy}
            title="Quitar el plano DXF de fondo"
          >
            <ImageOff className="w-4 h-4" />
          </T3Btn>
        )}
        <T3Btn
          onClick={openDxfExport}
          title="Exportar a DXF (AutoCAD) — opciones de capas, selección y cotas"
        >
          <FileDown className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          onClick={exportCsvSchedule}
          title="Exportar estaciones a CSV (Excel)"
        >
          <FileText className="w-4 h-4" />
        </T3Btn>
        {dxfWarnings.length > 0 && (
          <div
            className="ml-1 inline-flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100"
            title="Advertencias del último DXF importado"
          >
            <CircleAlert className="h-3.5 w-3.5" />
            DXF {dxfWarnings.length}
          </div>
        )}
        <T3Btn
          active={showVersions}
          onClick={openVersions}
          title="Versiones / escenarios — guardar, restaurar"
        >
          <History className="w-4 h-4" />
        </T3Btn>
        <T3Btn
          active={showCells}
          onClick={() => setShowCells((v) => !v)}
          title="Celdas / zonas — agrupar estaciones en celdas"
        >
          <Group className="w-4 h-4" />
        </T3Btn>
        {models.length > 1 && (
          <T3Btn
            active={showClone}
            onClick={() => setShowClone((v) => !v)}
            title="Clonar layout desde otro modelo (plantilla)"
          >
            <Copy className="w-4 h-4" />
          </T3Btn>
        )}
        <T3Btn
          active={showHelp}
          onClick={() => setShowHelp((v) => !v)}
          title="Atajos y ayuda (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </T3Btn>
        <div className="flex-1" />
        {approval && (
          <div
            className="inline-flex items-center gap-1.5 mr-1.5"
            title="Estado de aprobación del layout"
          >
            <Stamp
              className="w-3.5 h-3.5"
              style={{ color: APPROVAL_META[approval.status].color }}
            />
            <select
              value={approval.status}
              disabled={approvalBusy || drawingReadOnly}
              onChange={(e) =>
                setApprovalStatus(e.target.value as ApprovalStatus)
              }
              className="text-[12px] rounded-md px-1.5 py-1 bg-white/[0.06] border border-white/10 outline-none"
              style={{ color: APPROVAL_META[approval.status].color }}
            >
              <option value="draft" className="text-gray-900">
                Borrador
              </option>
              <option value="in_review" className="text-gray-900">
                En revisión
              </option>
              <option value="approved" className="text-gray-900">
                Aprobado
              </option>
            </select>
          </div>
        )}
        <button
          data-testid="cad-save"
          onClick={save}
          // Guardar sigue disponible siempre que el dibujo sea editable. Atarlo
          // a `dirty` lo dejaba inerte en cuanto el autosave (debounce 2 s)
          // limpiaba la marca, así que el usuario perdía el control explícito
          // justo después de editar. La idempotencia la garantiza
          // `persistCanonicalSave`: si la generación de edición vigente ya está
          // persistida no emite escritura ni versión CAS nueva, y la cola de un
          // solo escritor serializa el clic con cualquier autosave en vuelo.
          disabled={drawingReadOnly}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#e11d48" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}{" "}
          Guardar
        </button>
        <button
          onClick={() => void closeEditor()}
          className="p-1.5 rounded-lg hover:bg-white/10 ml-1"
          title="Cerrar editor"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error ? (
        <div className="flex-1 grid place-items-center text-amber-400 text-sm">
          {error}
        </div>
      ) : !data ? (
        <div className="flex-1 grid place-items-center text-gray-500 dark:text-gray-400">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* left: bandeja de estaciones. EN TABLETA SE PLIEGA: con los dos
              muelles fijos, a 768 px el lienzo se quedaba con el 34 % de la
              ventana y la barra flotante llegaba a comerse el primer toque
              (`docs/cad/evidence/touch-support.json`). La línea de comandos NO
              se va con él: flota sobre el lienzo, que es donde está la memoria
              muscular. */}
          <div
            data-testid="cad-left-dock"
            className={`w-60 shrink-0 border-r border-white/10 bg-gray-900/95 text-white flex-col max-[1100px]:hidden ${focusMode || (!workspacePreferences.leftDock && !workspacePreferences.commandDock) ? "hidden" : "flex"}`}
          >
            {showCommand && workspacePreferences.commandDock && (
              <CadCommandDock
                inputRef={commandInputRef}
                value={commandText}
                preview={commandPreview}
                log={commandLog}
                suggestions={commandAssistSuggestions}
                selectionCount={selList.length}
                aiBusy={aiBusy}
                aiProposal={aiProposal}
                canUndo={
                  commandLog.some((command) => command.status === "applied") &&
                  hist.undo > 0
                }
                canRedo={
                  commandLog.some((command) => command.status === "undone") &&
                  hist.redo > 0
                }
                onValueChange={(value) => {
                  setCommandText(value);
                  setCommandHistoryCursor(-1);
                }}
                onSubmit={interpretCommand}
                onHistory={navigateCommandLineHistory}
                onRepeat={repeatLastCommand}
                onClearInput={() => {
                  setCommandText("");
                  setCommandHistoryCursor(-1);
                }}
                onDismissPreview={() => setCommandPreview(null)}
                onRequestAi={(source) => void requestAiProposal(source)}
                onApplyAi={applyAiProposal}
                onDiscardAi={() => setAiProposal(null)}
                onApplyPreview={applyCommand}
                onSuggestion={applyCommandSuggestion}
                onUndo={undoLastCommand}
                onRedo={redoLastCommand}
              />
            )}
            {workspacePreferences.leftDock && (
              <>
                <div className="flex shrink-0 text-[12px] font-medium border-b border-white/10">
                  <button
                    onClick={() => setTab("stations")}
                    className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === "stations" ? "text-white bg-white/[0.06]" : "text-gray-500 dark:text-gray-400 hover:text-gray-200"}`}
                  >
                    <MapPin className="w-3.5 h-3.5" />{" "}
                    {standalone ? "Puntos" : "Estaciones"}
                  </button>
                  <button
                    onClick={() => setTab("equipment")}
                    className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === "equipment" ? "text-white bg-white/[0.06]" : "text-gray-500 dark:text-gray-400 hover:text-gray-200"}`}
                  >
                    <Boxes className="w-3.5 h-3.5" /> Biblioteca
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {tab === "stations" ? (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                        Por colocar ({tray.length})
                      </div>
                      {tray.length === 0 ? (
                        <p className="text-[12px] text-gray-500">
                          Todas las estaciones están en el plano.
                        </p>
                      ) : (
                        tray.map((st) => (
                          <button
                            key={st.id}
                            onClick={() => placeStation(st)}
                            className="w-full text-left mb-1.5 px-2.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] transition-colors"
                          >
                            <div className="text-sm font-medium">
                              {st.station}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              {st.line} · clic para colocar
                            </div>
                          </button>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mb-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cyan-200">
                            <Stamp className="h-3.5 w-3.5" /> Plantillas CAD
                          </div>
                          <span className="text-[10px] text-cyan-100/60">
                            {CAD_LAYOUT_TEMPLATES.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {CAD_LAYOUT_TEMPLATES.map((template) => (
                            <button
                              key={template.id}
                              onClick={() => applyCadTemplate(template.id)}
                              title={template.description}
                              className="rounded-lg bg-cyan-400/[0.08] px-2 py-1.5 text-left text-[11px] text-cyan-100 hover:bg-cyan-400/[0.14]"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold">
                                  {template.label}
                                </span>
                                <span className="shrink-0 text-[10px] text-cyan-200/70">
                                  {template.assets.length} obj
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-cyan-200/70">
                                {template.category} · {template.description}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mb-3 rounded-xl border border-violet-400/15 bg-violet-400/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-violet-200">
                            <Boxes className="h-3.5 w-3.5" /> Mis bloques
                          </div>
                          <span className="text-[10px] text-violet-100/60">
                            {cadBlocks.length}
                          </span>
                        </div>
                        <button
                          onClick={() => void saveSelectionAsBlock()}
                          title="Guarda los equipos seleccionados como bloque reutilizable — disponible en todos los layouts"
                          className="mb-1.5 w-full rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-400/[0.14]"
                        >
                          + Guardar selección como bloque
                        </button>
                        {cadBlocks.length === 0 ? (
                          <p className="text-[10.5px] leading-snug text-gray-500">
                            Sin bloques aún: selecciona una celda armada y
                            guárdala para reutilizarla en cualquier layout.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-1.5">
                            {cadBlocks.map((block) => (
                              <div
                                key={block.id}
                                className="flex items-center gap-1"
                              >
                                <button
                                  onClick={() => insertCadBlock(block)}
                                  title="Insertar en el centro de la vista (llega agrupado)"
                                  className="min-w-0 flex-1 rounded-lg bg-violet-400/[0.08] px-2 py-1.5 text-left text-[11px] text-violet-100 hover:bg-violet-400/[0.14]"
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate font-semibold">
                                      {block.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-violet-200/70">
                                      {block.assets.length} obj
                                    </span>
                                  </span>
                                </button>
                                <button
                                  onClick={() => void deleteCadBlock(block)}
                                  title="Borrar bloque de la biblioteca"
                                  className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mb-3 rounded-xl border border-slate-300/15 bg-slate-300/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-200">
                            <BrickWall className="h-3.5 w-3.5" /> Arquitectura
                          </div>
                          <span className="text-[10px] text-slate-200/60">
                            editable
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={toggleWall}
                            className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold ${tool === "wall" ? "bg-slate-200 text-slate-950" : "bg-white/[0.06] text-slate-100 hover:bg-white/[0.12]"}`}
                          >
                            Trazar muro
                          </button>
                          <button
                            onClick={() => addArchitectureAsset("column")}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-left text-[11px] font-semibold text-slate-100 hover:bg-white/[0.12]"
                          >
                            Columna
                          </button>
                          <button
                            onClick={() => addArchitectureAsset("door")}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-left text-[11px] font-semibold text-slate-100 hover:bg-white/[0.12]"
                          >
                            Puerta
                          </button>
                          <button
                            onClick={() => addArchitectureAsset("room")}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-left text-[11px] font-semibold text-slate-100 hover:bg-white/[0.12]"
                          >
                            Cuarto / area
                          </button>
                        </div>
                        <div className="mt-1.5 text-[10px] leading-snug text-slate-200/60">
                          Tags: use:recamara, use:bano, use:cocina o dept:obra
                          clasifican locales en el takeoff.
                        </div>
                      </div>
                      <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-200">
                            <Rows3 className="h-3.5 w-3.5" /> Generador de racks
                          </div>
                          <span className="text-[10px] text-amber-100/60">
                            editable
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <DimInput
                            label="Filas"
                            value={rackGenerator.rows}
                            onChange={(v) => setRackGeneratorField("rows", v)}
                          />
                          <DimInput
                            label="Bahias"
                            value={rackGenerator.baysPerRow}
                            onChange={(v) =>
                              setRackGeneratorField("baysPerRow", v)
                            }
                          />
                          <DimInput
                            label="Bay mm"
                            value={rackGenerator.bayWidth}
                            onChange={(v) =>
                              setRackGeneratorField("bayWidth", v)
                            }
                          />
                          <DimInput
                            label="Rack mm"
                            value={rackGenerator.rackDepth}
                            onChange={(v) =>
                              setRackGeneratorField("rackDepth", v)
                            }
                          />
                          <DimInput
                            label="Pasillo"
                            value={rackGenerator.aisleWidth}
                            onChange={(v) =>
                              setRackGeneratorField("aisleWidth", v)
                            }
                          />
                          <label className="block">
                            <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">
                              Prefijo
                            </span>
                            <input
                              value={rackGenerator.labelPrefix}
                              onChange={(e) =>
                                setRackGeneratorField(
                                  "labelPrefix",
                                  e.target.value,
                                )
                              }
                              className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-amber-300/60"
                            />
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                          {(["horizontal", "vertical"] as const).map(
                            (orientation) => (
                              <button
                                key={orientation}
                                onClick={() =>
                                  setRackGeneratorField(
                                    "orientation",
                                    orientation,
                                  )
                                }
                                className={`rounded-lg border px-2 py-1.5 font-semibold ${rackGenerator.orientation === orientation ? "border-amber-300/50 bg-amber-400/15 text-amber-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                              >
                                {orientation === "horizontal"
                                  ? "Horizontal"
                                  : "Vertical"}
                              </button>
                            ),
                          )}
                        </div>
                        <button
                          onClick={applyRackRowGenerator}
                          className="mt-2 w-full rounded-lg bg-amber-500/90 px-2 py-1.5 text-[11px] font-semibold text-gray-950 hover:bg-amber-400"
                        >
                          Generar racks editables
                        </button>
                        <div className="mt-1.5 text-[10px] leading-snug text-amber-100/60">
                          Crea racks, pasillos forklift y etiquetas en capas CAD
                          existentes.
                        </div>
                      </div>
                      <div className="mb-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-emerald-200">
                            <Waypoints className="h-3.5 w-3.5" /> Generador
                            dock/staging
                          </div>
                          <span className="text-[10px] text-emerald-100/60">
                            flow
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <DimInput
                            label="Docks"
                            value={dockGenerator.dockCount}
                            onChange={(v) =>
                              setDockGeneratorField("dockCount", v)
                            }
                          />
                          <DimInput
                            label="Staging"
                            value={dockGenerator.stagingLanes}
                            onChange={(v) =>
                              setDockGeneratorField("stagingLanes", v)
                            }
                          />
                          <DimInput
                            label="Dock mm"
                            value={dockGenerator.dockWidth}
                            onChange={(v) =>
                              setDockGeneratorField("dockWidth", v)
                            }
                          />
                          <DimInput
                            label="Fondo"
                            value={dockGenerator.stagingDepth}
                            onChange={(v) =>
                              setDockGeneratorField("stagingDepth", v)
                            }
                          />
                          <DimInput
                            label="Apron"
                            value={dockGenerator.aisleWidth}
                            onChange={(v) =>
                              setDockGeneratorField("aisleWidth", v)
                            }
                          />
                          <label className="block">
                            <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">
                              Prefijo
                            </span>
                            <input
                              value={dockGenerator.labelPrefix}
                              onChange={(e) =>
                                setDockGeneratorField(
                                  "labelPrefix",
                                  e.target.value,
                                )
                              }
                              className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-emerald-300/60"
                            />
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10.5px]">
                          {(
                            ["receiving", "shipping", "crossdock"] as const
                          ).map((mode) => (
                            <button
                              key={mode}
                              onClick={() =>
                                setDockGeneratorField("mode", mode)
                              }
                              className={`rounded-lg border px-1.5 py-1.5 font-semibold ${dockGenerator.mode === mode ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                            >
                              {mode === "receiving"
                                ? "Recibir"
                                : mode === "shipping"
                                  ? "Enviar"
                                  : "Cross"}
                            </button>
                          ))}
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10.5px]">
                          {(["north", "south", "west", "east"] as const).map(
                            (side) => (
                              <button
                                key={side}
                                onClick={() =>
                                  setDockGeneratorField("side", side)
                                }
                                className={`rounded-lg border px-1.5 py-1 font-semibold ${dockGenerator.side === side ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                              >
                                {side === "north"
                                  ? "N"
                                  : side === "south"
                                    ? "S"
                                    : side === "west"
                                      ? "O"
                                      : "E"}
                              </button>
                            ),
                          )}
                        </div>
                        <button
                          onClick={applyDockStagingGenerator}
                          className="mt-2 w-full rounded-lg bg-emerald-500/90 px-2 py-1.5 text-[11px] font-semibold text-gray-950 hover:bg-emerald-400"
                        >
                          Generar dock + staging
                        </button>
                        <div className="mt-1.5 text-[10px] leading-snug text-emerald-100/60">
                          Crea puertas, staging, pallets, apron forklift y
                          flujos visibles como objetos editables.
                        </div>
                      </div>
                      <div className="mb-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-emerald-200">
                            <Package className="h-3.5 w-3.5" />{" "}
                            Supermarket/kitting
                          </div>
                          <span className="text-[10px] text-emerald-100/60">
                            param
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <DimInput
                            label="Lanes"
                            value={supermarketGenerator.lanes}
                            onChange={(v) =>
                              setSupermarketGeneratorField("lanes", v)
                            }
                          />
                          <DimInput
                            label="Carts"
                            value={supermarketGenerator.cartsPerLane}
                            onChange={(v) =>
                              setSupermarketGeneratorField("cartsPerLane", v)
                            }
                          />
                          <DimInput
                            label="Lane mm"
                            value={supermarketGenerator.laneLength}
                            onChange={(v) =>
                              setSupermarketGeneratorField("laneLength", v)
                            }
                          />
                          <DimInput
                            label="Width"
                            value={supermarketGenerator.laneWidth}
                            onChange={(v) =>
                              setSupermarketGeneratorField("laneWidth", v)
                            }
                          />
                          <DimInput
                            label="Cart W"
                            value={supermarketGenerator.cartWidth}
                            onChange={(v) =>
                              setSupermarketGeneratorField("cartWidth", v)
                            }
                          />
                          <DimInput
                            label="Aisle"
                            value={supermarketGenerator.aisleWidth}
                            onChange={(v) =>
                              setSupermarketGeneratorField("aisleWidth", v)
                            }
                          />
                          <label className="block">
                            <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">
                              Prefijo
                            </span>
                            <input
                              value={supermarketGenerator.labelPrefix}
                              onChange={(e) =>
                                setSupermarketGeneratorField(
                                  "labelPrefix",
                                  e.target.value,
                                )
                              }
                              className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-emerald-300/60"
                            />
                          </label>
                          <DimInput
                            label="Cart D"
                            value={supermarketGenerator.cartDepth}
                            onChange={(v) =>
                              setSupermarketGeneratorField("cartDepth", v)
                            }
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                          {(["horizontal", "vertical"] as const).map(
                            (orientation) => (
                              <button
                                key={orientation}
                                onClick={() =>
                                  setSupermarketGeneratorField(
                                    "orientation",
                                    orientation,
                                  )
                                }
                                className={`rounded-lg border px-2 py-1.5 font-semibold ${supermarketGenerator.orientation === orientation ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                              >
                                {orientation === "horizontal"
                                  ? "Horizontal"
                                  : "Vertical"}
                              </button>
                            ),
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                          <button
                            onClick={() =>
                              setSupermarketGeneratorField(
                                "includeEsdZone",
                                !supermarketGenerator.includeEsdZone,
                              )
                            }
                            className={`rounded-lg border px-2 py-1.5 text-left font-semibold ${supermarketGenerator.includeEsdZone ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                          >
                            ESD zone
                          </button>
                          <button
                            onClick={() =>
                              setSupermarketGeneratorField(
                                "includeQuarantine",
                                !supermarketGenerator.includeQuarantine,
                              )
                            }
                            className={`rounded-lg border px-2 py-1.5 text-left font-semibold ${supermarketGenerator.includeQuarantine ? "border-rose-300/40 bg-rose-400/15 text-rose-100" : "border-white/10 text-gray-400 hover:text-white"}`}
                          >
                            Quarantine
                          </button>
                        </div>
                        <button
                          onClick={applySupermarketGenerator}
                          className="mt-2 w-full rounded-lg bg-emerald-500/90 px-2 py-1.5 text-[11px] font-semibold text-gray-950 hover:bg-emerald-400"
                        >
                          Generar kitting editable
                        </button>
                        <div className="mt-1.5 text-[10px] leading-snug text-emerald-100/60">
                          Crea lanes kanban, carts, FIFO, line-side, ESD,
                          quarantine y flujos.
                        </div>
                      </div>
                      <div className="mb-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] p-2.5">
                        <div className="text-[10px] uppercase tracking-wide text-rose-200 mb-1.5">
                          Safety zones
                        </div>
                        <p className="mb-2 text-[10.5px] leading-snug text-rose-100/70">
                          Crea zonas y rutas editables en Safety. Validacion
                          detecta bloqueos, invasiones y objetos sin
                          clasificacion ESD.
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => createSafetyZoneAsset("no-go")}
                            className="rounded-lg border border-rose-300/20 bg-rose-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-rose-100 hover:bg-rose-400/[0.16]"
                          >
                            No-go zone
                          </button>
                          <button
                            onClick={() => createSafetyZoneAsset("restricted")}
                            className="rounded-lg border border-amber-300/20 bg-amber-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-amber-100 hover:bg-amber-400/[0.16]"
                          >
                            Restricted
                          </button>
                          <button
                            onClick={() => createSafetyZoneAsset("esd")}
                            className="rounded-lg border border-cyan-300/20 bg-cyan-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/[0.16]"
                          >
                            ESD zone
                          </button>
                          <button
                            onClick={() => createSafetyPathAsset("forklift")}
                            className="rounded-lg border border-emerald-300/20 bg-emerald-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/[0.16]"
                          >
                            Forklift path
                          </button>
                          <button
                            onClick={() => createSafetyPathAsset("emergency")}
                            className="rounded-lg border border-sky-300/20 bg-sky-400/[0.10] px-2 py-1.5 text-left text-[11px] font-semibold text-sky-100 hover:bg-sky-400/[0.16]"
                          >
                            Emergency exit
                          </button>
                        </div>
                      </div>
                      <div className="mb-2 rounded-lg border border-violet-300/20 bg-violet-400/[0.06] p-2">
                        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-violet-200/80">
                          Industry Packs
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {INDUSTRY_REGISTRY.listObjects().map((obj) => (
                            <button
                              key={obj.id}
                              onClick={() => addIndustryObject(obj.id)}
                              title={`Agregar ${obj.label}`}
                              className="rounded-lg bg-violet-400/[0.10] px-2 py-1.5 text-left text-[11px] text-violet-100 hover:bg-violet-400/[0.16]"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold">
                                  {obj.label}
                                </span>
                                <span className="shrink-0 text-[10px] text-violet-200/70">
                                  {obj.industry}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-violet-200/70">
                                objeto inteligente · {obj.category}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Biblioteca CAD universal
                        </div>
                        <span className="text-[10px] text-gray-500">
                          {filteredSymbols.length}/{CAD_SYMBOL_LIBRARY.length}
                        </span>
                      </div>
                      <input
                        value={symbolSearch}
                        onChange={(e) => setSymbolSearch(e.target.value)}
                        placeholder="Buscar SMT, AOI, safety…"
                        className="mb-2 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/60"
                      />
                      <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                        {symbolCategories.map((category) => (
                          <button
                            key={category}
                            onClick={() => setSymbolCategory(category)}
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${symbolCategory === category ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-gray-500 dark:text-gray-400 hover:text-white"}`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 mb-3">
                        {filteredSymbols.map((symbol) => (
                          <button
                            key={symbol.id}
                            onClick={() => addCadSymbol(symbol.id)}
                            title={`Agregar ${symbol.label}`}
                            className="rounded-lg bg-cyan-400/[0.08] px-2 py-1.5 text-left text-[11px] text-cyan-100 hover:bg-cyan-400/[0.14]"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold">
                                {symbol.label}
                              </span>
                              <span className="shrink-0 text-[10px] text-cyan-200/70">
                                {Math.round(symbol.defaultWidth)}×
                                {Math.round(symbol.defaultHeight)}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-cyan-200/70">
                              {symbol.category} · {symbol.layer} ·{" "}
                              {symbol.tags.join(", ")}
                            </span>
                          </button>
                        ))}
                        {filteredSymbols.length === 0 && (
                          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 text-center text-[11px] text-gray-500">
                            Sin símbolos para ese filtro.
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                        Agregar equipo
                      </div>
                      {ASSET_CATEGORIES.map((cat) => (
                        <div key={cat.category} className="mb-3">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" /> {cat.label}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {cat.items.map((it) => (
                              <button
                                key={it.kind}
                                onClick={() => addAsset(it.kind)}
                                title={`Agregar ${it.label}`}
                                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.10] text-[12px] transition-colors"
                              >
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                  style={{ background: it.color }}
                                />
                                <span className="truncate">{it.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 3D viewport */}
          <div
            data-testid="cad-canvas"
            className="relative min-w-0 flex-1 overflow-hidden"
            onContextMenu={handleCadContextMenu}
            onPointerDown={() => setCadContextMenu(null)}
          >
            <div ref={mountRef} className="absolute inset-0" />
            {webglUnavailable && (
              <div
                data-testid="cad-webgl-unavailable"
                role="status"
                // El aviso es un TELÓN, no una capa modal: sólo rellena el
                // viewport que no se puede pintar. A `z-30` quedaba por encima
                // de la barra de dibujo (`z-20`) y se comía todos sus clics, así
                // que sin WebGL el usuario veía las herramientas pero no podía
                // usar ninguna. Va por debajo de los controles flotantes y no
                // captura puntero: no tiene nada con lo que interactuar.
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1e] p-6 text-center"
              >
                <div className="max-w-md space-y-2">
                  <p className="text-sm font-medium text-white">
                    Este navegador no puede mostrar el viewport 3D
                  </p>
                  <p className="text-[12px] leading-relaxed text-white/70">
                    Valle Design necesita WebGL para dibujar en pantalla. El
                    documento, las capas, las propiedades y el guardado siguen
                    funcionando, pero no verás la geometría hasta que actives
                    WebGL o uses un navegador con aceleración disponible.
                  </p>
                </div>
              </div>
            )}
            <div
              ref={crosshairOverlayRef}
              data-testid="cad-crosshair"
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 z-20 hidden size-0"
            >
              <span
                className="absolute left-1/2 top-1/2 h-px -translate-x-1/2 -translate-y-1/2 bg-cyan-100/90 mix-blend-difference"
                style={{ width: `${workspacePreferences.crosshairPercent}%` }}
              />
              <span
                className="absolute left-1/2 top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-cyan-100/90 mix-blend-difference"
                style={{ height: `${workspacePreferences.crosshairPercent}%` }}
              />
              <span
                data-testid="cad-pick-box"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-cyan-100/90 mix-blend-difference"
                style={{
                  width: workspacePreferences.pickBoxPx,
                  height: workspacePreferences.pickBoxPx,
                }}
              />
              <span
                data-testid="cad-snap-aperture"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-amber-300/60"
                style={{
                  width: workspacePreferences.aperturePx * 2,
                  height: workspacePreferences.aperturePx * 2,
                }}
              />
            </div>
            {cadContextMenu && (
              <div
                data-testid="cad-context-menu"
                role="menu"
                className="absolute z-50 w-44 overflow-hidden rounded-xl border border-white/15 bg-gray-950/95 p-1.5 text-[11px] text-gray-200 shadow-2xl backdrop-blur"
                style={{ left: cadContextMenu.x, top: cadContextMenu.y }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    repeatLastCommand();
                    setCadContextMenu(null);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                >
                  Repetir último comando
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    commitActiveDraftCommand();
                    setCadContextMenu(null);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                >
                  Enter / terminar
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    selectAll();
                    setCadContextMenu(null);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                >
                  Seleccionar todo
                </button>
                <button
                  role="menuitem"
                  disabled={
                    selList.length === 0 && nativeSelectionIds.length === 0
                  }
                  onClick={() => {
                    if (nativeSelectionIds.length) removeNativeSelection();
                    else removeSelected();
                    setCadContextMenu(null);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-rose-200 hover:bg-rose-400/10 disabled:opacity-40"
                >
                  Eliminar selección
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    closeProfessionalDocks();
                    updateWorkspacePreferences({
                      ...workspacePreferencesRef.current,
                      rightDock: true,
                    });
                    setCadContextMenu(null);
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                >
                  Mostrar propiedades
                </button>
              </div>
            )}
            {recoveryCandidate && (
              <div
                data-testid="cad-recovery-panel"
                data-divergent={recoveryDivergent ? "true" : "false"}
                data-base-version={recoveryCandidate.baseCadDocumentVersion}
                className={`absolute left-3 top-16 z-30 w-80 rounded-2xl border bg-gray-950/95 p-3 shadow-2xl backdrop-blur ${
                  recoveryDivergent
                    ? "border-orange-400/40"
                    : "border-amber-300/30"
                }`}
              >
                <div className="flex items-start gap-2">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-amber-100">
                      {recoveryDivergent
                        ? "Rama local divergente"
                        : "Borrador local recuperable"}
                    </div>
                    <div className="mt-1 text-[10.5px] leading-snug text-gray-400">
                      Guardado automáticamente{" "}
                      {new Date(recoveryCandidate.savedAt).toLocaleString()} en
                      este tenant, usuario y workspace.
                    </div>
                    {recoveryDivergent && (
                      // Antes este borrador se BORRABA sin preguntar en cuanto
                      // el servidor avanzaba. Ahora se ofrece diciendo lo que
                      // es: trabajo local sobre una versión ya superada.
                      <div className="mt-1 text-[10.5px] leading-snug text-orange-200">
                        Parte de la v
                        {recoveryCandidate.baseCadDocumentVersion} y el servidor
                        ya va por la v{data?.cadDocumentVersion ?? 0}: otra
                        sesión guardó mientras tanto. Al restaurarlo y guardar
                        tendrás que decidir qué pasa con lo que ella escribió.
                      </div>
                    )}
                    {recoveryCandidate.format !== "legacy-object" && (
                      <div className="mt-1 text-[10px] text-sky-200/80">
                        Journal #{recoveryCandidate.journalSequence} ·{" "}
                        {(recoveryCandidate.storedBytes / 1_000_000).toFixed(2)}{" "}
                        MB local · {recoveryCandidate.format} ·{" "}
                        {recoveryCandidate.encoder ?? "legacy"}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        data-testid="cad-recovery-restore"
                        onClick={restoreRecoveryCandidate}
                        className="rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-semibold text-gray-950 hover:bg-amber-300"
                      >
                        Restaurar
                      </button>
                      <button
                        data-testid="cad-recovery-discard"
                        onClick={discardRecoveryCandidate}
                        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {showMinimap && workspacePreferences.minimap && (
              <PlantMinimap
                ctxRef={ctxRef}
                placementsRef={placementsRef}
                assetsRef={assetsRef}
                cameraRef={cameraRef}
                controlsRef={controlsRef}
              />
            )}
            <ScaleBar
              ctxRef={ctxRef}
              cameraRef={cameraRef}
              controlsRef={controlsRef}
              mountRef={mountRef}
              unit={(data?.footprint.unit ?? "mm") as WorldUnit}
            />
            <CadOverlayLegends heat={showHeat} gaps={showGaps} />
            {(dxfWarnings.length > 0 || dxfImportPreview) && (
              <div className="absolute right-3 top-16 z-20 w-80 rounded-2xl border border-amber-400/20 bg-gray-950/90 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-amber-100">
                    <CircleAlert className="h-4 w-4" />
                    Import DXF
                  </div>
                  <button
                    onClick={() => {
                      setDxfWarnings([]);
                      setDxfImportPreview(null);
                    }}
                    className="rounded-md px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    Ocultar
                  </button>
                </div>
                {dxfImportPreview && dxfPrimitiveSummary && (
                  <div className="mb-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-2 text-[11px] text-cyan-100">
                    {/* Soporte honesto de formatos (contrato D5): DXF nativo; DWG sólo con proveedor licenciado. */}
                    <div
                      className="mb-1 text-[10px] text-cyan-200/70"
                      title={DWG_UNAVAILABLE_REASON}
                    >
                      Formatos: DXF ✓ nativo · DWG ✕ requiere proveedor
                      licenciado
                    </div>
                    <div className="font-semibold">
                      {dxfImportPreview.primitives.length +
                        dxfImportPreview.hatches.length +
                        dxfImportPreview.mtexts.length +
                        dxfImportPreview.semanticDimensions.length +
                        dxfImportPreview.mleaders.length}{" "}
                      entidades soportadas ·{" "}
                      {dxfImportPreview.layers.length || 1} capa(s)
                    </div>
                    <div className="mt-1 text-cyan-100/75">
                      {Object.entries(dxfPrimitiveSummary)
                        .map(([kind, count]) => `${kind}: ${count}`)
                        .join(" · ")}
                    </div>
                    <button
                      onClick={convertDxfPrimitivesToEditable}
                      className="mt-2 w-full rounded-lg bg-cyan-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500"
                    >
                      Convertir entidades soportadas
                    </button>
                  </div>
                )}
                {dxfWarnings.length > 0 ? (
                  <>
                    <div className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                      Se cargó el plano; estas entidades se ignoraron o
                      simplificaron localmente.
                    </div>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {dxfWarningSummary.map((warning) => (
                        <div
                          key={warning.key}
                          className="rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2 text-amber-100">
                            <span className="truncate">{warning.message}</span>
                            <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5">
                              ×{warning.count}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-gray-500">
                            {warning.entityType ?? warning.code}
                            {warning.layer ? ` · capa ${warning.layer}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-gray-500">
                    Sin advertencias críticas en el escaneo local.
                  </div>
                )}
              </div>
            )}
            <div className="absolute bottom-3 right-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-gray-950/85 px-3 py-1.5 text-[11px] text-gray-300 shadow-xl backdrop-blur">
              <span className="text-cyan-200">Tool: {tool}</span>
              <span data-testid="cad-selection-status-count">
                {professionalSelection.current.length} sel
              </span>
              <span
                data-testid="cad-native-document-count"
                title="Entidades nativas en el documento canónico"
              >
                Native {nativeEntities.length}
              </span>
              {/* QUÉ pipeline dibuja y CUÁNTO lleva materializado. El benchmark
                  midió un camino que el producto no ejecutaba; publicarlo en el
                  DOM es lo que impide que vuelva a pasar sin que nadie lo note. */}
              <CadRenderPipelineBadge
                pipeline={renderPipelineRef.current}
                slot={renderPipelineSlotRef.current!}
              />
              {renderPipelineRef.current === "batched" && (
                <CadRenderPipelineStats slot={renderPipelineSlotRef.current!} />
              )}
              {/* La profundidad del historial es OBSERVABLE: una acción de
                  dibujo tiene que dejar exactamente una entrada, y una acción
                  rechazada ninguna. Sin esto, "el primer Undo no deshace nada"
                  sólo se nota a mano. */}
              <span
                data-testid="cad-history-depth"
                data-undo={hist.undo}
                data-redo={hist.redo}
                title="Profundidad de deshacer/rehacer"
              >
                U{hist.undo}/R{hist.redo}
              </span>
              {/* El indicador HEREDADO. Con el pipeline por lotes lo sirve
                  `CadRenderPipelineStats` con las cifras del índice de tiles;
                  aquí se apaga para que el `data-testid` no salga dos veces. */}
              {renderPipelineRef.current !== "batched" &&
                nativeRenderStats.omitted > 0 && (
                <span
                  data-testid="cad-native-render-stats"
                  data-total={nativeRenderStats.total}
                  data-visible={nativeRenderStats.visible}
                  data-rendered={nativeRenderStats.rendered}
                  data-batching={nativeRenderStats.batching ? "true" : "false"}
                  className="text-amber-300"
                  title={`${nativeRenderStats.visible.toLocaleString()} entidades en bounds visibles; ${nativeRenderStats.omitted.toLocaleString()} permanecen sólo en overview/canónico`}
                >
                  Viewport {nativeRenderStats.rendered.toLocaleString()}/
                  {nativeRenderStats.visible.toLocaleString()} visibles ·{" "}
                  {nativeRenderStats.total.toLocaleString()} total
                  {nativeRenderStats.batching ? " · cargando…" : ""}
                </span>
              )}
              <span>{data?.footprint.unit ?? "mm"}</span>
              <span
                ref={cursorCoordinateRef}
                data-testid="cad-cursor-coordinate"
                data-x=""
                data-y=""
                className="font-mono tabular-nums"
                title="Coordenadas del cursor en el dibujo"
              >
                X — · Y —
              </span>
              <span title="Modelo, revisión funcional y versión CAS">
                {model} · {revision} · v{data?.cadDocumentVersion ?? 0}
              </span>
              <span
                data-testid="cad-save-status"
                className={
                  saving
                    ? "text-cyan-200"
                    : saveIssue
                      ? "text-rose-300"
                      : dirty
                        ? "text-amber-300"
                        : "text-emerald-300"
                }
                title={saveIssue?.message}
              >
                {saving
                  ? "Guardando…"
                  : saveIssue?.kind === "conflict"
                    ? cadConflictIncidentLabel({
                        documentId: documentId ?? "",
                        baseVersion: 0,
                        serverVersion: saveIssue.serverVersion ?? null,
                      })
                    : saveIssue?.kind === "offline"
                      ? "Sin conexión · cambios pendientes"
                      : saveIssue
                        ? "Error de guardado · cambios pendientes"
                        : dirty || saveStatus === "scheduled"
                          ? "Modificado · autosave pendiente"
                          : "Guardado"}
              </span>
              {dirty && recoverySavedAt && (
                <span className="text-sky-300" title={recoverySavedAt}>
                  Recovery local activo
                </span>
              )}
              {dirty && recoveryWarning && (
                <span className="text-rose-300" title={recoveryWarning}>
                  Recovery local en riesgo
                </span>
              )}
              <span
                className={
                  connectionState === "online"
                    ? "text-emerald-300"
                    : connectionState === "offline"
                      ? "text-rose-300"
                      : "text-gray-400"
                }
              >
                {connectionState === "online"
                  ? "API online"
                  : connectionState === "offline"
                    ? "API offline"
                    : "API…"}
              </span>
              <span>
                Layer{" "}
                {cadLayers.find((layer) => layer.id === activeCadLayer)
                  ?.label ?? activeCadLayer}
              </span>
              {cadLayerSummary.hiddenObjectCount > 0 && (
                <span className="text-amber-300">
                  Hidden layer objs {cadLayerSummary.hiddenObjectCount}
                </span>
              )}
              {cadLayerSummary.lockedObjectCount > 0 && (
                <span className="text-amber-300">
                  Locked layer objs {cadLayerSummary.lockedObjectCount}
                </span>
              )}
              <span>
                Grilla {layers.grid ? "on" : "off"} / Snap{" "}
                {snap ? "grid" : "free"}
              </span>
              <CadDraftStatusBar
                settings={draftSettings}
                polarIncrements={CAD_POLAR_INCREMENTS}
                onToggleOsnap={draftSettingsHost.toggleOsnap}
                onToggleOrtho={draftSettingsHost.toggleOrtho}
                onTogglePolar={draftSettingsHost.togglePolar}
                onPolarIncrement={draftSettingsHost.setPolarIncrement}
                onToggleObjectSnapTracking={draftSettingsHost.toggleObjectSnapTracking}
                onClearTracking={draftSettingsHost.clearTrackingPoints}
                onOpenSettings={paletteHost.toggleDraftSettings}
                onOpenStyles={paletteHost.toggleStyles}
              />
              <button
                onClick={openChecks}
                className={`${releaseTone} hover:text-white`}
              >
                Release {releaseState}
              </button>
              {report && (
                <span
                  className={
                    report.score === "error"
                      ? "text-rose-300"
                      : report.score === "warn"
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }
                >
                  Validación {report.score}
                </span>
              )}
              {cadValidationReport && (
                <span
                  className={
                    cadValidationReport.severity === "critical"
                      ? "text-rose-300"
                      : cadValidationReport.severity === "warning"
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }
                >
                  CAD {cadValidationReport.severity}
                </span>
              )}
              {flowHealth && (
                <span
                  className={
                    flowHealth.score >= 80
                      ? "text-emerald-300"
                      : flowHealth.score >= 55
                        ? "text-amber-300"
                        : "text-rose-300"
                  }
                >
                  Flow {flowHealth.score}
                </span>
              )}
              {clearanceIssues.length > 0 && (
                <span className="text-amber-300">
                  Clearance {clearanceIssues.length}
                </span>
              )}
              {safetyIssues.length > 0 && (
                <span className="text-amber-300">
                  Safety {safetyIssues.length}
                </span>
              )}
              {validationHighlightIds.size > 0 && (
                <button
                  onClick={clearValidationHighlights}
                  className="text-rose-300 hover:text-white"
                >
                  Highlights {validationHighlightIds.size}
                </button>
              )}
              {dxfWarnings.length > 0 && (
                <span className="text-amber-300">DXF {dxfWarnings.length}</span>
              )}
              {localSnapshots.snapshots.length > 0 && (
                <span>Snapshots {localSnapshots.snapshots.length}</span>
              )}
            </div>
            {hatchPickMode && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-violet-600/95 px-3 py-1.5 text-[12px] font-semibold text-white">
                HATCH {hatchPickSolid ? "SOLID" : "ANSI31"} · clic dentro de una
                región cerrada · islands {hatchIslandStyle}
              </div>
            )}
            {walk && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-emerald-700/95 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 pointer-events-none">
                <PersonStanding className="w-3.5 h-3.5" /> Recorrido · arrastra
                para mirar · WASD para caminar · Esc para salir
              </div>
            )}
            {!walk &&
              (tool === "measure" ||
                tool === "wall" ||
                isCadDrawTool(tool)) && (
                <CadViewportPrompt
                  kind={
                    tool === "measure"
                      ? "measure"
                      : isCadDrawTool(tool)
                        ? "draw"
                        : "wall"
                  }
                  live={measureLive || enginePromptText || drawPrompt}
                  snapLabelRef={engineSnapLabelRef}
                />
              )}
            {!walk && (tool === "wall" || isCadDrawTool(tool)) && (
              <CadDraftToolbar
                orthoLock={draftSettings.ortho}
                onToggleOrtho={() => draftSettingsHost.toggleOrtho()}
                dynamicInputKey={`${dynamicInputKind}:${dynamicAnchor ? "anchored" : "origin"}`}
                dynamicInput={{
                  kind: dynamicInputKind,
                  anchor: dynamicAnchor,
                  documentUnit: data?.footprint.unit === "m" ? "m" : "mm",
                  locale: "es-MX",
                  defaults: dynamicInputDefaults,
                  onCommit: commitDynamicInput,
                  onCancel: () => {
                    setPrecisionText("");
                    endDraw();
                    setTool("select");
                    toolRef.current = "select";
                  },
                }}
                chaining={
                  engineCommand === "LINE" ||
                  engineCommand === "PLINE" ||
                  activeDynamicCommand?.id === "line" ||
                  activeDynamicCommand?.id === "polyline"
                }
                canClose={
                  engineCommand
                    ? engineCanClose
                    : activeDynamicCommand?.id === "polyline" &&
                      canCloseDraftPolyline
                }
                onFinish={commitActiveDraftCommand}
                onClose={closeActiveDraftPolyline}
              />
            )}
            {mtextEditorOpen && (
              <CadMTextEditor
                initial={editingMText}
                defaultInsertion={mtextDefaultInsertion}
                defaultLayer={activeCadLayer}
                defaultHeight={Math.max(1, data.footprint.gridSize || 100)}
                textStyles={
                  loadedCadDocumentRef.current?.styles.text ?? {
                    Standard: { fontFamily: "Arial", height: 120 },
                  }
                }
                onSave={saveMTextDraft}
                onCancel={() => {
                  setEditingMTextId(null);
                  setMTextEditorOpen(false);
                }}
              />
            )}
            {/*
              La línea de comandos. No se enfoca sola: robarle el teclado al
              lienzo rompería Supr, Ctrl+Z y las teclas de captura, que es
              exactamente el reproche que se le hace al copiloto de lenguaje
              natural. Se pulsa y se escribe.
            */}
            {/* El envoltorio lleva `pointer-events-none`: flota sobre la barra
                inferior y, con el diálogo lleno, tapaba Undo. Los controles del
                muelle reactivan el ratón por su cuenta. */}
            {!walk && (
              <div className="pointer-events-none absolute bottom-14 left-3 z-30 w-[min(30rem,42vw)]">
                <CadCommandLineDock
                  host={commandEngine}
                  disabled={drawingReadOnly}
                />
              </div>
            )}
            <CadViewportHint
              kind={
                walk
                  ? "walk"
                  : tool === "measure"
                    ? "measure"
                    : tool === "wall"
                      ? "wall"
                      : isCadDrawTool(tool)
                        ? "draw"
                        : "select"
              }
            />
            {visionPreview && (
              <div className="absolute top-3 right-3 z-30 w-[20rem] rounded-2xl border border-violet-400/25 bg-gray-950/95 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                  <ScanEye className="h-3.5 w-3.5" /> Visión ·{" "}
                  {visionPreview.imageName}
                </div>
                <div className="mt-2 rounded-xl bg-white/[0.04] px-2.5 py-2 text-[12px] text-gray-200">
                  {visionPreview.walls.length} muro(s) y{" "}
                  {visionPreview.zones.length} zona(s) detectados
                  {visionPreview.unitHint
                    ? ` · unidad sugerida ${visionPreview.unitHint}`
                    : ""}
                  .
                </div>
                {visionPreview.errors.slice(0, 3).map((err) => (
                  <div key={err} className="mt-1 text-[10.5px] text-amber-300">
                    Descartado: {err}
                  </div>
                ))}
                <p className="mt-2 text-[10.5px] leading-snug text-gray-500">
                  Se insertan como muros/zonas EDITABLES escalados a la huella
                  actual — revisa y ajusta después de insertar.
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={applyVisionResult}
                    className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-600"
                  >
                    Insertar{" "}
                    {visionPreview.walls.length + visionPreview.zones.length}
                  </button>
                  <button
                    onClick={() => setVisionPreview(null)}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
            {showPalette && (
              <div className="absolute top-3 right-3 z-30 w-[22rem] rounded-2xl border border-cyan-400/20 bg-gray-950/95 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                  <Search className="h-4 w-4 text-cyan-200" />
                  <input
                    autoFocus
                    value={paletteQuery}
                    onChange={(e) => setPaletteQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setShowPalette(false);
                        setPaletteQuery("");
                      }
                    }}
                    placeholder="Buscar comando, herramienta o símbolo..."
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-gray-500 outline-none"
                  />
                  <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-500">
                    Ctrl K
                  </span>
                </div>
                {recentPaletteActions.length > 0 && !paletteQuery.trim() && (
                  <div className="mt-2 flex flex-wrap gap-1 border-b border-white/10 pb-2">
                    <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-gray-500">
                      Recientes
                    </span>
                    {recentPaletteActions.map((key) => {
                      const [, id] = key.split(":");
                      return (
                        <span
                          key={key}
                          className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400"
                        >
                          {id}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2 max-h-80 overflow-y-auto space-y-1">
                  {paletteResults.map((entry) => (
                    <button
                      key={`${entry.kind}-${entry.id}`}
                      onClick={() => runPaletteEntry(entry)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.07]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white">
                          {entry.label}
                        </span>
                        <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {entry.description}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                          {entry.kind}
                        </span>
                        {entry.shortcut && (
                          <span className="mt-1 block text-[10px] text-gray-500">
                            {entry.shortcut}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  {paletteResults.length === 0 && (
                    <div className="px-2 py-6 text-center text-[12px] text-gray-500">
                      Sin resultados CAD.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div
              data-testid="cad-toolbar"
              className="absolute top-3 left-3 z-20 rounded-2xl border border-white/10 bg-gray-900/85 p-1.5 shadow-2xl backdrop-blur"
            >
              <div className="grid grid-cols-1 gap-1">
                {CAD_TOOLBAR_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    data-cad-readonly-allowed={
                      READ_ONLY_TOOLBAR_ACTION_IDS.has(action.id) || undefined
                    }
                    disabled={
                      drawingReadOnly &&
                      !READ_ONLY_TOOLBAR_ACTION_IDS.has(action.id)
                    }
                    onClick={() => runToolbarAction(action.id)}
                    title={`${action.label}${action.shortcut ? ` · ${action.shortcut}` : ""} — ${action.description}`}
                    className={`h-7 min-w-9 rounded-lg px-2 text-[10.5px] font-semibold transition-colors ${tool === action.id || (action.id === "select" && tool === "select") ? "bg-cyan-500 text-white" : "bg-white/[0.05] text-gray-300 hover:bg-white/[0.12] hover:text-white"}`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
            {overlay && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-gray-900/85 backdrop-blur border border-white/10 text-[11px] text-gray-200 flex items-center gap-3 pointer-events-none">
                <span className="font-medium">
                  {OVERLAY_DEFS.find((o) => o.key === overlay)?.label}
                </span>
                {OVERLAY_DEFS.find((o) => o.key === overlay)?.legend.map(
                  (l) => (
                    <span
                      key={l.label}
                      className="inline-flex items-center gap-1"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: l.hex }}
                      />
                      {l.label}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>

          {/* right: propiedades. En tableta sólo aparece si el usuario ABRIÓ una
              paleta profesional: 256 px permanentes son la cuarta parte del
              plano en una pantalla de 1024, y una paleta pedida a mano sí se
              gana su sitio mientras dura. */}
          <div
            data-testid="cad-right-dock"
            className={`${activeProfessionalDock ? "w-[min(560px,42vw)] overflow-hidden" : "w-64 overflow-y-auto max-[1100px]:hidden"} shrink-0 border-l border-white/10 bg-gray-900/95 text-white ${focusMode || (!workspacePreferences.rightDock && !activeProfessionalDock) ? "hidden" : ""}`}
          >
            {activeProfessionalDock ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
                  <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-cyan-100">
                    <Settings2 className="h-3.5 w-3.5" />
                    {professionalDockTitle}
                  </div>
                  <button
                    aria-label="Cerrar panel profesional"
                    onClick={closeProfessionalDocks}
                    className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {professionalDockContent}
                </div>
              </div>
            ) : (
              <>
                {nativeSelectedEntities.length > 0 ? (
                  <div className="p-3.5" data-testid="cad-native-properties">
                    <div className="mb-1 flex items-center gap-2">
                      <Spline className="h-4 w-4 text-cyan-300" />
                      <span className="text-sm font-semibold">
                        {primaryNativeEntity
                          ? primaryNativeEntity.type.toUpperCase()
                          : `${nativeSelectedEntities.length} curvas nativas`}
                      </span>
                    </div>
                    <div className="mb-3 text-[11px] text-gray-500 dark:text-gray-400">
                      Geometría canónica · selección, grips, snaps y DXF sin
                      aproximación persistida.
                    </div>
                    {selectedNativeLineIds ? (
                      <div className="space-y-2">
                        <div
                          data-testid="cad-line-edit-control"
                          className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3"
                        >
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                            TRIM / EXTEND · LINE o ARC contra LINE, CIRCLE, ARC o PLINE
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <select
                              data-testid="cad-line-edit-operation"
                              value={lineEditOperation}
                              onChange={(event) =>
                                setLineEditOperation(
                                  event.target.value as "trim" | "extend",
                                )
                              }
                              className="rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[11px] text-white"
                            >
                              <option value="trim">TRIM</option>
                              <option value="extend">EXTEND</option>
                            </select>
                            <select
                              data-testid="cad-line-edit-target"
                              value={
                                selectedNativeLineIds.includes(lineEditTargetId)
                                  ? lineEditTargetId
                                  : selectedNativeLineIds[0]
                              }
                              onChange={(event) =>
                                setLineEditTargetId(event.target.value)
                              }
                              className="rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[11px] text-white"
                            >
                              {selectedNativeLineIds.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                            <select
                              data-testid="cad-line-edit-endpoint"
                              value={lineEditEndpoint}
                              onChange={(event) =>
                                setLineEditEndpoint(
                                  event.target.value as CadLineEndpoint,
                                )
                              }
                              className="rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[11px] text-white"
                            >
                              <option value="start">Start</option>
                              <option value="end">End</option>
                            </select>
                          </div>
                          <button
                            data-testid="cad-line-edit-apply"
                            disabled={drawingReadOnly}
                            onClick={() =>
                              editNativeLines(selectedNativeLineIds)
                            }
                            className="mt-2 w-full rounded-lg bg-cyan-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-400 disabled:opacity-40"
                          >
                            Aplicar {lineEditOperation.toUpperCase()}
                          </button>
                        </div>
                        {selectedNativeCornerLineIds ? (
                        <div
                          data-testid="cad-fillet-control"
                          className="rounded-xl border border-violet-400/20 bg-violet-400/[0.07] p-3"
                        >
                          <div className="text-[10px] uppercase tracking-wide text-violet-200">
                            FILLET · 2 LINE
                          </div>
                          <p className="mt-1 text-[10.5px] text-gray-400">
                            Recorta ambas líneas y crea un ARC tangente en una
                            sola operación reversible.
                          </p>
                          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                            <label className="text-[10px] text-gray-500">
                              Radio
                              <input
                                data-testid="cad-fillet-radius"
                                type="number"
                                min="0.000001"
                                value={filletRadius}
                                onChange={(event) =>
                                  setFilletRadius(
                                    Math.max(
                                      0.000001,
                                      Number(event.target.value) || 0.000001,
                                    ),
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none focus:ring-1 focus:ring-violet-400/50"
                              />
                            </label>
                            <button
                              data-testid="cad-fillet-apply"
                              disabled={drawingReadOnly}
                              onClick={() =>
                                filletNativeLines(selectedNativeCornerLineIds)
                              }
                              className="self-end rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-400 disabled:opacity-40"
                            >
                              Aplicar FILLET
                            </button>
                          </div>
                        </div>
                        ) : null}
                        {selectedNativeCornerLineIds ? (
                        <div
                          data-testid="cad-chamfer-control"
                          className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-3"
                        >
                          <div className="text-[10px] uppercase tracking-wide text-amber-200">
                            CHAMFER · 2 LINE
                          </div>
                          <p className="mt-1 text-[10.5px] text-gray-400">
                            Recorta ambas líneas y las une con un tramo recto.
                            Distancias distintas dan un chaflán asimétrico.
                          </p>
                          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                            <label className="text-[10px] text-gray-500">
                              Distancia 1
                              <input
                                data-testid="cad-chamfer-distance-a"
                                type="number"
                                min="0.000001"
                                value={chamferDistanceA}
                                onChange={(event) =>
                                  setChamferDistanceA(
                                    Math.max(
                                      0.000001,
                                      Number(event.target.value) || 0.000001,
                                    ),
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none focus:ring-1 focus:ring-amber-400/50"
                              />
                            </label>
                            <label className="text-[10px] text-gray-500">
                              Distancia 2
                              <input
                                data-testid="cad-chamfer-distance-b"
                                type="number"
                                min="0.000001"
                                value={chamferDistanceB}
                                onChange={(event) =>
                                  setChamferDistanceB(
                                    Math.max(
                                      0.000001,
                                      Number(event.target.value) || 0.000001,
                                    ),
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none focus:ring-1 focus:ring-amber-400/50"
                              />
                            </label>
                            <button
                              data-testid="cad-chamfer-apply"
                              disabled={drawingReadOnly}
                              onClick={() =>
                                chamferNativeLines(selectedNativeCornerLineIds)
                              }
                              className="self-end rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
                            >
                              Aplicar CHAMFER
                            </button>
                          </div>
                        </div>
                        ) : null}
                      </div>
                    ) : null}
                    <CadEntityPropertiesPanel
                      entities={nativeSelectedEntities}
                      document={loadedCadDocumentRef.current}
                      revision={nativeDocumentRevision}
                      readOnly={drawingReadOnly}
                      onEdit={editNativeProperty}
                    />
                    <div className="mb-2 grid grid-cols-3 gap-1.5">
                      <button
                        data-testid="cad-native-move-x"
                        onClick={() =>
                          transformNativeSelection({
                            translation: {
                              x: data.footprint.gridSize || 1,
                              y: 0,
                            },
                          })
                        }
                        className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                      >
                        Mover +X
                      </button>
                      <button
                        data-testid="cad-native-rotate"
                        onClick={() =>
                          transformNativeSelection({
                            rotationDeg: 15,
                            origin: primaryNativeBounds
                              ? {
                                  x:
                                    (primaryNativeBounds.minX +
                                      primaryNativeBounds.maxX) /
                                    2,
                                  y:
                                    (primaryNativeBounds.minY +
                                      primaryNativeBounds.maxY) /
                                    2,
                                }
                              : undefined,
                          })
                        }
                        className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                      >
                        Rotar +15°
                      </button>
                      <button
                        data-testid="cad-native-scale"
                        onClick={() =>
                          transformNativeSelection({
                            scale: 1.1,
                            origin: primaryNativeBounds
                              ? {
                                  x:
                                    (primaryNativeBounds.minX +
                                      primaryNativeBounds.maxX) /
                                    2,
                                  y:
                                    (primaryNativeBounds.minY +
                                      primaryNativeBounds.maxY) /
                                    2,
                                }
                              : undefined,
                          })
                        }
                        className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                      >
                        Escala 110%
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        data-testid="cad-native-copy"
                        onClick={copyNativeSelection}
                        className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[12px] hover:bg-white/[0.12]"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </button>
                      <button
                        data-testid="cad-native-delete"
                        onClick={removeNativeSelection}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-1 text-[12px] text-rose-300 hover:bg-rose-500/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Quitar
                      </button>
                      <button
                        onClick={clearNativeSelection}
                        className="rounded-md bg-white/[0.06] px-2 py-1 text-[12px] hover:bg-white/[0.12]"
                      >
                        Deseleccionar
                      </button>
                    </div>
                    {primaryNativeEntity?.type === "hatch" && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-violet-400/15 bg-violet-400/[0.05] p-2 text-[10.5px]">
                        <span
                          className={
                            primaryNativeEntity.associationStatus === "broken"
                              ? "text-rose-300"
                              : "text-violet-200"
                          }
                        >
                          {primaryNativeEntity.associationStatus ??
                            (primaryNativeEntity.associative
                              ? "associated"
                              : "detached")}
                        </span>
                        <span className="text-gray-500">
                          {primaryNativeEntity.boundaryRefs?.length ?? 0} refs
                        </span>
                        <button
                          data-testid="cad-hatch-reassociate"
                          onClick={() =>
                            commitNativeCommands([
                              {
                                type: "hatch-association",
                                entityId: primaryNativeEntity.id,
                                associative: true,
                              },
                            ])
                          }
                          className="ml-auto rounded bg-violet-500/20 px-2 py-1 text-violet-100 hover:bg-violet-500/30"
                        >
                          Reasociar
                        </button>
                        <button
                          data-testid="cad-hatch-detach"
                          onClick={() =>
                            commitNativeCommands([
                              {
                                type: "hatch-association",
                                entityId: primaryNativeEntity.id,
                                associative: false,
                              },
                            ])
                          }
                          className="rounded bg-white/[0.06] px-2 py-1 text-gray-300 hover:bg-white/[0.12]"
                        >
                          Desasociar
                        </button>
                      </div>
                    )}
                    {primaryNativeEntity?.type === "mtext" && (
                      <button
                        data-testid="cad-mtext-edit"
                        onClick={() => openMTextEditor(primaryNativeEntity.id)}
                        className="mt-2 w-full rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/[0.14]"
                      >
                        Editar contenido y formato MTEXT
                      </button>
                    )}
                    {primaryNativeEntity?.type === "dimension" &&
                      primaryNativeEntity.dimensionKind && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] p-2 text-[10.5px]">
                          <span
                            className={
                              primaryNativeEntity.associationStatus === "broken"
                                ? "text-rose-300"
                                : "text-emerald-200"
                            }
                          >
                            {primaryNativeEntity.associationStatus ??
                              (primaryNativeEntity.associative
                                ? "associated"
                                : "detached")}
                          </span>
                          <span className="text-gray-500">
                            {primaryNativeEntity.references?.length ?? 0} refs
                          </span>
                          <button
                            data-testid="cad-dimension-reassociate"
                            onClick={() =>
                              commitNativeCommands([
                                {
                                  type: "dimension-association",
                                  entityId: primaryNativeEntity.id,
                                  associative: true,
                                },
                              ])
                            }
                            className="ml-auto rounded bg-emerald-500/20 px-2 py-1 text-emerald-100 hover:bg-emerald-500/30"
                          >
                            Reasociar
                          </button>
                          <button
                            data-testid="cad-dimension-detach"
                            onClick={() =>
                              commitNativeCommands([
                                {
                                  type: "dimension-association",
                                  entityId: primaryNativeEntity.id,
                                  associative: false,
                                },
                              ])
                            }
                            className="rounded bg-white/[0.06] px-2 py-1 text-gray-300 hover:bg-white/[0.12]"
                          >
                            Desasociar
                          </button>
                        </div>
                      )}
                    {primaryNativeEntity?.type === "mleader" && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-sky-400/15 bg-sky-400/[0.05] p-2 text-[10.5px]">
                        <span
                          className={
                            primaryNativeEntity.associationStatus === "broken"
                              ? "text-rose-300"
                              : "text-sky-200"
                          }
                        >
                          {primaryNativeEntity.associationStatus ??
                            (primaryNativeEntity.associative
                              ? "associated"
                              : "detached")}
                        </span>
                        <span className="text-gray-500">
                          {primaryNativeEntity.references?.length ?? 0} refs ·{" "}
                          {primaryNativeEntity.leaderLines?.length ?? 1} leaders
                        </span>
                        <button
                          data-testid="cad-mleader-reassociate"
                          onClick={() =>
                            commitNativeCommands([
                              {
                                type: "mleader-association",
                                entityId: primaryNativeEntity.id,
                                associative: true,
                              },
                            ])
                          }
                          className="ml-auto rounded bg-sky-500/20 px-2 py-1 text-sky-100 hover:bg-sky-500/30"
                        >
                          Reasociar
                        </button>
                        <button
                          data-testid="cad-mleader-detach"
                          onClick={() =>
                            commitNativeCommands([
                              {
                                type: "mleader-association",
                                entityId: primaryNativeEntity.id,
                                associative: false,
                              },
                            ])
                          }
                          className="rounded bg-white/[0.06] px-2 py-1 text-gray-300 hover:bg-white/[0.12]"
                        >
                          Desasociar
                        </button>
                      </div>
                    )}
                  </div>
                ) : selList.length === 0 ? (
                  <div className="p-4 text-[12px] text-gray-500 flex flex-col gap-3">
                    <div className="flex flex-col items-center gap-2 pt-4">
                      <Crosshair className="w-6 h-6 text-gray-600" />
                      <p className="text-center">
                        Selecciona objetos para ver y editar sus propiedades.{" "}
                        <b>Shift</b>+clic agrega o quita.
                      </p>
                    </div>
                    {allNativeEntities.length > 0 && (
                      <div
                        className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-2.5"
                        data-testid="cad-native-entity-list"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-cyan-200">
                            Entidades nativas
                          </span>
                          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300">
                            {allNativeEntities.length}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {allNativeEntities.slice(0, 20).map((entity) => (
                            <button
                              key={entity.id}
                              data-testid={`cad-native-entity-${entity.id}`}
                              onClick={() => {
                                selectNative([entity.id]);
                                syncNativeScene();
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg bg-gray-950/45 px-2 py-1.5 text-left text-[11px] text-gray-200 hover:bg-white/[0.08]"
                            >
                              <span className="truncate">{entity.id}</span>
                              <span className="text-[10px] text-cyan-300">
                                {entity.type.toUpperCase()}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cyan-200">
                          <Ruler className="h-3.5 w-3.5" /> Cotas guardadas
                        </div>
                        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300">
                          {dimCount}
                        </span>
                      </div>
                      {measurementRowsView.length ? (
                        <div className="space-y-2">
                          {measurementRowsView.map((measurement) => (
                            <div
                              key={measurement.id}
                              className="rounded-lg border border-white/10 bg-gray-950/50 p-2"
                            >
                              <input
                                value={measurement.label}
                                onChange={(e) =>
                                  updateMeasurementText(
                                    measurement.id,
                                    e.target.value,
                                  )
                                }
                                onBlur={endFieldEdit}
                                className="mb-1 w-full rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-white outline-none focus:ring-1 focus:ring-cyan-500/40"
                              />
                              <div className="flex items-center justify-between gap-2 text-[10.5px] text-gray-500 dark:text-gray-400">
                                <span>{measurement.length}</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() =>
                                      focusMeasurement(measurement.id)
                                    }
                                    className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-500/20"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    onClick={() =>
                                      deleteMeasurement(measurement.id)
                                    }
                                    className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-200 hover:bg-rose-500/20"
                                  >
                                    Borrar
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] leading-relaxed text-gray-500">
                          Selecciona dos objetos y usa “Cota entre objetos” para
                          guardar distancias centro-a-centro o borde-a-borde.
                          Las cotas exportan a DXF cuando la opción está activa.
                        </p>
                      )}
                    </div>
                  </div>
                ) : selList.length > 1 || !selSnap ? (
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Boxes className="w-4 h-4" style={{ color: "#22d3ee" }} />
                      <span className="text-sm font-semibold">
                        {selList.length} seleccionados
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                      Alinea, mide o mueve el grupo en bloque.
                    </div>
                    {selSummary && (
                      <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-cyan-200">
                            Resumen CAD
                          </span>
                          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300">
                            {selSummary.stationCount} st ·{" "}
                            {selSummary.assetCount} eq
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <ReadField
                            label="Bounds"
                            value={`${Math.round(selSummary.bounds.width)} × ${Math.round(selSummary.bounds.height)}`}
                          />
                          <ReadField
                            label="Area"
                            value={fmtArea(selSummary.area, "mm")}
                          />
                          <ReadField
                            label="Capas"
                            value={`${selSummary.layers.length}`}
                          />
                          <ReadField
                            label="Protegidos"
                            value={`${selSummary.lockedCount}`}
                          />
                        </div>
                        {selSummary.layers.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {selSummary.layers.slice(0, 3).map((layer) => (
                              <div
                                key={layer.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1 text-[10.5px] text-gray-300"
                              >
                                <span
                                  className={
                                    layer.visible
                                      ? "truncate"
                                      : "truncate text-gray-500"
                                  }
                                >
                                  {layer.label}
                                </span>
                                <span
                                  className={
                                    layer.locked
                                      ? "text-amber-200"
                                      : "text-gray-500"
                                  }
                                >
                                  {layer.count} obj
                                  {layer.locked ? " · lock" : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {selSummary.warnings.length > 0 && (
                          <div className="mt-2 rounded-lg border border-amber-300/15 bg-amber-400/[0.06] px-2 py-1 text-[10.5px] text-amber-100">
                            {selSummary.warnings[0]}
                          </div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const wallCount = selList.filter(
                        (it) =>
                          it.type === "asset" &&
                          assetsRef.current.get(it.id)?.kind === "wall",
                      ).length;
                      if (wallCount < 1) return null;
                      return (
                        <div className="mb-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-2.5">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-emerald-200">
                              Restricciones · {wallCount} muro(s)
                            </span>
                          </div>
                          <div className="mb-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                            El primer muro seleccionado es la referencia.
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => applyWallConstraint("horizontal")}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                            >
                              Horizontal
                            </button>
                            <button
                              onClick={() => applyWallConstraint("vertical")}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                            >
                              Vertical
                            </button>
                            <button
                              onClick={() => applyWallConstraint("equal")}
                              disabled={wallCount < 2}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
                            >
                              Igualar
                            </button>
                            <button
                              onClick={() => applyWallConstraint("parallel")}
                              disabled={wallCount < 2}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
                            >
                              Paralelo
                            </button>
                            <button
                              onClick={() =>
                                applyWallConstraint("perpendicular")
                              }
                              disabled={wallCount < 2}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
                            >
                              Perpend.
                            </button>
                            <button
                              onClick={() => applyWallConstraint("collinear")}
                              disabled={wallCount < 2}
                              className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
                            >
                              Colineal
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {selList.length === 2 && (
                      <div className="mb-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-2.5">
                        <div className="mb-2 text-[10px] uppercase tracking-wide text-cyan-200">
                          Cota entre objetos
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={() => createSelectionMeasurement("direct")}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Directa
                          </button>
                          <button
                            onClick={() =>
                              createSelectionMeasurement("horizontal")
                            }
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Horizontal
                          </button>
                          <button
                            onClick={() =>
                              createSelectionMeasurement("vertical")
                            }
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Vertical
                          </button>
                          <button
                            onClick={() =>
                              createSelectionMeasurement("edge-horizontal")
                            }
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Borde H
                          </button>
                          <button
                            onClick={() =>
                              createSelectionMeasurement("edge-vertical")
                            }
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Borde V
                          </button>
                        </div>
                      </div>
                    )}
                    {selList.length === 2 && (
                      <div className="mb-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-2.5">
                        <div className="mb-2 text-[10px] uppercase tracking-wide text-amber-200">
                          Pasillo / clearance
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-300">
                          <span>Ancho</span>
                          <input
                            type="number"
                            min={100}
                            value={aisleWidth}
                            onChange={(e) =>
                              setAisleWidth(Number(e.target.value) || 1200)
                            }
                            className="w-20 rounded-md bg-white/[0.06] px-2 py-1 text-right outline-none"
                          />
                          <button
                            onClick={createAisleBetweenSelection}
                            className="ml-auto rounded-lg bg-amber-500/20 px-2 py-1 text-amber-100 hover:bg-amber-500/30"
                          >
                            Crear pasillo
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                      Alinear
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      <AlignBtn
                        title="Alinear a la izquierda"
                        onClick={() => alignSelected("left")}
                      >
                        <AlignHorizontalJustifyStart className="w-4 h-4" />
                      </AlignBtn>
                      <AlignBtn
                        title="Centrar horizontal"
                        onClick={() => alignSelected("cx")}
                      >
                        <AlignHorizontalJustifyCenter className="w-4 h-4" />
                      </AlignBtn>
                      <AlignBtn
                        title="Alinear a la derecha"
                        onClick={() => alignSelected("right")}
                      >
                        <AlignHorizontalJustifyEnd className="w-4 h-4" />
                      </AlignBtn>
                      <AlignBtn
                        title="Alinear arriba"
                        onClick={() => alignSelected("top")}
                      >
                        <AlignVerticalJustifyStart className="w-4 h-4" />
                      </AlignBtn>
                      <AlignBtn
                        title="Centrar vertical"
                        onClick={() => alignSelected("cy")}
                      >
                        <AlignVerticalJustifyCenter className="w-4 h-4" />
                      </AlignBtn>
                      <AlignBtn
                        title="Alinear abajo"
                        onClick={() => alignSelected("bottom")}
                      >
                        <AlignVerticalJustifyEnd className="w-4 h-4" />
                      </AlignBtn>
                    </div>
                    {selList.length >= 3 && (
                      <>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                          Distribuir (espaciado parejo)
                        </div>
                        <div className="flex gap-1.5 mb-3">
                          <AlignBtn
                            title="Distribuir horizontal"
                            onClick={() => distributeSelected("h")}
                          >
                            <AlignHorizontalDistributeCenter className="w-4 h-4" />
                          </AlignBtn>
                          <AlignBtn
                            title="Distribuir vertical"
                            onClick={() => distributeSelected("v")}
                          >
                            <AlignVerticalDistributeCenter className="w-4 h-4" />
                          </AlignBtn>
                        </div>
                      </>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        data-testid="cad-create-hatch-pattern"
                        onClick={() => createHatchForSelection(false)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 text-[12px]"
                      >
                        <BrickWall className="w-3.5 h-3.5" /> HATCH ANSI31
                      </button>
                      <button
                        data-testid="cad-create-hatch-solid"
                        onClick={() => createHatchForSelection(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 text-[12px]"
                      >
                        <BrickWall className="w-3.5 h-3.5" /> Relleno SOLID
                      </button>
                      <button
                        onClick={() => rotateSelected(15)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> +15°
                      </button>
                      <button
                        onClick={() => rotateSelected(-15)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> −15°
                      </button>
                      <button
                        onClick={duplicateSelected}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <Copy className="w-3.5 h-3.5" /> Duplicar
                      </button>
                      <button
                        onClick={copySelection}
                        title="Ctrl+C — copia al portapapeles CAD (pega aquí o en otro layout)"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Copiar
                      </button>
                      <button
                        onClick={pasteClipboard}
                        title="Ctrl+V — pega el portapapeles CAD"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> Pegar
                      </button>
                      <button
                        onClick={groupSelection}
                        title="Ctrl+G — agrupa los equipos seleccionados (clic selecciona el grupo; Alt+clic el objeto)"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <Group className="w-3.5 h-3.5" /> Agrupar
                      </button>
                      <button
                        onClick={ungroupSelection}
                        title="Ctrl+Shift+G — disuelve los grupos de la selección"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <Group className="w-3.5 h-3.5" /> Desagrupar
                      </button>
                      <button
                        onClick={removeSelected}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[12px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                      </button>
                    </div>
                    <p className="text-[10.5px] text-gray-500 mt-3 leading-relaxed">
                      <b>Shift</b>+clic agrega/quita · <b>Shift</b>+arrastre en
                      el fondo = ventana (izq→der contiene, der→izq cruza) ·{" "}
                      <b>Ctrl+A</b> todo · <b>Ctrl+C/V</b> copia/pega ·{" "}
                      <b>Ctrl+G</b> agrupa (Alt+clic = individual) · flechas
                      mueven el grupo.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings2
                        className="w-4 h-4"
                        style={{ color: "#22d3ee" }}
                      />
                      <span className="text-sm font-semibold">
                        {selSnap.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
                      {selSnap.subtitle}
                    </div>
                    <button
                      onClick={createLeaderForSelection}
                      title="Crea una directriz con nota que apunta a este objeto (flecha + texto), como MLEADER en AutoCAD"
                      className="mb-3 w-full rounded-lg border border-sky-400/25 bg-sky-400/[0.08] px-2 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-400/[0.14]"
                    >
                      ＋ Directriz / Nota
                    </button>
                    {selSnap.type === "asset" && (
                      <div className="mb-3 grid grid-cols-2 gap-1.5">
                        <button
                          data-testid="cad-create-hatch-pattern"
                          onClick={() => createHatchForSelection(false)}
                          className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-2 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/[0.14]"
                        >
                          HATCH ANSI31
                        </button>
                        <button
                          data-testid="cad-create-hatch-solid"
                          onClick={() => createHatchForSelection(true)}
                          className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-2 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/[0.14]"
                        >
                          Relleno SOLID
                        </button>
                      </div>
                    )}
                    {selSnap.type === "asset" && selSnap.kind === "wall" && (
                      <div className="mb-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-2.5">
                        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-emerald-200">
                          Dimensiones exactas
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="block mb-1">Longitud (mm)</span>
                            <input
                              key={`len-${selSnap.id}-${Math.round(selSnap.w)}`}
                              type="number"
                              defaultValue={Math.round(selSnap.w)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  applyWallDimension(
                                    "length",
                                    Number(
                                      (e.target as HTMLInputElement).value,
                                    ),
                                  );
                              }}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (
                                  v > 0 &&
                                  Math.round(v) !== Math.round(selSnap.w)
                                )
                                  applyWallDimension("length", v);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none"
                            />
                          </label>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">
                            <span className="block mb-1">Ángulo (°)</span>
                            <input
                              key={`ang-${selSnap.id}-${Math.round((selSnap.rotation * 180) / Math.PI)}`}
                              type="number"
                              defaultValue={Math.round(
                                (selSnap.rotation * 180) / Math.PI,
                              )}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  applyWallDimension(
                                    "angle",
                                    Number(
                                      (e.target as HTMLInputElement).value,
                                    ),
                                  );
                              }}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (
                                  Number.isFinite(v) &&
                                  Math.round(v) !== Math.round(selSnap.rotation)
                                )
                                  applyWallDimension("angle", v);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none"
                            />
                          </label>
                        </div>
                        <div className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                          Fija el valor exacto conservando el primer extremo del
                          muro. Enter aplica.
                        </div>
                      </div>
                    )}
                    {selList[0] &&
                      isObjectLayerLocked(
                        cadLayers,
                        layerAssignments,
                        selList[0].id,
                        defaultLayerFor(selList[0]),
                      ) && (
                        <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
                          Capa bloqueada: las propiedades, drag y comandos
                          destructivos quedan protegidos.
                        </div>
                      )}

                    {selList[0] && (
                      <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <ReadField
                            label="Tipo"
                            value={
                              selSnap.type === "station" ? "Estación" : "Equipo"
                            }
                          />
                          <ReadField label="ID" value={selSnap.id} />
                        </div>
                        {selSnap.type === "asset" ? (
                          <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="block mb-1">Nombre visible</span>
                            <input
                              data-testid="cad-object-label"
                              value={selSnap.title}
                              onChange={(e) =>
                                updateSelectedAssetLabel(e.target.value)
                              }
                              onBlur={endFieldEdit}
                              placeholder="Nombre del equipo o zona"
                              className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none"
                            />
                          </label>
                        ) : (
                          <ReadField label="Nombre" value={selSnap.title} />
                        )}
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="block mb-1">Capa</span>
                          <select
                            data-testid="cad-object-layer"
                            value={selectionLayer(selList[0])}
                            onChange={(e) =>
                              setSelectionLayer(
                                selList[0],
                                e.target.value as CadLayerId,
                              )
                            }
                            className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none"
                          >
                            {cadLayers.map((layer) => (
                              <option
                                key={layer.id}
                                value={layer.id}
                                className="text-gray-900"
                              >
                                {layer.label}
                                {layer.locked ? " (lock)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="block mb-1">Tags</span>
                          <input
                            data-testid="cad-object-tags"
                            value={objectTags[selSnap.id] ?? ""}
                            onChange={(e) => updateSelectedTags(e.target.value)}
                            onBlur={endFieldEdit}
                            placeholder="esd, safety, smt…"
                            className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none"
                          />
                        </label>
                        <label className="block text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="block mb-1">Notas</span>
                          <textarea
                            data-testid="cad-object-notes"
                            value={objectNotes[selSnap.id] ?? ""}
                            onChange={(e) =>
                              updateSelectedNotes(e.target.value)
                            }
                            onBlur={endFieldEdit}
                            rows={2}
                            placeholder="Owner, restriccion, pendiente..."
                            className="w-full resize-none rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white placeholder:text-gray-600 outline-none"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <ReadField
                            label="Área"
                            value={`${Math.round((selSnap.w * selSnap.h) / 1000).toLocaleString("es-MX")}k mm²`}
                          />
                          <ReadField
                            label="Footprint"
                            value={`${Math.round(selSnap.w)} × ${Math.round(selSnap.h)}`}
                          />
                        </div>
                        {selectedObjectProperties && (
                          <div className="rounded-lg border border-white/10 bg-gray-950/45 p-2">
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">
                              Metadata CAD
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <ReadField
                                label="Centro"
                                value={`${Math.round(selectedObjectProperties.center.x)}, ${Math.round(selectedObjectProperties.center.y)}`}
                              />
                              <ReadField
                                label="Origen"
                                value={
                                  selectedObjectProperties.source.source ===
                                  "dxf"
                                    ? "DXF editable"
                                    : selectedObjectProperties.source.source ===
                                        "generated"
                                      ? "Generado"
                                      : "Manual"
                                }
                              />
                              {selectedObjectProperties.source.dxfLayer && (
                                <ReadField
                                  label="DXF layer"
                                  value={
                                    selectedObjectProperties.source.dxfLayer
                                  }
                                />
                              )}
                              <ReadField
                                label="Safety"
                                value={
                                  selectedObjectProperties.safetyClassification
                                }
                              />
                            </div>
                            {selectedObjectProperties.architecture && (
                              <div className="mt-2 rounded-lg border border-slate-300/10 bg-slate-300/[0.04] p-2">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <span className="text-[10px] uppercase tracking-wide text-slate-300">
                                    Engineering CAD
                                  </span>
                                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-200">
                                    {selectedObjectProperties.architecture.role}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {selectedObjectProperties.architecture.technical
                                    .slice(0, 4)
                                    .map((item) => (
                                      <ReadField
                                        key={`${item.label}-${item.value}`}
                                        label={item.label}
                                        value={item.value}
                                      />
                                    ))}
                                </div>
                              </div>
                            )}
                            {selectedIndustryInfo && (
                              <div className="mt-2 rounded-lg border border-violet-300/10 bg-violet-300/[0.05] p-2">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                  <span className="text-[10px] uppercase tracking-wide text-violet-300">
                                    Industry Pack
                                  </span>
                                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-violet-200">
                                    {selectedIndustryInfo.label}
                                  </span>
                                </div>
                                {Object.keys(selectedIndustryInfo.metrics)
                                  .length > 0 && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(
                                      selectedIndustryInfo.metrics,
                                    )
                                      .slice(0, 4)
                                      .map(([metric, value]) => (
                                        <ReadField
                                          key={metric}
                                          label={metric}
                                          value={value.toLocaleString("es-MX")}
                                        />
                                      ))}
                                  </div>
                                )}
                                {selectedIndustryInfo.findings.length > 0 && (
                                  <div
                                    className={`mt-2 rounded-md px-2 py-1 text-[10.5px] ${selectedIndustryInfo.findings[0].level === "error" ? "border border-rose-300/15 bg-rose-400/[0.06] text-rose-100" : "border border-amber-300/15 bg-amber-400/[0.06] text-amber-100"}`}
                                  >
                                    {selectedIndustryInfo.findings[0].message}
                                  </div>
                                )}
                              </div>
                            )}
                            {selectedObjectProperties.warnings.length > 0 && (
                              <div className="mt-2 rounded-md border border-amber-300/15 bg-amber-400/[0.06] px-2 py-1 text-[10.5px] text-amber-100">
                                {selectedObjectProperties.warnings[0]}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <button
                            onClick={assignSelectedToActiveLayer}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Capa activa
                          </button>
                          <button
                            onClick={centerSelectedInFootprint}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Centrar
                          </button>
                          <button
                            onClick={resetSelectedRotation}
                            className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-[10.5px] text-gray-200 hover:bg-white/[0.12]"
                          >
                            Rot. 0°
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <NumField
                        label="X"
                        value={Math.round(selSnap.x)}
                        testId="cad-object-x"
                        onEnd={endFieldEdit}
                        onChange={(v) => setField("x", v)}
                      />
                      <NumField
                        label="Y"
                        value={Math.round(selSnap.y)}
                        testId="cad-object-y"
                        onEnd={endFieldEdit}
                        onChange={(v) => setField("y", v)}
                      />
                      <NumField
                        label="Ancho"
                        value={Math.round(selSnap.w)}
                        testId="cad-object-w"
                        onEnd={endFieldEdit}
                        onChange={(v) => setField("w", v)}
                      />
                      <NumField
                        label="Largo"
                        value={Math.round(selSnap.h)}
                        testId="cad-object-h"
                        onEnd={endFieldEdit}
                        onChange={(v) => setField("h", v)}
                      />
                      <NumField
                        label="Rotación°"
                        value={Math.round(selSnap.rotation)}
                        testId="cad-object-rotation"
                        onEnd={endFieldEdit}
                        onChange={(v) => setField("rotation", v)}
                      />
                      {selSnap.height !== undefined && (
                        <ReadField label="Alto" value={`${selSnap.height}`} />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => rotateSelected(15)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> +15°
                      </button>
                      <button
                        onClick={() => rotateSelected(-15)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> −15°
                      </button>
                      {selSnap.canDuplicate && (
                        <button
                          onClick={duplicateSelected}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicar
                        </button>
                      )}
                      <button
                        onClick={removeSelected}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[12px]"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                      </button>
                    </div>

                    {selSnap.canDuplicate && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        <div className="text-[10.5px] uppercase tracking-wide text-gray-500">
                          Copiar equipo
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px]">
                          <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">
                            Arreglo
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={arr.cols}
                            onChange={(e) =>
                              setArr((a) => ({
                                ...a,
                                cols: Number(e.target.value),
                              }))
                            }
                            className="w-11 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40"
                            title="columnas"
                          />
                          <span className="text-gray-500">×</span>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={arr.rows}
                            onChange={(e) =>
                              setArr((a) => ({
                                ...a,
                                rows: Number(e.target.value),
                              }))
                            }
                            className="w-11 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40"
                            title="filas"
                          />
                          <span className="text-gray-500">sep</span>
                          <input
                            type="number"
                            min={0}
                            value={arr.gap}
                            onChange={(e) =>
                              setArr((a) => ({
                                ...a,
                                gap: Number(e.target.value),
                              }))
                            }
                            className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40"
                            title="separación"
                          />
                          <button
                            onClick={() =>
                              arrayAssets(arr.cols, arr.rows, arr.gap)
                            }
                            className="ml-auto px-2 py-0.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium"
                          >
                            Crear
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px]">
                          <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">
                            Espejo
                          </span>
                          <button
                            onClick={() => mirrorAssets("h")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12]"
                          >
                            <FlipHorizontal className="w-3.5 h-3.5" />{" "}
                            Horizontal
                          </button>
                          <button
                            onClick={() => mirrorAssets("v")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12]"
                          >
                            <FlipVertical className="w-3.5 h-3.5" /> Vertical
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 text-[12px]">
                          <span className="text-gray-500 dark:text-gray-400 w-12 shrink-0">
                            Desfasar
                          </span>
                          <span className="text-gray-500">dx</span>
                          <input
                            type="number"
                            value={arr.dx}
                            onChange={(e) =>
                              setArr((a) => ({
                                ...a,
                                dx: Number(e.target.value),
                              }))
                            }
                            className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40"
                          />
                          <span className="text-gray-500">dy</span>
                          <input
                            type="number"
                            value={arr.dy}
                            onChange={(e) =>
                              setArr((a) => ({
                                ...a,
                                dy: Number(e.target.value),
                              }))
                            }
                            className="w-14 bg-white/[0.06] rounded px-1 py-0.5 text-center tabular-nums outline-none focus:ring-1 ring-cyan-500/40"
                          />
                          <button
                            onClick={() => offsetAssets(arr.dx, arr.dy)}
                            className="ml-auto px-2 py-0.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium"
                          >
                            Crear
                          </button>
                        </div>
                      </div>
                    )}

                    <p className="text-[10.5px] text-gray-500 mt-3 leading-relaxed">
                      Unidades en {data.footprint.unit}. Usa las flechas para
                      ajustar y <b>R</b> para rotar.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showSheetPackage && (
        <div
          data-testid="cad-sheet-package"
          className="absolute inset-0 z-[82] grid place-items-center bg-black/55 p-4"
          onClick={() => setShowSheetPackage(false)}
        >
          <div
            className="w-[760px] max-w-full max-h-[84vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <Stamp className="h-4 w-4 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  Paquete premium de entrega CAD
                </div>
                <div className="text-[11px] text-gray-500">
                  Cajetín, revisión, validación, DXF, manifiesto y checklist de
                  emisión.
                </div>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[12px] font-semibold text-cyan-100">
                {sheetPackageReadyPct}% listo
              </div>
              <button
                aria-label="Cerrar paquete de entrega"
                onClick={() => setShowSheetPackage(false)}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-white/10 bg-gray-950/35 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Layouts
                </span>
                {orderedPaperSpaces.map((space) => (
                  <button
                    key={space.id}
                    data-testid={`cad-layout-tab-${space.id}`}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", space.id)
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      movePaperSpace(
                        event.dataTransfer.getData("text/plain"),
                        space.id,
                      );
                    }}
                    onClick={() => selectPaperSpace(space)}
                    className={`cursor-grab rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold active:cursor-grabbing ${space.id === activePaperSpace?.id ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]"}`}
                  >
                    {space.name}
                    {space.includeInPublish === false ? " · excluida" : ""}
                  </button>
                ))}
                <button
                  onClick={addPaperSpace}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
                >
                  + Hoja
                </button>
                <button
                  onClick={seedThreeSheetSet}
                  disabled={paperSpaces.length > 0}
                  className="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Demo 3 hojas
                </button>
              </div>
              {activePaperSpace ? (
                <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-gray-900/70 p-3 md:grid-cols-[1.1fr_0.9fr_0.8fr_0.8fr]">
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Nombre
                    </span>
                    <input
                      key={activePaperSpace.id}
                      defaultValue={activePaperSpace.name}
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== activePaperSpace.name)
                          updateActivePaperSpace(
                            (space) => ({ ...space, name }),
                            "Renombrar hoja",
                          );
                      }}
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white outline-none focus:border-cyan-400/60"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Papel
                    </span>
                    <select
                      value={
                        (activePaperSpace.pageSetup?.paper ?? "A3") === "custom"
                          ? "A3"
                          : (activePaperSpace.pageSetup?.paper ?? "A3")
                      }
                      onChange={(event) =>
                        changeActivePaper(event.target.value as CadSheetPaper)
                      }
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                    >
                      {(Object.keys(CAD_SHEET_PAPERS) as CadSheetPaper[]).map(
                        (paper) => (
                          <option key={paper} value={paper}>
                            {paper}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Orientación
                    </span>
                    <select
                      value={activePaperSpace.page.orientation}
                      onChange={(event) =>
                        changeActiveOrientation(
                          event.target.value as "portrait" | "landscape",
                        )
                      }
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                    >
                      <option value="landscape">Horizontal</option>
                      <option value="portrait">Vertical</option>
                    </select>
                  </label>
                  <label className="flex items-end gap-2 pb-1.5 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={activePaperSpace.includeInPublish !== false}
                      onChange={(event) =>
                        updateActivePaperSpace(
                          (space) => ({
                            ...space,
                            includeInPublish: event.target.checked,
                          }),
                          event.target.checked
                            ? "Incluir hoja"
                            : "Excluir hoja",
                        )
                      }
                    />{" "}
                    Publicar
                  </label>
                  {(["top", "right", "bottom", "left"] as const).map((edge) => (
                    <label key={edge} className="block">
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                        Margen {edge}
                      </span>
                      <input
                        data-testid={`cad-page-margin-${edge}`}
                        type="number"
                        min="0"
                        value={
                          activePaperSpace.pageSetup?.margins?.[edge] ?? 10
                        }
                        onChange={(event) =>
                          updateActivePageMargin(
                            edge,
                            Number(event.target.value),
                          )
                        }
                        className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Color
                    </span>
                    <select
                      value={
                        activePaperSpace.pageSetup?.colorMode ?? "monochrome"
                      }
                      onChange={(event) =>
                        updateActivePaperSpace(
                          (space) => ({
                            ...space,
                            pageSetup: {
                              paper: space.pageSetup?.paper ?? "custom",
                              margins: space.pageSetup?.margins ?? {
                                top: 10,
                                right: 10,
                                bottom: 10,
                                left: 10,
                              },
                              colorMode: event.target.value as
                                "color" | "monochrome",
                              lineweightScale:
                                space.pageSetup?.lineweightScale ?? 1,
                            },
                          }),
                          "Cambiar modo de color",
                        )
                      }
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                    >
                      <option value="monochrome">Monochrome</option>
                      <option value="color">Color</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Lineweight
                    </span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={activePaperSpace.pageSetup?.lineweightScale ?? 1}
                      onChange={(event) =>
                        Number(event.target.value) > 0 &&
                        updateActivePaperSpace(
                          (space) => ({
                            ...space,
                            pageSetup: {
                              paper: space.pageSetup?.paper ?? "custom",
                              margins: space.pageSetup?.margins ?? {
                                top: 10,
                                right: 10,
                                bottom: 10,
                                left: 10,
                              },
                              colorMode:
                                space.pageSetup?.colorMode ?? "monochrome",
                              lineweightScale: Number(event.target.value),
                            },
                          }),
                          "Cambiar escala de lineweight",
                        )
                      }
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                    />
                  </label>
                  <label className="col-span-2 block">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                      Biblioteca de cajetines
                    </span>
                    <select
                      data-testid="cad-title-block-library"
                      value={activePaperSpace.titleBlock?.block ?? ""}
                      onChange={(event) =>
                        updateActivePaperSpace(
                          (space) => ({
                            ...space,
                            titleBlock: {
                              ...space.titleBlock,
                              block: event.target.value || undefined,
                              attributes: {
                                ...(space.titleBlock?.attributes ?? {}),
                              },
                            },
                          }),
                          "Cambiar biblioteca de cajetín",
                        )
                      }
                      className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12px] text-white"
                    >
                      <option value="">Cajetín vectorial estándar</option>
                      {professionalBlockDefinitions.map((block) => (
                        <option key={block.id} value={block.id}>
                          {block.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CadLayoutManager
                    space={activePaperSpace}
                    activeViewportId={activePaperViewportId}
                    layers={activeLayoutLayers}
                    preflight={activeLayoutPreflight}
                    preview={
                      layoutPreviewSheet?.id === activePaperSpace.id
                        ? layoutPreviewSheet
                        : null
                    }
                    onActivate={setActivePaperViewportId}
                    onAdd={addPaperViewport}
                    onDuplicate={duplicatePaperViewport}
                    onDelete={removePaperViewport}
                    onChange={changePaperViewport}
                    onLayerVisibility={changePaperViewportLayerVisibility}
                    onLayerOverride={changePaperViewportLayerOverride}
                    onRequestPreview={requestLayoutPreview}
                  />
                  <div className="col-span-full flex justify-end gap-2 border-t border-white/10 pt-2">
                    <button
                      onClick={() =>
                        commitPaperSpaces(
                          reorderCadPaperSpaces(
                            paperSpaces,
                            activePaperSpace.id,
                            -1,
                          ),
                          "Reordenar hoja",
                        )
                      }
                      disabled={(activePaperSpace.order ?? 0) <= 0}
                      className="rounded-md border border-white/10 px-2 py-1 text-[11px] disabled:opacity-30"
                    >
                      ← Subir
                    </button>
                    <button
                      onClick={() =>
                        commitPaperSpaces(
                          reorderCadPaperSpaces(
                            paperSpaces,
                            activePaperSpace.id,
                            1,
                          ),
                          "Reordenar hoja",
                        )
                      }
                      disabled={
                        (activePaperSpace.order ?? 0) >= paperSpaces.length - 1
                      }
                      className="rounded-md border border-white/10 px-2 py-1 text-[11px] disabled:opacity-30"
                    >
                      Bajar →
                    </button>
                    <button
                      onClick={() =>
                        commitPaperSpaces(
                          paperSpaces.filter(
                            (space) => space.id !== activePaperSpace.id,
                          ),
                          "Eliminar hoja",
                        )
                      }
                      className="rounded-md border border-rose-300/20 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-400/10"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-cyan-300/25 bg-cyan-400/[0.05] p-4 text-center text-[12px] text-cyan-100">
                  Crea una hoja o usa el demo de tres hojas para empezar el
                  conjunto.
                </div>
              )}
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "project",
                      "drawingNo",
                      "discipline",
                      "sheet",
                      "revision",
                      "scale",
                      "preparedBy",
                      "checkedBy",
                      "approvedBy",
                    ] as const
                  ).map((key) => (
                    <label
                      key={key}
                      className={
                        key === "project" || key === "discipline"
                          ? "col-span-2 block"
                          : "block"
                      }
                    >
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                        {key === "drawingNo"
                          ? "Drawing No."
                          : key === "preparedBy"
                            ? "Prepared by"
                            : key === "checkedBy"
                              ? "Checked by"
                              : key === "approvedBy"
                                ? "Approved by"
                                : key}
                      </span>
                      <input
                        value={sheetPackageDraft[key]}
                        onChange={(e) =>
                          setSheetPackageDraft((draft) => ({
                            ...draft,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12.5px] text-white outline-none focus:border-cyan-400/60"
                      />
                    </label>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">
                    Notas de emisión
                  </span>
                  <textarea
                    value={sheetPackageDraft.notes}
                    onChange={(e) =>
                      setSheetPackageDraft((draft) => ({
                        ...draft,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-gray-950/70 px-2 py-1.5 text-[12.5px] text-white outline-none focus:border-cyan-400/60"
                    placeholder="Alcance, exclusiones, normas, IFC/for review, etc."
                  />
                </label>
                <button
                  onClick={applyActiveTitleBlock}
                  disabled={!activePaperSpace}
                  className="w-full rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-40"
                >
                  Aplicar cajetín a la hoja activa
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Objetos" value={`${placedCount + assetCount}`} />
                  <Stat label="Capas" value={`${cadLayers.length}`} />
                  <Stat
                    label="Issues"
                    value={`${cadValidationReport?.issues.length ?? "—"}`}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Checklist de emisión
                  </div>
                  <div className="space-y-1.5">
                    {sheetPackageChecks.map((check) => (
                      <div
                        key={check.label}
                        className="flex items-center gap-2 rounded-lg bg-gray-950/50 px-2 py-1.5 text-[12px]"
                      >
                        {check.ok ? (
                          <CircleCheck className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                          <CircleAlert className="h-3.5 w-3.5 text-amber-300" />
                        )}
                        <span className="flex-1 font-medium text-gray-200">
                          {check.label}
                        </span>
                        <span className="max-w-[150px] truncate text-[11px] text-gray-500">
                          {check.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-gray-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Manifest JSON
                    </span>
                    <button
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          JSON.stringify(sheetPackageManifest, null, 2),
                        )
                      }
                      className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
                    >
                      Copiar
                    </button>
                  </div>
                  <pre
                    data-testid="cad-sheet-package-manifest"
                    className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[10.5px] leading-relaxed text-cyan-50/80"
                  >
                    {JSON.stringify(sheetPackageManifest, null, 2)}
                  </pre>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void publishSheetSetPdf()}
                    disabled={
                      drawingReadOnly ||
                      publishingSheetSet ||
                      !paperSpaces.some(
                        (space) => space.includeInPublish !== false,
                      )
                    }
                    className="rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-gray-900 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishingSheetSet
                      ? "Publicando…"
                      : `Publicar PDF (${paperSpaces.filter((space) => space.includeInPublish !== false).length})`}
                  </button>
                  <button
                    onClick={openDxfExport}
                    className="rounded-xl bg-cyan-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-cyan-500"
                  >
                    Preparar DXF
                  </button>
                </div>
                {publicationWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.07] p-3 text-[11px] text-amber-100">
                    <div className="font-semibold">
                      Degradaciones declaradas ({publicationWarnings.length})
                    </div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-100/80">
                      {publicationWarnings.slice(0, 6).map((warning, index) => (
                        <li
                          key={`${warning.code}:${warning.entityId ?? index}`}
                        >
                          {warning.code}: {warning.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quantities / take-off panel */}
      {takeoff && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setTakeoff(null)}
        >
          <div
            className="w-[420px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <ClipboardList className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <span className="text-sm font-semibold">
                Cantidades · {model} · {revision}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setTakeoff(null)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Stat
                  label="Estaciones"
                  value={`${takeoff.placedStations}/${takeoff.totalStations}`}
                />
                <Stat label="Equipos" value={`${takeoff.equipmentCount}`} />
                <Stat
                  label="Área huella"
                  value={fmtArea(takeoff.footprintArea, takeoff.unit)}
                />
                <Stat
                  label="Aprovechamiento"
                  value={`${takeoff.util.toFixed(1)} %`}
                  highlight
                />
                <Stat
                  label="Área usada"
                  value={fmtArea(takeoff.usedArea, takeoff.unit)}
                />
                <Stat
                  label="Muro total"
                  value={fmtLen(takeoff.wallLen, takeoff.unit)}
                />
                <Stat
                  label="Cuartos"
                  value={`${takeoff.architecture.roomCount} - ${fmtArea(takeoff.architecture.roomArea, takeoff.unit)}`}
                />
                <Stat
                  label="Piso libre"
                  value={fmtArea(
                    takeoff.architecture.openFloorArea,
                    takeoff.unit,
                  )}
                />
                <Stat
                  label="Pasillos"
                  value={fmtArea(takeoff.architecture.aisleArea, takeoff.unit)}
                />
                <Stat
                  label="Safety/no-go"
                  value={fmtArea(takeoff.architecture.safetyArea, takeoff.unit)}
                />
                <Stat
                  label="Utilidades"
                  value={`${takeoff.architecture.utilityCount} - ${fmtArea(takeoff.architecture.utilityArea, takeoff.unit)}`}
                />
                <Stat
                  label="Puertas/cols"
                  value={`${takeoff.architecture.doorCount}/${takeoff.architecture.columnCount}`}
                />
                {takeoff.flowCount > 0 && (
                  <Stat
                    label="Flujo total"
                    value={fmtLen(takeoff.flowLen, takeoff.unit)}
                  />
                )}
                {takeoff.flowCount > 0 && (
                  <Stat
                    label="Tramo más largo"
                    value={fmtLen(takeoff.flowMaxHop, takeoff.unit)}
                  />
                )}
              </div>
              {takeoff.byKind.length > 0 ? (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-gray-500 dark:text-gray-400 bg-white/[0.04]">
                        <th className="text-left font-medium px-3 py-1.5">
                          Equipo
                        </th>
                        <th className="text-right font-medium px-3 py-1.5">
                          Cant.
                        </th>
                        <th className="text-right font-medium px-3 py-1.5">
                          Área
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {takeoff.byKind.map((r) => (
                        <tr
                          key={r.kind}
                          className="border-t border-white/[0.06]"
                        >
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.count}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {fmtArea(r.area, takeoff.unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-gray-500 text-center py-3">
                  Aún no hay equipo en el layout.
                </p>
              )}
              {takeoff.byLayer.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                  <div className="bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Uso por capa CAD
                  </div>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {takeoff.byLayer.map((r) => (
                        <tr key={r.id} className="border-t border-white/[0.06]">
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.count}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {fmtArea(r.area, takeoff.unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {takeoff.architecture.byRoomUse.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                  <div className="bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Áreas por uso
                  </div>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {takeoff.architecture.byRoomUse.map((r) => (
                        <tr
                          key={r.key}
                          className="border-t border-white/[0.06]"
                        >
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.count}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {fmtArea(r.area, takeoff.unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {takeoff.architecture.byDepartment.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/10 overflow-hidden">
                  <div className="bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Áreas por departamento
                  </div>
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      {takeoff.architecture.byDepartment.map((r) => (
                        <tr
                          key={r.key}
                          className="border-t border-white/[0.06]"
                        >
                          <td className="px-3 py-1.5">{r.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.count}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {fmtArea(r.area, takeoff.unit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-gray-500">
                  {takeoff.dimCount} {takeoff.dimCount === 1 ? "cota" : "cotas"}
                </span>
                <button
                  onClick={() => {
                    const rows = [["Concepto", "Cantidad", "Área (m²)"]];
                    takeoff.byKind.forEach((r) =>
                      rows.push([
                        r.label,
                        String(r.count),
                        fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                      ]),
                    );
                    rows.push(["--- Capas CAD ---", "", ""]);
                    takeoff.byLayer.forEach((r) =>
                      rows.push([
                        `Capa: ${r.label}`,
                        String(r.count),
                        fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                      ]),
                    );
                    rows.push([
                      "Estaciones colocadas",
                      `${takeoff.placedStations}/${takeoff.totalStations}`,
                      fmtArea(takeoff.stationArea, takeoff.unit).replace(
                        " m²",
                        "",
                      ),
                    ]);
                    rows.push([
                      "Aprovechamiento",
                      `${takeoff.util.toFixed(1)}%`,
                      "",
                    ]);
                    rows.push([
                      "Muro total",
                      fmtLen(takeoff.wallLen, takeoff.unit),
                      "",
                    ]);
                    rows.push([
                      "Cuartos",
                      `${takeoff.architecture.roomCount}`,
                      fmtArea(
                        takeoff.architecture.roomArea,
                        takeoff.unit,
                      ).replace(" m²", ""),
                    ]);
                    rows.push([
                      "Piso libre",
                      "",
                      fmtArea(
                        takeoff.architecture.openFloorArea,
                        takeoff.unit,
                      ).replace(" m²", ""),
                    ]);
                    rows.push([
                      "Pasillos",
                      "",
                      fmtArea(
                        takeoff.architecture.aisleArea,
                        takeoff.unit,
                      ).replace(" m²", ""),
                    ]);
                    rows.push([
                      "Safety/no-go",
                      "",
                      fmtArea(
                        takeoff.architecture.safetyArea,
                        takeoff.unit,
                      ).replace(" m²", ""),
                    ]);
                    rows.push([
                      "Utilidades",
                      `${takeoff.architecture.utilityCount}`,
                      fmtArea(
                        takeoff.architecture.utilityArea,
                        takeoff.unit,
                      ).replace(" m²", ""),
                    ]);
                    rows.push([
                      "Puertas",
                      `${takeoff.architecture.doorCount}`,
                      "",
                    ]);
                    rows.push([
                      "Columnas",
                      `${takeoff.architecture.columnCount}`,
                      "",
                    ]);
                    rows.push(["--- Uso de cuartos ---", "", ""]);
                    takeoff.architecture.byRoomUse.forEach((r) =>
                      rows.push([
                        `Uso: ${r.label}`,
                        String(r.count),
                        fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                      ]),
                    );
                    rows.push(["--- Departamentos ---", "", ""]);
                    takeoff.architecture.byDepartment.forEach((r) =>
                      rows.push([
                        `Dept: ${r.label}`,
                        String(r.count),
                        fmtArea(r.area, takeoff.unit).replace(" m²", ""),
                      ]),
                    );
                    if (takeoff.flowCount > 0) {
                      rows.push([
                        "Flujo total",
                        fmtLen(takeoff.flowLen, takeoff.unit),
                        "",
                      ]);
                      rows.push([
                        "Tramo más largo",
                        fmtLen(takeoff.flowMaxHop, takeoff.unit),
                        "",
                      ]);
                    }
                    const csv = rows.map((r) => r.join(",")).join("\n");
                    navigator.clipboard?.writeText(csv).then(
                      () => toast.success("Cantidades copiadas (CSV).", "3D"),
                      () => toast.error("No se pudo copiar.", "3D"),
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[12px]"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDxfExport && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setShowDxfExport(false)}
        >
          <div
            className="max-h-[82vh] w-[520px] max-w-full overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <FileDown className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold">Exportar DXF</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dxfExportSummary.canExport ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}
              >
                {dxfExportSummary.canExport ? "Listo" : "Bloqueado"}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowDxfExport(false)}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-[12px]">
              <label className="block text-gray-500 dark:text-gray-400">
                Nombre de archivo
                <input
                  value={dxfExportOptions.fileName}
                  onChange={(e) => setDxfOption({ fileName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-gray-950/70 px-2.5 py-2 text-white outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg bg-white/[0.04] p-2 text-gray-300">
                  <span className="mb-1 block text-gray-500">Scope</span>
                  <select
                    value={dxfExportOptions.scope}
                    onChange={(e) =>
                      setDxfOption({
                        scope: e.target.value as DxfExportOptions["scope"],
                      })
                    }
                    className="w-full bg-transparent text-white outline-none"
                  >
                    <option className="text-gray-900" value="all">
                      Todo
                    </option>
                    <option className="text-gray-900" value="selection">
                      Selección
                    </option>
                  </select>
                </label>
                <label className="rounded-lg bg-white/[0.04] p-2 text-gray-300">
                  <span className="mb-1 block text-gray-500">Unidades</span>
                  <select
                    value={dxfExportOptions.units}
                    onChange={(e) =>
                      setDxfOption({
                        units: e.target.value as DxfExportOptions["units"],
                      })
                    }
                    className="w-full bg-transparent text-white outline-none"
                  >
                    <option className="text-gray-900" value="mm">
                      mm
                    </option>
                    <option className="text-gray-900" value="m">
                      m
                    </option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["includeHidden", "Incluir capas ocultas"],
                    ["includeMeasurements", "Incluir cotas"],
                    ["includeLabels", "Incluir notas"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-gray-300"
                  >
                    <input
                      type="checkbox"
                      checked={dxfExportOptions[key]}
                      onChange={(e) =>
                        setDxfOption({ [key]: e.target.checked })
                      }
                      className="accent-cyan-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                  Resumen
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                  <span>Objetos</span>
                  <b className="text-right">{dxfExportSummary.objects}</b>
                  <span>Conectores</span>
                  <b className="text-right">{dxfExportSummary.connectors}</b>
                  <span>Cotas</span>
                  <b className="text-right">{dxfExportSummary.measurements}</b>
                  <span>Notas</span>
                  <b className="text-right">{dxfExportSummary.labels}</b>
                  <span>Layers</span>
                  <b className="text-right">{dxfExportSummary.layers}</b>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                    Paquete de capas
                  </div>
                  <span className="text-[10.5px] text-gray-500">
                    {dxfExportSummary.includedLayers.join(" · ") ||
                      "Sin layers"}
                  </span>
                </div>
                {dxfExportLayerRows.length ? (
                  <div className="space-y-1">
                    {dxfExportLayerRows.map((layer) => (
                      <div
                        key={layer.layer}
                        className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11px]"
                      >
                        <span className="truncate text-gray-300">
                          {layer.layer}
                        </span>
                        <span className="shrink-0 text-gray-500">
                          {layer.included}/{layer.total} incl.
                          {layer.hidden ? ` · ${layer.hidden} ocultas` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11px] text-gray-500">
                    No hay entidades exportables con estas opciones.
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                  Preflight
                </div>
                {dxfExportIssueRows.length ? (
                  <div className="space-y-1">
                    {dxfExportIssueRows.map((issue) => (
                      <div
                        key={issue.code}
                        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] ${issue.level === "blocker" ? "bg-rose-400/10 text-rose-100" : issue.level === "warning" ? "bg-amber-400/10 text-amber-100" : "bg-white/[0.04] text-gray-300"}`}
                      >
                        {issue.level === "blocker" ? (
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : issue.level === "warning" ? (
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1">
                          {issue.message}
                          {issue.count ? ` (${issue.count})` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[11px] text-emerald-100">
                    <CircleCheck className="h-3.5 w-3.5" />
                    DXF listo para descargar.
                  </div>
                )}
              </div>
              {/* MANIFIESTO DE PÉRDIDAS — se muestra ANTES de descargar, no
                  después. Cada fila dice qué entidad, de qué gravedad y por
                  qué, para que la decisión sea informada y no un mensaje que
                  llega cuando el fichero ya está en la carpeta de descargas. */}
              {dxfPreflight && (
                <div
                  data-testid="cad-dxf-loss-manifest"
                  data-blocking={dxfPreflight.blocking ? "true" : "false"}
                  data-losses={dxfPreflight.losses.length}
                  className={`space-y-1.5 rounded-lg border px-2 py-2 text-[11px] ${dxfPreflight.blocking ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}
                >
                  <div className="font-semibold">
                    {dxfPreflight.blocking
                      ? "Este DXF perdería geometría"
                      : "Este DXF degrada parte del dibujo"}
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {dxfPreflight.losses.slice(0, 40).map((loss, index) => (
                      <div
                        key={`${loss.code}:${loss.entityId ?? index}`}
                        data-testid="cad-dxf-loss-row"
                        className="flex items-start gap-1.5"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[9.5px] uppercase opacity-70">
                          {loss.severity}
                        </span>
                        <span className="min-w-0 flex-1">
                          {loss.entityId ? (
                            <b className="font-mono text-[10px]">
                              {loss.entityId}
                            </b>
                          ) : null}{" "}
                          {loss.detail}
                        </span>
                      </div>
                    ))}
                    {dxfPreflight.losses.length > 40 && (
                      <div className="opacity-70">
                        …y {dxfPreflight.losses.length - 40} más.
                      </div>
                    )}
                  </div>
                  <label className="flex items-start gap-1.5">
                    <input
                      data-testid="cad-dxf-loss-accept"
                      type="checkbox"
                      checked={dxfPreflightAccepted === dxfPreflight.token}
                      onChange={(event) =>
                        setDxfPreflightAccepted(
                          event.target.checked ? dxfPreflight.token : null,
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>
                      Entiendo lo que este DXF no representa y quiero
                      descargarlo igualmente. El documento de Valle Design sigue
                      siendo el original.
                    </span>
                  </label>
                </div>
              )}
              <button
                data-testid="cad-dxf-download"
                disabled={
                  !dxfExportSummary.canExport ||
                  (dxfPreflight?.blocking === true &&
                    dxfPreflightAccepted !== dxfPreflight.token)
                }
                onClick={() => exportDxf(dxfExportOptions)}
                className={`w-full rounded-lg px-3 py-2 text-[12px] font-semibold text-white ${dxfExportSummary.canExport && !(dxfPreflight?.blocking === true && dxfPreflightAccepted !== dxfPreflight.token) ? "bg-cyan-600 hover:bg-cyan-500" : "cursor-not-allowed bg-gray-700 text-gray-500 dark:text-gray-400"}`}
              >
                {dxfPreflight && dxfPreflightAccepted === dxfPreflight.token
                  ? "Descargar DXF de todos modos"
                  : "Descargar DXF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {flowHealth && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setFlowHealth(null)}
        >
          <div
            className="w-[420px] max-w-full max-h-[86vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <ChartLine className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-semibold">Flow Health</span>
              <div className="flex-1" />
              <button
                onClick={() => setFlowHealth(null)}
                className="rounded-lg p-1 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-[12px]">
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Score"
                  value={`${flowHealth.score}/100`}
                  highlight
                />
                <Stat
                  label="Distancia total"
                  value={fmtLen(
                    flowHealth.totalDistance,
                    data?.footprint.unit || "mm",
                  )}
                />
                <Stat label="Cruces" value={`${flowHealth.crossingCount}`} />
                <Stat
                  label="Backtracking"
                  value={`${flowHealth.backtrackingCount}`}
                />
              </div>
              {flowSequence.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                      Secuencia de flujo
                    </div>
                    <button
                      onClick={selectFlowSequence}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10"
                    >
                      Seleccionar ruta
                    </button>
                  </div>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {flowSequence.map((node, idx) => (
                      <button
                        key={node.id}
                        onClick={() => selectFlowNode(node.id)}
                        className="flex w-full items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-left hover:bg-white/[0.09]"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-[10px] font-semibold text-cyan-100">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-gray-200">
                          {node.label ?? node.id}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[10.5px] text-gray-500">
                    {flowSegments.length} tramo(s) · clic en una estación para
                    ubicarla.
                  </div>
                </div>
              )}
              {flowSegmentRows.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                    Tramos críticos por distancia
                  </div>
                  <div className="space-y-1">
                    {flowSegmentRows.map((segment, idx) => (
                      <button
                        key={`${segment.from.id}-${segment.to.id}`}
                        onClick={() => selectFlowSegment(segment)}
                        className="flex w-full items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-left hover:bg-white/[0.09]"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400/15 text-[10px] font-semibold text-amber-100">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-gray-200">
                          {segment.from.label ?? segment.from.id} →{" "}
                          {segment.to.label ?? segment.to.id}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                          {fmtLen(
                            segment.distance,
                            data?.footprint.unit || "mm",
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {flowReorderPreview?.improves && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">
                        Vista previa de mejora
                      </div>
                      <div className="text-[11px] text-cyan-50/80">
                        Reordenar slots en eje{" "}
                        {flowReorderPreview.axis.toUpperCase()} sin cambiar la
                        secuencia de proceso.
                      </div>
                    </div>
                    <button
                      onClick={applyFlowReorderPreview}
                      className="shrink-0 rounded-lg bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
                    >
                      Aplicar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Score</div>
                      <div className="tabular-nums text-white">
                        {flowReorderPreview.before.score} -&gt;{" "}
                        {flowReorderPreview.after.score}{" "}
                        <span className="text-emerald-300">
                          +{flowReorderPreview.deltas.score}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Distancia</div>
                      <div className="tabular-nums text-white">
                        {flowReorderPreview.deltas.totalDistance >= 0
                          ? "-"
                          : "+"}
                        {fmtLen(
                          Math.abs(flowReorderPreview.deltas.totalDistance),
                          data?.footprint.unit || "mm",
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Cruces</div>
                      <div className="tabular-nums text-white">
                        {flowReorderPreview.before.crossingCount} -&gt;{" "}
                        {flowReorderPreview.after.crossingCount}
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-950/40 px-2 py-1.5">
                      <div className="text-gray-400">Backtracking</div>
                      <div className="tabular-nums text-white">
                        {flowReorderPreview.before.backtrackingCount} -&gt;{" "}
                        {flowReorderPreview.after.backtrackingCount}
                      </div>
                    </div>
                  </div>
                  {flowReorderMoveRows.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {flowReorderMoveRows.map((move) => (
                        <div
                          key={move.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/40 px-2 py-1 text-[11px]"
                        >
                          <span className="min-w-0 flex-1 truncate text-cyan-50">
                            {move.label ?? move.id}
                          </span>
                          <span className="shrink-0 tabular-nums text-gray-400">
                            {Math.round(move.to.x)}, {Math.round(move.to.y)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {flowHealth.suggestions.length ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-100">
                  <div className="mb-1 font-semibold">Recomendaciones</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {flowHealth.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-100">
                  Flujo sano: sin cruces ni backtracking detectado.
                </div>
              )}
              <button
                onClick={() => {
                  setShowCommand(true);
                  setCommandText("acomoda la línea de izquierda a derecha");
                  setFlowHealth(null);
                }}
                className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-cyan-500"
              >
                Preparar comando arrange_line con preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Design-check / validation report */}
      {report && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setReport(null)}
        >
          <div
            className="w-[440px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <ShieldCheck
                className="w-4 h-4"
                style={{
                  color:
                    report.score === "ok"
                      ? "#34d399"
                      : report.score === "warn"
                        ? "#fbbf24"
                        : "#f87171",
                }}
              />
              <span className="text-sm font-semibold">
                Revisión de diseño · {model} · {revision}
              </span>
              <div className="flex-1" />
              {validationHighlightIds.size > 0 && (
                <button
                  onClick={clearValidationHighlights}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10"
                >
                  Ocultar highlights
                </button>
              )}
              <button
                onClick={() => setReport(null)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-[12.5px] mb-1">
                {report.score === "ok" ? (
                  <span className="text-emerald-400">
                    Sin problemas detectados.
                  </span>
                ) : (
                  <span
                    className={
                      report.score === "error"
                        ? "text-rose-400"
                        : "text-amber-400"
                    }
                  >
                    {report.errors} {report.errors === 1 ? "error" : "errores"}{" "}
                    · {report.warnings}{" "}
                    {report.warnings === 1 ? "aviso" : "avisos"}
                  </span>
                )}
              </div>
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">
                      Release readiness
                    </div>
                    <div className={`text-sm font-semibold ${releaseTone}`}>
                      {releaseState}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-gray-500 dark:text-gray-400">
                    <div>{releaseBlockers} bloqueos</div>
                    <div>{releaseWarnings} avisos</div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  {releaseChecks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/50 px-2 py-1.5 text-[11.5px]"
                    >
                      <span className="text-gray-300">{check.label}</span>
                      <span className={check.tone}>{check.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {cadValidationReport && (
                <div className="mb-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-cyan-100">
                    <span>CAD validation center</span>
                    <span
                      className={
                        cadValidationReport.severity === "critical"
                          ? "text-rose-300"
                          : cadValidationReport.severity === "warning"
                            ? "text-amber-300"
                            : "text-emerald-300"
                      }
                    >
                      {cadValidationReport.severity}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5">
                      <span className="text-gray-500">Collisions</span>
                      <b className="ml-2 tabular-nums text-white">
                        {cadValidationReport.collisions.length}
                      </b>
                    </div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5">
                      <span className="text-gray-500">Clearance</span>
                      <b className="ml-2 tabular-nums text-white">
                        {cadValidationReport.clearances.length}
                      </b>
                    </div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5">
                      <span className="text-gray-500">Safety</span>
                      <b className="ml-2 tabular-nums text-white">
                        {cadValidationReport.safety.length}
                      </b>
                    </div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5">
                      <span className="text-gray-500">Architecture</span>
                      <b className="ml-2 tabular-nums text-white">
                        {cadValidationReport.architecture.length}
                      </b>
                    </div>
                    <div className="rounded-lg bg-gray-950/50 px-2 py-1.5">
                      <span className="text-gray-500">Flow</span>
                      <b className="ml-2 tabular-nums text-white">
                        {cadValidationReport.flow
                          ? `${cadValidationReport.flow.score}/100`
                          : "n/a"}
                      </b>
                    </div>
                  </div>
                  {cadValidationReport.issues.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {cadValidationReport.issues.slice(0, 4).map((issue) => (
                        <button
                          key={issue.id}
                          onClick={() => selectValidationIssue(issue)}
                          className={`w-full rounded-lg border px-2 py-1.5 text-left text-[11.5px] transition ${issue.severity === "critical" ? "border-rose-400/20 bg-rose-400/10 hover:bg-rose-400/15" : "border-amber-400/20 bg-amber-400/10 hover:bg-amber-400/15"}`}
                        >
                          <span
                            className={
                              issue.severity === "critical"
                                ? "block font-medium text-rose-100"
                                : "block font-medium text-amber-100"
                            }
                          >
                            {issue.title}
                          </span>
                          <span className="block text-gray-300">
                            {issue.suggestedFix}
                          </span>
                          <span className="block pt-0.5 text-[10.5px] text-gray-500">
                            {issue.actionLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {industrySummary && industrySummary.totalInstances > 0 && (
                <div className="mb-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.07] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-violet-100">
                      Objetos inteligentes · {industrySummary.totalInstances}
                    </span>
                    <button
                      onClick={exportIndustryCsv}
                      className="rounded-lg bg-violet-400/[0.14] px-2 py-1 text-[10.5px] text-violet-100 hover:bg-violet-400/[0.22]"
                    >
                      Exportar CSV
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {industrySummary.objects.map((obj) => (
                      <div
                        key={obj.objectId}
                        className="rounded-lg bg-gray-950/40 px-2 py-1.5 text-[11.5px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-violet-100">{obj.label}</span>
                          <span className="tabular-nums text-gray-400">
                            ×{obj.count}
                          </span>
                        </div>
                        {Object.keys(obj.metrics).length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-gray-400">
                            {Object.entries(obj.metrics).map(
                              ([metric, value]) => (
                                <span key={metric}>
                                  {metric}:{" "}
                                  <b className="tabular-nums text-gray-200">
                                    {value.toLocaleString("es-MX")}
                                  </b>
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {collisionHits.length > 0 && (
                <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-rose-100">
                    <span>Colisiones detectadas · {collisionHits.length}</span>
                    <button
                      onClick={() => setCollisionHits([])}
                      className="text-[11px] text-rose-200/70 hover:text-white"
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {collisionHits.slice(0, 8).map((hit) => (
                      <button
                        key={`${hit.aId}-${hit.bId}`}
                        onClick={() => selectCollisionPair(hit)}
                        className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]"
                      >
                        <span className="block text-rose-100">
                          {hit.aLabel} ↔ {hit.bLabel}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          Área aprox.{" "}
                          {Math.round(hit.area).toLocaleString("es-MX")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {clearanceIssues.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-amber-100">
                    <span>Clearance warnings - {clearanceIssues.length}</span>
                    <button
                      onClick={() => setClearanceIssues([])}
                      className="text-[11px] text-amber-200/70 hover:text-white"
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {clearanceIssues.slice(0, 8).map((issue) => (
                      <button
                        key={`${issue.aId}-${issue.bId}`}
                        onClick={() => selectClearanceIssue(issue)}
                        className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]"
                      >
                        <span className="block text-amber-100">
                          {issue.message}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          Actual{" "}
                          {fmtLen(issue.distance, data?.footprint.unit || "mm")}{" "}
                          - minimo{" "}
                          {fmtLen(issue.required, data?.footprint.unit || "mm")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {safetyIssues.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-[12px] font-semibold text-amber-100">
                    <span>Safety issues - {safetyIssues.length}</span>
                    <button
                      onClick={() => setSafetyIssues([])}
                      className="text-[11px] text-amber-200/70 hover:text-white"
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {safetyIssues.slice(0, 8).map((issue) => (
                      <button
                        key={`${issue.zoneId}-${issue.objectId}-${issue.code}`}
                        onClick={() => selectSafetyIssue(issue)}
                        className="w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-left text-[11.5px] hover:bg-white/[0.1]"
                      >
                        <span className="block text-amber-100">
                          {issue.message}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          Seleccionar objeto + zona/ruta
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {report.items.map((it) => {
                const Icon =
                  it.level === "ok"
                    ? CircleCheck
                    : it.level === "warn"
                      ? CircleAlert
                      : ShieldAlert;
                const color =
                  it.level === "ok"
                    ? "#34d399"
                    : it.level === "warn"
                      ? "#fbbf24"
                      : "#f87171";
                return (
                  <div
                    key={it.key}
                    className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                  >
                    <Icon
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color }}
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">
                        {it.label}
                        {it.count > 0 ? ` · ${it.count}` : ""}
                      </div>
                      <div className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-snug">
                        {it.detail}
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-[10.5px] text-gray-500 pt-1 leading-relaxed">
                Traslapes y límites se evalúan sobre la caja sin rotación
                (aproximado).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Versions / scenarios modal (unify) */}
      {showVersions && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setShowVersions(false)}
        >
          <div
            className="w-[460px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <History className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <span className="text-sm font-semibold">
                Versiones · {model} · {revision}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowVersions(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={versName}
                  onChange={(e) => setVersName(e.target.value)}
                  placeholder="Nombre de la versión/snapshot (opcional)"
                  className="flex-1 bg-white/[0.06] rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:ring-1 ring-cyan-500/40"
                />
                <button
                  onClick={saveVersion}
                  disabled={drawingReadOnly || versBusy}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium disabled:opacity-50"
                >
                  Guardar versión
                </button>
                <button
                  onClick={() => saveLocalSnapshot("manual")}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium"
                >
                  Snapshot local
                </button>
              </div>
              <div className="mb-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                    Snapshots locales de sesión
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {localSnapshots.snapshots.length}/20
                  </span>
                </div>
                {snapshotDiff && (
                  <div
                    className={`mb-2 rounded-lg px-2 py-1.5 text-[11px] ${snapshotDiff.changed ? "bg-amber-400/10 text-amber-100" : "bg-emerald-400/10 text-emerald-100"}`}
                  >
                    Comparación:{" "}
                    {snapshotDiff.changed
                      ? "hay cambios vs snapshot"
                      : "sin cambios"}{" "}
                    · {snapshotDiff.beforeHash} → {snapshotDiff.afterHash}
                  </div>
                )}
                {localSnapshots.snapshots.length === 0 ? (
                  <p className="text-[11.5px] text-gray-500">
                    Guarda puntos de restauración rápidos antes de importar,
                    acomodar o probar comandos. No salen del navegador.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {[...localSnapshots.snapshots].reverse().map((snap) => (
                      <div
                        key={snap.id}
                        className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium text-gray-100">
                            {snap.label}
                          </div>
                          <div className="text-[10.5px] text-gray-500">
                            {new Date(snap.createdAt).toLocaleString("es-MX")} ·{" "}
                            {snap.reason}
                          </div>
                        </div>
                        <button
                          onClick={() => compareLocalSnapshot(snap.id)}
                          className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-gray-200 hover:bg-white/[0.12]"
                        >
                          Comparar
                        </button>
                        <button
                          onClick={() => restoreLocalSnapshot(snap.id)}
                          className="rounded-md bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/25"
                        >
                          Restaurar
                        </button>
                        <button
                          onClick={() => deleteLocalSnapshot(snap.id)}
                          className="rounded-md px-1.5 py-1 text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {versions.length === 0 ? (
                <p className="text-[12px] text-gray-500 text-center py-4">
                  Aún no hay versiones guardadas.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">
                          {v.name || "Sin nombre"}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {new Date(v.createdAt).toLocaleString("es-MX")} ·{" "}
                          {v.stationCount} est · {v.assetCount} eq
                        </div>
                      </div>
                      <button
                        onClick={() => restoreVersion(v.id)}
                        disabled={versBusy}
                        className="px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[12px] disabled:opacity-50"
                      >
                        Restaurar
                      </button>
                      <button
                        onClick={() => deleteVersion(v.id)}
                        className="p-1 rounded-md text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clone-from-template modal (unify) */}
      {showClone && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setShowClone(false)}
        >
          <div
            className="w-[420px] max-w-full rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Copy className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <span className="text-sm font-semibold">
                Clonar desde plantilla
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowClone(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
                Copia el layout (estaciones, equipo, conexiones, celdas y plano)
                de otro modelo a{" "}
                <b className="text-gray-200">
                  {model} · {revision}
                </b>
                . Reemplaza el actual.
              </p>
              <select
                value={cloneSrc}
                onChange={(e) => setCloneSrc(e.target.value)}
                className="w-full bg-white/[0.06] rounded-lg px-2.5 py-2 text-[13px] outline-none mb-3 focus:ring-1 ring-cyan-500/40"
              >
                <option value="" className="text-gray-900">
                  Elige un modelo origen…
                </option>
                {models
                  .filter(
                    (m) => !(m.model === model && m.revision === revision),
                  )
                  .map((m) => (
                    <option
                      key={`${m.model}|${m.revision}`}
                      value={`${m.model}|${m.revision}`}
                      className="text-gray-900"
                    >
                      {m.model} · {m.revision}
                    </option>
                  ))}
              </select>
              <button
                onClick={cloneFrom}
                disabled={!cloneSrc || cloneBusy}
                className="w-full px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium disabled:opacity-50"
              >
                {cloneBusy ? "Clonando…" : "Clonar layout"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cells / zones modal (unify) */}
      {showCells && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
          onClick={() => setShowCells(false)}
        >
          <div
            className="w-[440px] max-w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Group className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <span className="text-sm font-semibold">
                Celdas / zonas · {model} · {revision}
              </span>
              <div className="flex-1" />
              <button
                data-testid="cad-cells-close"
                onClick={() => setShowCells(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <button
                data-testid="cad-cells-create"
                onClick={createCellFromSelection}
                className="w-full mb-3 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[12px] font-medium"
              >
                Crear celda con la selección
              </button>
              {cellsView.length === 0 ? (
                <p className="text-[12px] text-gray-500 text-center py-3">
                  Selecciona estaciones (Shift+clic) y crea una celda para
                  agruparlas.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {cellsView.map((c) => (
                    <div
                      key={c.id}
                      data-testid="cad-cell-row"
                      className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-sm shrink-0"
                        style={{ background: c.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          data-testid="cad-cell-name"
                          defaultValue={c.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            // Crear y borrar ya pasaban por `commitCells`;
                            // renombrar escribía `cellsRef` a mano y sólo
                            // marcaba dirty, así que el nombre nuevo no entraba
                            // en el documento canónico y se perdía en el
                            // guardado — con el autosave respondiendo 200.
                            if (v && v !== c.name)
                              commitCells(
                                cellsRef.current.map((cell) =>
                                  cell.id === c.id ? { ...cell, name: v } : cell,
                                ),
                                "renombrar celda",
                              );
                          }}
                          className="w-full bg-transparent text-[13px] font-medium outline-none focus:bg-white/[0.06] rounded px-1"
                        />
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 px-1">
                          {c.stationIds.length} estaciones
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCell(c.id)}
                        className="p-1 rounded-md text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10.5px] text-gray-500 mt-3">
                Las celdas tiñen el piso bajo sus estaciones agrupadas.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Analysis panels — mounted on demand from the Análisis menu. The panels
          themselves are host-injected descriptors (WP6): the editor only builds
          the minimal context they consume and lets each descriptor render. */}
      {analysisPanel &&
        (() => {
          const it = analysisPanels.find((a) => a.key === analysisPanel);
          if (!it) return null;
          return it.render({
            model,
            revision,
            placedStations: (data?.stations ?? [])
              .filter((s) => placementsRef.current.has(s.id))
              .map((s) => ({ id: s.id, label: s.station })),
            unit: data?.footprint.unit || "mm",
            onClose: () => setAnalysisPanel(null),
          });
        })()}

      {/* Cuadros flotantes de las paletas. Su estado vive fuera de React
          (`components/cad/palettes`), así que abrirlos no cuesta un `useState`
          en una función que ya tiene demasiados. */}
      <CadPaletteOverlays
        open={activePalette}
        paletteHost={paletteHost}
        readOnly={drawingReadOnly}
        document={loadedCadDocumentRef.current}
        draftSettingsHost={draftSettingsHost}
        draftSettings={draftSettings}
        grid={{
          visible: layers.grid,
          snap,
          size: data?.footprint.gridSize ?? 0,
        }}
        onToggleGridVisible={toggleGridVisible}
        onToggleGridSnap={toggleGridSnap}
        onToggleOsnapMode={toggleDraftOsnapMode}
        styleManagerHost={styleManagerHost}
        styleManager={styleManager}
        onCreateStyle={styleActions.create}
        onEditStyle={styleActions.edit}
        onDeleteStyle={styleActions.remove}
      />

      {/* Keyboard shortcuts / help overlay */}
      {showHelp && (
        <div
          className="absolute inset-0 z-[80] grid place-items-center bg-black/55 p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="w-[640px] max-w-full max-h-[82vh] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <HelpCircle className="w-4 h-4" style={{ color: "#22d3ee" }} />
              <span className="text-sm font-semibold">
                Atajos y herramientas · CAD 3D
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 text-[12.5px]">
              {HELP_SECTIONS.map((sec) => (
                <div key={sec.title}>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
                    {sec.title}
                  </div>
                  <div className="space-y-1">
                    {sec.rows.map(([k, d]) => (
                      <div
                        key={d}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="text-gray-300">{d}</span>
                        <kbd className="shrink-0 px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-[11px] text-gray-200 font-mono">
                          {k}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 text-[11px] text-gray-500">
              Abre esta ayuda con{" "}
              <kbd className="px-1 py-0.5 rounded bg-white/[0.08] border border-white/10 font-mono">
                ?
              </kbd>{" "}
              en cualquier momento.
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
