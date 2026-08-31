/**
 * Lector glTF: binario (`.glb`, autocontenido) o texto (`.gltf`) con TODOS sus
 * búferes incrustados como `data:` URI. Un `.gltf` que referencia un `.bin` o
 * unas texturas externas por ruta relativa se RECHAZA antes de intentar nada:
 * el importador recibe un solo archivo, no una carpeta, y no hay dónde
 * resolver esa ruta. Exportar como `.glb` o como "glTF incrustado" (la opción
 * que trae el propio exportador de SketchUp) evita el problema de raíz.
 *
 * UNIDAD: el estándar glTF 2.0 fija 1 unidad = 1 metro (§3.9.2), así que aquí
 * SÍ se declara, a diferencia de OBJ/STL.
 */
import { assertMeshFileByteBudget } from "./mesh-import-limits";
import type { RawMeshDocument } from "./mesh-import-types";
import { collectMeshComponents } from "./mesh-three-bridge";

const GLB_MAGIC = 0x46546c67; // "glTF" en little-endian, primeros 4 bytes de un .glb

function isGlb(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getUint32(0, true) === GLB_MAGIC;
}

/** Búferes/imágenes externos en un `.gltf` de texto: rechazo temprano y explícito. */
function assertNoExternalBuffers(json: unknown, fileName: string): void {
  const doc = json as { buffers?: { uri?: string }[] };
  const external = (doc.buffers ?? []).filter((buffer) => buffer.uri && !buffer.uri.startsWith("data:"));
  if (external.length > 0) {
    throw new Error(
      `«${fileName}» referencia ${external.length} búfer(es) externo(s) (p. ej. «${external[0].uri}»): ` +
        "este importador recibe UN solo archivo y no puede resolver rutas relativas. Exporta como .glb " +
        "o como glTF con los búferes incrustados (data URI).",
    );
  }
}

export async function readGltfMesh(bytes: Uint8Array, fileName: string): Promise<RawMeshDocument> {
  assertMeshFileByteBudget("gltf", bytes.byteLength, fileName);
  const warnings: string[] = [];
  if (!isGlb(bytes)) {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error(`«${fileName}» no es un .glb binario ni un .gltf de texto válido.`);
    }
    assertNoExternalBuffers(json, fileName);
    const externalImages = ((json as { images?: { uri?: string }[] }).images ?? []).filter(
      (image) => image.uri && !image.uri.startsWith("data:"),
    );
    if (externalImages.length > 0) {
      warnings.push(
        `${externalImages.length} textura(s) externa(s) no se resolvieron: no afecta la geometría, sólo el aspecto visual.`,
      );
    }
  }
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: import("three").Object3D }>((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, "", (result) => resolve(result as { scene: import("three").Object3D }), reject);
  });
  const components = collectMeshComponents(gltf.scene);
  if (components.length === 0) {
    throw new Error(`«${fileName}» se leyó como glTF pero no contiene ninguna malla triangulable.`);
  }
  return { components, unit: "meter", warnings };
}
