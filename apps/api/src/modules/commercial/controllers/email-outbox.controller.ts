import { Controller, Get, NotFoundException, Query, Req } from '@nestjs/common';
import { IsEmail, IsOptional, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { IsNull } from 'typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
import { assertHarnessAccess } from './harness-access';
import { EmailOutbox } from '../entities/commercial.entities';

class EmailHarnessQuery {
  @IsEmail()
  @MaxLength(254)
  recipient!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

/**
 * Test-only email capture. It never enumerates the outbox: callers must know
 * the exact recipient and, for organization-scoped mail, the exact tenant.
 */
@Public()
@Controller('_development/email-outbox')
export class EmailOutboxController {
  constructor(private readonly db: DataSource) {}

  @Get()
  async latest(@Query() query: EmailHarnessQuery, @Req() request: Request) {
    assertHarnessAccess(request);
    const recipient = query.recipient.trim().toLowerCase();
    const row = await this.db.getRepository(EmailOutbox).findOne({
      where: {
        recipient,
        tenantId: query.tenantId ?? IsNull(),
      },
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        template: true,
        payload: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }
}
