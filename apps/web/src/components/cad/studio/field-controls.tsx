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

/**
 * `variant`: «sistema-visual» (ola6). Antes TODO botón activo —la
 * herramienta de dibujo en uso (Seleccionar/Medir/Muros) igual que un ajuste
 * de fondo (grilla/snap/referencia a objetos)— llevaba el MISMO relleno
 * sólido de acento. Con grilla y snap activados por defecto, eso pintaba un
 * trío morado sin rótulo junto a la cinta que el dueño no supo leer («cuyo
 * significado no se entiende»): el acento fuerte dejaba de significar «esto
 * es distinto» porque lo llevaba casi todo.
 *
 * `"solid"` (por defecto, sin tocar ningún llamador existente) sigue siendo
 * el relleno de acento completo — se reserva para el modo de interacción
 * REAL: el que cambia qué hace un clic en el lienzo (Seleccionar/Medir/
 * Muros). `"soft"` es la tinta sobre superficie clara ya usada en
 * `CadHatchPalette` (`bg-accent/15` + `text-primary-ink`, la pareja
 * relleno/tinta del sistema de diseño — nunca `--accent` a secas como
 * color de letra) para un ajuste que está ENCENDIDO pero no es un modo:
 * grilla, snap, referencia a objetos.
 */
export function T3Btn({
  active,
  onClick,
  title,
  children,
  disabled,
  variant = "solid",
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "solid" | "soft";
}) {
  const activeClass =
    variant === "soft"
      ? "bg-accent/15 text-primary-ink hover:bg-accent/25"
      : "bg-accent text-accent-foreground";
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded-control transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${active ? activeClass : "text-muted-foreground dark:text-muted-foreground hover:bg-muted"}`}
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
