/**
 * Qué pipeline de render dibuja el espacio modelo.
 *
 * ## Por qué hay una bandera y por qué su defecto es el nuevo
 *
 * `lib/cad/render/` lleva escrito y probado desde la ola 1 un pipeline por
 * lotes y por tiles que, medido en Node, convierte un zoom de 29 s a 100.000
 * entidades en un cuadro. Nadie lo importaba: el editor seguía proyectando una
 * malla por entidad con `entity-three.ts`, así que la mejora existía en el
 * benchmark y no en el producto.
 *
 * Encenderlo cambia CÓMO se ve cada dibujo, y lo que el benchmark de Node no
 * pudo medir —GPU, llamadas de dibujo reales, rasterizado de glifos— sólo se
 * comprueba en un navegador. De ahí la bandera: existe para poder volver atrás
 * en producción sin desplegar, no para dejar el trabajo apagado. **El defecto
 * es `batched`.** Un interruptor cuyo defecto fuese el camino viejo sería otra
 * vez un módulo construido y no entregado.
 *
 * ## Precedencia
 *
 * 1. `?cadRenderPipeline=legacy|batched` en la URL. Es un acto explícito —de
 *    quien depura o de un golden que quiere fijar un camino— y gana siempre.
 *    No se persiste: cerrar la pestaña deshace el experimento.
 * 2. Lo guardado en `localStorage`, que es lo que el usuario eligió.
 * 3. El defecto.
 *
 * Un valor ilegible en cualquiera de los dos niveles se ignora y se pasa al
 * siguiente: una preferencia corrupta no puede impedir abrir un dibujo.
 */

export type CadRenderPipelineChoice = "batched" | "legacy";

/** El camino nuevo. Cambiar esto apaga el pipeline por tiles en todo el producto. */
export const CAD_RENDER_PIPELINE_DEFAULT: CadRenderPipelineChoice = "batched";

export const CAD_RENDER_PIPELINE_STORAGE_KEY = "valle_cad_render_pipeline";

/** Parámetro de URL que fuerza un camino para una sesión. */
export const CAD_RENDER_PIPELINE_SEARCH_PARAM = "cadRenderPipeline";

export function normalizeCadRenderPipeline(
  value: unknown,
): CadRenderPipelineChoice | null {
  if (value === "batched" || value === "legacy") return value;
  return null;
}

/** Lo mínimo que hace falta de `localStorage`; así el spec no monta un DOM. */
export interface CadRenderPipelineStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export interface CadRenderPipelineSource {
  storage?: CadRenderPipelineStorage | null;
  /** `location.search`, con o sin `?`. */
  search?: string | null;
}

export function resolveCadRenderPipeline(
  source: CadRenderPipelineSource = {},
): CadRenderPipelineChoice {
  const fromSearch = readSearchOverride(source.search);
  if (fromSearch) return fromSearch;
  let stored: string | null = null;
  try {
    stored = source.storage?.getItem(CAD_RENDER_PIPELINE_STORAGE_KEY) ?? null;
  } catch {
    // Un navegador con almacenamiento bloqueado no es un error del dibujo.
    stored = null;
  }
  return normalizeCadRenderPipeline(stored) ?? CAD_RENDER_PIPELINE_DEFAULT;
}

function readSearchOverride(
  search: string | null | undefined,
): CadRenderPipelineChoice | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search,
    );
    return normalizeCadRenderPipeline(
      params.get(CAD_RENDER_PIPELINE_SEARCH_PARAM),
    );
  } catch {
    return null;
  }
}

/** Persiste la elección del usuario. Falla en silencio si no hay almacenamiento. */
export function storeCadRenderPipeline(
  storage: CadRenderPipelineStorage | null | undefined,
  choice: CadRenderPipelineChoice,
): void {
  try {
    storage?.setItem?.(CAD_RENDER_PIPELINE_STORAGE_KEY, choice);
  } catch {
    /* preferencia no persistida: el dibujo sigue abriéndose */
  }
}
