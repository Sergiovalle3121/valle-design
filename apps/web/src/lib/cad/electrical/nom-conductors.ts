/**
 * LA TABLA DE CONDUCTORES DE LA NOM, Y LO QUE SE PUEDE CALCULAR CON ELLA.
 *
 * ## Por qué esto es lo que AutoCAD Electrical NO hace
 *
 * AutoCAD Electrical numera conductores y saca listas. Lo que no hace —ni
 * puede, porque sus conductores son esquemáticos y no están a escala— es
 * decirte si el calibre AGUANTA la protección que le pusiste, ni cuánta
 * TENSIÓN se cae en el recorrido. Eso el ingeniero mexicano lo hace aparte, en
 * una hoja de cálculo, con las longitudes medidas a mano del plano.
 *
 * Aquí el conductor es una POLILÍNEA: el dibujo ya sabe cuánto mide. Con el
 * calibre, la protección y la tensión —que viajan en sus metadatos— la
 * comprobación sale del plano y no de una hoja aparte. Ésa es la diferencia, y
 * es la razón por la que el conductor se dibujó a escala desde el principio.
 *
 * ## Procedencia de los números, dicha aquí y no en una nota al pie
 *
 * Dos tablas de la **NOM-001-SEDE** —Norma Oficial Mexicana de instalaciones
 * eléctricas, publicada en el Diario Oficial de la Federación, texto oficial de
 * acceso público—, transcritas para cobre:
 *
 *  · **Ampacidad**: Tabla 310-15(b)(16), columna de 75 °C (THW/THHN en
 *    canalización), que es el aislamiento y la temperatura con los que se
 *    proyecta en México.
 *  · **Resistencia**: Capítulo 9, Tabla 8, resistencia en corriente continua de
 *    cobre sin recubrimiento, cableado, a 75 °C, convertida de Ω/kFT a Ω/km.
 *  · **Regla del conductor pequeño** (Art. 240-4 inciso D): 14 AWG no pasa de
 *    15 A, 12 AWG de 20 A y 10 AWG de 30 A de protección, aunque su ampacidad
 *    de tabla sea mayor. Sin esta regla, la comprobación aprobaría un 12 AWG
 *    con protección de 25 A, que la norma prohíbe.
 *
 * ## Qué NO hace esta comprobación, y por qué se dice tan fuerte
 *
 * NO es un memorial de cálculo y no sustituye la firma de nadie. No aplica
 * corrección por temperatura ambiente ni factor de agrupamiento (más de tres
 * conductores portadores en la misma canalización), no considera el 125 % de
 * carga continua, no revisa el conductor de puesta a tierra ni el neutro de
 * sistemas con armónicas, y no comprueba el llenado del tubo. Es un tamiz que
 * caza el error grueso ANTES de que el plano salga del despacho: el 12 AWG con
 * una protección de 30 A, o la caída de tensión del 8 % en un ramal largo. Lo
 * que aprueba, lo aprueba dentro de esos límites y lo declara en el renglón.
 *
 * El responsable sigue siendo quien firma, y estos números están para que los
 * coteje con la norma impresa, no para creérselos.
 */

/** Una fila de la tabla, para un calibre AWG. */
export interface CadNomConductor {
  /** Como se escribe en el plano: «14», «12», «1/0», «4/0». */
  gauge: string;
  /** Ampacidad en amperes, cobre 75 °C, Tabla 310-15(b)(16). */
  ampacity: number;
  /** Resistencia CD en ohm por kilómetro, cobre cableado 75 °C, Cap. 9 Tabla 8. */
  ohmPerKm: number;
  /**
   * Tope de protección del Art. 240-4(D) cuando lo hay.
   *
   * `null` significa «no hay tope especial»: manda la ampacidad. Es el campo
   * que impide aprobar un 12 AWG con 25 A porque la tabla diga 25.
   */
  breakerCap: number | null;
}

/**
 * La tabla, del más delgado al más grueso.
 *
 * El orden importa: `cadNomSuggestGauge` sube por ella y devuelve el PRIMERO
 * que cumple, que es el criterio económico con el que se proyecta.
 */
export const CAD_NOM_CONDUCTORS: readonly CadNomConductor[] = [
  { gauge: "14", ampacity: 20, ohmPerKm: 10.3, breakerCap: 15 },
  { gauge: "12", ampacity: 25, ohmPerKm: 6.5, breakerCap: 20 },
  { gauge: "10", ampacity: 35, ohmPerKm: 4.07, breakerCap: 30 },
  { gauge: "8", ampacity: 50, ohmPerKm: 2.55, breakerCap: null },
  { gauge: "6", ampacity: 65, ohmPerKm: 1.61, breakerCap: null },
  { gauge: "4", ampacity: 85, ohmPerKm: 1.01, breakerCap: null },
  { gauge: "3", ampacity: 100, ohmPerKm: 0.802, breakerCap: null },
  { gauge: "2", ampacity: 115, ohmPerKm: 0.634, breakerCap: null },
  { gauge: "1", ampacity: 130, ohmPerKm: 0.505, breakerCap: null },
  { gauge: "1/0", ampacity: 150, ohmPerKm: 0.399, breakerCap: null },
  { gauge: "2/0", ampacity: 175, ohmPerKm: 0.317, breakerCap: null },
  { gauge: "3/0", ampacity: 200, ohmPerKm: 0.251, breakerCap: null },
  { gauge: "4/0", ampacity: 230, ohmPerKm: 0.1996, breakerCap: null },
];

/**
 * Caída de tensión máxima que la NOM recomienda en un circuito derivado.
 *
 * Art. 210-19(A) nota: 3 % en el ramal, y 5 % sumando alimentador y ramal. Es
 * una RECOMENDACIÓN de la norma, no una obligación, y por eso lo que se emite
 * es un aviso con su número y no una negativa.
 */
export const CAD_NOM_BRANCH_DROP_PERCENT = 3;

const normalizeGauge = (gauge: string): string =>
  gauge.trim().toUpperCase().replace(/\s+/gu, "").replace(/AWG$/u, "");

/** La fila del calibre, o `null` si no es uno de la tabla. */
export function cadNomConductor(gauge: string): CadNomConductor | null {
  const clave = normalizeGauge(gauge);
  return CAD_NOM_CONDUCTORS.find((fila) => fila.gauge === clave) ?? null;
}

/**
 * Protección máxima admisible para un calibre: la ampacidad, o el tope del
 * conductor pequeño cuando lo hay.
 */
export function cadNomMaxBreaker(conductor: CadNomConductor): number {
  return conductor.breakerCap === null
    ? conductor.ampacity
    : Math.min(conductor.ampacity, conductor.breakerCap);
}

/**
 * Caída de tensión de un recorrido, en volts.
 *
 * Monofásico: `2 · L · I · R` — la corriente va y vuelve, y por eso el 2.
 * Trifásico equilibrado: `√3 · L · I · R`, que es la caída entre fases.
 * `R` en ohm/km y `L` en metros, de ahí el /1000.
 *
 * Es corriente continua equivalente: no se modela la reactancia, que en
 * calibres pequeños y ramales cortos es despreciable y en alimentadores
 * grandes NO lo es. Está dicho aquí y lo repite quien informa.
 */
export function cadNomVoltageDrop(input: {
  conductor: CadNomConductor;
  /** Longitud del recorrido en METROS (una sola dirección). */
  lengthM: number;
  amps: number;
  phases: 1 | 3;
}): number {
  const factor = input.phases === 3 ? Math.sqrt(3) : 2;
  return (factor * input.lengthM * input.amps * input.conductor.ohmPerKm) / 1_000;
}

/**
 * El calibre más delgado que aguanta la protección Y no se pasa de la caída.
 *
 * Devuelve `null` cuando ni el más grueso de la tabla cumple: no se inventa un
 * calibre que la tabla no tiene, y quien pregunta lo dice.
 */
export function cadNomSuggestGauge(input: {
  breakerAmps: number;
  lengthM: number;
  volts: number;
  phases: 1 | 3;
  maxDropPercent?: number;
}): CadNomConductor | null {
  const tope = input.maxDropPercent ?? CAD_NOM_BRANCH_DROP_PERCENT;
  for (const conductor of CAD_NOM_CONDUCTORS) {
    if (cadNomMaxBreaker(conductor) < input.breakerAmps) continue;
    const drop = cadNomVoltageDrop({
      conductor,
      lengthM: input.lengthM,
      amps: input.breakerAmps,
      phases: input.phases,
    });
    if (input.volts > 0 && (drop / input.volts) * 100 > tope) continue;
    return conductor;
  }
  return null;
}
