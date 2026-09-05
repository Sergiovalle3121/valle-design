/**
 * API de plugins en JavaScript.
 *
 * Un plugin es lo mismo que una rutina `.lsp` con otra sintaxis: código de un
 * tercero que registra comandos, pinta paneles y toca el dibujo. Y por tanto
 * tiene que estar sujeto a las MISMAS reglas, o el LISP sería el camino
 * vigilado y el JavaScript el atajo.
 *
 * ## Las cinco reglas, y cómo se hacen cumplir
 *
 * **1. El registro es el MISMO.** Un comando de plugin es un
 * `CadCommandDescriptor` corriente: la misma máquina de estados pura que LINE o
 * TRIM, con `begin` y `step`. No hay una segunda clase de comando.
 *
 * Ahora bien, `CAD_COMMAND_REGISTRY_V2` es inmutable a propósito —está escrito
 * en `engine/index.ts`: «un registro que cambia según qué se haya importado
 * antes convierte el comportamiento del producto en una función del orden de
 * los imports»—, así que los plugins NO lo mutan. Se COMPONE: un registro que
 * consulta primero al producto y luego a los plugins, con la misma interfaz
 * `CadCommandRegistry` que ya consume el motor. El resultado es que un comando
 * de plugin se teclea igual, sale en la paleta igual y se conduce desde LISP
 * con `(command "MI-COMANDO" …)` igual — sin que el registro del producto haya
 * cambiado nunca.
 *
 * **2. Un plugin no puede pisar un comando del producto.** El registro
 * compuesto consulta primero al producto, y el registro de plugins RECHAZA al
 * darse de alta un nombre o alias que ya exista. Las dos cosas: sin el rechazo,
 * un plugin creería haber registrado LINE y su comando no saltaría nunca — un
 * fallo mudo que el autor descubre en una demo.
 *
 * **3. La escritura sale por la misma puerta.** `PluginDocumentApi` no expone
 * `commitChange` ni el documento mutable: expone `apply(CadEntityCommand[])`,
 * que es el puerto del anfitrión. Un plugin no puede saltarse
 * `commitNativeCommands` porque no tiene con qué.
 *
 * **4. Lo que puede hacer lo DECLARA, y se le hace cumplir.** El manifiesto v1
 * trae `permisos` (`permissions.ts`), y las dos superficies por las que un
 * plugin toca el dibujo los comprueban: `createPluginDocumentApi` en cada
 * llamada, y `runCommand` —cuando el comando que conduce una rutina resultó ser
 * de un plugin— antes de aplicar su lote. Un plugin sin `documento:escritura`
 * no recibe un `apply` que no hace nada; recibe un `PluginPermissionError` con
 * el nombre del permiso que le falta. Un permiso que no se hace cumplir es un
 * adorno, y un `apply` mudo sería además el «éxito sin efecto» que la regla 2
 * de la casa prohíbe.
 *
 * **5. Gasta del MISMO presupuesto.** La API de documento cobra pasos y celdas
 * de un `LispMeter` (`budget.ts`), el mismo que corta a una rutina `.lsp`. Si
 * el anfitrión le presta el de la ejecución en curso, un plugin no puede
 * gastarse el navegador aunque la rutina que lo llamó se estuviera portando
 * bien: el presupuesto es de la EJECUCIÓN, no de cada trozo de código que
 * participa en ella.
 *
 * ## El ciclo de vida
 *
 * `register` valida el manifiesto entero y, si entra, ACTIVA: indexa sus
 * comandos y paneles y llama a su `activate`. `deactivate` retira el nombre, sus
 * alias, su variante con guion y sus paneles, y llama al `deactivate` del
 * plugin; el plugin sigue en la lista, inactivo, y se puede volver a activar.
 * `unregister` hace lo anterior y además lo borra.
 *
 * Nada queda huérfano en ningún camino, y eso incluye los caminos que fallan:
 * un `activate` que lanza deja el registro como estaba —el plugin no entra— en
 * vez de dejar sus comandos puestos apuntando a código que no llegó a
 * arrancar.
 */
import type { CadEntity, CadLayerDef } from "../../cad/cad-document";
import type { CadEntityCommand } from "../../cad/entity-commands";
import {
  CAD_COMMAND_REGISTRY_V2,
  type CadAnyCommandDescriptor,
  type CadCommandRegistry,
} from "../../cad/engine";
import { LispMeter } from "../budget";
import type { LispHostServices } from "../host";
import {
  PLUGIN_PERMISSIONS,
  PluginPermissions,
  unknownPluginPermissions,
  type PluginPermission,
} from "./permissions";

/** Dónde puede pedir sitio un panel de plugin. */
export type PluginPanelPlacement = "right" | "left" | "bottom";

export interface PluginPanel {
  id: string;
  title: string;
  placement: PluginPanelPlacement;
  /**
   * Identificador del componente que el anfitrión sabe montar. Es una CADENA y
   * no una función React a propósito: el registro de plugins es datos puros y
   * se puede validar, serializar y auditar sin ejecutar nada de terceros. Quien
   * decide qué se monta —y con qué permisos— es el anfitrión.
   */
  component: string;
}

/**
 * Versión del manifiesto. Hoy sólo la 1, y por eso es un literal y no un
 * número: el día que exista la 2, el compilador señalará todos los manifiestos
 * del producto que hay que revisar, y el registro seguirá rechazando en tiempo
 * de ejecución los que lleguen de fuera con una versión que no entiende.
 */
export type PluginManifestVersion = 1;

/**
 * El manifiesto v1.
 *
 * `manifiesto` y `permisos` son OBLIGATORIOS. Podrían haber sido opcionales
 * —habría ahorrado tocar los manifiestos que ya existían— y esa es exactamente
 * la razón por la que no lo son: un permiso que se puede omitir se omite, y un
 * registro que trata «no lo declaró» como «puede hacerlo todo» convierte el
 * manifiesto en documentación.
 */
export interface CadPlugin {
  manifiesto: PluginManifestVersion;
  id: string;
  name: string;
  version: string;
  /** Lo que el plugin necesita. Puede ser la lista vacía; no puede faltar. */
  permisos: readonly PluginPermission[];
  commands?: readonly CadAnyCommandDescriptor[];
  panels?: readonly PluginPanel[];
  /**
   * Se llama al darse de alta y en cada reactivación. Aquí es donde el plugin
   * mira el dibujo por primera vez y deja anotado lo que quiere que el usuario
   * vea. Si lanza, el alta se deshace entera.
   */
  activate?(context: PluginActivationContext): void;
  /**
   * Se llama al darse de baja. Sirve para soltar lo que el plugin tuviera
   * cogido; retirar sus comandos y paneles NO es cosa suya, lo hace el
   * registro — si dependiera de que el plugin se acuerde, un plugin olvidadizo
   * dejaría comandos apuntando a código muerto.
   */
  deactivate?(): void;
}

/**
 * Lo que recibe `activate`. Corto a propósito, igual que el puerto del
 * intérprete: es la lista completa de lo que un plugin alcanza al arrancar.
 */
export interface PluginActivationContext {
  readonly pluginId: string;
  /** Lo concedido, ya validado. El plugin puede consultarlo para adaptarse. */
  readonly permisos: PluginPermissions;
  /**
   * El dibujo, con los permisos ya aplicados. Falta cuando el registro se monta
   * SIN anfitrión —el catálogo de plugins de una organización, por ejemplo, que
   * se valida sin abrir ningún plano—. Un plugin bien escrito lo comprueba y
   * dice que espera, en vez de suponer que siempre hay documento.
   */
  readonly documento?: PluginDocumentApi;
  /**
   * Deja una línea en el diario del plugin. Es la única forma que tiene de
   * decir algo: no alcanza la línea de comandos ni el DOM, y el anfitrión
   * decide si lo pinta, cuándo y dónde. Lo lee `notas(pluginId)`.
   */
  anotar(mensaje: string): void;
}

export interface PluginRegistrationProblem {
  pluginId: string;
  problem: string;
}

/** Estado del ciclo de vida de un plugin dado de alta. */
export type PluginLifecycleState = "activo" | "inactivo";

/**
 * Lo que el registro compuesto sabe decir de un comando que resultó ser de un
 * plugin: de quién es y qué se le concedió.
 *
 * Existe porque quien APLICA el resultado de un comando —`runCommand`, en
 * `builtins/interaction.ts`— no puede preguntarle al descriptor si tiene
 * permiso para escribir: un descriptor es una máquina de estados pura y no sabe
 * de quién es. Sin este dato, un plugin sin `documento:escritura` habría
 * registrado un comando que dibuja y habría dibujado, que es la puerta trasera
 * que dejaría los permisos en nada.
 */
export interface PluginCommandGrant {
  pluginId: string;
  permisos: PluginPermissions;
}

/** El registro compuesto: el del motor, más de quién es cada comando añadido. */
export interface PluginAwareCommandRegistry extends CadCommandRegistry {
  otorgamiento(command: string): PluginCommandGrant | undefined;
}

/**
 * Pregunta por el dueño de un comando a un registro CUALQUIERA.
 *
 * Se comprueba de forma estructural porque el registro que recibe `runCommand`
 * puede ser el del producto (sin plugins), el compuesto, o el que monte una
 * spec. Devolver `undefined` para los dos primeros es la respuesta correcta:
 * un comando del producto no tiene dueño y no se le pide permiso a nadie.
 */
export function pluginGrantOf(
  registry: CadCommandRegistry,
  command: string,
): PluginCommandGrant | undefined {
  const ask = (registry as Partial<PluginAwareCommandRegistry>).otorgamiento;
  return typeof ask === "function" ? ask.call(registry, command) : undefined;
}

/** El anfitrión que el registro presta a los plugins al activarlos. */
export interface PluginHostEnvironment {
  /**
   * El documento abierto. Sin él, `activate` no recibe `documento` y el plugin
   * lo dice en vez de suponer.
   */
  host?: LispHostServices;
  /**
   * El medidor de la ejecución en curso, para que el gasto del plugin salga del
   * MISMO presupuesto que el de la rutina. Sin él, cada API de documento crea
   * el suyo con el presupuesto por defecto: «sin medidor» nunca significa «sin
   * límite».
   */
  meter?: LispMeter;
}

const COMMAND_NAME = /^[A-Z][A-Z0-9-]{0,31}$/;
const PLUGIN_ID = /^[a-z][a-z0-9-]{2,63}$/;

interface PluginEntry {
  plugin: CadPlugin;
  permisos: PluginPermissions;
  activo: boolean;
  notas: string[];
}

/**
 * Registro de plugins. Guarda comandos y paneles, lleva su ciclo de vida, y
 * sabe componerse con el registro del producto sin tocarlo.
 */
export class CadPluginRegistry {
  private readonly entries = new Map<string, PluginEntry>();
  private readonly commands = new Map<string, CadAnyCommandDescriptor>();
  private readonly owners = new Map<string, string>();

  constructor(
    private readonly product: CadCommandRegistry = CAD_COMMAND_REGISTRY_V2,
    private readonly environment: PluginHostEnvironment = {},
  ) {}

  /**
   * Da de alta un plugin y lo ACTIVA. Devuelve la lista de problemas: vacía si
   * entró entero. NO entra a medias — un plugin con tres comandos de los que
   * uno choca no registra los otros dos, porque entonces el usuario tendría un
   * plugin que funciona a ratos y ningún sitio donde leer por qué.
   */
  register(plugin: CadPlugin): PluginRegistrationProblem[] {
    const problems = this.manifestProblems(plugin);
    if (problems.length > 0) return problems;

    this.entries.set(plugin.id, {
      plugin,
      permisos: new PluginPermissions(plugin.id, plugin.permisos ?? []),
      activo: false,
      notas: [],
    });
    const activation = this.activate(plugin.id);
    // Alta y activación son la misma operación de cara a quien registra: si la
    // activación no sale, el plugin no queda anotado como «registrado pero
    // inerte», que es un estado que nadie sabría interpretar en una lista.
    if (activation.length > 0) this.entries.delete(plugin.id);
    return activation;
  }

  /**
   * Activa un plugin dado de alta: indexa sus comandos y paneles y llama a su
   * `activate`. Vuelve a comprobar los choques de nombre porque entre la baja y
   * el alta otro plugin ha podido quedarse con el suyo.
   */
  activate(pluginId: string): PluginRegistrationProblem[] {
    const entry = this.entries.get(pluginId);
    if (!entry) return [{ pluginId, problem: `el plugin "${pluginId}" no está registrado.` }];
    if (entry.activo) return [];

    const clashes = this.commandProblems(entry.plugin);
    if (clashes.length > 0) return clashes;

    for (const command of entry.plugin.commands ?? []) {
      this.commands.set(command.name, command);
      this.owners.set(command.name, pluginId);
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
        this.owners.set(alias, pluginId);
      }
      // La variante con guion de AutoCAD (`-MICOMANDO`) resuelve igual, como en
      // el registro del producto: es lo que hace posible llamarla desde SCRIPT.
      this.commands.set(`-${command.name}`, command);
    }
    entry.activo = true;

    try {
      entry.plugin.activate?.(this.activationContext(entry));
    } catch (cause) {
      // Un `activate` que revienta NO puede dejar sus comandos puestos: el
      // usuario los teclearía y llamaría a un plugin que no llegó a arrancar.
      // Queda INACTIVO, no borrado: quien lo reactivó a mano sigue teniéndolo
      // en la lista para volver a intentarlo. Del alta lo borra `register`.
      this.retire(entry);
      return [
        {
          pluginId,
          problem:
            `el activate del plugin "${pluginId}" falló: ${describe(cause)}. ` +
            `No queda a medias: sus comandos y paneles se retiran.`,
        },
      ];
    }
    return [];
  }

  /**
   * Da de baja SIN borrar: retira nombre, alias, variante con guion y paneles,
   * y avisa al plugin. Sigue en la lista, inactivo, y se puede volver a activar.
   */
  deactivate(pluginId: string): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry || !entry.activo) return false;
    try {
      entry.plugin.deactivate?.();
    } catch (cause) {
      // La retirada NO depende de que el plugin se despida bien. Se anota en su
      // diario en vez de tragarse: un `deactivate` roto es información para
      // quien diagnostique, y silenciarlo del todo lo escondería.
      entry.notas.push(`deactivate falló: ${describe(cause)}`);
    }
    this.retire(entry);
    return true;
  }

  /** Baja definitiva: desactiva si hacía falta y lo borra de la lista. */
  unregister(pluginId: string): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;
    if (entry.activo) this.deactivate(pluginId);
    this.entries.delete(pluginId);
    return true;
  }

  /** Todos los dados de alta, activos o no. */
  list(): readonly CadPlugin[] {
    return [...this.entries.values()].map((entry) => entry.plugin);
  }

  /** Sólo los que están activos ahora mismo. */
  activos(): readonly CadPlugin[] {
    return [...this.entries.values()].filter((entry) => entry.activo).map((entry) => entry.plugin);
  }

  estado(pluginId: string): PluginLifecycleState | undefined {
    const entry = this.entries.get(pluginId);
    return entry ? (entry.activo ? "activo" : "inactivo") : undefined;
  }

  /** Lo concedido a un plugin, para enseñárselo al usuario o para auditar. */
  permisosDe(pluginId: string): PluginPermissions | undefined {
    return this.entries.get(pluginId)?.permisos;
  }

  /** Lo que el plugin dejó dicho con `anotar`, en orden. */
  notas(pluginId: string): readonly string[] {
    return this.entries.get(pluginId)?.notas ?? [];
  }

  /**
   * Los paneles de los plugins ACTIVOS. Uno desactivado no publica panel: si
   * siguiera publicándolo, el editor montaría el componente de un plugin que
   * ya no responde a nada.
   */
  panels(): readonly PluginPanel[] {
    return [...this.entries.values()]
      .filter((entry) => entry.activo)
      .flatMap((entry) => entry.plugin.panels ?? []);
  }

  /** Qué plugin registró un comando. Para diagnosticar y para la interfaz. */
  ownerOf(command: string): string | undefined {
    return this.ownerKey(command);
  }

  /**
   * Registro COMPUESTO con la interfaz que ya consume el motor. El producto
   * manda: si un nombre existe en los dos, gana el del producto — aunque el
   * alta lo rechace, porque un registro que dependa de que el alta se hizo bien
   * no es una garantía.
   *
   * Añade `otorgamiento`, que es lo que permite a quien aplique el resultado de
   * un comando saber de quién es y con qué permisos entró.
   */
  composed(): PluginAwareCommandRegistry {
    return {
      get: (name) => this.product.get(name) ?? this.commands.get(name.toUpperCase()),
      names: () => new Set([...this.product.names(), ...this.commands.keys()]),
      otorgamiento: (command) => {
        // Un comando del producto no tiene dueño: gana él, y a nadie se le pide
        // permiso por ejecutarlo.
        if (this.product.get(command)) return undefined;
        const pluginId = this.ownerKey(command);
        const entry = pluginId ? this.entries.get(pluginId) : undefined;
        return entry && entry.activo ? { pluginId: entry.plugin.id, permisos: entry.permisos } : undefined;
      },
    };
  }

  // --- interior ------------------------------------------------------------

  private activationContext(entry: PluginEntry): PluginActivationContext {
    const host = this.environment.host;
    return {
      pluginId: entry.plugin.id,
      permisos: entry.permisos,
      ...(host
        ? {
            documento: createPluginDocumentApi(host, entry.permisos, {
              ...(this.environment.meter ? { meter: this.environment.meter } : {}),
            }),
          }
        : {}),
      anotar: (mensaje: string) => {
        entry.notas.push(mensaje);
      },
    };
  }

  /** Quita del índice todo lo del plugin y lo marca inactivo. */
  private retire(entry: PluginEntry): void {
    for (const [name, owner] of [...this.owners])
      if (owner === entry.plugin.id) {
        this.owners.delete(name);
        this.commands.delete(name);
        this.commands.delete(`-${name}`);
      }
    entry.activo = false;
  }

  /**
   * Igual que el registro del producto: primero el nombre LITERAL —`-LAYER` es
   * un comando propio— y sólo después la forma sin prefijo, que es la que hace
   * que `_MICOMANDO` de un script funcione.
   */
  private ownerKey(command: string): string | undefined {
    const literal = command.trim().toUpperCase();
    return this.owners.get(literal) ?? this.owners.get(literal.replace(/^[-_]+/, ""));
  }

  private manifestProblems(plugin: CadPlugin): PluginRegistrationProblem[] {
    const problems: PluginRegistrationProblem[] = [];
    const complain = (problem: string) => problems.push({ pluginId: plugin.id, problem });

    if (plugin.manifiesto !== 1)
      complain(
        `el manifiesto declara la versión ${JSON.stringify(plugin.manifiesto)} y esta versión ` +
          `del producto sólo entiende la 1. No se acepta «por si acaso»: un manifiesto de una ` +
          `versión futura puede significar cosas distintas con los mismos nombres.`,
      );
    if (!PLUGIN_ID.test(plugin.id))
      complain(`"${plugin.id}" no es un identificador de plugin admisible (minúsculas, guiones).`);
    if (this.entries.has(plugin.id)) complain(`el plugin "${plugin.id}" ya está registrado.`);

    const declared: readonly string[] = Array.isArray(plugin.permisos) ? plugin.permisos : [];
    if (!Array.isArray(plugin.permisos))
      complain(
        `el manifiesto v1 tiene que declarar "permisos", aunque sea la lista vacía. ` +
          `Omitirlo no concede nada: obliga a escribir que no se pide nada.`,
      );
    for (const unknown of unknownPluginPermissions(declared))
      complain(
        `"${unknown}" no es un permiso de este producto. Los permisos son: ` +
          `${PLUGIN_PERMISSIONS.join(", ")}.`,
      );
    const granted = new Set(declared);

    const commands = plugin.commands ?? [];
    if (commands.length > 0 && !granted.has("comandos:registro"))
      complain(
        `trae ${commands.length} comando(s) y no declara el permiso "comandos:registro". ` +
          `Registrarlos sin declararlo dejaría al usuario con órdenes nuevas que nadie le anunció.`,
      );
    const panels = plugin.panels ?? [];
    if (panels.length > 0 && !granted.has("ui:panel"))
      complain(
        `trae ${panels.length} panel(es) y no declara el permiso "ui:panel". ` +
          `Ocupar sitio en la pantalla del dibujante se pide, no se toma.`,
      );

    problems.push(...this.commandProblems(plugin));

    for (const panel of panels)
      if (!panel.id || !panel.title || !panel.component)
        complain(`el panel "${panel.id || "(sin id)"}" necesita id, título y componente.`);

    return problems;
  }

  /**
   * Los choques de nombre. Se comprueban al alta Y a cada activación: entre una
   * baja y el alta siguiente, otro plugin puede haberse quedado con el nombre, y
   * reactivar entonces sin mirar produciría dos dueños para el mismo comando.
   */
  private commandProblems(plugin: CadPlugin): PluginRegistrationProblem[] {
    const problems: PluginRegistrationProblem[] = [];
    const complain = (problem: string) => problems.push({ pluginId: plugin.id, problem });

    for (const command of plugin.commands ?? []) {
      const names = [command.name, ...command.aliases];
      for (const name of names) {
        if (!COMMAND_NAME.test(name)) {
          complain(`"${name}" no es un nombre de comando admisible (MAYÚSCULAS, dígitos, guiones).`);
          continue;
        }
        if (this.product.get(name))
          complain(
            `el comando "${name}" ya existe en el producto. Un plugin no puede sustituirlo: ` +
              `se rechaza al registrar en vez de dejar que su comando no salte nunca.`,
          );
        const owner = this.owners.get(name);
        if (owner && owner !== plugin.id)
          complain(`el comando "${name}" ya lo registró el plugin "${owner}".`);
      }
    }
    return problems;
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Lo que un plugin puede hacerle al dibujo. Deliberadamente pequeño: es la
 * lista completa, igual que `LispHostServices` lo es para el LISP.
 *
 * Nótese lo que NO hay: ni `commitChange`, ni el documento mutable, ni acceso
 * al historial. Un plugin no puede saltarse `commitNativeCommands` porque no
 * tiene con qué hacerlo.
 */
export interface PluginDocumentApi {
  entities(): readonly CadEntity[];
  entity(id: string): CadEntity | undefined;
  layers(): readonly CadLayerDef[];
  activeLayer(): string;
  newEntityId(): string;
  /** Aplica un lote como UNA transacción y UN paso de deshacer. */
  apply(commands: readonly CadEntityCommand[], label: string): void;
}

export interface PluginDocumentApiOptions {
  /**
   * El medidor de la ejecución. Préstese el de la rutina en curso y el plugin
   * gastará del MISMO presupuesto que ella; omítase y esta API crea el suyo con
   * los límites por defecto. Lo que no hay es una tercera opción sin límite.
   */
  meter?: LispMeter;
}

/**
 * Construye la API de documento de un plugin sobre el MISMO puerto que usa el
 * intérprete LISP. Que las dos superficies salgan del mismo sitio no es una
 * comodidad: es lo que hace que auditar una sirva para las dos.
 *
 * Recibe el manifiesto (o los permisos ya validados que guarda el registro) y
 * no un id suelto: con un id, olvidar pasar los permisos habría concedido todo
 * en silencio, y el permiso más peligroso es el que se concede por descuido.
 */
export function createPluginDocumentApi(
  host: LispHostServices,
  plugin: CadPlugin | PluginPermissions,
  options: PluginDocumentApiOptions = {},
): PluginDocumentApi {
  const permisos =
    plugin instanceof PluginPermissions
      ? plugin
      : new PluginPermissions(plugin.id, plugin.permisos ?? []);
  const meter = options.meter ?? new LispMeter();

  return {
    entities: () => {
      permisos.exigir("documento:lectura", "leer las entidades del dibujo (entities)");
      meter.step();
      const ids = host.entityIds();
      // Se cobra por entidad devuelta, igual que el intérprete cobra una lista
      // por celda: recorrer cien mil entidades en un bucle tiene que consumir
      // presupuesto, o el tope de celdas no vería nada.
      meter.charge(ids.length);
      return ids
        .map((id) => host.entity(id))
        .filter((entity): entity is CadEntity => entity !== undefined);
    },
    entity: (id) => {
      permisos.exigir("documento:lectura", "leer una entidad del dibujo (entity)");
      meter.step();
      return host.entity(id);
    },
    layers: () => {
      permisos.exigir("documento:lectura", "leer la tabla de capas (layers)");
      meter.step();
      const layers = host.layers();
      meter.charge(layers.length);
      return layers;
    },
    activeLayer: () => {
      permisos.exigir("documento:lectura", "leer la capa activa (activeLayer)");
      meter.step();
      return host.activeLayer();
    },
    // Un identificador nuevo sólo sirve para escribir: pedirlo es el primer
    // gesto de una escritura y se cobra el permiso ahí, no una llamada después.
    newEntityId: () => {
      permisos.exigir("documento:escritura", "pedir un identificador de entidad (newEntityId)");
      meter.step();
      return host.newEntityId();
    },
    apply: (commands, label) => {
      permisos.exigir("documento:escritura", "escribir en el dibujo (apply)");
      meter.step();
      meter.charge(commands.length);
      // La etiqueta lleva el plugin delante: cuando alguien mire el historial y
      // vea un cambio que no recuerda haber hecho, tiene que poder saber quién lo
      // hizo sin abrir el código.
      host.apply(commands, `plugin:${permisos.pluginId} ${label}`);
    },
  };
}
