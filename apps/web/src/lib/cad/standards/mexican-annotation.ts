/**
 * CÓMO SE ACOTA Y SE ROTULA UN PLANO MEXICANO.
 *
 * ## Las tres cosas que un arquitecto mexicano corrige el primer día
 *
 * 1. **La unidad.** AutoCAD acota en unidades de dibujo. En arquitectura
 *    mexicana se acota en METROS con dos decimales y sin escribir la unidad: un
 *    muro de tres metros cuarenta y cinco se rotula `3.45`. En plano de detalle
 *    se cambia a CENTÍMETROS enteros: `12`. Ninguna norma mexicana lo dice —es
 *    costumbre— pero es tan uniforme que un plano acotado en milímetros se lee
 *    como plano de máquinas.
 * 2. **El remate.** La cota arquitectónica se remata con la garrapata, el trazo
 *    oblicuo a 45°, no con la flecha rellena. La terminación SÍ está normada
 *    —ISO 129-1 la admite— pero elegirla para arquitectura es costumbre, y la
 *    diferencia entre las dos frases es lo que hace creíble todo lo demás.
 * 3. **El tamaño de la letra.** Se mide en el PAPEL, no en el modelo. 2,5 mm es
 *    2,5 mm a 1:50 y a 1:100; lo que cambia es cuánto vale eso en unidades de
 *    dibujo. Esa conversión ya existe y se usa desde aquí en vez de copiar
 *    cifras.
 *
 * ## Por qué el documento nace con SIETE estilos de cota y no con uno
 *
 * Porque la escala de un plano cambia después de dibujarlo. Un despacho empieza
 * la planta a 1:50, no le cabe, y la pasa a 1:75. Si el documento sólo trae
 * `COTA 1:50`, ese cambio deja las cotas cuatro veces demasiado pequeñas hasta
 * que alguien lo nota al imprimir. Trayendo los estilos de las escalas
 * arquitectónicas mexicanas —incluida 1:75, que ISO 5455 no recoge— el cambio de
 * escala es elegir un estilo de una lista, no rehacer la acotación.
 *
 * ## Una honestidad concreta sobre 1:75
 *
 * 1:75 y 1:25 se usan a diario en vivienda mexicana y **no figuran en ISO
 * 5455**. Se ofrecen igual, marcadas como costumbre. Callar que no son escalas
 * normalizadas sería más cómodo y menos cierto.
 */
import type { CadStyleTable } from "../cad-document";
import { cadAnnotativeModelHeight } from "../layout/annotative-scale";
import { convertLength, formatLength, type LengthUnit } from "../dimension-format";
import { cadStandardSource } from "./mexican-drafting-sources";

/**
 * Alturas de rótulo sobre el PAPEL, de la serie de ISO 3098-1.
 *
 * Los tres escalones que usa una lámina arquitectónica: la nota corriente, el
 * nombre de local y el título del dibujo. Fuera de la serie el texto sale
 * distinto al reducir la lámina a A3 para revisión.
 */
export const CAD_MEXICAN_TEXT_MM = {
  /** Notas, claves y el texto de las cotas. Mínimo cómodo de ISO 3098-1. */
  rotulo: 2.5,
  /** Nombre de local y encabezado de cuadro. */
  subtitulo: 3.5,
  /** Título del dibujo dentro de la lámina. */
  titulo: 5,
} as const;

/** Nombres de estilo de texto tal como aparecen en la tabla del documento. */
export const CAD_MEXICAN_TEXT_STYLES = {
  rotulo: "ROTULO",
  subtitulo: "SUBTITULO",
  titulo: "TITULO",
} as const;

/**
 * Tamaño de la garrapata sobre el papel.
 *
 * Igual que la altura del rótulo: una garrapata más pequeña que la letra de la
 * cota se pierde al reducir, y más grande se come el hueco entre cotas seguidas.
 */
export const CAD_MEXICAN_TICK_MM = 2.5;

/** Para qué es el estilo de cota. Decide unidad y decimales. */
export type CadMexicanDimensionUse = "arquitectonico" | "detalle";

export interface CadMexicanScale {
  /** Denominador: 50 es 1:50. */
  denominator: number;
  use: CadMexicanDimensionUse;
  /** ¿Figura en la lista de escalas recomendadas de ISO 5455? */
  isoRecommended: boolean;
  /** Para qué se usa esa escala en un despacho mexicano. */
  purpose: string;
  sources: readonly string[];
}

/**
 * Las escalas con las que se dibuja en México, con la verdad sobre cada una.
 *
 * El campo `isoRecommended` no es adorno: es la diferencia entre «esta escala
 * está normalizada» y «esta escala se usa». Las dos son razones legítimas para
 * ofrecerla; confundirlas no lo es.
 */
export const CAD_MEXICAN_SCALES: readonly CadMexicanScale[] = [
  {
    denominator: 200,
    use: "arquitectonico",
    isoRecommended: true,
    purpose: "Planta de conjunto y plano de localización del predio.",
    sources: ["iso-5455-escalas"],
  },
  {
    denominator: 100,
    use: "arquitectonico",
    isoRecommended: true,
    purpose: "Planta arquitectónica de edificio grande y planta de azotea.",
    sources: ["iso-5455-escalas"],
  },
  {
    denominator: 75,
    use: "arquitectonico",
    isoRecommended: false,
    purpose:
      "Vivienda que no cabe a 1:50 y pierde detalle a 1:100. Escala corriente en México y ausente " +
      "de ISO 5455.",
    sources: ["iso-5455-escalas", "escala-1-75"],
  },
  {
    denominator: 50,
    use: "arquitectonico",
    isoRecommended: true,
    purpose: "Planta arquitectónica, alzados y cortes de casa habitación. La escala por defecto.",
    sources: ["iso-5455-escalas"],
  },
  {
    denominator: 25,
    use: "detalle",
    isoRecommended: false,
    purpose: "Corte por fachada y escaleras. Muy usada en México, ausente de ISO 5455.",
    sources: ["iso-5455-escalas", "escala-1-75"],
  },
  {
    denominator: 20,
    use: "detalle",
    isoRecommended: true,
    purpose: "Detalle constructivo, baños y cocinas amuebladas.",
    sources: ["iso-5455-escalas"],
  },
  {
    denominator: 10,
    use: "detalle",
    isoRecommended: true,
    purpose: "Detalle de herrería, cancelería y encuentro de materiales.",
    sources: ["iso-5455-escalas"],
  },
  {
    denominator: 5,
    use: "detalle",
    isoRecommended: true,
    purpose: "Detalle a tamaño casi real: sellos, juntas y perfiles.",
    sources: ["iso-5455-escalas"],
  },
];

/** Regla de unidad y decimales por uso. Es la costumbre, y está dicha así. */
export const CAD_MEXICAN_DIMENSION_RULES: Readonly<
  Record<CadMexicanDimensionUse, { unit: LengthUnit; precision: number; sources: readonly string[] }>
> = {
  arquitectonico: {
    unit: "m",
    precision: 2,
    sources: ["cota-metros-dos-decimales", "garrapata-arquitectonica", "iso-129-1-terminacion"],
  },
  detalle: {
    unit: "cm",
    precision: 0,
    sources: ["cota-metros-dos-decimales", "garrapata-arquitectonica", "iso-129-1-terminacion"],
  },
};

/**
 * Nombre del estilo de cota de una escala.
 *
 * `COTA 1:50` para arquitectónico y `COTA DET 1:20` para detalle. Los dos
 * prefijos se distinguen a propósito: un estilo llamado `COTA 1:20` invitaría a
 * usarlo en la planta y sacaría las cotas en centímetros en medio de una lámina
 * acotada en metros.
 */
export function cadMexicanDimensionStyleName(scale: CadMexicanScale): string {
  const prefix = scale.use === "detalle" ? "COTA DET" : "COTA";
  return `${prefix} 1:${scale.denominator}`;
}

/** Error tipado: pedir una escala que la norma no ofrece no puede fallar callando. */
export class CadMexicanScaleError extends Error {
  readonly code = "cad_mexican_scale_unknown";
  constructor(readonly denominator: number) {
    super(
      `1:${denominator} no está en las escalas de dibujo mexicano de la norma del producto. ` +
        `Las declaradas son: ${CAD_MEXICAN_SCALES.map((item) => `1:${item.denominator}`).join(", ")}.`,
    );
    this.name = "CadMexicanScaleError";
  }
}

export function cadMexicanScale(denominator: number): CadMexicanScale {
  const found = CAD_MEXICAN_SCALES.find((item) => item.denominator === denominator);
  if (!found) throw new CadMexicanScaleError(denominator);
  return found;
}

/**
 * Tabla de estilos de texto de la norma, a la escala de la lámina.
 *
 * Las alturas se calculan con `cadAnnotativeModelHeight`, que es la MISMA
 * función que reescala los rótulos cuando el arquitecto cambia la escala de la
 * ventana. Dos fuentes distintas para el mismo número es la vía garantizada a un
 * plano con dos tamaños de letra.
 */
export function cadMexicanTextStyles(
  scale: number,
  unit = "mm",
  fontFamily = "Helvetica",
): CadStyleTable["text"] {
  return {
    [CAD_MEXICAN_TEXT_STYLES.rotulo]: {
      fontFamily,
      height: cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.rotulo, scale, unit),
    },
    [CAD_MEXICAN_TEXT_STYLES.subtitulo]: {
      fontFamily,
      height: cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.subtitulo, scale, unit),
    },
    [CAD_MEXICAN_TEXT_STYLES.titulo]: {
      fontFamily,
      height: cadAnnotativeModelHeight(CAD_MEXICAN_TEXT_MM.titulo, scale, unit),
    },
  };
}

/**
 * Un estilo de cota de la norma, a su escala.
 *
 * `arrowhead: "architectural-tick"` es la garrapata; `units` es la unidad en que
 * se ROTULA la medida, que no tiene por qué ser la del dibujo. El documento está
 * en milímetros y la cota dice metros: la conversión la hace la entidad al
 * componer su etiqueta.
 */
export function cadMexicanDimensionStyle(
  scale: CadMexicanScale,
  unit = "mm",
): CadStyleTable["dimension"][string] {
  const rule = CAD_MEXICAN_DIMENSION_RULES[scale.use];
  return {
    textStyle: CAD_MEXICAN_TEXT_STYLES.rotulo,
    arrowSize: cadAnnotativeModelHeight(CAD_MEXICAN_TICK_MM, scale.denominator, unit),
    precision: rule.precision,
    units: rule.unit,
    arrowhead: "architectural-tick",
  };
}

/**
 * TODOS los estilos de cota de la norma, en un documento.
 *
 * Ocho estilos parecen muchos hasta que se cuenta lo que cuesta el que falta:
 * cambiar una planta de 1:50 a 1:75 sin estilo preparado es reacotar el plano
 * entero o imprimirlo con la letra a 1,7 mm.
 */
export function cadMexicanDimensionStyles(unit = "mm"): CadStyleTable["dimension"] {
  const table: CadStyleTable["dimension"] = {};
  for (const scale of CAD_MEXICAN_SCALES)
    table[cadMexicanDimensionStyleName(scale)] = cadMexicanDimensionStyle(scale, unit);
  return table;
}

/**
 * Cómo se rotula una medida en un plano mexicano.
 *
 * Entra la longitud EN LA UNIDAD DEL DIBUJO y sale la etiqueta tal cual se
 * imprime: `3.45` en arquitectónico, `12` en detalle. Sin sufijo de unidad,
 * porque en un plano arquitectónico mexicano la unidad no se escribe: se declara
 * una vez en el cajetín y se calla en las cotas. Escribirla en cada cota
 * duplicaría el ancho de la etiqueta y ninguna lámina real lo hace.
 */
export function formatCadMexicanDimension(
  value: number,
  use: CadMexicanDimensionUse,
  drawingUnit: LengthUnit = "mm",
): string {
  const rule = CAD_MEXICAN_DIMENSION_RULES[use];
  const converted = convertLength(value, drawingUnit, rule.unit);
  return formatLength(converted, {
    unit: rule.unit,
    precision: rule.precision,
    showUnit: false,
  });
}

/**
 * Comprobación de integridad de las citas de este módulo.
 *
 * Igual que en las capas: se expone como función para que el guion de evidencia
 * publique el resultado en vez de que alguien lo afirme de palabra.
 */
export function cadMexicanAnnotationSourceProblems(): string[] {
  const problems: string[] = [];
  const check = (owner: string, sources: readonly string[]) => {
    if (sources.length === 0) {
      problems.push(`${owner}: no cita ninguna fuente.`);
      return;
    }
    for (const id of sources) {
      try {
        cadStandardSource(id);
      } catch {
        problems.push(`${owner}: cita la fuente inexistente «${id}».`);
      }
    }
  };
  for (const scale of CAD_MEXICAN_SCALES) check(`1:${scale.denominator}`, scale.sources);
  for (const [use, rule] of Object.entries(CAD_MEXICAN_DIMENSION_RULES))
    check(`cota ${use}`, rule.sources);
  // Las alturas de texto se apoyan enteras en ISO 3098-1; si esa fuente
  // desapareciera del registro, este módulo estaría afirmando una serie de
  // alturas que ya nadie sostiene.
  check("alturas de texto", ["iso-3098-alturas"]);
  return problems;
}
