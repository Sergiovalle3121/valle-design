/**
 * Mapeo de CAPAS al documento canónico, extraído de `canonical.ts` cuando el
 * intake del ensamblado R2010+ (2026-08-31) empujó ese archivo por encima del
 * presupuesto de monolito. Vive aparte porque es una unidad con sentido
 * propio: la tabla ACI básica y la traducción de una capa, incluida la
 * declaración de lo que NO viene decodificado.
 */
import { ACI_BASIC_HEX as ACI_BASIC } from "../objects/aci-basic.js";
import type { Ac1015NeutralDatabase } from "../reader/ac1015-database-reader.js";
import type { CanonicalLossEntry } from "./canonical.js";


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
  /** Congelada, que no es apagada. Ausente cuando el estado no se midió. */
  readonly frozen?: boolean;
  /** Nombre del tipo de línea; ausente cuando no se pudo resolver. */
  readonly linetype?: string;
}

/**
 * Traduce las capas de la base neutral y ACUMULA en `losses` cada cosa que no
 * se pudo leer. El color y las banderas pueden venir SIN MEDIR: se declara la
 * ausencia en vez de rellenarla con un cero, que produciría capas blancas y
 * descongeladas plausibles y equivocadas.
 *
 * ADENDA 2026-09-01. Esta cabecera decía que el camino R2010+ mide el nombre
 * (303/303) pero no los campos no-nombre. Era cierto cuando se escribió y ha
 * dejado de serlo: la fase 1.F midió estado y color en 54/54 capas de las tres
 * versiones modernas. El caso «sin medir» sigue existiendo —una entrada cuya
 * cabeza no aterriza exacta falla cerrado y llega aquí sin campos— pero es
 * ahora la excepción, no la descripción del camino.
 */
export function mapCanonicalLayers(
  database: Ac1015NeutralDatabase,
  losses: CanonicalLossEntry[],
): CanonicalMappedLayer[] {
  return database.layers.map((layer) => {
    const name = decodeBytes(layer.name);
    // Color y banderas pueden venir SIN MEDIR cuando la entrada no aterriza
    // exacta y su lectura falla cerrada, dejando los campos no-nombre fuera.
    // Se declara la ausencia como pérdida en vez de rellenarla
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
    // ESTADO DE LA CAPA. Hasta el corte del 2026-09-01 esto era una pérdida
    // declarada y el resultado era SIEMPRE `visible: true, locked: false`: una
    // capa congelada se dibujaba. Ahora los dos bits medidos contra el oráculo
    // DXF —congelada y bloqueada— llegan al documento; lo que sigue sin
    // medirse se declara, no se rellena.
    // El estado llega YA interpretado desde el ensamblado: aquí no se descifra
    // ningún bit. Ése es el punto de resolverlo en el origen.
    if (layer.frozen === undefined || layer.locked === undefined) {
      losses.push({
        code: "layer-state-flags-not-decoded",
        sourceType: "LAYER",
        detail: `La capa "${name}" viene de una versión cuyas banderas de estado este laboratorio no decodifica todavía; no se afirma que esté visible ni descongelada.`,
        severity: "warning",
      });
    } else if (layer.unmeasuredStateBits) {
      // No es un error del archivo: es la frontera de lo medido. Los dos bits
      // conocidos se siguen aplicando; lo que se declara es que ESTE estado
      // trae además bits que el corpus admitido nunca mostró variar.
      losses.push({
        code: "layer-state-flags-partially-measured",
        sourceType: "LAYER",
        detail: `La capa "${name}" declara stateFlags=${layer.stateFlags}, cuyos bits 0x${layer.unmeasuredStateBits.toString(16)} se apartan del patrón constante del corpus medido; se aplican congelada y bloqueada, y el resto del estado no se interpreta.`,
        severity: "info",
      });
    }
    // EL TIPO DE LÍNEA: se declara cuando no se resuelve. Un handle que la
    // tabla LTYPE del dibujo no trae se nombra en la pérdida, porque «apunta
    // a la entrada 47 y esa entrada no está» es un hecho distinto —y más
    // útil— que «no hay tipo de línea».
    if (layer.linetypeName === undefined) {
      losses.push({
        code: "layer-linetype-not-resolved",
        sourceType: "LAYER",
        detail:
          layer.linetypeHandle === undefined
            ? `La capa "${name}" no trae un tipo de línea legible en su flujo de handles; se deja sin declarar en vez de suponer CONTINUOUS.`
            : `La capa "${name}" apunta al tipo de línea con handle ${layer.linetypeHandle}, que la tabla LTYPE de este dibujo no trae; se deja sin declarar en vez de suponer CONTINUOUS.`,
        severity: "warning",
      });
    }
    // CONGELADA Y APAGADA SON COSAS DISTINTAS, Y AQUÍ SÓLO SE MIDE UNA. La
    // congelación es el bit 0, medido contra el oráculo DXF; el apagado lo
    // codifica el DXF con color NEGATIVO y en el corpus admitido no hay ni una
    // sola capa apagada, así que no se mide y no se afirma. Por eso `visible`
    // se queda en `true` y la congelación viaja en su propio campo: plegarla
    // en `visible` diría «esta capa está apagada», que es más de lo que se
    // sabe. Una capa apagada de un dibujo real llegaría visible.
    return {
      id: name || handleId(layer.handle),
      name,
      color: color ?? "#FFFFFF",
      visible: true,
      locked: layer.locked ?? false,
      ...(layer.frozen === undefined ? {} : { frozen: layer.frozen }),
      ...(layer.linetypeName === undefined ? {} : { linetype: layer.linetypeName }),
    };
  });
}
