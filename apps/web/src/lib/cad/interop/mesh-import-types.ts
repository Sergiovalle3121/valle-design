/**
 * Tipos compartidos por los cuatro lectores de malla (OBJ, STL, glTF, COLLADA).
 *
 * Cada lector vive en su propio archivo y no sabe nada de documentos CAD ni de
 * `CadDocument`: entrega COMPONENTES — grupos de vértices y caras en espacio de
 * mundo, con nombre si el formato lo trae — y dice en qué unidad cree que están.
 * `mesh-document-import.ts` es la única pieza que conoce el documento canónico
 * y decide qué hacer con esos componentes (coser, limitar, declarar pérdidas).
 * Esa frontera es deliberada: un lector que también supiera de `CadDocument`
 * mezclaría "¿qué dice el archivo?" con "¿qué acepta el producto?", y las dos
 * preguntas cambian por razones distintas.
 */
import type { Vec3 } from "../../brep";

/** Unidad declarada por el propio formato, o `"unknown"` si el formato no la define. */
export type MeshSourceUnit = "meter" | "millimeter" | "unknown";

/**
 * Un componente crudo: una malla nombrada (o sin nombre) YA en espacio de
 * mundo — con las transformaciones de nodo/escena del archivo ya aplicadas,
 * cuando el formato las trae (glTF, COLLADA). OBJ y STL no tienen jerarquía de
 * escena, así que sus componentes llegan tal cual el archivo los declara.
 */
export interface RawMeshComponent {
  /** Nombre del objeto/grupo/malla en el archivo de origen, si lo declara. */
  name?: string;
  points: Vec3[];
  /** Lazos de índices en `points`; triángulos o polígonos, según el formato. */
  faces: number[][];
}

export interface RawMeshDocument {
  components: RawMeshComponent[];
  unit: MeshSourceUnit;
  /** Aviso del propio lector (p. ej. una imagen externa que no se resolvió). */
  warnings: string[];
}

export type MeshImportFormat = "obj" | "stl" | "gltf" | "collada";

export interface MeshImportLossEntry {
  code: string;
  detail: string;
  severity: "info" | "warning" | "error";
  entityId?: string;
}

/** Firma común de los cuatro lectores: bytes hostiles adentro, componentes afuera. */
export type MeshReader = (bytes: Uint8Array, fileName: string) => Promise<RawMeshDocument>;
