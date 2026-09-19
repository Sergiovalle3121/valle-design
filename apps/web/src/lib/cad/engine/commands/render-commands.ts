/**
 * Familia de comandos de RENDER, luces y materiales — AÚN NO DISPONIBLE.
 *
 * Estos trece comandos emitían peticiones al anfitrión (`render-capture`,
 * `render-setting`, `light-create`, `material-attach`…) que ningún anfitrión
 * atendía: la cadena terminaba en el de trazado, que contestaba que las atendía
 * «el anfitrión del motor», y ése no las atendía. RENDER llegó a ser el botón
 * grande de Salida › Render sin producir nunca una imagen.
 *
 * Ahora responden, al teclearse, que aún no están disponibles y por qué
 * (`command-availability.ts`), sin petición y sin botón en la cinta. Se quedan
 * en el registro para que quien los teclea de memoria reciba una respuesta
 * honesta en vez de «Comando desconocido».
 */
import { asCadCommand, type CadAnyCommandDescriptor } from "../command-types";
import { cadDescriptorAunNoDisponible } from "../command-availability";

const aunNo = (name: string, aliases: readonly string[], transparent: boolean): CadAnyCommandDescriptor =>
  asCadCommand(cadDescriptorAunNoDisponible({ name, aliases, kind: "manage", transparent }));

export const CAD_RENDER_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  aunNo("RENDER", ["RR", "RENDERIZAR"], true),
  aunNo("RENDERPRESETS", ["RPRES", "AJUSTESRENDER"], true),
  aunNo("RENDEREXPOSURE", ["REXPOSURE", "EXPOSICIONRENDER"], true),
  aunNo("RENDERENVIRONMENT", ["RENV", "ENTORNERENDER"], true),
  aunNo("MATERIALS", ["MAT", "MATERIALES", "MATBROWSER"], true),
  aunNo("MATERIALATTACH", ["MATTACH", "ADJUNTARMATERIAL"], false),
  aunNo("POINTLIGHT", ["PLIGHT", "LUZPUNTUAL"], false),
  aunNo("SPOTLIGHT", ["SLIGHT", "LUZFOCO"], false),
  aunNo("DISTANTLIGHT", ["DLIGHT", "LUZDIRECCIONAL"], false),
  aunNo("SUNPROPERTIES", ["SUNPROP", "PROPIEDADESSOL"], true),
  aunNo("RENDERCROP", ["RCROP", "RECORTARRENDER"], true),
  aunNo("RENDERWIN", ["RWIN", "VENTANARENDER"], true),
  aunNo("MATERIALMAP", ["MMAP", "MAPEARMATERIAL"], false),
];
