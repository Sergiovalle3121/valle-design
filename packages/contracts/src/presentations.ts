/**
 * Canonical, renderer-independent contracts for AXOS Presentations.
 *
 * Geometry is expressed in typographic points (72 pt = 1 inch). Renderer
 * adapters must convert at their boundary; browser pixels are never persisted.
 */
export const PRESENTATION_SCHEMA_VERSION = 1 as const;
export const PRESENTATION_STANDARD_PAGE = {
  width: 960,
  height: 540,
  unit: "pt",
} as const;

export type PresentationId = string;
export type PresentationRole = "owner" | "editor" | "commenter" | "viewer";
export type PresentationPermission =
  | "read"
  | "edit"
  | "comment"
  | "share"
  | "export"
  | "present"
  | "connect_data"
  | "use_ai"
  | "manage_brand"
  | "approve";

export interface PresentationPageSize {
  width: number;
  height: number;
  unit: "pt";
  aspectRatio: "16:9" | "4:3" | "custom";
}
export interface PresentationPoint {
  x: number;
  y: number;
}

export interface PresentationBounds extends PresentationPoint {
  width: number;
  height: number;
}

export interface PresentationTransform extends PresentationBounds {
  rotation: number;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
  anchor: "top-left" | "center";
}

export type PresentationColor =
  | { kind: "theme"; token: string; alpha?: number }
  | { kind: "direct"; value: string; alpha?: number };

export interface PresentationStroke {
  color: PresentationColor;
  width: number;
  dash: "solid" | "dash" | "dot" | "dash-dot";
}

export interface PresentationShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface PresentationElementStyle {
  fill?: PresentationColor;
  stroke?: PresentationStroke;
  shadow?: PresentationShadow;
  radius?: number;
}

export interface PresentationAction {
  kind: "url" | "slide" | "next" | "previous";
  target?: string;
}

export interface PresentationAnimation {
  id: string;
  category: "entrance" | "emphasis" | "exit" | "motion";
  effect: string;
  trigger: "on-click" | "with-previous" | "after-previous";
  order: number;
  durationMs: number;
  delayMs: number;
}

export interface PresentationSourceMetadata {
  sourceType: "native" | "pptx" | "template" | "dataset";
  sourceId?: string;
  sourceVersion?: string;
  importedAt?: string;
  checksum?: string;
}

export interface PresentationElementBase {
  id: string;
  type:
    | "text"
    | "shape"
    | "image"
    | "line"
    | "connector"
    | "group"
    | "unknown";
  name: string;
  zIndex: number;
  transform: PresentationTransform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  altText: string;
  semanticRole?: string;
  style: PresentationElementStyle;
  action?: PresentationAction;
  animations: PresentationAnimation[];
  bindingId?: string;
  placeholderId?: string;
  source?: PresentationSourceMetadata;
  rendererMetadata?: Record<string, string | number | boolean | null>;
}

export interface PresentationTextRun {
  id: string;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: PresentationColor;
  language?: string;
  link?: PresentationAction;
}

export interface PresentationParagraph {
  id: string;
  runs: PresentationTextRun[];
  alignment: "left" | "center" | "right" | "justify";
  bullet?: { kind: "bullet" | "number"; level: number; startAt?: number };
  indentation: number;
  lineSpacing: number;
  spaceBefore: number;
  spaceAfter: number;
  direction: "ltr" | "rtl" | "auto";
}

export interface PresentationTextFrame {
  paragraphs: PresentationParagraph[];
  verticalAlignment: "top" | "middle" | "bottom";
  autoFit: "none" | "shrink-text" | "resize-shape";
  margins: { top: number; right: number; bottom: number; left: number };
  overflow: "clip" | "visible" | "ellipsis";
}

export interface PresentationTextElement extends PresentationElementBase {
  type: "text";
  text: PresentationTextFrame;
}

export type PresentationShapePreset =
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "chevron"
  | "callout"
  | "process";

export interface PresentationShapeElement extends PresentationElementBase {
  type: "shape";
  preset: PresentationShapePreset;
  text?: PresentationTextFrame;
}

export interface PresentationImageCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PresentationImageElement extends PresentationElementBase {
  type: "image";
  assetId: string;
  fit: "contain" | "cover" | "stretch";
  crop: PresentationImageCrop;
  mask?: PresentationShapePreset;
}

export interface PresentationLineElement extends PresentationElementBase {
  type: "line";
  start: PresentationPoint;
  end: PresentationPoint;
  startMarker: "none" | "arrow" | "dot";
  endMarker: "none" | "arrow" | "dot";
}

export interface PresentationConnectorEndpoint {
  elementId?: string;
  anchor?: "top" | "right" | "bottom" | "left" | "center";
  point: PresentationPoint;
}

export interface PresentationConnectorElement
  extends PresentationElementBase {
  type: "connector";
  routing: "straight" | "orthogonal";
  start: PresentationConnectorEndpoint;
  end: PresentationConnectorEndpoint;
  startMarker: "none" | "arrow" | "dot";
  endMarker: "none" | "arrow" | "dot";
  label?: PresentationTextFrame;
}

export interface PresentationGroupElement extends PresentationElementBase {
  type: "group";
  childIds: string[];
}

export interface PresentationUnknownElement extends PresentationElementBase {
  type: "unknown";
  originalType: string;
  preservation: "preserved" | "flattened" | "unsupported";
  opaquePartIds: string[];
}

export type PresentationElement =
  | PresentationTextElement
  | PresentationShapeElement
  | PresentationImageElement
  | PresentationLineElement
  | PresentationConnectorElement
  | PresentationGroupElement
  | PresentationUnknownElement;

export interface PresentationTheme {
  id: string;
  name: string;
  colors: Record<string, string>;
  fonts: { heading: string; body: string; mono?: string };
  effects: { shadow: "none" | "soft"; radius: number };
  locale: string;
}

export interface PresentationPlaceholder {
  id: string;
  type:
    | "title"
    | "subtitle"
    | "body"
    | "picture"
    | "chart"
    | "table"
    | "media"
    | "footer"
    | "date"
    | "slide-number";
  name: string;
  transform: PresentationTransform;
  prompt: string;
  supportedContent: PresentationElement["type"][];
  style: PresentationElementStyle;
}

export interface PresentationMaster {
  id: string;
  name: string;
  themeId: string;
  background: PresentationColor;
  elements: PresentationElement[];
  guides: {
    vertical: number[];
    horizontal: number[];
    safeMargin: number;
  };
  hiddenElementIds: string[];
}

export interface PresentationLayout {
  id: string;
  masterId: string;
  name: string;
  background?: PresentationColor;
  placeholders: PresentationPlaceholder[];
  elements: PresentationElement[];
}

export interface PresentationTransition {
  type: "none" | "cut" | "fade" | "push" | "wipe" | "split";
  durationMs: number;
  direction?: "left" | "right" | "up" | "down";
}

export interface PresentationSlide {
  id: string;
  order: number;
  title: string;
  sectionId?: string;
  layoutId?: string;
  background?: PresentationColor;
  elements: PresentationElement[];
  notes: string;
  transition: PresentationTransition;
  hidden: boolean;
  metadata: Record<string, string | number | boolean | null>;
  lineage?: { sourceSlideId: string; sourceVersionId?: string };
}

export interface PresentationAsset {
  id: string;
  kind: "image" | "audio" | "video" | "opaque-ooxml";
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  width?: number;
  height?: number;
  sourceUrl?: string;
  license?: string;
  attribution?: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface PresentationComment {
  id: string;
  slideId?: string;
  elementId?: string;
  authorId: string;
  body: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

export interface PresentationDataBinding {
  id: string;
  kind: "kpi" | "text" | "image";
  datasetKey: string;
  query: Record<string, string | number | boolean | null>;
  sourceVersion?: string;
  refreshedAt?: string;
  mode: "snapshot" | "live";
  stale: boolean;
  evidenceLinks: string[];
}

export interface PresentationSnapshot {
  schemaVersion: typeof PRESENTATION_SCHEMA_VERSION;
  id: string;
  pageSize: PresentationPageSize;
  locale: string;
  timezone: string;
  theme: PresentationTheme;
  masters: PresentationMaster[];
  layouts: PresentationLayout[];
  slides: PresentationSlide[];
  assets: PresentationAsset[];
  comments: PresentationComment[];
  dataBindings: PresentationDataBinding[];
  brandKitRef?: { id: string; version: number };
  metadata: {
    title: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    source?: "native" | "pptx" | "template";
  };
}

export interface PresentationSummary {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  revision: number;
  currentVersionId: string;
  role: PresentationRole;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationVersionRecord {
  id: string;
  presentationId: string;
  revision: number;
  parentVersionId: string | null;
  sha256: string;
  createdBy: string;
  changeSummary: string;
  createdAt: string;
}

export interface PresentationDetail extends PresentationSummary {
  snapshot: PresentationSnapshot;
  version: PresentationVersionRecord;
  permissions: PresentationPermission[];
}

export interface PresentationShareGrant {
  id: string;
  presentationId: string;
  subjectType: "user" | "role";
  subjectId: string;
  role: Exclude<PresentationRole, "owner">;
  createdBy: string;
  createdAt: string;
}

export interface PresentationPatch {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
  previous?: unknown;
}

export interface PresentationCommandEnvelope {
  type: string;
  schemaVersion: 1;
  actorId: string;
  presentationId: string;
  baseRevision: number;
  affectedIds: string[];
  timestamp: string;
  correlationId: string;
  idempotencyKey?: string;
  auditSummary: string;
  patches: PresentationPatch[];
}

export type PresentationCompatibilityLevel =
  | "editable"
  | "preserved"
  | "approximated"
  | "flattened"
  | "dropped_with_warning"
  | "blocked"
  | "unsupported";

export interface PresentationCompatibilityIssue {
  code: string;
  severity: "info" | "warning" | "danger";
  level: PresentationCompatibilityLevel;
  slideId?: string;
  objectId?: string;
  count: number;
  reason: string;
  impact: string;
  recommendation: string;
}

export interface PresentationCompatibilityReport {
  format: "pptx";
  supportedSubset: string[];
  issues: PresentationCompatibilityIssue[];
  hasBlockedContent: boolean;
  generatedAt: string;
}

export interface PresentationImportResult {
  snapshot: PresentationSnapshot;
  compatibility: PresentationCompatibilityReport;
}
