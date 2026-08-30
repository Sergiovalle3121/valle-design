import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { constantTimeEqual } from '../../../common/security/constant-time';

/**
 * La puerta común de los arneses de prueba (`_development/*`). Cuatro
 * condiciones y todas fallan cerradas con 404 —no 401, que confirmaría que la
 * ruta existe—: fuera de producción, arnés encendido por bandera explícita,
 * clave configurada de al menos 32 caracteres y clave presentada igual en
 * tiempo constante.
 *
 * Vivía copiada en cada controller de arnés, y las copias comparaban con un
 * corto circuito por longitud que filtraba cuántos caracteres tiene la clave.
 * Una sola puerta, la comparación canónica, y los controllers la importan.
 */
export function assertHarnessAccess(request: Request): void {
  const expected = process.env.IDENTITY_TEST_HARNESS_KEY ?? '';
  const supplied = request.header('x-valle-test-harness') ?? '';
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.IDENTITY_TEST_HARNESS !== 'true' ||
    expected.length < 32 ||
    !constantTimeEqual(expected, supplied)
  ) {
    throw new NotFoundException();
  }
}
