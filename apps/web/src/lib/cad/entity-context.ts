/**
 * Copia profunda del contexto de una entidad.
 *
 * Vivía dentro de `entity-runtime.ts` y se ha mudado aquí por la razón de
 * siempre en este árbol: `entity-runtime` importa los adaptadores para
 * registrarlos, así que un adaptador que le pida de vuelta un VALOR cierra un
 * ciclo de carga. `tsc --noEmit` no ve esos ciclos —los tipos se borran al
 * compilar y no cuentan— y el producto revienta al arrancar con «Cannot access X
 * before initialization». Este módulo no importa nada en tiempo de ejecución, así
 * que es una hoja del grafo y cualquiera puede depender de él.
 *
 * `entity-runtime.ts` lo reexporta, de modo que ningún consumidor cambia.
 */
import type { CadEntityContext } from "./cad-document";

/**
 * Copia el contexto (color/tipo de línea/grosor explícitos, procedencia, vínculo
 * de negocio) hasta el fondo.
 *
 * La necesita el ejecutor de comandos al copiar una entidad: sin ella, el
 * original y la copia compartirían el mismo objeto `presentation` y cambiar el
 * color de una cambiaría el de la otra.
 */
export function cloneContext(context: CadEntityContext | undefined): CadEntityContext | undefined {
  if (!context) return undefined;
  return {
    ...context,
    ...(context.normal ? { normal: { ...context.normal } } : {}),
    ...(context.presentation
      ? {
          presentation: {
            ...context.presentation,
            ...(context.presentation.color
              ? { color: { ...context.presentation.color } }
              : {}),
            ...(context.presentation.linetype
              ? { linetype: { ...context.presentation.linetype } }
              : {}),
            ...(context.presentation.lineweight
              ? { lineweight: { ...context.presentation.lineweight } }
              : {}),
          },
        }
      : {}),
    ...(context.metadata ? { metadata: { ...context.metadata } } : {}),
    ...(context.provenance ? { provenance: { ...context.provenance } } : {}),
    ...(context.businessLink ? { businessLink: { ...context.businessLink } } : {}),
  };
}
