/**
 * Estado de interfaz del gestor de capas: filtros y los borradores tecleados.
 *
 * Fuera de React por la misma razón que el resto de esta carpeta: el techo de
 * `useState` del monolito sólo puede bajar, y un gestor con filtro por nombre,
 * filtro por propiedad y dos borradores habría sido otros tantos `useState`
 * más en una función que ya tiene demasiados.
 *
 * Los ESTADOS DE CAPA ya no viven aquí: desde el esquema 9 son una sección del
 * documento (`document.layerStates`) y el anfitrión sólo conserva el nombre
 * que se está tecleando. La lista que enseña la paleta sale del documento.
 */
import {
  EMPTY_CAD_LAYER_FILTER,
  type CadLayerFilter,
  type CadLayerFilterProperty,
} from "./layer-manager-model";

export interface CadLayerManagerSnapshot {
  filter: CadLayerFilter;
  /** Nombre que se está tecleando para la nueva capa. */
  draftName: string;
  draftColor: string;
  /** Nombre que se está tecleando para el estado nuevo. */
  draftStateName: string;
}

export class CadLayerManagerHost {
  private snapshot: CadLayerManagerSnapshot = {
    filter: EMPTY_CAD_LAYER_FILTER,
    draftName: "",
    draftColor: "#38bdf8",
    draftStateName: "",
  };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Estable por identidad: `useSyncExternalStore` compara así. */
  getSnapshot = (): CadLayerManagerSnapshot => this.snapshot;

  private patch(next: Partial<CadLayerManagerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  get filter(): CadLayerFilter {
    return this.snapshot.filter;
  }

  get draftName(): string {
    return this.snapshot.draftName;
  }

  get draftColor(): string {
    return this.snapshot.draftColor;
  }

  get draftStateName(): string {
    return this.snapshot.draftStateName;
  }

  setFilterText = (text: string): void => {
    if (this.snapshot.filter.text === text) return;
    this.patch({ filter: { ...this.snapshot.filter, text } });
  };

  setFilterProperty = (property: CadLayerFilterProperty): void => {
    if (this.snapshot.filter.property === property) return;
    this.patch({ filter: { ...this.snapshot.filter, property } });
  };

  clearFilter = (): void => {
    if (
      this.snapshot.filter.text === "" &&
      this.snapshot.filter.property === "all"
    )
      return;
    this.patch({ filter: EMPTY_CAD_LAYER_FILTER });
  };

  setDraftName = (name: string): void => {
    if (this.snapshot.draftName === name) return;
    this.patch({ draftName: name });
  };

  setDraftColor = (color: string): void => {
    if (this.snapshot.draftColor === color) return;
    this.patch({ draftColor: color });
  };

  setDraftStateName = (name: string): void => {
    if (this.snapshot.draftStateName === name) return;
    this.patch({ draftStateName: name });
  };
}
