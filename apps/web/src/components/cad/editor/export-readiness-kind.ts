/**
 * Clase de una entidad NATIVA para el cuadro de exportar a DXF.
 *
 * El resumen del cuadro tiene que contar exactamente lo que `exportDxf`
 * escribe: la cota nativa viaja bajo «incluir cotas» y el MTEXT/MLEADER bajo
 * «incluir rótulos», así que se clasifican igual. Antes todo lo nativo era
 * «objeto» y el resumen anunciaba «Cotas 0» con una DIMENSION en el fichero
 * (auditoría de cliente final del 2026-09-01, racimo C; graduado en
 * `e2e/golden/118-auditoria-cotas-resumen.spec.ts`).
 *
 * El TEXT nativo se queda como objeto a propósito: `exportDxf` lo escribe con
 * las primitivas, pase lo que pase con «incluir rótulos».
 */
export function nativeEntityReadinessKind(
  type: string,
): "measurement" | "label" | "object" {
  if (type === "dimension") return "measurement";
  if (type === "mtext" || type === "mleader") return "label";
  return "object";
}
