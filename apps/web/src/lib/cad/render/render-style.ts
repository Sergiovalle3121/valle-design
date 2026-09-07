/**
 * Estilo de trazo de una entidad nativa: lo que el lote instanciado necesita.
 *
 * Vive aparte del orquestador porque no es orquestación: es la traducción de lo
 * que el documento DECLARA —color, tipo de línea y grosor, cada uno con su
 * origen— a lo que la GPU consume: color empaquetado, medio grosor en píxeles y
 * una ranura de patrón.
 *
 * La HERENCIA no se resuelve aquí. `BYLAYER` y `BYBLOCK` son reglas del
 * formato, las aplican también el trazador y el escritor, y con la regla
 * escrita tres veces el plano se ve de una manera, se imprime de otra y se
 * devuelve de una tercera. Vive en `cad-effective-style.ts` y este módulo la
 * consume; lo único que añade es el mapeo a ranura y a píxeles.
 *
 * El `document` es OPCIONAL a propósito: hay llamadores que dibujan una entidad
 * suelta sin documento a mano. Sin él sólo se puede honrar lo EXPLÍCITO, que es
 * exactamente lo que este módulo hacía antes de que la herencia existiera.
 */
import {
  buildCadLinetypeSlots,
  cadLineweightHalfWidthPx,
  resolveCadEntityStyle,
  type CadStyleSource,
} from "../cad-effective-style";
import type { CadDocument } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import type { CadLineStyle } from "./line-batch";

/** Color por defecto, el mismo que usaba la proyección anterior. */
export const CAD_RENDER_DEFAULT_COLOR = 0x60a5fa;
/** Medio grosor por defecto en píxeles: un trazo de 1 px. */
export const CAD_RENDER_DEFAULT_HALF_WIDTH_PX = 0.5;

/**
 * Blanco puro: el RGB exacto de ACI 7 (`aci-palette.ts`), la tinta por
 * defecto de la capa "0" y de todo BYLAYER sin capa propia. Por convención de
 * AutoCAD, el índice 7 se ve blanco o negro SEGÚN EL FONDO — nunca un blanco
 * fijo — precisamente porque no es un color que alguien eligió: es lo que
 * queda cuando nadie eligió ninguno.
 */
const ACI7_WHITE = 0xffffff;

/** El fondo del lienzo por defecto cuando el llamador no pasa uno: el preset
 * «Oscuro» de `THEMES` en `components/cad/studio/editor-presentation.ts`
 * (`0x0a0f1e`). No se importa desde ahí para no invertir la dependencia
 * lib → components; si ese preset cambia, este valor y el de la prueba
 * `render-style.spec.ts` que lo cruza contra los cuatro presets tienen que
 * moverse juntos. */
const DEFAULT_BACKGROUND_COLOR = 0x0a0f1e;

/** Piso de contraste 3:1 (WCAG 1.4.11): un trazo es gráfico, no texto. */
const MIN_INK_CONTRAST = 3;

function relativeLuminance(rgb: number): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((rgb >> 16) & 0xff);
  const g = channel((rgb >> 8) & 0xff);
  const b = channel(rgb & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores empaquetados 0xRRGGBB. */
export function packedContrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * T-13: el plano entero desaparecía a un clic del conmutador de tema porque
 * la tinta por defecto —blanco de ACI 7, o `CAD_RENDER_DEFAULT_COLOR` cuando
 * la entidad no declara nada— es un color FIJO frente a un fondo de lienzo
 * que puede ser casi blanco (preset «Claro», #eaf0f8 → 1,15:1 medido). Nunca
 * toca un color que el plano SÍ declara: sólo estos dos, y sólo cuando su
 * contraste real cae bajo el piso.
 */
export function legibleDefaultInk(color: number, backgroundColor: number): number {
  if (color !== ACI7_WHITE && color !== CAD_RENDER_DEFAULT_COLOR) return color;
  if (packedContrastRatio(color, backgroundColor) >= MIN_INK_CONTRAST) return color;
  const white = packedContrastRatio(0xffffff, backgroundColor);
  const black = packedContrastRatio(0x000000, backgroundColor);
  return white >= black ? 0xffffff : 0x000000;
}

export type CadRenderStyleSource = CadStyleSource & Pick<CadDocument, "styles">;

export function defaultCadRenderStyle(
  entity: CadNativeEntity,
  document?: CadRenderStyleSource,
  backgroundColor: number = DEFAULT_BACKGROUND_COLOR,
): CadLineStyle {
  const value = entity.context?.presentation?.color?.value;
  const rawColor =
    value && /^#[0-9a-f]{6}$/i.test(value)
      ? Number.parseInt(value.slice(1), 16)
      : CAD_RENDER_DEFAULT_COLOR;
  const color = legibleDefaultInk(rawColor, backgroundColor);
  if (!document) {
    // Sin documento no hay de quién heredar. Se honra lo explícito y nada más:
    // adivinar una capa que no se puede leer produciría un trazo que cambia al
    // pasar por otro camino de dibujo, y eso no se diagnostica nunca.
    const weight = entity.context?.presentation?.lineweight;
    return {
      color,
      halfWidthPx:
        weight?.source === "explicit" && typeof weight.value === "number"
          ? cadLineweightHalfWidthPx(weight.value)
          : CAD_RENDER_DEFAULT_HALF_WIDTH_PX,
      linetypeIndex: 0,
      layer: entity.layer,
    };
  }
  const resolved = resolveCadEntityStyle(entity, document);
  return {
    color,
    // El lineweight canónico va en centésimas de milímetro, como en DXF.
    halfWidthPx: cadLineweightHalfWidthPx(resolved.lineweight),
    linetypeIndex: buildCadLinetypeSlots(document).slots.get(resolved.linetype.toUpperCase()) ?? 0,
    layer: entity.layer,
  };
}
