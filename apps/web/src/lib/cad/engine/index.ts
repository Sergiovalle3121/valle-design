/**
 * Punto de entrada del motor de comandos.
 *
 * Un único sitio desde el que el editor obtiene el registro completo. La paleta
 * `Ctrl+K`, la línea de comandos, la barra de herramientas y —cuando lleguen—
 * los scripts leen todos de aquí, así que un comando nuevo aparece en los
 * cuatro sitios a la vez o en ninguno. Ese es justamente el problema que hoy
 * existe con tres sistemas de comandos que no se conocen entre sí.
 */
import { CAD_BLOCK_COMMANDS } from "./commands/blocks";
import { CAD_GROUP_COMMANDS } from "./commands/groups";
import { CAD_XREF_COMMANDS } from "./commands/xrefs";
import { CAD_DESIGN_CENTER_COMMANDS } from "./commands/design-center";
import { CAD_DRAW_BASIC_COMMANDS } from "./commands/draw-basics";
import { CAD_DRAW_CURVE_COMMANDS } from "./commands/draw-curves";
import { CAD_ANNOTATION_V4_COMMANDS } from "./commands/draw-annotation-v4";
import { CAD_ANNOTATE_STYLE_COMMANDS } from "./commands/annotate-styles";
import { CAD_DIMENSION_ANGULAR_COMMANDS } from "./commands/annotate-dimensions-angular";
import { CAD_HATCH_COMMANDS } from "./commands/annotate-hatch";
import { CAD_LEADER_COMMANDS } from "./commands/annotate-leaders";
import { CAD_TOLERANCE_COMMANDS } from "./commands/annotate-tolerance";
import { CAD_DIMENSION_CHAIN_COMMANDS } from "./commands/annotate-dimension-chains";
import { CAD_DIMENSION_LINEAR_COMMANDS } from "./commands/annotate-dimensions";
import { CAD_DIMENSION_RADIAL_COMMANDS } from "./commands/annotate-dimensions-radial";
import { CAD_ANNOTATE_TEXT_COMMANDS } from "./commands/annotate-text";
import { CAD_DRAW_CONSTRUCTION_COMMANDS } from "./commands/draw-construction";
import { CAD_DRAW_FILL_COMMANDS } from "./commands/draw-fills";
import { CAD_DRAW_PLINE_COMMANDS } from "./commands/draw-pline";
import { CAD_DRAW_POINT_COMMANDS } from "./commands/draw-points";
import { CAD_DRAW_RECTANG_COMMANDS } from "./commands/draw-rectang";
import { CAD_DRAW_RING_COMMANDS } from "./commands/draw-rings";
import { CAD_DRAW_SPLINE_COMMANDS } from "./commands/draw-spline";
import { CAD_INQUIRY_LIST_COMMANDS } from "./commands/inquiry-list";
import { CAD_INQUIRY_MEASURE_COMMANDS } from "./commands/inquiry-measure";
import { CAD_REGION_COMMANDS } from "./commands/inquiry-region";
import { CAD_AUTOMATION_COMMANDS } from "./commands/automation-script";
import { CAD_MODIFY_ALIGN_COMMANDS } from "./commands/modify-align";
import { CAD_MODIFY_CLEANUP_COMMANDS } from "./commands/modify-cleanup";
import { CAD_SELECT_QUERY_COMMANDS } from "./commands/select-query";
import { CAD_SETTINGS_PALETTE_COMMANDS } from "./commands/settings-palettes";
import { CAD_SETTINGS_VARIABLE_COMMANDS } from "./commands/settings-variables";
import { CAD_MODIFY_ARRAY_COMMANDS } from "./commands/modify-array";
import { CAD_MODIFY_BASIC_COMMANDS } from "./commands/modify-basics";
import { CAD_MODIFY_JOIN_COMMANDS } from "./commands/modify-join";
import { CAD_MODIFY_PEDIT_COMMANDS } from "./commands/modify-pedit";
import { CAD_MODIFY_STRETCH_COMMANDS } from "./commands/modify-stretch";
import { CAD_MODIFY_EDGE_COMMANDS } from "./commands/modify-edges";
import { CAD_MIRROR_COMMANDS } from "./commands/modify-mirror";
import { CAD_MODIFY_TRANSFORM_COMMANDS } from "./commands/modify-transform";
import { CAD_PARAMETRIC_DIMENSION_COMMANDS } from "./commands/parametric-dimensions";
import { CAD_PARAMETRIC_GEOMETRY_COMMANDS } from "./commands/parametric-geometry";
import { CAD_VIEW_NAVIGATION_COMMANDS } from "./commands/view-navigation";
import { CAD_LAYOUT_COMMANDS } from "./commands/layout-commands";
import { CAD_PLOT_COMMANDS } from "./commands/plot-commands";
import { createCadCommandRegistry, type CadCommandRegistryImpl } from "./registry";

export * from "./command-types";
export * from "./command-engine";
export type { CadHostRequest } from "./host-requests";
export * from "./alias-table";
export * from "./prompt";
export * from "./input-pipeline";
export { createCadCommandRegistry, CadCommandRegistryImpl } from "./registry";

/** Todos los descriptores implementados hasta ahora. */
export const CAD_COMMAND_DESCRIPTORS = [
  ...CAD_DRAW_BASIC_COMMANDS,
  ...CAD_DRAW_CURVE_COMMANDS,
  ...CAD_DRAW_PLINE_COMMANDS,
  ...CAD_DRAW_RECTANG_COMMANDS,
  ...CAD_DRAW_SPLINE_COMMANDS,
  ...CAD_DRAW_RING_COMMANDS,
  ...CAD_DRAW_POINT_COMMANDS,
  ...CAD_DRAW_CONSTRUCTION_COMMANDS,
  ...CAD_DRAW_FILL_COMMANDS,
  ...CAD_ANNOTATION_V4_COMMANDS,
  ...CAD_ANNOTATE_TEXT_COMMANDS,
  ...CAD_ANNOTATE_STYLE_COMMANDS,
  ...CAD_DIMENSION_LINEAR_COMMANDS,
  ...CAD_DIMENSION_ANGULAR_COMMANDS,
  ...CAD_DIMENSION_RADIAL_COMMANDS,
  ...CAD_DIMENSION_CHAIN_COMMANDS,
  ...CAD_HATCH_COMMANDS,
  ...CAD_LEADER_COMMANDS,
  ...CAD_TOLERANCE_COMMANDS,
  ...CAD_MODIFY_BASIC_COMMANDS,
  ...CAD_MODIFY_TRANSFORM_COMMANDS,
  ...CAD_MODIFY_EDGE_COMMANDS,
  ...CAD_MIRROR_COMMANDS,
  ...CAD_MODIFY_ARRAY_COMMANDS,
  ...CAD_MODIFY_ALIGN_COMMANDS,
  ...CAD_MODIFY_STRETCH_COMMANDS,
  ...CAD_MODIFY_JOIN_COMMANDS,
  ...CAD_MODIFY_PEDIT_COMMANDS,
  ...CAD_PARAMETRIC_GEOMETRY_COMMANDS,
  ...CAD_PARAMETRIC_DIMENSION_COMMANDS,
  ...CAD_INQUIRY_MEASURE_COMMANDS,
  ...CAD_INQUIRY_LIST_COMMANDS,
  ...CAD_REGION_COMMANDS,
  ...CAD_SELECT_QUERY_COMMANDS,
  ...CAD_MODIFY_CLEANUP_COMMANDS,
  ...CAD_SETTINGS_VARIABLE_COMMANDS,
  ...CAD_SETTINGS_PALETTE_COMMANDS,
  ...CAD_AUTOMATION_COMMANDS,
  ...CAD_VIEW_NAVIGATION_COMMANDS,
  ...CAD_LAYOUT_COMMANDS,
  ...CAD_PLOT_COMMANDS,
  ...CAD_BLOCK_COMMANDS,
  ...CAD_GROUP_COMMANDS,
  ...CAD_XREF_COMMANDS,
  ...CAD_DESIGN_CENTER_COMMANDS,
] as const;

/**
 * Registro compartido. Es inmutable en la práctica: se construye una vez al
 * cargar el módulo y nadie le añade comandos en caliente, porque un registro
 * que cambia según qué se haya importado antes convierte el comportamiento del
 * producto en una función del orden de los imports.
 */
export const CAD_COMMAND_REGISTRY_V2: CadCommandRegistryImpl =
  createCadCommandRegistry([...CAD_COMMAND_DESCRIPTORS]);
