/**
 * LOS RÓTULOS DE UNA `.shx` SE CONVIERTEN EN TRAZOS ANTES DE EMITIR.
 *
 * ## Qué estaba mal, medido
 *
 * El dibujo ajeno llega con sus estilos de texto nombrando `.shx` —`romans`,
 * `isocp`, `txt`— y el visor ya las dibujaba con los trazos Hershey de dominio
 * público desde la campaña de fuentes. La LÁMINA y el PDF no: el emisor pedía
 * una de las catorce fuentes estándar y el rótulo salía con un contorno
 * relleno donde el dibujo tenía un trazo único. El informe de fuentes lo
 * declaraba con honradez —«SUSTITUIDA por helvetica»— y aun así lo entregado
 * no era lo dibujado. En un plano lleno de rótulos, es lo primero que se ve.
 *
 * ## Dónde se hace y por qué aquí
 *
 * En el TRABAJO de trazado, sobre el plan ya con plumas resueltas y justo
 * después de contar las familias. Así:
 *
 * - la previa (`buildCadPlotPreview`) y el PDF (`renderCadPlotPdf`) comen del
 *   MISMO plan, y no puede pasar que la previa enseñe trazos y el papel no;
 * - el informe de fuentes sigue contando la familia que pedía el dibujo,
 *   porque se cuenta antes: convertir primero borraría del informe justo la
 *   familia sobre la que hay que rendir cuentas;
 * - el emisor no aprende nada nuevo. Un `path` ya lo sabía dibujar.
 *
 * ## Lo que NO se convierte, y se dice
 *
 * Sólo las familias que resuelven a un juego de trazos (`cadStrokeFamilyFor`,
 * que pregunta al mismo resolutor que el visor). Una Arial se queda como texto:
 * pasarla a trazos dejaría el PDF sin texto que buscar ni copiar, y encima con
 * un dibujo peor. El texto de un `maxWidth` se reparte en renglones aquí
 * —midiendo con las anchuras REALES de la familia de trazos—, porque el ajuste
 * de línea de jsPDF deja de estar disponible en cuanto el rótulo es geometría.
 */
import {
  cadStrokeFamilyFor,
  cadStrokeTextPaths,
} from "../paper-space-stroke-text";
import { cadHersheyTextWidth, type CadHersheyFamily } from "../fonts/hershey-fonts";
import type {
  CadPublishSheet,
  CadPublishViewport,
  CadVectorCommand,
} from "../paper-space";

/**
 * Grosor de la pluma de un rótulo trazado, en mm de papel.
 *
 * Es el MISMO cociente que usa el visor (`entity-three.ts`): altura entre 14, y
 * entre 8 si el rótulo es negrita. Un trazo único no tiene «peso» que fingir —
 * lo único que puede engordar es la pluma— y usar aquí otro número haría que el
 * papel saliera de un grosor distinto al de la pantalla. El mínimo de 0,05 mm es
 * el mismo suelo que la tabla de plumas: por debajo, el trazador no dibuja.
 */
export function cadStrokeTextPenWidth(size: number, bold?: boolean): number {
  return Math.max(0.05, size / (bold ? 8 : 14));
}

/**
 * Reparte un rótulo en renglones que quepan en `maxWidth`, midiendo con las
 * anchuras de la familia de trazos.
 *
 * Corta por palabras y sólo parte una palabra cuando ella sola no cabe: es el
 * mismo criterio que aplica el ajuste de jsPDF, y el que espera quien escribió
 * el párrafo. Los saltos de línea que el rótulo ya traía se respetan.
 */
export function cadStrokeTextWrap(
  family: CadHersheyFamily,
  text: string,
  size: number,
  maxWidth: number | undefined,
): string {
  if (!maxWidth || !(maxWidth > 0)) return text;
  const measure = (value: string) => cadHersheyTextWidth(family, value, size);
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter((value) => value.length > 0)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      out.push(line);
      line = word;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** La familia que pide un rótulo, con el mismo recorte de sufijo que el emisor. */
function familyOf(
  entityId: string,
  fontByEntity: ReadonlyMap<string, string>,
): string | undefined {
  return (
    fontByEntity.get(entityId) ??
    fontByEntity.get(entityId.split(":attribute:")[0])
  );
}

/**
 * El comando de texto convertido en trazos, o `null` si su familia no es una
 * `.shx` con juego de trazos y tiene que seguir siendo texto.
 */
export function cadStrokeTextCommands(
  command: CadVectorCommand,
  fontByEntity: ReadonlyMap<string, string>,
): CadVectorCommand[] | null {
  if (command.kind !== "text") return null;
  // Un rótulo con máscara de fondo se queda como texto. La máscara es una caja
  // RELLENA detrás de las letras y el comando `path` no se rellena en ningún
  // emisor de hoy: convertirlo taparía menos de lo que tapaba, en silencio. Se
  // pierde el trazo antes que perder la máscara — y el informe de fuentes lo
  // sigue declarando como sustitución, que es lo que de verdad le pasa.
  if (command.backgroundMask) return null;
  const family = cadStrokeFamilyFor(familyOf(command.entityId, fontByEntity));
  if (!family) return null;
  const paths = cadStrokeTextPaths(family, {
    point: command.point,
    text: cadStrokeTextWrap(family, command.text, command.size, command.maxWidth),
    size: command.size,
    rotation: command.rotation,
    ...(command.align ? { align: command.align } : {}),
    yDown: true,
  });
  const lineWidth = cadStrokeTextPenWidth(command.size, command.bold);
  return paths.map((points) => ({
    kind: "path",
    entityId: command.entityId,
    viewportId: command.viewportId,
    points,
    closed: false,
    style: { stroke: command.color, lineWidth },
  }));
}

/**
 * Las hojas con sus rótulos de `.shx` ya trazados.
 *
 * Devuelve también QUÉ familias se trazaron, porque el informe de fuentes tiene
 * que poder decir «ISOCP: dibujada con trazos» en vez de «sustituida por
 * helvetica», que a partir de aquí sería mentira.
 */
export function cadStrokeSheetText(
  sheets: readonly CadPublishSheet[],
  fontByEntity: ReadonlyMap<string, string>,
): { sheets: CadPublishSheet[]; strokedFamilies: string[] } {
  const stroked = new Set<string>();
  /** Familias que AÚN viajan como texto: una máscara de fondo basta. */
  const asText = new Set<string>();
  const next = sheets.map((sheet): CadPublishSheet => {
    const viewports = sheet.viewports.map((viewport): CadPublishViewport => {
      const commands: CadVectorCommand[] = [];
      for (const command of viewport.commands) {
        const paths = cadStrokeTextCommands(command, fontByEntity);
        const family = familyOf(command.entityId, fontByEntity);
        if (!paths) {
          if (command.kind === "text" && family) asText.add(family);
          commands.push(command);
          continue;
        }
        if (family) stroked.add(family);
        commands.push(...paths);
      }
      return { ...viewport, commands };
    });
    return { ...sheet, viewports };
  });
  return {
    sheets: next,
    // Una familia se declara TRAZADA sólo si no le quedó ni un rótulo como
    // texto: media verdad en el informe de fuentes es peor que ninguna.
    strokedFamilies: [...stroked]
      .filter((family) => !asText.has(family))
      .sort((a, b) => a.localeCompare(b, "es")),
  };
}
