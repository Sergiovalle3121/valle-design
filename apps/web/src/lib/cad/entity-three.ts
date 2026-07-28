import * as THREE from "three";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "./entity-runtime";
import { layoutCadMText } from "./mtext-layout";

export interface CadThreeViewport {
  scale: number;
  width: number;
  height: number;
  elevation?: number;
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

function scenePoint(
  point: { x: number; y: number },
  viewport: CadThreeViewport,
  elevation: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    (point.x - viewport.width / 2) * viewport.scale,
    elevation,
    (point.y - viewport.height / 2) * viewport.scale,
  );
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

  for (const path of adapter.renderer.paths(entity, 96)) {
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
