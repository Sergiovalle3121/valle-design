import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { LessThan, MoreThan, type Repository } from 'typeorm';
import { decodeCadDocumentArchive } from '../cad-documents/cad-document-storage';
import {
  redactCadDocumentSecrets,
  validateCadDocumentPayload,
  type PersistedCadDocument,
} from '../cad-documents/cad-document-validation';
import { ApiRateLimitService } from '../identity/api-rate-limit.service';
import { CadDemoShare } from './entities/cad-demo-share.entity';

const gzipAsync = promisify(gzip);

/**
 * EL ENLACE TEMPORAL DE LA DEMOSTRACIÓN.
 *
 * Quien dibuja en `/demo` —sin cuenta, con el plano guardado sólo en su
 * navegador— puede pulsar «Compartir» y mandar un enlace a su celular o a su
 * cliente. El servidor guarda una COPIA DE SÓLO LECTURA del dibujo durante
 * siete días y devuelve dos tokens que sólo existen en claro en esa respuesta:
 *
 * - el de LECTURA (`vdds_…`) viaja en el fragmento del enlace
 *   (`/revision#demoShare=…`), igual que el de un review link: no sale del
 *   navegador, no entra en logs ni en `Referer`;
 * - el de GESTIÓN (`vddm_…`) se queda en el navegador de quien lo creó y
 *   sirve para borrarlo antes de tiempo o para RECLAMARLO al crear cuenta.
 *
 * Reclamar convierte el enlace en un review link del documento que nació del
 * dibujo: la sesión de revisión se crea con el MISMO hash de token, así que la
 * URL que el destinatario ya tiene sigue abriendo —ahora el plano vivo, no la
 * copia— y la fila temporal se borra.
 *
 * La superficie es anónima, y por eso está acotada en todo lo que se puede
 * acotar: tamaño (1 MiB comprimido, `DEMO_SHARE_MAX_ENTITIES` entidades), ritmo
 * por IP (con clave HMAC opaca: la IP no se guarda en ninguna tabla), un tope
 * global diario y un interruptor de operador (`CAD_DEMO_SHARES_ENABLED=false`)
 * que la pausa sin redesplegar.
 */
export const DEMO_SHARE_TOKEN_PREFIX = 'vdds_';
export const DEMO_SHARE_MANAGE_PREFIX = 'vddm_';
export const DEMO_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEMO_SHARE_MAX_GZIP_BYTES = 1024 * 1024;
export const DEMO_SHARE_MAX_ENTITIES = 20_000;
export const DEMO_SHARE_DEFAULT_NAME = 'Plano de la demostración';

/** Techos de la superficie anónima. Los por-IP usan la clave HMAC opaca. */
export const DEMO_SHARE_LIMITS = {
  createPerIpPer10Minutes: 5,
  createPerIpPerDay: 20,
  createGlobalPerDay: 1_000,
  readPerIpPerMinute: 120,
  managePerTokenPerMinute: 10,
} as const;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_MIN_LENGTH = 16;
const TOKEN_MAX_LENGTH = 256;

export interface CreatedDemoShare {
  shareToken: string;
  manageToken: string;
  expiresAt: string;
}

export interface RedeemedDemoShare {
  readOnly: true;
  expiresAt: string;
  document: { name: string; cadDocument: PersistedCadDocument };
}

export function hashDemoShareToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function generateToken(prefix: string): { token: string; hash: string } {
  const token = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashDemoShareToken(token) };
}

function plausibleToken(raw: unknown, prefix: string): raw is string {
  return (
    typeof raw === 'string' &&
    raw.startsWith(prefix) &&
    raw.length >= TOKEN_MIN_LENGTH &&
    raw.length <= TOKEN_MAX_LENGTH &&
    !/\s/u.test(raw)
  );
}

/**
 * Lo que la copia NO lleva: el historial local, las publicaciones, las
 * referencias externas y los rásters con sus definiciones (URIs de assets que
 * el visitante no quiso compartir) no hacen falta para mirar un plano, y los
 * secretos se redactan con la misma función que el guardado normal.
 */
export function sanitizeDemoShareDocument(
  document: PersistedCadDocument,
): PersistedCadDocument {
  const source = document as unknown as Record<string, unknown>;
  const entities = Array.isArray(source.entities)
    ? (source.entities as Array<Record<string, unknown>>).filter(
        (entity) => entity?.type !== 'image',
      )
    : [];
  const kept = new Set(entities.map((entity) => entity.id));
  const modelSpace = source.modelSpace as { entityIds?: unknown } | undefined;
  const clean = {
    ...source,
    entities,
    history: [],
    publications: [],
    externalReferences: [],
    // Las definiciones de ráster llevan el URI del asset: sin sus imágenes no
    // hacen falta, y con ellas viajaría una dirección que nadie quiso compartir.
    imageDefinitions: [],
    ...(modelSpace && Array.isArray(modelSpace.entityIds)
      ? {
          modelSpace: {
            ...modelSpace,
            entityIds: modelSpace.entityIds.filter((id) => kept.has(id)),
          },
        }
      : {}),
  };
  return redactCadDocumentSecrets(clean);
}

function entityCountOf(document: PersistedCadDocument): number {
  const entities = (document as unknown as { entities?: unknown[] }).entities;
  return Array.isArray(entities) ? entities.length : 0;
}

function shareName(raw: unknown): string {
  if (typeof raw !== 'string') return DEMO_SHARE_DEFAULT_NAME;
  const trimmed = raw.replace(/\s+/gu, ' ').trim().slice(0, 160);
  return trimmed || DEMO_SHARE_DEFAULT_NAME;
}

@Injectable()
export class CadDemoShareService {
  constructor(
    @InjectRepository(CadDemoShare)
    private readonly shares: Repository<CadDemoShare>,
    private readonly rateLimits: ApiRateLimitService,
  ) {}

  /** El operador puede pausar la superficie sin redesplegar. */
  get enabled(): boolean {
    return (
      process.env.CAD_DEMO_SHARES_ENABLED?.trim().toLowerCase() !== 'false'
    );
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'demo_share_paused',
          message:
            'Compartir desde la demostración está en pausa. Crea una cuenta gratis para compartir tu plano.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async create(
    compressed: Buffer,
    rawName: unknown,
    clientIp: string,
  ): Promise<CreatedDemoShare> {
    this.assertEnabled();
    if (!compressed.length || compressed.length > DEMO_SHARE_MAX_GZIP_BYTES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          code: 'demo_share_too_large',
          message:
            'El plano es demasiado grande para compartirlo desde la demostración. Crea una cuenta gratis para compartirlo completo.',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    await this.rateLimits.enforce(
      'cad.demo-share.create.10m',
      [clientIp],
      DEMO_SHARE_LIMITS.createPerIpPer10Minutes,
      TEN_MINUTES_MS,
    );
    await this.rateLimits.enforce(
      'cad.demo-share.create.day',
      [clientIp],
      DEMO_SHARE_LIMITS.createPerIpPerDay,
      ONE_DAY_MS,
    );
    await this.rateLimits.enforce(
      'cad.demo-share.create.global',
      ['global'],
      DEMO_SHARE_LIMITS.createGlobalPerDay,
      ONE_DAY_MS,
    );

    const decoded = await decodeCadDocumentArchive(compressed);
    const document = sanitizeDemoShareDocument(
      validateCadDocumentPayload(decoded),
    );
    const entityCount = entityCountOf(document);
    if (entityCount === 0) {
      throw new BadRequestException(
        'El plano está vacío: dibuja algo antes de compartirlo.',
      );
    }
    if (entityCount > DEMO_SHARE_MAX_ENTITIES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          code: 'demo_share_too_large',
          message: `El plano tiene más de ${DEMO_SHARE_MAX_ENTITIES} entidades. Crea una cuenta gratis para compartirlo completo.`,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const documentGzip = await gzipAsync(
      Buffer.from(JSON.stringify(document), 'utf8'),
      { level: 6 },
    );
    if (documentGzip.length > DEMO_SHARE_MAX_GZIP_BYTES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          code: 'demo_share_too_large',
          message:
            'El plano es demasiado grande para compartirlo desde la demostración.',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const share = generateToken(DEMO_SHARE_TOKEN_PREFIX);
    const manage = generateToken(DEMO_SHARE_MANAGE_PREFIX);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEMO_SHARE_TTL_MS);
    await this.shares.insert({
      tokenHash: share.hash,
      manageHash: manage.hash,
      name: shareName(rawName),
      documentGzip,
      gzipBytes: documentGzip.length,
      entityCount,
      createdAt: now,
      expiresAt,
    });
    return {
      shareToken: share.token,
      manageToken: manage.token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Canje de sólo lectura. Caducado, borrado o desconocido: 401 sin distinción útil. */
  async redeem(
    rawToken: unknown,
    clientIp: string,
  ): Promise<RedeemedDemoShare> {
    await this.rateLimits.enforce(
      'cad.demo-share.read',
      [clientIp],
      DEMO_SHARE_LIMITS.readPerIpPerMinute,
    );
    if (!plausibleToken(rawToken, DEMO_SHARE_TOKEN_PREFIX)) {
      throw new UnauthorizedException({
        code: 'demo_share_invalid',
        message: 'Este enlace no es válido.',
      });
    }
    const row = await this.shares
      .createQueryBuilder('share')
      .addSelect('share.documentGzip')
      .where('share.tokenHash = :hash', { hash: hashDemoShareToken(rawToken) })
      .getOne();
    if (!row) {
      throw new UnauthorizedException({
        code: 'demo_share_invalid',
        message: 'Este enlace no existe o ya se borró.',
      });
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'demo_share_expired',
        message: 'Este enlace de la demostración ya caducó.',
      });
    }
    const decoded = await decodeCadDocumentArchive(row.documentGzip);
    return {
      readOnly: true,
      expiresAt: row.expiresAt.toISOString(),
      document: {
        name: row.name,
        cadDocument: validateCadDocumentPayload(decoded),
      },
    };
  }

  /** Borrado anticipado por quien lo creó (token de gestión). Idempotente. */
  async remove(rawManageToken: unknown): Promise<void> {
    if (!plausibleToken(rawManageToken, DEMO_SHARE_MANAGE_PREFIX)) {
      throw new UnauthorizedException({
        code: 'demo_share_invalid',
        message: 'La credencial de gestión no es válida.',
      });
    }
    const manageHash = hashDemoShareToken(rawManageToken);
    await this.rateLimits.enforce(
      'cad.demo-share.manage',
      [manageHash],
      DEMO_SHARE_LIMITS.managePerTokenPerMinute,
    );
    await this.shares.delete({ manageHash });
  }

  /**
   * RECLAMAR, paso 1: el enlace vigente al que apunta este token de gestión.
   * No lo borra: quien llama crea primero la sesión de revisión del documento
   * con el MISMO hash de lectura y sólo entonces lo retira con
   * `completeClaim`. En ese orden, si crear la sesión falla, el enlace que el
   * destinatario ya tiene sigue abriendo la copia.
   */
  async findForClaim(
    rawManageToken: unknown,
  ): Promise<{ id: string; tokenHash: string; expiresAt: Date }> {
    if (!plausibleToken(rawManageToken, DEMO_SHARE_MANAGE_PREFIX)) {
      throw new UnauthorizedException({
        code: 'demo_share_invalid',
        message: 'La credencial de gestión no es válida.',
      });
    }
    const manageHash = hashDemoShareToken(rawManageToken);
    await this.rateLimits.enforce(
      'cad.demo-share.manage',
      [manageHash],
      DEMO_SHARE_LIMITS.managePerTokenPerMinute,
    );
    const row = await this.shares.findOne({
      where: { manageHash, expiresAt: MoreThan(new Date()) },
    });
    if (!row) {
      throw new UnauthorizedException({
        code: 'demo_share_expired',
        message: 'El enlace de la demostración ya no existe o caducó.',
      });
    }
    return { id: row.id, tokenHash: row.tokenHash, expiresAt: row.expiresAt };
  }

  /** RECLAMAR, paso 2: la copia temporal ya tiene sesión de revisión; se retira. */
  async completeClaim(id: string): Promise<void> {
    await this.shares.delete({ id });
  }

  /** Barrido de caducados. Idempotente: corre en todas las réplicas. */
  async deleteExpired(): Promise<number> {
    const result = await this.shares.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}
