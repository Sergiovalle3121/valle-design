export type DocumentStatus = "ready" | "processing" | "rejected" | "archived";

export type DocumentClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted";

export type DocumentProcessingState =
  | "pending"
  | "ready"
  | "failed"
  | "quarantined";

export type MalwareScanState =
  | "not_configured"
  | "pending"
  | "clean"
  | "rejected";

export type DocumentVersionSource =
  | "upload"
  | "page_operation"
  | "content_edit"
  | "watermark"
  | "form_fill"
  | "visual_aid_bridge";

export interface DocumentSummary {
  id: string;
  name: string;
  description: string | null;
  documentType: "pdf";
  mimeType: "application/pdf";
  status: DocumentStatus;
  currentVersionId: string;
  ownerId: string;
  classification: DocumentClassification;
  tags: string[];
  metadata: Record<string, string | number | boolean | null>;
  versionNumber: number;
  size: number;
  sha256: string;
  pageCount: number;
  processingState: DocumentProcessingState;
  malwareScanState: MalwareScanState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionNumber: number;
  size: number;
  sha256: string;
  mimeDetected: "application/pdf";
  pageCount: number;
  source: DocumentVersionSource;
  changeComment: string | null;
  parentVersionId: string | null;
  createdBy: string;
  processingState: DocumentProcessingState;
  malwareScanState: MalwareScanState;
  createdAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  versions: DocumentVersionRecord[];
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DocumentAnnotationKind =
  | "highlight"
  | "underline"
  | "strikeout"
  | "free_text"
  | "sticky_note"
  | "ink"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "stamp"
  | "redaction_mark";

export interface DocumentAnnotationStyle {
  color: string;
  opacity: number;
  strokeWidth: number;
  fontSize?: number;
}

export type DocumentAnnotationGeometry =
  | { shape: "box"; box: NormalizedBox }
  | { shape: "line"; from: NormalizedPoint; to: NormalizedPoint }
  | { shape: "path"; points: NormalizedPoint[] };

export interface DocumentAnnotationRecord {
  id: string;
  documentId: string;
  versionId: string;
  pageNumber: number;
  kind: DocumentAnnotationKind;
  geometry: DocumentAnnotationGeometry;
  style: DocumentAnnotationStyle;
  content: string | null;
  status: "open" | "resolved";
  revision: number;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentLinkTargetType =
  | "visual_aid"
  | "work_order"
  | "routing_operation"
  | "work_instruction"
  | "bom"
  | "material"
  | "ncr"
  | "capa"
  | "quality_inspection"
  | "supplier"
  | "purchase_order"
  | "invoice"
  | "maintenance_asset"
  | "customer";

export interface DocumentLinkRecord {
  id: string;
  documentId: string;
  versionId: string | null;
  targetType: DocumentLinkTargetType;
  targetId: string;
  createdBy: string;
  createdAt: string;
}

export type PdfSupportedFont = "helvetica" | "times_roman" | "courier";

export type PdfOrganizerPage =
  | {
      kind: "source";
      pageNumber: number;
      rotation?: 0 | 90 | 180 | 270;
    }
  | {
      kind: "blank";
      width?: number;
      height?: number;
    };

export type PdfStudioOperation =
  | {
      type: "rotate_pages";
      baseVersionId: string;
      pages: number[];
      rotation: 90 | 180 | 270;
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "delete_pages";
      baseVersionId: string;
      pages: number[];
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "reorder_pages";
      baseVersionId: string;
      order: number[];
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "insert_blank_page";
      baseVersionId: string;
      afterPage: number;
      width?: number;
      height?: number;
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "watermark";
      baseVersionId: string;
      text: string;
      pages?: number[];
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "organize_pages";
      baseVersionId: string;
      layout: PdfOrganizerPage[];
      comment?: string;
      idempotencyKey?: string;
    }
  | {
      type: "add_text";
      baseVersionId: string;
      pageNumber: number;
      box: NormalizedBox;
      text: string;
      font: PdfSupportedFont;
      fontSize: number;
      color: string;
      rotation: 0 | 90 | 180 | 270;
      comment?: string;
      idempotencyKey?: string;
    };

export interface AddPdfImageOperation {
  baseVersionId: string;
  pageNumber: number;
  box: NormalizedBox;
  rotation: 0 | 90 | 180 | 270;
  comment?: string;
  idempotencyKey?: string;
}

export type DocumentFormFieldKind =
  | "text"
  | "checkbox"
  | "radio"
  | "select"
  | "button"
  | "signature"
  | "unsupported";

export type DocumentFormValue = string | string[] | boolean | null;

export interface DocumentFormFieldRecord {
  name: string;
  kind: DocumentFormFieldKind;
  value: DocumentFormValue;
  options: string[];
  readOnly: boolean;
  required: boolean;
}

export interface DocumentFormInventory {
  documentId: string;
  versionId: string;
  xfa: "none" | "not_supported";
  fields: DocumentFormFieldRecord[];
}

export interface DocumentFormValuePatch {
  name: string;
  value: string | string[] | boolean;
}

export interface DocumentFormDifference {
  name: string;
  kind: DocumentFormFieldKind;
  before: DocumentFormValue;
  after: DocumentFormValue;
}

export type DocumentActionProposalState = "proposed" | "accepted" | "rejected";

export interface DocumentNcrDraft {
  partNumber: string;
  category: string;
  description: string;
  sourceType:
    | "incoming"
    | "in-process"
    | "outgoing"
    | "warehouse"
    | "supplier"
    | "customer";
  quantityAffected: number;
  severity: "minor" | "major" | "critical";
  workOrder: string | null;
}

export interface DocumentProposalEvidence {
  fieldName: string;
  pageNumber: number | null;
  region: NormalizedBox | null;
  sourceSha256: string;
}

export interface DocumentActionProposalRecord {
  id: string;
  documentId: string;
  versionId: string;
  proposalType: "ncr_draft";
  state: DocumentActionProposalState;
  payload: DocumentNcrDraft;
  evidence: DocumentProposalEvidence[];
  source: "acroform_mapping";
  strategyVersion: "acroform-ncr-v1";
  createdBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
