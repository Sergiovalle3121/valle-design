/**
 * ALIGN y MATCHPROP.
 *
 * Dos órdenes de las que se usan a diario y que no existían por ningún camino:
 * `AL` y `MA` no resolvían a nada.
 *
 * ## ALIGN es mover, girar y (si se pide) escalar de una vez
 *
 * Se dan parejas de puntos: de dónde sale y a dónde va. Con UNA pareja es una
 * traslación. Con DOS, además, un giro — y opcionalmente una escala, que es lo
 * que permite encajar un símbolo dibujado a otro tamaño entre dos referencias
 * existentes sin medir nada a mano.
 *
 * Todo sale como UNA transformada por objeto: `origin` en el primer punto de
 * origen, el giro y la escala alrededor de él, y la traslación que lleva ese
 * punto a su destino. Encadenar un MOVE y luego un ROTATE daría el mismo dibujo
 * pero DOS pasos de deshacer y dos redondeos.
 *
 * ## MATCHPROP copia lo que se ve, y sólo lo que se pide
 *
 * En AutoCAD hay un cuadro donde se marca qué propiedades se copian. Aquí ese
 * cuadro son palabras clave que encienden y apagan cada grupo antes de
 * designar los destinos: `Capa`, `Color`, `TipoLínea`, `Grosor` y `Todo`. Sin
 * ellas, MATCHPROP sería «copia todo», que es justo lo que un dibujante NO
 * quiere cuando arrastra el color de una cota a un muro.
 *
 * La capa viaja por `properties` y el resto por `presentation`, porque la
 * presentación EXPLÍCITA de una entidad (su color propio frente al heredado de
 * la capa) vive en el contexto y ningún adaptador la expone como propiedad.
 */
import type { CadEntityPresentation, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

// ---------------------------------------------------------------------------
// ALIGN
// ---------------------------------------------------------------------------

const SCALE_OPTION = { keyword: "Escalar", shortcut: "E" } as const;

interface AlignState {
  targets: readonly string[];
  /**
   * Se sigue designando. Designar es una fase, no un input: un dibujante añade
   * objetos de uno en uno y luego pulsa Enter. Terminar la designación con el
   * PRIMER clic —que es lo que sale si no se modela la fase— haría que ALIGN
   * sólo pudiera alinear un objeto.
   */
  selecting: boolean;
  pairs: { from: CadPoint2; to: CadPoint2 }[];
  /** Punto de origen ya dado, esperando su destino. */
  pendingFrom: CadPoint2 | null;
  scale: boolean;
}

const EMPTY_ALIGN: AlignState = {
  targets: [],
  selecting: true,
  pairs: [],
  pendingFrom: null,
  scale: false,
};

function alignStep(state: AlignState): CadCommandStep<AlignState> {
  if (state.selecting)
    return {
      state,
      prompt: { message: "Designe objetos", options: [] },
      accepts: CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
    };
  const index = state.pairs.length + 1;
  if (state.pendingFrom)
    return {
      state,
      prompt: { message: `Precise el ${index}.º punto de destino`, options: [] },
      accepts: CAD_ACCEPT_POINT,
    };
  return {
    state,
    prompt: {
      message: `Precise el ${index}.º punto de origen`,
      options: state.pairs.length === 2 ? [] : [SCALE_OPTION],
      // Enter cierra la lista de parejas: con una alinea trasladando, con dos
      // trasladando y girando.
      defaultOption: state.pairs.length > 0 ? "" : undefined,
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

function alignFinish(
  state: AlignState,
  commands: CadEntityCommand[],
): CadCommandStep<AlignState> {
  return {
    state: EMPTY_ALIGN,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: commands.length > 0 ? { kind: "document", commands, label: "ALIGN" } : { kind: "none" },
  };
}

function alignRefuse(text: string): CadCommandStep<AlignState> {
  return {
    state: EMPTY_ALIGN,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

const angleBetween = (from: CadPoint2, to: CadPoint2) =>
  (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
const lengthBetween = (from: CadPoint2, to: CadPoint2) => Math.hypot(to.x - from.x, to.y - from.y);

/**
 * La transformada que lleva las parejas a su sitio.
 *
 * Con una pareja, traslación pura. Con dos, giro alrededor del primer punto de
 * origen —y escala si se pidió— más la traslación que lo lleva a su destino.
 * La tercera pareja de AutoCAD es 3D y este espacio es plano: se rechaza en vez
 * de ignorarla, que dejaría creyendo que se usó.
 */
function alignTransform(state: AlignState):
  | { transform: { translation: CadPoint2; rotationDeg?: number; scale?: number; origin: CadPoint2 } }
  | { error: string } {
  const [first, second] = state.pairs;
  if (!first) return { error: "hacen falta al menos una pareja de puntos." };
  const translation = { x: first.to.x - first.from.x, y: first.to.y - first.from.y };
  if (!second) return { transform: { translation, origin: first.from } };

  const sourceLength = lengthBetween(first.from, second.from);
  if (!(sourceLength > 1e-9))
    return { error: "los dos puntos de origen coinciden: no definen ninguna dirección." };
  const destinationLength = lengthBetween(first.to, second.to);
  if (!(destinationLength > 1e-9))
    return { error: "los dos puntos de destino coinciden: no definen ninguna dirección." };

  const rotationDeg =
    angleBetween(first.to, second.to) - angleBetween(first.from, second.from);
  const scale = state.scale ? destinationLength / sourceLength : undefined;
  return {
    transform: {
      translation,
      origin: first.from,
      ...(Math.abs(rotationDeg % 360) > 1e-12 ? { rotationDeg } : {}),
      ...(scale !== undefined && Math.abs(scale - 1) > 1e-12 ? { scale } : {}),
    },
  };
}

function alignAdvance(
  state: AlignState,
  input: Parameters<CadCommandDescriptor<AlignState>["step"]>[1],
): CadCommandStep<AlignState> {
    if (input.kind === "cancel") return alignFinish(state, []);

    if (state.selecting) {
      if (input.kind === "selection")
        return alignStep({ ...state, targets: [...new Set([...state.targets, ...input.entityIds])] });
      if (input.kind === "entityPick")
        return alignStep({ ...state, targets: [...new Set([...state.targets, input.entityId])] });
      if (state.targets.length === 0) {
        if (input.kind === "enter") return alignRefuse("ALIGN necesita al menos un objeto designado.");
        return alignStep(state);
      }
      // Cualquier otra entrada cierra la designación. Enter la cierra y ya
      // está; un punto la cierra y ADEMÁS cuenta como el primer punto, que es
      // lo que hace que teclear coordenadas seguidas funcione.
      const closed = { ...state, selecting: false };
      return input.kind === "enter" ? alignStep(closed) : alignAdvance(closed, input);
    }

    if (input.kind === "keyword" && input.keyword === SCALE_OPTION.keyword)
      return alignStep({ ...state, scale: true });

    if (input.kind === "enter") {
      if (state.pairs.length === 0)
        return alignRefuse("ALIGN necesita al menos una pareja de puntos.");
      const resolved = alignTransform(state);
      if ("error" in resolved) return alignRefuse(`ALIGN: ${resolved.error}`);
      return alignFinish(
        state,
        state.targets.map((entityId) => ({
          type: "transform",
          entityId,
          transform: resolved.transform,
        })),
      );
    }

    if (input.kind !== "point") return alignStep(state);

    if (!state.pendingFrom) {
      if (state.pairs.length >= 2)
        return alignRefuse("ALIGN sólo usa dos parejas de puntos: la tercera es 3D y este espacio es plano.");
      return alignStep({ ...state, pendingFrom: input.point });
    }

    const pairs = [...state.pairs, { from: state.pendingFrom, to: input.point }];
    const next: AlignState = { ...state, pairs, pendingFrom: null };
    // Con dos parejas la alineación ya está determinada: se cierra sola, como
    // en AutoCAD, en vez de pedir una tercera que no se podría usar.
    if (pairs.length < 2) return alignStep(next);
    const resolved = alignTransform(next);
    if ("error" in resolved) return alignRefuse(`ALIGN: ${resolved.error}`);
    return alignFinish(
      next,
      next.targets.map((entityId) => ({
        type: "transform",
        entityId,
        transform: resolved.transform,
      })),
    );
}

const alignCommand: CadCommandDescriptor<AlignState> = {
  name: "ALIGN",
  aliases: ["AL"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    alignStep({
      ...EMPTY_ALIGN,
      targets: context.selection,
      selecting: context.selection.length === 0,
    }),
  step: (state, input) => alignAdvance(state, input),
};

// ---------------------------------------------------------------------------
// MATCHPROP
// ---------------------------------------------------------------------------

const MATCH_GROUPS = {
  layer: { keyword: "Capa", shortcut: "C" },
  color: { keyword: "Color", shortcut: "CO" },
  linetype: { keyword: "TipoLínea", shortcut: "T" },
  lineweight: { keyword: "Grosor", shortcut: "G" },
} as const;
const MATCH_ALL = { keyword: "Todo", shortcut: "TO" } as const;

type MatchGroup = keyof typeof MATCH_GROUPS;

interface MatchState {
  sourceId: string | null;
  groups: Record<MatchGroup, boolean>;
  commands: CadEntityCommand[];
  refusals: string[];
}

const ALL_GROUPS: Record<MatchGroup, boolean> = {
  layer: true,
  color: true,
  linetype: true,
  lineweight: true,
};

const EMPTY_MATCH: MatchState = {
  sourceId: null,
  groups: { ...ALL_GROUPS },
  commands: [],
  refusals: [],
};

function matchStep(state: MatchState): CadCommandStep<MatchState> {
  if (!state.sourceId)
    return {
      state,
      prompt: { message: "Designe el objeto de origen", options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
    };
  const active = (Object.keys(MATCH_GROUPS) as MatchGroup[])
    .filter((group) => state.groups[group])
    .map((group) => MATCH_GROUPS[group].keyword);
  return {
    state,
    prompt: {
      message: `Copiando ${active.length > 0 ? active.join(", ") : "nada"}. Designe los objetos de destino`,
      options: [...Object.values(MATCH_GROUPS), MATCH_ALL],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
  };
}

/** Sólo los grupos pedidos sobreviven al filtro. Lo demás no se toca. */
function filteredPresentation(
  source: CadEntityPresentation | undefined,
  groups: Record<MatchGroup, boolean>,
  target: CadEntityPresentation | undefined,
): CadEntityPresentation | null {
  const next: CadEntityPresentation = { ...(target ?? {}) };
  // Que el origen NO tenga color explícito también es información: significa
  // PorCapa, y copiarlo debe QUITAR el color explícito del destino. Dejarlo
  // haría que MATCHPROP no pudiera devolver nada a PorCapa nunca. Los tres
  // campos se escriben uno a uno porque cada uno tiene su forma —el tipo de
  // línea lleva escala y el grosor un número— y un bucle genérico los mezcla.
  if (groups.color) {
    if (source?.color === undefined) delete next.color;
    else next.color = { ...source.color };
  }
  if (groups.linetype) {
    if (source?.linetype === undefined) delete next.linetype;
    else next.linetype = { ...source.linetype };
  }
  if (groups.lineweight) {
    if (source?.lineweight === undefined) delete next.lineweight;
    else next.lineweight = { ...source.lineweight };
  }
  return Object.keys(next).length === 0 ? null : next;
}

const matchCommand: CadCommandDescriptor<MatchState> = {
  name: "MATCHPROP",
  aliases: ["MA"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => matchStep(EMPTY_MATCH),
  step: (state, input, context) => {
    const done = (): CadCommandStep<MatchState> => ({
      state: EMPTY_MATCH,
      prompt: { message: "", options: [] },
      accepts: 0,
      result:
        state.commands.length > 0
          ? { kind: "document", commands: state.commands, label: "MATCHPROP" }
          : state.refusals.length > 0
            ? { kind: "message", text: `MATCHPROP: ${state.refusals.join(" ")}` }
            : { kind: "none" },
    });
    if (input.kind === "cancel")
      return { state: EMPTY_MATCH, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
    if (input.kind === "enter") return done();

    if (input.kind === "keyword") {
      if (input.keyword === MATCH_ALL.keyword)
        return matchStep({ ...state, groups: { ...ALL_GROUPS } });
      const group = (Object.keys(MATCH_GROUPS) as MatchGroup[]).find(
        (key) => MATCH_GROUPS[key].keyword === input.keyword,
      );
      if (!group) return matchStep(state);
      return matchStep({ ...state, groups: { ...state.groups, [group]: !state.groups[group] } });
    }

    const picked =
      input.kind === "entityPick"
        ? [input.entityId]
        : input.kind === "selection"
          ? [...input.entityIds]
          : null;
    if (!picked || picked.length === 0) return matchStep(state);

    if (!state.sourceId) {
      if (!context.entity?.(picked[0]))
        return {
          state: EMPTY_MATCH,
          prompt: { message: "", options: [] },
          accepts: 0,
          result: { kind: "message", text: `MATCHPROP: ${picked[0]} no existe.` },
        };
      return matchStep({ ...state, sourceId: picked[0] });
    }

    const source = context.entity?.(state.sourceId);
    if (!source)
      return {
        state: EMPTY_MATCH,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "message", text: "MATCHPROP: el objeto de origen ya no existe." },
      };

    const commands = [...state.commands];
    const refusals = [...state.refusals];
    for (const entityId of picked) {
      if (entityId === source.id) continue;
      const target = context.entity?.(entityId);
      if (!target) {
        refusals.push(`${entityId} ya no existe.`);
        continue;
      }
      if (state.groups.layer && target.layer !== source.layer)
        commands.push({ type: "properties", entityId, patch: { layer: source.layer } });
      if (state.groups.color || state.groups.linetype || state.groups.lineweight)
        commands.push({
          type: "presentation",
          entityId,
          presentation: filteredPresentation(
            source.context?.presentation,
            state.groups,
            target.context?.presentation,
          ),
        });
    }
    // MATCHPROP es repetitivo: se siguen designando destinos hasta aceptar.
    return matchStep({ ...state, commands, refusals });
  },
};

export const CAD_MODIFY_ALIGN_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(alignCommand),
  asCadCommand(matchCommand),
];
