import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../modules/auth/decorators/public.decorator';
import { evaluateMetricsAccess } from '../observability/metrics-access';
import {
  Subscription,
  UsageLedger,
} from '../modules/commercial/entities/commercial.entities';
import { Organization } from '../modules/organizations/entities/organization.entity';

/**
 * TELEMETRÍA DE ACTIVACIÓN — la cifra que dice si la promoción funciona.
 *
 * La pregunta que responde es una sola y muy concreta: de la gente que se
 * registra, **¿cuánta llega a dibujar?** Sin ella, promocionar el producto es
 * gastar en anuncios y esperar. Con ella, un embudo roto se ve en un número en
 * vez de en la ausencia de clientes tres semanas después.
 *
 * ─── La decisión de diseño que lo hace aceptable ───────────────────────────
 *
 * **No añade ni una sola recolección de datos nueva.** Todo lo que publica se
 * DERIVA de filas que el producto ya escribe para operar:
 *
 *   · `organizations` — existe porque hay que resolver el tenant;
 *   · `subscriptions` — existe porque hay que decidir el entitlement;
 *   · `usage_ledger` — existe desde la ola comercial, con `design.document.saved`
 *     y `design.document.published`, y es lo que ya cuenta el uso para
 *     facturar.
 *
 * No hay evento nuevo, ni columna nueva, ni identificador nuevo, ni una sola
 * línea que se escriba «para analítica». Si mañana se retirase este endpoint,
 * el producto no dejaría de recoger absolutamente nada.
 *
 * ─── Y lo que NUNCA sale de aquí ───────────────────────────────────────────
 *
 * Ni contenido de planos, ni nombres de documentos o proyectos, ni correos, ni
 * identificadores de organización. Sólo CONTEOS agregados. Un endpoint de
 * activación que publicara qué dibuja cada despacho sería exactamente el tipo
 * de cosa que un arquitecto no perdona, y con razón.
 *
 * Está declarado en el aviso de privacidad; esa declaración y este archivo se
 * publicaron en el mismo cambio, a propósito.
 *
 * Protegido con el MISMO bearer que `/metrics` y `/health/metrics/commercial`
 * (`METRICS_TOKEN`, mismas semánticas 404/401): sin token configurado el
 * endpoint no existe.
 */
@Controller()
export class ActivationMetricsController {
  constructor(private readonly db: DataSource) {}

  @Public()
  @Get('health/metrics/activation')
  @Header('Cache-Control', 'no-store')
  async metrics(@Req() request: Request) {
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
    return this.snapshot();
  }

  /**
   * El embudo, en cuatro números y una tasa.
   *
   * `drew` cuenta organizaciones con al menos un `design.document.saved`: es
   * el momento en que alguien pasó de mirar a dibujar, que es la definición
   * operativa de «activado» para un CAD. `delivered` cuenta las que además
   * publicaron algo — entregar es la razón por la que existe el producto.
   */
  private async snapshot() {
    const organizations = await this.db.getRepository(Organization).count();
    const trialing = await this.db
      .getRepository(Subscription)
      .count({ where: { status: 'trialing' } });

    const distinctBy = async (metric: string): Promise<number> => {
      const row = await this.db
        .getRepository(UsageLedger)
        .createQueryBuilder('usage')
        .select('COUNT(DISTINCT usage.organizationId)', 'total')
        .where('usage.metric = :metric', { metric })
        .getRawOne<{ total: string }>();
      return Number(row?.total ?? 0);
    };

    const drew = await distinctBy('design.document.saved');
    const delivered = await distinctBy('design.document.published');

    return {
      // Qué se publica y qué NO, dicho en la propia respuesta: quien la lea en
      // un incidente no tiene por qué haber leído este archivo.
      alcance:
        'Conteos agregados derivados de datos que el producto ya guarda para operar. Sin contenido de planos, sin nombres, sin correos, sin identificadores.',
      organizaciones: organizations,
      enPrueba: trialing,
      /** Organizaciones que llegaron a guardar su primer dibujo. */
      dibujaron: drew,
      /** Organizaciones que además publicaron un entregable. */
      entregaron: delivered,
      /** Tasa de activación: de las que se registraron, cuántas dibujaron. */
      tasaDeActivacion:
        organizations > 0 ? Number((drew / organizations).toFixed(4)) : null,
      medidoEn: new Date().toISOString(),
    };
  }
}
