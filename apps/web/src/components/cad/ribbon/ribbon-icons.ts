import {
  Box,
  Boxes,
  ClipboardPaste,
  Cog,
  Combine,
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
  Layers2,
  LayoutGrid,
  Link,
  ListChecks,
  Orbit,
  Palette,
  PenLine,
  Printer,
  Puzzle,
  Ruler,
  Scale,
  Scissors,
  Settings2,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
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
  Arquitectura: DoorOpen,
  Instalaciones: Droplets,
  Superficies: Square,
  // Mechanical (Ola I): los normalizados en Insertar, el detallado en Anotar.
  Normalizados: Cog,
  Mecánica: Wrench,
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
  // Sólidos 3D.
  Primitivas: Box,
  Sólido: Layers2,
  Booleanas: Combine,
  "Edición de sólidos": Scissors,
  "Consulta 3D": Scale,
  // Salida.
  "Trazar y publicar": Printer,
  Exportar: Upload,
  // «Render» no: sus comandos aún no están disponibles y el panel no se monta
  // (ribbon-icons.spec exige que cada clave nombre un panel que existe).
  // Administrar.
  "Normas y reparación": ShieldCheck,
  Variables: Settings2,
  "AutoLISP y scripts": Terminal,
  Comparar: GitCompare,
  Herramientas: Wrench,
  Mallas: Boxes,
};

export function cadRibbonPanelIcon(panel: string): LucideIcon {
  return CAD_RIBBON_PANEL_ICONS[panel] ?? Command;
}
