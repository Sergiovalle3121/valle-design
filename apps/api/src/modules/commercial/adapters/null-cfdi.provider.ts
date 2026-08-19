import { Injectable } from '@nestjs/common';
import type {
  CfdiIssuanceResult,
  CfdiProvider,
  CfdiProviderDescriptor,
} from '../ports/cfdi-provider.port';

/**
 * Adaptador de CFDI POR DEFECTO: no hay PAC contratado.
 *
 * Deja constancia explícita de cómo se factura hoy: los datos fiscales se
 * CAPTURAN y se VALIDAN dentro del producto, y el comprobante lo emite una
 * persona con ellos delante. Por eso `mode: 'manual'` (así lo publica
 * `GET /v1/commercial/tax-profile`, y así lo dice la web) y `available: false`
 * (el producto no puede timbrar por sí mismo).
 *
 * No es un stub que finja: `issue` responde `manual` con el motivo real. Un
 * adaptador que devolviera un UUID inventado convertiría un problema
 * comercial —«todavía no timbramos»— en un problema legal del cliente, que
 * creería tener un comprobante fiscal donde no hay ninguno.
 */
@Injectable()
export class NullCfdiProvider implements CfdiProvider {
  descriptor(): CfdiProviderDescriptor {
    return { name: 'null', mode: 'manual', available: false };
  }

  issue(): Promise<CfdiIssuanceResult> {
    return Promise.resolve({
      kind: 'manual',
      reason:
        'Sin PAC contratado: los datos fiscales quedan capturados y validados, ' +
        'y el CFDI lo emite el equipo con ellos. El producto no timbra todavía.',
    });
  }
}

export class CfdiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CfdiConfigurationError';
  }
}

/** Variables que declaran un PAC. O están TODAS, o no está ninguna. */
const PAC_VARIABLES = [
  'CFDI_PAC_NAME',
  'CFDI_PAC_API_KEY',
  'CFDI_ISSUER_RFC',
  'CFDI_ISSUER_TAX_REGIME',
] as const;

export interface CfdiConfiguration {
  readonly pacName: string;
  readonly apiKey: string;
  readonly issuerRfc: string;
  readonly issuerTaxRegime: string;
}

/**
 * Configuración del PAC, o null si el despliegue no la trae.
 *
 * Misma regla rígida que `resolveStripeConfiguration`: una configuración a
 * medias no arranca. Un despliegue con la clave del PAC pero sin el RFC del
 * emisor timbraría a nombre de nadie; uno con el RFC pero sin clave creería
 * que factura y no facturaría.
 *
 * Y hay un tercer caso que aquí SÍ se hace explícito: configuración completa
 * sin adaptador implementado. Mientras el dueño no elija PAC no existe código
 * que hable con ninguno, así que declarar las variables debe FALLAR AL
 * ARRANCAR con un mensaje que lo diga, no arrancar en modo manual fingiendo
 * que la configuración se aplicó. El día que haya PAC, el adaptador real se
 * enchufa detrás de este puerto y este error desaparece.
 */
export function resolveCfdiConfiguration(
  environment: NodeJS.ProcessEnv,
): CfdiConfiguration | null {
  const values = PAC_VARIABLES.map((name) => environment[name]?.trim() ?? '');
  const declared = values.filter((value) => value.length > 0);
  if (declared.length === 0) return null;
  if (declared.length < PAC_VARIABLES.length) {
    throw new CfdiConfigurationError(
      `Configuración de PAC incompleta: ${PAC_VARIABLES.join(', ')} son ` +
        'obligatorias juntas. Sin las cuatro, deja las cuatro vacías y el ' +
        'producto seguirá capturando datos fiscales con emisión manual.',
    );
  }
  const [pacName, apiKey, issuerRfc, issuerTaxRegime] = values;
  return { pacName, apiKey, issuerRfc, issuerTaxRegime };
}
