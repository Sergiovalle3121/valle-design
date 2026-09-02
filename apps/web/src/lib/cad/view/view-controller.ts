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
import type { CadPoint2, CadPoint3 } from "../cad-document";
import { isCadWorldUcs, type CadNamedUcs } from "../ucs";
import { cadRayPlanePoint } from "../infer/inference-engine";
import { cadSceneRayToDrawing } from "../pick3d/scene-ray";

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
import {
  orbitCameraPosition,
  orbitStateFromPosition,
  orbitStep,
  type CadOrbitState,
} from "./visual-styles";
import {
  cadStandardView,
  freeOrbitFromCamera,
  freeOrbitStep,
  type CadFreeOrbitState,
  type CadStandardView,
  type CadStandardViewId,
  type CadVec3,
} from "./view-3d";
import type { CadProjectedPoint, CadSolidSnapProjector } from "./solid-snap";

/**
 * Un punto de dibujo que PUEDE traer cota.
 *
 * Bajo el SCU universal no la trae, y eso es deliberado, no un olvido: los
 * comandos espaciales pasan el objeto del punto tal cual a la entidad que
 * escriben, así que añadir `z: 0` a cada punto del ratón cambiaría los bytes de
 * todo documento dibujado a mano. Con un SCU inclinado la cota SÍ viene, porque
 * ahí es el dato que distingue un trazo sobre la fachada de un trazo en el
 * suelo.
 *
 * El tipo lo dice en voz alta a propósito. La alternativa —devolver `CadPoint2`
 * y colar la `z` por tipado estructural— es exactamente el mecanismo por el que
 * `LINE` era «espacial» sin que nadie lo hubiera decidido.
 */
export type CadDrawingPoint = CadPoint2 | CadPoint3;

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

  /**
   * Contador de cambios de vista.
   *
   * Sirve para lo que una suscripción no resuelve bien: saber, DENTRO de una
   * consulta, si la caché que uno tiene sigue valiendo. El índice de enganche 3D
   * guarda la proyección de miles de puntos y sólo necesita rehacerla cuando la
   * cámara se ha movido; comparar un entero es más barato que suscribirse y
   * mantener una bandera, y no puede desincronizarse.
   */
  get revision(): number {
    return this.changes;
  }

  private changes = 0;

  private emit(): void {
    this.changes += 1;
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

  /**
   * 3DORBIT: gira la cámara en perspectiva alrededor de su objetivo.
   *
   * La aritmética vive en `visual-styles.ts` y es pura; aquí sólo se aplica a la
   * cámara. Dos cosas que este método hace y que un `camera.position.set` suelto
   * no haría:
   *
   *  · Acota la elevación por debajo del polo. Con la cámara mirando exactamente
   *    a lo largo de su propio `up`, la base de la matriz de vista se degenera y
   *    THREE produce `NaN`: la escena DESAPARECE al arrastrar hasta arriba del
   *    todo. No es un caso raro, es el final natural de cualquier arrastre largo.
   *  · Conserva la DISTANCIA. Orbitar es girar, no acercarse; mezclarlo con el
   *    zoom convierte cada giro en un salto de escala.
   *
   * Devuelve el estado resultante para que quien lo llame pueda enseñarlo.
   */
  orbitPerspective(deltaAzimuthDeg: number, deltaElevationDeg: number): CadOrbitState {
    const target = this.perspectiveTarget;
    const next = orbitStep(
      orbitStateFromPosition(target, this.perspective.position),
      deltaAzimuthDeg,
      deltaElevationDeg,
    );
    const position = orbitCameraPosition(target, next);
    this.perspective.position.set(position.x, position.y, position.z);
    this.perspective.up.set(0, 1, 0);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.emit();
    return next;
  }

  /** Objetivo actual de la órbita, en unidades de ESCENA. */
  get orbitTarget(): THREE.Vector3 {
    return this.perspectiveTarget.clone();
  }

  /** Estado de órbita RESTRINGIDA que reproduce la cámara actual. */
  get orbitState(): CadOrbitState {
    return orbitStateFromPosition(this.perspectiveTarget, this.perspective.position);
  }

  /**
   * 3DFORBIT: órbita LIBRE, sin vertical del mundo que respetar.
   *
   * La diferencia con `orbitPerspective` no es de grado: la restringida acota la
   * elevación a ±89,9° porque su parametrización se degenera en el polo, y ésta
   * no tiene polo que degenerar — gira alrededor de los ejes de la propia cámara
   * y arrastra el `up` consigo, así que pasar por encima del cenit es un paso
   * más. El precio es que el horizonte se inclina, que es exactamente lo que
   * 3DFORBIT ofrece y 3DORBIT niega.
   */
  orbitFreePerspective(
    deltaAzimuthDeg: number,
    deltaElevationDeg: number,
    deltaRollDeg = 0,
  ): CadFreeOrbitState | null {
    const target = this.perspectiveTarget;
    const state = freeOrbitFromCamera(target, this.perspective.position, this.perspective.up);
    if (!state) return null;
    const next = freeOrbitStep(state, deltaAzimuthDeg, deltaElevationDeg, deltaRollDeg);
    this.perspective.position.set(
      target.x + next.offset.x,
      target.y + next.offset.y,
      target.z + next.offset.z,
    );
    this.perspective.up.set(next.up.x, next.up.y, next.up.z);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.emit();
    return next;
  }

  /**
   * VPOINT: coloca la cámara en un azimut y una elevación ABSOLUTOS.
   *
   * Absoluto y no incremental porque es lo que un guion necesita: «ponte a 315°
   * y 20°» no depende de dónde estuviera la cámara antes, y expresarlo como
   * incremento obligaría a leer el estado para calcular la diferencia.
   */
  setOrbit(azimuthDeg: number, elevationDeg: number): CadOrbitState {
    const target = this.perspectiveTarget;
    const distance = this.perspective.position.distanceTo(target) || 1;
    const next = orbitStep(
      { azimuthDeg: 0, elevationDeg: 0, distance },
      azimuthDeg,
      elevationDeg,
    );
    const position = orbitCameraPosition(target, next);
    this.perspective.position.set(position.x, position.y, position.z);
    this.perspective.up.set(0, 1, 0);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.emit();
    return next;
  }

  /**
   * 3DPAN tecleado: desplaza el objetivo por el plano del DIBUJO.
   *
   * Es la variante que se puede escribir. Arrastrar por el plano de la pantalla
   * (`panPerspective`) depende del encuadre; mover el objetivo tantas unidades
   * de dibujo al este y tantas al norte significa lo mismo mire la cámara donde
   * mire, que es lo que hace falta para que un guion sea reproducible.
   */
  panPerspectiveDrawing(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const shift = new THREE.Vector3(dx * this.transform.scale, 0, dy * this.transform.scale);
    this.perspective.position.add(shift);
    this.perspectiveTarget.add(shift);
    this.perspective.lookAt(this.perspectiveTarget);
    this.perspective.updateMatrixWorld();
    this.syncFromPerspective();
    this.emit();
  }

  /**
   * Salta a una de las diez vistas predefinidas conservando la DISTANCIA.
   *
   * No pasa por azimut/elevación a propósito: la vista SUPERIOR tiene elevación
   * 90° EXACTOS y ese valor está fuera del tope de la órbita restringida. Aquí
   * se usan los vectores declarados de la tabla, de modo que la planta pedida
   * por su nombre es la planta y no una planta con una décima de grado.
   */
  applyStandardView(id: CadStandardViewId): CadStandardView {
    const view = cadStandardView(id);
    const target = this.perspectiveTarget;
    const distance = this.perspective.position.distanceTo(target) || 1;
    this.perspective.position.set(
      target.x + view.offset.x * distance,
      target.y + view.offset.y * distance,
      target.z + view.offset.z * distance,
    );
    this.perspective.up.set(view.up.x, view.up.y, view.up.z);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.syncFromPerspective();
    this.emit();
    return view;
  }

  /**
   * 3DPAN: arrastra la escena moviendo cámara Y objetivo a la vez.
   *
   * Mover sólo la cámara sería orbitar, no panear. El desplazamiento llega en
   * PÍXELES y se convierte aquí porque cuánto mundo cubre un píxel depende de la
   * distancia de cámara, que sólo se conoce en este lado.
   */
  panPerspective(deltaXPx: number, deltaYPx: number): void {
    if (!Number.isFinite(deltaXPx) || !Number.isFinite(deltaYPx)) return;
    const target = this.perspectiveTarget;
    const distance = this.perspective.position.distanceTo(target) || 1;
    const height = this.current.heightPx || 1;
    const sceneUnitsPerPixel =
      (2 * distance * Math.tan((this.perspective.fov * Math.PI) / 360)) / height;
    this.perspective.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.perspective.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.perspective.matrixWorld, 1);
    // El signo: arrastrar el dibujo hacia la derecha mueve la cámara hacia la
    // izquierda, y la Y de pantalla crece hacia abajo.
    const shift = right
      .multiplyScalar(-deltaXPx * sceneUnitsPerPixel)
      .add(up.multiplyScalar(deltaYPx * sceneUnitsPerPixel));
    this.perspective.position.add(shift);
    target.add(shift);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.syncFromPerspective();
    this.emit();
  }

  /**
   * 3DZOOM: travelín. `factor > 1` acerca.
   *
   * Es un cambio de DISTANCIA y no de campo de visión: tocar el FOV cambiaría la
   * perspectiva de la pieza —las fugas se abren o se cierran— y eso no es hacer
   * zoom, es cambiar de objetivo fotográfico.
   */
  zoomPerspective(factor: number): void {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    const target = this.perspectiveTarget;
    const offset = this.perspective.position.clone().sub(target);
    const length = offset.length();
    if (!(length > 0)) return;
    offset.multiplyScalar(1 / factor);
    this.perspective.position.copy(target).add(offset);
    this.perspective.lookAt(target);
    this.perspective.updateMatrixWorld();
    this.syncFromPerspective();
    this.emit();
  }

  /**
   * Reajusta la vista 2D a lo que encuadra ahora la cámara en perspectiva.
   *
   * Es la mitad de `adoptPerspectiveFraming` que NO toca el objetivo: aquí el
   * objetivo lo acaba de mover el propio comando, y volver a leerlo de fuera
   * pisaría el movimiento. Sin esto, panear en 3D y volver a 2D devolvería el
   * encuadre anterior, que es un salto que el usuario no ha pedido.
   */
  private syncFromPerspective(): void {
    const target = this.perspectiveTarget;
    const visibleSceneHeight =
      2 *
      this.perspective.position.distanceTo(target) *
      Math.tan((this.perspective.fov * Math.PI) / 360);
    this.current = {
      ...this.current,
      centerX: target.x / this.transform.scale + this.transform.width / 2,
      centerY: target.z / this.transform.scale + this.transform.height / 2,
      pixelsPerUnit: clampPixelsPerUnit(
        visibleSceneHeight > 0
          ? (this.current.heightPx * this.transform.scale) / visibleSceneHeight
          : this.current.pixelsPerUnit,
      ),
    };
    if (this.current.mode === "2d") this.applyOrthographic();
  }

  /**
   * Ojo de la cámara en coordenadas de DIBUJO, con cota.
   *
   * Lo pide la eliminación de líneas ocultas, que razona sobre las normales del
   * sólido —que están en coordenadas de dibujo— y no sabe nada del mapeo de
   * escena. Devolverlo ya convertido evita que ese módulo tenga que conocer la
   * permutación de ejes, que es de aquí.
   */
  eyeDrawingPoint(): CadVec3 {
    const camera = this.camera;
    const position = camera.position;
    const { scale, width, height } = this.transform;
    return {
      x: position.x / scale + width / 2,
      y: position.z / scale + height / 2,
      z: position.y / scale,
    };
  }

  /** Dirección de MIRADA (del ojo hacia la escena) en coordenadas de dibujo. */
  viewDirectionDrawing(): CadVec3 {
    const camera = this.camera;
    camera.updateMatrixWorld();
    const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate();
    // Permutación de ejes escena→dibujo: la Y de escena es la z del dibujo.
    const direction = { x: forward.x, y: forward.z, z: forward.y };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    return length > 0
      ? { x: direction.x / length, y: direction.y / length, z: direction.z / length }
      : { x: 0, y: 0, z: -1 };
  }

  /**
   * Proyector de puntos de dibujo a píxeles del lienzo, con su divisor
   * homogéneo.
   *
   * Es una FÁBRICA y no un método por punto porque invertir la matriz de la
   * cámara cuesta, y el índice de enganche 3D proyecta miles de puntos de una
   * tacada: hacerlo una vez por cámara en vez de una vez por punto es la
   * diferencia entre una proyección que cabe en un cuadro y una que no.
   */
  createDrawingProjector(): CadSolidSnapProjector {
    const camera = this.camera;
    camera.updateMatrixWorld();
    const view = new THREE.Matrix4().copy(camera.matrixWorld).invert();
    const projection = camera.projectionMatrix.clone();
    const perspective = camera === this.perspective;
    const { scale, width, height } = this.transform;
    const widthPx = this.current.widthPx;
    const heightPx = this.current.heightPx;
    const point = new THREE.Vector3();
    return (drawing): CadProjectedPoint | null => {
      point.set((drawing.x - width / 2) * scale, drawing.z * scale, (drawing.y - height / 2) * scale);
      point.applyMatrix4(view);
      // El divisor homogéneo bajo perspectiva es la profundidad en espacio de
      // vista. Se comprueba ANTES de proyectar: un punto detrás de la cámara
      // sale al otro lado de la pantalla con el signo cambiado, y proyectarlo
      // produce un enganche fantasma en la esquina opuesta.
      const w = perspective ? -point.z : 1;
      if (perspective && !(w > 1e-6)) return null;
      point.applyMatrix4(projection);
      return {
        x: ((point.x + 1) / 2) * widthPx,
        y: ((1 - point.y) / 2) * heightPx,
        w,
      };
    };
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
   * que lanzar un rayo contra el PLANO DE TRABAJO, que es lo que se hace.
   *
   * ## Por qué esto no era así, y qué costaba
   *
   * Hasta ahora el rayo se cruzaba siempre contra el plano del SUELO, escrito a
   * fuego. Con un SCU apoyado en una fachada, eso significaba que un arquitecto
   * dibujaba una línea con dos clics **sobre la fachada** y el trazo aparecía en
   * el suelo, sin aviso: medido en el navegador con el SCU en `(6000, 7500,
   * 1500)` y eje Z `(0,1,0)`, la línea guardada salía
   * `{start:{x:6000,y:5000,z:0}, end:{x:5613.69,y:7500,z:0}}` — el primer punto
   * es el centro de la huella en el suelo, ni siquiera está sobre el sólido.
   *
   * Y era peor de lo que parece. El motor FALLA EN CERRADO ante un SCU
   * inclinado para los comandos que no se declaran `spatial`
   * (`command-engine.ts`), así que a casi todos les habría dicho que no. Pero
   * `LINE` sí se declara espacial —conserva la cota del punto que recibe—, de
   * modo que aceptaba de buena fe un punto que venía del suelo. El único
   * comando que sabía dibujar fuera del plano era el único capaz de producir
   * geometría equivocada en silencio.
   *
   * ## El SCU universal no cambia ni un bit
   *
   * El camino de siempre se conserva TAL CUAL para el SCU universal, y no por
   * prudencia difusa: `intersectPlane` de THREE y `cadRayPlanePoint` resuelven
   * la misma intersección con aritmética distinta, y una diferencia en el
   * último bit movería el punto imantado en los goldens, que corren en 3D. El
   * 99 % del trabajo es el SCU universal; ese camino queda intacto por
   * construcción, no por un ajuste de tolerancia.
   *
   * Tampoco se le añade `z: 0` al punto del caso universal, aunque sería cierto:
   * los comandos espaciales pasan el objeto del punto TAL CUAL a la entidad, así
   * que una `z` de más cambiaría los bytes de todo documento dibujado a mano.
   * La cota aparece sólo cuando hay cota que dar.
   */
  screenToWorld(
    offsetX: number,
    offsetY: number,
    plane?: CadNamedUcs,
  ): CadDrawingPoint | null {
    if (this.current.mode === "2d") return cadViewScreenToWorld(this.current, offsetX, offsetY);
    const view = this.current;
    if (!(view.widthPx > 0) || !(view.heightPx > 0)) return null;
    this.ndc.set((offsetX / view.widthPx) * 2 - 1, -(offsetY / view.heightPx) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.perspective);
    if (plane && !isCadWorldUcs(plane)) {
      // El rayo de la ESCENA pasa a coordenadas de DIBUJO —el eje Y del dibujo
      // es el Z de la escena y su Z es el Y— con el módulo que ya existe para
      // designar caras, en vez de repetir aquí esa conversión. El SCU vive en
      // coordenadas de dibujo, así que la intersección se resuelve ahí.
      const rayo = cadSceneRayToDrawing(
        {
          origin: this.raycaster.ray.origin,
          direction: this.raycaster.ray.direction,
        },
        { s: this.transform.scale, W: this.transform.width, H: this.transform.height },
      );
      // `null` cuando el rayo es paralelo al plano de trabajo o el plano queda a
      // la espalda de la cámara. Devolverlo es lo correcto: un punto inventado
      // ahí caería a kilómetros de donde el usuario está mirando.
      return cadRayPlanePoint(rayo, plane);
    }
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
