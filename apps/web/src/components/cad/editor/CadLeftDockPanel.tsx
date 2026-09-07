"use client";

import dynamic from "next/dynamic";
import type { RefObject } from "react";
import {
  Boxes,
  BrickWall,
  ChevronRight,
  MapPin,
  PanelLeft,
  PanelLeftClose,
  Trash2,
} from "lucide-react";
import { ASSET_CATEGORIES } from "@/components/cad/viewport/asset-catalog";
import {
  CAD_SYMBOL_LIBRARY,
  type CadSymbolCategory,
  type CadSymbolDefinition,
} from "@/lib/cad/symbols";
import type { CadWorkspacePreferences } from "@/lib/cad/cad-workspace";
import type { CadLayoutTemplateId } from "@/lib/cad/templates";
import type { St, CadBlockRow } from "@/components/cad/editor/Layout3DEditor";

// Carga diferida REAL del catálogo de plantillas: la tarjeta (y con ella las
// 149 plantillas de @/lib/cad/templates) sólo se descarga cuando el panel la
// pinta. Sin SSR: es UI interna del estudio, que ya entra por next/dynamic.
const CadTemplateChooserCard = dynamic(
  () => import("@/components/cad/editor/CadTemplateChooserCard"),
  {
    ssr: false,
    loading: () => (
      <p className="mb-3 type-micro text-muted-foreground">
        Cargando plantillas…
      </p>
    ),
  },
);

/**
 * EL DOCK IZQUIERDO. Extraído de `Layout3DEditor.tsx` con el mismo propósito
 * que `CadToolPalette` y `CadTemplateChooserCard`: el monolito tiene un
 * trinquete de tamaño que SÓLO BAJA (`scripts/cad/monolith-budget.json`,
 * AGENTS.md "Delicate files") — cualquier mejora ahí dentro se paga sacando
 * código, no añadiéndolo. Este panel es puramente presentacional/controlado:
 * todo el estado (`workspacePreferences`, `tab`, los catálogos filtrados) y
 * toda la lógica de negocio (guardar un bloque, aplicar una plantilla, crear
 * un activo) siguen viviendo en el editor; aquí sólo se pintan y se invocan
 * por prop. Ningún `data-testid` cambia de valor — varios tienen un lock de
 * los goldens 211-213.
 *
 * EL RIEL (`leftDockCollapsed`). `leftDock` ya apaga el dock entero desde
 * «Workspace profesional», pero está enterrado en un panel de ajustes y
 * OCULTA, no angosta — nadie lo encuentra a media sesión de dibujo para
 * recuperar un cuarto de pantalla. El botón `cad-left-dock-toggle` vive donde
 * se ve, siempre: colapsa el dock a 2,25rem (un icono) y el mismo control lo
 * vuelve a abrir.
 */
export function CadLeftDockPanel({
  focusMode,
  leftDock,
  leftDockCollapsed,
  workspacePreferencesRef,
  updateWorkspacePreferences,
  hasStations,
  tab,
  setTab,
  tray,
  placeStation,
  applyCadTemplate,
  cadBlocks,
  saveSelectionAsBlock,
  insertCadBlock,
  deleteCadBlock,
  tool,
  toggleWall,
  addArchitectureAsset,
  createSafetyZoneAsset,
  createSafetyPathAsset,
  filteredSymbols,
  symbolSearch,
  setSymbolSearch,
  symbolCategories,
  symbolCategory,
  setSymbolCategory,
  addCadSymbol,
  addAsset,
}: {
  focusMode: boolean;
  leftDock: boolean;
  leftDockCollapsed: boolean;
  workspacePreferencesRef: RefObject<CadWorkspacePreferences>;
  updateWorkspacePreferences: (next: CadWorkspacePreferences) => void;
  /** `(data?.stations.length ?? 0) > 0` — hay estaciones heredadas en el documento. */
  hasStations: boolean;
  tab: "stations" | "equipment";
  setTab: (tab: "stations" | "equipment") => void;
  tray: St[];
  placeStation: (station: St) => void;
  applyCadTemplate: (templateId: CadLayoutTemplateId) => void | Promise<void>;
  cadBlocks: CadBlockRow[];
  saveSelectionAsBlock: () => void | Promise<void>;
  insertCadBlock: (block: CadBlockRow) => void;
  deleteCadBlock: (block: CadBlockRow) => void | Promise<void>;
  tool: string;
  toggleWall: () => void;
  addArchitectureAsset: (kind: "column" | "door" | "room") => void;
  createSafetyZoneAsset: (kind: "no-go" | "restricted" | "esd") => void;
  createSafetyPathAsset: (kind: "circulation" | "emergency") => void;
  filteredSymbols: CadSymbolDefinition[];
  symbolSearch: string;
  setSymbolSearch: (value: string) => void;
  symbolCategories: Array<CadSymbolCategory | "all">;
  symbolCategory: CadSymbolCategory | "all";
  setSymbolCategory: (category: CadSymbolCategory | "all") => void;
  addCadSymbol: (symbolId: string) => void;
  addAsset: (kind: string) => void;
}) {
  return (
    <div
      data-testid="cad-left-dock"
      data-collapsed={leftDockCollapsed ? "true" : "false"}
      className={`${leftDockCollapsed ? "w-9" : "w-60"} shrink-0 border-r border-border bg-surface/90 text-foreground flex-col max-[1100px]:hidden ${focusMode || !leftDock ? "hidden" : "flex"}`}
    >
      {leftDock && (leftDockCollapsed ? (
        <button
          type="button"
          data-testid="cad-left-dock-toggle"
          onClick={() =>
            updateWorkspacePreferences({
              ...workspacePreferencesRef.current,
              leftDockCollapsed: false,
            })
          }
          title="Mostrar la biblioteca"
          aria-label="Mostrar la biblioteca"
          aria-expanded={false}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeft aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : (
        <>
          {/* La pestaña "Puntos heredados" SÓLO aparece cuando el
              documento cargado de verdad trae estaciones de un plano
              del antiguo planificador industrial (columna `stations`
              del esquema, ver IDENTITY.md). Un plano nuevo no tiene
              "puntos por colocar" — eso era la bandeja de estaciones
              de una línea de manufactura, y ofrecerla a un arquitecto
              que abre un documento en blanco es exactamente la clase
              de vocabulario que este repositorio prohíbe (AGENTS.md,
              "Domain boundary — no industrial management"). */}
          <div className="flex shrink-0 type-caption font-medium border-b border-border">
            {hasStations && (
              <button
                onClick={() => setTab("stations")}
                className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === "stations" ? "text-foreground bg-muted/60" : "text-muted-foreground dark:text-muted-foreground hover:text-foreground"}`}
              >
                <MapPin className="w-3.5 h-3.5" /> Puntos heredados
              </button>
            )}
            <button
              onClick={() => setTab("equipment")}
              className={`flex-1 px-3 py-2 inline-flex items-center justify-center gap-1.5 ${tab === "equipment" ? "text-foreground bg-muted/60" : "text-muted-foreground dark:text-muted-foreground hover:text-foreground"}`}
            >
              <Boxes className="w-3.5 h-3.5" /> Biblioteca
            </button>
            <button
              type="button"
              data-testid="cad-left-dock-toggle"
              onClick={() =>
                updateWorkspacePreferences({
                  ...workspacePreferencesRef.current,
                  leftDockCollapsed: true,
                })
              }
              title="Colapsar la biblioteca"
              aria-label="Colapsar la biblioteca"
              aria-expanded={true}
              className="shrink-0 px-2 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tab === "stations" && hasStations ? (
              <>
                <div className="type-micro uppercase tracking-wide text-muted-foreground dark:text-muted-foreground mb-2">
                  Marcadores heredados por colocar ({tray.length})
                </div>
                {tray.length === 0 ? (
                  <p className="type-caption text-muted-foreground">
                    Todos los marcadores heredados están en el plano.
                  </p>
                ) : (
                  tray.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => placeStation(st)}
                      className="w-full text-left mb-1.5 px-2.5 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <div className="text-sm font-medium">{st.station}</div>
                      <div className="type-micro text-muted-foreground dark:text-muted-foreground">
                        {st.line} · clic para colocar
                      </div>
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                <CadTemplateChooserCard
                  onApply={(templateId) => void applyCadTemplate(templateId)}
                />
                <div className="mb-3 rounded-xl border border-violet-400/15 bg-violet-400/[0.05] p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 type-micro uppercase tracking-wide text-violet-200">
                      <Boxes className="h-3.5 w-3.5" /> Mis bloques
                    </div>
                    <span className="type-micro text-violet-100/60">
                      {cadBlocks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => void saveSelectionAsBlock()}
                    title="Guarda los equipos seleccionados como bloque reutilizable — disponible en todos los layouts"
                    className="mb-1.5 w-full rounded-lg border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1.5 type-micro font-semibold text-violet-100 hover:bg-violet-400/[0.14]"
                  >
                    + Guardar selección como bloque
                  </button>
                  {cadBlocks.length === 0 ? (
                    <p className="type-micro leading-snug text-muted-foreground">
                      Sin bloques aún: selecciona una celda armada y guárdala
                      para reutilizarla en cualquier layout.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                      {cadBlocks.map((block) => (
                        <div key={block.id} className="flex items-center gap-1">
                          <button
                            onClick={() => insertCadBlock(block)}
                            title="Insertar en el centro de la vista (llega agrupado)"
                            className="min-w-0 flex-1 rounded-lg bg-violet-400/[0.08] px-2 py-1.5 text-left type-micro text-violet-100 hover:bg-violet-400/[0.14]"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold">
                                {block.name}
                              </span>
                              <span className="shrink-0 type-micro text-violet-200/70">
                                {block.assets.length} obj
                              </span>
                            </span>
                          </button>
                          <button
                            onClick={() => void deleteCadBlock(block)}
                            title="Borrar bloque de la biblioteca"
                            className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-rose-500/20 hover:text-danger-ink"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mb-3 rounded-xl border border-slate-300/15 bg-slate-300/[0.05] p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 type-micro uppercase tracking-wide text-slate-200">
                      <BrickWall className="h-3.5 w-3.5" /> Arquitectura
                    </div>
                    <span className="type-micro text-slate-200/60">
                      editable
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={toggleWall}
                      className={`rounded-lg px-2 py-1.5 text-left type-micro font-semibold ${tool === "wall" ? "bg-slate-200 text-slate-950" : "bg-muted/60 text-slate-100 hover:bg-muted"}`}
                    >
                      Trazar muro
                    </button>
                    <button
                      onClick={() => addArchitectureAsset("column")}
                      className="rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro font-semibold text-slate-100 hover:bg-muted"
                    >
                      Columna
                    </button>
                    <button
                      onClick={() => addArchitectureAsset("door")}
                      className="rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro font-semibold text-slate-100 hover:bg-muted"
                    >
                      Puerta
                    </button>
                    <button
                      onClick={() => addArchitectureAsset("room")}
                      className="rounded-lg bg-muted/60 px-2 py-1.5 text-left type-micro font-semibold text-slate-100 hover:bg-muted"
                    >
                      Cuarto / area
                    </button>
                  </div>
                  <div className="mt-1.5 type-micro leading-snug text-slate-200/60">
                    Tags: use:recamara, use:bano, use:cocina o dept:obra
                    clasifican locales en el takeoff.
                  </div>
                </div>
                <div className="mb-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] p-2.5">
                  <div className="type-micro uppercase tracking-wide text-danger-ink mb-1.5">
                    Safety zones
                  </div>
                  <p className="mb-2 type-micro leading-snug text-rose-100/70">
                    Crea zonas y rutas editables en Safety. Validacion detecta
                    bloqueos, invasiones y objetos sin clasificacion ESD.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => createSafetyZoneAsset("no-go")}
                      className="rounded-lg border border-rose-300/20 bg-rose-400/[0.10] px-2 py-1.5 text-left type-micro font-semibold text-rose-100 hover:bg-rose-400/[0.16]"
                    >
                      Zona prohibida
                    </button>
                    <button
                      onClick={() => createSafetyZoneAsset("restricted")}
                      className="rounded-lg border border-amber-300/20 bg-amber-400/[0.10] px-2 py-1.5 text-left type-micro font-semibold text-warning-ink hover:bg-amber-400/[0.16]"
                    >
                      Zona restringida
                    </button>
                    <button
                      onClick={() => createSafetyZoneAsset("esd")}
                      className="rounded-lg border border-indigo-300/20 bg-indigo-400/[0.10] px-2 py-1.5 text-left type-micro font-semibold text-primary-ink hover:bg-indigo-400/[0.16]"
                    >
                      Zona ESD
                    </button>
                    <button
                      onClick={() => createSafetyPathAsset("circulation")}
                      className="rounded-lg border border-emerald-300/20 bg-emerald-400/[0.10] px-2 py-1.5 text-left type-micro font-semibold text-success-ink hover:bg-emerald-400/[0.16]"
                    >
                      Pasillo de circulación
                    </button>
                    <button
                      onClick={() => createSafetyPathAsset("emergency")}
                      className="rounded-lg border border-indigo-300/20 bg-indigo-400/[0.10] px-2 py-1.5 text-left type-micro font-semibold text-primary-ink hover:bg-indigo-400/[0.16]"
                    >
                      Emergency exit
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="type-micro uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                    Biblioteca CAD universal
                  </div>
                  <span className="type-micro text-muted-foreground">
                    {filteredSymbols.length}/{CAD_SYMBOL_LIBRARY.length}
                  </span>
                </div>
                <input
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Buscar puerta, ventana, mueble…"
                  className="mb-2 w-full rounded-lg border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-400/60"
                />
                <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                  {symbolCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setSymbolCategory(category)}
                      className={`shrink-0 rounded-full border px-2 py-0.5 type-micro ${symbolCategory === category ? "border-indigo-300/50 bg-indigo-400/15 text-primary-ink" : "border-border text-muted-foreground dark:text-muted-foreground hover:text-foreground"}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-1.5 mb-3">
                  {filteredSymbols.map((symbol) => (
                    <button
                      key={symbol.id}
                      onClick={() => addCadSymbol(symbol.id)}
                      title={`Agregar ${symbol.label}`}
                      className="rounded-lg bg-indigo-400/[0.08] px-2 py-1.5 text-left type-micro text-primary-ink hover:bg-indigo-400/[0.14]"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">
                          {symbol.label}
                        </span>
                        <span className="shrink-0 type-micro text-primary-ink">
                          {Math.round(symbol.defaultWidth)}×
                          {Math.round(symbol.defaultHeight)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate type-micro text-primary-ink">
                        {symbol.category} · {symbol.layer} ·{" "}
                        {symbol.tags.join(", ")}
                      </span>
                    </button>
                  ))}
                  {filteredSymbols.length === 0 && (
                    <div className="rounded-lg border border-border bg-muted/40 px-2 py-3 text-center type-micro text-muted-foreground">
                      Sin símbolos para ese filtro.
                    </div>
                  )}
                </div>
                <div className="type-micro uppercase tracking-wide text-muted-foreground dark:text-muted-foreground mb-2">
                  Agregar equipo
                </div>
                {ASSET_CATEGORIES.map((cat) => (
                  <div key={cat.category} className="mb-3">
                    <div className="type-micro uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> {cat.label}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {cat.items.map((it) => (
                        <button
                          key={it.kind}
                          onClick={() => addAsset(it.kind)}
                          title={`Agregar ${it.label}`}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/40 hover:bg-muted type-caption transition-colors"
                        >
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: it.color }}
                          />
                          <span className="truncate">{it.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      ))}
    </div>
  );
}
