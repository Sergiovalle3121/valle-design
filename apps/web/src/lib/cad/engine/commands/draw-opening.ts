/**
 * DOOR y WINDOW: colocar un hueco ALOJADO en un muro.
 *
 * Segunda orden BIM del producto y la primera que sólo tiene sentido sobre otra
 * entidad. Por eso su primer paso no es un punto sino una DESIGNACIÓN: se
 * señala el muro, y el punto donde se le hizo clic decide la posición sobre su
 * eje. Pedir primero un punto libre y buscar después el muro más cercano habría
 * sido más «cómodo» y sería adivinación: con dos tabiques a 100 mm, colocar la
 * puerta en el que no era cuesta más que volver a señalar.
 *
 * ## Se NIEGA en vez de colocar algo que no cabe
 *
 * Si el hueco no cabe entre las jambas del muro señalado, el comando lo dice
 * con los números —cuánto mide el muro, cuánto pide el hueco— y no coloca nada.
 * Ni lo recorta ni lo desplaza al centro. Un hueco recortado en silencio miente
 * dos veces: en el dibujo y en la tabla de cantidades.
 *
 * ## Los valores por defecto se atan a la unidad del documento
 *
 * Igual que WALL: una puerta de 900 × 2.100 sólo significa algo en milímetros.
 * La conversión vive aquí y no en la entidad porque el documento persiste
 * NÚMEROS en su unidad, no milímetros.
 */
import type { CadOpeningKind } from "../../cad-entities-v7";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { wallAxisFrame, wallAxisParameter, wallOpeningFit } from "../../wall-openings";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandStep,
} from "../command-types";

const WIDTH = { keyword: "Anchura", shortcut: "A" } as const;
const HEIGHT = { keyword: "alTura", shortcut: "T" } as const;
const SILL = { keyword: "antePecho", shortcut: "P" } as const;
const SIDE = { keyword: "Lado", shortcut: "L" } as const;
const HINGE = { keyword: "Bisagra", shortcut: "B" } as const;

/** Milímetros que vale UNA unidad del documento. */
const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

function inUnit(millimetres: number, unit: string | undefined): number {
  return millimetres / (MM_PER_UNIT[unit ?? "mm"] ?? 1);
}

/** Hueco de paso de 900 × 2.100 y ventana de 1.200 × 1.200 con antepecho 900. */
export function defaultOpeningSize(
  kind: CadOpeningKind,
  unit: string | undefined,
): { width: number; height: number; sill: number } {
  return kind === "door"
    ? { width: inUnit(900, unit), height: inUnit(2_100, unit), sill: 0 }
    : { width: inUnit(1_200, unit), height: inUnit(1_200, unit), sill: inUnit(900, unit) };
}

interface OpeningState {
  kind: CadOpeningKind;
  width: number;
  height: number;
  sill: number;
  swing: "left" | "right";
  hinge: "start" | "end";
  pending: "none" | "width" | "height" | "sill";
  /** Lo último que se dijo, para que el usuario lea por qué no se colocó. */
  notice: string;
}

type WallEntity = Extract<CadNativeEntity, { type: "wall" }>;

function hostWall(context: CadCommandContext, entityId: string): WallEntity | null {
  const entity = context.entity?.(entityId);
  return entity && entity.type === "wall" ? (entity as WallEntity) : null;
}

function noun(kind: CadOpeningKind): string {
  return kind === "door" ? "la puerta" : "la ventana";
}

function openingStep(state: OpeningState): CadCommandStep<OpeningState> {
  if (state.pending !== "none") {
    const current =
      state.pending === "width" ? state.width : state.pending === "height" ? state.height : state.sill;
    const label =
      state.pending === "width"
        ? "la anchura"
        : state.pending === "height"
          ? "la altura"
          : "el antepecho";
    return {
      state,
      prompt: { message: `Precise ${label} del hueco`, options: [], defaultValue: String(current) },
      accepts: CAD_ACCEPT_DISTANCE,
    };
  }
  const options = state.kind === "door" ? [WIDTH, HEIGHT, SILL, SIDE, HINGE] : [WIDTH, HEIGHT, SILL];
  return {
    state,
    prompt: {
      message: `${state.notice}Designe el muro donde alojar ${noun(state.kind)}`,
      options,
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_KEYWORD,
  };
}

function messageStep(state: OpeningState, text: string): CadCommandStep<OpeningState> {
  return { state, prompt: { message: "", options: [] }, accepts: 0, result: { kind: "message", text } };
}

/**
 * Construye el comando para una clase de hueco.
 *
 * Puerta y ventana comparten TODO menos el símbolo, el antepecho por defecto y
 * las palabras clave de mano: son la misma orden con dos configuraciones, y
 * escribirlas dos veces habría garantizado que una de las dos se quedase atrás.
 */
function openingCommand(
  kind: CadOpeningKind,
  name: string,
  aliases: readonly string[],
): CadAnyCommandDescriptor {
  return asCadCommand<OpeningState>({
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    cursor: "crosshair",
    begin(context) {
      const size = defaultOpeningSize(kind, context.unit);
      return openingStep({
        kind,
        width: size.width,
        height: size.height,
        sill: size.sill,
        swing: "left",
        hinge: "start",
        pending: "none",
        notice: "",
      });
    },
    step(state, input, context) {
      if (input.kind === "cancel" || input.kind === "enter")
        return messageStep(state, "Colocación cancelada.");

      if (state.pending !== "none") {
        if (input.kind !== "distance") return openingStep(state);
        const value = input.value;
        if (state.pending === "sill" ? value < 0 : !(value > 0))
          return openingStep({
            ...state,
            pending: "none",
            notice: `Una medida de ${value} no vale. `,
          });
        return openingStep({
          ...state,
          width: state.pending === "width" ? value : state.width,
          height: state.pending === "height" ? value : state.height,
          sill: state.pending === "sill" ? value : state.sill,
          pending: "none",
          notice: "",
        });
      }

      if (input.kind === "keyword") {
        const keyword = input.keyword.toLowerCase();
        if (keyword === WIDTH.keyword.toLowerCase())
          return openingStep({ ...state, pending: "width", notice: "" });
        if (keyword === HEIGHT.keyword.toLowerCase())
          return openingStep({ ...state, pending: "height", notice: "" });
        if (keyword === SILL.keyword.toLowerCase())
          return openingStep({ ...state, pending: "sill", notice: "" });
        if (keyword === SIDE.keyword.toLowerCase())
          return openingStep({
            ...state,
            swing: state.swing === "left" ? "right" : "left",
            notice: `Barrido: ${state.swing === "left" ? "derecha" : "izquierda"}. `,
          });
        if (keyword === HINGE.keyword.toLowerCase())
          return openingStep({
            ...state,
            hinge: state.hinge === "start" ? "end" : "start",
            notice: `Bisagra: ${state.hinge === "start" ? "final" : "inicio"} del eje. `,
          });
        return openingStep(state);
      }

      if (input.kind !== "entityPick") return openingStep(state);
      const wall = hostWall(context, input.entityId);
      if (!wall)
        return openingStep({
          ...state,
          notice: "Eso no es un muro y un hueco sólo se aloja en un muro. ",
        });
      const frame = wallAxisFrame(wall);
      if (!frame)
        return openingStep({ ...state, notice: "Ese muro tiene una receta degenerada. " });

      // El punto del clic decide la posición: se PROYECTA sobre el eje. Es lo
      // que hace que señalar cerca de la cara y señalar cerca del eje coloquen
      // el hueco en el mismo sitio, que es lo que el dibujante espera.
      const position = clampToAxis(wallAxisParameter(frame, input.point), state.width, frame.length);
      const fit = wallOpeningFit(wall, { position, width: state.width });
      if (!fit.ok) return openingStep({ ...state, notice: `${fit.problem} ` });

      const entity: CadNativeEntity = {
        id: context.newEntityId(),
        type: "opening",
        kind: state.kind,
        hostId: wall.id,
        position,
        width: state.width,
        height: state.height,
        sill: state.sill,
        swing: state.swing,
        hinge: state.hinge,
        layer: context.activeLayer,
      };
      const commands: CadEntityCommand[] = [{ type: "insert", entity }];
      return {
        state: { ...state, notice: "" },
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "document", commands, label: name },
      };
    },
  });
}

/**
 * Lleva el centro adentro para que el hueco quepa, SIN cambiar su anchura.
 *
 * Es el único ajuste que este comando hace por su cuenta, y es el que un
 * dibujante da por descontado: señalar a 50 mm de la esquina con una puerta de
 * 900 significa «aquí», no «no cabe». Lo que NO se toca es la ANCHURA: si la
 * puerta no cabe ni pegada a la esquina, el comando se niega y lo dice, porque
 * estrechar la puerta a espaldas de quien la coloca cambia el proyecto.
 */
function clampToAxis(raw: number, width: number, length: number): number {
  const half = width / 2;
  if (width > length) return raw;
  return Math.min(Math.max(raw, half), length - half);
}

export const CAD_DRAW_OPENING_COMMANDS: CadAnyCommandDescriptor[] = [
  openingCommand("door", "DOOR", ["PUERTA", "DOORADD"]),
  openingCommand("window", "WINDOW", ["VENTANA", "WINDOWADD"]),
];
