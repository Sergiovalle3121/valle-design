/**
 * El subsistema AutoLISP, ENCHUFADO al editor.
 *
 * Hasta este cambio `lib/lisp/` era un intérprete completo —lector, evaluador,
 * funciones de entidad por códigos DXF, sandbox con presupuesto, DCL, plugins—
 * que **nadie importaba**. Un intérprete que no se puede invocar vale cero: el
 * veterano que trae veinte años de rutinas `.lsp` no las puede ni cargar.
 *
 * Esta clase es la que lo conecta, y hace exactamente cuatro cosas:
 *
 *  1. Guarda la biblioteca de la organización y la valida al subir.
 *  2. Sabe qué comandos `c:` aporta cada fichero cargado.
 *  3. Crea las ejecuciones, ya atadas al documento vivo del editor.
 *  4. Publica el histórico, las variables y los errores para la consola.
 *
 * ## Lo que NO hace, y es lo importante
 *
 * **No escribe en el documento.** Ni una línea. La ejecución acumula un lote de
 * `CadEntityCommand` en `CadDocumentLispHost`, y quien lo aplica es el motor de
 * comandos por su efecto `execute`, que acaba en el `commitNativeCommands` del
 * editor. Un lote, un `commitChange`, UN paso de deshacer. Si esta clase
 * importase `commitChange` habría dos rutas de mutación, que es la propiedad
 * que el producto no puede perder.
 *
 * ## Por qué la biblioteca se recarga en CADA invocación
 *
 * Porque el presupuesto es por ejecución. El medidor queda envenenado cuando se
 * agota —a propósito: es lo que impide que una rutina siga computando después
 * del corte—, así que un intérprete compartido entre invocaciones se moriría
 * entero con la primera rutina que se pasara de la raya. Se paga recargar los
 * fuentes; a cambio, una rutina hostil no puede dejar la sesión inservible.
 *
 * Lo que sí sobrevive son las variables globales, que se arrastran a mano
 * (`carried`). Sin eso, teclear `(setq a 5)` y luego `a` daría `nil`, y una
 * consola así no es una consola.
 */
import type { CadDocument } from "@/lib/cad/cad-document";
import { CAD_LISP_BUILTINS } from "@/lib/lisp/cad-builtins";
import {
  InteractiveLispRun,
  type LispTurn,
} from "@/lib/lisp/interactive";
import { LIBRARY_READER, normalizeLispFileName } from "@/lib/lisp/builtins/loader";
import { COMMAND_REGISTRY } from "@/lib/lisp/builtins/interaction";
import type { CadCommandRegistry } from "@/lib/cad/engine/command-engine";
import {
  InMemoryLispLibraryStore,
  commandInventory,
  removeLispFile,
  uploadLispFile,
  validateLispSource,
  type LispLibraryFile,
  type LispLibraryStore,
} from "@/lib/lisp/library";
import { printLisp } from "@/lib/lisp/printer";
import type { LispFailure } from "@/lib/lisp/session";
import type { LispValue } from "@/lib/lisp/values";
import { BrowserLispLibraryStore, browserKeyValueStorage } from "./library-storage";

/** Lo que el editor le presta al subsistema. Sólo lectura salvo los ids. */
export interface CadLispDocumentSource {
  /** Documento canónico vivo. `null` mientras no haya dibujo abierto. */
  document(): CadDocument | null;
  activeLayer(): string;
  newEntityId(): string;
}

export type CadLispEntryLevel = "input" | "value" | "output" | "error" | "info";

export interface CadLispEntry {
  /** Serie de la sesión. Sirve de clave estable en la lista de React. */
  id: number;
  level: CadLispEntryLevel;
  text: string;
  /** De dónde salió: el comando, el fichero o «consola». */
  origin?: string;
}

/**
 * Un error con su traza.
 *
 * AutoLISP no tiene pila de llamadas que enseñar y este intérprete tampoco la
 * fabrica, así que «traza» aquí es lo que el anfitrión SÍ sabe con certeza: qué
 * se invocó, qué ficheros estaban cargados, qué llevaba escrito la rutina antes
 * de romperse y en qué estado quedó el presupuesto. Inventar una pila de
 * funciones LISP sería más bonito y sería mentira.
 */
export interface CadLispTrace {
  invoke: string;
  origin: string;
  kind: LispFailure["kind"];
  reason?: string;
  message: string;
  /** Ficheros cargados en el momento del fallo, en orden de carga. */
  loaded: readonly string[];
  /** Lo que la rutina alcanzó a escribir. */
  output: string;
  /** Escrituras al documento que se descartaron por el fallo. */
  discardedCommands: number;
}

export interface CadLispVariable {
  name: string;
  value: string;
  /** `true` cuando la sesión tapó un nombre de sistema (`car`, `setq`…). */
  shadowsBuiltin: boolean;
}

export interface CadLispSnapshot {
  /** La consola está abierta. */
  open: boolean;
  files: readonly LispLibraryFile[];
  /** Comandos `c:` que la biblioteca ofrece, en mayúsculas y ordenados. */
  commands: readonly string[];
  /** Dos ficheros declarando el mismo comando. Gana el último cargado. */
  collisions: readonly { command: string; files: readonly string[] }[];
  transcript: readonly CadLispEntry[];
  variables: readonly CadLispVariable[];
  lastTrace: CadLispTrace | null;
  /** Invocación en curso, si la hay. */
  running: string | null;
  /** Problemas del almacén: cuota, JSON corrupto. */
  storageProblems: readonly string[];
  /**
   * Serie del último APPLOAD. La consola abre el selector de fichero cuando
   * sube; es un CONTADOR y no un booleano para que dos APPLOAD seguidos lo
   * abran dos veces sin necesidad de que nadie lo rearme.
   */
  filePickerRequest: number;
}

/** Renglones que se conservan. Más allá no aporta y ocupa. */
const MAX_TRANSCRIPT = 200;

/** Variables que se arrastran entre invocaciones. Tope para no crecer sin fin. */
const MAX_CARRIED = 512;

export interface CadLispIdentity {
  /** Organización. Separa las bibliotecas en el almacén. */
  tenantId?: string | null;
  /** Quién sube. Queda escrito en el fichero, junto a la fecha. */
  userId?: string | null;
}

export interface CadLispRuntimeOptions {
  /**
   * Identidad, LEÍDA en cada uso y no capturada.
   *
   * La sesión se resuelve por red después del primer render, así que capturarla
   * al construir el runtime dejaría la biblioteca de todo el mundo bajo `anon`.
   */
  identity?: () => CadLispIdentity;
  store?: LispLibraryStore;
  /** Reloj, inyectado: las specs no dependen de `Date`. */
  now?: () => number;
}

export class CadLispRuntime {
  private readonly store: LispLibraryStore;
  private readonly listeners = new Set<() => void>();
  private transcript: CadLispEntry[] = [];
  private variables: readonly CadLispVariable[] = [];
  private carried = new Map<string, LispValue>();
  private lastTrace: CadLispTrace | null = null;
  private running: string | null = null;
  private openState = false;
  private serial = 0;
  private filePickerRequest = 0;
  private source: CadLispDocumentSource | null = null;
  private registry: CadCommandRegistry | null = null;
  private snapshot: CadLispSnapshot;

  constructor(private readonly options: CadLispRuntimeOptions = {}) {
    const storage = options.store ? null : browserKeyValueStorage();
    this.store =
      options.store ?? (storage ? new BrowserLispLibraryStore(storage) : new InMemoryLispLibraryStore());
    this.snapshot = this.build();
  }

  // --- suscripción -----------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * `useSyncExternalStore` compara por identidad y vuelve a leer sin parar, así
   * que devolver un objeto nuevo en cada llamada sería un bucle infinito de
   * renders. La instantánea se reconstruye sólo cuando algo cambia.
   */
  getSnapshot = (): CadLispSnapshot => this.snapshot;

  /** El editor presta el documento vivo. Sin esto, ejecutar dice que no puede. */
  bind(source: CadLispDocumentSource): void {
    this.source = source;
  }

  /**
   * El registro COMPUESTO, para que `(command "MICOMANDO")` alcance también las
   * rutinas del estudio. Se ata después de construir porque el registro necesita
   * este objeto para existir: es una referencia mutua y sólo una de las dos
   * puede ir en el constructor.
   */
  attachCommandRegistry(registry: CadCommandRegistry): void {
    this.registry = registry;
  }

  /** APPLOAD pide el selector de fichero del navegador. La consola lo abre. */
  requestFilePicker(): void {
    this.filePickerRequest += 1;
    this.publish();
  }

  /** Qué fichero declara un comando `c:`. Para el histórico y la consola. */
  fileOf(command: string): string | undefined {
    const wanted = command.trim().toUpperCase();
    return [...this.files()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .reverse()
      .find((file) => file.commands.some((entry) => entry.toUpperCase() === wanted))?.name;
  }

  get tenantId(): string {
    return this.options.identity?.().tenantId || "anon";
  }

  // --- biblioteca ------------------------------------------------------------

  files(): readonly LispLibraryFile[] {
    return this.store.read(this.tenantId);
  }

  /**
   * Fuentes en ORDEN DE CARGA (alfabético por nombre), que es el que
   * `autoloadOrder` fija y por la misma razón: si el orden dependiera de cuándo
   * se subió cada fichero, una biblioteca funcionaría o no según el historial de
   * la organización.
   */
  sources(): string[] {
    return [...this.files()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((file) => file.source);
  }

  /** Comandos `c:` ofrecidos, en MAYÚSCULAS, sin repetir. */
  commandNames(): string[] {
    const names = new Set<string>();
    for (const file of this.files())
      for (const command of file.commands) names.add(command.toUpperCase());
    return [...names].sort();
  }

  hasCommand(name: string): boolean {
    const wanted = name.trim().toUpperCase();
    return this.files().some((file) =>
      file.commands.some((command) => command.toUpperCase() === wanted),
    );
  }

  /**
   * Sube o reemplaza un fichero. Devuelve el problema en vez de lanzarlo: quien
   * llama es un manejador de la interfaz y un `.lsp` con un paréntesis sin
   * cerrar no es una excepción, es un mensaje para el usuario.
   */
  load(name: string, source: string): { ok: boolean; problem?: string; file?: LispLibraryFile } {
    const validation = validateLispSource(source);
    if (!validation.ok) {
      const problem = `${name}: ${validation.problem ?? "no se pudo leer"}`;
      this.log("error", problem, "APPLOAD");
      this.publish();
      return { ok: false, problem };
    }
    let result;
    try {
      result = uploadLispFile(this.store, {
        tenantId: this.tenantId,
        name: normalizeLispFileName(name),
        source,
        updatedBy: this.options.identity?.().userId || "anon",
        now: new Date(this.options.now?.() ?? Date.now()).toISOString(),
        autoload: true,
      });
    } catch (cause) {
      // El almacén rechazó la escritura (cuota). `BrowserLispLibraryStore` deja
      // el fichero en su caché, así que la rutina SÍ se puede usar en esta
      // sesión; lo que no sobrevive es cerrar la pestaña, y eso se dice.
      const problem = cause instanceof Error ? cause.message : String(cause);
      this.log("error", problem, "APPLOAD");
      this.publish();
      return { ok: false, problem };
    }
    if (!result.ok) {
      this.log("error", result.problem, "APPLOAD");
      this.publish();
      return { ok: false, problem: result.problem };
    }
    const offered = result.file.commands.length
      ? ` · comandos: ${result.file.commands.map((command) => command.toUpperCase()).join(", ")}`
      : " · no declara ningún comando c:";
    this.log(
      "info",
      `${result.file.name} v${result.file.version}${result.unchanged ? " (sin cambios)" : ""}${offered}`,
      "APPLOAD",
    );
    this.publish();
    return { ok: true, file: result.file };
  }

  unload(name: string): boolean {
    const removed = removeLispFile(this.store, this.tenantId, name);
    if (removed) this.log("info", `${name} descargado.`, "APPLOAD");
    this.publish();
    return removed;
  }

  // --- consola ---------------------------------------------------------------

  get open(): boolean {
    return this.openState;
  }

  show = (): void => {
    if (this.openState) return;
    this.openState = true;
    this.publish();
  };

  close = (): void => {
    if (!this.openState) return;
    this.openState = false;
    this.publish();
  };

  toggle = (): void => {
    this.openState = !this.openState;
    this.publish();
  };

  clearTranscript = (): void => {
    this.transcript = [];
    this.lastTrace = null;
    this.publish();
  };

  /** Olvida las variables arrastradas. Es el `(setq)` masivo que no existe. */
  resetVariables = (): void => {
    this.carried = new Map();
    this.variables = [];
    this.log("info", "Variables de sesión olvidadas.", "consola");
    this.publish();
  };

  log(level: CadLispEntryLevel, text: string, origin?: string): void {
    if (!text) return;
    this.serial += 1;
    this.transcript = [
      ...this.transcript,
      { id: this.serial, level, text, ...(origin ? { origin } : {}) },
    ].slice(-MAX_TRANSCRIPT);
  }

  // --- ejecución -------------------------------------------------------------

  /**
   * Prepara una ejecución sobre el documento vivo.
   *
   * Devuelve el problema en vez de lanzarlo porque el llamante es una máquina de
   * estados del motor de comandos, y un comando que lanza deja el motor
   * limpiando el desastre con un mensaje genérico en vez del que toca.
   */
  createRun(invoke: string, origin: string): { run: InteractiveLispRun } | { problem: string } {
    const source = this.source;
    if (!source)
      return {
        problem:
          "El subsistema LISP no está atado a ningún editor todavía. Abre un dibujo y vuelve a intentarlo.",
      };
    const document = source.document();
    if (!document)
      return { problem: "No hay ningún dibujo abierto sobre el que ejecutar la rutina." };

    const run = new InteractiveLispRun({
      document,
      sources: this.sources(),
      activeLayer: source.activeLayer(),
      newEntityId: () => source.newEntityId(),
      seedGlobals: this.carried,
      state: [
        // `(command …)` despacha por el registro COMPUESTO cuando lo hay, para
        // que una rutina pueda llamar a otra rutina `.lsp` igual que llama a
        // LINE. Sin esta línea vería sólo los comandos nativos.
        [COMMAND_REGISTRY, this.registry as unknown],
        // `(load "utiles")` lee de la biblioteca de la organización, no del
        // disco: el intérprete no alcanza el disco por diseño.
        [LIBRARY_READER, (name: string) => this.readSource(name)],
      ],
    });
    this.running = invoke;
    this.log("input", invoke, origin);
    this.publish();
    return { run };
  }

  /**
   * Cierra una ejecución: apunta el resultado, arrastra las variables y publica.
   * Se llama UNA vez por ejecución, con el turno final.
   */
  settle(run: InteractiveLispRun, turn: LispTurn, invoke: string, origin: string): void {
    this.running = null;
    const output = run.output.trim();
    if (output) this.log("output", output, origin);

    if (turn.kind === "done") {
      this.log("value", printLisp(turn.value), origin);
      this.lastTrace = null;
      this.absorbGlobals(run);
    } else if (turn.kind === "failed") {
      this.log("error", turn.failure.message, origin);
      this.lastTrace = {
        invoke,
        origin,
        kind: turn.failure.kind,
        ...(turn.failure.reason ? { reason: turn.failure.reason } : {}),
        message: turn.failure.message,
        loaded: this.files().map((file) => `${file.name} v${file.version}`),
        output: run.output,
        discardedCommands: run.commands.length,
      };
      // Un corte de presupuesto NO arrastra sus variables. Una rutina que se
      // comió cuatro millones de celdas dejó ligada una lista de cuatro millones
      // de celdas, y arrastrarla envenenaría la siguiente invocación con el
      // trabajo de la anterior. Un error corriente sí las arrastra, como
      // AutoLISP.
      if (turn.failure.kind === "error") this.absorbGlobals(run);
    }
    this.publish();
  }

  /** Publica el prompt vivo de una rutina que está esperando una respuesta. */
  noteAsk(message: string, origin: string): void {
    this.log("info", message, origin);
    this.publish();
  }

  private absorbGlobals(run: InteractiveLispRun): void {
    const globals = run.globals();
    if (globals.size > MAX_CARRIED) {
      this.log(
        "info",
        `La rutina dejó ${globals.size} símbolos definidos y sólo se arrastran ${MAX_CARRIED}: ` +
          `se olvidan todos en vez de quedarnos con una mitad arbitraria.`,
        "consola",
      );
      this.carried = new Map();
    } else {
      this.carried = globals;
    }
    this.variables = [...this.carried.entries()]
      .map(([name, value]) => ({
        name,
        value: printLisp(value),
        shadowsBuiltin: SYSTEM_NAMES.has(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private readSource(name: string): string | undefined {
    const wanted = normalizeLispFileName(name);
    return this.files().find((file) => normalizeLispFileName(file.name) === wanted)?.source;
  }

  private build(): CadLispSnapshot {
    const inventory = commandInventory(this.store, this.tenantId);
    const problems =
      this.store instanceof BrowserLispLibraryStore
        ? this.store.problems.map(
            (problem) => `${problem.operation === "read" ? "Lectura" : "Escritura"}: ${problem.message}`,
          )
        : [];
    return {
      open: this.openState,
      files: this.files(),
      commands: this.commandNames(),
      collisions: inventory.collisions,
      transcript: this.transcript,
      variables: this.variables,
      lastTrace: this.lastTrace,
      running: this.running,
      storageProblems: problems,
      filePickerRequest: this.filePickerRequest,
    };
  }

  private publish(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }
}

/**
 * Nombres de sistema que una rutina puede tapar. Se leen de la tabla REAL, no
 * de una lista escrita a mano: una lista a mano se queda desfasada en cuanto
 * alguien añade un builtin, y entonces la consola dejaría de avisar justo del
 * caso que importa.
 */
const SYSTEM_NAMES: ReadonlySet<string> = new Set(CAD_LISP_BUILTINS.keys());
