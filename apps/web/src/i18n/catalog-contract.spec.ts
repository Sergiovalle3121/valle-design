/**
 * EL CONTRATO DE LOS CATÁLOGOS — Y LAS DOS CIFRAS MEDIDAS.
 *
 * Este archivo hace dos cosas que a propósito NO tienen el mismo peso.
 *
 * ## Lo que sí es gate
 *
 * Los catálogos de `messages/` los alimenta un solo frente, y su contrato se
 * exige entero: mismas claves en los dos idiomas, ningún valor vacío, los mismos
 * marcadores ICU, las mismas fichas de marca, ningún namespace declarado en un
 * índice y no en el otro, ningún JSON huérfano que nadie importe. Un rojo aquí
 * es siempre culpa de quien lo puso rojo, y se arregla editando un JSON.
 *
 * El detector que lo comprueba vive en `coverage.ts` y sus cuatro caminos de
 * fallo están ejercidos contra fixtures en `coverage.spec.ts`. Sin eso, este
 * verde no significaría nada: una función que devuelva siempre la lista vacía
 * sale igual de verde y seguiría verde el día que se borre media traducción.
 *
 * ## Lo que NO es gate, y por qué
 *
 * El barrido de superficie cuenta el texto en español cableado fuera de claves,
 * por área. **No lleva presupuesto.** `lib/cad` y `components/cad` son
 * territorio de otros frentes, y cualquiera de ellos que añada una cadena en
 * español —haciendo su trabajo, correctamente— pondría la suite en rojo por algo
 * que no es suyo. Un gate que castiga a quien no puede arreglarlo se apaga a la
 * semana, y con él se va también la parte que sí valía. Se mide, se imprime y se
 * fecha en la bitácora; no se cobra.
 *
 * Lo único que el barrido sí exige es de sí mismo: que siga encontrando texto.
 * Si alguien rompiera el detector, la cobertura saltaría a un número precioso y
 * la bitácora empezaría a mentir con cifras medidas. Ese suelo es lo que lo
 * impide, y es un suelo —nunca un techo—, así que añadir español no lo rompe.
 *
 * ## Lo que este spec NO mide
 *
 * Cuenta texto ESCRITO EN CÓDIGO, y no sabe quién lo lee: entran los mensajes
 * de consola, la prosa de datos de `offline-capability-matrix.ts` (102 textos,
 * medidos) y el cuerpo del service worker. Ninguno se ve en una pantalla. Se
 * cuentan igual, porque la alternativa —una lista de exclusiones «esto no es
 * copy de verdad»— es exactamente el sitio donde una cifra empieza a esconder
 * cosas. Lo que se excluye es sólo el instrumento y sus specs, por la misma
 * razón que la matriz sin red se excluye a sí misma: nada puede ser su propia
 * evidencia.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { locales, defaultLocale } from "./config";
import {
  AREAS,
  barreSuperficie,
  calculaCobertura,
  revisaCatalogos,
  superficieComoTexto,
  type ArchivoFuente,
  type CatalogoCrudo,
  type NamespaceEnDosIdiomas,
} from "./coverage";

let bloques = 0;
const ok = () => {
  bloques += 1;
};

/* ── 1 · LOS IDIOMAS DECLARADOS Y LOS DIRECTORIOS QUE EXISTEN ─────────────────
   `config.ts` declara los idiomas y `request.ts` los usa para elegir catálogo.
   Un idioma declarado sin directorio hace que `messagesByLocale` traiga
   `undefined` y la app entera caiga al fallback; un directorio sin idioma es
   copy que nadie va a servir jamás. */
const directoriosDeMensajes = readdirSync("messages")
  .filter((entrada) => statSync(join("messages", entrada)).isDirectory())
  .sort();

{
  assert.deepEqual(
    directoriosDeMensajes,
    [...locales].sort(),
    "los directorios de messages/ y los idiomas de config.ts no dicen lo mismo",
  );
  assert.ok(locales.includes(defaultLocale), "el idioma por defecto no está entre los soportados");
  assert.equal(defaultLocale, "en", "el requisito de la campaña es inglés por defecto");
  ok();
}

/* ── 2 · CADA ÍNDICE DECLARA LO MISMO ────────────────────────────────────────
   `messages/en.ts` y `messages/es.ts` son dos listas de imports escritas a mano.
   Un namespace que entra en una y se olvida en la otra deja ese idioma sin él:
   no rompe el build ni el render, y la pantalla entera sale con el nombre de
   cada clave escrito en ella. `key-driven-copy.spec.ts` comprueba esto por cada
   superficie que tenga fila; los namespaces sin fila —hoy `language`— no los
   miraba nadie. */
const namespacesDeclarados = (locale: string): string[] =>
  [...readFileSync(`messages/${locale}.ts`, "utf8").matchAll(
    new RegExp(`from "\\./${locale}/([A-Za-z0-9_]+)\\.json"`, "g"),
  )]
    .map((m) => m[1])
    .sort();

const declaradosEnReferencia = namespacesDeclarados(defaultLocale);

{
  for (const locale of locales) {
    const declarados = namespacesDeclarados(locale);
    assert.deepEqual(
      declarados,
      declaradosEnReferencia,
      `messages/${locale}.ts no declara los mismos namespaces que messages/${defaultLocale}.ts`,
    );
    /* Importarlo no basta: hay que exponerlo en el objeto exportado. */
    const indice = readFileSync(`messages/${locale}.ts`, "utf8");
    for (const namespace of declarados) {
      assert.match(
        indice,
        new RegExp(`^\\s+${namespace},\\s*$`, "m"),
        `messages/${locale}.ts importa ${namespace} y no lo expone`,
      );
    }
  }
  assert.ok(declaradosEnReferencia.length >= 3, "los catálogos se quedaron sin namespaces");
  ok();
}

/* ── 3 · NINGÚN JSON HUÉRFANO ────────────────────────────────────────────────
   Un catálogo que nadie importa es copy traducido con esmero que no llega a
   next-intl. Es el defecto que menos duele y por eso el que más dura. */
{
  for (const locale of locales) {
    const archivos = readdirSync(`messages/${locale}`)
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/, ""))
      .sort();
    assert.deepEqual(
      archivos,
      declaradosEnReferencia,
      `messages/${locale}/ tiene archivos que nadie importa, o le falta alguno declarado`,
    );
  }
  ok();
}

/* ── 4 · EL CONTRATO, SOBRE LOS CATÁLOGOS REALES ─────────────────────────────
   Aquí no hay fixtures: son los JSON que se sirven. Las cinco reglas se aplican
   a TODOS los namespaces, `language` incluido —el único que
   `key-driven-copy.spec.ts` exime, con razón, de su regla de «se tradujo de
   verdad»: sus etiquetas son nativas. Que sean nativas no lo libra de tener las
   mismas claves ni de no estar vacío. */
const catalogos: NamespaceEnDosIdiomas[] = declaradosEnReferencia.map((namespace) => ({
  namespace,
  porIdioma: Object.fromEntries(
    locales.map((locale) => [
      locale,
      JSON.parse(readFileSync(`messages/${locale}/${namespace}.json`, "utf8")) as CatalogoCrudo,
    ]),
  ),
}));

const contrato = revisaCatalogos(catalogos);

{
  assert.deepEqual(
    contrato.defectos.map((d) => d.detalle),
    [],
    `el contrato de catálogos está roto en ${contrato.defectos.length} sitio(s)`,
  );
  assert.deepEqual(contrato.namespaces.sort(), declaradosEnReferencia);
  assert.deepEqual(contrato.idiomasComparados, ["es"]);
  /* Todos los idiomas cuentan las mismas claves. Es redundante con la paridad
     de arriba y se comprueba igual: es la aserción que sobreviviría si alguien
     cambiara la comparación por un `Set` mal construido. */
  for (const locale of locales) {
    assert.equal(
      contrato.clavesPorIdioma[locale],
      contrato.clavesDeReferencia,
      `${locale} tiene ${contrato.clavesPorIdioma[locale]} claves y ${defaultLocale} tiene ${contrato.clavesDeReferencia}`,
    );
  }
  ok();
}

/* ── 5 · EL SUELO DE CLAVES ──────────────────────────────────────────────────
   Suelo, no presupuesto: los catálogos sólo pueden crecer. Es territorio de
   este frente y nadie más los toca, así que un rojo aquí significa exactamente
   una cosa — se borró copy que ya estaba traducida. */
const MINIMO_DE_CLAVES = 33;

{
  assert.ok(
    contrato.clavesDeReferencia >= MINIMO_DE_CLAVES,
    `los catálogos bajaron a ${contrato.clavesDeReferencia} claves; el suelo medido el 2026-09-05 era ${MINIMO_DE_CLAVES}`,
  );
  ok();
}

/* ════════════════════════════════════════════════════════════════════════════
   EL BARRIDO — MEDIDA, NO GATE
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Lo que el barrido NO mira, y por qué cada uno:
 *
 *   · `src/i18n/` — el instrumento. Sus propias frases de ejemplo («No se pudo
 *     leer el objeto designado.») aparecerían como deuda de traducción, o sea
 *     que el medidor se contaría a sí mismo. Misma regla que la matriz sin red.
 *   · `*.spec.ts` — los mensajes de aserción están en español porque los lee
 *     quien programa, no quien dibuja. No son superficie de producto.
 *   · `*.d.ts` — declaraciones, sin texto.
 */
const NO_SE_BARRE = (ruta: string): boolean =>
  ruta.startsWith("src/i18n/") || /\.spec\.tsx?$/.test(ruta) || ruta.endsWith(".d.ts");

function recoge(directorio: string, salida: ArchivoFuente[] = []): ArchivoFuente[] {
  for (const entrada of readdirSync(directorio).sort()) {
    const completa = join(directorio, entrada);
    if (statSync(completa).isDirectory()) {
      recoge(completa, salida);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada)) continue;
    const ruta = completa.split("\\").join("/");
    if (NO_SE_BARRE(ruta)) continue;
    salida.push({ ruta, fuente: readFileSync(completa, "utf8") });
  }
  return salida;
}

const archivos = recoge("src");
const superficie = barreSuperficie(archivos, 1);
const cobertura = calculaCobertura(contrato.clavesDeReferencia, superficie.textos);

/* ── 6 · EL BARRIDO SE MIRÓ EL ÁRBOL ENTERO ──────────────────────────────────
   Suelos sobre el propio instrumento, no sobre el trabajo de nadie. Si el
   recorrido se rompiera —un `readdirSync` que ya no entra en subdirectorios, un
   filtro de extensión de más— el barrido devolvería una cifra pequeña y la
   cobertura saldría preciosa. */
{
  assert.ok(
    superficie.archivos >= 900,
    `el barrido sólo leyó ${superficie.archivos} archivos; el árbol tiene más de novecientos`,
  );
  assert.ok(
    archivos.some((a) => a.ruta.startsWith("src/lib/cad/engine/commands/")),
    "el recorrido no entra en los subdirectorios profundos",
  );
  assert.ok(
    !archivos.some((a) => NO_SE_BARRE(a.ruta)),
    "el barrido está leyendo lo que declaró no mirar",
  );
  assert.ok(
    !archivos.some((a) => a.ruta === "src/i18n/coverage.ts"),
    "el instrumento se está contando a sí mismo",
  );
  ok();
}

/* ── 7 · CADA ÁREA DECLARADA EXISTE ──────────────────────────────────────────
   Un área cuyo prefijo se quedó viejo cuenta cero y no se distingue de un área
   ya traducida. Es la forma silenciosa de que este informe deje de informar. */
{
  for (const area of superficie.porArea) {
    assert.ok(
      area.archivos > 0,
      `el área «${area.area}» no casa con ningún archivo: su prefijo se quedó viejo`,
    );
  }
  assert.equal(superficie.porArea.length, AREAS.length);
  assert.equal(
    superficie.porArea.reduce((n, a) => n + a.archivos, 0),
    superficie.archivos,
    "la suma por áreas no es el total de archivos",
  );
  assert.equal(
    superficie.porArea.reduce((n, a) => n + a.textos, 0),
    superficie.textos,
    "la suma por áreas no es el total de textos",
  );
  ok();
}

/* ── 8 · EL DETECTOR SIGUE DETECTANDO ────────────────────────────────────────
   El único suelo del barrido, y es sobre el instrumento. Sin él, romper
   `pareceEspanol` subiría la cobertura publicada al 100 % sin traducir una sola
   frase, y la bitácora empezaría a mentir con cifras «medidas». Es un suelo:
   añadir español no lo rompe: eso es justo lo que este spec NO cobra. */
{
  assert.ok(
    superficie.textos >= 1000,
    `el barrido encontró ${superficie.textos} textos en español; el detector se rompió`,
  );
  assert.ok(
    superficie.archivosConTexto >= 300,
    `sólo ${superficie.archivosConTexto} archivos con texto: el detector se rompió`,
  );
  const libCad = superficie.porArea.find((a) => a.area === "lib-cad");
  assert.ok(
    libCad && libCad.textos > 0,
    "lib/cad sin una sola cadena en español no describe este repositorio",
  );
  assert.ok(cobertura.porcentaje < 100 && cobertura.porcentaje > 0);
  assert.equal(cobertura.superficieTotal, contrato.clavesDeReferencia + superficie.textos);
  ok();
}

const porArea = superficie.porArea
  .map((a) => `${a.area} ${a.textos} (${a.archivosConTexto}/${a.archivos} arch.)`)
  .join(" · ");

console.log(
  [
    `catalog-contract: ${bloques} bloques verdes.`,
    `  CATÁLOGOS (gate): ${declaradosEnReferencia.length} namespaces × ${locales.length} idiomas = ` +
      `${contrato.clavesDeReferencia} claves por idioma, sin un solo defecto ` +
      `[${declaradosEnReferencia.join(", ")}].`,
    `  CIFRA 1 · cobertura por claves: ${cobertura.clavesTraducidas}/${cobertura.superficieTotal} = ` +
      `${cobertura.porcentaje} % (TECHO: el detector cuenta frases, no palabras sueltas).`,
    `  CIFRA 2 · superficie pendiente: ${superficie.textos} textos en español cableados fuera de claves, ` +
      `en ${superficie.archivosConTexto}/${superficie.archivos} archivos de apps/web/src.`,
    `  por área — ${porArea}`,
    ...superficie.muestras.map((m) => `    p.ej. ${m.ruta}:${m.linea} · ${JSON.stringify(m.texto)}`),
    `  (medida, no presupuesto: ${superficieComoTexto(superficie).split("\n").length} áreas, ninguna con umbral)`,
  ].join("\n"),
);
