/**
 * Decodificadores de las entidades complejas R2000 — campaña 2026-08-21.
 *
 * LEADER, TOLERANCE, MLINE, VIEWPORT (la entidad de paper space) y HATCH.
 * Hechos registrados en SOURCE_REGISTER (ODA-ODS-DWG-5.4.1-PUBLIC); mismas
 * reglas de la casa: fallo cerrado con offset, doubles no finitos son
 * corrupción, recuentos cobrados ANTES de reservar, códigos y bits sin
 * semántica registrada viajan CRUDOS y nada se ignora en silencio.
 *
 * Este módulo es HOJA a propósito: importa sólo de `bitcodes`, del modelo,
 * de `parse-error` y de `entity-common` — nunca de `entities-core` (historial
 * de ciclo TDZ entre el despachador y sus hermanos).
 */
import type { DwgBitReader } from "../codecs/bitcodes.js";
import type {
  DwgHatchDefinitionLine,
  DwgHatchEntity,
  DwgHatchPath,
  DwgHatchSegment,
  DwgLeaderEntity,
  DwgMlineEntity,
  DwgMlineStyleLineParameters,
  DwgMlineVertex,
  DwgPoint2,
  DwgPoint3,
  DwgToleranceEntity,
  DwgViewportEntity,
} from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import { finiteDecoded, frozenPoint3 } from "./entity-common.js";

/** Códigos de tipo BS (hechos registrados). */
export const AC1015_TYPE_VIEWPORT = 0x22;
export const AC1015_TYPE_LEADER = 0x2d;
export const AC1015_TYPE_TOLERANCE = 0x2e;
export const AC1015_TYPE_MLINE = 0x2f;
export const AC1015_TYPE_HATCH = 0x4e;

/** Tope de laboratorio para cualquier recuento de esta campaña. */
const COMPLEX_MAX_COUNT = 65_536;

/**
 * Banderas de un camino de HATCH (hecho registrado): el bit de valor 2 marca
 * el camino polilínea y el bit de DERIVADO pide el tamaño de pixel al final.
 * El resto de bits viaja crudo en el modelo, sin interpretarse.
 */
/**
 * Bits de la bandera de un camino de HATCH. Se EXPORTAN desde el 2026-09-01
 * porque el writer los necesita para emitir un camino polilínea: dos
 * definiciones de «qué bit significa polilínea» —una aquí y otra allá—
 * divergirían sin que ninguna prueba lo viera, que es exactamente la clase de
 * fallo que el round-trip no puede atrapar cuando ambos lados se equivocan
 * igual.
 */
export const HATCH_PATH_POLYLINE_BIT = 0x2;
export const HATCH_PATH_DERIVED_BIT = 0x4;

/**
 * LEADER: bit sin nombre, tipos BS de anotación y camino, puntos con su
 * recuento BL, origen del plano, extrusión 3BD, dirección X, offset al
 * bloque, la proyección R14+ del extremo, caja (alto/ancho BD), bits de
 * hookline y flecha, y la cola R2000+ (un BS y dos bits) — todo lo sin
 * semántica, CRUDO. La anotación asociada y el DIMSTYLE viven en el flujo
 * final (opaco).
 */
export function decodeLeader(reader: DwgBitReader): DwgLeaderEntity {
  const unnamedBit = reader.readB();
  const annotationType = reader.readBS();
  const pathType = reader.readBS();
  const pointCount = readBoundedCount(reader, reader.readBL(), "leader point");
  const points: DwgPoint3[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    points.push(readPoint(reader, "a leader point"));
  }
  const origin = readPoint(reader, "a leader origin");
  const extrusion = readPoint(reader, "a leader extrusion");
  const xDirection = readPoint(reader, "a leader X direction");
  const blockInsertOffset = readPoint(reader, "a leader block insert offset");
  const endpointProjection = readPoint(reader, "a leader endpoint projection");
  const boxHeight = finiteDecoded(reader, reader.readBD(), "a leader box height");
  const boxWidth = finiteDecoded(reader, reader.readBD(), "a leader box width");
  const hooklineAlongXDirection = reader.readB();
  const arrowheadOn = reader.readB();
  const unnamedShort = reader.readBS();
  const unnamedBitA = reader.readB();
  const unnamedBitB = reader.readB();
  return Object.freeze({
    kind: "leader" as const,
    unnamedBit,
    annotationType,
    pathType,
    points: Object.freeze(points),
    origin,
    extrusion,
    xDirection,
    blockInsertOffset,
    endpointProjection,
    boxHeight,
    boxWidth,
    hooklineAlongXDirection,
    arrowheadOn,
    unnamedShort,
    unnamedBitA,
    unnamedBitB,
  });
}

/**
 * TOLERANCE: inserción 3BD, dirección X 3BD, extrusión 3BD y cadena TV como
 * BYTES (la página de códigos es de una capa superior). El DIMSTYLE viaja en
 * el flujo final.
 */
export function decodeTolerance(reader: DwgBitReader): DwgToleranceEntity {
  const insertion = readPoint(reader, "a tolerance insertion");
  const xDirection = readPoint(reader, "a tolerance X direction");
  const extrusion = readPoint(reader, "a tolerance extrusion");
  const textBytes = readFrozenBytes(reader);
  return Object.freeze({
    kind: "tolerance" as const,
    insertion,
    xDirection,
    extrusion,
    textBytes,
  });
}

/**
 * MLINE: escala BD, justificación RC, base 3BD, extrusión 3BD, banderas BS de
 * apertura/cierre, recuento RC de líneas del estilo y recuento BS de
 * vértices; cada vértice trae punto, dirección del vértice y dirección de
 * inglete (3BD cada una) y, POR línea del estilo, un recuento BS de
 * parámetros de segmento con sus BD y otro de parámetros de relleno con sus
 * BD. El MLINESTYLE viaja en el flujo final.
 */
export function decodeMline(reader: DwgBitReader): DwgMlineEntity {
  const scale = finiteDecoded(reader, reader.readBD(), "an mline scale");
  const justification = reader.readRC();
  const basePoint = readPoint(reader, "an mline base point");
  const extrusion = readPoint(reader, "an mline extrusion");
  const openClosedFlags = reader.readBS();
  const styleLineCount = reader.readRC();
  const vertexCount = readBoundedCount(
    reader,
    reader.readBS(),
    "mline vertex",
  );
  const vertices: DwgMlineVertex[] = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const position = readPoint(reader, "an mline vertex");
    const vertexDirection = readPoint(reader, "an mline vertex direction");
    const miterDirection = readPoint(reader, "an mline miter direction");
    const styleLines: DwgMlineStyleLineParameters[] = [];
    for (let line = 0; line < styleLineCount; line += 1) {
      const segmentParameters = readBoundedDoubles(
        reader,
        "mline segment parameter",
      );
      const areaFillParameters = readBoundedDoubles(
        reader,
        "mline area fill parameter",
      );
      styleLines.push(
        Object.freeze({ segmentParameters, areaFillParameters }),
      );
    }
    vertices.push(
      Object.freeze({
        position,
        vertexDirection,
        miterDirection,
        styleLines: Object.freeze(styleLines),
      }),
    );
  }
  return Object.freeze({
    kind: "mline" as const,
    scale,
    justification,
    basePoint,
    extrusion,
    openClosedFlags,
    styleLineCount,
    vertices: Object.freeze(vertices),
  });
}

/**
 * VIEWPORT (entidad): centro 3BD, ancho y alto BD, objetivo y dirección de
 * vista 3BD, giro/altura de vista/lente/planos de recorte/ángulo de snap BD,
 * centro de vista, base y espaciado de snap y espaciado de grid como 2RD,
 * zoom de círculo BS y la cola R2000+: recuento BL de capas congeladas (sus
 * handles viven en el flujo final), banderas de estado BL, hoja de estilos
 * TV, modo de render RC, bits de UCS, origen y ejes del UCS 3BD, elevación
 * UCS BD y tipo de vista ortográfica BS. Lo sin semántica viaja crudo.
 */
export function decodeViewport(reader: DwgBitReader): DwgViewportEntity {
  const center = readPoint(reader, "a viewport center");
  const width = finiteDecoded(reader, reader.readBD(), "a viewport width");
  const height = finiteDecoded(reader, reader.readBD(), "a viewport height");
  const viewTarget = readPoint(reader, "a viewport view target");
  const viewDirection = readPoint(reader, "a viewport view direction");
  const twistAngle = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport twist angle",
  );
  const viewHeight = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport view height",
  );
  const lensLength = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport lens length",
  );
  const frontClip = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport front clip",
  );
  const backClip = finiteDecoded(reader, reader.readBD(), "a viewport back clip");
  const snapAngle = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport snap angle",
  );
  const viewCenter = readPoint2RD(reader, "a viewport view center");
  const snapBase = readPoint2RD(reader, "a viewport snap base");
  const snapSpacing = readPoint2RD(reader, "a viewport snap spacing");
  const gridSpacing = readPoint2RD(reader, "a viewport grid spacing");
  const circleZoom = reader.readBS();
  const frozenLayerCount = readBoundedCount(
    reader,
    reader.readBL(),
    "viewport frozen layer",
  );
  const statusFlags = reader.readBL();
  const styleSheetBytes = readFrozenBytes(reader);
  const renderMode = reader.readRC();
  const ucsAtOrigin = reader.readB();
  const ucsPerViewport = reader.readB();
  const ucsOrigin = readPoint(reader, "a viewport UCS origin");
  const ucsXAxis = readPoint(reader, "a viewport UCS X axis");
  const ucsYAxis = readPoint(reader, "a viewport UCS Y axis");
  const ucsElevation = finiteDecoded(
    reader,
    reader.readBD(),
    "a viewport UCS elevation",
  );
  const ucsOrthoViewType = reader.readBS();
  return Object.freeze({
    kind: "viewport" as const,
    center,
    width,
    height,
    viewTarget,
    viewDirection,
    twistAngle,
    viewHeight,
    lensLength,
    frontClip,
    backClip,
    snapAngle,
    viewCenter,
    snapBase,
    snapSpacing,
    gridSpacing,
    circleZoom,
    frozenLayerCount,
    statusFlags,
    styleSheetBytes,
    renderMode,
    ucsAtOrigin,
    ucsPerViewport,
    ucsOrigin,
    ucsXAxis,
    ucsYAxis,
    ucsElevation,
    ucsOrthoViewType,
  });
}

/**
 * HATCH: elevación Z BD, extrusión 3BD, nombre TV, bits de relleno sólido y
 * asociatividad, caminos con su recuento BL (polilínea o segmentos según el
 * bit 2 de sus banderas), estilo y tipo de patrón BS, los campos de patrón
 * sólo sin relleno sólido, el tamaño de pixel sólo con algún camino derivado
 * y los puntos semilla 2RD con su recuento BL. Los handles de los objetos
 * frontera (su recuento cierra cada camino) viven en el flujo final.
 */
export function decodeHatch(reader: DwgBitReader): DwgHatchEntity {
  const elevation = finiteDecoded(reader, reader.readBD(), "a hatch elevation");
  const extrusion = readPoint(reader, "a hatch extrusion");
  const nameBytes = readFrozenBytes(reader);
  const solidFill = reader.readB() === 1;
  const associative = reader.readB() === 1;

  const pathCount = readBoundedCount(reader, reader.readBL(), "hatch path");
  const paths: DwgHatchPath[] = [];
  let anyDerived = false;
  for (let index = 0; index < pathCount; index += 1) {
    const path = decodeHatchPath(reader);
    if ((path.flags & HATCH_PATH_DERIVED_BIT) !== 0) anyDerived = true;
    paths.push(path);
  }

  const style = reader.readBS();
  const patternType = reader.readBS();

  let angle: number | undefined;
  let scaleOrSpacing: number | undefined;
  let doubleHatch: boolean | undefined;
  let definitionLines: readonly DwgHatchDefinitionLine[] | undefined;
  if (!solidFill) {
    angle = finiteDecoded(reader, reader.readBD(), "a hatch pattern angle");
    scaleOrSpacing = finiteDecoded(
      reader,
      reader.readBD(),
      "a hatch pattern scale",
    );
    doubleHatch = reader.readB() === 1;
    const lineCount = readBoundedCount(
      reader,
      reader.readBS(),
      "hatch definition line",
    );
    const lines: DwgHatchDefinitionLine[] = [];
    for (let index = 0; index < lineCount; index += 1) {
      const lineAngle = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch line angle",
      );
      const basePoint = readPoint2BD(reader, "a hatch line base point");
      const offset = readPoint2BD(reader, "a hatch line offset");
      const dashCount = readBoundedCount(
        reader,
        reader.readBS(),
        "hatch dash",
      );
      const dashes: number[] = [];
      for (let dash = 0; dash < dashCount; dash += 1) {
        dashes.push(
          finiteDecoded(reader, reader.readBD(), "a hatch dash length"),
        );
      }
      lines.push(
        Object.freeze({
          angle: lineAngle,
          basePoint,
          offset,
          dashes: Object.freeze(dashes),
        }),
      );
    }
    definitionLines = Object.freeze(lines);
  }

  const pixelSize = anyDerived
    ? finiteDecoded(reader, reader.readBD(), "a hatch pixel size")
    : undefined;

  const seedCount = readBoundedCount(
    reader,
    reader.readBL(),
    "hatch seed point",
  );
  const seedPoints: DwgPoint2[] = [];
  for (let index = 0; index < seedCount; index += 1) {
    seedPoints.push(readPoint2RD(reader, "a hatch seed point"));
  }

  return Object.freeze({
    kind: "hatch" as const,
    elevation,
    extrusion,
    nameBytes,
    solidFill,
    associative,
    paths: Object.freeze(paths),
    style,
    patternType,
    angle,
    scaleOrSpacing,
    doubleHatch,
    definitionLines,
    pixelSize,
    seedPoints: Object.freeze(seedPoints),
  });
}

/** Un camino de HATCH: banderas BL, forma polilínea o segmentos y su cierre. */
function decodeHatchPath(reader: DwgBitReader): DwgHatchPath {
  const flags = reader.readBL();
  if ((flags & HATCH_PATH_POLYLINE_BIT) === 0) {
    const segmentCount = readBoundedCount(
      reader,
      reader.readBL(),
      "hatch segment",
    );
    const segments: DwgHatchSegment[] = [];
    for (let index = 0; index < segmentCount; index += 1) {
      segments.push(decodeHatchSegment(reader));
    }
    const boundaryObjectCount = readBoundedCount(
      reader,
      reader.readBL(),
      "hatch boundary object",
    );
    return Object.freeze({
      kind: "segments" as const,
      flags,
      segments: Object.freeze(segments),
      boundaryObjectCount,
    });
  }

  const hasBulges = reader.readB() === 1;
  const closed = reader.readB() === 1;
  const vertexCount = readBoundedCount(
    reader,
    reader.readBL(),
    "hatch path vertex",
  );
  const vertices: DwgPoint2[] = [];
  const bulges: number[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    vertices.push(readPoint2RD(reader, "a hatch path vertex"));
    if (hasBulges) {
      bulges.push(finiteDecoded(reader, reader.readBD(), "a hatch path bulge"));
    }
  }
  const boundaryObjectCount = readBoundedCount(
    reader,
    reader.readBL(),
    "hatch boundary object",
  );
  return Object.freeze({
    kind: "polyline" as const,
    flags,
    closed,
    vertices: Object.freeze(vertices),
    bulges: hasBulges ? Object.freeze(bulges) : undefined,
    boundaryObjectCount,
  });
}

/**
 * Un segmento de camino por su tipo RC: 1 línea, 2 arco circular, 3 arco
 * elíptico, 4 spline. Otro tipo es corrupción — el formato sólo define esos
 * cuatro y adivinar una disposición desincronizaría el cuerpo entero.
 */
function decodeHatchSegment(reader: DwgBitReader): DwgHatchSegment {
  const segmentType = reader.readRC();
  switch (segmentType) {
    case 1: {
      const start = readPoint2RD(reader, "a hatch line segment");
      const end = readPoint2RD(reader, "a hatch line segment");
      return Object.freeze({ kind: "line" as const, start, end });
    }
    case 2: {
      const center = readPoint2RD(reader, "a hatch arc center");
      const radius = finiteDecoded(reader, reader.readBD(), "a hatch arc radius");
      const startAngle = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch arc start angle",
      );
      const endAngle = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch arc end angle",
      );
      const counterClockwise = reader.readB() === 1;
      return Object.freeze({
        kind: "arc" as const,
        center,
        radius,
        startAngle,
        endAngle,
        counterClockwise,
      });
    }
    case 3: {
      const center = readPoint2RD(reader, "a hatch elliptic arc center");
      const majorAxisEndpoint = readPoint2RD(
        reader,
        "a hatch elliptic arc major axis",
      );
      const axisRatio = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch elliptic arc ratio",
      );
      const startAngle = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch elliptic arc start angle",
      );
      const endAngle = finiteDecoded(
        reader,
        reader.readBD(),
        "a hatch elliptic arc end angle",
      );
      const counterClockwise = reader.readB() === 1;
      return Object.freeze({
        kind: "ellipticArc" as const,
        center,
        majorAxisEndpoint,
        axisRatio,
        startAngle,
        endAngle,
        counterClockwise,
      });
    }
    case 4: {
      const degree = reader.readBL();
      const rational = reader.readB() === 1;
      const periodic = reader.readB() === 1;
      const knotCount = readBoundedCount(
        reader,
        reader.readBL(),
        "hatch spline knot",
      );
      const controlCount = readBoundedCount(
        reader,
        reader.readBL(),
        "hatch spline control point",
      );
      const knots: number[] = [];
      for (let index = 0; index < knotCount; index += 1) {
        knots.push(finiteDecoded(reader, reader.readBD(), "a hatch spline knot"));
      }
      const controlPoints: DwgPoint2[] = [];
      const weights: number[] = [];
      for (let index = 0; index < controlCount; index += 1) {
        controlPoints.push(readPoint2RD(reader, "a hatch spline control point"));
        if (rational) {
          weights.push(
            finiteDecoded(reader, reader.readBD(), "a hatch spline weight"),
          );
        }
      }
      return Object.freeze({
        kind: "spline" as const,
        degree,
        rational,
        periodic,
        knots: Object.freeze(knots),
        controlPoints: Object.freeze(controlPoints),
        weights: rational ? Object.freeze(weights) : undefined,
      });
    }
    default:
      throwDwgError(
        "DWG_STRUCTURE_CORRUPT",
        "input",
        Math.floor(reader.bitPosition / 8),
        "A hatch segment type other than 1-4 is not defined by the format.",
      );
  }
}

/** Un recuento ya leído, acotado por el tope de laboratorio ANTES de usarse. */
function readBoundedCount(
  reader: DwgBitReader,
  count: number,
  what: string,
): number {
  if (count > COMPLEX_MAX_COUNT) {
    throwDwgError(
      "DWG_STRUCTURE_CORRUPT",
      "input",
      Math.floor(reader.bitPosition / 8),
      `The ${what} count exceeds the laboratory bound.`,
    );
  }
  return count;
}

/** Un recuento BS de parámetros BD con sus valores, acotado y congelado. */
function readBoundedDoubles(
  reader: DwgBitReader,
  what: string,
): readonly number[] {
  const count = readBoundedCount(reader, reader.readBS(), what);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(finiteDecoded(reader, reader.readBD(), `an ${what}`));
  }
  return Object.freeze(values);
}

/** Un TV como bytes congelados del modelo (misma convención que TEXT). */
function readFrozenBytes(reader: DwgBitReader): readonly number[] {
  const text = reader.readTV();
  const bytes = new Array<number>(text.bytes.length);
  for (let index = 0; index < text.bytes.length; index += 1) {
    bytes[index] = text.bytes[index]!;
  }
  return Object.freeze(bytes);
}

/** Un 3BD validado como punto finito del modelo neutral. */
function readPoint(reader: DwgBitReader, what: string): DwgPoint3 {
  const { x, y, z } = reader.read3BD();
  return frozenPoint3(
    finiteDecoded(reader, x, what),
    finiteDecoded(reader, y, what),
    finiteDecoded(reader, z, what),
  );
}

/** Dos RD validados como punto 2D finito del modelo neutral. */
function readPoint2RD(reader: DwgBitReader, what: string): DwgPoint2 {
  const x = finiteDecoded(reader, reader.readRD(), what);
  const y = finiteDecoded(reader, reader.readRD(), what);
  return Object.freeze({ x, y });
}

/** Un 2BD validado como punto 2D finito del modelo neutral. */
function readPoint2BD(reader: DwgBitReader, what: string): DwgPoint2 {
  const { x, y } = reader.read2BD();
  return Object.freeze({
    x: finiteDecoded(reader, x, what),
    y: finiteDecoded(reader, y, what),
  });
}
