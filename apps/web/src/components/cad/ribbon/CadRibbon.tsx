"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cx, Tabs, TabPanel } from "@/components/ui";
import { CAD_RIBBON_DATA, type CadRibbonTabId } from "@/lib/cad/ribbon";
import { CadRibbonPanel } from "./CadRibbonPanel";

/**
 * T-74(j): «la cinta no recuerda nada» — cada carga volvía a Inicio y
 * desplegada, aunque quien dibuja viva en Anotar o prefiera la cinta
 * minimizada. Una clave de `localStorage` sin repartir por tenant/usuario a
 * propósito: es cosmético (qué pestaña se ve), no un dato — el mismo nivel
 * que `render-pipeline-preference.ts`, no el de `guided-tour.ts` (que sí
 * necesita saber QUIÉN ya vio algo).
 */
const RIBBON_ACTIVE_TAB_KEY = "valle_cad_ribbon_active_tab";
const RIBBON_COLLAPSED_KEY = "valle_cad_ribbon_collapsed";

function leerPestanaGuardada(): CadRibbonTabId | null {
  try {
    const stored = window.localStorage.getItem(RIBBON_ACTIVE_TAB_KEY);
    return stored && CAD_RIBBON_DATA.some((tab) => tab.id === stored)
      ? (stored as CadRibbonTabId)
      : null;
  } catch {
    // Privado, bloqueado o inexistente: se sigue con el defecto, nunca se rompe la cinta por esto.
    return null;
  }
}

function leerColapsoGuardado(): boolean | null {
  try {
    const stored = window.localStorage.getItem(RIBBON_COLLAPSED_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

/**
 * Todos los nombres de comando que SÍ tocan el documento — calculado una vez,
 * no en cada render: el registro entero no cambia en caliente.
 */
const CAD_MUTATING_COMMANDS: ReadonlySet<string> = new Set(
  CAD_RIBBON_DATA.flatMap((tab) =>
    tab.panels.flatMap((panel) =>
      panel.commands.filter((command) => command.mutates).map((command) => command.name),
    ),
  ),
);

/**
 * LA CINTA. Pestañas al estilo AutoCAD sobre el registro real de comandos —
 * ver `docs/execution/DEUDA-MONOLITO.md` y `lib/cad/ribbon.ts` para el cómo y
 * el porqué. Se monta una vez, arriba del todo del estudio (`Layout3DEditor`
 * usa `flex flex-col`, así que un hijo nuevo aquí sólo empuja el lienzo hacia
 * abajo — no reordena nada de lo que ya existía).
 *
 * `dispatch` es el MISMO punto de entrada que la línea de comandos
 * (`commandEngineRef.current.invoke`): un clic en un botón de la cinta no es
 * un camino nuevo, es el camino de siempre con un mouse en vez de un teclado.
 */
export function CadRibbon({
  dispatch,
  readOnly,
  disabledCommands,
  className,
}: {
  dispatch: (commandName: string) => void;
  readOnly?: boolean;
  disabledCommands?: ReadonlySet<string>;
  className?: string;
}) {
  // T-74(j): la lectura de `localStorage` va en el INICIALIZADOR perezoso
  // de `useState`, no en un efecto — `CadStudioHost` monta `Layout3DEditor`
  // (y por tanto esta cinta) con `ssr: false` en las dos rutas que existen
  // (`app/studio/[documentId]/page.tsx`, `app/demo/DemoStudio.tsx`), así que
  // este componente NUNCA se renderiza en el servidor: no hay HTML de
  // servidor con el que desajustarse al hidratar. Sincronizar desde un
  // efecto habría disparado `react-hooks/set-state-in-effect` (la regla
  // NO distingue «restaurar una vez al montar» de un `setState` reactivo) y
  // habría costado un re-render extra visible al abrir el estudio.
  const [activeTab, setActiveTab] = useState<CadRibbonTabId>(() => leerPestanaGuardada() ?? "inicio");
  const [collapsed, setCollapsed] = useState<boolean>(() => leerColapsoGuardado() ?? false);

  useEffect(() => {
    try {
      window.localStorage.setItem(RIBBON_ACTIVE_TAB_KEY, activeTab);
    } catch {
      // Almacenamiento privado o lleno: recordar la pestaña es una
      // comodidad, no una promesa — no hay nada que avisar aquí.
    }
  }, [activeTab]);
  useEffect(() => {
    try {
      window.localStorage.setItem(RIBBON_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Igual que arriba.
    }
  }, [collapsed]);

  // T-74(i): sólo lectura apagaba la cinta ENTERA (`pointer-events-none`
  // sobre la tira completa) — incluidos comandos como LIST o DIST, que no
  // tocan el documento y deberían seguir funcionando igual que en un dibujo
  // editable. Ahora sólo se apagan los que SÍ mutan, botón por botón, con la
  // misma señal visual (`disabled:opacity-40`) que ya usa `CadRibbonButton`
  // para cualquier otro comando deshabilitado.
  const effectiveDisabledCommands = useMemo(() => {
    if (!readOnly) return disabledCommands;
    if (!disabledCommands || disabledCommands.size === 0) return CAD_MUTATING_COMMANDS;
    return new Set([...CAD_MUTATING_COMMANDS, ...disabledCommands]);
  }, [disabledCommands, readOnly]);

  const tabs = CAD_RIBBON_DATA.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: tab.commandCount,
    "data-testid": `cad-ribbon-tab-${tab.id}`,
  }));

  return (
    <div
      data-testid="cad-ribbon"
      data-collapsed={collapsed ? "true" : "false"}
      className={cx(
        "relative z-20 flex shrink-0 flex-col border-b border-border bg-surface/90 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center pr-1">
        <Tabs
          items={tabs}
          value={activeTab}
          onChange={(id) => setActiveTab(id as CadRibbonTabId)}
          label="Pestañas de la cinta"
          size="sm"
          // `[&_button]:py-1`: la fila de pestañas medía 34 px con el py-2 de
          // `size="sm"`; a 720 px de alto cada píxel de cinta se lo come el
          // lienzo (golden 19: lienzo 511 px con 520 de mínimo, medido).
          className="flex-1 border-b-0 px-2 [&_button]:py-1"
        />
        <button
          type="button"
          data-testid="cad-ribbon-collapse"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Mostrar la cinta" : "Minimizar la cinta"}
          aria-label={collapsed ? "Mostrar la cinta" : "Minimizar la cinta"}
          className="rounded-control p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      {!collapsed &&
        CAD_RIBBON_DATA.map((tab) => (
          <TabPanel key={tab.id} id={tab.id} active={tab.id === activeTab}>
            <div
              data-testid={`cad-ribbon-panels-${tab.id}`}
              className={cx(
                "flex items-stretch overflow-x-auto px-1 py-0",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              )}
            >
              {tab.panels.map((panel) => (
                <CadRibbonPanel
                  key={panel.label}
                  panel={panel}
                  onRun={dispatch}
                  disabledCommands={effectiveDisabledCommands}
                />
              ))}
            </div>
          </TabPanel>
        ))}
    </div>
  );
}
