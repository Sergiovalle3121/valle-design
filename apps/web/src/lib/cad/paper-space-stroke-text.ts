/**
 * EL TEXTO DE UNA `.shx` SE IMPRIME COMO TRAZOS, NO COMO UNA SUSTITUCIÓN.
 *
 * ## Qué estaba mal, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260903.md`: las cinco `.shx`
 * comunes ya se mapean a una familia de trazos Hershey de dominio público
 * (`fonts/hershey-fonts.ts`), pero `cadHersheyTextStrokes` sólo lo consumía el
 * camino heredado del visor (`entity-three.ts:108`). En la LÁMINA y en el PDF
 * —que es lo que se entrega— el rótulo salía con una de las catorce fuentes
 * estándar del PDF. La sustitución se declaraba con honestidad en el informe de
 * fuentes, y aun así el plano impreso no era el plano dibujado: una `.shx` es
 * un trazo de un solo grosor, y una Helvetica es un contorno relleno. A simple
 * vista, un plano con rótulos «gordos».
 *
 * ## Qué hace este módulo
 *
 * Convierte un rótulo cuyo estilo nombra una `.shx` conocida en los TRAZOS que
 * esa familia dibuja, ya colocados, girados y a su altura. El resultado son
 * comandos `path` del plan de publicación: los mismos que ya llevan la
 * geometría del dibujo, así que el emisor de PDF no necesita saber nada nuevo y
 * el resultado es vectorial de verdad — que es exactamente lo que AutoCAD
 * imprime cuando el estilo es una `.shx`.
 *
 * ## Lo que NO hace, y se dice
 *
 * No interpreta el formato `.shx` de AutoCAD: ofrece OTRO juego de trazos, el
 * de Hershey, cuya naturaleza es la misma. Las anchuras son las de Hershey y no
 * las del binario original, y eso lo sigue declarando `mtext-fonts.ts` con
 * `metricsDiffer: true`. Un rótulo cuya familia NO es una de las cinco `.shx`
 * mapeadas se queda como texto, como hasta ahora: convertir a trazos una
 * Arial sería empeorar el PDF (dejaría de poder buscarse y de copiarse).
 */
import type { CadPoint2 } from "./cad-document";
import {
  CAD_HERSHEY_CAP_HEIGHT,
  cadHersheyTextStrokes,
  type CadHersheyFamily,
} from "./fonts/hershey-fonts";
import { CAD_MTEXT_SCREEN_FONT_OPTIONS, resolveCadMTextFont } from "./mtext-fonts";

/** El rótulo que hay que dibujar, en coordenadas ya de papel. */
export interface CadStrokeTextInput {
  point: CadPoint2;
  text: string;
  /** Altura del rótulo sobre el papel, en las unidades del plan. */
  size: number;
  /** Giro en grados, antihorario, como el resto del plan. */
  rotation: number;
  align?: "left" | "center" | "right" | "justify";
  /**
   * `true` cuando el destino mide la Y hacia ABAJO, que es como está el plan de
   * publicación (`viewportTransform` lleva `d: -factor`) y como la miden el SVG
   * de la previa y jsPDF. Los glifos siguen creciendo hacia arriba del PAPEL y
   * el giro sigue siendo antihorario SOBRE EL PAPEL, porque el volteo se aplica
   * después de girar — que es el mismo orden en que la matriz de la ventana
   * trata la geometría del dibujo.
   */
  yDown?: boolean;
}

/**
 * La familia de trazos que le toca a una familia de fuente del dibujo, o
 * `null` si esa familia no es una `.shx` conocida.
 *
 * Acepta `romans`, `romans.shx` y `ROMANS.SHX`: un estilo de un dibujo ajeno
 * escribe el nombre de las tres maneras y las tres son la misma fuente.
 */
export function cadStrokeFamilyFor(family: string | undefined): CadHersheyFamily | null {
  if (!family || !family.trim()) return null;
  // Se pregunta al MISMO resolutor que usa el visor. Tener aquí una tabla
  // propia sería tener dos verdades: bastaría con que una aprendiera una `.shx`
  // más para que la pantalla y el papel dejasen de coincidir, que es justo el
  // fallo que este módulo existe para cerrar.
  return resolveCadMTextFont(family, CAD_MTEXT_SCREEN_FONT_OPTIONS).strokeFamily;
}

/**
 * Los trazos de un rótulo, colocados. Devuelve una lista de polilíneas en
 * coordenadas del plan; vacía si el texto no tiene glifos que dibujar.
 *
 * La línea BASE es `point`, como en el resto del plan, y los glifos crecen
 * hacia +Y. El giro se aplica alrededor de esa misma base, que es donde AutoCAD
 * lo aplica.
 */
export function cadStrokeTextPaths(
  family: CadHersheyFamily,
  input: CadStrokeTextInput,
): CadPoint2[][] {
  const lines = input.text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const radians = ((input.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // El interlineado del dibujo técnico: 1,5 alturas de mayúscula. Es el mismo
  // que usa `mtext-layout.ts` para medir un párrafo, y usar otro aquí haría que
  // el rótulo midiera una cosa en pantalla y otra en el papel.
  const leading = input.size * 1.5;
  const flip = input.yDown ? -1 : 1;
  const out: CadPoint2[][] = [];
  lines.forEach((line, index) => {
    const { strokes, width } = cadHersheyTextStrokes(family, line, input.size);
    // El desplazamiento horizontal por alineación se calcula con la anchura
    // REAL de los trazos, no con una estimación: es la ventaja de tener los
    // glifos en la mano.
    const dx =
      input.align === "center" ? -width / 2 : input.align === "right" ? -width : 0;
    const dy = -leading * index;
    for (const stroke of strokes) {
      const points = stroke.map((point) => {
        const x = point.x + dx;
        const y = point.y + dy;
        // El giro se resuelve SIEMPRE en el marco del dibujo (Y hacia arriba,
        // antihorario), que es donde lo mide DXF. El volteo del papel se aplica
        // DESPUÉS, igual que la matriz de la ventana (`d: -factor`) lo aplica a
        // la geometría: voltear antes de girar dejaría el rótulo girado al
        // revés — un «PLANTA» vertical leyéndose hacia abajo.
        return {
          x: input.point.x + (x * cos - y * sin),
          y: input.point.y + (x * sin + y * cos) * flip,
        };
      });
      if (points.length >= 2) out.push(points);
    }
  });
  return out;
}

/** La altura de mayúscula de la tabla Hershey, para quien tenga que escalar. */
export { CAD_HERSHEY_CAP_HEIGHT };
