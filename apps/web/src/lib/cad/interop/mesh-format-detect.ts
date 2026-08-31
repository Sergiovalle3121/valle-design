/**
 * Extensión → formato de malla. Sin dependencias, para que tanto la
 * validación rápida (`document-import-validation.ts`) como el importador
 * completo compartan el mismo mapa sin que uno arrastre al otro.
 */
import type { MeshImportFormat } from "./mesh-import-types";

const EXTENSION_TO_FORMAT: Record<string, MeshImportFormat> = {
  obj: "obj",
  stl: "stl",
  gltf: "gltf",
  glb: "gltf",
  dae: "collada",
};

/** `null` si la extensión no es ninguno de los cuatro formatos de malla soportados. */
export function meshImportFormatOf(fileName: string): MeshImportFormat | null {
  const extension = fileName.trim().toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TO_FORMAT[extension] ?? null;
}

export function isMeshImportFileName(fileName: string): boolean {
  return meshImportFormatOf(fileName) !== null;
}
