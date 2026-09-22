/**
 * Qué interfaz ve quien abre el estudio: la barra **Esencial** o la cinta **Pro**.
 *
 * ## Por qué es una preferencia aparte y no un campo del espacio de trabajo
 *
 * `valle_cad_workspace:*` está congelada (IDENTITY.md, ADR-0010 y
 * `persisted-identifiers.spec.ts`), su `normalizeCadWorkspacePreferences`
 * descarta campos desconocidos y su spec compara el objeto entero con
 * `deepEqual`. Meter ahí «modo» mezclaría además dos cosas distintas: cómo se
 * DISTRIBUYE el estudio (muelles, perfil) y CUÁNTA interfaz se enseña. Por eso
 * hay una clave nueva, con el mismo esquema por usuario que
 * `onboarding/tour-host.ts` (`valle:cad:tour:v1[:userId]`): dos arquitectos
 * que comparten máquina no comparten primera vez.
 *
 * ## Precedencia — calcada de `render-pipeline-preference.ts`
 *
 * 1. `?cadUi=esencial|pro` en la URL. Acto explícito de quien depura o de un
 *    golden que fija un camino. Gana siempre y NO se persiste: cerrar la
 *    pestaña deshace el experimento.
 * 2. Lo guardado bajo la clave del usuario: lo que esa persona eligió, o lo
 *    que se decidió por ella la primera vez.
 * 3. El respaldo que da quien llama. Sin clave, la decisión inicial la toma
 *    `decideInitialCadUiMode` y el anfitrión la persiste en el acto.
 *
 * Un valor ilegible en cualquier nivel se ignora y se pasa al siguiente: una
 * preferencia corrupta no puede impedir abrir un dibujo.
 *
 * ## El valor guardado
 *
 * JSON `{"mode":"esencial"|"pro","v":1}` y no la cadena suelta: deja sitio a
 * campos futuros (p. ej. `presetApplied`) sin renombrar la clave, que desde su
 * primer día es un identificador persistido y por tanto congelado.
 */

export type CadUiMode = "esencial" | "pro";

/** Parámetro de URL que fuerza un modo para una sesión, sin persistirlo. */
export const CAD_UI_MODE_SEARCH_PARAM = "cadUi";

/** Versión del envoltorio JSON guardado. Sube sólo si cambia su forma. */
export const CAD_UI_MODE_STORAGE_VERSION = 1;

const STORAGE_PREFIX = "valle:cad:ui-mode:v1";

/** `valle:cad:ui-mode:v1` sin sesión (demo) o `…:v1:<userId>` con ella. */
export function cadUiModeStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

export function normalizeCadUiMode(value: unknown): CadUiMode | null {
  if (value === "esencial" || value === "pro") return value;
  return null;
}

/** Lo mínimo que hace falta de `localStorage`; así el spec no monta un DOM. */
export interface CadUiModeStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export interface CadUiModeSource {
  storage?: CadUiModeStorage | null;
  /** `location.search`, con o sin `?`. */
  search?: string | null;
  /** La clave del usuario, de `cadUiModeStorageKey`. */
  key: string;
  /** Lo que vale cuando ni la URL ni la clave dicen nada. */
  fallback: CadUiMode;
}

/** El modo que pide la URL, o `null` si no lo pide o lo pide mal. */
export function readCadUiModeSearchOverride(
  search: string | null | undefined,
): CadUiMode | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    return normalizeCadUiMode(params.get(CAD_UI_MODE_SEARCH_PARAM));
  } catch {
    return null;
  }
}

/**
 * El modo guardado bajo `key`, o `null` si no hay nada legible.
 *
 * Sólo se acepta el envoltorio JSON: una cadena suelta o un JSON sin `mode`
 * válido cuentan como «nada guardado», que es el nivel siguiente.
 */
export function readStoredCadUiMode(
  storage: CadUiModeStorage | null | undefined,
  key: string,
): CadUiMode | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    // Un navegador con almacenamiento bloqueado no es un error del dibujo.
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return normalizeCadUiMode((parsed as { mode?: unknown }).mode);
  } catch {
    return null;
  }
}

/** URL > clave > respaldo. La URL nunca se persiste. */
export function resolveCadUiMode(source: CadUiModeSource): CadUiMode {
  return (
    readCadUiModeSearchOverride(source.search) ??
    readStoredCadUiMode(source.storage, source.key) ??
    source.fallback
  );
}

export interface CadUiModeInitialDecision {
  storage?: CadUiModeStorage | null;
  /**
   * `cadWorkspaceStorageKey({tenantId, userId})`. El monolito escribe esa
   * clave en cada apertura del estudio, así que que NO exista en este
   * navegador significa «esta cuenta nunca abrió el estudio aquí».
   */
  workspaceKey?: string | null;
  /** La página lo pide sin mirar nada más: /demo siempre arranca en Esencial. */
  forceEsencial?: boolean;
}

/**
 * La primera vez, sin clave guardada: ¿Esencial o Pro?
 *
 * Esencial para /demo y para quien nunca abrió el estudio en este navegador;
 * Pro para quien ya lo tenía configurado. Una cuenta antigua que estrena
 * navegador cae UNA vez en Esencial: el interruptor lo corrige y se persiste.
 * No hay `createdAt` del usuario en el cliente, y esto vale más que fingirlo.
 */
export function decideInitialCadUiMode(
  decision: CadUiModeInitialDecision,
): CadUiMode {
  if (decision.forceEsencial) return "esencial";
  if (!decision.workspaceKey) return "esencial";
  try {
    return decision.storage?.getItem(decision.workspaceKey) === null ||
      !decision.storage
      ? "esencial"
      : "pro";
  } catch {
    // Sin poder leer, la respuesta segura es la interfaz corta.
    return "esencial";
  }
}

/** Persiste el modo bajo `key`. Falla en silencio si no hay almacenamiento. */
export function storeCadUiMode(
  storage: CadUiModeStorage | null | undefined,
  key: string,
  mode: CadUiMode,
): void {
  try {
    storage?.setItem?.(
      key,
      JSON.stringify({ mode, v: CAD_UI_MODE_STORAGE_VERSION }),
    );
  } catch {
    /* preferencia no persistida: el estudio sigue abriéndose */
  }
}
