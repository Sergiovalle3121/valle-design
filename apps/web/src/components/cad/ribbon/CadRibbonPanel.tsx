"use client";

import { useRef } from "react";
import { cx } from "@/components/ui";
import type { CadRibbonPanel as CadRibbonPanelData } from "@/lib/cad/ribbon";
import {
  cadRibbonPanelNaturalColumns,
  cadRibbonPanelSplit,
  type CadRibbonPanelLayout,
} from "@/lib/cad/ribbon-layout";
import { CadRibbonButton } from "./CadRibbonButton";
import { CadRibbonPanelFlyout, type CadRibbonPanelAction } from "./CadRibbonPanelFlyout";
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
 * ## El rótulo ABRE el panel
 *
 * Como en AutoCAD, pulsar la barra del rótulo (rótulo + ▾) abre el
 * desplegable con lo que no cabe. Antes el rótulo PLEGABA el panel a un botón
 * y la cinta lo guardaba para siempre: quien buscaba «Dibujo» se quedaba sin
 * sus botones. Plegar a mano sigue existiendo, pero se pide a propósito desde
 * la cabecera del desplegable («Plegar a un botón»), y el panel plegado a
 * mano ofrece allí mismo «Mostrar en la cinta». Un panel que lo enseña todo
 * no tiene desplegable y su rótulo es sólo texto.
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
  // El desplegable se abre bajo el panel ENTERO, no bajo su rótulo.
  const panelRef = useRef<HTMLDivElement>(null);
  const effectiveLayout: CadRibbonPanelLayout = layout ?? {
    state: "expanded",
    columns: cadRibbonPanelNaturalColumns(panel),
  };
  const split = cadRibbonPanelSplit(panel, effectiveLayout);
  const collapsed = effectiveLayout.state === "collapsed";
  let panelAction: CadRibbonPanelAction | undefined;
  if (onToggleCollapsed && collapsed && manuallyCollapsed) {
    panelAction = { label: "Mostrar en la cinta", testId: `cad-ribbon-panel-expand-${panel.label}`, run: onToggleCollapsed };
  } else if (onToggleCollapsed && !collapsed) {
    panelAction = { label: "Plegar a un botón", testId: `cad-ribbon-panel-collapse-${panel.label}`, run: onToggleCollapsed };
  }
  return (
    <div
      ref={panelRef}
      data-testid={`cad-ribbon-panel-${panel.label}`}
      role="group"
      aria-labelledby={labelId}
      data-layout={effectiveLayout.state}
      data-columns={effectiveLayout.columns}
      // pt-0.5 / pb-0: a 720 px de alto el lienzo necesita cada píxel.
      className={cx(
        "flex shrink-0 flex-col border-r border-border/60 pb-0 pt-0.5 last:border-r-0",
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
          anchorRef={panelRef}
          panelAction={panelAction}
        />
      ) : (
        <>
          <div className="flex h-[3.75rem] items-start gap-0.5">
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
          <div className="flex items-center justify-center">
            {split.flyout.length > 0 ? (
              <CadRibbonPanelFlyout
                variant="title"
                panelLabel={panel.label}
                labelId={labelId}
                commands={split.flyout}
                onRun={onRun}
                disabledCommands={disabledCommands}
                anchorRef={panelRef}
                panelAction={panelAction}
              />
            ) : (
              <span id={labelId} className="type-micro px-1 text-muted-foreground">
                {panel.label}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
