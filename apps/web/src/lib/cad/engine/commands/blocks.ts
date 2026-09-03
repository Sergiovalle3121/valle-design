/**
 * BLOCK, INSERT, WBLOCK, BASE y ATTEDIT como descriptores del motor.
 *
 * ## Por qué esto es la orden más importante que faltaba
 *
 * Un bloque es la unidad de reutilización de un CAD. Sin BLOCK e INSERT
 * tecleables, cada puerta de un plano se vuelve a dibujar a mano, y cambiar el
 * modelo de puerta obliga a repasar el plano entero. `block.ts`,
 * `professional-blocks.ts` y el adaptador de INSERT llevaban tiempo escritos y
 * probados; lo que no existía era el gesto: teclear `B`, dar un nombre, señalar
 * el punto base y designar. Eso es lo que hay aquí.
 *
 * ## Reparto
 *
 * Estos descriptores son máquinas de estados PURAS: piden, acumulan y al
 * terminar emiten UN lote de `CadEntityCommand`. Toda la aritmética —qué
 * definición sale de una selección, qué entidad sale de una inserción, dónde
 * caen los atributos— vive en `lib/cad/blocks/block-workflow.ts`, que se prueba
 * sin motor. Aquí sólo está el diálogo.
 *
 * ## La escala negativa
 *
 * `INSERT` acepta factores de escala NEGATIVOS y el signo llega intacto hasta
 * `insert.scale`. Es la inserción espejada, y la ola anterior arregló que el
 * espejo alcanzara el contenido del bloque y sobreviviera a DXF. Un `Math.abs`
 * de conveniencia en el diálogo lo perdería otra vez, así que no lo hay: el
 * único valor que se rechaza es el CERO, que hace singular la matriz.
 */
import type { CadBlockDefinition, CadEntity, CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  cadAttEditCommands,
  cadBlockAttributePrompts,
  cadDefineBlockCommands,
  cadDrawingBasePoint,
  cadFindBlock,
  cadInsertBlockCommands,
  cadInsertableBlocks,
  cadRedefineBlockCommands,
  cadSetDrawingBasePointCommands,
  type CadBlockAttributePrompt,
} from "../../blocks/block-workflow";
import { cadAttsyncCommands } from "../../blocks/attribute-sync";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

const flat = (point: CadPoint2): CadPoint3 => ({ x: point.x, y: point.y, z: 0 });

const NO_PROMPT = { message: "", options: [] } as const;

function message<S>(state: S, text: string): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "message", text } };
}

function nothing<S>(state: S): CadCommandStep<S> {
  return { state, prompt: NO_PROMPT, accepts: 0, result: { kind: "none" } };
}

function batch<S>(state: S, commands: readonly CadEntityCommand[], label: string): CadCommandStep<S> {
  return {
    state,
    prompt: NO_PROMPT,
    accepts: 0,
    result: commands.length > 0 ? { kind: "document", commands, label } : { kind: "none" },
  };
}

/** Una orden que falla se cuenta, no se traga: el motor no tiene excepciones. */
function attempt<S>(state: S, label: string, build: () => readonly CadEntityCommand[]): CadCommandStep<S> {
  try {
    return batch(state, build(), label);
  } catch (error) {
    return message(state, error instanceof Error ? error.message : String(error));
  }
}

const blocksOf = (context: CadCommandContext): readonly CadBlockDefinition[] => context.blocks?.() ?? [];

/** `block:puerta-90`: legible en el documento y estable entre corridas. */
function blockId(name: string): string {
  const slug = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `block:${slug || "bloque"}`;
}

function blockList(context: CadCommandContext): string {
  const names = cadInsertableBlocks(blocksOf(context)).map((block) => block.name).sort();
  return names.length ? `Bloques: ${names.join(", ")}.` : "El dibujo no tiene bloques definidos.";
}

// ---------------------------------------------------------------------------
// BLOCK / WBLOCK
// ---------------------------------------------------------------------------

interface DefineState {
  name: string | null;
  basePoint: CadPoint3 | null;
  selection: readonly string[];
  /**
   * La definición que se va a SUSTITUIR, cuando el nombre tecleado ya existe.
   *
   * `pending` es el nombre que espera la respuesta a «¿Redefinirlo?»; `target`
   * es la definición aceptada. AutoCAD hace exactamente esta pregunta en
   * `-BLOCK` («Block "X" already exists. Redefine it? [Yes/No] <N>») y era el
   * camino que faltaba: la auditoría del 2026-09-01 tecleó B y el nombre de un
   * bloque existente y el producto contestó «redefínalo» sin ninguna orden con
   * la que hacerlo. Un despacho redefine un bloque cada vez que el cliente
   * cambia la silla; no es un caso raro.
   */
  redefine: { pending: string } | { target: CadBlockDefinition } | null;
}

const REDEFINE_YES = { keyword: "Sí", shortcut: "S" } as const;
const REDEFINE_NO = { keyword: "No", shortcut: "N" } as const;

/**
 * BLOCK y WBLOCK comparten diálogo y difieren en dos decisiones, que es
 * exactamente lo que los distingue en AutoCAD:
 *
 * - **Ámbito.** BLOCK deja la definición en el documento; WBLOCK la PUBLICA con
 *   `library.scope = "tenant"`, que es lo que ADCENTER lee desde otros dibujos
 *   de la organización.
 * - **Qué pasa con lo designado.** BLOCK lo sustituye por una inserción; WBLOCK
 *   lo CONSERVA, porque exportar no debe alterar el dibujo del que se exporta.
 */
function defineDescriptor(options: {
  name: "BLOCK" | "WBLOCK";
  aliases: readonly string[];
  scope: "document" | "tenant";
  disposition: "insert" | "retain";
}): CadCommandDescriptor<DefineState> {
  const step = (state: DefineState): CadCommandStep<DefineState> => {
    if (state.redefine && "pending" in state.redefine)
      return {
        state,
        prompt: {
          message: `El bloque ${state.redefine.pending} ya existe. ¿Redefinirlo?`,
          options: [REDEFINE_YES, REDEFINE_NO],
          defaultOption: REDEFINE_NO.keyword,
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    if (state.name === null)
      return {
        state,
        prompt: { message: "Indique el nombre del bloque", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    if (!state.basePoint)
      return {
        state,
        prompt: {
          message: state.redefine
            ? `Precise el punto base de la nueva definición de ${state.name}`
            : "Precise el punto base de inserción",
          options: [],
        },
        accepts: CAD_ACCEPT_POINT,
      };
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  };

  const finish = (state: DefineState, context: CadCommandContext) =>
    attempt(state, options.name, () => {
      const entities = state.selection
        .map((id) => context.entity?.(id))
        .filter((entity): entity is CadEntity => !!entity);
      if (entities.length !== state.selection.length)
        throw new Error("El anfitrión no puede leer la geometría designada.");
      if (state.redefine && "target" in state.redefine)
        return cadRedefineBlockCommands({
          target: state.redefine.target,
          basePoint: state.basePoint!,
          entities,
          scope: options.scope,
        });
      return cadDefineBlockCommands({
        id: blockId(state.name!),
        name: state.name!,
        basePoint: state.basePoint!,
        entities,
        insertId: context.newEntityId(),
        disposition: options.disposition,
        scope: options.scope,
      }).commands;
    });

  return {
    name: options.name,
    aliases: options.aliases,
    kind: "manage",
    transparent: false,
    selection: "optional",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) =>
      step({ name: null, basePoint: null, selection: context.selection, redefine: null }),
    step: (state, input, context) => {
      if (input.kind === "cancel") return nothing(state);
      if (state.redefine && "pending" in state.redefine) {
        // Enter toma la opción por defecto —No—, igual que en AutoCAD: pisar
        // una definición con todas sus inserciones no se acepta por descuido.
        if (input.kind === "keyword" && input.keyword === REDEFINE_YES.keyword) {
          const target = cadFindBlock(blocksOf(context), state.redefine.pending);
          if (!target) return message(state, `El bloque ${state.redefine.pending} ya no existe.`);
          return step({ ...state, name: target.name, redefine: { target } });
        }
        if (input.kind === "keyword" || input.kind === "enter")
          return step({ ...state, redefine: null });
        return step(state);
      }
      if (input.kind === "text" && state.name === null) {
        const name = input.value.trim();
        if (cadFindBlock(blocksOf(context), name))
          return step({ ...state, redefine: { pending: name } });
        return step({ ...state, name });
      }
      if (input.kind === "point" && state.name !== null && !state.basePoint)
        return step({ ...state, basePoint: flat(input.point) });
      if (input.kind === "selection") {
        const selection = input.entityIds;
        return selection.length === 0
          ? step({ ...state, selection })
          : finish({ ...state, selection }, context);
      }
      if (input.kind === "entityPick") {
        const selection = [...new Set([...state.selection, input.entityId])];
        return step({ ...state, selection });
      }
      if (input.kind === "enter") {
        if (state.name === null || !state.basePoint) return nothing(state);
        if (state.selection.length === 0)
          return message(state, "No hay ningún objeto designado: el bloque no se ha creado.");
        return finish(state, context);
      }
      return step(state);
    },
  };
}

// ---------------------------------------------------------------------------
// BASE
// ---------------------------------------------------------------------------

const baseCommand: CadCommandDescriptor<null> = {
  name: "BASE",
  aliases: [],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    const current = cadDrawingBasePoint(blocksOf(context));
    return {
      state: null,
      prompt: {
        message: "Precise el punto base del dibujo",
        options: [],
        defaultValue: `${current.x},${current.y}`,
      },
      accepts: CAD_ACCEPT_POINT,
    };
  },
  step: (state, input, context) => {
    if (input.kind !== "point") return nothing(state);
    return attempt(state, "BASE", () =>
      cadSetDrawingBasePointCommands(blocksOf(context), flat(input.point)),
    );
  },
};

// ---------------------------------------------------------------------------
// INSERT
// ---------------------------------------------------------------------------

interface InsertState {
  block: CadBlockDefinition | null;
  insertion: CadPoint3 | null;
  scaleX: number | null;
  scaleY: number | null;
  rotation: number | null;
  /** Atributos que quedan por preguntar, en orden. */
  pending: readonly CadBlockAttributePrompt[];
  values: Record<string, string>;
}

const EMPTY_INSERT: InsertState = {
  block: null,
  insertion: null,
  scaleX: null,
  scaleY: null,
  rotation: null,
  pending: [],
  values: {},
};

function insertStep(state: InsertState): CadCommandStep<InsertState> {
  if (!state.block)
    return {
      state,
      prompt: { message: "Indique el nombre del bloque", options: [{ keyword: "?", shortcut: "?" }] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.insertion)
    return {
      state,
      prompt: { message: "Precise el punto de inserción", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.scaleX === null)
    return {
      state,
      // El factor admite signo: −1 inserta el bloque ESPEJADO.
      prompt: { message: "Factor de escala X", options: [], defaultValue: "1" },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.scaleY === null)
    return {
      state,
      prompt: { message: "Factor de escala Y", options: [], defaultValue: String(state.scaleX) },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.rotation === null)
    return {
      state,
      prompt: { message: "Ángulo de rotación", options: [], defaultValue: "0" },
      accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE,
    };
  const next = state.pending[0];
  return {
    state,
    prompt: {
      message: next.prompt,
      options: [],
      defaultValue: state.values[next.tag] ?? next.defaultValue,
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function insertFinish(state: InsertState, context: CadCommandContext): CadCommandStep<InsertState> {
  return attempt(state, "INSERT", () =>
    cadInsertBlockCommands({
      id: context.newEntityId(),
      block: state.block!,
      insertion: state.insertion!,
      scale: { x: state.scaleX!, y: state.scaleY!, z: 1 },
      rotation: state.rotation!,
      layer: context.activeLayer,
      attributes: state.values,
    }),
  );
}

/** Avanza tras fijar la rotación: o quedan atributos por preguntar, o se emite. */
function insertAdvance(state: InsertState, context: CadCommandContext): CadCommandStep<InsertState> {
  return state.pending.length > 0 ? insertStep(state) : insertFinish(state, context);
}

const insertCommand: CadCommandDescriptor<InsertState> = {
  name: "INSERT",
  aliases: ["I", "DDINSERT"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => insertStep(EMPTY_INSERT),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);

    if (!state.block) {
      // Enter con la caja vacía en el primer paso CANCELA. AutoCAD ofrecería
      // aquí el último bloque insertado como valor por defecto; mientras no lo
      // haya, repreguntar sin fin es peor que soltar el comando.
      if (input.kind === "enter") return nothing(state);
      if (input.kind !== "text") return insertStep(state);
      const typed = input.value.trim();
      if (typed === "?") return message(state, blockList(context));
      const block = cadFindBlock(cadInsertableBlocks(blocksOf(context)), typed);
      if (!block)
        return message(state, `No hay ningún bloque llamado ${typed}. Escriba ? para verlos.`);
      return insertStep({ ...state, block, pending: cadBlockAttributePrompts(block) });
    }

    if (!state.insertion) {
      if (input.kind !== "point") return insertStep(state);
      return insertStep({ ...state, insertion: flat(input.point) });
    }

    if (state.scaleX === null) {
      if (input.kind === "enter") return insertStep({ ...state, scaleX: 1 });
      if (input.kind !== "distance") return insertStep(state);
      if (input.value === 0) return message(state, "La escala de una inserción no puede ser cero.");
      return insertStep({ ...state, scaleX: input.value });
    }

    if (state.scaleY === null) {
      // Enter iguala Y a X, que es el comportamiento de AutoCAD y el que
      // conserva la proporción del bloque sin teclear el número dos veces.
      if (input.kind === "enter") return insertStep({ ...state, scaleY: state.scaleX });
      if (input.kind !== "distance") return insertStep(state);
      if (input.value === 0) return message(state, "La escala de una inserción no puede ser cero.");
      return insertStep({ ...state, scaleY: input.value });
    }

    if (state.rotation === null) {
      if (input.kind === "enter") return insertAdvance({ ...state, rotation: 0 }, context);
      const degrees =
        input.kind === "angle" ? input.degrees : input.kind === "distance" ? input.value : null;
      if (degrees === null) return insertStep(state);
      return insertAdvance({ ...state, rotation: degrees }, context);
    }

    const attribute = state.pending[0];
    if (input.kind !== "text" && input.kind !== "enter") return insertStep(state);
    const value = input.kind === "text" ? input.value : attribute.defaultValue;
    const next: InsertState = {
      ...state,
      values: { ...state.values, [attribute.tag]: value },
      pending: state.pending.slice(1),
    };
    return next.pending.length > 0 ? insertStep(next) : insertFinish(next, context);
  },
};

// ---------------------------------------------------------------------------
// ATTEDIT
// ---------------------------------------------------------------------------

interface AttEditState {
  insert: CadInsertEntity | null;
  block: CadBlockDefinition | null;
  pending: readonly CadBlockAttributePrompt[];
  values: Record<string, string>;
}

const EMPTY_ATTEDIT: AttEditState = { insert: null, block: null, pending: [], values: {} };

function attEditStep(state: AttEditState): CadCommandStep<AttEditState> {
  if (!state.insert || !state.block)
    return {
      state,
      prompt: { message: "Designe la inserción de bloque a editar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  const next = state.pending[0];
  return {
    state,
    prompt: {
      message: next.prompt,
      options: [],
      // El valor ACTUAL como defecto, no el de la definición: al editar se
      // confirma lo que hay, no se vuelve al de fábrica sin querer.
      defaultValue: state.insert.attributes?.[next.tag] ?? next.defaultValue,
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/** Prepara la edición de una inserción, o explica por qué no se puede. */
function attEditTarget(entityId: string, context: CadCommandContext): CadCommandStep<AttEditState> {
  const entity = context.entity?.(entityId);
  if (!entity || entity.type !== "insert")
    return message(EMPTY_ATTEDIT, "ATTEDIT sólo edita inserciones de bloque.");
  const block = cadFindBlock(blocksOf(context), entity.block);
  if (!block) return message(EMPTY_ATTEDIT, `La inserción apunta a un bloque que falta: ${entity.block}.`);
  const pending = cadBlockAttributePrompts(block);
  if (pending.length === 0)
    return message(EMPTY_ATTEDIT, `El bloque ${block.name} no tiene atributos editables.`);
  return attEditStep({ insert: entity, block, pending, values: {} });
}

const attEditCommand: CadCommandDescriptor<AttEditState> = {
  name: "ATTEDIT",
  aliases: ["ATE", "ATTE", "EATTEDIT"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length === 1
      ? attEditTarget(context.selection[0], context)
      : attEditStep(EMPTY_ATTEDIT),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (!state.insert || !state.block) {
      if (input.kind === "entityPick") return attEditTarget(input.entityId, context);
      if (input.kind === "selection" && input.entityIds.length === 1)
        return attEditTarget(input.entityIds[0], context);
      return attEditStep(state);
    }
    if (input.kind !== "text" && input.kind !== "enter") return attEditStep(state);
    const attribute = state.pending[0];
    const current = state.insert.attributes?.[attribute.tag] ?? attribute.defaultValue;
    const next: AttEditState = {
      ...state,
      values: { ...state.values, [attribute.tag]: input.kind === "text" ? input.value : current },
      pending: state.pending.slice(1),
    };
    if (next.pending.length > 0) return attEditStep(next);
    return attempt(next, "ATTEDIT", () =>
      cadAttEditCommands(next.insert!, next.block!, next.values),
    );
  },
};

// ---------------------------------------------------------------------------
// ATTSYNC
// ---------------------------------------------------------------------------

interface AttsyncState {
  asked?: boolean;
}

/**
 * ATTSYNC: pone al día los atributos de las referencias de un bloque.
 *
 * Redefinir un bloque no toca las referencias que ya estaban: les falta la
 * etiqueta nueva y les sobra la que se quitó. Cuarenta láminas con el mismo
 * cajetín son cuarenta ediciones a mano que nadie hace. Las reglas —qué se
 * conserva, qué entra, qué sale y qué manda en un atributo constante— viven en
 * `blocks/attribute-sync.ts`, sin motor y probadas aparte.
 */
const attsyncCommand: CadCommandDescriptor<AttsyncState> = {
  name: "ATTSYNC",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: () => ({
    state: {},
    prompt: {
      message: "Indique el bloque a sincronizar — Intro para todos",
      options: [],
      defaultValue: "todos",
    },
    accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    const document = context.document?.();
    if (!document) return message(state, "No hay ningún dibujo abierto.");
    if (input.kind === "text" && input.value.trim() === "?")
      return message(state, blockList(context));
    if (input.kind !== "text" && input.kind !== "enter")
      return message(state, "ATTSYNC espera el nombre de un bloque, o Intro para todos.");

    const nombre = input.kind === "text" ? input.value.trim() : "";
    const resultado = cadAttsyncCommands(document, nombre || undefined);
    const alcance = nombre ? `«${nombre}»` : "el dibujo";
    if (resultado.visited === 0)
      return message(
        state,
        nombre
          ? `No hay ninguna referencia de «${nombre}» en el dibujo.`
          : "El dibujo no tiene ninguna referencia de bloque.",
      );
    if (resultado.commands.length === 0)
      return message(state, `Los atributos de ${alcance} ya estaban al día (${resultado.visited} referencia(s)).`);

    // Se cuenta QUÉ cambió, no «Hecho»: la etiqueta que entra y la que sale son
    // justo lo que el dibujante necesita comprobar antes de seguir.
    const partes = [`Sincronizadas ${resultado.updated} de ${resultado.visited} referencia(s) de ${alcance}`];
    if (resultado.added.length > 0) partes.push(`añadido ${resultado.added.join(", ")}`);
    if (resultado.removed.length > 0) partes.push(`retirado ${resultado.removed.join(", ")}`);
    return {
      state,
      prompt: NO_PROMPT,
      accepts: 0,
      result: {
        kind: "document",
        commands: resultado.commands,
        label: "ATTSYNC",
        notice: `${partes.join(" · ")}.`,
      },
    };
  },
};

export const CAD_BLOCK_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(defineDescriptor({ name: "BLOCK", aliases: ["B", "BMAKE"], scope: "document", disposition: "insert" })),
  asCadCommand(defineDescriptor({ name: "WBLOCK", aliases: ["W"], scope: "tenant", disposition: "retain" })),
  asCadCommand(baseCommand),
  asCadCommand(insertCommand),
  asCadCommand(attEditCommand),
  asCadCommand(attsyncCommand),
];
