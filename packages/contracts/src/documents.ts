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
    };
