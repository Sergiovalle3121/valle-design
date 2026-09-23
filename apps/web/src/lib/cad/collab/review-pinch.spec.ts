import assert from "node:assert/strict";
import {
  cadViewFromViewport,
  cadViewScreenToWorld,
} from "../view/cad-view";
import { cadReviewPinchUpdate } from "./review-pinch";

const view = cadViewFromViewport(390, 600, 6_000, 4_000, 0.04);
const before = { x: 175, y: 250, distance: 80 };
const after = { x: 185, y: 270, distance: 160 };
const anchor = cadViewScreenToWorld(view, before.x, before.y);
const pinched = cadReviewPinchUpdate(view, before, after);
const movedAnchor = cadViewScreenToWorld(pinched, after.x, after.y);

assert.ok(pinched.pixelsPerUnit > view.pixelsPerUnit,
  "separar dos dedos acerca el plano");
assert.ok(Math.abs(movedAnchor.x - anchor.x) < 1e-6 &&
          Math.abs(movedAnchor.y - anchor.y) < 1e-6,
  "el mismo punto del plano sigue bajo el centro de los dedos al moverlos");
assert.equal(cadReviewPinchUpdate(view, { ...before, distance: 0 }, after), view,
  "un inicio degenerado no produce una vista infinita");
assert.equal(cadReviewPinchUpdate(view, { ...before, distance: 1 }, after), view,
  "un contacto inicial casi coincidente no produce un salto de zoom");

console.log("ok review-pinch: zoom móvil, ancla y gesto degenerado");
