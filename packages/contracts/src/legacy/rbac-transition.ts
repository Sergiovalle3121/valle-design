/**
 * MAPA DE TRANSICIÓN RBAC `engineering:* → cad:*`.
 *
 * Design define su propio espacio de permisos (`CAD_PERMISSIONS` en
 * `design-contracts.ts`) para no arrastrar el RBAC del producto industrial.
 * Pero los tokens que Platform ya emitió — y los que sigue emitiendo mientras
 * dure la transición — traen los permisos legados `engineering:read|write`.
 *
 * Este mapa es lo que permite que un token EMITIDO ANTES del corte siga
 * abriendo lo que abría. Es un identificador persistido igual que un valor en
 * base de datos: vive dentro de credenciales ya firmadas, fuera del alcance
 * de este repositorio.
 *
 * Regla de expansión: solo AGREGA. Un permiso desconocido viaja tal cual y no
 * concede nada del espacio `cad:*`; ningún permiso legado concede `cad:admin`.
 */

import type { CadPermission } from "../design-contracts";

/**
 * Mapa EXACTO de transición. Ampliarlo concede accesos que nadie contrató;
 * recortarlo los quita en silencio a tenants reales. Fijado por
 * `apps/api/src/modules/auth/cad-permission-map.spec.ts`.
 */
export const LEGACY_ENGINEERING_PERMISSION_MAP: Readonly<
  Record<string, readonly CadPermission[]>
> = {
  "engineering:read": ["cad:view"],
  "engineering:write": ["cad:edit", "cad:review", "cad:publish"],
};
