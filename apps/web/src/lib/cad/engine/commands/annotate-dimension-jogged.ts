/**
 * DIMJOGGED — cota de radio con quiebre.
 *
 * ## Para qué existe, y por qué DIMRADIUS no basta
 *
 * DIMRADIUS dibuja una línea recta del borde del arco al centro. Eso es
 * exactamente lo que no cabe en el plano cuando el arco es grande y su centro
 * cae fuera de la lámina — un pórtico, una curva de vialidad, el borde de una
 * cubierta— y es la queja concreta que abrió esta ola: «se parece a AutoCAD»
 * empieza por poder acotar lo que un arquitecto acota TODOS los días.
 *
 * La salida de AutoCAD es DIMJOGGED: en vez del centro real se marca un punto
 * CERCA del arco que hace de centro «como si», la línea de referencia llega
 * hasta ÉL en vez de hasta el centro de verdad, y un quiebre en zigzag deja
 * claro que es un atajo dibujado, no la distancia real. La MEDIDA que se lee
 * en el rótulo sigue siendo el radio real —`buildCadDimensionGeometry` lo
 * calcula de los dos puntos de definición, igual que DIMRADIUS—; lo único que
 * cambia es hasta dónde llega el trazo.
 *
 * ## Los tres puntos que pide, en el orden de AutoCAD
 *
 * 1. El arco o círculo (por dónde se pincha decide el borde, igual que
 *    DIMRADIUS).
 * 2. «Especifique la ubicación del centro sustituto» — `jogCenterOverride`.
 * 3. «Especifique la ubicación de la línea de cota» — el `offset` no aplica
 *    aquí (no hay línea de cota separada, es la propia línea de referencia),
 *    así que este punto pasa a marcar dónde va el quiebre: `jogPosition`, que
 *    la geometría PROYECTA sobre la línea entre el borde y el centro
 *    sustituto — un punto sacado de esa línea no tendría a qué recta partir.
 *
 * `jogAngle` no se pregunta: queda en 45°, el valor de fábrica de DIMJOGANG.
 * Añadir un cuarto paso por un ángulo que casi nadie cambia habría sido
 * pedirle al usuario una decisión que AutoCAD tampoco le pide en el flujo
 * normal — se ajusta después con las propiedades del objeto, si hace falta.
 */
import {
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
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
  cadDistance,
  cadEntityAnchorCandidates,
  type CadAssociationAnchor,
} from "./annotate-support";
import { cadDimensionEntity } from "./dimension-support";
import type { CadPoint2 } from "../../cad-document";
import type { CadNativeEntity } from "../../entity-runtime";

type Pending = "target" | "override" | "jog";

interface JoggedState {
  pending: Pending;
  entityId: string | null;
  edge: { point: CadPoint2; anchor: CadAssociationAnchor } | null;
  center: CadPoint2 | null;
  radius: number | null;
  override: CadPoint2 | null;
}

const EMPTY: JoggedState = { pending: "target", entityId: null, edge: null, center: null, radius: null, override: null };

const PROMPTS: Readonly<Record<Pending, string>> = {
  target: "Designe el círculo o arco cuyo radio se acota con quiebre",
  override: "Precise la ubicación del centro sustituto",
  jog: "Precise por dónde pasa el quiebre",
};

function joggedStep(state: JoggedState): CadCommandStep<JoggedState> {
  return {
    state,
    prompt: { message: PROMPTS[state.pending], options: [] },
    accepts: state.pending === "target" ? CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION : CAD_ACCEPT_POINT,
  };
}

function selectTarget(state: JoggedState, entityId: string, at: CadPoint2 | null, context: CadCommandContext): CadCommandStep<JoggedState> {
  const entity = context.entity?.(entityId);
  if (!entity) return cadCommandRefused(state, `No encuentro el objeto ${entityId} en este dibujo.`);
  if (entity.type !== "circle" && entity.type !== "arc")
    return cadCommandRefused(state, `DIMJOGGED acota CIRCLE y ARC; ${entity.type.toUpperCase()} no tiene radio.`);
  if (!(entity.radius > 1e-9)) return cadCommandRefused(state, "El radio es cero: no hay nada que acotar.");

  const candidates = cadEntityAnchorCandidates(entity);
  const center = candidates.find((candidate) => candidate.anchor === "center");
  const edges = candidates.filter(
    (candidate) => candidate.anchor === "arc-start" || candidate.anchor === "arc-end",
  );
  if (!center || edges.length === 0) return cadCommandRefused(state, "No se pueden resolver los anclajes de ese objeto.");
  const edge = at
    ? edges.reduce((best, candidate) => (cadDistance(candidate.point, at) < cadDistance(best.point, at) ? candidate : best))
    : edges[0];

  return joggedStep({
    ...state,
    pending: "override",
    entityId,
    edge: { point: edge.point, anchor: edge.anchor },
    center: center.point,
    radius: entity.radius,
  });
}

function finish(state: JoggedState, jogPosition: CadPoint2, context: CadCommandContext): CadCommandStep<JoggedState> {
  if (!state.entityId || !state.edge || !state.center || state.radius === null || !state.override) return joggedStep(state);
  const entity = cadDimensionEntity(
    {
      kind: "radius",
      a: state.center,
      b: state.edge.point,
      radius: state.radius,
      references: [
        { entityId: state.entityId, anchor: "center" },
        { entityId: state.entityId, anchor: state.edge.anchor },
      ],
    },
    context,
  ) as Extract<CadNativeEntity, { type: "dimension" }>;
  return cadCommandWrites(
    state,
    [
      {
        type: "insert",
        entity: { ...entity, jogCenterOverride: state.override, jogPosition },
      },
    ],
    "DIMJOGGED",
  );
}

const joggedCommand: CadCommandDescriptor<JoggedState> = {
  name: "DIMJOGGED",
  // Sin alias: acad.pgp de fábrica no le da uno a DIMJOGGED (a diferencia de
  // DBA/DCO/DED, que sí son de las tres letras clásicas) — inventarse uno
  // sería fingir una compatibilidad que no existe.
  aliases: [],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const [first] = context.selection;
    return first ? selectTarget(EMPTY, first, null, context) : joggedStep(EMPTY);
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    if (state.pending === "target") {
      if (input.kind === "entityPick") return selectTarget(state, input.entityId, input.point, context);
      if (input.kind === "selection") {
        const [first] = input.entityIds;
        return first ? selectTarget(state, first, null, context) : joggedStep(state);
      }
      if (input.kind === "enter") return cadCommandCancelled(state);
      return joggedStep(state);
    }

    if (state.pending === "override") {
      if (input.kind !== "point") return joggedStep(state);
      return joggedStep({ ...state, pending: "jog", override: input.point });
    }

    // state.pending === "jog"
    if (input.kind !== "point") return joggedStep(state);
    return finish(state, input.point, context);
  },
};

export const CAD_DIMENSION_JOGGED_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(joggedCommand)];
