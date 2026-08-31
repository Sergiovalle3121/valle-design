/**
 * Lector OBJ: texto, sin jerarquía de escena, sin unidad declarada.
 *
 * SketchUp exporta `.obj` con un `.mtl` opcional que este lector IGNORA a
 * propósito — los materiales no aportan nada a un sólido B-rep, y fingir que
 * se leyeron sería inventar una capacidad que no existe. Cada `o`/`g` del
 * archivo se vuelve un componente, vía el `OBJLoader` de three (ya en el
 * árbol de dependencias, nunca usado hasta ahora).
 *
 * SIN UNIDAD. El formato OBJ no declara una: un archivo de SketchUp trae los
 * números en las unidades del PROYECTO en SketchUp (a veces metros, a veces
 * pulgadas, a veces milímetros) sin decir cuáles. Inventar "es metros" sería
 * mentir con la misma confianza que si de verdad lo dijera el archivo — así
 * que este lector devuelve `unit: "unknown"` y dilo es responsabilidad de
 * quien orquesta la importación.
 */
import { assertMeshFileByteBudget } from "./mesh-import-limits";
import type { RawMeshDocument } from "./mesh-import-types";
import { collectMeshComponents } from "./mesh-three-bridge";

export async function readObjMesh(bytes: Uint8Array, fileName: string): Promise<RawMeshDocument> {
  assertMeshFileByteBudget("obj", bytes.byteLength, fileName);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`«${fileName}» no es UTF-8 válido: un OBJ es texto, y estos bytes no lo son.`);
  }
  const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
  const group = new OBJLoader().parse(text);
  const components = collectMeshComponents(group);
  if (components.length === 0) {
    throw new Error(`«${fileName}» se leyó como OBJ pero no contiene ninguna malla triangulable.`);
  }
  return { components, unit: "unknown", warnings: [] };
}
