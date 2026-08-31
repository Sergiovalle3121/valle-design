/**
 * Lector STL: binario o ASCII, un solo componente, sin unidad declarada.
 *
 * El formato en sí no distingue "objetos": es una lista plana de triángulos
 * con normal declarada (que este lector ignora — se recalcula al coser, y una
 * normal de archivo mentirosa no debe colar una cara del revés). El
 * `STLLoader` de three detecta binario vs ASCII solo, así que aquí no hace
 * falta duplicar esa heurística.
 */
import { assertMeshFileByteBudget } from "./mesh-import-limits";
import type { RawMeshDocument } from "./mesh-import-types";
import { bufferGeometryToComponent } from "./mesh-three-bridge";

export async function readStlMesh(bytes: Uint8Array, fileName: string): Promise<RawMeshDocument> {
  assertMeshFileByteBudget("stl", bytes.byteLength, fileName);
  const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const geometry = new STLLoader().parse(arrayBuffer);
  const component = bufferGeometryToComponent(geometry, undefined);
  if (!component) {
    throw new Error(`«${fileName}» se leyó como STL pero no contiene ningún triángulo.`);
  }
  return { components: [component], unit: "unknown", warnings: [] };
}
