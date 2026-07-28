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
