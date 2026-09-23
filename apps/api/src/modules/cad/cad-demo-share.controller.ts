import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import { CadDemoShareService } from './cad-demo-share.service';
import { CreateCadDemoShareDto } from './dto/cad-demo-share.dto';

/** Anonymous /demo may publish a short-lived, read-only copy through the review model. */
@Controller('v1/cad/demo-shares')
export class CadDemoShareController {
  constructor(
    private readonly rateLimits: ApiRateLimitService,
    private readonly shares: CadDemoShareService,
  ) {}

  @Post()
  @Public()
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: Request, @Body() dto: CreateCadDemoShareDto) {
    const ip = request.ip || 'unknown';
    await this.rateLimits.enforce(
      'cad.demo.share.ip.minute',
      [ip],
      API_RATE_LIMITS.demoSharesPerIpPerMinute,
    );
    await this.rateLimits.enforceWindow(
      'cad.demo.share.ip.day',
      [ip],
      API_RATE_LIMITS.demoSharesPerIpPerDay,
      24 * 60 * 60_000,
    );
    await this.rateLimits.enforceWindow(
      'cad.demo.share.global.day',
      ['all'],
      API_RATE_LIMITS.demoSharesGlobalPerDay,
      24 * 60 * 60_000,
    );
    return this.shares.create(dto.document);
  }
}
