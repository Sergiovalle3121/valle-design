import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../auth/decorators/public.decorator';
import {
  CadDemoShareService,
  DEMO_SHARE_MAX_GZIP_BYTES,
} from './cad-demo-share.service';

export const DEMO_SHARE_TOKEN_HEADER = 'x-demo-share-token';
export const DEMO_SHARE_MANAGE_TOKEN_HEADER = 'x-demo-share-manage-token';

function clientIp(request: Request): string {
  // `trust proxy` = 1 en main.ts: `req.ip` es la IP del cliente detrás del
  // proxy de la plataforma, no la del proxy. Nunca se guarda: sólo alimenta la
  // clave HMAC opaca del límite de creación.
  return request.ip || request.socket.remoteAddress || 'desconocida';
}

/**
 * `/v1/cad/demo-shares` — el enlace temporal de la demostración, SIN cuenta.
 * Ver `CadDemoShareService` para el diseño completo. Las tres rutas son
 * públicas a propósito: quien las llama no tiene sesión. Ninguna toca datos
 * de una organización: la copia vive en `cad_demo_shares`, fuera de todo
 * tenant, y la única ruta que cruza a un tenant —reclamar— vive aparte y
 * exige sesión, CSRF y `cad:review` (`CadDemoShareClaimController`).
 */
@Controller('v1/cad/demo-shares')
export class CadDemoShareController {
  constructor(private readonly demoShares: CadDemoShareService) {}

  @Post()
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: DEMO_SHARE_MAX_GZIP_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 1_024,
      },
    }),
  )
  async create(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { name?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException(
        'El plano comprimido (file) es obligatorio.',
      );
    }
    return this.demoShares.create(file.buffer, body?.name, clientIp(request));
  }

  @Get('context')
  @Public()
  async context(
    @Req() request: Request,
    @Headers(DEMO_SHARE_TOKEN_HEADER) token: string | undefined,
  ) {
    return this.demoShares.redeem(token, clientIp(request));
  }

  @Delete('context')
  @Public()
  @HttpCode(204)
  async remove(
    @Headers(DEMO_SHARE_MANAGE_TOKEN_HEADER) manageToken: string | undefined,
  ): Promise<void> {
    await this.demoShares.remove(manageToken);
  }
}
