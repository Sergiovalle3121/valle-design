"use client";

/**
 * Los dos renglones de ayuda que flotan sobre el lienzo.
 *
 * Son presentacionales enteros: entran tres banderas y sale texto. Estaban
 * escritos en línea dentro del JSX de 6.300 líneas del monolito, mezclados con
 * la lógica de dibujo, y ahí ni se leían ni se podían cambiar sin abrir el
 * archivo entero.
 *
 * El texto se queda deliberadamente en castellano y sin claves de traducción:
 * la i18n del editor es transversal y llega con las paletas. Sacarlo aquí es
 * precisamente lo que hará que ese día sea un cambio de un archivo.
 */
import React from "react";
import { Grid2x2, Move3d, Ruler, ShieldAlert, Spline } from "lucide-react";

export interface CadViewportPromptProps {
  /** Herramienta activa, ya reducida a las tres familias que dan aviso. */
  kind: "measure" | "wall" | "draw";
  /** Aviso vivo del comando en curso; manda sobre el texto por defecto. */
  live?: string | null;
  /**
   * Hueco para el modo de captura resuelto BAJO EL CURSOR.
   *
   * Se rellena de forma imperativa, escribiendo `textContent`, porque cambia
   * con cada movimiento del ratón: pasarlo como prop sería un render del árbol
   * del editor por cada muestra del puntero, y el árbol de aquí abajo tiene
   * 6.000 líneas de JSX. Es el mismo motivo por el que el cursor vivo no es un
   * componente.
   */
  snapLabelRef?: React.Ref<HTMLSpanElement>;
}

/** Aviso superior: qué espera la herramienta activa AHORA mismo. */
export function CadViewportPrompt({ kind, live, snapLabelRef }: CadViewportPromptProps) {
  return (
    <div
      data-testid="cad-live-prompt"
      className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-warning/15 text-gray-900 type-caption font-semibold inline-flex items-center gap-1.5 pointer-events-none"
    >
      {kind === "measure" ? (
        <Ruler className="w-3.5 h-3.5" />
      ) : (
        <Spline className="w-3.5 h-3.5" />
      )}
      {live ??
        (kind === "measure"
          ? "Clic en dos puntos para medir"
          : kind === "draw"
            ? "Dibujo CAD activo · clic o coordenada · Enter termina"
            : "Clic para trazar muros · Esc termina")}
      <span ref={snapLabelRef} data-testid="cad-live-snap-label" />
    </div>
  );
}

export interface CadViewportHintProps {
  kind: "walk" | "measure" | "wall" | "draw" | "select";
}

const HINTS: Record<CadViewportHintProps["kind"], string> = {
  walk: "Arrastra para mirar · W A S D para caminar · Esc para salir del recorrido",
  measure:
    "Clic en dos puntos para medir · arrastra el fondo para orbitar · Esc cancela",
  wall: "Clic en cada esquina para trazar muros · Shift = 45° · ORTO = ejes · teclea x,y / @dx,dy / @d<áng · Esc termina",
  draw: "LINE/PLINE/RECT: clic o coordenada · @relativo y @dist<ángulo · Enter termina · Esc cancela",
  select:
    "Arrastra para mover · Shift+clic multiselecciona · Shift+arrastre = ventana · fondo = orbitar · rueda = zoom · R rota · Ctrl+C/V copia/pega · Supr borra",
};

export interface CadOverlayLegendsProps {
  /** Mapa de calor de ocupación del piso. */
  heat: boolean;
  /** Resaltado de holguras y traslapes. */
  gaps: boolean;
}

/**
 * Leyendas de las capas de análisis, abajo a la izquierda.
 *
 * Las dos comparten esquina, así que cuando ambas están activas la de holguras
 * sube una fila. Ese desplazamiento condicional es la única lógica que hay
 * aquí, y estaba escrito como un `style` en línea a 19.200 líneas de distancia
 * de la leyenda con la que colisiona.
 */
export function CadOverlayLegends({ heat, gaps }: CadOverlayLegendsProps) {
  return (
    <>
      {heat && (
        <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-card bg-surface/90 backdrop-blur border border-border type-micro text-foreground inline-flex items-center gap-2 pointer-events-none">
          <Grid2x2 className="w-3.5 h-3.5" /> Ocupación del piso
          <span className="inline-flex items-center gap-1">
            menos
            <span
              className="inline-block w-12 h-2 rounded-sm"
              style={{
                background:
                  "linear-gradient(90deg, rgba(244,63,94,0.15), rgba(244,63,94,1))",
              }}
            />
            más
          </span>
        </div>
      )}
      {gaps && (
        <div
          className="absolute bottom-3 left-3 px-3 py-1.5 rounded-card bg-surface/90 backdrop-blur border border-border type-micro text-foreground inline-flex items-center gap-3 pointer-events-none"
          style={{ bottom: heat ? "3.25rem" : undefined }}
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Holguras
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{ background: "#f59e0b" }}
            />{" "}
            juntos
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{ background: "#ef4444" }}
            />{" "}
            traslape
          </span>
        </div>
      )}
    </>
  );
}

/** Aviso inferior: qué se puede hacer con el ratón en este modo. */
export function CadViewportHint({ kind }: CadViewportHintProps) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur border border-border type-micro text-foreground inline-flex items-center gap-2 pointer-events-none">
      <Move3d className="w-3.5 h-3.5" />
      {HINTS[kind]}
    </div>
  );
}
