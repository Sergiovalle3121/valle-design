/**
 * DIMBASELINE, DIMCONTINUE, DIM y DIMEDIT.
 *
 * ## Encadenar necesita saber cuál fue la cota anterior
 *
 * Y eso NO es del documento: dos personas con el mismo plano abierto tienen cada
 * una su «última cota». Va en `context.session`, que mantiene el anfitrión del
 * motor mirando los lotes que aplica. Cuando no hay ninguna —sesión recién
 * abierta, o la cota se borró— las dos órdenes PIDEN la cota base en vez de
 * fallar, que es lo que hace AutoCAD y la única respuesta honesta.
 *
 * La diferencia entre las dos es de dónde arranca cada eslabón:
 *
 * - `DIMCONTINUE` arranca donde acabó la anterior y conserva su desfase, así que
 *   la cadena queda en una sola línea.
 * - `DIMBASELINE` arranca siempre del MISMO origen y separa cada cota un escalón
 *   más, así que quedan apiladas y legibles. Sin ese escalón se dibujarían todas
 *   encima y la orden no serviría para nada.
 *
 * Ambas emiten UN lote con toda la cadena: acotar seis tramos seguidos es un
 * Ctrl+Z, no seis.
 *
 * ## DIMEDIT dice lo que no puede hacer
 *
 * `Nuevo` e `Inicio` se pueden: uno escribe la sobrescritura del texto y el otro
 * devuelve el texto a su sitio derivado. `Girar` y `Oblicuo` no: el esquema
 * canónico no tiene ni ángulo de texto propio ni ángulo de líneas de referencia,
 * y fingir que se aplicaron sería peor que negarse.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadDimensionEntity } from "../../associative-dimension";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import {
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
import {
  cadCommandCancelled,
  cadCommandRefused,
  cadCommandWrites,
  type CadAssociationReference,
} from "./annotate-support";
import {
  cadAlignedOffset,
  cadDimensionEnds,
  cadDimensionEntity,
  cadDimensionPick,
  cadLinearAxis,
  cadLinearOffset,
} from "./dimension-support";

const DEFAULT_ARROW_SIZE = 180;

function asDimension(entity: CadEntity | undefined): CadDimensionEntity | null {
  return entity?.type === "dimension" ? entity : null;
}

/** Separación entre eslabones de una cadena de línea base. */
function baselineStep(base: CadDimensionEntity): number {
  return (base.arrowSize ?? DEFAULT_ARROW_SIZE) * 2;
}

// ---------------------------------------------------------------------------
// DIMBASELINE y DIMCONTINUE
// ---------------------------------------------------------------------------

interface ChainState {
  baseline: boolean;
  /** La cota de la que cuelga el eslabón siguiente. */
  base: CadDimensionEntity | null;
  commands: CadEntityCommand[];
  /** Cuántos eslabones lleva la cadena; separa las de línea base. */
  links: number;
  pending: "base" | "next";
}

function chainStep(state: ChainState, context: CadCommandContext): CadCommandStep<ChainState> {
  if (state.pending === "base")
    return {
      state,
      prompt: { message: "Designe la cota de la que continuar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: {
      message: "Precise el origen de la línea de referencia siguiente",
      options: [],
      defaultValue: "Enter para terminar",
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
    preview: context.cursor && state.base ? [{ points: [state.base.b, context.cursor] }] : [],
  };
}

/** Punto de arranque del eslabón siguiente, y su anclaje si lo tenía. */
function chainOrigin(state: ChainState): { point: CadPoint2; reference?: CadAssociationReference } {
  const base = state.base!;
  const index = state.baseline ? 0 : 1;
  const point = state.baseline ? base.a : base.b;
  const reference = base.associative ? base.references?.[index] : undefined;
  return { point, ...(reference ? { reference } : {}) };
}

function chainLink(
  state: ChainState,
  target: { point: CadPoint2; reference?: CadAssociationReference },
  context: CadCommandContext,
): CadCommandStep<ChainState> {
  const base = state.base!;
  const origin = chainOrigin(state);
  const kind = base.dimensionKind === "aligned" ? "aligned" : "linear";
  const links = state.links + 1;

  // El desfase: la cadena continua conserva el de la cota base; la de línea base
  // se separa un escalón por eslabón, alejándose SIEMPRE del dibujo (por eso el
  // signo se toma del desfase original y no se supone positivo).
  const baseOffset = base.offset ?? 0;
  const direction = baseOffset >= 0 ? 1 : -1;
  const offset = state.baseline
    ? baseOffset + direction * baselineStep(base) * links
    : baseOffset;

  let entity: CadNativeEntity;
  if (kind === "aligned") {
    // El desfase alineado se HEREDA. Es una proyección sobre la normal del
    // tramo, y cada eslabón tiene su propia normal: recalcularlo desde un punto
    // inventado pondría unas cotas a un lado y otras al otro.
    entity = cadDimensionEntity(
      {
        kind: "aligned",
        a: origin.point,
        b: target.point,
        offset,
        references: [origin.reference, target.reference],
      },
      context,
    );
  } else {
    const axis = base.axis ?? cadLinearAxis(origin.point, target.point, {
      x: origin.point.x,
      y: origin.point.y + offset,
    });
    const projection = axis === "x"
      ? Math.abs(target.point.x - origin.point.x)
      : Math.abs(target.point.y - origin.point.y);
    if (projection < 1e-9)
      return cadCommandRefused(
        state,
        `Ese punto no añade longitud sobre el eje ${axis === "x" ? "X" : "Y"}: la cota mediría cero.`,
      );
    entity = cadDimensionEntity(
      {
        kind: "linear",
        a: origin.point,
        b: target.point,
        axis,
        // El desfase de una cota lineal se mide desde el extremo mayor del eje
        // perpendicular, así que se recalcula sobre los puntos de ESTE eslabón
        // con la misma línea de cota que la base.
        offset: state.baseline
          ? cadLinearOffset(origin.point, target.point, axis, baseLine(base, axis, offset))
          : cadLinearOffset(origin.point, target.point, axis, baseLine(base, axis, baseOffset)),
        references: [origin.reference, target.reference],
      },
      context,
    );
  }

  const next: ChainState = {
    ...state,
    commands: [...state.commands, { type: "insert", entity }],
    links,
    // La cadena continua avanza: el eslabón siguiente arranca donde acabó éste.
    base: state.baseline ? base : ({ ...base, b: target.point, references: base.references } as CadDimensionEntity),
  };
  return chainStep(next, context);
}

/** Dónde cae la línea de cota de la base, para reproducirla en cada eslabón. */
function baseLine(base: CadDimensionEntity, axis: "x" | "y", offset: number): CadPoint2 {
  return axis === "x"
    ? { x: base.a.x, y: Math.max(base.a.y, base.b.y) + offset }
    : { x: Math.max(base.a.x, base.b.x) + offset, y: base.a.y };
}

function chainDescriptor(baseline: boolean): CadCommandDescriptor<ChainState> {
  return {
    name: baseline ? "DIMBASELINE" : "DIMCONTINUE",
    aliases: baseline ? ["DBA"] : ["DCO"],
    kind: "annotate",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin: (context) => {
      const empty: ChainState = { baseline, base: null, commands: [], links: 0, pending: "base" };
      const remembered = context.session?.lastDimensionId;
      const base = remembered ? asDimension(context.entity?.(remembered)) : null;
      // Sólo se encadena desde cotas de longitud: continuar una cota de radio o
      // de ángulo no significa nada, y arrastrarla produciría geometría absurda.
      const usable = base && (base.dimensionKind === "linear" || base.dimensionKind === "aligned");
      return usable
        ? chainStep({ ...empty, base, pending: "next" }, context)
        : chainStep(empty, context);
    },
    step: (state, input, context) => {
      if (input.kind === "cancel") return cadCommandCancelled(state);

      if (state.pending === "base") {
        const entityId =
          input.kind === "entityPick"
            ? input.entityId
            : input.kind === "selection"
              ? input.entityIds[0]
              : null;
        if (!entityId) return input.kind === "enter" ? cadCommandCancelled(state) : chainStep(state, context);
        const base = asDimension(context.entity?.(entityId));
        if (!base)
          return cadCommandRefused(
            state,
            `${baseline ? "DIMBASELINE" : "DIMCONTINUE"} continúa una cota; ` +
              `${(context.entity?.(entityId)?.type ?? "ese objeto").toUpperCase()} no lo es.`,
          );
        if (base.dimensionKind !== "linear" && base.dimensionKind !== "aligned")
          return cadCommandRefused(
            state,
            `No se puede encadenar desde una cota de tipo ${base.dimensionKind}: ` +
              "sólo desde cotas lineales o alineadas.",
          );
        return chainStep({ ...state, base, pending: "next" }, context);
      }

      if (input.kind === "point" || input.kind === "entityPick") {
        const pick = cadDimensionPick(input, context);
        if (!pick) return chainStep(state, context);
        return chainLink(state, pick, context);
      }

      // Enter cierra la cadena entera. UN lote, UN paso de deshacer.
      if (input.kind === "enter")
        return state.commands.length > 0
          ? cadCommandWrites(state, state.commands, baseline ? "DIMBASELINE" : "DIMCONTINUE")
          : cadCommandCancelled(state);

      return chainStep(state, context);
    },
  };
}

// ---------------------------------------------------------------------------
// DIM
// ---------------------------------------------------------------------------

interface SmartState {
  entityId: string | null;
  ends: ReturnType<typeof cadDimensionEnds>;
}

function smartStep(state: SmartState, context: CadCommandContext): CadCommandStep<SmartState> {
  if (!state.entityId)
    return {
      state,
      prompt: { message: "Designe el objeto a acotar", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  return {
    state,
    prompt: { message: "Precise la ubicación de la línea de cota", options: [] },
    accepts: CAD_ACCEPT_POINT,
    preview: state.ends && context.cursor ? [{ points: [state.ends[0].point, state.ends[1].point] }] : [],
  };
}

function smartSelect(entityId: string, context: CadCommandContext): CadCommandStep<SmartState> {
  const empty: SmartState = { entityId: null, ends: null };
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(empty, `No encuentro el objeto ${entityId} en este dibujo.`);

  // Círculo y arco no necesitan segundo paso: la cota es de diámetro o de radio
  // y sale del propio objeto.
  if (entity.type === "circle" || entity.type === "arc") {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const angle = entity.type === "arc" ? entity.startAngle : 0;
    const edge = {
      x: entity.center.x + Math.cos(toRadians(angle)) * entity.radius,
      y: entity.center.y + Math.sin(toRadians(angle)) * entity.radius,
    };
    return cadCommandWrites(
      empty,
      [
        {
          type: "insert",
          entity: cadDimensionEntity(
            {
              kind: entity.type === "circle" ? "diameter" : "radius",
              a: { x: entity.center.x, y: entity.center.y },
              b: edge,
              radius: entity.radius,
              references: [
                { entityId, anchor: "center" },
                { entityId, anchor: "arc-start" },
              ],
            },
            context,
          ),
        },
      ],
      "DIM",
    );
  }

  const ends = cadDimensionEnds(entity);
  if (!ends)
    return cadCommandRefused(
      empty,
      `DIM no sabe qué medir en un ${entity.type.toUpperCase()}. Usa la orden de cota que corresponda.`,
    );
  return smartStep({ entityId, ends }, context);
}

const smartCommand: CadCommandDescriptor<SmartState> = {
  name: "DIM",
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? smartSelect(first, context) : smartStep({ entityId: null, ends: null }, context);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "entityPick" && !state.entityId) return smartSelect(input.entityId, context);
    if (input.kind === "selection" && !state.entityId) {
      const [first] = input.entityIds;
      return first ? smartSelect(first, context) : smartStep(state, context);
    }
    if (input.kind === "point" && state.ends) {
      const [a, b] = state.ends;
      const offset = cadAlignedOffset(a.point, b.point, input.point);
      if (offset === null)
        return cadCommandRefused(state, "El objeto designado tiene longitud cero: no hay nada que medir.");
      return cadCommandWrites(
        state,
        [
          {
            type: "insert",
            entity: cadDimensionEntity(
              {
                kind: "aligned",
                a: a.point,
                b: b.point,
                offset,
                references: [a.reference, b.reference],
              },
              context,
            ),
          },
        ],
        "DIM",
      );
    }
    if (input.kind === "enter") return cadCommandCancelled(state);
    return smartStep(state, context);
  },
};

// ---------------------------------------------------------------------------
// DIMEDIT
// ---------------------------------------------------------------------------

const NEW_TEXT = { keyword: "Nuevo", shortcut: "N" } as const;
const HOME = { keyword: "Inicio", shortcut: "I" } as const;
const ROTATE = { keyword: "Girar", shortcut: "G" } as const;
const OBLIQUE = { keyword: "Oblicuo", shortcut: "O" } as const;

interface EditState {
  mode: "ask" | "text" | "select";
  operation: "new" | "home";
  value: string;
  entityIds: string[];
}

function editStep(state: EditState): CadCommandStep<EditState> {
  if (state.mode === "ask")
    return {
      state,
      prompt: {
        message: "Precise la operación sobre la cota",
        options: [NEW_TEXT, HOME, ROTATE, OBLIQUE],
        defaultOption: HOME.keyword,
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  if (state.mode === "text")
    return {
      state,
      prompt: { message: "Escriba el texto nuevo de la cota", options: [] },
      accepts: CAD_ACCEPT_TEXT,
    };
  return {
    state,
    prompt: {
      message: "Designe las cotas a editar",
      options: [],
      defaultValue: "Enter para aplicar",
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

function editApply(state: EditState, context: CadCommandContext): CadCommandStep<EditState> {
  const commands: CadEntityCommand[] = [];
  for (const entityId of state.entityIds) {
    const dimension = asDimension(context.entity?.(entityId));
    if (!dimension) continue;
    if (state.operation === "new") {
      commands.push({ type: "properties", entityId, patch: { textOverride: state.value } });
      continue;
    }
    // `Inicio` devuelve el texto a su sitio derivado. `properties.write` no sabe
    // BORRAR `textPosition` —sólo escribe campos—, así que se sustituye la
    // entidad conservando su id, su z-order y las referencias que la apuntan.
    if (dimension.textPosition === undefined) continue;
    const { textPosition: _dropped, ...rest } = dimension;
    commands.push({ type: "replace", entityId, entity: rest as CadNativeEntity });
  }
  if (commands.length === 0)
    return cadCommandRefused(state, "Ninguna de las cotas designadas necesitaba ese cambio.");
  return cadCommandWrites(state, commands, "DIMEDIT");
}

const editCommand: CadCommandDescriptor<EditState> = {
  name: "DIMEDIT",
  aliases: ["DED"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    editStep({ mode: "ask", operation: "home", value: "", entityIds: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (input.kind === "keyword") {
      if (input.keyword === NEW_TEXT.keyword) return editStep({ ...state, mode: "text", operation: "new" });
      if (input.keyword === HOME.keyword) return editStep({ ...state, mode: "select", operation: "home" });
      if (input.keyword === ROTATE.keyword || input.keyword === OBLIQUE.keyword)
        return cadCommandRefused(
          state,
          `DIMEDIT ${input.keyword} necesita un ángulo de texto y de líneas de referencia que el ` +
            "esquema canónico todavía no guarda. No se aplica en vez de fingir que sí.",
        );
      return editStep(state);
    }

    if (input.kind === "text" && state.mode === "text")
      return editStep({ ...state, value: input.value.slice(0, 256), mode: "select" });

    if (input.kind === "entityPick" && state.mode === "select")
      return editStep({ ...state, entityIds: [...new Set([...state.entityIds, input.entityId])] });

    if (input.kind === "selection" && state.mode === "select")
      return editStep({ ...state, entityIds: [...new Set([...state.entityIds, ...input.entityIds])] });

    if (input.kind === "enter") {
      if (state.mode === "ask") return editStep({ ...state, mode: "select", operation: "home" });
      if (state.mode === "select" && state.entityIds.length > 0) return editApply(state, context);
      return cadCommandCancelled(state);
    }

    return editStep(state);
  },
};

export const CAD_DIMENSION_CHAIN_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(chainDescriptor(true)),
  asCadCommand(chainDescriptor(false)),
  asCadCommand(smartCommand),
  asCadCommand(editCommand),
];
