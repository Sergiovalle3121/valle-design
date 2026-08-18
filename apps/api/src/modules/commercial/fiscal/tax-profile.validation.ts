import {
  findCfdiUse,
  findTaxRegime,
  type SatCfdiUse,
  type SatTaxRegime,
} from './sat-catalogs';
import {
  normalizeRfc,
  rfcRejectionMessage,
  validateRfc,
  type TaxPersonType,
} from './rfc';

/**
 * Validación COMPLETA del perfil fiscal, en un módulo puro.
 *
 * Vive fuera del controller a propósito: las mismas reglas tienen que poder
 * ejercitarse sin Nest, sin base de datos y sin HTTP, porque son las que
 * deciden si un cliente podrá deducir lo que paga. Y devuelve TODOS los
 * errores a la vez, no el primero: obligar a alguien a descubrir de uno en uno
 * los cinco campos mal es la forma más rápida de que abandone el formulario
 * justo antes de pagar.
 *
 * Fallo CERRADO: o el perfil es válido entero y se puede persistir, o no se
 * persiste nada. Un perfil fiscal a medias es peor que ninguno, porque parece
 * que ya se capturó.
 */

export interface TaxProfileInput {
  rfc: string;
  legalName: string;
  taxRegimeCode: string;
  cfdiUseCode: string;
  postalCode: string;
}

export interface NormalizedTaxProfile {
  rfc: string;
  personType: TaxPersonType;
  legalName: string;
  taxRegimeCode: string;
  cfdiUseCode: string;
  postalCode: string;
}

export type TaxProfileField =
  'rfc' | 'legalName' | 'taxRegimeCode' | 'cfdiUseCode' | 'postalCode';

export interface TaxProfileIssue {
  field: TaxProfileField;
  /** Código estable para soporte; el mensaje puede cambiar, éste no. */
  code: string;
  message: string;
}

export type TaxProfileValidation =
  | { valid: true; profile: NormalizedTaxProfile }
  | { valid: false; issues: TaxProfileIssue[] };

const LEGAL_NAME_MIN = 3;
const LEGAL_NAME_MAX = 300;
/**
 * Razón social tal y como el SAT la almacena: letras (con acentos y Ñ),
 * dígitos, espacios y los signos que aparecen de verdad en denominaciones
 * sociales mexicanas. Todo lo demás —control, emoji, comillas tipográficas—
 * se rechaza en vez de limpiarse: limpiar cambiaría el nombre del cliente sin
 * que él lo sepa, y el nombre del receptor tiene que coincidir con su
 * Constancia de Situación Fiscal.
 */
const LEGAL_NAME_CHARSET = /^[A-ZÑÁÉÍÓÚÜ0-9 .,&'’()/-]+$/;
/**
 * Régimen de capital: el SAT valida la razón social SIN él. Escribir
 * «S.A. DE C.V.» no invalida el CFDI, pero es la causa más común de rechazo
 * por nombre, así que se avisa quitándolo — es una normalización visible y
 * explicable, no una corrección silenciosa del nombre.
 */
const CAPITAL_REGIME =
  /\s*,?\s*\b(S\.?\s?A\.?\s?(DE\s?)?C\.?\s?V\.?|S\.?\s?DE\s?R\.?\s?L\.?(\s?DE\s?C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?\s?P\.?\s?I\.?(\s?DE\s?C\.?\s?V\.?)?)\s*$/;

const POSTAL_CODE = /^\d{5}$/;

export function normalizeLegalName(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  return collapsed.replace(CAPITAL_REGIME, '').trim();
}

export function validateTaxProfile(
  input: TaxProfileInput,
): TaxProfileValidation {
  const issues: TaxProfileIssue[] = [];

  const rfcResult = validateRfc(input.rfc ?? '');
  if (!rfcResult.valid) {
    issues.push({
      field: 'rfc',
      code: rfcResult.rejection,
      message: rfcRejectionMessage(rfcResult.rejection),
    });
  }
  const personType = rfcResult.valid ? rfcResult.personType : null;

  const legalName = normalizeLegalName(input.legalName ?? '');
  if (legalName.length < LEGAL_NAME_MIN) {
    issues.push({
      field: 'legalName',
      code: 'legal_name_too_short',
      message:
        'Escribe la razón social o tu nombre completo tal y como aparece en tu Constancia de Situación Fiscal.',
    });
  } else if (legalName.length > LEGAL_NAME_MAX) {
    issues.push({
      field: 'legalName',
      code: 'legal_name_too_long',
      message: `La razón social no puede pasar de ${LEGAL_NAME_MAX} caracteres.`,
    });
  } else if (!LEGAL_NAME_CHARSET.test(legalName)) {
    issues.push({
      field: 'legalName',
      code: 'legal_name_charset',
      message:
        'La razón social sólo admite letras, números, espacios y los signos . , & ’ ( ) / -',
    });
  }

  const regime = findTaxRegime((input.taxRegimeCode ?? '').trim());
  if (!regime) {
    issues.push({
      field: 'taxRegimeCode',
      code: 'tax_regime_unknown',
      message:
        'Elige tu régimen fiscal del catálogo del SAT; no es un campo de texto libre.',
    });
  } else if (personType && !regime.personTypes.includes(personType)) {
    // Incoherencia detectable en la CAPTURA: el tipo de persona sale de la
    // longitud del RFC y el régimen dice a qué tipo aplica. Sin esta
    // comprobación el error aparece al timbrar, meses después del cobro.
    issues.push({
      field: 'taxRegimeCode',
      code: 'tax_regime_person_type',
      message:
        personType === 'fisica'
          ? `El régimen ${regime.code} (${regime.name}) es de personas morales, y tu RFC es de persona física.`
          : `El régimen ${regime.code} (${regime.name}) es de personas físicas, y tu RFC es de persona moral.`,
    });
  }

  const use = findCfdiUse((input.cfdiUseCode ?? '').trim());
  if (!use) {
    issues.push({
      field: 'cfdiUseCode',
      code: 'cfdi_use_unknown',
      message:
        'Elige el uso del CFDI del catálogo del SAT; no es un campo de texto libre.',
    });
  } else if (regime && !use.taxRegimeCodes.includes(regime.code)) {
    issues.push({
      field: 'cfdiUseCode',
      code: 'cfdi_use_regime_mismatch',
      message: cfdiUseMismatchMessage(use, regime),
    });
  }

  const postalCode = (input.postalCode ?? '').trim();
  if (!POSTAL_CODE.test(postalCode) || postalCode === '00000') {
    issues.push({
      field: 'postalCode',
      code: 'postal_code_invalid',
      message:
        'El código postal del domicilio fiscal son cinco dígitos, los mismos que aparecen en tu Constancia de Situación Fiscal.',
    });
  }

  if (issues.length > 0 || !rfcResult.valid || !regime || !use) {
    return { valid: false, issues };
  }
  return {
    valid: true,
    profile: {
      rfc: normalizeRfc(input.rfc),
      personType: rfcResult.personType,
      legalName,
      taxRegimeCode: regime.code,
      cfdiUseCode: use.code,
      postalCode,
    },
  };
}

/**
 * El mensaje NO se queda en «no corresponde»: dice qué usos le quedan a ese
 * régimen. Un asalariado (605) que no puede poner «Gastos en general» tiene
 * que enterarse de que su opción es «Sin efectos fiscales», o abandonará.
 */
function cfdiUseMismatchMessage(use: SatCfdiUse, regime: SatTaxRegime): string {
  return (
    `El uso "${use.code} — ${use.name}" no está permitido para el régimen ` +
    `${regime.code} (${regime.name}). El SAT rechazaría la factura.`
  );
}
