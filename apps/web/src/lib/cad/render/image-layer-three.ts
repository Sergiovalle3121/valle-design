/**
 * LOS PÍXELES DE LA IMAGEN EN EL VISOR (Ola H, 2026-09-02).
 *
 * Medido antes: la entidad `image` se dibujaba como su MARCO —cuatro líneas
 * y el contorno de recorte— y nada más. Un plano escaneado se «insertaba» y
 * no se veía, así que calcar encima era imposible: la mitad útil del toolset
 * Raster empezaba aquí.
 *
 * ## Cómo se coloca
 *
 * Una malla por imagen, con la MISMA convención que los lotes de líneas y
 * los quads de texto: las posiciones son coordenadas del dibujo relativas al
 * origen flotante, el shader las lleva al plano XZ de la escena con los
 * uniformes `cadScale`/`cadCenter`/`cadElevation`, y la profundidad se
 * escribe en la lámina NDC del dibujo —al FONDO de ella, para que cualquier
 * línea tape a la imagen y no al revés—. Cambiar la vista es escribir cuatro
 * uniformes; cambiar el origen reconstruye las mallas.
 *
 * El recorte no es una máscara: la malla ES el polígono visible, triangulado
 * en píxeles de la imagen (`THREE.ShapeUtils`), con las UV de cada vértice en
 * píxeles/tamaño. Un polígono cóncavo se recorta igual de bien que un
 * rectángulo, y no hay stencil ni segundo pase.
 *
 * ## Brillo, contraste y atenuación
 *
 * En el fragment shader, con la fórmula de `image-geometry.ts`
 * (`cadImageAdjust`): el visor y la lámina hacen la misma cuenta.
 *
 * ## Lo que NO carga
 *
 * Sólo `data:image/…` y `http(s)://…png|jpg|…` (`cadImageIsRaster`). Un
 * `asset://` sin resolver o un sustrato PDF siguen siendo su marco: no hay
 * nadie que entregue esos bytes hoy, y fingir una carga que no ocurre es peor
 * que dibujar el marco. El cargador se INYECTA: en el navegador es un
 * `<img>` decodificado; en Node, las specs entregan una textura de mentira y
 * comprueban mallas, UV y visibilidad sin WebGL.
 */
import * as THREE from "three";
import type { CadDocument } from "../cad-document";
import type { CadImageDefinition, CadImageEntity } from "../cad-entities-v4";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadThreeViewport } from "../entity-three";
import { cadImageIsRaster, cadImagePixelPolygon, cadImagePixelToWorld, CAD_IMAGE_BRIGHTNESS_NEUTRAL, CAD_IMAGE_CONTRAST_NEUTRAL, CAD_IMAGE_FADE_NONE } from "../image-geometry";
import { CAD_RENDER_ORIGIN_ZERO, type CadRenderOrigin } from "./render-origin";

export type CadImageLoader = (uri: string, definition: CadImageDefinition) => Promise<THREE.Texture | null>;

export interface CadImageLayerOptions {
  viewport: CadThreeViewport;
  /** Sin él, ninguna imagen carga: sólo se cuentan como pendientes. */
  loader?: CadImageLoader;
  depthBias?: number;
  depthScale?: number;
  /** Se llama cuando una textura termina de cargar (o falla): el anfitrión vuelve a sincronizar. */
  onChange?: () => void;
}

export interface CadImageLayerSync {
  /** Imágenes con sus píxeles en pantalla. */
  images: number;
  /** Imágenes esperando su textura. */
  pending: number;
  /** Imágenes cuyo archivo no se pudo decodificar: se ven como marco. */
  failed: number;
  /** Imágenes que el visor no intenta cargar (`asset://`, PDF, `showImage` apagado). */
  skipped: number;
}

const VERTEX_SHADER = `
uniform float cadScale;
uniform vec2 cadCenter;
uniform float cadElevation;
uniform float cadDepthBias;
uniform float cadDepthScale;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 scenePosition = vec3((position.x - cadCenter.x) * cadScale, cadElevation, (position.y - cadCenter.y) * cadScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  // Al fondo de la lámina del dibujo: toda línea tapa a la imagen.
  gl_Position.z = (cadDepthBias + cadDepthScale) * gl_Position.w;
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D cadMap;
uniform float cadBrightness;
uniform float cadContrast;
uniform float cadOpacity;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(cadMap, vUv);
  vec3 adjusted = clamp((texel.rgb - 0.5) * (cadContrast / 50.0) + 0.5 + (cadBrightness - 50.0) / 50.0, 0.0, 1.0);
  gl_FragColor = vec4(adjusted, texel.a * cadOpacity);
}
`;

interface TextureSlot {
  state: "loading" | "ready" | "failed";
  texture: THREE.Texture | null;
}

interface ImageMesh {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Con qué geometría y origen se construyó; si cambian, se reconstruye. */
  signature: string;
  uri: string;
}

export class CadImageLayer {
  readonly group = new THREE.Group();
  private readonly entities = new Map<string, CadImageEntity>();
  private readonly definitions = new Map<string, CadImageDefinition>();
  private readonly textures = new Map<string, TextureSlot>();
  private readonly meshes = new Map<string, ImageMesh>();
  private hidden: ReadonlySet<string> = new Set();
  private origin: CadRenderOrigin = CAD_RENDER_ORIGIN_ZERO;
  private viewport: CadThreeViewport;
  private readonly loader: CadImageLoader | null;
  private readonly onChange: (() => void) | null;
  private readonly depthBias: number;
  private readonly depthScale: number;
  private disposed = false;

  constructor(options: CadImageLayerOptions) {
    this.viewport = options.viewport;
    this.loader = options.loader ?? null;
    this.onChange = options.onChange ?? null;
    this.depthBias = options.depthBias ?? 0;
    this.depthScale = options.depthScale ?? 1;
    this.group.name = "cad-render:images";
  }

  /** El documento entero: se olvida lo anterior y se toman sus imágenes y definiciones. */
  replace(document: CadDocument): void {
    this.entities.clear();
    for (const entity of document.entities) if (entity.type === "image") this.entities.set(entity.id, entity);
    this.replaceDefinitions(document);
  }

  /** Edición: el contrato del pipeline — un id afectado que no venga en `upserts` es baja. */
  invalidate(affectedEntityIds: readonly string[], upserts: readonly CadNativeEntity[] = [], document?: CadDocument): void {
    const kept = new Set<string>();
    for (const entity of upserts) {
      if (entity.type !== "image") continue;
      this.entities.set(entity.id, entity);
      kept.add(entity.id);
    }
    for (const id of affectedEntityIds) if (!kept.has(id)) this.entities.delete(id);
    if (document) this.replaceDefinitions(document);
  }

  setHiddenLayers(hidden: ReadonlySet<string>): void {
    this.hidden = new Set(hidden);
  }

  setView(viewport: CadThreeViewport): void {
    this.viewport = viewport;
    for (const entry of this.meshes.values()) this.applyView(entry.material);
  }

  setOrigin(origin: CadRenderOrigin): void {
    this.origin = origin;
  }

  /** Reconcilia mallas con entidades y texturas. Barato cuando nada cambió. */
  sync(): CadImageLayerSync {
    const result: CadImageLayerSync = { images: 0, pending: 0, failed: 0, skipped: 0 };
    if (this.disposed) return result;
    const wanted = new Set<string>();
    for (const entity of this.entities.values()) {
      const definition = this.definitions.get(entity.definition);
      if (!definition || entity.showImage === false || !cadImageIsRaster(definition)) {
        result.skipped += 1;
        continue;
      }
      const slot = this.request(definition);
      if (slot.state === "loading") {
        result.pending += 1;
        continue;
      }
      if (slot.state === "failed" || !slot.texture) {
        result.failed += 1;
        continue;
      }
      wanted.add(entity.id);
      this.ensureMesh(entity, definition.uri, slot.texture);
      result.images += 1;
    }
    for (const [id, entry] of [...this.meshes]) {
      if (wanted.has(id)) continue;
      this.disposeMesh(entry);
      this.meshes.delete(id);
    }
    return result;
  }

  /** Las mallas vivas, para las specs y el diagnóstico. */
  get meshCount(): number {
    return this.meshes.size;
  }

  /** La malla de una imagen, si tiene píxeles en pantalla (specs). */
  meshOf(entityId: string): THREE.Mesh | null {
    return this.meshes.get(entityId)?.mesh ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.meshes.values()) this.disposeMesh(entry);
    this.meshes.clear();
    for (const slot of this.textures.values()) slot.texture?.dispose();
    this.textures.clear();
    this.entities.clear();
    this.definitions.clear();
    this.group.removeFromParent();
  }

  private replaceDefinitions(document: CadDocument): void {
    this.definitions.clear();
    for (const definition of document.imageDefinitions ?? []) this.definitions.set(definition.id, definition);
  }

  private request(definition: CadImageDefinition): TextureSlot {
    const existing = this.textures.get(definition.uri);
    if (existing) return existing;
    const slot: TextureSlot = { state: this.loader ? "loading" : "failed", texture: null };
    this.textures.set(definition.uri, slot);
    if (!this.loader) return slot;
    this.loader(definition.uri, definition)
      .then((texture) => {
        if (this.disposed) {
          texture?.dispose();
          return;
        }
        slot.state = texture ? "ready" : "failed";
        slot.texture = texture;
        this.onChange?.();
      })
      .catch(() => {
        slot.state = "failed";
        this.onChange?.();
      });
    return slot;
  }

  private ensureMesh(entity: CadImageEntity, uri: string, texture: THREE.Texture): void {
    const signature = geometrySignature(entity, this.origin);
    let entry = this.meshes.get(entity.id);
    if (entry && (entry.signature !== signature || entry.uri !== uri)) {
      this.disposeMesh(entry);
      this.meshes.delete(entity.id);
      entry = undefined;
    }
    if (!entry) {
      const geometry = buildImageGeometry(entity, this.origin);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cadMap: { value: texture },
          cadScale: { value: this.viewport.scale },
          cadCenter: { value: new THREE.Vector2(this.viewport.width / 2, this.viewport.height / 2) },
          cadElevation: { value: this.viewport.elevation ?? 0.11 },
          cadDepthBias: { value: this.depthBias },
          cadDepthScale: { value: this.depthScale },
          cadBrightness: { value: CAD_IMAGE_BRIGHTNESS_NEUTRAL },
          cadContrast: { value: CAD_IMAGE_CONTRAST_NEUTRAL },
          cadOpacity: { value: 1 },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `cad-image:${entity.id}`;
      mesh.frustumCulled = false;
      mesh.userData.cadImageEntityId = entity.id;
      entry = { mesh, material, signature, uri };
      this.meshes.set(entity.id, entry);
      this.group.add(mesh);
    }
    entry.material.uniforms.cadMap.value = texture;
    entry.material.uniforms.cadBrightness.value = entity.brightness ?? CAD_IMAGE_BRIGHTNESS_NEUTRAL;
    entry.material.uniforms.cadContrast.value = entity.contrast ?? CAD_IMAGE_CONTRAST_NEUTRAL;
    entry.material.uniforms.cadOpacity.value = 1 - Math.min(100, Math.max(0, entity.fade ?? CAD_IMAGE_FADE_NONE)) / 100;
    entry.mesh.visible = !this.hidden.has(entity.layer);
  }

  private applyView(material: THREE.ShaderMaterial): void {
    material.uniforms.cadScale.value = this.viewport.scale;
    (material.uniforms.cadCenter.value as THREE.Vector2).set(this.viewport.width / 2, this.viewport.height / 2);
    material.uniforms.cadElevation.value = this.viewport.elevation ?? 0.11;
  }

  private disposeMesh(entry: ImageMesh): void {
    entry.mesh.removeFromParent();
    entry.mesh.geometry.dispose();
    entry.material.dispose();
  }
}

function geometrySignature(entity: CadImageEntity, origin: CadRenderOrigin): string {
  const { insertion: o, uVector: u, vVector: v, size } = entity;
  const clip = entity.clipBoundary?.map((point) => `${point.x},${point.y}`).join(";") ?? "";
  return `${o.x},${o.y}|${u.x},${u.y}|${v.x},${v.y}|${size.width},${size.height}|${clip}|${origin.x},${origin.y}`;
}

/**
 * El polígono visible triangulado, en coordenadas del dibujo relativas al
 * origen, con UV en píxeles/tamaño. Un polígono que no cierra área (dos
 * píxeles, tres alineados) produce una geometría vacía y no una excepción.
 */
export function buildImageGeometry(entity: CadImageEntity, origin: CadRenderOrigin): THREE.BufferGeometry {
  const pixels = cadImagePixelPolygon(entity);
  const contour = pixels.map((pixel) => new THREE.Vector2(pixel.x, pixel.y));
  const triangles = contour.length >= 3 ? THREE.ShapeUtils.triangulateShape(contour, []) : [];
  const positions = new Float32Array(pixels.length * 3);
  const uvs = new Float32Array(pixels.length * 2);
  const width = Math.max(1e-9, entity.size.width);
  const height = Math.max(1e-9, entity.size.height);
  pixels.forEach((pixel, index) => {
    const world = cadImagePixelToWorld(entity, pixel.x, pixel.y);
    positions[index * 3] = world.x - origin.x;
    positions[index * 3 + 1] = world.y - origin.y;
    positions[index * 3 + 2] = 0;
    uvs[index * 2] = pixel.x / width;
    uvs[index * 2 + 1] = pixel.y / height;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(triangles.flat());
  return geometry;
}

/**
 * El cargador del navegador: un `<img>` decodificado. Sirve para `data:` y
 * para `http(s)` con CORS; devuelve `null` si no hay DOM o el archivo no se
 * decodifica, y la capa lo cuenta como fallido en vez de dejarlo cargando.
 */
export function cadBrowserImageLoader(): CadImageLoader {
  return async (uri) => {
    if (typeof Image === "undefined") return null;
    const image = new Image();
    if (/^https?:\/\//i.test(uri)) image.crossOrigin = "anonymous";
    image.src = uri;
    try {
      await image.decode();
    } catch {
      return null;
    }
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return null;
    const texture = new THREE.Texture(image);
    // Sin conversión de espacio de color: el shader es propio y escribe los
    // bytes tal cual, que es lo que el archivo dice que se vea.
    texture.flipY = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  };
}
