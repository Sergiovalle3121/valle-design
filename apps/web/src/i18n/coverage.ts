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
import { defaultLocale, type Locale } from "./config";
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
   PARTE 2 · EL BARRIDO DE SUPERFICIE — vive en `coverage-superficie.ts`

   Se reexporta desde aquí para que ningún consumidor cambie de import. El
   motivo de la separación está escrito en la cabecera de ese archivo.
   ════════════════════════════════════════════════════════════════════════════ */
export {
  escaneaFuente,
  textosJsx,
  pareceEspanol,
  textosEnEspanol,
  AREAS,
  areaDe,
  barreSuperficie,
  calculaCobertura,
  superficieComoTexto,
  IDIOMAS,
  type TrozoDeTexto,
  type AreaDeSuperficie,
  type ArchivoFuente,
  type ResumenDeArea,
  type ResumenDeSuperficie,
  type Cobertura,
} from "./coverage-superficie";
