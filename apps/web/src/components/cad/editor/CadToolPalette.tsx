"use client";

import { Expand, Hand, MousePointer2 } from "lucide-react";
import {
  CAD_TOOLBAR_ACTIONS,
  type CadToolbarAction,
  type CadToolbarActionId,
} from "@/lib/cad/toolbar";
import { cx } from "@/components/ui";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";

/**
 * LA PALETA DE HERRAMIENTAS — podada a lo que NO es una orden (ola1-paleta,
 * 2026-09-19).
 *
 * Medido en producción (vallecad.com/demo, 1440×825): esta columna flotante
 * medía 93×846 px encima del lienzo y de sus diecisiete botones, once
 * duplicaban un botón exacto de la cinta (Distancia=DIST, Línea=LINE,
 * Polilínea=PLINE, Rectángulo=RECTANG, Círculo=CIRCLE, Mover=MOVE,
 * Copiar=COPY, Desfase=OFFSET, Texto=TEXT, Deshacer=U, Rehacer=REDO) y tres
 * eran vocabulario industrial heredado (Pasillo, Área, Símbolos, ver
 * IDENTITY.md). Esos catorce se retiraron de `CAD_TOOLBAR_ACTIONS`
 * (`toolbar.ts`) — el comando sigue intacto, alcanzable desde la cinta y
 * desde su atajo de una letra; sólo se borró el botón que lo repetía.
 *
 * Quedan tres controles que NO son una orden sino NAVEGACIÓN de cámara
 * (Seleccionar, Encuadre, Ajustar todo) y por eso siguen aquí, ahora como
 * una barra HORIZONTAL de iconos —sin etiqueta de texto, sólo tooltip—
 * anclada abajo a la derecha del lienzo: 3 botones de 28 px con 4 px de
 * relleno y de separación caben en ≤140×40 px (huella real: 112×40, ver
 * `CadToolPaletteAncho.spec.ts`), muy lejos de los 93×846 px de antes.
 *
 * `data-testid="cad-toolbar"` y el nombre accesible de cada botón NO
 * cambian: `e2e/fixtures/tool-palette.ts` y los goldens 72/212 siguen
 * encontrando «Seleccionar» y «Encuadre» exactamente igual.
 */
// `Partial`, no `Record` completo: la UNIÓN `CadToolbarActionId` sigue
// teniendo diecisiete miembros (el registro de comandos no se tocó), pero
// sólo tres tienen botón de paleta hoy. Un `Record` completo obligaría a
// fingir un icono para los catorce que ya no se pintan aquí.
const ICONS: Partial<Record<CadToolbarActionId, typeof MousePointer2>> = {
  select: MousePointer2,
  pan: Hand,
  fit_view: Expand,
};

export function CadToolPalette({
  activeTool,
  onRun,
}: {
  activeTool: string;
  onRun: (id: CadToolbarActionId) => void;
}) {
  // Los tres controles que quedan están en `READ_ONLY_TOOLBAR_ACTION_IDS`
  // (editor-keyboard.ts) SIEMPRE: son navegación de cámara, no mutan el
  // dibujo, así que un plano de sólo lectura no tiene motivo para
  // deshabilitarlos. Por eso el componente ya no recibe `readOnly` ni
  // `canUndo`/`canRedo` — Deshacer/Rehacer vivían aquí y se mudaron a la
  // cinta con su propio estado habilitado/deshabilitado.
  // En Esencial la paleta no se monta: Seleccionar ya está en la barra y
  // Encuadre / Ajustar todo siguen en Ctrl+K y con la rueda del ratón.
  const mode = useCadUiMode();
  if (mode === "esencial") return null;
  return (
    <div
      data-testid="cad-toolbar"
      className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-control border border-border bg-surface/90 p-1 shadow-floating backdrop-blur"
    >
      {CAD_TOOLBAR_ACTIONS.map((action) => (
        <ToolButton
          key={action.id}
          action={action}
          active={activeTool === action.id}
          onRun={onRun}
        />
      ))}
    </div>
  );
}

function ToolButton({
  action,
  active,
  onRun,
}: {
  action: CadToolbarAction;
  active: boolean;
  onRun: (id: CadToolbarActionId) => void;
}) {
  // No-null: `ICONS` cubre cada id que `CAD_TOOLBAR_ACTIONS` declara hoy
  // (los tres controles de navegación); si alguien añade un cuarto sin
  // icono, `CadToolPalette.spec.ts` lo dice al iterar `CAD_TOOLBAR_ACTIONS`.
  const Icon = ICONS[action.id]!;
  return (
    <button
      type="button"
      onClick={() => onRun(action.id)}
      // El `title` nativo se conserva ADEMÁS del tooltip dibujado: es lo que
      // lee un lector de pantalla y lo que sobrevive si el CSS no carga. Sin
      // paréntesis de una letra: `keyboard-alias-collisions.spec.ts` los lee
      // como un atajo anunciado, y sólo «Encuadre» tiene uno (Space, no una
      // letra suelta de acad.pgp).
      title={`${action.label}${action.shortcut ? ` · ${action.shortcut}` : ""} — ${action.description}`}
      className={cx(
        "group/tool relative flex h-7 w-7 shrink-0 items-center justify-center rounded-control",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-brand-strong text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only">{action.label}</span>

      {/*
        El tooltip se dibuja ARRIBA porque la barra vive pegada al borde
        inferior del lienzo: abajo se saldría de la ventana.
      */}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-max max-w-56 flex-col gap-0.5",
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
