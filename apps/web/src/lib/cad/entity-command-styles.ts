/**
 * Aplicación de los comandos de ESTILO sobre la tabla del documento.
 *
 * Sale de `entity-commands.ts` por el trinquete de tamaño —aquel archivo es el
 * embudo de mutación y con el esquema 9 rozaba el techo— y sigue el reparto de
 * siempre: las capas y el orden de dibujo viven en `entity-command-tables.ts`,
 * los bloques y las xref en `cad-symbol-tables.ts`, y los estilos aquí. Lo que
 * NO cambia: se entra por el mismo lote, con un solo `commitChange` y un solo
 * paso de deshacer.
 */
import type { CadStyleTable } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";

export type CadStyleCommand = Extract<CadEntityCommand, { type: "style" }>;

/**
 * Aplica los comandos de estilo sobre la tabla, sin tocar lo que no nombran.
 *
 * `upsert` FUSIONA: escribir sólo la altura de un estilo de texto no debe
 * borrarle la fuente. Un valor `undefined` no llega hasta aquí —el tipo no lo
 * admite—, así que no hay forma accidental de vaciar un campo; para eso está
 * borrar el estilo entero.
 */
export function applyStyleCommands(
  styles: CadStyleTable,
  commands: readonly CadStyleCommand[],
): CadStyleTable {
  if (commands.length === 0) return styles;
  const next: CadStyleTable = {
    text: { ...styles.text },
    dimension: { ...styles.dimension },
    mleader: { ...(styles.mleader ?? {}) },
    table: { ...styles.table },
    plot: { ...styles.plot },
    // `linetype` no es una familia de comandos de estilo, pero SÍ es parte de
    // la tabla: reconstruir `next` sin copiarla descartaba el catálogo entero
    // de tipos de línea con cualquier upsert/delete de estilo.
    ...(styles.linetype ? { linetype: { ...styles.linetype } } : {}),
  };
  for (const command of commands) {
    const name = command.name.trim();
    if (!name) throw new Error("Un estilo necesita un nombre no vacío.");
    const family = next[command.family] as Record<string, Record<string, unknown>>;
    if (command.op === "delete") {
      delete family[name];
      continue;
    }
    family[name] = { ...(family[name] ?? {}), ...command.values };
  }
  // La familia `mleader` es OPCIONAL en el esquema: materializarla como `{}` en
  // un documento que nunca la tuvo cambiaría su serializado y con él su hash.
  if (Object.keys(next.mleader ?? {}).length === 0 && !styles.mleader) delete next.mleader;
  return next;
}
