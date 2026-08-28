import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  API_RATE_LIMITS,
  ApiRateLimitService,
} from '../identity/api-rate-limit.service';
import {
  CreateFeedbackDto,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  UpdateFeedbackStatusDto,
} from './feedback.dto';
import { FeedbackService } from './feedback.service';
import { isProductOperator } from './product-operators';
import type {
  FeedbackKind,
  FeedbackStatus,
  ProductFeedback,
} from './entities/feedback.entity';

/**
 * EL CENTRO DE COMENTARIOS.
 *
 * ── QUÉ ES Y EN QUÉ SE DIFERENCIA DEL BOTÓN DE INCIDENTES ───────────────────
 * `/v1/support/incidents` manda un correo y se olvida: sirve para «algo se
 * rompió, mírenlo hoy». Esto otro GUARDA, y la diferencia que importa para
 * quien escribe es que hay vuelta — su comentario tiene estado y él lo ve.
 * Saber que alguien leyó lo que escribiste es la mitad de lo que pides cuando
 * te tomas la molestia de escribir, y un canal sin esa mitad se queda vacío
 * solo.
 *
 * ── PERMISOS ────────────────────────────────────────────────────────────────
 * Escribir y leer lo propio: `cad:view`, el más bajo que existe. A propósito.
 * Quien está en solo-lectura tras vencer su periodo gratuito —o quien mira un
 * plano compartido— es exactamente quien más necesita poder decir que algo no
 * funciona; exigir permiso de edición para quejarse es cerrarle la puerta al
 * comentario más valioso.
 *
 * Leer lo de TODOS y cambiar estados: sólo operadores del producto, contra la
 * lista de `PRODUCT_OPERATOR_EMAILS`. Ver `product-operators.ts` para por qué
 * es configuración y no un rol en la base de datos.
 */
@Controller('v1/feedback')
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly rateLimits: ApiRateLimitService,
  ) {}

  private actor(request: Request) {
    // `userId`, NO `id`. Lo que el guard adjunta es un `AuthenticatedUser`
    // (ver cad-auth.guard.ts), cuyo campo se llama `userId`; leer `id` devolvía
    // `undefined` siempre y el actor viajaba con el autor en cadena vacía.
    // No era cosmético: la columna es `uuid NOT NULL` con clave foránea, así
    // que PostgreSQL rechazaba la cadena vacía y CADA envío de comentario
    // respondía 500. Las pruebas no lo vieron porque llaman al servicio
    // directamente, con un id válido en la mano; la de más abajo entra por
    // donde entra el navegador.
    const user = (
      request as Request & {
        user?: {
          userId?: string;
          email?: string;
          organization_id?: string | null;
        };
      }
    ).user;
    return {
      userId: user?.userId ?? '',
      email: user?.email ?? '',
      organizationId: user?.organization_id ?? null,
    };
  }

  /** El operador o un 403. Se comprueba en UN sitio y se reutiliza. */
  private assertOperator(request: Request): void {
    const { email } = this.actor(request);
    if (!isProductOperator(email)) {
      throw new ForbiddenException({
        code: 'not_a_product_operator',
        message: 'Esta vista es para quien opera el producto.',
      });
    }
  }

  /**
   * La forma que sale al navegador.
   *
   * `context` NO viaja de vuelta al autor aunque él lo enviara: es información
   * de diagnóstico para quien lee, y devolverla sólo añadiría superficie sin
   * responder ninguna pregunta que el autor se haga.
   */
  private toPublic(row: ProductFeedback) {
    return {
      id: row.id,
      kind: row.kind,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Post()
  @RequirePermissions('cad:view')
  async create(@Body() dto: CreateFeedbackDto, @Req() request: Request) {
    const actor = this.actor(request);
    await this.rateLimits.enforce(
      'product-feedback',
      [actor.email || actor.userId],
      API_RATE_LIMITS.supportIncidentsPerAccount,
    );
    const guardado = await this.feedback.create(dto, actor);
    return this.toPublic(guardado);
  }

  @Get('mine')
  @RequirePermissions('cad:view')
  async mine(@Req() request: Request) {
    const { userId } = this.actor(request);
    const items = await this.feedback.listForUser(userId);
    return { items: items.map((row) => this.toPublic(row)) };
  }

  /**
   * TODOS los comentarios, de todas las organizaciones. Es la materia prima del
   * backlog real y por eso cruza la frontera de inquilino que el resto del
   * producto respeta a rajatabla — con la puerta más estrecha que existe aquí.
   */
  @Get()
  @RequirePermissions('cad:view')
  async all(
    @Req() request: Request,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    this.assertOperator(request);
    const items = await this.feedback.listAll({
      // Un filtro que no se reconoce se IGNORA en vez de fallar: la vista se
      // usa con la barra de direcciones a mano y un 400 por una errata en un
      // parámetro opcional es hostilidad gratuita.
      status: FEEDBACK_STATUSES.includes(status as FeedbackStatus)
        ? (status as FeedbackStatus)
        : undefined,
      kind: FEEDBACK_KINDS.includes(kind as FeedbackKind)
        ? (kind as FeedbackKind)
        : undefined,
    });
    return {
      items: items.map((row) => ({
        ...this.toPublic(row),
        authorEmail: row.authorEmail,
        organizationId: row.organizationId,
        context: row.context,
      })),
    };
  }

  @Patch(':feedbackId')
  @RequirePermissions('cad:view')
  async setStatus(
    @Param('feedbackId', new ParseUUIDPipe({ version: '4' }))
    feedbackId: string,
    @Body() dto: UpdateFeedbackStatusDto,
    @Req() request: Request,
  ) {
    this.assertOperator(request);
    const actualizado = await this.feedback.setStatus(feedbackId, dto.status);
    if (!actualizado) {
      throw new NotFoundException('Ese comentario no existe.');
    }
    return this.toPublic(actualizado);
  }
}
