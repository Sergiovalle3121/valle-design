import * as THREE from "three";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "./entity-runtime";
import { layoutCadMText } from "./mtext-layout";
import { buildCadDimensionGeometry } from "./associative-dimension";
import { buildCadMleaderGeometry } from "./associative-mleader";
import type { CadDocument } from "./cad-document";
import { buildCadInsertBatches, resolveCadInsert } from "./professional-blocks";

export interface CadThreeViewport {
  scale: number;
  width: number;
  height: number;
  elevation?: number;
  /**
   * Origen flotante de escena (ver `render/tessellation-cache.ts`): el
   * centroide redondeado del documento, en doubles. Sin él, `cadCenter` y
   * `scenePoint` calculan `width/2` como si fuera el centro del documento —
   * cierto sólo mientras el documento vive cerca de (0,0). Con documentos en
   * coordenadas UTM (10⁶–10⁷) ese supuesto es lo que perdía precisión.
   */
  origin?: { x: number; y: number };
}

/**
 * Centro de cámara en unidades de dibujo, ya con el origen flotante restado.
 * Ambos operandos son JS doubles, así que la resta es exacta: lo que sale es
 * pequeño por construcción cuando `origin` es el centroide del documento, y
 * es exactamente `width/2, height/2` (el comportamiento de siempre) cuando no
 * hay origen.
 */
export function cadViewportCenter(viewport: CadThreeViewport): { x: number; y: number } {
  return {
    x: viewport.width / 2 - (viewport.origin?.x ?? 0),
    y: viewport.height / 2 - (viewport.origin?.y ?? 0),
  };
}

interface CadNativeOverviewState {
  entitySlots: Map<string, number>;
  entities: Map<string, CadNativeEntity>;
  hiddenLayers: Set<string>;
  maxSegmentsPerEntity: number;
  viewport: CadThreeViewport;
}

const CAD_NATIVE_OVERVIEW_COLOR = 0x475569;
const cadNativeOverviewStates = new WeakMap<THREE.LineSegments, CadNativeOverviewState>();

const DEFAULT_COLOR = 0x60a5fa;
const SELECTED_COLOR = 0x22d3ee;

const CAD_INSERT_BATCH_VERTEX_SHADER = `
attribute vec4 instanceLinear;
attribute vec2 instanceTranslate;
uniform float cadScale;
uniform vec2 cadCenter;
uniform float cadElevation;
void main() {
  vec2 world = vec2(
    instanceLinear.x * position.x + instanceLinear.z * position.y + instanceTranslate.x,
    instanceLinear.y * position.x + instanceLinear.w * position.y + instanceTranslate.y
  );
  vec3 scenePosition = vec3(
    (world.x - cadCenter.x) * cadScale,
    cadElevation,
    (world.y - cadCenter.y) * cadScale
  );
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePosition, 1.0);
}`;

const CAD_INSERT_BATCH_FRAGMENT_SHADER = `
uniform vec3 cadColor;
uniform float cadOpacity;
void main() {
  gl_FragColor = vec4(cadColor, cadOpacity);
}`;

function scenePoint(
  point: { x: number; y: number },
  viewport: CadThreeViewport,
  elevation: number,
): THREE.Vector3 {
  const center = cadViewportCenter(viewport);
  return new THREE.Vector3(
    (point.x - center.x) * viewport.scale,
    elevation,
    (point.y - center.y) * viewport.scale,
  );
}

/**
 * DIMCLRT — el color del RÓTULO de la cota, que no tiene por qué ser el de sus
 * líneas.
 *
 * El rasterizador de texto lee el color de `context.presentation.color.value`,
 * que es la vía por la que este renderizador lee cualquier color. Así que
 * DIMCLRT se inyecta ahí y, si la cota no lo trae, se hereda el contexto de la
 * entidad tal cual: una cota vieja se pinta exactamente como ayer.
 */
function cadDimensionTextContext(
  entity: Extract<CadNativeEntity, { type: "dimension" }>,
): CadNativeEntity["context"] {
  if (!entity.textColor) return entity.context;
  return {
    ...entity.context,
    presentation: {
      ...entity.context?.presentation,
      color: { source: "explicit", value: entity.textColor },
    },
  } as CadNativeEntity["context"];
}

function entityColor(entity: CadNativeEntity): number {
  const value = entity.context?.presentation?.color?.value;
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return DEFAULT_COLOR;
  return Number.parseInt(value.slice(1), 16);
}

function buildCadMTextSprite(
  entity: Extract<CadNativeEntity, { type: "mtext" }>,
  viewport: CadThreeViewport,
  elevation: number,
): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const layout = layoutCadMText(entity);
  const paddingWorld = entity.backgroundMask
    ? layout.fontSize * Math.max(0, entity.backgroundPadding ?? 0.15)
    : 0;
  const logicalWidth = layout.width + paddingWorld * 2;
  const logicalHeight = layout.height + paddingWorld * 2;
  const pixelsPerUnit = Math.max(0.05, Math.min(4, 1_024 / logicalWidth, 512 / logicalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(logicalWidth * pixelsPerUnit));
  canvas.height = Math.max(2, Math.ceil(logicalHeight * pixelsPerUnit));
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (entity.backgroundMask) {
    context.fillStyle = /^#[0-9a-f]{6}$/i.test(entity.backgroundColor ?? "")
      ? entity.backgroundColor!
      : "#111827";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = entity.context?.presentation?.color?.value ?? "#e2e8f0";
  context.textBaseline = "alphabetic";
  context.font = `${entity.italic ? "italic " : ""}${entity.bold ? "bold " : ""}${Math.max(1, layout.fontSize * pixelsPerUnit)}px ${layout.fontStack}`;
  const localMinX = Math.min(...layout.lines.map((line) => line.x), 0);
  const localMaxY = Math.max(...layout.lines.map((line) => line.y + layout.fontSize), 0);
  for (const line of layout.lines) {
    const x = (line.x - localMinX + paddingWorld) * pixelsPerUnit;
    const y = (localMaxY - line.y + paddingWorld) * pixelsPerUnit;
    const words = line.justify ? line.text.trim().split(/\s+/).filter(Boolean) : [];
    if (words.length > 1) {
      const wordWidths = words.map((word) => context.measureText(word).width);
      const gap = Math.max(0, (layout.columnWidth * pixelsPerUnit - wordWidths.reduce((sum, width) => sum + width, 0)) / (words.length - 1));
      let cursor = x;
      words.forEach((word, index) => {
        context.fillText(word, cursor, y);
        cursor += wordWidths[index] + gap;
      });
    } else context.fillText(line.text, x, y);
    if (entity.underline && line.width > 0) {
      context.fillRect(x, y + Math.max(1, layout.fontSize * pixelsPerUnit * 0.08), line.width * pixelsPerUnit, Math.max(1, layout.fontSize * pixelsPerUnit * 0.04));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  material.rotation = ((entity.rotation ?? 0) * Math.PI) / 180;
  const sprite = new THREE.Sprite(material);
  const center = layout.corners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 });
  sprite.position.copy(scenePoint(center, viewport, elevation + 0.005));
  sprite.scale.set(logicalWidth * viewport.scale, logicalHeight * viewport.scale, 1);
  sprite.renderOrder = 30;
  sprite.userData.nativeEntityId = entity.id;
  sprite.userData.nativeText = true;
  return sprite;
}

function overviewPoints(
  entity: CadNativeEntity,
  maxSegments: number,
): { points: { x: number; y: number }[]; closed: boolean } {
  if (entity.type === "hatch") {
    return {
      points: entity.boundaries[0] ?? [],
      closed: true,
    };
  }
  const path = CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
    entity,
    maxSegments,
  )[0];
  return path ?? { points: [], closed: false };
}

function sampledOverviewPoints(
  points: readonly { x: number; y: number }[],
  closed: boolean,
  maxSegments: number,
): { x: number; y: number }[] {
  const maxPoints = closed ? maxSegments : maxSegments + 1;
  if (points.length <= maxPoints) return [...points];
  const denominator = closed ? maxPoints : maxPoints - 1;
  return Array.from({ length: maxPoints }, (_, index) =>
    points[Math.floor((index * (points.length - (closed ? 0 : 1))) / denominator)],
  );
}

function writeOverviewSlot(
  positions: Float32Array,
  slot: number,
  entity: CadNativeEntity | null,
  state: CadNativeOverviewState,
): void {
  const start = slot * state.maxSegmentsPerEntity * 6;
  positions.fill(0, start, start + state.maxSegmentsPerEntity * 6);
  if (!entity || state.hiddenLayers.has(entity.layer)) return;
  const path = overviewPoints(entity, state.maxSegmentsPerEntity);
  const points = sampledOverviewPoints(
    path.points,
    path.closed,
    state.maxSegmentsPerEntity,
  );
  const segmentCount = Math.min(
    state.maxSegmentsPerEntity,
    Math.max(0, points.length - 1 + (path.closed ? 1 : 0)),
  );
  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const fromScene = scenePoint(from, state.viewport, state.viewport.elevation ?? 0.085);
    const toScene = scenePoint(to, state.viewport, state.viewport.elevation ?? 0.085);
    const offset = start + index * 6;
    positions.set(
      [fromScene.x, fromScene.y, fromScene.z, toScene.x, toScene.y, toScene.z],
      offset,
    );
  }
}

/**
 * One-draw-call overview for very large canonical drawings. Each entity owns a
 * fixed geometry slot, so common edit patches update typed-array ranges without
 * recreating thousands of Three.js objects.
 */
export function buildCadNativeOverviewObject(
  entities: readonly CadNativeEntity[],
  viewport: CadThreeViewport,
  maxSegmentsPerEntity = 8,
  hiddenLayers: ReadonlySet<string> = new Set(),
): THREE.LineSegments {
  const safeSegments = Math.max(1, Math.floor(maxSegmentsPerEntity));
  const positions = new Float32Array(entities.length * safeSegments * 6);
  const state: CadNativeOverviewState = {
    entitySlots: new Map(entities.map((entity, index) => [entity.id, index])),
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    hiddenLayers: new Set(hiddenLayers),
    maxSegmentsPerEntity: safeSegments,
    viewport: { ...viewport },
  };
  entities.forEach((entity, index) =>
    writeOverviewSlot(positions, index, entity, state),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const object = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: CAD_NATIVE_OVERVIEW_COLOR,
      transparent: true,
      opacity: 0.48,
      depthTest: false,
    }),
  );
  object.name = "cad-native:overview";
  object.renderOrder = 28;
  object.frustumCulled = false;
  object.userData.nativeOverview = true;
  object.userData.nativeOverviewEntities = entities.length;
  cadNativeOverviewStates.set(object, state);
  return object;
}

/**
 * Builds real GPU-instanced line geometry for repeated INSERT definitions.
 * Geometry is uploaded once per block/style and every INSERT contributes only
 * a six-number affine matrix. Per-instance text stays a separate semantic
 * projection because its attribute value can differ for every INSERT.
 */
export function buildCadInsertBatchObject(
  document: CadDocument,
  viewport: CadThreeViewport,
  minimumInstances = 2,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "cad-native:insert-batches";
  group.userData.nativeBlockBatch = true;
  const batchedInsertIds = new Set<string>();
  let drawCalls = 0;
  let instances = 0;
  let baseSegments = 0;

  for (const batch of buildCadInsertBatches(document)) {
    if (batch.insertIds.length < Math.max(2, minimumInstances)) continue;
    const block = document.blocks.find((candidate) => candidate.id === batch.block);
    const firstInsert = document.entities.find(
      (candidate): candidate is Extract<CadNativeEntity, { type: "insert" }> =>
        candidate.type === "insert" && candidate.id === batch.insertIds[0],
    );
    if (!block || !firstInsert) continue;
    const probe: Extract<CadNativeEntity, { type: "insert" }> = {
      ...firstInsert,
      id: `${firstInsert.id}:batch-probe`,
      insertion: { ...block.basePoint },
      rotation: 0,
      scale: { x: 1, y: 1, z: 1 },
    };
    const styles = new Map<string, { color: number; layer: string; positions: number[] }>();
    const resolved = resolveCadInsert(document, probe).entities;
    for (const child of resolved) {
      if (child.type === "text" || child.type === "mtext" || !CAD_ENTITY_REGISTRY.supports(child)) continue;
      const color = entityColor(child);
      const styleKey = `${child.layer}|${color}`;
      const style = styles.get(styleKey) ?? { color, layer: child.layer, positions: [] };
      for (const path of CAD_ENTITY_REGISTRY.adapter(child).renderer.paths(child, 64, document)) {
        if (path.points.length < 2) continue;
        const segmentCount = path.points.length - 1 + (path.closed ? 1 : 0);
        for (let index = 0; index < segmentCount; index += 1) {
          const from = path.points[index];
          const to = path.points[(index + 1) % path.points.length];
          style.positions.push(from.x, from.y, 0, to.x, to.y, 0);
        }
      }
      styles.set(styleKey, style);
    }
    if (!styles.size) continue;

    const linear = new Float32Array(batch.matrices.length * 4);
    const translate = new Float32Array(batch.matrices.length * 2);
    batch.matrices.forEach(([a, b, c, d, e, f], index) => {
      linear.set([a, b, c, d], index * 4);
      translate.set([e, f], index * 2);
    });
    for (const style of styles.values()) {
      if (!style.positions.length) continue;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(style.positions, 3));
      geometry.setAttribute("instanceLinear", new THREE.InstancedBufferAttribute(linear, 4));
      geometry.setAttribute("instanceTranslate", new THREE.InstancedBufferAttribute(translate, 2));
      geometry.instanceCount = batch.matrices.length;
      const insertBatchCenter = cadViewportCenter(viewport);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          cadScale: { value: viewport.scale },
          cadCenter: {
            value: new THREE.Vector2(insertBatchCenter.x, insertBatchCenter.y),
          },
          cadElevation: { value: viewport.elevation ?? 0.105 },
          cadColor: { value: new THREE.Color(style.color) },
          cadOpacity: { value: 0.9 },
        },
        vertexShader: CAD_INSERT_BATCH_VERTEX_SHADER,
        fragmentShader: CAD_INSERT_BATCH_FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
      });
      const line = new THREE.LineSegments(geometry, material);
      line.name = `cad-native:insert-batch:${batch.key}:${style.layer}`;
      line.renderOrder = 29;
      line.frustumCulled = false;
      line.userData.nativeBlockBatchPath = true;
      line.userData.nativeBlockBatchLayer = style.layer;
      line.userData.nativeBlockBatchInsertIds = [...batch.insertIds];
      group.add(line);
      drawCalls += 1;
      baseSegments += style.positions.length / 6;
    }
    batch.insertIds.forEach((id) => batchedInsertIds.add(id));
    instances += batch.insertIds.length;
  }
  group.userData.nativeBlockBatchInsertIds = [...batchedInsertIds];
  group.userData.nativeBlockBatchDrawCalls = drawCalls;
  group.userData.nativeBlockBatchInstances = instances;
  group.userData.nativeBlockBatchBaseSegments = baseSegments;
  return group;
}

export function setCadInsertBatchHiddenLayers(
  object: THREE.Group,
  hiddenLayers: ReadonlySet<string>,
): void {
  object.children.forEach((child) => {
    if (child.userData.nativeBlockBatchPath === true)
      child.visible = !hiddenLayers.has(String(child.userData.nativeBlockBatchLayer ?? "0"));
  });
}

/** Returns false when a structural insert requires rebuilding the batch. */
export function updateCadNativeOverviewObject(
  object: THREE.LineSegments,
  patch: { upsert: CadNativeEntity[]; remove: string[] },
): boolean {
  const state = cadNativeOverviewStates.get(object);
  const attribute = object.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!state || !attribute || !(attribute.array instanceof Float32Array)) return false;
  if (patch.upsert.some((entity) => !state.entitySlots.has(entity.id))) return false;
  const positions = attribute.array;
  const dirtySlots = new Set<number>();
  for (const id of new Set(patch.remove)) {
    const slot = state.entitySlots.get(id);
    if (slot !== undefined) {
      state.entities.delete(id);
      writeOverviewSlot(positions, slot, null, state);
      dirtySlots.add(slot);
    }
  }
  for (const entity of patch.upsert) {
    const slot = state.entitySlots.get(entity.id);
    if (slot !== undefined) {
      state.entities.set(entity.id, entity);
      writeOverviewSlot(positions, slot, entity, state);
      dirtySlots.add(slot);
    }
  }
  if (dirtySlots.size) {
    let first = Number.POSITIVE_INFINITY;
    let last = -1;
    for (const slot of dirtySlots) {
      first = Math.min(first, slot);
      last = Math.max(last, slot);
    }
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(
      first * state.maxSegmentsPerEntity * 6,
      (last - first + 1) * state.maxSegmentsPerEntity * 6,
    );
    attribute.needsUpdate = true;
  }
  return true;
}

/** Applies document-layer visibility without rebuilding the overview batch. */
export function setCadNativeOverviewHiddenLayers(
  object: THREE.LineSegments,
  hiddenLayers: ReadonlySet<string>,
): void {
  const state = cadNativeOverviewStates.get(object);
  const attribute = object.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!state || !attribute || !(attribute.array instanceof Float32Array)) return;
  const changedLayers = new Set([
    ...[...state.hiddenLayers].filter((layer) => !hiddenLayers.has(layer)),
    ...[...hiddenLayers].filter((layer) => !state.hiddenLayers.has(layer)),
  ]);
  if (!changedLayers.size) return;
  state.hiddenLayers = new Set(hiddenLayers);
  let first = Number.POSITIVE_INFINITY;
  let last = -1;
  for (const [id, entity] of state.entities) {
    if (!changedLayers.has(entity.layer)) continue;
    const slot = state.entitySlots.get(id);
    if (slot === undefined) continue;
    writeOverviewSlot(attribute.array, slot, entity, state);
    first = Math.min(first, slot);
    last = Math.max(last, slot);
  }
  if (last < 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(
    first * state.maxSegmentsPerEntity * 6,
    (last - first + 1) * state.maxSegmentsPerEntity * 6,
  );
  attribute.needsUpdate = true;
}

export function setCadNativeObjectSelected(
  object: THREE.Object3D,
  selected: boolean,
): void {
  object.userData.selected = selected;
  object.traverse((child) => {
    if (child.userData.nativePath === true) {
      const material = (child as THREE.Line).material as THREE.LineBasicMaterial;
      material.color.setHex(selected ? SELECTED_COLOR : child.userData.baseColor);
      material.opacity = selected ? 1 : 0.9;
    }
    if (child.userData.nativeFill === true) {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.color.setHex(selected ? SELECTED_COLOR : child.userData.baseColor);
      material.opacity = selected ? 0.34 : 0.2;
    }
    if (child.userData.nativeGrip === true) child.visible = selected;
  });
}

/**
 * Rebuildable Three.js projection of one canonical entity. Geometry remains
 * disposable; every child points back to the canonical id for ray selection.
 */
export function buildCadNativeObject(
  entity: CadNativeEntity,
  viewport: CadThreeViewport,
  selected = false,
  document?: CadDocument,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `cad-native:${entity.id}`;
  group.userData.nativeEntityId = entity.id;
  group.userData.nativeEntityType = entity.type;
  const baseColor = entityColor(entity);
  const elevation = viewport.elevation ?? 0.11;
  const adapter = CAD_ENTITY_REGISTRY.adapter(entity);

  if (entity.type === "mtext") {
    const sprite = buildCadMTextSprite(entity, viewport, elevation);
    if (sprite) group.add(sprite);
  }
  if (entity.type === "dimension") {
    const dimension = buildCadDimensionGeometry(entity);
    if (dimension) {
      const sprite = buildCadMTextSprite({
        id: `${entity.id}:label`,
        type: "mtext",
        insertion: { ...dimension.textAnchor, z: 0 },
        text: dimension.label,
        /*
         * DIMTXT gobierna la altura. Antes se DERIVABA del tamaño de flecha
         * (`arrowSize * 0.55`), así que un despacho podía fijar su altura de
         * texto en el estilo, verla guardada y viajar por DXF, y el rótulo
         * salía del mismo tamaño de siempre. El respaldo conserva exactamente
         * la fórmula anterior para las cotas que no la traen: un documento
         * viejo se dibuja igual que ayer.
         */
        height: Math.max(1, entity.textHeight ?? (entity.arrowSize ?? 180) * 0.55),
        width: Math.max(
          entity.arrowSize ?? 180,
          dimension.label.length *
            (entity.textHeight ?? (entity.arrowSize ?? 180) * 0.55) *
            0.85,
        ),
        rotation: dimension.textAngle,
        alignment: "middle-center",
        paragraphAlignment: "center",
        backgroundMask: true,
        backgroundColor: "#0f172a",
        backgroundPadding: 0.1,
        // DIMTXSTY y DIMCLRT. El color viaja por el `context` de presentación,
        // que es la vía por la que este renderizador lee cualquier color.
        ...(entity.textStyle ? { style: entity.textStyle } : {}),
        layer: entity.layer,
        context: cadDimensionTextContext(entity),
      }, viewport, elevation);
      if (sprite) {
        sprite.userData.nativeEntityId = entity.id;
        group.add(sprite);
      }
    }
  }
  if (entity.type === "mleader") {
    const geometry = buildCadMleaderGeometry(entity);
    if (geometry && entity.text.trim()) {
      const sprite = buildCadMTextSprite({
        id: `${entity.id}:content`,
        type: "mtext",
        insertion: { ...geometry.textAnchor, z: 0 },
        text: entity.text,
        width: entity.textWidth ?? 1800,
        height: entity.textHeight ?? 120,
        rotation: entity.textRotation ?? 0,
        alignment: geometry.textDirection > 0 ? "middle-left" : "middle-right",
        paragraphAlignment: entity.textAlignment ?? "left",
        style: entity.style,
        fontFamily: entity.fontFamily ?? "Arial",
        lineSpacing: entity.lineSpacing ?? 1.2,
        bold: entity.bold,
        italic: entity.italic,
        underline: entity.underline,
        backgroundMask: entity.backgroundMask,
        backgroundColor: entity.backgroundColor,
        backgroundPadding: entity.backgroundPadding,
        layer: entity.layer,
        context: entity.context,
      }, viewport, elevation);
      if (sprite) {
        sprite.userData.nativeEntityId = entity.id;
        group.add(sprite);
      }
    }
  }
  if (entity.type === "insert" && document) {
    for (const child of resolveCadInsert(document, entity).entities) {
      if (child.type !== "text" && child.type !== "mtext") continue;
      const sprite = buildCadMTextSprite(child.type === "mtext" ? child : {
        id: child.id, type: "mtext", insertion: { x: child.x, y: child.y, z: 0 }, text: child.text,
        width: Math.max(child.height ?? 120, child.text.length * (child.height ?? 120) * 0.6), height: child.height ?? 120,
        rotation: child.rotation ?? 0, style: child.style, layer: child.layer, context: child.context,
      }, viewport, elevation);
      if (sprite) { sprite.userData.nativeEntityId = entity.id; group.add(sprite); }
    }
  }

  if (entity.type === "hatch" && entity.solid && entity.boundaries[0]?.length >= 3) {
    const shapePath = (boundary: typeof entity.boundaries[number]) =>
      boundary.map((point) => ({
        x: (point.x - viewport.width / 2) * viewport.scale,
        y: (point.y - viewport.height / 2) * viewport.scale,
      }));
    const outer = shapePath(entity.boundaries[0]);
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    outer.slice(1).forEach((point) => shape.lineTo(point.x, point.y));
    shape.closePath();
    for (const boundary of entity.boundaries.slice(1)) {
      if (boundary.length < 3) continue;
      const holePoints = shapePath(boundary);
      const hole = new THREE.Path();
      hole.moveTo(holePoints[0].x, holePoints[0].y);
      holePoints.slice(1).forEach((point) => hole.lineTo(point.x, point.y));
      hole.closePath();
      shape.holes.push(hole);
    }
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: selected ? SELECTED_COLOR : baseColor,
        transparent: true,
        opacity: selected ? 0.34 : 0.2,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    fill.rotation.x = Math.PI / 2;
    fill.position.y = elevation - 0.01;
    fill.renderOrder = 29;
    fill.userData.nativeEntityId = entity.id;
    fill.userData.nativeFill = true;
    fill.userData.baseColor = baseColor;
    group.add(fill);
  }

  for (const path of adapter.renderer.paths(entity, 96, document)) {
    if (path.points.length < 2) continue;
    const points = path.points.map((point) =>
      scenePoint(point, viewport, elevation),
    );
    if (path.closed) points.push(points[0].clone());
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: selected ? SELECTED_COLOR : baseColor,
        transparent: true,
        opacity: selected ? 1 : 0.9,
        depthTest: false,
      }),
    );
    line.renderOrder = 30;
    line.userData.nativeEntityId = entity.id;
    line.userData.nativePath = true;
    line.userData.baseColor = baseColor;
    group.add(line);
  }

  const gripRadius = Math.max(0.06, viewport.scale * 55);
  for (const grip of adapter.grips.grips(entity)) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(gripRadius, 10, 8),
      new THREE.MeshBasicMaterial({
        color: grip.kind === "center" ? 0xfbbf24 : SELECTED_COLOR,
        depthTest: false,
      }),
    );
    marker.position.copy(scenePoint(grip.point, viewport, elevation + 0.03));
    marker.renderOrder = 31;
    marker.visible = selected;
    marker.userData.nativeEntityId = entity.id;
    marker.userData.nativeGrip = true;
    marker.userData.nativeGripId = grip.id;
    marker.userData.nativeGripLabel = grip.label;
    group.add(marker);
  }
  group.userData.selected = selected;
  return group;
}

export function disposeCadNativeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    const disposeMaterial = (item: THREE.Material) => {
      const texture = (item as THREE.SpriteMaterial).map;
      texture?.dispose();
      item.dispose();
    };
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
  object.removeFromParent();
}
