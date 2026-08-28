import { isProductOperator, productOperatorEmails } from './product-operators';

/**
 * La puerta al panel del dueño. Se prueba con la misma desconfianza con la que
 * se probaría un guard: lo que importa no es que deje pasar a quien debe, sino
 * que NO deje pasar a nadie más — y, sobre todo, que sin configurar no deje
 * pasar a nadie en absoluto.
 */
describe('operadores del producto', () => {
  it('sin la variable configurada, NADIE opera', () => {
    // Falla cerrado. Es la aserción más importante del archivo: un despliegue
    // que olvide la variable no puede acabar con el panel abierto.
    expect(productOperatorEmails({}).size).toBe(0);
    expect(isProductOperator('sergio@ejemplo.mx', {})).toBe(false);
    expect(
      isProductOperator('sergio@ejemplo.mx', { PRODUCT_OPERATOR_EMAILS: '' }),
    ).toBe(false);
    expect(
      isProductOperator('sergio@ejemplo.mx', {
        PRODUCT_OPERATOR_EMAILS: '   ',
      }),
    ).toBe(false);
  });

  it('reconoce a quien está en la lista, sin importar espacios ni mayúsculas', () => {
    const env = {
      PRODUCT_OPERATOR_EMAILS: ' Sergio@Ejemplo.MX , soporte@ejemplo.mx ',
    };
    expect(isProductOperator('sergio@ejemplo.mx', env)).toBe(true);
    expect(isProductOperator('  SERGIO@EJEMPLO.MX  ', env)).toBe(true);
    expect(isProductOperator('soporte@ejemplo.mx', env)).toBe(true);
  });

  it('no reconoce a quien no está', () => {
    const env = { PRODUCT_OPERATOR_EMAILS: 'sergio@ejemplo.mx' };
    expect(isProductOperator('otro@ejemplo.mx', env)).toBe(false);
    expect(isProductOperator('sergio@otro.mx', env)).toBe(false);
    // Ni por prefijo ni por sufijo: la comparación es exacta.
    expect(isProductOperator('sergio@ejemplo.mx.attacker.com', env)).toBe(
      false,
    );
    expect(isProductOperator('nosergio@ejemplo.mx', env)).toBe(false);
    expect(isProductOperator(null, env)).toBe(false);
    expect(isProductOperator(undefined, env)).toBe(false);
    expect(isProductOperator('', env)).toBe(false);
  });

  it('descarta entradas que no son correos', () => {
    // Una lista mal escrita no puede convertirse en una entrada válida.
    // Esta prueba encontró un defecto real en el primer corte: el filtro sólo
    // pedía que la cadena contuviera una arroba, así que `@` a secas entraba en
    // la lista. No abría ninguna puerta —nadie tiene ese correo— pero una lista
    // que acepta basura es una lista en la que no se puede confiar al leerla.
    const env = {
      PRODUCT_OPERATOR_EMAILS: 'sergio, ,@,@ejemplo.mx,a@b,sergio@ejemplo.mx',
    };
    expect([...productOperatorEmails(env)]).toEqual(['sergio@ejemplo.mx']);
    expect(isProductOperator('sergio', env)).toBe(false);
    expect(isProductOperator('@', env)).toBe(false);
  });
});
