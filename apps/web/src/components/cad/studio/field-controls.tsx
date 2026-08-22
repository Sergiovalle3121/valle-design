/**
 * Controles de formulario del estudio CAD.
 *
 * Primer paso de la descomposición de `Layout3DEditor.tsx`, y a propósito el
 * más aburrido: seis componentes puramente presentacionales, sin estado, sin
 * efectos y sin dependencias del editor. Se mueven tal cual —misma marca, mismas
 * clases, mismo comportamiento— para que el diff sea verificable de un vistazo.
 *
 * El método de la descomposición es ese: primero lo puro, después el
 * comportamiento, y el estado el último. Nunca estado y comportamiento en el
 * mismo cambio.
 */
import React from "react";

export function T3Btn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-control transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${active ? "text-foreground" : "text-muted-foreground dark:text-muted-foreground hover:bg-muted"}`}
      style={active ? { background: "#0e7490" } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * Campo numérico del panel de propiedades.
 *
 * Antes disparaba `onBegin` en el FOCO, que dejaba un punto de deshacer aunque
 * el usuario no escribiera nada: enfocar y salir bastaba para que el siguiente
 * Ctrl+Z reviniera la acción ANTERIOR. Ahora el checkpoint lo abre la propia
 * mutación —`beginFieldEdit`, una vez por sesión de edición— y aquí sólo queda
 * cerrarla al salir.
 */
export function NumField({
  label,
  value,
  onChange,
  onEnd,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onEnd?: () => void;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="block type-micro uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onBlur={onEnd}
        className="w-full px-2 py-1 rounded-control bg-muted/60 border border-border type-small text-foreground focus:outline-none focus:border-primary/30"
      />
    </label>
  );
}

export function DimInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="block type-micro uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-1.5 py-1 rounded-control bg-muted/60 border border-border type-caption text-foreground focus:outline-none focus:border-primary/30"
      />
    </label>
  );
}

export function AlignBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center py-1.5 rounded-control bg-muted/60 hover:bg-muted text-foreground"
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-control px-3 py-2 ${highlight ? "bg-primary/15" : "bg-muted/40"}`}
    >
      <div className="type-micro uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`type-body font-semibold ${highlight ? "text-primary-ink" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block type-micro uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </span>
      <div className="w-full px-2 py-1 rounded-control bg-muted/40 border border-border type-small text-muted-foreground dark:text-muted-foreground">
        {value}
      </div>
    </div>
  );
}
