/**
 * Presentación del editor heredado: temas de escena y tabla de atajos.
 *
 * Dos tablas de datos puros —ni React, ni THREE, ni estado— que ocupaban un
 * centenar de líneas dentro de `Layout3DEditor.tsx`. Cambiar un color de tema o
 * añadir un atajo a la ayuda no debería exigir abrir un archivo de 22.000
 * líneas, y ahora no lo exige.
 */

/** Visual theme presets for the scene (background / fog / floor / grid). */
export type Theme3D = "dark" | "light" | "night" | "studio";
export const THEMES: Record<
  Theme3D,
  {
    bg: number;
    ground: number;
    gridA: number;
    gridB: number;
    fog: number;
    label: string;
  }
> = {
  dark: {
    bg: 0x0a0f1e,
    ground: 0x14203a,
    gridA: 0x2a3a5c,
    gridB: 0x1b2640,
    fog: 0x0a0f1e,
    label: "Oscuro",
  },
  light: {
    bg: 0xeaf0f8,
    ground: 0xd7e2f1,
    gridA: 0x9db4d6,
    gridB: 0xbccce4,
    fog: 0xeaf0f8,
    label: "Claro",
  },
  night: {
    bg: 0x05070d,
    ground: 0x0b1322,
    gridA: 0x1e2c47,
    gridB: 0x121a2e,
    fog: 0x05070d,
    label: "Noche",
  },
  studio: {
    bg: 0x202329,
    ground: 0x2b2f37,
    gridA: 0x3c424d,
    gridB: 0x2f343d,
    fog: 0x202329,
    label: "Estudio",
  },
};

/** Keyboard + tool reference shown in the help overlay. */
export const HELP_SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Herramientas",
    rows: [
      ["V", "Seleccionar / mover"],
      ["M", "Medir / acotar"],
      ["A", "Preparar pasillo / holgura"],
      ["L", "Conectar flujo"],
      ["Z", "Insertar zona"],
      ["I", "Abrir equipo / simbolos"],
      ["T", "Agregar nota"],
      ["W", "Dibujar muros (Shift = 45°)"],
      ["F", "Enfocar layout"],
      ["G", "Mostrar / ocultar grilla"],
      ["O", "Activar / desactivar object snap"],
      ["Shift+V", "Validar layout"],
      ["E", "Exportar DXF"],
      ["Recorrido", "Caminar en primera persona"],
    ],
  },
  {
    title: "Selección",
    rows: [
      ["Clic", "Seleccionar un objeto"],
      ["Shift+clic", "Agregar / quitar de la selección"],
      ["Ctrl/⌘+A", "Seleccionar todo"],
      ["Esc", "Deseleccionar / salir / cerrar"],
    ],
  },
  {
    title: "Edición",
    rows: [
      ["Arrastrar", "Mover (en grupo si hay varios)"],
      ["← → ↑ ↓", "Ajustar (Shift = ×5)"],
      ["R / Shift+R", "Rotar ±15°"],
      ["Ctrl/⌘+D", "Duplicar"],
      ["Supr", "Borrar selección"],
      ["Ctrl/⌘+Z / ⇧+Z", "Deshacer / Rehacer"],
    ],
  },
  {
    title: "Vista",
    rows: [
      ["Arrastrar fondo", "Orbitar"],
      ["Rueda", "Acercar / alejar"],
      ["F", "Ajustar a contenido / selección"],
      ["Shift+F", "Ajustar a toda la planta"],
      ["\\", "Modo foco (ocultar paneles)"],
      ["Recorrido", "Arrastrar = mirar · WASD = caminar"],
      ["?", "Mostrar esta ayuda"],
    ],
  },
];
