import {
  DEFAULT_BRAND_MANIFEST,
  productDisplayName,
} from '@valle-design/contracts';
import { resolveProductBrand } from './product-brand';

describe('resolveProductBrand', () => {
  it('sin variables firma con el manifiesto por defecto y sin buzón', () => {
    // El valor lo decide el manifiesto de contracts, no esta API.
    expect(resolveProductBrand({})).toEqual({
      productName: productDisplayName(DEFAULT_BRAND_MANIFEST, 'design'),
      supportEmail: null,
    });
  });

  it('BRAND_PRODUCT_NAME_DESIGN manda sobre BRAND_NAME, sin prefijo NEXT_PUBLIC_', () => {
    expect(
      resolveProductBrand({
        BRAND_NAME: 'VALLECAD',
        BRAND_PRODUCT_NAME_DESIGN: 'VALLECAD',
        NEXT_PUBLIC_BRAND_PRODUCT_NAME_DESIGN: 'Otro',
      }).productName,
    ).toBe('VALLECAD');
  });

  it('el buzón sale de BRAND_SUPPORT_EMAIL, con SUPPORT_EMAIL de respaldo, y nunca un marcador .invalid', () => {
    expect(
      resolveProductBrand({
        BRAND_SUPPORT_EMAIL: ' soporte@vallecad.example ',
        SUPPORT_EMAIL: 'buzon@vallecad.example',
      }).supportEmail,
    ).toBe('soporte@vallecad.example');
    expect(
      resolveProductBrand({ SUPPORT_EMAIL: 'buzon@vallecad.example' })
        .supportEmail,
    ).toBe('buzon@vallecad.example');
    expect(
      resolveProductBrand({ BRAND_SUPPORT_EMAIL: 'support@example.invalid' })
        .supportEmail,
    ).toBeNull();
  });
});
