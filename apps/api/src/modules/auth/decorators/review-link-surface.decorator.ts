import { SetMetadata } from '@nestjs/common';

export const REVIEW_LINK_SURFACE_KEY = 'reviewLinkSurface';

/**
 * Marca un endpoint como parte de la SUPERFICIE DE REVIEW LINK: alcanzable
 * con un token de review canjeado (contexto sin sesión). PermissionsGuard
 * responde `403 review_read_only` a CUALQUIER otra ruta cuando el request se
 * autenticó por review link — el read-only lo impone el backend, no el
 * frontend. Estos handlers NO llevan @RequirePermissions (el invitado no
 * tiene permisos cad:*); su alcance está limitado por servicio al documento
 * de la sesión.
 */
export const ReviewLinkSurface = () =>
  SetMetadata(REVIEW_LINK_SURFACE_KEY, true);
