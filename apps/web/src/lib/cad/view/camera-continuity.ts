/**
 * Continuidad de cámara entre montajes del visor 3D.
 *
 * El efecto que monta la escena Three.js de `Layout3DEditor` se re-ejecuta
 * cada vez que cambia `data` — también tras un autosave que sólo confirma la
 * versión CAS, sin ningún cambio real del plano. Sin este módulo, cada
 * re-montaje creaba una `PerspectiveCamera` y unos `OrbitControls` nuevos con
 * la posición y el target por defecto: el usuario perdía su encuadre por el
 * simple hecho de que el documento se hubiera guardado.
 *
 * La regla es conservadora a propósito: se conserva la ÚLTIMA cámara conocida
 * en cualquier re-montaje salvo el primero. No compara el footprint del
 * documento porque el mismo componente montado no cambia de documento sin
 * desmontarse — lo hace por `key`, que ya reinicia esta referencia — así que
 * cualquier re-montaje dentro de la misma sesión de edición es, para quien
 * mira la pantalla, la MISMA vista que ya tenía.
 */

/** Snapshot plano de una cámara: ni `THREE.Vector3` ni ninguna clase con ciclo de vida propio. */
export interface CadCameraSnapshot {
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

/** Copia posición y target a un objeto plano, aceptando cualquier cosa con `x/y/z`. */
export function snapshotCadCamera(
  position: { readonly x: number; readonly y: number; readonly z: number },
  target: { readonly x: number; readonly y: number; readonly z: number },
): CadCameraSnapshot {
  return {
    position: { x: position.x, y: position.y, z: position.z },
    target: { x: target.x, y: target.y, z: target.z },
  };
}
