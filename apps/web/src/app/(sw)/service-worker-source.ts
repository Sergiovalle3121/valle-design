/**
 * EL CUERPO DEL SERVICE WORKER, COMO TEXTO.
 *
 * ## Por qué una cadena y no un archivo `.js` en `public/`
 *
 * Un `public/sw.js` es un archivo suelto que nadie typechequea, que no puede
 * importar `@/config/fonts-generated` y que envejece en silencio: el día que el
 * subconjunto de Inter cambie de hash, ese archivo seguirá pidiendo el hash
 * viejo, `install` fallará entero —`Promise.all` es todo-o-nada— y el producto
 * se quedará sin service worker sin un solo error visible en la aplicación.
 *
 * Aquí el worker se COMPONE desde `service-worker-policy.ts`, que sí es
 * TypeScript de verdad y sí puede leer el manifiesto de fuentes. La ruta `/sw`
 * devuelve exactamente esta cadena, y `service-worker-harness.spec.ts` ejecuta
 * exactamente esta cadena con `new Function`: **los bytes probados son los
 * bytes servidos.** No hay una copia de la política dentro del test que pueda
 * separarse de la que corre en el navegador.
 *
 * ## Reglas de escritura del cuerpo
 *
 * El cuerpo se escribe DENTRO de una plantilla de TypeScript, así que dentro de
 * él no se usan ni acentos graves ni `${`: los mensajes se arman concatenando
 * con `+`. Es una restricción tonta y merece decirse aquí en vez de descubrirse
 * en un error de sintaxis a las dos de la mañana.
 *
 * Nada de `export`/`import` en el cuerpo: se registra como worker CLÁSICO, no
 * como módulo. `type: "module"` en `navigator.serviceWorker.register` sigue sin
 * estar en Firefox estable, y un service worker que sólo funciona en Chromium
 * no es un service worker.
 *
 * ## Las cuatro rutas del `fetch`, en el orden en que se deciden
 *
 *   1. No es GET, o es de otro origen, o cuelga de `/v1/` → NO SE INTERCEPTA.
 *      El worker devuelve sin llamar a `respondWith`, y el navegador hace la
 *      petición como si el worker no existiera. Es la única forma de garantizar
 *      que no hay caché de por medio: no basta con «no guardo», hay que «no
 *      miro».
 *   2. Navegación → `network-first`. El HTML sí puede cambiar sin cambiar de
 *      URL, así que la red manda; la caché es la red de seguridad, y
 *      `/sin-conexion` es la red de seguridad de la red de seguridad.
 *   3. `/_next/static/*` y `/fonts/*` → `stale-while-revalidate`. Llevan hash
 *      de contenido en la URL: la copia guardada no puede estar obsoleta.
 *   4. Una URL del cascarón declarado → caché primero. Son el icono, el
 *      manifiesto y las fuentes precargadas; si están, están bien.
 *
 * Todo lo demás cae por el mismo camino que el punto 1: sin interceptar.
 *
 * ## El cuarto oyente
 *
 * Además de `install`, `activate` y `fetch` hay un `message`, y escucha UN solo
 * mensaje (`SW_MENSAJE_SALTAR_ESPERA`): el que manda el aviso de versión nueva
 * cuando el usuario pulsa «recargar». Ver la constante en la política para el
 * porqué de que exista aunque `install` ya salte la espera.
 */
import {
  SW_CACHE_NAME,
  SW_IMMUTABLE_PREFIXES,
  SW_MENSAJE_SALTAR_ESPERA,
  SW_NEVER_CACHE_PREFIXES,
  SW_OFFLINE_URL,
  SW_POISON_VARY,
  SW_PRECACHE_URLS,
  SW_SHELL_REFRESH_MS,
} from "./service-worker-policy";

/** Serializa un valor de la política para incrustarlo en el cuerpo del worker. */
const literal = (valor: unknown): string => JSON.stringify(valor);

/**
 * EL ORIGEN DEL SERVICE WORKER. Una constante, calculada una vez al cargar el
 * módulo: la política no depende de la petición, así que la ruta `/sw` no tiene
 * nada que decidir por request.
 */
export const SERVICE_WORKER_SOURCE = `"use strict";
/* Valle Design — service worker del cascarón sin conexión.
   GENERADO por src/app/(sw)/service-worker-source.ts desde
   src/app/(sw)/service-worker-policy.ts. No editar esta copia: se sirve desde
   la ruta /sw y se regenera en cada despliegue. */
(function () {
  var CACHE = ${literal(SW_CACHE_NAME)};
  var PRECACHE = ${literal(SW_PRECACHE_URLS)};
  var OFFLINE = ${literal(SW_OFFLINE_URL)};
  var INMUTABLES = ${literal(SW_IMMUTABLE_PREFIXES)};
  var NUNCA = ${literal(SW_NEVER_CACHE_PREFIXES)};
  var VARY_VENENOSO = ${literal(SW_POISON_VARY)};
  var REFRESCO_MS = ${literal(SW_SHELL_REFRESH_MS)};
  var SALTAR_ESPERA = ${literal(SW_MENSAJE_SALTAR_ESPERA)};

  /* ── Predicados ───────────────────────────────────────────────────────── */

  function empiezaPor(ruta, prefijos) {
    for (var i = 0; i < prefijos.length; i += 1) {
      if (ruta.lastIndexOf(prefijos[i], 0) === 0) return true;
    }
    return false;
  }

  /* Una respuesta con Vary: Cookie es de ALGUIEN, no de todos. Guardarla en un
     disco compartido por varias sesiones del mismo navegador es el fallo de
     privacidad clásico de las PWA, y la coincidencia por Vary del Cache API NO
     protege de ello: "Cookie" es un nombre de cabecera prohibido, así que nunca
     aparece en request.headers y el Cache API acaba comparando null con null y
     dando por bueno cualquier match. La única defensa real es no guardarla. */
  function varyVenenoso(respuesta) {
    var vary = respuesta.headers ? respuesta.headers.get("vary") : null;
    if (!vary) return false;
    var partes = vary.split(",");
    for (var i = 0; i < partes.length; i += 1) {
      if (VARY_VENENOSO.indexOf(partes[i].trim().toLowerCase()) !== -1) return true;
    }
    return false;
  }

  /* La regla para lo que el worker DESCUBRE navegando. Sólo 200 —un 206 parcial
     guardado entero se sirve luego como si fuera el archivo completo— y nunca
     opaca: una respuesta opaca tiene status 0 y cuerpo ilegible, así que
     guardarla es guardar un fallo con aspecto de éxito, y además ocupa cuota
     por su tamaño real sin poder inspeccionarse. */
  function seGuarda(respuesta) {
    if (!respuesta) return false;
    if (respuesta.status !== 200) return false;
    if (respuesta.type === "opaque" || respuesta.type === "opaqueredirect") return false;
    if (varyVenenoso(respuesta)) return false;
    return true;
  }

  /* ── El cascarón declarado ────────────────────────────────────────────── */

  /* Distinto de seGuarda a propósito: estas URL están DECLARADAS en la política,
     no descubiertas navegando, así que la comprobación de Vary no aplica.
     /sin-conexion se renderiza bajo demanda porque el idioma sale de la cookie
     valle_locale, y exigirle ausencia de Vary sería negarse a precachear la
     única página que este worker existe para servir. Lo que sí se exige es 200:
     precachear un 404 es peor que no precachear nada. */
  async function guardarDeclarado(cache, url) {
    var respuesta = await fetch(url, { cache: "reload" });
    if (!respuesta || respuesta.status !== 200) {
      throw new Error(
        "cascaron: " + url + " respondio " + (respuesta ? respuesta.status : "nada"),
      );
    }
    await cache.put(url, respuesta);
    return respuesta;
  }

  /* Tras una navegación que SÍ llegó a la red, refresca la copia de
     /sin-conexion si ya pasó su margen. Sin esto la pantalla de emergencia se
     congelaría en la versión del día en que se instaló el worker, porque
     install sólo vuelve a correr cuando cambian los bytes de /sw. El reloj sale
     de la cabecera Date de la propia copia guardada: cero estado, cero
     IndexedDB, nada que sincronizar entre pestañas. */
  async function refrescarCascaron() {
    var cache = await caches.open(CACHE);
    var guardada = await cache.match(OFFLINE, { ignoreVary: true });
    if (guardada && guardada.headers) {
      var fecha = Date.parse(guardada.headers.get("date") || "");
      if (isFinite(fecha) && Date.now() - fecha < REFRESCO_MS) return false;
    }
    await guardarDeclarado(cache, OFFLINE);
    return true;
  }

  /* ── Estrategias ──────────────────────────────────────────────────────── */

  /* NAVEGACIÓN: red primero, caché después, cascarón al final.

     El ignoreVary del último match es load-bearing por UNA razón concreta, y
     vale la pena escribirla porque la razón que uno supone es la equivocada.
     No es que las cabeceras difieran: el cascarón se guarda y se busca con la
     misma CADENA, así que las dos peticiones se fabrican sin cabeceras y
     cualquier Vary sobre un nombre visible cuadraría solo. Es "Vary: *": el
     algoritmo de coincidencia del Cache API devuelve «no hay match» para una
     respuesta con Vary: * pase lo que pase, sin comparar nada. Basta con que un
     proxy o un CDN delante de Next le ponga esa cabecera a /sin-conexion para
     que la pantalla de emergencia quede guardada pero inalcanzable, justo el
     día que hace falta. ignoreVary desactiva ese algoritmo entero. */
  async function navegar(peticion, evento) {
    try {
      var respuesta = await fetch(peticion);
      if (seGuarda(respuesta)) {
        var cache = await caches.open(CACHE);
        await cache.put(peticion, respuesta.clone());
      }
      if (evento && evento.waitUntil) {
        evento.waitUntil(refrescarCascaron().catch(function () {}));
      }
      return respuesta;
    } catch (error) {
      var almacen = await caches.open(CACHE);
      /* Este match SÍ respeta Vary, al revés que el del cascarón. Lo que hay
         guardado aquí lo DESCUBRIÓ el worker navegando, no se declaró en la
         política, así que su Vary es información legítima del servidor y hay
         que obedecerla. Next sirve las rutas del App Router con
         "Vary: rsc, next-router-state-tree, next-router-prefetch,
         next-router-segment-prefetch, Accept-Encoding" —medido contra el
         servidor de verdad—, y ninguna de esas cabeceras la ve el worker en una
         navegación, así que la coincidencia cuadra. Si algún día no cuadrase,
         el efecto sería caer al cascarón en vez de a la copia: peor pantalla,
         nunca la pantalla de otra persona. Se prefiere ese fallo. */
      var copia = await almacen.match(peticion);
      if (copia) return copia;
      var cascaron = await almacen.match(OFFLINE, { ignoreVary: true });
      if (cascaron) return cascaron;
      /* Ni red, ni copia, ni cascarón: la primera visita de este navegador fue
         sin conexión. Se propaga el error de red tal cual —la página de error
         del navegador— porque inventar aquí una respuesta 503 con HTML escrito
         a mano dentro del worker sería exactamente el color suelto que el
         sistema de diseño prohíbe, y encima mentiría sobre por qué falló. */
      throw error;
    }
  }

  /* INMUTABLES: se devuelve la copia al instante y se revalida por detrás. El
     waitUntil mantiene viva la revalidación aunque el navegador ya haya pintado
     y quiera dormir el worker. */
  async function inmutable(peticion, evento) {
    var cache = await caches.open(CACHE);
    var copia = await cache.match(peticion, { ignoreVary: true });
    var revalidacion = (async function () {
      var respuesta = await fetch(peticion);
      if (seGuarda(respuesta)) await cache.put(peticion, respuesta.clone());
      return respuesta;
    })();
    if (copia) {
      if (evento && evento.waitUntil) {
        evento.waitUntil(revalidacion.catch(function () {}));
      } else {
        revalidacion.catch(function () {});
      }
      return copia;
    }
    return revalidacion;
  }

  /* CASCARÓN: caché primero. Icono, manifiesto y fuentes precargadas cambian de
     URL cuando cambian de contenido o los repone el refresco de install. */
  async function desdeCascaron(peticion, ruta) {
    var cache = await caches.open(CACHE);
    var copia = await cache.match(ruta, { ignoreVary: true });
    if (copia) return copia;
    return fetch(peticion);
  }

  /* ── Ciclo de vida ────────────────────────────────────────────────────── */

  self.addEventListener("install", function (evento) {
    evento.waitUntil(
      (async function () {
        var cache = await caches.open(CACHE);
        /* Todo-o-nada, y a propósito. Media caché produce una pantalla sin
           tipografía ni icono que el usuario lee como «el producto está roto»
           en vez de «no hay red». Si el cascarón no se puede guardar entero,
           mejor que no haya worker: la aplicación sigue funcionando con red y
           el navegador reintentará la instalación en la siguiente visita. */
        await Promise.all(
          PRECACHE.map(function (url) {
            return guardarDeclarado(cache, url);
          }),
        );
        /* skipWaiting sin esperar a que cierren las pestañas: este worker no
           tiene formato de datos propio del que una pestaña vieja pueda
           depender —sólo guarda respuestas HTTP—, así que no hay migración que
           coordinar y sí hay una pantalla de emergencia que conviene tener
           cuanto antes. */
        await self.skipWaiting();
      })(),
    );
  });

  self.addEventListener("activate", function (evento) {
    evento.waitUntil(
      (async function () {
        var nombres = await caches.keys();
        /* Cualquier caché que no sea la vigente sobra: el nombre lleva la huella
           de la política, así que una caché con otro nombre es de una política
           anterior por definición. Sin esta purga, cada cambio de la lista de
           precacheo dejaría un cascarón entero abandonado ocupando la cuota del
           origen hasta que el navegador la reclamase por presión de disco. */
        await Promise.all(
          nombres.map(function (nombre) {
            return nombre === CACHE ? Promise.resolve(false) : caches.delete(nombre);
          }),
        );
        await clients.claim();
      })(),
    );
  });

  /* EL RELEVO A PETICIÓN DE LA PÁGINA. El aviso de versión nueva
     (ServiceWorkerRegistrar.tsx) manda este mensaje al worker EN ESPERA cuando
     el usuario pulsa «recargar». Un worker que ya está activo lo recibe también
     y su skipWaiting no hace nada, que es lo correcto: el mensaje no es una
     orden de tomar el mando, es un permiso para dejar de esperar.

     Cualquier otro mensaje se ignora sin responder. Este canal tiene un solo
     mensaje y nada de lo que llegue por él se guarda ni se reenvía: un worker
     que acepta instrucciones de la página es un worker que cualquier script de
     la página puede reprogramar. */
  self.addEventListener("message", function (evento) {
    if (evento && evento.data === SALTAR_ESPERA) self.skipWaiting();
  });

  self.addEventListener("fetch", function (evento) {
    var peticion = evento.request;

    /* 1 · LO QUE NO SE INTERCEPTA. Sin respondWith el navegador hace su
       petición normal, exactamente como si este archivo no existiera. */
    if (peticion.method !== "GET") return;
    var url;
    try {
      url = new URL(peticion.url);
    } catch (error) {
      return;
    }
    if (url.origin !== self.location.origin) return;
    if (empiezaPor(url.pathname, NUNCA)) return;

    /* 2 · NAVEGACIÓN. */
    if (peticion.mode === "navigate") {
      evento.respondWith(navegar(peticion, evento));
      return;
    }

    /* 3 · INMUTABLES POR HASH. */
    if (empiezaPor(url.pathname, INMUTABLES)) {
      evento.respondWith(inmutable(peticion, evento));
      return;
    }

    /* 4 · CASCARÓN DECLARADO. */
    if (PRECACHE.indexOf(url.pathname) !== -1) {
      evento.respondWith(desdeCascaron(peticion, url.pathname));
      return;
    }

    /* Todo lo demás: la red, sin worker de por medio. */
  });
})();
`;
