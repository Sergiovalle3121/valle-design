export const SHEETS_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SheetScalar = null | string | number | boolean;

export type SheetErrorCode =
  | "#DIV/0!"
  | "#VALUE!"
  | "#REF!"
  | "#NAME?"
  | "#NUM!"
  | "#N/A"
  | "#CYCLE!"
  | "#PARSE!"
  | "#LIMIT!"
  | "#SPILL!";

export interface SheetErrorValue {
  kind: "error";
  code: SheetErrorCode;
  message: string;
  position?: number;
  details?: Record<string, string | number | boolean>;
}

export interface SheetArrayValue {
  kind: "array";
  rows: SheetComputedValue[][];
}

export type SheetComputedValue =
  | SheetScalar
  | SheetErrorValue
  | SheetArrayValue;

export type SheetNumberFormat =
  | "general"
  | "integer"
  | "decimal"
  | "percent"
  | "currency"
  | "accounting"
  | "date"
  | "time"
  | "scientific"
  | "custom";

export interface SheetCellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textColor?: string;
  fillColor?: string;
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrap?: boolean;
  numberFormat?: SheetNumberFormat;
  numberFormatCode?: string;
  currencyCode?: string;
  decimalPlaces?: number;
}

export interface BusinessEntityReference {
  kind: "business_reference";
  entityType:
    | "material"
    | "purchase_order"
    | "work_order"
    | "warehouse"
    | "document"
    | "worker"
    | "certified_kpi";
  entityId: string;
  display: string;
  field?: string;
  snapshotAt?: string;
}

/**
 * Identifies a calculated dynamic-array projection. The formula only lives in
 * the owner cell; projected cells carry the owner coordinate and their offset
 * so clients can select the whole spill and reject direct edits.
 */
export interface SheetSpillMetadata {
  ownerWorksheetId: string;
  ownerRow: number;
  ownerColumn: number;
  rowOffset: number;
  columnOffset: number;
  rowCount: number;
  columnCount: number;
}

export interface SheetCell {
  literal?: SheetScalar;
  formula?: string;
  computed?: SheetComputedValue;
  style?: SheetCellStyle;
  businessReference?: BusinessEntityReference;
  note?: string;
  spill?: SheetSpillMetadata;
}

/**
 * Sparse cells in a bounded tile. Keys are local `row:column` coordinates,
 * zero-based inside the tile. Empty cells are absent.
 */
export interface SheetCellChunk {
  rowStart: number;
  columnStart: number;
  rowCount: number;
  columnCount: number;
  cells: Record<string, SheetCell>;
}

export interface SheetFreezePanes {
  rows: number;
  columns: number;
}

export interface SheetMergedRange {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

export interface SheetNamedExpression {
  id: string;
  name: string;
  scopeWorksheetId?: string;
  formula: string;
}

export interface SheetTableColumn {
  id: string;
  name: string;
  inferredType?: "mixed" | "text" | "number" | "boolean" | "date";
  calculatedFormula?: string;
  totalFunction?: "sum" | "average" | "count" | "min" | "max" | "custom";
}

export interface SheetTableFilter {
  columnId: string;
  kind: "values" | "text_contains" | "number" | "date" | "blanks";
  values?: SheetScalar[];
  operator?: "=" | "<>" | "<" | "<=" | ">" | ">=";
  operand?: SheetScalar;
}

export interface SheetTableSort {
  columnId: string;
  direction: "ascending" | "descending";
  priority: number;
}

export interface SheetTableDefinition {
  id: string;
  worksheetId: string;
  name: string;
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
  headerRow: boolean;
  totalRow: boolean;
  bandedRows: boolean;
  columns?: SheetTableColumn[];
  filters?: SheetTableFilter[];
  sorts?: SheetTableSort[];
  styleName?: string;
}

export interface SheetChartSeries {
  id: string;
  name: string;
  categoriesRange?: string;
  valuesRange: string;
  color?: string;
}

export interface SheetChartDefinition {
  id: string;
  worksheetId: string;
  type: "bar" | "line" | "area" | "pie" | "scatter";
  title: string;
  anchorRow: number;
  anchorColumn: number;
  width: number;
  height: number;
  series: SheetChartSeries[];
  altText: string;
}

export interface SheetConditionalFormatRule {
  id: string;
  worksheetId: string;
  range: string;
  kind: "greater_than" | "less_than" | "equal_to" | "text_contains";
  operand: SheetScalar;
  style: SheetCellStyle;
}

export interface SheetDataValidationRule {
  id: string;
  worksheetId: string;
  range: string;
  kind: "list" | "number" | "date";
  values?: SheetScalar[];
  minimum?: number;
  maximum?: number;
  message?: string;
}

export interface SheetBusinessBinding {
  id: string;
  worksheetId: string;
  dataset: "inventory_positions";
  anchorRow: number;
  anchorColumn: number;
  columns: string[];
  filters: Record<string, string>;
  refreshedAt: string;
  sourceVersion: string;
  rowCount: number;
  stale: boolean;
}

export interface SheetWorksheet {
  id: string;
  name: string;
  position: number;
  hidden: boolean;
  color?: string;
  rowCount: number;
  columnCount: number;
  defaultRowHeight: number;
  defaultColumnWidth: number;
  freezePanes: SheetFreezePanes;
  chunks: SheetCellChunk[];
  mergedRanges: SheetMergedRange[];
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  hiddenRows?: Record<string, boolean>;
  hiddenColumns?: Record<string, boolean>;
}

export interface SheetWorkbookSnapshot {
  schemaVersion: typeof SHEETS_SNAPSHOT_SCHEMA_VERSION;
  activeWorksheetId: string;
  worksheets: SheetWorksheet[];
  namedExpressions: SheetNamedExpression[];
  tables: SheetTableDefinition[];
  charts: SheetChartDefinition[];
  conditionalFormats: SheetConditionalFormatRule[];
  dataValidations: SheetDataValidationRule[];
  bindings: SheetBusinessBinding[];
  locale: string;
  timezone: string;
  dateSystem: "1900" | "1904";
}

export type SheetWorkbookRole = "owner" | "editor" | "commenter" | "viewer";

export interface SheetWorkbookSummary {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  role: SheetWorkbookRole;
  revision: number;
  currentVersionId: string | null;
  classification: "internal" | "confidential" | "restricted";
  createdAt: string;
  updatedAt: string;
}

export interface SheetWorkbookVersion {
  id: string;
  workbookId: string;
  versionNumber: number;
  parentVersionId: string | null;
  sha256: string;
  changeComment: string | null;
  createdBy: string;
  createdAt: string;
  snapshot: SheetWorkbookSnapshot;
  compatibilityReport: SheetCompatibilityReport;
}

export interface SheetWorkbookDetail extends SheetWorkbookSummary {
  snapshot: SheetWorkbookSnapshot;
  versions: Omit<SheetWorkbookVersion, "snapshot">[];
  grants: SheetShareGrant[];
}

export interface SheetShareGrant {
  id: string;
  workbookId: string;
  principalType: "user";
  principalId: string;
  role: Exclude<SheetWorkbookRole, "owner">;
  canExport: boolean;
  canConnectData: boolean;
  createdBy: string;
  createdAt: string;
}

export type SheetProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "expired";

export interface SheetWorkbookProposal {
  id: string;
  workbookId: string;
  versionId: string;
  type: "inventory_replenishment";
  status: SheetProposalStatus;
  title: string;
  rationale: string;
  inputRange: string;
  evidence: Array<{
    entityType: "inventory_position";
    entityId: string;
    label: string;
  }>;
  diff: Array<{
    partNumber: string;
    warehouseId: string;
    currentAvailable: number;
    proposedQuantity: number;
  }>;
  createdBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
}

export type SheetCompatibilityState =
  | "editable"
  | "preserved"
  | "flattened"
  | "dropped_with_warning"
  | "blocked"
  | "unsupported";

export interface SheetCompatibilityItem {
  capability: string;
  importState: SheetCompatibilityState;
  editState: SheetCompatibilityState;
  calculateState: SheetCompatibilityState;
  exportState: SheetCompatibilityState;
  preserveState: SheetCompatibilityState;
  detail: string;
}

export interface SheetCompatibilityReport {
  format: "native" | "xlsx" | "csv" | "tsv";
  warnings: string[];
  items: SheetCompatibilityItem[];
}

export interface SheetDatasetDefinition {
  key: "inventory_positions";
  label: string;
  description: string;
  permission: "inventory:read";
  columns: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date";
  }>;
}

export interface SheetDatasetResult {
  definition: SheetDatasetDefinition;
  refreshedAt: string;
  sourceVersion: string;
  filters: Record<string, string>;
  rows: Array<Record<string, SheetScalar>>;
}

export interface SheetCalculationReport {
  evaluatedCells: number;
  dirtyCells: number;
  dependencyEdges: number;
  cycles: string[][];
  parseErrors: number;
  durationMs: number;
}

export interface SheetSaveResult {
  workbook: SheetWorkbookSummary;
  version: SheetWorkbookVersion;
  calculation: SheetCalculationReport;
}

export const SHEETS_DATASETS: SheetDatasetDefinition[] = [
  {
    key: "inventory_positions",
    label: "Posiciones de inventario",
    description:
      "Existencia autorizada por parte, almacén, ubicación, lote y estado.",
    permission: "inventory:read",
    columns: [
      { key: "positionId", label: "ID posición", type: "text" },
      { key: "partNumber", label: "Parte", type: "text" },
      { key: "description", label: "Descripción", type: "text" },
      { key: "warehouseId", label: "Almacén", type: "text" },
      { key: "location", label: "Ubicación", type: "text" },
      { key: "onHand", label: "Existencia", type: "number" },
      { key: "allocated", label: "Reservado", type: "number" },
      { key: "available", label: "Disponible", type: "number" },
      { key: "inTransit", label: "En tránsito", type: "number" },
      { key: "standardCost", label: "Costo estándar", type: "number" },
      { key: "holdStatus", label: "Estado", type: "text" },
      { key: "lotNumber", label: "Lote", type: "text" },
      { key: "expiresAt", label: "Caducidad", type: "date" },
    ],
  },
];

export function createEmptySheetSnapshot(
  worksheetId = "sheet-1",
  worksheetName = "Hoja 1",
): SheetWorkbookSnapshot {
  return {
    schemaVersion: SHEETS_SNAPSHOT_SCHEMA_VERSION,
    activeWorksheetId: worksheetId,
    worksheets: [
      {
        id: worksheetId,
        name: worksheetName,
        position: 0,
        hidden: false,
        rowCount: 1000,
        columnCount: 50,
        defaultRowHeight: 28,
        defaultColumnWidth: 120,
        freezePanes: { rows: 1, columns: 0 },
        chunks: [],
        mergedRanges: [],
        columnWidths: {},
        rowHeights: {},
      },
    ],
    namedExpressions: [],
    tables: [],
    charts: [],
    conditionalFormats: [],
    dataValidations: [],
    bindings: [],
    locale: "es-MX",
    timezone: "America/Mexico_City",
    dateSystem: "1900",
  };
}
