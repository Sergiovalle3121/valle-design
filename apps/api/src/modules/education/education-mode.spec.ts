import {
  EDUCATION_PLAN_CODE,
  educationModeStatus,
  emailDomain,
  institutionalDomains,
  isEducationModeEnabled,
  isInstitutionalEmail,
} from './education-mode';
import { PUBLISHABLE_PLANS } from '../commercial/commercial-catalog.bootstrap';

/**
 * Las pruebas del modo universitario están escritas como ACUSACIONES: cada una
 * intenta colar a alguien que no debería entrar. Un mecanismo que regala el
 * producto completo se prueba por su puerta, no por su pasillo.
 */
describe('modo universitario', () => {
  const APAGADO: NodeJS.ProcessEnv = {};
  const ENCENDIDO: NodeJS.ProcessEnv = {
    EDUCATION_MODE: 'true',
    EDUCATION_EMAIL_DOMAINS: 'unam.mx, uni.es',
  };

  describe('el interruptor', () => {
    it('está apagado sin configuración', () => {
      expect(isEducationModeEnabled(APAGADO)).toBe(false);
    });

    it('sólo lo enciende el literal "true"', () => {
      for (const valor of ['1', 'yes', 'on', 'TRUE', 'sí', '']) {
        expect(isEducationModeEnabled({ EDUCATION_MODE: valor })).toBe(false);
      }
      expect(isEducationModeEnabled({ EDUCATION_MODE: 'true' })).toBe(true);
    });

    it('con el modo apagado la lista de dominios está VACÍA aunque esté escrita', () => {
      // La regla que impide que una ruta futura use la lista saltándose el
      // interruptor: no hay dos formas de estar encendido.
      expect(
        institutionalDomains({ EDUCATION_EMAIL_DOMAINS: 'unam.mx' }).size,
      ).toBe(0);
    });
  });

  describe('la lista de dominios', () => {
    it('normaliza espacios y mayúsculas', () => {
      const dominios = institutionalDomains({
        EDUCATION_MODE: 'true',
        EDUCATION_EMAIL_DOMAINS: '  UNAM.MX ,  Uni.ES  ',
      });
      expect([...dominios].sort()).toEqual(['unam.mx', 'uni.es']);
    });

    it('descarta la basura en vez de guardarla', () => {
      const dominios = institutionalDomains({
        EDUCATION_MODE: 'true',
        EDUCATION_EMAIL_DOMAINS: 'unam.mx,,@,sinpunto,-mal.mx,mal-.mx,a b.mx,x@y.mx',
      });
      expect([...dominios]).toEqual(['unam.mx']);
    });
  });

  describe('el dominio de un correo', () => {
    it('lo extrae en minúsculas', () => {
      expect(emailDomain('  Ana@Alumnos.UNAM.mx ')).toBe('alumnos.unam.mx');
    });

    it('rechaza lo que no es un correo', () => {
      for (const basura of ['', '@', 'ana@', '@unam.mx', 'ana@@unam.mx', 'ana@unam', null, undefined]) {
        expect(emailDomain(basura)).toBeNull();
      }
    });
  });

  describe('la elegibilidad', () => {
    it('acepta el dominio raíz y sus subdominios', () => {
      expect(isInstitutionalEmail('profesor@unam.mx', ENCENDIDO)).toBe(true);
      expect(isInstitutionalEmail('ana@alumnos.unam.mx', ENCENDIDO)).toBe(true);
      expect(isInstitutionalEmail('luis@fi.posgrado.unam.mx', ENCENDIDO)).toBe(true);
      expect(isInstitutionalEmail('pau@uni.es', ENCENDIDO)).toBe(true);
    });

    it('NO acepta un dominio que sólo termina igual', () => {
      // Doce dólares es lo que cuesta comprar `malicioso-unam.mx`. Un
      // `endsWith` sin el punto lo habría dejado pasar.
      expect(isInstitutionalEmail('quien@malicioso-unam.mx', ENCENDIDO)).toBe(false);
      expect(isInstitutionalEmail('quien@unam.mx.example.com', ENCENDIDO)).toBe(false);
      expect(isInstitutionalEmail('quien@notunam.mx', ENCENDIDO)).toBe(false);
    });

    it('NO acepta a nadie con el modo apagado, ni siquiera al dominio correcto', () => {
      expect(isInstitutionalEmail('profesor@unam.mx', APAGADO)).toBe(false);
      expect(
        isInstitutionalEmail('profesor@unam.mx', {
          EDUCATION_EMAIL_DOMAINS: 'unam.mx',
        }),
      ).toBe(false);
    });

    it('NO acepta a nadie con el modo encendido y la lista vacía', () => {
      expect(isInstitutionalEmail('profesor@unam.mx', { EDUCATION_MODE: 'true' })).toBe(false);
    });
  });

  describe('el retrato del modo', () => {
    it('sin configurar, dice exactamente qué falta', () => {
      expect(educationModeStatus(APAGADO)).toEqual({
        enabled: false,
        domainCount: 0,
        missing: ['EDUCATION_MODE', 'EDUCATION_EMAIL_DOMAINS'],
      });
    });

    it('encendido y con dominios, no falta nada', () => {
      expect(educationModeStatus(ENCENDIDO)).toEqual({
        enabled: true,
        domainCount: 2,
        missing: [],
      });
    });
  });

  it('el plan educativo NO se siembra en el catálogo', () => {
    // La comprobación que impide que un plan gratuito aparezca en la página de
    // precios antes de que exista un alta capaz de concederlo.
    // El `as const` del catálogo hace que TypeScript sepa los códigos, así que
    // la comparación directa sería estáticamente falsa y no compilaría. Se
    // compara sobre la lista ensanchada: lo que se quiere probar es el HECHO en
    // tiempo de ejecución, no lo que el compilador ya sabe.
    const codigos: readonly string[] = PUBLISHABLE_PLANS.map((plan) => plan.code);
    expect(codigos).not.toContain(EDUCATION_PLAN_CODE);
  });
});
