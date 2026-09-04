/**
 * BEDIT — editar una definición de bloque. Desde la Ola 7, EN SITIO.
 *
 * ## Qué era la v1 y por qué cambia
 *
 * La v1 (Ola 3) era una puerta honesta: `BE` era un alias de `acad.pgp` que
 * ningún comando reclamaba —teclearlo respondía «comando desconocido»— y BEDIT
 * lo reclamó abriendo el panel de bloques con el nombre resuelto. Servía, y la
 * rúbrica lo decía en su sitio: *«BEDIT v1 es la puerta tecleable al panel; el
 * editor en sitio todavía no existe.»*
 *
 * Ya existe. `blocks/reference-edit.ts` saca la geometría de la definición al
 * dibujo, encima de la referencia, y la devuelve conservando los atributos. Así
 * que BEDIT hace lo que hace en AutoCAD: **si hay una referencia** —designada o
 * seleccionada de antemano— abre esa referencia EN SITIO.
 *
 * ## Cuándo sigue abriendo el panel, y por qué
 *
 * - Con un NOMBRE tecleado o con Intro: no hay ninguna referencia concreta que
 *   anclar en el dibujo, y colocar la geometría «en algún sitio» sería inventar
 *   un punto de trabajo que el usuario no eligió.
 * - Con una referencia GIRADA o ESCALADA: devolver geometría girada no es
 *   trasladarla (ver `reference-edit.ts`), y editarla en sitio la torcería.
 * - Con un bloque SIN geometría: no hay nada que sacar.
 *
 * En los tres casos se abre el panel Y SE DICE POR QUÉ, en vez de dejar al
 * usuario preguntándose por qué esta vez fue distinto.
 */
import type { CadEntity } from "../../cad-document";
import {
  cadRefeditOpenCommands,
  cadRefeditSession,
} from "../../blocks/reference-edit";
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

/**
 * Abre la referencia EN SITIO, o devuelve el motivo por el que no se puede.
 *
 * El motivo no es un error: es lo que se le añade al texto del panel para que
 * el usuario sepa por qué esta vez se abrió el panel y no el dibujo.
 */
function openInPlace(
  entity: Extract<CadEntity, { type: "insert" }>,
  context: CadCommandContext,
): CadCommandStep<BeditState> | { reason: string } {
  const blocks = context.blocks?.();
  if (!blocks) return { reason: "este anfitrión no expone las definiciones" };
  const definition = blocks.find((block) => block.id === entity.block || block.name === entity.block);
  if (!definition) return { reason: `la definición de «${entity.block}» no está en el dibujo` };
  if (definition.entities.length === 0)
    return { reason: `«${definition.name}» no tiene geometría que sacar al dibujo` };

  const escala = entity.scale ?? { x: 1, y: 1, z: 1 };
  if ((entity.rotation ?? 0) !== 0 || escala.x !== 1 || escala.y !== 1)
    return {
      reason:
        `esta referencia está girada ${Math.round(entity.rotation ?? 0)}° o escalada ` +
        `(${escala.x}×${escala.y}), y en sitio sólo se edita a escala 1 y sin giro`,
    };

  const document = {
    entities: context.entityIds
      .map((id) => context.entity?.(id))
      .filter((item): item is CadEntity => !!item),
  };
  const { session, conflict } = cadRefeditSession(document);
  if (conflict.length > 0)
    return { reason: `hay ediciones abiertas de ${conflict.join(" y ")}; ciérrelas con REFCLOSE` };
  if (session)
    return {
      reason: `ya hay una edición abierta de «${session.blockId}»; ciérrela con REFCLOSE`,
    };

  const commands = cadRefeditOpenCommands({
    definition,
    referenceId: entity.id,
    base: { x: entity.insertion.x, y: entity.insertion.y },
    newEntityId: context.newEntityId,
  });
  return {
    state: { asked: true },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "BEDIT",
      notice:
        `BEDIT: «${definition.name}» abierto EN SITIO con ${commands.length} objeto(s) sobre la ` +
        "referencia. Edítelos con las órdenes de siempre, añada lo nuevo con REFSET y termine con " +
        "REFCLOSE (Guardar o Descartar).",
    },
  };
}

function openPanel(block: string | null, reason?: string): CadCommandStep<BeditState> {
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
      text:
        (block ? `Abriendo el panel de bloques con «${block}»` : "Abriendo el panel de bloques") +
        (reason ? `: ${reason}.` : "."),
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
  // Desde la Ola 7 SÍ escribe: abrir en sitio saca la geometría del bloque al
  // dibujo, y eso es un paso de deshacer. Con un nombre o con Intro sigue
  // abriendo el panel, que no escribe nada.
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const insert = selectedInsert(context);
    if (insert) {
      const sitio = openInPlace(insert, context);
      return "reason" in sitio ? openPanel(insert.block, sitio.reason) : sitio;
    }
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
      const sitio = openInPlace(entity, context);
      return "reason" in sitio ? openPanel(entity.block, sitio.reason) : sitio;
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
