/**
 * EL INSTRUMENTO, EJERCIDO CONTRA SUS PROPIOS FALLOS.
 *
 * `catalog-contract.spec.ts` corre `revisaCatalogos` sobre los catálogos REALES
 * y hoy sale verde. Ese verde no prueba nada por sí solo: una función que
 * devolviera siempre la lista vacía saldría igual de verde, y seguiría verde el
 * día que alguien borre media traducción. Un detector sólo vale lo que valen sus
 * fallos, así que aquí se le enseña cada uno.
 *
 * Los cuatro caminos que la entrega pide por su nombre, cada uno con su fixture:
 *
 *   1. UNA CLAVE QUE FALTA EN `es`. next-intl no lanza — `getMessageFallback`
 *      pinta el último segmento— así que el usuario español lee «warningBody».
 *   2. UNA CLAVE QUE SOBRA. En cualquiera de los dos sentidos: copy traducido
 *      con esmero que nadie verá, o una clave que el idioma de referencia ya no
 *      declara.
 *   3. UN VALOR VACÍO. La clave existe, los catálogos cuadran, y la pantalla
 *      sale con un hueco.
 *   4. UN MARCADOR ICU EN UN IDIOMA Y NO EN EL OTRO. `{name}` sólo en inglés:
 *      la cifra desaparece en español. Y al revés: se pinta `{name}` crudo.
 *
 * Y el que hace que los cuatro anteriores signifiquen algo: **el caso sano
 * tiene que salir sin un solo defecto**. Sin él, la función más tonta posible
 * —«devuelve siempre un defecto»— aprobaría este archivo entero.
 *
 * La segunda mitad ejerce el barrido de superficie, que es la parte donde un
 * error no se nota: un detector de español que se pasa de listo infla la deuda
 * de otro frente, y uno que se queda corto la esconde. Se le dan frases de
 * verdad de este repositorio y también las cosas que NO son copy —rutas,
 * clases de CSS, identificadores, inglés— para fijar las dos orillas.
 */
import { strict as assert } from "node:assert";
import {
  AREAS,
  aplanaCatalogo,
  areaDe,
  barreSuperficie,
  calculaCobertura,
  escaneaFuente,
  fichasDeMarca,
  marcadoresIcu,
  pareceEspanol,
  revisaCatalogos,
  superficieComoTexto,
  textosEnEspanol,
  textosJsx,
  type CatalogoCrudo,
  type DefectoDeCatalogo,
} from "./coverage";

let bloques = 0;
const ok = () => {
  bloques += 1;
};

/** El catálogo sano del que salen todos los fixtures rotos, cambiando UNA cosa. */
const SANO_EN: CatalogoCrudo = {
  title: "You are offline",
  detail: "The drawing engine keeps working. %PRODUCT_DESIGN% saves your draft locally.",
  journal: "{checkpoints} checkpoints per lane, kept for {days} days.",
  actions: { retry: "Try again", back: "Back to the studio" },
};

const SANO_ES: CatalogoCrudo = {
  title: "Sin conexión",
  detail: "El motor de dibujo sigue trabajando. %PRODUCT_DESIGN% guarda tu borrador aquí.",
  journal: "{checkpoints} puntos de control por carril, vigentes {days} días.",
  actions: { retry: "Reintentar", back: "Volver al estudio" },
};

/** Copia profunda: cada fixture parte del sano y rompe exactamente una cosa. */
const clona = (nodo: CatalogoCrudo): CatalogoCrudo =>
  JSON.parse(JSON.stringify(nodo)) as CatalogoCrudo;

const revisa = (en: CatalogoCrudo, es: CatalogoCrudo): DefectoDeCatalogo[] =>
  revisaCatalogos([{ namespace: "prueba", porIdioma: { en, es } }]).defectos;

/* ── 1 · EL CASO SANO NO INVENTA DEFECTOS ────────────────────────────────────
   Va primero a propósito. Es el bloque que impide que «devuelve un defecto
   siempre» apruebe los cuatro caminos de fallo de más abajo, y el que sostiene
   que el verde de `catalog-contract.spec.ts` sobre los catálogos reales
   signifique «están sanos» y no «esta función no mira». */
{
  const resultado = revisaCatalogos([{ namespace: "prueba", porIdioma: { en: SANO_EN, es: SANO_ES } }]);
  assert.deepEqual(
    resultado.defectos,
    [],
    `un catálogo sano no puede producir defectos: ${resultado.defectos.map((d) => d.detalle)}`,
  );
  assert.equal(resultado.clavesDeReferencia, 5, "el aplanado perdió o inventó claves");
  assert.deepEqual(resultado.clavesPorIdioma, { en: 5, es: 5 });
  assert.equal(resultado.idiomaDeReferencia, "en", "la referencia es el idioma por defecto de la app");
  assert.deepEqual(resultado.idiomasComparados, ["es"]);
  ok();
}

/* ── 2 · EL APLANADO, QUE ES DE LO QUE DEPENDE TODO LO DEMÁS ─────────────────
   Si `actions.retry` no se aplanara a esa ruta exacta, la comparación de abajo
   compararía dos conjuntos vacíos y saldría verde sin haber mirado nada. */
{
  const { entradas, noTexto } = aplanaCatalogo(SANO_EN);
  assert.deepEqual(
    [...entradas.keys()].sort(),
    ["actions.back", "actions.retry", "detail", "journal", "title"],
    "el aplanado no produce las rutas que pide t()",
  );
  assert.equal(entradas.get("actions.retry"), "Try again");
  assert.deepEqual(noTexto, []);

  /* Un valor que no es texto se REPORTA, no se lanza: cortar en la primera
     clave mala esconde las cinco siguientes. */
  const conArray = clona(SANO_EN);
  conArray.tags = ["a", "b"];
  conArray.veces = 3;
  const roto = aplanaCatalogo(conArray);
  assert.deepEqual(roto.noTexto.sort(), ["tags", "veces"]);
  assert.equal(roto.entradas.size, 5, "las claves buenas se siguen leyendo");

  const defectos = revisa(conArray, SANO_ES);
  assert.equal(defectos.filter((d) => d.tipo === "valor-no-texto").length, 2);
  ok();
}

/* ── 3 · CAMINO DE FALLO 1 · LA CLAVE QUE FALTA EN ESPAÑOL ───────────────────
   El fallo silencioso más caro: no rompe el build, no rompe el render, y deja
   escrito «back» en mitad de una pantalla en español. */
{
  const es = clona(SANO_ES);
  delete (es.actions as CatalogoCrudo).back;
  const defectos = revisa(SANO_EN, es);

  assert.equal(defectos.length, 1, `se esperaba exactamente un defecto: ${defectos.map((d) => d.detalle)}`);
  assert.equal(defectos[0].tipo, "clave-ausente");
  assert.equal(defectos[0].clave, "actions.back");
  assert.equal(defectos[0].idioma, "es");
  assert.match(defectos[0].detalle, /falta en es/);
  ok();
}

/* ── 4 · CAMINO DE FALLO 2 · LA CLAVE QUE SOBRA ──────────────────────────────
   En las dos direcciones, porque son dos accidentes distintos: una clave que
   sólo vive en español es copy que nadie verá; una que sólo vive en inglés es
   la del bloque anterior vista desde el otro lado. La segunda mitad de este
   bloque comprueba que quitar una clave del catálogo de REFERENCIA no se
   reporte como «sobra» y ya está, sino como lo que es. */
{
  const es = clona(SANO_ES);
  (es.actions as CatalogoCrudo).cancelar = "Cancelar";
  const defectos = revisa(SANO_EN, es);
  assert.equal(defectos.length, 1, `se esperaba exactamente un defecto: ${defectos.map((d) => d.detalle)}`);
  assert.equal(defectos[0].tipo, "clave-sobrante");
  assert.equal(defectos[0].clave, "actions.cancelar");
  assert.match(defectos[0].detalle, /sobra en es/);

  const en = clona(SANO_EN);
  delete en.journal;
  const alReves = revisa(en, SANO_ES);
  assert.equal(alReves.length, 1);
  assert.equal(alReves[0].tipo, "clave-sobrante");
  assert.equal(alReves[0].clave, "journal");
  ok();
}

/* ── 5 · CAMINO DE FALLO 3 · EL VALOR VACÍO ──────────────────────────────────
   Los dos catálogos cuadran perfectamente y la pantalla sale con un hueco. Se
   comprueba en los dos idiomas: un vacío en el catálogo de referencia es igual
   de invisible, y además contamina la cobertura contando una clave que no dice
   nada. */
{
  const es = clona(SANO_ES);
  (es.actions as CatalogoCrudo).retry = "   ";
  const defectos = revisa(SANO_EN, es);
  assert.equal(defectos.length, 1, `se esperaba exactamente un defecto: ${defectos.map((d) => d.detalle)}`);
  assert.equal(defectos[0].tipo, "valor-vacio");
  assert.equal(defectos[0].clave, "actions.retry");
  assert.equal(defectos[0].idioma, "es");

  const en = clona(SANO_EN);
  en.title = "";
  const enReferencia = revisa(en, SANO_ES).filter((d) => d.tipo === "valor-vacio");
  assert.equal(enReferencia.length, 1, "un valor vacío en el idioma de referencia también es un defecto");
  assert.equal(enReferencia[0].idioma, "en");
  ok();
}

/* ── 6 · CAMINO DE FALLO 4 · EL MARCADOR ICU QUE NO CUADRA ───────────────────
   Las dos formas de romperlo tienen consecuencias distintas en pantalla y por
   eso se ejercen las dos: el marcador que FALTA se lleva la cifra por delante
   —la frase se lee entera y miente—, y el marcador SOBRANTE se pinta crudo,
   entre llaves, delante del usuario. */
{
  const es = clona(SANO_ES);
  es.journal = "Puntos de control por carril, vigentes {days} días.";
  const falta = revisa(SANO_EN, es);
  assert.equal(falta.length, 1, `se esperaba exactamente un defecto: ${falta.map((d) => d.detalle)}`);
  assert.equal(falta[0].tipo, "marcador-discordante");
  assert.equal(falta[0].clave, "journal");
  assert.match(falta[0].detalle, /checkpoints/);

  const sobra = clona(SANO_ES);
  sobra.journal = "{checkpoints} puntos por carril, {days} días, {name}.";
  const defectos = revisa(SANO_EN, sobra);
  assert.equal(defectos.length, 1);
  assert.equal(defectos[0].tipo, "marcador-discordante");
  assert.match(defectos[0].detalle, /name/);

  /* Renombrarlo es el caso que más se parece a estar bien: mismo número de
     marcadores, misma frase, y la cifra desaparece igual. */
  const renombrado = clona(SANO_ES);
  renombrado.journal = "{puntos} puntos de control por carril, vigentes {days} días.";
  assert.equal(revisa(SANO_EN, renombrado).length, 1, "un marcador renombrado descuadra igual");

  /* Y la forma larga de ICU, que es la que nadie copia entera al traducir. */
  assert.deepEqual(marcadoresIcu("{count, plural, one {# capa} other {# capas}}"), ["count"]);
  assert.deepEqual(marcadoresIcu("sin marcadores"), []);
  assert.deepEqual(marcadoresIcu("{ a } y {b}"), ["a", "b"]);
  ok();
}

/* ── 7 · LA FICHA DE MARCA, QUE NO ES UN MARCADOR ICU ────────────────────────
   `%PRODUCT_DESIGN%` se resuelve en `applyBrandToMessages`, ANTES que el ICU.
   Una ficha perdida al traducir deja el nombre del producto fuera de la frase
   sin que ningún marcador ICU se queje: es un defecto propio. */
{
  const es = clona(SANO_ES);
  es.detail = "El motor de dibujo sigue trabajando. Valle Design guarda tu borrador aquí.";
  const defectos = revisa(SANO_EN, es);
  assert.equal(defectos.length, 1, `se esperaba exactamente un defecto: ${defectos.map((d) => d.detalle)}`);
  assert.equal(defectos[0].tipo, "ficha-discordante");
  assert.match(defectos[0].detalle, /%PRODUCT_DESIGN%/);
  assert.deepEqual(fichasDeMarca("%PRODUCT_DESIGN% y %BRAND_2%"), ["%BRAND_2%", "%PRODUCT_DESIGN%"]);
  ok();
}

/* ── 8 · SE REPORTAN TODOS, NO EL PRIMERO ───────────────────────────────────
   Al traducir un namespace nuevo se arreglan diez claves de una pasada o se
   arregla una por ejecución del spec. La diferencia entre las dos cosas es si
   esta función corta en el primer defecto. */
{
  const es = clona(SANO_ES);
  delete es.title;
  (es.actions as CatalogoCrudo).retry = "";
  es.journal = "{days} días.";
  (es.actions as CatalogoCrudo).extra = "de más";
  const defectos = revisa(SANO_EN, es);
  assert.deepEqual(
    [...new Set(defectos.map((d) => d.tipo))].sort(),
    ["clave-ausente", "clave-sobrante", "marcador-discordante", "valor-vacio"],
    "la revisión se detuvo antes de encontrarlos todos",
  );
  assert.ok(defectos.length >= 4);
  /* Y el namespace viaja en cada defecto: sin él, un rojo sobre veinte
     namespaces no dice en cuál mirar. */
  assert.ok(defectos.every((d) => d.namespace === "prueba"));

  /* Un defecto puede arrastrar otro y eso está bien: vaciar un valor que
     llevaba `%PRODUCT_DESIGN%` es a la vez un valor vacío y una ficha perdida.
     Se reportan los dos porque se arreglan a la vez, pero se leen distinto. */
  const vaciada = clona(SANO_ES);
  vaciada.detail = "";
  assert.deepEqual(
    [...new Set(revisa(SANO_EN, vaciada).map((d) => d.tipo))].sort(),
    ["ficha-discordante", "valor-vacio"],
  );
  ok();
}

/* ── 9 · UN IDIOMA QUE NO ESTÁ ES UN DEFECTO, NO UN CERO ─────────────────────
   `messages/es.ts` puede dejar de importar un namespace entero. La revisión no
   puede leer eso como «el español no tiene claves que comparar, todo en orden». */
{
  const sinReferencia = revisaCatalogos([{ namespace: "prueba", porIdioma: { es: SANO_ES } }]);
  assert.equal(sinReferencia.defectos.length, 1);
  assert.equal(sinReferencia.defectos[0].clave, "*");
  assert.equal(sinReferencia.clavesDeReferencia, 0);

  const sinTraduccion = revisaCatalogos([{ namespace: "prueba", porIdioma: { en: SANO_EN } }]);
  assert.deepEqual(sinTraduccion.idiomasComparados, [], "sin traducción no hay nada que comparar");
  assert.equal(sinTraduccion.clavesDeReferencia, 5, "pero sus claves siguen contando para la cobertura");
  ok();
}

/* ════════════════════════════════════════════════════════════════════════════
   EL BARRIDO DE SUPERFICIE
   ════════════════════════════════════════════════════════════════════════════ */

/* ── 10 · EL ESCÁNER TIRA LOS COMENTARIOS Y GUARDA LOS LITERALES ─────────────
   La decisión que cambia la cifra por un factor grande. En esta casa los
   comentarios están en español POR NORMA: contarlos mide cuánto se documenta,
   no cuánto queda por traducir. Y las tres trampas del lenguaje que un
   `grep` no ve: el `//` dentro de una URL, la comilla suelta de un regex y la
   plantilla que cruza líneas. */
{
  const fuente = [
    '// Añadir aquí las notas de la capa nueva.',
    '/* Un bloque en español que tampoco es copy. */',
    'const url = "https://valle.example/planos";',
    // El regex y el mensaje EN LA MISMA LÍNEA, que es como aparecen de verdad.
    // Separados en dos líneas, un escáner que tratara la comilla suelta como
    // apertura de cadena seguiría encontrando el mensaje y el fallo pasaría.
    'if (/["\']/.test(x)) return say("No se pudo leer el objeto designado.");',
    'const largo = `Capa ${nombre} lista para acotar`;',
    // Una clase de caracteres con la BARRA dentro, que es justo para lo que la
    // clase existe, y una comilla detrás de ella. Un lexer que no sepa que
    // dentro de `[…]` la barra no cierra nada corta el regex por la mitad, y la
    // comilla que queda suelta se empareja con la del mensaje siguiente.
    "const trozos = ruta.split(/[/']/); const aviso2 = 'No se pudo abrir el bloque';",
  ].join("\n");

  const { literales, codigoSinComentarios } = escaneaFuente(fuente);
  const textos = literales.map((l) => l.texto);

  assert.ok(!codigoSinComentarios.includes("Añadir aquí"), "el comentario de línea sobrevivió");
  assert.ok(!codigoSinComentarios.includes("tampoco es copy"), "el comentario de bloque sobrevivió");
  assert.ok(textos.includes("https://valle.example/planos"), "el // de la URL cortó la cadena");
  assert.ok(
    textos.includes("No se pudo leer el objeto designado."),
    "la comilla suelta del regex se tragó lo que venía después",
  );
  assert.ok(
    textos.some((t) => t === "Capa   lista para acotar"),
    `la interpolación no dejó un hueco: ${JSON.stringify(textos)}`,
  );
  assert.ok(
    textos.includes("No se pudo abrir el bloque"),
    `la barra dentro de la clase del regex cortó el escaneo: ${JSON.stringify(textos)}`,
  );
  assert.equal(
    literales.find((l) => l.texto.startsWith("No se pudo leer"))?.linea,
    4,
    "el número de línea no apunta a donde está el texto",
  );
  ok();
}

/* ── 11 · EL TEXTO JSX, QUE NO ES UN LITERAL ─────────────────────────────────
   La mitad de la copy de una pantalla no está entre comillas: está entre
   etiquetas. Un barrido que sólo mire literales se deja fuera justo lo que el
   usuario lee más grande. */
{
  const tsx = [
    'export function Panel() {',
    '  return (',
    '    <section aria-label="Panel de capas del plano">',
    '      <h2>Selección de capas</h2>',
    '      <p>Se guardó el {cuando(sesion.createdAt)} en este navegador</p>',
    '      <span>Capas del plano</span>',
    '      <b>El muro mide 12\' 6" en unidades imperiales</b>',
    // Dos etiquetas en línea, con la frase en la SEGUNDA. Es la forma normal de
    // escribir JSX y la que castiga a un lexer que tome por regex cualquier
    // barra: la de `</b>` emparejaría con la de `</i>` y se llevaría por delante
    // el texto que hay en medio.
    '      <small><b>2 m</b> de largo y <i>Sin cota en el detalle</i></small>',
    '      <Lista<Capa> datos={capas} />',
    '    </section>',
    '  );',
    '}',
  ].join("\n");

  const { codigoSinComentarios } = escaneaFuente(tsx);
  const jsx = textosJsx(codigoSinComentarios).map((t) => t.texto);
  assert.ok(jsx.includes("Selección de capas"), "el nodo de texto JSX no se ve");

  /* LA INTERPOLACIÓN SE VACÍA, NO SE PROHÍBE NI SE COPIA. Prohibir la llave
     pierde la frase entera —son 72 en este árbol, medidas—; copiarla mete
     `cuando(sesion.createdAt)` dentro de lo que se cuenta como copy. */
  const conCifra = jsx.find((t) => t.startsWith("Se guardó"));
  assert.ok(conCifra, "el nodo con interpolación se perdió entero");
  assert.ok(
    !conCifra?.includes("cuando") && !conCifra?.includes("createdAt"),
    `el código de la interpolación se coló en el texto: ${JSON.stringify(conCifra)}`,
  );
  assert.match(conCifra as string, /^Se guardó el\s+en este navegador$/);
  assert.ok(
    !jsx.some((t) => t.includes("Capa>")),
    "el genérico <Lista<Capa>> se coló como texto de pantalla",
  );

  /* LA COMILLA SUELTA, con el caso que este producto tiene de verdad: las
     marcas imperiales. `12' 6"` deja una comilla simple y una doble sin pareja
     en mitad de un nodo de texto. Un escáner que tratara cualquier comilla como
     apertura de cadena se comería el resto de la línea —la etiqueta de cierre
     incluida— y perdería la frase entera sin decir nada. */
  assert.ok(
    jsx.includes(`El muro mide 12' 6" en unidades imperiales`),
    `las marcas imperiales rompieron el escaneo del nodo: ${JSON.stringify(jsx)}`,
  );

  assert.ok(
    jsx.includes("Sin cota en el detalle"),
    `la barra de una etiqueta de cierre se comió el texto de la siguiente: ${JSON.stringify(jsx)}`,
  );

  const encontrados = textosEnEspanol("src/components/Panel.tsx", tsx).map((t) => t.texto);
  assert.equal(encontrados.length, 5, JSON.stringify(encontrados));
  assert.ok(encontrados.includes("Panel de capas del plano"));
  assert.ok(encontrados.includes("Selección de capas"));
  assert.ok(encontrados.includes(`El muro mide 12' 6" en unidades imperiales`));
  assert.ok(encontrados.some((t) => t.startsWith("Se guardó el")));

  /* EL SUELO, EN VIVO. «Capas del plano» es copy en español y el detector no la
     cuenta: sin acentos, sólo tiene una palabra funcional («del») de las dos que
     exige. Es la clase de miss que hace que la superficie medida sea un mínimo y
     no una estimación, y por eso está escrita aquí en vez de en un comentario. */
  assert.ok(!encontrados.includes("Capas del plano"));

  /* En un `.ts` no hay JSX: si se buscara igual, `a > b && c < d` produciría
     candidatos falsos en todo el motor. */
  assert.deepEqual(textosEnEspanol("src/lib/cad/x.ts", tsx).map((t) => t.texto), [
    "Panel de capas del plano",
  ]);
  ok();
}

/* ── 12 · LAS DOS ORILLAS DEL DETECTOR ───────────────────────────────────────
   Un detector que se pasa de listo infla la deuda de otro frente; uno que se
   queda corto la esconde. Las frases positivas son texto real de este árbol; las
   negativas son las cosas que de verdad hay entre comillas en un `.tsx`. */
{
  const ES_ESPANOL = [
    "No se pudo leer el objeto designado.",
    "Precise el ángulo de giro alrededor del eje del SCU",
    "El plano de tu giro ya está empezado",
    "Recámara",
    "Sin conexión",
    "Guías",
    "Los objetos designados no encierran ninguna región.",
    "Indique los márgenes en mm: superior,derecho,inferior,izquierdo",
  ];
  for (const frase of ES_ESPANOL) {
    assert.ok(pareceEspanol(frase), `el detector no reconoce como español: ${JSON.stringify(frase)}`);
  }

  const NO_ES_COPY = [
    // Inglés: lo que el producto ya dice por claves.
    "You are offline",
    "Try again",
    "Back to the studio",
    "The drawing engine keeps working without the server",
    // Rutas, módulos y URLs.
    "@/components/ui",
    "../../packages/contracts",
    "https://valle.example/planos",
    "/v1/cad/documents",
    // Identificadores, clases y formatos.
    "cad-layer-panel",
    "flex items-center gap-2 rounded-control",
    "AXOS-CAD-STUDIO",
    "text-muted-foreground",
    "application/json",
    "utf8",
    "#0f172a",
  ];
  for (const cadena of NO_ES_COPY) {
    assert.ok(!pareceEspanol(cadena), `el detector cuenta como copy en español: ${JSON.stringify(cadena)}`);
  }

  /* El suelo, dicho con un ejemplo: un token suelto en minúsculas sin carácter
     español no se cuenta, porque no se distingue de un identificador sin abrir
     el archivo. La cifra de superficie es por eso un SUELO, y la cobertura que
     sale de ella un TECHO. */
  assert.equal(pareceEspanol("guardar"), false, "el suelo declarado del detector cambió");
  assert.equal(pareceEspanol("Añadir"), true, "una palabra capitalizada con carácter español sí cuenta");
  ok();
}

/* ── 13 · LAS ÁREAS CUBREN EL ÁRBOL ENTERO ──────────────────────────────────
   `resto` no es un cajón de sastre por pereza: es lo que hace que la suma por
   áreas sea el total. Un archivo sin área sería un archivo que el barrido lee y
   no cuenta en ninguna fila. */
{
  assert.equal(areaDe("src/lib/cad/engine/commands/plot-commands.ts"), "lib-cad");
  assert.equal(areaDe("src/components/cad/palettes/CadMTextEditor.tsx"), "components-cad");
  assert.equal(areaDe("src/app/docs/dxf-vs-dwg/page.tsx"), "app-docs");
  assert.equal(areaDe("src/app/page.tsx"), "marketing");
  assert.equal(areaDe("src/app/precios/page.tsx"), "marketing");
  assert.equal(areaDe("src/components/marketing/SiteFooter.tsx"), "marketing");
  assert.equal(areaDe("src/lib/brep/shell.ts"), "resto");

  /* Las rutas públicas se derivan de `PUBLIC_ROUTES`; si alguien vaciara esa
     lista, el área de marketing se quedaría con los componentes y las páginas
     se irían a `resto` sin que nadie lo note. */
  const marketing = AREAS.find((a) => a.id === "marketing");
  assert.ok(marketing && marketing.prefijos.length >= 10, "el área pública perdió sus prefijos");
  assert.ok(
    marketing?.prefijos.includes("src/app/plantillas/"),
    "el área pública ya no deriva de PUBLIC_ROUTES",
  );
  assert.equal(AREAS[AREAS.length - 1].id, "resto", "el cajón de cierre tiene que ir el último");
  ok();
}

/* ── 14 · EL BARRIDO SUMA LO QUE DICE QUE SUMA ───────────────────────────────
   Con archivos de mentira, para poder comprobar la aritmética contra un número
   conocido. Sobre el árbol real la comprueba `catalog-contract.spec.ts`, donde
   el número no se puede escribir a mano. */
{
  const resumen = barreSuperficie([
    { ruta: "src/lib/cad/a.ts", fuente: 'const a = "No se pudo leer el objeto designado.";' },
    { ruta: "src/lib/cad/b.ts", fuente: 'const b = "Precise el punto base del giro"; const c = "Sin conexión";' },
    { ruta: "src/lib/cad/limpio.ts", fuente: '// Comentario en español que no cuenta.\nexport const N = 3;' },
    { ruta: "src/components/cad/C.tsx", fuente: "export const C = () => <p>Capa bloqueada por otra sesión</p>;" },
    { ruta: "src/lib/brep/d.ts", fuente: 'throw new Error("La malla no está cerrada");' },
  ]);

  assert.equal(resumen.archivos, 5);
  assert.equal(resumen.textos, 5, `el barrido contó ${resumen.textos}: ${JSON.stringify(resumen.muestras)}`);
  assert.equal(resumen.archivosConTexto, 4, "el archivo con sólo comentarios no puede contar");

  const por = new Map(resumen.porArea.map((a) => [a.area, a]));
  assert.equal(por.get("lib-cad")?.textos, 3);
  assert.equal(por.get("lib-cad")?.archivos, 3);
  assert.equal(por.get("lib-cad")?.archivosConTexto, 2);
  assert.equal(por.get("components-cad")?.textos, 1);
  assert.equal(por.get("resto")?.textos, 1);
  assert.equal(por.get("app-docs")?.textos, 0);
  assert.equal(
    resumen.porArea.reduce((n, a) => n + a.textos, 0),
    resumen.textos,
    "la suma por áreas no es el total",
  );
  assert.equal(
    resumen.porArea.reduce((n, a) => n + a.archivos, 0),
    resumen.archivos,
    "hay archivos leídos que no caen en ninguna área",
  );
  assert.equal(superficieComoTexto(resumen).split("\n").length, AREAS.length);
  ok();
}

/* ── 15 · LA CIFRA ────────────────────────────────────────────────────────────
   Aritmética de una línea, a propósito: cualquier fórmula más elaborada dejaría
   de poder comprobarse a mano cuando alguien dude del número de la bitácora. */
{
  assert.deepEqual(calculaCobertura(33, 7812), {
    clavesTraducidas: 33,
    textosCableados: 7812,
    superficieTotal: 7845,
    porcentaje: 0.4,
  });
  assert.equal(calculaCobertura(1, 1).porcentaje, 50);
  assert.equal(calculaCobertura(5, 0).porcentaje, 100);
  assert.equal(calculaCobertura(0, 0).porcentaje, 0, "sin superficie no hay cobertura que dividir");
  ok();
}

console.log(
  `coverage: ${bloques} bloques verdes — los cuatro caminos de fallo del contrato de catálogos ` +
    `(clave ausente, clave sobrante, valor vacío, marcador ICU descuadrado) ejercidos contra fixtures, ` +
    `más la ficha de marca, el caso sano, el escáner y las dos orillas del detector de español.`,
);
