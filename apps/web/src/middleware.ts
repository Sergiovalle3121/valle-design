import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PATHNAME_HEADER } from "@/i18n/route-language";

/**
 * Un único propósito: reenviar la ruta pedida como cabecera.
 *
 * `app/layout.tsx` es el layout raíz (Server Component) y decide el
 * `<html lang>` de TODA la app; en Next.js un Server Component no tiene
 * forma nativa de conocer la ruta que se está pintando, así que la única
 * vía sin reestructurar el árbol de rutas es que un middleware la reenvíe
 * como cabecera. No toca cookies, cuerpo ni redirecciones — sólo añade una
 * cabecera de lectura interna. Ver `route-language.ts` para el porqué.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
