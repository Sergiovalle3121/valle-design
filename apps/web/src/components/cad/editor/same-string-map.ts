/**
 * ¿Dos mapas de cadenas por objeto tienen el MISMO contenido?
 *
 * Sirve para no disparar un re-render cuando una restauración devuelve lo que
 * ya había. Comparación superficial y suficiente: los valores son cadenas.
 */
export function sameStringMap(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}
