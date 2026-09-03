/**
 * BLOQUEDIN, BLOQUEDINSET y BLOQUEDINLIST: la puerta a los bloques dinámicos.
 *
 * ## El defecto, medido
 *
 * `src/lib/cad/dynamic-blocks.ts` existe desde antes de esta campaña, con 683
 * líneas, dos familias y su spec verde. Buscando quién lo usa:
 *
 *     grep -rl "dynamic-blocks\|CadDynamicBlockFamily" src
 *     → dynamic-blocks.ts, dynamic-blocks.spec.ts, onboarding/tour-accuracy.spec.ts
 *
 * **Ni un comando, ni un panel.** El motor de bloques dinámicos estaba escrito,
 * probado y sin puerta: un arquitecto no podía colocar una sola puerta
 * paramétrica. Una capacidad que nadie puede alcanzar no es una capacidad, es
 * código; y la rúbrica hacía bien en no otorgar la fila.
 *
 * ## Qué cambia, y qué NO
 *
 * No se toca el motor: se le abren tres puertas.
 *
 * - `BLOQUEDIN` coloca una instancia: elige familia, pregunta cada parámetro
 *   con su valor por defecto, y **dice los ajustes** —un claro de 0,873 se
 *   ajusta al comercial de 0,90 y se dice que se ajustó, en vez de fabricar una
 *   puerta a medida sin que nadie lo decida—.
 * - `BLOQUEDINSET` cambia UN parámetro de una instancia ya colocada sin moverla:
 *   es el gesto que hace dinámico a un bloque dinámico. La alternativa —borrar y
 *   volver a insertar— pierde la posición, los atributos y la identidad.
 * - `BLOQUEDINLIST` dice qué hay y con qué valores, sin escribir nada.
 *
 * ## Los nombres
 *
 * En AutoCAD esto se hace con INSERT más la paleta de propiedades y con BEDIT,
 * y sus nombres (`BPARAMETER`, `BACTION`) son los del EDITOR de bloques, que
 * aquí todavía no existe. Ponerles esos nombres a estas órdenes sería prometer
 * el editor. Se llaman por lo que hacen.
 */
import type { CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_DYNAMIC_BLOCKS,
  CAD_DYNAMIC_FAMILY_METADATA,
  cadDynamicBlockFamily,
  cadDynamicInsertCommands,
  cadDynamicInsertFamilyId,
  cadDynamicInsertValues,
  cadDynamicRestretchCommands,
  type CadDynamicBlockFamily,
  type CadDynamicParameter,
} from "../../dynamic-blocks";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
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

/**
 * Una palabra clave por familia, derivada de su id.
 *
 * El atajo es la inicial en mayúscula, como en toda la línea de órdenes de este
 * producto. Si dos familias empezaran por la misma letra, la segunda toma su
 * segunda letra: dos atajos iguales harían inalcanzable a una de las dos.
 */
function familyKeywords(): { keyword: string; shortcut: string }[] {
  const usados = new Set<string>();
  return CAD_DYNAMIC_BLOCKS.map((family) => {
    const limpio = family.id.replace(/[^a-z]/gu, "");
    let atajo = limpio[0]?.toUpperCase() ?? "X";
    for (const letra of limpio)
      if (usados.has(atajo)) atajo = letra.toUpperCase();
      else break;
    usados.add(atajo);
    return { keyword: family.id, shortcut: atajo };
  });
}

const familyFor = (raw: string): CadDynamicBlockFamily | null => {
  const clave = raw.trim().toLowerCase();
  return (
    CAD_DYNAMIC_BLOCKS.find(
      (family) =>
        family.id.toLowerCase() === clave ||
        family.name.toLowerCase() === clave ||
        family.id.replace(/[^a-z]/gu, "")[0]?.toLowerCase() === clave,
    ) ?? null
  );
};

/** Cómo se pregunta un parámetro: con su unidad y su rango, no a ciegas. */
function parameterPrompt(parameter: CadDynamicParameter): string {
  if (parameter.kind === "flip")
    return `${parameter.label}: 1 sí, 0 no, Intro para <${parameter.default}>`;
  const limites = [
    parameter.min !== undefined ? `mín. ${parameter.min}` : null,
    parameter.max !== undefined ? `máx. ${parameter.max}` : null,
    parameter.steps ? `medidas: ${parameter.steps.join(", ")}` : null,
  ].filter(Boolean);
  return `${parameter.label}${limites.length > 0 ? ` (${limites.join("; ")})` : ""}, Intro para <${parameter.default}>`;
}

// ---------------------------------------------------------------------------
// BLOQUEDIN — colocar
// ---------------------------------------------------------------------------

interface InsertState {
  family: CadDynamicBlockFamily | null;
  /** Índice del parámetro que se está preguntando. */
  index: number;
  values: Record<string, number>;
  point: CadPoint2 | null;
}

function insertStep(state: InsertState): CadCommandStep<InsertState> {
  if (!state.family) {
    const options = familyKeywords();
    return {
      state,
      prompt: {
        message: `Familia dinámica (${CAD_DYNAMIC_BLOCKS.length} disponibles)`,
        options,
        defaultOption: options[0]?.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  }
  const parameter = state.family.parameters[state.index];
  if (parameter)
    return {
      state,
      prompt: { message: parameterPrompt(parameter), options: [] },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: { message: `${state.family.name}. Precise el punto de inserción`, options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function finishInsert(
  state: InsertState,
  point: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<never> {
  const family = state.family!;
  const blocks = context.blocks?.() ?? null;
  if (!blocks)
    return say("BLOQUEDIN necesita la tabla de bloques del dibujo: este anfitrión no la expone.");

  const { commands, values, adjustments } = cadDynamicInsertCommands(
    { blocks: [...blocks] },
    family,
    state.values,
    {
      entityId: context.newEntityId(),
      insertion: { x: point.x, y: point.y, z: 0 },
      layer: context.activeLayer,
    },
  );

  const leidos = family.parameters
    .map((parameter) => `${parameter.label} ${values[parameter.name]}`)
    .join(", ");
  const dicho =
    `BLOQUEDIN: ${family.name} — ${leidos} — en (${Math.round(point.x)}, ${Math.round(point.y)})` +
    // Los ajustes se DICEN. Un claro que se redondeó a la medida comercial sin
    // avisar es una puerta que no se puede comprar y nadie sabe por qué.
    (adjustments.length > 0 ? `. AJUSTES: ${adjustments.join(" ")}` : "");
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: commands as CadEntityCommand[], label: "BLOQUEDIN", notice: dicho },
  };
}

/**
 * El número que trae la entrada, o `null` si no traía uno.
 *
 * Se acepta tecleado como distancia y como texto porque un interruptor —`1`,
 * `0`— no es una distancia y la línea de órdenes lo entrega como texto. La coma
 * decimal se admite: en México se escribe `0,90` tan a menudo como `0.90`, y
 * rechazarla sería rechazar la mitad de los tecleos.
 */
function readValue(input: { kind: string; value?: number | string }): number | null {
  if (input.kind === "distance" && typeof input.value === "number") return input.value;
  if (input.kind === "text" && typeof input.value === "string") {
    const numero = Number(input.value.trim().replace(",", "."));
    if (Number.isFinite(numero)) return numero;
  }
  return null;
}

const insertCommand: CadCommandDescriptor<InsertState> = {
  name: "BLOQUEDIN",
  aliases: ["BLOQUEDINAMICO", "DYNBLOCK"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => insertStep({ family: null, index: 0, values: {}, point: null }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("BLOQUEDIN cancelado.");
    if (!state.family) {
      if (input.kind === "enter")
        return insertStep({ ...state, family: CAD_DYNAMIC_BLOCKS[0] ?? null });
      if (input.kind !== "keyword") return insertStep(state);
      // El motor ya rechaza con motivo una palabra que no está entre las
      // opciones del prompt («Entrada no válida "…"»), así que aquí no puede
      // llegar una familia inventada: lo que no se reconoce se vuelve a
      // preguntar en vez de escribir una rama que nadie puede alcanzar.
      const family = familyFor(input.keyword);
      return family ? insertStep({ ...state, family }) : insertStep(state);
    }
    const parameter = state.family.parameters[state.index];
    if (parameter) {
      if (input.kind === "enter") return insertStep({ ...state, index: state.index + 1 });
      const valor = readValue(input as never);
      if (valor === null) return insertStep(state);
      return insertStep({
        ...state,
        index: state.index + 1,
        values: { ...state.values, [parameter.name]: valor },
      });
    }
    if (input.kind !== "point") return insertStep(state);
    return finishInsert(state, input.point, context);
  },
};

// ---------------------------------------------------------------------------
// BLOQUEDINSET — cambiar un parámetro de una instancia colocada
// ---------------------------------------------------------------------------

interface SetState {
  entityId: string;
  family: CadDynamicBlockFamily;
  parameter: CadDynamicParameter | null;
}

function setStep(state: SetState): CadCommandStep<SetState> {
  if (!state.parameter) {
    const family = state.family;
    return {
      state,
      prompt: {
        message: `Parámetro de ${family.name}`,
        options: family.parameters.map((parameter) => ({
          keyword: parameter.name,
          shortcut: parameter.name[0].toUpperCase(),
        })),
        defaultOption: family.parameters[0]?.name,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  }
  return {
    state,
    prompt: { message: parameterPrompt(state.parameter), options: [] },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
  };
}

function finishSet(
  state: SetState,
  value: number,
  context: CadCommandContext,
): CadCommandStep<never> {
  const blocks = context.blocks?.() ?? null;
  const entity = context.entity?.(state.entityId);
  if (!blocks || !entity)
    return say("BLOQUEDINSET necesita leer el dibujo: este anfitrión no lo expone.");

  const { commands, values, adjustments } = cadDynamicRestretchCommands(
    { blocks: [...blocks] },
    state.family,
    entity,
    { [state.parameter!.name]: value },
  );
  const dicho =
    `BLOQUEDINSET: ${state.family.name} ${state.parameter!.label} = ${values[state.parameter!.name]}` +
    " (no se movió ni se volvió a insertar: sigue siendo el mismo bloque)" +
    (adjustments.length > 0 ? `. AJUSTES: ${adjustments.join(" ")}` : "");
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: commands as CadEntityCommand[],
      label: "BLOQUEDINSET",
      notice: dicho,
    },
  };
}

/**
 * El bloque dinámico sobre el que se trabaja sale de la SELECCIÓN del editor.
 *
 * No de un `entityPick`: el puntero todavía no está enrutado al motor —lo
 * documenta `Layout3DEditor.tsx` y lo dice el golden 45—, así que una orden que
 * pidiera designar con el ratón sería una orden que nadie puede terminar en el
 * navegador. La selección del editor SÍ funciona, y es además el gesto de
 * AutoCAD: se elige el bloque y se le cambia el parámetro.
 */
const setCommand: CadCommandDescriptor<SetState> = {
  name: "BLOQUEDINSET",
  aliases: ["PARAMETROBLOQUE", "DYNSET"],
  kind: "modify",
  transparent: false,
  selection: "required",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const seleccionados = context.selection
      .map((id) => context.entity?.(id))
      .filter((entity): entity is NonNullable<typeof entity> => !!entity);
    const dinamico = seleccionados.find((entity) => cadDynamicInsertFamilyId(entity));
    if (!dinamico)
      return say(
        seleccionados.length === 0
          ? "BLOQUEDINSET trabaja sobre la selección: elija primero un bloque dinámico."
          : `Nada de lo seleccionado (${seleccionados.length}) es un bloque dinámico: ninguno lleva familia en sus metadatos. Coloque uno con BLOQUEDIN.`,
      );
    let family: CadDynamicBlockFamily;
    try {
      family = cadDynamicBlockFamily(cadDynamicInsertFamilyId(dinamico)!);
    } catch (error) {
      // La familia viajó en el documento y este programa ya no la tiene: se
      // dice cuál falta en vez de dejar el bloque mudo.
      return say(error instanceof Error ? error.message : String(error));
    }
    return setStep({ entityId: dinamico.id, family, parameter: null });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("BLOQUEDINSET cancelado.");
    if (!state.parameter) {
      const family = state.family;
      if (input.kind === "enter") return setStep({ ...state, parameter: family.parameters[0] });
      if (input.kind !== "keyword") return setStep(state);
      const clave = input.keyword.trim().toLowerCase();
      const parameter =
        family.parameters.find((item) => item.name.toLowerCase() === clave) ??
        family.parameters.find((item) => item.name[0].toLowerCase() === clave);
      // Mismo motivo que en BLOQUEDIN: las opciones del prompt SON los
      // parámetros de la familia, y el motor no deja pasar otra cosa.
      return parameter ? setStep({ ...state, parameter }) : setStep(state);
    }
    if (input.kind === "enter") return finishSet(state, state.parameter.default, context);
    const valor = readValue(input as never);
    if (valor === null) return setStep(state);
    return finishSet(state, valor, context);
  },
};

// ---------------------------------------------------------------------------
// BLOQUEDINLIST — qué hay
// ---------------------------------------------------------------------------

const listCommand: CadCommandDescriptor<never> = {
  name: "BLOQUEDINLIST",
  aliases: ["LISTABLOQUESDIN"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    if (!context.entity)
      return say("BLOQUEDINLIST necesita leer el dibujo: este anfitrión no lo expone.");
    const entidades = context.entityIds
      .map((id) => context.entity!(id))
      .filter((entity): entity is NonNullable<typeof entity> => !!entity)
      .filter((entity) => entity.context?.metadata?.[CAD_DYNAMIC_FAMILY_METADATA]);
    if (entidades.length === 0)
      return say(
        `No hay ningún bloque dinámico colocado. Hay ${CAD_DYNAMIC_BLOCKS.length} familia(s) disponibles: ${CAD_DYNAMIC_BLOCKS.map(
          (family) => family.id,
        ).join(", ")}. Coloque uno con BLOQUEDIN.`,
      );

    const porFamilia = new Map<string, number>();
    const renglones: string[] = [];
    for (const entity of entidades) {
      const familyId = cadDynamicInsertFamilyId(entity)!;
      porFamilia.set(familyId, (porFamilia.get(familyId) ?? 0) + 1);
      const values = cadDynamicInsertValues(entity);
      renglones.push(
        `${entity.id}: ${familyId} (${Object.entries(values)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, value]) => `${name}=${value}`)
          .join(", ")})`,
      );
    }
    const resumen = [...porFamilia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([familyId, cuantos]) => `${cuantos} de ${familyId}`)
      .join(" · ");
    return say(
      `BLOQUEDINLIST — ${entidades.length} bloque(s) dinámico(s): ${resumen}. ${renglones
        .slice(0, 8)
        .join("; ")}${renglones.length > 8 ? `; y ${renglones.length - 8} más` : ""}.`,
    );
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_DYNAMIC_BLOCK_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(insertCommand),
  asCadCommand(setCommand),
  asCadCommand(listCommand),
];
