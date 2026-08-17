import {
  Controller,
  Get,
  Header,
  Inject,
  Logger,
  Optional,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsString, Matches } from 'class-validator';
import { In, Repository } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';
import { PlanCatalog, PlanPrice } from '../entities/commercial.entities';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../ports/payment-provider.port';

/**
 * Reloj inyectable SÓLO para poder probar la expiración de la caché sin
 * dormir un minuto en la suite. En producción nadie lo provee y cae a
 * `Date.now`.
 */
export const PUBLIC_CATALOG_CLOCK = Symbol('PUBLIC_CATALOG_CLOCK');

/**
 * Ventana de caché del catálogo público.
 *
 * Un precio cambia como mucho unas cuantas veces al año y lo hace por
 * migración revisada; un visitante anónimo, en cambio, puede llegar en
 * avalancha desde un buscador. Servir cada visita con dos consultas a
 * PostgreSQL convierte el éxito de marketing en carga de base de datos sin
 * ninguna contrapartida. Sesenta segundos es el compromiso: un cambio de
 * precio se ve en menos de lo que tarda un despliegue, y el coste por
 * visitante tiende a cero.
 *
 * Se prefiere caché a limitar por IP a propósito: un rate limiter en la
 * página de precios castigaría justo el tráfico que queremos.
 */
const CATALOG_CACHE_TTL_MS = 60_000;

/** Tope de monedas cacheadas a la vez; al superarlo la caché se vacía entera. */
const MAX_CACHED_CURRENCIES = 32;

/**
 * Moneda en mayúsculas y exactamente tres letras: se rechaza `mxn` en vez de
 * normalizarlo porque un cliente que manda minúsculas está saltándose el
 * contrato, y aceptarlo en silencio multiplica las claves de caché.
 */
class PublicCatalogQuery {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

/** Vista pública de un precio: céntimos enteros, sin fechas ni identificadores. */
interface PublicPlanPriceView {
  currency: string;
  period: string;
  amountCents: number;
}

interface PublicPlanView {
  code: string;
  name: string;
  kind: 'trial' | 'paid';
  perSeat: boolean;
  seatsMinimum: number;
  taxIncluded: boolean;
  prices: PublicPlanPriceView[];
}

interface PublicCatalogView {
  checkout: string;
  items: PublicPlanView[];
}

/** Metadata de presentación que el operador deja en `plan_catalog.metadata`. */
interface PlanPresentationMetadata {
  public?: unknown;
  name?: unknown;
  kind?: unknown;
  perSeat?: unknown;
  seatsMinimum?: unknown;
  taxIncluded?: unknown;
}

/**
 * Catálogo comercial para visitantes SIN sesión.
 *
 * Vive en su propio controlador y no como una ruta más de
 * `CommercialController` porque su regla de acceso es la contraria: aquel
 * exige `request.user` en todas sus rutas, éste no exige nada. Mezclarlos
 * dejaría un `@Public()` suelto entre rutas autenticadas, que es exactamente
 * la clase de descuido que un día publica datos de una organización.
 *
 * Lo que publica es un subconjunto ESTRECHO a propósito: ni entitlements, ni
 * metadata cruda del operador, ni identificadores. Sólo lo que una página de
 * precios necesita para no mentir.
 */
@Public()
@Controller('v1/commercial/public')
export class PublicCatalogController {
  private readonly logger = new Logger(PublicCatalogController.name);
  /**
   * Una entrada por moneda pedida (la cadena vacía es «sin filtro»). El DTO
   * acota las claves a tres letras mayúsculas, pero eso son 17.576 monedas
   * imaginarias que cualquiera puede pedir desde fuera: el tope y el vaciado
   * son lo que impide que una ruta anónima convierta una caché en una fuga de
   * memoria. El producto publica un puñado de monedas, así que en operación
   * normal este tope jamás se alcanza.
   */
  private readonly cached = new Map<
    string,
    { view: PublicCatalogView; expiresAt: number }
  >();

  constructor(
    @InjectRepository(PlanCatalog)
    private readonly plans: Repository<PlanCatalog>,
    @InjectRepository(PlanPrice)
    private readonly planPrices: Repository<PlanPrice>,
    @Inject(PAYMENT_PROVIDER)
    private readonly payments: PaymentProvider,
    @Optional()
    @Inject(PUBLIC_CATALOG_CLOCK)
    private readonly clock: () => number = Date.now,
  ) {}

  /**
   * `s-maxage` mayor que la caché interna: si algún día hay CDN delante,
   * absorbe la avalancha antes de llegar al proceso. `public` es correcto
   * aquí y sólo aquí — esta respuesta es idéntica para todo el mundo y no
   * depende de ninguna cookie.
   */
  @Get('plans')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  async listPublicPlans(
    @Query() query: PublicCatalogQuery,
  ): Promise<PublicCatalogView> {
    const currency = query.currency ?? null;
    const now = this.clock();
    const cached = this.cached.get(currency ?? '');
    if (cached && cached.expiresAt > now) return cached.view;
    const view = await this.readCatalog(currency);
    if (this.cached.size >= MAX_CACHED_CURRENCIES) this.cached.clear();
    this.cached.set(currency ?? '', {
      view,
      expiresAt: now + CATALOG_CACHE_TTL_MS,
    });
    return view;
  }

  private async readCatalog(
    currency: string | null,
  ): Promise<PublicCatalogView> {
    const plans = await this.plans.find({
      where: { active: true },
      order: { code: 'ASC' },
      take: 200,
    });
    const publishable = plans.filter((plan) => isPublishable(plan));
    const codes = publishable.map((plan) => plan.code);
    const prices = codes.length
      ? await this.planPrices.find({
          where: {
            planCode: In(codes),
            active: true,
            ...(currency ? { currency } : {}),
          },
          order: { currency: 'ASC', period: 'ASC' },
          take: 200,
        })
      : [];

    const items: PublicPlanView[] = [];
    for (const plan of publishable) {
      const view = this.toPublicView(plan, prices, currency);
      if (view) items.push(view);
    }
    return { checkout: this.payments.descriptor().mode, items };
  }

  /**
   * Un plan sólo sale entero o no sale.
   *
   * Un plan de pago sin precio activo se OMITE en vez de publicarse con la
   * columna de importe vacía: el visitante leería "consultar" donde la
   * competencia pone una cifra, y el catálogo estaría anunciando que la
   * configuración está a medias. Se registra como aviso porque es un error
   * del operador que alguien debe corregir, no un estado normal.
   */
  private toPublicView(
    plan: PlanCatalog,
    prices: readonly PlanPrice[],
    currency: string | null,
  ): PublicPlanView | null {
    const metadata = (plan.metadata ?? {}) as PlanPresentationMetadata;
    const name = readString(metadata.name);
    if (!name) {
      this.logger.warn(
        `El plan "${plan.code}" se marcó publicable sin metadata.name; se omite del catálogo público.`,
      );
      return null;
    }
    const kind = metadata.kind === 'trial' ? 'trial' : 'paid';
    const planPrices = prices
      .filter((price) => price.planCode === plan.code)
      .map((price) => ({
        currency: price.currency,
        period: price.period,
        // bigint llega como string desde PostgreSQL; el contrato publica
        // céntimos como entero JSON.
        amountCents: Number(price.amountCents),
      }));
    if (kind === 'paid' && planPrices.length === 0) {
      // Sin filtro de moneda esto es un fallo de configuración que hay que
      // corregir; con filtro es lo esperado (el plan sencillamente no se vende
      // en esa moneda) y avisar por cada visita anónima inundaría la bitácora.
      if (!currency) {
        this.logger.warn(
          `El plan de pago "${plan.code}" no tiene precio activo; se omite del catálogo público.`,
        );
      }
      return null;
    }
    return {
      code: plan.code,
      name,
      kind,
      perSeat: metadata.perSeat === true,
      seatsMinimum: readSeatsMinimum(metadata.seatsMinimum),
      taxIncluded: metadata.taxIncluded === true,
      prices: planPrices,
    };
  }
}

/**
 * Publicar es una decisión EXPLÍCITA del operador. Sin `metadata.public` un
 * plan queda fuera: así un plan interno, heredado o a medio configurar nunca
 * aparece en la página de precios por el mero hecho de existir y estar activo.
 */
function isPublishable(plan: PlanCatalog): boolean {
  const metadata = (plan.metadata ?? {}) as PlanPresentationMetadata;
  return metadata.public === true;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Asientos mínimos: entero de 1 a 1000 (el tope del contrato). Un valor
 * ausente o absurdo cae a 1 en vez de propagar basura al contrato, porque 1
 * es el mínimo verdadero de cualquier plan: siempre hay alguien que lo usa.
 */
function readSeatsMinimum(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) return 1;
  return parsed;
}
