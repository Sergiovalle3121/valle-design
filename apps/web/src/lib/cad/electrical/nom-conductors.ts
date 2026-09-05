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
 * Cuatro fuentes de la **NOM-001-SEDE** —Norma Oficial Mexicana de instalaciones
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
 *  · **Capacidades estándar** (Art. 240-6 inciso A): la lista cerrada de
 *    valores en que se fabrican fusibles e interruptores de tiempo inverso.
 *    Sin ella, un «22 A» tecleado por error pasa en silencio porque ningún
 *    calibre lo contradice — y ese interruptor no existe en el mercado.
 *  · **Puesta a tierra de equipos** (Tabla 250-122, columna de cobre): el
 *    calibre mínimo del conductor de tierra que corresponde a la protección
 *    que va DELANTE del equipo. Es el dato que el cuadro de cargas de un
 *    despacho mexicano lleva y que hasta hoy no se decía en ninguna parte.
 *
 * ## Qué NO hace esta comprobación, y por qué se dice tan fuerte
 *
 * NO es un memorial de cálculo y no sustituye la firma de nadie. No aplica
 * corrección por temperatura ambiente ni factor de agrupamiento (más de tres
 * conductores portadores en la misma canalización), no considera el 125 % de
 * carga continua, no revisa el neutro de sistemas con armónicas, y no comprueba
 * el llenado del tubo. La tierra física se CALCULA de la protección: se dice el
 * calibre mínimo que pide la Tabla 250-122, no se coteja contra un conductor de
 * tierra dibujado, porque hoy el dibujo no distingue un conductor de tierra de
 * uno de fase. Es un tamiz que caza el error grueso ANTES de que el plano salga
 * del despacho: el 12 AWG con una protección de 30 A, la capacidad de 22 A que
 * no se fabrica, o la caída de tensión del 8 % en un ramal largo. Lo que
 * aprueba, lo aprueba dentro de esos límites y lo declara en el renglón.
 *
 * El responsable sigue siendo quien firma, y estos números están para que los
 * coteje con la norma impresa, no para creérselos. Se transcribieron sin acceso
 * al texto oficial en línea (este entorno sólo alcanza GitHub), así que el
 * cotejo contra la norma impresa no es una cortesía: es el control que falta.
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

// ---------------------------------------------------------------------------
// Art. 240-6(A): las capacidades en que se FABRICA la protección
// ---------------------------------------------------------------------------

/**
 * Capacidades nominales estándar de fusibles e interruptores de tiempo inverso,
 * Art. 240-6(A) de la NOM-001-SEDE.
 *
 * Existe porque el resto de la revisión no puede cazar este error: un «22 A»
 * tecleado por error tiene una tabla de ampacidad que lo respalda (el 10 AWG
 * llega a 30 A) y una caída de tensión que sale bien, así que pasa en silencio.
 * Pero ese interruptor no se fabrica, y lo que se compre en la obra será de 20
 * o de 25 — es decir, el plano dice una cosa y la instalación será otra.
 */
export const CAD_NOM_STANDARD_BREAKER_AMPS: readonly number[] = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300,
  350, 400, 450, 500, 600, 700, 800, 1_000, 1_200, 1_600, 2_000, 2_500, 3_000, 4_000, 5_000,
  6_000,
];

/**
 * Las capacidades que el mismo artículo añade SÓLO para fusibles: 1, 3, 6, 10 y
 * 601 A.
 *
 * Se aceptan como estándar porque el dibujo declara «protección», no si es
 * fusible o interruptor. Marcar un fusible de 6 A como capacidad inexistente
 * sería una falsa alarma, y una revisión que da falsas alarmas se apaga.
 */
export const CAD_NOM_STANDARD_FUSE_ONLY_AMPS: readonly number[] = [1, 3, 6, 10, 601];

/** Si la capacidad nominal es una de las del Art. 240-6(A). */
export function cadNomIsStandardBreaker(amps: number): boolean {
  return (
    CAD_NOM_STANDARD_BREAKER_AMPS.includes(amps) || CAD_NOM_STANDARD_FUSE_ONLY_AMPS.includes(amps)
  );
}

/**
 * Las dos capacidades estándar que rodean a una que no lo es.
 *
 * Se devuelven las dos y no «la correcta»: bajar a la inferior protege el
 * conductor pero puede disparar con la carga real, y subir a la superior exige
 * comprobar otra vez el calibre. Esa decisión es del proyectista; la revisión
 * le pone las dos opciones delante y no elige por él.
 */
export function cadNomNearestStandardBreakers(amps: number): {
  below: number | null;
  above: number | null;
} {
  const todas = [...CAD_NOM_STANDARD_BREAKER_AMPS, ...CAD_NOM_STANDARD_FUSE_ONLY_AMPS].sort(
    (a, b) => a - b,
  );
  const menores = todas.filter((valor) => valor < amps);
  const mayores = todas.filter((valor) => valor > amps);
  return {
    below: menores.length > 0 ? menores[menores.length - 1] : null,
    above: mayores.length > 0 ? mayores[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Tabla 250-122: el conductor de puesta a tierra de equipos
// ---------------------------------------------------------------------------

/** Una fila de la Tabla 250-122, columna de cobre. */
export interface CadNomGroundRow {
  /**
   * Capacidad del dispositivo de sobrecorriente que va DELANTE del equipo, «sin
   * exceder de» — así está escrita la columna en la norma, y por eso la
   * búsqueda toma la PRIMERA fila cuyo valor alcanza a la protección.
   */
  maxDeviceAmps: number;
  /** El calibre, como se escribe en el plano: «12», «4/0», «250». */
  gauge: string;
  /**
   * `true` cuando el calibre se mide en kcmil y no en AWG.
   *
   * Arriba de 4/0 la norma cambia de unidad. El campo existe para que el
   * renglón no escriba «250 AWG», que no significa nada.
   */
  kcmil: boolean;
}

/**
 * Tabla 250-122 de la NOM-001-SEDE, columna de COBRE, de menor a mayor.
 *
 * La columna de aluminio existe en la norma y aquí NO está: el resto del módulo
 * es de cobre (ampacidad y resistencia), y mezclar materiales daría un calibre
 * de tierra que no corresponde al conductor que se dibujó.
 */
export const CAD_NOM_EQUIPMENT_GROUND: readonly CadNomGroundRow[] = [
  { maxDeviceAmps: 15, gauge: "14", kcmil: false },
  { maxDeviceAmps: 20, gauge: "12", kcmil: false },
  { maxDeviceAmps: 60, gauge: "10", kcmil: false },
  { maxDeviceAmps: 100, gauge: "8", kcmil: false },
  { maxDeviceAmps: 200, gauge: "6", kcmil: false },
  { maxDeviceAmps: 300, gauge: "4", kcmil: false },
  { maxDeviceAmps: 400, gauge: "3", kcmil: false },
  { maxDeviceAmps: 500, gauge: "2", kcmil: false },
  { maxDeviceAmps: 600, gauge: "1", kcmil: false },
  { maxDeviceAmps: 800, gauge: "1/0", kcmil: false },
  { maxDeviceAmps: 1_000, gauge: "2/0", kcmil: false },
  { maxDeviceAmps: 1_200, gauge: "3/0", kcmil: false },
  { maxDeviceAmps: 1_600, gauge: "4/0", kcmil: false },
  { maxDeviceAmps: 2_000, gauge: "250", kcmil: true },
  { maxDeviceAmps: 2_500, gauge: "350", kcmil: true },
  { maxDeviceAmps: 3_000, gauge: "400", kcmil: true },
  { maxDeviceAmps: 4_000, gauge: "500", kcmil: true },
  { maxDeviceAmps: 5_000, gauge: "700", kcmil: true },
  { maxDeviceAmps: 6_000, gauge: "800", kcmil: true },
];

/** El calibre con su unidad: «12 AWG», «250 kcmil». */
export function cadNomGroundLabel(row: CadNomGroundRow): string {
  return row.kcmil ? `${row.gauge} kcmil` : `${row.gauge} AWG`;
}

/**
 * La fila de la Tabla 250-122 que corresponde a una protección, o `null` si la
 * protección se sale de la tabla (arriba de 6.000 A).
 *
 * Ojo con el criterio, que es donde se equivoca quien la lee de prisa: la
 * columna dice «sin exceder de», así que una protección de 30 A NO cae en la
 * fila de 20 A — cae en la de 60, y su tierra es 10 AWG y no 12. Devolver el
 * 12 sería devolver un calibre insuficiente, que es peor que no decir nada.
 */
export function cadNomEquipmentGround(breakerAmps: number): CadNomGroundRow | null {
  return CAD_NOM_EQUIPMENT_GROUND.find((fila) => breakerAmps <= fila.maxDeviceAmps) ?? null;
}
