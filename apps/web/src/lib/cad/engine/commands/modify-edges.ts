/**
 * TRIM, EXTEND y BREAK como comandos del motor (ola 5, segunda parte).
 *
 * Los tres tienen su geometría en `geom-trim.ts`, probada y verde, y ninguno se
 * podía teclear: `TR`, `EX` y `BR` no resolvían a nada. TRIM y EXTEND se
 * alcanzaban desde controles del panel derecho; BREAK **no se alcanzaba desde
 * ningún sitio** — código correcto, probado y muerto.
 *
 * ## La forma de la orden, que es la mitad de la función
 *
 * En AutoCAD estos comandos son de dos fases: primero se designan los BORDES
 * (`Enter` para tomarlos todos), después se van designando los objetos a
 * recortar, uno tras otro, sin salir de la orden. Esa segunda fase repetitiva
 * es lo que hace la orden útil: recortar quince líneas contra un muro son
 * quince clics, no quince invocaciones.
 *
 * Aquí se implementa esa forma. El comando **acumula** los recortes y los emite
 * como UN lote al terminar, así que las quince líneas son un solo paso de
 * deshacer — que es lo que espera quien luego pulsa Ctrl+Z una vez.
 *
 * ## Alcance
 *
 * TRIM y EXTEND aceptan LINE, ARC, CIRCLE, ELLIPSE y POLYLINE, como objeto y
 * como borde. La regla es una sola —conservar el tramo entre los cortes vecinos
 * al clic— y vive en `curve-edit.ts`, escrita sobre el parámetro de
 * `curve-model.ts`; aquí sólo se recoge la designación y se emite el lote. Lo
 * que ese módulo no sabe convertir (hoy, SPLINE) se rechaza nombrándolo en vez
 * de aproximarlo por su poligonal, que cortaría en el sitio equivocado.
 *
 * BREAK sigue admitiendo sólo LINE. Su geometría es la de `geom-trim.ts`, que
 * trabaja sobre segmentos, y generalizarla es un cambio con su propia decisión
 * —partir un círculo por un punto no produce dos trozos— que no se disimula
 * aceptando la designación para después no hacer nada.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import {
  asCadEditableEntity,
  computeCadCurveExtend,
  computeCadCurveTrim,
  type CadCurveEditOutcome,
  type CadEditableEntity,
} from "../../curve-edit";
import { breakSegment } from "../../geom-trim";
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type CadLineEntity = Extract<CadEntity, { type: "line" }>;

const ALL_EDGES = { keyword: "Todos", shortcut: "T" } as const;

function asLine(entity: CadEntity | undefined): CadLineEntity | null {
  return entity && entity.type === "line" ? entity : null;
}

function flat(point: CadPoint2) {
  return { x: point.x, y: point.y, z: 0 };
}

/** Coordenadas de un segmento como par de puntos planos. */
function ends(line: CadLineEntity): { a: CadPoint2; b: CadPoint2 } {
  return { a: { x: line.start.x, y: line.start.y }, b: { x: line.end.x, y: line.end.y } };
}

function segmentPatch(segment: { a: CadPoint2; b: CadPoint2 }) {
  return {
    startX: segment.a.x,
    startY: segment.a.y,
    endX: segment.b.x,
    endY: segment.b.y,
  };
}

interface EdgeState {
  /** Bordes designados. Vacío + `Todos` = todas las líneas del dibujo. */
  edges: string[];
  /** Los bordes ya están cerrados y se está en la fase de recortar. */
  cutting: boolean;
  /** Comandos acumulados de esta invocación. */
  commands: CadEntityCommand[];
  /** Lo que ya se tocó, para poder informar al terminar. */
  touched: number;
  /** Objetos designados que no se pudieron tratar, con su motivo. */
  refusals: string[];
}

const EMPTY: EdgeState = { edges: [], cutting: false, commands: [], touched: 0, refusals: [] };

type EdgeOperation = "TRIM" | "EXTEND";

function edgeStep(state: EdgeState, operation: EdgeOperation): CadCommandStep<EdgeState> {
  if (!state.cutting)
    return {
      state,
      prompt: {
        message:
          operation === "TRIM"
            ? "Designe los bordes de corte"
            : "Designe los bordes de contorno",
        options: [ALL_EDGES],
        defaultOption: ALL_EDGES.keyword,
      },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message:
        operation === "TRIM"
          ? "Designe el objeto a recortar"
          : "Designe el objeto a alargar",
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT,
  };
}

/**
 * Cierre del comando.
 *
 * Si hubo rechazos se cuentan en el mensaje aunque también haya habido
 * recortes: un TRIM que trata ocho de doce objetos y no lo dice deja creyendo
 * que trató los doce.
 */
function edgeFinish(state: EdgeState, operation: EdgeOperation): CadCommandStep<EdgeState> {
  if (state.commands.length === 0)
    return {
      state: EMPTY,
      prompt: { message: "", options: [] },
      accepts: 0,
      result:
        state.refusals.length > 0
          ? { kind: "message", text: `${operation}: ${state.refusals.join(" ")}` }
          : { kind: "none" },
    };
  return {
    state: EMPTY,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands: state.commands, label: operation },
  };
}

/**
 * Bordes efectivos: los designados, o TODO el dibujo si se pidió `Todos`.
 *
 * Ya no se filtra a líneas. `curve-edit.ts` descarta por su cuenta lo que no
 * sabe convertir, así que un arco o una polilínea del dibujo cortan igual que
 * una línea sin que este comando tenga que saberlo.
 */
function edgeEntities(state: EdgeState, context: CadCommandContext): CadEntity[] {
  const ids = state.edges.length > 0 ? state.edges : context.entityIds;
  return ids
    .map((id) => context.entity?.(id))
    .filter((entity): entity is CadEntity => !!entity);
}

/**
 * El cambio calculado, ya como comandos de entidad. Puede ser más de uno: un
 * TRIM por el medio edita la mitad inicial Y crea la segunda mitad.
 */
function editCommands(entityId: string, outcome: CadCurveEditOutcome): CadEntityCommand[] {
  if ("error" in outcome) return [];
  const commands: CadEntityCommand[] = [];
  if (outcome.replace) commands.push({ type: "replace", entityId, entity: outcome.replace });
  else if (outcome.patch) commands.push({ type: "properties", entityId, patch: outcome.patch });
  if (commands.length > 0 && outcome.create)
    commands.push({ type: "insert", entity: outcome.create });
  return commands;
}

function edgeCommand(
  operation: EdgeOperation,
  name: string,
  aliases: readonly string[],
): CadCommandDescriptor<EdgeState> {
  return {
    name,
    aliases,
    kind: "modify",
    transparent: false,
    selection: "command-first",
    repeatable: true,
    mutates: true,
    cursor: "pick",
    begin: () => edgeStep(EMPTY, operation),
    step: (state, input, context) => {
      if (input.kind === "cancel") return edgeFinish({ ...state, commands: [] }, operation);

      // Enter cierra la fase actual: la primera vez pasa a recortar (con todos
      // los bordes si no se designó ninguno), la segunda termina.
      if (input.kind === "enter")
        return state.cutting
          ? edgeFinish(state, operation)
          : edgeStep({ ...state, cutting: true }, operation);

      if (input.kind === "keyword" && input.keyword === ALL_EDGES.keyword)
        return edgeStep({ ...state, edges: [], cutting: true }, operation);

      const picked =
        input.kind === "entityPick"
          ? [input.entityId]
          : input.kind === "selection"
            ? [...input.entityIds]
            : null;

      if (!state.cutting) {
        if (!picked) return edgeStep(state, operation);
        return edgeStep(
          { ...state, edges: [...new Set([...state.edges, ...picked])] },
          operation,
        );
      }

      if (!picked || picked.length === 0) return edgeStep(state, operation);
      const targetId = picked[0];
      const found = context.entity?.(targetId);
      const target: CadEditableEntity | null = asCadEditableEntity(found);
      if (!target)
        return edgeStep(
          {
            ...state,
            refusals: [
              ...state.refusals,
              found
                ? `${found.type.toUpperCase()} todavía no se puede tratar.`
                : `${targetId} ya no existe.`,
            ],
          },
          operation,
        );

      // El punto de designación decide QUÉ TROZO se conserva en TRIM y QUÉ
      // EXTREMO se estira en EXTEND. Sin él no hay forma de saber a qué lado
      // del cruce apuntaba el usuario, y elegir por nuestra cuenta cambiaría la
      // mitad equivocada. Sin punto se toma el arranque del objeto, que es el
      // comportamiento que ya tenía la designación por selección.
      const pick =
        input.kind === "entityPick" ? input.point : entityAnchor(target);

      const payload = {
        target,
        boundaries: edgeEntities(state, context),
        pick,
        // Un TRIM por el medio parte el objeto: la segunda mitad necesita id.
        newEntityId: context.newEntityId,
      };
      const outcome =
        operation === "TRIM" ? computeCadCurveTrim(payload) : computeCadCurveExtend(payload);
      const produced = editCommands(target.id, outcome);
      if (produced.length === 0)
        return edgeStep(
          {
            ...state,
            refusals: [
              ...state.refusals,
              `${target.id} ${"error" in outcome ? outcome.error : "no cambió."}`,
            ],
          },
          operation,
        );

      return edgeStep(
        { ...state, touched: state.touched + 1, commands: [...state.commands, ...produced] },
        operation,
      );
    },
  };
}

/** Punto de referencia cuando se designa sin pinchar: el arranque del objeto. */
function entityAnchor(entity: CadEditableEntity): CadPoint2 {
  if (entity.type === "line") return { x: entity.start.x, y: entity.start.y };
  if (entity.type === "polyline")
    return entity.vertices.length > 0
      ? { x: entity.vertices[0].x, y: entity.vertices[0].y }
      : { x: 0, y: 0 };
  return { x: entity.center.x, y: entity.center.y };
}

// ---------------------------------------------------------------------------
// BREAK
// ---------------------------------------------------------------------------

interface BreakState {
  entityId: string | null;
  first: CadPoint2 | null;
}

/**
 * BREAK parte una línea en dos.
 *
 * El trozo original conserva su id —y con él su posición en el orden de dibujo,
 * sus cotas asociativas y sus sombreados—; el segundo trozo es una entidad
 * nueva. Resolverlo como borrar y crear dos rompería todo lo que apunta a la
 * entidad original, que es exactamente lo que `replace` existe para evitar.
 */
const breakCommand: CadCommandDescriptor<BreakState> = {
  name: "BREAK",
  aliases: ["BR"],
  kind: "modify",
  transparent: false,
  selection: "command-first",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: { entityId: null, first: null },
    prompt: { message: "Designe el objeto a partir", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  }),
  step: (state, input, context) => {
    const done = (result: CadCommandStep<BreakState>["result"]): CadCommandStep<BreakState> => ({
      state: { entityId: null, first: null },
      prompt: { message: "", options: [] },
      accepts: 0,
      result,
    });
    if (input.kind === "cancel" || input.kind === "enter") return done({ kind: "none" });

    if (!state.entityId) {
      const id =
        input.kind === "entityPick"
          ? input.entityId
          : input.kind === "selection"
            ? input.entityIds[0]
            : null;
      if (!id)
        return {
          state,
          prompt: { message: "Designe el objeto a partir", options: [] },
          accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
        };
      const line = asLine(context.entity?.(id));
      if (!line) {
        const found = context.entity?.(id);
        return done({
          kind: "message",
          text: `BREAK: sólo se admite LINE por ahora; se designó ${found ? found.type.toUpperCase() : "una entidad inexistente"}.`,
        });
      }
      return {
        state: { entityId: id, first: null },
        prompt: { message: "Precise el punto de partición", options: [] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
      };
    }

    const at =
      input.kind === "point"
        ? input.point
        : input.kind === "entityPick"
          ? input.point
          : null;
    if (!at)
      return {
        state,
        prompt: { message: "Precise el punto de partición", options: [] },
        accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_ENTITY_PICK,
      };

    const line = asLine(context.entity?.(state.entityId));
    if (!line) return done({ kind: "message", text: "BREAK: la entidad ya no existe." });
    const segment = ends(line);
    const halves = breakSegment(segment.a, segment.b, at);
    if (!halves)
      return done({
        kind: "message",
        text: "BREAK: el punto cae en un extremo; no habría dos tramos.",
      });

    const [first, second] = halves;
    return done({
      kind: "document",
      commands: [
        { type: "properties", entityId: line.id, patch: segmentPatch(first) },
        {
          type: "insert",
          entity: {
            id: context.newEntityId(),
            type: "line",
            start: flat(second.a),
            end: flat(second.b),
            layer: line.layer,
          },
        },
      ],
      label: "BREAK",
    });
  },
};

export const CAD_MODIFY_EDGE_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(edgeCommand("TRIM", "TRIM", ["TR"])),
  asCadCommand(edgeCommand("EXTEND", "EXTEND", ["EX"])),
  asCadCommand(breakCommand),
];
