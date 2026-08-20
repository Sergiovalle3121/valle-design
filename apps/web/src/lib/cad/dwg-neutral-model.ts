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

export type DwgNeutralGeometry =
  | DwgNeutralLine
  | DwgNeutralPointEntity
  | DwgNeutralCircle
  | DwgNeutralArc
  | DwgNeutralLwPolyline
  | DwgNeutralText
  | DwgNeutralInsert;

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
