import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CAD_TOUCH_ONE_FINGER_IDLE } from "./touch-gestures";

/**
 * Qué gesto maneja la cámara en cada modo de vista.
 *
 * ## Por qué es una función y no dos bloques copiados
 *
 * Estaba escrito DOS veces dentro del monolito —al cambiar de modo y al aplicar
 * un modo desde una vista guardada— y las dos copias tenían que decir lo mismo.
 * Una regla de entrada duplicada es una regla que un día se contradice a sí
 * misma: basta con que alguien arregle el paneo en un sitio.
 *
 * ## La regla que cambia aquí, y por qué
 *
 * En modo PLANO, **un dedo ya no panea**. Estaba medido en
 * `docs/cad/evidence/touch-support.json`: un arrastre de un dedo sobre el fondo
 * movía la cámara 89-95 px, y eso tiene dos consecuencias caras en una tableta.
 * La primera es que designar por ventana con el dedo era imposible. La segunda,
 * peor: apuntar un punto con el dedo obliga a deslizar —no hay hover, así que
 * no hay otra forma de ver a dónde va a caer—, y ese deslizamiento arrastraba
 * el plano justo debajo del dedo que intentaba precisarlo.
 *
 * El reparto que queda es el universal, el que trae puesto cualquiera que haya
 * usado un mapa: **un dedo designa y arrastra, dos dedos son la cámara**
 * (paneo y pellizco, que OrbitControls ya resolvía y la sonda midió vivos).
 *
 * En modo 3D un dedo SIGUE orbitando MIENTRAS NO HAYA UN COMANDO ACTIVO. Esa
 * frase antes terminaba en «ahí no se dibuja: es un visor», y era verdad hasta
 * que `pick3d/` hizo posible designar una cara. Ahora el modo 3D sí dibuja: con
 * un comando esperando designación, un dedo designa y el botón izquierdo
 * también, y la órbita se muda al derecho y a los dos dedos. Sin comando, todo
 * se comporta como antes — el gesto que la gente ya tiene no se toca por una
 * capacidad que sólo aparece a ratos.
 *
 * El ratón: en plano su botón izquierdo panea salvo que el editor abra una
 * ventana de selección (`background-drag-policy.ts`, que desactiva los
 * controles en el `pointerdown`); el central encuadra en los dos modos.
 *
 * ── SE APLICA TAMBIÉN AL CREAR LOS CONTROLES, no sólo al conmutar de modo ──
 *
 * Durante un tiempo no fue así y no se notaba: el estudio abría siempre en 3D y
 * el valor que el editor escribía a mano —`maxPolarAngle = Math.PI / 2.05`—
 * coincidía por casualidad con lo que esta política pone para 3D. Al pasar el
 * defecto a planta, el modo decía «2D», el render SÍ era ortográfico (el
 * controlador de vista arranca así) y en cambio el ratón seguía configurado
 * para orbitar: `enableRotate` activo y botón izquierdo en ROTATE, o sea el
 * paneo —el gesto primario de un CAD de planos— muerto nada más abrir.
 *
 * La lección: una política que sólo se aplica en las TRANSICIONES deja el
 * estado inicial a merced de que alguien haya copiado sus valores a mano.
 */
export function applyCadCameraPolicy(
  controls: OrbitControls,
  mode: "2d" | "3d",
  /**
   * ¿Hay un comando del motor esperando una designación?
   *
   * Es el interruptor que hace que el modo 3D deje de ser un visor. Sin
   * comando activo todo se comporta como siempre —el botón izquierdo orbita, y
   * ese gesto la gente ya lo tiene en los dedos—; CON un comando activo el
   * izquierdo DESIGNA y la órbita se va al derecho, que es exactamente lo que
   * hace AutoCAD y lo que PRESSPULL sobre cara necesita para existir.
   *
   * Opcional y `false` por defecto a propósito: los tres sitios que ya llamaban
   * a esta política siguen valiendo sin tocarse, y quien quiera el modo de
   * designación tiene que pedirlo.
   */
  pickingActive = false,
): void {
  const plan = mode === "2d";
  controls.minPolarAngle = 0;
  // En plano la cámara queda clavada mirando hacia abajo; en 3D se le deja
  // todo el hemisferio menos el rasante, que degenera la matriz de vista.
  controls.maxPolarAngle = plan ? 0.05 : Math.PI / 2.05;
  controls.enableRotate = !plan;
  // El botón central ENCUADRA en los dos modos, como en AutoCAD. OrbitControls
  // lo trae en DOLLY de fábrica (medido con tsx sobre three 0.185.1: MIDDLE
  // = DOLLY en 2D y 3D), así que la rueda hacía zoom dos veces y encuadrar
  // con el central era imposible. Va ANTES del bloque de designación para que
  // valga también con un comando abierto.
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;

  if (!plan && pickingActive) {
    // El izquierdo deja de mover la cámara para que el clic llegue al motor:
    // OrbitControls no consume el evento, pero SÍ arrastra la vista mientras se
    // pulsa, y designar una cara mientras el modelo gira debajo es imposible.
    // La órbita no se pierde, se muda al derecho — y el enrutador ya devuelve
    // `true` sin tocar nada para `event.button === 2`, así que no se pisan.
    controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    // Con el dedo, la designación necesita el mismo trato: un dedo designa y
    // dos siguen siendo la cámara, igual que en plano.
    controls.touches.ONE = CAD_TOUCH_ONE_FINGER_IDLE as unknown as THREE.TOUCH;
    return;
  }

  controls.mouseButtons.LEFT = plan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  // Sin comando activo el derecho vuelve a su papel de siempre: el enrutador lo
  // usa para el menú contextual y para valer por Enter, y dejarlo orbitando
  // rompería los dos.
  controls.mouseButtons.RIGHT = null as unknown as THREE.MOUSE;
  controls.touches.ONE = plan
    ? (CAD_TOUCH_ONE_FINGER_IDLE as unknown as THREE.TOUCH)
    : THREE.TOUCH.ROTATE;
}

/** Contexto mundo↔escena que deriva de la huella: escala y medio lienzo lógico. */
export interface CadSceneContext {
  s: number;
  W: number;
  H: number;
}

/** Punto o target de cámara, plano — ver `lib/cad/view/camera-continuity.ts`. */
export interface CadCameraPose {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/**
 * Encuadre de cámara para una huella dada: la última cámara conocida si hay
 * una (`restore`), o el encuadre por defecto si no.
 *
 * Vive fuera del ciclo de vida de la escena (`Layout3DEditor.tsx`) para poder
 * volver a llamarse en un cambio REAL de huella (un footprint distinto, no un
 * `data` que cambió de referencia por autosave) sin tumbar renderer, workers
 * ni el resto de anfitriones montados. `restore` es lo que permite además que
 * un remontaje conserve el encuadre del usuario en vez de reiniciarlo.
 */
export function applyInitialCameraFraming(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  footprintW: number,
  footprintH: number,
  restore?: CadCameraPose | null,
): CadSceneContext {
  const W = footprintW || 1;
  const H = footprintH || 1;
  const s = 30 / Math.max(W, H);
  const position = restore?.position ?? {
    x: W * s * 0.45,
    y: Math.max(W, H) * s * 0.8,
    z: H * s * 1.0 + 10,
  };
  const target = restore?.target ?? { x: 0, y: 0, z: 0 };
  camera.position.set(position.x, position.y, position.z);
  controls.target.set(target.x, target.y, target.z);
  controls.update();
  return { s, W, H };
}
