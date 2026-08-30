/**
 * Los tokens de superficie del sistema, RESUELTOS, para consumidores que no
 * son CSS: el `themeColor` del layout, el renderizador SVG de la galería de
 * plantillas y cualquier generador de imagen que tenga que pintar «el papel»
 * del producto fuera del árbol de estilos.
 *
 * FUENTE ÚNICA: `src/app/globals.css` (`:root` y `.dark`). Estos valores son
 * la resolución hex de esos HSL, verificada a mano; si un token de allí
 * cambia, cambia aquí en el mismo commit — el gate de contraste mide el CSS,
 * y este módulo existe justo para que nadie vuelva a escribir un hex suelto
 * «parecido» en un generador.
 */
export interface ThemeSurface {
  /** --background: el papel. */
  background: string;
  /** --foreground: la tinta. */
  foreground: string;
  /** --muted: superficie hundida (cajetín, franjas). */
  muted: string;
  /** --border: la línea fina de carpintería. */
  border: string;
  /** --primary: el acento eléctrico de la marca. */
  primary: string;
}

/** `:root` de globals.css — 36 24% 96% / 30 20% 12% / 36 18% 93% / 32 14% 84% / 251 84% 62%. */
export const THEME_LIGHT: ThemeSurface = {
  background: "#f7f5f2",
  foreground: "#251f18",
  muted: "#f0eeea",
  border: "#dcd7d0",
  primary: "#6b4def",
};

/** `.dark` de globals.css — 30 8% 4.5% / 36 22% 96% / 28 6% 18% / 28 6% 24% / 251 96% 72%. */
export const THEME_DARK: ThemeSurface = {
  background: "#0c0b0b",
  foreground: "#f7f5f3",
  muted: "#312e2b",
  border: "#413d3a",
  primary: "#8c73fc",
};

export type ThemeName = "light" | "dark";

export function themeSurface(theme: ThemeName): ThemeSurface {
  return theme === "dark" ? THEME_DARK : THEME_LIGHT;
}
