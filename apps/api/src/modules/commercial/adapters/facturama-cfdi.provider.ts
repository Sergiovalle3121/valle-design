import type {
  CfdiIssuanceRequest,
  CfdiIssuanceResult,
  CfdiProvider,
  CfdiProviderDescriptor,
} from '../ports/cfdi-provider.port';
import type { CfdiConfiguration } from './null-cfdi.provider';
import { CfdiConfigurationError } from './null-cfdi.provider';

/**
 * Adaptador REAL de CFDI 4.0 sobre la API de Facturama (sandbox por defecto).
 *
 * Mismo patrón que StripePaymentProvider: un puerto HTTP fino e inyectable
 * (`FacturamaHttpClient`) es el ÚNICO punto que toca la red; los specs de
 * contrato fijan cada campo del cuerpo saliente y cada rama del parseo con
 * dobles — sin credenciales del PAC en el repositorio, jamás.
 *
 * Estado de verificación (honesto): el contrato HTTP está fijado por specs
 * contra fixtures construidos de la documentación pública de Facturama
 * (creación `POST /2/cfdis`, descarga `GET /cfdi/{formato}/issued/{id}`,
 * autenticación HTTP Basic). La corrida contra el sandbox REAL requiere
 * credenciales del dueño y queda declarada como pendiente en
 * DEPLOYMENT.md — este adaptador no se anuncia como verificado end-to-end
 * hasta entonces.
 *
 * Decisiones fiscales (configurables, con default documentado):
 * - Comprobante de INGRESO, `PUE` (pago en una sola exhibición): el job sólo
 *   timbra cobros YA liquidados por el webhook.
 * - Forma de pago default `31` (Intermediario de pagos): el dinero llega vía
 *   Stripe, no directo a la cuenta del emisor. `CFDI_PAYMENT_FORM` la ajusta.
 * - IVA 16% DESGLOSADO desde el total cobrado (precio al público IVA
 *   incluido): base = total/1.16 redondeada a centavos, IVA = total − base.
 * - Clave de producto/servicio default `81161501` y unidad `E48` (servicio);
 *   `CFDI_PRODUCT_CODE` la ajusta — confírmala con el contador.
 */

export interface FacturamaHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FacturamaHttpClient = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    redirect: 'error';
  },
) => Promise<FacturamaHttpResponse>;

/** El único punto de la aplicación que toca la red del PAC. */
export const globalFacturamaHttpClient: FacturamaHttpClient = (url, init) =>
  fetch(url, init);

export interface FacturamaConfiguration extends CfdiConfiguration {
  /** Origen de la API; default el sandbox público. */
  readonly baseUrl: string;
  /** CP del emisor (ExpeditionPlace) — obligatorio para timbrar. */
  readonly expeditionPlace: string;
  readonly paymentForm: string;
  readonly productCode: string;
  readonly timeoutMs: number;
}

export const FACTURAMA_SANDBOX_BASE_URL = 'https://apisandbox.facturama.mx';

/**
 * Completa la configuración genérica del PAC con lo que Facturama exige.
 * Igual de rígida que el resto: un CP ausente o malformado no arranca —
 * timbraría comprobantes inválidos con cara de válidos.
 */
export function resolveFacturamaConfiguration(
  base: CfdiConfiguration,
  environment: NodeJS.ProcessEnv,
): FacturamaConfiguration {
  const expeditionPlace = environment.CFDI_ISSUER_POSTAL_CODE?.trim() ?? '';
  if (!/^\d{5}$/u.test(expeditionPlace)) {
    throw new CfdiConfigurationError(
      'CFDI_ISSUER_POSTAL_CODE es obligatorio con CFDI_PAC_NAME=facturama: ' +
        'el código postal del emisor (5 dígitos) es el ExpeditionPlace de ' +
        'cada comprobante.',
    );
  }
  const baseUrl = (
    environment.CFDI_PAC_BASE_URL?.trim() || FACTURAMA_SANDBOX_BASE_URL
  ).replace(/\/+$/u, '');
  if (!baseUrl.startsWith('https://')) {
    throw new CfdiConfigurationError(
      'CFDI_PAC_BASE_URL debe ser HTTPS: por ahí viajan datos fiscales.',
    );
  }
  return {
    ...base,
    baseUrl,
    expeditionPlace,
    paymentForm: environment.CFDI_PAYMENT_FORM?.trim() || '31',
    productCode: environment.CFDI_PRODUCT_CODE?.trim() || '81161501',
    timeoutMs: 15_000,
  };
}

/** Rechazo del PAC o red caída: el job lo apunta y reintenta con techo. */
export class CfdiIssuanceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'CfdiIssuanceError';
  }
}

/** `1234` centavos → `"12.34"` (el PAC habla en importes decimales). */
function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

/** Base e IVA desglosados de un total IVA-incluido, exactos en centavos. */
export function splitIvaFromTotalCents(totalCents: number): {
  baseCents: number;
  ivaCents: number;
} {
  const baseCents = Math.round(totalCents / 1.16);
  return { baseCents, ivaCents: totalCents - baseCents };
}

export class FacturamaCfdiProvider implements CfdiProvider {
  constructor(
    private readonly configuration: FacturamaConfiguration,
    private readonly http: FacturamaHttpClient = globalFacturamaHttpClient,
  ) {}

  descriptor(): CfdiProviderDescriptor {
    return { name: 'facturama', mode: 'automatic', available: true };
  }

  private headers(): Record<string, string> {
    // CFDI_PAC_API_KEY = "usuario:contraseña" de la cuenta Facturama.
    const token = Buffer.from(this.configuration.apiKey, 'utf8').toString(
      'base64',
    );
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(
    method: string,
    pathname: string,
    body?: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.configuration.timeoutMs,
    );
    let response: FacturamaHttpResponse;
    try {
      response = await this.http(`${this.configuration.baseUrl}${pathname}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      throw new CfdiIssuanceError(
        `Red caída hablando con el PAC: ${error instanceof Error ? error.name : 'error'}`,
        null,
      );
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) {
      // El cuerpo de error del PAC puede nombrar campos fiscales; se acota y
      // jamás se registran datos de pago (aquí no viajan).
      throw new CfdiIssuanceError(
        `El PAC rechazó la operación (HTTP ${response.status}): ${text.slice(0, 500)}`,
        response.status,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CfdiIssuanceError('El PAC respondió algo que no es JSON', null);
    }
  }

  async issue(request: CfdiIssuanceRequest): Promise<CfdiIssuanceResult> {
    const totalCents = request.amountCents;
    const { baseCents, ivaCents } = splitIvaFromTotalCents(totalCents);
    const body = {
      CfdiType: 'I',
      Currency: request.currency.toUpperCase(),
      ExpeditionPlace: this.configuration.expeditionPlace,
      PaymentForm: this.configuration.paymentForm,
      PaymentMethod: 'PUE',
      Receiver: {
        Rfc: request.receiver.rfc,
        Name: request.receiver.legalName.toUpperCase(),
        FiscalRegime: request.receiver.taxRegimeCode,
        CfdiUse: request.receiver.cfdiUseCode,
        TaxZipCode: request.receiver.postalCode,
      },
      Items: [
        {
          ProductCode: this.configuration.productCode,
          Description: request.concept,
          UnitCode: 'E48',
          Quantity: 1,
          UnitPrice: centsToDecimal(baseCents),
          Subtotal: centsToDecimal(baseCents),
          Taxes: [
            {
              Name: 'IVA',
              Rate: 0.16,
              Base: centsToDecimal(baseCents),
              Total: centsToDecimal(ivaCents),
              IsRetention: false,
            },
          ],
          Total: centsToDecimal(totalCents),
        },
      ],
    };

    const created = (await this.request('POST', '/2/cfdis', body)) as {
      Id?: string;
      Complement?: { TaxStamp?: { Uuid?: string } };
    };
    const uuid = created?.Complement?.TaxStamp?.Uuid;
    const providerRef = created?.Id;
    if (!uuid || !providerRef) {
      throw new CfdiIssuanceError(
        'El PAC respondió sin folio fiscal (Complement.TaxStamp.Uuid) o sin Id',
        null,
      );
    }
    // Los archivos NO son URLs públicas: se descargan autenticados vía
    // `download` y el producto los sirve desde su propio endpoint.
    return { kind: 'issued', uuid, providerRef, xmlUrl: null, pdfUrl: null };
  }

  /** Descarga autenticada del comprobante timbrado (base64 del PAC). */
  async download(
    providerRef: string,
    format: 'pdf' | 'xml',
  ): Promise<{ contentBase64: string; contentType: string }> {
    if (!/^[\w-]{1,120}$/u.test(providerRef)) {
      throw new CfdiIssuanceError('Referencia de comprobante inválida', null);
    }
    const payload = (await this.request(
      'GET',
      `/cfdi/${format}/issued/${providerRef}`,
    )) as { Content?: string; ContentType?: string };
    if (!payload?.Content) {
      throw new CfdiIssuanceError('El PAC respondió sin contenido', null);
    }
    return {
      contentBase64: payload.Content,
      contentType:
        payload.ContentType ??
        (format === 'pdf' ? 'application/pdf' : 'application/xml'),
    };
  }
}
