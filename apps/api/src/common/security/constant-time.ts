import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * LA comparación de secretos en tiempo constante del servicio. Única a
 * propósito: el repositorio llegó a tener seis variantes y dos de ellas
 * (los arneses de prueba) hacían `left.length === right.length &&
 * timingSafeEqual(...)` — el corto circuito por longitud filtra por canal
 * temporal cuántos caracteres tiene el secreto, que es justo lo que la
 * comparación existe para no contar.
 *
 * La forma canónica compara los SHA-256 de ambos valores: longitud constante
 * siempre, sin rama dependiente del secreto, y acepta `unknown` para que un
 * llamador con un valor ausente falle cerrado en vez de lanzar.
 *
 * NO todo `timingSafeEqual` del servicio debe pasar por aquí: comparar dos
 * HMAC de longitud fija y pública (firmas de webhook en
 * `outbox-signature.ts` y `stripe-payment.provider.ts`) puede cortar por
 * longitud sin filtrar nada, porque la longitud del digest no es secreta.
 */
export function constantTimeEqual(left: unknown, right: unknown): boolean {
  const leftIsString = typeof left === 'string';
  const rightIsString = typeof right === 'string';
  const leftDigest = createHash('sha256')
    .update(leftIsString ? left : '')
    .digest();
  const rightDigest = createHash('sha256')
    .update(rightIsString ? right : '')
    .digest();

  const equal = timingSafeEqual(leftDigest, rightDigest);
  return leftIsString && rightIsString && equal;
}
