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
/**
 * Sólo los cuadros FLOTANTES. La paleta de propiedades y el gestor de capas
 * viven anclados —en el panel derecho y en el menú de vista— y su visibilidad
 * la decide el editor, así que no aparecen aquí: listarlos daría a entender que
 * este anfitrión los controla, y no es verdad.
 */
export type CadPaletteId =
  | "draft-settings"
  /** Los cinco gestores de estilo comparten cuadro y se eligen por pestaña. */
  | "styles";

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

  /**
   * Atajos preligados a las paletas que tienen botón propio. Existen para que
   * el editor pase `host.toggleDraftSettings` tal cual: una lambda nueva por
   * render anularía la memoización del componente que la recibe, y envolverla
   * en `useCallback` allí sería ruido en un archivo que sólo puede encoger.
   */
  toggleDraftSettings = (): void => {
    this.toggle("draft-settings");
  };

  toggleStyles = (): void => {
    this.toggle("styles");
  };
}
