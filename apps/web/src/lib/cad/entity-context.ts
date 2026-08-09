/**
 * Copia profunda del contexto de una entidad, en un módulo HOJA.
 *
 * Vivía en `entity-runtime.ts`, que la exporta desde su primera versión. El
 * problema no era el tamaño: era que cualquier módulo al que `entity-runtime`
 * importe —los adaptadores, y desde el esquema 4 también los atributos
 * posicionados— no puede pedirle un VALOR de vuelta sin cerrar un ciclo que
 * revienta al cargar con «Cannot access X before initialization», y que
 * `tsc --noEmit` no ve.
 *
 * Aquí no hay ese riesgo: este archivo sólo importa TIPOS, que se borran al
 * compilar. `entity-runtime` lo reexporta, así que todo lo que ya lo importaba
 * de allí sigue igual.
 */
import type { CadEntityContext } from "./cad-document";

/**
 * El ejecutor de comandos la necesita al copiar una entidad: sin ella, el
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
