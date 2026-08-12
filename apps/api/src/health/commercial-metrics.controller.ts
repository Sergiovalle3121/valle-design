import { Controller, Get } from '@nestjs/common';
import { Public } from '../modules/auth/decorators/public.decorator';
import { CommercialTelemetryService } from '../modules/commercial/commercial-telemetry.service';

/**
 * Métricas operativas del RUNBOOK (backlog/edad del outbox, filas dead,
 * latencia del webhook, 401/403/409/429 por patrón de ruta).
 *
 * Público como los probes de /health: el cuerpo consiste exclusivamente en
 * contadores agregados y patrones de ruta — sin correos, tokens, cuerpos CAD,
 * tenant IDs, firmas ni texto de error del proveedor (la interfaz del
 * observer y el middleware lo garantizan aguas arriba, no este controller).
 */
@Controller()
export class CommercialMetricsController {
  constructor(private readonly telemetry: CommercialTelemetryService) {}

  @Public()
  @Get('health/metrics/commercial')
  metrics() {
    return this.telemetry.snapshot();
  }
}
