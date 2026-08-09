/**
 * Sonda del registro de comandos, para la rúbrica competitiva.
 *
 * La rúbrica necesita responder «¿existe el comando TRIM?» sin creerse un
 * documento. Los descriptores no siempre se escriben a mano —las restricciones
 * geométricas se generan en bucle—, así que un `grep` los cuenta de menos y
 * concedería puntos falsos por defecto o los negaría por exceso. La única
 * fuente honesta es el registro ya construido.
 *
 * Imprime un JSON por stdout y nada más: `scripts/cad/rubric.mjs` lo ejecuta
 * con `tsx` y lo parsea. Si `tsx` o las dependencias no están instaladas, la
 * rúbrica marca esas comprobaciones como NO VERIFICABLES y no concede el punto
 * —nunca lo concede «de oficio».
 */
import { CAD_COMMAND_REGISTRY_V2 } from "../../apps/web/src/lib/cad/engine/index";
import { CAD_COMMAND_ALIASES } from "../../apps/web/src/lib/cad/engine/alias-table";

const commands = CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name);
const unresolved = CAD_COMMAND_REGISTRY_V2.unresolvedAliases();

process.stdout.write(
  JSON.stringify({
    commands,
    commandCount: commands.length,
    aliasCount: Object.keys(CAD_COMMAND_ALIASES).length,
    unresolvedAliases: unresolved,
    unresolvedAliasCount: unresolved.length,
  }),
);
