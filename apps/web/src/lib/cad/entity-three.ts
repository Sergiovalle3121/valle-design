import * as THREE from "three";
import {
  CAD_ENTITY_REGISTRY,
  type CadNativeEntity,
} from "./entity-runtime";

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
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose?.();
  });
  object.removeFromParent();
}
