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
 *
 * ## Escepticismo del carril «abajo»: el patrón de teclado del tablist
 *
 * `role="tablist"` / `role="tab"` es el patrón WAI-ARIA APG, y ese patrón
 * EXIGE roving tabindex (sólo la pestaña activa es un tab-stop; las demás
 * llevan `tabIndex={-1}`) más flechas para moverse dentro de la lista — el
 * repo ya construyó y documentó exactamente esto en
 * `components/ui/Tabs.tsx` («la parte que casi nadie implementa y es justo
 * la que importa»). La primera versión de este componente declaraba los
 * roles sin el resto del patrón: con `Modelo` + cada presentación como
 * `<button>` normal (tabIndex por defecto = 0), alguien con teclado tenía
 * que pulsar Tab una vez por cada presentación para salir de la lista — el
 * antipatrón exacto que `Tabs.tsx` evita, y peor que antes de esta ola: la
 * versión vieja en `trailingContent` limitaba a 3 presentaciones
 * (`slice(0, 3)`) y no llevaba `role="tab"`, así que ARIA no prometía nada
 * que no cumpliera. El botón «Administrar» se queda FUERA de este recorrido
 * a propósito: no lleva `role="tab"` (es una acción, como el «+ nueva
 * pestaña» de un navegador), así que las flechas no lo visitan.
 */
import React, { useRef } from "react";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
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

/** Los dos tipos de tab-stop del roving tabindex: Modelo, y cada
 *  presentación. El botón «Administrar» no participa (ver comentario de
 *  cabecera). */
type CadSpaceRovingItem =
  { kind: "model" } | { kind: "space"; space: CadPaperSpace };

export const CadSpaceTabs = React.memo(function CadSpaceTabs({
  isModelActive,
  spaces,
  activeSpaceId,
  onSelectModel,
  onSelectSpace,
  onManage,
}: CadSpaceTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // En Esencial las pestañas Modelo/Presentación no se pintan: el espacio
  // papel sigue a un paso (LAYOUT, Ctrl+K) y vuelve entero en Pro.
  const mode = useCadUiMode();
  if (mode === "esencial") return null;
  const items: CadSpaceRovingItem[] = [
    { kind: "model" },
    ...spaces.map((space): CadSpaceRovingItem => ({ kind: "space", space })),
  ];

  // Roving tabindex, patrón WAI-ARIA APG — mismo comportamiento que
  // `components/ui/Tabs.tsx`: las flechas activan de inmediato (no hace
  // falta Enter/Espacio después) y mueven el foco con ellas. Función normal,
  // no `useCallback`: este componente ya está memoizado con `React.memo` por
  // props, y una lista de pestañas no tiene el volumen para que la identidad
  // de un manejador de teclado importe.
  const move = (delta: number | "first" | "last") => {
    if (items.length === 0) return;
    const fromIndex = items.findIndex((item) =>
      item.kind === "model"
        ? isModelActive
        : !isModelActive && item.space.id === activeSpaceId,
    );
    const from = fromIndex === -1 ? 0 : fromIndex;
    const toIndex =
      delta === "first"
        ? 0
        : delta === "last"
          ? items.length - 1
          : (from + delta + items.length) % items.length;
    const target = items[toIndex];
    if (target.kind === "model") onSelectModel();
    else onSelectSpace(target.space);
    listRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-roving-id="${target.kind === "model" ? "model" : target.space.id}"]`,
      )
      ?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number | "first" | "last"> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: "first",
      End: "last",
    };
    const action = map[event.key];
    if (action === undefined) return;
    event.preventDefault();
    move(action);
  };

  return (
    // DOS CAJAS, no una. La de fuera es la píldora (borde, fondo, relleno) y la
    // de dentro es el `tablist` DE VERDAD: sólo pestañas. Antes eran la misma,
    // y «Administrar presentaciones» —que no es una pestaña, es una acción—
    // vivía dentro; axe-core lo marcaba como violación CRÍTICA
    // (`aria-required-children`: un `tablist` sólo admite `tab`), y con razón:
    // un lector de pantalla anunciaba «pestaña 3 de 3» sobre algo que no
    // selecciona ningún espacio. Se ve exactamente igual y ahora es cierto.
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
      <div
        ref={listRef}
        data-testid="cad-space-tabs"
        data-cad-readonly-allowed
        role="tablist"
        aria-label="Espacio de dibujo: modelo o presentación"
        onKeyDown={handleKeyDown}
        className="inline-flex items-center gap-0.5"
      >
        <button
          type="button"
          role="tab"
          data-testid="cad-space-tab-model"
          data-roving-id="model"
          aria-selected={isModelActive}
          tabIndex={isModelActive ? 0 : -1}
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
              data-roving-id={space.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={`Presentación «${space.name}»`}
              onClick={() => onSelectSpace(space)}
              className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              {space.name}
            </button>
          );
        })}
      </div>
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
