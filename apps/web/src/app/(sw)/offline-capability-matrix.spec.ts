/**
 * LA MATRIZ, CONTRASTADA CONTRA EL CÓDIGO QUE DESCRIBE.
 *
 * Una matriz de capacidades escrita a mano envejece en dos direcciones y las
 * dos son silenciosas: le crecen endpoints que nadie clasificó y le sobreviven
 * endpoints que ya no existen. Este archivo hace imposibles las dos, y hace
 * imposible una tercera que sólo aparece cuando la matriz se toma en serio: la
 * fila que dice «funciona sin red» sobre algo que sí toca la red.
 *
 * ## Las tres fuentes que se leen, y por qué esas
 *
 *   · `packages/contracts/specs/design-api.v1.yaml` — la AUTORIDAD. AGENTS.md
 *     lo dice con esas palabras: el YAML manda, el SDK se regenera de él. Si
 *     una familia está ahí, existe; si no está, no existe.
 *   · `apps/web/src/lib/cad/legacy/layout-http-adapter.ts` — la ÚNICA puerta
 *     del editor a la red. Todo lo que el estudio le pide al servidor pasa por
 *     ese archivo, así que sus rutas son la lista mínima que la matriz tiene
 *     que cubrir.
 *   · El árbol de cliente entero (`apps/web/src` + `packages/design-sdk/src`,
 *     sin specs ni generados) — para que la cobertura no dependa de que
 *     alguien se acuerde de mirar un archivo nuevo.
 *
 * ## La regla que hay que leer dos veces
 *
 * El propio módulo de la matriz se EXCLUYE del barrido del árbol. Si no, una
 * fila fantasma se avalaría a sí misma: el endpoint inventado aparecería «en
 * el código» porque está escrito en la lista que se está comprobando. Una
 * matriz no puede ser su propia evidencia.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MATRIZ_SIN_RED,
  PROMESAS_DE_SIN_CONEXION,
  clasificaRuta,
  endpointsClasificados,
  extraeRutasV1,
  filaDelEndpoint,
  filaPorId,
  matrizComoTexto,
  normalizaRutaV1,
  resumenSinRed,
  rutasDeclaradasEnContrato,
  tocaLaRed,
  type FilaSinRed,
} from "./offline-capability-matrix";
import { SW_NEVER_CACHE_PREFIXES } from "./service-worker-policy";

let comprobaciones = 0;
const ok = () => {
  comprobaciones += 1;
};

/** El spec corre con el cwd en `apps/web`; el contrato y el SDK están dos arriba. */
const RAIZ = "../..";
const desdeLaRaiz = (ruta: string) => join(RAIZ, ruta);

const CONTRATO = "packages/contracts/specs/design-api.v1.yaml";
const ADAPTADOR = "apps/web/src/lib/cad/legacy/layout-http-adapter.ts";
const ESTE_MODULO = "apps/web/src/app/(sw)/offline-capability-matrix.ts";

const leer = (ruta: string) => readFileSync(desdeLaRaiz(ruta), "utf8");

const declaradas = rutasDeclaradasEnContrato(leer(CONTRATO));

/* ── 1 · LA PREMISA DEL WORKER, IMPORTADA Y NO SUPUESTA ───────────────────────
   Toda esta matriz descansa en que el service worker NO toca `/v1/`: por eso un
   fallo de red llega crudo al editor y por eso «funciona sin red» sólo lo puede
   decir algo que no pase por ahí. Si alguien quitara ese prefijo de la política,
   la matriz seguiría leyéndose igual de bien y ya no describiría el producto. */
{
  assert.ok(
    SW_NEVER_CACHE_PREFIXES.includes("/v1/"),
    "la política del worker ya no declara /v1/ como intocable: la matriz describe otro producto",
  );
  assert.equal(tocaLaRed("/v1/cad/blocks"), true);
  assert.equal(tocaLaRed("/sin-conexion"), false);
  ok();
}

/* ── 2 · EL EXTRACTOR, EJERCIDO ANTES DE CONFIAR EN ÉL ────────────────────────
   Todo lo que sigue se apoya en que estas dos funciones reduzcan a la MISMA
   cadena la ruta escrita en YAML (`{documentId}`), en el SDK
   (`${documentId}`) y en un comentario (`:id`). Si eso falla, las reglas de
   abajo pasan en verde sin comparar nada. */
{
  assert.equal(normalizaRutaV1("/v1/cad/documents/{documentId}/content"), "/v1/cad/documents/:id/content");
  assert.equal(normalizaRutaV1("/v1/cad/documents/${documentId}/content"), "/v1/cad/documents/:id/content");
  assert.equal(normalizaRutaV1("/v1/cad/documents/:id/content"), "/v1/cad/documents/:id/content");
  // Una interpolación con paréntesis dentro es lo que de verdad escribe el adaptador.
  assert.equal(
    normalizaRutaV1("/v1/cad/documents/${encodeURIComponent(model)}"),
    "/v1/cad/documents/:id",
  );

  const muestra = extraeRutasV1(
    'a `${API_BASE}/v1/cad/blocks` y "/v1/cad/documents?limit=200" y /v1/cad/* y /v1/cad y /v1/auth/',
  );
  assert.deepEqual(
    muestra,
    ["/v1/auth", "/v1/cad", "/v1/cad/blocks", "/v1/cad/documents"],
    "la query string se corta, el comodín se descarta y el área desnuda sí se extrae (para poder clasificarla)",
  );

  assert.equal(clasificaRuta("/v1/cad/blocks", declaradas), "endpoint");
  assert.equal(clasificaRuta("/v1/cad", declaradas), "prefijo");
  assert.equal(clasificaRuta("/v1/cad/intent", declaradas), "desconocida");
  ok();
}

/* ── 3 · EL CONTRATO SE LEE DE VERDAD ─────────────────────────────────────────
   Un parser que devolviera cero rutas dejaría en verde todas las coberturas de
   abajo por vacuidad. Se fija un suelo y se comprueban tres anclas de áreas
   distintas del contrato. */
{
  assert.ok(declaradas.length >= 70, `el contrato declara ${declaradas.length} rutas /v1; se esperaban al menos 70`);
  for (const ancla of ["/v1/cad/documents/:id/content", "/v1/messaging/events", "/v1/auth/session"]) {
    assert.ok(declaradas.includes(ancla), `el parser del contrato perdió ${ancla}`);
  }
  assert.equal(new Set(declaradas).size, declaradas.length, "el contrato no puede declarar dos veces la misma ruta");
  ok();
}

/* ── 4 · NADA SIN VEREDICTO: LA PUERTA DEL EDITOR ─────────────────────────────
   La regla que la entrega pide con nombre y apellido. Se leen las rutas que
   aparecen en el adaptador —comentarios incluidos, porque su cabecera ES el
   mapa de rutas y envejecería igual de mal— y se exige veredicto para todas.
   De paso: ninguna puede ser `desconocida`, o sea que el adaptador no puede
   llamar a algo que el contrato no declara. */
{
  const enElAdaptador = extraeRutasV1(leer(ADAPTADOR));
  const endpointsDelAdaptador = enElAdaptador.filter(
    (ruta) => clasificaRuta(ruta, declaradas) === "endpoint",
  );

  const desconocidas = enElAdaptador.filter(
    (ruta) => clasificaRuta(ruta, declaradas) === "desconocida",
  );
  assert.deepEqual(desconocidas, [], "el adaptador nombra rutas que el contrato no declara");

  assert.ok(
    endpointsDelAdaptador.length >= 11,
    `sólo se extrajeron ${endpointsDelAdaptador.length} endpoints del adaptador; el mapa de rutas tiene más`,
  );
  for (const ancla of [
    "/v1/cad/blocks",
    "/v1/cad/documents/:id/content",
    "/v1/cad/documents/:id/archive",
    "/v1/cad/review/context",
  ]) {
    assert.ok(endpointsDelAdaptador.includes(ancla), `la extracción del adaptador perdió ${ancla}`);
  }

  const sinVeredicto = endpointsDelAdaptador.filter((ruta) => !filaDelEndpoint(ruta));
  assert.deepEqual(
    sinVeredicto,
    [],
    "hay endpoints en la puerta del editor que la matriz no clasifica",
  );

  // Y cada uno tiene que estar clasificado por una fila que CITE el adaptador:
  // clasificarlo desde otra fila cualquiera cumpliría la letra y no la intención.
  for (const ruta of endpointsDelAdaptador) {
    const fila = filaDelEndpoint(ruta) as FilaSinRed;
    assert.ok(
      fila.evidencia.includes(ADAPTADOR),
      `${ruta} lo clasifica «${fila.id}», que no cita la puerta por la que de verdad sale`,
    );
  }
  ok();
}

/* ── 5 · NADA SIN VEREDICTO: EL CONTRATO ENTERO ───────────────────────────────
   El adaptador es la puerta del EDITOR; el producto tiene más superficies
   (cuenta, cobros, mensajería, llamadas). La frontera sólo es honesta si las
   cubre todas, así que la unidad de cobertura es el contrato completo. */
{
  const sinVeredicto = declaradas.filter((ruta) => !filaDelEndpoint(ruta));
  assert.deepEqual(sinVeredicto, [], "el contrato declara rutas que la matriz no clasifica");
  ok();
}

/* ── 6 · NADA FANTASMA ────────────────────────────────────────────────────────
   Al revés: ninguna fila puede clasificar algo que no exista. Dos filtros, y
   hacen falta los dos —el contrato solo dejaría pasar una ruta declarada que
   ningún código llama, y el código solo dejaría pasar una ruta que se llama
   sin estar en el contrato. */
{
  for (const fila of MATRIZ_SIN_RED) {
    for (const endpoint of fila.endpoints) {
      assert.equal(
        normalizaRutaV1(endpoint),
        endpoint,
        `${fila.id} escribe «${endpoint}» sin normalizar`,
      );
      assert.ok(
        declaradas.includes(endpoint),
        `«${fila.id}» clasifica ${endpoint}, que el contrato no declara`,
      );
    }
  }

  // Cada endpoint tiene que aparecer, escrito de la forma que sea, en al menos
  // uno de los archivos que su propia fila cita.
  for (const fila of MATRIZ_SIN_RED) {
    const rutasDeSuEvidencia = new Set(
      fila.evidencia.flatMap((archivo) => extraeRutasV1(leer(archivo))),
    );
    for (const endpoint of fila.endpoints) {
      assert.ok(
        rutasDeSuEvidencia.has(endpoint),
        `«${fila.id}» clasifica ${endpoint} y ninguno de sus archivos de evidencia lo nombra`,
      );
    }
  }
  ok();
}

/* ── 7 · LA EVIDENCIA EXISTE Y NO ES ESTE ARCHIVO ─────────────────────────────
   Una ruta de evidencia mal escrita convierte la regla 6 en un `readFileSync`
   que lanza; una que apuntara a la propia matriz la convertiría en una tautología. */
{
  for (const fila of MATRIZ_SIN_RED) {
    assert.ok(fila.evidencia.length > 0, `«${fila.id}» no cita ni un archivo`);
    for (const archivo of fila.evidencia) {
      assert.ok(existsSync(desdeLaRaiz(archivo)), `«${fila.id}» cita ${archivo}, que no existe`);
      assert.notEqual(archivo, ESTE_MODULO, `«${fila.id}» se cita a sí misma como evidencia`);
      assert.ok(
        !archivo.endsWith(".spec.ts") && !archivo.endsWith(".spec.tsx"),
        `«${fila.id}» cita un spec (${archivo}) como evidencia: un test no es la implementación`,
      );
    }
  }
  ok();
}

/* ── 8 · «FUNCIONA SIN RED» NO PUEDE TOCAR LA RED ─────────────────────────────
   La regla que da valor a las otras siete. Se comprueba por partida doble: la
   fila no lista endpoints, y ninguno de los archivos que cita tiene una puerta
   a la red. Lo segundo es lo que atrapa el error de verdad —una fila que se
   apoya en un módulo que sí llama al servidor por dentro. */
const PUERTAS_A_LA_RED = [
  "designClient",
  "apiFetch",
  "legacyCadFetch",
  "fetch(",
  "XMLHttpRequest",
  "EventSource",
];
{
  const sinRed = MATRIZ_SIN_RED.filter((fila) => fila.veredicto === "funciona-sin-red");
  assert.ok(sinRed.length >= 5, "una matriz sin filas «funciona sin red» no está describiendo este producto");
  for (const fila of sinRed) {
    assert.deepEqual(
      fila.endpoints,
      [],
      `«${fila.id}» dice funcionar sin red y lista endpoints`,
    );
    for (const archivo of fila.evidencia) {
      const texto = leer(archivo);
      for (const puerta of PUERTAS_A_LA_RED) {
        assert.ok(
          !texto.includes(puerta),
          `«${fila.id}» dice funcionar sin red apoyándose en ${archivo}, que usa ${puerta}`,
        );
      }
    }
  }

  // Y al revés: lo que no funciona sin red tiene que tocarla de verdad.
  for (const fila of MATRIZ_SIN_RED) {
    if (fila.veredicto === "funciona-sin-red") continue;
    assert.ok(fila.endpoints.length > 0, `«${fila.id}» no funciona sin red y no toca ningún endpoint`);
    for (const endpoint of fila.endpoints) {
      assert.ok(tocaLaRed(endpoint), `«${fila.id}» lista ${endpoint}, que no está en la superficie de red`);
    }
  }
  ok();
}

/* ── 9 · EL BARRIDO DEL ÁRBOL DE CLIENTE ──────────────────────────────────────
   El contrato dice lo que existe; esto dice lo que el navegador LLAMA. Sirve
   para dos cosas distintas: que ninguna ruta viva en el código sin veredicto, y
   que la marca `sinPuertaEnElNavegador` no se use como atajo — se comprueba que
   esas familias, efectivamente, no las llama nadie desde el cliente. */
let archivosBarridos = 0;
{
  const RAICES_DE_CLIENTE = ["apps/web/src", "packages/design-sdk/src"];
  const archivos: string[] = [];
  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(desdeLaRaiz(directorio))) {
      const relativa = `${directorio}/${entrada}`;
      if (statSync(desdeLaRaiz(relativa)).isDirectory()) {
        // `generated/` es el SDK generado del propio contrato: incluirlo haría
        // que el contrato se avalase a sí mismo. `node_modules` y `.next`, obvio.
        if (entrada === "generated" || entrada === "node_modules" || entrada === ".next") continue;
        recorrer(relativa);
        continue;
      }
      if (!/\.tsx?$/.test(entrada) || /\.spec\.tsx?$/.test(entrada)) continue;
      if (relativa === ESTE_MODULO) continue; // la matriz no se avala a sí misma
      archivos.push(relativa);
    }
  };
  for (const raiz of RAICES_DE_CLIENTE) recorrer(raiz);
  archivosBarridos = archivos.length;
  assert.ok(archivos.length >= 500, `sólo se barrieron ${archivos.length} archivos de cliente; el barrido está roto`);

  const llamadasDelCliente = new Map<string, string[]>();
  const desconocidasEnElCliente: string[] = [];
  for (const archivo of archivos) {
    for (const ruta of extraeRutasV1(leer(archivo))) {
      const clase = clasificaRuta(ruta, declaradas);
      if (clase === "prefijo") continue;
      if (clase === "desconocida") {
        desconocidasEnElCliente.push(`${ruta} (${archivo})`);
        continue;
      }
      const donde = llamadasDelCliente.get(ruta) ?? [];
      donde.push(archivo);
      llamadasDelCliente.set(ruta, donde);
    }
  }

  assert.deepEqual(
    desconocidasEnElCliente.sort(),
    [],
    "el código de cliente nombra rutas /v1 que el contrato no declara",
  );

  const sinVeredicto = [...llamadasDelCliente.keys()].filter((ruta) => !filaDelEndpoint(ruta)).sort();
  assert.deepEqual(sinVeredicto, [], "el navegador llama a rutas que la matriz no clasifica");

  for (const fila of MATRIZ_SIN_RED) {
    if (!fila.sinPuertaEnElNavegador) {
      // Sin la marca, al menos un endpoint de la fila tiene que llamarse desde
      // el cliente: si no, la marca es lo que faltaba y la fila está mintiendo
      // sobre lo que un navegador puede hacer con ella.
      if (fila.endpoints.length === 0) continue;
      assert.ok(
        fila.endpoints.some((endpoint) => llamadasDelCliente.has(endpoint)),
        `«${fila.id}» no declara sinPuertaEnElNavegador y ninguno de sus endpoints se llama desde el cliente`,
      );
      continue;
    }
    for (const endpoint of fila.endpoints) {
      assert.ok(
        !llamadasDelCliente.has(endpoint),
        `«${fila.id}» se declara sin puerta en el navegador y ${endpoint} se llama desde ${llamadasDelCliente.get(endpoint)?.join(", ")}`,
      );
    }
  }
  ok();
}

/* ── 10 · LA FORMA DE CADA FILA ───────────────────────────────────────────────
   Los campos flojos son la manera favorita que tiene una matriz de vaciarse sin
   romperse: un `porque` de tres palabras, un `seNota` en blanco, un veredicto
   «degrada» sin nadie que reintente. */
{
  const ids = MATRIZ_SIN_RED.map((fila) => fila.id);
  assert.equal(new Set(ids).size, ids.length, "hay identificadores repetidos");
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `el identificador «${id}» no es un slug estable`);
    assert.equal(filaPorId(id)?.id, id);
  }

  const endpoints = MATRIZ_SIN_RED.flatMap((fila) => fila.endpoints);
  assert.equal(
    new Set(endpoints).size,
    endpoints.length,
    "un endpoint clasificado dos veces son dos veredictos para lo mismo",
  );

  for (const fila of MATRIZ_SIN_RED) {
    assert.ok(fila.flujo.length >= 20, `«${fila.id}» no describe un flujo humano`);
    assert.ok(fila.porque.length >= 60, `«${fila.id}» no explica su veredicto`);
    assert.ok(fila.seNota.length >= 10, `«${fila.id}» no dice qué se nota sin red`);
    // El flujo se escribe para una persona, no para el backend: si empieza con
    // un verbo del contrato («GET», «POST») es que se copió del sitio equivocado.
    assert.ok(
      !/^(GET|POST|PUT|PATCH|DELETE)\b/.test(fila.flujo),
      `«${fila.id}» describe un método HTTP, no un flujo humano`,
    );
    if (fila.veredicto === "degrada-y-reintenta") {
      assert.ok(
        fila.reintento && fila.reintento.length >= 40,
        `«${fila.id}» degrada y reintenta sin decir QUIÉN reintenta`,
      );
    } else {
      assert.equal(fila.reintento, undefined, `«${fila.id}» declara un reintento que su veredicto no admite`);
    }
    if (fila.sinPuertaEnElNavegador) {
      assert.notEqual(
        fila.veredicto,
        "funciona-sin-red",
        `«${fila.id}» no tiene puerta en el navegador y aun así dice funcionar sin red`,
      );
    }
  }
  ok();
}

/* ── 11 · EL REINTENTO QUE SE PROMETE TIENE QUE EXISTIR ───────────────────────
   «Degrada y reintenta» es el veredicto más fácil de regalar, porque suena a
   consuelo. Aquí se le pide el mecanismo concreto, y hay DOS legítimos:

     · CÓDIGO NUESTRO que vuelve a intentarlo — el oyente de `online`, el
       backoff del transporte de presencia, el flush de la cola de guardado.
     · EL REINTENTO NATIVO DE `EventSource`, que es de la plataforma y no se
       escribe en ningún archivo de este repositorio. Sigue siendo un mecanismo
       real, así que se acepta, PERO la fila tiene que apoyarse en él a
       propósito: lo nombra en su `reintento` y cita un archivo que de verdad
       abra un `EventSource`. Sin las dos condiciones sería una coartada.

   La distinción no es burocracia: el primero recupera trabajo de la persona, el
   segundo sólo reabre un caño. Confundirlos es lo que produce la frase «se
   sincroniza solo» sobre algo que no sincroniza nada. */
{
  const SEÑALES = ["online", "reconect", "reintent", "backoff", "flush", "retry"];
  const degradan = MATRIZ_SIN_RED.filter((fila) => fila.veredicto === "degrada-y-reintenta");
  assert.ok(degradan.length >= 3, "el producto tiene más de dos flujos que degradan; la matriz los perdió");
  for (const fila of degradan) {
    const textos = fila.evidencia.map((archivo) => leer(archivo).toLowerCase());
    const loImplementaNuestroCodigo = SEÑALES.some((señal) =>
      textos.some((texto) => texto.includes(señal)),
    );
    const seApoyaEnLaPlataforma =
      (fila.reintento ?? "").includes("EventSource") &&
      textos.some((texto) => texto.includes("eventsource"));
    assert.ok(
      loImplementaNuestroCodigo || seApoyaEnLaPlataforma,
      `«${fila.id}» promete reintento y ninguno de sus archivos lo implementa ni abre el transporte que lo trae de serie`,
    );
  }
  ok();
}

/* ── 12 · LA PANTALLA `/sin-conexion` Y LA MATRIZ, ATADAS ─────────────────────
   La pantalla le promete seis cosas a quien la lee y esas seis frases son copy,
   que se cambia sin tocar código. Esta regla es lo que impide que la promesa y
   la frontera se separen sin que nadie lo note. */
{
  const catalogo = JSON.parse(readFileSync("messages/en/offline.json", "utf8")) as Record<
    string,
    unknown
  >;
  const valorDe = (clave: string): unknown =>
    clave.split(".").reduce<unknown>((nodo, parte) => {
      if (nodo && typeof nodo === "object") return (nodo as Record<string, unknown>)[parte];
      return undefined;
    }, catalogo);

  assert.ok(PROMESAS_DE_SIN_CONEXION.length >= 6, "la pantalla promete más de lo que la tabla ata");
  for (const promesa of PROMESAS_DE_SIN_CONEXION) {
    const texto = valorDe(promesa.clave);
    assert.equal(
      typeof texto,
      "string",
      `la pantalla ya no tiene la clave «${promesa.clave}» que esta tabla ata a «${promesa.fila}»`,
    );
    const fila = filaPorId(promesa.fila);
    assert.ok(fila, `la tabla ata «${promesa.clave}» a la fila «${promesa.fila}», que no existe`);
    assert.equal(
      fila?.veredicto,
      promesa.veredicto,
      `«${promesa.fila}» cambió de veredicto y la pantalla sigue prometiendo lo de antes`,
    );
  }
  ok();
}

/* ── 13 · EL RECUENTO QUE SE COPIA A LA BITÁCORA ──────────────────────────────
   La regla 4 de la campaña: ninguna cifra vive en dos sitios. Este bloque es la
   fuente de la cifra y comprueba que cuadra con el contrato antes de imprimirla. */
const resumen = resumenSinRed();
{
  assert.equal(resumen.filas, MATRIZ_SIN_RED.length);
  assert.equal(
    resumen.funcionaSinRed + resumen.degradaYReintenta + resumen.requiereBackend,
    resumen.filas,
    "hay filas con un veredicto que no es ninguno de los tres",
  );
  assert.equal(resumen.endpoints, endpointsClasificados().length);
  assert.equal(
    resumen.endpoints,
    declaradas.length,
    `la matriz clasifica ${resumen.endpoints} endpoints y el contrato declara ${declaradas.length}`,
  );

  const lineas = matrizComoTexto().split("\n");
  assert.equal(lineas.length, MATRIZ_SIN_RED.length, "el volcado para la bitácora perdió filas");
  assert.ok(lineas.every((linea) => linea.split("\t").length === 3));
  ok();
}

console.log(
  `offline-capability-matrix: ${comprobaciones} bloques verdes; ${resumen.endpoints}/${declaradas.length} endpoints del contrato clasificados en ${resumen.filas} filas ` +
    `(${resumen.funcionaSinRed} funcionan sin red, ${resumen.degradaYReintenta} degradan y reintentan, ${resumen.requiereBackend} requieren backend); ` +
    `${archivosBarridos} archivos de cliente barridos sin una sola ruta sin veredicto.`,
);
