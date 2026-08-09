/**
 * Lado THREE/DOM del texto por atlas: una textura, un material, una malla.
 *
 * El rasterizado vive aquí porque necesita `document`; todo lo que decide DÓNDE
 * va cada glifo está en `text-atlas.ts` y se prueba en Node. La división importa:
 * el bug caro de un pipeline de texto no es pintar mal una letra, es colocarla
 * en el sitio equivocado, y eso es exactamente la parte que sí tiene pruebas.
 *
 * Recordatorio de lo que este camino NO hace: no hay campo de distancia. Los
 * glifos se rasterizan a `emPixels` de alto y se magnifican con filtrado
 * bilineal. Por encima de ~3× ese tamaño el borde se ablanda. Está anotado en
 * `text-atlas.ts` y se repite aquí porque es donde se elige `emPixels`.
 */
import * as THREE from "three";
import type { CadThreeViewport } from "../entity-three";
import {
  CAD_TEXT_ATLAS_DEFAULT_SIZE,
  CadGlyphAtlas,
  type CadGlyphMetrics,
  type CadGlyphSource,
  type CadTextQuadArrays,
} from "./text-atlas";

const CAD_TEXT_QUAD_POSITIONS = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  1, 1, 0,
]);
const CAD_TEXT_QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);

export const CAD_TEXT_ATLAS_VERTEX_SHADER = `
attribute vec2 instanceOrigin;
attribute vec2 instanceRight;
attribute vec2 instanceUp;
attribute vec4 instanceUv;
attribute vec2 instanceStyle;

uniform float cadScale;
uniform vec2 cadCenter;
uniform float cadElevation;

varying vec2 vUv;
varying vec3 vColor;

vec3 cadUnpackColor(float packed) {
  float r = floor(packed / 65536.0);
  float g = floor(mod(packed, 65536.0) / 256.0);
  float b = floor(mod(packed, 256.0));
  return vec3(r, g, b) / 255.0;
}

void main() {
  vec2 world = instanceOrigin + instanceRight * position.x + instanceUp * position.y;
  vec3 scenePosition = vec3(
    (world.x - cadCenter.x) * cadScale,
    cadElevation,
    (world.y - cadCenter.y) * cadScale
  );
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  gl_Position.z = instanceStyle.y * gl_Position.w;
  // La V se invierte porque el canvas crece hacia abajo y la textura hacia
  // arriba: sin esto todos los rótulos salen del revés.
  vUv = vec2(
    mix(instanceUv.x, instanceUv.z, position.x),
    mix(instanceUv.w, instanceUv.y, position.y)
  );
  vColor = cadUnpackColor(instanceStyle.x);
}`;

export const CAD_TEXT_ATLAS_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D cadAtlas;
uniform float cadAlphaCutoff;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  float coverage = texture2D(cadAtlas, vUv).a;
  // Descarte por cobertura, no mezcla alfa: la escritura de profundidad es lo
  // que conserva el orden de dibujo, y un fragmento translúcido la rompería.
  if (coverage < cadAlphaCutoff) discard;
  gl_FragColor = vec4(vColor, 1.0);
}`;

export interface CadTextAtlasUniforms {
  cadScale: { value: number };
  cadCenter: { value: THREE.Vector2 };
  cadElevation: { value: number };
  cadAtlas: { value: THREE.Texture | null };
  cadAlphaCutoff: { value: number };
  [uniform: string]: { value: unknown };
}

/**
 * Atlas respaldado por un canvas. Mide con `measureText` y pinta cada glifo una
 * sola vez; `sync()` devuelve true cuando hay glifos nuevos y la textura tiene
 * que volver a subir.
 */
export class CadCanvasTextAtlas {
  readonly atlas: CadGlyphAtlas;
  readonly source: CadGlyphSource;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly measured = new Map<string, CadGlyphMetrics>();
  private readonly painted = new Set<string>();
  private textureValue: THREE.CanvasTexture | null = null;

  constructor(
    readonly size = CAD_TEXT_ATLAS_DEFAULT_SIZE,
    readonly emPixels = 48,
  ) {
    this.atlas = new CadGlyphAtlas(size);
    this.canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    if (this.canvas) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    this.context = this.canvas?.getContext("2d", { willReadFrequently: false }) ?? null;
    this.source = {
      key: (character, fontKey) => `${fontKey}|${character}`,
      metrics: (character, fontKey) => this.metricsFor(character, fontKey),
    };
  }

  private metricsFor(character: string, fontKey: string): CadGlyphMetrics | null {
    const key = `${fontKey}|${character}`;
    const cached = this.measured.get(key);
    if (cached) return cached;
    if (!this.context) return null;
    if (character === "\n" || character === "\r") return null;
    this.context.font = `${this.emPixels}px ${fontKey}`;
    const measure = this.context.measureText(character);
    const advance = measure.width / this.emPixels;
    const left = measure.actualBoundingBoxLeft ?? 0;
    const rightEdge = measure.actualBoundingBoxRight ?? measure.width;
    const ascent = measure.actualBoundingBoxAscent ?? this.emPixels * 0.8;
    const descent = measure.actualBoundingBoxDescent ?? this.emPixels * 0.2;
    const pixelWidth = Math.max(0, Math.ceil(left + rightEdge));
    const pixelHeight = Math.max(0, Math.ceil(ascent + descent));
    const metrics: CadGlyphMetrics = {
      advance,
      bearingX: -left / this.emPixels,
      bearingY: -descent / this.emPixels,
      emWidth: pixelWidth / this.emPixels,
      emHeight: pixelHeight / this.emPixels,
      pixelWidth,
      pixelHeight,
    };
    this.measured.set(key, metrics);
    return metrics;
  }

  /** Pinta los glifos asignados que aún no estaban en el canvas. */
  sync(): boolean {
    if (!this.context) return false;
    let painted = 0;
    for (const [key, slot] of this.atlas.entries()) {
      if (this.painted.has(key)) continue;
      const separator = key.lastIndexOf("|");
      const fontKey = key.slice(0, separator);
      const character = key.slice(separator + 1);
      const metrics = this.measured.get(key);
      if (!metrics) continue;
      this.context.save();
      this.context.font = `${this.emPixels}px ${fontKey}`;
      this.context.fillStyle = "#ffffff";
      this.context.textBaseline = "alphabetic";
      // El glifo se pinta con su línea base colocada para que el recuadro
      // asignado lo contenga exactamente; el color real lo pone el shader, así
      // que aquí sólo interesa la cobertura.
      this.context.fillText(
        character,
        slot.x + metrics.bearingX * this.emPixels * -1,
        slot.y + slot.height + metrics.bearingY * this.emPixels,
      );
      this.context.restore();
      this.painted.add(key);
      painted += 1;
    }
    if (painted > 0 && this.textureValue) this.textureValue.needsUpdate = true;
    return painted > 0;
  }

  get texture(): THREE.CanvasTexture | null {
    if (!this.canvas) return null;
    if (!this.textureValue) {
      this.textureValue = new THREE.CanvasTexture(this.canvas);
      this.textureValue.minFilter = THREE.LinearFilter;
      this.textureValue.magFilter = THREE.LinearFilter;
      this.textureValue.generateMipmaps = false;
    }
    return this.textureValue;
  }

  dispose(): void {
    this.textureValue?.dispose();
    this.textureValue = null;
    this.atlas.reset();
    this.measured.clear();
    this.painted.clear();
  }
}

export function createCadTextAtlasMaterial(options: {
  viewport: CadThreeViewport;
  texture: THREE.Texture | null;
  alphaCutoff?: number;
}): { material: THREE.ShaderMaterial; uniforms: CadTextAtlasUniforms } {
  const uniforms: CadTextAtlasUniforms = {
    cadScale: { value: options.viewport.scale },
    cadCenter: {
      value: new THREE.Vector2(options.viewport.width / 2, options.viewport.height / 2),
    },
    cadElevation: { value: (options.viewport.elevation ?? 0.11) + 0.005 },
    cadAtlas: { value: options.texture },
    cadAlphaCutoff: { value: options.alphaCutoff ?? 0.45 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CAD_TEXT_ATLAS_VERTEX_SHADER,
    fragmentShader: CAD_TEXT_ATLAS_FRAGMENT_SHADER,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.name = "cad-render:text-atlas";
  return { material, uniforms };
}

export function buildCadTextAtlasMesh(
  quads: CadTextQuadArrays,
  material: THREE.ShaderMaterial,
): THREE.Mesh {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(CAD_TEXT_QUAD_POSITIONS, 3));
  geometry.setIndex(new THREE.BufferAttribute(CAD_TEXT_QUAD_INDICES, 1));
  geometry.setAttribute(
    "instanceOrigin",
    new THREE.InstancedBufferAttribute(quads.instanceOrigin, 2),
  );
  geometry.setAttribute(
    "instanceRight",
    new THREE.InstancedBufferAttribute(quads.instanceRight, 2),
  );
  geometry.setAttribute("instanceUp", new THREE.InstancedBufferAttribute(quads.instanceUp, 2));
  geometry.setAttribute("instanceUv", new THREE.InstancedBufferAttribute(quads.instanceUv, 4));
  geometry.setAttribute(
    "instanceStyle",
    new THREE.InstancedBufferAttribute(quads.instanceStyle, 2),
  );
  geometry.instanceCount = quads.instanceCount;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cad-render:text-atlas";
  mesh.frustumCulled = false;
  mesh.userData.cadTextAtlas = true;
  mesh.userData.cadTextGlyphs = quads.instanceCount;
  return mesh;
}
