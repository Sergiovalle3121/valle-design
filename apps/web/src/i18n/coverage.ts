/**
 * EL INSTRUMENTO QUE MIDE CUÁNTO PRODUCTO HABLA POR CLAVES, Y CUÁNTO NO.
 *
 * ## Por qué existe
 *
 * «El estudio está en inglés» es una afirmación que hoy no se puede sostener ni
 * negar: los tres namespaces de `messages/` cubren el conmutador de idioma, la
 * pantalla `/sin-conexion` y el aviso de versión nueva —tres superficies— y todo
 * lo demás escribe su texto a mano, en español, dentro del `.tsx` o del `.ts`.
 * Esa distancia no se estima de memoria: se mide, y la cifra medida es la única
 * que puede ir a la bitácora sin adorno.
 *
 * Este módulo es el instrumento, y tiene DOS mitades que responden a dos
 * preguntas distintas:
 *
 *   1. **¿Los catálogos que ya existen están sanos?** Paridad de claves entre
 *      idiomas, ningún valor vacío, los mismos marcadores ICU y las mismas
 *      fichas de marca a los dos lados. Esta mitad SÍ es gate
 *      (`catalog-contract.spec.ts`) porque los catálogos los alimenta este
 *      frente y sólo este frente: un rojo aquí es siempre culpa de quien lo
 *      puso rojo.
 *   2. **¿Cuánto texto sigue cableado en español fuera de claves?** Un barrido
 *      de SÓLO LECTURA por áreas. Esta mitad NO es gate y no lleva presupuesto,
 *      y la razón es concreta: `lib/cad` y `components/cad` son territorio de
 *      otros frentes, y cualquiera de ellos que añada una cadena en español
 *      —haciendo su trabajo, correctamente— pondría la suite en rojo por algo
 *      que no es suyo. Un gate que castiga a quien no puede arreglarlo se
 *      apaga a la semana. Se mide, se publica y se fecha; no se cobra.
 *
 * ## Lo que este módulo NO hace
 *
 * No lee archivos. Todo lo de aquí son funciones puras que reciben texto y
 * devuelven datos, para que las cuatro formas de romper un catálogo se puedan
 * ejercer contra fixtures en `coverage.spec.ts` sin escribir un JSON de mentira
 * en `messages/`. Quien lee el disco es cada spec.
 *
 * ## La honestidad del barrido, dicha antes de dar el número
 *
 * El detector cuenta FRASES: texto con al menos un espacio, o una palabra
 * capitalizada con carácter español. Un token suelto en minúsculas
 * (`"guardar"`) no se distingue de un identificador sin leerlo, así que no se
 * cuenta. La consecuencia hay que decirla en la dirección incómoda: la cifra de
 * superficie pendiente es un SUELO, y por tanto la cobertura que sale de ella es
 * un TECHO. No «alrededor de»: como mucho.
 */
import { defaultLocale, locales, type Locale } from "./config";
import { PUBLIC_ROUTES } from "../config/site-routes";

/* ════════════════════════════════════════════════════════════════════════════
   PARTE 1 · EL CONTRATO DE CATÁLOGOS
   ════════════════════════════════════════════════════════════════════════════ */

/** Un catálogo tal y como sale de `JSON.parse`: anidado y sin tipar. */
export type CatalogoCrudo = Record<string, unknown>;

/**
 * Las cinco formas de romper un catálogo sin romper el build. Ninguna lanza en
 * tiempo de ejecución: next-intl pinta el último segmento de la clave cuando
 * falta (`getMessageFallback` en `request.ts`), y un valor vacío o un marcador
 * descuadrado se ven en pantalla y en ningún log.
 */
export type TipoDeDefecto =
  | "clave-ausente"
  | "clave-sobrante"
  | "valor-vacio"
  | "valor-no-texto"
  | "marcador-discordante"
  | "ficha-discordante";

export interface DefectoDeCatalogo {
  tipo: TipoDeDefecto;
  /** Namespace donde vive el defecto: el nombre del archivo en `messages/<locale>/`. */
  namespace: string;
  /** Ruta aplanada de la clave, como la pide `t()`. */
  clave: string;
  /** Idioma en el que se observa. `"ambos"` cuando el defecto es la comparación misma. */
  idioma: string;
  /** Frase lista para el mensaje de la aserción. Se escribe una vez, aquí. */
  detalle: string;
}

/**
 * Aplana un catálogo anidado a `ruta.de.la.clave -> valor`, que es como lo pide
 * `t()`. Devuelve también las rutas cuyo valor NO es texto en vez de lanzar:
 * un array o un número dentro de un catálogo de copy es un defecto que hay que
 * poder reportar junto a los demás, no una excepción que corta la revisión en
 * la primera clave mala.
 */
export function aplanaCatalogo(raiz: CatalogoCrudo): {
  entradas: Map<string, string>;
  noTexto: string[];
} {
  const entradas = new Map<string, string>();
  const noTexto: string[] = [];

  const recorre = (nodo: CatalogoCrudo, prefijo: string): void => {
    for (const [clave, valor] of Object.entries(nodo)) {
      const ruta = prefijo ? `${prefijo}.${clave}` : clave;
      if (typeof valor === "string") {
        entradas.set(ruta, valor);
      } else if (valor && typeof valor === "object" && !Array.isArray(valor)) {
        recorre(valor as CatalogoCrudo, ruta);
      } else {
        noTexto.push(ruta);
      }
    }
  };

  recorre(raiz, "");
  return { entradas, noTexto };
}

/**
 * Marcadores ICU de un texto: `{nombre}` y también la forma larga
 * `{nombre, plural, …}`, que es la que de verdad se descuadra al traducir
 * porque nadie la copia entera.
 */
export function marcadoresIcu(texto: string): string[] {
  return [...texto.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map((m) => m[1]).sort();
}

/**
 * Fichas de marca (`%PRODUCT_DESIGN%`). Se resuelven ANTES que el ICU, en
 * `applyBrandToMessages`, así que una ficha perdida en la traducción deja el
 * nombre del producto fuera de una frase sin que ningún marcador ICU chille.
 */
export function fichasDeMarca(texto: string): string[] {
  return [...texto.matchAll(/%[A-Z0-9_]+%/g)].map((m) => m[0]).sort();
}

/** Un namespace con su catálogo en cada idioma. La entrada de `revisaCatalogos`. */
export interface NamespaceEnDosIdiomas {
  namespace: string;
  /** `locale -> catálogo crudo`. Debe traer al menos el idioma de referencia. */
  porIdioma: Readonly<Record<string, CatalogoCrudo>>;
}

export interface ResultadoDelContrato {
  defectos: DefectoDeCatalogo[];
  /** Claves del idioma de referencia. Es el numerador de la cobertura. */
  clavesDeReferencia: number;
  /** `locale -> nº de claves`. Sirve para ver de un vistazo qué idioma se quedó corto. */
  clavesPorIdioma: Record<string, number>;
  namespaces: string[];
  idiomaDeReferencia: string;
  idiomasComparados: string[];
}

/**
 * LA REVISIÓN. Compara cada idioma contra el de referencia —`en`, que es el
 * idioma por defecto de la app y por tanto la forma canónica de las claves— y
 * devuelve TODOS los defectos, no el primero.
 *
 * Devolver la lista completa no es cosmética: al traducir un namespace nuevo se
 * arreglan diez claves de una pasada o se arregla una por ejecución del spec.
 */
export function revisaCatalogos(
  entrada: readonly NamespaceEnDosIdiomas[],
  idiomaDeReferencia: string = defaultLocale,
): ResultadoDelContrato {
  const defectos: DefectoDeCatalogo[] = [];
  const clavesPorIdioma: Record<string, number> = {};
  let clavesDeReferencia = 0;
  const idiomasComparados = new Set<string>();

  for (const { namespace, porIdioma } of entrada) {
    const catalogoReferencia = porIdioma[idiomaDeReferencia];
    if (!catalogoReferencia) {
      defectos.push({
        tipo: "clave-ausente",
        namespace,
        clave: "*",
        idioma: idiomaDeReferencia,
        detalle: `el namespace ${namespace} no tiene catálogo en el idioma de referencia (${idiomaDeReferencia})`,
      });
      continue;
    }

    const referencia = aplanaCatalogo(catalogoReferencia);
    clavesDeReferencia += referencia.entradas.size;
    clavesPorIdioma[idiomaDeReferencia] =
      (clavesPorIdioma[idiomaDeReferencia] ?? 0) + referencia.entradas.size;
    for (const ruta of referencia.noTexto) {
      defectos.push({
        tipo: "valor-no-texto",
        namespace,
        clave: ruta,
        idioma: idiomaDeReferencia,
        detalle: `${idiomaDeReferencia}/${namespace}.json: ${ruta} no es texto; un catálogo de copy no guarda otra cosa`,
      });
    }
    for (const [clave, valor] of referencia.entradas) {
      if (valor.trim().length === 0) {
        defectos.push({
          tipo: "valor-vacio",
          namespace,
          clave,
          idioma: idiomaDeReferencia,
          detalle: `${idiomaDeReferencia}/${namespace}.json: la clave ${clave} está vacía`,
        });
      }
    }

    for (const idioma of Object.keys(porIdioma)) {
      if (idioma === idiomaDeReferencia) continue;
      idiomasComparados.add(idioma);
      const traduccion = aplanaCatalogo(porIdioma[idioma] as CatalogoCrudo);
      clavesPorIdioma[idioma] = (clavesPorIdioma[idioma] ?? 0) + traduccion.entradas.size;

      for (const ruta of traduccion.noTexto) {
        defectos.push({
          tipo: "valor-no-texto",
          namespace,
          clave: ruta,
          idioma,
          detalle: `${idioma}/${namespace}.json: ${ruta} no es texto; un catálogo de copy no guarda otra cosa`,
        });
      }

      /* Paridad, en las dos direcciones. Son dos defectos distintos y se
         reportan distinto a propósito: la clave que falta deja media pantalla
         con el nombre de la clave escrito en ella; la que sobra es copy
         traducido con esmero que nadie va a ver nunca. */
      for (const clave of referencia.entradas.keys()) {
        if (!traduccion.entradas.has(clave)) {
          defectos.push({
            tipo: "clave-ausente",
            namespace,
            clave,
            idioma,
            detalle: `${namespace}: la clave ${clave} existe en ${idiomaDeReferencia} y falta en ${idioma}`,
          });
        }
      }
      for (const clave of traduccion.entradas.keys()) {
        if (!referencia.entradas.has(clave)) {
          defectos.push({
            tipo: "clave-sobrante",
            namespace,
            clave,
            idioma,
            detalle: `${namespace}: la clave ${clave} sobra en ${idioma}; no existe en ${idiomaDeReferencia}`,
          });
        }
      }

      for (const [clave, texto] of traduccion.entradas) {
        if (texto.trim().length === 0) {
          defectos.push({
            tipo: "valor-vacio",
            namespace,
            clave,
            idioma,
            detalle: `${idioma}/${namespace}.json: la clave ${clave} está vacía`,
          });
        }
        const textoReferencia = referencia.entradas.get(clave);
        if (textoReferencia === undefined) continue;

        const marcadoresAqui = marcadoresIcu(texto);
        const marcadoresAlla = marcadoresIcu(textoReferencia);
        if (marcadoresAqui.join("|") !== marcadoresAlla.join("|")) {
          defectos.push({
            tipo: "marcador-discordante",
            namespace,
            clave,
            idioma,
            detalle:
              `${namespace}.${clave}: marcadores ICU distintos — ` +
              `${idiomaDeReferencia}={${marcadoresAlla.join(", ")}} ${idioma}={${marcadoresAqui.join(", ")}}`,
          });
        }

        const fichasAqui = fichasDeMarca(texto);
        const fichasAlla = fichasDeMarca(textoReferencia);
        if (fichasAqui.join("|") !== fichasAlla.join("|")) {
          defectos.push({
            tipo: "ficha-discordante",
            namespace,
            clave,
            idioma,
            detalle:
              `${namespace}.${clave}: fichas de marca distintas — ` +
              `${idiomaDeReferencia}=[${fichasAlla.join(", ")}] ${idioma}=[${fichasAqui.join(", ")}]`,
          });
        }
      }
    }
  }

  return {
    defectos,
    clavesDeReferencia,
    clavesPorIdioma,
    namespaces: entrada.map((n) => n.namespace),
    idiomaDeReferencia,
    idiomasComparados: [...idiomasComparados].sort(),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   PARTE 2 · EL BARRIDO DE SUPERFICIE
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Un trozo de texto encontrado en un archivo fuente, con de dónde salió. El
 * origen importa para poder auditarlo: un literal de cadena y un nodo de texto
 * JSX se equivocan de maneras distintas.
 */
export interface TrozoDeTexto {
  origen: "literal" | "jsx";
  texto: string;
  linea: number;
}

const CIERRE_DE_CADENA = (linea: string, desde: number, comilla: string): number => {
  for (let i = desde + 1; i < linea.length; i += 1) {
    if (linea[i] === "\\") {
      i += 1;
      continue;
    }
    if (linea[i] === comilla) return i;
  }
  return -1;
};

/**
 * Contextos donde un `/` empieza un literal de expresión regular y no una
 * división. La lista es corta y conservadora a propósito: `<` y `}` NO están,
 * porque `</div>` y `{x} />` los tienen delante y confundirlos convertiría media
 * pantalla de JSX en un «regex» que se traga el texto de las etiquetas.
 */
const ANTES_DE_UN_REGEX = /[(,=:[!&|?;]$/;
const PALABRA_ANTES_DE_UN_REGEX =
  /\b(return|typeof|case|in|of|new|instanceof|delete|void|do|else|yield|await)$/;

const enPosicionDeRegex = (yaLimpio: string): boolean => {
  const previo = yaLimpio.replace(/\s+$/, "");
  if (previo === "") return false;
  return ANTES_DE_UN_REGEX.test(previo) || PALABRA_ANTES_DE_UN_REGEX.test(previo);
};

/**
 * Fin de un literal de regex en la misma línea, saltando lo que va dentro de
 * una clase `[…]` —donde el `/` no cierra nada— y lo escapado. Si no cierra en
 * la línea, no era un regex: `-1` y se sigue leyendo como código.
 *
 * No hay aquí ninguna defensa extra contra el JSX, y se probó a ponerla: en
 * JavaScript válido un `/` pegado a `( , = : [ ! & | ? ;` es siempre un regex
 * —`= / 2` o `f(, / 2)` no compilan—, y el `/` de `</div>` va detrás de `<`,
 * que por eso NO está en la lista de arriba. La guarda que se escribió primero
 * no la mataba ningún mutante porque no había caso que la ejerciera; se quitó
 * en vez de dejarla puesta «por si acaso».
 */
const CIERRE_DE_REGEX = (linea: string, desde: number): number => {
  let enClase = false;
  for (let i = desde + 1; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (enClase) {
      if (c === "]") enClase = false;
      continue;
    }
    if (c === "[") enClase = true;
    else if (c === "/") return i;
  }
  return -1;
};

const desescapa = (texto: string): string =>
  texto
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, "`")
    .replace(/\\\\/g, "\\");

/**
 * EL ESCÁNER. Separa un archivo TypeScript en tres cosas: los literales de
 * cadena, el código sin comentarios y —lo que no devuelve— los comentarios.
 *
 * ## Por qué los comentarios se tiran, y por qué eso cambia el número
 *
 * En este repositorio los comentarios están en español POR NORMA de la casa: es
 * como se explica el porqué de una decisión. Un barrido crudo de «líneas con
 * texto español» los cuenta a todos y devuelve una cifra que mezcla la norma con
 * la deuda — mide cuánto se documenta, no cuánto queda por traducir. Aquí se
 * miran únicamente los literales de cadena y los nodos de texto JSX, que es
 * donde vive el texto que un usuario puede llegar a leer.
 *
 * ## Los tres atajos que toma, dichos enteros
 *
 *   · Una comilla sin pareja EN LA MISMA LÍNEA no abre cadena; se trata como un
 *     carácter suelto. Sin esa regla, la comilla de un regex —`/["']/`, que no
 *     es una cadena— se tragaría el resto de SU LÍNEA, que es justo donde suele
 *     estar el mensaje: `if (/["']/.test(x)) return say("No se pudo …")`. El
 *     estado no cruza de línea, así que el daño se detiene ahí; se dice medido
 *     y no exagerado, porque un comentario que exagera un riesgo se deja de
 *     leer igual que uno que lo calla.
 *   · Las plantillas (`` ` ``) sí cruzan líneas, y su interpolación `${…}` se
 *     salta contando llaves. Una plantilla sin cerrar sería el único caso que
 *     desincroniza el escáner; no se ha visto ninguno en el árbol.
 *   · El texto JSX se saca del código YA sin comentarios y sin cadenas, con el
 *     patrón `>texto<`. Un `a > b && c < d` produce un candidato falso, que el
 *     detector de idioma descarta porque no es español.
 */
export function escaneaFuente(fuente: string): {
  literales: TrozoDeTexto[];
  codigoSinComentarios: string;
} {
  const lineas = fuente.split("\n");
  const literales: TrozoDeTexto[] = [];
  const salida: string[] = [];

  let enBloque = false;
  let enPlantilla = false;
  let acumulado = "";
  let lineaDeLaPlantilla = 0;
  let profundidad = 0;

  for (let n = 0; n < lineas.length; n += 1) {
    const linea = lineas[n];
    let limpia = "";
    let i = 0;

    while (i < linea.length) {
      const c = linea[i];

      if (enBloque) {
        if (c === "*" && linea[i + 1] === "/") {
          enBloque = false;
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (enPlantilla) {
        if (profundidad > 0) {
          if (c === "{") profundidad += 1;
          else if (c === "}") profundidad -= 1;
          i += 1;
          continue;
        }
        if (c === "\\") {
          acumulado += linea[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (c === "`") {
          enPlantilla = false;
          literales.push({ origen: "literal", texto: acumulado, linea: lineaDeLaPlantilla });
          acumulado = "";
          i += 1;
          continue;
        }
        if (c === "$" && linea[i + 1] === "{") {
          // La interpolación se sustituye por un hueco: `Capa ${nombre} lista`
          // tiene que seguir leyéndose como dos frases y no como una palabra.
          profundidad = 1;
          acumulado += " ";
          i += 2;
          continue;
        }
        acumulado += c;
        i += 1;
        continue;
      }

      if (c === "/" && linea[i + 1] === "/") break; // el resto de la línea es comentario
      if (c === "/" && linea[i + 1] === "*") {
        enBloque = true;
        i += 2;
        continue;
      }

      /* Un literal de regex se salta ENTERO, y ésta no es una precaución
         teórica: `if (/["']/.test(x)) return say("No se pudo …")` es una línea
         normal de este motor, y sin este salto la comilla del regex empareja con
         la del mensaje y el mensaje deja de contarse. Se comprobó midiendo. */
      if (c === "/" && enPosicionDeRegex(limpia)) {
        const finDelRegex = CIERRE_DE_REGEX(linea, i);
        if (finDelRegex !== -1) {
          limpia += " ";
          i = finDelRegex + 1;
          continue;
        }
      }

      if (c === "'" || c === '"') {
        const cierre = CIERRE_DE_CADENA(linea, i, c);
        if (cierre === -1) {
          limpia += c;
          i += 1;
          continue;
        }
        literales.push({
          origen: "literal",
          texto: desescapa(linea.slice(i + 1, cierre)),
          linea: n + 1,
        });
        limpia += " ";
        i = cierre + 1;
        continue;
      }

      if (c === "`") {
        enPlantilla = true;
        lineaDeLaPlantilla = n + 1;
        acumulado = "";
        limpia += " ";
        i += 1;
        continue;
      }

      limpia += c;
      i += 1;
    }

    salida.push(limpia);
    if (enPlantilla) acumulado += " ";
  }

  return { literales, codigoSinComentarios: salida.join("\n") };
}

/**
 * Vacía las interpolaciones `{…}` de un nodo de texto JSX, dejando un hueco —
 * exactamente lo que `escaneaFuente` ya hace con el `${…}` de una plantilla.
 *
 * Sin esto hay que elegir entre dos formas de equivocarse, y las dos se
 * midieron sobre el árbol antes de decidir: prohibir la llave en el nodo pierde
 * 72 frases reales de las que llevan una cifra en medio («Cerrar las otras
 * {n} sesiones»), y permitirla sin más las recupera arrastrando el código de la
 * expresión —`{cuando(sesion.createdAt)}`— dentro del texto que se cuenta como
 * copy. Vaciarlas es la tercera salida y no tiene ese coste.
 *
 * Una llave sin cerrar —porque su `}` quedó al otro lado de una etiqueta— corta
 * el texto ahí: lo que viene después es código, no frase.
 */
function vaciaInterpolaciones(texto: string): string {
  let salida = "";
  let profundidad = 0;
  for (const c of texto) {
    if (c === "{") {
      if (profundidad === 0) salida += " ";
      profundidad += 1;
      continue;
    }
    if (c === "}") {
      if (profundidad > 0) profundidad -= 1;
      continue;
    }
    if (profundidad === 0) salida += c;
  }
  return salida;
}

/** Nodos de texto JSX del código ya limpio. Sólo tiene sentido en `.tsx`. */
export function textosJsx(codigoSinComentarios: string): TrozoDeTexto[] {
  const trozos: TrozoDeTexto[] = [];
  for (const coincidencia of codigoSinComentarios.matchAll(/>([^<>]+)</g)) {
    const texto = vaciaInterpolaciones(coincidencia[1]).trim();
    if (!texto) continue;
    const linea = codigoSinComentarios.slice(0, coincidencia.index).split("\n").length;
    trozos.push({ origen: "jsx", texto, linea });
  }
  return trozos;
}

/**
 * Palabras funcionales del español que NO son también palabras inglesas. La
 * lista está podada a propósito: `no`, `si`, `sin`, `son` y `con` se cayeron
 * porque las tres primeras y la última existen en inglés y `son` es un
 * sustantivo corriente. Dos aciertos distintos de esta lista bastan para
 * declarar español; uno solo, no.
 */
const PALABRAS_ES = new Set([
  "al", "algo", "algún", "alguna", "antes", "aquí", "así", "cada", "como", "cuando",
  "de", "debe", "deben", "del", "desde", "después", "donde", "dos", "el", "en", "entre",
  "es", "esa", "esas", "ese", "esos", "esta", "están", "estas", "este", "esto",
  "estos", "está", "hasta", "hay", "la", "las", "le", "les", "lo", "los", "misma",
  "mismo", "mientras", "muy", "nada", "ninguna", "ninguno", "nueva", "nuevo", "otra",
  "otras", "otro", "otros", "para", "pero", "por", "porque", "puede", "pueden",
  "que", "se", "según", "sobre", "solo", "sólo", "su", "sus", "también", "tampoco",
  "tiene", "tienen", "toda", "todas", "todo", "todos", "un", "una", "unas", "unos",
  "ya", "más",
]);

/** Caracteres que sólo aparecen escribiendo en español (o en francés, que aquí no se escribe). */
const CARACTERES_ES = /[áéíóúñÁÉÍÓÚÑüÜ¿¡]/;

/** Cadenas que son código, no copy: rutas, URLs, selectores, formatos. */
const PARECE_CODIGO =
  /^(https?:|wss?:|mailto:|data:|\/|\.{1,2}\/|@\/|#[0-9a-fA-F]{3,8}$|[A-Z_]+$)/;

/**
 * ¿Este texto es copy en español cableado a mano?
 *
 * La regla, entera y sin letra pequeña: cuenta si tiene al menos cuatro
 * caracteres, no parece una ruta ni una constante, y **es una frase (lleva un
 * espacio) o una palabra capitalizada**; y además lleva un carácter español o
 * dos palabras funcionales distintas del español.
 *
 * El requisito de frase es el que convierte esta cifra en un SUELO: `"Guardar"`
 * suelto no se cuenta, porque un token sin espacios ni acentos es
 * indistinguible de un identificador —`data-testid`, nombre de comando, clave
 * de un mapa— sin abrir el archivo. Preferimos no contar lo dudoso a inflar la
 * deuda de otro frente.
 */
export function pareceEspanol(texto: string): boolean {
  const limpio = texto.trim();
  if (limpio.length < 4) return false;
  if (PARECE_CODIGO.test(limpio)) return false;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñüÜ]/.test(limpio)) return false;

  const esFrase = /\s/.test(limpio);
  if (!esFrase && !/^[A-ZÁÉÍÓÚÑ]/.test(limpio)) return false;
  if (!esFrase && /[/\\_:.]/.test(limpio)) return false;

  if (CARACTERES_ES.test(limpio)) return true;

  const palabras = new Set(limpio.toLowerCase().match(/[a-záéíóúñü]+/g) ?? []);
  let señales = 0;
  for (const palabra of palabras) if (PALABRAS_ES.has(palabra)) señales += 1;
  return señales >= 2;
}

/** Los textos en español que un archivo fuente escribe a mano. */
export function textosEnEspanol(ruta: string, fuente: string): TrozoDeTexto[] {
  const { literales, codigoSinComentarios } = escaneaFuente(fuente);
  const candidatos = ruta.endsWith(".tsx")
    ? [...literales, ...textosJsx(codigoSinComentarios)]
    : literales;
  return candidatos.filter((trozo) => pareceEspanol(trozo.texto));
}

/* ── Las áreas ───────────────────────────────────────────────────────────────
   El orden manda: la primera que case gana, y `resto` cierra por abajo para que
   ningún archivo del árbol se quede sin contar. Un barrido con archivos fuera de
   toda categoría es un barrido que no suma su propio total. */

export interface AreaDeSuperficie {
  id: string;
  etiqueta: string;
  /** Prefijos desde `apps/web/`. */
  prefijos: readonly string[];
}

/**
 * Las rutas públicas se DERIVAN de `PUBLIC_ROUTES` en vez de copiarse: es la
 * lista que ya alimentan el sitemap y `robots.txt`, y la regla 4 de la campaña
 * de cimientos prohíbe que una cifra —o la lista que la produce— viva en dos
 * sitios. El día que alguien publique `/comparativas`, esta área la cuenta sola.
 */
const PREFIJOS_PUBLICOS: readonly string[] = [
  "src/app/page.tsx",
  "src/components/marketing/",
  "src/components/commercial/",
  "src/components/gallery/",
  "src/lib/marketing/",
  ...PUBLIC_ROUTES.map((ruta) => ruta.path)
    .filter((path) => path !== "/" && !path.startsWith("/docs"))
    // `/casos-de-uso` cubre también `/casos-de-uso/[perfil]`: el prefijo basta.
    .map((path) => `src/app${path}/`),
];

export const AREAS: readonly AreaDeSuperficie[] = [
  { id: "lib-cad", etiqueta: "lib/cad · el motor y sus órdenes", prefijos: ["src/lib/cad/"] },
  {
    id: "components-cad",
    etiqueta: "components/cad · la interfaz del estudio",
    prefijos: ["src/components/cad/"],
  },
  { id: "app-docs", etiqueta: "app/docs · las guías públicas", prefijos: ["src/app/docs/"] },
  {
    id: "marketing",
    etiqueta: "marketing y páginas públicas",
    prefijos: [...new Set(PREFIJOS_PUBLICOS)].sort(),
  },
  { id: "resto", etiqueta: "el resto del árbol", prefijos: [] },
];

/** El área de un archivo, por ruta desde `apps/web/`. La primera que case gana. */
export function areaDe(ruta: string): string {
  for (const area of AREAS) {
    if (area.prefijos.some((prefijo) => ruta === prefijo || ruta.startsWith(prefijo))) {
      return area.id;
    }
  }
  return "resto";
}

export interface ArchivoFuente {
  /** Ruta desde `apps/web/`, con `/` como separador. */
  ruta: string;
  fuente: string;
}

export interface ResumenDeArea {
  area: string;
  etiqueta: string;
  archivos: number;
  archivosConTexto: number;
  textos: number;
}

export interface ResumenDeSuperficie {
  porArea: ResumenDeArea[];
  archivos: number;
  archivosConTexto: number;
  textos: number;
  /** Unas pocas frases reales, para que la cifra se pueda auditar a ojo. */
  muestras: { ruta: string; linea: number; texto: string }[];
}

/** El barrido. Sólo lectura, sin presupuesto y sin veredicto: cuenta y devuelve. */
export function barreSuperficie(
  archivos: readonly ArchivoFuente[],
  muestrasPorArea = 2,
): ResumenDeSuperficie {
  const porArea = new Map<string, ResumenDeArea>();
  for (const area of AREAS) {
    porArea.set(area.id, {
      area: area.id,
      etiqueta: area.etiqueta,
      archivos: 0,
      archivosConTexto: 0,
      textos: 0,
    });
  }

  const muestras: ResumenDeSuperficie["muestras"] = [];
  const muestrasTomadas = new Map<string, number>();
  let textos = 0;
  let archivosConTexto = 0;

  for (const archivo of archivos) {
    const id = areaDe(archivo.ruta);
    const resumen = porArea.get(id) as ResumenDeArea;
    resumen.archivos += 1;

    const encontrados = textosEnEspanol(archivo.ruta, archivo.fuente);
    if (encontrados.length === 0) continue;

    resumen.archivosConTexto += 1;
    resumen.textos += encontrados.length;
    archivosConTexto += 1;
    textos += encontrados.length;

    const yaTomadas = muestrasTomadas.get(id) ?? 0;
    if (yaTomadas < muestrasPorArea) {
      muestrasTomadas.set(id, yaTomadas + 1);
      muestras.push({
        ruta: archivo.ruta,
        linea: encontrados[0].linea,
        texto: encontrados[0].texto.slice(0, 90),
      });
    }
  }

  return {
    porArea: [...porArea.values()],
    archivos: archivos.length,
    archivosConTexto,
    textos,
    muestras,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   PARTE 3 · LAS DOS CIFRAS
   ════════════════════════════════════════════════════════════════════════════ */

export interface Cobertura {
  /** Textos que ya salen de un catálogo: las claves del idioma de referencia. */
  clavesTraducidas: number;
  /** Textos en español cableados en el código, fuera de claves. */
  textosCableados: number;
  /** La suma. Es la superficie de texto del producto tal y como este barrido la ve. */
  superficieTotal: number;
  /** Porcentaje con un decimal. Es un TECHO, por el suelo del detector. */
  porcentaje: number;
}

/**
 * LA CIFRA. Numerador: lo que ya habla por claves. Denominador: eso más lo que
 * sigue cableado. No hay más aritmética, y ésa es la gracia — cualquier fórmula
 * más elaborada dejaría de ser comprobable a mano.
 */
export function calculaCobertura(clavesTraducidas: number, textosCableados: number): Cobertura {
  const superficieTotal = clavesTraducidas + textosCableados;
  const porcentaje =
    superficieTotal === 0 ? 0 : Math.round((clavesTraducidas / superficieTotal) * 1000) / 10;
  return { clavesTraducidas, textosCableados, superficieTotal, porcentaje };
}

/** Una línea por área, en el orden declarado. Lo que se copia a la bitácora. */
export function superficieComoTexto(resumen: ResumenDeSuperficie): string {
  return resumen.porArea
    .map(
      (area) =>
        `${area.area}\t${area.textos}\t${area.archivosConTexto}/${area.archivos} archivos`,
    )
    .join("\n");
}

/** Los idiomas que este instrumento espera encontrar. Uno solo sería otra cosa. */
export const IDIOMAS: readonly Locale[] = locales;
