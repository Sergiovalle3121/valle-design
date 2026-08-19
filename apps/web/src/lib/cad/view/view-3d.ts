/**
 * Navegación 3D: las diez vistas predefinidas y la órbita LIBRE.
 *
 * `visual-styles.ts` ya sabe orbitar con azimut y elevación, y esa
 * parametrización es la correcta para la órbita RESTRINGIDA — la que mantiene
 * la vertical del mundo vertical en pantalla, que es lo que un dibujante quiere
 * el 95 % del tiempo. Este módulo no la reescribe: la importa. Lo que añade es
 * lo que esa parametrización NO puede expresar, y son dos cosas.
 *
 * ## 1. El polo, que la órbita restringida tiene prohibido
 *
 * `clampOrbitElevation` acota a ±89,9° porque en el polo exacto la cámara mira
 * a lo largo de su propio `up`, la base de la matriz de vista se degenera y
 * THREE devuelve `NaN`. Ese tope es correcto para un ARRASTRE, y es un desastre
 * para una vista SUPERIOR: la planta pedida por su nombre tiene que ser la
 * planta, no una planta con una décima de grado de error que inclina cada
 * arista vertical un píxel.
 *
 * La salida no es subir el tope: es dejar de parametrizar por ángulos. Una
 * vista predefinida se declara con su vector OJO←OBJETIVO y su `up`, los dos
 * explícitos. En el polo el `up` no se deduce —no hay nada de lo que
 * deducirlo—, así que se declara, y la degeneración desaparece por
 * construcción en vez de por aproximación.
 *
 * ## 2. La órbita libre, que no tiene ángulos que acotar
 *
 * La órbita libre (3DFORBIT) gira alrededor de los ejes de la CÁMARA, no de los
 * del mundo: arrastrar hacia arriba sigue subiendo cuando la cámara ya está
 * boca abajo, y el horizonte se inclina. No hay azimut ni elevación que valgan
 * —el estado es el par (desplazamiento, `up`)— y por eso no hay polo: pasar por
 * encima del cenit es un giro más, no una singularidad. Lo que se conserva es
 * la DISTANCIA y la ortogonalidad de la base, y las dos son invariantes
 * comprobables con números.
 *
 * ## El sistema de coordenadas, que es el de la escena y no otro
 *
 * Todo lo de aquí habla en coordenadas de ESCENA, las mismas que
 * `view-controller.ts`: el dibujo yace sobre XZ, la Y es la altura, la +Y del
 * dibujo mapea a +Z. De ahí sale que la vista FRONTAL tenga la cámara en −Z
 * (mirando al norte) y que la SUPERIOR lleve `up = (0, 0, −1)` — el mismo `up`
 * que usa la cámara ortográfica del 2D, para que pasar de planta a SUPERIOR no
 * voltee el dibujo.
 */
import {
  clampOrbitElevation,
  orbitCameraPosition,
  orbitStateFromPosition,
  orbitStep,
  type CadOrbitState,
} from "./visual-styles";

export interface CadVec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Aritmética vectorial mínima
// ---------------------------------------------------------------------------
//
// Local y no importada de `lib/brep/vec3`: este módulo lo consume el
// controlador de vista en cada cuadro de una órbita, y colgarlo del kernel de
// sólidos ataría la navegación a un subsistema que no tiene nada que ver.

const dot = (a: CadVec3, b: CadVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: CadVec3, b: CadVec3): CadVec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const scale = (v: CadVec3, k: number): CadVec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });

const add = (a: CadVec3, b: CadVec3): CadVec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export function cadVec3Length(v: CadVec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Normaliza, o devuelve `null` si el vector es nulo o no finito.
 *
 * `null` y no un vector por defecto: una base construida sobre un eje inventado
 * produce una cámara que mira a un sitio que nadie pidió, y el usuario ve un
 * salto sin explicación. Quien llama decide qué hacer con la ausencia.
 */
export function cadVec3Normalize(v: CadVec3): CadVec3 | null {
  const length = cadVec3Length(v);
  if (!(length > 1e-12) || !Number.isFinite(length)) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Rotación de Rodrigues alrededor de un eje UNITARIO, en radianes. */
function rotateAround(v: CadVec3, axis: CadVec3, radians: number): CadVec3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return add(
    add(scale(v, cos), scale(cross(axis, v), sin)),
    scale(axis, dot(axis, v) * (1 - cos)),
  );
}

// ---------------------------------------------------------------------------
// Las diez vistas predefinidas
// ---------------------------------------------------------------------------

export type CadStandardViewId =
  | "top"
  | "bottom"
  | "front"
  | "back"
  | "left"
  | "right"
  | "sw-iso"
  | "se-iso"
  | "ne-iso"
  | "nw-iso";

export interface CadStandardView {
  id: CadStandardViewId;
  /** Nombre mostrado y aceptado al teclear, sin distinguir acentos. */
  label: string;
  /** Dirección OJO←OBJETIVO, UNITARIA, en coordenadas de escena. */
  offset: CadVec3;
  /** `up` de la cámara, unitario y perpendicular a `offset`. */
  up: CadVec3;
  /**
   * Equivalente en azimut/elevación de la órbita restringida.
   *
   * Existe para que cambiar a una vista predefinida y seguir orbitando a mano
   * no dé un salto: el controlador puede leer aquí el estado con el que sigue.
   * En SUPERIOR e INFERIOR vale ±90 EXACTOS, fuera del tope de
   * `clampOrbitElevation` — es la prueba de que esta tabla no pasa por ahí.
   */
  azimuthDeg: number;
  elevationDeg: number;
}

/** Ángulo isométrico verdadero: `atan(1/√2)` = 35,264…°. */
export const CAD_ISOMETRIC_ELEVATION_DEG = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI;

const ISO = 1 / Math.sqrt(3);

/**
 * El `up` de una isométrica NO es la vertical del mundo.
 *
 * Con la cámara a 35° sobre el horizonte, la vertical del mundo no es
 * perpendicular a la mirada: su producto escalar con el desplazamiento vale
 * 0,577. THREE lo tolera —`lookAt` ortogonaliza por dentro— y precisamente por
 * eso el error es invisible: la tabla declararía una base que no es base, y
 * cualquiera que la usara para construir una matriz de vista a mano obtendría
 * una cámara ligeramente torcida sin ningún síntoma. Aquí se declara ya
 * ortogonalizada, que es el mismo encuadre y además la verdad.
 *
 * Sale de Gram-Schmidt sobre (0,1,0): `up = normalizar(mundoArriba − o·(o·mundoArriba))`,
 * que para las cuatro isométricas da componentes 1/√6 y 2/√6.
 */
const ISO_UP_SIDE = 1 / Math.sqrt(6);
const ISO_UP_VERTICAL = 2 / Math.sqrt(6);

/**
 * Las diez, con sus vectores explícitos.
 *
 * Los nombres cardinales de las isométricas son los del DIBUJO: «suroeste» es
 * la cámara colocada al sur y al oeste de la pieza, es decir en (−X, −Y) del
 * dibujo, que en la escena es (−X, −Z). Es la convención de AutoCAD y la única
 * que hace que SO enseñe la esquina que un plano de situación llama suroeste.
 */
export const CAD_STANDARD_VIEWS: readonly CadStandardView[] = [
  {
    id: "top",
    label: "Superior",
    offset: { x: 0, y: 1, z: 0 },
    // El mismo `up` que la cámara ortográfica del 2D: la +Y del dibujo mira
    // hacia ABAJO en pantalla. Cambiarlo aquí voltearía el dibujo al pasar de
    // planta a SUPERIOR, que es exactamente el salto que esta tabla evita.
    up: { x: 0, y: 0, z: -1 },
    azimuthDeg: 0,
    elevationDeg: 90,
  },
  {
    id: "bottom",
    label: "Inferior",
    offset: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    azimuthDeg: 0,
    elevationDeg: -90,
  },
  {
    id: "front",
    label: "Frontal",
    offset: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
    azimuthDeg: 180,
    elevationDeg: 0,
  },
  {
    id: "back",
    label: "Posterior",
    offset: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
    azimuthDeg: 0,
    elevationDeg: 0,
  },
  {
    id: "left",
    label: "Izquierda",
    offset: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    azimuthDeg: 270,
    elevationDeg: 0,
  },
  {
    id: "right",
    label: "Derecha",
    offset: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    azimuthDeg: 90,
    elevationDeg: 0,
  },
  {
    id: "sw-iso",
    label: "Isométrica SO",
    offset: { x: -ISO, y: ISO, z: -ISO },
    up: { x: ISO_UP_SIDE, y: ISO_UP_VERTICAL, z: ISO_UP_SIDE },
    azimuthDeg: 225,
    elevationDeg: CAD_ISOMETRIC_ELEVATION_DEG,
  },
  {
    id: "se-iso",
    label: "Isométrica SE",
    offset: { x: ISO, y: ISO, z: -ISO },
    up: { x: -ISO_UP_SIDE, y: ISO_UP_VERTICAL, z: ISO_UP_SIDE },
    azimuthDeg: 135,
    elevationDeg: CAD_ISOMETRIC_ELEVATION_DEG,
  },
  {
    id: "ne-iso",
    label: "Isométrica NE",
    offset: { x: ISO, y: ISO, z: ISO },
    up: { x: -ISO_UP_SIDE, y: ISO_UP_VERTICAL, z: -ISO_UP_SIDE },
    azimuthDeg: 45,
    elevationDeg: CAD_ISOMETRIC_ELEVATION_DEG,
  },
  {
    id: "nw-iso",
    label: "Isométrica NO",
    offset: { x: -ISO, y: ISO, z: ISO },
    up: { x: ISO_UP_SIDE, y: ISO_UP_VERTICAL, z: -ISO_UP_SIDE },
    azimuthDeg: 315,
    elevationDeg: CAD_ISOMETRIC_ELEVATION_DEG,
  },
];

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * Resuelve una vista por su id o por su nombre, sin acentos ni mayúsculas.
 *
 * Devuelve `null` ante lo desconocido, por la misma razón que
 * `resolveCadVisualStyle`: una vista mal tecleada que mueve la cámara a otro
 * sitio es peor que una que dice que no entendió el nombre.
 */
export function resolveCadStandardView(value: string): CadStandardView | null {
  const wanted = normalizeName(value);
  return (
    CAD_STANDARD_VIEWS.find(
      (view) => view.id === wanted || normalizeName(view.label) === wanted,
    ) ?? null
  );
}

export function cadStandardView(id: CadStandardViewId): CadStandardView {
  const found = CAD_STANDARD_VIEWS.find((view) => view.id === id);
  // Fallo cerrado: un id que no está en la tabla es un error de programación,
  // no una entrada del usuario, y devolver la planta por defecto lo escondería.
  if (!found) throw new Error(`No existe la vista predefinida ${id}.`);
  return found;
}

/** Posición de cámara de una vista predefinida, a la distancia dada. */
export function cadStandardViewPosition(
  target: CadVec3,
  view: CadStandardView,
  distance: number,
): CadVec3 {
  return add(target, scale(view.offset, distance));
}

// ---------------------------------------------------------------------------
// Órbita libre
// ---------------------------------------------------------------------------

export interface CadFreeOrbitState {
  /** Vector OBJETIVO→OJO. Su MÓDULO es la distancia, y es el invariante. */
  offset: CadVec3;
  /** `up` de la cámara, unitario y ortogonal a `offset`. */
  up: CadVec3;
}

/**
 * Estado de órbita libre a partir de una cámara concreta.
 *
 * El `up` se re-ortogonaliza contra el desplazamiento (Gram-Schmidt). Sin eso,
 * un `up` que ya venía torcido —y el de una cámara que ha pasado por
 * `lookAt` casi siempre lo está en el último bit— mete un giro parásito en cada
 * paso, y quinientos pasos después el horizonte está inclinado sin que nadie lo
 * haya inclinado.
 */
export function freeOrbitFromCamera(
  target: CadVec3,
  position: CadVec3,
  up: CadVec3,
): CadFreeOrbitState | null {
  const offset = {
    x: position.x - target.x,
    y: position.y - target.y,
    z: position.z - target.z,
  };
  const direction = cadVec3Normalize(offset);
  if (!direction) return null;
  const orthogonal = cadVec3Normalize({
    x: up.x - direction.x * dot(up, direction),
    y: up.y - direction.y * dot(up, direction),
    z: up.z - direction.z * dot(up, direction),
  });
  // Un `up` paralelo al desplazamiento no define ninguna base. Se elige el eje
  // del mundo menos alineado con la mirada, que es la única salida que no
  // depende de qué eje venía antes.
  const fallback = Math.abs(direction.y) > 0.9 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 1, z: 0 };
  const safe =
    orthogonal ??
    cadVec3Normalize({
      x: fallback.x - direction.x * dot(fallback, direction),
      y: fallback.y - direction.y * dot(fallback, direction),
      z: fallback.z - direction.z * dot(fallback, direction),
    });
  if (!safe) return null;
  return { offset, up: safe };
}

/**
 * Un paso de órbita libre.
 *
 * El azimut gira alrededor del `up` DE LA CÁMARA (no del mundo) y por eso no
 * deja el horizonte quieto cuando la cámara ya está inclinada; la elevación
 * gira alrededor del eje horizontal de la cámara y arrastra al `up` con ella,
 * que es lo que permite pasar por encima del cenit sin degenerar nada. El
 * alabeo gira alrededor de la propia mirada.
 *
 * Los tres conservan el módulo del desplazamiento: orbitar es girar. Es el
 * mismo invariante que la órbita restringida, y se comprueba igual.
 */
export function freeOrbitStep(
  state: CadFreeOrbitState,
  deltaAzimuthDeg: number,
  deltaElevationDeg: number,
  deltaRollDeg = 0,
): CadFreeOrbitState {
  const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
  const toRadians = Math.PI / 180;
  const upAxis = cadVec3Normalize(state.up);
  const direction = cadVec3Normalize(state.offset);
  if (!upAxis || !direction) return state;

  let offset = rotateAround(state.offset, upAxis, finite(deltaAzimuthDeg) * toRadians);
  let up: CadVec3 = upAxis;

  const pitchAxis = cadVec3Normalize(cross(offset, up));
  if (pitchAxis) {
    const radians = finite(deltaElevationDeg) * toRadians;
    offset = rotateAround(offset, pitchAxis, radians);
    up = rotateAround(up, pitchAxis, radians);
  }

  const rollAxis = cadVec3Normalize(offset);
  if (rollAxis && deltaRollDeg) {
    up = rotateAround(up, rollAxis, finite(deltaRollDeg) * toRadians);
  }

  // Re-ortogonalización defensiva: ver `freeOrbitFromCamera`. Cuesta una raíz
  // por paso y compra que mil pasos no acumulen inclinación.
  const settled = freeOrbitFromCamera({ x: 0, y: 0, z: 0 }, offset, up);
  return settled ?? { offset, up };
}

/** Posición de cámara del estado de órbita libre alrededor de `target`. */
export function freeOrbitCameraPosition(target: CadVec3, state: CadFreeOrbitState): CadVec3 {
  return add(target, state.offset);
}

// ---------------------------------------------------------------------------
// Peticiones de navegación 3D
// ---------------------------------------------------------------------------

export type CadOrbitMode = "constrained" | "free";

export type CadView3dRequest =
  /** Incremento de órbita. `mode` distingue restringida de libre. */
  | {
      kind: "orbit";
      mode: CadOrbitMode;
      azimuthDeg: number;
      elevationDeg: number;
      rollDeg?: number;
    }
  /** Salta a una de las diez vistas predefinidas, conservando la distancia. */
  | { kind: "standard-view"; view: CadStandardViewId }
  /**
   * Desplazamiento en PÍXELES de pantalla. Píxeles y no unidades de dibujo: bajo
   * perspectiva, cuánto mundo cubre un píxel depende de la distancia de cámara,
   * y el comando no la conoce. La conversión la hace quien tiene la cámara.
   */
  | { kind: "pan"; dxPx: number; dyPx: number }
  /** Acercamiento por factor: `>1` acerca. Es un travelín, no un cambio de FOV. */
  | { kind: "zoom"; factor: number };

/**
 * Lo que un comando 3D le pide al controlador, ya validado.
 *
 * Que la validación viva aquí y no en el descriptor es lo que hace que la misma
 * regla valga para lo tecleado, para los scripts y para AutoLISP, que no pasan
 * por el prompt. `null` significa que la petición no es aplicable, y el motivo
 * viaja aparte para poder enseñarlo.
 */
export interface CadView3dOutcome {
  request: CadView3dRequest | null;
  message: string;
}

/** Factor de zoom mínimo y máximo por orden. Barandillas, no preferencias. */
export const CAD_VIEW3D_MIN_ZOOM_FACTOR = 1e-3;
export const CAD_VIEW3D_MAX_ZOOM_FACTOR = 1e3;

export function validateCadView3dRequest(request: CadView3dRequest): CadView3dOutcome {
  switch (request.kind) {
    case "orbit": {
      const { azimuthDeg, elevationDeg } = request;
      if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg))
        return { request: null, message: "Los ángulos de órbita tienen que ser números." };
      if (azimuthDeg === 0 && elevationDeg === 0 && !request.rollDeg)
        return { request: null, message: "3DORBIT sin giro: la vista no cambia." };
      return {
        request,
        message:
          request.mode === "free"
            ? `3DORBIT libre: ${azimuthDeg}°, ${elevationDeg}°.`
            : `3DORBIT: ${azimuthDeg}°, ${elevationDeg}°.`,
      };
    }
    case "standard-view":
      return {
        request,
        message: `Vista ${cadStandardView(request.view).label}.`,
      };
    case "pan": {
      if (!Number.isFinite(request.dxPx) || !Number.isFinite(request.dyPx))
        return { request: null, message: "El desplazamiento de 3DPAN no es un vector válido." };
      if (request.dxPx === 0 && request.dyPx === 0)
        return { request: null, message: "3DPAN sin desplazamiento." };
      return { request, message: `3DPAN ${request.dxPx},${request.dyPx} px.` };
    }
    case "zoom": {
      const { factor } = request;
      if (!Number.isFinite(factor) || factor <= 0)
        return { request: null, message: "El factor de 3DZOOM debe ser mayor que cero." };
      if (factor < CAD_VIEW3D_MIN_ZOOM_FACTOR || factor > CAD_VIEW3D_MAX_ZOOM_FACTOR)
        return {
          request: null,
          message: `El factor de 3DZOOM tiene que estar entre ${CAD_VIEW3D_MIN_ZOOM_FACTOR} y ${CAD_VIEW3D_MAX_ZOOM_FACTOR}.`,
        };
      return { request, message: `3DZOOM ${factor}×.` };
    }
  }
}

/**
 * Estado de órbita restringida tras aplicar un incremento, sin tocar cámaras.
 *
 * Existe para que el spec pueda comprobar con NÚMEROS a dónde lleva un giro sin
 * montar THREE, y para que el controlador no tenga que reproducir la cuenta.
 */
export function constrainedOrbitTo(
  state: CadOrbitState,
  deltaAzimuthDeg: number,
  deltaElevationDeg: number,
): CadOrbitState {
  return orbitStep(state, deltaAzimuthDeg, deltaElevationDeg);
}

/**
 * Incremento de órbita restringida que lleva de un estado a una vista
 * predefinida, por el camino corto en azimut.
 *
 * El camino corto no es un detalle estético: girar 350° en vez de −10° para
 * llegar al mismo sitio marea, y sobre todo hace que la animación de la orden
 * cruce medio modelo por nada.
 */
export function orbitDeltaToStandardView(
  state: CadOrbitState,
  view: CadStandardView,
): { azimuthDeg: number; elevationDeg: number } {
  const raw = view.azimuthDeg - state.azimuthDeg;
  const wrapped = ((raw % 360) + 540) % 360 - 180;
  return {
    azimuthDeg: wrapped,
    // La elevación de SUPERIOR e INFERIOR es ±90 exactos y el paso restringido
    // la acota a ±89,9: por eso una vista polar se PIDE por su nombre y no se
    // alcanza orbitando. Aquí se devuelve el incremento hasta donde el tope
    // deja llegar, y quien quiera el polo exacto usa `standard-view`.
    elevationDeg: clampOrbitElevation(view.elevationDeg) - state.elevationDeg,
  };
}

export { orbitCameraPosition, orbitStateFromPosition, type CadOrbitState };
