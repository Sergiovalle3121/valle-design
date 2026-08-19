/**
 * Objetivo por nombre (VD-CAD-NAME-001): resuelve sobre qué objetos actúa
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
  // Entre dos anclas (VD-CAD-ZONE-005): 'lo que está entre la mesa y
  // la puerta' — el sobre que abarca ambas anclas; entran los objetos
  // no-contenedor con centro dentro, nunca las anclas mismas.
  const betweenM = fold(raw).match(
    /^(?:tod[oa]s?\s+)?(?:l[oa]s? que\s+(?:esta|estan|este|esten|hay)\s+)?entre\s+(.+)$/,
  );
  if (betweenM) {
    const pair = betweenM[1]!
      .split(/\s+y\s+/)
      .map((t) => t.replace(/^(?:las?|los|el|una?)\s+/, "").trim())
      .filter(Boolean);
    if (pair.length === 2) {
      const hitsA = matchObjectsByName(context, pair[0]!);
      const a = hitsA[0];
      const b = a
        ? matchObjectsByName(context, pair[1]!).find((o) => o.id !== a.id)
        : undefined;
      if (a && b) {
        const minX = Math.min(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x + a.w, b.x + b.w);
        const maxY = Math.max(a.y + a.h, b.y + b.h);
        const CONTAINERS = new Set(["room", "zone", "wall"]);
        return context.objects.filter((o) => {
          if (o.id === a.id || o.id === b.id) return false;
          if (CONTAINERS.has(o.kind ?? "")) return false;
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
        });
      }
      return [];
    }
  }
  // Objetivo por proximidad (VD-CAD-ZONE-002): 'lo que está cerca de
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
  // Objetivo por contención (VD-CAD-ZONE-001): 'lo que está en la
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
  // Cardinales (VD-CAD-NAME-010): 'dos sillas' / '3 mesas' — las
  // primeras N coincidencias en orden del plano; pedir más de las que
  // hay cae al error de objetivo no encontrado del comando. Si el base
  // no existe, sigue el matching normal (labels con número al frente).
  const cardM = fold(raw).match(
    /^(\d{1,2}|dos|tres|cuatro|cinco|seis)\s+(.+)$/,
  );
  if (cardM) {
    const word = cardM[1]!;
    const n = /^\d/.test(word)
      ? Number(word)
      : ({ dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 } as const)[
          word as "dos" | "tres" | "cuatro" | "cinco" | "seis"
        ] ?? 0;
    const baseHits = matchObjectsByName(context, cardM[2]!.trim());
    if (n > 0 && baseHits.length) {
      return baseHits.length >= n ? baseHits.slice(0, n) : [];
    }
  }
  // Más cercano (VD-CAD-NAME-009): 'la silla más cercana a la puerta'
  // — resuelve base y ancla y escoge la coincidencia con centro más
  // próximo; si base o ancla no existen, cae al matching normal.
  const nearestM = fold(raw).match(
    /^(.+?)\s+mas\s+cercan[oa]s?\s+(?:a\s+la\s+|al\s+|a\s+el\s+|a\s+)(.+)$/,
  );
  if (nearestM) {
    const baseHits = matchObjectsByName(context, nearestM[1]!.trim());
    const anchors = matchObjectsByName(
      context,
      nearestM[2]!.replace(/^(?:las?|los|el|una?)\s+/, "").trim(),
    ).filter((a) => !baseHits.some((b) => b.id === a.id));
    if (baseHits.length && anchors.length) {
      const a = anchors[0]!;
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;
      const sorted = [...baseHits].sort((p, q) => {
        const dp = (p.x + p.w / 2 - acx) ** 2 + (p.y + p.h / 2 - acy) ** 2;
        const dq = (q.x + q.w / 2 - acx) ** 2 + (q.y + q.h / 2 - acy) ** 2;
        return dp - dq;
      });
      return [sorted[0]!];
    }
  }
  // Superlativos (VD-CAD-NAME-007): 'la mesa más grande' / 'el mueble
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
  // Ordinales (VD-CAD-NAME-008): 'la primera mesa' / 'la última silla'
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
  // Artículos y colas de preposición (VD-CAD-NAME-011). El banco de calidad
  // NL→CAD midió que siete instrucciones perfectamente normales morían aquí:
  // el parser entrega el objetivo con el artículo pegado —'el muro de fachada',
  // 'del patio trasero', 'la sala-comedor'— o con la cola de la frase colgando
  // —'castillos a la' de «alinea los castillos a la izquierda»—, y como este
  // matching es por SUBSTRING, 'el muro de fachada' no está dentro de 'Muro de
  // fachada'. El objeto existía, el usuario lo nombró bien y el producto decía
  // que no lo encontraba.
  //
  // Las variantes limpias van AL FINAL de la lista, nunca al principio: un
  // rótulo que literalmente se llame 'La Cochera' tiene que seguir ganando con
  // su texto exacto. Sólo se prueban cuando el matching de siempre ya falló, así
  // que esto no puede cambiar ninguna resolución que hoy acierte.
  const base = fold(raw);
  const trimmed = base
    .replace(/^(?:el|la|los|las|un|una|unos|unas|del|de\s+l[ao]s?|de)\s+/, "")
    .replace(/\s+(?:a\s+l[ao]s?|al|a|hacia|hasta|del?|y|con|en|para)$/, "")
    .trim();
  const candidates = [base, base.replace(/es$/, ""), base.replace(/s$/, "")];
  if (trimmed && trimmed !== base)
    candidates.push(
      trimmed,
      trimmed.replace(/es$/, ""),
      trimmed.replace(/s$/, ""),
    );
  for (const needle of candidates) {
    if (!needle) continue;
    const hits = context.objects.filter((o) =>
      fold(`${o.label} ${o.kind ?? ""}`).includes(needle),
    );
    if (hits.length) return hits;
  }
  // Posesivo de zona (VD-CAD-ZONE-004): 'las mesas de la cocina' — las
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
  // Objetivos compuestos (VD-CAD-NAME-006): 'las mesas y las sillas'.
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
    // Mismo matching que contar/seleccionar (VD-CAD-NAME-003): plural
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
