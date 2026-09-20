"use client";

/**
 * PESTAÑAS Modelo / Presentación, como AutoCAD.
 *
 * Ola «estado»: vivían arriba, dentro de `trailingContent` de la cinta —
 * mezcladas con el botón 2D/3D y el título del documento, en la fila de 32 px
 * del armazón (`appBar`). Un dibujante que viene de AutoCAD las busca ABAJO,
 * a la izquierda, justo donde arrancan las coordenadas: en AutoCAD clásico
 * ambas cosas comparten la misma franja inferior, no dos filas separadas.
 * Moverlas ahí no cuesta una fila nueva — el contrato del armazón fija la
 * barra de estado en `CAD_SHELL_METRICS.statusRow` (26 px) y esa fila NO
 * puede crecer sin bajar el lienzo del 74 % medido (`cad-shell-layout.ts`) —
 * así que este componente vive DENTRO de esa misma fila, como su primer
 * grupo, y la fila entera se desplaza con `overflow-x-auto` si hace falta
 * (igual que ya hacía antes de esta ola).
 *
 * Presentacional puro y memoizado, como `CadDraftStatusBar`: recibe el
 * espacio activo y la lista ya ordenada, emite callbacks. `CadStatusBar` es
 * quien lo monta; `Layout3DEditor.tsx` sólo entrega los datos (el monolito
 * pierde el bloque de JSX que antes tenía aquí, no gana ninguno).
 *
 * Antes decía «Layout» — inglés en superficie visible, la regla que
 * `check:surface` vigila para AutoCAD/Autodesk pero que el propio repo pide
 * cumplir en general. En AutoCAD en español ese concepto se llama
 * «Presentación», que es además la palabra que ya usa el propio dueño al
 * describir la queja.
 */
import React from "react";
import type { CadPaperSpace } from "@/lib/cad/cad-paper-viewport";

const TAB_BASE =
  "shrink-0 whitespace-nowrap rounded px-2 py-0.5 type-micro font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const TAB_ACTIVE = "bg-brand-strong text-primary-foreground";
const TAB_INACTIVE =
  "text-muted-foreground hover:bg-muted hover:text-foreground";

export interface CadSpaceTabsProps {
  /** El espacio activo es el modelo (no una presentación de papel). */
  isModelActive: boolean;
  /** Presentaciones, YA ordenadas por quien las calcula (`orderedPaperSpaces`). */
  spaces: readonly CadPaperSpace[];
  /** Id de la presentación activa, si `isModelActive` es falso. */
  activeSpaceId: string | null;
  onSelectModel: () => void;
  onSelectSpace: (space: CadPaperSpace) => void;
  /** Abre el gestor de hojas: crear, reordenar, publicar. */
  onManage: () => void;
}

export const CadSpaceTabs = React.memo(function CadSpaceTabs({
  isModelActive,
  spaces,
  activeSpaceId,
  onSelectModel,
  onSelectSpace,
  onManage,
}: CadSpaceTabsProps) {
  return (
    <div
      data-testid="cad-space-tabs"
      data-cad-readonly-allowed
      role="tablist"
      aria-label="Espacio de dibujo: modelo o presentación"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5"
    >
      <button
        type="button"
        role="tab"
        data-testid="cad-space-tab-model"
        aria-selected={isModelActive}
        title="Espacio modelo — el dibujo a escala real"
        onClick={onSelectModel}
        className={`${TAB_BASE} ${isModelActive ? TAB_ACTIVE : TAB_INACTIVE}`}
      >
        Modelo
      </button>
      {spaces.map((space) => {
        const active = !isModelActive && space.id === activeSpaceId;
        return (
          <button
            key={space.id}
            type="button"
            role="tab"
            data-testid={`cad-space-tab-${space.id}`}
            aria-selected={active}
            title={`Presentación «${space.name}»`}
            onClick={() => onSelectSpace(space)}
            className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {space.name}
          </button>
        );
      })}
      <button
        type="button"
        data-testid="cad-space-tab-manage"
        title="Administrar presentaciones: hojas, ventanas y publicación"
        aria-label="Administrar presentaciones: hojas, ventanas y publicación"
        onClick={onManage}
        className={`${TAB_BASE} ${TAB_INACTIVE} border-l border-border`}
      >
        {spaces.length ? `Presentaciones · ${spaces.length}` : "+ Presentación"}
      </button>
    </div>
  );
});
