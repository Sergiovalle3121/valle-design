/**
 * QUIÉN PUEDE VER LOS COMENTARIOS DE TODOS.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * El producto no tiene —ni debe tener— un rol de «superadministrador» en la
 * base de datos. Sus cuatro papeles (propietario, administrador, miembro,
 * observador) son POR ORGANIZACIÓN, y esa frontera es la que protege el plano
 * de un despacho del de otro. Meter un quinto rol global la agujerearía para
 * siempre y para todo, a cambio de una pantalla.
 *
 * ── LA SOLUCIÓN, Y SU PRECIO ────────────────────────────────────────────────
 * Una lista de correos en configuración, fuera de la base de datos:
 * `PRODUCT_OPERATOR_EMAILS=sergio@…,soporte@…`. Ventajas reales:
 *
 *   · No añade nada al modelo de permisos, así que no puede filtrarse a otras
 *     rutas por accidente.
 *   · No se puede conceder desde dentro del producto: hace falta acceso al
 *     despliegue, que es exactamente el listón que debe tener.
 *   · Falla CERRADO. Sin la variable no hay operadores y el panel devuelve 403 a
 *     todo el mundo, incluido quien lo escribió.
 *
 * El precio, dicho sin adornos: cambiar quién opera exige reiniciar el proceso.
 * Para una lista de una a tres personas es el intercambio correcto.
 */

/** Normaliza como lo hace identidad: sin espacios y en minúsculas. */
function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Forma mínima de un correo: algo, una arroba, algo con un punto.
 *
 * No pretende validar direcciones —eso no lo hace bien ninguna expresión
 * regular— sino descartar la basura de una lista mal escrita. La primera
 * versión sólo pedía que la cadena contuviera una arroba, y su propia prueba
 * demostró que entonces `@` a secas entraba en la lista de operadores. Una
 * entrada inútil no abre ninguna puerta, pero una lista que acepta basura es
 * una lista en la que no se puede confiar al leerla.
 */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function productOperatorEmails(
  environment: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = environment.PRODUCT_OPERATOR_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(normalizar)
      .filter((email) => FORMA_DE_CORREO.test(email)),
  );
}

/** ¿Este correo opera el producto? Sin lista configurada, nadie. */
export function isProductOperator(
  email: string | null | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!email) return false;
  return productOperatorEmails(environment).has(normalizar(email));
}
