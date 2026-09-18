"use client";

import { cx } from "@/components/ui";
import type { CadRibbonPanel as CadRibbonPanelData } from "@/lib/cad/ribbon";
import {
  cadRibbonPanelNaturalColumns,
  cadRibbonPanelSplit,
  type CadRibbonPanelLayout,
} from "@/lib/cad/ribbon-layout";
import { CadRibbonButton } from "./CadRibbonButton";
import { CadRibbonPanelFlyout } from "./CadRibbonPanelFlyout";
import { cadRibbonPanelIcon } from "./ribbon-icons";

/**
 * Un panel con nombre (AutoCAD: "Dibujo", "Modificar"…) dentro de una pestaña.
 *
 * ## La forma de AutoCAD
 *
 * Uno o dos botones GRANDES (`command.primary`) y, a su derecha, los
 * pequeños en columnas de TRES filas (`grid-rows-3`); el rótulo del panel va
 * debajo. Antes todos los comandos iban en UNA fila de botones iguales: Inicio
 * medía ~10 700 px y a 1366 px se veían veinte botones de 159.
 *
 * Qué se ve y qué va al desplegable lo decide `layout`
 * (`lib/cad/ribbon-layout.ts`, calculado por la cinta con el ancho real):
 * desplegado con N columnas, reducido a sus botones grandes, o plegado a un
 * único botón con el icono del panel. En los tres estados el panel mide lo
 * mismo de alto (`h-[3.75rem]` de cuerpo): a 720 px de alto el lienzo
 * necesita cada píxel (golden 19) y una cinta que cambia de alto mueve la
 * cámara (golden 72).
 *
 * Pulsar el rótulo pliega el panel a mano; la cinta lo recuerda.
 */
export function CadRibbonPanel({
  panel,
  onRun,
  disabledCommands,
  layout,
  manuallyCollapsed,
  onToggleCollapsed,
}: {
  panel: CadRibbonPanelData;
  onRun: (name: string) => void;
  disabledCommands?: ReadonlySet<string>;
  layout?: CadRibbonPanelLayout;
  manuallyCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  // T-73(f): la cinta no tenía ni `role` ni `aria-label` — un lector de
  // pantalla anunciaba "grupo" (o nada) al entrar a cada panel, sin decir
  // "Dibujo" o "Modificar". `aria-labelledby` apunta al rótulo que YA se
  // pinta: ni duplica el texto ni depende de mantener dos copias en
  // sincronía. No es `role="toolbar"`: ese rol EXIGE navegación con flechas
  // (un solo Tab-stop, roving tabindex) que la cinta no implementa todavía
  // — prometerlo con el rol sin dar el teclado sería peor que no marcarlo.
  const labelId = `cad-ribbon-panel-label-${panel.label}`;
  const effectiveLayout: CadRibbonPanelLayout = layout ?? {
    state: "expanded",
    columns: cadRibbonPanelNaturalColumns(panel),
  };
  const split = cadRibbonPanelSplit(panel, effectiveLayout);
  const collapsed = effectiveLayout.state === "collapsed";
  return (
    <div
      data-testid={`cad-ribbon-panel-${panel.label}`}
      role="group"
      aria-labelledby={labelId}
      data-layout={effectiveLayout.state}
      data-columns={effectiveLayout.columns}
      // `relative`: el desplegable se ancla bajo el panel entero.
      // pt-0.5 / pb-0: a 720 px de alto el lienzo necesita cada píxel.
      className={cx(
        "relative flex shrink-0 flex-col border-r border-border/60 pb-0 pt-0.5 last:border-r-0",
        collapsed ? "px-0.5" : "px-2",
      )}
    >
      {collapsed ? (
        <CadRibbonPanelFlyout
          variant="panel"
          panelLabel={panel.label}
          labelId={labelId}
          icon={cadRibbonPanelIcon(panel.label)}
          commands={split.flyout}
          onRun={onRun}
          disabledCommands={disabledCommands}
          onExpandPanel={manuallyCollapsed ? onToggleCollapsed : undefined}
        />
      ) : (
        <>
          <div
            className={
              split.large.length > 2
                ? "grid auto-cols-max grid-flow-col grid-rows-2 gap-0.5"
                : "flex h-[3.75rem] items-start gap-0.5"
            }
          >
            {split.large.map((command) => (
              <CadRibbonButton
                key={command.name}
                command={command}
                size="large"
                onRun={onRun}
                disabled={disabledCommands?.has(command.name)}
              />
            ))}
            {split.small.length > 0 ? (
              <div className="grid auto-cols-max grid-flow-col grid-rows-3 gap-x-0.5">
                {split.small.map((command) => (
                  <CadRibbonButton
                    key={command.name}
                    command={command}
                    size="small"
                    onRun={onRun}
                    disabled={disabledCommands?.has(command.name)}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-0.5">
            {onToggleCollapsed ? (
              <button
                type="button"
                id={labelId}
                data-testid={`cad-ribbon-panel-collapse-${panel.label}`}
                onClick={onToggleCollapsed}
                title={`Plegar el panel ${panel.label} a un botón`}
                className="type-micro rounded-control px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {panel.label}
              </button>
            ) : (
              <span id={labelId} className="type-micro px-1 text-muted-foreground">
                {panel.label}
              </span>
            )}
            {split.flyout.length > 0 ? (
              <CadRibbonPanelFlyout
                variant="caret"
                panelLabel={panel.label}
                labelId={labelId}
                commands={split.flyout}
                onRun={onRun}
                disabledCommands={disabledCommands}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
