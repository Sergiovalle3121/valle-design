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
 * La conversión es la de `cadFromMillimetres` —la MISMA tabla que WALL, STAIR,
 * ROOF y SLAB— y se hace aquí y no en la entidad porque el documento persiste
 * NÚMEROS en su unidad, no milímetros.
 *
 * ## `Tipo`: el catálogo, no tres números
 *
 * Un despacho no pide «900 × 2.100»: pide «una P-090». `Tipo` ofrece el
 * catálogo cerrado de `architecture-openings-catalog.ts` y escribe sus medidas
 * en la receta; el default de cada orden ES una entrada de ese catálogo, así
 * que la puerta que sale sin tocar nada y la que sale eligiendo `P-090` son la
 * misma hasta el último dígito. Un tipo que no existe se niega nombrando los
 * que sí —nunca coloca el hueco por defecto en silencio— y teclear una medida
 * a mano después de elegir un tipo DESHACE la etiqueta: un hueco de 850 no se
 * llama P-090 aunque se llegara a él desde P-090.
 *
 * Lo que el catálogo NO hace es persistir: la entidad guarda sus tres medidas
 * y nada más, igual que antes. La marca del cuadro de carpintería se deriva de
 * ellas (`openingMark`), así que no hay ninguna clave guardada que pueda
 * contradecir a la geometría.
 */
import {
  CAD_OPENING_DEFAULT_TYPE,
  cadOpeningType,
  cadOpeningTypeLabel,
  cadOpeningTypeRefusal,
  cadOpeningTypeSize,
  cadOpeningTypes,
  type CadOpeningType,
  type CadOpeningTypeKey,
} from "../../architecture-openings-catalog";
import type { CadOpeningKind } from "../../cad-entities-v7";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
import { wallAxisFrame, wallAxisParameter, wallOpeningFit } from "../../wall-openings";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
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
// El atajo del tipo es la I y no la T: la T ya es la de `alTura`, y dos
// opciones con el mismo atajo no se resuelven —`matchCadKeyword` devuelve null
// ante el empate y la tecla deja de servir para las DOS—.
const TYPE = { keyword: "TIpo", shortcut: "I" } as const;

/**
 * Hueco de paso P-090 (900 × 2.100) y ventana V-120x120 con antepecho 900.
 *
 * Los números no se escriben aquí: son los de la entrada del catálogo que cada
 * orden trae por defecto. Así el hueco que sale sin tocar `Tipo` es
 * exactamente uno del catálogo, y no un tamaño paralelo que un día se separe
 * de él.
 */
export function defaultOpeningSize(
  kind: CadOpeningKind,
  unit: string | undefined,
): { width: number; height: number; sill: number } {
  return cadOpeningTypeSize(CAD_OPENING_DEFAULT_TYPE[kind], unit);
}

interface OpeningState {
  kind: CadOpeningKind;
  width: number;
  height: number;
  sill: number;
  swing: "left" | "right";
  hinge: "start" | "end";
  pending: "none" | "width" | "height" | "sill" | "type";
  /**
   * El tipo del catálogo vigente, o `null` si las medidas se teclearon a
   * mano. NO viaja a la entidad —el documento no gana un campo—: sólo sirve
   * para que el prompt diga qué se está colocando, y se pone a `null` en
   * cuanto una medida deja de ser la del tipo.
   */
  typeKey: CadOpeningTypeKey | null;
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

/**
 * Escribe en la receta las medidas de una entrada del catálogo.
 *
 * Es el ÚNICO sitio por el que un tipo entra en la orden —lo usan igual el
 * arranque (que parte del tipo por defecto) y `Tipo`—, de modo que elegir del
 * catálogo y no elegir nada recorren el mismo camino y no pueden discrepar.
 */
function fromType(
  state: OpeningState,
  type: CadOpeningType,
  context: CadCommandContext,
  notice: string,
): OpeningState {
  const size = cadOpeningTypeSize(type, context.unit);
  return {
    ...state,
    width: size.width,
    height: size.height,
    sill: size.sill,
    pending: "none",
    typeKey: type.key,
    notice,
  };
}

function openingStep(state: OpeningState): CadCommandStep<OpeningState> {
  if (state.pending === "type")
    return {
      state,
      prompt: {
        message: `${state.notice}Precise el tipo de ${noun(state.kind)}`,
        // Cada clave es su propio atajo: `P-090` se teclea entero, que es como
        // se pide en obra, y ninguna letra suelta puede elegir la puerta
        // equivocada.
        options: cadOpeningTypes(state.kind).map((type) => ({ keyword: type.key, shortcut: type.key })),
      },
      // Acepta TEXTO además de palabra clave a propósito: sin él, un tipo que
      // no existe moriría en el analizador con un «Entrada no válida» genérico
      // y el usuario no sabría cuáles existen. Con él, el rechazo lo escribe
      // el catálogo, con la lista delante.
      accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
    };
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
  const options = state.kind === "door" ? [TYPE, WIDTH, HEIGHT, SILL, SIDE, HINGE] : [TYPE, WIDTH, HEIGHT, SILL];
  return {
    state,
    prompt: {
      // El prompt dice QUÉ se va a colocar, y deja de decirlo en cuanto las
      // medidas dejan de ser las de un tipo: un renglón que siguiera diciendo
      // «P-090» sobre una puerta de 850 sería la mentira más barata de todas.
      message:
        `${state.notice}Designe el muro donde alojar ${noun(state.kind)}` +
        (state.typeKey ? ` ${state.typeKey}` : ""),
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
      // Las tres medidas las escribe `fromType` acto seguido con las del tipo
      // por defecto; los ceros de aquí no llegan a verse nunca. Se arranca así
      // —y no con `defaultOpeningSize`— para que el arranque y `Tipo` entren
      // por la MISMA puerta y no puedan discrepar.
      return openingStep(fromType(
        {
          kind,
          width: 0,
          height: 0,
          sill: 0,
          swing: "left",
          hinge: "start",
          pending: "none",
          typeKey: null,
          notice: "",
        },
        CAD_OPENING_DEFAULT_TYPE[kind],
        context,
        "",
      ));
    },
    step(state, input, context) {
      if (input.kind === "cancel" || input.kind === "enter")
        return messageStep(state, "Colocación cancelada.");

      if (state.pending === "type") {
        // La palabra clave y el texto llegan por caminos distintos del
        // analizador y se resuelven por el MISMO sitio: teclear `P-090`,
        // `p-090` o la marca `P-090x210` no pueden dar tres resultados.
        const raw =
          input.kind === "keyword" ? input.keyword : input.kind === "text" ? input.value : null;
        if (raw === null) return openingStep(state);
        const type = cadOpeningType(raw, state.kind);
        // Se queda EN el prompt del tipo: un tipo que no existe no devuelve al
        // paso de designar, donde el siguiente clic colocaría el hueco por
        // defecto como si nada hubiera pasado.
        if (!type) return openingStep({ ...state, notice: `${cadOpeningTypeRefusal(raw, state.kind)} ` });
        return openingStep(fromType(state, type, context, `Tipo ${cadOpeningTypeLabel(type)}. `));
      }

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
          // Una medida tecleada a mano deja el hueco fuera del catálogo: la
          // etiqueta se retira en vez de seguir diciendo «P-090» sobre una
          // puerta de 850. La marca del cuadro se calcula de las medidas, así
          // que la tabla ya diría P-085x210; lo que se corrige aquí es que el
          // prompt no mienta mientras tanto.
          typeKey: null,
          notice: "",
        });
      }

      if (input.kind === "keyword") {
        const keyword = input.keyword.toLowerCase();
        if (keyword === TYPE.keyword.toLowerCase())
          return openingStep({ ...state, pending: "type", notice: "" });
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
