import {
  Boxes,
  Box,
  Clipboard,
  Command,
  Compass,
  CornerUpRight,
  Eye,
  Layers,
  LayoutGrid,
  Orbit,
  PaintBucket,
  Palette,
  PenLine,
  Printer,
  Puzzle,
  Ruler,
  Settings2,
  Sparkles,
  Tag,
  Target,
  Terminal,
  Type,
  Wrench,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";

/**
 * Un icono por PANEL, no por comando: son 192 comandos y sólo unas dos
 * docenas de paneles (`ribbon.ts`, `CAD_PANEL_NAME_PATTERNS`). Repetir el
 * icono del panel en cada botón es honesto — no inventa una distinción entre
 * comandos que la cinta no está haciendo — y mantiene este archivo pequeño.
 * `Command` es el reposo: un panel nuevo que este mapa no conozca todavía
 * sigue teniendo botones, sólo que con el icono genérico.
 */
export const CAD_RIBBON_PANEL_ICONS: Readonly<Record<string, LucideIcon>> = {
  Dibujo: PenLine,
  Modificar: Wrench,
  Sólidos: Box,
  Sombreado: PaintBucket,
  Utilidades: Ruler,
  "Capas y propiedades": Layers,
  Portapapeles: Clipboard,
  Cotas: Ruler,
  Directrices: CornerUpRight,
  "Texto y tablas": Type,
  Tolerancias: Target,
  Estilos: Palette,
  Anotación: Tag,
  "Encuadre y zoom": ZoomIn,
  SCU: Compass,
  Vistas: Eye,
  "Vistas 3D": Orbit,
  "Estilos visuales": Sparkles,
  Ventanas: LayoutGrid,
  "Bloques y referencias": Boxes,
  "Plugins y paletas": Puzzle,
  "Trazar y publicar": Printer,
  Variables: Settings2,
  "AutoLISP y scripts": Terminal,
  Herramientas: Wrench,
};

export function cadRibbonPanelIcon(panel: string): LucideIcon {
  return CAD_RIBBON_PANEL_ICONS[panel] ?? Command;
}
