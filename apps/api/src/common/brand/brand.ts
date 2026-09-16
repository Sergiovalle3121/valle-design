import { resolveBrandManifest } from '@valle-design/contracts';

/**
 * EL MANIFIESTO DE MARCA, resuelto una vez para la API.
 *
 * Es el mismo resolvedor que usa la web (`apps/web/src/config/brand.ts`),
 * leyendo las variables `BRAND_*` del proceso. Antes, cuatro sitios de la API
 * escribían «Valle Design» a mano —los asuntos de correo, el emisor MFA que
 * ve el cliente en su aplicación de autenticación, el concepto de la factura
 * CFDI y el mensaje del trial— y el rebranding del manifiesto no llegaba a
 * ninguno. Un nombre de producto escrito en un `const` local es una promesa
 * de que nadie lo cambiará nunca, y acaba de cambiar.
 */
export const BRAND = resolveBrandManifest(process.env);

/** Nombre visible del producto (`design`), tal como debe salir en correos y facturas. */
export const PRODUCT_DISPLAY_NAME = BRAND.productNames.design;
