import { CAD_PERMISSIONS, type CadPermission } from '@valle-design/contracts';
import type { OrganizationRole } from './entities/organization.entity';

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly CadPermission[]> = {
  owner: CAD_PERMISSIONS,
  admin: CAD_PERMISSIONS,
  member: ['cad:view', 'cad:edit', 'cad:review', 'cad:publish'],
  viewer: ['cad:view', 'cad:review'],
};

export function permissionsForOrganizationRole(
  role: OrganizationRole,
): CadPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}
