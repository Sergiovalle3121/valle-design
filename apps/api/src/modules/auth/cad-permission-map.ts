import {
  CAD_PERMISSIONS,
  type CadPermission,
} from '@valle-design/contracts';

/**
 * Copia defensiva de los permisos derivados server-side de una membresía.
 * Los valores desconocidos se conservan para observabilidad, pero jamás se
 * traducen ni conceden permisos `cad:*` adicionales.
 */
export function expandCadPermissions(
  granted: readonly string[] | null | undefined,
): Set<string> {
  return new Set(granted ?? []);
}

/** Todos los permisos del espacio cad:* (para roles admin de pruebas/seeds). */
export function allCadPermissions(): CadPermission[] {
  return [...CAD_PERMISSIONS];
}
