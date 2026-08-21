/**
 * Puerto del PAC (Proveedor Autorizado de Certificación) para el CFDI 4.0.
 *
 * Se diseña ANTES de elegir PAC, exactamente igual que se hizo con el puerto
 * de pagos: el dueño todavía no ha contratado Facturama, Bind ni SW Sapien, y
 * no tiene sentido que esa decisión bloquee la captura de datos fiscales —que
 * es lo urgente, porque pedirlos DESPUÉS del cobro es la pesadilla operativa
 * que esta ola evita.
 *
 * Y por la misma razón que el puerto de pagos, el adaptador por defecto es
 * NULO y lo dice: sin credenciales de un PAC, el modo de emisión es
 * `manual` y la interfaz anuncia que los datos quedan capturados para que el
 * CFDI se emita a mano. La web NO promete timbrar mientras no timbre.
 *
 * Nada aquí depende de HTTP, Nest ni de un PAC concreto.
 */

/**
 * Cómo se emite hoy el comprobante.
 *
 * - `manual`: el producto CAPTURA y CUSTODIA los datos fiscales; el CFDI lo
 *   emite una persona con esos datos ya validados. Es lo único que el
 *   adaptador nulo puede ofrecer, y es un paso real: el trabajo pasa de
 *   perseguir al cliente por su RFC a copiar cinco campos ya correctos.
 * - `automatic`: hay PAC contratado y el producto timbra por sí mismo.
 */
export type CfdiIssuanceMode = 'manual' | 'automatic';

export interface CfdiProviderDescriptor {
  /** Nombre estable del adaptador (`null` hoy; `facturama`, `bind`… mañana). */
  readonly name: string;
  readonly mode: CfdiIssuanceMode;
  /** false ⇒ el producto NO puede timbrar por sí mismo. */
  readonly available: boolean;
}

/** Datos del RECEPTOR, ya normalizados y validados contra los catálogos. */
export interface CfdiReceiver {
  readonly rfc: string;
  readonly legalName: string;
  readonly taxRegimeCode: string;
  readonly cfdiUseCode: string;
  readonly postalCode: string;
}

/** Lo que hace falta para timbrar UN comprobante. Nada de datos de pago. */
export interface CfdiIssuanceRequest {
  readonly organizationId: string;
  /** Factura espejo de la pasarela que origina el comprobante. */
  readonly invoiceId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly issuedAt: Date;
  /** Descripción del concepto tal y como debe aparecer en el CFDI. */
  readonly concept: string;
  readonly receiver: CfdiReceiver;
}

export type CfdiIssuanceResult =
  /** Timbrado: `uuid` es el folio fiscal que el SAT devolvió. */
  | {
      kind: 'issued';
      uuid: string;
      /** Referencia del comprobante EN EL PAC (para descargar XML/PDF). */
      providerRef?: string;
      xmlUrl: string | null;
      pdfUrl: string | null;
    }
  /** No hay PAC: el comprobante lo emite una persona con estos datos. */
  | { kind: 'manual'; reason: string };

export interface CfdiProvider {
  descriptor(): CfdiProviderDescriptor;
  issue(request: CfdiIssuanceRequest): Promise<CfdiIssuanceResult>;
  /**
   * Descarga autenticada del comprobante timbrado. Opcional: sólo los PAC
   * que custodian los archivos la ofrecen; sin ella, el producto responde
   * que los archivos no están disponibles todavía.
   */
  download?(
    providerRef: string,
    format: 'pdf' | 'xml',
  ): Promise<{ contentBase64: string; contentType: string }>;
}

export const CFDI_PROVIDER = Symbol('CFDI_PROVIDER');
