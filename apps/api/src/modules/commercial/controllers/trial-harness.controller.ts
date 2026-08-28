import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, NotFoundException, Post, Req } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
import { Subscription } from '../entities/commercial.entities';

class ExpireTrialBody {
  @IsUUID()
  organizationId!: string;
}

/**
 * ARNÉS DE PRUEBAS: vencer una prueba sin esperar tres meses.
 *
 * ─── Por qué hace falta ────────────────────────────────────────────────────
 *
 * La regla de oro del lanzamiento —los datos del usuario JAMÁS quedan
 * rehenes— sólo se puede demostrar de verdad el día 91: con la prueba
 * vencida, el arquitecto entra, ve sus documentos y los exporta, y lo único
 * que no puede es editar. Esa afirmación está probada contra PostgreSQL en
 * `auth/guards/entitlement-read-only.pg.spec.ts`, pero la Jornada Real
 * (`e2e/real/jornada-real.spec.ts`) la necesita de PUNTA A PUNTA: con el
 * navegador, la web compilada, la API y la base reales.
 *
 * Sin este endpoint, la única forma de ejercitarlo en un E2E sería falsear el
 * reloj o escribir en la base por un canal lateral — es decir, dejar de probar
 * el producto. Adelantar la fecha de fin en la fila REAL y dejar que el guard
 * decida es lo más parecido a que pasen tres meses.
 *
 * ─── Por qué es seguro ─────────────────────────────────────────────────────
 *
 * Las mismas cuatro guardas que el capturador de correo del arnés, que llevan
 * en producción desde la campaña de identidad:
 *
 *   1. `NODE_ENV=production` lo apaga entero;
 *   2. exige `IDENTITY_TEST_HARNESS=true`, que producción no pone;
 *   3. exige una clave de 32 caracteres como mínimo;
 *   4. la compara en tiempo constante.
 *
 * Y cuando cualquiera falla responde 404, no 401: un 401 confirmaría que la
 * ruta existe. Sólo ACORTA una vigencia —jamás la extiende ni concede nada—,
 * así que su peor abuso imaginable es quitarle acceso de escritura a una
 * organización que ya tiene los cuatro secretos del arnés.
 */
@Public()
@Controller('_development/expire-trial')
export class TrialHarnessController {
  constructor(private readonly db: DataSource) {}

  @Post()
  async expire(@Body() body: ExpireTrialBody, @Req() request: Request) {
    assertHarnessAccess(request);
    const repository = this.db.getRepository(Subscription);
    const subscription = await repository.findOneBy({
      organizationId: body.organizationId,
      tenantId: body.organizationId,
    });
    if (!subscription) throw new NotFoundException();

    // Ayer, no «ahora»: un vencimiento exactamente en el instante de la
    // consulta deja el resultado a merced de qué comparación corre primero.
    const yesterday = new Date(Date.now() - 86_400_000);
    await repository.update(
      { organizationId: body.organizationId, tenantId: body.organizationId },
      { trialEndsAt: yesterday, currentPeriodEnd: yesterday },
    );
    return {
      organizationId: body.organizationId,
      trialEndsAt: yesterday.toISOString(),
    };
  }
}

function assertHarnessAccess(request: Request): void {
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

function constantTimeEqual(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
