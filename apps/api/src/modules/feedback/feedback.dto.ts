import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FeedbackKind, FeedbackStatus } from './entities/feedback.entity';

export const FEEDBACK_KINDS: readonly FeedbackKind[] = [
  'falla',
  'sugerencia',
  'duda',
];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  'nuevo',
  'leido',
  'planeado',
  'resuelto',
];

/**
 * Un comentario nuevo.
 *
 * `MinLength(10)`: por debajo de diez caracteres no hay nada que leer —«no
 * funciona» no es un reporte— y el límite es lo bastante bajo para no estorbar
 * a nadie que tenga algo que decir. Los 4000 de arriba son los mismos que fija
 * el CHECK de la tabla, escritos en los dos sitios a propósito: el de la base
 * es la garantía y el del DTO es el que devuelve un 400 legible en vez de un
 * error de restricción.
 */
export class CreateFeedbackDto {
  @IsIn(FEEDBACK_KINDS as string[])
  kind!: FeedbackKind;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  message!: string;

  /**
   * Contexto técnico. Sólo llega si quien escribe marcó la casilla, y el
   * servicio lo recorta a los cinco campos declarados: lo que manda el
   * navegador no se cree, se filtra.
   */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class UpdateFeedbackStatusDto {
  @IsIn(FEEDBACK_STATUSES as string[])
  status!: FeedbackStatus;
}
