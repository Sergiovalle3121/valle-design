import {
  productDisplayName,
  resolveBrandManifest,
  type BrandEnv,
} from '@valle-design/contracts';

/**
 * La marca que la API enseña al usuario: el nombre que firma los correos y
 * el emisor que ve en su aplicación de autenticación, y el buzón de soporte
 * que se muestra en el pie.
 *
 * Misma fuente de verdad que el web: el manifiesto de `@valle-design/contracts`
 * resuelto con `BRAND_*` (aquí SIN el prefijo `NEXT_PUBLIC_`, que es cosa del
 * bundler del navegador). Antes el nombre estaba escrito a mano en las
 * plantillas («Valle Design») y ningún cliente de un despliegue llamado
 * VALLECAD debía ver ese nombre en su bandeja.
 */
export interface ProductBrand {
  productName: string;
  supportEmail: string | null;
}

const PLACEHOLDER_DOMAIN = /@[^@\s]*\.invalid$/iu;

export function resolveProductBrand(env: BrandEnv): ProductBrand {
  const manifest = resolveBrandManifest(env);
  // `BRAND_SUPPORT_EMAIL` es el buzón de marca; `SUPPORT_EMAIL` es el buzón
  // que recibe comentarios e incidentes y vale como respaldo. El default del
  // manifiesto (`support@example.invalid`) es un marcador, no un buzón: no se
  // enseña.
  const candidate =
    env.BRAND_SUPPORT_EMAIL?.trim() || env.SUPPORT_EMAIL?.trim() || '';
  const supportEmail =
    candidate.length > 0 && !PLACEHOLDER_DOMAIN.test(candidate)
      ? candidate
      : manifest.supportEmail && !PLACEHOLDER_DOMAIN.test(manifest.supportEmail)
        ? manifest.supportEmail
        : null;
  return {
    productName: productDisplayName(manifest, 'design'),
    supportEmail,
  };
}

/** Nombre del producto para mensajes de consola y cabeceras. */
export const PRODUCT_DISPLAY_NAME = resolveProductBrand(process.env).productName;
