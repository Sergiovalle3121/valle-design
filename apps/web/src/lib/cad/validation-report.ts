import type { CadCollisionBox, CadCollisionHit } from "./collisions";
import {
  detectCadCollisions,
  findClearanceIssues,
  type CadClearanceIssue,
} from "./collisions";
import {
  describeCadArchitectureObject,
  isCadRoomObject,
  roomUseTypeFromTags,
  type CadArchitectureObjectInput,
} from "./architecture";
import type { CadSafetyIssue, CadSafetyZone } from "./safety-zones";
import { evaluateSafetyZones } from "./safety-zones";
import type { CadDocument } from "./cad-document";
import type { CadWallOpeningCutReport } from "./wall-solid-diagnostics";
import {
  duplicateIdsRule,
  RuleEngine,
  withinBoundsRule,
  type RuleFinding,
} from "./rule-engine";

export interface CadValidationReport {
  collisions: CadCollisionHit[];
  clearances: CadClearanceIssue[];
  safety: CadSafetyIssue[];
  architecture: CadArchitectureValidationIssue[];
  /** Hallazgos del motor de reglas canónico sobre el CadDocument (CAD-NEXT-101). */
  document: RuleFinding[];
  /** Muros/masas cuyo volumen 3D no se pudo generar (Corte F, campaña 3D-M1). */
  geometry: CadGeometryValidationIssue[];
  issues: CadValidationIssueRow[];
  severity: "ok" | "warning" | "critical";
}

export type CadValidationIssueCategory =
  "collision" | "clearance" | "safety" | "architecture" | "document" | "geometry";

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

export type CadArchitectureValidationIssueCode =
  | "room_missing_label"
  | "room_use_missing"
  | "room_area_too_small"
  | "door_blocked"
  | "wall_crosses_equipment"
  | "equipment_outside_room"
  | "utility_missing"
  | "critical_dimensions_missing";

export interface CadArchitectureValidationIssue {
  code: CadArchitectureValidationIssueCode;
  severity: "critical" | "warning";
  title: string;
  message: string;
  affectedObjectIds: string[];
  suggestedFix: string;
}

/**
 * Un muro o una masa arquitectónica (piso/cielorraso/cubierta) cuya receta
 * no produjo un sólido 3D válido: `wallSolidBodyLocal`/
 * `architecturalSlabBodyLocal` devolvieron `null` (eje degenerado, grosor o
 * altura no positivos, o una booleana de vano irrecuperable) y el anfitrión
 * de escena lo marcó `userData.invalid` — antes de esta pieza, ese objeto
 * desaparecía de la vista 3D SIN ningún aviso, indistinguible de un muro
 * borrado a propósito. Esto es lo que lo hace visible.
 *
 * No se puede derivar sólo del `CadDocument`: la receta puede pasar cada
 * invariante del servidor (eje con dos extremos, grosor/altura positivos,
 * vanos que caben) y aun así fallar en el kernel B-rep del cliente al
 * recortar un vano concreto — por eso esto se COMPUTA en el visor, tras
 * intentar construir la geometría de verdad, y se pasa a
 * `buildCadValidationReport` en vez de derivarse aquí.
 */
export type CadGeometryValidationIssueCode =
  | "wall_geometry_invalid"
  | "architectural_mass_invalid"
  | "wall_opening_not_cut";

export interface CadGeometryValidationIssue {
  code: CadGeometryValidationIssueCode;
  severity: "critical" | "warning";
  title: string;
  message: string;
  affectedObjectIds: string[];
  suggestedFix: string;
}

const ARCHITECTURAL_MASS_LABEL: Record<string, string> = {
  floor: "Piso",
  ceiling: "Cielorraso",
  roof: "Cubierta",
};

/**
 * Un muro inválido es CRÍTICO —geometría persistida que desapareció de la
 * vista sin decirlo—; una masa inválida es warning —es DERIVADA, no
 * persistida, y su ausencia no oculta un dato del documento, sólo un
 * volumen calculado.
 */
const OPENING_CUT_KIND_LABEL: Record<string, string> = {
  "degenerate-size": "tamaño degenerado",
  "horizontal-misfit": "no cabe a lo largo del muro",
  "vertical-misfit": "no cabe en la altura del muro",
  "boolean-failed": "el kernel no pudo recortarlo",
};

function buildGeometryValidationIssues(input?: {
  invalidWallIds?: readonly string[];
  invalidMassKinds?: readonly string[];
  openingCuts?: readonly CadWallOpeningCutReport[];
}): CadGeometryValidationIssue[] {
  if (!input) return [];
  const issues: CadGeometryValidationIssue[] = [];
  for (const cut of input.openingCuts ?? []) {
    // `boolean-failed` es crítico: el vano era VÁLIDO y su muro quedó
    // bloqueado (sin volumen 3D) para no presentarse macizo. Los desajustes
    // de encaje son warning: el vano no corta ni en 2D ni en 3D — mismo
    // criterio en ambas vistas — pero ahora se DICE en vez de callarse.
    const critical = cut.kind === "boolean-failed";
    issues.push({
      code: "wall_opening_not_cut",
      severity: critical ? "critical" : "warning",
      title: `Vano ${cut.openingId ?? `#${cut.openingIndex}`} del muro ${cut.wallId}: sin recortar`,
      message:
        `${OPENING_CUT_KIND_LABEL[cut.kind] ?? cut.kind}` +
        (cut.cause ? ` — ${cut.cause}` : "") +
        (critical
          ? ". El muro no se muestra en 3D para no presentarse macizo."
          : ""),
      affectedObjectIds: [
        cut.wallId,
        ...(cut.openingId ? [cut.openingId] : []),
      ],
      suggestedFix: critical
        ? "Revisa la geometría del vano (bordes coincidentes o solapes con otro vano) y ajusta su posición o tamaño."
        : "Ajusta la posición, el ancho, el antepecho o la altura del vano para que encaje en su muro.",
    });
  }
  for (const id of input.invalidWallIds ?? []) {
    issues.push({
      code: "wall_geometry_invalid",
      severity: "critical",
      title: `Muro ${id}: sin volumen 3D`,
      message:
        "El eje, el grosor o la altura del muro no forman un sólido válido, o alguno de sus vanos no se pudo recortar. El muro no aparece en la vista 3D hasta que se corrija.",
      affectedObjectIds: [id],
      suggestedFix:
        "Revisa el eje, el grosor y la altura del muro, y el tamaño y la posición de sus vanos.",
    });
  }
  for (const kind of input.invalidMassKinds ?? []) {
    const label = ARCHITECTURAL_MASS_LABEL[kind] ?? kind;
    issues.push({
      code: "architectural_mass_invalid",
      severity: "warning",
      title: `${label}: sin volumen 3D`,
      message:
        "El contorno exterior del edificio no produjo un sólido válido para esta masa. No aparece en la vista 3D hasta que se corrija la planta.",
      affectedObjectIds: [],
      suggestedFix: "Revisa que los muros cierren un contorno exterior válido.",
    });
  }
  return issues;
}

interface CadArchitectureValidationOptions {
  objects: CadArchitectureObjectInput[];
  unit?: string;
  minimumRoomArea?: number;
  dimensionCount?: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const UTILITY_ALIASES: Record<string, string[]> = {
  power: ["power", "electrical", "electric", "energia", "energia-electrica"],
  air: ["air", "compressed-air", "pneumatic", "aire", "aire-comprimido"],
  network: ["network", "ethernet", "lan", "red"],
  esd: ["esd", "ground", "grounding", "tierra"],
  water: ["water", "eyewash", "agua", "lavaojos"],
  exhaust: ["exhaust", "ventilation", "vent", "extraccion"],
};

const UTILITY_KIND_ALIASES: Record<string, string> = {
  power_panel: "power",
  electrical_drop: "power",
  compressed_air: "air",
  network_drop: "network",
  esd_ground: "esd",
  water_eyewash: "water",
  eyewash: "water",
  exhaust: "exhaust",
  ventilation: "exhaust",
};

function tags(value: CadArchitectureObjectInput["tags"]): string[] {
  if (Array.isArray(value))
    return value.map((tag) => tag.trim()).filter(Boolean);
  return (value ?? "")
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizedTags(value: CadArchitectureObjectInput["tags"]): string[] {
  return tags(value).map((tag) => tag.toLowerCase().replace(/_/g, "-"));
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/_/g, "-");
}

function boundsOf(object: CadArchitectureObjectInput): Bounds {
  const width = Math.max(0, object.width);
  const height = Math.max(0, object.height);
  return {
    left: object.x,
    right: object.x + width,
    top: object.y,
    bottom: object.y + height,
  };
}

function areaOf(object: CadArchitectureObjectInput): number {
  return Math.max(0, object.width) * Math.max(0, object.height);
}

function overlaps(
  a: CadArchitectureObjectInput,
  b: CadArchitectureObjectInput,
): boolean {
  const ab = boundsOf(a);
  const bb = boundsOf(b);
  return (
    Math.min(ab.right, bb.right) - Math.max(ab.left, bb.left) > 0 &&
    Math.min(ab.bottom, bb.bottom) - Math.max(ab.top, bb.top) > 0
  );
}

function containsBounds(
  container: CadArchitectureObjectInput,
  object: CadArchitectureObjectInput,
): boolean {
  const cb = boundsOf(container);
  const ob = boundsOf(object);
  return (
    ob.left >= cb.left &&
    ob.right <= cb.right &&
    ob.top >= cb.top &&
    ob.bottom <= cb.bottom
  );
}

function centerInside(
  container: CadArchitectureObjectInput,
  object: CadArchitectureObjectInput,
): boolean {
  const cb = boundsOf(container);
  const center = {
    x: object.x + Math.max(0, object.width) / 2,
    y: object.y + Math.max(0, object.height) / 2,
  };
  return (
    center.x >= cb.left &&
    center.x <= cb.right &&
    center.y >= cb.top &&
    center.y <= cb.bottom
  );
}

function isSafetyOrAisleObject(object: CadArchitectureObjectInput): boolean {
  const text = `${object.kind} ${object.label ?? ""} ${normalizedTags(object.tags).join(" ")}`;
  return /aisle|pasillo|safety|no-go|restricted|emergency|egress|forklift|pedestrian|esd/.test(
    text,
  );
}

function architectureRole(object: CadArchitectureObjectInput) {
  return describeCadArchitectureObject(object)?.role ?? null;
}

function isEquipmentObject(object: CadArchitectureObjectInput): boolean {
  const role = architectureRole(object);
  if (
    role === "wall" ||
    role === "door" ||
    role === "room" ||
    role === "utility"
  )
    return false;
  if (isSafetyOrAisleObject(object)) return false;
  return (
    object.kind === "station" ||
    object.layerId === "layout" ||
    object.layerId === "equipment" ||
    !role
  );
}

function utilityKind(object: CadArchitectureObjectInput): string | null {
  const direct = UTILITY_KIND_ALIASES[object.kind];
  if (direct) return direct;
  const role = architectureRole(object);
  if (role !== "utility" && object.layerId !== "utilities") return null;
  const text = `${normalizeText(object.kind)} ${normalizeText(object.label)} ${normalizedTags(object.tags).join(" ")}`;
  for (const [kind, aliases] of Object.entries(UTILITY_ALIASES)) {
    if (aliases.some((alias) => text.includes(alias))) return kind;
  }
  return role === "utility" ? "utility" : null;
}

function utilityRequirements(object: CadArchitectureObjectInput): string[] {
  const found = new Set<string>();
  const objectTags = normalizedTags(object.tags);
  for (const tag of objectTags) {
    const explicit = tag.match(/^(requires|require|utility|util):(.+)$/);
    if (!explicit) continue;
    const value = explicit[2].trim();
    for (const [kind, aliases] of Object.entries(UTILITY_ALIASES)) {
      if (aliases.some((alias) => value.includes(alias))) found.add(kind);
    }
  }

  const text = `${normalizeText(object.label)} ${objectTags.join(" ")}`;
  for (const [kind, aliases] of Object.entries(UTILITY_ALIASES)) {
    if (
      aliases.some(
        (alias) =>
          text.includes(`requires-${alias}`) ||
          text.includes(`needs-${alias}`) ||
          text.includes(`${alias}-required`),
      )
    ) {
      found.add(kind);
    }
  }
  return [...found];
}

function roomForObject(
  object: CadArchitectureObjectInput,
  rooms: CadArchitectureObjectInput[],
): CadArchitectureObjectInput | null {
  return (
    rooms.find(
      (room) => containsBounds(room, object) || centerInside(room, object),
    ) ?? null
  );
}

function formatUtility(kind: string): string {
  if (kind === "power") return "power";
  if (kind === "air") return "compressed air";
  if (kind === "network") return "network";
  if (kind === "esd") return "ESD ground";
  if (kind === "water") return "water/eyewash";
  if (kind === "exhaust") return "exhaust/ventilation";
  return kind;
}

function buildArchitectureValidationIssues(
  options: CadArchitectureValidationOptions | undefined,
): CadArchitectureValidationIssue[] {
  if (!options?.objects.length) return [];

  const objects = options.objects;
  const minimumRoomArea =
    options.minimumRoomArea ?? (options.unit === "m" ? 4 : 4_000_000);
  const rooms = objects.filter((object) => isCadRoomObject(object));
  const walls = objects.filter((object) => architectureRole(object) === "wall");
  const doors = objects.filter((object) => architectureRole(object) === "door");
  const equipment = objects.filter(isEquipmentObject);
  const utilities = objects
    .map((object) => ({ object, kind: utilityKind(object) }))
    .filter(
      (entry): entry is { object: CadArchitectureObjectInput; kind: string } =>
        !!entry.kind,
    );
  const issues: CadArchitectureValidationIssue[] = [];

  for (const room of rooms) {
    const label = room.label?.trim();
    const area = areaOf(room);
    if (!label) {
      issues.push({
        code: "room_missing_label",
        severity: "warning",
        title: "Room missing label",
        message: "A room/area boundary has no visible engineering name.",
        affectedObjectIds: [room.id],
        suggestedFix: "Name the room with the area or department it controls.",
      });
    }
    if (roomUseTypeFromTags(room.tags, room.label) === "unclassified") {
      issues.push({
        code: "room_use_missing",
        severity: "warning",
        title: "Room use missing",
        message: `${label || "Room"} is not classified by use type.`,
        affectedObjectIds: [room.id],
        // El vocabulario que se sugiere es el del despacho que dibuja casas,
        // no el de la nave que ensambla tarjetas: `use:smt` no le dice nada a
        // quien está clasificando una recámara. Los industriales siguen
        // siendo válidos y por eso quedan al final de la lista.
        suggestedFix:
          "Add a tag such as use:recamara, use:bano, use:cocina, use:sala, use:cochera, dept:obra (industrial: use:smt, use:quality).",
      });
    }
    if (area > 0 && area < minimumRoomArea) {
      issues.push({
        code: "room_area_too_small",
        severity: "warning",
        title: "Room area below engineering minimum",
        message: `${label || "Room"} area is below the minimum planning threshold.`,
        affectedObjectIds: [room.id],
        suggestedFix:
          "Resize the room or document why the area is intentionally constrained.",
      });
    }
  }

  for (const door of doors) {
    const blocker = [
      ...equipment,
      ...utilities.map((entry) => entry.object),
    ].find((object) => overlaps(door, object));
    if (blocker) {
      issues.push({
        code: "door_blocked",
        severity: "critical",
        title: "Door opening blocked",
        message: `${door.label || "Door"} overlaps ${blocker.label || blocker.id}.`,
        affectedObjectIds: [door.id, blocker.id],
        suggestedFix:
          "Move the blocking object or relocate the door opening so egress stays clear.",
      });
    }
  }

  for (const wall of walls) {
    const blocker = equipment.find((object) => overlaps(wall, object));
    if (blocker) {
      issues.push({
        code: "wall_crosses_equipment",
        severity: "critical",
        title: "Wall crosses equipment",
        message: `${wall.label || "Wall"} overlaps ${blocker.label || blocker.id}.`,
        affectedObjectIds: [wall.id, blocker.id],
        suggestedFix:
          "Move the equipment or reroute the wall so the architectural shell does not cut through assets.",
      });
    }
  }

  if (rooms.length) {
    for (const object of equipment) {
      if (!roomForObject(object, rooms)) {
        issues.push({
          code: "equipment_outside_room",
          severity: "warning",
          title: "Equipment outside a room/area",
          message: `${object.label || object.id} is not contained in any room or department zone.`,
          affectedObjectIds: [object.id],
          suggestedFix:
            "Place the object inside a room/area boundary or add the missing room envelope.",
        });
      }
    }
  }

  for (const object of equipment) {
    const requirements = utilityRequirements(object);
    if (!requirements.length) continue;
    const room = rooms.length ? roomForObject(object, rooms) : null;
    for (const required of requirements) {
      const utility = utilities.find((candidate) => {
        if (candidate.kind !== required) return false;
        return !room || centerInside(room, candidate.object);
      });
      if (!utility) {
        issues.push({
          code: "utility_missing",
          severity: "warning",
          title: "Required utility missing",
          message: `${object.label || object.id} requires ${formatUtility(required)} but no matching utility is placed${room ? " in its room" : ""}.`,
          affectedObjectIds: room ? [object.id, room.id] : [object.id],
          suggestedFix: `Place a ${formatUtility(required)} point near the equipment and tag it on the Utilities layer.`,
        });
      }
    }
  }

  if (
    options.dimensionCount === 0 &&
    (rooms.length > 0 || walls.length > 0 || doors.length > 0)
  ) {
    issues.push({
      code: "critical_dimensions_missing",
      severity: "warning",
      title: "Critical architecture dimensions missing",
      message:
        "The architecture layer has no saved dimensions for rooms, walls, or door openings.",
      affectedObjectIds: [],
      suggestedFix:
        "Add baseline, room, wall, and door-width dimensions before releasing the drawing.",
    });
  }

  return issues;
}

const DOCUMENT_RULE_FIXES: Record<string, string> = {
  "duplicate-ids":
    "Renombra o elimina el objeto duplicado; los ids repetidos rompen undo y persistencia.",
  "within-bounds":
    "Mueve el objeto dentro del área de trabajo o amplía el footprint del plano.",
};

/**
 * Corre las reglas del documento canónico que el resto del reporte NO cubre ya
 * (los solapes/holguras los cubren collisions/clearances con la misma
 * geometría compartida): ids duplicados y fuera del área de trabajo — ambas
 * también sobre las ESTACIONES, que el barrido de cajas histórico no ve.
 */
function runDocumentRules(
  document: CadDocument | undefined,
  footprint: { w: number; h: number } | undefined,
): RuleFinding[] {
  if (!document) return [];
  const engine = new RuleEngine([duplicateIdsRule]);
  if (footprint && footprint.w > 0 && footprint.h > 0)
    engine.add(withinBoundsRule(footprint));
  return engine.run(document);
}

function buildIssueRows(input: {
  collisions: CadCollisionHit[];
  clearances: CadClearanceIssue[];
  safety: CadSafetyIssue[];
  architecture: CadArchitectureValidationIssue[];
  document: RuleFinding[];
  geometry: CadGeometryValidationIssue[];
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

  for (const issue of input.architecture) {
    rows.push({
      id: `architecture:${issue.code}:${issue.affectedObjectIds.join(":") || "global"}`,
      category: "architecture",
      severity: issue.severity,
      title: issue.title,
      detail: issue.message,
      affectedObjectIds: issue.affectedObjectIds,
      actionLabel: issue.affectedObjectIds.length
        ? "Select engineering issue"
        : "Review architecture dimensions",
      suggestedFix: issue.suggestedFix,
    });
  }

  for (const finding of input.document) {
    rows.push({
      id: `document:${finding.ruleId}:${finding.entityIds.join(":") || "global"}`,
      category: "document",
      severity: finding.level === "error" ? "critical" : "warning",
      title: `Documento: ${finding.ruleId === "duplicate-ids" ? "id duplicado" : finding.ruleId === "within-bounds" ? "fuera del área" : finding.ruleId}`,
      detail: finding.message,
      affectedObjectIds: finding.entityIds,
      actionLabel: finding.entityIds.length
        ? "Select document issue"
        : "Review document",
      suggestedFix:
        DOCUMENT_RULE_FIXES[finding.ruleId] ??
        "Revisa el hallazgo del motor de reglas del documento canónico.",
    });
  }

  for (const issue of input.geometry) {
    rows.push({
      id: `geometry:${issue.code}:${issue.affectedObjectIds.join(":") || "global"}`,
      category: "geometry",
      severity: issue.severity,
      title: issue.title,
      detail: issue.message,
      affectedObjectIds: issue.affectedObjectIds,
      actionLabel: issue.affectedObjectIds.length
        ? "Select geometry issue"
        : "Review architectural mass",
      suggestedFix: issue.suggestedFix,
    });
  }

  return rows.sort((a, b) => {
    const severity =
      Number(b.severity === "critical") - Number(a.severity === "critical");
    return (
      severity ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title)
    );
  });
}

export function buildCadValidationReport(input: {
  boxes: CadCollisionBox[];
  zones?: CadSafetyZone[];
  requiredClearance?: number;
  architectureObjects?: CadArchitectureObjectInput[];
  unit?: string;
  minimumRoomArea?: number;
  dimensionCount?: number;
  /** Documento canónico del estado actual; habilita las reglas de documento. */
  document?: CadDocument;
  /** Área de trabajo (para la regla fuera-de-límites del documento). */
  footprint?: { w: number; h: number };
  /**
   * Muros/masas cuyo volumen 3D falló al construirse, tal como los reportan
   * `CadWallSolidHost.invalidIds()`/`CadArchitecturalMassHost.invalidKinds()`
   * (o la fachada `CadNativeMassHosts.invalidGeometry()`) TRAS intentar
   * construir la geometría real — no se deriva del documento a secas.
   */
  invalidGeometry?: {
    wallIds?: readonly string[];
    massKinds?: readonly string[];
    /** Vanos no recortados con identidad completa (muro + vano + causa). */
    openingCuts?: readonly CadWallOpeningCutReport[];
  };
}): CadValidationReport {
  const collisions = detectCadCollisions(input.boxes);
  const clearances = input.requiredClearance
    ? findClearanceIssues(input.boxes, input.requiredClearance)
    : [];
  const safety = input.zones
    ? evaluateSafetyZones(input.boxes, input.zones)
    : [];
  const architecture = buildArchitectureValidationIssues(
    input.architectureObjects
      ? {
          objects: input.architectureObjects,
          unit: input.unit,
          minimumRoomArea: input.minimumRoomArea,
          dimensionCount: input.dimensionCount,
        }
      : undefined,
  );
  const document = runDocumentRules(input.document, input.footprint);
  const geometry = buildGeometryValidationIssues(
    input.invalidGeometry
      ? {
          invalidWallIds: input.invalidGeometry.wallIds,
          invalidMassKinds: input.invalidGeometry.massKinds,
          openingCuts: input.invalidGeometry.openingCuts,
        }
      : undefined,
  );
  const severity =
    collisions.length ||
    safety.some((issue) => issue.code === "zone_invasion") ||
    architecture.some((issue) => issue.severity === "critical") ||
    document.some((finding) => finding.level === "error") ||
    geometry.some((issue) => issue.severity === "critical")
      ? "critical"
      : clearances.length ||
          safety.length ||
          architecture.length ||
          document.length ||
          geometry.length
        ? "warning"
        : "ok";
  const issues = buildIssueRows({
    collisions,
    clearances,
    safety,
    architecture,
    document,
    geometry,
  });
  return {
    collisions,
    clearances,
    safety,
    architecture,
    document,
    geometry,
    issues,
    severity,
  };
}
