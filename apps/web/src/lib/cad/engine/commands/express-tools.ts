/**
 * BREAKLINE, FLATTEN y LAYDEL: tres Express Tools que un veterano teclea sin
 * pensar y que este registro no tenía.
 *
 * Las tres son PURAS —geometría y tablas del documento— y por eso están juntas:
 * ninguna necesita una fuente vectorizada, ni un esquema nuevo, ni una petición
 * al anfitrión. Lo que necesitan es que su respuesta sea la de AutoCAD, que en
 * los tres casos incluye NEGARSE bien:
 *
 * - BREAKLINE se niega cuando el símbolo no cabe en el tramo, en vez de dibujar
 *   una rotura que se sale por los dos extremos.
 * - FLATTEN se niega sobre un sólido 3D y dice adónde ir (FLATSHOT), en vez de
 *   poner sus vértices a cero y devolver una maraña.
 * - LAYDEL se niega sobre la capa 0, sobre la actual y sobre las bloqueadas, y
 *   pide confirmación siempre, porque borra objetos y no sólo una fila de una
 *   tabla.
 *
 * TCOUNT y TXT2MTXT, las otras dos de la entrega, viven en
 * `express-tools-text.ts`: son documento escrito, no geometría, y el trinquete
 * de tamaño da 800 líneas a un archivo nuevo.
 */
import type { CadEntity, CadLayerDef, CadPoint2 } from "../../cad-document";
import type { CadEntityCommand } from "../../entity-commands";
import type { CadNativeEntity } from "../../entity-runtime";
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
  type CadCommandStep,
} from "../command-types";
import { CAD_EXPRESS_TEXT_COMMANDS } from "./express-tools-text";
import {
  documentResult,
  entityName,
  flattenCadEntity,
  nameTally,
  nothing,
  num,
  plural,
  say,
} from "./express-tools-support";

/** Todas las entidades que el comando puede mirar, venga la vista o no. */
function entitiesOf(context: CadCommandContext): readonly CadEntity[] {
  const document = context.document?.();
  if (document) return document.entities;
  return context.entityIds
    .map((id) => context.entity?.(id))
    .filter((entity): entity is CadEntity => !!entity);
}

// ---------------------------------------------------------------------------
// BREAKLINE — la polilínea con el símbolo de rotura
// ---------------------------------------------------------------------------

const SIZE_KEYWORD = { keyword: "Tamaño", shortcut: "T" } as const;
const EXTENSION_KEYWORD = { keyword: "Extensión", shortcut: "E" } as const;
const MIDDLE_KEYWORD = { keyword: "Medio", shortcut: "M" } as const;

/**
 * Tamaño base del símbolo, en unidades de DIBUJO, para que mida cinco
 * milímetros en el papel a escala 1:1.
 *
 * Cinco milímetros es lo que hace que una rotura se lea en una lámina impresa:
 * más pequeña se confunde con un quiebro del trazo y más grande tapa la pieza.
 * Se parte de ahí y no de un `0.1` fijo —el valor de fábrica de AutoCAD, que
 * está en pulgadas— porque un dibujo en metros con símbolo `0.1` da una rotura
 * de diez centímetros y uno en milímetros la da de una décima de milímetro:
 * invisible en un caso, absurda en el otro.
 */
const SYMBOL_SIZE_BY_UNIT: Readonly<Record<string, number>> = {
  mm: 5,
  cm: 0.5,
  m: 0.005,
  in: 0.2,
  ft: 0.0164,
};

function defaultSymbolSize(unit: string | undefined): number {
  return SYMBOL_SIZE_BY_UNIT[unit ?? "mm"] ?? SYMBOL_SIZE_BY_UNIT.mm;
}

/**
 * La escala a la que se dibuja el símbolo.
 *
 * Es `DIMSCALE` y no una variable propia porque una rotura es un símbolo de
 * ANOTACIÓN, igual que una flecha de cota o una garrapata, y en AutoCAD todo lo
 * anotativo se escala por la misma variable. Un dibujo montado a 1:50 pone
 * DIMSCALE 50 una vez y la rotura sale del mismo tamaño en el papel que el
 * texto de las cotas — que es la única definición útil de «a la escala del
 * dibujo».
 */
function drawingScale(context: CadCommandContext): number {
  const value = Number(context.variables?.get("DIMSCALE") ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

interface BreaklineState {
  /** Tamaño y prolongación BASE: se multiplican por DIMSCALE al dibujar. */
  size: number;
  extension: number;
  /**
   * `true` en cuanto el usuario FIJA una prolongación.
   *
   * Mientras no lo haga, la prolongación sigue a la mitad del tamaño: quien
   * dobla el tamaño del símbolo espera una rotura proporcionada, no un símbolo
   * grande con dos rabos de la medida vieja. Una vez fijada, manda ella.
   */
  extensionSet: boolean;
  first: CadPoint2 | null;
  second: CadPoint2 | null;
  /** Qué se está pidiendo ahora mismo. */
  asking: "first" | "second" | "place" | "size" | "extension";
  /** A qué paso volver después de fijar un tamaño o una prolongación. */
  resume: "first" | "second" | "place";
}

function breaklineStep(
  state: BreaklineState,
  context: CadCommandContext,
  note?: string,
): CadCommandStep<BreaklineState> {
  const scale = drawingScale(context);
  const head = note ? `${note} ` : "";
  if (state.asking === "size")
    return {
      state,
      prompt: {
        message: `${head}Tamaño base del símbolo de rotura (se multiplica por DIMSCALE ${num(scale)}: ${num(state.size * scale)} en el dibujo)`,
        options: [],
        defaultValue: num(state.size),
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  if (state.asking === "extension")
    return {
      state,
      prompt: {
        message: `${head}Prolongación base más allá de cada punto (× DIMSCALE ${num(scale)}: ${num(state.extension * scale)} en el dibujo)`,
        options: [],
        defaultValue: num(state.extension),
      },
      accepts: CAD_ACCEPT_DISTANCE | CAD_ACCEPT_TEXT,
    };
  if (state.asking === "place")
    return {
      state,
      prompt: {
        message: `${head}Precise dónde va el símbolo de rotura`,
        options: [MIDDLE_KEYWORD],
        defaultOption: MIDDLE_KEYWORD.keyword,
      },
      accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message:
        head +
        (state.asking === "first"
          ? "Precise el primer punto de la línea de rotura"
          : "Precise el segundo punto de la línea de rotura"),
      options: [SIZE_KEYWORD, EXTENSION_KEYWORD],
    },
    accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * Los cuatro vértices del gesto de rotura, ya colocados y orientados.
 *
 * El símbolo es el quiebro en «Z» del dibujo mecánico: la línea llega, sube
 * media altura, cruza el eje hasta bajar la otra media y vuelve. Medido de
 * punta a punta ocupa `size` a lo ancho y `size` de excursión perpendicular
 * —de `-size/2` a `+size/2`—, que es lo que permite comprobar con una regla
 * que el símbolo mide lo que la escala dice.
 */
function breakSymbolVertices(
  center: CadPoint2,
  direction: CadPoint2,
  size: number,
): CadPoint2[] {
  const normal = { x: -direction.y, y: direction.x };
  const at = (along: number, across: number) => ({
    x: center.x + direction.x * along + normal.x * across,
    y: center.y + direction.y * along + normal.y * across,
  });
  return [at(-size / 2, 0), at(-size / 6, size / 2), at(size / 6, -size / 2), at(size / 2, 0)];
}

function breaklineFinish(
  state: BreaklineState,
  place: CadPoint2 | null,
  context: CadCommandContext,
): CadCommandStep<BreaklineState> {
  const first = state.first;
  const second = state.second;
  if (!first || !second) return nothing(state);
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9)
    return say(state, "BREAKLINE necesita dos puntos distintos: el tramo designado no tiene longitud.");

  const scale = drawingScale(context);
  const size = state.size * scale;
  const extension = state.extension * scale;
  if (size > length)
    return say(
      state,
      `El símbolo de rotura mide ${num(size)} y el tramo designado sólo ${num(length)}: no cabe. Reduzca el tamaño con la opción ${SIZE_KEYWORD.keyword} o alargue el tramo.`,
    );

  const direction = { x: dx / length, y: dy / length };
  // Dónde cae el símbolo: la proyección del punto pedido sobre el tramo,
  // sujeta para que el gesto entero quede DENTRO. Sin el sujetador, pedirlo en
  // la punta sacaría medio símbolo fuera de la rotura y el trazo se cruzaría
  // consigo mismo.
  const requested = place
    ? (place.x - first.x) * direction.x + (place.y - first.y) * direction.y
    : length / 2;
  const along = Math.min(Math.max(requested, size / 2), length - size / 2);
  const center = { x: first.x + direction.x * along, y: first.y + direction.y * along };

  const vertices = [
    { x: first.x - direction.x * extension, y: first.y - direction.y * extension, z: 0 },
    ...breakSymbolVertices(center, direction, size).map((point) => ({ ...point, z: 0 })),
    { x: second.x + direction.x * extension, y: second.y + direction.y * extension, z: 0 },
  ];

  const entity: CadNativeEntity = {
    id: context.newEntityId(),
    type: "polyline",
    vertices,
    closed: false,
    layer: context.activeLayer,
  };
  const label = `BREAKLINE: rotura de ${num(length)} con símbolo de ${num(size)} (tamaño ${num(state.size)} × DIMSCALE ${num(scale)}) y prolongación ${num(extension)} en cada extremo`;
  return documentResult(state, [{ type: "insert", entity }], label);
}

/**
 * BREAKLINE: la rotura convencional, entre dos puntos y a la escala del dibujo.
 *
 * En AutoCAD el símbolo es un bloque (`BRKLINE.DWG`) que la orden inserta y
 * recorta. Aquí es geometría de la MISMA polilínea, y a propósito: un bloque
 * exige una definición en el documento, un nombre que puede chocar con el del
 * dibujo del cliente y un INSERT que se explota antes de exportar. Una sola
 * polilínea se estira, se recorta, se acota y viaja a DXF sin nada detrás.
 */
const breaklineCommand: CadCommandDescriptor<BreaklineState> = {
  name: "BREAKLINE",
  aliases: ["ROTURA"],
  kind: "draw",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => {
    const size = defaultSymbolSize(context.unit);
    return breaklineStep(
      {
        size,
        extension: size / 2,
        extensionSet: false,
        first: null,
        second: null,
        asking: "first",
        resume: "first",
      },
      context,
    );
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);

    if (state.asking === "size" || state.asking === "extension") {
      const typed =
        input.kind === "distance"
          ? input.value
          : input.kind === "text"
            ? Number(input.value.trim())
            : NaN;
      if (input.kind === "enter")
        return breaklineStep({ ...state, asking: state.resume }, context);
      if (!Number.isFinite(typed) || typed <= 0)
        return breaklineStep(state, context, "El tamaño tiene que ser un número mayor que cero.");
      const next =
        state.asking === "size"
          ? { ...state, size: typed, extension: state.extensionSet ? state.extension : typed / 2 }
          : { ...state, extension: typed, extensionSet: true };
      return breaklineStep({ ...next, asking: state.resume }, context);
    }

    if (input.kind === "keyword") {
      if (input.keyword === SIZE_KEYWORD.keyword)
        return breaklineStep({ ...state, asking: "size", resume: state.asking }, context);
      if (input.keyword === EXTENSION_KEYWORD.keyword)
        return breaklineStep({ ...state, asking: "extension", resume: state.asking }, context);
      if (input.keyword === MIDDLE_KEYWORD.keyword && state.asking === "place")
        return breaklineFinish(state, null, context);
      return breaklineStep(state, context);
    }

    if (state.asking === "place") {
      if (input.kind === "enter") return breaklineFinish(state, null, context);
      if (input.kind !== "point") return breaklineStep(state, context);
      return breaklineFinish(state, input.point, context);
    }

    if (input.kind !== "point") return breaklineStep(state, context);
    if (state.asking === "first")
      return breaklineStep({ ...state, first: input.point, asking: "second", resume: "second" }, context);
    return breaklineStep({ ...state, second: input.point, asking: "place", resume: "place" }, context);
  },
};

// ---------------------------------------------------------------------------
// FLATTEN — aplastar la designación a Z = 0
// ---------------------------------------------------------------------------

interface FlattenState {
  targets: readonly string[];
}

function flattenStep(state: FlattenState): CadCommandStep<FlattenState> {
  return {
    state,
    prompt: {
      message: `Designe los objetos a aplastar a Z=0 (${state.targets.length}; Enter para terminar)`,
      options: [],
    },
    accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_SELECTION,
  };
}

/**
 * FLATTEN: baja a Z = 0 lo designado, y DICE qué tocó y qué no pudo.
 *
 * El aplastado en sí es una función pura (`flattenCadEntity`), así que aquí
 * sólo está el diálogo y el recuento. El recuento no es decorado: aplastar es
 * una operación que no se ve en planta —el dibujo queda idéntico en pantalla— y
 * una orden que dijera «hecho» dejaría al usuario sin forma de saber si tocó
 * cuatro objetos o cuarenta, ni cuáles se quedaron fuera.
 *
 * Sustituye por `replace`, no por borrar y crear: la entidad conserva su
 * identificador, su sitio en el orden de dibujo y las cotas y sombreados que la
 * apuntan. Aplastar una línea no debe romper la cota que la mide.
 */
const flattenCommand: CadCommandDescriptor<FlattenState> = {
  name: "FLATTEN",
  // `APLASTAR`, no `APLANAR`: ese alias lo tiene FLATSHOT desde antes —con su
  // spec (`solids-flatshot.spec.ts`: «APLANAR → FLATSHOT»)— y el registro
  // rechaza un alias que apunta a dos comandos. Aplastar a Z=0 es además lo
  // que esta orden hace, y aplanar el modelo 3D a un dibujo 2D es lo que hace
  // la otra: la palabra distinta describe mejor las dos.
  aliases: ["APLASTAR"],
  kind: "modify",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "pick",
  begin: (context) => flattenStep({ targets: [...context.selection] }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);
    if (input.kind === "entityPick")
      return flattenStep({ targets: [...new Set([...state.targets, input.entityId])] });
    if (input.kind === "selection")
      return flattenStep({ targets: [...new Set([...state.targets, ...input.entityIds])] });
    if (input.kind !== "enter") return flattenStep(state);
    if (state.targets.length === 0)
      return say(state, "FLATTEN no tiene ningún objeto designado; no se hizo nada.");

    const commands: CadEntityCommand[] = [];
    const flattenedTypes: string[] = [];
    const flatTypes: string[] = [];
    const refusals: string[] = [];
    const notes = new Set<string>();
    let moved = 0;

    for (const id of state.targets) {
      const entity = context.entity?.(id);
      if (!entity) {
        refusals.push(`${id}: ya no existe`);
        continue;
      }
      const verdict = flattenCadEntity(entity);
      if (verdict.kind === "refused") {
        refusals.push(`${entityName(entity.type)} ${id}: ${verdict.reason}`);
        continue;
      }
      if (verdict.kind === "flat") {
        flatTypes.push(entity.type);
        continue;
      }
      commands.push({ type: "replace", entityId: id, entity: verdict.entity });
      flattenedTypes.push(entity.type);
      moved += verdict.moved;
      if (verdict.note) notes.add(verdict.note);
    }

    const aside: string[] = [];
    if (flatTypes.length > 0) aside.push(`ya estaban en Z=0: ${nameTally(flatTypes)}`);
    if (refusals.length > 0) aside.push(`sin aplastar: ${refusals.join("; ")}`);
    for (const note of notes) aside.push(note);

    if (commands.length === 0)
      return say(
        state,
        `FLATTEN no bajó ningún punto${aside.length > 0 ? ` (${aside.join("; ")})` : ""}.`,
      );

    const label = `FLATTEN: ${plural(commands.length, "objeto aplastado", "objetos aplastados")} a Z=0 (${nameTally(flattenedTypes)}), ${plural(moved, "punto bajado", "puntos bajados")}`;
    return documentResult(state, commands, label, aside.length > 0 ? `FLATTEN: ${aside.join("; ")}.` : undefined);
  },
};

// ---------------------------------------------------------------------------
// LAYDEL — borrar una capa Y sus objetos
// ---------------------------------------------------------------------------

const PICK_KEYWORD = { keyword: "Designar", shortcut: "D" } as const;
const YES_KEYWORD = { keyword: "Sí", shortcut: "S" } as const;
const NO_KEYWORD = { keyword: "No", shortcut: "N" } as const;

interface LaydelState {
  /** Nombre resuelto de la capa, mientras se espera la confirmación. */
  target: string | null;
  asking: "name" | "pick" | "confirm";
}

function layersOf(context: CadCommandContext): readonly CadLayerDef[] {
  return context.layers?.() ?? [];
}

function findLayer(context: CadCommandContext, token: string): CadLayerDef | undefined {
  const key = token.trim().toUpperCase();
  return layersOf(context).find(
    (layer) => layer.name.toUpperCase() === key || layer.id.toUpperCase() === key,
  );
}

const isActiveLayer = (context: CadCommandContext, layer: CadLayerDef) =>
  layer.name === context.activeLayer || layer.id === context.activeLayer;

function laydelStep(state: LaydelState, note?: string): CadCommandStep<LaydelState> {
  const head = note ? `${note} ` : "";
  if (state.asking === "pick")
    return {
      state,
      prompt: { message: `${head}Designe un objeto de la capa a borrar`, options: [] },
      accepts: CAD_ACCEPT_ENTITY_PICK,
    };
  if (state.asking === "confirm")
    return {
      state,
      prompt: { message: head.trim(), options: [YES_KEYWORD, NO_KEYWORD], defaultOption: NO_KEYWORD.keyword },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  return {
    state,
    prompt: {
      message: `${head}Capa a borrar con todos sus objetos`,
      options: [PICK_KEYWORD],
    },
    accepts: CAD_ACCEPT_TEXT | CAD_ACCEPT_KEYWORD,
  };
}

/**
 * Los cuatro motivos por los que una capa NO se borra, en el orden en que
 * AutoCAD los comprueba. Devuelve el motivo, ya redactado, o `null`.
 */
function laydelRefusal(context: CadCommandContext, layer: CadLayerDef): string | null {
  if (layer.name.trim() === "0")
    return "La capa 0 no se puede borrar: es la que define el formato PorBloque y todo documento la tiene.";
  if (isActiveLayer(context, layer))
    return `"${layer.name}" es la capa actual: borrarla dejaría CLAYER apuntando a un nombre que no existe. Ponga otra actual con -LAYER definir y repita.`;
  if (layer.locked)
    return `"${layer.name}" está bloqueada. Una capa se bloquea justamente para que nadie borre lo que hay en ella; desbloquéela con -LAYER desbloquear y repita.`;
  if (layer.name.includes("|"))
    return `"${layer.name}" viene de una referencia externa: su capa vive en el otro dibujo y sólo se borra allí.`;
  return null;
}

/**
 * A qué capa apuntan los objetos que sobrevivan al borrado.
 *
 * La orden de tabla EXIGE una capa de destino aunque LAYDEL no vaya a dejar
 * nada en la capa borrada: es la misma orden con la que LAYMRG fusiona, y su
 * garantía —ninguna entidad se queda apuntando a una capa inexistente— vale
 * también aquí, para lo que otro comando del mismo lote hubiera podido crear.
 */
function reassignTarget(context: CadCommandContext, deleting: CadLayerDef): string | null {
  const survivors = layersOf(context).filter((layer) => layer.id !== deleting.id);
  if (survivors.length === 0) return null;
  const active = survivors.find((layer) => isActiveLayer(context, layer));
  if (active) return active.name;
  const zero = survivors.find((layer) => layer.name.trim() === "0");
  return (zero ?? survivors[0]).name;
}

function laydelConfirmPrompt(context: CadCommandContext, layer: CadLayerDef): string {
  const count = entitiesOf(context).filter(
    (entity) => "layer" in entity && entity.layer === layer.name,
  ).length;
  return count === 0
    ? `La capa "${layer.name}" está vacía. ¿Borrar la capa?`
    : `Se borrarán ${plural(count, "objeto", "objetos")} de la capa "${layer.name}", y la capa con ellos. ¿Continuar?`;
}

function laydelApply(
  state: LaydelState,
  layer: CadLayerDef,
  context: CadCommandContext,
): CadCommandStep<LaydelState> {
  const reassignTo = reassignTarget(context, layer);
  if (!reassignTo)
    return say(state, `"${layer.name}" es la única capa del dibujo: un dibujo sin capas no se puede abrir.`);

  const victims = entitiesOf(context).filter(
    (entity) => "layer" in entity && entity.layer === layer.name,
  );
  const commands: CadEntityCommand[] = [
    ...victims.map((entity): CadEntityCommand => ({ type: "delete", entityId: entity.id })),
    { type: "layer", op: "delete", name: layer.name, reassignTo },
  ];
  const label = `LAYDEL: capa "${layer.name}" borrada con ${plural(victims.length, "objeto", "objetos")}`;
  // Lo que esta versión NO alcanza, dicho aquí y no descubierto tres sesiones
  // después: la geometría que vive DENTRO de una definición de bloque no está
  // en `document.entities`, así que un bloque con líneas en la capa borrada
  // sigue insertándolas. AutoCAD entra en las definiciones; esto todavía no.
  const notice =
    `LAYDEL no entra en las definiciones de bloque: si un bloque dibuja en "${layer.name}", esa geometría sigue ahí y renacerá la capa al insertarlo.`;
  return documentResult(state, commands, label, notice);
}

/**
 * LAYDEL: borra una capa y todo lo que hay en ella.
 *
 * No es LAYMRG con otro nombre y la diferencia importa: LAYMRG REASIGNA los
 * objetos a otra capa y no pierde nada, así que puede resolverse con una sola
 * orden de tabla y sin preguntar. LAYDEL BORRA, y por eso hace las dos cosas
 * que AutoCAD hace: contar en voz alta cuántos objetos van a desaparecer y
 * exigir un «Sí» explícito, con «No» por defecto.
 */
const laydelCommand: CadCommandDescriptor<LaydelState> = {
  name: "LAYDEL",
  aliases: ["CAPABORRAR"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  mutates: true,
  cursor: "none",
  begin: (context) => {
    if (!context.layers)
      return say(
        { target: null, asking: "name" } as LaydelState,
        "El anfitrión no expone la tabla de capas: LAYDEL no puede comprobar si la capa es la 0, la actual o una bloqueada, y no borra a ciegas.",
      );
    return laydelStep({ target: null, asking: "name" });
  },
  step: (state, input, context) => {
    if (input.kind === "cancel") return nothing(state);

    if (state.asking === "confirm") {
      const keyword = input.kind === "keyword" ? input.keyword : NO_KEYWORD.keyword;
      if (keyword !== YES_KEYWORD.keyword)
        return say(state, `LAYDEL cancelado: la capa "${state.target}" sigue en su sitio.`);
      const layer = state.target ? findLayer(context, state.target) : undefined;
      if (!layer) return say(state, `La capa "${state.target}" ya no existe.`);
      return laydelApply(state, layer, context);
    }

    if (state.asking === "name" && input.kind === "keyword") {
      if (input.keyword === PICK_KEYWORD.keyword) return laydelStep({ ...state, asking: "pick" });
      return laydelStep(state);
    }

    const token =
      state.asking === "pick"
        ? input.kind === "entityPick"
          ? (() => {
              const entity = context.entity?.(input.entityId);
              return entity && "layer" in entity ? entity.layer : "";
            })()
          : ""
        : input.kind === "text"
          ? input.value.trim()
          : "";
    if (!token)
      return state.asking === "pick"
        ? laydelStep(state, "No se pudo leer la capa del objeto designado.")
        : nothing(state);

    const layer = findLayer(context, token);
    if (!layer) return say(state, `No existe la capa "${token}".`);
    const refusal = laydelRefusal(context, layer);
    if (refusal) return say(state, refusal);
    return laydelStep(
      { target: layer.name, asking: "confirm" },
      laydelConfirmPrompt(context, layer),
    );
  },
};

export const CAD_EXPRESS_TOOL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(breaklineCommand),
  asCadCommand(flattenCommand),
  asCadCommand(laydelCommand),
  ...CAD_EXPRESS_TEXT_COMMANDS,
];
