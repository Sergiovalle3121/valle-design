/**
 * La niebla de la escena, y por qué en PLANTA no puede existir.
 *
 * ## El defecto, con los dos números que lo demuestran
 *
 * La escena nace con `THREE.Fog(color, max(W,H)·s·1.4, max(W,H)·s·3.4)`. Como
 * la escala vale `s = 30 / max(W,H)`, ese par es SIEMPRE (42, 102) sea cual sea
 * la huella, y el color de la niebla es el MISMO que el del fondo.
 *
 * La vista 2D no la dibuja la cámara en perspectiva sino la ortográfica de
 * `view-controller.ts`, y ésa se coloca a `ORTHO_ELEVATION` sobre el plano:
 * 1000 unidades de escena. En una cámara ortográfica la niebla se evalúa con la
 * profundidad en vista, así que la profundidad de TODO lo que se dibuja en
 * planta es ~1000 — casi diez veces el borde lejano de la niebla.
 *
 * Consecuencia medida el 2026-09-22 en producción: el factor de niebla satura a
 * 1 y cada fragmento sale pintado con el color de la niebla, que es exactamente
 * el color del fondo. No es que no se dibuje: se dibuja INVISIBLE. Por eso la
 * banda elástica no aparecía nunca (`LineBasicMaterial` trae `fog: true` por
 * defecto), por eso la rejilla no se veía en planta, y por eso la geometría por
 * lotes SÍ se veía: su `ShaderMaterial` propio no tiene niebla y se libraba.
 *
 * ## Qué hace este módulo
 *
 * La niebla es atmósfera del recorrido en 3D, donde la cámara está a treinta
 * unidades del suelo y el desvanecido significa algo. En planta no significa
 * nada: un plano no tiene lejanía. Así que la niebla se enciende en 3D y se
 * apaga en 2D, en un solo sitio, y el color se recuerda en la escena para que
 * volver al 3D no pierda el tema elegido.
 */
import * as THREE from "three";

/** Color de reserva: el del tema oscuro, el de fábrica. */
const CAD_FOG_FALLBACK = 0x0a0f1e;
/** Dónde recuerda la escena el color de niebla del tema mientras está apagada. */
const CAD_FOG_COLOR_KEY = "cadFogColor";

/**
 * Fija el color de niebla del tema. Lo guarda SIEMPRE en la escena —aunque
 * ahora mismo no haya niebla, porque se está en planta— para que al volver al
 * 3D la niebla renazca con el color del tema y no con el de fábrica.
 */
export function setCadSceneFogColor(scene: THREE.Scene, color: number): void {
  scene.userData[CAD_FOG_COLOR_KEY] = color;
  if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(color);
}

/**
 * La huella del dibujo (`W` × `H`, en unidades de dibujo) y la escala de
 * escena (`s`). Son los mismos tres números que el editor guarda en `ctxRef`,
 * con sus mismos nombres, para que llamar a esta función no obligue a
 * traducirlos en cada sitio.
 */
export interface CadSceneFootprint {
  readonly W: number;
  readonly H: number;
  readonly s: number;
}

/**
 * Enciende la niebla en 3D y la apaga en 2D. Admite nulos porque los dos
 * llamadores la piden desde refs que pueden no estar montadas todavía.
 */
export function applyCadSceneFog(
  scene: THREE.Scene | null,
  mode: "2d" | "3d",
  footprint: CadSceneFootprint | null,
): void {
  if (!scene || !footprint) return;
  if (mode !== "3d") {
    // En planta la cámara mira desde 1000 unidades: cualquier niebla pinta la
    // escena entera del color del fondo. Apagarla es la diferencia entre ver lo
    // que dibujas y no verlo.
    scene.fog = null;
    return;
  }
  const color =
    typeof scene.userData[CAD_FOG_COLOR_KEY] === "number"
      ? (scene.userData[CAD_FOG_COLOR_KEY] as number)
      : CAD_FOG_FALLBACK;
  const span = Math.max(footprint.W, footprint.H) * footprint.s;
  scene.fog = new THREE.Fog(color, span * 1.4, span * 3.4);
}
