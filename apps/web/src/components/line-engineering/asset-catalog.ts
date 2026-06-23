/**
 * Canonical catalog of non-station equipment/assets that can be dropped on the
 * plant layout — the single source of truth shared by the 2D editor (`fabric`
 * rectangles) and the 3D CAD editor (`three` meshes). Keeping one list avoids
 * the two views drifting apart on dimensions, colours or vocabulary.
 *
 * Pure data only — NO `three` import here, so the lightweight 2D editor can
 * consume the catalog without pulling the 3D engine into its bundle. The 3D
 * mesh factory lives in the lazy 3D chunk and reads `archetype`/`height` from
 * here to build the geometry.
 *
 * Every dimension/height is expressed in the layout's working unit (mm by
 * default), matching how stations and the footprint are stored.
 */

/** The 3D shape family used to build an asset's mesh in the CAD editor. */
export type AssetArchetype =
  | 'table' // workbench: top slab on legs
  | 'belt' // conveyor: belt deck with side rails + rollers
  | 'shelf' // rack: uprights + horizontal shelves
  | 'arm' // robot: base + articulated segments
  | 'machine' // generic process machine: body + top + panel
  | 'wall' // tall thin partition
  | 'zone' // flat floor tint (keep-out / area)
  | 'column' // structural cylinder pillar
  | 'pallet' // low slatted platform
  | 'fence' // safety railing: posts + rails
  | 'cart' // AGV / mobile cart: low rounded body
  | 'person' // operator: stylised capsule figure
  | 'cabinet' // tall electrical cabinet / locker
  | 'path'; // floor lane stripe (AGV route)

/** Broad grouping used to organise the palette into sections. */
export type AssetCategory =
  | 'proceso'
  | 'soporte'
  | 'estructura'
  | 'logística'
  | 'zona'
  | 'persona';

export interface AssetDef {
  kind: string;
  label: string;
  /** Primary colour (hex) — shared by the 2D fill stroke and the 3D material. */
  color: string;
  /** Translucent fill used by the 2D editor. */
  fill: string;
  /** Default footprint width (X) in unit. */
  w: number;
  /** Default footprint depth (Y) in unit. */
  h: number;
  /** Default extruded height (Z) in unit — ~0 for flat zones/paths. */
  height: number;
  archetype: AssetArchetype;
  category: AssetCategory;
}

/**
 * The catalog. The first nine entries preserve the exact dimensions/colours the
 * 2D editor shipped with (Fase 5) so existing layouts render identically; the
 * rest extend the library toward a full factory-floor CAD vocabulary.
 */
export const ASSET_CATALOG: AssetDef[] = [
  // ── Proceso ────────────────────────────────────────────────────────────────
  { kind: 'workbench', label: 'Mesa', color: '#3b82f6', fill: 'rgba(59,130,246,0.10)', w: 1200, h: 800, height: 900, archetype: 'table', category: 'soporte' },
  { kind: 'conveyor', label: 'Transportador', color: '#7c3aed', fill: 'rgba(124,58,237,0.10)', w: 2400, h: 500, height: 850, archetype: 'belt', category: 'proceso' },
  { kind: 'rack', label: 'Rack', color: '#f59e0b', fill: 'rgba(245,158,11,0.10)', w: 900, h: 450, height: 2000, archetype: 'shelf', category: 'soporte' },
  { kind: 'robot', label: 'Robot', color: '#ef4444', fill: 'rgba(239,68,68,0.10)', w: 700, h: 700, height: 1400, archetype: 'arm', category: 'proceso' },
  { kind: 'aoi', label: 'AOI', color: '#10b981', fill: 'rgba(16,185,129,0.10)', w: 900, h: 700, height: 1600, archetype: 'machine', category: 'proceso' },
  { kind: 'oven', label: 'Horno', color: '#f97316', fill: 'rgba(249,115,22,0.10)', w: 1800, h: 900, height: 1500, archetype: 'machine', category: 'proceso' },
  { kind: 'printer', label: 'Impresora', color: '#64748b', fill: 'rgba(100,116,139,0.10)', w: 600, h: 500, height: 1200, archetype: 'machine', category: 'proceso' },
  { kind: 'machine', label: 'Máquina CNC', color: '#475569', fill: 'rgba(71,85,105,0.12)', w: 1500, h: 1200, height: 1800, archetype: 'machine', category: 'proceso' },
  // ── Soporte ────────────────────────────────────────────────────────────────
  { kind: 'cabinet', label: 'Gabinete', color: '#0f766e', fill: 'rgba(15,118,110,0.12)', w: 800, h: 600, height: 2000, archetype: 'cabinet', category: 'soporte' },
  { kind: 'pallet', label: 'Tarima', color: '#b45309', fill: 'rgba(180,83,9,0.14)', w: 1200, h: 1000, height: 150, archetype: 'pallet', category: 'soporte' },
  // ── Estructura ─────────────────────────────────────────────────────────────
  { kind: 'wall', label: 'Muro', color: '#94a3b8', fill: 'rgba(148,163,184,0.20)', w: 3000, h: 150, height: 3000, archetype: 'wall', category: 'estructura' },
  { kind: 'column', label: 'Columna', color: '#6b7280', fill: 'rgba(107,114,128,0.18)', w: 400, h: 400, height: 3200, archetype: 'column', category: 'estructura' },
  { kind: 'fence', label: 'Barrera', color: '#eab308', fill: 'rgba(234,179,8,0.16)', w: 2000, h: 120, height: 1100, archetype: 'fence', category: 'estructura' },
  // ── Logística ──────────────────────────────────────────────────────────────
  { kind: 'agv', label: 'AGV', color: '#06b6d4', fill: 'rgba(6,182,212,0.12)', w: 1200, h: 800, height: 350, archetype: 'cart', category: 'logística' },
  { kind: 'agvpath', label: 'Ruta AGV', color: '#14b8a6', fill: 'rgba(20,184,166,0.10)', w: 4000, h: 300, height: 1, archetype: 'path', category: 'logística' },
  // ── Zona / Persona ─────────────────────────────────────────────────────────
  { kind: 'zone', label: 'Zona', color: '#0ea5e9', fill: 'rgba(14,165,233,0.06)', w: 3000, h: 2000, height: 1, archetype: 'zone', category: 'zona' },
  { kind: 'operator', label: 'Operador', color: '#22c55e', fill: 'rgba(34,197,94,0.12)', w: 600, h: 600, height: 1750, archetype: 'person', category: 'persona' },
];

const BY_KIND = new Map(ASSET_CATALOG.map((d) => [d.kind, d]));

/** Look up an asset definition; falls back to the first entry for unknown kinds. */
export function assetMeta(kind: string): AssetDef {
  return BY_KIND.get(kind) ?? ASSET_CATALOG[0];
}

/** Catalog grouped by category, preserving declaration order — for palettes. */
export const ASSET_CATEGORIES: { category: AssetCategory; label: string; items: AssetDef[] }[] = (() => {
  const order: { category: AssetCategory; label: string }[] = [
    { category: 'proceso', label: 'Proceso' },
    { category: 'soporte', label: 'Soporte' },
    { category: 'estructura', label: 'Estructura' },
    { category: 'logística', label: 'Logística' },
    { category: 'zona', label: 'Zonas' },
    { category: 'persona', label: 'Personas' },
  ];
  return order.map((o) => ({ ...o, items: ASSET_CATALOG.filter((d) => d.category === o.category) }));
})();
