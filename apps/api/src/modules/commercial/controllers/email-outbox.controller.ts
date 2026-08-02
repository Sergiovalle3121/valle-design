import { Controller, Get, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EmailOutbox } from '../entities/commercial.entities';
@Controller('_development/email-outbox')
export class EmailOutboxController {
  constructor(private readonly db: DataSource) {}
  @Get() async list() {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.db
      .getRepository(EmailOutbox)
      .find({
        where: { status: 'pending' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
  }
}
