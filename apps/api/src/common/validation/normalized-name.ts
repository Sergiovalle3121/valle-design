import { BadRequestException } from '@nestjs/common';

export interface RequiredNameOptions {
  resource: string;
  minLength?: number;
  maxLength: number;
}

/**
 * Normaliza y valida nombres en la frontera de dominio.
 *
 * Los DTO protegen HTTP, pero repositorios y servicios también reciben
 * llamadas internas (jobs, importadores y pruebas). Esta segunda barrera evita
 * persistir una cadena vacía cuando el caller no pasó por ValidationPipe.
 */
export function normalizeRequiredName(
  value: unknown,
  options: RequiredNameOptions,
): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const minLength = options.minLength ?? 1;
  if (normalized.length < minLength || normalized.length > options.maxLength) {
    throw new BadRequestException({
      code: 'resource_name_invalid',
      message: `El nombre de ${options.resource} debe tener entre ${minLength} y ${options.maxLength} caracteres después de normalizarse.`,
    });
  }
  return normalized;
}
