"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cx, Tabs, TabPanel } from "@/components/ui";
import { CAD_RIBBON_DATA, type CadRibbonTabId } from "@/lib/cad/ribbon";
import { CadRibbonPanel } from "./CadRibbonPanel";

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
  const [activeTab, setActiveTab] = useState<CadRibbonTabId>("inicio");
  const [collapsed, setCollapsed] = useState(false);

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
          className="flex-1 border-b-0 px-2"
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
                "flex items-stretch overflow-x-auto px-1 py-0.5",
                "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                readOnly && "pointer-events-none opacity-60",
              )}
            >
              {tab.panels.map((panel) => (
                <CadRibbonPanel
                  key={panel.label}
                  panel={panel}
                  onRun={dispatch}
                  disabledCommands={disabledCommands}
                />
              ))}
            </div>
          </TabPanel>
        ))}
    </div>
  );
}
