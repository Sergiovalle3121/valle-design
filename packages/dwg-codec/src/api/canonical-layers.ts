/**
 * Mapeo de CAPAS al documento canónico, extraído de `canonical.ts` cuando el
 * intake del ensamblado R2010+ (2026-08-31) empujó ese archivo por encima del
 * presupuesto de monolito. Vive aparte porque es una unidad con sentido
 * propio: la tabla ACI básica y la traducción de una capa, incluida la
 * declaración de lo que NO viene decodificado.
 */
import type { Ac1015NeutralDatabase } from "../reader/ac1015-database-reader.js";
import type { CanonicalLossEntry } from "./canonical.js";

const ACI_BASIC: Record<number, string> = {
  1: "#FF0000",
  2: "#FFFF00",
  3: "#00FF00",
  4: "#00FFFF",
  5: "#0000FF",
  6: "#FF00FF",
  7: "#FFFFFF",
  8: "#808080",
  9: "#C0C0C0",
  250: "#333333",
  251: "#505050",
  252: "#696969",
  253: "#828282",
  254: "#BEBEBE",
  255: "#FFFFFF",
};

/** Bytes de la página de códigos del dibujo como texto. */
const decodeBytes = (bytes: readonly number[] | undefined): string =>
  bytes === undefined ? "" : String.fromCharCode(...bytes);

const handleId = (handle: number): string => `h${handle.toString(16)}`;

/** Una capa del documento canónico, tal como la consume el mapeo. */
export interface CanonicalMappedLayer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

/**
 * Traduce las capas de la base neutral y ACUMULA en `losses` cada cosa que no
 * se pudo leer. El color y las banderas pueden venir SIN MEDIR —es el caso del
 * camino R2010+, donde el nombre sí está medido (303/303) pero sus campos
 * no-nombre no—: se declara la ausencia en vez de rellenarla con un cero, que
 * produciría capas blancas y descongeladas plausibles y equivocadas.
 */
export function mapCanonicalLayers(
  database: Ac1015NeutralDatabase,
  losses: CanonicalLossEntry[],
): CanonicalMappedLayer[] {
  return database.layers.map((layer) => {
    const name = decodeBytes(layer.name);
    // Color y banderas pueden venir SIN MEDIR: es el caso del camino R2010+,
    // donde el nombre de la capa sí está medido (303/303) pero sus campos
    // no-nombre no. Se declara la ausencia como pérdida en vez de rellenarla
    // con un cero, que produciría capas blancas y descongeladas plausibles y
    // equivocadas — ver `r2010-database-assembly.ts`.
    const color =
      layer.colorIndex === undefined ? undefined : ACI_BASIC[layer.colorIndex];
    if (layer.colorIndex === undefined) {
      losses.push({
        code: "layer-color-not-decoded",
        sourceType: "LAYER",
        detail: `La capa "${name}" viene de una versión cuyo color de capa este laboratorio no decodifica todavía; no se aproxima a ninguno.`,
        severity: "warning",
      });
    } else if (color === undefined) {
      losses.push({
        code: "layer-color-aci-approximated",
        sourceType: "LAYER",
        detail: `La capa "${name}" usa el índice ACI ${layer.colorIndex}; el mapeo básico lo aproxima a blanco. La tabla ACI completa es del adaptador de integración.`,
        severity: "info",
      });
    }
    if (layer.stateFlags === undefined) {
      losses.push({
        code: "layer-state-flags-not-decoded",
        sourceType: "LAYER",
        detail: `La capa "${name}" viene de una versión cuyas banderas de estado este laboratorio no decodifica todavía; no se afirma que esté visible ni descongelada.`,
        severity: "warning",
      });
    } else if (layer.stateFlags !== 0) {
      losses.push({
        code: "layer-state-flags-raw",
        sourceType: "LAYER",
        detail: `La capa "${name}" declara stateFlags=${layer.stateFlags}; su semántica bit a bit sigue sin fuente registrada y no se interpreta.`,
        severity: "info",
      });
    }
    return {
      id: name || handleId(layer.handle),
      name,
      color: color ?? "#FFFFFF",
      visible: true,
      locked: false,
    };
  });
}
