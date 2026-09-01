/**
 * UCS: el comando que fija el plano de trabajo.
 *
 * ## Por qué es el cimiento y no una comodidad
 *
 * Hasta esta ola el SCU sólo se podía tocar por `UCSMAN` —guardar, restituir,
 * volver al universal— y sólo podía ser un giro alrededor de Z. Con eso se
 * dibuja un edificio girado y nada más. **No existía forma de apoyarse en una
 * cara**, que es la primera operación de cualquier trabajo en tres dimensiones:
 * el taladro en un faldón, la escotadura en una pieza inclinada, el replanteo
 * sobre un plano en pendiente. Sin ella, cada punto hay que calcularlo a mano
 * en coordenadas del mundo — el trabajo que un CAD existe para no hacer.
 *
 * La opción `Cara` es la que paga la ola. Las demás están porque un comando a
 * medias enseña a desconfiar de él: quien encuentra que `3 puntos` no está no
 * vuelve a probar `Cara`.
 *
 * ## Qué pasa con el SCU anterior
 *
 * `Previo` recuerda UNO, no diez como AutoCAD, y lo guarda en el catálogo de la
 * sesión bajo un nombre reservado. Se dice aquí porque es una diferencia
 * visible: el segundo `Previo` seguido no lleva dos pasos atrás, alterna.
 * Guardar diez habría necesitado una pila propia en el contexto de comando, que
 * es estado del anfitrión y no cabía en esta ola.
 */
import type { CadPoint2, CadPoint3 } from "../../cad-document";
import type { CadSolid3dEntity } from "../../cad-entities-v5";
import {
  cadActiveUcs,
  cadUcsVariablePatch,
  createCadVariableAccess,
} from "../../system-variables";
import {
  CAD_WORLD_UCS,
  cadUcsFrom3Points,
  cadUcsFromView,
  cadUcsFromZAxis,
  cadUcsMoveOrigin,
  cadUcsPointFromPlanPick,
  cadUcsRotateAbout,
  describeCadUcs,
  isCadUcsPlanar,
  type CadNamedUcs,
  type CadUcsOutcome,
} from "../../ucs";
import {
  cadSolidFaceUnderPoint,
  cadUcsFromEntity,
  cadUcsFromSolidFace,
} from "../../ucs-solid";
import { solid3dBody } from "../../solid3d-build";
import { cadResolveFaceRef } from "../../pick3d/solid-face-ref";
import {
  CAD_ACCEPT_ANGLE,
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_FACE_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

/**
 * Nombre reservado bajo el que duerme el SCU anterior. Empieza por `*` como
 * `*MUNDO*`, y `-UCSMAN ?` no lista los reservados: son memoria del comando, no
 * sistemas que el usuario haya guardado.
 */
export const CAD_PREVIOUS_UCS_NAME = "*ANTERIOR*";

const FACE = { keyword: "Cara", shortcut: "C" } as const;
const NAMED = { keyword: "NOmbrado", shortcut: "NO" } as const;
const OBJECT = { keyword: "OBjeto", shortcut: "OB" } as const;
const PREVIOUS = { keyword: "Previo", shortcut: "P" } as const;
const VIEW = { keyword: "Vista", shortcut: "V" } as const;
const WORLD = { keyword: "Universal", shortcut: "U" } as const;
const AXIS_X = { keyword: "X", shortcut: "X" } as const;
const AXIS_Y = { keyword: "Y", shortcut: "Y" } as const;
const AXIS_Z = { keyword: "Z", shortcut: "Z" } as const;
const Z_AXIS = { keyword: "EjeZ", shortcut: "EJ" } as const;

const FACE_NEXT = { keyword: "Siguiente", shortcut: "S" } as const;
const FACE_FLIP = { keyword: "Voltear", shortcut: "V" } as const;
const FACE_ACCEPT = { keyword: "Aceptar", shortcut: "A" } as const;

const NAMED_SAVE = { keyword: "Guardar", shortcut: "G" } as const;
const NAMED_RESTORE = { keyword: "Restituir", shortcut: "R" } as const;
const NAMED_DELETE = { keyword: "Suprimir", shortcut: "S" } as const;
const NAMED_LIST = { keyword: "?", shortcut: "?" } as const;

type UcsStage =
  | { kind: "start" }
  | { kind: "x-axis"; origin: CadPoint3 }
  | { kind: "xy-plane"; origin: CadPoint3; onX: CadPoint3 }
  | { kind: "z-axis"; origin: CadPoint3 }
  | { kind: "rotate"; axis: "x" | "y" | "z" }
  | { kind: "pick-face" }
  | { kind: "face"; entityId: string; face: number; flipped: boolean }
  | { kind: "pick-object" }
  | { kind: "named"; action: "save" | "restore" | "delete" | null };

interface UcsState {
  stage: UcsStage;
}

const START: UcsState = { stage: { kind: "start" } };

function message(state: UcsState, text: string): CadCommandStep<UcsState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

function cancelled(state: UcsState): CadCommandStep<UcsState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "none" } };
}

function variablesOf(context: CadCommandContext) {
  return context.variables ?? createCadVariableAccess();
}

/**
 * Aplica el SCU: guarda el anterior y escribe las once variables.
 *
 * Se escribe con la puerta del SISTEMA porque los seis ejes son de sólo
 * lectura: son el marco, y un marco tecleado a trozos podría no ser ortonormal.
 */
function applyUcs(
  state: UcsState,
  ucs: CadNamedUcs,
  context: CadCommandContext,
  note: string,
): CadCommandStep<UcsState> {
  const catalog = context.catalogs?.coordinateSystems;
  catalog?.save({ ...cadActiveUcs(variablesOf(context)), name: CAD_PREVIOUS_UCS_NAME });
  const warning = isCadUcsPlanar(ucs)
    ? ""
    : "\nSCU inclinado: LINE conserva la cota; las demás órdenes de dibujo se negarán hasta que la conserven.";
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "variables",
      patch: cadUcsVariablePatch(ucs),
      system: true,
      text: `${note}\n${describeCadUcs(ucs)}${warning}`,
    },
  };
}

function applyOutcome(
  state: UcsState,
  outcome: CadUcsOutcome,
  context: CadCommandContext,
  note: string,
): CadCommandStep<UcsState> {
  if (!outcome.ok) return message(state, outcome.message);
  return applyUcs(state, outcome.ucs, context, note);
}

/**
 * El punto que el usuario quiso decir, en coordenadas del mundo.
 *
 * Lo tecleado ya viene convertido por el analizador de coordenadas; lo
 * SEÑALADO llega del visor 2D sin cota, es decir, es una recta vertical. Con un
 * SCU inclinado activo, el punto que quiso decir es donde esa recta corta el
 * plano de trabajo: el mismo criterio que usa cualquier CAD y el único que
 * hace utilizable señalar sobre una cara.
 */
function worldPointOf(
  point: CadPoint2 | CadPoint3,
  source: "pointer" | "typed" | "tracked",
  current: CadNamedUcs,
): { ok: true; point: CadPoint3 } | { ok: false; message: string } {
  if ("z" in point && source !== "pointer") return { ok: true, point };
  if (isCadUcsPlanar(current) && current.origin.z === 0)
    return { ok: true, point: { x: point.x, y: point.y, z: "z" in point ? point.z : 0 } };
  const projected = cadUcsPointFromPlanPick(point, current);
  return projected.ok ? projected : { ok: false, message: projected.message };
}

function startStep(state: UcsState, context: CadCommandContext): CadCommandStep<UcsState> {
  const current = cadActiveUcs(variablesOf(context));
  return {
    state,
    prompt: {
      message: `SCU actual: ${describeCadUcs(current)}. Precise el origen del nuevo SCU`,
      options: [FACE, NAMED, OBJECT, PREVIOUS, VIEW, WORLD, AXIS_X, AXIS_Y, AXIS_Z, Z_AXIS],
      defaultOption: WORLD.keyword,
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

function faceStep(state: UcsState, note: string): CadCommandStep<UcsState> {
  return {
    state,
    prompt: {
      message: note,
      options: [FACE_NEXT, FACE_FLIP, FACE_ACCEPT],
      defaultOption: FACE_ACCEPT.keyword,
    },
    accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_DISTANCE,
  };
}

/** El sólido designado, o el motivo por el que no sirve. */
function solidOf(
  context: CadCommandContext,
  entityId: string,
): { ok: true; entity: CadSolid3dEntity } | { ok: false; message: string } {
  const entity = context.entity?.(entityId);
  if (!entity) return { ok: false, message: "El anfitrión no expone la geometría designada." };
  if (entity.type !== "solid3d")
    return {
      ok: false,
      message: `Lo designado es un "${entity.type}", no un sólido. Use la opción Objeto para apoyarse en él.`,
    };
  return { ok: true, entity };
}

function ucsOfFace(
  context: CadCommandContext,
  entityId: string,
  face: number,
  flipped: boolean,
): CadUcsOutcome {
  const solid = solidOf(context, entityId);
  if (!solid.ok) return { ok: false, code: "plano-de-canto", message: solid.message };
  const built = cadUcsFromSolidFace(solid.entity, face, { name: "" });
  if (!built.ok || !flipped) return built;
  // Voltear gira 180° alrededor del eje X: la cara sigue siendo la misma y la Z
  // pasa a apuntar hacia dentro del sólido, que es lo que se quiere para
  // taladrar en vez de para apoyar.
  return { ok: true, ucs: cadUcsRotateAbout(built.ucs, "x", 180) };
}

function faceCountOf(context: CadCommandContext, entityId: string): number {
  const solid = solidOf(context, entityId);
  return solid.ok ? solid3dBody(solid.entity).faces.length : 0;
}

function describeFace(context: CadCommandContext, entityId: string, face: number): string {
  const total = faceCountOf(context, entityId);
  return `SCU apoyado en la cara ${face + 1} de ${total}`;
}

const ucsCommand: CadCommandDescriptor<UcsState> = {
  name: "UCS",
  aliases: ["SCU"],
  kind: "manage",
  // Transparente como en AutoCAD: se puede cambiar el plano de trabajo en mitad
  // de una polilínea, que es cuando más falta hace.
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  spatial: true,
  cursor: "crosshair",
  begin: (context) => startStep(START, context),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cancelled(state);
    const access = variablesOf(context);
    const current = cadActiveUcs(access);
    const catalog = context.catalogs?.coordinateSystems;
    const stage = state.stage;

    // --- opciones del primer prompt ----------------------------------------
    if (stage.kind === "start") {
      if (input.kind === "enter")
        return applyUcs(state, CAD_WORLD_UCS, context, "SCU universal restituido.");
      if (input.kind === "point") {
        const world = worldPointOf(input.point, input.source, current);
        if (!world.ok) return message(state, world.message);
        return {
          state: { stage: { kind: "x-axis", origin: world.point } },
          prompt: {
            message: "Precise un punto sobre la parte positiva del eje X, o pulse Intro para conservar los ejes",
            options: [],
          },
          accepts: CAD_ACCEPT_POINT,
        };
      }
      if (input.kind !== "keyword") return startStep(state, context);

      switch (input.keyword) {
        case WORLD.keyword:
          return applyUcs(state, CAD_WORLD_UCS, context, "SCU universal restituido.");
        case PREVIOUS.keyword: {
          const previous = catalog?.get(CAD_PREVIOUS_UCS_NAME);
          if (!previous)
            return message(
              state,
              "No hay ningún SCU anterior en esta sesión: sólo se recuerda el último, y todavía no se ha cambiado ninguno.",
            );
          return applyUcs(state, { ...previous, name: "" }, context, "SCU anterior restituido.");
        }
        case VIEW.keyword: {
          // El visor 2D mira SIEMPRE a lo largo de la Z del mundo, así que el
          // SCU paralelo a la pantalla es el del mundo con este origen. Cuando
          // el visor tenga cámara libre, aquí entrará su dirección de vista y
          // esta opción dejará de ser un caso particular sin tocar nada más.
          return applyOutcome(
            state,
            cadUcsFromView("", current.origin, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }),
            context,
            "SCU alineado con la pantalla. El visor 2D mira a lo largo de la Z del mundo.",
          );
        }
        case AXIS_X.keyword:
        case AXIS_Y.keyword:
        case AXIS_Z.keyword: {
          const axis = input.keyword === AXIS_X.keyword ? "x" : input.keyword === AXIS_Y.keyword ? "y" : "z";
          return {
            state: { stage: { kind: "rotate", axis } },
            prompt: {
              message: `Precise el ángulo de giro alrededor del eje ${input.keyword} del SCU`,
              options: [],
              defaultValue: "90",
            },
            accepts: CAD_ACCEPT_ANGLE | CAD_ACCEPT_DISTANCE,
          };
        }
        case Z_AXIS.keyword:
          return {
            state: { stage: { kind: "z-axis", origin: current.origin } },
            prompt: { message: "Precise un punto sobre la parte positiva del eje Z", options: [] },
            accepts: CAD_ACCEPT_POINT,
          };
        case FACE.keyword:
          return {
            state: { stage: { kind: "pick-face" } },
            prompt: { message: "Designe la cara de un sólido", options: [] },
            // CARA primero, ENTIDAD como respaldo declarado. El enrutador
            // pregunta por la cara antes que por la entidad, así que en 3D
            // llega la cara exacta que el usuario está mirando; el respaldo
            // sólo entra donde no hay rayo que lanzar —el visor 2D, que no
            // ofrece `hitFace`— y allí resuelve por la regla aproximada de
            // siempre. Retirarlo dejaría la opción `Cara` muerta en planta.
            accepts: CAD_ACCEPT_FACE_PICK | CAD_ACCEPT_ENTITY_PICK,
          };
        case OBJECT.keyword:
          return {
            state: { stage: { kind: "pick-object" } },
            prompt: { message: "Designe el objeto que alinea el SCU", options: [] },
            accepts: CAD_ACCEPT_ENTITY_PICK,
          };
        case NAMED.keyword:
          return {
            state: { stage: { kind: "named", action: null } },
            prompt: {
              message: "SCU con nombre",
              options: [NAMED_SAVE, NAMED_RESTORE, NAMED_DELETE, NAMED_LIST],
              defaultOption: NAMED_LIST.keyword,
            },
            accepts: CAD_ACCEPT_KEYWORD,
          };
        default:
          return startStep(state, context);
      }
    }

    // --- origen + eje X + plano XY -----------------------------------------
    if (stage.kind === "x-axis") {
      if (input.kind === "enter")
        return applyUcs(
          state,
          cadUcsMoveOrigin(current, stage.origin, ""),
          context,
          "Origen del SCU trasladado; los ejes se conservan.",
        );
      if (input.kind !== "point") return cancelled(state);
      const world = worldPointOf(input.point, input.source, current);
      if (!world.ok) return message(state, world.message);
      return {
        state: { stage: { kind: "xy-plane", origin: stage.origin, onX: world.point } },
        prompt: {
          message: "Precise un punto sobre la parte positiva del plano XY del SCU",
          options: [],
        },
        accepts: CAD_ACCEPT_POINT,
      };
    }

    if (stage.kind === "xy-plane") {
      if (input.kind !== "point") return cancelled(state);
      const world = worldPointOf(input.point, input.source, current);
      if (!world.ok) return message(state, world.message);
      return applyOutcome(
        state,
        cadUcsFrom3Points("", stage.origin, stage.onX, world.point),
        context,
        "SCU fijado por tres puntos.",
      );
    }

    if (stage.kind === "z-axis") {
      if (input.kind !== "point") return cancelled(state);
      const world = worldPointOf(input.point, input.source, current);
      if (!world.ok) return message(state, world.message);
      return applyOutcome(
        state,
        cadUcsFromZAxis("", stage.origin, world.point),
        context,
        "SCU fijado por su eje Z.",
      );
    }

    if (stage.kind === "rotate") {
      const degrees =
        input.kind === "angle"
          ? input.degrees
          : input.kind === "distance"
            ? input.value
            : input.kind === "enter"
              ? 90
              : null;
      if (degrees === null) return cancelled(state);
      return applyUcs(
        state,
        cadUcsRotateAbout(current, stage.axis, degrees, ""),
        context,
        `SCU girado ${degrees}° alrededor de su eje ${stage.axis.toUpperCase()}.`,
      );
    }

    // --- cara de un sólido --------------------------------------------------
    //
    // DOS CAMINOS, y la diferencia entre ellos es la razón de esta ola.
    //
    // El de arriba es el bueno: el lienzo 3D lanza un rayo desde su cámara viva
    // contra las caras teseladas del cuerpo y manda la que de verdad está bajo
    // el cursor, con su huella geométrica. El de abajo es el que había —
    // `cadSolidFaceUnderPoint`, que sólo mira a lo largo de la Z del MUNDO y se
    // declara a sí mismo «una regla de designación, no de geometría exacta»—.
    // Con él, apoyarse en un faldón inclinado daba la cara equivocada sin
    // avisar, porque en planta la cara de arriba y la de abajo comparten
    // proyección.
    //
    // El aproximado no se borra: sigue siendo lo único disponible en el visor
    // 2D, que no tiene rayo que lanzar. Se queda de respaldo, y se dice.
    if (stage.kind === "pick-face") {
      if (input.kind === "facePick") {
        const solid = solidOf(context, input.entityId);
        if (!solid.ok) return message(state, solid.message);
        // La huella se RESUELVE contra el cuerpo vivo en vez de creerse su
        // índice: entre la designación y este paso el sólido pudo reevaluarse.
        // `cadResolveFaceRef` devuelve tres cosas distintas —casa, se cura, o
        // falla nombrando cuántas candidatas había—, y la tercera se dice en
        // vez de caer a la cara 0.
        const resolved = cadResolveFaceRef(solid3dBody(solid.entity), input.face);
        if (!resolved.ok)
          return message(state, `No pude fijar esa cara: ${resolved.reason}`);
        const next: UcsState = {
          stage: {
            kind: "face",
            entityId: input.entityId,
            face: resolved.face,
            flipped: false,
          },
        };
        return faceStep(
          next,
          `${describeFace(context, input.entityId, resolved.face)}. Acepte o elija otra`,
        );
      }
      if (input.kind !== "entityPick") return cancelled(state);
      const solid = solidOf(context, input.entityId);
      if (!solid.ok) return message(state, solid.message);
      const found = cadSolidFaceUnderPoint(solid3dBody(solid.entity), input.point);
      if (!found.ok) return message(state, found.message);
      const next: UcsState = {
        stage: { kind: "face", entityId: input.entityId, face: found.face, flipped: false },
      };
      return faceStep(next, `${describeFace(context, input.entityId, found.face)}. Acepte o elija otra`);
    }

    if (stage.kind === "face") {
      const total = faceCountOf(context, stage.entityId);
      if (input.kind === "distance") {
        const face = Math.round(input.value) - 1;
        if (!(face >= 0 && face < total))
          return message(state, `El sólido tiene ${total} cara(s); pida una entre 1 y ${total}.`);
        const next: UcsState = { stage: { ...stage, face } };
        return faceStep(next, `${describeFace(context, stage.entityId, face)}. Acepte o elija otra`);
      }
      if (input.kind === "keyword" && input.keyword === FACE_NEXT.keyword) {
        const face = total > 0 ? (stage.face + 1) % total : 0;
        const next: UcsState = { stage: { ...stage, face } };
        return faceStep(next, `${describeFace(context, stage.entityId, face)}. Acepte o elija otra`);
      }
      if (input.kind === "keyword" && input.keyword === FACE_FLIP.keyword) {
        const next: UcsState = { stage: { ...stage, flipped: !stage.flipped } };
        return faceStep(
          next,
          `${describeFace(context, stage.entityId, stage.face)}, eje Z ${next.stage.kind === "face" && next.stage.flipped ? "hacia dentro" : "hacia fuera"}. Acepte o elija otra`,
        );
      }
      return applyOutcome(
        state,
        ucsOfFace(context, stage.entityId, stage.face, stage.flipped),
        context,
        `SCU apoyado en la cara ${stage.face + 1} del sólido.`,
      );
    }

    // --- objeto -------------------------------------------------------------
    if (stage.kind === "pick-object") {
      if (input.kind !== "entityPick") return cancelled(state);
      const entity = context.entity?.(input.entityId);
      if (!entity) return message(state, "El anfitrión no expone la geometría designada.");
      return applyOutcome(
        state,
        cadUcsFromEntity(entity, "", input.point),
        context,
        `SCU alineado con el objeto designado (${entity.type}).`,
      );
    }

    // --- SCU con nombre -----------------------------------------------------
    if (!catalog)
      return message(
        state,
        "Los SCU con nombre necesitan el catálogo de la sesión y este espacio de trabajo no lo aporta.",
      );

    if (stage.action === null) {
      const keyword = input.kind === "keyword" ? input.keyword : NAMED_LIST.keyword;
      if (keyword === NAMED_LIST.keyword) {
        const saved = catalog.list().filter((entry) => !entry.name.startsWith("*"));
        return message(
          state,
          saved.length === 0
            ? "No hay ningún SCU guardado."
            : saved.map((entry) => describeCadUcs(entry)).join("\n"),
        );
      }
      const action =
        keyword === NAMED_SAVE.keyword ? "save" : keyword === NAMED_DELETE.keyword ? "delete" : "restore";
      return {
        state: { stage: { kind: "named", action } },
        prompt: { message: "Nombre del SCU", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    }

    if (input.kind !== "text") return cancelled(state);
    const name = input.value.trim();
    if (!name) return cancelled(state);
    if (name.startsWith("*"))
      return message(state, `"${name}" empieza por asterisco y ese prefijo está reservado.`);

    if (stage.action === "save") {
      catalog.save({ ...current, name });
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "variables", patch: { UCSNAME: name }, text: `SCU "${name}" guardado.` },
      };
    }
    if (stage.action === "delete")
      return message(
        state,
        catalog.remove(name) ? `SCU "${name}" suprimido.` : `No hay ningún SCU llamado "${name}".`,
      );

    const found = catalog.get(name);
    if (!found) return message(state, `No hay ningún SCU llamado "${name}".`);
    return applyUcs(state, found, context, `SCU "${found.name}" restituido.`);
  },
};

export const CAD_UCS_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(ucsCommand)];
