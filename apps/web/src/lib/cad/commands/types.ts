/** Pure CAD command contract for the AXOS CAD Copilot.
 * No React, three.js, API, or OpenAI dependency belongs in this layer.
 */
export type CadCommandId =
  | "create_clearance_aisle"
  | "align_selection"
  | "distribute_selection"
  | "connect_flow"
  | "arrange_line"
  | "arrange_flow_line"
  | "arrange_rack_rows"
  | "analyze_line_balance"
  | "measure_distance"
  | "find_collisions"
  | "validate_layout"
  | "fit_to_view";

export type CadCommandCategory = "layout" | "flow" | "analysis" | "viewport";
export type CadIssueLevel = "info" | "warning" | "error";
export type CadCommandStatus =
  | "parsed"
  | "previewed"
  | "applied"
  | "undone"
  | "failed";
export type CadObjectType = "station" | "asset";
export type CadUnit = "mm" | "m" | "in" | "ft";

export interface CadBox {
  id: string;
  type: CadObjectType;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  sequence?: number;
}

export interface CadConnectorInput {
  from: string;
  to: string;
  kind?: string;
}

export interface CadCommandContext {
  unit: CadUnit | string;
  footprintW: number;
  footprintH: number;
  objects: CadBox[];
  selectedIds: string[];
  connectors?: CadConnectorInput[];
}

export interface CadValidationIssue {
  level: CadIssueLevel;
  code: string;
  message: string;
  objectIds?: string[];
}

export type CadOperation =
  | { type: "move"; objectId: string; before: CadBox; after: CadBox }
  | { type: "connect"; from: string; to: string; kind: string }
  | {
      type: "measure";
      from: string;
      to: string;
      distance: number;
      unit: string;
    }
  | { type: "focus"; objectIds: string[] }
  | { type: "report"; title: string; rows: { label: string; value: string }[] };

export interface CadCommandPreview {
  summary: string;
  affectedObjectIds: string[];
  operations: CadOperation[];
  issues: CadValidationIssue[];
}

export interface CadCommandResult extends CadCommandPreview {
  applied: boolean;
  historyLabel: string;
}

export type CadCommandInput =
  | {
      id: "create_clearance_aisle";
      targetA?: string;
      targetB?: string;
      distance: number;
      unit?: CadUnit | string;
      axis?: "x" | "y";
    }
  | {
      id: "align_selection";
      mode: "left" | "center" | "right" | "top" | "middle" | "bottom";
      objectIds?: string[];
    }
  | {
      id: "distribute_selection";
      axis: "horizontal" | "vertical";
      objectIds?: string[];
    }
  | { id: "connect_flow"; from?: string; to?: string; objectIds?: string[] }
  | {
      id: "arrange_line";
      direction?: "left_to_right" | "top_to_bottom";
      objectIds?: string[];
    }
  | {
      id: "arrange_flow_line";
      direction?: "left_to_right" | "top_to_bottom";
      objectIds?: string[];
      gap?: number;
      margin?: number;
    }
  | {
      id: "arrange_rack_rows";
      orientation?: "horizontal" | "vertical";
      objectIds?: string[];
      rows?: number;
      baysPerRow?: number;
      bayGap?: number;
      aisleWidth?: number;
      margin?: number;
    }
  | {
      id: "analyze_line_balance";
      objectIds?: string[];
      taktTimeSec?: number;
      cycleTimes?: Record<string, number>;
    }
  | { id: "measure_distance"; targetA?: string; targetB?: string }
  | { id: "find_collisions"; objectIds?: string[] }
  | { id: "validate_layout"; objectIds?: string[]; requiredClearance?: number }
  | { id: "fit_to_view"; objectIds?: string[] };

export interface CadCommandSchemaField {
  type: "string" | "number" | "enum" | "string[]" | "object";
  required?: boolean;
  description: string;
  enum?: string[];
}

export interface CadCommandDefinition<
  TInput extends CadCommandInput = CadCommandInput,
> {
  id: TInput["id"];
  label: string;
  description: string;
  category: CadCommandCategory;
  inputSchema: Record<string, CadCommandSchemaField>;
  examples: string[];
  validate(input: TInput, context: CadCommandContext): CadValidationIssue[];
  preview(input: TInput, context: CadCommandContext): CadCommandPreview;
  execute(input: TInput, context: CadCommandContext): CadCommandResult;
}

export interface CadCommandHistoryItem {
  id: string;
  commandId: CadCommandId;
  input: CadCommandInput;
  label: string;
  status: CadCommandStatus;
  createdAt: string;
  preview?: CadCommandPreview;
  result?: CadCommandResult;
}

export interface CadParseResult {
  ok: boolean;
  input?: CadCommandInput;
  confidence: number;
  clarification?: string;
  error?: string;
}
