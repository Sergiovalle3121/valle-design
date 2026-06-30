export type CadViewportMode = "2d" | "3d";

export interface CadViewportVector {
  x: number;
  y: number;
  z: number;
}

export interface CadViewportCameraSnapshot {
  mode: CadViewportMode;
  position: CadViewportVector;
  target: CadViewportVector;
}

export interface CadViewportBookmark {
  id: string;
  label: string;
  camera: CadViewportCameraSnapshot;
  savedAt: string;
}

export interface CadViewportFocusObject {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CadViewportFocusBounds {
  objectIds: string[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export const CAD_VIEWPORT_BOOKMARK_LIMIT = 8;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanLabel(label: string): string {
  const normalized = label.replace(/\s+/g, " ").trim();
  return (normalized || "Saved view").slice(0, 48);
}

function cleanVector(value: unknown): CadViewportVector {
  const vector = value && typeof value === "object" ? value as Partial<CadViewportVector> : {};
  return {
    x: finite(vector.x) ? vector.x : 0,
    y: finite(vector.y) ? vector.y : 0,
    z: finite(vector.z) ? vector.z : 0,
  };
}

export function createCadViewportBookmark(input: {
  id: string;
  label: string;
  camera: CadViewportCameraSnapshot;
  savedAt?: string;
}): CadViewportBookmark {
  return {
    id: cleanLabel(input.id).replace(/\s+/g, "-").toLowerCase(),
    label: cleanLabel(input.label),
    camera: {
      mode: input.camera.mode === "2d" ? "2d" : "3d",
      position: cleanVector(input.camera.position),
      target: cleanVector(input.camera.target),
    },
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
}

export function upsertCadViewportBookmark(
  bookmarks: CadViewportBookmark[],
  bookmark: CadViewportBookmark,
  limit = CAD_VIEWPORT_BOOKMARK_LIMIT,
): CadViewportBookmark[] {
  const cappedLimit = Math.max(1, Math.floor(limit));
  const next = [
    bookmark,
    ...bookmarks.filter((candidate) => candidate.id !== bookmark.id),
  ];
  return next
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, cappedLimit);
}

export function removeCadViewportBookmark(
  bookmarks: CadViewportBookmark[],
  id: string,
): CadViewportBookmark[] {
  return bookmarks.filter((bookmark) => bookmark.id !== id);
}

export function sanitizeCadViewportBookmarks(
  value: unknown,
  limit = CAD_VIEWPORT_BOOKMARK_LIMIT,
): CadViewportBookmark[] {
  if (!Array.isArray(value)) return [];
  const parsed: CadViewportBookmark[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<CadViewportBookmark>;
    const camera = candidate.camera;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.savedAt !== "string" ||
      !camera ||
      typeof camera !== "object"
    ) {
      continue;
    }
    parsed.push(
      createCadViewportBookmark({
        id: candidate.id,
        label: candidate.label,
        savedAt: candidate.savedAt,
        camera: {
          mode: camera.mode === "2d" ? "2d" : "3d",
          position: cleanVector(camera.position),
          target: cleanVector(camera.target),
        },
      }),
    );
  }
  return parsed
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, Math.max(1, Math.floor(limit)));
}

export function cadViewportFocusBounds(
  objects: CadViewportFocusObject[],
  options: { padding?: number; footprintW?: number; footprintH?: number } = {},
): CadViewportFocusBounds | null {
  const valid = objects.filter(
    (object) =>
      finite(object.x) &&
      finite(object.y) &&
      finite(object.w) &&
      finite(object.h) &&
      object.w > 0 &&
      object.h > 0,
  );
  if (!valid.length) return null;

  const padding = Math.max(0, options.padding ?? 0);
  let minX = Math.min(...valid.map((object) => object.x)) - padding;
  let minY = Math.min(...valid.map((object) => object.y)) - padding;
  let maxX = Math.max(...valid.map((object) => object.x + object.w)) + padding;
  let maxY = Math.max(...valid.map((object) => object.y + object.h)) + padding;

  if (finite(options.footprintW)) {
    minX = Math.max(0, minX);
    maxX = Math.min(options.footprintW, maxX);
  }
  if (finite(options.footprintH)) {
    minY = Math.max(0, minY);
    maxY = Math.min(options.footprintH, maxY);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    objectIds: valid.map((object) => object.id),
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

export function formatCadViewportLength(value: number, unit: string): string {
  const meters = unit === "mm" ? value / 1000 : unit === "cm" ? value / 100 : value;
  return `${meters.toLocaleString("es-MX", { maximumFractionDigits: meters < 10 ? 2 : 1 })} m`;
}

export function describeCadViewportFocus(
  bounds: CadViewportFocusBounds,
  unit: string,
): string {
  const count = bounds.objectIds.length;
  return `${count} objeto${count === 1 ? "" : "s"} - ${formatCadViewportLength(bounds.width, unit)} x ${formatCadViewportLength(bounds.height, unit)}`;
}
