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
import { fingerprintLispSource } from "@/lib/lisp/library";
import { CAD_LISP_FACTORY_ROUTINES } from "@/lib/lisp/factory/factory-library";
import { BrowserLispLibraryStore, browserKeyValueStorage } from "./library-storage";

/** Lo que el runtime necesita preguntarle al registro compuesto. */
export interface CadLispCommandGuard {
  /** `true` si el nombre ya lo ocupa un comando nativo, que siempre gana. */
  isNative(name: string): boolean;
}

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
  /**
   * Las rutinas de FÁBRICA. Van aparte de `files` porque no son de la
   * organización: no se suben, no se descargan y no ocupan su cuota. Están
   * siempre, y la interfaz tiene que poder decirlo — una lista que las mezclase
   * con las del estudio invitaría a intentar borrarlas.
   */
  factory: readonly LispLibraryFile[];
  /** Comandos `c:` que la biblioteca ofrece, en mayúsculas y ordenados. */
  commands: readonly string[];
  /** Dos ficheros declarando el mismo comando. Gana el último cargado. */
  collisions: readonly { command: string; files: readonly string[] }[];
  /** Comandos `c:` que un nativo tapa. Se anuncian; no se pueden ejecutar. */
  shadowedByNative: readonly string[];
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

/**
 * Las rutinas de fábrica, ya validadas, en forma de fichero de biblioteca.
 *
 * Se construyen UNA vez al cargar el módulo: son constantes del producto y
 * validarlas en cada sesión sería pagar el lector de LISP por algo que no puede
 * cambiar entre dos renders. La validación no sobra —es la que detecta el
 * paréntesis que alguien dejó abierto al editar el `.lsp`— y el `factory.spec.ts`
 * la vuelve a hacer con aserciones.
 *
 * `tenantId` va vacío a propósito: no son de nadie. Lo que las hace de la
 * organización es lo que la organización cargue ENCIMA, que gana por cargarse
 * después (véase `sources`).
 */
const FACTORY_FILES: readonly LispLibraryFile[] = CAD_LISP_FACTORY_ROUTINES.map((routine) => {
  const validation = validateLispSource(routine.source);
  return {
    id: `lsp:factory:${routine.name}`,
    tenantId: "",
    name: routine.name,
    source: routine.source,
    version: 1,
    fingerprint: fingerprintLispSource(routine.source),
    updatedAt: "",
    updatedBy: "Valle Design",
    autoload: true,
    // Una rutina de fábrica con la sintaxis rota no ofrece comandos, y la spec
    // lo cazará; lo que no puede hacer es tumbar el arranque del subsistema.
    commands: validation.ok ? validation.commands : [],
  };
});

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
  /** Ejecución en curso, para poder cerrarla si el usuario la abandona. */
  private active: { run: InteractiveLispRun; invoke: string; origin: string } | null = null;
  private registry: (CadCommandRegistry & Partial<CadLispCommandGuard>) | null = null;
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
  attachCommandRegistry(registry: CadCommandRegistry & Partial<CadLispCommandGuard>): void {
    this.registry = registry;
  }

  /**
   * Comandos de la biblioteca que un nativo del mismo nombre deja
   * INALCANZABLES. El producto siempre gana —un `.lsp` de un proveedor no puede
   * secuestrar LINE—, y eso es lo correcto; lo que no puede ser es que ocurra en
   * silencio.
   */
  shadowedByNative(): string[] {
    const guard = this.registry;
    if (!guard?.isNative) return [];
    return this.commandNames().filter((command) => guard.isNative!(command));
  }

  /** APPLOAD pide el selector de fichero del navegador. La consola lo abre. */
  requestFilePicker(): void {
    this.filePickerRequest += 1;
    this.publish();
  }

  /** Qué fichero declara un comando `c:`. Para el histórico y la consola. */
  fileOf(command: string): string | undefined {
    const wanted = command.trim().toUpperCase();
    // Se mira PRIMERO lo de la organización y en orden inverso de carga, porque
    // gana el último cargado; la fábrica es el último recurso, igual que en la
    // precedencia real de `sources`.
    const owner = [...this.files()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .reverse()
      .find((file) => file.commands.some((entry) => entry.toUpperCase() === wanted));
    return (
      owner?.name ??
      this.factoryFiles().find((file) =>
        file.commands.some((entry) => entry.toUpperCase() === wanted),
      )?.name
    );
  }

  get tenantId(): string {
    return this.options.identity?.().tenantId || "anon";
  }

  // --- biblioteca ------------------------------------------------------------

  files(): readonly LispLibraryFile[] {
    return this.store.read(this.tenantId);
  }

  /** Las rutinas de fábrica. Están siempre y no son de ninguna organización. */
  factoryFiles(): readonly LispLibraryFile[] {
    return FACTORY_FILES;
  }

  /**
   * Fuentes en ORDEN DE CARGA (alfabético por nombre), que es el que
   * `autoloadOrder` fija y por la misma razón: si el orden dependiera de cuándo
   * se subió cada fichero, una biblioteca funcionaría o no según el historial de
   * la organización.
   *
   * Las de FÁBRICA van primero, y eso decide quién gana: una redefinición se
   * queda con la ÚLTIMA carga, así que un despacho que escriba su propio
   * `c:CUADROAREAS` tapa el nuestro sin tener que pedirlo ni renombrar nada. Es
   * la precedencia correcta —la casa nunca le gana al estudio en su propio
   * dibujo— y es la contraria a la de los comandos NATIVOS, que sí ganan siempre
   * porque son el producto y no una rutina.
   */
  sources(): string[] {
    return [
      ...this.factoryFiles().map((file) => file.source),
      ...[...this.files()].sort((a, b) => a.name.localeCompare(b.name)).map((file) => file.source),
    ];
  }

  /** Comandos `c:` ofrecidos, en MAYÚSCULAS, sin repetir. Fábrica incluida. */
  commandNames(): string[] {
    const names = new Set<string>();
    for (const file of [...this.factoryFiles(), ...this.files()])
      for (const command of file.commands) names.add(command.toUpperCase());
    return [...names].sort();
  }

  hasCommand(name: string): boolean {
    const wanted = name.trim().toUpperCase();
    return [...this.factoryFiles(), ...this.files()].some((file) =>
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
    const shadowed = result.file.commands
      .map((command) => command.toUpperCase())
      .filter((command) => this.registry?.isNative?.(command));
    if (shadowed.length)
      this.log(
        "error",
        `${result.file.name}: ${shadowed.join(", ")} ya ${shadowed.length === 1 ? "es un comando" : "son comandos"} ` +
          `del producto y el nativo SIEMPRE gana, así que esa rutina no se podrá invocar por ese nombre. ` +
          `Renómbrala en el .lsp (por ejemplo, con un prefijo de estudio) para poder usarla.`,
        "APPLOAD",
      );
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
    if (this.factoryFiles().some((file) => file.name.toLowerCase() === name.toLowerCase())) {
      // Se dice que NO en vez de aparentar que se descargó: la rutina seguiría
      // ahí en la siguiente invocación y el usuario creería que su comando
      // desapareció por otra causa. Para dejar de usar la de fábrica se carga
      // una propia con el mismo `c:`, que la tapa.
      this.log(
        "error",
        `${name} es una rutina de fábrica y no se descarga. Carga una tuya que declare el mismo ` +
          `comando c: y la tuya gana, porque se carga después.`,
        "APPLOAD",
      );
      this.publish();
      return false;
    }
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
    this.abandonActive();
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
    this.active = { run, invoke, origin };
    this.running = invoke;
    this.log("input", invoke, origin);
    this.publish();
    return { run };
  }

  /**
   * Cierra una ejecución que quedó a medias.
   *
   * El motor de comandos atiende el Esc por su cuenta: descarta el comando
   * activo SIN volver a llamar a su `step`, así que la rutina suspendida en un
   * `getpoint` nunca se entera de que la abandonaron. Sin esto quedaría un
   * generador vivo, con su medidor sin envenenar, reanudable por cualquiera que
   * conservase la referencia — y la consola diría «ejecutando» para siempre.
   *
   * Se limpia al empezar la siguiente ejecución en vez de intentar adivinar el
   * Esc: es el momento en el que el abandono es un hecho comprobado.
   */
  private abandonActive(): void {
    const active = this.active;
    this.active = null;
    if (!active || active.run.done) return;
    active.run.cancel(`Se abandonó "${active.invoke}" sin terminar.`);
    this.log("info", `${active.invoke} se abandonó sin terminar.`, active.origin);
    this.running = null;
  }

  /**
   * Cierra una ejecución: apunta el resultado, arrastra las variables y publica.
   * Se llama UNA vez por ejecución, con el turno final.
   */
  settle(run: InteractiveLispRun, turn: LispTurn, invoke: string, origin: string): void {
    this.running = null;
    if (this.active?.run === run) this.active = null;
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
      factory: this.factoryFiles(),
      commands: this.commandNames(),
      collisions: inventory.collisions,
      shadowedByNative: this.shadowedByNative(),
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
