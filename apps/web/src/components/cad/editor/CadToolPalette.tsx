"use client";

import {
  Circle,
  Copy,
  Expand,
  Hand,
  Move,
  MousePointer2,
  Redo2,
  Rows3,
  Ruler,
  Spline,
  Square,
  Type,
  Undo2,
  Waypoints,
} from "lucide-react";
import {
  CAD_TOOLBAR_ACTIONS,
  type CadToolbarAction,
  type CadToolbarActionId,
} from "@/lib/cad/toolbar";
import { cx } from "@/components/ui";

/**
 * LA PALETA DE HERRAMIENTAS.
 *
 * Lo que había: dieciocho etiquetas de texto a 10,5 px, apiladas en una columna
 * —«Select», «Pan», «Measure», «Line», «Pline», «Rect»…—, en un producto que ya
 * tenía 79 iconos de lucide importados. Una paleta de texto obliga a LEER cada
 * vez; una de iconos se recorre con la periferia de la vista, que es lo que hace
 * un dibujante mientras tiene los ojos en el lienzo.
 *
 * ICONO **Y** ETIQUETA, no icono solo. Un icono sin texto es un acertijo la
 * primera semana, y ésta es exactamente la primera semana de alguien que viene
 * de AutoCAD. El texto se queda debajo, en el piso de la escala.
 *
 * EL TOOLTIP ENSEÑA EL ATAJO, y ésa es la joya que estaba enterrada: la tabla de
 * alias ya existe (`L` para línea, `C` para círculo, `M` para medir) y no se
 * anunciaba en ningún sitio. Un usuario de AutoCAD que pasa el cursor sobre
 * «Línea» y lee «L» acaba de descubrir que su memoria muscular de veinte años
 * sirve aquí. Eso no es una ayuda: es el argumento de venta del producto,
 * puesto donde se tropieza con él.
 *
 * SE EXTRAJO DEL MONOLITO. `Layout3DEditor.tsx` tiene un trinquete de tamaño que
 * SÓLO BAJA: cualquier mejora ahí dentro se paga sacando código, no añadiéndolo.
 */

/**
 * El icono de cada herramienta. Vive aquí y no en `toolbar.ts` porque `toolbar`
 * es la DEFINICIÓN de las acciones —id, atajo, grupo, descripción— y la consume
 * también la máquina de comandos, que no pinta nada. Un icono es presentación.
 */
const ICONS: Record<CadToolbarActionId, typeof Circle> = {
  select: MousePointer2,
  pan: Hand,
  measure: Ruler,
  line: Waypoints,
  polyline: Spline,
  rect: Square,
  circle: Circle,
  move: Move,
  copy: Copy,
  offset: Rows3,
  aisle: Rows3,
  zone: Square,
  equipment: Type,
  text: Type,
  fit_view: Expand,
  undo: Undo2,
  redo: Redo2,
};

export function CadToolPalette({
  activeTool,
  readOnly,
  isReadOnlyAllowed,
  canUndo,
  canRedo,
  onRun,
}: {
  activeTool: string;
  readOnly: boolean;
  isReadOnlyAllowed: (id: CadToolbarActionId) => boolean;
  /**
   * Deshacer y rehacer se deshabilitan sin historia, igual que sus gemelos de
   * la barra superior: un botón habilitado que no hace nada es un cable suelto
   * (lo caza `e2e/real/cables-sueltos.spec.ts`); uno deshabilitado es honesto.
   */
  canUndo: boolean;
  canRedo: boolean;
  onRun: (id: CadToolbarActionId) => void;
}) {
  const unavailable = (id: CadToolbarActionId): boolean =>
    (id === "undo" && !canUndo) || (id === "redo" && !canRedo);
  return (
    <div
      data-testid="cad-toolbar"
      className="absolute top-3 left-3 z-20 rounded-card border border-border bg-surface/90 p-1.5 shadow-floating backdrop-blur"
    >
      <div className="grid grid-cols-1 gap-0.5">
        {CAD_TOOLBAR_ACTIONS.map((action) => (
          <ToolButton
            key={action.id}
            action={action}
            active={activeTool === action.id}
            disabled={
              (readOnly && !isReadOnlyAllowed(action.id)) ||
              unavailable(action.id)
            }
            readOnlyAllowed={isReadOnlyAllowed(action.id)}
            onRun={onRun}
          />
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  action,
  active,
  disabled,
  readOnlyAllowed,
  onRun,
}: {
  action: CadToolbarAction;
  active: boolean;
  disabled: boolean;
  readOnlyAllowed: boolean;
  onRun: (id: CadToolbarActionId) => void;
}) {
  const Icon = ICONS[action.id];
  return (
    <button
      data-cad-readonly-allowed={readOnlyAllowed || undefined}
      disabled={disabled}
      onClick={() => onRun(action.id)}
      // El `title` nativo se conserva ADEMÁS del tooltip dibujado: es lo que lee
      // un lector de pantalla y lo que sobrevive si el CSS no carga.
      title={`${action.label}${action.shortcut ? ` · ${action.shortcut}` : ""} — ${action.description}`}
      className={cx(
        "group/tool relative flex w-14 flex-col items-center gap-0.5 rounded-control px-1 py-1.5",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-brand-strong text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span className="type-micro font-medium leading-none">{action.label}</span>

      {/*
        El tooltip se dibuja a la DERECHA porque la paleta vive pegada al borde
        izquierdo del lienzo: arriba o abajo se saldría de la columna, y a la
        izquierda quedaría fuera de la pantalla.

        En CSS puro con `group-hover`: son dieciocho herramientas, y un estado de
        React por cada una costaría dieciocho re-renders en un componente que ya
        repinta con cada movimiento del cursor.
      */}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden w-max max-w-56 -translate-y-1/2 flex-col gap-0.5",
          "rounded-control border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-floating",
          "group-hover/tool:flex group-focus-visible/tool:flex",
        )}
      >
        <span className="type-caption font-semibold">{action.label}</span>
        {action.shortcut ? (
          <span className="type-mono type-micro text-primary-ink">
            Atajo: {action.shortcut}
          </span>
        ) : null}
        <span className="type-micro text-muted-foreground">
          {action.description}
        </span>
      </span>
    </button>
  );
}
