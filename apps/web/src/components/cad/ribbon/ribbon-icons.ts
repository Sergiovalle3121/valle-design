import {
  Box,
  Boxes,
  ClipboardPaste,
  Cog,
  Command,
  Compass,
  CornerUpRight,
  DoorOpen,
  Download,
  Droplets,
  Eye,
  GitCompare,
  Globe,
  Group,
  Layers,
  LayoutGrid,
  Link,
  ListChecks,
  Orbit,
  PaintBucket,
  Palette,
  PenLine,
  Printer,
  Puzzle,
  Ruler,
  Settings2,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Terminal,
  Type,
  type LucideIcon,
  Upload,
  Wrench,
  ZoomIn,
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
  // Inicio, en el orden de `ribbon-order.ts`.
  Dibujo: PenLine,
  Modificar: Wrench,
  Anotación: Tag,
  Capas: Layers,
  Bloque: Boxes,
  Propiedades: SlidersHorizontal,
  Grupos: Group,
  Utilidades: Ruler,
  Portapapeles: ClipboardPaste,
  Sombreado: PaintBucket,
  Arquitectura: DoorOpen,
  Instalaciones: Droplets,
  // Mechanical (Ola I): los normalizados en Insertar, el detallado en Anotar.
  Normalizados: Cog,
  Mecánica: Wrench,
  Sólidos: Box,
  // Insertar.
  Referencias: Link,
  "Importar y extraer": Download,
  Ubicación: Globe,
  Paletas: Puzzle,
  // Anotar.
  "Texto y tablas": Type,
  Cotas: Ruler,
  Directrices: CornerUpRight,
  Tolerancias: Target,
  Estilos: Palette,
  // Paramétrico.
  Geométricas: Shapes,
  Dimensionales: Ruler,
  Gestionar: ListChecks,
  // Vista.
  "Encuadre y zoom": ZoomIn,
  "Vistas 3D": Orbit,
  "Estilos visuales": Sparkles,
  SCU: Compass,
  Ventanas: LayoutGrid,
  Vistas: Eye,
  // Salida.
  "Trazar y publicar": Printer,
  Exportar: Upload,
  // Administrar.
  "Normas y reparación": ShieldCheck,
  Variables: Settings2,
  "AutoLISP y scripts": Terminal,
  Comparar: GitCompare,
  Herramientas: Wrench,
};

export function cadRibbonPanelIcon(panel: string): LucideIcon {
  return CAD_RIBBON_PANEL_ICONS[panel] ?? Command;
}
