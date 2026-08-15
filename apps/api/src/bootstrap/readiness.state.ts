import { Injectable } from '@nestjs/common';

/**
 * Estado de ADMISIÓN del proceso: ¿debe el balanceador seguir mandando
 * tráfico a esta réplica?
 *
 * Existe porque liveness y readiness responden preguntas distintas y
 * confundirlas rompe los despliegues:
 *
 *   · liveness  (`GET /health`)       → «el proceso vive». Si falla, el
 *     supervisor MATA el contenedor.
 *   · readiness (`GET /health/ready`) → «puedo atender». Si falla, el
 *     balanceador SACA la instancia de rotación y la deja viva.
 *
 * Durante un apagado ordenado hace falta exactamente lo segundo: el proceso
 * sigue sirviendo lo que ya aceptó, pero deja de recibir peticiones nuevas.
 * Sin este estado, la secuencia real de un `docker stop` es: el balanceador
 * sigue enrutando (su último health check fue hace segundos y salió 200), el
 * proceso cierra el listener, y esas peticiones se convierten en 502 para el
 * usuario. El drenaje no es cortesía: es la diferencia entre un despliegue
 * invisible y una ráfaga de errores en cada release.
 */
@Injectable()
export class ReadinessState {
  private draining = false;
  private drainingSince: Date | null = null;

  /**
   * Marca el inicio del drenaje. Idempotente a propósito: SIGTERM y SIGINT
   * pueden llegar juntos (Ctrl-C en un shell que además reenvía la señal) y
   * el instante de inicio debe ser el PRIMERO, no el último.
   */
  startDraining(now: Date = new Date()): void {
    if (this.draining) return;
    this.draining = true;
    this.drainingSince = now;
  }

  get isDraining(): boolean {
    return this.draining;
  }

  /** Instante en que empezó el drenaje, para el cuerpo del 503. */
  get since(): Date | null {
    return this.drainingSince;
  }
}
