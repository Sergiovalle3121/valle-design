import { SetMetadata } from '@nestjs/common';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

export const RequirePermission = (resource: string, action: string) =>
  RequirePermissions(`${resource}:${action}`);
