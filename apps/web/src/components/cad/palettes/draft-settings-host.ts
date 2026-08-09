/**
 * Ayudas al dibujo (DSETTINGS): OSNAP por modo, ortho, polar y OTRACK.
 *
 * El motor de captura (`lib/cad/snap-engine.ts`) admite los catorce modos de
 * AutoCAD desde hace tiempo y los resuelve bien. Lo que no existía era DÓNDE
 * configurarlos: el editor llamaba con `{ grid: false }` fijo y los otros trece
 * modos estaban siempre encendidos, sin manera de apagar «intersección» cuando
 * estorba o de dejar sólo «punto final» para trazar limpio.
 *
 * ## Por qué esto no son seis `useState`
 *
 * Porque ya lo eran, y ese era el problema. `osnap`, `orthoLock`,
 * `polarTracking`, `polarIncrement`, `objectSnapTracking` y el contador de
 * puntos adquiridos vivían en el monolito como estado de React CON su `ref`
 * espejo y su `useEffect` de sincronía cada uno: seis estados, cinco refs y
 * cinco efectos para seis banderas. La ruta del puntero no puede leer estado de
 * React —corre en un manejador nativo, fuera del render— así que la ref no era
 * opcional, era obligatoria, y mantenerla en sincronía era trabajo manual
 * repetido seis veces.
 *
 * Aquí el estado vive fuera de React: la ruta del puntero lee los getters
 * directamente (sin ref espejo, sin efecto) y la interfaz se suscribe con
 * `useSyncExternalStore`. El techo de `useState` del monolito sólo puede bajar,
 * y esta es la forma de bajarlo sin perder funcionalidad: se gana la
 * configuración por modo que no había.
 *
 * ## La instantánea es estable por identidad
 *
 * `useSyncExternalStore` vuelve a leer tras cada render y compara por
 * identidad. Devolver un objeto nuevo en cada lectura es un bucle infinito de
 * renders, no una ineficiencia. Por eso `snapshot` sólo se reconstruye dentro
 * de `publish()`, cuando algo cambió de verdad.
 */
import { SNAP_PRIORITY, type SnapType } from "@/lib/cad/snap-engine";

export interface CadTrackingPoint {
  x: number;
  y: number;
}

export interface CadDraftSettingsSnapshot {
  /** Interruptor maestro de la captura a objetos (F3). */
  osnap: boolean;
  /** Un interruptor por modo. Sólo cuentan si `osnap` está encendido. */
  osnapModes: Readonly<Record<SnapType, boolean>>;
  /** Ortho: fuerza 0/90/180/270 (F8). */
  ortho: boolean;
  /** Rastreo polar (F10). */
  polar: boolean;
  polarIncrement: number;
  /** Rastreo por objeto, OTRACK (F11). */
  objectSnapTracking: boolean;
  /** Puntos adquiridos por OTRACK; el HUD enseña cuántos hay. */
  acquiredTrackingPoints: number;
}

/**
 * Estado de partida.
 *
 * `grid` arranca APAGADO y los otros trece encendidos porque es exactamente lo
 * que el editor hacía antes de existir este módulo —llamaba con
 * `modes: { grid: false }`—. El comportamiento por defecto no cambia ni un
 * píxel; lo que cambia es que ahora se puede tocar.
 */
export function defaultCadOsnapModes(): Record<SnapType, boolean> {
  const modes = {} as Record<SnapType, boolean>;
  for (const mode of SNAP_PRIORITY) modes[mode] = mode !== "grid";
  return modes;
}

/** Incrementos polares que ofrece la interfaz, como en AutoCAD. */
export const CAD_POLAR_INCREMENTS = [5, 10, 15, 22.5, 30, 45, 90] as const;

/** Todos los modos, en el orden de desempate del motor. Para pintar la lista. */
export const CAD_OSNAP_MODES: readonly SnapType[] = SNAP_PRIORITY;

export class CadDraftSettingsHost {
  private osnapOn = true;
  private modes: Record<SnapType, boolean> = defaultCadOsnapModes();
  private orthoOn = false;
  private polarOn = true;
  private polarStep = 45;
  private trackingOn = true;
  private tracked: CadTrackingPoint[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot: CadDraftSettingsSnapshot = this.build();

  private build(): CadDraftSettingsSnapshot {
    return {
      osnap: this.osnapOn,
      osnapModes: { ...this.modes },
      ortho: this.orthoOn,
      polar: this.polarOn,
      polarIncrement: this.polarStep,
      objectSnapTracking: this.trackingOn,
      acquiredTrackingPoints: this.tracked.length,
    };
  }

  private publish(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CadDraftSettingsSnapshot => this.snapshot;

  // --- lecturas de la ruta del puntero, fuera del render --------------------

  get osnap(): boolean {
    return this.osnapOn;
  }

  get ortho(): boolean {
    return this.orthoOn;
  }

  get polar(): boolean {
    return this.polarOn;
  }

  get polarIncrement(): number {
    return this.polarStep;
  }

  get objectSnapTracking(): boolean {
    return this.trackingOn;
  }

  get trackingPoints(): readonly CadTrackingPoint[] {
    return this.tracked;
  }

  /**
   * Modos en la forma que espera `snap()` del motor.
   *
   * `override` es la captura forzada de un comando —el `MID` tecleado en mitad
   * de una designación—: cuando viene, MANDA sobre la configuración, que es lo
   * que hace AutoCAD. Un override no es una preferencia, es una orden para la
   * siguiente designación.
   */
  snapModes(
    override?: readonly SnapType[] | null,
  ): Partial<Record<SnapType, boolean>> {
    if (override && override.length > 0) {
      const forced = {} as Record<SnapType, boolean>;
      for (const mode of SNAP_PRIORITY) forced[mode] = override.includes(mode);
      return forced;
    }
    return { ...this.modes };
  }

  // --- mutaciones -----------------------------------------------------------

  setOsnap(value: boolean): void {
    if (this.osnapOn === value) return;
    this.osnapOn = value;
    this.publish();
  }

  toggleOsnap(): void {
    this.setOsnap(!this.osnapOn);
  }

  setOsnapMode(mode: SnapType, value: boolean): void {
    if (this.modes[mode] === value) return;
    this.modes = { ...this.modes, [mode]: value };
    this.publish();
  }

  /**
   * Enciende o apaga los catorce de golpe. `grid` va incluido: quien pulsa
   * «todos» pide todos, y dejar uno fuera en silencio sería mentir sobre lo
   * que hace el botón.
   */
  setAllOsnapModes(value: boolean): void {
    const next = {} as Record<SnapType, boolean>;
    for (const mode of SNAP_PRIORITY) next[mode] = value;
    this.modes = next;
    this.publish();
  }

  /** Vuelve al reparto de fábrica: todo encendido salvo `grid`. */
  resetOsnapModes(): void {
    this.modes = defaultCadOsnapModes();
    this.publish();
  }

  setOrtho(value: boolean): void {
    if (this.orthoOn === value) return;
    this.orthoOn = value;
    this.publish();
  }

  toggleOrtho(): void {
    this.setOrtho(!this.orthoOn);
  }

  setPolar(value: boolean): void {
    if (this.polarOn === value) return;
    this.polarOn = value;
    this.publish();
  }

  togglePolar(): void {
    this.setPolar(!this.polarOn);
  }

  setPolarIncrement(degrees: number): void {
    // Un incremento de 0 o negativo divide el círculo en infinitos sectores y
    // cuelga el ajuste angular; se ignora en vez de propagarlo.
    if (!Number.isFinite(degrees) || degrees <= 0) return;
    if (this.polarStep === degrees) return;
    this.polarStep = degrees;
    this.publish();
  }

  setObjectSnapTracking(value: boolean): void {
    if (this.trackingOn === value) return;
    this.trackingOn = value;
    this.publish();
  }

  toggleObjectSnapTracking(): void {
    this.setObjectSnapTracking(!this.trackingOn);
  }

  /**
   * Guarda la lista de puntos adquiridos por OTRACK.
   *
   * Recibe la lista YA calculada por `acquireCadTrackingPoint`, que vive en
   * `lib/cad`. Se pasa hecha en vez de llamarla aquí para que este módulo no
   * dependa del motor de rastreo: lo único que aporta es sostener el dato y
   * avisar a la interfaz cuando el contador cambia.
   */
  setTrackingPoints(points: readonly CadTrackingPoint[]): void {
    if (points.length === this.tracked.length && points.every((point, index) => point === this.tracked[index]))
      return;
    this.tracked = [...points];
    this.publish();
  }

  clearTrackingPoints(): void {
    if (this.tracked.length === 0) return;
    this.tracked = [];
    this.publish();
  }
}
