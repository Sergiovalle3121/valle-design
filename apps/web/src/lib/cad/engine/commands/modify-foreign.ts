/**
 * XPLODE, SETBYLAYER, CHPROP y NCOPY (Ola D, 2026-09-02): las cuatro órdenes
 * del trabajo AJENO que faltaban, medidas el 2026-09-01
 * (distancia-autocad-completo-20260901.md, FRENTE 3). Un plano de otro
 * despacho llega con bloques que hay que descomponer SIN que las piezas
 * caigan en la capa 0, con colores explícitos que hay que devolver PorCapa, y
 * con un detalle dentro de un bloque que hace falta copiar sin explotarlo.
 *
 * ## XPLODE
 *
 * EXPLODE con control sobre las piezas: Color, Capa y TipoLínea las fijan para
 * todas y Explotar es EXPLODE a secas. Las piezas son EXACTAMENTE las de
 * `cadExplodeCommands`: no hay una segunda descomposición.
 *
 * Heredar («inherit from parent block» de AutoCAD: lo de la capa 0 y PorBloque
 * toma la capa y el aspecto de la inserción) está en el menú por el
 * vocabulario, pero aquí no hace nada distinto de Explotar: medido en
 * `resolveCadInsert`, el asiento de una silla en capa 0 y PorBloque ya sale
 * colocado en la capa de la inserción y con su color, y EXPLODE lo descompone
 * así. La etiqueta del lote lo dice para que nadie busque una diferencia que
 * no existe.
 *
 * ## SETBYLAYER
 *
 * Quita el aspecto explícito de lo designado: color, tipo de línea y grosor
 * vuelven a PorCapa en una orden. Dice cuántos cambiaron y cuántos ya lo
 * estaban.
 *
 * ## CHPROP
 *
 * Color, Capa, TipoLínea, EScala de tipo de línea y Grosor sobre la selección,
 * en bucle hasta Intro, sin abrir la paleta. Es la orden que se teclea cuando
 * se tienen doscientos objetos designados y una sola cosa que cambiar.
 *
 * ## NCOPY
 *
 * Copia UNA entidad de DENTRO de un bloque sin explotarlo: se designa la
 * inserción pinchando cerca de la pieza, se resuelve el bloque colocado y se
 * toma la pieza que el clic toca (o la más cercana, si ninguna). Con Insertar
 * se deja donde estaba; con punto base y segundo punto, desplazada.
 */
import type { CadEntity, CadEntityPresentation, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../../entity-runtime";
import { resolveCadInsert } from "../../professional-blocks";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  CAD_ACCEPT_SELECTION,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandInput,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";
import { cadExplodeCommands } from "./modify-join";
import { normalizeCadColor } from "./settings-variables";

// ---------------------------------------------------------------------------
// Vocabulario común: color, tipo de línea y grosor como los escriben CECOLOR,
// CELTYPE y CELWEIGHT, convertidos al aspecto de la entidad.
// ---------------------------------------------------------------------------

function colorPresentation(normalized: string): CadEntityPresentation["color"] | undefined {
  if (normalized === "BYLAYER") return undefined;
  if (normalized === "BYBLOCK") return { source: "byBlock" };
  return { source: "explicit", value: normalized };
}

function linetypePresentation(raw: string, previous?: CadEntityPresentation["linetype"]): CadEntityPresentation["linetype"] | undefined {
  const upper = raw.trim().toUpperCase();
  const scale = previous?.scale;
  if (upper === "BYLAYER" || upper === "PORCAPA") return scale ? { source: "byLayer", scale } : undefined;
  if (upper === "BYBLOCK" || upper === "PORBLOQUE") return { source: "byBlock", ...(scale ? { scale } : {}) };
  return { source: "explicit", value: raw.trim(), ...(scale ? { scale } : {}) };
}

function lineweightPresentation(value: number): CadEntityPresentation["lineweight"] | undefined {
  if (value === -1) return undefined;
  if (value === -2) return { source: "byBlock" };
  return { source: "explicit", value };
}

/** `presentation` sin las claves vacías; `null` cuando no queda nada (todo PorCapa). */
function tidy(presentation: CadEntityPresentation): CadEntityPresentation | null {
  const next: CadEntityPresentation = {};
  if (presentation.color) next.color = presentation.color;
  if (presentation.linetype) next.linetype = presentation.linetype;
  if (presentation.lineweight) next.lineweight = presentation.lineweight;
  return Object.keys(next).length > 0 ? next : null;
}

function withPresentation(entity: CadNativeEntity, presentation: CadEntityPresentation | null): CadNativeEntity {
  const context = { ...(entity.context ?? {}) };
  if (presentation) context.presentation = presentation;
  else delete context.presentation;
  return Object.keys(context).length > 0 ? { ...entity, context } : (({ context: _dropped, ...rest }) => rest as CadNativeEntity)(entity);
}

/** Recoge lo designado (previo, pick o selección) y termina con Intro. */
function gather<S extends { targets: string[] }>(
  state: S,
  input: CadCommandInput,
  asking: (state: S) => CadCommandStep<S>,
  done: (state: S) => CadCommandStep<S>,
): CadCommandStep<S> {
  if (input.kind === "cancel") return cadCommandCancelled(state);
  if (input.kind === "entityPick") return asking({ ...state, targets: [...new Set([...state.targets, input.entityId])] });
  if (input.kind === "selection") return asking({ ...state, targets: [...new Set([...state.targets, ...input.entityIds])] });
  if (input.kind === "enter") return done(state);
  return asking(state);
}

function existing(state: { targets: string[] }, context: CadCommandContext): CadEntity[] {
  return state.targets.flatMap((id) => {
    const entity = context.entity?.(id);
    return entity ? [entity] : [];
  });
}

// ---------------------------------------------------------------------------
// XPLODE
// ---------------------------------------------------------------------------

const XPLODE_OPTIONS = [
  { keyword: "Todo", shortcut: "T" },
  { keyword: "Color", shortcut: "C" },
  { keyword: "CApa", shortcut: "CA" },
  { keyword: "TipoLínea", shortcut: "TL" },
  { keyword: "Heredar", shortcut: "H" },
  { keyword: "Explotar", shortcut: "E" },
] as const;

type XplodePhase = "targets" | "option" | "color" | "layer" | "linetype";

interface XplodeState {
  targets: string[];
  phase: XplodePhase;
  /** Todo: pide color, capa y tipo de línea seguidos. */
  all: boolean;
  color: string | null;
  layer: string | null;
  linetype: string | null;
  inherit: boolean;
}

const EMPTY_XPLODE: XplodeState = {
  targets: [],
  phase: "targets",
  all: false,
  color: null,
  layer: null,
  linetype: null,
  inherit: false,
};

function xplodeStep(state: XplodeState): CadCommandStep<XplodeState> {
  switch (state.phase) {
    case "targets":
      return {
        state,
        prompt: { message: "Designe los objetos a descomponer", options: [] },
        accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
      };
    case "option":
      return {
        state,
        prompt: {
          message: "Precise una opción para las piezas [Todo/Color/CApa/TipoLínea/Heredar del bloque/Explotar]",
          options: [...XPLODE_OPTIONS],
          defaultValue: "Explotar",
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "color":
      return {
        state,
        prompt: { message: "Color de las piezas: BYLAYER, BYBLOCK, un índice ACI 1-255 o #rrggbb", options: [], defaultValue: "BYLAYER" },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "layer":
      return {
        state,
        prompt: { message: "Capa de las piezas", options: [] },
        accepts: CAD_ACCEPT_TEXT,
      };
    case "linetype":
      return {
        state,
        prompt: { message: "Tipo de línea de las piezas: BYLAYER, BYBLOCK o un nombre", options: [], defaultValue: "BYLAYER" },
        accepts: CAD_ACCEPT_TEXT,
      };
  }
}

/** Las piezas de `cadExplodeCommands` con lo que XPLODE pidió para ellas. */
export function cadXplodeCommands(
  parent: CadEntity,
  state: Pick<XplodeState, "color" | "layer" | "linetype" | "inherit">,
  context: CadCommandContext,
): CadEntityCommand[] | string {
  const exploded = cadExplodeCommands(parent, context);
  if (typeof exploded === "string") return exploded;
  if (state.layer === null && state.color === null && state.linetype === null) return exploded;
  return exploded.map((command) => {
    if (command.type !== "insert") return command;
    // Heredar no toca nada: la resolución del bloque ya colocó lo de la capa 0
    // y lo PorBloque con la capa y el aspecto de la inserción (ver cabecera).
    let piece = command.entity;
    if (state.layer !== null) piece = { ...piece, layer: state.layer };
    if (state.color !== null || state.linetype !== null) {
      const presentation: CadEntityPresentation = { ...(piece.context?.presentation ?? {}) };
      if (state.color !== null) {
        const color = colorPresentation(state.color);
        if (color) presentation.color = color;
        else delete presentation.color;
      }
      if (state.linetype !== null) {
        const linetype = linetypePresentation(state.linetype, presentation.linetype);
        if (linetype) presentation.linetype = linetype;
        else delete presentation.linetype;
      }
      piece = withPresentation(piece, tidy(presentation));
    }
    return { ...command, entity: piece };
  });
}

function xplodeFinish(state: XplodeState, context: CadCommandContext): CadCommandStep<XplodeState> {
  const parents = existing(state, context);
  if (parents.length === 0) return cadCommandRefused(EMPTY_XPLODE, "XPLODE: no se designó nada que descomponer.");
  const commands: CadEntityCommand[] = [];
  const refusals: string[] = [];
  for (const parent of parents) {
    const outcome = cadXplodeCommands(parent, state, context);
    if (typeof outcome === "string") refusals.push(`${parent.id}: ${outcome}`);
    else commands.push(...outcome);
  }
  if (commands.length === 0) return cadCommandRefused(EMPTY_XPLODE, `XPLODE: ${refusals.join(" ")}`);
  return cadCommandWrites(
    EMPTY_XPLODE,
    commands,
    state.inherit ? "XPLODE (heredado del bloque: lo que EXPLODE ya hace aquí)" : "XPLODE",
  );
}

function layerExists(name: string, context: CadCommandContext): boolean {
  const layers = context.layers?.();
  if (!layers) return true;
  return layers.some((layer) => layer.id === name || layer.name === name);
}

const xplodeCommand: CadCommandDescriptor<XplodeState> = {
  name: "XPLODE",
  aliases: ["XP"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const targets = [...context.selection];
    return xplodeStep({ ...EMPTY_XPLODE, targets, phase: targets.length > 0 ? "option" : "targets" });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(EMPTY_XPLODE);
    if (state.phase === "targets")
      return gather(
        state,
        input,
        xplodeStep,
        (next) => (next.targets.length > 0 ? xplodeStep({ ...next, phase: "option" }) : cadCommandRefused(EMPTY_XPLODE, "XPLODE: no se designó nada que descomponer.")),
      );
    if (state.phase === "option") {
      if (input.kind === "enter") return xplodeFinish(state, context);
      if (input.kind !== "keyword") return xplodeStep(state);
      switch (input.keyword) {
        case "Explotar":
          return xplodeFinish(state, context);
        case "Heredar":
          return xplodeFinish({ ...state, inherit: true }, context);
        case "Todo":
          return xplodeStep({ ...state, all: true, phase: "color" });
        case "Color":
          return xplodeStep({ ...state, phase: "color" });
        case "CApa":
          return xplodeStep({ ...state, phase: "layer" });
        case "TipoLínea":
          return xplodeStep({ ...state, phase: "linetype" });
        default:
          return xplodeStep(state);
      }
    }
    if (input.kind !== "text") return xplodeStep(state);
    const raw = input.value.trim();
    if (state.phase === "color") {
      const color = raw ? normalizeCadColor(raw) : "BYLAYER";
      if (!color) return cadCommandRefused(EMPTY_XPLODE, `XPLODE: "${raw}" no es un color. Use BYLAYER, BYBLOCK, un índice de 1 a 255 o #rrggbb.`);
      const next = { ...state, color };
      return state.all ? xplodeStep({ ...next, phase: "layer" }) : xplodeFinish(next, context);
    }
    if (state.phase === "layer") {
      if (!raw) return cadCommandRefused(EMPTY_XPLODE, "XPLODE: hace falta el nombre de la capa.");
      if (!layerExists(raw, context)) return cadCommandRefused(EMPTY_XPLODE, `XPLODE: la capa «${raw}» no existe en el dibujo.`);
      const next = { ...state, layer: raw };
      return state.all ? xplodeStep({ ...next, phase: "linetype" }) : xplodeFinish(next, context);
    }
    return xplodeFinish({ ...state, linetype: raw || "BYLAYER" }, context);
  },
};

// ---------------------------------------------------------------------------
// SETBYLAYER
// ---------------------------------------------------------------------------

interface TargetsState {
  targets: string[];
}

function setByLayerFinish(state: TargetsState, context: CadCommandContext): CadCommandStep<TargetsState> {
  const entities = existing(state, context);
  if (entities.length === 0) return cadCommandRefused({ targets: [] }, "SETBYLAYER: no se designó nada.");
  const commands: CadEntityCommand[] = entities
    .filter((entity) => !!entity.context?.presentation)
    .map((entity) => ({ type: "presentation", entityId: entity.id, presentation: null }));
  const already = entities.length - commands.length;
  if (commands.length === 0)
    return cadCommandRefused({ targets: [] }, `SETBYLAYER: los ${entities.length} objeto(s) ya estaban PorCapa; no hay nada que cambiar.`);
  return {
    state: { targets: [] },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "document", commands, label: `SETBYLAYER (${commands.length} a PorCapa${already > 0 ? `, ${already} ya lo estaban` : ""})` },
  };
}

const setByLayerAsking = (state: TargetsState): CadCommandStep<TargetsState> => ({
  state,
  prompt: { message: "Designe los objetos que vuelven a PorCapa", options: [] },
  accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
});

const setByLayerCommand: CadCommandDescriptor<TargetsState> = {
  name: "SETBYLAYER",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const state = { targets: [...context.selection] };
    return state.targets.length > 0 ? setByLayerFinish(state, context) : setByLayerAsking(state);
  },
  step: (state, input, context) => gather(state, input, setByLayerAsking, (next) => setByLayerFinish(next, context)),
};

// ---------------------------------------------------------------------------
// CHPROP
// ---------------------------------------------------------------------------

const CHPROP_OPTIONS = [
  { keyword: "Color", shortcut: "C" },
  { keyword: "CApa", shortcut: "CA" },
  { keyword: "TipoLínea", shortcut: "TL" },
  { keyword: "EScala", shortcut: "ES" },
  { keyword: "Grosor", shortcut: "G" },
] as const;

type ChpropPhase = "targets" | "option" | "color" | "layer" | "linetype" | "ltscale" | "lineweight";

interface ChpropState {
  targets: string[];
  phase: ChpropPhase;
  /** Lo acordado hasta ahora; se aplica al terminar, en UN lote. */
  layer: string | null;
  presentation: Partial<Record<"color" | "linetype" | "ltscale" | "lineweight", string | number>>;
}

const EMPTY_CHPROP: ChpropState = { targets: [], phase: "targets", layer: null, presentation: {} };

function chpropStep(state: ChpropState): CadCommandStep<ChpropState> {
  const pending = [
    ...(state.layer !== null ? [`capa ${state.layer}`] : []),
    ...(state.presentation.color !== undefined ? [`color ${state.presentation.color}`] : []),
    ...(state.presentation.linetype !== undefined ? [`tipo de línea ${state.presentation.linetype}`] : []),
    ...(state.presentation.ltscale !== undefined ? [`escala tl ${state.presentation.ltscale}`] : []),
    ...(state.presentation.lineweight !== undefined ? [`grosor ${state.presentation.lineweight}`] : []),
  ];
  switch (state.phase) {
    case "targets":
      return { state, prompt: { message: "Designe los objetos", options: [] }, accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION };
    case "option":
      return {
        state,
        prompt: {
          message: `${pending.length > 0 ? `Cambios: ${pending.join(", ")}. ` : ""}Precise la propiedad que desea cambiar [Color/CApa/TipoLínea/EScala tl/Grosor], o Intro para aplicar`,
          options: [...CHPROP_OPTIONS],
        },
        accepts: CAD_ACCEPT_KEYWORD,
      };
    case "color":
      return { state, prompt: { message: "Nuevo color: BYLAYER, BYBLOCK, un índice ACI 1-255 o #rrggbb", options: [] }, accepts: CAD_ACCEPT_TEXT };
    case "layer":
      return { state, prompt: { message: "Nueva capa", options: [] }, accepts: CAD_ACCEPT_TEXT };
    case "linetype":
      return { state, prompt: { message: "Nuevo tipo de línea: BYLAYER, BYBLOCK o un nombre", options: [] }, accepts: CAD_ACCEPT_TEXT };
    case "ltscale":
      return { state, prompt: { message: "Nueva escala de tipo de línea", options: [], defaultValue: "1" }, accepts: CAD_ACCEPT_DISTANCE };
    case "lineweight":
      return { state, prompt: { message: "Nuevo grosor en centésimas de mm (-1 PorCapa, -2 PorBloque)", options: [] }, accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT };
  }
}

/** Los comandos que aplican lo acordado a `entities`, sin tocar lo que no se pidió. */
export function cadChpropCommands(
  entities: readonly CadEntity[],
  changes: Pick<ChpropState, "layer" | "presentation">,
): CadEntityCommand[] {
  const commands: CadEntityCommand[] = [];
  for (const entity of entities) {
    if (changes.layer !== null && entity.layer !== changes.layer)
      commands.push({ type: "properties", entityId: entity.id, patch: { layer: changes.layer } });
    const keys = Object.keys(changes.presentation);
    if (keys.length === 0) continue;
    const presentation: CadEntityPresentation = { ...(entity.context?.presentation ?? {}) };
    if (changes.presentation.color !== undefined) {
      const color = colorPresentation(String(changes.presentation.color));
      if (color) presentation.color = color;
      else delete presentation.color;
    }
    if (changes.presentation.linetype !== undefined) {
      const linetype = linetypePresentation(String(changes.presentation.linetype), presentation.linetype);
      if (linetype) presentation.linetype = linetype;
      else delete presentation.linetype;
    }
    if (changes.presentation.ltscale !== undefined) {
      const scale = Number(changes.presentation.ltscale);
      const base = presentation.linetype ?? { source: "byLayer" as const };
      presentation.linetype = scale === 1 ? (base.value || base.source !== "byLayer" ? { source: base.source, ...(base.value ? { value: base.value } : {}) } : undefined) : { ...base, scale };
      if (!presentation.linetype) delete presentation.linetype;
    }
    if (changes.presentation.lineweight !== undefined) {
      const lineweight = lineweightPresentation(Number(changes.presentation.lineweight));
      if (lineweight) presentation.lineweight = lineweight;
      else delete presentation.lineweight;
    }
    const next = tidy(presentation);
    const before = entity.context?.presentation ?? null;
    if (JSON.stringify(next) !== JSON.stringify(before))
      commands.push({ type: "presentation", entityId: entity.id, presentation: next });
  }
  return commands;
}

function chpropFinish(state: ChpropState, context: CadCommandContext): CadCommandStep<ChpropState> {
  const entities = existing(state, context);
  if (entities.length === 0) return cadCommandRefused(EMPTY_CHPROP, "CHPROP: no se designó nada.");
  if (state.layer === null && Object.keys(state.presentation).length === 0)
    return cadCommandRefused(EMPTY_CHPROP, "CHPROP: no se pidió ningún cambio.");
  const commands = cadChpropCommands(entities, state);
  if (commands.length === 0) return cadCommandRefused(EMPTY_CHPROP, "CHPROP: los objetos ya tenían esas propiedades; no hay nada que cambiar.");
  return cadCommandWrites(EMPTY_CHPROP, commands, "CHPROP");
}

const chpropCommand: CadCommandDescriptor<ChpropState> = {
  name: "CHPROP",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => {
    const targets = [...context.selection];
    return chpropStep({ ...EMPTY_CHPROP, targets, phase: targets.length > 0 ? "option" : "targets" });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(EMPTY_CHPROP);
    if (state.phase === "targets")
      return gather(state, input, chpropStep, (next) =>
        next.targets.length > 0 ? chpropStep({ ...next, phase: "option" }) : cadCommandRefused(EMPTY_CHPROP, "CHPROP: no se designó nada."),
      );
    if (state.phase === "option") {
      if (input.kind === "enter") return chpropFinish(state, context);
      if (input.kind !== "keyword") return chpropStep(state);
      const phase: Record<string, ChpropPhase> = { Color: "color", CApa: "layer", TipoLínea: "linetype", EScala: "ltscale", Grosor: "lineweight" };
      const next = phase[input.keyword];
      return next ? chpropStep({ ...state, phase: next }) : chpropStep(state);
    }
    const back = (patch: Partial<ChpropState>): CadCommandStep<ChpropState> => chpropStep({ ...state, ...patch, phase: "option" });
    if (state.phase === "color") {
      if (input.kind !== "text") return chpropStep(state);
      const color = normalizeCadColor(input.value);
      if (!color) return cadCommandRefused(EMPTY_CHPROP, `CHPROP: "${input.value}" no es un color. Use BYLAYER, BYBLOCK, un índice de 1 a 255 o #rrggbb.`);
      return back({ presentation: { ...state.presentation, color } });
    }
    if (state.phase === "layer") {
      if (input.kind !== "text") return chpropStep(state);
      const name = input.value.trim();
      if (!name) return chpropStep(state);
      if (!layerExists(name, context)) return cadCommandRefused(EMPTY_CHPROP, `CHPROP: la capa «${name}» no existe en el dibujo.`);
      return back({ layer: name });
    }
    if (state.phase === "linetype") {
      if (input.kind !== "text") return chpropStep(state);
      return back({ presentation: { ...state.presentation, linetype: input.value.trim() || "BYLAYER" } });
    }
    if (state.phase === "ltscale") {
      if (input.kind !== "distance") return chpropStep(state);
      if (!(input.value > 0)) return cadCommandRefused(EMPTY_CHPROP, "CHPROP: la escala de tipo de línea debe ser mayor que cero.");
      return back({ presentation: { ...state.presentation, ltscale: input.value } });
    }
    // lineweight: acepta número (centésimas de mm) o BYLAYER/BYBLOCK.
    const weight =
      input.kind === "distance"
        ? input.value
        : input.kind === "text"
          ? input.value.trim().toUpperCase() === "BYLAYER" || input.value.trim().toUpperCase() === "PORCAPA"
            ? -1
            : input.value.trim().toUpperCase() === "BYBLOCK" || input.value.trim().toUpperCase() === "PORBLOQUE"
              ? -2
              : Number(input.value)
          : Number.NaN;
    if (!Number.isFinite(weight) || weight < -2) return cadCommandRefused(EMPTY_CHPROP, "CHPROP: el grosor va en centésimas de mm (0 a 211), -1 PorCapa o -2 PorBloque.");
    return back({ presentation: { ...state.presentation, lineweight: Math.round(weight) } });
  },
};

// ---------------------------------------------------------------------------
// NCOPY
// ---------------------------------------------------------------------------

interface NcopyState {
  /** La pieza resuelta del bloque, ya en coordenadas del mundo. */
  piece: CadNativeEntity | null;
  basePoint: CadPoint2 | null;
}

const NCOPY_INSERT = { keyword: "Insertar", shortcut: "I" } as const;

/** La pieza del bloque colocado que el clic toca, o la más cercana a él. */
export function cadNestedEntityAt(
  insert: Extract<CadEntity, { type: "insert" }>,
  point: CadPoint2,
  context: CadCommandContext,
): CadNativeEntity | string {
  const blocks = context.blocks?.();
  if (!blocks) return "el anfitrión no ha expuesto las definiciones de bloque.";
  const resolved = resolveCadInsert({ blocks: [...blocks], entities: [insert] }, insert);
  const placed = resolved.entities.filter((entity): entity is CadNativeEntity => CAD_ENTITY_REGISTRY.supports(entity));
  if (placed.length === 0) return `el bloque ${insert.block} no tiene entidades que copiar.`;
  // Apertura de designación: ocho píxeles a la escala de la vista.
  const tolerance = 8 / Math.max(context.view.pixelsPerUnit, 1e-9);
  const hit = placed.find((entity) => CAD_ENTITY_REGISTRY.adapter(entity).hitTester.hitTest(entity, point, tolerance));
  if (hit) return hit;
  let best: CadNativeEntity | null = null;
  let bestDistance = Infinity;
  for (const entity of placed) {
    const bounds = CAD_ENTITY_REGISTRY.adapter(entity).bounds.bounds(entity);
    const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
    const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  }
  return best ?? "no se encontró ninguna pieza.";
}

function ncopyAskingBase(state: NcopyState): CadCommandStep<NcopyState> {
  return {
    state,
    prompt: {
      message: `Pieza: ${state.piece?.type.toUpperCase() ?? "?"}. Precise el punto base o [Insertar en el sitio]`,
      options: [NCOPY_INSERT],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

function ncopyPlace(state: NcopyState, translation: CadPoint2, context: CadCommandContext): CadCommandStep<NcopyState> {
  const piece = state.piece!;
  const renamed = { ...structuredClone(piece), id: context.newEntityId() } as CadNativeEntity;
  const placed =
    translation.x === 0 && translation.y === 0
      ? renamed
      : CAD_ENTITY_REGISTRY.adapter(renamed).commands.transform(renamed, { translation });
  return cadCommandWrites({ piece: null, basePoint: null }, [{ type: "insert", entity: placed }], "NCOPY");
}

const ncopyCommand: CadCommandDescriptor<NcopyState> = {
  name: "NCOPY",
  aliases: [],
  kind: "modify",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: () => ({
    state: { piece: null, basePoint: null },
    prompt: { message: "Designe el objeto anidado que desea copiar (pinche la pieza dentro del bloque)", options: [] },
    accepts: CAD_ACCEPT_ENTITY_PICK,
  }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled({ piece: null, basePoint: null });
    if (!state.piece) {
      if (input.kind !== "entityPick") return ncopyCommand.begin(context);
      const entity = context.entity?.(input.entityId);
      if (!entity) return cadCommandRefused(state, "NCOPY: el objeto designado ya no existe.");
      if (entity.type !== "insert")
        return cadCommandRefused(state, `NCOPY: ${entity.type.toUpperCase()} no es una inserción de bloque; NCOPY copia lo que hay DENTRO de un bloque. Use COPY.`);
      const piece = cadNestedEntityAt(entity, input.point, context);
      if (typeof piece === "string") return cadCommandRefused(state, `NCOPY: ${piece}`);
      return ncopyAskingBase({ piece, basePoint: null });
    }
    if (!state.basePoint) {
      if (input.kind === "keyword" && input.keyword === NCOPY_INSERT.keyword) return ncopyPlace(state, { x: 0, y: 0 }, context);
      if (input.kind === "enter") return ncopyPlace(state, { x: 0, y: 0 }, context);
      if (input.kind !== "point") return ncopyAskingBase(state);
      return {
        state: { ...state, basePoint: { x: input.point.x, y: input.point.y } },
        prompt: { message: "Precise el segundo punto", options: [] },
        accepts: CAD_ACCEPT_POINT,
      };
    }
    if (input.kind !== "point")
      return { state, prompt: { message: "Precise el segundo punto", options: [] }, accepts: CAD_ACCEPT_POINT };
    return ncopyPlace(state, { x: input.point.x - state.basePoint.x, y: input.point.y - state.basePoint.y }, context);
  },
};

export const CAD_MODIFY_FOREIGN_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(xplodeCommand),
  asCadCommand(setByLayerCommand),
  asCadCommand(chpropCommand),
  asCadCommand(ncopyCommand),
];
