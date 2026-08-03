import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, NotFoundException, Query, Req } from '@nestjs/common';
import { IsEmail, IsOptional, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { IsNull } from 'typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
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
    this.assertHarnessAccess(request);
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

  private assertHarnessAccess(request: Request): void {
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
}

function constantTimeEqual(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
