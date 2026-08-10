/**
 * Estados de capa (LAYERSTATE): fotografiar cómo se ve el dibujo y volver.
 *
 * Un plano de verdad tiene cuarenta capas y tres formas de mirarse: la de
 * imprimir estructura, la de imprimir instalaciones y la de trabajar. Sin
 * estados de capa, cambiar de una a otra son cuarenta interruptores y el error
 * no se ve hasta que sale el papel.
 *
 * ## Por qué vive en la sesión y no en el documento
 *
 * `CadDocument` no tiene sección donde ponerlos y `cad-document.ts` pertenece a
 * otra sesión en esta ola. La lista de estados, por tanto, no sobrevive a una
 * recarga; RESTAURAR uno sí toca el documento y sí es reversible con deshacer,
 * porque sale por la ruta canónica como cualquier otro cambio. La diferencia
 * está dicha en el comando, no sólo aquí.
 *
 * Es la misma decisión —y la misma limitación— que tomó el gestor de capas de
 * la ola 1 en `components/cad/palettes/layer-manager-model.ts`. Este módulo es
 * su gemelo del lado de `lib`: aquel captura FILAS de una tabla de interfaz,
 * éste captura `CadLayerDef` del documento, que es lo que un comando tecleado
 * tiene delante.
 */
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

/** Catálogo en memoria; el mismo contrato que el resto de catálogos de sesión. */
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
