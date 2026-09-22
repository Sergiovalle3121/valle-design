"use client";

/**
 * Los items de los dos rieles del armazón — datos puros (icono + nombre
 * accesible + tooltip), sacados de `Layout3DEditor.tsx` porque su
 * presupuesto de líneas sólo puede bajar (`scripts/cad/monolith-budget.
 * json`). El COMPORTAMIENTO (qué abre cada uno) se queda en el editor, que
 * es quien tiene el estado; esto es sólo el catálogo.
 *
 * Cada icono lleva `aria-hidden="true"`, igual que `Ellipsis` en
 * `CadStatusBar.tsx` o `HistoryIcon`/`ChevronDown`/`ChevronUp` en
 * `CadCommandLine.tsx`: el botón que lo envuelve ya trae su nombre accesible
 * por `ariaLabel` (`CadDockRail.tsx` lo pasa a `aria-label`), así que el SVG
 * decorativo no debe anunciarse aparte. Sin esto axe-core marca «svg-img-alt»
 * — violación seria — en los dos temas por igual, porque no depende de color.
 */
import {
  BrickWall,
  Boxes,
  GitMerge,
  PanelRight,
  RulerDimensionLine,
  ScanEye,
  Settings2,
  Waypoints,
} from "lucide-react";
import type { CadRailItem } from "./CadDockRail";

/**
 * EL RIEL IZQUIERDO — un único destino hoy (la biblioteca). "Bloques" y
 * "xrefs" ya viven en el riel derecho (`CAD_RIGHT_RAIL_ITEMS`, id "blocks");
 * "recorrido" es el recorrido guiado, que no es un panel que se abra a mano.
 */
export const CAD_LEFT_RAIL_ITEMS: readonly CadRailItem[] = [
  {
    id: "biblioteca",
    essential: true,
    icon: <Boxes aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir biblioteca",
    title: "Biblioteca: plantillas, mis bloques, arquitectura y símbolos CAD",
  },
];

/**
 * EL RIEL DERECHO — las 7 paletas profesionales que antes eran botones de la
 * barra superior de 48/56 px, más «Propiedades» (el contenido de fábrica).
 */
export const CAD_RIGHT_RAIL_ITEMS: readonly CadRailItem[] = [
  {
    id: "properties",
    essential: true,
    icon: <PanelRight aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir propiedades",
    title: "Propiedades de la selección",
  },
  {
    id: "selection",
    icon: <ScanEye aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir selección profesional",
    title: "Selección profesional: ventana, cruce, polígono, fence, lasso, filtros y cycling",
  },
  {
    id: "hatch",
    icon: <BrickWall aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir HATCH",
    title: "HATCH: selección, pick point, islands y asociatividad",
  },
  {
    id: "dimension",
    icon: <RulerDimensionLine aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir dimensiones",
    title: "Dimensiones asociativas: linear, aligned, angular, radius, diameter, ordinate y arc length",
  },
  {
    id: "mleader",
    icon: <Waypoints aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir MLEADER",
    title: "MLEADER: directriz semántica asociativa con una o múltiples líneas",
  },
  {
    id: "blocks",
    icon: <Boxes aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir bloques y xrefs",
    title: "BLOCK/INSERT: definiciones vivas, atributos, biblioteca y XREF, redefine, replace, explode y purge",
  },
  {
    id: "collaboration",
    icon: <GitMerge aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir colaboración",
    title: "Compare / Merge / Review: base, mine, theirs, conflictos, comentarios, markups y links de revisión",
  },
  {
    id: "workspace",
    essential: true,
    icon: <Settings2 aria-hidden="true" className="h-4 w-4" />,
    ariaLabel: "Abrir workspace profesional",
    title: "Workspace profesional: docks, tema, idioma, puntero, clic derecho y atajos",
  },
];
