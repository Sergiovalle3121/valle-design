/**
 * La TABLA de patrones de sombreado: qué familias de líneas forman cada
 * nombre. Una sola definición para la pantalla, el papel y el DXF.
 *
 * Medido el 2026-09-02 antes de esta tabla: `hatch-entity-adapter.ts` y
 * `hatch-publish-strokes.ts` decidían las familias con un solo `if`
 * (`pattern === "CROSS"` → dos ángulos; cualquier otro nombre → uno), así que
 * ANSI31, ANSI37, AR-CONC, AR-B816, EARTH, GRAVEL, STEEL y NET producían el
 * MISMO trazado byte a byte (sha1 a98fe93df35c en pantalla, 410f89e9d289 en
 * papel sobre el mismo contorno) y el DXF escribía una familia continua para
 * todos. Un plano que no distingue concreto de mampostería no dice lo que
 * significa.
 *
 * ## Unidades
 *
 * Todo va en UNIDADES DE ANSI31: `1` es la separación entre las rayas de
 * ANSI31 a la misma escala. Así `entity.scale` conserva el significado que
 * tenía (la separación de ANSI31 en unidades de dibujo) y el ANSI31 de hoy
 * sale idéntico; los demás patrones se definen en proporción a él.
 *
 * ## El ángulo persistido
 *
 * `entity.angle` es el ángulo ABSOLUTO de la primera familia del patrón —lo
 * que el dibujante ve como «el ángulo de las rayas»—, y su valor por defecto
 * es el ángulo base del patrón (45 en ANSI31, 0 en LINE). El renderizador ya
 * dibujaba con `angle ?? 45` y el comando HATCH persiste 45 explícito: ningún
 * documento cambia de aspecto. El giro DXF (código 52) es `angle − base`, y
 * la importación suma la base al 52 del fichero: antes un ANSI31 importado con
 * 52 = 0 se dibujaba con las rayas a 0° (medido con dxf-cad-document.ts:220).
 *
 * Las definiciones son propias: ángulo, separación, desfase, corrimiento por
 * fila y secuencia de trazos escritos como valores, con su descripción; no se
 * copia ningún fichero .pat.
 */
export interface CadHatchPatternFamily {
  /** Ángulo intrínseco de las líneas de esta familia, en grados (patrón sin girar). */
  angle: number;
  /** Separación perpendicular entre líneas, en unidades de ANSI31 (> 0). */
  offset: number;
  /** Desplazamiento perpendicular del origen de la familia (unidades de ANSI31). */
  perp?: number;
  /** Corrimiento de la fase de los trazos por cada fila sucesiva (unidades de ANSI31). */
  shift?: number;
  /** Secuencia `.lin`: >0 trazo, <0 hueco, 0 punto (unidades de ANSI31). Ausente = continua. */
  dash?: readonly number[];
}

export interface CadHatchPatternDefinition {
  name: string;
  description: string;
  families: readonly CadHatchPatternFamily[];
}

const HEX_SIDE = 1;
const HEX_ROW = Math.sqrt(3) * HEX_SIDE;

export const CAD_HATCH_PATTERNS: readonly CadHatchPatternDefinition[] = [
  { name: "ANSI31", description: "Acero y hierro: rayado a 45°", families: [{ angle: 45, offset: 1 }] },
  { name: "ANSI32", description: "Acero: rayado doble a 45°", families: [{ angle: 45, offset: 3 }, { angle: 45, offset: 3, perp: 1.4 }] },
  { name: "ANSI33", description: "Bronce y latón: raya y raya a trazos", families: [{ angle: 45, offset: 2 }, { angle: 45, offset: 2, perp: 1, dash: [1.6, -0.4] }] },
  { name: "ANSI34", description: "Plástico y goma: cuatro rayas agrupadas", families: [{ angle: 45, offset: 6 }, { angle: 45, offset: 6, perp: 1.4 }, { angle: 45, offset: 6, perp: 2.8 }, { angle: 45, offset: 6, perp: 4.2 }] },
  { name: "ANSI35", description: "Ladrillo refractario: raya y trazo-punto", families: [{ angle: 45, offset: 2 }, { angle: 45, offset: 2, perp: 1, dash: [2.5, -0.6, 0, -0.6] }] },
  { name: "ANSI36", description: "Mármol y pizarra: trazos escalonados", families: [{ angle: 45, offset: 3, shift: 1.5, dash: [2.4, -1.2] }] },
  { name: "ANSI37", description: "Plomo y zinc: rayado cruzado a 45°", families: [{ angle: 45, offset: 1 }, { angle: 135, offset: 1 }] },
  { name: "ANSI38", description: "Aluminio: rayado con trazos cruzados", families: [{ angle: 45, offset: 1 }, { angle: 135, offset: 3, dash: [2.4, -1] }] },
  { name: "CROSS", description: "Rayado cruzado (nombre propio, igual que ANSI37)", families: [{ angle: 45, offset: 1 }, { angle: 135, offset: 1 }] },
  { name: "AR-B816", description: "Bloque de 8×16 a soga", families: [{ angle: 0, offset: 8 }, { angle: 90, offset: 16, shift: 8, dash: [8, -8] }] },
  { name: "AR-BRSTD", description: "Ladrillo estándar a soga", families: [{ angle: 0, offset: 2.67 }, { angle: 90, offset: 4, shift: 2.67, dash: [2.67, -2.67] }] },
  { name: "BRICK", description: "Ladrillo: aparejo a soga", families: [{ angle: 0, offset: 1 }, { angle: 90, offset: 1.5, shift: 1, dash: [1, -1] }] },
  { name: "AR-CONC", description: "Concreto: agregado irregular en tres direcciones", families: [
    { angle: 50, offset: 1.6, shift: 0.7, dash: [1.2, -1.4, 0, -1.5] },
    { angle: 355, offset: 2.1, shift: 0.9, dash: [0.9, -1.6, 0, -1.1] },
    { angle: 100.5, offset: 1.9, shift: 0.6, dash: [1.1, -1.9, 0, -1.3] },
  ] },
  { name: "AR-SAND", description: "Arena: puntos dispersos", families: [{ angle: 0, offset: 1.2, shift: 0.7, dash: [0, -1.5] }, { angle: 90, offset: 1.3, shift: 0.9, dash: [0, -1.7] }] },
  { name: "DOTS", description: "Puntos en retícula", families: [{ angle: 0, offset: 1, shift: 0.5, dash: [0, -1] }] },
  { name: "EARTH", description: "Tierra: trazos escalonados en dos direcciones", families: [{ angle: 0, offset: 1, shift: 1, dash: [1, -1] }, { angle: 90, offset: 1, shift: 1, dash: [1, -1] }] },
  { name: "GRAVEL", description: "Grava: trazos cortos en tres direcciones", families: [
    { angle: 0, offset: 1.5, shift: 0.6, dash: [0.8, -1.2] },
    { angle: 60, offset: 1.6, shift: 0.5, dash: [0.7, -1.4] },
    { angle: 120, offset: 1.7, shift: 0.8, dash: [0.9, -1.1] },
  ] },
  { name: "HEX", description: "Hexágonos", families: [
    { angle: 0, offset: HEX_ROW, shift: 1.5 * HEX_SIDE, dash: [HEX_SIDE, -2 * HEX_SIDE] },
    { angle: 60, offset: HEX_ROW, shift: 1.5 * HEX_SIDE, dash: [HEX_SIDE, -2 * HEX_SIDE] },
    { angle: 120, offset: HEX_ROW, shift: 1.5 * HEX_SIDE, dash: [HEX_SIDE, -2 * HEX_SIDE] },
  ] },
  { name: "HONEY", description: "Panal: hexágonos a media escala", families: [
    { angle: 0, offset: HEX_ROW / 2, shift: 0.75, dash: [0.5, -1] },
    { angle: 60, offset: HEX_ROW / 2, shift: 0.75, dash: [0.5, -1] },
    { angle: 120, offset: HEX_ROW / 2, shift: 0.75, dash: [0.5, -1] },
  ] },
  { name: "LINE", description: "Líneas horizontales", families: [{ angle: 0, offset: 1 }] },
  { name: "NET", description: "Retícula ortogonal", families: [{ angle: 0, offset: 1 }, { angle: 90, offset: 1 }] },
  { name: "NET3", description: "Retícula triple a 60°", families: [{ angle: 0, offset: 1 }, { angle: 60, offset: 1 }, { angle: 120, offset: 1 }] },
  { name: "STEEL", description: "Acero: rayas dobles a 45°", families: [{ angle: 45, offset: 1.5 }, { angle: 45, offset: 1.5, perp: 0.5 }] },
  { name: "MUDST", description: "Lodo: trazo y puntos", families: [{ angle: 0, offset: 1.2, shift: 0.4, dash: [1, -0.5, 0, -0.5, 0, -0.5] }] },
];

const BY_NAME = new Map(CAD_HATCH_PATTERNS.map((pattern) => [pattern.name, pattern]));

/** Definición por nombre, sin distinguir mayúsculas; `undefined` si no está en la tabla. */
export function cadHatchPatternDefinition(name: string): CadHatchPatternDefinition | undefined {
  return BY_NAME.get(name.trim().toUpperCase());
}

/** El patrón que se dibuja cuando el nombre no está en la tabla (ni SOLID): rayado a 45°. */
export const CAD_HATCH_FALLBACK_PATTERN = "ANSI31";

/**
 * Ángulo base del patrón: el intrínseco de su primera familia. Es el valor
 * por defecto de `entity.angle` y lo que se resta para obtener el giro DXF.
 */
export function cadHatchPatternBaseAngle(name: string): number {
  return (cadHatchPatternDefinition(name) ?? cadHatchPatternDefinition(CAD_HATCH_FALLBACK_PATTERN))!.families[0].angle;
}

export interface CadHatchResolvedFamily {
  /** Ángulo absoluto en el dibujo, en grados. */
  angle: number;
  /** Separación perpendicular en unidades de dibujo. */
  spacing: number;
  /** Desplazamiento perpendicular del origen, en unidades de dibujo. */
  perp: number;
  /** Corrimiento de fase por fila, en unidades de dibujo. */
  shift: number;
  /** Secuencia de trazos en unidades de dibujo; ausente = continua. */
  dash?: readonly number[];
}

export interface CadHatchResolvedPattern {
  /** false cuando el nombre no está en la tabla y se dibuja el respaldo. */
  known: boolean;
  /** Giro respecto al patrón sin girar, en grados (el 52 del DXF). */
  rotation: number;
  families: readonly CadHatchResolvedFamily[];
}

/**
 * Resuelve el patrón contra la tabla: ángulo absoluto por familia, separación
 * en unidades de dibujo (`scale` es la separación de ANSI31) y trazos
 * escalados. Un nombre desconocido dibuja el respaldo y lo DICE en `known`.
 */
export function cadHatchFamilies(
  name: string,
  entityAngle: number | undefined,
  scale: number,
): CadHatchResolvedPattern {
  const definition = cadHatchPatternDefinition(name);
  const resolved = definition ?? cadHatchPatternDefinition(CAD_HATCH_FALLBACK_PATTERN)!;
  const base = resolved.families[0].angle;
  const rotation = (entityAngle ?? base) - base;
  return {
    known: definition !== undefined,
    rotation,
    families: resolved.families.map((family) => ({
      angle: family.angle + rotation,
      spacing: family.offset * scale,
      perp: (family.perp ?? 0) * scale,
      shift: (family.shift ?? 0) * scale,
      ...(family.dash && family.dash.length > 0 ? { dash: family.dash.map((value) => value * scale) } : {}),
    })),
  };
}
