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
import { evaluateMetricsAccess } from './metrics-access';
import { MetricsGaugesProvider } from './metrics-gauges.provider';
import { MetricsRegistry } from './metrics.registry';

/**
 * `GET /metrics` en formato de exposición Prometheus.
 *
 * `@Public()` porque el guard de sesión no aplica a un scrapper: la
 * autorización la resuelve `evaluateMetricsAccess` con un bearer dedicado
 * (`METRICS_TOKEN`). Sin token configurado el endpoint **no existe** (404),
 * que es el estado por defecto del repo.
 *
 * Convive con `GET /health/metrics/commercial`, que sigue siendo el JSON del
 * RUNBOOK para una persona con `curl`. Este es el mismo material para una
 * máquina: mismas fuentes, distinto formato. Deliberadamente NO se elimina el
 * anterior — un runbook que exige montar Prometheus para responder «¿cuánto
 * backlog hay?» durante un incidente es un runbook peor.
 */
@Controller()
export class MetricsController {
  constructor(
    private readonly registry: MetricsRegistry,
    private readonly gauges: MetricsGaugesProvider,
  ) {}

  @Public()
  @Get('metrics')
  // `version=0.0.4` es lo que el scrapper negocia; sin él algunos agentes
  // tratan el cuerpo como texto plano opaco y no parsean nada.
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async metrics(@Req() request: Request): Promise<string> {
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
    return this.registry.render(await this.gauges.collect());
  }
}
