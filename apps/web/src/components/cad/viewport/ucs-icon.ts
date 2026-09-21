import * as THREE from "three";

/**
 * El icono de ejes (UCS) que faltaba en el lienzo.
 *
 * AutoCAD lo pinta siempre: dos flechas desde el origen, X roja hacia la
 * derecha e Y verde hacia «arriba» del dibujo. Sin él, cualquiera que venga de
 * AutoCAD pierde la referencia de dónde está el (0,0) y hacia dónde crecen los
 * ejes en cuanto hay una vista girada o desplazada — es la queja literal del
 * dueño («SIN icono de ejes (UCS) en el origen»).
 *
 * `computeCadUcsIconGeometry` es la mitad pura (puntos en el plano local del
 * icono, sin THREE): `ucs-icon.spec.ts` fija su forma sin navegador.
 * `createCadUcsIconObject` es la mitad THREE, deliberadamente pequeña — arma
 * dos líneas y dos triángulos de punta a partir de esos puntos.
 *
 * Simplificación consciente (v1): el icono vive en coordenadas de MUNDO, no
 * de pantalla — su tamaño no se recalcula cuadro a cuadro para mantenerse a un
 * tamaño de píxel fijo como en AutoCAD real. A la escala por defecto (ajustar
 * a toda la planta) es legible; en un acercamiento extremo puede quedar
 * pequeño. Fijarlo a tamaño de pantalla exige proyectar el origen cada cuadro
 * (como hace `ScaleBar`) y queda fuera de esta ola — dicho en «pendiente».
 */
export interface CadUcsIconColors {
  /** Rojo del eje X, como ACI 1 en AutoCAD. */
  axisX: number;
  /** Verde del eje Y, como ACI 3 en AutoCAD. */
  axisY: number;
}

export type CadUcsIconPoint = readonly [number, number];

export interface CadUcsIconGeometry {
  /** Eje X (rojo): del origen a `(armLength, 0)`. */
  xAxis: readonly [CadUcsIconPoint, CadUcsIconPoint];
  /**
   * Eje Y (verde): del origen a `(0, -armLength)`. El signo negativo es a
   * propósito — en el plano local del icono, «-z» es «arriba del dibujo»
   * (mismo sentido que usa `toWorld` en `Layout3DEditor` para la Y de
   * pantalla), así el brazo verde apunta hacia donde el dibujante espera ver
   * crecer Y.
   */
  yAxis: readonly [CadUcsIconPoint, CadUcsIconPoint];
  /** Triángulo de punta del eje X — 3 puntos, cara plana. */
  xArrow: readonly [CadUcsIconPoint, CadUcsIconPoint, CadUcsIconPoint];
  /** Triángulo de punta del eje Y — 3 puntos, cara plana. */
  yArrow: readonly [CadUcsIconPoint, CadUcsIconPoint, CadUcsIconPoint];
}

/** Fracción de `armLength` que ocupa la punta de flecha. */
const ARROW_SPAN = 0.16;
/** Semi-ancho de la punta, como fracción de `armLength`. */
const ARROW_HALF_WIDTH = 0.05;

export function computeCadUcsIconGeometry(armLength: number): CadUcsIconGeometry {
  if (!(armLength > 0)) throw new Error("armLength debe ser positivo");
  const tipX: CadUcsIconPoint = [armLength, 0];
  const tipY: CadUcsIconPoint = [0, -armLength];
  const backX = armLength * (1 - ARROW_SPAN);
  const backZ = -armLength * (1 - ARROW_SPAN);
  const w = armLength * ARROW_HALF_WIDTH;
  return {
    xAxis: [[0, 0], tipX],
    yAxis: [[0, 0], tipY],
    xArrow: [[backX, w], tipX, [backX, -w]],
    yArrow: [[-w, backZ], tipY, [w, backZ]],
  };
}

/** Nombres de los cuatro hijos del grupo — `setCadUcsIconColors` los busca por aquí. */
const NAME_X_LINE = "cad-ucs-axis-x";
const NAME_X_ARROW = "cad-ucs-arrow-x";
const NAME_Y_LINE = "cad-ucs-axis-y";
const NAME_Y_ARROW = "cad-ucs-arrow-y";

function toVec3(point: CadUcsIconPoint): THREE.Vector3 {
  return new THREE.Vector3(point[0], 0, point[1]);
}

function buildArrowMesh(points: readonly CadUcsIconPoint[], color: number, name: string) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVec3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false }),
  );
  mesh.name = name;
  mesh.renderOrder = 2;
  return mesh;
}

function buildAxisLine(points: readonly CadUcsIconPoint[], color: number, name: string) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(toVec3));
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, depthTest: false }),
  );
  line.name = name;
  line.renderOrder = 2;
  return line;
}

/** Arma el grupo THREE completo, listo para `scene.add(...)`. */
export function createCadUcsIconObject(
  armLength: number,
  colors: CadUcsIconColors,
): THREE.Group {
  const geometry = computeCadUcsIconGeometry(armLength);
  const group = new THREE.Group();
  group.name = "cad-ucs-icon";
  group.add(buildAxisLine(geometry.xAxis, colors.axisX, NAME_X_LINE));
  group.add(buildArrowMesh(geometry.xArrow, colors.axisX, NAME_X_ARROW));
  group.add(buildAxisLine(geometry.yAxis, colors.axisY, NAME_Y_LINE));
  group.add(buildArrowMesh(geometry.yArrow, colors.axisY, NAME_Y_ARROW));
  return group;
}

/** Repinta el icono ya construido cuando cambia el tema — sin reconstruir geometría. */
export function setCadUcsIconColors(group: THREE.Group, colors: CadUcsIconColors): void {
  for (const child of group.children) {
    const isX = child.name === NAME_X_LINE || child.name === NAME_X_ARROW;
    const isY = child.name === NAME_Y_LINE || child.name === NAME_Y_ARROW;
    if (!isX && !isY) continue;
    const material = (child as THREE.Line | THREE.Mesh).material as THREE.Material & {
      color: THREE.Color;
    };
    material.color.setHex(isX ? colors.axisX : colors.axisY);
  }
}
