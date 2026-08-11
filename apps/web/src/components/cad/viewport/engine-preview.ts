/**
 * Banda elástica del motor de comandos.
 *
 * El motor ya emite la previsualización con la GEOMETRÍA REAL del paso: un ARC
 * en curso devuelve el arco, no un segmento genérico, y un RECTANG devuelve las
 * cuatro aristas. Lo que faltaba era alguien que la dibujase — el puente del
 * editor tenía `preview: () => {}` con un comentario diciendo que se ignoraba a
 * conciencia hasta que llegara el puntero. Esto es ese alguien.
 *
 * ## Una geometría, reutilizada
 *
 * Se dibuja en cada movimiento del ratón, así que crear una `BufferGeometry`
 * por muestra dejaría basura a 60 Hz y obligaría a `dispose()` sesenta veces
 * por segundo. En su lugar hay UN búfer que crece cuando hace falta y del que
 * sólo se reescribe el rango usado: mover el cursor escribe flotantes, no
 * asigna objetos.
 */
import * as THREE from "three";
import type { CadPreviewPath } from "@/lib/cad/engine/command-types";
import type { CadThreeViewport } from "@/lib/cad/entity-three";

/** Cian de previsualización, el mismo del realce de selección. */
const PREVIEW_COLOR = 0x22d3ee;
/** Por encima de los lotes y de los objetos heredados: es lo que se está haciendo. */
const PREVIEW_RENDER_ORDER = 995;
/** Vértices iniciales. Crece por duplicación; un RECTANG cabe de sobra. */
const INITIAL_VERTICES = 256;

export class CadEnginePreview {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly object: THREE.LineSegments;
  private positions = new Float32Array(INITIAL_VERTICES * 3);
  private viewport: CadThreeViewport;
  private elevation: number;
  private disposed = false;

  constructor(parent: THREE.Object3D, viewport: CadThreeViewport, elevation = 0.12) {
    this.viewport = viewport;
    this.elevation = elevation;
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setDrawRange(0, 0);
    this.object = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({
        color: PREVIEW_COLOR,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    this.object.name = "cad-engine:preview";
    this.object.renderOrder = PREVIEW_RENDER_ORDER;
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.userData.cadEnginePreview = true;
    parent.add(this.object);
  }

  get visible(): boolean {
    return this.object.visible;
  }

  /** Número de segmentos dibujados. Es lo que un spec puede afirmar. */
  get segmentCount(): number {
    return this.geometry.drawRange.count / 2;
  }

  setViewport(viewport: CadThreeViewport): void {
    this.viewport = viewport;
  }

  /**
   * Dibuja los trazos del paso actual. Una lista vacía apaga la banda elástica
   * en vez de dejar el último trazo colgando, que es lo que haría parecer que
   * el comando sigue vivo cuando ya terminó.
   */
  draw(paths: readonly CadPreviewPath[]): void {
    if (this.disposed) return;
    let vertices = 0;
    for (const path of paths) {
      if (path.points.length < 2) continue;
      vertices += 2 * (path.points.length - 1 + (path.closed ? 1 : 0));
    }
    if (vertices === 0) {
      this.geometry.setDrawRange(0, 0);
      this.object.visible = false;
      return;
    }
    this.ensureCapacity(vertices);
    const { scale, width, height } = this.viewport;
    let cursor = 0;
    for (const path of paths) {
      if (path.points.length < 2) continue;
      const segments = path.points.length - 1 + (path.closed ? 1 : 0);
      for (let index = 0; index < segments; index += 1) {
        const from = path.points[index];
        const to = path.points[(index + 1) % path.points.length];
        this.positions[cursor] = (from.x - width / 2) * scale;
        this.positions[cursor + 1] = this.elevation;
        this.positions[cursor + 2] = (from.y - height / 2) * scale;
        this.positions[cursor + 3] = (to.x - width / 2) * scale;
        this.positions[cursor + 4] = this.elevation;
        this.positions[cursor + 5] = (to.y - height / 2) * scale;
        cursor += 6;
      }
    }
    const attribute = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    attribute.updateRanges = [{ start: 0, count: cursor }];
    this.geometry.setDrawRange(0, vertices);
    this.object.visible = true;
  }

  clear(): void {
    this.draw([]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }

  private ensureCapacity(vertices: number): void {
    if (this.positions.length >= vertices * 3) return;
    let capacity = this.positions.length / 3;
    while (capacity < vertices) capacity *= 2;
    this.positions = new Float32Array(capacity * 3);
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
  }
}
