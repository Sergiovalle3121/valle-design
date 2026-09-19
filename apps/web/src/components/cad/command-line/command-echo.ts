/**
 * Eco del nombre canónico al teclear un alias, como AutoCAD: «L» → «LINE»,
 * «TR» → «TRIM». El motor resuelve el alias y arranca la orden, pero el diálogo
 * mostraba «> L» seguido del prompt sin decir QUÉ orden se abrió.
 *
 * Sólo cuando lo tecleado ABRE una orden. Con una orden en curso, lo tecleado
 * es la respuesta a su prompt y el motor no lo lee como nombre de comando: la
 * «E» de ZOOM es Extensión y la «C» de LINE es Cerrar. Si el eco resolviera el
 * alias igualmente, el diálogo diría «ERASE» o «CIRCLE» sobre una orden que
 * nadie abrió. La regla es la misma que aplica el motor (`input-pipeline.ts`):
 * con el motor libre lo tecleado es un comando, y con `'` delante es un
 * transparente que se abre aunque haya otra orden en curso.
 *
 * `busy` es el del anfitrión, que incluye la orden cuya implementación se está
 * cargando: lo que se teclea mientras tanto se encola para ESA orden, así que
 * tampoco abre nada.
 */
import { CAD_COMMAND_ALIASES } from "@/lib/cad/engine/alias-table";

export function cadCommandAliasEcho(
  value: string,
  busy: boolean,
  known: (name: string) => boolean,
): string | null {
  const typed = value.trim();
  const transparent = typed.startsWith("'");
  if (busy && !transparent) return null;
  const resolved = CAD_COMMAND_ALIASES[(transparent ? typed.slice(1) : typed).toUpperCase()];
  return resolved && known(resolved) ? resolved : null;
}
