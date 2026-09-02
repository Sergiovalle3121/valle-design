/**
 * La capa de imágenes del visor, en Node y sin WebGL (Ola H).
 *
 * El cargador se inyecta: aquí entrega una textura vacía al instante o falla,
 * y se comprueba lo que la capa decide con eso — cuántas mallas, con qué
 * vértices y UV, qué se salta y qué se oculta— sin dibujar nada.
 *
 *   - Una imagen `data:` de 4 × 2 px a 100 unidades por píxel en (1000, 500)
 *     produce UNA malla de 4 vértices con UV (0,0)…(1,1), en coordenadas
 *     relativas al origen flotante, y 2 triángulos.
 *   - Con recorte triangular la malla ES el triángulo: 3 vértices, 1 triángulo,
 *     UV en píxeles/tamaño.
 *   - `asset://` sin resolver, `showImage: false` y un cargador que falla no
 *     producen malla y se cuentan cada uno en su casilla.
 *   - La capa oculta sigue la capa; la edición por `invalidate` da de baja.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import type { CadDocument } from "../cad-document";
import type { CadImageDefinition, CadImageEntity } from "../cad-entities-v4";
import { CadImageLayer, buildImageGeometry } from "./image-layer-three";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const definitions: CadImageDefinition[] = [
  { id: "png", name: "plano.png", uri: "data:image/png;base64,iVBORw0KGgo=", pixelWidth: 4, pixelHeight: 2, loaded: true },
  { id: "asset", name: "otro.png", uri: "asset://tenant/otro.png", pixelWidth: 4, pixelHeight: 2 },
];
function image(id: string, definition: string, extra: Partial<CadImageEntity> = {}): CadImageEntity {
  return {
    id,
    type: "image",
    definition,
    insertion: { x: 1000, y: 500, z: 0 },
    uVector: { x: 100, y: 0, z: 0 },
    vVector: { x: 0, y: 100, z: 0 },
    size: { width: 4, height: 2 },
    layer: "0",
    ...extra,
  };
}
function documentWith(entities: CadImageEntity[]): CadDocument {
  return { entities, imageDefinitions: definitions, layers: [], blocks: [], modelSpace: { entityIds: entities.map((entity) => entity.id) }, meta: { version: 1, schema: 9, unit: "mm" } } as unknown as CadDocument;
}
const viewport = { scale: 0.01, width: 10_000, height: 8_000, elevation: 0.11 };

/* ── La geometría ───────────────────────────────────────────────────────── */
{
  const geometry = buildImageGeometry(image("i", "png"), { x: 1000, y: 0 });
  const positions = Array.from(geometry.getAttribute("position").array as Float32Array);
  eq(positions, [0, 500, 0, 400, 500, 0, 400, 700, 0, 0, 700, 0], "cuatro vértices relativos al origen flotante (1000, 0)");
  eq(Array.from(geometry.getAttribute("uv").array as Float32Array), [0, 0, 1, 0, 1, 1, 0, 1], "UV de esquina a esquina");
  eq(geometry.getIndex()!.count, 6, "dos triángulos");
  const clipped = buildImageGeometry(image("i", "png", { clipBoundary: [{ x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }] }), { x: 0, y: 0 });
  eq(clipped.getAttribute("position").count, 3, "con recorte, la malla es el triángulo");
  eq(Array.from(clipped.getAttribute("uv").array as Float32Array), [0.25, 0, 0.75, 0, 0.5, 1], "UV en píxeles/tamaño");
  eq(clipped.getIndex()!.count, 3, "un triángulo");
  const degenerate = buildImageGeometry(image("i", "png", { clipBoundary: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] }), { x: 0, y: 0 });
  eq(degenerate.getIndex()!.count, 0, "tres píxeles alineados: geometría vacía, no excepción");
}

void (async () => {
/* ── La capa ────────────────────────────────────────────────────────────── */
{
  const requested: string[] = [];
  let resolve: (() => void) | null = null;
  const layer = new CadImageLayer({
    viewport,
    loader: (uri) => {
      requested.push(uri);
      return new Promise((done) => {
        resolve = () => done(new THREE.Texture());
      });
    },
  });
  layer.replace(documentWith([image("a", "png"), image("b", "asset"), image("c", "png", { showImage: false }), image("d", "png", { layer: "FONDO" })]));
  eq(layer.sync(), { images: 0, pending: 2, failed: 0, skipped: 2 }, "dos esperan textura (la misma), un asset y un apagado se saltan");
  eq(requested, [definitions[0].uri], "la textura se pide UNA vez por URI, no por imagen");
  await new Promise<void>((done) => setTimeout(done, 0));
  resolve!();
  await new Promise<void>((done) => setTimeout(done, 0));
  eq(layer.sync(), { images: 2, pending: 0, failed: 0, skipped: 2 }, "con la textura, las dos se pintan");
  eq(layer.meshCount, 2, "dos mallas en el grupo");
  ok(layer.meshOf("a")!.visible && layer.meshOf("d")!.visible, "visibles");
  layer.setHiddenLayers(new Set(["FONDO"]));
  layer.sync();
  ok(layer.meshOf("a")!.visible && !layer.meshOf("d")!.visible, "la capa oculta apaga su imagen");
  const material = layer.meshOf("a")!.material as THREE.ShaderMaterial;
  eq([material.uniforms.cadBrightness.value, material.uniforms.cadContrast.value, material.uniforms.cadOpacity.value], [50, 50, 1], "sin ajuste: uniformes neutros");
  layer.invalidate(["a"], [image("a", "png", { brightness: 70, contrast: 40, fade: 25 })]);
  layer.sync();
  const adjusted = layer.meshOf("a")!.material as THREE.ShaderMaterial;
  eq([adjusted.uniforms.cadBrightness.value, adjusted.uniforms.cadContrast.value, adjusted.uniforms.cadOpacity.value], [70, 40, 0.75], "el ajuste llega a los uniformes sin reconstruir la textura");
  const before = layer.meshOf("a")!;
  layer.invalidate(["a"], [image("a", "png", { brightness: 70, contrast: 40, fade: 25, clipBoundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 2, z: 0 }] })]);
  layer.sync();
  ok(layer.meshOf("a") !== before && layer.meshOf("a")!.geometry.getAttribute("position").count === 3, "un recorte nuevo reconstruye la malla");
  layer.invalidate(["d"], []);
  eq(layer.sync(), { images: 1, pending: 0, failed: 0, skipped: 2 }, "un id afectado sin upsert es baja");
  layer.setOrigin({ x: 100_000, y: 0 });
  layer.sync();
  ok((layer.meshOf("a")!.geometry.getAttribute("position").array as Float32Array)[0] === 1000 - 100_000, "cambiar el origen flotante reconstruye con el nuevo");
  layer.setView({ ...viewport, scale: 0.02 });
  eq((layer.meshOf("a")!.material as THREE.ShaderMaterial).uniforms.cadScale.value, 0.02, "la vista son uniformes");
  layer.dispose();
  eq(layer.meshCount, 0, "dispose vacía");
}

/* ── El cargador que falla y el que no existe ───────────────────────────── */
{
  const failing = new CadImageLayer({ viewport, loader: () => Promise.resolve(null) });
  failing.replace(documentWith([image("a", "png")]));
  failing.sync();
  await new Promise<void>((done) => setTimeout(done, 0));
  eq(failing.sync(), { images: 0, pending: 0, failed: 1, skipped: 0 }, "un archivo que no decodifica se cuenta como fallido: se ve el marco");
  const none = new CadImageLayer({ viewport });
  none.replace(documentWith([image("a", "png")]));
  eq(none.sync(), { images: 0, pending: 0, failed: 1, skipped: 0 }, "sin cargador, nada carga y se dice");
}

  console.log(`image-layer-three: ${checks} comprobaciones · una malla por imagen con UV en píxeles/tamaño, el recorte como triángulo, textura pedida una vez por URI, asset:// y showImage apagado se saltan, capa oculta, ajuste en uniformes`);
})();
