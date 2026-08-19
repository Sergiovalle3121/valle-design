/**
 * Estilos visuales y órbita: cómo se MIRA un sólido.
 *
 * Un CAD 2D dibuja trazos y no necesita decidir nada sobre luz ni caras ocultas.
 * En cuanto hay sólidos aparece la pregunta —¿alambre, o caras?, ¿con aristas o
 * sin ellas?— y AutoCAD la responde con cuatro estilos que este módulo reproduce
 * con los mismos nombres: Alámbrico, Oculto, Sombreado y Sombreado con aristas.
 *
 * ## Qué es aquí un estilo, exactamente
 *
 * Una tabla de decisiones PURA: qué se dibuja (caras, aristas, ambas), si las
 * caras ocultan a las de detrás, y con qué opacidad. No construye nada de THREE
 * ni conoce el visor. Esa separación es lo que permite probar los cuatro estilos
 * en Node y lo que evita que el visor tenga cuatro caminos de código paralelos:
 * tiene uno, parametrizado por esta tabla.
 *
 * ## La órbita, y la trampa del polo
 *
 * Orbitar es mover la cámara sobre una esfera centrada en el objetivo. La
 * parametrización natural —azimut y elevación— tiene una singularidad en los
 * polos: cuando la elevación llega a ±90° la cámara mira exactamente a lo largo
 * de su propio vector `up`, el producto vectorial que construye la base se
 * anula y la matriz de vista sale con `NaN`. El síntoma es que la escena
 * DESAPARECE al arrastrar hasta arriba del todo, y vuelve al bajar un poco.
 *
 * Se resuelve acotando la elevación a ±89,9°. No es una aproximación: la vista
 * cenital exacta es un caso distinto (VISTA SUPERIOR) que se pide por su nombre,
 * no arrastrando hasta el borde.
 */

/** Los cuatro estilos, con el nombre que teclea el usuario. */
export type CadVisualStyleId = "wireframe" | "hidden" | "shaded" | "shaded-edges";

export interface CadVisualStyle {
  id: CadVisualStyleId;
  /** Nombre mostrado, y el que acepta la orden VSCURRENT. */
  label: string;
  /** Se dibujan las caras del sólido. */
  faces: boolean;
  /** Se dibujan las aristas del sólido. */
  edges: boolean;
  /**
   * Las caras ESCONDEN lo que hay detrás.
   *
   * `Oculto` no dibuja caras visibles y aun así las necesita: pinta las caras
   * del color del fondo para que tapen las aristas traseras. Sin esa distinción
   * entre «dibujar caras» y «ocultar con caras», el modo Oculto sería idéntico
   * al Alámbrico, que es el error clásico al implementar los cuatro.
   */
  occludes: boolean;
  /**
   * Las aristas que el cuerpo tapa NO se dibujan.
   *
   * Es distinto de `occludes`, aunque en el visor se parezcan. `occludes` habla
   * de la GPU: pinta caras y deja que el búfer de profundidad esconda lo de
   * detrás. Esto habla de la GEOMETRÍA: qué aristas hay que enviar siquiera. La
   * distinción sólo se nota fuera del visor —un trazado, una exportación 2D, una
   * spec en Node—, que es donde no hay búfer de profundidad que valga.
   *
   * `Alámbrico` es el caso que lo aclara: dibuja TODAS las aristas, las de
   * detrás incluidas. Ésa es su definición, y por eso vale `false` aquí aunque
   * comparta con `Oculto` el no pintar caras.
   */
  removesHiddenEdges: boolean;
  /** Opacidad de las caras, en `[0, 1]`. */
  opacity: number;
}

export const CAD_VISUAL_STYLES: readonly CadVisualStyle[] = [
  {
    id: "wireframe",
    label: "Alámbrico",
    faces: false,
    edges: true,
    occludes: false,
    removesHiddenEdges: false,
    opacity: 0,
  },
  {
    id: "hidden",
    label: "Oculto",
    faces: false,
    edges: true,
    occludes: true,
    removesHiddenEdges: true,
    opacity: 1,
  },
  {
    id: "shaded",
    label: "Sombreado",
    faces: true,
    edges: false,
    occludes: true,
    removesHiddenEdges: false,
    opacity: 1,
  },
  {
    id: "shaded-edges",
    label: "Sombreado con aristas",
    faces: true,
    edges: true,
    occludes: true,
    removesHiddenEdges: true,
    opacity: 1,
  },
];

export const CAD_DEFAULT_VISUAL_STYLE: CadVisualStyleId = "shaded-edges";

/**
 * Resuelve un estilo por id o por nombre, sin distinguir mayúsculas ni acentos.
 *
 * Devuelve `null` para lo desconocido en vez de caer al estilo por defecto: un
 * VSCURRENT mal tecleado que cambia silenciosamente a otro estilo es peor que
 * uno que dice que no reconoce lo que se le pidió.
 */
export function resolveCadVisualStyle(value: string): CadVisualStyle | null {
  const wanted = normalize(value);
  return (
    CAD_VISUAL_STYLES.find(
      (style) => style.id === wanted || normalize(style.label) === wanted,
    ) ?? null
  );
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

/** Estilo por su id, con el por defecto como red. */
export function cadVisualStyle(id: CadVisualStyleId = CAD_DEFAULT_VISUAL_STYLE): CadVisualStyle {
  return CAD_VISUAL_STYLES.find((style) => style.id === id) ?? CAD_VISUAL_STYLES[3];
}

// ---------------------------------------------------------------------------
// Órbita
// ---------------------------------------------------------------------------

export interface CadOrbitState {
  /** Giro alrededor del eje vertical, en grados. */
  azimuthDeg: number;
  /** Altura sobre el plano del dibujo, en grados. Acotada a ±89,9. */
  elevationDeg: number;
  /** Distancia de la cámara al objetivo, en unidades de ESCENA. */
  distance: number;
}

/** Tope de elevación. Justo por debajo del polo, donde la base se degenera. */
export const CAD_ORBIT_ELEVATION_LIMIT = 89.9;

export function clampOrbitElevation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-CAD_ORBIT_ELEVATION_LIMIT, Math.min(CAD_ORBIT_ELEVATION_LIMIT, degrees));
}

/**
 * Aplica un incremento de órbita. El azimut da la vuelta —girar 370° es girar
 * 10°— y la elevación se acota; son dos ejes con reglas distintas y mezclarlas
 * es lo que produce cámaras que se quedan pegadas al polo.
 */
export function orbitStep(
  state: CadOrbitState,
  deltaAzimuthDeg: number,
  deltaElevationDeg: number,
): CadOrbitState {
  const azimuth = state.azimuthDeg + (Number.isFinite(deltaAzimuthDeg) ? deltaAzimuthDeg : 0);
  return {
    azimuthDeg: ((azimuth % 360) + 360) % 360,
    elevationDeg: clampOrbitElevation(
      state.elevationDeg + (Number.isFinite(deltaElevationDeg) ? deltaElevationDeg : 0),
    ),
    distance: state.distance,
  };
}

/**
 * Posición de la cámara para un estado de órbita alrededor de `target`.
 *
 * El mapeo de escena del editor pone el dibujo sobre el plano XZ y la altura en
 * Y (ver `view-controller.ts`), así que la elevación sube por +Y y el azimut
 * gira en XZ. Reproducirlo aquí —en vez de inventar un sistema propio— es lo que
 * hace que orbitar y volver a la vista 2D no dé un salto.
 */
export function orbitCameraPosition(
  target: { x: number; y: number; z: number },
  state: CadOrbitState,
): { x: number; y: number; z: number } {
  const azimuth = (state.azimuthDeg * Math.PI) / 180;
  const elevation = (clampOrbitElevation(state.elevationDeg) * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * state.distance;
  return {
    x: target.x + Math.sin(azimuth) * horizontal,
    y: target.y + Math.sin(elevation) * state.distance,
    z: target.z + Math.cos(azimuth) * horizontal,
  };
}

/** Estado de órbita que reproduce una posición de cámara dada. */
export function orbitStateFromPosition(
  target: { x: number; y: number; z: number },
  position: { x: number; y: number; z: number },
): CadOrbitState {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!(distance > 0)) return { azimuthDeg: 0, elevationDeg: 0, distance: 0 };
  const azimuth = (Math.atan2(dx, dz) * 180) / Math.PI;
  return {
    azimuthDeg: ((azimuth % 360) + 360) % 360,
    elevationDeg: clampOrbitElevation((Math.asin(dy / distance) * 180) / Math.PI),
    distance,
  };
}
