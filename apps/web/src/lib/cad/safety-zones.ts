import type { CadCollisionBox } from "./collisions";
import { boxesOverlap, edgeDistance } from "./collisions";

export type CadSafetyZoneKind =
  | "aisle"
  | "safety_clearance"
  | "no_go"
  | "restricted";
export interface CadSafetyZone {
  id: string;
  kind: CadSafetyZoneKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: string;
  requiredClearance?: number;
}
export interface CadSafetyIssue {
  code: "zone_invasion" | "clearance_violation";
  zoneId: string;
  objectId: string;
  message: string;
}

export function createAisleBetweenBoxes(
  id: string,
  a: CadCollisionBox,
  b: CadCollisionBox,
  width: number,
): CadSafetyZone {
  const horizontal = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y);
  const x = horizontal ? (a.x + b.x) / 2 : Math.min(a.x, b.x);
  const y = horizontal ? Math.min(a.y, b.y) : (a.y + b.y) / 2;
  return {
    id,
    kind: "aisle",
    label: `Aisle ${a.label ?? a.id} ↔ ${b.label ?? b.id}`,
    x,
    y,
    width: horizontal ? width : Math.max(a.width, b.width),
    height: horizontal ? Math.max(a.height, b.height) : width,
    layer: "Aisles",
    requiredClearance: width,
  };
}
export function zoneToCollisionBox(zone: CadSafetyZone): CadCollisionBox {
  return {
    id: zone.id,
    label: zone.label,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    layer: zone.layer ?? "Safety",
  };
}
export function equipmentInvadesZone(
  object: CadCollisionBox,
  zone: CadSafetyZone,
): boolean {
  return boxesOverlap(object, zoneToCollisionBox(zone)) != null;
}
export function evaluateSafetyZones(
  objects: CadCollisionBox[],
  zones: CadSafetyZone[],
): CadSafetyIssue[] {
  const issues: CadSafetyIssue[] = [];
  for (const zone of zones) {
    const zoneBox = zoneToCollisionBox(zone);
    for (const object of objects) {
      if (
        (zone.kind === "no_go" || zone.kind === "restricted") &&
        boxesOverlap(object, zoneBox)
      ) {
        issues.push({
          code: "zone_invasion",
          zoneId: zone.id,
          objectId: object.id,
          message: `${object.label ?? object.id} invade ${zone.label}.`,
        });
      }
      if (
        zone.kind === "safety_clearance" &&
        zone.requiredClearance != null &&
        edgeDistance(object, zoneBox) < zone.requiredClearance
      ) {
        issues.push({
          code: "clearance_violation",
          zoneId: zone.id,
          objectId: object.id,
          message: `${object.label ?? object.id} no cumple la holgura de ${zone.requiredClearance}.`,
        });
      }
    }
  }
  return issues;
}
