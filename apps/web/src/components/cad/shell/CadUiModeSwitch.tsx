"use client";

/**
 * El interruptor Esencial ⇄ Pro de la fila superior del estudio.
 *
 * UN botón con `role="switch"`: encendido es Pro (la cinta entera), apagado
 * es Esencial (la barra corta). El rótulo visible es «Pro» —lo que se
 * enciende— y el nombre accesible dice la acción, no el estado, porque es lo
 * que un lector de pantalla anuncia al enfocar un control. No repite ningún
 * título vigilado por `check-e2e-localizadores` («Minimizar la cinta»,
 * «Girar», «Terminar», presets de cámara).
 *
 * Sin `absolute`/`fixed`: vive dentro de la fila `cad-top-toolbar` y no puede
 * salirse de su hueco. El estado lo lee del anfitrión, sin props del monolito.
 */
import { cx } from "@/components/ui";
import { cadUiModeHost, useCadUiMode } from "./ui-mode-host";

export interface CadUiModeSwitchProps {
  className?: string;
}

export function CadUiModeSwitch({ className }: CadUiModeSwitchProps) {
  const mode = useCadUiMode();
  const pro = mode === "pro";
  const action = pro ? "Cambiar a modo Esencial" : "Cambiar a modo Pro";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={pro}
      aria-label={action}
      title={action}
      data-testid="cad-ui-mode-switch"
      data-mode={mode}
      onClick={cadUiModeHost.toggle}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-control px-1.5 py-1 type-caption font-semibold transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pro
          ? "text-foreground hover:bg-muted"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {/* La pista y el pomo: el estado se ve además de oírse. */}
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border transition-colors duration-200",
          pro ? "border-brand-strong bg-brand-strong" : "border-input bg-card",
        )}
      >
        <span
          className={cx(
            "h-2.5 w-2.5 rounded-full transition-transform duration-200",
            pro
              ? "translate-x-3 bg-primary-foreground"
              : "translate-x-0.5 bg-muted-foreground",
          )}
        />
      </span>
      <span>Pro</span>
    </button>
  );
}
