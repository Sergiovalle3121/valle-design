/**
 * PRESSPULL sobre una CARA — el gesto que separa un modelador de un visor.
 *
 * ## Qué cambia respecto a lo que había
 *
 * Hasta hoy `solids-create.ts` declaraba este límite con todas sus letras:
 * *«En AutoCAD, PRESSPULL empuja también la CARA de un sólido existente. Eso
 * exige poder designar una cara, y el viewport 2D designa entidades, no
 * caras»*. Ya se puede: `lib/cad/pick3d/face-ray.ts` resuelve el rayo de cámara
 * contra las caras teseladas, y `CAD_ACCEPT_FACE_PICK` deja que el motor pida
 * una. Este módulo es la mitad que faltaba: qué hacer con la cara designada.
 *
 * ## Por qué un comando aparte y no una rama dentro de EXTRUDE
 *
 * Empujar una cara y extruir un contorno se parecen en el resultado y en nada
 * más. La extrusión CREA un sólido a partir de un dibujo plano y borra el
 * perfil; el empujón MODIFICA uno que ya existe y no borra nada. Meterlos en la
 * misma máquina obligaría a que cada paso preguntara en cuál de los dos mundos
 * está, y `solids-create.ts` ya gasta sus líneas en lo suyo.
 *
 * Quien decide es el primer gesto del usuario, no una opción tecleada: si
 * designa una cara, empuja; si designa contornos, extruye. Es como se comporta
 * AutoCAD y no hay que explicárselo a nadie.
 *
 * ## Lo que se persiste, y por qué NO es una malla
 *
 * El empujón entra al documento como un nodo `push` del árbol de historia, con
 * la HUELLA de la cara (`CadSolidFaceRef`) y la distancia. No se hornea el
 * resultado, y eso no es una preferencia estética:
 *
 * - un sólido horneado escribe TODOS sus vértices en CADA guardado CAS, y el
 *   tope del servidor son 200 000 puntos por cuerpo;
 * - y hornear tira la reeditabilidad, que es LA decisión del esquema 5.
 *
 * A cambio se gana algo que SketchUp no tiene: si empujaste 30 cm y te
 * equivocaste, no deshaces — cambias el 30 en propiedades y el sólido se
 * reconstruye.
 *
 * ## La dirección del empujón
 *
 * Positiva HACIA FUERA, siguiendo la normal de la cara. Es la convención de
 * AutoCAD y la única que no obliga a pensar: se arrastra hacia donde crece.
 * Un valor negativo hunde la cara, y si el hundimiento atraviesa el sólido el
 * kernel lo rechaza NOMBRÁNDOLO (`cadPushFace` devuelve su motivo) en vez de
 * producir un cuerpo con las caras del revés.
 */
import type { CadEntityCommand } from "../../entity-commands";
import type { CadSolid3dEntity, CadSolidFaceRef, CadSolidNode } from "../../cad-entities-v5";
import {
  asCadCommand,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_FACE_PICK,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadAnyCommandDescriptor,
} from "../command-types";
import { finishedSolid, solidMessage } from "./solids-support";
import { EMPTY_EXTRUDE, extrudeDescriptor, type ExtrudeState } from "./solids-create";

/** Nombre que llevan los nodos de empujón. Se numeran para poder citarlos. */
const PUSH_NODE_PREFIX = "empuje";

export interface PushFaceState {
  /** Sólido cuya cara se designó. `null` mientras no se ha designado ninguna. */
  entityId: string | null;
  /** Huella de la cara. Viaja al documento tal cual. */
  face: CadSolidFaceRef | null;
  /** Normal unitaria en el punto tocado: la dirección positiva del empujón. */
  normal: { x: number; y: number; z: number } | null;
}

export const EMPTY_PUSH_FACE: PushFaceState = { entityId: null, face: null, normal: null };

function pushFaceStep(state: PushFaceState): CadCommandStep<PushFaceState> {
  if (!state.face)
    return {
      state,
      prompt: { message: "Designe la cara que empujar o tirar", options: [] },
      accepts: CAD_ACCEPT_FACE_PICK,
    };
  return {
    state,
    prompt: {
      message: "Precise la distancia del empujón (negativa para hundir)",
      options: [],
    },
    accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_POINT,
  };
}

/**
 * Añade el nodo `push` al árbol del sólido y lo convierte en la nueva raíz.
 *
 * El id se numera contando los empujones que ya hay, no con un contador global:
 * así el nombre que ve el usuario en el panel de propiedades («empuje 3») es el
 * mismo si el documento se abre en otra máquina.
 */
export function withPushedFace(
  solid: CadSolid3dEntity,
  face: CadSolidFaceRef,
  distance: number,
): CadSolid3dEntity {
  const existing = solid.nodes.filter((node) => node.id.startsWith(PUSH_NODE_PREFIX)).length;
  const id = `${PUSH_NODE_PREFIX}${existing + 1}`;
  const node: CadSolidNode = { id, op: "push", operand: solid.root, face, distance };
  return { ...solid, nodes: [...solid.nodes, node], root: id };
}

function pushFaceResult(
  state: PushFaceState,
  distance: number,
  context: CadCommandContext,
): CadCommandStep<PushFaceState> {
  const label = "Empujar cara";
  if (!state.entityId || !state.face)
    return solidMessage(state, "PRESSPULL necesita una cara designada.");
  // Un empujón de cero no es un error del usuario que haya que explicar dos
  // veces: es la forma de cancelar sin cancelar. Se dice y no se toca nada.
  if (!(Math.abs(distance) > 1e-9))
    return solidMessage(state, "Un empujón de distancia cero no cambia el sólido.");

  // `entity()` es opcional en el contexto: hay anfitriones que no lo aportan
  // (la línea de comandos sin documento cargado). Sin él no se puede empujar
  // nada, y decirlo es mejor que reventar.
  const entity = context.entity?.(state.entityId);
  if (!entity || entity.type !== "solid3d")
    return solidMessage(state, "La cara designada ya no pertenece a ningún sólido.");

  const pushed = withPushedFace(entity as CadSolid3dEntity, state.face, distance);
  // `finishedSolid` evalúa el árbol y valida invariantes ANTES de escribir: si
  // el empujón atraviesa el sólido o deja una cara alabeada, el usuario recibe
  // el motivo y el documento no se toca.
  const before: CadEntityCommand[] = [{ type: "delete", entityId: entity.id }];
  return finishedSolid(pushed, { state, label, before });
}

/**
 * El estado de PRESSPULL: o se está empujando una cara, o extruyendo un área.
 *
 * No es una unión por comodidad: es que el usuario aún no ha dicho cuál de las
 * dos cosas quiere, y el primer gesto lo decide. Mientras `face` sea `null` y
 * `area.selection` esté vacía, la orden espera cualquiera de los dos.
 */
export interface PressPullState {
  push: PushFaceState;
  area: ExtrudeState;
}

const EMPTY_PRESSPULL: PressPullState = { push: EMPTY_PUSH_FACE, area: EMPTY_EXTRUDE };

/** La máquina de extrusión, reutilizada tal cual: no hay una segunda. */
const AREA = extrudeDescriptor("PRESSPULL", [], "empujar o tirar");

function pressPullStep(state: PressPullState): CadCommandStep<PressPullState> {
  // Ya se designó una cara: a partir de aquí es un empujón y nada más.
  if (state.push.face) {
    const inner = pushFaceStep(state.push);
    return { ...inner, state: { ...state, push: inner.state } };
  }
  // Primer gesto: la orden acepta LAS DOS COSAS y lo dice en un solo renglón.
  return {
    state,
    prompt: {
      message: "Designe una cara del sólido, o los contornos cerrados que empujar",
      options: [],
    },
    accepts: CAD_ACCEPT_FACE_PICK | CAD_ACCEPT_SELECTION | CAD_ACCEPT_ENTITY_PICK,
  };
}

export const PRESSPULL_DESCRIPTOR: CadCommandDescriptor<PressPullState> = {
  name: "PRESSPULL",
  aliases: [],
  kind: "draw",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) =>
    context.selection.length > 0
      ? delegateToArea({ ...EMPTY_PRESSPULL, area: { ...EMPTY_EXTRUDE, selection: context.selection } }, context)
      : pressPullStep(EMPTY_PRESSPULL),
  step: (state, input, context) => {
    if (input.kind === "cancel") return solidMessage(state, "PRESSPULL cancelado.");

    // El primer gesto decide en cuál de los dos mundos estamos.
    if (input.kind === "facePick" && !state.area.selection.length) {
      const push: PushFaceState = {
        entityId: input.entityId,
        face: input.face,
        normal: { x: input.normal.x, y: input.normal.y, z: input.normal.z ?? 0 },
      };
      const inner = pushFaceStep(push);
      return { ...inner, state: { ...state, push: inner.state } };
    }

    if (state.push.face) {
      if (input.kind === "distance")
        return liftPush(pushFaceResult(state.push, input.value, context), state);
      if (input.kind === "point" && state.push.normal) {
        const n = state.push.normal;
        return liftPush(
          pushFaceResult(state.push, input.point.x * n.x + input.point.y * n.y, context),
          state,
        );
      }
      const inner = pushFaceStep(state.push);
      return { ...inner, state: { ...state, push: inner.state } };
    }

    return liftArea(AREA.step(state.area, input, context), state);
  },
};

/** Arranca la rama de área con la selección que ya traía el usuario. */
function delegateToArea(
  state: PressPullState,
  context: CadCommandContext,
): CadCommandStep<PressPullState> {
  return liftArea(AREA.begin(context), state);
}

/** Sube un paso de la máquina de extrusión al estado compuesto. */
function liftArea(
  inner: CadCommandStep<ExtrudeState>,
  outer: PressPullState,
): CadCommandStep<PressPullState> {
  return { ...inner, state: { ...outer, area: inner.state } };
}

/** Sube un paso de la máquina de empujón al estado compuesto. */
function liftPush(
  inner: CadCommandStep<PushFaceState>,
  outer: PressPullState,
): CadCommandStep<PressPullState> {
  return { ...inner, state: { ...outer, push: inner.state } };
}

/**
 * PRESSPULL, listo para el registro.
 *
 * Va en su propia lista y no dentro de `CAD_SOLID_CREATE_COMMANDS` porque ya no
 * es un comando de creación: crea cuando se le da un contorno y MODIFICA cuando
 * se le da una cara. Meterlo en la lista de creación diría algo falso sobre él.
 */
export const CAD_PRESSPULL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(PRESSPULL_DESCRIPTOR),
];
