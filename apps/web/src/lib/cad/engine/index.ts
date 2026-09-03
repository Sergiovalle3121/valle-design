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
import { CAD_BLOCK_EDIT_COMMANDS } from "./commands/blocks-edit";
import { CAD_GROUP_COMMANDS } from "./commands/groups";
import { CAD_XREF_COMMANDS } from "./commands/xrefs";
import { CAD_DESIGN_CENTER_COMMANDS } from "./commands/design-center";
import { CAD_DXF_INTEROP_COMMANDS } from "./commands/interop-dxf";
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
import { CAD_DRAW_OPENING_COMMANDS } from "./commands/draw-opening";
import { CAD_DRAW_WALL_COMMANDS } from "./commands/draw-wall";
import { CAD_ARCHITECTURE_STAIR_COMMANDS } from "./commands/architecture-stair";
import { CAD_ARCHITECTURE_ROOF_COMMANDS } from "./commands/architecture-roof";
import { CAD_MEP_TRACING_COMMANDS } from "./commands/mep-tracing";
import { CAD_MEP_SYMBOL_COMMANDS } from "./commands/mep-symbol";
import { CAD_GEO_LOCATION_COMMANDS } from "./commands/geo-location";
import { CAD_MAP_IMPORT_COMMANDS } from "./commands/map-import";
import { CAD_RASTER_IMAGE_COMMANDS } from "./commands/raster-image";
import { CAD_MECHANICAL_PART_COMMANDS } from "./commands/mechanical-parts";
import { CAD_MECHANICAL_ANNOTATE_COMMANDS } from "./commands/mechanical-annotate";
import { CAD_MECHANICAL_SYMBOL_COMMANDS } from "./commands/mechanical-symbols";
import { CAD_DIMENSION_TOLERANCE_COMMANDS } from "./commands/dimension-tolerance";
import { CAD_INQUIRY_LIST_COMMANDS } from "./commands/inquiry-list";
import { CAD_INQUIRY_MEASURE_COMMANDS } from "./commands/inquiry-measure";
import { CAD_REGION_COMMANDS } from "./commands/inquiry-region";
import { CAD_AUTOMATION_COMMANDS } from "./commands/automation-script";
import { CAD_MODIFY_ALIGN_COMMANDS } from "./commands/modify-align";
import { CAD_MODIFY_CLEANUP_COMMANDS } from "./commands/modify-cleanup";
import { CAD_SELECT_QUERY_COMMANDS } from "./commands/select-query";
import { CAD_SETTINGS_PALETTE_COMMANDS } from "./commands/settings-palettes";
import { CAD_LAYER_TOOL_COMMANDS } from "./commands/settings-layer-tools";
import { CAD_MEXICAN_STANDARD_COMMANDS } from "./commands/settings-mexican-standard";
import { CAD_SETTINGS_VARIABLE_COMMANDS } from "./commands/settings-variables";
import { CAD_MODIFY_ARRAY_COMMANDS } from "./commands/modify-array";
import { CAD_MODIFY_BASIC_COMMANDS } from "./commands/modify-basics";
import { CAD_MODIFY_BLEND_COMMANDS } from "./commands/modify-blend";
import { CAD_MODIFY_JOIN_COMMANDS } from "./commands/modify-join";
import { CAD_MODIFY_PEDIT_COMMANDS } from "./commands/modify-pedit";
import { CAD_MODIFY_STRETCH_COMMANDS } from "./commands/modify-stretch";
import { CAD_MODIFY_EDGE_COMMANDS } from "./commands/modify-edges";
import { CAD_MIRROR_COMMANDS } from "./commands/modify-mirror";
import { CAD_MODIFY_TRANSFORM_COMMANDS } from "./commands/modify-transform";
import { CAD_PARAMETRIC_DIMENSION_COMMANDS } from "./commands/parametric-dimensions";
import { CAD_SOLID_CREATE_COMMANDS } from "./commands/solids-create";
import { CAD_SOLID_PRIMITIVE_COMMANDS } from "./commands/solids-primitives";
import { CAD_SOLIDEDIT_COMMANDS } from "./commands/solids-edit";
import { CAD_CLIPBOARD_COMMANDS } from "./commands/clipboard";
import { CAD_SELECT_SIMILAR_COMMANDS } from "./commands/select-similar";
import { CAD_MODIFY_FOREIGN_COMMANDS } from "./commands/modify-foreign";
import { CAD_PRESSPULL_COMMANDS } from "./commands/solids-push-face";
import { CAD_SOLID_INQUIRY_COMMANDS } from "./commands/solids-inquiry";
import { CAD_SOLID_INTEROP_COMMANDS } from "./commands/solids-interop";
import { CAD_SOLID_MODIFY_COMMANDS } from "./commands/solids-modify";
import { CAD_PARAMETRIC_GEOMETRY_COMMANDS } from "./commands/parametric-geometry";
import { CAD_VIEW_NAVIGATION_COMMANDS } from "./commands/view-navigation";
import { CAD_VIEW_VISUAL_COMMANDS } from "./commands/view-visual";
import { CAD_HISTORY_COMMANDS } from "./commands/history-commands";
import { CAD_TABLE_EDIT_COMMANDS } from "./commands/annotate-table-edit";
import { CAD_LAYOUT_COMMANDS } from "./commands/layout-commands";
import { CAD_PLOT_COMMANDS } from "./commands/plot-commands";
// Entrega del proyecto: PUBLISH/SHEETSET enchufan `lib/cad/sheet-set/`, que ya
// existía sin comando que lo alcanzara; ETRANSMIT y DATAEXTRACTION son nuevos
// de punta a punta.
import { CAD_SHEET_SET_COMMANDS } from "./commands/sheet-set-commands";
import { CAD_ETRANSMIT_COMMANDS } from "./commands/etransmit-commands";
import { CAD_DATA_EXTRACTION_COMMANDS } from "./commands/data-extraction-commands";
import { createCadCommandRegistry, type CadCommandRegistryImpl } from "./registry";
// Ola 3D, cimiento: el SCU de verdad. Al final del bloque a propósito.
import { CAD_UCS_COMMANDS } from "./commands/ucs-commands";
import { CAD_UCS_VIEW_COMMANDS } from "./commands/ucs-view-commands";
// Navegación 3D tecleable: 3DORBIT, 3DFORBIT, 3DPAN, 3DZOOM y VPOINT.
import { CAD_VIEW_NAVIGATION_3D_COMMANDS } from "./commands/view-navigation-3d";
// Esquema 8: la vista derivada. SOLVIEW abre la ventana y SOLDRAW dibuja dentro.
import { CAD_SOLVIEW_COMMANDS } from "./commands/solview-commands";
// Aplanado y perfil: FLATSHOT y SOLPROF convierten el modelo en dibujo 2D.
import { CAD_SOLID_FLATSHOT_COMMANDS } from "./commands/solids-flatshot";
// Campaña "reparar y normalizar": el dibujo ajeno que llega roto (AUDIT,
// RECOVER, LAYTRANS, CHECKSTANDARDS) y la productividad diaria que faltaba
// (QDIM, TEXTALIGN, BURST, QLEADER).
import { CAD_AUDIT_COMMANDS } from "./commands/manage-audit";
import { CAD_RECOVER_COMMANDS } from "./commands/manage-recover";
import { CAD_LAYTRANS_COMMANDS } from "./commands/manage-laytrans";
import { CAD_CHECKSTANDARDS_COMMANDS } from "./commands/manage-standards";
import { CAD_ANNOTATE_QUICK_COMMANDS } from "./commands/annotate-quick";
import { CAD_BURST_COMMANDS } from "./commands/blocks-burst";
import { CAD_QLEADER_COMMANDS } from "./commands/annotate-quickleader";

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
  // BLEND cierra el último alias de modificación sin dueño: BLE ya fusiona.
  ...CAD_MODIFY_BLEND_COMMANDS,
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
  // Ola 2: VPLAYER y la familia LAY*, los atajos de capa que montan las
  // láminas del ejecutivo sin abrir el gestor.
  ...CAD_LAYER_TOOL_COMMANDS,
  // La norma de dibujo mexicana, aplicable a un dibujo que YA existe: sin ella
  // la norma sería una propiedad de los documentos nuevos y no del producto, y
  // el DXF que llega del estructurista se quedaría fuera para siempre.
  ...CAD_MEXICAN_STANDARD_COMMANDS,
  ...CAD_AUTOMATION_COMMANDS,
  ...CAD_VIEW_NAVIGATION_COMMANDS,
  ...CAD_VIEW_VISUAL_COMMANDS,
  ...CAD_HISTORY_COMMANDS,
  ...CAD_TABLE_EDIT_COMMANDS,
  ...CAD_LAYOUT_COMMANDS,
  ...CAD_PLOT_COMMANDS,
  ...CAD_BLOCK_COMMANDS,
  // BEDIT v1: la puerta tecleable al panel de bloques. Cierra el alias BE.
  ...CAD_BLOCK_EDIT_COMMANDS,
  ...CAD_GROUP_COMMANDS,
  ...CAD_XREF_COMMANDS,
  ...CAD_DESIGN_CENTER_COMMANDS,
  // Esquema 5: modelado de sólidos. Enchufan el kernel B-rep de `lib/brep/`, que
  // hasta esta ola estaba construido, probado y sin un solo consumidor.
  ...CAD_SOLID_CREATE_COMMANDS,
  // Ola C: las ocho primitivas (BOX … POLYSOLID) y SOLIDEDIT, cada una un
  // nodo del mismo árbol reeditable; medido antes: el nodo `box` existía y
  // ningún comando lo creaba.
  ...CAD_SOLID_PRIMITIVE_COMMANDS,
  ...CAD_SOLIDEDIT_COMMANDS,
  ...CAD_CLIPBOARD_COMMANDS,
  ...CAD_SELECT_SIMILAR_COMMANDS,
  ...CAD_MODIFY_FOREIGN_COMMANDS,
  // PRESSPULL compone las dos máquinas: empujar una cara o extruir un
  // contorno. Decide el primer gesto, no una opción tecleada.
  ...CAD_PRESSPULL_COMMANDS,
  ...CAD_SOLID_MODIFY_COMMANDS,
  ...CAD_SOLID_INQUIRY_COMMANDS,
  ...CAD_SOLID_INTEROP_COMMANDS,
  // Esquema 6: la primera rebanada BIM. El muro paramétrico entra por el mismo
  // registro que todo lo demás — no hay un «modo BIM», hay una orden más.
  ...CAD_DRAW_WALL_COMMANDS,
  ...CAD_ARCHITECTURE_STAIR_COMMANDS,
  ...CAD_ARCHITECTURE_ROOF_COMMANDS,
  ...CAD_MEP_TRACING_COMMANDS,
  ...CAD_MEP_SYMBOL_COMMANDS,
  // Ola G (Map 3D): la georreferencia como marcador y el conjunto GIS dentro
  // del plano. Mismo registro, mismas puertas (`document`, `ui`).
  ...CAD_GEO_LOCATION_COMMANDS,
  ...CAD_MAP_IMPORT_COMMANDS,
  // Ola H (Raster): el escaneo que se calca, con recorte y ajuste sobre la
  // entidad `image` que ya existía.
  ...CAD_RASTER_IMAGE_COMMANDS,
  // Mechanical (Ola I): normalizados, globos y lista, soldadura y acabado, tolerancia de cota.
  ...CAD_MECHANICAL_PART_COMMANDS,
  ...CAD_MECHANICAL_ANNOTATE_COMMANDS,
  ...CAD_MECHANICAL_SYMBOL_COMMANDS,
  ...CAD_DIMENSION_TOLERANCE_COMMANDS,
  // Intercambio: DXFIN y DXFOUT. El bloqueo número uno de un despacho no es que
  // falte una orden de dibujo, es que el archivo del cliente no entre ni salga.
  ...CAD_DXF_INTEROP_COMMANDS,
  // Esquema 7: el hueco alojado. Va detrás del muro porque sin muro no hay
  // dónde alojarlo, y entra por el mismo registro: una orden más.
  ...CAD_DRAW_OPENING_COMMANDS,
  // SCU en 3D: UCS fija el plano de trabajo, UCSICON lo hace visible y PLAN
  // devuelve la vista a su planta. Al final del array a propósito.
  ...CAD_UCS_COMMANDS,
  ...CAD_UCS_VIEW_COMMANDS,
  // Navegación 3D: un modelador de sólidos sin forma tecleable de mirarlos.
  ...CAD_VIEW_NAVIGATION_3D_COMMANDS,
  // Esquema 8: la vista derivada, que es lo que le quita al arquitecto la
  // segunda vez que dibuja lo mismo. Al final del array a propósito.
  ...CAD_SOLVIEW_COMMANDS,
  // Aplanado: la mitad del 3D que devuelve dibujo 2D acotable en vez de píxeles.
  ...CAD_SOLID_FLATSHOT_COMMANDS,
  // Entrega del proyecto: publicar el juego, gestionar el conjunto, empaquetar
  // la entrega y extraer cantidades. Al final a propósito, como el resto de
  // olas recientes.
  ...CAD_SHEET_SET_COMMANDS,
  ...CAD_ETRANSMIT_COMMANDS,
  ...CAD_DATA_EXTRACTION_COMMANDS,
  // Campaña "reparar y normalizar". Al final a propósito.
  ...CAD_AUDIT_COMMANDS,
  ...CAD_RECOVER_COMMANDS,
  ...CAD_LAYTRANS_COMMANDS,
  ...CAD_CHECKSTANDARDS_COMMANDS,
  ...CAD_ANNOTATE_QUICK_COMMANDS,
  ...CAD_BURST_COMMANDS,
  ...CAD_QLEADER_COMMANDS,
] as const;

/**
 * Registro compartido. Es inmutable en la práctica: se construye una vez al
 * cargar el módulo y nadie le añade comandos en caliente, porque un registro
 * que cambia según qué se haya importado antes convierte el comportamiento del
 * producto en una función del orden de los imports.
 */
export const CAD_COMMAND_REGISTRY_V2: CadCommandRegistryImpl =
  createCadCommandRegistry([...CAD_COMMAND_DESCRIPTORS]);
