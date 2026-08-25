/**
 * Manifiesto de pérdidas de `convertDxfPrimitivesToEditable`
 * (`Layout3DEditor.tsx`) — vive aparte del monolito por presupuesto de
 * líneas y porque es lógica pura, fácil de probar sola.
 *
 * `describeDxfOriginOffsetLoss` cierra el hallazgo de P0-3 del backlog:
 * `convertDxfPrimitivesToEditable` normaliza cada punto restando `bounds`
 * (el rectángulo envolvente del DXF) para que el resultado caiga encima del
 * backdrop (mismo criterio que `parseDxf`, `components/cad/interop/dxf.ts`)
 * — pero antes ese desplazamiento se USABA y nunca se REGISTRABA: un
 * documento con coordenadas UTM (~10⁶) convertido por esta vía perdía su
 * georreferencia sin que nada lo dijera (garantía 5,
 * `docs/interop/CONTRATO-INTEROP.md`, "re-encuadre silencioso").
 *
 * Esta ruta NO es un importador fiel de ida y vuelta (a diferencia de
 * `DXFIN`/la importación del dashboard, que usan proyección identidad y sí
 * conservan las coordenadas absolutas): la mitad de lo que produce son
 * `Asset` de muro/zona del modelo de planta heredado, sin representación
 * DXF propia, y el texto se trunca a 80 caracteres. Prometer una reversión
 * automática al reexportar sería fingir una fidelidad que esta vía nunca
 * tuvo. Lo que sí le corresponde, y es lo que este módulo cierra, es dejar
 * de ser silenciosa: declarar el desplazamiento exacto para que quien lo
 * necesite pueda revertirlo a mano.
 */
import type { CadDxfImportWarning } from "@/lib/cad/dxf-import";
import type { CadLossManifestEntry } from "@/lib/cad/cad-document";

/**
 * `dx`/`dy` son el desplazamiento aplicado a cada punto, en unidades del
 * DXF de origen: `punto_convertido = punto_dxf + (dx, dy)` antes de la
 * escala/rotación/offset propios del panel "Ajustar DXF de fondo". `null`
 * cuando el DXF ya empezaba en (0,0) — el caso sin pérdida que hoy es la
 * excepción, no la regla, para un archivo real.
 */
export function describeDxfOriginOffsetLoss(
  dx: number,
  dy: number,
): CadLossManifestEntry | null {
  if (dx === 0 && dy === 0) return null;
  return {
    code: "dxf_import:origin_shifted",
    sourceType: "DXF",
    detail:
      `La conversión a entidades editables desplazó el origen del DXF ` +
      `${dx.toFixed(3)} en X y ${dy.toFixed(3)} en Y (unidades del DXF) ` +
      `para alinear con el plano de fondo — el archivo original no ` +
      `empezaba en (0,0). Este desplazamiento NO se revierte solo al ` +
      `reexportar: para recuperar las coordenadas absolutas originales, ` +
      `réstalo junto con el offset/escala/rotación del panel "Ajustar DXF ` +
      `de fondo".`,
    severity: "warning",
  };
}

/** Todo lo que `convertDxfPrimitivesToEditable` declara como pérdida, en un solo lugar. */
export function buildDxfConversionLossManifest(
  warnings: readonly CadDxfImportWarning[],
  truncation: { truncated: boolean; cap: number },
  origin: { dx: number; dy: number },
): CadLossManifestEntry[] {
  const entries: CadLossManifestEntry[] = warnings.map((warning) => ({
    code: `dxf_import:${warning.code}`,
    sourceType: warning.entityType ?? "DXF",
    detail: warning.layer
      ? `${warning.message} · layer ${warning.layer}`
      : warning.message,
    severity: "warning",
  }));
  if (truncation.truncated)
    entries.push({
      code: "dxf_import:conversion_truncated",
      sourceType: "DXF",
      detail: `La conversión editable se limitó a ${truncation.cap} entidades por seguridad.`,
      severity: "warning",
    });
  const originLoss = describeDxfOriginOffsetLoss(origin.dx, origin.dy);
  if (originLoss) entries.push(originLoss);
  return entries;
}
