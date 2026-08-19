import { normalizeRfc, validateRfc } from './rfc';
import { findCfdiUse, findTaxRegime } from './sat-catalogs';
import {
  normalizeLegalName,
  validateTaxProfile,
} from './tax-profile.validation';

/**
 * Estas pruebas son la evidencia de que la captura fiscal VALIDA de verdad.
 *
 * Cada caso corresponde a un rechazo real del SAT o del PAC: no son pruebas de
 * expresiones regulares, son la lista de formas en que un CFDI 4.0 sale mal
 * cuando los datos se recogen como texto libre — y todas ellas ocurren DESPUÉS
 * del cobro, que es cuando ya no tienen arreglo barato.
 */

const VALIDO = {
  rfc: 'VECJ880326XX4',
  legalName: 'Juan Carlos Vera Cruz',
  taxRegimeCode: '612',
  cfdiUseCode: 'G03',
  postalCode: '06700',
};

describe('validateRfc · estructura del SAT', () => {
  it('acepta un RFC de persona física (13) y otro de moral (12)', () => {
    expect(validateRfc('VECJ880326XX4')).toEqual({
      valid: true,
      rfc: 'VECJ880326XX4',
      personType: 'fisica',
    });
    expect(validateRfc('ABC010101AB9')).toEqual({
      valid: true,
      rfc: 'ABC010101AB9',
      personType: 'moral',
    });
  });

  it('normaliza como lo escribe la gente: minúsculas, guiones y espacios', () => {
    expect(normalizeRfc(' vecj-880326-xx4 ')).toBe('VECJ880326XX4');
    expect(validateRfc('vecj 880326 xx4')).toMatchObject({ valid: true });
  });

  it('rechaza longitudes que no son ni física ni moral', () => {
    // 11 caracteres: ni 12 ni 13. Es el error de teclear un RFC a medias, y
    // sin esto viajaría hasta el timbrado.
    expect(validateRfc('ABC010101A9')).toEqual({
      valid: false,
      rejection: 'rfc_length',
    });
  });

  it('rechaza dígitos donde el SAT exige letras y viceversa', () => {
    expect(validateRfc('VEC1880326XX4')).toMatchObject({
      rejection: 'rfc_shape',
    });
    expect(validateRfc('VECJ88O326XX4')).toMatchObject({
      rejection: 'rfc_shape',
    });
  });

  it('rechaza una fecha que no existe en el calendario', () => {
    // 31 de febrero. La longitud y la forma son correctas; la fecha no.
    expect(validateRfc('VECJ880231XX4')).toEqual({
      valid: false,
      rejection: 'rfc_date',
    });
    expect(validateRfc('VECJ881332XX4')).toEqual({
      valid: false,
      rejection: 'rfc_date',
    });
  });

  it('acepta el 29 de febrero de un año bisiesto y rechaza el de uno que no lo es', () => {
    expect(validateRfc('VECJ880229XX4')).toMatchObject({ valid: true });
    expect(validateRfc('VECJ890229XX4')).toMatchObject({
      rejection: 'rfc_date',
    });
  });

  it('rechaza el RFC genérico de público en general', () => {
    // Es un RFC válido para el SAT, pero con él la factura NO es deducible:
    // aceptarlo sería recoger el dato que garantiza que el cliente no podrá
    // deducir justo lo que acaba de pagar.
    expect(validateRfc('XAXX010101000')).toEqual({
      valid: false,
      rejection: 'rfc_generic',
    });
    expect(validateRfc('XEXX010101000')).toEqual({
      valid: false,
      rejection: 'rfc_generic',
    });
  });
});

describe('normalizeLegalName · como el SAT lo compara', () => {
  it('pone en mayúsculas, colapsa espacios y retira el régimen de capital', () => {
    // El SAT valida el nombre SIN el régimen de capital; dejarlo es la causa
    // más común de rechazo por nombre del receptor.
    expect(
      normalizeLegalName('  arquitectos  del   valle,  S.A. de C.V. '),
    ).toBe('ARQUITECTOS DEL VALLE');
    expect(normalizeLegalName('Despacho Norte S de RL de CV')).toBe(
      'DESPACHO NORTE',
    );
  });

  it('no toca un nombre de persona física', () => {
    expect(normalizeLegalName('juan carlos vera cruz')).toBe(
      'JUAN CARLOS VERA CRUZ',
    );
  });
});

describe('catálogos cerrados del SAT', () => {
  it('el catálogo es cerrado: un código inventado no existe', () => {
    expect(findTaxRegime('999')).toBeNull();
    expect(findCfdiUse('P01')).toBeNull();
    expect(findTaxRegime('626')?.personTypes).toEqual(['fisica', 'moral']);
  });
});

describe('validateTaxProfile · el perfil entero o nada', () => {
  it('normaliza y acepta un perfil coherente', () => {
    const result = validateTaxProfile({
      ...VALIDO,
      rfc: 'vecj-880326-xx4',
      legalName: ' juan carlos vera cruz ',
      postalCode: ' 06700 ',
    });
    expect(result).toEqual({
      valid: true,
      profile: {
        rfc: 'VECJ880326XX4',
        personType: 'fisica',
        legalName: 'JUAN CARLOS VERA CRUZ',
        taxRegimeCode: '612',
        cfdiUseCode: 'G03',
        postalCode: '06700',
      },
    });
  });

  it('detecta el régimen de persona moral sobre un RFC de persona física', () => {
    // 601 es «General de Ley Personas Morales» y el RFC tiene 13 caracteres.
    // El PAC lo rechazaría al timbrar, meses después del cobro.
    const result = validateTaxProfile({ ...VALIDO, taxRegimeCode: '601' });
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.issues).toEqual([
      expect.objectContaining({
        field: 'taxRegimeCode',
        code: 'tax_regime_person_type',
      }),
    ]);
  });

  it('detecta un uso de CFDI que el régimen del receptor no admite', () => {
    // Un asalariado (605) no puede deducir «Gastos en general»: su único uso
    // posible es S01. Es el rechazo «el uso de CFDI no corresponde al régimen
    // fiscal del receptor», y el mensaje tiene que decir eso.
    const result = validateTaxProfile({
      ...VALIDO,
      taxRegimeCode: '605',
      cfdiUseCode: 'G03',
    });
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.issues).toEqual([
      expect.objectContaining({
        field: 'cfdiUseCode',
        code: 'cfdi_use_regime_mismatch',
      }),
    ]);
    // Y la misma persona con S01 sí puede capturar.
    expect(
      validateTaxProfile({
        ...VALIDO,
        taxRegimeCode: '605',
        cfdiUseCode: 'S01',
      }).valid,
    ).toBe(true);
  });

  it('rechaza régimen y uso fuera del catálogo, nunca texto libre', () => {
    const result = validateTaxProfile({
      ...VALIDO,
      taxRegimeCode: 'actividad empresarial',
      cfdiUseCode: 'gastos',
    });
    expect(result.valid === false && result.issues.map((i) => i.code)).toEqual([
      'tax_regime_unknown',
      'cfdi_use_unknown',
    ]);
  });

  it('rechaza códigos postales que no son cinco dígitos', () => {
    for (const postalCode of ['0670', '067000', 'CP6700', '00000', '']) {
      expect(validateTaxProfile({ ...VALIDO, postalCode }).valid).toBe(false);
    }
  });

  it('devuelve TODOS los errores a la vez, no el primero', () => {
    // Descubrir de uno en uno los cinco campos mal es la forma más rápida de
    // que alguien abandone el formulario justo antes de pagar.
    const result = validateTaxProfile({
      rfc: 'nope',
      legalName: '',
      taxRegimeCode: 'x',
      cfdiUseCode: 'y',
      postalCode: 'z',
    });
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.issues.map((i) => i.field)).toEqual(
      ['rfc', 'legalName', 'taxRegimeCode', 'cfdiUseCode', 'postalCode'],
    );
  });

  it('cada rechazo trae un mensaje accionable en español', () => {
    const result = validateTaxProfile({ ...VALIDO, rfc: 'XAXX010101000' });
    expect(result.valid === false && result.issues[0].message).toContain(
      'deducible',
    );
  });
});
