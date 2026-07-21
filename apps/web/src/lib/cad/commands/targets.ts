/**
 * Objetivo por nombre (AXOS-CAD-NAME-001): resuelve sobre qué objetos actúa
 * un comando. Prioridad: objectIds explícitos > nombre ('la puerta', el
 * label o kind por substring sin acentos) > selección actual. Con nombre,
 * TODAS las coincidencias entran — 'borra las sillas' borra todas.
 */
import type { CadBox, CadCommandContext } from "./types";

const fold = (s: string) =>
  s
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function resolveCommandTargets(
  context: CadCommandContext,
  objectIds?: string[],
  target?: string,
): { objs: CadBox[]; usedTarget: boolean } {
  if (objectIds?.length) {
    return {
      objs: objectIds
        .map((id) => context.objects.find((o) => o.id === id))
        .filter((o): o is CadBox => !!o),
      usedTarget: false,
    };
  }
  const needle = target?.trim() ? fold(target.trim()) : "";
  if (needle) {
    return {
      objs: context.objects.filter((o) =>
        fold(`${o.label} ${o.kind ?? ""}`).includes(needle),
      ),
      usedTarget: true,
    };
  }
  return {
    objs: context.selectedIds
      .map((id) => context.objects.find((o) => o.id === id))
      .filter((o): o is CadBox => !!o),
    usedTarget: false,
  };
}
