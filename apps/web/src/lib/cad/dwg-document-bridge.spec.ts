/**
 * El puente DWG: probado entero, con la puerta cerrada.
 *
 * Esta spec tiene un trabajo que no es el habitual. No viene a demostrar que
 * una capacidad funciona: viene a demostrar que NO está disponible, que no se
 * puede habilitar por descuido y que el mapeo —lo único que se puede construir
 * sin firma— está escrito y probado para el día que la firma llegue.
 *
 * EL CASO QUE IMPORTA es el bloque «la bandera no se enciende sola». Si alguien
 * pone `DWG_IMPORT_FLAG = true` sin los gates, esta spec FALLA y el CI la
 * bloquea. No es un recordatorio: es el gate. ADR-0004 y ADR-0007 exigen otro
 * ADR, revisión jurídica, revisión de seguridad, corpus independiente y
 * evidencia de fidelidad ANTES de habilitar nada, y ninguna de esas cosas la
 * puede firmar un programa.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import {
  DWG_IMPORT_DISABLED_REASON,
  DWG_IMPORT_FLAG,
  DWG_PROMOTION_GATES,
  DWG_REQUIRED_INDEPENDENT_VALIDATIONS,
  dwgImportIsEnabled,
  dwgPromotionBlockers,
  type DwgPromotionGates,
} from "./dwg-interop-flag";
import {
  DWG_BRIDGE_LOSS_CODES,
  DwgBridgeError,
  dwgBridgeStatus,
  dwgDimensionToCadDxfSemanticDimension,
  dwgGeometryToPrimitive,
  dwgHatchToCadDxfHatch,
  dwgMTextToCadDxfMText,
  dwgNeutralDatabaseToCadDocument,
  importDwgDocumentBytes,
} from "./dwg-document-bridge";
import {
  MAX_DWG_IMPORT_BYTES,
  importLimitForFileName,
  validateImportFile,
} from "./document-import";
import type {
  DwgNeutralDatabase,
  DwgNeutralEntityRecord,
  DwgNeutralPoint2,
  DwgNeutralPoint3,
} from "./dwg-neutral-model";

// ─── 1. LA BANDERA NO SE ENCIENDE SOLA ──────────────────────────────────────
// Va PRIMERO a propósito: si alguien la enciende, lo que tiene que leer es qué
// firmas le faltan, no un `true !== false` sin contexto.
if (DWG_IMPORT_FLAG) {
  assert.deepEqual(
    dwgPromotionBlockers(DWG_PROMOTION_GATES),
    [],
    "LA BANDERA DWG ESTÁ ENCENDIDA CON GATES PENDIENTES. ADR-0004 y ADR-0007 exigen ADR de promoción, revisión jurídica, revisión de seguridad, corpus independiente admitido, dos validaciones independientes y evidencia de fidelidad del mapping ANTES de habilitar la importación. Apágala o consigue las firmas.",
  );
  // Y aunque los gates se declararan firmados, la evidencia EJECUTABLE del
  // repositorio tiene que sostenerlo: declarar un hecho no lo hace cierto.
  const matrix = "../../docs/cad/evidence/dwg-decoder-matrix.json";
  assert.ok(
    existsSync(matrix),
    "con la bandera encendida, la evidencia del decodificador es obligatoria",
  );
  const evidence = JSON.parse(readFileSync(matrix, "utf8")) as {
    resumen: { bundlesAdmitidos: number; tiposVerificadosIndependientemente: number };
  };
  assert.ok(
    evidence.resumen.bundlesAdmitidos >= 1 &&
      evidence.resumen.tiposVerificadosIndependientemente >= 1,
    "con la bandera encendida, la evidencia tiene que mostrar corpus admitido y tipos verificados fuera del laboratorio; hoy dice cero de las dos cosas",
  );
}

// ─── 2. La bandera está apagada y el gate cerrado ───────────────────────────
assert.equal(DWG_IMPORT_FLAG, false, "la bandera de importación DWG nace y permanece APAGADA");
assert.equal(dwgImportIsEnabled(), false, "y con ella apagada la importación no está habilitada");
assert.ok(
  dwgPromotionBlockers().length >= 7,
  "hoy faltan TODOS los gates de promoción, y constan uno a uno",
);
assert.ok(
  dwgPromotionBlockers().some((blocker) => blocker.includes("ADR de promoción")),
  "el primer bloqueo es el ADR que ningún programa puede firmar",
);
assert.equal(
  DWG_PROMOTION_GATES.admittedCorpusBundles,
  0,
  "cero bundles admitidos en el corpus independiente",
);
assert.equal(
  DWG_PROMOTION_GATES.independentValidations,
  0,
  "cero validaciones independientes autorizadas",
);
assert.equal(DWG_REQUIRED_INDEPENDENT_VALIDATIONS, 2, "la política exige dos oráculos, no uno");

// Encenderla sin gates NO abre la puerta: el gate es una conjunción.
assert.equal(
  dwgImportIsEnabled(true, DWG_PROMOTION_GATES),
  false,
  "encender la bandera con los gates pendientes deja la importación cerrada: fallo cerrado",
);

const gatesFirmados: DwgPromotionGates = {
  promotionAdrSigned: true,
  legalReviewCleared: true,
  securityReviewCleared: true,
  admittedCorpusBundles: 1,
  independentValidations: 2,
  labEntityImportSupported: true,
  canonicalMappingVerified: true,
};
assert.deepEqual(dwgPromotionBlockers(gatesFirmados), [], "con todo firmado no queda bloqueo");
assert.equal(
  dwgImportIsEnabled(true, gatesFirmados),
  true,
  "y sólo entonces la importación quedaría habilitada: el cierre de hoy es un resultado, no una constante",
);
assert.equal(
  dwgImportIsEnabled(false, gatesFirmados),
  false,
  "con todos los gates firmados pero la bandera apagada, sigue cerrado",
);
for (const gate of Object.keys(gatesFirmados) as Array<keyof DwgPromotionGates>) {
  const uno = { ...gatesFirmados, [gate]: typeof gatesFirmados[gate] === "number" ? 0 : false };
  assert.equal(
    dwgImportIsEnabled(true, uno),
    false,
    `basta con que falte ${gate} para que el gate siga cerrado`,
  );
}

// ─── 3. La interfaz de importación sigue rechazando .dwg ────────────────────
assert.throws(
  () => validateImportFile("plano.dwg", 1000),
  /no soportado/i,
  "la interfaz de importación rechaza .dwg mientras el gate esté cerrado",
);
assert.throws(() => validateImportFile("PLANO.DWG", 1000), /no soportado/i, "y da igual la caja");
assert.equal(
  importLimitForFileName("plano.dwg"),
  MAX_DWG_IMPORT_BYTES,
  "el límite del binario está declarado aunque hoy no se pueda alcanzar",
);
const estado = dwgBridgeStatus();
assert.equal(estado.available, false, "el estado del puente dice que no está disponible");
assert.equal(estado.reason, DWG_IMPORT_DISABLED_REASON, "con la razón exacta y accionable");
assert.match(estado.reason, /DXF/u, "y la salida real —exportar a DXF— va primero");
assert.doesNotMatch(
  DWG_IMPORT_DISABLED_REASON,
  /compatible con DWG|soporte DWG|reemplaza(?:r)? a AutoCAD|sustituye a AutoCAD/iu,
  "la razón no cuela ningún claim que el producto no cumpla",
);

// ─── 4. La mitad que toca bytes falla CERRADO y tipado ──────────────────────
const bytes = new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x31, 0x35]);
assert.throws(
  () => importDwgDocumentBytes(bytes),
  (error: unknown) =>
    error instanceof DwgBridgeError &&
    error.code === "DWG_IMPORT_DISABLED" &&
    error.blockers.length > 0,
  "importar bytes falla con error tipado, no con un resultado a medias",
);
// Ni siquiera pasando un decodificador se salta el gate.
assert.throws(
  () => importDwgDocumentBytes(bytes, () => vacia),
  (error: unknown) => error instanceof DwgBridgeError && error.code === "DWG_IMPORT_DISABLED",
  "traer un decodificador propio no abre la puerta: la bandera se comprueba antes",
);

// ─── 5. El mapeo, que es lo que sí se puede construir hoy ───────────────────
const p3 = (x: number, y: number, z = 0): DwgNeutralPoint3 => ({ x, y, z });
const p2 = (x: number, y: number): DwgNeutralPoint2 => ({ x, y });
const bytesDe = (text: string): number[] => [...text].map((char) => char.charCodeAt(0) & 0xff);
const registro = (
  handle: number,
  entity: DwgNeutralEntityRecord["entity"],
  layerHandle?: number,
  insertedBlockName?: number[],
): DwgNeutralEntityRecord => ({ handle, entity, layerHandle, insertedBlockName });

const vacia: DwgNeutralDatabase = {
  layers: [],
  blocks: [],
  modelSpaceEntities: [],
  unsupported: [],
  diagnostics: [],
};
const informeVacio = dwgNeutralDatabaseToCadDocument(vacia);
assert.equal(informeVacio.format, "dwg", "el informe declara su formato de origen");
assert.equal(informeVacio.importedEntityCount, 0, "una base vacía produce un documento vacío");
assert.ok(
  informeVacio.document.layers.some((layer) => layer.id === "0"),
  "la capa 0 existe siempre, como en cualquier dibujo",
);

const base: DwgNeutralDatabase = {
  layers: [
    { handle: 0x10, name: bytesDe("MUROS"), colorIndex: 1, stateFlags: 0 },
    { handle: 0x11, name: bytesDe("COTASÑ"), colorIndex: 2, stateFlags: 0 },
  ],
  blocks: [
    {
      handle: 0x20,
      name: bytesDe("PUERTA"),
      blockBeginHandle: 0x21,
      blockEndHandle: 0x22,
      entities: [
        registro(
          0x23,
          {
            kind: "line",
            start: p3(0, 0),
            end: p3(90, 0),
            thickness: 0,
            extrusion: p3(0, 0, 1),
          },
          0x10,
        ),
      ],
    },
  ],
  modelSpaceEntities: [
    registro(
      0x30,
      { kind: "line", start: p3(0, 0), end: p3(100, 50), thickness: 0, extrusion: p3(0, 0, 1) },
      0x10,
    ),
    registro(
      0x31,
      { kind: "circle", center: p3(10, 10), radius: 5, thickness: 0, extrusion: p3(0, 0, 1) },
      0x10,
    ),
    registro(
      0x32,
      {
        kind: "arc",
        center: p3(20, 20),
        radius: 4,
        thickness: 0,
        extrusion: p3(0, 0, 1),
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      0x11,
    ),
    registro(
      0x33,
      {
        kind: "lwpolyline",
        closed: true,
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        bulges: [0, 0.5, 0],
        widths: undefined,
        constantWidth: undefined,
        elevation: undefined,
        thickness: undefined,
        extrusion: undefined,
      },
      0x10,
    ),
    registro(
      0x34,
      {
        kind: "text",
        insertion: { x: 5, y: 5 },
        elevation: undefined,
        alignment: undefined,
        thickness: 0,
        extrusion: p3(0, 0, 1),
        obliqueAngle: undefined,
        rotation: 0,
        height: 2.5,
        widthFactor: undefined,
        valueBytes: bytesDe("SALÓN"),
        generation: undefined,
        horizontalAlignment: undefined,
        verticalAlignment: undefined,
      },
      0x11,
    ),
    registro(
      0x35,
      {
        kind: "insert",
        position: p3(50, 50),
        scale: p3(1, 1, 1),
        rotation: 0,
        extrusion: p3(0, 0, 1),
        attributesFollow: true,
      },
      0x10,
      bytesDe("PUERTA"),
    ),
    // Capa que no existe en la tabla: cae a "0" y CONSTA.
    registro(
      0x36,
      { kind: "point", position: p3(1, 2), thickness: 0, extrusion: p3(0, 0, 1), xAxisAngle: 0 },
      0x99,
    ),
    // INSERT cuyo bloque no resolvió: no se coloca y consta como error.
    registro(
      0x37,
      {
        kind: "insert",
        position: p3(0, 0),
        scale: p3(1, 1, 1),
        rotation: 0,
        extrusion: p3(0, 0, 1),
        attributesFollow: false,
      },
      0x10,
    ),
  ],
  unsupported: [{ handle: 0x40, type: 44 }],
  diagnostics: [
    { code: "DWG_OWNER_UNRESOLVED", severity: "warning", offset: 1024, message: "propietario desconocido" },
  ],
};

const informe = dwgNeutralDatabaseToCadDocument(base);
assert.equal(informe.format, "dwg");
assert.ok(informe.importedEntityCount >= 6, "las entidades de model space llegan al documento");
assert.equal(informe.importedBlockCount, 1, "el bloque llega como definición");
assert.ok(
  informe.document.layers.some((layer) => layer.id === "MUROS"),
  "las capas del dibujo llegan con su nombre",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "line"),
  "una LINE vuelve línea",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "circle"),
  "un CIRCLE vuelve círculo",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "insert"),
  "un INSERT resuelto vuelve referencia de bloque",
);
assert.equal(
  informe.document.modelSpace?.entityIds.length,
  informe.document.entities.length,
  "el orden del mapa de objetos es el orden de dibujo",
);

const codigos = new Set(informe.document.lossManifest.map((entry) => entry.code));
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.unsupportedObject), "lo no decodificado se PUBLICA");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.diagnostic), "los diagnósticos del decodificador también");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.danglingLayer), "una capa que no resuelve consta");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.danglingBlock), "un INSERT que no resuelve consta");
assert.ok(
  codigos.has(DWG_BRIDGE_LOSS_CODES.codePage),
  "un nombre con bytes fuera de ASCII declara que la página de códigos no se decodifica",
);
assert.ok(
  informe.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.danglingBlock && entry.severity === "error",
  ),
  "un INSERT sin bloque es error, no aviso: falta geometría en el plano",
);

// Ángulos: el modelo neutral habla radianes y el canónico grados.
const arco = dwgGeometryToPrimitive(
  {
    kind: "arc",
    center: p3(0, 0),
    radius: 1,
    thickness: 0,
    extrusion: p3(0, 0, 1),
    startAngle: 0,
    endAngle: Math.PI,
  },
  "0",
);
assert.equal(arco?.endAngle, 180, "π radianes son 180 grados, convertidos UNA vez en el puente");
const poli = dwgGeometryToPrimitive(
  {
    kind: "lwpolyline",
    closed: false,
    vertices: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    bulges: [0.25, 0],
    widths: undefined,
    constantWidth: undefined,
    elevation: undefined,
    thickness: undefined,
    extrusion: undefined,
  },
  "0",
);
assert.equal(poli?.points[0].bulge, 0.25, "el bulge se queda en el vértice donde arranca el segmento");
assert.equal(poli?.points[1].bulge, undefined, "un bulge cero no se escribe: ausencia es recto");

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
  "dwg-document-bridge: bandera APAGADA, gate cerrado con 7 bloqueos, .dwg rechazado, mapeo neutral→canónico probado con sus pérdidas declaradas",
);
