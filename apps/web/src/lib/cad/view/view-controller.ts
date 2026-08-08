/**
 * Controlador de vista: las dos cámaras del editor, tras una sola API.
 *
 * El modo 3D y el recorrido a pie son funcionalidad real del producto y siguen
 * necesitando perspectiva. El dibujo 2D necesita lo contrario: proyección
 * paralela, escala legible y grosor de línea estable. Aquí conviven las dos, y
 * quien las usa no tiene que saber cuál está activa — pide `screenToWorld` o
 * `toleranceWorld` y recibe la respuesta correcta para el modo vigente.
 *
 * ## El mapeo mundo → escena, que NO cambia
 *
 * ```text
 * escena.x = (dibujo.x − W/2) · s
 * escena.z = (dibujo.y − H/2) · s
 * escena.y = elevación
 * ```
 *
 * Es decir: el dibujo yace sobre el plano XZ y la Y de THREE es la altura. Se
 * conserva tal cual. Pasarlo a XY obligaría a reescribir la proyección de
 * entidades, el shader instanciado de los INSERT, el minimapa, el plano de
 * picking, las sombras y el espacio papel, sin ninguna ganancia visible: una
 * cámara ortográfica proyecta XZ perfectamente.
 *
 * ## La orientación del plano
 *
 * `up = (0, 0, −1)` hace que la pantalla-arriba mire a −Z. Como la Y del dibujo
 * mapea a +Z, eso deja la +Y del dibujo hacia ABAJO en pantalla, que es
 * exactamente lo que hace hoy la cámara en perspectiva colocada en
 * `(tx, d, tz + 0.01)`. Reproducirlo es deliberado: voltear el plano a la
 * convención de AutoCAD invierte cada golden que hace clic en una coordenada, y
 * merece su propio cambio.
 */
import * as THREE from "three";
import type { CadBounds } from "../entity-runtime";
import type { CadPoint2 } from "../cad-document";
import { cadWorldToleranceFromView } from "../precision-tracking";
import {
  cadViewBounds,
  cadViewFromViewport,
  cadViewScreenToWorld,
  cadViewToleranceWorld,
  cadViewWorldToScreen,
  clampPixelsPerUnit,
  type CadView,
} from "./cad-view";

export interface CadDrawingTransform {
  /** Unidades de escena por unidad de dibujo (`s` en el editor). */
  scale: number;
  /** Huella del dibujo (`W` y `H`), que fija el origen del mapeo. */
  width: number;
  height: number;
}

/** Altura a la que se sitúa la cámara ortográfica sobre el plano del dibujo. */
const ORTHO_ELEVATION = 1000;

export class CadViewController {
  readonly perspective: THREE.PerspectiveCamera;
  readonly orthographic: THREE.OrthographicCamera;

  private transform: CadDrawingTransform;
  private current: CadView;
  private listeners = new Set<() => void>();
  // Reutilizados en el camino 3D: `screenToWorld` corre en CADA pointermove, y
  // asignar un rayo, un plano y un vector por evento es basura que el
  // recolector acaba pagando en mitad de un arrastre.
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  /**
   * Último objetivo conocido de OrbitControls. El camino 3D lo necesita para
   * reproducir EXACTAMENTE la tolerancia que el editor calculaba antes: en
   * perspectiva depende de la distancia de cámara, y aproximarla habría cambiado
   * el comportamiento de una decena de goldens que corren en 3D.
   */
  private readonly perspectiveTarget = new THREE.Vector3();

  constructor(
    transform: CadDrawingTransform,
    widthPx: number,
    heightPx: number,
    perspective?: THREE.PerspectiveCamera,
  ) {
    this.transform = transform;
    this.perspective =
      perspective ?? new THREE.PerspectiveCamera(50, widthPx / Math.max(1, heightPx), 0.1, 4000);
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.orthographic.up.set(0, 0, -1);
    this.current = cadViewFromViewport(
      widthPx,
      heightPx,
      transform.width / 2,
      transform.height / 2,
      // Arranca encuadrando la huella completa; `setView` lo afinará enseguida.
      Math.min(widthPx / Math.max(1, transform.width), heightPx / Math.max(1, transform.height)),
    );
    this.applyOrthographic();
  }

  get mode(): "2d" | "3d" {
    return this.current.mode;
  }

  get camera(): THREE.Camera {
    return this.current.mode === "2d" ? this.orthographic : this.perspective;
  }

  /** Instantánea inmutable del estado de vista. */
  get view(): CadView {
    return this.current;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  setMode(mode: "2d" | "3d"): void {
    if (this.current.mode === mode) return;
    this.current = { ...this.current, mode };
    if (mode === "2d") this.applyOrthographic();
    this.emit();
  }

  setView(next: CadView): void {
    this.current = { ...next, pixelsPerUnit: clampPixelsPerUnit(next.pixelsPerUnit) };
    if (this.current.mode === "2d") this.applyOrthographic();
    this.emit();
  }

  setViewportSize(widthPx: number, heightPx: number): void {
    if (widthPx === this.current.widthPx && heightPx === this.current.heightPx) return;
    this.current = { ...this.current, widthPx, heightPx };
    this.perspective.aspect = widthPx / Math.max(1, heightPx);
    this.perspective.updateProjectionMatrix();
    if (this.current.mode === "2d") this.applyOrthographic();
    this.emit();
  }

  setDrawingTransform(transform: CadDrawingTransform): void {
    this.transform = transform;
    if (this.current.mode === "2d") this.applyOrthographic();
  }

  /**
   * Adopta el encuadre que tiene ahora mismo la cámara en perspectiva.
   *
   * OrbitControls sigue siendo el dispositivo de entrada del editor: arrastrar
   * mueve su objetivo, la rueda cambia su distancia. De ahí se deriva la vista
   * ortográfica —el objetivo da el centro; la distancia y el FOV dan la altura
   * de escena visible y con ella `pixelsPerUnit`— para que cambiar de cámara
   * conserve el encuadre en vez de dar un salto.
   *
   * Vive aquí y no en el editor porque es aritmética de vista, y porque cuando
   * lleguen los controles 2D propios este método desaparece de un solo sitio.
   */
  adoptPerspectiveFraming(target: THREE.Vector3, widthPx: number, heightPx: number): void {
    this.perspectiveTarget.copy(target);
    const visibleSceneHeight =
      2 *
      this.perspective.position.distanceTo(target) *
      Math.tan((this.perspective.fov * Math.PI) / 360);
    this.setViewportSize(widthPx, heightPx);
    this.setView({
      ...this.current,
      centerX: target.x / this.transform.scale + this.transform.width / 2,
      centerY: target.z / this.transform.scale + this.transform.height / 2,
      pixelsPerUnit:
        visibleSceneHeight > 0
          ? (heightPx * this.transform.scale) / visibleSceneHeight
          : this.current.pixelsPerUnit,
    });
  }

  /** Unidades de escena por píxel de pantalla — para `Raycaster.params.Line`. */
  sceneUnitsPerPixel(): number {
    return this.transform.scale / this.current.pixelsPerUnit;
  }

  private scenePoint(point: CadPoint2): { x: number; z: number } {
    return {
      x: (point.x - this.transform.width / 2) * this.transform.scale,
      z: (point.y - this.transform.height / 2) * this.transform.scale,
    };
  }

  private applyOrthographic(): void {
    const { scale } = this.transform;
    const view = this.current;
    // Media anchura y altura visibles, en unidades de ESCENA. `pixelsPerUnit`
    // está en píxeles por unidad de DIBUJO, así que hay que pasar por `scale`.
    const halfWidth = ((view.widthPx / 2) * scale) / view.pixelsPerUnit;
    const halfHeight = ((view.heightPx / 2) * scale) / view.pixelsPerUnit;
    const centre = this.scenePoint({ x: view.centerX, y: view.centerY });
    const camera = this.orthographic;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    // El volteo vertical se hace INTERCAMBIANDO `top` y `bottom`, no cambiando
    // `up`. Con la cámara mirando hacia abajo, pedir que la pantalla-arriba sea
    // +Z fuerza que la pantalla-derecha sea −X: es handedness, no un descuido.
    // Intercambiar el frustum niega la escala en Y de la matriz de proyección y
    // deja la X intacta, que es justo lo que se busca.
    //
    // Efecto colateral conocido: con el frustum invertido se invierte también el
    // sentido de giro de las caras. Sólo importaría para mallas sólidas con
    // descarte de caras traseras, que hoy viven exclusivamente en el modo 3D.
    const flipped = view.yScreenSign === -1;
    camera.top = flipped ? -halfHeight : halfHeight;
    camera.bottom = flipped ? halfHeight : -halfHeight;
    // Un rango de profundidad generoso y simétrico: nunca recorta, y deja sitio
    // para codificar el orden de dibujo en Z cuando llegue el renderizador por
    // lotes.
    const depth = Math.max(halfWidth, halfHeight) * 8 + ORTHO_ELEVATION * 4;
    camera.near = -depth;
    camera.far = depth;
    camera.position.set(centre.x, ORTHO_ELEVATION, centre.z);
    // Constante: la pantalla-derecha es siempre +X. La orientación vertical la
    // decide el frustum, arriba.
    camera.up.set(0, 0, -1);
    camera.lookAt(centre.x, 0, centre.z);
    if (view.twistDeg) camera.rotateZ((-view.twistDeg * Math.PI) / 180);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
  }

  /**
   * Punto de dibujo bajo un píxel del lienzo.
   *
   * En 2D es aritmética exacta y no toca THREE. En 3D no hay forma cerrada: hay
   * que lanzar un rayo contra el plano del suelo, que es lo que se hace.
   */
  screenToWorld(offsetX: number, offsetY: number): CadPoint2 | null {
    if (this.current.mode === "2d") return cadViewScreenToWorld(this.current, offsetX, offsetY);
    const view = this.current;
    if (!(view.widthPx > 0) || !(view.heightPx > 0)) return null;
    this.ndc.set((offsetX / view.widthPx) * 2 - 1, -(offsetY / view.heightPx) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.perspective);
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hit)) return null;
    return {
      x: this.hit.x / this.transform.scale + this.transform.width / 2,
      y: this.hit.z / this.transform.scale + this.transform.height / 2,
    };
  }

  worldToScreen(point: CadPoint2): CadPoint2 {
    if (this.current.mode === "2d") return cadViewWorldToScreen(this.current, point);
    const scene = this.scenePoint(point);
    const projected = new THREE.Vector3(scene.x, 0, scene.z).project(this.perspective);
    return {
      x: ((projected.x + 1) / 2) * this.current.widthPx,
      y: ((1 - projected.y) / 2) * this.current.heightPx,
    };
  }

  /** Tolerancia en unidades de dibujo de una apertura en píxeles. */
  toleranceWorld(aperturePx: number, min = 0, max = Number.POSITIVE_INFINITY): number {
    if (this.current.mode === "2d")
      return Math.min(max, Math.max(min, cadViewToleranceWorld(this.current, aperturePx)));
    // En 3D se conserva la fórmula histórica, byte a byte: la relación
    // píxel↔mundo no es constante bajo perspectiva y una aproximación distinta
    // movería el punto imantado en todos los goldens, que corren en 3D.
    return cadWorldToleranceFromView({
      cameraDistance: this.perspective.position.distanceTo(this.perspectiveTarget),
      verticalFovDeg: this.perspective.fov,
      viewportHeightPx: this.current.heightPx,
      drawingToSceneScale: this.transform.scale,
      aperturePx,
      min,
      max,
    });
  }

  viewportBounds(overscanRatio = 0.12): CadBounds | null {
    if (!(this.current.widthPx > 0) || !(this.current.heightPx > 0)) return null;
    if (this.current.mode === "2d") return cadViewBounds(this.current, overscanRatio);
    // Bajo perspectiva la huella visible es un trapecio: no hay forma cerrada y
    // hay que sondear con rayos. Cuatro esquinas y el centro bastan.
    const probes: CadPoint2[] = [];
    for (const [fx, fy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5],
    ] as const) {
      const point = this.screenToWorld(fx * this.current.widthPx, fy * this.current.heightPx);
      if (point) probes.push(point);
    }
    if (probes.length < 3) return null;
    const xs = probes.map((point) => point.x);
    const ys = probes.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const overscan = Math.max(0, overscanRatio);
    const paddingX = overscan === 0 ? 0 : Math.max(1, (maxX - minX) * overscan);
    const paddingY = overscan === 0 ? 0 : Math.max(1, (maxY - minY) * overscan);
    return {
      minX: minX - paddingX,
      minY: minY - paddingY,
      maxX: maxX + paddingX,
      maxY: maxY + paddingY,
    };
  }
}
