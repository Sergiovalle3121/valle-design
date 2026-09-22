/**
 * QUÉ AVISOS DE SEGUNDO ORDEN FIJÓ ESTA PERSONA fuera del desplegable «Más».
 *
 * Ola «estado»: el desplegable nació con los nueve avisos SIEMPRE dentro
 * (`CadStatusBar.tsx`, comentario de cabecera) — alcanzables a cualquier
 * ancho, que era la mejora sobre el `@max-[40rem]:hidden` que escondía sin
 * dejar alcanzar. Pero «alcanzable tras dos clics» no es lo mismo que «a la
 * vista», y quien vigila la conexión API o las holguras en cada sesión no
 * debería abrir «Más» para verlo cien veces al día. Este módulo es la
 * memoria de qué avisos esa persona decidió sacar del desplegable y dejar
 * siempre visibles en la fila — «Más» se queda sólo con lo que de verdad no
 * hace falta mirar siempre.
 *
 * Puro y testeable sin navegador, como `cad-workspace.ts`: recibe un
 * `Storage`-like en vez de leer `window.localStorage` directamente. Un fallo
 * de almacenamiento (modo privado, cuota) nunca debe romper la barra de
 * estado — se traga y se sigue con el conjunto vacío.
 */

/** Los nueve avisos de segundo orden, con id estable — el mismo orden en el
 *  que ya vivían en el desplegable. */
export const CAD_STATUS_OVERFLOW_ITEM_IDS = [
  "connection",
  "grid-snap",
  "document-info",
  "validation",
  "cad-validation",
  "clearances",
  "safety",
  "dxf-warnings",
  "snapshots",
] as const;

export type CadStatusOverflowItemId = (typeof CAD_STATUS_OVERFLOW_ITEM_IDS)[number];

/** Subconjunto de `Storage` que necesita este módulo (testeable sin DOM). */
export interface CadStatusOverflowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "valle_cad_status_pins:v1";

const isKnownId = (value: unknown): value is CadStatusOverflowItemId =>
  typeof value === "string" &&
  (CAD_STATUS_OVERFLOW_ITEM_IDS as readonly string[]).includes(value);

/**
 * Lee los avisos fijados. Cualquier entrada desconocida (una versión vieja
 * con ids que ya no existen, o un valor corrupto) se descarta en silencio;
 * nunca se lanza.
 */
export function loadCadStatusOverflowPins(
  storage: CadStatusOverflowStorage,
): ReadonlySet<CadStatusOverflowItemId> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isKnownId));
  } catch {
    return new Set();
  }
}

/** Guarda el conjunto. Un fallo de cuota o modo privado se traga: perder la
 *  preferencia nunca debe romper la barra de estado. */
export function saveCadStatusOverflowPins(
  storage: CadStatusOverflowStorage,
  pins: ReadonlySet<CadStatusOverflowItemId>,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...pins]));
  } catch {
    /* preferencia no persistida esta vez; la sesión sigue con el valor en memoria */
  }
}

/** Alterna un id — fijarlo si no estaba, soltarlo si ya estaba. Puro: no
 *  toca el almacenamiento, así que `CadStatusBar` decide cuándo guardar. */
export function toggleCadStatusOverflowPin(
  pins: ReadonlySet<CadStatusOverflowItemId>,
  id: CadStatusOverflowItemId,
): ReadonlySet<CadStatusOverflowItemId> {
  const next = new Set(pins);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
