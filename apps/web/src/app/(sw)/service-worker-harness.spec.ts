/**
 * EL BANCO DE PRUEBAS DEL SERVICE WORKER.
 *
 * ## La regla que hace que este archivo valga algo
 *
 * **Los bytes que se prueban son los bytes que se sirven.** El spec llama al
 * `GET` de `src/app/(sw)/sw/route.ts`, lee el cuerpo de la respuesta y ejecuta
 * ESA CADENA con `new Function`, pasándole dobles de `self`, `caches`, `fetch`
 * y `clients`. No hay una reimplementación de la política dentro del test que
 * pueda irse separando de la que corre en el navegador: si la ruta empieza a
 * servir otra cosa, esto ejecuta la otra cosa.
 *
 * Es la diferencia entre probar un service worker y probar una idea sobre un
 * service worker. Un worker mal servido no da error: el navegador rechaza el
 * registro en silencio, la aplicación funciona con red y nadie se entera hasta
 * que alguien pierde la conexión y ve la página del dinosaurio.
 *
 * ## Por qué los dobles y no `Request` de verdad
 *
 * `new Request(url, { mode: "navigate" })` LANZA por especificación: sólo el
 * navegador puede fabricar una petición de navegación. Como `mode ===
 * "navigate"` es justo la bifurcación principal del worker, aquí la petición es
 * un objeto llano con `url`, `method`, `mode` y `headers`. Lo que sí son de
 * verdad son las `Response` y las `Headers`, que es donde vive la lógica que
 * importa (`status`, `type`, `Vary`).
 *
 * El doble de `caches` implementa la coincidencia por `Vary` de verdad —no la
 * ignora— porque `ignoreVary: true` en el rescate de `/sin-conexion` es
 * load-bearing y un doble que ignorase `Vary` siempre lo daría por bueno sin
 * probarlo.
 *
 * ## Lo que este spec NO demuestra
 *
 * Que el estudio entero abra sin red. Esto es caché en TIEMPO DE EJECUCIÓN, sin
 * manifiesto de build: la afirmación honesta es «abre sin red DESPUÉS de
 * haberse abierto una vez con red», y así está escrita en la copia de
 * `/sin-conexion`. Lo que aquí se prueba es la POLÍTICA sobre los bytes.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { GET } from "./sw/route";
import {
  SW_CACHE_NAME,
  SW_HEADERS,
  SW_MENSAJE_SALTAR_ESPERA,
  SW_OFFLINE_URL,
  SW_PRECACHE_URLS,
} from "./service-worker-policy";
import { SERVICE_WORKER_SOURCE } from "./service-worker-source";

const ORIGEN = "https://estudio.valle.test";
const absoluta = (ruta: string) => new URL(ruta, ORIGEN).toString();

/* ── Los bytes servidos ──────────────────────────────────────────────────── */

const respuestaDeLaRuta = GET();
/**
 * `apps/web` es CommonJS, así que no hay `await` de nivel superior: el cuerpo
 * del spec vive dentro de `principal()` y esta variable se llena ahí, antes de
 * que `montar()` la necesite.
 */
let FUENTE = "";

/* ── Dobles del entorno del service worker ──────────────────────────────── */

interface PeticionDoble {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
}

/** Una `Response` de verdad, o el objeto mínimo que hace falta para simular una opaca. */
interface RespuestaDoble {
  status: number;
  type?: string;
  headers: Headers;
  clone?: () => RespuestaDoble;
  text?: () => Promise<string>;
}

const peticion = (
  ruta: string,
  opciones: { method?: string; mode?: string; headers?: Record<string, string> } = {},
): PeticionDoble => ({
  url: absoluta(ruta),
  method: opciones.method ?? "GET",
  mode: opciones.mode ?? "no-cors",
  headers: new Headers(opciones.headers ?? {}),
});

const navegacion = (ruta: string, cabeceras?: Record<string, string>) =>
  peticion(ruta, { mode: "navigate", headers: cabeceras });

const clave = (entrada: string | PeticionDoble) =>
  absoluta(typeof entrada === "string" ? entrada : entrada.url);

const cabecerasDe = (entrada: string | PeticionDoble) =>
  typeof entrada === "string" ? new Headers() : entrada.headers;

interface Guardada {
  cabeceras: Headers;
  respuesta: RespuestaDoble;
}

/** ¿Coincide la entrada guardada con esta petición según su propio `Vary`? */
function cuadraVary(guardada: Guardada, cabeceras: Headers): boolean {
  const vary = guardada.respuesta.headers.get("vary");
  if (!vary) return true;
  if (vary.trim() === "*") return false;
  return vary.split(",").every((nombre) => {
    const clave = nombre.trim().toLowerCase();
    return (guardada.cabeceras.get(clave) ?? "") === (cabeceras.get(clave) ?? "");
  });
}

class CacheDoble {
  readonly entradas = new Map<string, Guardada>();
  /** Toda URL que alguien intentó leer. Es lo que prueba que `/v1/` ni se mira. */
  readonly consultas: string[] = [];

  async match(
    entrada: string | PeticionDoble,
    opciones: { ignoreVary?: boolean } = {},
  ): Promise<RespuestaDoble | undefined> {
    const url = clave(entrada);
    this.consultas.push(url);
    const guardada = this.entradas.get(url);
    if (!guardada) return undefined;
    if (!opciones.ignoreVary && !cuadraVary(guardada, cabecerasDe(entrada))) {
      return undefined;
    }
    return guardada.respuesta;
  }

  async put(entrada: string | PeticionDoble, respuesta: RespuestaDoble): Promise<void> {
    this.entradas.set(clave(entrada), { cabeceras: cabecerasDe(entrada), respuesta });
  }

  urls(): string[] {
    return [...this.entradas.keys()].sort();
  }
}

class CachesDoble {
  readonly almacenes = new Map<string, CacheDoble>();

  async open(nombre: string): Promise<CacheDoble> {
    const existente = this.almacenes.get(nombre);
    if (existente) return existente;
    const nuevo = new CacheDoble();
    this.almacenes.set(nombre, nuevo);
    return nuevo;
  }

  async keys(): Promise<string[]> {
    return [...this.almacenes.keys()];
  }

  async delete(nombre: string): Promise<boolean> {
    return this.almacenes.delete(nombre);
  }
}

/** La red simulada: un mapa de ruta a respuesta, más un interruptor de corte. */
class Red {
  caida = false;
  readonly pedidas: string[] = [];
  readonly recargas: string[] = [];
  readonly rutas = new Map<string, () => RespuestaDoble>();

  responder = async (
    entrada: string | PeticionDoble,
    init?: { cache?: string },
  ): Promise<RespuestaDoble> => {
    const url = clave(entrada);
    this.pedidas.push(url);
    if (init?.cache === "reload") this.recargas.push(url);
    if (this.caida) throw new TypeError("Failed to fetch");
    const constructor = this.rutas.get(new URL(url).pathname);
    if (!constructor) throw new TypeError(`Failed to fetch: sin ruta para ${url}`);
    return constructor();
  };
}

const html = (cuerpo: string, cabeceras: Record<string, string> = {}) =>
  new Response(cuerpo, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...cabeceras },
  }) as unknown as RespuestaDoble;

interface Entorno {
  self: {
    location: { origin: string };
    oyentes: Map<string, (evento: unknown) => void>;
    addEventListener: (tipo: string, oyente: (evento: unknown) => void) => void;
    skipWaiting: () => Promise<void>;
  };
  caches: CachesDoble;
  clients: { claim: () => Promise<void>; llamadas: number };
  red: Red;
  saltos: { skipWaiting: number };
}

/**
 * Compila y ARRANCA el worker servido. Todo lo que el cuerpo toca del entorno
 * global entra por estos cuatro parámetros; si el worker empezara a usar algo
 * más —`indexedDB`, `importScripts`— reventaría aquí, que es lo correcto: un
 * service worker que necesita más superficie merece que alguien lo mire.
 */
function montar(): Entorno {
  const red = new Red();
  const saltos = { skipWaiting: 0 };
  const oyentes = new Map<string, (evento: unknown) => void>();
  const clients = {
    llamadas: 0,
    claim: async () => {
      clients.llamadas += 1;
    },
  };
  const entorno: Entorno = {
    self: {
      location: { origin: ORIGEN },
      oyentes,
      addEventListener: (tipo, oyente) => oyentes.set(tipo, oyente),
      skipWaiting: async () => {
        saltos.skipWaiting += 1;
      },
    },
    caches: new CachesDoble(),
    clients,
    red,
    saltos,
  };
  const arrancar = new Function("self", "caches", "fetch", "clients", FUENTE);
  arrancar(entorno.self, entorno.caches, red.responder, entorno.clients);
  return entorno;
}

/** Rellena la red con todo lo que el precacheo va a pedir. */
function servirCascaron(red: Red, cuerpo = "OFFLINE v1", cabeceras: Record<string, string> = {}) {
  for (const ruta of SW_PRECACHE_URLS) {
    red.rutas.set(ruta, () =>
      ruta === SW_OFFLINE_URL ? html(cuerpo, cabeceras) : html(`recurso ${ruta}`),
    );
  }
}

async function ciclo(entorno: Entorno, tipo: "install" | "activate"): Promise<void> {
  const oyente = entorno.self.oyentes.get(tipo);
  assert.ok(oyente, `el worker no registró un oyente de ${tipo}`);
  const pendientes: Promise<unknown>[] = [];
  oyente({ waitUntil: (p: Promise<unknown>) => pendientes.push(p) });
  await Promise.all(pendientes);
}

interface Despacho {
  interceptada: boolean;
  promesa: Promise<RespuestaDoble>;
  pendientes: Promise<unknown>[];
}

/**
 * Emite un `fetch` y modela lo que hace el NAVEGADOR: si el worker no llama a
 * `respondWith`, la petición sale a la red igual que si el worker no existiera.
 * Esa rama es la que prueba que `/v1/*` y los métodos que no son GET quedan
 * fuera, y por eso el doble tiene que reproducirla en vez de devolver vacío.
 */
function despachar(entorno: Entorno, peticionDoble: PeticionDoble): Despacho {
  const oyente = entorno.self.oyentes.get("fetch");
  assert.ok(oyente, "el worker no registró un oyente de fetch");
  let respondida: Promise<RespuestaDoble> | undefined;
  const pendientes: Promise<unknown>[] = [];
  oyente({
    request: peticionDoble,
    respondWith: (p: Promise<RespuestaDoble>) => {
      respondida = Promise.resolve(p);
    },
    waitUntil: (p: Promise<unknown>) => pendientes.push(p),
  });
  const interceptada = respondida !== undefined;
  const promesa = respondida ?? entorno.red.responder(peticionDoble);
  // El test decide si le importa el rechazo; sin esto Node aborta por
  // «unhandled rejection» en los casos donde sólo se comprueba que NO se
  // interceptó.
  promesa.catch(() => undefined);
  return { interceptada, promesa, pendientes };
}

const cuerpoDe = async (respuesta: RespuestaDoble) =>
  respuesta.text ? await respuesta.text() : "";

let comprobaciones = 0;
const ok = () => {
  comprobaciones += 1;
};

/* ────────────────────────────────────────────────────────────────────────── */

async function principal(): Promise<void> {
  FUENTE = await respuestaDeLaRuta.text();

  /* ── 0 · LA RUTA SIRVE EL SCRIPT CON LAS CABECERAS QUE EL NAVEGADOR EXIGE ── */
  {
    assert.equal(
      FUENTE,
      SERVICE_WORKER_SOURCE,
      "la ruta /sw no está sirviendo la constante del módulo",
    );
    assert.equal(
      respuestaDeLaRuta.headers.get("content-type"),
      SW_HEADERS["Content-Type"],
      "sin Content-Type de JavaScript el navegador rechaza el registro con «unsupported MIME type»",
    );
    assert.equal(respuestaDeLaRuta.headers.get("service-worker-allowed"), "/");
    assert.equal(respuestaDeLaRuta.headers.get("cache-control"), "no-cache");
    assert.ok(
      !/\bimport\s|\bexport\s/.test(FUENTE),
      "el worker se registra como clásico: sin import/export en el cuerpo",
    );
    ok();
  }

  /* ── 1 · INSTALL PRECACHEA LA LISTA DECLARADA, ENTERA O NADA ─────────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    await ciclo(entorno, "install");

    const cache = await entorno.caches.open(SW_CACHE_NAME);
    assert.deepEqual(
      cache.urls(),
      [...SW_PRECACHE_URLS].map(absoluta).sort(),
      "el precacheo no guardó exactamente la lista declarada en la política",
    );
    assert.equal(
      entorno.caches.almacenes.size,
      1,
      "install abrió más de una caché: la unidad de invalidación es una sola",
    );
    assert.equal(entorno.saltos.skipWaiting, 1, "install debe llamar a skipWaiting");
    assert.deepEqual(
      [...entorno.red.recargas].sort(),
      [...SW_PRECACHE_URLS].map(absoluta).sort(),
      "el precacheo debe pedir con cache:'reload': si no, guarda lo que ya había en la caché HTTP",
    );

    // Todo-o-nada: un 404 en una sola URL tiene que tumbar la instalación. Media
    // caché sirve una pantalla sin tipografía que se lee como producto roto.
    const roto = montar();
    servirCascaron(roto.red);
    roto.red.rutas.set(
      SW_PRECACHE_URLS[1],
      () => new Response("", { status: 404 }) as unknown as RespuestaDoble,
    );
    await assert.rejects(
      ciclo(roto, "install"),
      /cascaron/,
      "una URL del cascarón que no existe debe hacer fallar install entero",
    );
    ok();
  }

  /* ── 2 · NAVEGACIÓN SIN RED → LA COPIA CACHEADA ─────────────────────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    let despliegue = 1;
    entorno.red.rutas.set("/dashboard", () => html(`TABLERO v${despliegue}`));
    await ciclo(entorno, "install");

    const conRed = despachar(entorno, navegacion("/dashboard"));
    assert.ok(conRed.interceptada, "una navegación debe pasar por el worker");
    assert.equal(await cuerpoDe(await conRed.promesa), "TABLERO v1");
    await Promise.allSettled(conRed.pendientes);

    // LA RED MANDA, y esta comprobación es la que separa `network-first` de
    // `cache-first`. Con la copia ya guardada y la red en pie, la navegación
    // tiene que traer el HTML NUEVO. Un worker que sirviera la caché primero
    // pasaría el resto de este bloque sin despeinarse y dejaría a todo el mundo
    // clavado en el despliegue del día que instaló el worker — el fallo clásico
    // de PWA, y el que hace que la gente desconfíe de instalarlas.
    despliegue = 2;
    const trasDesplegar = despachar(entorno, navegacion("/dashboard"));
    assert.equal(
      await cuerpoDe(await trasDesplegar.promesa),
      "TABLERO v2",
      "una navegación con red debe traer el HTML nuevo, no la copia guardada",
    );
    await Promise.allSettled(trasDesplegar.pendientes);

    entorno.red.caida = true;
    const sinRed = despachar(entorno, navegacion("/dashboard"));
    assert.equal(
      await cuerpoDe(await sinRed.promesa),
      "TABLERO v2",
      "con la red caída, una navegación ya visitada debe salir de la caché — y con la última copia, no con la primera",
    );

    // EL CASCARÓN DECLARADO, cache-first. El icono y el manifiesto no cuelgan de
    // ningún prefijo inmutable, así que si el worker no reconociera su propia
    // lista de precacheo los guardaría en install y no los serviría nunca.
    const icono = despachar(entorno, peticion("/icon"));
    assert.ok(icono.interceptada, "el worker no reconoce las URL de su cascarón");
    assert.equal(await cuerpoDe(await icono.promesa), "recurso /icon");
    ok();
  }

  /* ── 3 · NAVEGACIÓN SIN RED Y SIN COPIA → /sin-conexion ─────────────────── */
  {
    const entorno = montar();
    // El cascarón se guarda con `Vary: *`, que es lo que puede ponerle delante un
    // proxy o un CDN. Es EL caso que hace load-bearing al `ignoreVary` del
    // rescate: el algoritmo de coincidencia del Cache API se niega a devolver
    // nada para una respuesta con `Vary: *` sin llegar a comparar cabeceras, así
    // que sin `ignoreVary` la pantalla de emergencia queda guardada pero
    // inalcanzable — el peor de los estados, porque parece que está.
    servirCascaron(entorno.red, "OFFLINE v1", { Vary: "*" });
    await ciclo(entorno, "install");
    entorno.red.caida = true;

    const nunca = despachar(
      entorno,
      navegacion("/studio/2f4c8e10-0000-4000-8000-000000000001", {
        Accept: "text/html,application/xhtml+xml",
      }),
    );
    assert.ok(nunca.interceptada);
    assert.equal(
      await cuerpoDe(await nunca.promesa),
      "OFFLINE v1",
      "sin copia propia, la navegación tiene que caer en /sin-conexion",
    );

    // Y si tampoco hay cascarón (primera visita del navegador, ya sin red), el
    // error de red se propaga tal cual en vez de inventarse una respuesta.
    const virgen = montar();
    virgen.red.caida = true;
    const seco = despachar(virgen, navegacion("/dashboard"));
    await assert.rejects(
      seco.promesa,
      /Failed to fetch/,
      "sin red, sin copia y sin cascarón el worker debe propagar el fallo de red",
    );
    ok();
  }

  /* ── 4 · /v1/* NI SE MIRA NI SE GUARDA, Y SU ERROR VIAJA ENTERO ─────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    entorno.red.rutas.set("/v1/cad/documents/x", () => html('{"documento":"real"}'));
    await ciclo(entorno, "install");

    // Con red: el worker no toca la petición y no guarda nada nuevo.
    const cache = await entorno.caches.open(SW_CACHE_NAME);
    const antes = cache.urls();
    const conRed = despachar(entorno, peticion("/v1/cad/documents/x"));
    assert.equal(
      conRed.interceptada,
      false,
      "el worker no debe interceptar /v1/*: no basta con no guardar, hay que no mirar",
    );
    assert.equal(await cuerpoDe(await conRed.promesa), '{"documento":"real"}');
    assert.deepEqual(cache.urls(), antes, "una respuesta de /v1/* acabó en la caché");

    // Aunque la caché estuviera ENVENENADA con una copia vieja del documento y la
    // red se caiga, el worker no la sirve: propaga el fallo para que
    // document-lifecycle/connectivity.ts marque el guardado pendiente en vez de
    // creerse que guardó.
    await cache.put(peticion("/v1/cad/documents/x"), html('{"documento":"VIEJO"}'));
    const consultasPrevias = cache.consultas.length;
    entorno.red.caida = true;
    const sinRed = despachar(entorno, peticion("/v1/cad/documents/x"));
    assert.equal(sinRed.interceptada, false);
    await assert.rejects(
      sinRed.promesa,
      /Failed to fetch/,
      "el error de /v1/* con la red caída tiene que llegar crudo a la aplicación",
    );
    assert.deepEqual(
      cache.consultas.slice(consultasPrevias),
      [],
      "el worker consultó la caché para una URL de /v1/*",
    );

    // Y la forma que de verdad necesita el guardia: una NAVEGACIÓN a /v1/*.
    // Un enlace de revisión abierto en una pestaña llega como navegación, y sin
    // el guardia caería en `network-first` — que guarda el HTML y, sin red,
    // sirve el documento de otro o el cascarón en lugar del error real.
    const comoNavegacion = despachar(entorno, navegacion("/v1/cad/documents/x"));
    assert.equal(
      comoNavegacion.interceptada,
      false,
      "una navegación a /v1/* tampoco puede pasar por la caché del worker",
    );
    await assert.rejects(comoNavegacion.promesa, /Failed to fetch/);

    // Y lo mismo para otro origen: la API vive fuera (connect-src * en
    // next.config.ts), así que su host ni siquiera comparte el prefijo /v1/.
    const ajena = despachar(entorno, peticion("https://api.otro.example/_next/static/a.js"));
    assert.equal(
      ajena.interceptada,
      false,
      "el worker sólo gobierna su propio origen",
    );
    await assert.rejects(ajena.promesa);
    ok();
  }

  /* ── 5 · NINGÚN MÉTODO DISTINTO DE GET ENTRA A CACHÉ ────────────────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    entorno.red.rutas.set("/dashboard", () => html("TABLERO"));
    await ciclo(entorno, "install");
    const cache = await entorno.caches.open(SW_CACHE_NAME);
    const antes = cache.urls();

    // Un POST de navegación es un caso REAL —el envío de un formulario— y es
    // justo el que se cuela cuando la comprobación de método se hace tarde.
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      const envio = despachar(
        entorno,
        peticion("/dashboard", { method: metodo, mode: "navigate" }),
      );
      assert.equal(
        envio.interceptada,
        false,
        `el worker interceptó un ${metodo}: sólo GET pasa por la caché`,
      );
      await envio.promesa;
    }
    assert.deepEqual(cache.urls(), antes, "un método distinto de GET escribió en la caché");
    ok();
  }

  /* ── 6 · ACTIVATE DEJA EXACTAMENTE UNA CACHÉ ────────────────────────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    // Dos cachés de políticas anteriores, más una de un nombre ajeno: todas
    // sobran, porque el nombre lleva la huella de la política vigente.
    await entorno.caches.open("valle-design-cascaron-1-deadbeef");
    await entorno.caches.open("valle-design-cascaron-0-00000000");
    await entorno.caches.open("restos-de-otra-campana");
    await ciclo(entorno, "install");
    await ciclo(entorno, "activate");

    assert.deepEqual(
      await entorno.caches.keys(),
      [SW_CACHE_NAME],
      "activate debe dejar sólo la caché de la versión vigente",
    );
    assert.equal(entorno.clients.llamadas, 1, "activate debe reclamar los clientes");
    ok();
  }

  /* ── 7 · LO PERSONALIZADO Y LO OPACO NO SE GUARDAN ──────────────────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    entorno.red.rutas.set("/cuenta", () => html("CUENTA DE ALGUIEN", { Vary: "Cookie" }));
    // Con `clone()` de verdad: sin él, quitar el guardia de opacas reventaría con
    // un TypeError en vez de con la aserción que explica qué se rompió.
    const opaca = (): RespuestaDoble => ({
      status: 200,
      type: "opaque",
      headers: new Headers(),
      clone: opaca,
      text: async () => "",
    });
    entorno.red.rutas.set("/_next/static/chunk.opaca.js", opaca);
    entorno.red.rutas.set("/precios", () =>
      new Response("REDIRIGIDO", { status: 302 }) as unknown as RespuestaDoble,
    );
    await ciclo(entorno, "install");
    const cache = await entorno.caches.open(SW_CACHE_NAME);
    const antes = cache.urls();

    for (const despacho of [
      despachar(entorno, navegacion("/cuenta", { Cookie: "__Host-valle_session=a" })),
      despachar(entorno, navegacion("/precios")),
      despachar(entorno, peticion("/_next/static/chunk.opaca.js")),
    ]) {
      await despacho.promesa;
      await Promise.allSettled(despacho.pendientes);
    }

    assert.deepEqual(
      cache.urls(),
      antes,
      "se guardó una respuesta personalizada (Vary: Cookie), opaca o no-200",
    );

    // Y la consecuencia que importa: sin red, /cuenta no sirve el HTML de la otra
    // sesión — sirve el cascarón.
    entorno.red.caida = true;
    const sinRed = despachar(
      entorno,
      navegacion("/cuenta", { Cookie: "__Host-valle_session=b" }),
    );
    assert.equal(await cuerpoDe(await sinRed.promesa), "OFFLINE v1");
    ok();
  }

  /* ── 8 · INMUTABLES: COPIA AL INSTANTE Y REVALIDACIÓN POR DETRÁS ────────── */
  {
    const entorno = montar();
    servirCascaron(entorno.red);
    let version = 1;
    entorno.red.rutas.set("/_next/static/chunks/estudio.9f2a.js", () =>
      new Response(`chunk v${version}`, {
        status: 200,
        headers: { "Content-Type": "text/javascript" },
      }) as unknown as RespuestaDoble,
    );
    await ciclo(entorno, "install");

    const chunk = peticion("/_next/static/chunks/estudio.9f2a.js");
    const primera = despachar(entorno, chunk);
    assert.ok(primera.interceptada);
    assert.equal(await cuerpoDe(await primera.promesa), "chunk v1");
    await Promise.allSettled(primera.pendientes);

    version = 2;
    const segunda = despachar(entorno, chunk);
    assert.equal(
      await cuerpoDe(await segunda.promesa),
      "chunk v1",
      "stale-while-revalidate devuelve la copia guardada, no espera a la red",
    );
    await Promise.allSettled(segunda.pendientes);

    const tercera = despachar(entorno, chunk);
    assert.equal(
      await cuerpoDe(await tercera.promesa),
      "chunk v2",
      "la revalidación de la petición anterior tenía que haber refrescado la copia",
    );
    await Promise.allSettled(tercera.pendientes);

    // Y sin red sigue sirviendo: es lo que hace que el estudio vuelva a abrir.
    entorno.red.caida = true;
    const sinRed = despachar(entorno, chunk);
    assert.equal(await cuerpoDe(await sinRed.promesa), "chunk v2");
    ok();
  }

  /* ── 9 · EL CASCARÓN SE REFRESCA, PERO NO EN CADA NAVEGACIÓN ────────────── */
  {
    const entorno = montar();
    let generacion = 1;
    for (const ruta of SW_PRECACHE_URLS) {
      entorno.red.rutas.set(ruta, () =>
        ruta === SW_OFFLINE_URL
          ? // Sin cabecera Date: es el caso en que el worker no puede saber cuándo
            // guardó la copia, y entonces refresca. Un throttle que se equivoca
            // debe equivocarse pidiendo de más, no sirviendo una pantalla de hace
            // seis meses.
            html(`OFFLINE v${generacion}`)
          : html(`recurso ${ruta}`),
      );
    }
    entorno.red.rutas.set("/dashboard", () => html("TABLERO"));
    await ciclo(entorno, "install");

    generacion = 2;
    const navegada = despachar(entorno, navegacion("/dashboard"));
    await navegada.promesa;
    await Promise.allSettled(navegada.pendientes);

    entorno.red.caida = true;
    const rescate = despachar(entorno, navegacion("/reportes"));
    assert.equal(
      await cuerpoDe(await rescate.promesa),
      "OFFLINE v2",
      "tras una navegación con red, la copia del cascarón debe haberse refrescado",
    );

    // Con una copia fechada AHORA, el margen manda y no se vuelve a pedir.
    const fresco = montar();
    servirCascaron(fresco.red, "OFFLINE fresco", { Date: new Date().toUTCString() });
    fresco.red.rutas.set("/dashboard", () => html("TABLERO"));
    await ciclo(fresco, "install");
    const pedidasTrasInstalar = fresco.red.pedidas.length;
    const conRed = despachar(fresco, navegacion("/dashboard"));
    await conRed.promesa;
    await Promise.allSettled(conRed.pendientes);
    assert.equal(
      fresco.red.pedidas.length - pedidasTrasInstalar,
      1,
      "con la copia fresca, una navegación sólo debe generar SU petición",
    );
    ok();
  }

  /* ── 10 · EL RELEVO QUE PIDE LA PÁGINA ──────────────────────────────────────
     El aviso de versión nueva (`ServiceWorkerRegistrar.tsx`) manda UN mensaje al
     worker en espera cuando el usuario pulsa «recargar». Si el worker no lo
     escuchara, el botón no haría nada y la página se quedaría esperando un
     `controllerchange` que no llega — un fallo mudo, porque `postMessage` a un
     worker sin oyente no da error. Y al revés: cualquier otro mensaje tiene que
     dejarlo indiferente, porque este canal es la única superficie por la que un
     script de la página le habla al worker. */
  {
    const entorno = montar();
    const oyente = entorno.self.oyentes.get("message");
    assert.ok(
      oyente,
      "el worker no escucha mensajes: el botón «recargar» del aviso no tendría cómo pedir el relevo",
    );
    oyente({});
    oyente({ data: null });
    oyente({ data: { tipo: SW_MENSAJE_SALTAR_ESPERA } });
    oyente({ data: "valle:otra-cosa" });
    assert.equal(
      entorno.saltos.skipWaiting,
      0,
      "ni un mensaje vacío, ni un objeto, ni otro mensaje pueden forzar el relevo",
    );
    oyente({ data: SW_MENSAJE_SALTAR_ESPERA });
    assert.equal(entorno.saltos.skipWaiting, 1, "el mensaje declarado sí salta la espera");
    ok();
  }

  /* ── 11 · LA PREMISA DEL CACHÉ DE NAVEGACIÓN ────────────────────────────────
     Guardar el HTML de una navegación sólo es seguro mientras ese HTML sea el
     MISMO para todo el mundo. Hoy lo es: ninguna página ni layout de `src/app`
     lee cookies o cabeceras en el servidor —el tablero y el estudio son
     componentes de cliente que piden sus datos a `/v1/*`—, así que el HTML no
     lleva identidad de nadie. La única variación server-side es el idioma, que
     sale de la cookie `valle_locale` en `src/i18n/request.ts`, y esa consecuencia
     está declarada en la cabecera de `/sin-conexion`.

     Si algún día una página empieza a renderizar datos de sesión en el servidor,
     esta caché pasaría a guardar la pantalla de una persona en el disco de otra.
     Hay dos salidas y ninguna es relajar esta comprobación: que esa ruta emita
     `Vary: Cookie` (el worker ya se niega a guardarla, regla 7), o que se declare
     aquí con su motivo. */
  {
    const raizApp = path.resolve("src/app");
    const paginas = readdirSync(raizApp, { recursive: true, encoding: "utf8" }).filter(
      (relativa) => /(?:^|\/)(?:page|layout)\.tsx$/.test(relativa),
    );
    assert.ok(paginas.length > 20, `sólo se encontraron ${paginas.length} páginas: el barrido falló`);

    const CON_IDENTIDAD_EN_SERVIDOR: string[] = [];
    const infractoras = paginas.filter((relativa) => {
      if (CON_IDENTIDAD_EN_SERVIDOR.includes(relativa)) return false;
      return /from\s+"next\/headers"/.test(readFileSync(path.join(raizApp, relativa), "utf8"));
    });
    assert.deepEqual(
      infractoras,
      [],
      `estas páginas leen cookies o cabeceras en el servidor, así que su HTML es personal y el caché de navegación del service worker dejaría de ser seguro: ${infractoras.join(", ")}`,
    );
    ok();
  }

  console.log(
    `service worker: ${comprobaciones} bloques verdes sobre los ${FUENTE.length} bytes que sirve /sw (caché ${SW_CACHE_NAME}).`,
  );
}

principal().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
