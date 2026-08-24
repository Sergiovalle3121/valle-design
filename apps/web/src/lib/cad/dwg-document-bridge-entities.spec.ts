/**
 * `dwg-document-bridge.ts`: mapeo directo por tipo de entidad, cada uno con
 * su propia función pura y probado aparte de `dwgNeutralDatabaseToCadDocument`
 * (ver `dwg-document-bridge.spec.ts` para el mapeo de base completa y el
 * gate de la beta).
 *
 * POR QUÉ ESTE ARCHIVO ESTÁ SEPARADO. Nació de partir `dwg-document-bridge.spec.ts`
 * cuando superó el presupuesto de líneas de `scripts/cad/check-monolith-budget.mjs`:
 * ELLIPSE/SPLINE (M2a) y MTEXT/DIMENSION/HATCH (M2b) son geometría real con
 * riesgo real de signo/eje/unidad, así que cada uno lleva su propio caso con
 * valores calculados a mano — eso pesa, y merece su propio archivo en vez de
 * un presupuesto ampliado sin razón.
 */
import { strict as assert } from "node:assert";
import {
  dwgDimensionToCadDxfSemanticDimension,
  dwgGeometryToPrimitive,
  dwgHatchToCadDxfHatch,
  dwgMTextToCadDxfMText,
} from "./dwg-document-bridge";
import type {
  DwgNeutralEntityRecord,
  DwgNeutralPoint2,
  DwgNeutralPoint3,
} from "./dwg-neutral-model";

const p3 = (x: number, y: number, z = 0): DwgNeutralPoint3 => ({ x, y, z });
const p2 = (x: number, y: number): DwgNeutralPoint2 => ({ x, y });
const bytesDe = (text: string): number[] => [...text].map((char) => char.charCodeAt(0) & 0xff);

// ELLIPSE: mismo criterio de ángulos que ARC, y el vector de eje mayor pasa
// intacto —ya es relativo al centro en el modelo neutral, igual que en DXF.
const elipse = dwgGeometryToPrimitive(
  {
    kind: "ellipse",
    center: p3(1, 1),
    majorAxisEndpoint: p3(5, 0),
    extrusion: p3(0, 0, 1),
    axisRatio: 0.4,
    startAngle: 0,
    endAngle: Math.PI,
  },
  "0",
);
assert.equal(elipse?.kind, "ellipse");
assert.deepEqual(elipse?.points[0], { x: 1, y: 1 }, "el centro es el punto base de la primitiva");
assert.deepEqual(
  elipse?.majorAxis,
  { x: 5, y: 0 },
  "el vector de eje mayor pasa intacto, relativo al centro",
);
assert.equal(elipse?.axisRatio, 0.4);
assert.equal(elipse?.endAngle, 180, "también en grados, mismo criterio que ARC");

// SPLINE: puntos de control y grado pasan tal cual. El filtro de escenario
// vive en el adaptador autorizado, no aquí: esta función mapea cualquier
// spline que le llegue con puntos de control, sea cual sea su origen.
const spline = dwgGeometryToPrimitive(
  {
    kind: "spline",
    scenario: 1,
    degree: 3,
    rational: false,
    closed: false,
    periodic: false,
    knotTolerance: undefined,
    controlTolerance: undefined,
    knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [p3(0, 0), p3(2, 4), p3(4, 0)],
    weights: undefined,
    fitTolerance: undefined,
    startTangent: undefined,
    endTangent: undefined,
    fitPoints: undefined,
  },
  "0",
);
assert.equal(spline?.kind, "spline");
assert.equal(spline?.points.length, 3, "los puntos de control pasan como points");
assert.equal(spline?.degree, 3);
assert.deepEqual(spline?.knots, [0, 0, 0, 1, 1, 1]);

// Sin puntos de control —el campo que el tipo permite dejar `undefined`
// porque es del escenario 2— no hay primitiva que fabricar: `null`, nunca un
// array vacío que finja geometría donde no la hay.
const splineSinControlPoints = dwgGeometryToPrimitive(
  {
    kind: "spline",
    scenario: 1,
    degree: 3,
    rational: false,
    closed: undefined,
    periodic: undefined,
    knotTolerance: undefined,
    controlTolerance: undefined,
    knots: undefined,
    controlPoints: undefined,
    weights: undefined,
    fitTolerance: undefined,
    startTangent: undefined,
    endTangent: undefined,
    fitPoints: undefined,
  },
  "0",
);
assert.equal(splineSinControlPoints, null, "sin puntos de control no hay primitiva que fabricar");

// ─── MTEXT: contenido con formato reutiliza el mismo decodificador que DXF ─
const mtext = dwgMTextToCadDxfMText(
  {
    kind: "mtext",
    insertion: p3(10, 20),
    extrusion: p3(0, 0, 1),
    xAxisDirection: p3(1, 1, 0),
    rectWidth: 80,
    height: 3.5,
    attachment: 5,
    drawingDirection: 1,
    extentsHeight: 3.5,
    extentsWidth: 80,
    valueBytes: bytesDe("\\fArial|b1|i0;Hola\\Pmundo"),
    lineSpacingStyle: 1,
    lineSpacingFactor: 1.5,
    trailingBit: 0,
  },
  "0",
);
assert.deepEqual(mtext.insertion, { x: 10, y: 20 });
assert.equal(mtext.width, 80);
assert.equal(mtext.height, 3.5);
assert.equal(
  mtext.rotation,
  45,
  "atan2 del vector de dirección, en grados: atan2(1,1) = 45°",
);
assert.equal(mtext.alignment, "middle-center", "attachment 5 es el punto medio del recuadro");
assert.equal(mtext.lineSpacing, 1.5);
assert.equal(mtext.text, "Hola\nmundo", "\\P es salto de párrafo, igual que en DXF");
assert.equal(mtext.fontFamily, "Arial");
assert.equal(mtext.bold, true);
assert.equal(mtext.italic, false);
assert.equal(mtext.paragraphAlignment, "left");

// ─── DIMENSION: reconstrucción por puntos, sin XDATA (DWG no la tiene) ─────
const baseDimension = (
  overrides: Partial<DwgNeutralEntityRecord["entity"] & { kind: "dimension" }> &
    Pick<Extract<DwgNeutralEntityRecord["entity"], { kind: "dimension" }>, "dimensionKind" | "definitionPoint">,
): Extract<DwgNeutralEntityRecord["entity"], { kind: "dimension" }> => ({
  kind: "dimension",
  extrusion: p3(0, 0, 1),
  textMidpoint: { x: 0, y: 0 },
  elevation: 0,
  flags: 0,
  userTextBytes: [],
  textRotation: 0,
  horizontalDirection: 0,
  insertScale: p3(1, 1, 1),
  insertRotation: 0,
  attachment: 5,
  lineSpacingStyle: 1,
  lineSpacingFactor: 1,
  actualMeasurement: 0,
  clonePoint: { x: 0, y: 0 },
  point13: undefined,
  point14: undefined,
  point15: undefined,
  point16: undefined,
  extensionLineRotation: undefined,
  dimensionRotation: undefined,
  leaderLength: undefined,
  ordinateFlags: undefined,
  ...overrides,
});

const aligned = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "aligned",
    point13: p3(0, 0),
    point14: p3(100, 0),
    definitionPoint: p3(50, 30),
  }),
  "COTAS",
);
assert.equal(aligned?.dimensionKind, "aligned");
assert.deepEqual(aligned?.a, { x: 0, y: 0 });
assert.deepEqual(aligned?.b, { x: 100, y: 0 });
assert.equal(aligned?.offset, 30, "distancia con signo del punto de definición a la recta a→b");

const linearX = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "linear",
    point13: p3(0, 0),
    point14: p3(80, 0),
    definitionPoint: p3(40, 25),
    dimensionRotation: 0,
  }),
  "COTAS",
);
assert.equal(linearX?.dimensionKind, "linear");
assert.equal((linearX as { axis?: string })?.axis, "x");
assert.equal((linearX as { offset?: number })?.offset, 25);

const linearY = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "linear",
    point13: p3(10, 0),
    point14: p3(10, 50),
    definitionPoint: p3(35, 25),
    dimensionRotation: Math.PI / 2,
  }),
  "COTAS",
);
assert.equal((linearY as { axis?: string })?.axis, "y", "giro de π/2 rad = 90°: eje Y");
assert.equal((linearY as { offset?: number })?.offset, 25);

const linearGirada = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "linear",
    point13: p3(0, 0),
    point14: p3(10, 10),
    definitionPoint: p3(5, 5),
    dimensionRotation: Math.PI / 4,
  }),
  "COTAS",
);
assert.equal(
  linearGirada,
  null,
  "un giro que no es 0° ni 90° no cabe en el modelo canónico: se declina, no se aproxima",
);

const radius = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({ dimensionKind: "radius", point15: p3(20, 20), definitionPoint: p3(20, 25) }),
  "COTAS",
);
assert.equal(radius?.dimensionKind, "radius");
assert.deepEqual(radius?.a, { x: 20, y: 20 });
assert.equal((radius as { radius?: number })?.radius, 5);

const diameter = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({ dimensionKind: "diameter", point15: p3(0, 0), definitionPoint: p3(10, 0) }),
  "COTAS",
);
assert.equal(diameter?.dimensionKind, "diameter");
assert.deepEqual(diameter?.a, { x: 5, y: 0 }, "el centro es el punto medio de los dos extremos");
assert.equal((diameter as { radius?: number })?.radius, 5);

const angular = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "angular3pt",
    point15: p3(0, 0),
    point13: p3(10, 0),
    point14: p3(0, 10),
    definitionPoint: p3(0, 0),
  }),
  "COTAS",
);
assert.equal(angular?.dimensionKind, "angular", "angular3pt del modelo neutral es angular en el canónico");
assert.deepEqual(angular?.a, { x: 0, y: 0 });
assert.deepEqual(angular?.b, { x: 10, y: 0 });
assert.deepEqual((angular as { c?: unknown })?.c, { x: 0, y: 10 });

const ordinateX = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "ordinate",
    definitionPoint: p3(100, 50),
    point13: p3(120, 50),
    flags: 64,
  }),
  "COTAS",
);
assert.equal((ordinateX as { axis?: string })?.axis, "x", "bit 64 de flags: mide sobre X");
assert.deepEqual(ordinateX?.b, { x: 120, y: 50 });

const ordinateY = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "ordinate",
    definitionPoint: p3(0, 0),
    point13: p3(0, 15),
    point14: p3(5, 15),
    flags: 0,
  }),
  "COTAS",
);
assert.equal((ordinateY as { axis?: string })?.axis, "y", "sin el bit 64: mide sobre Y");
assert.deepEqual((ordinateY as { c?: unknown })?.c, { x: 5, y: 15 });

assert.equal(
  dwgDimensionToCadDxfSemanticDimension(
    baseDimension({ dimensionKind: "angular2ln", definitionPoint: p3(0, 0) }),
    "COTAS",
  ),
  null,
  "angular de dos líneas se declina: intersecar dos rectas es el mismo riesgo que en DXF ajeno",
);
assert.equal(
  dwgDimensionToCadDxfSemanticDimension(
    baseDimension({ dimensionKind: "aligned", definitionPoint: p3(0, 0) }),
    "COTAS",
  ),
  null,
  "sin point13/point14 no hay geometría que reconstruir",
);

const cotaConTexto = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "aligned",
    point13: p3(0, 0),
    point14: p3(10, 0),
    definitionPoint: p3(5, 5),
    userTextBytes: bytesDe("3.20 m"),
  }),
  "COTAS",
);
assert.equal(cotaConTexto?.text, "3.20 m");
const cotaConMarcador = dwgDimensionToCadDxfSemanticDimension(
  baseDimension({
    dimensionKind: "aligned",
    point13: p3(0, 0),
    point14: p3(10, 0),
    definitionPoint: p3(5, 5),
    userTextBytes: bytesDe("<>"),
  }),
  "COTAS",
);
assert.equal(
  cotaConMarcador?.text,
  undefined,
  "\"<>\" es el marcador de \"usa la medida\": no se copia como texto literal",
);

// ─── HATCH: sólo caminos poligonales, camino a camino ──────────────────────
const hatchMixto = dwgHatchToCadDxfHatch(
  {
    kind: "hatch",
    elevation: 0,
    extrusion: p3(0, 0, 1),
    nameBytes: bytesDe("ANSI31"),
    solidFill: false,
    associative: false,
    paths: [
      {
        kind: "polyline",
        flags: 0,
        closed: true,
        vertices: [p2(0, 0), p2(10, 0), p2(10, 10), p2(0, 10)],
        bulges: undefined,
        boundaryObjectCount: 0,
      },
      {
        kind: "segments",
        flags: 0,
        segments: [{ kind: "line", start: p2(0, 0), end: p2(1, 1) }],
        boundaryObjectCount: 0,
      },
    ],
    style: 1,
    patternType: 0,
    angle: Math.PI / 4,
    scaleOrSpacing: 2,
    doubleHatch: undefined,
    definitionLines: undefined,
    pixelSize: undefined,
    seedPoints: [p2(5, 5)],
  },
  "0",
);
assert.equal(hatchMixto.droppedPaths, 1, "el camino de segmentos se cuenta y se descarta");
assert.equal(hatchMixto.hatch?.pattern, "ANSI31");
assert.equal(hatchMixto.hatch?.solid, false);
assert.equal(hatchMixto.hatch?.boundaries.length, 1, "sólo el camino polilínea sobrevive");
assert.deepEqual(hatchMixto.hatch?.boundaries[0], [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]);
assert.equal(hatchMixto.hatch?.scale, 2);
assert.equal(hatchMixto.hatch?.angle, 45, "π/4 radianes son 45°, igual criterio que el resto del puente");
assert.deepEqual(hatchMixto.hatch?.origin, { x: 5, y: 5 }, "el primer punto semilla, igual que el lector DXF");
assert.equal(hatchMixto.hatch?.islandStyle, "outer", "style 1 es contorno exterior");

const hatchSoloCurvo = dwgHatchToCadDxfHatch(
  {
    kind: "hatch",
    elevation: 0,
    extrusion: p3(0, 0, 1),
    nameBytes: bytesDe("SOLID"),
    solidFill: true,
    associative: false,
    paths: [
      {
        kind: "segments",
        flags: 0,
        segments: [
          { kind: "arc", center: p2(0, 0), radius: 5, startAngle: 0, endAngle: Math.PI, counterClockwise: true },
        ],
        boundaryObjectCount: 0,
      },
    ],
    style: 0,
    patternType: 1,
    angle: undefined,
    scaleOrSpacing: undefined,
    doubleHatch: undefined,
    definitionLines: undefined,
    pixelSize: undefined,
    seedPoints: [],
  },
  "0",
);
assert.equal(
  hatchSoloCurvo.hatch,
  null,
  "sin ningún camino poligonal no hay relleno que colocar, no una versión a medias",
);
assert.equal(hatchSoloCurvo.droppedPaths, 1);

console.log(
  "dwg-document-bridge-entities: ELLIPSE/SPLINE/MTEXT/DIMENSION/HATCH mapeados uno a uno, " +
    "geometría verificada a mano, casos límite y de rechazo cubiertos",
);
