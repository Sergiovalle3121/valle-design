import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MaxLength } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { TaxProfile } from '../entities/commercial.entities';
import { CFDI_PROVIDER, type CfdiProvider } from '../ports/cfdi-provider.port';
import { validateTaxProfile } from '../fiscal/tax-profile.validation';
import {
  type AuthenticatedRequest,
  requireDecider,
} from './commercial-request-context';

/**
 * Longitudes de entrada holgadas a propósito.
 *
 * El DTO sólo acota lo que evita que llegue un megabyte por el cable; QUIÉN
 * decide si el dato es válido es `validateTaxProfile`, para que el cliente
 * reciba los cinco errores a la vez y en español. Un `@Matches` con el patrón
 * del RFC aquí devolvería el 400 genérico de class-validator —«rfc must match
 * the following pattern»— justo en el campo donde más falta hace explicar qué
 * está mal.
 */
class TaxProfileDto {
  @IsString() @MaxLength(40) rfc!: string;
  @IsString() @MaxLength(400) legalName!: string;
  @IsString() @MaxLength(10) taxRegimeCode!: string;
  @IsString() @MaxLength(10) cfdiUseCode!: string;
  @IsString() @MaxLength(20) postalCode!: string;
}

interface TaxProfileView {
  rfc: string;
  personType: 'fisica' | 'moral';
  legalName: string;
  taxRegimeCode: string;
  cfdiUseCode: string;
  postalCode: string;
  updatedAt: Date;
}

function profileView(profile: TaxProfile): TaxProfileView {
  return {
    rfc: profile.rfc,
    personType: profile.personType,
    legalName: profile.legalName,
    taxRegimeCode: profile.taxRegimeCode,
    cfdiUseCode: profile.cfdiUseCode,
    postalCode: profile.postalCode,
    updatedAt: profile.updatedAt,
  };
}

/**
 * DATOS FISCALES de la organización para el CFDI 4.0.
 *
 * Se piden ANTES del primer cobro, y no después, porque perseguir a un cliente
 * ya cobrado para que mande su RFC es la pesadilla operativa que hunde a los
 * SaaS en México: el mes se cierra, la factura no sale, el cliente no deduce y
 * contabilidad reclama. `POST /v1/commercial/checkout-sessions` exige que esta
 * captura exista y rechaza la compra si falta.
 *
 * La respuesta publica SIEMPRE el modo de emisión (`issuance`), y ése es el
 * punto honesto de toda la ola: hoy el adaptador de CFDI es el NULO y el modo
 * es `manual`. El producto captura, valida contra los catálogos del SAT y
 * custodia; NO timbra. La interfaz dice eso mismo, palabra por palabra, en vez
 * de prometer una factura automática que no existe.
 *
 * PUT y no PATCH: los cinco campos viajan siempre juntos porque juntos se
 * validan. Un régimen fiscal sólo es legal para cierto tipo de persona, y el
 * tipo de persona sale del RFC: aceptar un cambio de régimen sin ver el RFC de
 * la misma petición obligaría a leer la fila anterior para saber si la
 * combinación resultante es legal — y a rezar para que nadie cambie el RFC en
 * paralelo.
 */
@Controller('v1/commercial')
export class TaxProfileController {
  constructor(
    @InjectRepository(TaxProfile)
    private readonly profiles: Repository<TaxProfile>,
    private readonly data: DataSource,
    @Inject(CFDI_PROVIDER)
    private readonly cfdi: CfdiProvider,
  ) {}

  @Get('tax-profile')
  async readTaxProfile(@Req() request: AuthenticatedRequest) {
    const { organizationId } = requireDecider(request);
    const profile = await this.profiles.findOneBy({
      organizationId,
      tenantId: organizationId,
    });
    return {
      organizationId,
      issuance: this.issuance(),
      profile: profile ? profileView(profile) : null,
    };
  }

  // 200 y no 201: el perfil fiscal de una organización es UNO, así que la
  // segunda captura sustituye a la primera en vez de crear otro recurso.
  @HttpCode(HttpStatus.OK)
  @Put('tax-profile')
  async saveTaxProfile(
    @Body() body: TaxProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { user, organizationId } = requireDecider(request);
    const validation = validateTaxProfile(body);
    if (!validation.valid) {
      // Fallo CERRADO y detallado: nada se persiste y el cliente recibe los
      // campos exactos que tiene que corregir. Guardar «lo que sí valía» dejaría
      // un perfil que parece capturado y que no sirve para timbrar.
      throw new BadRequestException({
        code: 'tax_profile_invalid',
        message: 'Los datos fiscales no cumplen las reglas del SAT.',
        issues: validation.issues,
      });
    }

    const values = {
      organizationId,
      tenantId: organizationId,
      ...validation.profile,
      updatedByUserId: user.userId,
    };
    const saved = await this.upsert(organizationId, values);
    return {
      organizationId,
      issuance: this.issuance(),
      profile: profileView(saved),
    };
  }

  /**
   * Alta o sustitución en una transacción. El único por organización es el
   * árbitro bajo carrera: dos capturas simultáneas leen «no hay perfil», sólo
   * una inserta, y la perdedora reintenta como actualización en vez de
   * responder un 500 por una colisión que el esquema ya resolvió.
   */
  private async upsert(
    organizationId: string,
    values: Partial<TaxProfile>,
  ): Promise<TaxProfile> {
    try {
      return await this.data.transaction(async (manager) => {
        const existing = await manager.findOneBy(TaxProfile, {
          organizationId,
          tenantId: organizationId,
        });
        if (existing) {
          await manager.update(TaxProfile, { id: existing.id }, values);
        } else {
          await manager.insert(TaxProfile, values);
        }
        return manager.findOneByOrFail(TaxProfile, {
          organizationId,
          tenantId: organizationId,
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.profiles.update(
        { organizationId, tenantId: organizationId },
        values,
      );
      return this.profiles.findOneByOrFail({
        organizationId,
        tenantId: organizationId,
      });
    }
  }

  /** Cómo se emite el CFDI hoy, dicho por el adaptador y no por el deseo. */
  private issuance() {
    const descriptor = this.cfdi.descriptor();
    return {
      provider: descriptor.name,
      mode: descriptor.mode,
      available: descriptor.available,
    };
  }
}
