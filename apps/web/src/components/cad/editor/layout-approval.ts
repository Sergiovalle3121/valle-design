// Approval / sign-off (ported from the 2D host, unify)
export type ApprovalStatus = "draft" | "in_review" | "approved";
export interface LayoutApproval {
  status: ApprovalStatus;
  by: string | null;
  at: string | null;
  note: string | null;
}
export const APPROVAL_META: Record<ApprovalStatus, { label: string; color: string }> =
  {
    draft: { label: "Borrador", color: "#94a3b8" },
    in_review: { label: "En revisión", color: "#f59e0b" },
    approved: { label: "Aprobado", color: "#10b981" },
  };
