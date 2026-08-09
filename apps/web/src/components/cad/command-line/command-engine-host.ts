/**
 * Anfitrión del motor de comandos.
 *
 * El motor (`lib/cad/engine`) es un reductor puro: no sabe de React, ni del
 * documento, ni de la escena. Alguien tiene que sostener su estado, traducir
 * los efectos en acciones reales y avisar a la interfaz. Eso es esta clase.
 *
 * ## Por qué no es un `useState`
 *
 * El presupuesto de `npm run check:cad` fija el número de `useState` del
 * monolito y **sólo permite bajarlo**. No es una molestia burocrática: es la
 * regla que impide que cada ola añada «un estado más» a una función que ya
 * tiene 161 y devuelve un JSX de 6.300 líneas.
 *
 * Así que el estado vive fuera de React y se consume con `useSyncExternalStore`,
 * que es exactamente la dirección a la que va la descomposición: un controlador
 * imperativo con suscripción, y componentes que leen lo que necesitan. Cumplir
 * la regla y avanzar la arquitectura resultan ser la misma cosa.
 */
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandAction,
  type CadCommandEffect,
  type CadCommandEngineState,
  type CadCommandRegistry,
} from "@/lib/cad/engine/command-engine";
import type {
  CadCommandContext,
  CadCommandSession,
  CadPreviewPath,
  CadPrompt,
} from "@/lib/cad/engine/command-types";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadViewRequest } from "@/lib/cad/view/view-navigation";
import type { CadCommandLineEntry } from "./CadCommandLine";

/** Lo que el anfitrión necesita del editor para que un comando surta efecto. */
export interface CadCommandEngineBridge {
  /** Contexto vivo en el momento de despachar: selección, capa, cursor. */
  context(): CadCommandContext;
  /** Aplica un lote como UNA transacción y UN paso de deshacer. */
  apply(commands: readonly CadEntityCommand[], label: string): void;
  /** Geometría transitoria bajo el cursor. */
  preview(paths: readonly CadPreviewPath[]): void;
  /** Modos de captura forzados para la próxima designación. */
  osnapOverride(modes: readonly SnapType[] | null): void;
  /** Forma del cursor del viewport. */
  cursor(shape: "crosshair" | "pick" | "none"): void;
  /**
   * Encuadre: ZOOM, PAN, VIEW y REGEN. Devuelve el renglón que hay que enseñar
   * —«ZOOM Extensión», «No hay ninguna vista previa que recuperar»— porque la
   * respuesta depende del dibujo y del lienzo, que el motor no ve.
   *
   * `null` significa «aquí no hay dónde encuadrar»: un guion sin lienzo, una
   * prueba del motor. Se distingue de una cadena vacía a propósito, y se dice
   * en voz alta en vez de fingir que se encuadró.
   *
   * Puede faltar entero, y entonces vale lo mismo que devolver `null`.
   */
  view?(request: CadViewRequest): string | null;
  /**
   * Trabajo fuera del documento: trazar, publicar, cambiar de espacio. Mismo
   * contrato que `view`: el renglón a mostrar, o `null` si no hay quien lo
   * atienda.
   */
  host?(request: CadHostRequest): string | null;
}

export interface CadCommandEngineSnapshot {
  prompt: CadPrompt | null;
  history: readonly CadCommandLineEntry[];
  activeCommand: string | null;
  lastCommand: string | null;
}

/** Renglones que se conservan del diálogo. Más allá no aporta y ocupa. */
const MAX_HISTORY = 60;

export class CadCommandEngineHost {
  private state: CadCommandEngineState = EMPTY_CAD_COMMAND_ENGINE;
  private history: CadCommandLineEntry[] = [];
  private snapshot: CadCommandEngineSnapshot = {
    prompt: null,
    history: [],
    activeCommand: null,
    lastCommand: null,
  };
  private readonly listeners = new Set<() => void>();
  /**
   * Rastro de sesión que los comandos LEEN y sólo el anfitrión escribe.
   *
   * Está aquí y no dentro del motor porque el motor es un reductor puro que no
   * ve el resultado de aplicar un lote; el anfitrión sí, porque es quien lo
   * aplica. Y está aquí y no en un módulo global porque un global lo compartiría
   * entre editores abiertos: dos dibujos, dos «cota anterior» distintas.
   */
  private session: CadCommandSession = {};

  constructor(
    private readonly registry: CadCommandRegistry,
    private readonly bridge: CadCommandEngineBridge,
  ) {}

  /** El contexto del editor MÁS lo que esta sesión recuerda. */
  private context(): CadCommandContext {
    return { ...this.bridge.context(), session: this.session };
  }

  /**
   * Anota la última cota creada por el lote que se acaba de aplicar.
   *
   * Se mira el LOTE y no el documento porque el documento no dice cuál de sus
   * cotas es la nueva. Se recorre al revés: si una orden crea varias —`DIM`
   * sobre una selección— la que encadena es la última, igual que en AutoCAD.
   */
  private rememberSession(commands: readonly CadEntityCommand[]): void {
    for (let index = commands.length - 1; index >= 0; index -= 1) {
      const command = commands[index];
      if (command.type !== "insert" || command.entity.type !== "dimension") continue;
      this.session = { ...this.session, lastDimensionId: command.entity.id };
      return;
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * `useSyncExternalStore` compara por identidad y vuelve a leer sin parar, así
   * que devolver un objeto nuevo en cada llamada provocaría un bucle infinito.
   * La instantánea sólo se reconstruye cuando algo cambia de verdad.
   */
  getSnapshot = (): CadCommandEngineSnapshot => this.snapshot;

  private publish(): void {
    this.snapshot = {
      prompt: this.state.active?.step.prompt ?? null,
      history: this.history,
      activeCommand: this.state.active?.name ?? null,
      lastCommand: this.state.lastRepeatable,
    };
    for (const listener of this.listeners) listener();
  }

  private log(text: string, level: CadCommandLineEntry["level"]): void {
    if (!text) return;
    const last = this.history[this.history.length - 1];
    // Un prompt repetido —al reanudar un transparente, por ejemplo— no debe
    // llenar el diálogo con la misma línea dos veces seguidas.
    if (last && last.level === level && last.text === text) return;
    this.history = [...this.history, { text, level }].slice(-MAX_HISTORY);
  }

  /** Texto tecleado en la línea de comandos. */
  submit(value: string): void {
    this.log(value, "input");
    this.dispatch({ kind: "token", value });
  }

  /** Invocación directa: un botón de la barra o un atajo de teclado. */
  invoke(command: string): void {
    this.log(command, "input");
    this.dispatch({ kind: "invoke", command });
  }

  repeat(): void {
    this.dispatch({ kind: "repeat" });
  }

  cancel(): void {
    this.dispatch({ kind: "input", input: { kind: "cancel" } });
  }

  /** Designación en el lienzo, ya resuelta con snap y seguimiento. */
  pickPoint(point: { x: number; y: number }, snap?: SnapType): void {
    this.dispatch({ kind: "input", input: { kind: "point", point, source: "pointer", snap } });
  }

  pickEntity(entityId: string, point: { x: number; y: number }): void {
    this.dispatch({ kind: "input", input: { kind: "entityPick", entityId, point } });
  }

  select(entityIds: readonly string[]): void {
    this.dispatch({ kind: "input", input: { kind: "selection", entityIds } });
  }

  accept(): void {
    this.dispatch({ kind: "input", input: { kind: "enter" } });
  }

  /**
   * Renglón que NO viene de un comando: el resultado de un trabajo asíncrono
   * del anfitrión, típicamente un trazado que acaba de terminar.
   *
   * Existe porque trazar tarda y la línea de comandos no espera: PLOT responde
   * «trazando…» de inmediato y el resultado llega por aquí, con el número de
   * páginas y de fuentes. Sin esta puerta, el usuario se queda mirando un
   * «trazando…» que nunca se resuelve.
   */
  note(text: string, level: "info" | "error" = "info"): void {
    this.log(text, level);
    this.publish();
  }

  get busy(): boolean {
    return this.state.active !== null;
  }

  /** Modos de captura pendientes; el editor los consulta al resolver el snap. */
  get osnapOverride(): readonly SnapType[] | null {
    return this.state.osnapOverride;
  }

  /**
   * Refresca la previsualización sin avanzar el comando. El editor la llama al
   * mover el puntero para que el rubber-band siga al cursor.
   */
  refreshPreview(): void {
    const step = this.state.active?.step;
    if (!step) return;
    const descriptor = this.registry.get(this.state.active!.name);
    if (!descriptor) return;
    // Se vuelve a pedir el paso con el contexto actual; el comando es puro, así
    // que recalcular su previsualización no tiene efectos secundarios.
    const refreshed = descriptor.step(step.state as never, { kind: "text", value: "" }, this.context());
    this.bridge.preview(refreshed.preview ?? []);
  }

  private dispatch(action: CadCommandAction): void {
    const reduction = cadCommandEngineReduce(
      this.state,
      action,
      this.context(),
      this.registry,
    );
    this.state = reduction.state;
    for (const effect of reduction.effects) this.applyEffect(effect);
    this.publish();
  }

  private applyEffect(effect: CadCommandEffect): void {
    switch (effect.kind) {
      case "prompt":
        // El prompt entra al diálogo para que quede el rastro de lo ocurrido,
        // y además se muestra vivo debajo.
        this.log(effect.prompt.message, "prompt");
        return;
      case "execute":
        this.rememberSession(effect.commands);
        this.bridge.apply(effect.commands, effect.label);
        return;
      case "view": {
        // Sin puente de vista el comando no encuadró nada, y eso se dice. Un
        // «ZOOM Extensión» impreso sobre una vista que no se movió es peor que
        // un aviso: enseña a no fiarse del diálogo.
        const answered = this.bridge.view?.(effect.request) ?? null;
        this.log(
          answered ?? `${effect.label} no está disponible sin una vista activa.`,
          answered === null ? "error" : "info",
        );
        return;
      }
      case "host": {
        const answered = this.bridge.host?.(effect.request) ?? null;
        this.log(
          answered ?? `${effect.label} no está disponible en este contexto.`,
          answered === null ? "error" : "info",
        );
        return;
      }
      case "message":
        this.log(effect.text, effect.level === "error" ? "error" : "info");
        return;
      case "preview":
        this.bridge.preview(effect.paths);
        return;
      case "osnapOverride":
        this.bridge.osnapOverride(effect.modes);
        return;
      case "cursor":
        this.bridge.cursor(effect.cursor);
        return;
      case "idle":
        this.bridge.cursor("none");
        return;
      default:
        return;
    }
  }
}
