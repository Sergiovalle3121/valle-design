/**
 * BALLOON y BOM: el globo y la lista de materiales (Ola I, 2026-09-02).
 *
 * BALLOON designa la pieza (o precisa el punto de la flecha; o toma la
 * designación previa: con una pieza ya designada, como AMBALLOON, la flecha
 * va a su punto de inserción), precisa el centro del círculo y numera solo:
 * el siguiente al mayor globo del dibujo, salvo que se teclee `Número`. Si lo designado es un INSERT, el globo se
 * queda con el id del bloque: es lo que la lista de materiales usa para dar a
 * cada normalizado la posición de su globo. Cuatro entidades con la misma
 * marca en `context.metadata` (`mechanical-symbols.ts` dice por qué no hay
 * una entidad `balloon`).
 *
 * BOM inserta la lista como TABLE en el punto indicado, con el criterio de
 * `mechanical-bom.ts`; se niega diciéndolo si no hay normalizados ni globos.
 *
 * ## BOM Actualizar (2026-09-04): el primer cuadro que se corrige solo
 *
 * Una lista de materiales generada UNA VEZ empieza a mentir con el siguiente
 * tornillo que se inserta, y lo hace en silencio: el cuadro sigue ahí, bien
 * dibujado, diciendo dos donde ya hay tres. «Actualizar» busca las tablas que
 * la propia orden marcó (`CAD_BOM_MARK`), recalcula las filas con el MISMO
 * `buildCadMechanicalBom` que las escribió y las devuelve con `replace` y su
 * id intacto — no borra e inserta: eso cambiaría el id, el orden de dibujo y
 * dejaría colgando a cualquiera que la apunte. El renglón dice qué cambió,
 * porque un «Hecho» sin cifras no distingue actualizar de no hacer nada, y si
 * la tabla ya estaba al día no se escribe: un paso de deshacer vacío es ruido.
 */
import type { CadEntity, CadPoint2 } from "../../cad-document";
import { resolveCadDimensionStyle } from "../../dimension-style";
import type { CadNativeEntity } from "../../entity-runtime";
import {
  CAD_BOM_MARK,
  buildCadMechanicalBom,
  buildCadMechanicalBomTable,
  findCadMechanicalBomTables,
  readCadMechanicalBomTable,
} from "../../mechanical-bom";
import { CAD_BALLOON_MARK, cadBalloonEntities } from "../../mechanical-symbols";
import {
  CAD_ACCEPT_DISTANCE,
  CAD_ACCEPT_ENTITY_PICK,
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_POINT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused, cadCommandWrites } from "./annotate-support";

const NUMBER_OPTION = { keyword: "Número", shortcut: "N" } as const;
const HEIGHT_OPTION = { keyword: "Altura", shortcut: "A" } as const;
const UPDATE_OPTION = { keyword: "Actualizar", shortcut: "A" } as const;
const NO_DOCUMENT_VIEW = "Este espacio de trabajo no expone el documento entero: BOM no puede leer los normalizados aquí.";

/** La altura de texto de los símbolos mecánicos: la del estilo de cota Standard (DIMTXT). */
export function cadMechanicalTextHeight(context: CadCommandContext): number {
  const height = resolveCadDimensionStyle(context.document?.().styles, "Standard").textHeight;
  return height && height > 0 ? height : 120;
}

/** El siguiente número libre de globo: uno más que el mayor del dibujo. */
export function cadNextBalloonNumber(context: CadCommandContext): number {
  let max = 0;
  for (const entityId of context.entityIds) {
    const entity = context.entity?.(entityId);
    if (!entity || entity.type !== "circle") continue;
    const metadata = entity.context?.metadata;
    if (metadata?.mechanical !== CAD_BALLOON_MARK) continue;
    const item = Number(metadata.balloon);
    if (Number.isFinite(item)) max = Math.max(max, item);
  }
  return max + 1;
}

interface BalloonState {
  target: CadPoint2 | null;
  targetId?: string;
  part?: string;
  center: CadPoint2 | null;
  item: number | null;
  height: number | null;
  asking: "number" | "height" | null;
}

function askBalloon(state: BalloonState): CadCommandStep<BalloonState> {
  if (state.asking === "number")
    return { state, prompt: { message: "Precise el número del globo", options: [], defaultValue: String(state.item ?? "") }, accepts: CAD_ACCEPT_DISTANCE };
  if (state.asking === "height")
    return { state, prompt: { message: "Precise la altura del texto", options: [], defaultValue: String(state.height ?? "") }, accepts: CAD_ACCEPT_DISTANCE };
  if (!state.target)
    return {
      state,
      prompt: { message: "Designe la pieza o precise el punto de la flecha", options: [NUMBER_OPTION, HEIGHT_OPTION] },
      accepts: CAD_ACCEPT_ENTITY_PICK | CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD,
    };
  return { state, prompt: { message: "Precise el centro del globo", options: [NUMBER_OPTION, HEIGHT_OPTION] }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
}

function finishBalloon(state: BalloonState, center: CadPoint2, context: CadCommandContext): CadCommandStep<BalloonState> {
  const item = state.item ?? cadNextBalloonNumber(context);
  const height = state.height ?? cadMechanicalTextHeight(context);
  const entities = cadBalloonEntities(
    { item, target: state.target!, center, height, layer: context.activeLayer, ...(state.part ? { part: state.part } : {}), ...(state.targetId ? { targetId: state.targetId } : {}) },
    context.newEntityId,
  );
  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: entities.map((entity) => ({ type: "insert" as const, entity })),
      label: "BALLOON",
      notice: `BALLOON: globo ${item}${state.part ? ` sobre ${state.part}` : ""} en (${Math.round(center.x)}, ${Math.round(center.y)}).`,
    },
  };
}

/** La pieza de la designación previa, si la hay: la primera inserción, o la primera entidad con un punto. */
function preselectedTarget(context: CadCommandContext): Pick<BalloonState, "target" | "targetId" | "part"> | null {
  const entities = context.selection.map((id) => context.entity?.(id)).filter((entity): entity is CadEntity => !!entity);
  const chosen = entities.find((entity) => entity.type === "insert") ?? entities[0];
  if (!chosen) return null;
  if (chosen.type === "insert") return { target: { x: chosen.insertion.x, y: chosen.insertion.y }, targetId: chosen.id, part: chosen.block };
  const anchor = "start" in chosen ? chosen.start : "center" in chosen ? chosen.center : "vertices" in chosen ? chosen.vertices[0] : "insertion" in chosen ? chosen.insertion : null;
  return anchor ? { target: { x: anchor.x, y: anchor.y }, targetId: chosen.id } : null;
}

const balloonCommand: CadCommandDescriptor<BalloonState> = {
  name: "BALLOON",
  aliases: ["AMBALLOON", "GLOBO"],
  kind: "annotate",
  transparent: false,
  selection: "optional",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: (context) => askBalloon({ target: null, center: null, item: null, height: null, asking: null, ...(preselectedTarget(context) ?? {}) }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (state.asking) {
      if (input.kind === "enter") return askBalloon({ ...state, asking: null });
      if (input.kind !== "distance") return askBalloon(state);
      if (state.asking === "number") {
        const item = Math.round(input.value);
        if (!(item > 0)) return cadCommandRefused(state, "El número del globo debe ser un entero mayor que cero.");
        return askBalloon({ ...state, item, asking: null });
      }
      if (!(input.value > 0)) return cadCommandRefused(state, "La altura del texto debe ser mayor que cero.");
      return askBalloon({ ...state, height: input.value, asking: null });
    }
    if (input.kind === "keyword") {
      if (input.keyword === NUMBER_OPTION.keyword) return askBalloon({ ...state, asking: "number" });
      if (input.keyword === HEIGHT_OPTION.keyword) return askBalloon({ ...state, asking: "height" });
      return askBalloon(state);
    }
    if (!state.target) {
      if (input.kind === "entityPick") {
        const entity = context.entity?.(input.entityId);
        const part = entity?.type === "insert" ? entity.block : undefined;
        return askBalloon({ ...state, target: input.point, targetId: input.entityId, ...(part ? { part } : {}) });
      }
      if (input.kind === "point") return askBalloon({ ...state, target: input.point });
      if (input.kind === "enter") return cadCommandRefused(state, "BALLOON necesita la pieza o el punto de la flecha.");
      return askBalloon(state);
    }
    if (input.kind === "point") return finishBalloon(state, input.point, context);
    if (input.kind === "enter") return cadCommandRefused(state, "BALLOON necesita el centro del globo.");
    return askBalloon(state);
  },
};

/* ───────────────────────────────── BOM ───────────────────────────────── */

const BOM_PROMPT = "Precise el punto de inserción de la lista de materiales";
const BOM_NO_TABLE =
  "El dibujo no tiene ninguna tabla de lista de materiales: no hay nada que actualizar. Insértela con BOM y un punto de inserción.";

type BomTable = Extract<CadNativeEntity, { type: "table" }>;

/** Dos tablas dicen lo mismo si dicen lo mismo EN LAS CELDAS. */
function mismasCeldas(a: BomTable, b: BomTable): boolean {
  if (a.rows !== b.rows || a.columns !== b.columns || a.cells.length !== b.cells.length) return false;
  return a.cells.every((cell, index) => {
    const other = b.cells[index]!;
    return cell.row === other.row && cell.column === other.column && cell.text === other.text;
  });
}

/**
 * La tabla de hoy con la identidad de la de ayer.
 *
 * Se reconstruye entera (las filas son otras) pero se conserva todo lo que el
 * dibujante ajustó a mano y la orden no calcula: el id, el punto de inserción,
 * la capa, el giro, el estilo, el ancho de columna si sigue habiendo las mismas
 * columnas, y el bolsillo de `context` con sus otras claves. Reconstruir sin
 * esto sería devolver una tabla ajena en el sitio de la suya.
 */
function relistar(table: BomTable, bom: ReturnType<typeof buildCadMechanicalBom>, newEntityId: () => string): BomTable {
  const rebuilt = buildCadMechanicalBomTable(bom, { x: table.insertion.x, y: table.insertion.y }, table.layer, newEntityId, table.id);
  return {
    ...rebuilt,
    ...(table.rotation === undefined ? {} : { rotation: table.rotation }),
    ...(table.style === undefined ? {} : { style: table.style }),
    columnWidths: table.columnWidths.length === rebuilt.columns ? [...table.columnWidths] : rebuilt.columnWidths,
    context: { ...table.context, metadata: { ...table.context?.metadata, mechanical: CAD_BOM_MARK } },
  };
}

function actualizarBom(state: Record<string, never>, context: CadCommandContext): CadCommandStep<Record<string, never>> {
  const view = context.document?.();
  if (!view) return cadCommandRefused(state, NO_DOCUMENT_VIEW);
  const tables = findCadMechanicalBomTables(view);
  if (tables.length === 0) return cadCommandRefused(state, BOM_NO_TABLE);

  const bom = buildCadMechanicalBom(view);
  const units = bom.rows.reduce((sum, row) => sum + row.count, 0);
  const ahora = `${bom.rows.length} posición(es) y ${units} unidad(es)`;
  const relistadas = tables.map((table) => ({ antes: table, ahora: relistar(table, bom, context.newEntityId) }));
  const cambiadas = relistadas.filter((pareja) => !mismasCeldas(pareja.antes, pareja.ahora));
  if (cambiadas.length === 0)
    return cadCommandRefused(state, `BOM Actualizar: la lista ya estaba al día (${ahora}); no se ha escrito nada.`);

  const figuras = cambiadas.map((pareja) => readCadMechanicalBomTable(pareja.antes));
  const primera = figuras[0]!;
  const coinciden = figuras.every((figura) => figura.items === primera.items && figura.units === primera.units);
  const partes = [
    coinciden
      ? `de ${primera.items} posición(es) y ${primera.units} unidad(es) a ${ahora}`
      : `${cambiadas.length} tabla(s) que no decían lo mismo entre sí, ahora ${ahora}`,
  ];
  if (coinciden && cambiadas.length > 1) partes.push(`${cambiadas.length} tabla(s) actualizada(s)`);
  const alDia = tables.length - cambiadas.length;
  if (alDia > 0) partes.push(`${alDia} ya al día`);

  return {
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "document",
      commands: cambiadas.map((pareja) => ({ type: "replace" as const, entityId: pareja.antes.id, entity: pareja.ahora })),
      label: "BOM Actualizar",
      notice: `BOM Actualizar: ${partes.join(" · ")}.`,
    },
  };
}

const bomCommand: CadCommandDescriptor<Record<string, never>> = {
  name: "BOM",
  aliases: ["AMBOM", "LISTAMATERIALES"],
  kind: "annotate",
  transparent: false,
  selection: "none",
  repeatable: true,
  mutates: true,
  cursor: "crosshair",
  begin: () => ({ state: {}, prompt: { message: BOM_PROMPT, options: [UPDATE_OPTION] }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD }),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);
    if (input.kind === "keyword") {
      if (input.keyword === UPDATE_OPTION.keyword) return actualizarBom(state, context);
      return { state, prompt: { message: BOM_PROMPT, options: [UPDATE_OPTION] }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
    }
    if (input.kind === "enter") return cadCommandRefused(state, "BOM necesita un punto de inserción.");
    if (input.kind !== "point")
      return { state, prompt: { message: BOM_PROMPT, options: [UPDATE_OPTION] }, accepts: CAD_ACCEPT_POINT | CAD_ACCEPT_KEYWORD };
    const view = context.document?.();
    if (!view) return cadCommandRefused(state, NO_DOCUMENT_VIEW);
    const bom = buildCadMechanicalBom(view);
    if (bom.rows.length === 0)
      return cadCommandRefused(state, "El dibujo no tiene normalizados (bloques MECH-) ni globos: no hay lista de materiales que insertar.");
    const table = buildCadMechanicalBomTable(bom, input.point, context.activeLayer, context.newEntityId);
    const units = bom.rows.reduce((sum, row) => sum + row.count, 0);
    const written = cadCommandWrites(state, [{ type: "insert", entity: table }], "BOM");
    return {
      ...written,
      result: {
        ...written.result!,
        notice: `BOM: ${bom.rows.length} posición(es), ${units} unidad(es), ${bom.balloons} globo(s) en (${Math.round(input.point.x)}, ${Math.round(input.point.y)}).`,
      },
    };
  },
};

export const CAD_MECHANICAL_ANNOTATE_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(balloonCommand), asCadCommand(bomCommand)];
