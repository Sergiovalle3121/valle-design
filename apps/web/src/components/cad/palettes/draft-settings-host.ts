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
 *
 * ## El preajuste es una capa de sesión, no un ajuste
 *
 * El modo Esencial necesita otro reparto (sólo extremo y medio, OTRACK y
 * entrada dinámica apagados) y `valle_draft_settings` es UNA clave compartida
 * con Pro: escribir ahí el recorte haría que Pro heredara dos modos de catorce.
 * Por eso el preajuste vive en un overlay que los getters y la instantánea leen
 * primero y que `save()` nunca ve. Los conmutadores (F11, F12, las casillas de
 * DSETTINGS) mutan el overlay mientras hay preajuste, y `setPreset(null)`
 * devuelve la base tal cual estaba.
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
  /**
   * Entrada dinámica junto al cursor (F12). Apagarla oculta el control
   * flotante; teclear coordenadas sigue disponible por la línea de comandos,
   * que es exactamente el reparto de AutoCAD con DYNMODE en 0.
   */
  dynamicInput: boolean;
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

/**
 * Etiqueta corta de cada modo para el HUD del puntero.
 *
 * Es DISTINTA de la del cuadro DSETTINGS a propósito: el HUD la escribe en
 * minúscula dentro de una frase («capturado a extremo») y el cuadro la usa como
 * título de una casilla. Vive aquí, y no en el monolito, porque el monolito
 * sólo puede encoger.
 */
export const CAD_OSNAP_HUD_LABELS: Record<SnapType, string> = {
  endpoint: "extremo",
  midpoint: "medio",
  center: "centro",
  "geometric-center": "centro geométrico",
  node: "nodo",
  quadrant: "cuadrante",
  intersection: "intersección",
  insertion: "inserción",
  perpendicular: "perpendicular",
  tangent: "tangente",
  nearest: "cercano",
  "apparent-intersection": "intersección aparente",
  extension: "extensión",
  grid: "grilla",
};

/** Todos los modos, en el orden de desempate del motor. Para pintar la lista. */
export const CAD_OSNAP_MODES: readonly SnapType[] = SNAP_PRIORITY;

/**
 * Lo que un preajuste fija. Lo demás (osnap maestro, ortho, polar y su
 * incremento) sigue en la base y se guarda como siempre.
 */
export interface CadDraftPreset {
  /** Modos encendidos. Los que falten cuentan como apagados. */
  modes: Readonly<Partial<Record<SnapType, boolean>>>;
  tracking: boolean;
  dynamicInput: boolean;
}

/** Los catorce modos, encendidos sólo los que `on` marque. */
function presetOsnapModes(
  on: Readonly<Partial<Record<SnapType, boolean>>>,
): Record<SnapType, boolean> {
  const modes = {} as Record<SnapType, boolean>;
  for (const mode of SNAP_PRIORITY) modes[mode] = on[mode] === true;
  return modes;
}

/**
 * Preajuste del modo Esencial: extremo y medio, nada más.
 *
 * `extension` imanta a la prolongación infinita de cualquier segmento cercano,
 * `nearest` pega el cursor al segmento y OTRACK adquiría en cada movimiento:
 * los tres «tiraban» del clic. Se apagan aquí, sin tocar el motor. POLAR queda
 * en 45° a propósito: es predecible y no forma parte del preajuste.
 */
export const CAD_DRAFT_PRESET_ESENCIAL: CadDraftPreset = Object.freeze({
  modes: Object.freeze(presetOsnapModes({ endpoint: true, midpoint: true })),
  tracking: false,
  dynamicInput: false,
});

const STORAGE_KEY = "valle_draft_settings";

interface PersistedState {
  osnap?: boolean;
  modes?: Record<string, boolean>;
  ortho?: boolean;
  polar?: boolean;
  polarStep?: number;
  tracking?: boolean;
  dynamicInput?: boolean;
}

export class CadDraftSettingsHost {
  private osnapOn = true;
  private modes: Record<SnapType, boolean> = defaultCadOsnapModes();
  private orthoOn = false;
  private polarOn = true;
  private polarStep = 45;
  private trackingOn = true;
  // Encendida de fábrica: es lo que el editor enseñaba SIEMPRE antes de que
  // F12 existiera, así que el comportamiento de partida no cambia ni un píxel.
  private dynamicInputOn = true;
  private tracked: CadTrackingPoint[] = [];
  /** Lo pedido con `setPreset`; el «Por defecto» de DSETTINGS vuelve a esto. */
  private preset: CadDraftPreset | null = null;
  /** Estado de sesión mientras hay preajuste. `save()` nunca lo mira. */
  private overlay: {
    modes: Record<SnapType, boolean>;
    tracking: boolean;
    dynamicInput: boolean;
  } | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: CadDraftSettingsSnapshot = this.build();

  constructor() {
    this.restore();
    this.snapshot = this.build();
  }

  private restore(): void {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedState;
      if (typeof saved.osnap === "boolean") this.osnapOn = saved.osnap;
      if (saved.modes) {
        const defaults = defaultCadOsnapModes();
        for (const key of SNAP_PRIORITY) {
          if (typeof saved.modes[key] === "boolean") (this.modes as Record<string, boolean>)[key] = saved.modes[key]!;
          else (this.modes as Record<string, boolean>)[key] = defaults[key];
        }
      }
      if (typeof saved.ortho === "boolean") this.orthoOn = saved.ortho;
      if (typeof saved.polar === "boolean") this.polarOn = saved.polar;
      if (typeof saved.polarStep === "number" && saved.polarStep > 0) this.polarStep = saved.polarStep;
      if (typeof saved.tracking === "boolean") this.trackingOn = saved.tracking;
      if (typeof saved.dynamicInput === "boolean") this.dynamicInputOn = saved.dynamicInput;
    } catch {
      // localStorage corrupto o no disponible: ignora y usa defaults.
    }
  }

  private save(): void {
    try {
      if (typeof localStorage === "undefined") return;
      const state: PersistedState = {
        osnap: this.osnapOn,
        modes: { ...this.modes },
        ortho: this.orthoOn,
        polar: this.polarOn,
        polarStep: this.polarStep,
        tracking: this.trackingOn,
        dynamicInput: this.dynamicInputOn,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage lleno o no disponible: ignora.
    }
  }

  /** Modos vigentes: el overlay si hay preajuste, la base si no. */
  private get activeModes(): Record<SnapType, boolean> {
    return this.overlay ? this.overlay.modes : this.modes;
  }

  private build(): CadDraftSettingsSnapshot {
    return {
      osnap: this.osnapOn,
      osnapModes: { ...this.activeModes },
      ortho: this.orthoOn,
      polar: this.polarOn,
      polarIncrement: this.polarStep,
      objectSnapTracking: this.objectSnapTracking,
      dynamicInput: this.dynamicInput,
      acquiredTrackingPoints: this.tracked.length,
    };
  }

  /**
   * Reconstruye la instantánea y avisa. NO guarda: el overlay y los puntos de
   * OTRACK son de sesión, y escribirlos crearía `valle_draft_settings` en un
   * navegador que nunca tocó un ajuste.
   */
  private publish(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  /** Cambio en la base: se guarda y se publica. */
  private commit(): void {
    this.save();
    this.publish();
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
    return this.overlay ? this.overlay.tracking : this.trackingOn;
  }

  get dynamicInput(): boolean {
    return this.overlay ? this.overlay.dynamicInput : this.dynamicInputOn;
  }

  get trackingPoints(): readonly CadTrackingPoint[] {
    return this.tracked;
  }

  /** Hay un preajuste puesto: lo que se lee y se conmuta es el overlay. */
  get presetActive(): boolean {
    return this.overlay !== null;
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
    return { ...this.activeModes };
  }

  // --- mutaciones -----------------------------------------------------------

  setOsnap = (value: boolean): void => {
    if (this.osnapOn === value) return;
    this.osnapOn = value;
    this.commit();
  };

  toggleOsnap = (): void => {
    this.setOsnap(!this.osnapOn);
  };

  /** Con preajuste cambia el overlay (sesión); sin él, la base (guardada). */
  private replaceModes(next: Record<SnapType, boolean>): void {
    if (this.overlay) {
      this.overlay = { ...this.overlay, modes: next };
      this.publish();
      return;
    }
    this.modes = next;
    this.commit();
  }

  setOsnapMode = (mode: SnapType, value: boolean): void => {
    if (this.activeModes[mode] === value) return;
    this.replaceModes({ ...this.activeModes, [mode]: value });
  };

  /**
   * Enciende o apaga los catorce de golpe. `grid` va incluido: quien pulsa
   * «todos» pide todos, y dejar uno fuera en silencio sería mentir sobre lo
   * que hace el botón.
   */
  setAllOsnapModes = (value: boolean): void => {
    const next = {} as Record<SnapType, boolean>;
    for (const mode of SNAP_PRIORITY) next[mode] = value;
    this.replaceModes(next);
  };

  /**
   * «Por defecto»: el reparto de fábrica (todo salvo `grid`) o, con preajuste,
   * el del preajuste. Quien está en Esencial pide volver a Esencial, no a Pro.
   */
  resetOsnapModes = (): void => {
    this.replaceModes(
      this.preset ? presetOsnapModes(this.preset.modes) : defaultCadOsnapModes(),
    );
  };

  setOrtho = (value: boolean): void => {
    if (this.orthoOn === value) return;
    this.orthoOn = value;
    this.commit();
  };

  toggleOrtho = (): void => {
    this.setOrtho(!this.orthoOn);
  };

  setPolar = (value: boolean): void => {
    if (this.polarOn === value) return;
    this.polarOn = value;
    this.commit();
  };

  togglePolar = (): void => {
    this.setPolar(!this.polarOn);
  };

  setPolarIncrement = (degrees: number): void => {
    // Un incremento de 0 o negativo divide el círculo en infinitos sectores y
    // cuelga el ajuste angular; se ignora en vez de propagarlo.
    if (!Number.isFinite(degrees) || degrees <= 0) return;
    if (this.polarStep === degrees) return;
    this.polarStep = degrees;
    this.commit();
  };

  setObjectSnapTracking = (value: boolean): void => {
    if (this.objectSnapTracking === value) return;
    if (this.overlay) {
      this.overlay = { ...this.overlay, tracking: value };
      this.publish();
      return;
    }
    this.trackingOn = value;
    this.commit();
  };

  toggleObjectSnapTracking = (): void => {
    this.setObjectSnapTracking(!this.objectSnapTracking);
  };

  setDynamicInput = (value: boolean): void => {
    if (this.dynamicInput === value) return;
    if (this.overlay) {
      this.overlay = { ...this.overlay, dynamicInput: value };
      this.publish();
      return;
    }
    this.dynamicInputOn = value;
    this.commit();
  };

  toggleDynamicInput = (): void => {
    this.setDynamicInput(!this.dynamicInput);
  };

  /**
   * Pone o quita el preajuste.
   *
   * Entrar copia el preajuste al overlay (nunca se muta el objeto recibido) y
   * suelta los puntos adquiridos por OTRACK: guiar en Esencial con puntos que
   * Pro adquirió sería un imán invisible. Salir descarta el overlay entero,
   * conmutaciones de sesión incluidas, y la base aparece tal cual quedó. Volver
   * a entrar da el preajuste limpio. Repetir el mismo objeto no publica nada:
   * el efecto de React que lo aplica vuelve a correr sin que cambie el modo.
   */
  setPreset = (preset: CadDraftPreset | null): void => {
    if (preset === this.preset) return;
    if (preset) this.clearTrackingPoints();
    this.preset = preset;
    this.overlay = preset
      ? {
          modes: presetOsnapModes(preset.modes),
          tracking: preset.tracking,
          dynamicInput: preset.dynamicInput,
        }
      : null;
    this.publish();
  };

  /**
   * Guarda la lista de puntos adquiridos por OTRACK.
   *
   * Recibe la lista YA calculada por `acquireCadTrackingPoint`, que vive en
   * `lib/cad`. Se pasa hecha en vez de llamarla aquí para que este módulo no
   * dependa del motor de rastreo: lo único que aporta es sostener el dato y
   * avisar a la interfaz cuando el contador cambia.
   */
  setTrackingPoints = (points: readonly CadTrackingPoint[]): void => {
    if (
      points.length === this.tracked.length &&
      points.every((point, index) => point === this.tracked[index])
    )
      return;
    this.tracked = [...points];
    this.publish();
  };

  clearTrackingPoints = (): void => {
    if (this.tracked.length === 0) return;
    this.tracked = [];
    this.publish();
  };
}
