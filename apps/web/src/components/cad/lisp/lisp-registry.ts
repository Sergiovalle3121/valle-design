/**
 * Un solo espacio de nombres: los 63 nativos y las rutinas del estudio.
 *
 * `registry.ts` dice —con razón— que el registro del producto es inmutable en la
 * práctica: se construye al cargar el módulo y nadie le añade comandos en
 * caliente, porque un registro que cambia según qué se haya importado antes
 * convierte el comportamiento del producto en una función del orden de los
 * imports.
 *
 * Las rutinas `.lsp` de una organización SON dinámicas: aparecen cuando alguien
 * hace APPLOAD y desaparecen cuando lo descarga. Así que no se le añaden al
 * registro compartido. Se COMPONE: este registro delega primero en el del
 * producto y sólo si allí no está mira lo que aporta LISP.
 *
 * La consecuencia importante es la precedencia. **Un comando nativo siempre
 * gana.** Un `.lsp` de un proveedor que define `(defun c:LINE …)` no puede
 * secuestrar LINE; su comando queda inalcanzable y la colisión se REPORTA en la
 * consola, porque una rutina que no se ejecuta y no dice por qué cuesta una
 * tarde de diagnóstico.
 *
 * ## Cómo se teclea una expresión suelta
 *
 * El motor pregunta al registro si un texto es un comando conocido antes de
 * decidir qué hacer con él (`resolveCadCommandAlias` mira `names()`). Una
 * expresión LISP no es un nombre que se pueda enumerar: hay infinitas. Por eso
 * `names()` devuelve un conjunto que además responde que sí a cualquier cosa que
 * EMPIECE por paréntesis. No es un truco gratuito: es exactamente el criterio
 * con el que un usuario de AutoCAD distingue una orden de una expresión, y está
 * en un sitio.
 *
 * El motor normaliza a mayúsculas lo que se teclea —lo hace para que `l` y `L`
 * sean LINE—, y eso destrozaría las cadenas de una expresión: `(alert "hola")`
 * llegaría como `(ALERT "HOLA")`. Por eso el texto original se APUNTA antes de
 * despacharlo (`remember`) y se recupera aquí. Quien no lo apunte recibe la
 * versión en mayúsculas, que sigue evaluando bien todo lo que no lleve cadenas.
 */
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine";
import type { CadCommandRegistry } from "@/lib/cad/engine/command-engine";
import type { CadAnyCommandDescriptor } from "@/lib/cad/engine/command-types";
import { cadLispCommand, cadLispFixedCommands } from "./lisp-commands";
import type { CadLispRuntime } from "./lisp-runtime";

/** `true` si lo tecleado es una expresión LISP y no un nombre de comando. */
export function isLispExpression(text: string): boolean {
  return text.trim().startsWith("(");
}

/**
 * Conjunto de nombres que además admite cualquier expresión LISP.
 *
 * Se extiende `Set` en vez de escribir un objeto que cumpla `ReadonlySet` para
 * que todo lo demás —`size`, la iteración, la paleta `Ctrl+K`— siga viendo la
 * lista REAL de comandos. Sólo cambia la pregunta «¿conoces esto?».
 */
export class CadLispCommandNames extends Set<string> {
  override has(value: string): boolean {
    return super.has(value) || isLispExpression(value);
  }
}

/** Cuántos textos originales se recuerdan. Es una caché de una pulsación. */
const REMEMBERED = 32;

export class CadLispCommandRegistry implements CadCommandRegistry {
  private readonly fixed = new Map<string, CadAnyCommandDescriptor>();
  private readonly raw = new Map<string, string>();

  constructor(
    private readonly runtime: CadLispRuntime,
    private readonly base: CadCommandRegistry = CAD_COMMAND_REGISTRY_V2,
  ) {
    for (const descriptor of cadLispFixedCommands(runtime)) {
      this.fixed.set(descriptor.name, descriptor);
      for (const alias of descriptor.aliases) this.fixed.set(alias.toUpperCase(), descriptor);
    }
  }

  /**
   * Apunta el texto tal y como se escribió, antes de que el motor lo normalice.
   * Lo llama la línea de comandos; véase la cabecera del módulo.
   */
  remember(text: string): void {
    const trimmed = text.trim();
    if (!isLispExpression(trimmed)) return;
    if (this.raw.size >= REMEMBERED) this.raw.clear();
    this.raw.set(trimmed.toUpperCase(), trimmed);
  }

  get(name: string): CadAnyCommandDescriptor | undefined {
    // 1. El producto manda. Un `.lsp` no puede secuestrar un comando nativo.
    const native = this.base.get(name);
    if (native) return native;

    const key = name.trim().replace(/^[-_]+/, "").toUpperCase();

    // 2. Una expresión suelta se evalúa tal cual.
    if (isLispExpression(key)) {
      const source = this.raw.get(key) ?? key;
      return cadLispCommand(this.runtime, {
        name: key,
        invoke: source,
        origin: "consola",
        // Repetir con Espacio una expresión de usar y tirar no es lo que nadie
        // espera, y además obligaría a conservar su texto para siempre.
        repeatable: false,
      });
    }

    // 3. APPLOAD y la consola.
    const fixed = this.fixed.get(key);
    if (fixed) return fixed;

    // 4. Un comando `c:` de la biblioteca.
    if (this.runtime.hasCommand(key))
      return cadLispCommand(this.runtime, {
        name: key,
        invoke: `(c:${key})`,
        origin: this.runtime.fileOf(key) ?? "biblioteca",
      });

    return undefined;
  }

  /**
   * Nombres conocidos. Se reconstruye en cada llamada a propósito: el motor la
   * pide una vez por pulsación y la biblioteca puede haber cambiado entre dos
   * —justo lo que pasa al volver de APPLOAD—. Una caché aquí haría que la rutina
   * recién cargada no se pudiera teclear hasta recargar la página.
   */
  names(): ReadonlySet<string> {
    const names = new CadLispCommandNames(this.base.names());
    for (const key of this.fixed.keys()) names.add(key);
    for (const command of this.runtime.commandNames()) {
      // Se anuncia sólo lo alcanzable: un `c:LINE` nunca se va a ejecutar porque
      // LINE gana, y listarlo prometería algo que no ocurre.
      if (!this.base.get(command)) names.add(command);
    }
    return names;
  }

  /**
   * `true` si el nombre ya lo ocupa un comando del producto.
   *
   * Lo consulta el runtime al cargar un `.lsp` para poder AVISAR. Con 96
   * comandos nativos y subiendo, que una rutina de estudio se llame `c:MEDIR` o
   * `c:LISTA` ha dejado de ser improbable, y una rutina que no se ejecuta y no
   * dice por qué cuesta una tarde de diagnóstico.
   */
  isNative(name: string): boolean {
    return this.base.get(name) !== undefined;
  }

  /** Comandos `c:` que un nativo del mismo nombre deja inalcanzables. */
  shadowedCommands(): string[] {
    return this.runtime.commandNames().filter((command) => this.isNative(command));
  }
}
