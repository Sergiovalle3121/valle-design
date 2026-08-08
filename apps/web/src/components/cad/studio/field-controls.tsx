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
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${active ? "text-white" : "text-gray-500 dark:text-gray-400 hover:bg-white/10"}`}
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
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
        {label}
      </span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onBlur={onEnd}
        className="w-full px-2 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[13px] text-white focus:outline-none focus:border-cyan-400/60"
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
      <span className="block text-[9px] uppercase tracking-wide text-gray-500 mb-0.5">
        {label}
      </span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-1.5 py-1 rounded-md bg-white/[0.06] border border-white/10 text-[12px] text-white focus:outline-none focus:border-cyan-400/60"
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
      className="inline-flex items-center justify-center py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-gray-200"
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
      className={`rounded-lg px-3 py-2 ${highlight ? "bg-cyan-500/15" : "bg-white/[0.04]"}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`text-[15px] font-semibold ${highlight ? "text-cyan-300" : "text-white"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
        {label}
      </span>
      <div className="w-full px-2 py-1 rounded-md bg-white/[0.03] border border-white/5 text-[13px] text-gray-500 dark:text-gray-400">
        {value}
      </div>
    </div>
  );
}
