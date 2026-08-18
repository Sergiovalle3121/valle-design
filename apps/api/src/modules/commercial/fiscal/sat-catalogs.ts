import type { TaxPersonType } from './rfc';

/**
 * Catálogos CERRADOS del SAT para el CFDI 4.0.
 *
 * Régimen fiscal y uso CFDI NO pueden ser texto libre: son claves de un
 * catálogo publicado por el SAT (`c_RegimenFiscal`, `c_UsoCFDI`) y el PAC
 * rechaza el timbrado si no coinciden. Dejar que el cliente escriba
 * «actividad empresarial» produce una captura que parece completa y que
 * garantiza un rechazo el día que se intente facturar — y para entonces el
 * cobro ya ocurrió, que es justo la pesadilla operativa que esta ola evita.
 *
 * Dos reglas del SAT se modelan aquí porque son las que la captura rompe:
 *
 * 1. Un régimen aplica a persona FÍSICA, a persona MORAL o a ambas. El tipo de
 *    persona se deduce de la longitud del RFC, así que la incoherencia
 *    «RFC de 13 con régimen 601 (General de Ley Personas Morales)» se detecta
 *    en la captura y no en el timbrado.
 *
 * 2. Cada uso de CFDI admite un conjunto concreto de regímenes del RECEPTOR.
 *    Es la columna «Régimen Fiscal Receptor» del catálogo `c_UsoCFDI`, y es la
 *    causa habitual del rechazo «El uso de CFDI no corresponde al régimen
 *    fiscal del receptor». Con esto, un asalariado (605) no puede guardar
 *    «Gastos en general».
 *
 * El catálogo de USOS es un SUBCONJUNTO deliberado, no el catálogo entero.
 * Lo que se vende es una suscripción mensual o anual de software: ofrecer
 * «Honorarios médicos» o «Gastos funerales» en el desplegable no daría más
 * libertad, daría más formas de que el CFDI salga mal. Se publican los tres
 * usos que un gasto de software admite de verdad.
 *
 * Los regímenes sí se publican COMPLETOS: el cliente es quien es, y omitir su
 * régimen le dejaría sin poder capturar.
 */

export interface SatTaxRegime {
  readonly code: string;
  readonly name: string;
  /** Tipos de persona a los que el SAT permite este régimen. */
  readonly personTypes: readonly TaxPersonType[];
}

export interface SatCfdiUse {
  readonly code: string;
  readonly name: string;
  /**
   * Regímenes del receptor que el SAT admite para este uso. Vacío jamás: un
   * uso sin regímenes sería un uso incapturable.
   */
  readonly taxRegimeCodes: readonly string[];
}

const FISICA: readonly TaxPersonType[] = ['fisica'];
const MORAL: readonly TaxPersonType[] = ['moral'];
const AMBAS: readonly TaxPersonType[] = ['fisica', 'moral'];

/** `c_RegimenFiscal` vigente para CFDI 4.0. */
export const SAT_TAX_REGIMES: readonly SatTaxRegime[] = [
  { code: '601', name: 'General de Ley Personas Morales', personTypes: MORAL },
  {
    code: '603',
    name: 'Personas Morales con Fines no Lucrativos',
    personTypes: MORAL,
  },
  {
    code: '605',
    name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    personTypes: FISICA,
  },
  { code: '606', name: 'Arrendamiento', personTypes: FISICA },
  {
    code: '607',
    name: 'Régimen de Enajenación o Adquisición de Bienes',
    personTypes: FISICA,
  },
  { code: '608', name: 'Demás ingresos', personTypes: FISICA },
  {
    code: '610',
    name: 'Residentes en el Extranjero sin Establecimiento Permanente en México',
    personTypes: AMBAS,
  },
  {
    code: '611',
    name: 'Ingresos por Dividendos (socios y accionistas)',
    personTypes: FISICA,
  },
  {
    code: '612',
    name: 'Personas Físicas con Actividades Empresariales y Profesionales',
    personTypes: FISICA,
  },
  { code: '614', name: 'Ingresos por intereses', personTypes: FISICA },
  {
    code: '615',
    name: 'Régimen de los ingresos por obtención de premios',
    personTypes: FISICA,
  },
  { code: '616', name: 'Sin obligaciones fiscales', personTypes: FISICA },
  {
    code: '620',
    name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
    personTypes: MORAL,
  },
  { code: '621', name: 'Incorporación Fiscal', personTypes: FISICA },
  {
    code: '622',
    name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
    personTypes: MORAL,
  },
  {
    code: '623',
    name: 'Opcional para Grupos de Sociedades',
    personTypes: MORAL,
  },
  { code: '624', name: 'Coordinados', personTypes: MORAL },
  {
    code: '625',
    name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
    personTypes: FISICA,
  },
  {
    code: '626',
    name: 'Régimen Simplificado de Confianza',
    personTypes: AMBAS,
  },
  { code: '628', name: 'Hidrocarburos', personTypes: MORAL },
  {
    code: '629',
    name: 'De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales',
    personTypes: MORAL,
  },
  {
    code: '630',
    name: 'Enajenación de acciones en bolsa de valores',
    personTypes: MORAL,
  },
];

/**
 * Regímenes que el SAT admite como receptor de un gasto deducible ordinario
 * (columna «Régimen Fiscal Receptor» de G03 e I04). Los que faltan —605
 * (sueldos), 616 (sin obligaciones), 607, 608, 610, 611, 614, 615…— no pueden
 * deducir un gasto en general, y por eso su único uso posible es S01.
 */
const DEDUCTIBLE_REGIMES: readonly string[] = [
  '601',
  '603',
  '606',
  '612',
  '620',
  '621',
  '622',
  '623',
  '624',
  '625',
  '626',
];

/** Todos los regímenes del catálogo: S01 no discrimina, no tiene efectos. */
const ALL_REGIMES: readonly string[] = SAT_TAX_REGIMES.map(
  (regime) => regime.code,
);

/** Subconjunto de `c_UsoCFDI` aplicable a una suscripción de software. */
export const SAT_CFDI_USES: readonly SatCfdiUse[] = [
  {
    code: 'G03',
    name: 'Gastos en general',
    taxRegimeCodes: DEDUCTIBLE_REGIMES,
  },
  {
    code: 'I04',
    name: 'Equipo de cómputo y accesorios',
    taxRegimeCodes: DEDUCTIBLE_REGIMES,
  },
  {
    code: 'S01',
    name: 'Sin efectos fiscales',
    taxRegimeCodes: ALL_REGIMES,
  },
];

const REGIMES_BY_CODE = new Map(
  SAT_TAX_REGIMES.map((regime) => [regime.code, regime]),
);
const USES_BY_CODE = new Map(SAT_CFDI_USES.map((use) => [use.code, use]));

export function findTaxRegime(code: string): SatTaxRegime | null {
  return REGIMES_BY_CODE.get(code) ?? null;
}

export function findCfdiUse(code: string): SatCfdiUse | null {
  return USES_BY_CODE.get(code) ?? null;
}
