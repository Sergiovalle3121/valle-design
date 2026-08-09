/**
 * API de plugins en JavaScript.
 *
 * Un plugin es lo mismo que una rutina `.lsp` con otra sintaxis: código de un
 * tercero que registra comandos, pinta paneles y toca el dibujo. Y por tanto
 * tiene que estar sujeto a las MISMAS reglas, o el LISP sería el camino
 * vigilado y el JavaScript el atajo.
 *
 * ## Las tres reglas, y cómo se hacen cumplir
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
 */
import type { CadEntity, CadLayerDef } from "../../cad/cad-document";
import type { CadEntityCommand } from "../../cad/entity-commands";
import {
  CAD_COMMAND_REGISTRY_V2,
  type CadAnyCommandDescriptor,
  type CadCommandRegistry,
} from "../../cad/engine";
import type { LispHostServices } from "../host";

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

export interface CadPlugin {
  id: string;
  name: string;
  version: string;
  commands?: readonly CadAnyCommandDescriptor[];
  panels?: readonly PluginPanel[];
}

export interface PluginRegistrationProblem {
  pluginId: string;
  problem: string;
}

const COMMAND_NAME = /^[A-Z][A-Z0-9-]{0,31}$/;
const PLUGIN_ID = /^[a-z][a-z0-9-]{2,63}$/;

/**
 * Registro de plugins. Guarda comandos y paneles, y sabe componerse con el
 * registro del producto sin tocarlo.
 */
export class CadPluginRegistry {
  private readonly plugins = new Map<string, CadPlugin>();
  private readonly commands = new Map<string, CadAnyCommandDescriptor>();
  private readonly owners = new Map<string, string>();

  constructor(private readonly product: CadCommandRegistry = CAD_COMMAND_REGISTRY_V2) {}

  /**
   * Da de alta un plugin. Devuelve la lista de problemas: vacía si entró
   * entero. NO entra a medias — un plugin con tres comandos de los que uno
   * choca no registra los otros dos, porque entonces el usuario tendría un
   * plugin que funciona a ratos y ningún sitio donde leer por qué.
   */
  register(plugin: CadPlugin): PluginRegistrationProblem[] {
    const problems: PluginRegistrationProblem[] = [];
    const complain = (problem: string) => problems.push({ pluginId: plugin.id, problem });

    if (!PLUGIN_ID.test(plugin.id))
      complain(`"${plugin.id}" no es un identificador de plugin admisible (minúsculas, guiones).`);
    if (this.plugins.has(plugin.id)) complain(`el plugin "${plugin.id}" ya está registrado.`);

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

    for (const panel of plugin.panels ?? [])
      if (!panel.id || !panel.title || !panel.component)
        complain(`el panel "${panel.id || "(sin id)"}" necesita id, título y componente.`);

    if (problems.length > 0) return problems;

    this.plugins.set(plugin.id, plugin);
    for (const command of plugin.commands ?? []) {
      this.commands.set(command.name, command);
      this.owners.set(command.name, plugin.id);
      for (const alias of command.aliases) {
        this.commands.set(alias, command);
        this.owners.set(alias, plugin.id);
      }
      // La variante con guion de AutoCAD (`-MICOMANDO`) resuelve igual, como en
      // el registro del producto: es lo que hace posible llamarla desde SCRIPT.
      this.commands.set(`-${command.name}`, command);
    }
    return [];
  }

  unregister(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    for (const [name, owner] of [...this.owners])
      if (owner === pluginId) {
        this.owners.delete(name);
        this.commands.delete(name);
        this.commands.delete(`-${name}`);
      }
    this.plugins.delete(pluginId);
    return true;
  }

  list(): readonly CadPlugin[] {
    return [...this.plugins.values()];
  }

  panels(): readonly PluginPanel[] {
    return [...this.plugins.values()].flatMap((plugin) => plugin.panels ?? []);
  }

  /** Qué plugin registró un comando. Para diagnosticar y para la interfaz. */
  ownerOf(command: string): string | undefined {
    return this.owners.get(command.toUpperCase());
  }

  /**
   * Registro COMPUESTO con la interfaz que ya consume el motor. El producto
   * manda: si un nombre existe en los dos, gana el del producto — aunque el
   * alta lo rechace, porque un registro que dependa de que el alta se hizo bien
   * no es una garantía.
   */
  composed(): CadCommandRegistry {
    return {
      get: (name) => this.product.get(name) ?? this.commands.get(name.toUpperCase()),
      names: () => new Set([...this.product.names(), ...this.commands.keys()]),
    };
  }
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

/**
 * Construye la API de documento de un plugin sobre el MISMO puerto que usa el
 * intérprete LISP. Que las dos superficies salgan del mismo sitio no es una
 * comodidad: es lo que hace que auditar una sirva para las dos.
 */
export function createPluginDocumentApi(host: LispHostServices, pluginId: string): PluginDocumentApi {
  return {
    entities: () =>
      host
        .entityIds()
        .map((id) => host.entity(id))
        .filter((entity): entity is CadEntity => entity !== undefined),
    entity: (id) => host.entity(id),
    layers: () => host.layers(),
    activeLayer: () => host.activeLayer(),
    newEntityId: () => host.newEntityId(),
    // La etiqueta lleva el plugin delante: cuando alguien mire el historial y
    // vea un cambio que no recuerda haber hecho, tiene que poder saber quién lo
    // hizo sin abrir el código.
    apply: (commands, label) => host.apply(commands, `plugin:${pluginId} ${label}`),
  };
}
