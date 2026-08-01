import { SetMetadata } from '@nestjs/common';

/**
 * Marca un endpoint como público: el JwtAuthGuard global (APP_GUARD) lo deja pasar
 * sin token. Úsalo SOLO en rutas que deben ser anónimas (health, login, register,
 * el bridge /auth/sync que va protegido por la llave compartida).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
