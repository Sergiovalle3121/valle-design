/**
 * Espejo ESTRUCTURAL de la base de datos neutral que produce el laboratorio.
 *
 * POR QUÉ ESTÁ DUPLICADO Y NO IMPORTADO. El laboratorio clean-room vive fuera
 * del producto por decisión de ADR-0007, y el guardián `check:dwg` lo verifica
 * contando importaciones en runtime: tiene que seguir diciendo CERO. Importar
 * aquí sus tipos —aunque `import type` se borre al compilar— metería su nombre
 * en el árbol del producto y el guardián, que busca la cadena y es romo a
 * propósito, lo cazaría. Y haría bien: la frontera no se afloja por comodidad.
 *
 * Así que estas interfaces describen la MISMA FORMA sin nombrar su origen.
 * TypeScript es estructural: el día que la promoción esté firmada, la función
 * del laboratorio encajará en `DwgNeutralDatabaseReader` sin un solo `as`, y la
 * duplicación desaparece de un plumazo sustituyendo este archivo por el import
 * real. ADR-0007 tolera exactamente esta duplicación temporal —lo dice de la
 * gramática de firmas— mientras no haya integración runtime.
 *
 * Es un módulo de TIPOS: no emite nada al compilar, no puede decodificar nada y
 * no toca un solo byte.
 *
 * Dos decisiones del modelo que hay que respetar al mapear:
 *
 * - los NOMBRES viajan como bytes en la página de códigos del dibujo, no como
 *   cadenas: decidir la codificación aquí fingiría una fidelidad que la capa
 *   binaria no puede prometer, y el puente lo declara como pérdida;
 * - los opcionales son `| undefined` EXPLÍCITO: «no viajó en el archivo» es
 *   información distinta de «viajó con su valor por defecto».
 */

export interface DwgNeutralPoint2 {
  readonly x: number;
  readonly y: number;
}

export interface DwgNeutralPoint3 extends DwgNeutralPoint2 {
  readonly z: number;
}

export interface DwgNeutralVertexWidths {
  readonly start: number;
  readonly end: number;
}

export interface DwgNeutralLine {
  readonly kind: "line";
  readonly start: DwgNeutralPoint3;
  readonly end: DwgNeutralPoint3;
  readonly thickness: number;
  readonly extrusion: DwgNeutralPoint3;
}

export interface DwgNeutralPointEntity {
  readonly kind: "point";
  readonly position: DwgNeutralPoint3;
  readonly thickness: number;
  readonly extrusion: DwgNeutralPoint3;
  readonly xAxisAngle: number;
}

export interface DwgNeutralCircle {
  readonly kind: "circle";
  readonly center: DwgNeutralPoint3;
  readonly radius: number;
  readonly thickness: number;
  readonly extrusion: DwgNeutralPoint3;
}

export interface DwgNeutralArc {
  readonly kind: "arc";
  readonly center: DwgNeutralPoint3;
  readonly radius: number;
  readonly thickness: number;
  readonly extrusion: DwgNeutralPoint3;
  /** Radianes sobre el plano de la entidad. */
  readonly startAngle: number;
  readonly endAngle: number;
}

export interface DwgNeutralLwPolyline {
  readonly kind: "lwpolyline";
  readonly closed: boolean;
  readonly vertices: readonly DwgNeutralPoint2[];
  /** Curvatura del segmento que ARRANCA en cada vértice; 0 = recto. */
  readonly bulges: readonly number[] | undefined;
  readonly widths: readonly DwgNeutralVertexWidths[] | undefined;
  readonly constantWidth: number | undefined;
  readonly elevation: number | undefined;
  readonly thickness: number | undefined;
  readonly extrusion: DwgNeutralPoint3 | undefined;
}

export interface DwgNeutralText {
  readonly kind: "text";
  readonly insertion: DwgNeutralPoint2;
  readonly elevation: number | undefined;
  readonly alignment: DwgNeutralPoint2 | undefined;
  readonly thickness: number;
  readonly extrusion: DwgNeutralPoint3;
  readonly obliqueAngle: number | undefined;
  /** Radianes. */
  readonly rotation: number | undefined;
  readonly height: number;
  readonly widthFactor: number | undefined;
  /** Bytes en la página de códigos del dibujo, sin decodificar. */
  readonly valueBytes: readonly number[];
  readonly generation: number | undefined;
  readonly horizontalAlignment: number | undefined;
  readonly verticalAlignment: number | undefined;
}

export interface DwgNeutralInsert {
  readonly kind: "insert";
  readonly position: DwgNeutralPoint3;
  readonly scale: DwgNeutralPoint3;
  /** Radianes. */
  readonly rotation: number;
  readonly extrusion: DwgNeutralPoint3;
  readonly attributesFollow: boolean;
}

/**
 * Elipse: centro, extremo del eje mayor como VECTOR relativo al centro,
 * extrusión, razón de ejes y ángulos paramétricos en RADIANES.
 */
export interface DwgNeutralEllipse {
  readonly kind: "ellipse";
  readonly center: DwgNeutralPoint3;
  readonly majorAxisEndpoint: DwgNeutralPoint3;
  readonly extrusion: DwgNeutralPoint3;
  readonly axisRatio: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/**
 * Spline. El formato guarda dos escenarios excluyentes: 1 = nudos + puntos
 * de control (con pesos opcionales, splines racionales), 2 = puntos de
 * ajuste con tangentes. Los campos del escenario ausente llegan
 * `undefined`. El perfil de producto V2 sólo PROYECTA escenario 1 no
 * racional (ver el único adaptador autorizado a estrechar este tipo); el
 * resto llega hasta aquí para que el puente pueda declarar la pérdida con
 * precisión si algún día cambia el filtro, pero hoy nunca cruza
 * `toBetaProfileGeometry` con otra forma.
 */
export interface DwgNeutralSpline {
  readonly kind: "spline";
  readonly scenario: number;
  readonly degree: number;
  readonly rational: boolean | undefined;
  readonly closed: boolean | undefined;
  readonly periodic: boolean | undefined;
  readonly knotTolerance: number | undefined;
  readonly controlTolerance: number | undefined;
  readonly knots: readonly number[] | undefined;
  readonly controlPoints: readonly DwgNeutralPoint3[] | undefined;
  readonly weights: readonly number[] | undefined;
  readonly fitTolerance: number | undefined;
  readonly startTangent: DwgNeutralPoint3 | undefined;
  readonly endTangent: DwgNeutralPoint3 | undefined;
  readonly fitPoints: readonly DwgNeutralPoint3[] | undefined;
}

/**
 * Texto con formato (MTEXT). El formato (negrita, fuente, alineación de
 * párrafo…) no viaja en campos propios: va incrustado como códigos de escape
 * dentro de `valueBytes`, igual que en DXF — por eso el puente puede
 * reutilizar el mismo decodificador de contenido sin tocarlo.
 */
export interface DwgNeutralMText {
  readonly kind: "mtext";
  readonly insertion: DwgNeutralPoint3;
  readonly extrusion: DwgNeutralPoint3;
  readonly xAxisDirection: DwgNeutralPoint3;
  readonly rectWidth: number;
  readonly height: number;
  readonly attachment: number;
  readonly drawingDirection: number;
  readonly extentsHeight: number;
  readonly extentsWidth: number;
  readonly valueBytes: readonly number[];
  readonly lineSpacingStyle: number;
  readonly lineSpacingFactor: number;
  readonly trailingBit: number;
}

/** Las siete variantes de cota del formato R2000. */
export type DwgNeutralDimensionKind =
  | "ordinate"
  | "linear"
  | "aligned"
  | "angular3pt"
  | "angular2ln"
  | "radius"
  | "diameter";

/**
 * Cota (familia DIMENSION). Los puntos usan los nombres de grupo del dibujo
 * (10/13/14/15/16: `definitionPoint`/`point13`/`point14`/`point15`/`point16`)
 * porque su papel geométrico depende de la variante — igual que en DXF, y por
 * eso el puente porta la misma reconstrucción por puntos que ya existe para
 * cotas DXF ajenas (sin XDATA propia). El texto de usuario llega como bytes.
 */
export interface DwgNeutralDimension {
  readonly kind: "dimension";
  readonly dimensionKind: DwgNeutralDimensionKind;
  readonly extrusion: DwgNeutralPoint3;
  readonly textMidpoint: DwgNeutralPoint2;
  readonly elevation: number;
  readonly flags: number;
  readonly userTextBytes: readonly number[];
  readonly textRotation: number;
  readonly horizontalDirection: number;
  readonly insertScale: DwgNeutralPoint3;
  readonly insertRotation: number;
  readonly attachment: number;
  readonly lineSpacingStyle: number;
  readonly lineSpacingFactor: number;
  readonly actualMeasurement: number;
  readonly clonePoint: DwgNeutralPoint2;
  readonly definitionPoint: DwgNeutralPoint3;
  readonly point13: DwgNeutralPoint3 | undefined;
  readonly point14: DwgNeutralPoint3 | undefined;
  readonly point15: DwgNeutralPoint3 | undefined;
  readonly point16: DwgNeutralPoint2 | undefined;
  readonly extensionLineRotation: number | undefined;
  readonly dimensionRotation: number | undefined;
  readonly leaderLength: number | undefined;
  readonly ordinateFlags: number | undefined;
}

/** Segmento recto de un camino de HATCH. */
export interface DwgNeutralHatchLineSegment {
  readonly kind: "line";
  readonly start: DwgNeutralPoint2;
  readonly end: DwgNeutralPoint2;
}

/** Segmento de arco circular de un camino de HATCH. */
export interface DwgNeutralHatchArcSegment {
  readonly kind: "arc";
  readonly center: DwgNeutralPoint2;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly counterClockwise: boolean;
}

/** Segmento de arco elíptico: el extremo mayor es un VECTOR desde el centro. */
export interface DwgNeutralHatchEllipticArcSegment {
  readonly kind: "ellipticArc";
  readonly center: DwgNeutralPoint2;
  readonly majorAxisEndpoint: DwgNeutralPoint2;
  readonly axisRatio: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly counterClockwise: boolean;
}

/** Segmento spline 2D de un camino de HATCH; pesos sólo si es racional. */
export interface DwgNeutralHatchSplineSegment {
  readonly kind: "spline";
  readonly degree: number;
  readonly rational: boolean;
  readonly periodic: boolean;
  readonly knots: readonly number[];
  readonly controlPoints: readonly DwgNeutralPoint2[];
  readonly weights: readonly number[] | undefined;
}

export type DwgNeutralHatchSegment =
  | DwgNeutralHatchLineSegment
  | DwgNeutralHatchArcSegment
  | DwgNeutralHatchEllipticArcSegment
  | DwgNeutralHatchSplineSegment;

/**
 * Camino de HATCH en su forma polilínea: vértices 2D con bulges opcionales
 * (`undefined` = el bit de bulges no viajó). Es la única forma que la
 * primitiva canónica de destino sabe representar hoy.
 */
export interface DwgNeutralHatchPolylinePath {
  readonly kind: "polyline";
  readonly flags: number;
  readonly closed: boolean;
  readonly vertices: readonly DwgNeutralPoint2[];
  readonly bulges: readonly number[] | undefined;
  readonly boundaryObjectCount: number;
}

/**
 * Camino de HATCH como lista de segmentos tipados (línea/arco/arco
 * elíptico/spline). El perfil de producto no proyecta esta forma — ningún
 * campo de `CadDxfHatch` representa un contorno curvo — pero el laboratorio
 * SÍ la decodifica, así que llega completa hasta aquí por la misma razón que
 * el escenario 2 de SPLINE: para que el puente declare la pérdida con
 * precisión, no para que se use hoy.
 */
export interface DwgNeutralHatchSegmentsPath {
  readonly kind: "segments";
  readonly flags: number;
  readonly segments: readonly DwgNeutralHatchSegment[];
  readonly boundaryObjectCount: number;
}

export type DwgNeutralHatchPath = DwgNeutralHatchPolylinePath | DwgNeutralHatchSegmentsPath;

/** Línea de definición del patrón de un HATCH no sólido. */
export interface DwgNeutralHatchDefinitionLine {
  readonly angle: number;
  readonly basePoint: DwgNeutralPoint2;
  readonly offset: DwgNeutralPoint2;
  readonly dashes: readonly number[];
}

/**
 * Sombreado (HATCH). El nombre del patrón viaja como BYTES; los caminos son
 * un discriminante polyline/segments; los campos de patrón (ángulo, escala,
 * doble trama, líneas de definición) sólo existen cuando NO es relleno
 * sólido, y `pixelSize` sólo cuando algún camino lleva el bit de derivado.
 */
export interface DwgNeutralHatch {
  readonly kind: "hatch";
  readonly elevation: number;
  readonly extrusion: DwgNeutralPoint3;
  readonly nameBytes: readonly number[];
  readonly solidFill: boolean;
  readonly associative: boolean;
  readonly paths: readonly DwgNeutralHatchPath[];
  readonly style: number;
  readonly patternType: number;
  readonly angle: number | undefined;
  readonly scaleOrSpacing: number | undefined;
  readonly doubleHatch: boolean | undefined;
  readonly definitionLines: readonly DwgNeutralHatchDefinitionLine[] | undefined;
  readonly pixelSize: number | undefined;
  readonly seedPoints: readonly DwgNeutralPoint2[];
}

export type DwgNeutralGeometry =
  | DwgNeutralLine
  | DwgNeutralPointEntity
  | DwgNeutralCircle
  | DwgNeutralArc
  | DwgNeutralLwPolyline
  | DwgNeutralText
  | DwgNeutralInsert
  | DwgNeutralEllipse
  | DwgNeutralSpline
  | DwgNeutralMText
  | DwgNeutralDimension
  | DwgNeutralHatch;

export interface DwgNeutralLayer {
  readonly handle: number;
  /** Bytes del nombre en la página de códigos del dibujo. */
  readonly name: readonly number[];
  readonly colorIndex: number;
  readonly stateFlags: number;
}

export interface DwgNeutralEntityRecord {
  readonly handle: number;
  readonly entity: DwgNeutralGeometry;
  /** `undefined` cuando el handle de capa viajó nulo. */
  readonly layerHandle: number | undefined;
  /** Sólo INSERT: nombre del bloque insertado, resuelto por su handle. */
  readonly insertedBlockName: readonly number[] | undefined;
}

export interface DwgNeutralBlock {
  readonly handle: number;
  readonly name: readonly number[];
  readonly blockBeginHandle: number | undefined;
  readonly blockEndHandle: number | undefined;
  readonly entities: readonly DwgNeutralEntityRecord[];
}

/** Un objeto que el decodificador enumera sin decodificar. Nunca se calla. */
export interface DwgNeutralUnsupportedObject {
  readonly handle: number;
  readonly type: number;
}

export type DwgNeutralDiagnosticSeverity = "info" | "warning" | "error";

export interface DwgNeutralDiagnostic {
  readonly code: string;
  readonly severity: DwgNeutralDiagnosticSeverity;
  readonly offset: number;
  readonly message: string;
}

export interface DwgNeutralDatabase {
  readonly layers: readonly DwgNeutralLayer[];
  readonly blocks: readonly DwgNeutralBlock[];
  readonly modelSpaceEntities: readonly DwgNeutralEntityRecord[];
  /** BS crudo de INSUNITS (variables de cabecera): unidades del dibujo. */
  readonly insunits: number;
  readonly unsupported: readonly DwgNeutralUnsupportedObject[];
  readonly diagnostics: readonly DwgNeutralDiagnostic[];
}

/**
 * El PUERTO del decodificador.
 *
 * Una función que recibe los bytes hostiles y devuelve la base neutral. El
 * producto no trae ninguna implementación y no puede fabricarla: quien la
 * registre lo hará después del ADR de promoción, y el gate seguirá decidiendo.
 */
export type DwgNeutralDatabaseReader = (bytes: Uint8Array) => DwgNeutralDatabase;
