/**
 * Estados de capa (LAYERSTATE): fotografiar cómo se ve el dibujo y volver.
 *
 * Un plano de verdad tiene cuarenta capas y tres formas de mirarse: la de
 * imprimir estructura, la de imprimir instalaciones y la de trabajar. Sin
 * estados de capa, cambiar de una a otra son cuarenta interruptores y el error
 * no se ve hasta que sale el papel.
 *
 * ## Desde el esquema 9 viven EN EL DOCUMENTO
 *
 * Hasta el v8, `CadDocument` no tenía sección donde ponerlos: la lista vivía
 * en un catálogo de sesión y LAYERSTATE avisaba de que no sobrevivía a una
 * recarga. El esquema 9 estrena `document.layerStates`, así que guardar y
 * suprimir salen por el lote (`layer-state` en `entity-command-tables.ts`),
 * sobreviven a la recarga, se deshacen con Ctrl+Z y viajan con el documento.
 *
 * El catálogo de sesión del final del archivo NO desaparece: queda como la
 * MEMORIA del aislamiento de LAYISO/LAYWALK, que sí es de la sesión — dos
 * personas con el mismo plano aíslan cada una lo suyo.
 */
import { commitChange, type CadDocument } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";
import type { CadLayerDef } from "./cad-document";

export interface CadLayerStateEntry {
  layerName: string;
  color: string;
  visible: boolean;
  locked: boolean;
  linetype?: string;
  lineweight?: number;
  plot?: boolean;
}

export interface CadNamedLayerState {
  name: string;
  entries: readonly CadLayerStateEntry[];
}

/** Qué propiedades restaura un estado. Se puede restaurar sólo el apagado. */
export interface CadLayerStateScope {
  visibility: boolean;
  locking: boolean;
  color: boolean;
  linetype: boolean;
  lineweight: boolean;
  plot: boolean;
}

export const CAD_LAYER_STATE_FULL_SCOPE: CadLayerStateScope = {
  visibility: true,
  locking: true,
  color: true,
  linetype: true,
  lineweight: true,
  plot: true,
};

export function captureCadLayerState(
  name: string,
  layers: readonly CadLayerDef[],
): CadNamedLayerState {
  return {
    name: name.trim(),
    entries: layers.map((layer) => ({
      layerName: layer.name,
      color: layer.color,
      visible: layer.visible,
      locked: layer.locked,
      ...(layer.linetype === undefined ? {} : { linetype: layer.linetype }),
      ...(layer.lineweight === undefined ? {} : { lineweight: layer.lineweight }),
      ...(layer.plot === undefined ? {} : { plot: layer.plot }),
    })),
  };
}

export interface CadLayerStateRestorePlan {
  commands: readonly CadEntityCommand[];
  /** Capas del estado que ya no existen en el dibujo. */
  missing: readonly string[];
  /** Capas del dibujo que el estado no menciona: se dejan como están. */
  untouched: readonly string[];
  changed: number;
}

/**
 * Traduce un estado guardado en parches de capa.
 *
 * Sólo emite lo que CAMBIA. Un estado que se restaura sobre sí mismo produce
 * cero comandos, y cero comandos es lo que hace que el motor no cree un paso de
 * deshacer vacío que el usuario tendría que pulsar dos veces.
 */
export function planCadLayerStateRestore(
  state: CadNamedLayerState,
  layers: readonly CadLayerDef[],
  scope: CadLayerStateScope = CAD_LAYER_STATE_FULL_SCOPE,
): CadLayerStateRestorePlan {
  const byName = new Map(layers.map((layer) => [layer.name.toUpperCase(), layer]));
  const mentioned = new Set<string>();
  const commands: CadEntityCommand[] = [];
  const missing: string[] = [];

  for (const entry of state.entries) {
    const key = entry.layerName.toUpperCase();
    const layer = byName.get(key);
    if (!layer) {
      missing.push(entry.layerName);
      continue;
    }
    mentioned.add(key);
    const next: CadLayerDef = { ...layer };
    if (scope.visibility) next.visible = entry.visible;
    if (scope.locking) next.locked = entry.locked;
    if (scope.color) next.color = entry.color;
    if (scope.linetype && entry.linetype !== undefined) next.linetype = entry.linetype;
    if (scope.lineweight && entry.lineweight !== undefined) next.lineweight = entry.lineweight;
    if (scope.plot && entry.plot !== undefined) next.plot = entry.plot;
    if (sameLayer(layer, next)) continue;
    commands.push({ type: "layer", op: "upsert", layer: next });
  }

  return {
    commands,
    missing,
    untouched: layers
      .filter((layer) => !mentioned.has(layer.name.toUpperCase()))
      .map((layer) => layer.name),
    changed: commands.length,
  };
}

function sameLayer(a: CadLayerDef, b: CadLayerDef): boolean {
  return (
    a.color === b.color &&
    a.visible === b.visible &&
    a.locked === b.locked &&
    a.linetype === b.linetype &&
    a.lineweight === b.lineweight &&
    a.plot === b.plot
  );
}

// ---------------------------------------------------------------------------
// Estados en el DOCUMENTO — la puerta que usa el gestor de capas
// ---------------------------------------------------------------------------

/**
 * Guarda (o sustituye, por nombre) un estado en `document.layerStates`.
 *
 * Es la MISMA escritura que emite LAYERSTATE por el lote, expuesta como
 * mutación directa para el gestor de capas, que muta con `commitChange` igual
 * que `updateCadDocumentLayer`. El nombre es la identidad, sin distinguir
 * mayúsculas; la lista queda ordenada por nombre porque es un catálogo.
 */
export function upsertCadDocumentLayerState(
  document: CadDocument,
  state: CadNamedLayerState,
): CadDocument {
  const name = state.name.trim();
  if (!name) return document;
  const key = name.toUpperCase();
  const layerStates = [
    ...(document.layerStates ?? []).filter((entry) => entry.name.toUpperCase() !== key),
    state,
  ].sort((a, b) => a.name.localeCompare(b.name));
  return commitChange({ ...document, layerStates }, `layer-state:upsert:${name}`);
}

/** Borra un estado por nombre; el MISMO documento si no existía. */
export function deleteCadDocumentLayerState(
  document: CadDocument,
  name: string,
): CadDocument {
  const key = name.trim().toUpperCase();
  const layerStates = (document.layerStates ?? []).filter(
    (entry) => entry.name.toUpperCase() !== key,
  );
  if (layerStates.length === (document.layerStates ?? []).length) return document;
  const next = { ...document, layerStates };
  // La sección es opcional-ausente: borrar el último estado la retira entera.
  if (layerStates.length === 0) delete (next as Partial<CadDocument>).layerStates;
  return commitChange(next, `layer-state:delete:${name.trim()}`);
}

/**
 * Restituye un estado del documento en UNA transacción. Devuelve el MISMO
 * documento cuando el estado no existe o no hay nada que cambiar, para que el
 * anfitrión pueda decir «no había cambios» en vez de ensuciar el historial.
 */
export function restoreCadDocumentLayerState(
  document: CadDocument,
  name: string,
  scope: CadLayerStateScope = CAD_LAYER_STATE_FULL_SCOPE,
): CadDocument {
  const key = name.trim().toUpperCase();
  const state = (document.layerStates ?? []).find(
    (entry) => entry.name.toUpperCase() === key,
  );
  if (!state) return document;
  const plan = planCadLayerStateRestore(state, document.layers, scope);
  if (plan.commands.length === 0) return document;
  const patched = new Map(
    plan.commands.flatMap((command) =>
      command.type === "layer" && command.op === "upsert"
        ? [[command.layer.name.toUpperCase(), command.layer] as const]
        : [],
    ),
  );
  return commitChange(
    {
      ...document,
      layers: document.layers.map(
        (layer) => patched.get(layer.name.toUpperCase()) ?? layer,
      ),
    },
    `layer-state:restore:${state.name}`,
  );
}

/**
 * Catálogo en memoria, con el contrato de los catálogos de sesión. Desde que
 * LAYERSTATE escribe en el documento, su único uso es la MEMORIA del
 * aislamiento (`settings-layer-tools.ts`): la foto previa a LAYISO/LAYWALK.
 */
export class CadLayerStateCatalog {
  private items: CadNamedLayerState[] = [];

  list = (): readonly CadNamedLayerState[] => this.items;

  get = (name: string): CadNamedLayerState | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadNamedLayerState): void => {
    const key = item.name.trim().toUpperCase();
    const index = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (index >= 0) this.items = this.items.map((entry, at) => (at === index ? item : entry));
    else this.items = [...this.items, item].sort((a, b) => a.name.localeCompare(b.name));
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  };
}
