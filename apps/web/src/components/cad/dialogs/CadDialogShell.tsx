"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { FOCUSABLE } from "@/components/ui/Modal";

/**
 * EL MARCO COMÚN DE LOS CUADROS DEL ESTUDIO.
 *
 * Los ocho cuadros modales del editor —ayuda, clonar, celdas, versiones,
 * informe, exportación, juego de láminas, cuantificación— repetían el mismo
 * marco palabra por palabra dentro del monolito: velo a pantalla completa que
 * cierra al pulsar fuera, tarjeta que detiene la propagación para que un clic
 * dentro no cierre, cabecera con icono, título, separador flexible y botón de
 * cerrar. Ochocientas líneas de las que quizá cincuenta decían algo.
 *
 * Extraerlo no es sólo quitar líneas: es que el comportamiento sea uno solo.
 * Antes, cada copia podía divergir —y divergía: unos velos son `bg-black/50`,
 * otros `bg-black/55`— y una corrección de accesibilidad había que aplicarla
 * ocho veces o no aplicarla.
 *
 * ## Lo que el marco garantiza para todos
 *
 * - `role="dialog"` y `aria-modal` con el título enlazado por `aria-labelledby`.
 *   Sin eso, un lector de pantalla anuncia «grupo» y sigue leyendo la página de
 *   debajo como si el cuadro no existiera.
 * - **Escape cierra.** No estaba en ninguno de los ocho: se cerraban con el
 *   ratón o no se cerraban. Se escucha en fase de CAPTURA y se detiene la
 *   propagación, para que el Escape que cierra el cuadro no llegue además al
 *   manejador global del editor y cancele de paso el comando en curso.
 * - El clic en el velo cierra; el clic dentro, no.
 * - **FOCO ATRAPADO Y DEVUELTO** (P1-FE4, campaña de sitio): el mismo patrón
 *   probado de `Modal` — al abrir, el foco va al primer control del cuadro;
 *   Tab y Shift+Tab ciclan DENTRO; al cerrar, el foco vuelve al control que
 *   abrió. Sin esto, quien navega con teclado sobre el editor tabulaba hacia
 *   la paleta de abajo con el cuadro aún delante. Era la deuda con nombre de
 *   DEUDA-MONOLITO.md; deja de serlo aquí.
 */
export function CadDialogShell({
  onClose,
  icon,
  titulo,
  id,
  ancho,
  alto,
  cerrarTestId,
  insignia,
  children,
}: {
  onClose: () => void;
  icon: ReactNode;
  titulo: ReactNode;
  /** Base del `id` del título, para enlazarlo con `aria-labelledby`. */
  id: string;
  /** Clase de anchura de la tarjeta; cada cuadro tiene la suya. */
  ancho: string;
  /** Clase de altura máxima y desbordamiento, cuando el contenido puede crecer. */
  alto?: string;
  /** `data-testid` del botón de cerrar, cuando algún golden lo busca. */
  cerrarTestId?: string;
  /**
   * Adorno a la derecha del título — una insignia de estado, un contador. Va
   * DENTRO de la cabecera y no como primer hijo del cuerpo porque forma parte
   * del título para quien lee: «Exportar DXF · Bloqueado» es una sola frase.
   */
  insignia?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** El control que abrió el cuadro; el foco vuelve ahí al cerrar. */
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      // El foco puede estar FUERA del cuadro (el editor de abajo) si algo lo
      // movió: en ese caso también se re-captura hacia el primer control.
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? panel.contains(active) : false;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", alPulsar, { capture: true });
    return () =>
      document.removeEventListener("keydown", alPulsar, { capture: true });
  }, [onClose]);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Al primer control, no al panel: quien abre con teclado quiere actuar,
    // no tabular una vez más para empezar (misma decisión que Modal).
    const panel = panelRef.current;
    const firstControl = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstControl ?? panel)?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  return (
    <div
      className="absolute inset-0 z-[80] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        className={`${ancho} max-w-full ${alto ?? ""} rounded-2xl border border-border bg-surface shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {icon}
          <span id={`${id}-titulo`} className="text-sm font-semibold">
            {titulo}
          </span>
          {insignia}
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Cerrar"
            data-testid={cerrarTestId}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
