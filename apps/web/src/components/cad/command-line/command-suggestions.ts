/**
 * QUÉ SE SUGIERE MIENTRAS ESCRIBES en la línea de órdenes.
 *
 * Sale de `CadCommandLine.tsx` por la razón de siempre en este repositorio:
 * ese archivo tiene un techo de 800 líneas que sólo baja, y esto es ARITMÉTICA
 * de cadenas —entra lo tecleado, salen hasta seis comandos— que aquí se puede
 * probar en Node, sin montar la línea de órdenes entera.
 */
import { buildCadPaletteEntries } from "@/lib/cad/command-palette";
import { CAD_COMMAND_ALIASES } from "@/lib/cad/engine/alias-table";

/** Una sugerencia: el nombre canónico, su resumen y su alias más corto. */
export interface CadCommandSuggestion {
  readonly nombre: string;
  readonly descripcion: string;
  readonly alias?: string;
}

/**
 * T-74(c): «la línea de comandos no sugiere nada mientras escribo, y el
 * buscador ya existe» — el buscador es Ctrl+K (`command-palette.ts`,
 * indexado ahí mismo por el monolito), así que esto reutiliza el MISMO
 * registro estático en vez de inventar uno nuevo que pudiera divergir del
 * de la paleta. Es una excepción puntual, documentada, a «no conoce el
 * motor»: lo que se lee es el CATÁLOGO estático de nombres (mismo dato que
 * ya usa Ctrl+K), nunca el documento ni una instancia del motor en marcha.
 * Ya vive en el bundle del estudio de todos modos —el propio Ctrl+K lo
 * importa de forma estática—, así que no hay nada nuevo que pagar en cada
 * visita.
 */
const COMANDOS_SUGERIBLES = buildCadPaletteEntries()
  .filter((entry) => entry.kind === "engine")
  .map((entry) => ({
    nombre: entry.label,
    descripcion: entry.description,
    // El PRIMER alias del manifiesto («L» para LINE, «REC» antes que
    // «RECTANGLE») — la misma memoria muscular que ya resuelve la tabla de
    // alias, mostrada aquí para que la sugerencia enseñe el atajo, no sólo
    // el nombre largo. AutoCAD hace exactamente esto en su autocompletado.
    alias: entry.shortcut,
  }));

export function sugerirComandos(valorCrudo: string): readonly CadCommandSuggestion[] {
  const valor = valorCrudo.trim().toUpperCase();
  if (!valor) return [];
  // La coincidencia EXACTA de alias va primero: teclear «L» debe mostrar
  // «LINE» como primera sugerencia, no como la séptima (cortada por slice).
  const aliasResuelto = CAD_COMMAND_ALIASES[valor];
  const coincidencias = COMANDOS_SUGERIBLES.filter((c) => c.nombre.startsWith(valor));
  if (aliasResuelto && coincidencias.every((c) => c.nombre !== aliasResuelto)) {
    const destino = COMANDOS_SUGERIBLES.find((c) => c.nombre === aliasResuelto);
    if (destino) return [destino, ...coincidencias].slice(0, 6);
  }
  // El alias resuelto ya está en la lista: muévelo al frente.
  if (aliasResuelto) {
    coincidencias.sort((a, b) => {
      if (a.nombre === aliasResuelto) return -1;
      if (b.nombre === aliasResuelto) return 1;
      return 0;
    });
  }
  // Deduplicar por nombre: el manifiesto y la paleta pueden producir
  // entradas con el mismo label.
  const vistos = new Set<string>();
  return coincidencias.filter((c) => {
    if (vistos.has(c.nombre)) return false;
    vistos.add(c.nombre);
    return true;
  }).slice(0, 6);
}

