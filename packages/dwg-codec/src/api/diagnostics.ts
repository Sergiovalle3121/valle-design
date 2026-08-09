export type DwgDiagnosticSeverity = "info" | "warning" | "error";

export interface DwgDiagnostic {
  readonly code: string;
  readonly severity: DwgDiagnosticSeverity;
  readonly offset: number;
  readonly message: string;
}

export type DwgLossScope = "container" | "database" | "entity";
export type DwgLossSubjectKind = "source" | "object";

export interface DwgLossSubject {
  readonly kind: DwgLossSubjectKind;
  /** Deterministic identifier; never a display label or array position. */
  readonly stableId: string;
}

export interface DwgLossEntry {
  readonly code: string;
  readonly severity: DwgDiagnosticSeverity;
  readonly scope: DwgLossScope;
  readonly subject: DwgLossSubject;
  readonly message: string;
}

export const EMPTY_DWG_DIAGNOSTICS: readonly DwgDiagnostic[] = Object.freeze(
  [],
);
export const EMPTY_DWG_LOSS_MANIFEST: readonly DwgLossEntry[] = Object.freeze(
  [],
);
