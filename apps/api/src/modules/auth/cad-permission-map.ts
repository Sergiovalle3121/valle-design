import {
  CAD_PERMISSIONS,
  LEGACY_ENGINEERING_PERMISSION_MAP,
  type CadPermission,
} from '@valle-design/contracts';

/**
 * Expansión de permisos del producto Design (v1).
 *
 * Los tokens los emite Platform; sus claims pueden traer los permisos nativos
 * `cad:*` o, durante la transición, los legacy `engineering:*` del producto
 * industrial. El mapeo de transición es EXACTAMENTE el declarado en
 * `@valle-design/contracts` (`legacy/rbac-transition.ts`):
 *
 *   engineering:read  → cad:view
 *   engineering:write → cad:edit + cad:review + cad:publish
 *
 * El mapa vive en el módulo `legacy/` del paquete de contratos —y no aquí—
 * porque su valor está dentro de credenciales YA FIRMADAS por Platform: no es
 * nomenclatura interna, es un identificador persistido fuera del repositorio.
 * Su condición de retiro está escrita en `legacy/README.md` §3.
 *
 * La expansión solo AGREGA, nunca quita (mismo principio que el
 * permission-aliases del origen): un permiso desconocido viaja tal cual y no
 * concede nada del espacio cad:*.
 */
const TRANSITION_MAP: Readonly<Record<string, readonly CadPermission[]>> =
  LEGACY_ENGINEERING_PERMISSION_MAP;

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
