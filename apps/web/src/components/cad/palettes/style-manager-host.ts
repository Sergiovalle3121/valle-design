/**
 * Estado de interfaz del gestor de estilos: qué familia se mira y qué nombre se
 * está tecleando. Fuera de React, como el resto de esta carpeta: el techo de
 * `useState` del monolito sólo puede bajar.
 */
import type { CadStyleFamily } from "./style-manager-model";

export interface CadStyleManagerSnapshot {
  family: CadStyleFamily;
  draftName: string;
}

export class CadStyleManagerHost {
  private snapshot: CadStyleManagerSnapshot = { family: "text", draftName: "" };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Estable por identidad: `useSyncExternalStore` compara así. */
  getSnapshot = (): CadStyleManagerSnapshot => this.snapshot;

  get family(): CadStyleFamily {
    return this.snapshot.family;
  }

  get draftName(): string {
    return this.snapshot.draftName;
  }

  private patch(next: Partial<CadStyleManagerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  /**
   * Cambiar de familia LIMPIA el borrador. Un nombre tecleado para un estilo de
   * cota no significa lo mismo en la familia de ploteo, y arrastrarlo haría que
   * «Crear» diera de alta un estilo en la pestaña equivocada.
   */
  setFamily = (family: CadStyleFamily): void => {
    if (this.snapshot.family === family) return;
    this.patch({ family, draftName: "" });
  };

  setDraftName = (draftName: string): void => {
    if (this.snapshot.draftName === draftName) return;
    this.patch({ draftName });
  };
}
