/**
 * Estado de interfaz del gestor de capas: filtros y estados guardados.
 *
 * Fuera de React por la misma razón que el resto de esta carpeta: el techo de
 * `useState` del monolito sólo puede bajar, y un gestor con filtro por nombre,
 * filtro por propiedad, nombre de estado nuevo y lista de estados habría sido
 * cuatro `useState` más en una función que ya tiene demasiados.
 *
 * Los estados de capa viven aquí, en la SESIÓN, y no en el documento: no hay
 * dónde ponerlos en `CadDocument` sin tocar `lib/cad`. Restaurar uno sí cambia
 * el documento —emite parches por la ruta canónica—, así que el efecto es real
 * y reversible; lo que se pierde al recargar es la lista, y la interfaz lo dice
 * en vez de dejar que se descubra solo.
 */
import {
  EMPTY_CAD_LAYER_FILTER,
  type CadLayerFilter,
  type CadLayerFilterProperty,
  type CadLayerState,
} from "./layer-manager-model";

export interface CadLayerManagerSnapshot {
  filter: CadLayerFilter;
  /** Nombre que se está tecleando para la nueva capa. */
  draftName: string;
  draftColor: string;
  /** Nombre que se está tecleando para el estado nuevo. */
  draftStateName: string;
  states: readonly CadLayerState[];
}

export class CadLayerManagerHost {
  private snapshot: CadLayerManagerSnapshot = {
    filter: EMPTY_CAD_LAYER_FILTER,
    draftName: "",
    draftColor: "#38bdf8",
    draftStateName: "",
    states: [],
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

  get states(): readonly CadLayerState[] {
    return this.snapshot.states;
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

  /**
   * Guarda un estado. Un nombre repetido SUSTITUYE al anterior en su sitio en
   * vez de añadir un duplicado: dos estados llamados igual son imposibles de
   * distinguir en la lista, y quien reutiliza el nombre está actualizando.
   */
  saveState = (state: CadLayerState): void => {
    if (!state.name) return;
    const index = this.snapshot.states.findIndex(
      (candidate) => candidate.name === state.name,
    );
    const states =
      index >= 0
        ? this.snapshot.states.map((candidate, position) =>
            position === index ? state : candidate,
          )
        : [...this.snapshot.states, state];
    this.patch({ states, draftStateName: "" });
  };

  deleteState = (name: string): void => {
    const states = this.snapshot.states.filter(
      (candidate) => candidate.name !== name,
    );
    if (states.length === this.snapshot.states.length) return;
    this.patch({ states });
  };

  findState = (name: string): CadLayerState | null => {
    return (
      this.snapshot.states.find((candidate) => candidate.name === name) ?? null
    );
  };
}
