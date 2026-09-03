/**
 * REFEDIT, REFSET y REFCLOSE: editar un bloque EN EL DIBUJO.
 *
 * ## Qué faltaba, medido
 *
 * `docs/competitive/rubric.json`, fila `blocks`: *«Sin editor de bloques en
 * sitio, redefinir un bloque exige explotar y volver a definir.»* Y explotar
 * PIERDE los atributos: el `TAG` de cada referencia se va y hay que rellenarlo
 * a mano. Es el gesto más caro de un dibujo con biblioteca propia.
 *
 * ## Los nombres son los de AutoCAD, y esta vez a propósito
 *
 * `REFEDIT`, `REFSET` y `REFCLOSE` son las órdenes de AutoCAD para editar una
 * referencia EN SITIO, y hacen aquí lo mismo que allí: sacar la geometría al
 * dibujo, decidir qué entra y qué sale, y devolverla o descartarla. Cuando el
 * gesto es el mismo, el nombre tiene que ser el mismo: es memoria muscular de
 * veinte años.
 *
 * La lógica vive en `blocks/reference-edit.ts`; aquí sólo están las preguntas.
 */
import type { CadEntity } from "../../cad-document";
import {
  cadRefeditAddCommand,
  cadRefeditDiscardCommands,
  cadRefeditOpenCommands,
  cadRefeditRemoveCommand,
  cadRefeditSaveCommands,
  cadRefeditSession,
  type CadRefeditSession,
} from "../../blocks/reference-edit";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

function documentOf(context: CadCommandContext) {
  if (!context.entity) return null;
  const entities = context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is CadEntity => !!entity);
  return { entities, blocks: [...(context.blocks?.() ?? [])] };
}

/** La sesión abierta, o el motivo por el que no se puede trabajar con ella. */
function openSession(
  context: CadCommandContext,
): { session: CadRefeditSession } | { error: string } {
  const document = documentOf(context);
  if (!document) return { error: "necesita leer el dibujo: este anfitrión no lo expone." };
  const { session, conflict } = cadRefeditSession(document);
  if (conflict.length > 0)
    return {
      error: `hay ${conflict.length} sesiones de edición abiertas a la vez (${conflict.join(", ")}). Cierre una con REFCLOSE antes de seguir: guardar ahora mezclaría la geometría de dos bloques.`,
    };
  if (!session) return { error: "no hay ninguna edición de referencia abierta. Ábrala con REFEDIT." };
  return { session };
}

// ---------------------------------------------------------------------------
// REFEDIT
// ---------------------------------------------------------------------------

const refeditCommand: CadCommandDescriptor<{ asked: boolean }> = {
  name: "REFEDIT",
  aliases: ["EDITARREF"],
  kind: "manage",
  transparent: false,
  selection: "optional",
  repeatable: false,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const document = documentOf(context);
    if (!document) return say("REFEDIT necesita leer el dibujo: este anfitrión no lo expone.");
    const { session, conflict } = cadRefeditSession(document);
    if (conflict.length > 0)
      return say(
        `REFEDIT: ya hay ediciones abiertas de ${conflict.join(" y ")}. Ciérrelas con REFCLOSE.`,
      );
    if (session)
      return say(
        `REFEDIT: ya hay una edición abierta de «${session.blockId}» con ${session.entityIds.length} objeto(s). Ciérrela con REFCLOSE antes de abrir otra.`,
      );
    const seleccionado = context.selection
      .map((id) => context.entity?.(id))
      .find((entity) => entity?.type === "insert");
    if (seleccionado) return openFor(seleccionado, context);
    return {
      state: { asked: true },
      prompt: { message: "Designe la referencia de bloque a editar en sitio", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("REFEDIT cancelado.");
    if (input.kind !== "entityPick") return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    const entity = context.entity?.(input.entityId);
    if (!entity) return say("REFEDIT: el objeto designado ya no existe.");
    return openFor(entity, context);
  },
};

function openFor(entity: CadEntity, context: CadCommandContext): CadCommandStep<never> {
  if (entity.type !== "insert")
    return say(`REFEDIT: ${entity.type.toUpperCase()} no es una referencia de bloque (INSERT).`);
  const definition = (context.blocks?.() ?? []).find((block) => block.id === entity.block);
  if (!definition)
    return say(
      `REFEDIT: la definición de «${entity.block}» no está en el dibujo, así que no hay geometría que sacar.`,
    );
  // El límite, dicho por su nombre. Traer la geometría girada o escalada y
  // devolverla exige girar textos y escalar arcos, que no es trasladar.
  const escala = entity.scale ?? { x: 1, y: 1, z: 1 };
  if ((entity.rotation ?? 0) !== 0 || escala.x !== 1 || escala.y !== 1)
    return say(
      `REFEDIT: esta referencia está girada ${Math.round(entity.rotation ?? 0)}° o escalada (${escala.x}×${escala.y}), y en sitio sólo se edita a escala 1 y sin giro — devolver geometría girada o escalada no es trasladarla, y hacerlo «casi» deja el bloque torcido para siempre. Edite otra referencia del mismo bloque que esté sin girar, o use BLOCK. **Todavía no.**`,
    );

  const commands = cadRefeditOpenCommands({
    definition,
    referenceId: entity.id,
    base: { x: entity.insertion.x, y: entity.insertion.y },
    newEntityId: context.newEntityId,
  });
  if (commands.length === 0)
    return say(`REFEDIT: «${definition.name}» no tiene geometría que editar.`);
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands,
      label: "REFEDIT",
      notice:
        `REFEDIT: «${definition.name}» abierto en sitio con ${commands.length} objeto(s) sobre la referencia. ` +
        "Edítelos con las órdenes de siempre; añada lo nuevo con REFSET y termine con REFCLOSE.",
    },
  };
}

// ---------------------------------------------------------------------------
// REFSET
// ---------------------------------------------------------------------------

const ADD = { keyword: "Añadir", shortcut: "A" } as const;
const REMOVE = { keyword: "Quitar", shortcut: "Q" } as const;

interface RefsetState {
  op: "add" | "remove" | null;
}

const refsetCommand: CadCommandDescriptor<RefsetState> = {
  name: "REFSET",
  aliases: ["CONJUNTOREF"],
  kind: "manage",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const abierta = openSession(context);
    if ("error" in abierta) return say(`REFSET: ${abierta.error}`);
    return {
      state: { op: null },
      prompt: {
        message: `¿Añadir lo seleccionado a «${abierta.session.blockId}» o quitarlo?`,
        options: [ADD, REMOVE],
        defaultOption: ADD.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("REFSET cancelado.");
    const abierta = openSession(context);
    if ("error" in abierta) return say(`REFSET: ${abierta.error}`);
    const añadir = input.kind === "enter" || (input.kind === "keyword" && /^a/iu.test(input.keyword));
    if (input.kind !== "enter" && input.kind !== "keyword")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };

    const dentro = new Set(abierta.session.entityIds);
    const objetivos = context.selection.filter((id) => (añadir ? !dentro.has(id) : dentro.has(id)));
    if (objetivos.length === 0)
      return say(
        añadir
          ? "REFSET: todo lo seleccionado ya estaba en la edición."
          : "REFSET: nada de lo seleccionado estaba en la edición.",
      );
    const commands = objetivos.map((entityId) =>
      añadir ? cadRefeditAddCommand(abierta.session, entityId) : cadRefeditRemoveCommand(entityId),
    );
    return {
      state: undefined as never,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "document",
        commands,
        label: "REFSET",
        notice: `REFSET: ${objetivos.length} objeto(s) ${añadir ? "añadidos a" : "retirados de"} la edición de «${abierta.session.blockId}».`,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// REFCLOSE
// ---------------------------------------------------------------------------

const SAVE = { keyword: "Guardar", shortcut: "G" } as const;
const DISCARD = { keyword: "Descartar", shortcut: "D" } as const;

const refcloseCommand: CadCommandDescriptor<{ asked: boolean }> = {
  name: "REFCLOSE",
  aliases: ["CERRARREF"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const abierta = openSession(context);
    if ("error" in abierta) return say(`REFCLOSE: ${abierta.error}`);
    return {
      state: { asked: true },
      prompt: {
        message: `Edición de «${abierta.session.blockId}» con ${abierta.session.entityIds.length} objeto(s): ¿guardar en la definición o descartar?`,
        options: [SAVE, DISCARD],
        defaultOption: SAVE.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("REFCLOSE cancelado: la edición sigue abierta.");
    if (input.kind !== "keyword" && input.kind !== "enter")
      return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    const abierta = openSession(context);
    if ("error" in abierta) return say(`REFCLOSE: ${abierta.error}`);
    const descartar = input.kind === "keyword" && /^d/iu.test(input.keyword);

    if (descartar)
      return {
        state: undefined as never,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "document",
          commands: cadRefeditDiscardCommands(abierta.session),
          label: "REFCLOSE",
          notice: `REFCLOSE: edición de «${abierta.session.blockId}» descartada. La definición no se tocó.`,
        },
      };

    const document = documentOf(context)!;
    const guardado = cadRefeditSaveCommands(document, abierta.session);
    if ("error" in guardado) return say(`REFCLOSE: ${guardado.error}`);
    return {
      state: undefined as never,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "document",
        commands: guardado.commands,
        label: "REFCLOSE",
        notice:
          `REFCLOSE: «${abierta.session.blockId}» redefinido con ${guardado.entities} objeto(s). ` +
          "Todas sus referencias se regeneran; los atributos que ya tenían se conservan.",
      },
    };
  },
};

export const CAD_REFERENCE_EDIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(refeditCommand),
  asCadCommand(refsetCommand),
  asCadCommand(refcloseCommand),
];
