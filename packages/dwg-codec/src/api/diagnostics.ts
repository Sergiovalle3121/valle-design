export type DwgDiagnosticSeverity = "info" | "warning" | "error";

export interface DwgDiagnostic {
  readonly code: string;
  readonly severity: DwgDiagnosticSeverity;
  readonly offset: number;
  readonly message: string;
}

export interface DwgLossEntry {
  readonly code: string;
  readonly scope: "container" | "database" | "entity";
  readonly message: string;
}

export const EMPTY_DWG_DIAGNOSTICS: readonly DwgDiagnostic[] = Object.freeze(
  [],
);
export const EMPTY_DWG_LOSS_MANIFEST: readonly DwgLossEntry[] = Object.freeze(
  [],
);
