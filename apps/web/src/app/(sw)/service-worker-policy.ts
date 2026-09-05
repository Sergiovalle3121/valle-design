/**
 * LA POLÍTICA DEL SERVICE WORKER, DECLARADA APARTE DE SU CÓDIGO.
 *
 * Este módulo no contiene comportamiento: contiene las DECISIONES. Qué se
 * precachea, qué se considera inmutable, qué no se toca jamás, cómo se llama
 * la caché de esta versión y con qué cabeceras se sirve el script. El
 * comportamiento vive en `service-worker-source.ts`, que interpola estos
 * valores dentro del texto del worker.
 *
 * ## Por qué separados
 *
 * El cuerpo del service worker es una CADENA: no se puede importar desde el
 * navegador, no se typechequea contra el resto del árbol y no puede consumir
 * `@/config/...`. Si la lista de precacheo viviera dentro de esa cadena, el
 * día que las fuentes cambien de hash nadie se enteraría — el worker seguiría
 * pidiendo `/fonts/InterVariable.subset.d88efde7.woff2`, recibiría un 404, y
 * `install` fallaría entero y en silencio (un service worker que no instala no
 * emite ningún error visible en la aplicación; simplemente no existe).
 *
 * Aquí la lista sí es TypeScript, así que las fuentes se importan del
 * manifiesto que genera `scripts/design/subset-fonts.py`. Un cambio de fuente
 * mueve el hash, el hash mueve la lista, la lista mueve el nombre de la caché
 * y el navegador reinstala. Sin que nadie se acuerde de nada.
 *
 * ## La afirmación honesta
 *
 * Esto es caché EN TIEMPO DE EJECUCIÓN, no un manifiesto de build: no hay una
 * lista completa de los `/_next/static/*` que el estudio necesita, porque esa
 * lista sólo la conoce el compilador y aquí no se lee. La consecuencia es
 * exacta y hay que decirla con esas palabras: **el estudio abre sin red
 * DESPUÉS de haberse abierto una vez con red.** La primera visita de un
 * navegador nuevo, sin conexión, sigue sin poder abrir nada — y la copia de
 * `/sin-conexion` lo dice.
 */
import { PRELOAD_FONTS } from "@/config/fonts-generated";

/**
 * La ruta desde la que se sirve el script. Vive en la RAÍZ a propósito: el
 * ámbito de un service worker no puede ser más amplio que el directorio desde
 * el que se sirvió, así que `/sw` puede gobernar `/` sin depender de la
 * cabecera `Service-Worker-Allowed`. La cabecera se manda igual, porque un
 * proxy o un despliegue bajo subruta pueden cambiar esa premisa y la cabecera
 * es la que lo dice en voz alta.
 */
export const SW_ROUTE = "/sw";

/** El cascarón que se sirve cuando la navegación no llega y no hay copia. */
export const SW_OFFLINE_URL = "/sin-conexion";

/**
 * Se sube A MANO cuando cambia el COMPORTAMIENTO del worker sin cambiar
 * ninguna de las listas de abajo. La huella de contenido cubre los datos; esto
 * cubre el código. Subirlo obliga a reinstalar y a purgar la caché anterior.
 */
export const SW_POLICY_REVISION = 1;

/**
 * EL CASCARÓN. Todo lo que hace falta para pintar `/sin-conexion` con su marca
 * y su tipografía, y nada más.
 *
 * `cache.addAll` es todo-o-nada por diseño del estándar, y aquí se conserva esa
 * propiedad a propósito (ver `service-worker-source.ts`): media caché es peor
 * que ninguna, porque produce una pantalla sin fuentes ni icono que parece un
 * fallo del producto en vez de un fallo de red. Por eso la lista es corta y
 * cada entrada está verificada contra el árbol:
 *
 *  · `/sin-conexion`          — la página, que existe como ruta de verdad.
 *  · `/manifest.webmanifest`  — lo emite `src/app/manifest.ts`; sin él una PWA
 *                               ya instalada pierde su identidad al arrancar.
 *  · `/icon`, `/apple-icon`   — `src/app/icon.tsx` y `src/app/apple-icon.tsx`,
 *                               los mismos que declara el metadata del layout.
 *  · las dos caras precargadas — `PRELOAD_FONTS`, exactamente las que el
 *                               `<head>` del layout raíz pide con `rel=preload`.
 *
 * Las seis responden 200 en el build de verdad; se comprobó con `next start` y
 * `curl` antes de declararlas, porque una sola que fallara tumbaría `install`
 * entero. Y una que asusta al leerla: `/sin-conexion` se sirve con
 * `Cache-Control: private, no-cache, no-store`. No estorba. El Cache API no
 * mira las directivas HTTP de caché —guarda lo que se le da y devuelve lo que
 * guardó—; `no-store` gobierna la caché del navegador, que es otra cosa.
 *
 * NO entra el isotipo SVG de `public/brand/`: la página sin conexión no lo
 * pinta, y precachear un archivo que nadie va a pedir es peso muerto que
 * además puede tumbar la instalación entera si algún día se renombra.
 */
export const SW_PRECACHE_URLS: readonly string[] = [
  SW_OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  ...PRELOAD_FONTS,
];

/**
 * INMUTABLES POR HASH DE CONTENIDO — `stale-while-revalidate`.
 *
 * `/_next/static/*` lleva el hash del chunk en la ruta y `/fonts/*` el hash del
 * subconjunto (`next.config.ts` ya les pone `immutable` de un año). Cuando la
 * URL cambia con el contenido, servir la copia guardada NO puede servir algo
 * viejo: o la URL existe y es idéntica, o es otra URL. Por eso aquí el patrón
 * correcto es devolver la caché al instante y revalidar detrás, y no
 * `network-first`.
 */
export const SW_IMMUTABLE_PREFIXES: readonly string[] = ["/_next/static/", "/fonts/"];

/**
 * LO QUE NUNCA SE TOCA.
 *
 * `/v1/*` es la superficie externa del producto (AGENTS.md): documentos CAD,
 * biblioteca de bloques del equipo, enlaces de revisión, sesión. Guardar una
 * de esas respuestas es guardar el estado de OTRA persona en el disco de ésta,
 * y devolverla más tarde es enseñar un documento que ya cambió — sobre un CAD
 * con CAS y versiones, eso no es una caché obsoleta: es una fusión perdida.
 *
 * El worker ni siquiera intercepta estas peticiones. Deja que la red las
 * atienda tal cual, y si la red no está, el error llega crudo a
 * `document-lifecycle/connectivity.ts`, que es quien ya sabe qué hacer con él
 * (marcar el guardado pendiente y reintentarlo al volver `online`). Una caché
 * que respondiera 200 en su lugar dejaría a ese código creyendo que guardó.
 */
export const SW_NEVER_CACHE_PREFIXES: readonly string[] = ["/v1/"];

/**
 * Cabeceras de respuesta que se consideran veneno para la caché.
 *
 * `Vary: Cookie` marca una respuesta PERSONALIZADA, y hay que resistir la
 * tentación de pensar que el Cache API ya la protege: `Cookie` es un nombre de
 * cabecera PROHIBIDO, nunca aparece en `request.headers`, y la coincidencia por
 * `Vary` acaba comparando ausencia contra ausencia y dando por bueno cualquier
 * match. O sea que guardar una respuesta con `Vary: Cookie` es guardar la
 * pantalla de una sesión para servírsela a la siguiente. La única defensa es no
 * guardarla. `Vary: *` es lo mismo llevado al extremo, y `Authorization` es la
 * versión del mismo problema sin cookies.
 */
export const SW_POISON_VARY: readonly string[] = ["*", "cookie", "authorization"];

/**
 * EL ÚNICO MENSAJE QUE EL WORKER ESCUCHA: «salta la espera».
 *
 * Lo manda `ServiceWorkerRegistrar.tsx` al worker EN ESPERA cuando el usuario
 * pulsa «recargar» en el aviso de versión nueva. Hoy este worker ya llama a
 * `skipWaiting()` dentro de `install`, así que la fase de espera dura
 * milisegundos y este camino casi nunca se recorre; existe igual por dos
 * motivos concretos:
 *
 *  · La política de relevo vive en `service-worker-source.ts` y puede cambiar
 *    —el día que este worker tenga datos propios que migrar, `skipWaiting` en
 *    `install` deja de ser aceptable—. El botón del aviso no debería enterarse.
 *  · Un worker en espera lo puede sostener OTRA pestaña abierta. Si eso pasa,
 *    sin este mensaje el botón no tendría forma de forzar el relevo.
 *
 * Es una cadena y no un objeto a propósito: `postMessage` estructura-clona lo
 * que se le dé, y un `{ tipo: ... }` invita a que alguien empiece a mandar
 * parámetros por aquí. Este canal tiene exactamente un mensaje.
 *
 * NO mueve `SW_POLICY_REVISION`: la revisión existe para INVALIDAR lo guardado,
 * y añadir un oyente no vuelve mala ni una sola respuesta en caché. Los bytes de
 * `/sw` sí cambian, que es lo que hace que el navegador reinstale.
 */
export const SW_MENSAJE_SALTAR_ESPERA = "valle:saltar-espera";

/**
 * Cada cuánto se refresca la copia del cascarón, en milisegundos.
 *
 * El problema que resuelve: `install` sólo vuelve a correr cuando cambian los
 * BYTES de `/sw`, y esos bytes sólo cambian cuando cambia esta política. Un
 * despliegue que reescriba la copy de `/sin-conexion` dejaría la copia
 * precacheada congelada para siempre — la pantalla de emergencia sería la
 * única parte del producto que no se actualiza nunca.
 *
 * La solución no lleva estado: tras una navegación que SÍ llegó a la red, el
 * worker mira la cabecera `Date` de su copia guardada y, si pasó de este
 * margen, la vuelve a pedir por detrás. Doce horas deja como mucho un día de
 * desfase en una pantalla que la mayoría de la gente no verá nunca, y no añade
 * ni una petición al camino normal.
 */
export const SW_SHELL_REFRESH_MS = 12 * 60 * 60 * 1000;

/**
 * Huella FNV-1a de 32 bits sobre el texto de la política.
 *
 * Sin dependencias y sin `node:crypto` a propósito: este módulo lo importa una
 * ruta de Next y también lo lee el spec con `tsx`, y una función de doce líneas
 * que no importa nada no puede romperse en ninguno de los dos. No es
 * criptografía — es un detector de cambios, y para eso 32 bits sobran.
 */
function huella(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * EL NOMBRE DE LA CACHÉ VIGENTE, y con él la unidad de invalidación.
 *
 * Deriva de todo lo que se declara arriba. Cambiar una URL del cascarón,
 * añadir un prefijo inmutable o subir la revisión cambia el nombre; `activate`
 * borra cualquier caché que no se llame así, de modo que la purga es
 * automática y no hay forma de dejar atrás una caché huérfana ocupando cuota
 * en el disco del usuario.
 */
export const SW_CACHE_NAME = `valle-design-cascaron-${SW_POLICY_REVISION}-${huella(
  JSON.stringify([
    SW_OFFLINE_URL,
    SW_PRECACHE_URLS,
    SW_IMMUTABLE_PREFIXES,
    SW_NEVER_CACHE_PREFIXES,
    SW_POISON_VARY,
    SW_SHELL_REFRESH_MS,
  ]),
)}`;

/**
 * CABECERAS DEL SCRIPT. Las tres importan y ninguna es decorativa:
 *
 *  · `Content-Type: text/javascript` — el navegador RECHAZA registrar un
 *    service worker servido con otro tipo MIME. Es el fallo más habitual al
 *    servir el worker desde una ruta en vez de desde un archivo estático, y no
 *    da un error de red: da «The script has an unsupported MIME type».
 *  · `Service-Worker-Allowed: /` — declara el ámbito máximo por encima del
 *    directorio de origen del script (ver `SW_ROUTE`).
 *  · `Cache-Control: no-cache` — no significa «no guardes»: significa
 *    «revalida antes de usar». El navegador ya se niega a cachear el script del
 *    worker más de 24 h, pero sin esto un CDN intermedio puede servir el
 *    worker anterior durante horas y el despliegue nuevo no llega nunca.
 */
export const SW_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/javascript; charset=utf-8",
  "Service-Worker-Allowed": "/",
  "Cache-Control": "no-cache",
};
