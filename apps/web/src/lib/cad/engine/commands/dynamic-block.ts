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
import type { CadBlockDefinition, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_DYNAMIC_BLOCKS,
  CAD_DYNAMIC_FAMILY_METADATA,
  cadDynamicInsertCommands,
  cadDynamicInsertFamilyId,
  cadDynamicInsertValues,
  cadDynamicRestretchCommands,
  type CadDynamicBlockFamily,
  type CadDynamicParameter,
} from "../../dynamic-blocks";
import {
  CAD_DIN_DEFAULT,
  CAD_DIN_KIND,
  CAD_DIN_LABEL,
  CAD_DIN_LAYER,
  CAD_DIN_MAX,
  CAD_DIN_MIN,
  CAD_DIN_PARAM,
  CAD_DIN_STEPS,
  cadUserDynamicFamilies,
  cadUserDynamicFamily,
} from "../../blocks/user-dynamic-family";
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
 * Las familias que el usuario puede colocar AHORA: las del programa y las que
 * trae el DIBUJO.
 *
 * En este orden a propósito: si un despacho llama `nivel` a un bloque suyo, la
 * suya gana sobre la del programa. El dibujo manda sobre el catálogo, que es lo
 * que un despacho espera de su propia biblioteca.
 */
function familiesOf(context: CadCommandContext): CadDynamicBlockFamily[] {
  const propias = cadUserDynamicFamilies(context.blocks?.() ?? []);
  const suyas = new Set(propias.map((family) => family.id));
  return [...propias, ...CAD_DYNAMIC_BLOCKS.filter((family) => !suyas.has(family.id))];
}

/**
 * Una palabra clave por familia, derivada de su id.
 *
 * El atajo es la inicial en mayúscula, como en toda la línea de órdenes de este
 * producto. Si dos familias empezaran por la misma letra, la segunda toma su
 * segunda letra: dos atajos iguales harían inalcanzable a una de las dos.
 */
function familyKeywords(families: readonly CadDynamicBlockFamily[]): { keyword: string; shortcut: string }[] {
  const usados = new Set<string>();
  return families.map((family) => {
    const limpio = family.id.replace(/[^a-z]/gu, "");
    let atajo = limpio[0]?.toUpperCase() ?? "X";
    for (const letra of limpio)
      if (usados.has(atajo)) atajo = letra.toUpperCase();
      else break;
    usados.add(atajo);
    return { keyword: family.id, shortcut: atajo };
  });
}

const familyFor = (
  families: readonly CadDynamicBlockFamily[],
  raw: string,
): CadDynamicBlockFamily | null => {
  const clave = raw.trim().toLowerCase();
  return (
    families.find(
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
  /** Las familias disponibles cuando arrancó la orden: del dibujo y del programa. */
  families: CadDynamicBlockFamily[];
  family: CadDynamicBlockFamily | null;
  /** Índice del parámetro que se está preguntando. */
  index: number;
  values: Record<string, number>;
  point: CadPoint2 | null;
}

function insertStep(state: InsertState): CadCommandStep<InsertState> {
  if (!state.family) {
    const options = familyKeywords(state.families);
    return {
      state,
      prompt: {
        message: `Familia dinámica (${state.families.length} disponibles)`,
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
  begin: (context) => {
    const families = familiesOf(context);
    if (families.length === 0)
      return say("No hay ninguna familia dinámica disponible en este dibujo ni en el programa.");
    return insertStep({ families, family: null, index: 0, values: {}, point: null });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("BLOQUEDIN cancelado.");
    if (!state.family) {
      if (input.kind === "enter")
        return insertStep({ ...state, family: state.families[0] ?? null });
      if (input.kind !== "keyword") return insertStep(state);
      // El motor ya rechaza con motivo una palabra que no está entre las
      // opciones del prompt («Entrada no válida "…"»), así que aquí no puede
      // llegar una familia inventada: lo que no se reconoce se vuelve a
      // preguntar en vez de escribir una rama que nadie puede alcanzar.
      const family = familyFor(state.families, input.keyword);
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
 * Es el gesto de AutoCAD para esto: se elige el bloque y se le cambia el
 * parámetro en propiedades, no se designa uno por orden. Designar con el ratón
 * también funciona en este producto —el clic se resuelve como `entityPick`
 * cuando el paso lo acepta, `viewport/pointer-router.ts`, y lo mide el golden
 * 61—, así que la elección aquí es de gesto, no de límite técnico.
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
    const familyId = cadDynamicInsertFamilyId(dinamico)!;
    const family = familiesOf(context).find((item) => item.id === familyId);
    // La familia viajó en el INSERT y ni el dibujo ni el programa la tienen: se
    // dice cuál falta en vez de dejar el bloque mudo. Pasa de verdad cuando un
    // plano llega de otro despacho con su propia biblioteca y sin ella.
    if (!family)
      return say(
        `Este bloque dice ser de la familia «${familyId}», que no está ni en el dibujo ni en el programa. Sin su definición no se puede cambiar un parámetro sin inventarse la geometría.`,
      );
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
    const disponibles = familiesOf(context);
    const entidades = context.entityIds
      .map((id) => context.entity!(id))
      .filter((entity): entity is NonNullable<typeof entity> => !!entity)
      .filter((entity) => entity.context?.metadata?.[CAD_DYNAMIC_FAMILY_METADATA]);
    if (entidades.length === 0)
      return say(
        `No hay ningún bloque dinámico colocado. Hay ${disponibles.length} familia(s) disponibles: ${disponibles
          .map((family) => family.id)
          .join(", ")}. Coloque uno con BLOQUEDIN.`,
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

// ---------------------------------------------------------------------------
// BLOQUEDINDEF — volver dinámico un bloque DEL USUARIO
// ---------------------------------------------------------------------------

/**
 * Declara un parámetro sobre un bloque del dibujo.
 *
 * Es la orden que separa «el programa trae dos familias» de «un despacho puede
 * hacer dinámica su biblioteca». El parámetro se escribe DENTRO de la
 * definición como una línea marcada —ver `blocks/user-dynamic-family.ts`—, así
 * que viaja al DXF, se ve en el bloque y se puede apagar por capa.
 *
 * La línea se teclea de base a punta: su dirección es la del estirado y su
 * longitud es la medida de referencia. Lo que quede más allá de su punto medio
 * es lo que se mueve.
 */
interface DefineState {
  blockId: string | null;
  name: string | null;
  label: string | null;
  base: CadPoint2 | null;
  tip: CadPoint2 | null;
  min: number | null;
  max: number | null;
  asked: "min" | "max" | "steps" | null;
  steps: string | null;
}

function defineStep(state: DefineState): CadCommandStep<DefineState> {
  if (!state.blockId)
    return {
      state,
      prompt: { message: "Nombre del bloque que se vuelve dinámico", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.name)
    return {
      state,
      prompt: { message: "Nombre del parámetro (letras, cifras y guiones)", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.label)
    return {
      state,
      prompt: { message: `Rótulo que se leerá al preguntar, Intro para <${state.name}>`, options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  if (!state.base)
    return {
      state,
      prompt: { message: "Punto BASE del parámetro (lo que NO se mueve)", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (!state.tip)
    return {
      state,
      prompt: { message: "Punta del parámetro: dirección y medida de referencia", options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  if (state.asked === "min")
    return {
      state,
      prompt: { message: "Mínimo admitido, Intro para ninguno", options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  if (state.asked === "max")
    return {
      state,
      prompt: { message: "Máximo admitido, Intro para ninguno", options: [] },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  return {
    state,
    prompt: {
      message: "Medidas admitidas separadas por comas (600,700,800), Intro para libre",
      options: [],
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

function finishDefine(state: DefineState, context: CadCommandContext): CadCommandStep<never> {
  const blocks = context.blocks?.() ?? [];
  const definition = blocks.find((block) => block.id === state.blockId);
  if (!definition) return say(`El bloque «${state.blockId}» ya no está en el dibujo.`);

  const largo = Math.hypot(state.tip!.x - state.base!.x, state.tip!.y - state.base!.y);
  const metadata: Record<string, string> = {
    [CAD_DIN_PARAM]: state.name!,
    [CAD_DIN_KIND]: "lineal",
    [CAD_DIN_LABEL]: state.label!,
    [CAD_DIN_DEFAULT]: String(Math.round(largo * 1_000) / 1_000),
  };
  if (state.min !== null) metadata[CAD_DIN_MIN] = String(state.min);
  if (state.max !== null) metadata[CAD_DIN_MAX] = String(state.max);
  if (state.steps) metadata[CAD_DIN_STEPS] = state.steps;

  const carrier = {
    id: context.newEntityId(),
    type: "line",
    start: { x: state.base!.x, y: state.base!.y, z: 0 },
    end: { x: state.tip!.x, y: state.tip!.y, z: 0 },
    // Capa propia para poder apagar los parámetros sin tocar el dibujo.
    layer: CAD_DIN_LAYER,
    context: { metadata },
  } as unknown as CadBlockDefinition["entities"][number];

  const propuesta: CadBlockDefinition = {
    ...definition,
    entities: [...definition.entities, carrier],
  };
  // Se lee con el MISMO lector que usará la orden de colocar: un parámetro que
  // el lector no acepta dejaría un bloque que dice ser dinámico y no obedece.
  const { family, findings } = cadUserDynamicFamily(propuesta);
  if (!family || findings.length > 0)
    return say(
      `No se declaró el parámetro: ${findings.map((hallazgo) => hallazgo.detail).join(" ") || "el lector no reconoció ninguno."}`,
    );

  const dicho =
    `BLOQUEDINDEF: «${definition.name}» ya es dinámico — parámetro ${state.name} (${state.label}), ` +
    `referencia ${Math.round(largo)}${state.min !== null ? `, mín. ${state.min}` : ""}` +
    `${state.max !== null ? `, máx. ${state.max}` : ""}${state.steps ? `, medidas ${state.steps}` : ""}. ` +
    `Colóquelo con BLOQUEDIN ${definition.id}.`;
  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [{ type: "block", op: "redefine", definition: propuesta }],
      label: "BLOQUEDINDEF",
      notice: dicho,
    },
  };
}

const defineCommand: CadCommandDescriptor<DefineState> = {
  name: "BLOQUEDINDEF",
  aliases: ["PARAMETRODEF", "DYNPARAM"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () =>
    defineStep({
      blockId: null,
      name: null,
      label: null,
      base: null,
      tip: null,
      min: null,
      max: null,
      asked: null,
      steps: null,
    }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("BLOQUEDINDEF cancelado.");
    if (!state.blockId) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("BLOQUEDINDEF necesita el nombre del bloque que se vuelve dinámico.");
      const clave = input.value.trim().toLowerCase();
      const definition = (context.blocks?.() ?? []).find(
        (block) => block.id.toLowerCase() === clave || block.name.toLowerCase() === clave,
      );
      return definition
        ? defineStep({ ...state, blockId: definition.id })
        : say(
            `No hay ningún bloque «${input.value.trim()}» en el dibujo. Defínalo primero con BLOCK.`,
          );
    }
    if (!state.name) {
      if (input.kind !== "text" || input.value.trim() === "")
        return say("Un parámetro sin nombre no se puede preguntar ni guardar.");
      return defineStep({ ...state, name: input.value.trim() });
    }
    if (!state.label) {
      if (input.kind === "enter") return defineStep({ ...state, label: state.name });
      if (input.kind !== "text") return defineStep(state);
      const escrito = input.value.trim();
      return defineStep({ ...state, label: escrito === "" ? state.name : escrito });
    }
    if (!state.base) {
      if (input.kind !== "point") return defineStep(state);
      return defineStep({ ...state, base: input.point });
    }
    if (!state.tip) {
      if (input.kind !== "point") return defineStep(state);
      if (input.point.x === state.base.x && input.point.y === state.base.y)
        return say("La punta no puede ser la base: sin dirección no hay estirado.");
      return defineStep({ ...state, tip: input.point, asked: "min" });
    }
    if (state.asked === "min") {
      if (input.kind === "enter") return defineStep({ ...state, asked: "max" });
      if (input.kind !== "distance") return defineStep(state);
      return defineStep({ ...state, min: input.value, asked: "max" });
    }
    if (state.asked === "max") {
      if (input.kind === "enter") return defineStep({ ...state, asked: "steps" });
      if (input.kind !== "distance") return defineStep(state);
      return defineStep({ ...state, max: input.value, asked: "steps" });
    }
    if (input.kind === "enter") return finishDefine(state, context);
    if (input.kind !== "text") return defineStep(state);
    const escrito = input.value.trim();
    return finishDefine({ ...state, steps: escrito === "" ? null : escrito }, context);
  },
};

export const CAD_DYNAMIC_BLOCK_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(insertCommand),
  asCadCommand(setCommand),
  asCadCommand(listCommand),
  asCadCommand(defineCommand),
];
