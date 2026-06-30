import assert from "node:assert/strict";

import {
  CAD_VIEWPORT_BOOKMARK_LIMIT,
  cadViewportFocusBounds,
  createCadViewportBookmark,
  describeCadViewportFocus,
  removeCadViewportBookmark,
  sanitizeCadViewportBookmarks,
  upsertCadViewportBookmark,
} from "./viewport-bookmarks";

const camera = {
  mode: "3d" as const,
  position: { x: 1, y: 2, z: 3 },
  target: { x: 4, y: 0, z: 6 },
};

const first = createCadViewportBookmark({
  id: "current view",
  label: "  Main aisle overview  ",
  camera,
  savedAt: "2026-06-30T08:00:00.000Z",
});

assert.equal(first.id, "current-view", "bookmark ids are stable and URL-like");
assert.equal(first.label, "Main aisle overview", "bookmark labels are trimmed");

const second = createCadViewportBookmark({
  id: "selection",
  label: "Selection",
  camera: { ...camera, mode: "2d" },
  savedAt: "2026-06-30T09:00:00.000Z",
});

const bookmarks = upsertCadViewportBookmark([first], second);
assert.deepEqual(
  bookmarks.map((bookmark) => bookmark.id),
  ["selection", "current-view"],
  "newer bookmarks sort first",
);

const updated = upsertCadViewportBookmark(
  bookmarks,
  createCadViewportBookmark({
    id: "current view",
    label: "Updated view",
    camera,
    savedAt: "2026-06-30T10:00:00.000Z",
  }),
);
assert.equal(updated.length, 2, "upsert replaces matching ids");
assert.equal(updated[0]?.label, "Updated view", "replacement moves to the top");

const capped = Array.from({ length: CAD_VIEWPORT_BOOKMARK_LIMIT + 2 }, (_, index) =>
  createCadViewportBookmark({
    id: `view-${index}`,
    label: `View ${index}`,
    camera,
    savedAt: `2026-06-30T10:${String(index).padStart(2, "0")}:00.000Z`,
  }),
).reduce((items, bookmark) => upsertCadViewportBookmark(items, bookmark), [] as typeof bookmarks);
assert.equal(capped.length, CAD_VIEWPORT_BOOKMARK_LIMIT, "bookmark history is capped");

assert.equal(
  removeCadViewportBookmark(capped, capped[0]?.id ?? "").length,
  CAD_VIEWPORT_BOOKMARK_LIMIT - 1,
  "bookmarks can be removed by id",
);

const sanitized = sanitizeCadViewportBookmarks([
  { ...first, camera: { ...first.camera, position: { x: Number.NaN, y: 2, z: 3 } } },
  { label: "bad" },
]);
assert.equal(sanitized.length, 1, "sanitizer skips invalid bookmark entries");
assert.equal(sanitized[0]?.camera.position.x, 0, "sanitizer normalizes invalid vectors");

const bounds = cadViewportFocusBounds(
  [
    { id: "a", x: 1000, y: 2000, w: 2000, h: 1000 },
    { id: "b", x: 5000, y: 4500, w: 1000, h: 1200 },
  ],
  { padding: 500, footprintW: 7000, footprintH: 6000 },
);
assert.ok(bounds, "focus bounds are produced for valid objects");
assert.deepEqual(bounds?.objectIds, ["a", "b"], "focus bounds preserve affected ids");
assert.equal(bounds?.minX, 500, "focus bounds apply padding");
assert.equal(bounds?.maxY, 6000, "focus bounds clamp to footprint height");
assert.equal(
  describeCadViewportFocus(bounds!, "mm"),
  "2 objetos - 6 m x 4.5 m",
  "focus bounds have a compact user summary",
);

assert.equal(cadViewportFocusBounds([], { padding: 100 }), null, "empty focus inputs return null");

console.log("cad viewport bookmark specs passed");
