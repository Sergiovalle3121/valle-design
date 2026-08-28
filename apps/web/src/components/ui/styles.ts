/**
 * EL VOCABULARIO COMPARTIDO DE LAS PRIMITIVAS.
 *
 * Aquí no hay componentes: hay las cuatro o cinco decisiones que TODAS las
 * primitivas tienen que tomar igual o se nota. Antes de este archivo, la app
 * tenía cinco constantes de botón incompatibles (`publicActionClass`,
 * `linkBase`, `buttonClass` y dos `BUTTON` distintos) y al menos 25
 * combinaciones de radio + fondo aplicadas al mismo tipo de control.
 *
 * REGLA DE ORO: ningún hex aquí. Todo sale de los tokens de `globals.css`. Si
 * un valor no existe como token, se añade AL SISTEMA y se consume desde aquí.
 */

/** Une clases ignorando `false`, `null` y `undefined`. */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * EL ANILLO DE FOCO, uno solo para toda la app.
 *
 * `globals.css` ya pinta un `:focus-visible` global, pero un control con fondo
 * propio necesita además separación del anillo respecto de su relleno o el
 * anillo se confunde con el borde. `ring-offset-background` es lo que hace que
 * el hueco tome el color de la superficie que hay detrás, en los dos temas.
 *
 * `focus-visible` y no `focus`: quien hace clic con el ratón no quiere ver un
 * anillo; quien navega con teclado no puede trabajar sin él.
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * ALTURA MÍNIMA DE UN OBJETIVO TÁCTIL en superficie pública.
 *
 * 44 px es el mínimo que fijan Apple y Google. `min-h-11` son 44 px exactos con
 * la escala por defecto de Tailwind. Las superficies densas del estudio tienen
 * su propia regla en `globals.css` bajo `@media (pointer: coarse)`, para no
 * pagar el tamaño con oclusión de lienzo en escritorio.
 */
export const touchTarget = "min-h-11";

/**
 * TRANSICIÓN DEL SISTEMA. Tres curvas y cinco duraciones, ninguna más (ver el
 * bloque «EL SISTEMA DE MOVIMIENTO» en `globals.css`).
 *
 * La duración ya no se escribe aquí como `duration-200`: se pide por nombre con
 * `motion-fast`, que es una clase del sistema. Un número de milisegundos en un
 * componente es una decisión que el componente de al lado no puede copiar sin
 * copiar también el criterio; un nombre sí se copia. `motion-fast` (150 ms) es
 * la velocidad de un control que responde al puntero; lo que se MUEVE de sitio
 * usa `motion-base` y lo que aparece por primera vez, `motion-slow`.
 *
 * Sólo se animan propiedades baratas — color, sombra, opacidad, transformación —
 * porque animar `height` o `width` obliga al navegador a rehacer el layout en
 * cada cuadro. `prefers-reduced-motion` la neutraliza en `globals.css`.
 */
export const motionBase =
  "transition-[background-color,border-color,color,box-shadow,opacity,transform] motion-fast";

/** Un control deshabilitado se ve deshabilitado y no acepta el puntero. */
export const disabledBase =
  "disabled:pointer-events-none disabled:opacity-50";

/**
 * LOS TRES NIVELES DE ELEVACIÓN, con nombre de intención.
 *
 * Medido antes de esto: 29 `shadow-2xl` contra 2 `shadow-sm`. Casi toda la
 * interfaz flotaba al máximo, que es exactamente cómo se ve una interfaz
 * aficionada: si todo flota, nada destaca y la jerarquía desaparece.
 *
 *   resting  — apoyado en la página. El 80% de las tarjetas vive aquí.
 *   elevated — se despega: menú, popover, tarjeta bajo el puntero.
 *   floating — vuela sobre todo: modal, paleta flotante, muelle.
 */
export const elevation = {
  none: "",
  resting: "shadow-resting",
  elevated: "shadow-elevated",
  floating: "shadow-floating",
} as const;

export type Elevation = keyof typeof elevation;

/**
 * LOS TRES RADIOS. Ver `--radius-*` en globals.css.
 * control ≤ 56 px de alto · card = tarjeta/panel · surface = modal/marco.
 */
export const radius = {
  control: "rounded-control",
  card: "rounded-card",
  surface: "rounded-surface",
  pill: "rounded-full",
} as const;

export type Radius = keyof typeof radius;

/* ── EL BOTÓN, EN CLASES ─────────────────────────────────────────────────────
   Vive AQUÍ y no en `Button.tsx` por una razón de frontera, no de orden:
   `Button.tsx` lleva `"use client"`, y una función exportada desde un módulo
   de cliente NO se puede invocar desde un componente de servidor —Next la
   convierte en una referencia remota y la llamada revienta en el build—. Media
   docena de páginas públicas son de servidor y necesitan la clase, así que la
   clase vive en un módulo sin directiva y el componente la importa.
   ────────────────────────────────────────────────────────────────────────── */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * LAS CUATRO VARIANTES — y el relieve que la campaña de firma les añadió.
 *
 * La v1 resolvía los estados con `brightness-95` al pulsar: el botón se
 * oscurecía y nada más. Funciona y no se siente. Un control que se pulsa de
 * verdad hace DOS cosas a la vez —se hunde un píxel y pierde su filo de luz—,
 * y ese par es la diferencia entre un rectángulo de color y una tecla.
 *
 * `shadow-control` es ese filo (`--shadow-btn` en globals.css: un `inset` de
 * luz arriba más la sombra proyectada). `active:translate-y-px` es el hundido.
 * Al soltarlos los dos a la vez en `:active`, el botón vuelve solo.
 */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  /** La acción principal de la pantalla. Como mucho una por vista. */
  primary:
    "bg-brand-strong text-primary-foreground shadow-control hover:bg-brand-hover active:translate-y-px active:shadow-none",
  /** La alternativa legítima: mismo peso de decisión, menos peso visual. */
  secondary:
    "border border-border bg-card text-foreground shadow-resting hover:bg-muted hover:border-muted-foreground/40 active:translate-y-px active:shadow-none",
  /** Acción terciaria y todo el `chrome`: no compite con nada. */
  ghost:
    "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted",
  /** Destructiva. Rojo SÓLO aquí: si el rojo está en todas partes, no avisa. */
  danger:
    "bg-danger text-danger-foreground shadow-control hover:brightness-110 active:translate-y-px active:shadow-none",
};

/**
 * Los tres tamaños. `md` es el de las superficies públicas y cumple los 44 px
 * de objetivo táctil sin ayuda; `sm` existe para el chrome denso del estudio,
 * donde la regla `@media (pointer: coarse)` de `globals.css` ya lo agranda solo
 * cuando hay dedo en vez de ratón.
 *
 * El relleno horizontal subió un escalón en los tres (2,5→3, 4→5, 6→7) por una
 * razón que sólo se ve en la página entera: un botón con poco aire lateral se
 * lee como un control de formulario, y la portada necesita que su llamada
 * principal se lea como una PUERTA. El alto no se toca — es el que cumple los
 * 44 px.
 */
export const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "type-caption min-h-8 gap-1.5 px-3 font-medium",
  md: "type-small min-h-11 gap-2 px-5 font-semibold",
  lg: "type-body min-h-12 gap-2.5 px-7 font-semibold",
};

/**
 * La MISMA piel para un `<Link>` o un `<a>`.
 *
 * Un enlace que parece botón tiene que ser un enlace de verdad —se abre en
 * pestaña nueva, se copia la dirección, lo indexa el buscador—, así que no se
 * resuelve envolviendo un `<button>`: se resuelve dando la clase al enlace.
 */
export function buttonClass({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cx(
    "inline-flex items-center justify-center rounded-control whitespace-nowrap",
    motionBase,
    focusRing,
    BUTTON_SIZES[size],
    BUTTON_VARIANTS[variant],
    fullWidth && "w-full",
    className,
  );
}
