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
 * En modo 3D un dedo SIGUE orbitando. Ahí no se dibuja: es un visor, y girar
 * con un dedo es también el gesto universal en ese contexto.
 *
 * El ratón no se toca: en plano su botón izquierdo panea como siempre.
 */
export function applyCadCameraPolicy(controls: OrbitControls, mode: "2d" | "3d"): void {
  const plan = mode === "2d";
  controls.minPolarAngle = 0;
  // En plano la cámara queda clavada mirando hacia abajo; en 3D se le deja
  // todo el hemisferio menos el rasante, que degenera la matriz de vista.
  controls.maxPolarAngle = plan ? 0.05 : Math.PI / 2.05;
  controls.enableRotate = !plan;
  controls.mouseButtons.LEFT = plan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = plan
    ? (CAD_TOUCH_ONE_FINGER_IDLE as unknown as THREE.TOUCH)
    : THREE.TOUCH.ROTATE;
}
