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

/**
 * Matching por nombre con plural plegado: 'mesas' encuentra 'Mesa 4
 * personas' probando el término tal cual y sin sufijos -es/-s. 'todo' /
 * 'todos' devuelve el plano completo.
 */
export function matchObjectsByName(
  context: CadCommandContext,
  query: string,
): CadBox[] {
  const raw = query.trim();
  if (!raw) return [];
  if (/^tod[oa]s?$/i.test(raw)) return context.objects;
  // Objetivo por contención (AXOS-CAD-ZONE-001): 'lo que está en la
  // cocina' / 'dentro de la bodega' — los objetos cuyo centro cae dentro
  // del contenedor nombrado, sin incluir al contenedor mismo. Hereda los
  // compuestos: 'lo que hay en la cocina y la bodega' une ambos cuartos.
  const zoneMatch = fold(raw).match(
    /^(?:tod[oa]s?\s+)?(?:l[oa]s? que\s+(?:esta|estan|este|esten|hay)\s+(?:en|dentro de|adentro de)\s+|dentro de\s+|adentro de\s+)(.+)$/,
  );
  if (zoneMatch) {
    const zoneName = zoneMatch[1]!
      .replace(/^(?:las?|los|el|una?)\s+/, "")
      .trim();
    const containers = zoneName ? matchObjectsByName(context, zoneName) : [];
    const inside = new Map<string, CadBox>();
    for (const c of containers) {
      for (const o of context.objects) {
        if (containers.some((k) => k.id === o.id)) continue;
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        if (cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h)
          inside.set(o.id, o);
      }
    }
    return [...inside.values()];
  }
  const candidates = [fold(raw), fold(raw).replace(/es$/, ""), fold(raw).replace(/s$/, "")];
  for (const needle of candidates) {
    if (!needle) continue;
    const hits = context.objects.filter((o) =>
      fold(`${o.label} ${o.kind ?? ""}`).includes(needle),
    );
    if (hits.length) return hits;
  }
  // Objetivos compuestos (AXOS-CAD-NAME-006): 'las mesas y las sillas'.
  // Solo como fallback — un label que contenga ' y ' literal gana arriba.
  const parts = raw
    .split(/\s*,\s*|\s+y\s+/i)
    .map((t) => t.replace(/^(?:las?|los|el|una?)\s+/i, "").trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const seen = new Map<string, CadBox>();
    for (const part of parts) {
      for (const o of matchObjectsByName(context, part)) seen.set(o.id, o);
    }
    return [...seen.values()];
  }
  return [];
}

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
  if (target?.trim()) {
    // Mismo matching que contar/seleccionar (AXOS-CAD-NAME-003): plural
    // plegado ('borra las mesas'), acentos y 'todo' = plano completo.
    return { objs: matchObjectsByName(context, target), usedTarget: true };
  }
  return {
    objs: context.selectedIds
      .map((id) => context.objects.find((o) => o.id === id))
      .filter((o): o is CadBox => !!o),
    usedTarget: false,
  };
}
