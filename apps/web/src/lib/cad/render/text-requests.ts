/**
 * Rótulos que viajan al atlas de texto del pipeline por lotes.
 *
 * Medido ANTES de este módulo (Node, seis entidades: mtext, text, dimension,
 * mleader, table 2×2 y attdef): `pipeline.visibleTextRequests()` devolvía 1
 * —sólo el MTEXT—. `pipeline.ts` tenía una única rama que producía peticiones
 * de texto; TEXT y ATTDEF se teselaban como el rectángulo de su caja (4
 * segmentos y ninguna letra), la cota y la directriz aportaban sólo sus trazos
 * y las celdas de la tabla no se leían en ningún sitio. Con el pipeline
 * encendido, la rama legada sólo se proyecta para la selección, así que un
 * TEXT sin seleccionar no se dibujaba por NINGÚN camino. La lámina
 * (`paper-space.ts`) ya rotulaba los cinco tipos; aquí se hace lo mismo para
 * la pantalla en una función pura que el spec mide número a número.
 *
 * Convención de anclaje, MEDIDA en la vista 2D del estudio (sonda Playwright:
 * la Y del dibujo crece hacia ABAJO en pantalla; `yScreenSign = 1`):
 * `CadTextQuadRequest.x/y` es el origen de la LÍNEA BASE y los glifos crecen
 * hacia la −Y del dibujo (`buildCadTextQuads`). Por eso `bottom-*` sube la
 * base una línea entera en +Y, `middle-*` media línea y `top-*` nada: es la
 * misma caja que `layoutCadMText` usa para designar (`attachmentOffset`). La
 * alineación HORIZONTAL no se resuelve aquí sino en el atlas, con el avance
 * real de cada glifo (`align`), porque la anchura estimada de `measureCadMText`
 * desplazaba una cota centrada ≈0,42 em (medido). Las líneas sucesivas de un
 * rótulo bajan en pantalla (+Y), como las dibujaba el sprite legado.
 */
import type { CadDocument } from "../cad-document";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import type { CadTextAnchor } from "../cad-entities-v4";
import { buildCadDimensionGeometry } from "../associative-dimension";
import { buildCadMleaderGeometry } from "../associative-mleader";
import { cadTableFrame } from "../annotation-v4-adapters";
import { cadDimensionTextContext } from "../dimension-text-context";
import { cadMTextPlainText } from "../mtext-codes";
import type { CadTextQuadRequest } from "./text-atlas";

const DEFAULT_TEXT_HEIGHT = 120;
const DEFAULT_FONT_KEY = "Arial";
const LINE_SPACING = 1.2;
/** DIMASZ por defecto de `dimension-style.ts`; sin DIMTXT el rótulo mide 0,55 flechas (como en la lámina). */
const DEFAULT_ARROW_SIZE = 180;
const DIMENSION_TEXT_PER_ARROW = 0.55;
/** Relleno de celda relativo a la altura de fila, el mismo CELL_PADDING de `dxf-schema4-table.ts`. */
const CELL_PADDING = 0.15;

export type CadTextRequestStyles = Pick<CadDocument, "styles">;
/** Color de una entidad tal como lo resuelve el pipeline (selección incluida). */
export type CadTextColorResolver = (entity: CadNativeEntity) => number;

/** Rótulo puro según el REGISTRO: se pide al atlas y NO se tesela su caja. */
export function cadEntityIsTextOnly(entity: CadNativeEntity): boolean {
  return CAD_ENTITY_REGISTRY.adapter(entity).renderer.textOnly === true;
}

function fontKeyFor(styleName: string | undefined, styles: CadTextRequestStyles | undefined, fallback?: string): string {
  return (styleName ? styles?.styles.text[styleName]?.fontFamily : undefined) ?? fallback ?? DEFAULT_FONT_KEY;
}

function horizontal(alignment: CadTextAnchor): NonNullable<CadTextQuadRequest["align"]> {
  return alignment.endsWith("center") ? "center" : alignment.endsWith("right") ? "right" : "left";
}

/** Una petición por línea; la base de cada línea baja `lineHeight` en el marco girado. */
function lines(
  text: string,
  fontKey: string,
  fontSize: number,
  anchor: { x: number; y: number },
  alignment: CadTextAnchor,
  rotationDeg: number,
  color: number,
  depth: number,
): CadTextQuadRequest[] {
  const rows = text.split(/\r?\n/);
  const lineHeight = fontSize * LINE_SPACING;
  const dy = alignment.startsWith("middle") ? lineHeight / 2 : alignment.startsWith("bottom") ? lineHeight : 0;
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const align = horizontal(alignment);
  return rows.map((row, index) => {
    const offset = dy + index * lineHeight;
    return {
      text: row,
      fontKey,
      fontSize,
      x: anchor.x - offset * sin,
      y: anchor.y + offset * cos,
      rotationDeg,
      align,
      color,
      depth,
    };
  });
}

/**
 * Peticiones de texto de una entidad. Vacío para lo que no rotula. Una sola
 * línea sin alineación reproduce exactamente la petición que el pipeline
 * emitía antes de existir este módulo (su spec la compara literal a literal).
 */
export function cadTextQuadRequestsFor(
  entity: CadNativeEntity,
  colorOf: CadTextColorResolver,
  depth: number,
  styles?: CadTextRequestStyles,
): CadTextQuadRequest[] {
  switch (entity.type) {
    case "mtext":
      // Los párrafos (`\P`) sí se parten; el ajuste por anchura sigue siendo
      // trabajo de `layoutCadMText` y no se aplica aquí (declarado, no oculto).
      return lines(cadMTextPlainText(entity.text), fontKeyFor(entity.style, styles, entity.fontFamily),
        entity.height ?? DEFAULT_TEXT_HEIGHT, entity.insertion, "top-left", entity.rotation ?? 0, colorOf(entity), depth);
    case "text":
      return lines(entity.text, fontKeyFor(entity.style, styles), entity.height ?? DEFAULT_TEXT_HEIGHT,
        entity, "top-left", entity.rotation ?? 0, colorOf(entity), depth);
    case "attdef": {
      if (entity.invisible) return [];
      // Lo que se dibuja: el valor por defecto si existe y si no la etiqueta
      // (la misma regla que `attdefDisplayText` en annotation-v4-adapters.ts).
      const text = entity.defaultValue && entity.defaultValue.length > 0 ? entity.defaultValue : entity.tag;
      return lines(text, fontKeyFor(entity.style, styles), entity.height ?? DEFAULT_TEXT_HEIGHT, entity.insertion,
        entity.alignment ?? "bottom-left", entity.rotation ?? 0, colorOf(entity), depth);
    }
    case "dimension": {
      const geometry = buildCadDimensionGeometry(entity);
      if (!geometry || geometry.label.trim() === "") return [];
      const fontSize = Math.max(1, entity.textHeight ?? (entity.arrowSize ?? DEFAULT_ARROW_SIZE) * DIMENSION_TEXT_PER_ARROW);
      const textStyle = entity.textStyle ?? (entity.style ? styles?.styles.dimension[entity.style]?.textStyle : undefined);
      // DIMCLRT entra por el MISMO resolutor que las líneas, como contexto de
      // presentación: así la selección sigue ganando (medido: un color fijo
      // dejaba el rótulo rojo con la cota seleccionada en ámbar).
      const color = colorOf({ ...entity, context: cadDimensionTextContext(entity) } as CadNativeEntity);
      return lines(geometry.label, fontKeyFor(textStyle, styles), fontSize, geometry.textAnchor, "middle-center",
        geometry.textAngle, color, depth);
    }
    case "mleader": {
      const geometry = buildCadMleaderGeometry(entity);
      if (!geometry || entity.text.trim() === "") return [];
      // El texto cuelga del lado de la línea de referencia hacia el que apunta
      // (entity-three.ts hace lo mismo con su sprite).
      return lines(entity.text, fontKeyFor(entity.style, styles, entity.fontFamily), entity.textHeight ?? DEFAULT_TEXT_HEIGHT,
        geometry.textAnchor, geometry.textDirection > 0 ? "middle-left" : "middle-right",
        entity.textRotation ?? 0, colorOf(entity), depth);
    }
    case "table": {
      const frame = cadTableFrame(entity);
      const rotationDeg = entity.rotation ?? 0;
      const color = colorOf(entity);
      const columnX = entity.columnWidths.map((_, index) =>
        entity.columnWidths.slice(0, index).reduce((total, value) => total + value, 0));
      const rowY = entity.rowHeights.map((_, index) =>
        entity.rowHeights.slice(0, index).reduce((total, value) => total + value, 0));
      const requests: CadTextQuadRequest[] = [];
      for (const cell of entity.cells) {
        if (cell.text.trim() === "" || cell.row >= entity.rows || cell.column >= entity.columns) continue;
        const width = entity.columnWidths[cell.column] ?? 0;
        const height = entity.rowHeights[cell.row] ?? 0;
        const padding = height * CELL_PADDING;
        // La misma tabla de anclas que el escritor DXF (dxf-schema4-table.ts):
        // `middle-left` por defecto, relleno 0,15 × fila en los bordes.
        const alignment = cell.alignment ?? "middle-left";
        const localX = alignment.endsWith("right") ? width - padding : alignment.endsWith("center") ? width / 2 : padding;
        const localY = alignment.startsWith("top") ? padding : alignment.startsWith("bottom") ? height - padding : height / 2;
        const anchor = frame.toWorld((columnX[cell.column] ?? 0) + localX, (rowY[cell.row] ?? 0) + localY);
        requests.push(...lines(cell.text, fontKeyFor(cell.textStyle, styles), cell.textHeight ?? height * 0.5,
          anchor, alignment, rotationDeg, color, depth));
      }
      return requests;
    }
    default:
      return [];
  }
}
