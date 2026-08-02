import { CAD_PERMISSIONS, type CadPermission } from '@axos/contracts';

/**
 * Expansión de permisos del producto Design (v1).
 *
 * Los tokens los emite Platform; sus claims pueden traer los permisos nativos
 * `cad:*` o, durante la transición, los legacy `engineering:*` del producto
 * industrial. El mapeo de transición es EXACTAMENTE el declarado en
 * `@axos/contracts` (design-contracts.ts):
 *
 *   engineering:read  → cad:view
 *   engineering:write → cad:edit + cad:review + cad:publish
 *
 * La expansión solo AGREGA, nunca quita (mismo principio que el
 * permission-aliases del origen): un permiso desconocido viaja tal cual y no
 * concede nada del espacio cad:*.
 */
const TRANSITION_MAP: Record<string, readonly CadPermission[]> = {
  'engineering:read': ['cad:view'],
  'engineering:write': ['cad:edit', 'cad:review', 'cad:publish'],
};

export function expandCadPermissions(
  granted: readonly string[] | null | undefined,
): Set<string> {
  const expanded = new Set<string>();
  for (const permission of granted ?? []) {
    expanded.add(permission);
    for (const mapped of TRANSITION_MAP[permission] ?? []) {
      expanded.add(mapped);
    }
  }
  return expanded;
}

/** Todos los permisos del espacio cad:* (para roles admin de pruebas/seeds). */
export function allCadPermissions(): CadPermission[] {
  return [...CAD_PERMISSIONS];
}
