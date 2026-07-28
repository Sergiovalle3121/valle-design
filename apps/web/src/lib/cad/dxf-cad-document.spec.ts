import assert from "node:assert/strict";
import { migrateCadDocument } from "./cad-document";
import {
  cadDocumentNativeDxfHatches,
  cadDocumentNativeDxfMTexts,
  cadDocumentNativeDxfMleaders,
  cadDocumentNativeDxfPrimitives,
  cadDocumentNativeDxfSemanticDimensions,
  cadDxfCurvesToNativeEntities,
  cadDxfHatchesToNativeEntities,
  cadDxfMTextsToNativeEntities,
  cadDxfMleadersToNativeEntities,
  cadDxfSemanticDimensionsToNativeEntities,
} from "./dxf-cad-document";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";

const source = migrateCadDocument({
  meta: { version: 1, schema: 3, unit: "mm" },
  entities: [
    {
      id: "arc-native",
      type: "arc",
      center: { x: 100, y: 200, z: 0 },
      radius: 50,
      startAngle: 10,
      endAngle: 140,
      layer: "CURVES",
    },
    {
      id: "ellipse-native",
      type: "ellipse",
      center: { x: 400, y: 500, z: 0 },
      majorAxis: { x: 80, y: 20, z: 0 },
      ratio: 0.4,
      startParameter: 0,
      endParameter: 360,
      layer: "CURVES",
    },
    {
      id: "spline-native",
      type: "spline",
      degree: 2,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 80, y: 120, z: 0 },
        { x: 160, y: 0, z: 0 },
      ],
      knots: [0, 0, 0, 1, 1, 1],
      layer: "SPLINES",
    },
    {
      id: "hatch-native",
      type: "hatch",
      pattern: "ANSI31",
      solid: false,
      boundaries: [[
        { x: 10, y: 20, z: 0 },
        { x: 110, y: 20, z: 0 },
        { x: 110, y: 80, z: 0 },
        { x: 10, y: 80, z: 0 },
      ]],
      scale: 12,
      angle: 45,
      origin: { x: 23, y: 37, z: 0 },
      islandStyle: "outer",
      associative: false,
      associationStatus: "detached",
      layer: "AREAS",
    },
    {
      id: "mtext-native",
      type: "mtext",
      insertion: { x: 250, y: 350, z: 0 },
      text: "Nota multilÃ­nea\nSegunda lÃ­nea",
      width: 900,
      height: 80,
      rotation: 15,
      alignment: "middle-center",
      paragraphAlignment: "center",
      style: "Notes",
      fontFamily: "Arial",
      lineSpacing: 1.35,
      bold: true,
      italic: true,
      underline: true,
      backgroundMask: true,
      backgroundColor: "#112233",
      backgroundPadding: 0.2,
      columns: 2,
      layer: "TEXT",
    },
    {
      id: "dimension-native",
      type: "dimension",
      dimensionKind: "aligned",
      a: { x: 20, y: 40 },
      b: { x: 274.6, y: 40 },
      offset: 35,
      layer: "DIMENSIONS",
      style: "Architectural",
      precision: 3,
      sourceUnit: "mm",
      units: "in",
      alternateUnits: "mm",
      prefix: "~",
      suffix: " typ",
      extensionLines: false,
      arrowhead: "architectural-tick",
      arrowSize: 9,
      extensionGap: 2,
      extensionOvershoot: 4,
      textGap: 5,
      associative: true,
      references: [
        { entityId: "source-line", anchor: "start" },
        { entityId: "source-line", anchor: "end" },
      ],
      associationStatus: "associated",
    },
    {
      id: "mleader-native",
      type: "mleader",
      vertices: [{ x: 20, y: 300, z: 0 }, { x: 180, y: 380, z: 0 }],
      leaderLines: [
        [{ x: 20, y: 300, z: 0 }, { x: 180, y: 380, z: 0 }],
        [{ x: 20, y: 460, z: 0 }, { x: 180, y: 380, z: 0 }],
      ],
      text: "Inspect connection\nTorque 25 Nm",
      textPosition: { x: 500, y: 380, z: 0 },
      contentType: "mtext",
      textWidth: 1200,
      textHeight: 90,
      textRotation: 5,
      textAlignment: "left",
      fontFamily: "Arial",
      lineSpacing: 1.3,
      bold: true,
      underline: true,
      backgroundMask: true,
      backgroundColor: "#112233",
      backgroundPadding: 0.2,
      landing: true,
      doglegLength: 320,
      arrowhead: "open",
      arrowSize: 18,
      style: "Mechanical",
      associative: true,
      references: [
        { entityId: "source-a", anchor: "center" },
        { entityId: "source-b", anchor: "center" },
      ],
      associationStatus: "associated",
      layer: "NOTES",
    },
  ],
});

const primitives = cadDocumentNativeDxfPrimitives(source);
assert.deepEqual(
  primitives.map((primitive) => primitive.kind),
  ["arc", "ellipse", "spline"],
);
const dxf = exportCadDxf({ primitives }, { units: "mm" });
const reimported = importDxfPrimitives(dxf.content);
assert.equal(reimported.warnings.length, 0);
const native = cadDxfCurvesToNativeEntities(reimported.primitives, {
  idPrefix: "roundtrip",
});
assert.equal(native.length, 3);
const arc = native.find((entity) => entity.type === "arc");
assert.equal(arc?.type, "arc");
if (arc?.type === "arc") {
  assert.equal(arc.radius, 50);
  assert.ok(Math.abs(arc.startAngle - 10) < 1e-9);
  assert.ok(Math.abs(arc.endAngle - 140) < 1e-9);
}
const ellipse = native.find((entity) => entity.type === "ellipse");
assert.equal(ellipse?.type, "ellipse");
if (ellipse?.type === "ellipse") {
  assert.deepEqual(ellipse.majorAxis, { x: 80, y: 20, z: 0 });
  assert.equal(ellipse.ratio, 0.4);
}
const spline = native.find((entity) => entity.type === "spline");
assert.equal(spline?.type, "spline");
if (spline?.type === "spline") {
  assert.equal(spline.degree, 2);
  assert.deepEqual(spline.knots, [0, 0, 0, 1, 1, 1]);
}

const hatches = cadDocumentNativeDxfHatches(source);
assert.equal(hatches.length, 1);
const hatchDxf = exportCadDxf({ hatches }, { units: "mm" });
const reimportedHatches = importDxfPrimitives(hatchDxf.content);
assert.equal(reimportedHatches.warnings.length, 0);
const nativeHatches = cadDxfHatchesToNativeEntities(reimportedHatches.hatches, { idPrefix: "roundtrip" });
assert.equal(nativeHatches.length, 1);
const hatch = nativeHatches[0];
assert.equal(hatch.type, "hatch");
if (hatch.type === "hatch") {
  assert.equal(hatch.pattern, "ANSI31");
  assert.equal(hatch.solid, false);
  assert.equal(hatch.scale, 12);
  assert.equal(hatch.angle, 45);
  assert.deepEqual(hatch.origin, { x: 23, y: 37, z: 0 });
  assert.equal(hatch.islandStyle, "outer");
  assert.equal(hatch.associationStatus, "detached");
  assert.deepEqual(hatch.boundaries[0][0], { x: 10, y: 20, z: 0 });
}

const mtexts = cadDocumentNativeDxfMTexts(source);
assert.equal(mtexts.length, 1);
const mtextDxf = exportCadDxf({ mtexts }, { units: "mm" });
assert.match(mtextDxf.content, /\r?\nMTEXT\r?\n/);
const reimportedMTexts = importDxfPrimitives(mtextDxf.content);
assert.equal(reimportedMTexts.mtexts.length, 1);
const nativeMTexts = cadDxfMTextsToNativeEntities(reimportedMTexts.mtexts, { idPrefix: "roundtrip" });
const mtext = nativeMTexts[0];
assert.equal(mtext.type, "mtext");
if (mtext.type === "mtext") {
  assert.equal(mtext.text, "Nota multilÃ­nea\nSegunda lÃ­nea");
  assert.equal(mtext.width, 900);
  assert.equal(mtext.height, 80);
  assert.ok(Math.abs((mtext.rotation ?? 0) - 15) < 1e-9);
  assert.equal(mtext.alignment, "middle-center");
  assert.equal(mtext.paragraphAlignment, "center");
  assert.equal(mtext.bold, true);
  assert.equal(mtext.italic, true);
  assert.equal(mtext.underline, true);
  assert.equal(mtext.backgroundMask, true);
  assert.equal(mtext.backgroundColor, "#112233");
  assert.equal(mtext.columns, 2);
}

const semanticDimensions = cadDocumentNativeDxfSemanticDimensions(source);
assert.equal(semanticDimensions.length, 1);
const dimensionDxf = exportCadDxf({ semanticDimensions }, { units: "mm" });
assert.match(dimensionDxf.content, /1001\r?\nAXOS_DIM/);
const reimportedDimensions = importDxfPrimitives(dimensionDxf.content);
assert.equal(reimportedDimensions.semanticDimensions.length, 1);
assert.equal(reimportedDimensions.primitives.length, 0, "own *D block is not duplicated as flattened geometry");
const nativeDimensions = cadDxfSemanticDimensionsToNativeEntities(reimportedDimensions.semanticDimensions, { idPrefix: "roundtrip" });
const semanticDimension = nativeDimensions[0];
assert.equal(semanticDimension.type, "dimension");
if (semanticDimension.type === "dimension") {
  assert.equal(semanticDimension.dimensionKind, "aligned");
  assert.deepEqual(semanticDimension.a, { x: 20, y: 40, z: 0 });
  assert.deepEqual(semanticDimension.b, { x: 274.6, y: 40, z: 0 });
  assert.equal(semanticDimension.offset, 35);
  assert.equal(semanticDimension.style, "Architectural");
  assert.equal(semanticDimension.precision, 3);
  assert.equal(semanticDimension.units, "in");
  assert.equal(semanticDimension.alternateUnits, "mm");
  assert.equal(semanticDimension.prefix, "~");
  assert.equal(semanticDimension.suffix, " typ");
  assert.equal(semanticDimension.extensionLines, false);
  assert.equal(semanticDimension.arrowhead, "architectural-tick");
  assert.equal(semanticDimension.associative, false);
  assert.equal(semanticDimension.associationStatus, "detached");
}

const everyDimensionKind = ["linear", "aligned", "angular", "radius", "diameter", "ordinate", "arc-length"] as const;
const everyDimensionDxf = exportCadDxf({
  semanticDimensions: everyDimensionKind.map((dimensionKind, index) => ({
    layer: "DIMENSIONS",
    dimensionKind,
    a: { x: index * 200, y: 0 },
    b: { x: index * 200 + 100, y: 0 },
    ...((dimensionKind === "angular" || dimensionKind === "arc-length") ? { c: { x: index * 200, y: 100 }, radius: 50 } : {}),
    ...((dimensionKind === "radius" || dimensionKind === "diameter") ? { radius: 100 } : {}),
    offset: 25,
  })),
});
const everyDimensionRoundTrip = importDxfPrimitives(everyDimensionDxf.content);
assert.deepEqual(everyDimensionRoundTrip.semanticDimensions.map((dimension) => dimension.dimensionKind), everyDimensionKind);
assert.equal(everyDimensionRoundTrip.primitives.length, 0);

const mleaders = cadDocumentNativeDxfMleaders(source);
assert.equal(mleaders.length, 1);
const mleaderDxf = exportCadDxf({ mleaders }, { units: "mm" });
assert.match(mleaderDxf.content, /0\r?\nMLEADER/);
assert.match(mleaderDxf.content, /1001\r?\nAXOS_MLEADER/);
const reimportedMleaders = importDxfPrimitives(mleaderDxf.content);
assert.equal(reimportedMleaders.mleaders.length, 1);
const nativeMleaders = cadDxfMleadersToNativeEntities(reimportedMleaders.mleaders, { idPrefix: "roundtrip" });
const mleader = nativeMleaders[0];
assert.equal(mleader.type, "mleader");
if (mleader.type === "mleader") {
  assert.equal(mleader.leaderLines?.length, 2);
  assert.deepEqual(mleader.leaderLines?.[1][0], { x: 20, y: 460, z: 0 });
  assert.equal(mleader.text, "Inspect connection\nTorque 25 Nm");
  assert.deepEqual(mleader.textPosition, { x: 500, y: 380, z: 0 });
  assert.equal(mleader.textWidth, 1200);
  assert.equal(mleader.textHeight, 90);
  assert.equal(mleader.bold, true);
  assert.equal(mleader.underline, true);
  assert.equal(mleader.backgroundMask, true);
  assert.equal(mleader.landing, true);
  assert.equal(mleader.arrowhead, "open");
  assert.equal(mleader.associative, false);
  assert.equal(mleader.associationStatus, "detached");
}

// Editor projection flips Y; orientation-aware import swaps the arc endpoints
// so the same geometric sweep survives instead of silently mirroring it.
const reflected = cadDxfCurvesToNativeEntities(
  [
    {
      kind: "arc",
      layer: "0",
      points: [{ x: 0, y: 0 }],
      radius: 10,
      startAngle: 0,
      endAngle: 90,
    },
  ],
  {
    projection: { point: (point) => ({ x: point.x, y: -point.y }) },
  },
);
assert.equal(reflected[0]?.type, "arc");
if (reflected[0]?.type === "arc") {
  assert.equal(Math.round(reflected[0].startAngle), -90);
  assert.equal(Math.round(reflected[0].endAngle), 0);
}

console.log("cad native DXF bridge specs passed");
