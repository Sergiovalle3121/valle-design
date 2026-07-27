import type {
  DocumentClassification,
  DocumentLinkTargetType,
} from "./documents";

export const AXOS_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type AxosDocumentId = string;
export type AxosDocumentNodeId = string;
export type AxosDocumentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "released"
  | "archived";
export type AxosRevisionState = "draft" | "released" | "superseded";
export type AxosReviewDisplayMode =
  | "simple"
  | "all_markup"
  | "no_markup"
  | "original";
export type AxosSuggestionMode = "off" | "suggesting";

export interface AxosDocumentMetadata {
  title: string;
  subject: string | null;
  description: string | null;
  ownerId: string;
  classification: DocumentClassification;
  keywords: string[];
  status: AxosDocumentStatus;
  createdAt: string;
  updatedAt: string;
  effectiveFrom: string | null;
  reviewDueAt: string | null;
  retentionUntil: string | null;
}

export type AxosPageSizeName = "a4" | "letter" | "legal" | "custom";
export type AxosPageOrientation = "portrait" | "landscape";

export interface AxosPageSize {
  name: AxosPageSizeName;
  widthTwips: number;
  heightTwips: number;
}

export interface AxosPageMargins {
  topTwips: number;
  rightTwips: number;
  bottomTwips: number;
  leftTwips: number;
  gutterTwips: number;
}

export interface AxosPageDefaults {
  size: AxosPageSize;
  orientation: AxosPageOrientation;
  margins: AxosPageMargins;
  columns: number;
  columnGapTwips: number;
}

export interface AxosTheme {
  defaultFontFamily: string;
  headingFontFamily: string;
  defaultFontSizePt: number;
  colors: Record<string, string>;
}

export interface AxosCharacterProperties {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string;
  highlight?: string;
  fontFamily?: string;
  fontSizePt?: number;
  language?: string;
  code?: boolean;
}

export interface AxosParagraphProperties {
  alignment?: "left" | "center" | "right" | "justify";
  lineSpacing?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  keepWithNext?: boolean;
  keepLinesTogether?: boolean;
  pageBreakBefore?: boolean;
  indentLeftTwips?: number;
  indentRightTwips?: number;
  firstLineIndentTwips?: number;
}

export interface AxosNamedStyle {
  id: string;
  name: string;
  basedOnId: string | null;
  nextStyleId: string | null;
  kind: "paragraph" | "character" | "table";
  paragraph: AxosParagraphProperties;
  character: AxosCharacterProperties;
  table?: AxosTableStyleProperties;
  builtIn: boolean;
}

export interface AxosInlineMark {
  type:
    | "bold"
    | "italic"
    | "underline"
    | "strike"
    | "subscript"
    | "superscript"
    | "color"
    | "highlight"
    | "font_family"
    | "font_size"
    | "language"
    | "code"
    | "insertion"
    | "deletion";
  value?: string | number | boolean;
  revisionId?: string;
}

export interface AxosTextInline {
  id: AxosDocumentNodeId;
  type: "text";
  text: string;
  marks: AxosInlineMark[];
}

export interface AxosHyperlinkInline {
  id: AxosDocumentNodeId;
  type: "hyperlink";
  href: string;
  title: string | null;
  content: AxosTextInline[];
}

export interface AxosBookmarkAnchorInline {
  id: AxosDocumentNodeId;
  type: "bookmark_anchor";
  bookmarkId: string;
}

export interface AxosNoteReferenceInline {
  id: AxosDocumentNodeId;
  type: "footnote_reference" | "endnote_reference";
  noteId: string;
}

export interface AxosCitationInline {
  id: AxosDocumentNodeId;
  type: "citation";
  citationId: string;
  displayText: string;
}

export interface AxosFieldInline {
  id: AxosDocumentNodeId;
  type: "field";
  fieldId: string;
  fieldType:
    | "page_number"
    | "page_count"
    | "date"
    | "document_title"
    | "custom";
  expression: string;
  cachedDisplay: string;
  refreshedAt: string | null;
}

export interface AxosContentControlInline {
  id: AxosDocumentNodeId;
  type: "content_control_span";
  controlId: string;
  content: AxosTextInline[];
}

export interface AxosBreakInline {
  id: AxosDocumentNodeId;
  type: "soft_break" | "tab";
}

export type AxosInline =
  | AxosTextInline
  | AxosHyperlinkInline
  | AxosBookmarkAnchorInline
  | AxosNoteReferenceInline
  | AxosCitationInline
  | AxosFieldInline
  | AxosContentControlInline
  | AxosBreakInline;

export interface AxosParagraphBlock {
  id: AxosDocumentNodeId;
  type: "paragraph";
  styleId: string;
  properties: AxosParagraphProperties;
  content: AxosInline[];
  numbering: {
    instanceId: string;
    level: number;
  } | null;
}

export interface AxosTableStyleProperties {
  borders?: {
    color: string;
    widthPt: number;
    style: "none" | "single" | "double" | "dashed";
  };
  shading?: string;
  cellMarginTwips?: number;
}

export interface AxosTableCell {
  id: AxosDocumentNodeId;
  colspan: number;
  rowspan: number;
  preferredWidthTwips: number | null;
  verticalAlignment: "top" | "center" | "bottom";
  shading: string | null;
  header: boolean;
  content: AxosParagraphBlock[];
}

export interface AxosTableRow {
  id: AxosDocumentNodeId;
  header: boolean;
  allowSplit: boolean;
  cells: AxosTableCell[];
}

export interface AxosTableBlock {
  id: AxosDocumentNodeId;
  type: "table";
  styleId: string | null;
  columnWidthsTwips: number[];
  preferredWidthTwips: number | null;
  alignment: "left" | "center" | "right";
  rows: AxosTableRow[];
  caption: string | null;
  altText: string | null;
}

export interface AxosImageBlock {
  id: AxosDocumentNodeId;
  type: "image";
  assetId: string;
  widthTwips: number;
  heightTwips: number;
  crop: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  wrap: "inline" | "square" | "top_bottom";
  alignment: "left" | "center" | "right";
  altText: string;
  caption: string | null;
}

export interface AxosPageBreakBlock {
  id: AxosDocumentNodeId;
  type: "page_break";
}

export interface AxosSectionBreakBlock {
  id: AxosDocumentNodeId;
  type: "section_break";
  sectionId: string;
  breakType: "continuous" | "next_page" | "odd_page" | "even_page";
}

export interface AxosTableOfContentsBlock {
  id: AxosDocumentNodeId;
  type: "table_of_contents";
  title: string;
  minLevel: number;
  maxLevel: number;
}

export interface AxosUnknownBlock {
  id: AxosDocumentNodeId;
  type: "unknown";
  originalType: string;
  preserved: boolean;
  payload: Record<string, unknown>;
}

export type AxosDocumentBlock =
  | AxosParagraphBlock
  | AxosTableBlock
  | AxosImageBlock
  | AxosPageBreakBlock
  | AxosSectionBreakBlock
  | AxosTableOfContentsBlock
  | AxosUnknownBlock;

export interface AxosNumberingLevel {
  level: number;
  format:
    | "bullet"
    | "decimal"
    | "lower_letter"
    | "upper_letter"
    | "lower_roman"
    | "upper_roman";
  pattern: string;
  start: number;
  restartAfterLevel: number | null;
  indentTwips: number;
  hangingTwips: number;
  tabStopTwips: number;
  paragraphStyleId: string | null;
}

export interface AxosNumberingDefinition {
  id: string;
  name: string;
  levels: AxosNumberingLevel[];
}

export interface AxosNumberingInstance {
  id: string;
  definitionId: string;
  levelOverrides: Array<{ level: number; start: number }>;
}

export interface AxosHeaderFooterDefinition {
  id: string;
  kind: "header" | "footer";
  variant: "default" | "first" | "even";
  blocks: AxosDocumentBlock[];
}

export interface AxosSection {
  id: string;
  page: AxosPageDefaults;
  headerRefs: {
    default: string | null;
    first: string | null;
    even: string | null;
  };
  footerRefs: {
    default: string | null;
    first: string | null;
    even: string | null;
  };
  differentFirstPage: boolean;
  differentOddEven: boolean;
  pageNumbering: {
    format: "decimal" | "upper_roman" | "lower_roman";
    restartAt: number | null;
  };
  verticalAlignment: "top" | "center" | "bottom";
  lineNumbering: boolean;
  border: AxosTableStyleProperties["borders"] | null;
  footnotePolicy: "continuous" | "restart_each_section";
  endnotePolicy: "end_document" | "end_section";
}

export interface AxosTextAnchor {
  blockId: string;
  start: {
    inlineId: string;
    offset: number;
    bias: "before" | "after";
  };
  end: {
    inlineId: string;
    offset: number;
    bias: "before" | "after";
  };
  quote: {
    exact: string;
    prefix: string;
    suffix: string;
  };
}

export interface AxosCommentReply {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface AxosCommentThread {
  id: string;
  threadId: string;
  anchor: AxosTextAnchor;
  authorId: string;
  body: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  replies: AxosCommentReply[];
}

export interface AxosRevision {
  id: string;
  type: "insertion" | "deletion" | "format";
  authorId: string;
  createdAt: string;
  status: "pending" | "accepted" | "rejected";
  anchor: AxosTextAnchor;
  before: AxosInline[];
  after: AxosInline[];
  description: string;
}

export interface AxosBookmark {
  id: string;
  name: string;
  anchor: AxosTextAnchor;
}

export interface AxosNote {
  id: string;
  kind: "footnote" | "endnote";
  blocks: AxosDocumentBlock[];
}

export interface AxosCitation {
  id: string;
  sourceType: string;
  title: string;
  author: string | null;
  url: string | null;
  accessedAt: string | null;
}

export interface AxosContentControl {
  id: string;
  title: string;
  tag: string;
  kind: "plain_text" | "rich_text" | "date" | "choice" | "repeating";
  locked: boolean;
  required: boolean;
  bindingId: string | null;
}

export interface AxosAssetReference {
  id: string;
  blobId: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
  altText: string;
  provenance: {
    source: "upload" | "docx_import" | "template" | "generated";
    originalFilename: string | null;
    importedAt: string;
  };
}

export interface AxosDataBinding {
  id: string;
  datasetRef: string;
  contractVersion: string;
  query: Record<string, string | number | boolean | null>;
  sourceVersion: string | null;
  refreshedAt: string | null;
  frozenAt: string | null;
  lineage: string[];
  sensitivity: DocumentClassification;
  policy: "manual" | "before_review" | "before_publication" | "frozen";
}

export interface AxosBusinessLink {
  id: string;
  targetType: DocumentLinkTargetType;
  targetId: string;
  label: string;
  sourceVersion: string | null;
  linkedAt: string;
}

export interface AxosAccessibilityMetadata {
  title: string;
  language: string;
  decorativeAssetIds: string[];
}

export type AxosCompatibilitySeverity = "info" | "warning" | "loss";

export interface AxosCompatibilityIssue {
  code: string;
  severity: AxosCompatibilitySeverity;
  feature: string;
  message: string;
  affectedNodeIds: string[];
}

export interface AxosCompatibilityReport {
  direction: "import" | "export" | "round_trip";
  format: "docx" | "pdf";
  supportedFeatures: string[];
  preservedFeatures: string[];
  issues: AxosCompatibilityIssue[];
  generatedAt: string;
}

export interface AxosReviewState {
  suggestionMode: AxosSuggestionMode;
  displayMode: AxosReviewDisplayMode;
}

export interface AxosDocumentSnapshot {
  schemaVersion: typeof AXOS_DOCUMENT_SCHEMA_VERSION;
  documentId: AxosDocumentId;
  locale: string;
  language: string;
  metadata: AxosDocumentMetadata;
  pageDefaults: AxosPageDefaults;
  theme: AxosTheme;
  namedStyles: AxosNamedStyle[];
  numberingDefinitions: AxosNumberingDefinition[];
  numberingInstances: AxosNumberingInstance[];
  sections: AxosSection[];
  body: AxosDocumentBlock[];
  headers: AxosHeaderFooterDefinition[];
  footers: AxosHeaderFooterDefinition[];
  footnotes: AxosNote[];
  endnotes: AxosNote[];
  comments: AxosCommentThread[];
  revisions: AxosRevision[];
  bookmarks: AxosBookmark[];
  citations: AxosCitation[];
  contentControls: AxosContentControl[];
  assets: AxosAssetReference[];
  dataBindings: AxosDataBinding[];
  businessLinks: AxosBusinessLink[];
  accessibility: AxosAccessibilityMetadata;
  compatibility: AxosCompatibilityReport[];
  review: AxosReviewState;
}

export interface AxosDocumentAccessControl {
  users: Array<{
    principalId: string;
    role: "reader" | "reviewer" | "editor" | "owner";
  }>;
  roles: Array<{
    role: string;
    access: "read" | "review" | "edit";
  }>;
}

export interface AxosAuthoringRevisionRecord {
  id: string;
  documentId: string;
  revisionNumber: number;
  state: AxosRevisionState;
  snapshotHash: string;
  createdBy: string;
  changeSummary: string;
  createdAt: string;
  releasedAt: string | null;
  publishedDocumentId: string | null;
  publishedVersionId: string | null;
}

export interface AxosAuthoringDocumentSummary {
  id: string;
  name: string;
  status: AxosDocumentStatus;
  ownerId: string;
  classification: DocumentClassification;
  workingRevision: number;
  currentRevisionId: string;
  lastPublishedAt: string | null;
  publishedDocumentId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AxosAuthoringDocumentDetail extends AxosAuthoringDocumentSummary {
  snapshot: AxosDocumentSnapshot;
  snapshotHash: string;
  accessControl: AxosDocumentAccessControl;
  revisions: AxosAuthoringRevisionRecord[];
}

export interface AxosCreateDocumentRequest {
  name: string;
  description?: string;
  classification?: DocumentClassification;
  template?: "blank" | "sop";
  businessLink?: Pick<AxosBusinessLink, "targetType" | "targetId" | "label">;
  idempotencyKey?: string;
}

export interface AxosSaveDocumentRequest {
  expectedRevision: number;
  snapshot: AxosDocumentSnapshot;
  changeSummary: string;
  idempotencyKey?: string;
}

export interface AxosApplyCommandRequest {
  expectedRevision: number;
  command: AxosDocumentCommand;
  changeSummary?: string;
  idempotencyKey?: string;
}

export interface AxosPublicationResult {
  authoringDocumentId: string;
  authoringRevisionId: string;
  publishedDocumentId: string;
  publishedVersionId: string;
  snapshotHash: string;
  pdfSha256: string;
  pageCount: number;
  releasedAt: string;
}

export interface AxosExportResultMetadata {
  filename: string;
  mimeType:
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/pdf";
  size: number;
  sha256: string;
  compatibility: AxosCompatibilityReport;
}

export type AxosTextCommand =
  | {
      type: "insertText";
      anchor: AxosTextAnchor;
      text: string;
      actorId: string;
    }
  | {
      type: "deleteRange";
      anchor: AxosTextAnchor;
      actorId: string;
    }
  | {
      type: "replaceRange";
      anchor: AxosTextAnchor;
      text: string;
      actorId: string;
    }
  | {
      type: "applyMark";
      anchor: AxosTextAnchor;
      mark: AxosInlineMark;
      actorId: string;
    }
  | {
      type: "clearFormatting";
      anchor: AxosTextAnchor;
      actorId: string;
    };

export type AxosParagraphCommand =
  | {
      type: "setParagraphStyle";
      blockId: string;
      styleId: string;
      actorId: string;
    }
  | {
      type: "setParagraphProperties";
      blockId: string;
      properties: AxosParagraphProperties;
      actorId: string;
    }
  | {
      type: "insertParagraph";
      afterBlockId: string | null;
      text: string;
      styleId?: string;
      actorId: string;
    }
  | {
      type: "splitParagraph";
      anchor: AxosTextAnchor;
      actorId: string;
    }
  | {
      type: "mergeParagraphs";
      firstBlockId: string;
      secondBlockId: string;
      actorId: string;
    };

export type AxosListCommand =
  | {
      type: "insertList";
      blockIds: string[];
      definitionId: string;
      actorId: string;
    }
  | {
      type: "indentList" | "outdentList";
      blockId: string;
      actorId: string;
    }
  | {
      type: "restartNumbering";
      blockId: string;
      start: number;
      actorId: string;
    };

export type AxosTableCommand =
  | {
      type: "insertTable";
      afterBlockId: string | null;
      rows: number;
      columns: number;
      actorId: string;
    }
  | {
      type: "addRow";
      tableId: string;
      afterRowId: string | null;
      actorId: string;
    }
  | {
      type: "addColumn";
      tableId: string;
      afterColumn: number;
      actorId: string;
    }
  | {
      type: "mergeCells";
      tableId: string;
      cellIds: string[];
      actorId: string;
    }
  | {
      type: "splitCell";
      tableId: string;
      cellId: string;
      rows: number;
      columns: number;
      actorId: string;
    }
  | {
      type: "deleteRow";
      tableId: string;
      rowId: string;
      actorId: string;
    }
  | {
      type: "deleteColumn";
      tableId: string;
      column: number;
      actorId: string;
    }
  | { type: "deleteTable"; tableId: string; actorId: string };

export type AxosStructureCommand =
  | {
      type: "insertImage";
      afterBlockId: string | null;
      assetId: string;
      widthTwips: number;
      heightTwips: number;
      altText: string;
      actorId: string;
    }
  | {
      type: "updateImage";
      imageId: string;
      widthTwips?: number;
      heightTwips?: number;
      altText?: string;
      alignment?: "left" | "center" | "right";
      actorId: string;
    }
  | {
      type: "insertPageBreak";
      afterBlockId: string | null;
      actorId: string;
    }
  | {
      type: "insertTableOfContents";
      afterBlockId: string | null;
      title: string;
      minLevel: number;
      maxLevel: number;
      actorId: string;
    }
  | {
      type: "insertSectionBreak";
      afterBlockId: string | null;
      section: AxosSection;
      breakType: AxosSectionBreakBlock["breakType"];
      actorId: string;
    }
  | {
      type: "updateSection";
      sectionId: string;
      section: Partial<AxosSection>;
      actorId: string;
    }
  | {
      type: "updateHeaderFooter";
      definition: AxosHeaderFooterDefinition;
      actorId: string;
    }
  | {
      type: "insertBookmark";
      bookmark: AxosBookmark;
      actorId: string;
    }
  | {
      type: "insertFootnote";
      anchor: AxosTextAnchor;
      note: AxosNote;
      actorId: string;
    };

export type AxosReviewCommand =
  | {
      type: "addComment";
      comment: AxosCommentThread;
      actorId: string;
    }
  | {
      type: "resolveComment";
      commentId: string;
      actorId: string;
    }
  | {
      type: "enableSuggestionMode";
      enabled: boolean;
      actorId: string;
    }
  | {
      type: "acceptRevision" | "rejectRevision";
      revisionId: string;
      actorId: string;
    };

export type AxosAutomationCommand =
  | { type: "refreshField"; fieldId: string; actorId: string }
  | {
      type: "applyTemplate";
      templateId: string;
      actorId: string;
    };

export type AxosDocumentCommand =
  | AxosTextCommand
  | AxosParagraphCommand
  | AxosListCommand
  | AxosTableCommand
  | AxosStructureCommand
  | AxosReviewCommand
  | AxosAutomationCommand;

export type AxosDocumentPatchCollection =
  | "body"
  | "sections"
  | "headers"
  | "footers"
  | "comments"
  | "revisions"
  | "bookmarks"
  | "footnotes"
  | "endnotes"
  | "citations"
  | "contentControls"
  | "assets"
  | "dataBindings"
  | "businessLinks"
  | "numberingInstances";

export type AxosDocumentPatchOperation =
  | {
      op: "upsert";
      collection: AxosDocumentPatchCollection;
      id: string;
      before: unknown | null;
      after: unknown;
    }
  | {
      op: "remove";
      collection: AxosDocumentPatchCollection;
      id: string;
      before: unknown;
    }
  | {
      op: "reorder";
      collection: AxosDocumentPatchCollection;
      before: string[];
      after: string[];
    }
  | {
      op: "replace";
      property:
        | "metadata"
        | "pageDefaults"
        | "theme"
        | "namedStyles"
        | "numberingDefinitions"
        | "accessibility"
        | "compatibility"
        | "review";
      before: unknown;
      after: unknown;
    };

export interface AxosDocumentPatch {
  operations: AxosDocumentPatchOperation[];
}

export interface AxosCommandSuccess {
  ok: true;
  snapshot: AxosDocumentSnapshot;
  patch: AxosDocumentPatch;
  inversePatch: AxosDocumentPatch;
  command: AxosDocumentCommand["type"];
}

export interface AxosCommandFailure {
  ok: false;
  error: {
    code:
      | "invalid_snapshot"
      | "invalid_anchor"
      | "not_found"
      | "precondition_failed"
      | "unsupported";
    message: string;
    nodeId?: string;
  };
}

export type AxosCommandResult = AxosCommandSuccess | AxosCommandFailure;

export interface AxosValidationFinding {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface AxosValidationResult {
  valid: boolean;
  findings: AxosValidationFinding[];
}

export interface AxosLayoutPage {
  pageNumber: number;
  sectionId: string;
  blockIds: string[];
  estimatedHeightTwips: number;
  forcedBreak: boolean;
}

export interface AxosLayoutResult {
  pages: AxosLayoutPage[];
  warnings: string[];
}
