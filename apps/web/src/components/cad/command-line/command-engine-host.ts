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
  CadCommandDocumentView,
  CadCommandSession,
  CadInputMask,
  CadPreviewPath,
  CadPrompt,
  CadUiRequest,
} from "@/lib/cad/engine/command-types";
import {
  cadActiveUcs,
  cadActiveUcsIsTilted,
  type CadSystemVariableValue,
} from "@/lib/cad/system-variables";
import type { CadNamedUcs } from "@/lib/cad/ucs";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import { CAD_SHARED_CLIPBOARD, cadClipboardContent, type CadClipboard } from "@/lib/cad/clipboard";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { SnapType } from "@/lib/cad/snap-engine";
import type { CadSolidFaceRef } from "@/lib/cad/cad-entities-v5";
import type { CadPoint3 } from "@/lib/cad/cad-document";
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
   * Escribe variables de sistema. Devuelve los renglones que haya que enseñar
   * —una variable rechazada explica por qué— para que el diálogo cuente lo que
   * pasó en vez de tragarse el error.
   */
  variables?(
    patch: Readonly<Record<string, CadSystemVariableValue>>,
    system: boolean,
  ): readonly string[];
  /**
   * Atiende una petición de interfaz. `false` si este espacio de trabajo no
   * sabe abrir esa paleta; el anfitrión lo dice con el texto que trae la propia
   * petición, que para eso lo trae.
   */
  ui?(request: CadUiRequest): boolean;
  /**
   * Deja designado exactamente esto. `false` si este anfitrión no sostiene la
   * selección — QSELECT lo dice entonces con el número de coincidencias, que es
   * la mitad de la respuesta, en vez de fingir que ha designado algo.
   */
  select?(entityIds: readonly string[]): boolean;
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
  /**
   * ADDSELECTED en marcha: la orden encadenada y las variables que hay que
   * devolver cuando termine. Se comprueba al final de cada despacho, que es el
   * único momento en que el anfitrión sabe si el motor sigue ocupado.
   */
  private chained: { command: string; restore: Record<string, CadSystemVariableValue> } | null = null;
  private pendingChain: Extract<CadHostRequest, { kind: "chain-command" }> | null = null;

  /**
   * El portapapeles de geometría (Ola D, 2026-09-02). Por defecto el de la
   * pestaña, compartido entre editores —copiar en un dibujo y pegar en otro es
   * su razón de ser—; las specs montan el suyo para no pisarse.
   */
  constructor(
    private readonly registry: CadCommandRegistry,
    private readonly bridge: CadCommandEngineBridge,
    private readonly clipboard: CadClipboard = CAD_SHARED_CLIPBOARD,
  ) {}

  /** El contexto del editor MÁS lo que esta sesión recuerda y el portapapeles. */
  private context(): CadCommandContext {
    return { ...this.bridge.context(), session: this.session, clipboard: this.clipboard };
  }

  /**
   * COPYCLIP, CUTCLIP y COPYBASE: el comando designó; aquí se leen las
   * entidades, se guardan con su punto base y, al cortar, se borran los
   * originales como UN lote y UN paso de deshacer. Devuelve el renglón que el
   * diálogo enseña, con la negativa cuando no había nada canónico que copiar.
   */
  private clipboardRequest(request: Extract<CadHostRequest, { kind: "clipboard" }>): string {
    const context = this.bridge.context();
    const entities = request.entityIds.flatMap((id) => {
      const entity = context.entity?.(id);
      return entity ? [entity] : [];
    });
    const content = cadClipboardContent(
      entities,
      context.blocks?.() ?? [],
      request.basePoint,
      request.op,
      context.document?.(),
    );
    if (typeof content === "string") return `${request.op === "cut" ? "CUTCLIP" : "COPYCLIP"}: ${content}`;
    this.clipboard.write(content);
    if (request.op === "cut")
      this.bridge.apply(
        content.entities.map((entity): CadEntityCommand => ({ type: "delete", entityId: entity.id })),
        "CUTCLIP",
      );
    const base = `${content.basePoint.x}, ${content.basePoint.y}`;
    return request.op === "cut"
      ? `${content.entities.length} objeto(s) cortado(s) al portapapeles; punto base ${base}.`
      : `${content.entities.length} objeto(s) copiado(s) al portapapeles; punto base ${base}.`;
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

  /**
   * Vista de SÓLO LECTURA del dibujo, para quien acompaña.
   *
   * La usa el recorrido guiado, que necesita saber si ya hay un muro y una
   * puerta sin importarle por qué camino entraron —paleta, línea de comandos o
   * barra de herramientas—. Se expone la MISMA vista que reciben los comandos de
   * gestión, no el documento: un acompañante no tiene por qué poder escribir en
   * el dibujo, y con el documento entero podría.
   *
   * `null` cuando el anfitrión no la aporta, que es lo que hacen las specs del
   * motor montadas con un puente de tres líneas.
   */
  documentView = (): CadCommandDocumentView | null =>
    this.bridge.context().document?.() ?? null;

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
    // Un volcado de LIST o de MASSPROP son quince renglones, no un párrafo. Se
    // parten aquí y no en el comando para que el comando siga devolviendo UN
    // resultado —que es lo que el motor sabe manejar— y el diálogo siga
    // guardando UN renglón por línea, que es lo que su historial cuenta.
    if (text.includes("\n")) {
      for (const line of text.split("\n")) this.log(line, level);
      return;
    }
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

  /**
   * Contenido de un ARCHIVO que el usuario acaba de elegir, para el comando en
   * curso. No pasa por `submit` a propósito, y no es un capricho de estilo:
   *
   * · `submit` ESCRIBE lo recibido en el diálogo, y `log` parte por saltos de
   *   línea. Un DXF de cinco megas se convertiría en cien mil renglones de
   *   historia — la pestaña se queda sin memoria antes de terminar de pintarla.
   * · `submit` pasa el texto por el pipeline de entrada, que primero intenta
   *   leerlo como palabra clave, luego como coordenada y luego como distancia.
   *   Un archivo no es nada de eso.
   *
   * Lo que se registra es que se cargó un archivo y cuánto ocupa, que es lo que
   * el usuario necesita ver; el contenido va derecho al paso activo.
   */
  feedFile(name: string, text: string): void {
    this.log(`${name} (${text.length} caracteres)`, "input");
    this.dispatch({ kind: "input", input: { kind: "text", value: text } });
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
  /**
   * `z` opcional y declarada, no colada por tipado estructural: con un SCU
   * inclinado el punto del ratón trae cota, y `flat()` de los comandos de
   * dibujo la escribe en la entidad. Omitirla del tipo era lo que hacía que
   * `LINE` fuese «espacial» sin que nadie lo hubiera decidido.
   */
  pickPoint(point: { x: number; y: number; z?: number }, snap?: SnapType): void {
    this.dispatch({ kind: "input", input: { kind: "point", point, source: "pointer", snap } });
  }

  pickEntity(entityId: string, point: { x: number; y: number }): void {
    this.dispatch({ kind: "input", input: { kind: "entityPick", entityId, point } });
  }

  /**
   * Designación de una CARA de sólido, ya resuelta por el rayo de cámara.
   *
   * Entra por la MISMA puerta que todo lo demás —`dispatch`— y no por un canal
   * propio: el enrutador del puntero tiene una regla dura, «cuando el motor
   * tiene un comando activo, la máquina heredada no recibe nada», y un segundo
   * canal sería una segunda máquina escuchando el clic. La huella y la normal
   * las calcula quien ve la geometría (el anfitrión de designación 3D); aquí
   * sólo viajan.
   */
  pickFace(input: {
    entityId: string;
    face: CadSolidFaceRef;
    point: CadPoint3;
    normal: CadPoint3;
  }): void {
    this.dispatch({ kind: "input", input: { kind: "facePick", ...input } });
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
   *
   * La usa por lo mismo quien ejecuta un `.scr`: los avisos del script —«la
   * línea 7 abre un cuadro»— no son la respuesta de ningún comando y tienen que
   * salir por el mismo sitio o el usuario no los ve.
   */
  note(text: string, level: "info" | "error" = "info"): void {
    this.log(text, level);
    this.publish();
  }

  get busy(): boolean {
    return this.state.active !== null;
  }

  /**
   * Máscara `CAD_ACCEPT_*` del paso activo; 0 en reposo. Es lo que permite al
   * enrutador del puntero decidir si un clic es un PUNTO o una ENTIDAD sin
   * conocer el comando: la pregunta es del paso, y el paso ya la responde.
   */
  get accepts(): CadInputMask {
    return this.state.active?.step.accepts ?? 0;
  }

  /** Modos de captura pendientes; el editor los consulta al resolver el snap. */
  get osnapOverride(): readonly SnapType[] | null {
    return this.state.osnapOverride;
  }

  /**
   * El plano sobre el que hay que resolver el punto del ratón, o `null` cuando
   * es el del suelo.
   *
   * Vive junto a `accepts` y `osnapOverride` por la misma razón que ellos: el
   * enrutador del puntero necesita decidir sin conocer el comando, y la
   * pregunta —¿dónde cae el cursor?— la responde el SCU activo, no el comando.
   *
   * Devuelve `null`, y no el marco universal, cuando el SCU está en el plano del
   * mundo. Dos motivos, y ninguno es cosmético. El primero es el coste: esto se
   * consulta en CADA `pointermove`, y `cadActiveUcsIsTilted` responde con cinco
   * lecturas mientras que componer el marco entero mete dos productos
   * vectoriales y una raíz cuadrada en el camino del ratón —por eso esa función
   * existe—. El segundo es que `null` deja al llamador tomar el camino de
   * siempre, bit a bit, en vez de uno equivalente: la intersección con el suelo
   * la resuelve THREE y una aritmética distinta movería el punto imantado en los
   * goldens, que corren en 3D.
   */
  get workPlane(): CadNamedUcs | null {
    const variables = this.bridge.context().variables;
    if (!variables || !cadActiveUcsIsTilted(variables)) return null;
    return cadActiveUcs(variables);
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
    // ADDSELECTED: la orden encadenada arranca DESPUÉS de aplicar los efectos
    // de la que la pidió —no en medio, que reentraría en este mismo bucle— y
    // las variables vuelven a su valor cuando el motor queda libre.
    if (this.pendingChain) {
      const request = this.pendingChain;
      this.pendingChain = null;
      this.startChain(request);
    } else if (this.chained && !this.state.active) {
      const { restore } = this.chained;
      this.chained = null;
      this.bridge.variables?.(restore, false);
    }
    this.publish();
  }

  private startChain(request: Extract<CadHostRequest, { kind: "chain-command" }>): void {
    const access = this.bridge.context().variables;
    if (!this.bridge.variables || !access) {
      this.log("Este espacio de trabajo no sostiene las variables de sistema; ADDSELECTED no puede fijar capa, color ni tipo de línea.", "error");
      return;
    }
    const restore: Record<string, CadSystemVariableValue> = {};
    for (const name of Object.keys(request.variables)) {
      const current = access.get(name);
      if (current !== undefined) restore[name] = current;
    }
    for (const line of this.bridge.variables(request.variables, false)) this.log(line, "info");
    this.chained = { command: request.command, restore };
    this.log(`ADDSELECTED: ${request.command} con capa ${String(request.variables.CLAYER)}, color ${String(request.variables.CECOLOR)}, tipo de línea ${String(request.variables.CELTYPE)}.`, "info");
    this.dispatch({ kind: "invoke", command: request.command });
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
        if (effect.request.kind === "chain-command") {
          this.pendingChain = effect.request;
          return;
        }
        if (effect.request.kind === "clipboard") {
          const answered = this.clipboardRequest(effect.request);
          this.log(answered, answered.includes(": no ") || answered.includes(": lo ") ? "error" : "info");
          return;
        }
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
      case "variables": {
        if (!this.bridge.variables) {
          this.log(
            "Este espacio de trabajo no sostiene las variables de sistema; el cambio no se ha aplicado.",
            "error",
          );
          return;
        }
        for (const line of this.bridge.variables(effect.patch, effect.system))
          this.log(line, "info");
        return;
      }
      case "ui":
        // Que nadie sepa abrir la paleta NO es un fallo del comando: es un
        // espacio de trabajo que todavía no la monta. Se dice con el texto que
        // trae la petición, que nombra lo que el usuario se pierde.
        if (!this.bridge.ui?.(effect.request)) this.log(effect.request.unavailable, "error");
        return;
      case "selection":
        if (!this.bridge.select?.(effect.entityIds))
          this.log(
            `Este espacio de trabajo no sostiene la designación desde la línea de comandos: ` +
              `${effect.entityIds.length} objeto(s) casan con el filtro, pero no se han designado.`,
            "error",
          );
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
