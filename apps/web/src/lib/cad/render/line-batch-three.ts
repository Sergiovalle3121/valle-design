/**
 * Ensamblado THREE de los lotes de líneas: geometría instanciada + UN material.
 *
 * ## Un material para todo
 *
 * Color, grosor, tipo de línea y profundidad viajan POR INSTANCIA, así que no
 * hay ninguna razón para tener un material por cubo: los uniformes que quedan
 * (escala de la vista, centro, píxeles por unidad) son de la CÁMARA, iguales
 * para todos. Compartir un único `ShaderMaterial` significa un solo programa
 * compilado y una sola actualización de uniformes al panear, en vez de una por
 * lote. Los cubos siguen existiendo como GEOMETRÍAS separadas porque esa es la
 * unidad que entra y sale de la escena al panear y la que se apaga al ocultar
 * una capa.
 *
 * ## Por qué la prueba de profundidad se enciende
 *
 * El pipeline anterior dibujaba con `depthTest: false` y ordenaba con
 * `renderOrder`, que es una ordenación por OBJETO. Con lotes no hay un objeto
 * por entidad, así que el orden de dibujo tiene que viajar dentro del lote: es
 * la profundidad NDC que escribe el vertex shader. Para que esa profundidad
 * signifique algo hace falta `depthTest` y `depthWrite` encendidos, y por eso el
 * borde suave se resuelve con descarte por cobertura en vez de con mezcla alfa
 * —una línea semitransparente sin escritura de profundidad volvería a depender
 * del orden de las llamadas de dibujo, que es justo lo que se quiere dejar de
 * mirar.
 */
import * as THREE from "three";
import { cadViewportCenter, type CadThreeViewport } from "../entity-three";
import {
  CAD_LINETYPE_SLOTS,
  type CadLineBatch,
} from "./line-batch";

/**
 * Quad unitario compartido por todos los lotes. `position.x` recorre el
 * segmento (0 → origen, 1 → final) y `position.y` es el lado (−1 / +1). La `z`
 * no se usa: existe sólo porque `position` es un atributo reservado de tres
 * componentes en THREE y redeclararlo rompe la compilación.
 */
const CAD_LINE_QUAD_POSITIONS = new Float32Array([
  0, -1, 0,
  1, -1, 0,
  0, 1, 0,
  1, 1, 0,
]);
const CAD_LINE_QUAD_INDICES = new Uint16Array([0, 1, 2, 2, 1, 3]);

export const CAD_LINE_BATCH_VERTEX_SHADER = `
attribute vec2 instanceStart;
attribute vec2 instanceEnd;
attribute vec4 instanceStyle;
attribute vec2 instanceArc;

uniform float cadScale;
uniform vec2 cadCenter;
uniform float cadElevation;
uniform float cadWorldPerPixel;
uniform float cadDepthBias;
uniform float cadDepthScale;

varying vec3 vColor;
varying float vDash;
varying float vLinetype;
varying float vSide;
varying float vHalfWidthPx;

vec3 cadUnpackColor(float packed) {
  float r = floor(packed / 65536.0);
  float g = floor(mod(packed, 65536.0) / 256.0);
  float b = floor(mod(packed, 256.0));
  return vec3(r, g, b) / 255.0;
}

void main() {
  vec2 delta = instanceEnd - instanceStart;
  float len = length(delta);
  vec2 unit = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-unit.y, unit.x);
  // El grosor entra en PÍXELES y sale en unidades de dibujo. Eso es LWT: el
  // trazo mide lo mismo en pantalla a cualquier zoom.
  float halfWidthWorld = max(instanceStyle.y, 0.5) * cadWorldPerPixel;
  vec2 world = mix(instanceStart, instanceEnd, position.x) + normal * position.y * halfWidthWorld;
  vec3 scenePosition = vec3(
    (world.x - cadCenter.x) * cadScale,
    cadElevation,
    (world.y - cadCenter.y) * cadScale
  );
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
  // Orden de dibujo semántico. Bajo ortográfica w == 1, así que multiplicar por
  // w deja la z NDC exactamente donde la puso el planificador de orden.
  //
  // cadDepthBias/cadDepthScale COMPRIMEN ese rango en una lámina. Por
  // defecto valen 0 y 1 —el comportamiento original, todo el búfer—, pero un
  // consumidor que dibuja el CAD dentro de una escena con más geometría
  // necesita meterlo entero DELANTE de ella: sin lámina, la primera entidad del
  // orden de dibujo recibe z ≈ +0,9 y el suelo la tapa. La alternativa era
  // limpiar la profundidad a pantalla completa en cada cuadro, que en un
  // rasterizador por software cuesta un cuadro entero.
  gl_Position.z = (cadDepthBias + instanceStyle.w * cadDepthScale) * gl_Position.w;
  vColor = cadUnpackColor(instanceStyle.x);
  vDash = instanceArc.x + position.x * instanceArc.y;
  vLinetype = instanceStyle.z;
  vSide = position.y;
  vHalfWidthPx = max(instanceStyle.y, 0.5);
}`;

export const CAD_LINE_BATCH_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 cadLinetypePattern[${CAD_LINETYPE_SLOTS}];
uniform float cadLinetypeScale;
uniform float cadOpacity;

varying vec3 vColor;
varying float vDash;
varying float vLinetype;
varying float vSide;
varying float vHalfWidthPx;

void main() {
  // GLSL ES 1.00 no permite indexar un array de uniformes con una expresión no
  // constante en el fragment shader; el bucle de tope constante sí es legal.
  vec2 pattern = vec2(0.0);
  for (int slot = 0; slot < ${CAD_LINETYPE_SLOTS}; slot++) {
    if (float(slot) == vLinetype) pattern = cadLinetypePattern[slot];
  }
  float period = (pattern.x + pattern.y) * cadLinetypeScale;
  if (period > 0.0) {
    float phase = mod(vDash, period);
    if (phase > pattern.x * cadLinetypeScale) discard;
  }
  // Cobertura del borde: una línea de menos de un píxel no desaparece, se
  // atenúa. El descarte mantiene la escritura de profundidad significativa.
  float coverage = clamp((1.0 - abs(vSide)) * vHalfWidthPx * 2.0, 0.0, 1.0);
  if (coverage < 0.35) discard;
  gl_FragColor = vec4(vColor, cadOpacity);
}`;

export interface CadLineBatchUniforms {
  cadScale: { value: number };
  cadCenter: { value: THREE.Vector2 };
  cadElevation: { value: number };
  cadWorldPerPixel: { value: number };
  cadDepthBias: { value: number };
  cadDepthScale: { value: number };
  cadLinetypePattern: { value: THREE.Vector2[] };
  cadLinetypeScale: { value: number };
  cadOpacity: { value: number };
  [uniform: string]: { value: unknown };
}

export interface CadLineBatchMaterialOptions {
  viewport: CadThreeViewport;
  /** Píxeles de pantalla por unidad de dibujo. El zoom, leído de `CadView`. */
  pixelsPerUnit: number;
  /** Patrones (guion, hueco) en unidades de dibujo. El índice 0 es continua. */
  linetypePatterns?: ReadonlyArray<readonly [number, number]>;
  linetypeScale?: number;
  opacity?: number;
  /** Centro de la lámina de profundidad en NDC. 0 = todo el búfer (por defecto). */
  depthBias?: number;
  /** Semiancho de la lámina. 1 = sin comprimir (por defecto). */
  depthScale?: number;
}

function linetypeUniformValue(
  patterns: ReadonlyArray<readonly [number, number]> = [],
): THREE.Vector2[] {
  return Array.from({ length: CAD_LINETYPE_SLOTS }, (_, slot) => {
    const pattern = patterns[slot];
    return new THREE.Vector2(pattern?.[0] ?? 0, pattern?.[1] ?? 0);
  });
}

/**
 * Material compartido por todos los lotes de la escena. Se devuelve junto a sus
 * uniformes para que el bucle de cámara los actualice sin volver a buscarlos.
 */
export function createCadLineBatchMaterial(
  options: CadLineBatchMaterialOptions,
): { material: THREE.ShaderMaterial; uniforms: CadLineBatchUniforms } {
  const center = cadViewportCenter(options.viewport);
  const uniforms: CadLineBatchUniforms = {
    cadScale: { value: options.viewport.scale },
    cadCenter: {
      value: new THREE.Vector2(center.x, center.y),
    },
    cadElevation: { value: options.viewport.elevation ?? 0.11 },
    cadWorldPerPixel: { value: 1 / Math.max(options.pixelsPerUnit, 1e-6) },
    cadDepthBias: { value: options.depthBias ?? 0 },
    cadDepthScale: { value: options.depthScale ?? 1 },
    cadLinetypePattern: { value: linetypeUniformValue(options.linetypePatterns) },
    cadLinetypeScale: { value: options.linetypeScale ?? 1 },
    cadOpacity: { value: options.opacity ?? 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CAD_LINE_BATCH_VERTEX_SHADER,
    fragmentShader: CAD_LINE_BATCH_FRAGMENT_SHADER,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  material.name = "cad-render:line-batch";
  return { material, uniforms };
}

/**
 * Actualiza los uniformes de cámara. Es la operación de un paneo o un zoom
 * cuando NO cambia el conjunto de tiles visibles: cero geometría reconstruida,
 * cuatro números escritos.
 */
export function updateCadLineBatchUniforms(
  uniforms: CadLineBatchUniforms,
  viewport: CadThreeViewport,
  pixelsPerUnit: number,
): void {
  const center = cadViewportCenter(viewport);
  uniforms.cadScale.value = viewport.scale;
  uniforms.cadCenter.value.set(center.x, center.y);
  uniforms.cadElevation.value = viewport.elevation ?? 0.11;
  uniforms.cadWorldPerPixel.value = 1 / Math.max(pixelsPerUnit, 1e-6);
}

/**
 * Convierte un lote en una malla instanciada. `frustumCulled` se apaga porque
 * el culling real ya lo hizo el índice de tiles en coordenadas de dibujo; la
 * caja que THREE calcularía del quad unitario no describe nada.
 */
export function buildCadLineBatchMesh(
  batch: CadLineBatch,
  material: THREE.ShaderMaterial,
): THREE.Mesh {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(CAD_LINE_QUAD_POSITIONS, 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(CAD_LINE_QUAD_INDICES, 1));
  geometry.setAttribute(
    "instanceStart",
    new THREE.InstancedBufferAttribute(batch.instanceStart, 2),
  );
  geometry.setAttribute(
    "instanceEnd",
    new THREE.InstancedBufferAttribute(batch.instanceEnd, 2),
  );
  geometry.setAttribute(
    "instanceStyle",
    new THREE.InstancedBufferAttribute(batch.instanceStyle, 4),
  );
  geometry.setAttribute(
    "instanceArc",
    new THREE.InstancedBufferAttribute(batch.instanceArc, 2),
  );
  geometry.instanceCount = batch.instanceCount;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `cad-render:line-batch:${batch.bucketKey}`;
  mesh.frustumCulled = false;
  mesh.userData.cadLineBatch = true;
  mesh.userData.cadLineBatchKey = batch.bucketKey;
  mesh.userData.cadLineBatchLayer = batch.style.layer;
  mesh.userData.cadLineBatchInstances = batch.instanceCount;
  return mesh;
}

/** Apagar una capa no reconstruye nada: es un booleano por lote. */
export function setCadLineBatchHiddenLayers(
  root: THREE.Object3D,
  hiddenLayers: ReadonlySet<string>,
): void {
  root.traverse((child) => {
    if (child.userData.cadLineBatch === true)
      child.visible = !hiddenLayers.has(String(child.userData.cadLineBatchLayer ?? "0"));
  });
}

export function disposeCadLineBatchMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  mesh.removeFromParent();
}
