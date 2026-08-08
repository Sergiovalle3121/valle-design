/**
 * Formato y resolución de prompts.
 *
 * El prompt de AutoCAD no es decoración: es la interfaz. Dice qué se espera,
 * qué alternativas hay y cuál sale por defecto, todo en un renglón que se lee
 * sin apartar la vista del dibujo:
 *
 * ```text
 * Precise el siguiente punto o [Cerrar/desHacer] <Cerrar>:
 * ```
 *
 * Hoy el editor muestra prosa —«Siguiente punto (Enter para terminar)»— sin
 * opciones seleccionables. Un usuario que sabe que PLINE cierra con `C` no
 * tiene dónde escribirlo.
 *
 * Las letras que eligen una opción van **en mayúscula dentro de la palabra**,
 * que es como AutoCAD indica el atajo sin gastar una línea explicándolo.
 */
import type { CadKeyword, CadPrompt } from "./command-types";

/**
 * Escribe la palabra resaltando su atajo. `{keyword:"Cerrar", shortcut:"C"}` da
 * `Cerrar`; `{keyword:"desHacer", shortcut:"H"}` da `desHacer`, porque el atajo
 * no siempre es la inicial.
 */
export function formatCadKeyword(option: CadKeyword): string {
  const text = option.label ?? option.keyword;
  const shortcut = option.shortcut;
  if (!shortcut) return text;
  const index = text.toLowerCase().indexOf(shortcut.toLowerCase());
  if (index < 0) return `${text} (${shortcut.toUpperCase()})`;
  return (
    text.slice(0, index) +
    text.slice(index, index + shortcut.length).toUpperCase() +
    text.slice(index + shortcut.length)
  );
}

/** Renderiza el prompt completo, listo para la línea de comandos. */
export function formatCadPrompt(prompt: CadPrompt): string {
  let line = prompt.message;
  if (prompt.options.length > 0)
    line += ` o [${prompt.options.map(formatCadKeyword).join("/")}]`;
  const fallback = prompt.defaultOption ?? prompt.defaultValue;
  if (fallback !== undefined && fallback !== "") line += ` <${fallback}>`;
  return `${line}: `;
}

/**
 * Resuelve lo tecleado contra las opciones del paso.
 *
 * Precedencia, y el orden importa:
 *
 * 1. Coincidencia exacta con un atajo — es lo que teclea quien va rápido.
 * 2. El atajo más largo que encaje, para que `CE` no quede atrapado por `C`
 *    cuando conviven `Cerrar` y `CEntro`.
 * 3. Prefijo de la palabra completa, que es como se escribe cuando se duda.
 *
 * Devuelve `null` si nada encaja, y también si hay **empate**: dos opciones
 * igual de válidas no se resuelven adivinando.
 */
export function matchCadKeyword(
  token: string,
  options: readonly CadKeyword[],
): string | null {
  const value = token.trim().toUpperCase();
  if (!value || options.length === 0) return null;

  const exact = options.filter((option) => option.shortcut.toUpperCase() === value);
  if (exact.length === 1) return exact[0].keyword;
  if (exact.length > 1) return null;

  const byShortcut = options
    .filter((option) => option.shortcut && value.startsWith(option.shortcut.toUpperCase()))
    .sort((a, b) => b.shortcut.length - a.shortcut.length);
  if (byShortcut.length > 0) {
    const best = byShortcut[0];
    const tied = byShortcut.filter((option) => option.shortcut.length === best.shortcut.length);
    if (tied.length === 1 && best.shortcut.toUpperCase() === value) return best.keyword;
  }

  const byPrefix = options.filter((option) => option.keyword.toUpperCase().startsWith(value));
  if (byPrefix.length === 1) return byPrefix[0].keyword;

  return null;
}

/** Prompt sin opciones, que es el caso corriente. */
export function cadPrompt(message: string, options: readonly CadKeyword[] = []): CadPrompt {
  return { message, options };
}
