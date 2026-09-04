/**
 * FIELD y UPDATEFIELD: el texto que se rellena solo.
 *
 * ## Qué faltaba, medido
 *
 * `FIELD`, `UPDATEFIELD`, `DATALINK` y `DATALINKUPDATE` no estaban en el
 * registro. Lo que sí había eran los campos del CAJETÍN, que se resuelven al
 * publicar un conjunto de planos: la mitad del problema. La otra mitad es el
 * área de un local escrita a mano en el plano, que deja de ser cierta en cuanto
 * alguien mueve un muro — y nadie se entera hasta que el cliente suma.
 *
 * ## Por qué el campo se resuelve AL COLOCARLO y no sólo al actualizar
 *
 * Porque un plano tiene que poder imprimirse tal como está. Un texto que
 * enseñara `%<Area:e12>%` hasta que alguien ejecute una orden es un plano que
 * se entrega mal una vez de cada veinte. El campo nace con su valor puesto y
 * `UPDATEFIELD` lo refresca.
 *
 * ## El límite, dicho
 *
 * Cuatro clases de campo: área, longitud, fecha y variable de sistema. No hay
 * enlace a hoja de cálculo (`DATALINK`): eso es traer datos de fuera y pide
 * decisiones que no son de este motor.
 */
import type { CadPoint2 } from "../../cad-document";
import {
  CAD_FIELD_METADATA,
  cadFieldEntities,
  cadFieldLabel,
  cadFormatFieldExpression,
  cadResolveField,
  cadUpdateFields,
  type CadFieldExpression,
  type CadFieldKind,
} from "../../fields/drawing-fields";
import {
  CAD_ACCEPT_ENTITY_PICK,
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

/** Altura de rótulo por defecto, la misma que usan las cotas de este producto. */
const TEXT_HEIGHT = 250;

const KIND_OPTIONS = [
  { keyword: "Área", shortcut: "A" },
  { keyword: "Longitud", shortcut: "L" },
  { keyword: "Fecha", shortcut: "F" },
  { keyword: "Variable", shortcut: "V" },
] as const;

const KIND_BY_KEY: Record<string, CadFieldKind> = {
  a: "area",
  l: "longitud",
  f: "fecha",
  v: "variable",
};

/**
 * La inicial de una palabra clave, SIN acento.
 *
 * `"Área"[0].toLowerCase()` es `"á"`, no `"a"`, así que una tabla indexada por
 * la inicial no reconocía la palabra que el propio prompt ofrece. Se descubrió
 * tecleando la orden en el navegador: el prompt volvía a pedir la clase de
 * campo sin decir por qué. La normalización va aquí, en el único sitio donde se
 * lee la inicial.
 */
const initialOf = (keyword: string): string =>
  keyword
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")[0]
    ?.toLowerCase() ?? "";

interface FieldState {
  kind: CadFieldKind | null;
  argument: string | null;
  /** El objeto ya designado antes de teclear la orden, si era uno solo. */
  preselected: string | null;
}

function fieldStep(state: FieldState): CadCommandStep<FieldState> {
  if (!state.kind)
    return {
      state,
      prompt: { message: "Clase de campo", options: [...KIND_OPTIONS], defaultOption: "Área" },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.argument === null) {
    if (state.kind === "variable")
      return {
        state,
        prompt: { message: "Nombre de la variable de sistema", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    return {
      state,
      prompt: {
        message:
          state.kind === "area" ? "Designe el objeto que encierra el área" : "Designe el objeto a medir",
        options: [],
      },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  }
  return {
    state,
    prompt: { message: "Precise dónde va el texto", options: [] },
    accepts: CAD_ACCEPT_POINT,
  };
}

function documentOf(context: CadCommandContext) {
  if (!context.entity) return null;
  return {
    entities: context.entityIds
      .map((id) => context.entity!(id))
      .filter((entity): entity is NonNullable<typeof entity> => !!entity),
    meta: { unit: context.unit } as never,
  };
}

function finishField(
  state: FieldState,
  point: CadPoint2,
  context: CadCommandContext,
): CadCommandStep<never> {
  const document = documentOf(context);
  if (!document) return say("FIELD necesita leer el dibujo: este anfitrión no lo expone.");

  const expression: CadFieldExpression = { kind: state.kind!, argument: state.argument! };
  const value = cadResolveField(expression, {
    document,
    // La fecha del dibujo: la del sistema en el momento de colocar. Es un dato
    // del campo, no del documento, y por eso se congela en el texto hasta que
    // UPDATEFIELD la refresque.
    date: new Date().toISOString().slice(0, 10),
    variable: context.variables?.get,
  });
  if (value === null)
    return say(
      state.kind === "variable"
        ? `FIELD: este anfitrión no expone la variable «${state.argument}», así que el campo no tendría valor que enseñar.`
        : "FIELD: ese objeto no da la medida pedida — un área necesita algo que encierre, y una longitud algo que recorra.",
    );

  return {
    state: undefined as never,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: [
        {
          type: "insert",
          entity: {
            id: context.newEntityId(),
            type: "mtext",
            insertion: { x: point.x, y: point.y, z: 0 },
            text: value,
            height: TEXT_HEIGHT,
            layer: context.activeLayer,
            context: { metadata: { [CAD_FIELD_METADATA]: cadFormatFieldExpression(expression) } },
          } as never,
        },
      ],
      label: "FIELD",
      notice:
        `FIELD: ${cadFieldLabel(expression.kind)} = ${value}. ` +
        "Se rellena solo: refresque con UPDATEFIELD cuando cambie el dibujo.",
    },
  };
}

const fieldCommand: CadCommandDescriptor<FieldState> = {
  name: "FIELD",
  aliases: ["CAMPO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  // Con UN objeto designado de antemano, el campo ya sabe de qué habla y no lo
  // vuelve a preguntar: es el gesto de «selecciono el local y le pongo su
  // área», y además es el único que se puede recorrer sólo con el teclado.
  begin: (context) =>
    fieldStep({
      kind: null,
      argument: null,
      preselected: context.selection.length === 1 ? context.selection[0] : null,
    }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return say("FIELD cancelado.");
    if (!state.kind) {
      if (input.kind === "enter") return fieldStep({ ...state, kind: "area" });
      if (input.kind !== "keyword") return fieldStep(state);
      const kind = KIND_BY_KEY[initialOf(input.keyword)];
      if (!kind) return fieldStep(state);
      // La fecha no lleva argumento: se salta la pregunta en vez de pedir un
      // dato que no existe. Y si ya había un objeto designado, tampoco se
      // vuelve a pedir.
      const argument =
        kind === "fecha" ? "" : kind === "variable" ? null : (state.preselected ?? null);
      return fieldStep({ ...state, kind, argument });
    }
    if (state.argument === null) {
      if (state.kind === "variable") {
        if (input.kind !== "text" || input.value.trim() === "")
          return say("FIELD necesita el nombre de la variable.");
        return fieldStep({ ...state, argument: input.value.trim().toUpperCase() });
      }
      if (input.kind !== "entityPick") return fieldStep(state);
      return fieldStep({ ...state, argument: input.entityId });
    }
    if (input.kind !== "point") return fieldStep(state);
    return finishField(state, input.point, context);
  },
};

const updateCommand: CadCommandDescriptor<never> = {
  name: "UPDATEFIELD",
  aliases: ["ACTUALIZARCAMPO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    const document = documentOf(context);
    if (!document) return say("UPDATEFIELD necesita leer el dibujo: este anfitrión no lo expone.");
    const update = cadUpdateFields(
      {
        document,
        date: new Date().toISOString().slice(0, 10),
        variable: context.variables?.get,
      },
      // Con algo designado se actualiza SÓLO eso, como en AutoCAD: refrescar
      // trescientos campos para ver uno es un paso de deshacer que nadie quiere.
      context.selection.length > 0 ? context.selection : undefined,
    );
    const total = update.updated.length + update.unchanged + update.unresolved.length;
    if (total === 0) {
      // Distinguir «no hay campos» de «no hay campos ENTRE LO DESIGNADO» no es
      // cosmético: con una selección activa —la que dejó la orden anterior— el
      // primer mensaje es falso y manda al usuario a colocar un campo que ya
      // tiene. Se descubrió tecleando la orden con el local todavía designado.
      const enElDibujo = cadFieldEntities(document).length;
      return say(
        enElDibujo === 0
          ? "No hay ningún campo en el dibujo. Coloque uno con FIELD y se rellenará solo."
          : `Ninguno de los ${context.selection.length} objeto(s) designados es un campo, y el dibujo tiene ${enElDibujo}. Quite la designación para actualizarlos todos.`,
      );
    }

    const partes = [`${update.updated.length} campo(s) actualizado(s)`];
    if (update.unchanged > 0) partes.push(`${update.unchanged} ya al día`);
    if (update.unresolved.length > 0)
      // Los que no se pueden resolver CONSERVAN su valor y se cuentan: un cero
      // silencioso en una tabla de superficies es un error que se imprime.
      partes.push(
        `${update.unresolved.length} sin resolver (conservan su último valor): ${update.unresolved
          .slice(0, 5)
          .map((campo) => campo.expression)
          .join(", ")}`,
      );

    if (update.commands.length === 0) return say(`UPDATEFIELD — ${partes.join(" · ")}.`);
    return {
      state: undefined as never,
      prompt: { message: "", options: [] },
      accepts: 0,
      result: {
        kind: "document",
        commands: update.commands,
        label: "UPDATEFIELD",
        notice: `UPDATEFIELD — ${partes.join(" · ")}.`,
      },
    };
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_DRAWING_FIELD_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(fieldCommand),
  asCadCommand(updateCommand),
];
