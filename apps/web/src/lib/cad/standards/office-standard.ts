/**
 * STANDARDS/CHECKSTANDARDS: comparar un dibujo contra el estándar de la oficina.
 *
 * No inventa un estándar nuevo: compara contra lo que YA existe en este mismo
 * directorio — `CAD_MEXICAN_LAYERS` para capas y `cadMexicanTextStyles` /
 * `cadMexicanDimensionStyle` para texto y cota, que ya calculan la altura
 * correcta a la escala de la lámina (`cadAnnotativeModelHeight`). El único
 * trabajo de este módulo es la COMPARACIÓN, entidad por entidad de la tabla,
 * y listar las desviaciones — nunca corregirlas en silencio, que es lo que
 * distingue CHECKSTANDARDS de un LAYTRANS con otro nombre.
 *
 * Sólo opina de una capa del documento cuando su id COINCIDE con un id de la
 * norma. Una capa que el despacho añadió con otro nombre no es una
 * desviación: es una capa que la norma, siendo costumbre y no ley, no cubre
 * (ver `noSeAfirma` en `docs/cad/evidence/mexican-drafting-standards.json`).
 */
import type { CadDocument, CadLayerDef } from "../cad-document";
import {
  cadMexicanLayer,
  cadMexicanLayerAppearance,
  cadMexicanLayerCollisions,
  CadMexicanLayerError,
} from "./mexican-layers";
import {
  cadMexicanDimensionStyle,
  cadMexicanDimensionStyleName,
  cadMexicanScale,
  cadMexicanTextStyles,
  type CadMexicanScale,
} from "./mexican-annotation";

export interface CadStandardDeviation {
  code: string;
  severity: "critical" | "warning";
  title: string;
  message: string;
}

export interface CadStandardCheckOptions {
  /** Denominador de la escala de la lámina que se está revisando. Por defecto 1:50. */
  scaleDenominator?: number;
  unit?: string;
  fontFamily?: string;
}

function layerAppearanceOf(layer: CadLayerDef): string {
  return `${layer.color}|${layer.linetype ?? "CONTINUOUS"}|${layer.lineweight ?? -1}`;
}

function checkLayers(layers: readonly CadLayerDef[]): CadStandardDeviation[] {
  const deviations: CadStandardDeviation[] = [];
  const presentNormIds: string[] = [];
  for (const layer of layers) {
    let norm;
    try {
      norm = cadMexicanLayer(layer.id);
    } catch (error) {
      if (error instanceof CadMexicanLayerError) continue;
      throw error;
    }
    presentNormIds.push(layer.id);
    const expected = cadMexicanLayerAppearance(norm);
    const actual = layerAppearanceOf(layer);
    if (expected !== actual) {
      deviations.push({
        code: "layer_appearance_mismatch",
        severity: "warning",
        title: `Capa ${layer.id}: no coincide con la norma`,
        message: `Se esperaba «${expected}» (color|tipo de línea|grosor) y el documento tiene «${actual}».`,
      });
    }
  }
  for (const [a, b] of cadMexicanLayerCollisions(presentNormIds)) {
    deviations.push({
      code: "layer_color_collision",
      severity: "warning",
      title: `Capas ${a} y ${b}: salen idénticas impresas`,
      message: `${a} y ${b} comparten color, tipo de línea y grosor: en el papel no se distinguen.`,
    });
  }
  return deviations;
}

function checkTextStyles(
  styles: CadDocument["styles"]["text"],
  scaleDenominator: number,
  unit: string,
  fontFamily: string,
): CadStandardDeviation[] {
  const deviations: CadStandardDeviation[] = [];
  const expected = cadMexicanTextStyles(scaleDenominator, unit, fontFamily);
  for (const [name, expectedStyle] of Object.entries(expected)) {
    const actual = styles[name];
    if (!actual) {
      deviations.push({
        code: "missing_text_style",
        severity: "warning",
        title: `Falta el estilo de texto «${name}»`,
        message: `La norma espera un estilo «${name}» de ${expectedStyle.height} unidades a esta escala, y el documento no lo declara.`,
      });
      continue;
    }
    const heightMismatch = Math.abs((actual.height ?? 0) - (expectedStyle.height ?? 0)) > 1e-6;
    const fontMismatch = (actual.fontFamily ?? "") !== (expectedStyle.fontFamily ?? "");
    if (heightMismatch || fontMismatch) {
      deviations.push({
        code: "text_style_mismatch",
        severity: "warning",
        title: `El estilo de texto «${name}» no coincide con la norma a esta escala`,
        message:
          `Se esperaba altura ${expectedStyle.height} y fuente «${expectedStyle.fontFamily}»; ` +
          `el documento tiene altura ${actual.height ?? "sin declarar"} y fuente «${actual.fontFamily ?? "sin declarar"}».`,
      });
    }
  }
  return deviations;
}

function checkDimensionStyle(
  styles: CadDocument["styles"]["dimension"],
  scale: CadMexicanScale,
  unit: string,
): CadStandardDeviation[] {
  const name = cadMexicanDimensionStyleName(scale);
  const expected = cadMexicanDimensionStyle(scale, unit);
  const actual = styles[name];
  if (!actual) {
    return [{
      code: "missing_dimension_style",
      severity: "warning",
      title: `Falta el estilo de cota «${name}»`,
      message: `La norma espera un estilo de cota «${name}» a esta escala, y el documento no lo declara.`,
    }];
  }
  const mismatches: string[] = [];
  if (actual.textStyle !== expected.textStyle) mismatches.push(`estilo de texto (${actual.textStyle} ≠ ${expected.textStyle})`);
  if (actual.arrowhead !== expected.arrowhead) mismatches.push(`remate (${actual.arrowhead} ≠ ${expected.arrowhead})`);
  if (actual.precision !== expected.precision) mismatches.push(`decimales (${actual.precision} ≠ ${expected.precision})`);
  if (actual.units !== expected.units) mismatches.push(`unidad de rótulo (${actual.units} ≠ ${expected.units})`);
  if (mismatches.length === 0) return [];
  return [{
    code: "dimension_style_mismatch",
    severity: "warning",
    title: `El estilo de cota «${name}» no coincide con la norma`,
    message: `Difiere en: ${mismatches.join("; ")}.`,
  }];
}

export function checkCadDocumentAgainstMexicanStandard(
  document: Pick<CadDocument, "layers" | "styles">,
  options: CadStandardCheckOptions = {},
): CadStandardDeviation[] {
  const scaleDenominator = options.scaleDenominator ?? 50;
  const unit = options.unit ?? "mm";
  const fontFamily = options.fontFamily ?? "Helvetica";
  // `cadMexicanScale` se niega con un error tipado si la escala no está en la
  // norma: se deja propagar, porque STANDARDS no puede revisar contra una
  // escala que la norma no reconoce sin fingir que sí la reconoce.
  const scale = cadMexicanScale(scaleDenominator);
  return [
    ...checkLayers(document.layers),
    ...checkTextStyles(document.styles.text, scaleDenominator, unit, fontFamily),
    ...checkDimensionStyle(document.styles.dimension, scale, unit),
  ];
}
