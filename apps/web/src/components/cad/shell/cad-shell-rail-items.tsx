"use client";

/**
 * Los items de los dos rieles del armazón — datos puros (icono + nombre
 * accesible + tooltip), sacados de `Layout3DEditor.tsx` porque su
 * presupuesto de líneas sólo puede bajar (`scripts/cad/monolith-budget.
 * json`). El COMPORTAMIENTO (qué abre cada uno) se queda en el editor, que
 * es quien tiene el estado; esto es sólo el catálogo.
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
    icon: <Boxes className="h-4 w-4" />,
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
    icon: <PanelRight className="h-4 w-4" />,
    ariaLabel: "Abrir propiedades",
    title: "Propiedades de la selección",
  },
  {
    id: "selection",
    icon: <ScanEye className="h-4 w-4" />,
    ariaLabel: "Abrir selección profesional",
    title: "Selección profesional: ventana, cruce, polígono, fence, lasso, filtros y cycling",
  },
  {
    id: "hatch",
    icon: <BrickWall className="h-4 w-4" />,
    ariaLabel: "Abrir HATCH",
    title: "HATCH: selección, pick point, islands y asociatividad",
  },
  {
    id: "dimension",
    icon: <RulerDimensionLine className="h-4 w-4" />,
    ariaLabel: "Abrir dimensiones",
    title: "Dimensiones asociativas: linear, aligned, angular, radius, diameter, ordinate y arc length",
  },
  {
    id: "mleader",
    icon: <Waypoints className="h-4 w-4" />,
    ariaLabel: "Abrir MLEADER",
    title: "MLEADER: directriz semántica asociativa con una o múltiples líneas",
  },
  {
    id: "blocks",
    icon: <Boxes className="h-4 w-4" />,
    ariaLabel: "Abrir bloques y xrefs",
    title: "BLOCK/INSERT: definiciones vivas, atributos, biblioteca y XREF, redefine, replace, explode y purge",
  },
  {
    id: "collaboration",
    icon: <GitMerge className="h-4 w-4" />,
    ariaLabel: "Abrir colaboración",
    title: "Compare / Merge / Review: base, mine, theirs, conflictos, comentarios, markups y links de revisión",
  },
  {
    id: "workspace",
    icon: <Settings2 className="h-4 w-4" />,
    ariaLabel: "Abrir workspace profesional",
    title: "Workspace profesional: docks, tema, idioma, puntero, clic derecho y atajos",
  },
];
