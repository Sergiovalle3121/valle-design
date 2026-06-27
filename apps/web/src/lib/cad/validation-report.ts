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
  flow?: CadFlowScore;
  severity: "ok" | "warning" | "critical";
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
  return { collisions, clearances, safety, flow, severity };
}
