/**
 * Qué paleta está abierta.
 *
 * Un dato de una sola línea que, escrito como `useState`, habría sido uno más
 * en una función que ya tiene 161 y cuyo techo sólo puede bajar. Escrito así lo
 * comparten las cuatro paletas nuevas —propiedades, capas, DSETTINGS y
 * estilos— sin ocupar ninguno, y con una propiedad que un `useState` por paleta
 * no daría gratis: sólo puede haber UNA abierta, porque es un único valor.
 *
 * Es deliberadamente tonto. La lógica de cada gestor vive en su propio módulo;
 * esto sólo dice cuál se pinta.
 */
export type CadPaletteId =
  | "properties"
  | "layers"
  | "draft-settings"
  | "text-style"
  | "dimension-style"
  | "mleader-style"
  | "table-style"
  | "plot-style";

export interface CadPaletteSnapshot {
  open: CadPaletteId | null;
}

const CLOSED: CadPaletteSnapshot = { open: null };

export class CadPaletteHost {
  private snapshot: CadPaletteSnapshot = CLOSED;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * `useSyncExternalStore` compara por identidad: devolver un objeto nuevo en
   * cada lectura sería un bucle infinito de renders, no una ineficiencia.
   */
  getSnapshot = (): CadPaletteSnapshot => this.snapshot;

  get open(): CadPaletteId | null {
    return this.snapshot.open;
  }

  private publish(next: CadPaletteId | null): void {
    if (this.snapshot.open === next) return;
    this.snapshot = next === null ? CLOSED : { open: next };
    for (const listener of this.listeners) listener();
  }

  show = (palette: CadPaletteId): void => {
    this.publish(palette);
  };

  /** Abre si estaba cerrada o era otra; cierra si ya era esta. */
  toggle = (palette: CadPaletteId): void => {
    this.publish(this.snapshot.open === palette ? null : palette);
  };

  close = (): void => {
    this.publish(null);
  };
}
