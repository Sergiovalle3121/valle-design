/**
 * Lector COLLADA (`.dae`): texto XML, con geometría SIEMPRE incrustada — a
 * diferencia de glTF, el formato no admite búferes binarios externos, así que
 * no hay una ruta relativa que resolver y no hace falta rechazar nada por eso.
 *
 * UNIDAD: el propio `ColladaLoader` de three aplica el `<unit meter="…">` del
 * archivo como escala del nodo raíz de la escena (lo hace desde siempre, en
 * `parse()`); como este lector recorre la jerarquía con `matrixWorld` ya
 * resuelto, la conversión llega SOLA — no hay que leer el XML dos veces ni
 * repetir esa aritmética aquí. Lo que sí falta, y este lector no arregla, son
 * las imágenes por ruta relativa: no afectan la geometría, así que sólo se
 * avisan.
 */
import { assertMeshFileByteBudget } from "./mesh-import-limits";
import type { RawMeshDocument } from "./mesh-import-types";
import { collectMeshComponents } from "./mesh-three-bridge";

export async function readColladaMesh(bytes: Uint8Array, fileName: string): Promise<RawMeshDocument> {
  assertMeshFileByteBudget("collada", bytes.byteLength, fileName);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`«${fileName}» no es UTF-8 válido: un COLLADA es XML de texto, y estos bytes no lo son.`);
  }
  const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
  const collada = new ColladaLoader().parse(text, "");
  if (!collada) {
    throw new Error(`«${fileName}» está vacío: no hay nada que leer.`);
  }
  const components = collectMeshComponents(collada.scene);
  if (components.length === 0) {
    throw new Error(`«${fileName}» se leyó como COLLADA pero no contiene ninguna malla triangulable.`);
  }
  const warnings: string[] = [];
  if (/<init_from>(?!data:)[^<]*\.(?:jpg|jpeg|png|bmp|tga)/i.test(text)) {
    warnings.push("Este archivo referencia texturas externas por ruta relativa: no afecta la geometría, sólo el aspecto visual.");
  }
  return { components, unit: "meter", warnings };
}
