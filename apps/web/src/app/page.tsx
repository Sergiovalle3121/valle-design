import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  CloudUpload,
  DraftingCompass,
  FileDown,
  Printer,
  Ruler,
  Terminal,
} from "lucide-react";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { Logo } from "@/components/brand/Logo";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { DOC_GUIDES, PRICING_PATH, docGuidePath } from "@/config/site-routes";
import { JsonLd } from "@/components/JsonLd";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import {
  faqPageJsonLd,
  productJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo/structured-data";

/**
 * LA PORTADA PÚBLICA.
 *
 * La versión anterior describía la arquitectura del sistema —"panel conectado
 * a la API del producto"— y remataba diciendo que no publicaba tarifas. Era
 * cierta y no vendía nada: un arquitecto que hoy paga AutoCAD no busca un panel
 * conectado a una API, busca saber si puede entregar su plano.
 *
 * Esta reescritura cambia el criterio de qué se cuenta, no el de si es cierto.
 * Cada capacidad anunciada aquí tiene módulo, spec y —en la mayoría— golden en
 * el repositorio; las que existen a medias se anuncian CON su límite escrito al
 * lado, y hay una sección entera dedicada a lo que el producto todavía no hace.
 * La razón es comercial además de ética: en CAD el comprador prueba antes de
 * firmar, y una promesa que el editor no cumple se descubre en la primera
 * sesión, cuando ya te ha costado la confianza.
 *
 * Tres cosas que NO están aquí y no es un olvido: testimonios (no existe ni uno
 * real), logotipos de clientes (igual) y precios (el catálogo vive en
 * `/precios`, que construye otro frente; esta página enlaza, no inventa).
 */

const description =
  "CAD 2D en línea para arquitectura e ingeniería: dibuja planos en el navegador con capas, bloques, cotas asociativas, DXF e impresión a PDF a escala.";

export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "CAD en línea para dibujar planos en el navegador",
  description,
});

/**
 * Capacidades. `limite` no es letra pequeña: se pinta con el mismo tamaño que
 * el resto y por eso está en la misma estructura de datos. Una ficha sin límite
 * es una ficha cuya capacidad está cerrada de punta a punta.
 */
const capabilities = [
  {
    icon: DraftingCompass,
    title: "Dibujo 2D con la precisión que exige un plano",
    text: "Líneas, polilíneas con arcos, círculos, arcos, rectángulos, polígonos, elipses y splines. Referencias a objetos indexadas, rastreo polar, entrada por coordenadas y línea de comandos con la tabla de alias de siempre: escribes L, C o TR y responde.",
    limite: null,
  },
  {
    icon: Ruler,
    title: "Cotas asociativas y anotación",
    text: "Cota lineal, alineada, angular, de radio y de diámetro, con estilos de cota aplicables al plano entregado. La cota queda amarrada a la geometría que mide: mueves el muro y el número cambia solo.",
    limite: null,
  },
  {
    icon: Blocks,
    title: "Capas, bloques, sombreado y texto",
    text: "Gestor de capas con color, tipo de línea y grosor; biblioteca de bloques con atributos, compartida por organización; sombreado asociativo al contorno; texto de párrafo con maquetación real. Muros que resuelven su unión en L, en T y en continuación colineal al dibujarlos.",
    limite:
      "Sin bloques dinámicos ni comportamiento anotativo, y el sombreado resuelve contornos poligonales: las islas anidadas y los contornos curvos siguen pendientes.",
  },
  {
    icon: Printer,
    title: "Espacio papel e impresión a escala",
    text: "Presentaciones con varias ventanas, cada una a su escala, con capas congeladas por ventana. Papeles A4 a A0, carta y tabloide; escalas normalizadas de 1:1 a 1:5000; tablas de plumas CTB y STB que deciden color y grosor de cada trazo. La lámina sale a PDF con el tamaño de página exacto, cajetín y escala gráfica.",
    limite:
      "El emisor deja escrito qué fuentes incrustó y cuáles sustituyó por una estándar; todavía no publicamos una medición de fidelidad tipográfica.",
  },
  {
    icon: FileDown,
    title: "DXF de ida y de vuelta",
    text: "Importa y exporta DXF de texto con comprobación previa y un manifiesto de pérdidas que dice, entidad por entidad, qué no viajó igual. Casi nada se degrada en silencio, y lo que sí, está listado abajo.",
    limite:
      "Se escribe DXF de AutoCAD 2000 (AC1015) y sólo geometría plana: la Z se aplana. La importación admite hasta 12 MB y 50.000 entidades por archivo, y el corpus de ida y vuelta es propio: aún no hay uno de archivos de terceros con licencia para publicar una matriz de interoperabilidad.",
  },
  {
    icon: Terminal,
    title: "AutoLISP dentro del navegador",
    text: "Un intérprete AutoLISP con lector, evaluador, funciones de entidad por códigos DXF, conjuntos de selección y diálogos DCL, ejecutándose en tu navegador dentro de un entorno aislado con presupuesto de pasos y de tiempo. Las rutinas que automatizan tu trabajo repetitivo dejan de estar atadas a una instalación de escritorio.",
    limite:
      "Es un subconjunto del lenguaje: una rutina que dependa de funciones fuera de esa superficie necesita adaptarse. Tus rutinas se guardan en el navegador, no en el servidor, así que hoy no viajan solas a otra computadora.",
  },
  {
    icon: CloudUpload,
    title: "Proyectos en la nube, con red debajo",
    text: "Los documentos viven en el servidor, aislados por organización, con guardado explícito y autoguardado sobre la misma cola de escritura, versiones consultables y comparación entre ellas. Para revisar, enlaces con caducidad y revocación, y comentarios anclados a la geometría.",
    limite:
      "La revisión es asíncrona: dos personas comentan y se turnan sobre el documento, no dibujan a la vez con cursores simultáneos. Los borradores de recuperación se guardan en tu navegador durante siete días, no en el servidor.",
  },
] as const;

/** Lo que NO hace. Va arriba del FAQ a propósito: es la objeción real. */
const limits = [
  [
    "No abrimos ni escribimos DWG",
    "El editor detecta el formato y lo rechaza con un mensaje claro en lugar de fingir que lo entiende y devolverte un dibujo roto. El intercambio se hace en DXF de texto, que es el formato que sí sabemos leer y escribir con manifiesto de pérdidas.",
  ],
  [
    "No es un editor colaborativo en vivo",
    "Puedes compartir, comentar sobre la geometría y resolver conflictos al guardar, pero dos personas no mueven la misma línea al mismo tiempo.",
  ],
  [
    "El muro todavía no aloja puertas ni ventanas",
    "Los muros resuelven sus uniones solos —esquina, T y continuación colineal—, pero una puerta o una ventana se coloca hoy como bloque encima del muro: el muro no recorta su hueco todavía.",
  ],
  [
    "No garantizamos trabajo sin conexión",
    "El producto está pensado para trabajar conectado. El comportamiento con la red caída, en varias pestañas o con cierre forzado no está medido todavía, así que no lo prometemos.",
  ],
  [
    "No tenemos nubes de puntos, raster georreferenciado ni GIS",
    "Nada de LAS, GeoTIFF o SHP. Si tu flujo depende de eso, hoy no somos tu herramienta.",
  ],
] as const;

/** A quién va dirigido. Describe un modo de trabajo, no un cliente inventado. */
const audiences = [
  {
    title: "Despachos de arquitectura",
    text: "Plantas y detalles con muros que se unen limpios en la esquina, cotas que se recalculan al mover la geometría y láminas que salen a escala normalizada en el PDF que firma el responsable.",
  },
  {
    title: "Ingeniería e instalaciones",
    text: "Capas por especialidad, referencias externas para el fondo arquitectónico y ventanas a distintas escalas en la misma presentación.",
  },
  {
    title: "Quien trabaja desde varias computadoras",
    text: "El dibujo vive en el servidor: entras desde la oficina, desde tu casa o desde la obra con un navegador y encuentras la última versión guardada.",
  },
  {
    title: "Equipos que ya automatizan con LISP",
    text: "Las rutinas que le ahorran horas a tu despacho pueden correr en el navegador, dentro de un entorno aislado y con presupuesto de ejecución.",
  },
] as const;

/**
 * FAQ. Responde a las preguntas que de verdad frenan la compra, incluidas las
 * incómodas. Se exporta la misma estructura al JSON-LD para que lo que ve
 * Google y lo que ve la persona sean, literalmente, el mismo texto.
 */
const faq = [
  [
    "¿Puedo abrir mis archivos DWG?",
    "No. Valle Design no abre ni escribe DWG: el editor detecta ese formato y lo rechaza en lugar de producir un dibujo degradado sin avisar. El intercambio se hace con DXF de texto, que sí importamos y exportamos con comprobación previa y manifiesto de pérdidas. Casi cualquier programa de dibujo puede guardar una copia en DXF.",
  ],
  [
    "¿En qué se diferencia de un CAD de escritorio?",
    "En que no instalas nada y el dibujo no vive en un disco duro concreto. Entras con un navegador, abres el proyecto y sigues donde lo dejaste. A cambio, hay funciones de un CAD de escritorio maduro que todavía no tenemos, y están enumeradas arriba sin adornos.",
  ],
  [
    "¿Dónde quedan mis planos y quién los ve?",
    "En el servidor del despliegue, aislados por organización. El acceso exige sesión verificada y pertenencia comprobada en el servidor; lo que se comparte fuera se comparte con enlaces que caducan y se pueden revocar.",
  ],
  [
    "¿Puedo imprimir a escala de verdad?",
    "Sí. Colocas el dibujo en una presentación, eliges tamaño de papel y escala, y la lámina sale a PDF con el tamaño de página exacto, su cajetín y su escala gráfica. Una unidad de dibujo mide en el papel lo que la escala dice que mide.",
  ],
  [
    "¿Funcionan mis rutinas de AutoLISP?",
    "Las que se apoyen en el subconjunto del lenguaje implementado, sí: hay lector, evaluador, funciones de entidad por códigos DXF, conjuntos de selección y diálogos DCL, todo dentro de un entorno aislado con presupuesto de ejecución. Una rutina que use funciones fuera de esa superficie necesitará adaptarse, y por ahora tus rutinas se guardan en el navegador y no viajan solas a otra computadora. Pruébala antes de darla por migrada.",
  ],
  [
    "¿Necesito internet todo el tiempo?",
    "Sí. Está pensado para trabajar conectado y no prometemos un modo sin conexión que no hemos medido.",
  ],
  [
    "¿Cuánto cuesta?",
    "Los planes y sus condiciones están en la página de precios. Esta página no publica tarifas por su cuenta para que no haya dos verdades sobre lo mismo.",
  ],
] as const;

const featureList = [
  "Dibujo 2D con referencias a objetos y línea de comandos",
  "Cotas asociativas con estilos de cota",
  "Capas, bloques con atributos, sombreado asociativo y texto de párrafo",
  "Espacio papel con varias ventanas y escalas",
  "Impresión a PDF con tamaño de papel y tabla de plumas",
  "Importación y exportación DXF con manifiesto de pérdidas",
  "Intérprete AutoLISP con DCL en entorno aislado",
  "Documentos en la nube con versiones y diario de recuperación",
] as const;

const linkBase =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

export default function LandingPage() {
  return (
    <main id="contenido" className="min-h-screen overflow-hidden text-foreground">
      <JsonLd data={softwareApplicationJsonLd({ description, featureList })} />
      <JsonLd data={productJsonLd({ description })} />
      <JsonLd data={faqPageJsonLd(faq)} />

      <nav
        aria-label="Navegación principal"
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8"
      >
        <Link href="/" className={`inline-flex ${linkBase}`}>
          <Logo />
        </Link>
        <div className="flex flex-wrap items-center gap-1 sm:gap-3">
          <Link
            className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 ${linkBase}`}
            href={PRICING_PATH}
          >
            Precios
          </Link>
          <Link
            className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 ${linkBase}`}
            href="/docs"
          >
            Guías
          </Link>
          <Link
            className={`rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 ${linkBase}`}
            href="/login"
          >
            Iniciar sesión
          </Link>
          <Link
            className={`rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 ${linkBase}`}
            href="/register"
          >
            Crear cuenta
          </Link>
        </div>
      </nav>

      <section
        aria-labelledby="hero-title"
        className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-24"
      >
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-indigo-600 dark:text-indigo-300">
            CAD en línea para arquitectura e ingeniería
          </p>
          <h1
            id="hero-title"
            className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Dibuja tus planos en el navegador. Sin instalar nada.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">
            {PRODUCT_LABEL.design} es un software de dibujo arquitectónico que
            corre donde ya trabajas: capas, bloques, cotas asociativas, espacio
            papel e intercambio DXF, con tus proyectos guardados en la nube en
            vez de en una computadora concreta. Una alternativa a AutoCAD en la
            nube para quien necesita entregar planos, no administrar licencias.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500 ${linkBase}`}
            >
              Crear mi cuenta
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={PRICING_PATH}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 px-5 py-3 font-semibold hover:bg-black/[.025] dark:border-white/20 dark:hover:bg-white/[.025] ${linkBase}`}
            >
              Ver precios
            </Link>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Antes de que lo preguntes: no abrimos archivos DWG. Importamos y
            exportamos DXF, que es el formato con el que cualquier programa de
            dibujo puede entregarte una copia.
          </p>
        </div>

        <div
          aria-label="Recorrido desde la cuenta hasta la lámina entregada"
          className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-slate-500/5 p-6 sm:p-9"
        >
          <h2 className="text-2xl font-semibold">De la cuenta a la lámina</h2>
          <ol className="mt-6 space-y-4">
            {[
              "Crea tu cuenta y abre un proyecto en tu organización",
              "Dibuja, o empieza importando un DXF que ya tengas",
              "Acota, organiza por capas y arma la presentación",
              "Imprime a PDF a escala y comparte para revisión",
            ].map((item, index) => (
              <li key={item} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-700 dark:text-indigo-200"
                >
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/docs"
            className={`mt-8 inline-flex items-center gap-2 font-semibold text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-200 ${linkBase}`}
          >
            Ver las guías paso a paso
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="capacidades"
        className="bg-black/[.025] px-5 py-20 dark:bg-white/[.025] sm:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 id="capacidades" className="text-3xl font-bold sm:text-4xl">
            Lo que ya puedes hacer hoy
          </h2>
          <p className="mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
            Cada punto de esta lista corresponde a algo implementado y probado en
            el producto. Donde falta terminar algo, está dicho en la misma ficha.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text, limite }) => (
              <article
                key={title}
                className="flex flex-col rounded-2xl border border-black/10 bg-white/60 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <Icon
                  aria-hidden="true"
                  className="h-7 w-7 text-indigo-600 dark:text-indigo-300"
                />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
                  {text}
                </p>
                {limite ? (
                  <p className="mt-4 border-t border-black/10 pt-4 text-sm leading-6 text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <span className="font-semibold">Límite actual: </span>
                    {limite}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="para-quien"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8"
      >
        <h2 id="para-quien" className="text-3xl font-bold sm:text-4xl">
          Para quién está pensado
        </h2>
        <p className="mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
          Si tu día termina con una lámina que alguien firma, esto se construyó
          mirando tu mesa de trabajo.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {audiences.map(({ title, text }) => (
            <article
              key={title}
              className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
            >
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="limites"
        className="bg-black/[.025] px-5 py-20 dark:bg-white/[.025] sm:px-8"
      >
        <div className="mx-auto max-w-5xl">
          <h2 id="limites" className="text-3xl font-bold sm:text-4xl">
            Lo que todavía no hacemos
          </h2>
          <p className="mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
            Prefieres enterarte aquí que en tu primera entrega. Esta lista se
            acorta con el producto, no con el copy.
          </p>
          <dl className="mt-10 grid gap-6 sm:grid-cols-2">
            {limits.map(([title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-black/10 bg-white/60 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <dt className="text-lg font-semibold">{title}</dt>
                <dd className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
                  {text}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="guias"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8"
      >
        <h2 id="guias" className="text-3xl font-bold sm:text-4xl">
          Guías para empezar bien
        </h2>
        <p className="mt-3 max-w-3xl text-gray-600 dark:text-gray-300">
          Escritas desde lo que el producto hace de verdad, con sus límites
          señalados donde corresponde.
        </p>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {DOC_GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={docGuidePath(guide.slug)}
                className={`flex h-full flex-col rounded-2xl border border-black/10 p-6 transition hover:border-indigo-500/40 hover:bg-indigo-500/[.04] dark:border-white/10 ${linkBase}`}
              >
                <span className="text-lg font-semibold">{guide.title}</span>
                <span className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
                  {guide.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="faq"
        className="bg-black/[.025] px-5 py-20 dark:bg-white/[.025] sm:px-8"
      >
        <div className="mx-auto max-w-4xl">
          <h2 id="faq" className="text-3xl font-bold sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 divide-y divide-black/10 dark:divide-white/10">
            {faq.map(([question, answer]) => (
              <details key={question} className="group py-5">
                <summary className="cursor-pointer text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
                  {question}
                </summary>
                <p className="mt-3 max-w-3xl leading-7 text-gray-600 dark:text-gray-300">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="cta-final"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8"
      >
        <div className="rounded-3xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 to-slate-500/5 p-8 sm:p-12">
          <h2 id="cta-final" className="text-3xl font-bold sm:text-4xl">
            Empieza tu primer plano en línea
          </h2>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600 dark:text-gray-300">
            Crea la cuenta, abre un proyecto y dibuja. Si ya tienes un DXF, súbelo
            y sigue desde ahí.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500 ${linkBase}`}
            >
              Crear mi cuenta
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={PRICING_PATH}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 px-5 py-3 font-semibold hover:bg-black/[.025] dark:border-white/20 dark:hover:bg-white/[.025] ${linkBase}`}
            >
              Ver precios
            </Link>
          </div>
        </div>
      </section>

      <footer className="px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold">{PRODUCT_LABEL.design}</p>
            <p className="mt-2 text-sm text-gray-500">{BRAND.copyright}</p>
            {/*
              Aviso de marcas: nombrar a la competencia para posicionarse es
              legítimo; dejar que alguien deduzca una afiliación que no existe,
              no. Va en el pie, visible en todas las secciones.
            */}
            <p className="mt-2 max-w-md text-sm text-gray-500">
              AutoCAD y DWG son marcas de Autodesk, Inc. {BRAND.brandName} no
              está afiliado a Autodesk ni respaldado por Autodesk.
            </p>
          </div>
          <nav
            aria-label="Enlaces legales y de ayuda"
            className="flex flex-wrap gap-x-5 gap-y-3 text-sm"
          >
            {[
              ["Precios", PRICING_PATH],
              ["Documentación", COMMERCIAL_LINKS.documentation],
              ["Soporte", COMMERCIAL_LINKS.support],
              ["Estado", COMMERCIAL_LINKS.status],
              ["Contacto", COMMERCIAL_LINKS.contact],
              ["Privacidad", COMMERCIAL_LINKS.privacy],
              ["Términos", COMMERCIAL_LINKS.terms],
              ["Licencias", COMMERCIAL_LINKS.licenses],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className={`underline-offset-4 hover:underline ${linkBase}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
