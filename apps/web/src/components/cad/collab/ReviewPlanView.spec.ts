import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CadPlanProjection, CadPlanText } from "@/lib/cad/collab/plan-projection";
import ReviewPlanView from "./ReviewPlanView";

const label: CadPlanText = {
  entityId: "rotulo",
  origin: { x: 100, y: 200 },
  rotation: 30,
  color: "#ffffff",
  fontSize: 140,
  fontFamily: "Arial, sans-serif",
  bold: false,
  italic: false,
  underline: false,
  lines: [{ text: "SALA <script>alert(1)</script> & 18 m²", x: 0, y: -140, width: 900, justify: false }],
};
const projection: CadPlanProjection = {
  strokes: [],
  texts: [label],
  elements: [{ kind: "text", text: label }],
  bounds: { minX: 100, minY: 60, maxX: 1_000, maxY: 200 },
  points: label.lines[0].text.length,
  truncated: false,
  unsupported: 0,
};

const html = renderToStaticMarkup(createElement(ReviewPlanView, {
  projection,
  pins: [],
  activeId: null,
  onSelect: () => {},
  placing: false,
  onPlace: () => {},
}));

assert.match(html, /data-testid="cad-review-text"/);
assert.match(html, /transform="translate\(100 200\) rotate\(30\)"/);
assert.match(html, /SALA &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; 18 m²/);
assert.doesNotMatch(html, /<script|<path/);
console.log("ok ReviewPlanView: SVG text literal, girado y escapado");
