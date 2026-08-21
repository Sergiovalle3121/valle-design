import {
  CfdiIssuanceError,
  FACTURAMA_SANDBOX_BASE_URL,
  FacturamaCfdiProvider,
  type FacturamaHttpClient,
  resolveFacturamaConfiguration,
  splitIvaFromTotalCents,
} from './facturama-cfdi.provider';
import { CfdiConfigurationError } from './null-cfdi.provider';
import type { CfdiIssuanceRequest } from '../ports/cfdi-provider.port';

/**
 * Contrato HTTP del adaptador Facturama, fijado con dobles (patrón
 * httpDouble de Stripe): cada campo del cuerpo saliente y cada rama del
 * parseo quedan afirmados SIN credenciales ni red. La corrida contra el
 * sandbox real del PAC exige credenciales del dueño y está declarada como
 * pendiente — este spec es el contrato que esa corrida deberá confirmar.
 */

const BASE = {
  pacName: 'facturama',
  apiKey: 'usuario-sandbox:contrasena-sandbox',
  issuerRfc: 'ABC010101AB9',
  issuerTaxRegime: '601',
};

const ENV = { CFDI_ISSUER_POSTAL_CODE: '06700' };

function httpDouble(...responses: Array<{ status: number; body: string }>) {
  const calls: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    json: unknown;
  }> = [];
  const client: FacturamaHttpClient = (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      json: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    const next = responses.shift() ?? { status: 200, body: '{}' };
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: () => Promise.resolve(next.body),
    });
  };
  return { client, calls };
}

const REQUEST: CfdiIssuanceRequest = {
  organizationId: 'org-1',
  invoiceId: 'inv-1',
  amountCents: 99_900,
  currency: 'mxn',
  issuedAt: new Date('2026-08-01T12:00:00Z'),
  concept: 'Suscripción Valle Design (VD-0042)',
  receiver: {
    rfc: 'VECJ880326XX4',
    legalName: 'Arquitectos del Valle S.A. de C.V.',
    taxRegimeCode: '612',
    cfdiUseCode: 'G03',
    postalCode: '44100',
  },
};

const STAMPED = JSON.stringify({
  Id: 'fact-abc123',
  Complement: { TaxStamp: { Uuid: 'AAA111BB-2222-3333-4444-555566667777' } },
});

describe('resolveFacturamaConfiguration · lo que Facturama exige además', () => {
  it('sin CP del emisor NO arranca: timbraría comprobantes inválidos', () => {
    expect(() => resolveFacturamaConfiguration(BASE, {})).toThrow(
      CfdiConfigurationError,
    );
    expect(() =>
      resolveFacturamaConfiguration(BASE, { CFDI_ISSUER_POSTAL_CODE: '671' }),
    ).toThrow(/5 dígitos|CFDI_ISSUER_POSTAL_CODE/u);
  });

  it('default: sandbox público, forma 31, producto 81161501', () => {
    const configuration = resolveFacturamaConfiguration(BASE, ENV);
    expect(configuration.baseUrl).toBe(FACTURAMA_SANDBOX_BASE_URL);
    expect(configuration.paymentForm).toBe('31');
    expect(configuration.productCode).toBe('81161501');
    expect(configuration.expeditionPlace).toBe('06700');
  });

  it('el origen del PAC sólo puede ser HTTPS', () => {
    expect(() =>
      resolveFacturamaConfiguration(BASE, {
        ...ENV,
        CFDI_PAC_BASE_URL: 'http://apisandbox.facturama.mx',
      }),
    ).toThrow(/HTTPS/u);
  });
});

describe('FacturamaCfdiProvider.issue · el cuerpo que viaja al PAC', () => {
  it('emite un CFDI de ingreso PUE con el receptor y el IVA desglosado', async () => {
    const { client, calls } = httpDouble({ status: 201, body: STAMPED });
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );

    const result = await provider.issue(REQUEST);

    expect(result).toEqual({
      kind: 'issued',
      uuid: 'AAA111BB-2222-3333-4444-555566667777',
      providerRef: 'fact-abc123',
      xmlUrl: null,
      pdfUrl: null,
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe(`${FACTURAMA_SANDBOX_BASE_URL}/2/cfdis`);
    expect(call.method).toBe('POST');
    // Basic auth con la credencial de la cuenta, jamás en claro en la URL.
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from(BASE.apiKey, 'utf8').toString('base64')}`,
    );

    const body = call.json as Record<string, unknown>;
    expect(body.CfdiType).toBe('I');
    expect(body.Currency).toBe('MXN');
    expect(body.ExpeditionPlace).toBe('06700');
    expect(body.PaymentForm).toBe('31');
    expect(body.PaymentMethod).toBe('PUE');
    expect(body.Receiver).toEqual({
      Rfc: 'VECJ880326XX4',
      Name: 'ARQUITECTOS DEL VALLE S.A. DE C.V.',
      FiscalRegime: '612',
      CfdiUse: 'G03',
      TaxZipCode: '44100',
    });

    // 999.00 IVA incluido → base 861.21 + IVA 137.79, exactos en centavos.
    const [item] = body.Items as Array<Record<string, unknown>>;
    expect(item.Description).toBe('Suscripción Valle Design (VD-0042)');
    expect(item.UnitPrice).toBe('861.21');
    expect(item.Subtotal).toBe('861.21');
    expect(item.Total).toBe('999.00');
    const [tax] = item.Taxes as Array<Record<string, unknown>>;
    expect(tax).toEqual({
      Name: 'IVA',
      Rate: 0.16,
      Base: '861.21',
      Total: '137.79',
      IsRetention: false,
    });
  });

  it('un rechazo del PAC es CfdiIssuanceError con el estado HTTP', async () => {
    const { client } = httpDouble({
      status: 400,
      body: '{"Message":"Rfc del receptor inválido"}',
    });
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );
    await expect(provider.issue(REQUEST)).rejects.toMatchObject({
      name: 'CfdiIssuanceError',
      status: 400,
    });
  });

  it('una respuesta 2xx SIN folio fiscal también es error: nunca se finge', async () => {
    const { client } = httpDouble({ status: 200, body: '{"Id":"x"}' });
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );
    await expect(provider.issue(REQUEST)).rejects.toThrow(/folio fiscal/u);
  });

  it('una respuesta que no es JSON es error tipado, no un crash', async () => {
    const { client } = httpDouble({
      status: 200,
      body: '<html>gateway</html>',
    });
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );
    await expect(provider.issue(REQUEST)).rejects.toBeInstanceOf(
      CfdiIssuanceError,
    );
  });
});

describe('FacturamaCfdiProvider.download · los archivos del comprobante', () => {
  it('descarga el PDF autenticado y entrega el base64 del PAC', async () => {
    const { client, calls } = httpDouble({
      status: 200,
      body: JSON.stringify({
        Content: 'JVBERi0xLjQ=',
        ContentType: 'application/pdf',
      }),
    });
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );
    const file = await provider.download('fact-abc123', 'pdf');
    expect(file).toEqual({
      contentBase64: 'JVBERi0xLjQ=',
      contentType: 'application/pdf',
    });
    expect(calls[0].url).toBe(
      `${FACTURAMA_SANDBOX_BASE_URL}/cfdi/pdf/issued/fact-abc123`,
    );
    expect(calls[0].method).toBe('GET');
  });

  it('una referencia malformada no llega a la red', async () => {
    const { client, calls } = httpDouble();
    const provider = new FacturamaCfdiProvider(
      resolveFacturamaConfiguration(BASE, ENV),
      client,
    );
    await expect(provider.download('../otr@/id', 'xml')).rejects.toThrow(
      /inválida/u,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('splitIvaFromTotalCents · el desglose siempre suma el total', () => {
  it.each([[100], [101], [116], [99_900], [2_900_00], [1]])(
    'total %i centavos',
    (total) => {
      const { baseCents, ivaCents } = splitIvaFromTotalCents(total);
      expect(baseCents + ivaCents).toBe(total);
      expect(baseCents).toBeGreaterThanOrEqual(0);
      // El IVA efectivo ronda el 16% de la base (redondeo de centavos aparte).
      if (total >= 100) {
        expect(Math.abs(ivaCents - baseCents * 0.16)).toBeLessThanOrEqual(1);
      }
    },
  );
});
