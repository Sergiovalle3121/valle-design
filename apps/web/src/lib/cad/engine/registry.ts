/**
 * Registro de comandos: un solo espacio de nombres.
 *
 * Hoy conviven tres sistemas que no se conocen entre sí — el reductor de siete
 * comandos de dibujo, los cuarenta y siete comandos del copiloto en lenguaje
 * natural (que operan sobre cajas heredadas, no sobre entidades canónicas) y
 * los controles sueltos de FILLET, CHAMFER, TRIM y EXTEND en el panel derecho.
 * Un usuario no puede escribir `TRIM` porque, sencillamente, no existe con ese
 * nombre en ninguno de los tres.
 *
 * Este registro es el único sitio donde un comando existe. La paleta `Ctrl+K`,
 * la línea de comandos, los botones de la barra y los scripts leen todos de
 * aquí, así que un comando nuevo aparece en los cuatro sitios a la vez o en
 * ninguno.
 */
import { CAD_COMMAND_ALIASES } from "./alias-table";
import type { CadAnyCommandDescriptor } from "./command-types";
import type { CadCommandRegistry } from "./command-engine";

export class CadCommandRegistryImpl implements CadCommandRegistry {
  private readonly byName = new Map<string, CadAnyCommandDescriptor>();
  private readonly byAlias = new Map<string, string>();

  register(descriptor: CadAnyCommandDescriptor): this {
    const name = descriptor.name.toUpperCase();
    if (this.byName.has(name)) throw new Error(`Comando CAD duplicado: ${name}`);
    this.byName.set(name, descriptor);
    for (const alias of descriptor.aliases) {
      const key = alias.toUpperCase();
      const existing = this.byAlias.get(key);
      // Un alias que apunta a dos comandos es un error de programación, no una
      // preferencia del usuario: sin esto, cuál gana dependería del orden de
      // registro y cambiaría al reordenar imports.
      if (existing && existing !== name)
        throw new Error(`Alias CAD ambiguo "${key}": ${existing} y ${name}`);
      this.byAlias.set(key, name);
    }
    return this;
  }

  get(name: string): CadAnyCommandDescriptor | undefined {
    const key = name.trim().replace(/^[-_]+/, "").toUpperCase();
    return this.byName.get(key) ?? this.byName.get(this.byAlias.get(key) ?? "");
  }

  names(): ReadonlySet<string> {
    return new Set(this.byName.keys());
  }

  all(): readonly CadAnyCommandDescriptor[] {
    return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Alias declarados en la tabla que no resuelven a ningún comando registrado.
   *
   * No es un error: la tabla cubre el vocabulario completo de AutoCAD y el
   * producto lo va cubriendo por olas. Sirve de inventario honesto de lo que
   * falta, y una spec lo imprime para que el avance sea visible.
   */
  unresolvedAliases(): readonly string[] {
    return Object.entries(CAD_COMMAND_ALIASES)
      .filter(([, target]) => !this.byName.has(target))
      .map(([alias, target]) => `${alias}→${target}`)
      .sort();
  }
}

export function createCadCommandRegistry(
  descriptors: readonly CadAnyCommandDescriptor[],
): CadCommandRegistryImpl {
  const registry = new CadCommandRegistryImpl();
  for (const descriptor of descriptors) registry.register(descriptor);
  return registry;
}
