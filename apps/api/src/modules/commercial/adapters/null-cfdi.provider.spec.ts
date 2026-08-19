import {
  CfdiConfigurationError,
  NullCfdiProvider,
  resolveCfdiConfiguration,
} from './null-cfdi.provider';

/**
 * El adaptador de CFDI por defecto DICE LA VERDAD.
 *
 * Esta suite existe para blindar la única promesa que la ola puede hacer hoy:
 * el producto captura, valida y custodia datos fiscales, y NO timbra. Un
 * adaptador que devolviera un UUID inventado convertiría un problema comercial
 * —«todavía no facturamos»— en un problema legal del cliente, que creería
 * tener un comprobante fiscal donde no hay ninguno.
 */

const COMPLETA: NodeJS.ProcessEnv = {
  CFDI_PAC_NAME: 'facturama',
  CFDI_PAC_API_KEY: 'clave-de-prueba',
  CFDI_ISSUER_RFC: 'ABC010101AB9',
  CFDI_ISSUER_TAX_REGIME: '601',
};

describe('NullCfdiProvider', () => {
  it('se publica como emisión MANUAL y NO disponible', () => {
    expect(new NullCfdiProvider().descriptor()).toEqual({
      name: 'null',
      mode: 'manual',
      available: false,
    });
  });

  it('nunca finge un timbrado: responde `manual` con el motivo real', async () => {
    const result = await new NullCfdiProvider().issue();
    expect(result.kind).toBe('manual');
    expect(result.kind === 'manual' && result.reason).toContain('PAC');
  });
});

describe('resolveCfdiConfiguration · el interruptor es la configuración', () => {
  it('sin variables el despliegue sigue con emisión manual', () => {
    expect(resolveCfdiConfiguration({})).toBeNull();
  });

  it('una configuración a medias FALLA en vez de arrancar a ciegas', () => {
    // Clave del PAC sin RFC del emisor timbraría a nombre de nadie; RFC sin
    // clave creería que factura y no facturaría. Las dos fallan al arrancar.
    for (const key of Object.keys(COMPLETA)) {
      const parcial: NodeJS.ProcessEnv = { ...COMPLETA };
      delete parcial[key];
      expect(() => resolveCfdiConfiguration(parcial)).toThrow(
        CfdiConfigurationError,
      );
    }
  });

  it('con las cuatro variables devuelve la configuración completa', () => {
    expect(resolveCfdiConfiguration(COMPLETA)).toEqual({
      pacName: 'facturama',
      apiKey: 'clave-de-prueba',
      issuerRfc: 'ABC010101AB9',
      issuerTaxRegime: '601',
    });
  });

  it('ignora variables en blanco como si no estuvieran', () => {
    expect(
      resolveCfdiConfiguration({
        CFDI_PAC_NAME: '   ',
        CFDI_PAC_API_KEY: '',
      }),
    ).toBeNull();
  });
});
