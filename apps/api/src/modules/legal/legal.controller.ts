import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/unique-violation';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.types';
import { Public } from '../auth/decorators/public.decorator';
import { LegalAcceptance } from './entities/legal-acceptance.entity';
import {
  isKnownLegalVersion,
  LEGAL_DOCUMENTS,
  type LegalDocumentId,
} from './legal-documents';

class AcceptLegalDocumentDto {
  @IsString()
  @IsIn(['terms', 'privacy'])
  document!: LegalDocumentId;

  /**
   * Versión EXACTA que el cliente dice haber mostrado. No se acepta «la
   * vigente»: si el usuario leyó una versión y el servidor registrara otra, el
   * registro afirmaría algo falso. Una versión desconocida es un 400 — señal
   * de que el cliente está desactualizado, no de que el usuario haya aceptado
   * algo.
   */
  @IsString()
  @MaxLength(40)
  version!: string;
}

/**
 * Documentos legales versionados y registro de aceptación.
 *
 * `GET /v1/legal/documents` es PÚBLICO: el web necesita saber qué versión
 * mostrar antes de que exista sesión (por ejemplo, en el registro).
 *
 * `POST /v1/legal/acceptances` exige sesión y organización activa. El actor y
 * el tenant salen de `req.user` —poblado por el guard desde datos verificados
 * por el servidor— y el instante lo pone la base. Nada de lo que acredita la
 * aceptación viene del cuerpo de la petición.
 */
@Controller('v1/legal')
export class LegalController {
  constructor(
    @InjectRepository(LegalAcceptance)
    private readonly acceptances: Repository<LegalAcceptance>,
  ) {}

  @Public()
  @Get('documents')
  documents() {
    return { documents: LEGAL_DOCUMENTS };
  }

  @Get('acceptances')
  async list(@Req() request: Request) {
    const user = this.requireUser(request);
    const rows = await this.acceptances.find({
      where: { tenantId: user.tenantId, userId: user.userId },
      order: { acceptedAt: 'DESC' },
    });
    return {
      acceptances: rows.map((row) => ({
        document: row.document,
        version: row.version,
        acceptedAt: row.acceptedAt,
      })),
    };
  }

  @Post('acceptances')
  async accept(@Req() request: Request, @Body() body: AcceptLegalDocumentDto) {
    const user = this.requireUser(request);
    if (!isKnownLegalVersion(body.document, body.version)) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Version de documento legal desconocida. Vuelve a leer GET /v1/legal/documents: ' +
          'registrar una aceptacion contra un texto que no existe no acredita nada.',
      });
    }

    const record = this.acceptances.create({
      tenantId: user.tenantId,
      organizationId: user.tenantId,
      userId: user.userId,
      document: body.document,
      version: body.version,
      acceptedAt: new Date(),
    });

    try {
      await this.acceptances.insert(record);
    } catch (error) {
      // Aceptar dos veces la MISMA versión es idempotente: el índice único lo
      // impide y aquí se traduce a éxito. Un 409 obligaría al cliente a
      // distinguir «ya aceptado» de «error», y ambos significan lo mismo para
      // el usuario: el consentimiento está registrado.
      if (!isUniqueViolation(error)) throw error;
    }

    return {
      document: body.document,
      version: body.version,
      registered: true,
    };
  }

  /**
   * Identidad verificada + organización activa. Sin organización no hay tenant
   * al que atribuir el registro, y una aceptación sin tenant es una fila que
   * ninguna consulta con alcance encontrará jamás.
   */
  private requireUser(request: Request): {
    userId: string;
    tenantId: string;
  } {
    const user = (request as Request & { user?: AuthenticatedUser }).user;
    if (!user?.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Se requiere una sesion activa.',
      });
    }
    const tenantId = user.tenant_id ?? user.organization_id;
    if (!tenantId) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Se requiere una organizacion activa para registrar la aceptacion.',
      });
    }
    return { userId: user.userId, tenantId };
  }
}
