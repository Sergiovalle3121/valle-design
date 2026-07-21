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
  // Objetivo por proximidad (AXOS-CAD-ZONE-002): 'lo que está cerca de
  // la mesa' / 'junto a la mesa' — separación caja-a-caja ≤ 1000 mm,
  // excluyendo al ancla misma. Con varias anclas ('las mesas') se une
  // la vecindad de todas.
  const NEAR_GAP = 1000;
  const nearMatch = fold(raw).match(
    /^(?:tod[oa]s?\s+)?(?:l[oa]s? que\s+(?:esta|estan|este|esten|hay)\s+)?(?:cerca del?|junto al?|alrededor del?)\s+(.+)$/,
  );
  if (nearMatch) {
    const anchorName = nearMatch[1]!
      .replace(/^(?:las?|los|el|una?)\s+/, "")
      .trim();
    const anchors = anchorName ? matchObjectsByName(context, anchorName) : [];
    const anchorIds = new Set(anchors.map((a) => a.id));
    const near = new Map<string, CadBox>();
    for (const a of anchors) {
      for (const o of context.objects) {
        if (anchorIds.has(o.id)) continue;
        const gapX = Math.max(0, Math.max(a.x - (o.x + o.w), o.x - (a.x + a.w)));
        const gapY = Math.max(0, Math.max(a.y - (o.y + o.h), o.y - (a.y + a.h)));
        if (Math.max(gapX, gapY) <= NEAR_GAP) near.set(o.id, o);
      }
    }
    return [...near.values()];
  }
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
  // Superlativos (AXOS-CAD-NAME-007): 'la mesa más grande' / 'el mueble
  // más pequeño' — resuelve el nombre base y se queda con la coincidencia
  // de mayor/menor área. Si el base no existe, cae al matching normal
  // (un label literal con 'más grande' aún puede ganar abajo).
  const superM = fold(raw).match(
    /^(.+?)\s+mas\s+(grande|amplio|amplia|chic[oa]|pequen[oa])$/,
  );
  if (superM) {
    const base = superM[1]!.replace(/^(?:las?|los|el|una?)\s+/, "").trim();
    const baseHits = base ? matchObjectsByName(context, base) : [];
    if (baseHits.length) {
      const wantLargest = /grande|amplio|amplia/.test(superM[2]!);
      const sorted = [...baseHits].sort((a, b) => b.w * b.h - a.w * a.h);
      return [wantLargest ? sorted[0]! : sorted[sorted.length - 1]!];
    }
  }
  // Ordinales (AXOS-CAD-NAME-008): 'la primera mesa' / 'la última silla'
  // — resuelve el base y escoge por orden del plano; un índice fuera de
  // rango cae al error de objetivo no encontrado del comando.
  const ordM = fold(raw).match(
    /^(?:l[ao]s?\s+)?(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|ultim[oa])\s+(.+)$/,
  );
  if (ordM) {
    const base = ordM[2]!.trim();
    const baseHits = base ? matchObjectsByName(context, base) : [];
    if (baseHits.length) {
      const word = ordM[1]!;
      const idx = /ultim/.test(word)
        ? baseHits.length - 1
        : /segund/.test(word)
          ? 1
          : /tercer/.test(word)
            ? 2
            : /cuart/.test(word)
              ? 3
              : 0;
      const pick = baseHits[idx];
      return pick ? [pick] : [];
    }
  }
  const candidates = [fold(raw), fold(raw).replace(/es$/, ""), fold(raw).replace(/s$/, "")];
  for (const needle of candidates) {
    if (!needle) continue;
    const hits = context.objects.filter((o) =>
      fold(`${o.label} ${o.kind ?? ""}`).includes(needle),
    );
    if (hits.length) return hits;
  }
  // Posesivo de zona (AXOS-CAD-ZONE-004): 'las mesas de la cocina' — las
  // coincidencias del nombre cuyo centro cae dentro del cuarto nombrado.
  // Solo cuando el matching directo falló: 'Mesa de corte' literal gana.
  const possM = raw.match(/^(.+?)\s+del?\s+(?:l[oa]s?\s+|el\s+|la\s+)?(.+)$/i);
  if (possM) {
    const baseHits = matchObjectsByName(context, possM[1]!.trim());
    const zones = matchObjectsByName(context, possM[2]!.trim()).filter((z) =>
      ["room", "zone"].includes(z.kind ?? ""),
    );
    if (baseHits.length && zones.length) {
      const insideZone = baseHits.filter((o) =>
        zones.some((z) => {
          if (z.id === o.id) return false;
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
        }),
      );
      if (insideZone.length) return insideZone;
    }
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
