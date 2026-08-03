import { SetMetadata } from '@nestjs/common';

/**
 * Marca un endpoint como público: los guards globales no exigen una sesión
 * activa. Úsalo sólo en rutas anónimas o en rutas de identidad que ejecutan
 * su propia validación de cookie/CSRF (health, register, login y recovery).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
