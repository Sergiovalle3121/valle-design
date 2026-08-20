/**
 * BEDIT — la puerta tecleable a editar una definición de bloque.
 *
 * ## Qué es esta v1, dicho sin adornos
 *
 * AutoCAD abre un editor in situ. Aquí ese editor no existe; lo que SÍ existe
 * es el flujo completo por otras puertas: el panel de bloques del editor
 * enseña las definiciones y BLOCK con el mismo nombre REDEFINE —los INSERT se
 * actualizan solos, con versión propagada—. BEDIT v1 entrega ese flujo desde
 * el teclado: resuelve qué bloque se quiere editar (el INSERT designado o el
 * nombre tecleado) y pide al anfitrión abrir el panel con ese nombre en
 * `params.block`. Si el espacio de trabajo no tiene el panel, el comando lo
 * dice y nombra la alternativa, nunca se traga la orden.
 *
 * ## Por qué esto y no esperar al editor in situ
 *
 * `BE` era uno de los dos alias de `acad.pgp` que la tabla declaraba y ningún
 * comando reclamaba: teclearlo respondía «comando desconocido». Entre un error
 * seco y una puerta honesta al flujo que ya funciona, la puerta gana — y el
 * inventario de alias sin resolver baja a cero de verdad, no de mentira.
 */
import type { CadEntity } from "../../cad-document";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

interface BeditState {
  asked: boolean;
}

const UNAVAILABLE =
  "El panel de bloques no está montado en este espacio de trabajo. La redefinición sigue " +
  "disponible: BLOCK con el mismo nombre redefine la definición y los INSERT se actualizan solos.";

function openPanel(block: string | null): CadCommandStep<BeditState> {
  return {
    state: { asked: true },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "ui",
      request: {
        target: "block-editor",
        ...(block ? { params: { block } } : {}),
        unavailable: UNAVAILABLE,
      },
      text: block ? `Abriendo el panel de bloques con «${block}».` : "Abriendo el panel de bloques.",
    },
  };
}

function refuse(text: string): CadCommandStep<BeditState> {
  return {
    state: { asked: true },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text: `BEDIT: ${text}` },
  };
}

/** El INSERT único de la selección, si lo hay; `null` si no aplica. */
function selectedInsert(context: CadCommandContext): Extract<CadEntity, { type: "insert" }> | null {
  if (context.selection.length !== 1) return null;
  const entity = context.entity?.(context.selection[0]);
  return entity && entity.type === "insert" ? entity : null;
}

const beditCommand: CadCommandDescriptor<BeditState> = {
  name: "BEDIT",
  aliases: ["BE"],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: false,
  // v1 no escribe el documento: abre el panel. Escribir va por BLOCK.
  mutates: false,
  cursor: "pick",
  begin: (context) => {
    const insert = selectedInsert(context);
    if (insert) return openPanel(insert.block);
    return {
      state: { asked: true },
      prompt: {
        message:
          "Indique el nombre del bloque a editar, designe un INSERT o pulse Enter para abrir el panel",
        options: [],
      },
      accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_ENTITY_PICK,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") return openPanel(null);
    if (input.kind === "entityPick") {
      const entity = context.entity?.(input.entityId);
      if (!entity) return refuse("el objeto designado ya no existe.");
      if (entity.type !== "insert")
        return refuse(`${entity.type.toUpperCase()} no es una referencia de bloque (INSERT).`);
      return openPanel(entity.block);
    }
    if (input.kind !== "text") return refuse("BEDIT esperaba un nombre de bloque.");
    const name = input.value.trim();
    if (!name) return openPanel(null);
    // Sólo se valida si el anfitrión expone las definiciones: negar «no
    // existe» sin poder mirar culparía al dibujo de una carencia del editor.
    const blocks = context.blocks?.();
    if (blocks && !blocks.some((block) => block.name === name || block.id === name))
      return refuse(`no hay ningún bloque llamado «${name}» en este dibujo.`);
    return openPanel(name);
  },
};

export const CAD_BLOCK_EDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(beditCommand),
];
