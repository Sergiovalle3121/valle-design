/**
 * Fuentes del trazado: qué familia pide el dibujo y con qué acaba impresa.
 *
 * ## El problema que resuelve, dicho sin rodeos
 *
 * Un plano se rechaza en ventanilla por cosas que no se ven al dibujarlo. La
 * más cara es la sustitución de fuente: el dibujo pide `ISOCPEUR`, el PDF no la
 * lleva dentro, el visor del municipio la cambia por otra, las anchuras cambian
 * y las cotas se solapan con los muros. Nadie se entera hasta que el plano ya
 * está impreso y sellado.
 *
 * Este módulo hace UNA cosa: convierte «qué familias usa el dibujo» en «qué va
 * a pasar con cada una», con nombre y apellidos. Una familia sólo puede acabar
 * de tres maneras, y las tres se declaran:
 *
 * - **incrustada** — el programa de la fuente viaja dentro del PDF y el plano
 *   se ve igual en cualquier visor;
 * - **residente** — es una de las catorce estándar del PDF, que todo visor
 *   conforme tiene; no engorda el archivo y tampoco cambia nada;
 * - **sustituida** — ni va dentro ni es estándar, así que se imprime con otra
 *   distinta. Esto NO es un fallo por sí solo: es una decisión legítima que
 *   tiene que quedar escrita.
 *
 * ## Por qué la familia se busca en el documento y no en el plan vectorial
 *
 * El plan de publicación aplana el texto a «punto, cadena, altura, color» y
 * pierde la familia por el camino. Deducirla del plan es imposible; inventarla
 * —suponer que todo el mundo dibuja en Arial— es lo que hacía que el informe de
 * fuentes dijese siempre lo mismo tanto si el dibujo usaba una familia como si
 * usaba cuatro. Así que se lee del DOCUMENTO, que es donde vive: del estilo de
 * texto de la entidad, o de la familia explícita si la trae.
 */
import type { CadDocument, CadEntity } from "../cad-document";
import { cadStrokeFamilyFor } from "../paper-space-stroke-text";

/** Familia que se usa cuando ni la entidad ni su estilo dicen nada. */
export const CAD_DEFAULT_FONT_FAMILY = "Arial";

/** Las catorce estándar del PDF, indexadas por familia del dibujo. */
const STANDARD_FONTS: Readonly<Record<string, string>> = {
  arial: "helvetica",
  helvetica: "helvetica",
  "helvetica neue": "helvetica",
  verdana: "helvetica",
  tahoma: "helvetica",
  "segoe ui": "helvetica",
  times: "times",
  "times new roman": "times",
  georgia: "times",
  serif: "times",
  courier: "courier",
  "courier new": "courier",
  monospace: "courier",
};

/**
 * Familias que un visor conforme tiene SIEMPRE, sin incrustar nada.
 *
 * Sólo estas tres. `Arial` no está: se parece a Helvetica y por eso el cambio
 * pasa desapercibido, pero las anchuras no son idénticas y a tamaño de cota se
 * nota. Que `Arial` cuente como sustitución y no como residente es deliberado.
 */
const RESIDENT = new Set(["helvetica", "times", "courier"]);

/**
 * Las CUATRO formas en que una familia acaba en el papel.
 *
 * `stroked` es la que faltaba: la familia no viaja ni se cambia por otra tipo­
 * grafía — se DIBUJA, con el juego de trazos de dominio público que le
 * corresponde (`plot-stroke-text.ts`). El rótulo sale vectorial y con el trazo
 * único de la `.shx` original; lo que cambia son las anchuras, y eso se dice.
 */
export type CadFontDisposition = "embedded" | "resident" | "substituted" | "stroked";

export interface CadPlotFontResolution {
  /** Familia tal y como la pide el dibujo. */
  family: string;
  /** Nombre con el que acaba en el PDF. */
  baseFont: string;
  disposition: CadFontDisposition;
  /** Familia que la reemplaza, cuando hay sustitución. `null` si no la hay. */
  substitutedBy: string | null;
  /** Cuántos rótulos del trazado dependen de esta familia. */
  usageCount: number;
}

/** Familia del dibujo → fuente estándar más cercana. */
export function cadStandardFontFor(family: string): string {
  return STANDARD_FONTS[family.trim().toLowerCase()] ?? "helvetica";
}

function normalize(family: string | undefined): string {
  return (family ?? "").trim();
}

/**
 * Familia de una entidad de texto.
 *
 * Precedencia igual que en AutoCAD: la familia explícita de la entidad gana
 * sobre la de su estilo de texto, y el estilo gana sobre el implícito.
 */
export function cadEntityFontFamily(entity: CadEntity, document: CadDocument): string {
  if (entity.type !== "text" && entity.type !== "mtext" && entity.type !== "mleader")
    return CAD_DEFAULT_FONT_FAMILY;
  const explicit = normalize(
    (entity as { fontFamily?: string }).fontFamily,
  );
  if (explicit) return explicit;
  const styleName = normalize((entity as { style?: string }).style);
  const styled = normalize(document.styles?.text?.[styleName]?.fontFamily);
  if (styled) return styled;
  return CAD_DEFAULT_FONT_FAMILY;
}

/**
 * Familia por entidad, para que el emisor pinte cada rótulo con la suya.
 *
 * Se indexa por `entityId` porque es el único identificador que sobrevive al
 * plan vectorial. Los rótulos derivados —atributos de bloque, texto de cota—
 * llevan el id de su entidad con un sufijo, y el emisor lo recorta.
 */
export function cadDocumentFontByEntity(document: CadDocument): Map<string, string> {
  const byEntity = new Map<string, string>();
  const visit = (entities: readonly CadEntity[]): void => {
    for (const entity of entities) {
      if (entity.type === "text" || entity.type === "mtext" || entity.type === "mleader")
        byEntity.set(entity.id, cadEntityFontFamily(entity, document));
    }
  };
  visit(document.entities);
  for (const block of document.blocks ?? []) visit(block.entities);
  return byEntity;
}

/**
 * Familias que el dibujo necesita, sin repetir y en orden estable.
 *
 * Estable porque este resultado se publica como evidencia: un orden que
 * dependiese del recorrido haría que el artefacto cambiase sin que cambiase
 * nada del dibujo.
 */
export function cadDocumentFontFamilies(document: CadDocument): string[] {
  const families = new Set<string>();
  for (const family of cadDocumentFontByEntity(document).values()) families.add(family);
  for (const style of Object.values(document.styles?.text ?? {})) {
    const family = normalize(style.fontFamily);
    if (family) families.add(family);
  }
  if (families.size === 0) families.add(CAD_DEFAULT_FONT_FAMILY);
  return [...families].sort((a, b) => a.localeCompare(b, "es"));
}

export interface CadPlotFontUsage {
  family: string;
  usageCount: number;
}

/**
 * Qué le pasa a cada familia en este trazado.
 *
 * `embeddable` son las familias de las que SÍ hay programa de fuente. Se pasa
 * la lista en vez de consultarla porque quien sabe si una fuente llegó a
 * incrustarse es el emisor, después de escribir el archivo — y este módulo
 * tiene que poder decir la verdad sin depender de que nadie se acuerde.
 */
export function resolveCadPlotFonts(
  usage: readonly CadPlotFontUsage[],
  embeddable: readonly string[] = [],
  strokedFamilies: readonly string[] = [],
): CadPlotFontResolution[] {
  const embedded = new Set(embeddable.map((family) => family.trim().toLowerCase()));
  const stroked = new Set(strokedFamilies.map((family) => family.trim().toLowerCase()));
  return usage
    .map((entry): CadPlotFontResolution => {
      const key = entry.family.trim().toLowerCase();
      // Trazada gana a todo lo demás: sus rótulos ya NO son texto en el
      // archivo, así que ni se incrusta ni se sustituye nada.
      const strokeFamily = stroked.has(key) ? cadStrokeFamilyFor(entry.family) : null;
      if (strokeFamily)
        return {
          family: entry.family,
          // `baseFont` sigue siendo una fuente REAL del PDF: sus rótulos ya son
          // geometría, pero si a esta familia le quedara algún texto —uno con
          // máscara de fondo— tiene que poder escribirse con algo que exista.
          // Poner aquí «Hershey ISO» dejaba a jsPDF sin fuente que buscar.
          baseFont: cadStandardFontFor(entry.family),
          disposition: "stroked",
          substitutedBy: strokeFamily,
          usageCount: entry.usageCount,
        };
      if (embedded.has(key))
        return {
          family: entry.family,
          baseFont: entry.family,
          disposition: "embedded",
          substitutedBy: null,
          usageCount: entry.usageCount,
        };
      const standard = cadStandardFontFor(entry.family);
      const resident = RESIDENT.has(key);
      return {
        family: entry.family,
        baseFont: standard,
        disposition: resident ? "resident" : "substituted",
        substitutedBy: resident ? null : standard,
        usageCount: entry.usageCount,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family, "es"));
}

/**
 * Renglón que se le enseña a quien traza.
 *
 * Una línea por familia sustituida, con el nombre de la que la reemplaza. Es
 * literalmente el dato que hoy no aparece en ningún sitio y por el que un plano
 * entregado sale distinto de lo que se vio en pantalla.
 */
export function describeCadPlotFonts(fonts: readonly CadPlotFontResolution[]): string[] {
  return fonts.map((font) => {
    if (font.disposition === "embedded")
      return `${font.family}: incrustada en el PDF (${font.usageCount} rótulo(s)).`;
    if (font.disposition === "resident")
      return `${font.family}: residente en el visor, no se incrusta (${font.usageCount} rótulo(s)).`;
    if (font.disposition === "stroked")
      return `${font.family}: DIBUJADA con los trazos ${font.substitutedBy} (${font.usageCount} rótulo(s)); trazo único como la .shx, anchuras de Hershey.`;
    return `${font.family}: SUSTITUIDA por ${font.substitutedBy} (${font.usageCount} rótulo(s)); las anchuras no son las del dibujo.`;
  });
}
