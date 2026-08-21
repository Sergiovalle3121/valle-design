import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../modules/auth/decorators/public.decorator';
import { evaluateMetricsAccess } from '../observability/metrics-access';
import { CommercialTelemetryService } from '../modules/commercial/commercial-telemetry.service';

/**
 * Métricas operativas del RUNBOOK (backlog/edad del outbox, filas dead,
 * latencia del webhook, 401/403/409/429 por patrón de ruta), en JSON para una
 * persona con `curl` durante un incidente.
 *
 * Protegido con el MISMO bearer que `GET /metrics` (`METRICS_TOKEN`, mismas
 * semánticas 404/401). Fue público «como los probes de /health», pero no es
 * un probe: consulta la base en cada petición (COUNT sobre las dos colas del
 * outbox) y publica el mapa de carga y de rutas del despliegue. Eso es
 * amplificación de DoS gratis y reconocimiento para quien busca por dónde
 * apretar — los probes de vida (`/health`) siguen públicos, esto no.
 *
 * `@Public()` sólo salta el guard de SESIÓN (quien consulta en un incidente
 * no tiene cookie ni CSRF): la autorización la resuelve el bearer dedicado.
 */
@Controller()
export class CommercialMetricsController {
  constructor(private readonly telemetry: CommercialTelemetryService) {}

  @Public()
  @Get('health/metrics/commercial')
  @Header('Cache-Control', 'no-store')
  metrics(@Req() request: Request) {
    const access = evaluateMetricsAccess(
      process.env.METRICS_TOKEN,
      request.headers.authorization,
    );
    if (access === 'disabled') {
      throw new NotFoundException({
        statusCode: 404,
        message:
          'El endpoint de metricas esta desactivado: define METRICS_TOKEN (>=16 caracteres) para habilitarlo.',
      });
    }
    if (access === 'unauthorized') {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Se requiere Authorization: Bearer <METRICS_TOKEN>.',
      });
    }
    return this.telemetry.snapshot();
  }
}
