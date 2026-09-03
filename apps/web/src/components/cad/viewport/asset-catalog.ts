/**
 * Catálogo canónico de objetos que se pueden soltar en el plano — la única
 * fuente de verdad que comparten el editor 2D (rectángulos `fabric`) y el
 * editor CAD 3D (mallas `three`). Una sola lista evita que las dos vistas se
 * separen en dimensiones, colores o vocabulario.
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
  | "table" // workbench: top slab on legs
  | "shelf" // rack: uprights + horizontal shelves
  | "arm" // robot: base + articulated segments
  | "machine" // generic process machine: body + top + panel
  | "wall" // tall thin partition
  | "door" // architectural door / opening marker
  | "zone" // flat floor tint (keep-out / area)
  | "column" // structural cylinder pillar
  | "pallet" // low slatted platform
  | "fence" // safety railing: posts + rails
  | "person" // operator: stylised capsule figure
  | "cabinet" // tall electrical cabinet / locker
  | "desk" // workstation desk with a monitor
  | "bin" // open-top tote / scrap bin
  | "gantry" // overhead crane / gantry: legs + top beam
  | "path"; // franja de piso (andador, eje, ruta marcada)

/** Broad grouping used to organise the palette into sections. */
export type AssetCategory =
  | "proceso"
  | "soporte"
  | "estructura"
  | "zona"
  | "seguridad"
  | "utilidades"
  | "persona";

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
 * El catálogo. Las primeras entradas conservan las dimensiones y colores exactos
 * con los que salió el editor 2D, para que los dibujos existentes se vean igual.
 *
 * NOTA DE COMPATIBILIDAD: el campo `kind` se PERSISTE en los documentos. Quitar
 * una entrada no borra los objetos ya guardados con ese `kind`: `assetMeta()`
 * cae a la primera entrada del catálogo y el objeto se sigue dibujando, sólo que
 * con la apariencia genérica. Nunca se renombra un `kind`; sí se renombra su
 * `label`, que es sólo texto de interfaz. Ver IDENTITY.md.
 */
export const ASSET_CATALOG: AssetDef[] = [
  // ── Proceso ────────────────────────────────────────────────────────────────
  {
    kind: "workbench",
    label: "Mesa",
    color: "#3b82f6",
    fill: "rgba(59,130,246,0.10)",
    w: 1200,
    h: 800,
    height: 900,
    archetype: "table",
    category: "soporte",
  },
  {
    kind: "rack",
    label: "Estante",
    color: "#f59e0b",
    fill: "rgba(245,158,11,0.10)",
    w: 900,
    h: 450,
    height: 2000,
    archetype: "shelf",
    category: "soporte",
  },
  {
    kind: "robot",
    label: "Robot",
    color: "#ef4444",
    fill: "rgba(239,68,68,0.10)",
    w: 700,
    h: 700,
    height: 1400,
    archetype: "arm",
    category: "proceso",
  },
  {
    kind: "oven",
    label: "Horno",
    color: "#f97316",
    fill: "rgba(249,115,22,0.10)",
    w: 1800,
    h: 900,
    height: 1500,
    archetype: "machine",
    category: "proceso",
  },
  {
    kind: "printer",
    label: "Impresora",
    color: "#64748b",
    fill: "rgba(100,116,139,0.10)",
    w: 600,
    h: 500,
    height: 1200,
    archetype: "machine",
    category: "proceso",
  },
  {
    kind: "machine",
    label: "Máquina CNC",
    color: "#475569",
    fill: "rgba(71,85,105,0.12)",
    w: 1500,
    h: 1200,
    height: 1800,
    archetype: "machine",
    category: "proceso",
  },
  {
    kind: "gantry",
    label: "Grúa puente",
    color: "#0ea5e9",
    fill: "rgba(14,165,233,0.10)",
    w: 4000,
    h: 600,
    height: 3200,
    archetype: "gantry",
    category: "proceso",
  },
  // ── Soporte ────────────────────────────────────────────────────────────────
  {
    kind: "cabinet",
    label: "Gabinete",
    color: "#0f766e",
    fill: "rgba(15,118,110,0.12)",
    w: 800,
    h: 600,
    height: 2000,
    archetype: "cabinet",
    category: "soporte",
  },
  {
    kind: "pallet",
    label: "Tarima",
    color: "#b45309",
    fill: "rgba(180,83,9,0.14)",
    w: 1200,
    h: 1000,
    height: 150,
    archetype: "pallet",
    category: "soporte",
  },
  {
    kind: "desk",
    label: "Escritorio",
    color: "#2563eb",
    fill: "rgba(37,99,235,0.10)",
    w: 1400,
    h: 700,
    height: 1150,
    archetype: "desk",
    category: "soporte",
  },
  {
    kind: "bin",
    label: "Contenedor",
    color: "#65a30d",
    fill: "rgba(101,163,13,0.12)",
    w: 800,
    h: 600,
    height: 700,
    archetype: "bin",
    category: "soporte",
  },
  {
    kind: "safety",
    label: "Punto de seguridad",
    color: "#dc2626",
    fill: "rgba(220,38,38,0.12)",
    w: 600,
    h: 400,
    height: 1500,
    archetype: "cabinet",
    category: "soporte",
  },
  // ── Estructura ─────────────────────────────────────────────────────────────
  {
    kind: "wall",
    label: "Muro",
    color: "#94a3b8",
    fill: "rgba(148,163,184,0.20)",
    w: 3000,
    h: 150,
    height: 3000,
    archetype: "wall",
    category: "estructura",
  },
  {
    kind: "column",
    label: "Columna",
    color: "#6b7280",
    fill: "rgba(107,114,128,0.18)",
    w: 400,
    h: 400,
    height: 3200,
    archetype: "column",
    category: "estructura",
  },
  {
    kind: "door",
    label: "Puerta",
    color: "#38bdf8",
    fill: "rgba(56,189,248,0.14)",
    w: 1000,
    h: 140,
    height: 2200,
    archetype: "door",
    category: "estructura",
  },
  {
    kind: "fence",
    label: "Barrera",
    color: "#eab308",
    fill: "rgba(234,179,8,0.16)",
    w: 2000,
    h: 120,
    height: 1100,
    archetype: "fence",
    category: "estructura",
  },
  // ── Safety / EHS ───────────────────────────────────────────────────────────
  {
    kind: "fire_extinguisher",
    label: "Extintor",
    color: "#dc2626",
    fill: "rgba(220,38,38,0.14)",
    w: 450,
    h: 350,
    height: 1400,
    archetype: "cabinet",
    category: "seguridad",
  },
  {
    kind: "eyewash",
    label: "Lavaojos",
    color: "#059669",
    fill: "rgba(5,150,105,0.12)",
    w: 700,
    h: 500,
    height: 1400,
    archetype: "cabinet",
    category: "seguridad",
  },
  {
    kind: "emergency_exit",
    label: "Salida emerg.",
    color: "#16a34a",
    fill: "rgba(22,163,74,0.12)",
    w: 2500,
    h: 900,
    height: 1,
    archetype: "path",
    category: "seguridad",
  },
  {
    kind: "first_aid",
    label: "Primeros aux.",
    color: "#22c55e",
    fill: "rgba(34,197,94,0.12)",
    w: 650,
    h: 450,
    height: 1500,
    archetype: "cabinet",
    category: "seguridad",
  },
  {
    kind: "spill_kit",
    label: "Kit derrames",
    color: "#f59e0b",
    fill: "rgba(245,158,11,0.14)",
    w: 700,
    h: 550,
    height: 900,
    archetype: "bin",
    category: "seguridad",
  },
  {
    kind: "ppe_station",
    label: "Equipo de protección",
    color: "#2563eb",
    fill: "rgba(37,99,235,0.12)",
    w: 900,
    h: 450,
    height: 1800,
    archetype: "cabinet",
    category: "seguridad",
  },
  // ── Utilities ──────────────────────────────────────────────────────────────
  {
    kind: "power_panel",
    label: "Panel electrico",
    color: "#334155",
    fill: "rgba(51,65,85,0.14)",
    w: 800,
    h: 350,
    height: 1800,
    archetype: "cabinet",
    category: "utilidades",
  },
  {
    kind: "compressed_air",
    label: "Aire compr.",
    color: "#0284c7",
    fill: "rgba(2,132,199,0.12)",
    w: 500,
    h: 500,
    height: 1600,
    archetype: "column",
    category: "utilidades",
  },
  {
    kind: "network_drop",
    label: "Red / datos",
    color: "#7c3aed",
    fill: "rgba(124,58,237,0.12)",
    w: 500,
    h: 350,
    height: 1200,
    archetype: "cabinet",
    category: "utilidades",
  },
  {
    kind: "maintenance_area",
    label: "Área de servicio",
    color: "#64748b",
    fill: "rgba(100,116,139,0.10)",
    w: 2400,
    h: 1800,
    height: 1,
    archetype: "zone",
    category: "utilidades",
  },
  {
    kind: "tool_crib",
    label: "Bodega de herramienta",
    color: "#92400e",
    fill: "rgba(146,64,14,0.12)",
    w: 1800,
    h: 900,
    height: 2000,
    archetype: "shelf",
    category: "utilidades",
  },
  // ── Zona / Persona ─────────────────────────────────────────────────────────
  {
    kind: "room",
    label: "Cuarto / area",
    color: "#14b8a6",
    fill: "rgba(20,184,166,0.08)",
    w: 5000,
    h: 4000,
    height: 1,
    archetype: "zone",
    category: "zona",
  },
  {
    kind: "zone",
    label: "Zona",
    color: "#0ea5e9",
    fill: "rgba(14,165,233,0.06)",
    w: 3000,
    h: 2000,
    height: 1,
    archetype: "zone",
    category: "zona",
  },
  {
    kind: "operator",
    label: "Persona",
    color: "#22c55e",
    fill: "rgba(34,197,94,0.12)",
    w: 600,
    h: 600,
    height: 1750,
    archetype: "person",
    category: "persona",
  },
];

const BY_KIND = new Map(ASSET_CATALOG.map((d) => [d.kind, d]));

/** Look up an asset definition; falls back to the first entry for unknown kinds. */
export function assetMeta(kind: string): AssetDef {
  return BY_KIND.get(kind) ?? ASSET_CATALOG[0];
}

/**
 * Qué volumen levanta un objeto de planta en 3D, o `null`.
 *
 * `assetMeta` cae al primer arquetipo cuando el `kind` no está, y para DIBUJAR
 * eso es razonable —algo hay que enseñar—. Para APLANAR no lo es: un objeto de
 * un `kind` desconocido saldría en el alzado con la altura de otra cosa, que es
 * un plano plausible y equivocado. Aquí se responde `null` y quien pregunta lo
 * cuenta como excluido (`flatshot-solids.ts`).
 *
 * `opening` marca lo que en un plano es un HUECO. Hoy sólo la puerta: es el
 * único arquetipo del catálogo que atraviesa un muro. Una ventana sería la
 * siguiente, y el día que exista bastará con marcarla aquí.
 */
export function cadObjectVolume(
  kind: string,
): { height: number; opening?: boolean } | null {
  const definition = BY_KIND.get(kind);
  if (!definition || !(definition.height > 0)) return null;
  return definition.archetype === "door"
    ? { height: definition.height, opening: true }
    : { height: definition.height };
}

/** Catalog grouped by category, preserving declaration order — for palettes. */
export const ASSET_CATEGORIES: {
  category: AssetCategory;
  label: string;
  items: AssetDef[];
}[] = (() => {
  const order: { category: AssetCategory; label: string }[] = [
    { category: "proceso", label: "Equipo" },
    { category: "soporte", label: "Soporte" },
    { category: "estructura", label: "Estructura" },
    { category: "seguridad", label: "Seguridad / EHS" },
    { category: "utilidades", label: "Utilidades" },
    { category: "zona", label: "Zonas" },
    { category: "persona", label: "Personas" },
  ];
  return order.map((o) => ({
    ...o,
    items: ASSET_CATALOG.filter((d) => d.category === o.category),
  }));
})();
