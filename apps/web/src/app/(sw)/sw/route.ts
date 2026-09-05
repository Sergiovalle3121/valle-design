import { SW_HEADERS } from "../service-worker-policy";
import { SERVICE_WORKER_SOURCE } from "../service-worker-source";

/**
 * `/sw` — EL SERVICE WORKER, SERVIDO COMO RUTA.
 *
 * El paréntesis de `(sw)` no entra en la URL: este archivo vive en
 * `src/app/(sw)/sw/route.ts` y responde en `/sw`, a la altura de la raíz. Eso
 * importa: el ámbito de un service worker no puede ser más amplio que el
 * directorio del que se sirvió el script, así que un worker en `/sw` gobierna
 * `/` de forma natural. La cabecera `Service-Worker-Allowed` va igual, porque
 * la premisa deja de ser cierta el día que alguien monte la app bajo subruta.
 *
 * ## Por qué una ruta y no `public/sw.js`
 *
 * Porque la política tiene que poder LEER el árbol. La lista de precacheo
 * incluye las fuentes versionadas por contenido, y esos nombres los emite
 * `scripts/design/subset-fonts.py` en `src/config/fonts-generated.ts`. Un
 * archivo estático en `public/` tendría que repetirlos a mano, y el día que
 * cambien el precacheo pediría un 404, `install` fallaría entero y el producto
 * se quedaría sin worker sin un solo error visible. Desde aquí, en cambio, el
 * script se recompone desde el mismo módulo que el resto del árbol typechequea.
 *
 * ## `force-dynamic`
 *
 * El cuerpo es una constante, así que estáticamente sería idéntico. Se fuerza
 * dinámico por las CABECERAS: `Cache-Control: no-cache` es lo que impide que un
 * CDN intermedio siga sirviendo el worker anterior durante horas después de un
 * despliegue, y la ruta estática de Next añade su propia política de caché
 * encima. El coste es un render por comprobación de actualización del worker
 * —una cada 24 h por usuario— y a cambio el despliegue nuevo llega siempre.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(SERVICE_WORKER_SOURCE, { headers: { ...SW_HEADERS } });
}
