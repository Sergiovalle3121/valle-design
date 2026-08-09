/**
 * Punto de entrada del motor de comandos.
 *
 * Un único sitio desde el que el editor obtiene el registro completo. La paleta
 * `Ctrl+K`, la línea de comandos, la barra de herramientas y —cuando lleguen—
 * los scripts leen todos de aquí, así que un comando nuevo aparece en los
 * cuatro sitios a la vez o en ninguno. Ese es justamente el problema que hoy
 * existe con tres sistemas de comandos que no se conocen entre sí.
 */
import { CAD_DRAW_BASIC_COMMANDS } from "./commands/draw-basics";
import { CAD_DRAW_CURVE_COMMANDS } from "./commands/draw-curves";
import { CAD_MODIFY_ALIGN_COMMANDS } from "./commands/modify-align";
import { CAD_MODIFY_ARRAY_COMMANDS } from "./commands/modify-array";
import { CAD_MODIFY_BASIC_COMMANDS } from "./commands/modify-basics";
import { CAD_MODIFY_JOIN_COMMANDS } from "./commands/modify-join";
import { CAD_MODIFY_STRETCH_COMMANDS } from "./commands/modify-stretch";
import { CAD_MODIFY_EDGE_COMMANDS } from "./commands/modify-edges";
import { CAD_MIRROR_COMMANDS } from "./commands/modify-mirror";
import { CAD_MODIFY_TRANSFORM_COMMANDS } from "./commands/modify-transform";
import { createCadCommandRegistry, type CadCommandRegistryImpl } from "./registry";

export * from "./command-types";
export * from "./command-engine";
export * from "./alias-table";
export * from "./prompt";
export * from "./input-pipeline";
export { createCadCommandRegistry, CadCommandRegistryImpl } from "./registry";

/** Todos los descriptores implementados hasta ahora. */
export const CAD_COMMAND_DESCRIPTORS = [
  ...CAD_DRAW_BASIC_COMMANDS,
  ...CAD_DRAW_CURVE_COMMANDS,
  ...CAD_MODIFY_BASIC_COMMANDS,
  ...CAD_MODIFY_TRANSFORM_COMMANDS,
  ...CAD_MODIFY_EDGE_COMMANDS,
  ...CAD_MIRROR_COMMANDS,
  ...CAD_MODIFY_ARRAY_COMMANDS,
  ...CAD_MODIFY_ALIGN_COMMANDS,
  ...CAD_MODIFY_STRETCH_COMMANDS,
  ...CAD_MODIFY_JOIN_COMMANDS,
] as const;

/**
 * Registro compartido. Es inmutable en la práctica: se construye una vez al
 * cargar el módulo y nadie le añade comandos en caliente, porque un registro
 * que cambia según qué se haya importado antes convierte el comportamiento del
 * producto en una función del orden de los imports.
 */
export const CAD_COMMAND_REGISTRY_V2: CadCommandRegistryImpl =
  createCadCommandRegistry([...CAD_COMMAND_DESCRIPTORS]);
