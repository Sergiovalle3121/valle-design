import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

/**
 * El reporte que sale del botón «algo salió mal» del estudio.
 *
 * Lo que viaja está deliberadamente acotado, y el cuadro del estudio lo enseña
 * ENTERO antes de enviar: quien reporta un problema tiene derecho a ver qué
 * está mandando. Nunca viaja el CONTENIDO del plano — sólo, y sólo si la
 * persona lo autoriza, su identificador, para que soporte pueda mirarlo con
 * las mismas credenciales con las que ya podría.
 */
export class ReportSupportIncidentDto {
  /** Lo único que la persona redacta. */
  @IsString()
  @Length(10, 2000)
  summary!: string;

  /** Versión del estudio: sin ella, «no me funciona» no se puede reproducir. */
  @IsString()
  @Length(1, 120)
  appVersion!: string;

  @IsString()
  @Length(1, 400)
  userAgent!: string;

  /** El comando en curso cuando falló, si había uno. */
  @IsOptional()
  @IsString()
  @Length(0, 64)
  activeCommand?: string | null;

  /**
   * El identificador del documento. La validación lo exige UUID SÓLO cuando
   * viene: un reporte desde el tablero, sin plano abierto, es legítimo.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  documentId?: string | null;

  /**
   * La autorización explícita. Es un booleano y no la mera presencia del
   * identificador a propósito: así el servidor puede RECHAZAR un id que llegue
   * sin permiso, en vez de deducir el permiso de que el id esté ahí.
   */
  @IsBoolean()
  documentAuthorized!: boolean;
}
