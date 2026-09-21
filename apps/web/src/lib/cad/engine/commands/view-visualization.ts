/**
 * Familia de comandos de VISUALIZACIÓN — AÚN NO DISPONIBLE.
 *
 * 3DWALK, 3DFLY, 3DSWIVEL, VISUALSTYLES, CAMERA, DVIEW, NAVVCUBE y NAVBAR
 * pedían entradas (dos puntos, un estilo, una opción) y terminaban en
 * «requiere anfitrión con visor 3D». El visor 3D existe y no los atendía:
 * ninguno cambiaba la vista.
 *
 * Ahora responden, al teclearse, que aún no están disponibles y qué orden sí
 * hace lo que se busca (3DORBIT, VPOINT, VSCURRENT), sin pedir nada y sin botón
 * en la cinta (`command-availability.ts`).
 */
import { asCadCommand, type CadAnyCommandDescriptor } from "../command-types";
import { cadDescriptorAunNoDisponible } from "../command-availability";

const aunNo = (name: string, aliases: readonly string[], transparent: boolean): CadAnyCommandDescriptor =>
  asCadCommand(cadDescriptorAunNoDisponible({ name, aliases, kind: "view", transparent }));

export const CAD_VIEW_VISUALIZATION_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  aunNo("3DWALK", ["3W", "CAMINAR3D"], true),
  aunNo("3DFLY", ["3F", "VOLAR3D"], true),
  aunNo("3DSWIVEL", ["3SW", "GIRAR3D"], true),
  aunNo("VISUALSTYLES", ["VST", "ESTILOVISUAL"], true),
  aunNo("CAMERA", ["CAMARA"], false),
  aunNo("DVIEW", ["VISTADIN"], false),
  aunNo("NAVVCUBE", ["CUBONAV"], true),
  aunNo("NAVBAR", ["BARRANAV"], true),
];
