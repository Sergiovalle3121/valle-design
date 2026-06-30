import type { CadCollisionBox, CadCollisionHit } from "./collisions";
import {
  detectCadCollisions,
  findClearanceIssues,
  type CadClearanceIssue,
} from "./collisions";
import type { CadFlowNode, CadFlowScore } from "./flow-optimization";
import { scoreFlowLayout } from "./flow-optimization";
import type { CadSafetyIssue, CadSafetyZone } from "./safety-zones";
import { evaluateSafetyZones } from "./safety-zones";

export interface CadValidationReport {
  collisions: CadCollisionHit[];
  clearances: CadClearanceIssue[];
  safety: CadSafetyIssue[];
  issues: CadValidationIssueRow[];
  flow?: CadFlowScore;
  severity: "ok" | "warning" | "critical";
}

export type CadValidationIssueCategory =
  | "collision"
  | "clearance"
  | "safety"
  | "flow";

export interface CadValidationIssueRow {
  id: string;
  category: CadValidationIssueCategory;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  affectedObjectIds: string[];
  actionLabel: string;
  suggestedFix: string;
}

function buildIssueRows(input: {
  collisions: CadCollisionHit[];
  clearances: CadClearanceIssue[];
  safety: CadSafetyIssue[];
  flow?: CadFlowScore;
}): CadValidationIssueRow[] {
  const rows: CadValidationIssueRow[] = [];

  for (const hit of input.collisions) {
    rows.push({
      id: `collision:${hit.aId}:${hit.bId}`,
      category: "collision",
      severity: "critical",
      title: `Collision: ${hit.aLabel} / ${hit.bLabel}`,
      detail: `Approx. overlap ${Math.round(hit.area)} square units.`,
      affectedObjectIds: [hit.aId, hit.bId],
      actionLabel: "Select collision pair",
      suggestedFix:
        "Move, align, or distribute one object until the overlap area reaches 0.",
    });
  }

  for (const issue of input.clearances) {
    rows.push({
      id: `clearance:${issue.aId}:${issue.bId}`,
      category: "clearance",
      severity: "warning",
      title: "Insufficient clearance",
      detail: `Current ${Math.round(issue.distance)}; required ${Math.round(issue.required)}.`,
      affectedObjectIds: [issue.aId, issue.bId],
      actionLabel: "Select clearance pair",
      suggestedFix:
        "Increase spacing or create an aisle until the pair meets the minimum clearance.",
    });
  }

  for (const issue of input.safety) {
    const critical = issue.code === "zone_invasion";
    rows.push({
      id: `safety:${issue.code}:${issue.zoneId}:${issue.objectId}`,
      category: "safety",
      severity: critical ? "critical" : "warning",
      title: critical ? "Safety zone invasion" : "Safety clearance violation",
      detail: issue.message,
      affectedObjectIds: [issue.objectId, issue.zoneId],
      actionLabel: "Select safety issue",
      suggestedFix: critical
        ? "Move the object outside the controlled zone or resize the zone boundary."
        : "Increase distance from the safety zone until the required clearance is met.",
    });
  }

  if (input.flow && input.flow.score < 70) {
    rows.push({
      id: "flow:score",
      category: "flow",
      severity: "warning",
      title: "Flow health below target",
      detail: `${input.flow.score}/100 flow score with ${input.flow.crossingCount} crossing(s) and ${input.flow.backtrackingCount} backtracking segment(s).`,
      affectedObjectIds: [],
      actionLabel: "Open Flow Health",
      suggestedFix:
        input.flow.suggestions[0] ??
        "Analyze Flow Health and reorder stations to reduce distance, crossings, or backtracking.",
    });
  }

  return rows.sort((a, b) => {
    const severity = Number(b.severity === "critical") - Number(a.severity === "critical");
    return severity || a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });
}

export function buildCadValidationReport(input: {
  boxes: CadCollisionBox[];
  zones?: CadSafetyZone[];
  flowNodes?: CadFlowNode[];
  requiredClearance?: number;
}): CadValidationReport {
  const collisions = detectCadCollisions(input.boxes);
  const clearances = input.requiredClearance
    ? findClearanceIssues(input.boxes, input.requiredClearance)
    : [];
  const safety = input.zones
    ? evaluateSafetyZones(input.boxes, input.zones)
    : [];
  const flow = input.flowNodes ? scoreFlowLayout(input.flowNodes) : undefined;
  const severity =
    collisions.length || safety.some((issue) => issue.code === "zone_invasion")
      ? "critical"
      : clearances.length || safety.length || (flow && flow.score < 70)
        ? "warning"
        : "ok";
  const issues = buildIssueRows({ collisions, clearances, safety, flow });
  return { collisions, clearances, safety, issues, flow, severity };
}
