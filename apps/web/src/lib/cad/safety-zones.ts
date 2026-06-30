import type { CadCollisionBox } from "./collisions";
import { boxesOverlap, edgeDistance } from "./collisions";

export type CadSafetyZoneKind =
  | "aisle"
  | "safety_clearance"
  | "no_go"
  | "restricted"
  | "esd_zone"
  | "forklift_path"
  | "emergency_exit";
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
  code: "zone_invasion" | "clearance_violation" | "esd_control_warning";
  zoneId: string;
  objectId: string;
  message: string;
}

const pathZoneKinds = new Set<CadSafetyZoneKind>([
  "aisle",
  "forklift_path",
  "emergency_exit",
]);

function normalizedTokens(...values: Array<string | string[] | undefined>) {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []))
    .join(" ")
    .toLowerCase()
    .replace(/_/g, "-");
}

function objectIsEsdControlled(object: CadCollisionBox): boolean {
  const text = normalizedTokens(object.tags, object.label, object.layer);
  return (
    /\besd\b/.test(text) ||
    text.includes("esd-safe") ||
    text.includes("esd-controlled") ||
    text.includes("controlled-area")
  );
}

function invasionMessage(object: CadCollisionBox, zone: CadSafetyZone): string {
  const objectLabel = object.label ?? object.id;
  if (zone.kind === "forklift_path")
    return `${objectLabel} bloquea la ruta de montacargas ${zone.label}.`;
  if (zone.kind === "emergency_exit")
    return `${objectLabel} bloquea la ruta de emergencia ${zone.label}.`;
  if (zone.kind === "aisle")
    return `${objectLabel} invade el pasillo ${zone.label}.`;
  return `${objectLabel} invade ${zone.label}.`;
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
        (zone.kind === "no_go" ||
          zone.kind === "restricted" ||
          pathZoneKinds.has(zone.kind)) &&
        boxesOverlap(object, zoneBox)
      ) {
        issues.push({
          code: "zone_invasion",
          zoneId: zone.id,
          objectId: object.id,
          message: invasionMessage(object, zone),
        });
      }
      if (
        zone.kind === "esd_zone" &&
        boxesOverlap(object, zoneBox) &&
        !objectIsEsdControlled(object)
      ) {
        issues.push({
          code: "esd_control_warning",
          zoneId: zone.id,
          objectId: object.id,
          message: `${object.label ?? object.id} esta dentro de ${zone.label} sin tag ESD.`,
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
