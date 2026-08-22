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
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { DOC_GUIDES, PRICING_PATH, docGuidePath } from "@/config/site-routes";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { Logo } from "@/components/brand/Logo";
import { HeroBackdrop } from "@/components/marketing/HeroBackdrop";
import { ProductFrame } from "@/components/marketing/ProductFrame";
import { buttonClass } from "@/components/ui";
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
 * ── LO QUE CAMBIA EN LA CAMPAÑA DE DISEÑO ────────────────────────────────────
 * El texto se conserva casi entero; lo que cambia es QUÉ SE VE. La carencia
 * número uno de esta página era vender un CAD sin enseñar un dibujo: 537 líneas
 * de tarjetas de texto con ocho iconos de línea, y a la derecha del hero una
 * caja con degradado y una lista numerada. Ahora el producto ES la imagen —
 * capturas reales, generadas por `npm run capture:product`, que se regeneran
 * cuando el editor cambia en vez de envejecer en silencio.
 *
 * Y el orden pasa a ser de venta: prueba visual antes que enumeración, el
 * argumento del modelo de licencia antes que las capacidades, y la sección de
 * honestidad justo antes del FAQ, que es donde de verdad aparece la objeción.
 *
 * Tres cosas que NO están aquí y no es un olvido: testimonios (no existe ni uno
 * real), logotipos de clientes (igual) y CIFRAS DE PRECIO. Esto último no es
 * pudor: `public-pages.spec.ts` prohíbe una cifra en esta página, y con razón —
 * el catálogo vive en `/precios` y lo publica el propio producto desde su tabla
 * vigente. Dos verdades sobre el mismo importe es una de más.
 */

const description =
  "CAD 2D en línea para arquitectura e ingeniería: dibuja planos en el navegador con capas, bloques, cotas asociativas, DXF e impresión a PDF a escala.";

export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "CAD en línea para dibujar planos en el navegador",
  description,
});

/**
 * PRUEBA VISUAL. Cada captura sale de `public/product/`, generada conduciendo
 * el editor de verdad. `nota` no es un pie decorativo: dice qué mirar, que es
 * la diferencia entre una captura que informa y una que rellena.
 */
const proof = [
  {
    src: "/product/estudio-dark.png",
    alt: "El estudio de Valle Design con una planta arquitectónica acotada",
    nota: "Muros que resuelven su unión en la esquina, sombreado de corte y cotas amarradas a la geometría que miden. Todo dibujado con la línea de comandos, con los alias de siempre.",
  },
  {
    src: "/product/espacio-papel.png",
    alt: "Espacio papel con la lámina y su cajetín",
    nota: "El espacio papel con su cajetín: eliges tamaño de hoja y escala, y la lámina sale a PDF con el tamaño de página exacto.",
  },
  {
    src: "/product/paleta-capas.png",
    alt: "Gestor de capas con color, tipo de línea y grosor",
    nota: "Gestor de capas con color, tipo de línea y grosor de trazo, y congelado por ventana en la presentación.",
  },
] as const;

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

/**
 * EL ARGUMENTO DEL MODELO. Compara MODELOS de licencia, no importes: los
 * importes viven en `/precios`, que los lee del catálogo vigente del producto.
 * Cada fila describe algo comprobable sobre cómo funciona esto, no una promesa
 * sobre lo que hace la competencia.
 */
const licensing = [
  [
    "No instalas nada",
    "Entras con el navegador que ya tienes. Sin instalador, sin gestor de licencias, sin una computadora concreta donde vive el programa.",
  ],
  [
    "El dibujo no vive en un disco duro",
    "Los documentos están en el servidor, aislados por organización. Entras desde la oficina, desde tu casa o desde la obra y encuentras la última versión guardada.",
  ],
  [
    "Se paga por mes y se cancela desde el portal",
    "Sin contrato anual obligatorio. Cancelas cuando quieras y conservas el acceso hasta el final del periodo pagado.",
  ],
  [
    "Factura CFDI e IVA incluido",
    "Los importes se publican en pesos mexicanos con el IVA ya dentro, y la factura sale con los datos fiscales de tu despacho.",
  ],
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

/** Sección con fondo tenue. Alterna con el fondo base para marcar el ritmo. */
function Band({
  children,
  id,
  tinted = false,
}: {
  children: React.ReactNode;
  id?: string;
  tinted?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={tinted ? "border-y border-border bg-muted/30" : undefined}
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        {children}
      </div>
    </section>
  );
}

function SectionHead({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="max-w-3xl">
      <p className="type-eyebrow text-primary-ink">{eyebrow}</p>
      <h2 id={id} className="type-title mt-3">
        {title}
      </h2>
      <p className="type-lead mt-4 text-muted-foreground">{lead}</p>
    </header>
  );
}

export default function LandingPage() {
  return (
    <>
      <SkipLink />
      <PublicNav />

      <main id="contenido" className="text-foreground">
        <JsonLd data={softwareApplicationJsonLd({ description, featureList })} />
        <JsonLd data={productJsonLd({ description })} />
        <JsonLd data={faqPageJsonLd(faq)} />

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <section aria-labelledby="hero-title" className="relative">
          <HeroBackdrop />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pb-28 lg:pt-20">
            <div>
              <p className="type-eyebrow text-primary-ink">
                CAD en línea para arquitectura e ingeniería
              </p>
              <h1 id="hero-title" className="type-display mt-5 max-w-2xl">
                Dibuja tus planos en el navegador. Sin instalar nada.
              </h1>
              <p className="type-lead mt-6 max-w-xl text-muted-foreground">
                {PRODUCT_LABEL.design} es un software de dibujo arquitectónico
                que corre donde ya trabajas: capas, bloques, cotas asociativas,
                espacio papel e intercambio DXF, con tus proyectos guardados en
                la nube en vez de en una computadora concreta. Una alternativa a
                AutoCAD en la nube para quien necesita entregar planos, no
                administrar licencias.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className={buttonClass({ variant: "primary", size: "lg" })}
                >
                  Crear cuenta gratis
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  href={PRICING_PATH}
                  className={buttonClass({ variant: "secondary", size: "lg" })}
                >
                  Ver precios
                </Link>
              </div>
              <p className="type-small mt-6 max-w-xl text-muted-foreground">
                Antes de que lo preguntes: no abrimos archivos DWG. Importamos y
                exportamos DXF, que es el formato con el que cualquier programa
                de dibujo puede entregarte una copia.
              </p>
            </div>

            <ProductFrame
              priority
              src="/product/estudio-dark.png"
              alt="Valle Design · planta arquitectónica acotada"
            />
          </div>
        </section>

        {/* ── PRUEBA VISUAL ──────────────────────────────────────────────── */}
        <Band id="prueba" tinted>
          <SectionHead
            id="prueba"
            eyebrow="Esto es el producto"
            title="No es una maqueta: es el editor dibujando"
            lead="Las tres capturas de abajo se generan conduciendo el programa de verdad, comando a comando, cada vez que se publica. Si el editor cambiara, cambian ellas."
          />
          <div className="mt-12 grid gap-10 lg:grid-cols-3">
            {proof.map(({ src, alt, nota }) => (
              <ProductFrame
                key={src}
                src={src}
                alt={alt}
                caption={nota}
                float={false}
              />
            ))}
          </div>
        </Band>

        {/* ── EL MODELO ──────────────────────────────────────────────────── */}
        <Band id="modelo">
          <SectionHead
            id="modelo"
            eyebrow="El modelo"
            title="Una suscripción, no una licencia por computadora"
            lead="La diferencia con un CAD de escritorio no es sólo el precio: es dónde vive el programa, dónde vive el dibujo y qué pasa el día que cambias de equipo."
          />
          <dl className="mt-12 grid gap-5 sm:grid-cols-2">
            {licensing.map(([title, text]) => (
              <div
                key={title}
                className="rounded-card border border-border bg-card p-6 shadow-resting"
              >
                <dt className="type-heading">{title}</dt>
                <dd className="type-body mt-3 text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={PRICING_PATH}
            className={`${buttonClass({ variant: "primary" })} mt-10`}
          >
            Ver los planes y sus condiciones
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Band>

        {/* ── CAPACIDADES ────────────────────────────────────────────────── */}
        <Band id="capacidades" tinted>
          <SectionHead
            id="capacidades"
            eyebrow="Capacidades"
            title="Lo que ya puedes hacer hoy"
            lead="Cada punto de esta lista corresponde a algo implementado y probado en el producto. Donde falta terminar algo, está dicho en la misma ficha."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text, limite }) => (
              <article
                key={title}
                className="flex flex-col rounded-card border border-border bg-card p-6 shadow-resting"
              >
                <Icon aria-hidden="true" className="h-7 w-7 text-primary-ink" />
                <h3 className="type-heading mt-5">{title}</h3>
                <p className="type-body mt-3 text-muted-foreground">{text}</p>
                {limite ? (
                  <p className="type-small mt-auto border-t border-border pt-4 text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Límite actual:{" "}
                    </span>
                    {limite}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </Band>

        {/* ── PARA QUIÉN ─────────────────────────────────────────────────── */}
        <Band id="para-quien">
          <SectionHead
            id="para-quien"
            eyebrow="Para quién"
            title="Para quién está pensado"
            lead="Si tu día termina con una lámina que alguien firma, esto se construyó mirando tu mesa de trabajo."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {audiences.map(({ title, text }) => (
              <article
                key={title}
                className="rounded-card border border-border p-6"
              >
                <h3 className="type-heading">{title}</h3>
                <p className="type-body mt-3 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </Band>

        {/* ── HONESTIDAD (intacta: es un activo de confianza) ────────────── */}
        <Band id="limites" tinted>
          <SectionHead
            id="limites"
            eyebrow="Sin adornos"
            title="Lo que todavía no hacemos"
            lead="Prefieres enterarte aquí que en tu primera entrega. Esta lista se acorta con el producto, no con el copy."
          />
          <dl className="mt-12 grid gap-6 sm:grid-cols-2">
            {limits.map(([title, text]) => (
              <div
                key={title}
                className="rounded-card border border-border bg-card p-6"
              >
                <dt className="type-heading">{title}</dt>
                <dd className="type-body mt-3 text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        </Band>

        {/* ── GUÍAS ──────────────────────────────────────────────────────── */}
        <Band id="guias">
          <SectionHead
            id="guias"
            eyebrow="Guías"
            title="Guías para empezar bien"
            lead="Escritas desde lo que el producto hace de verdad, con sus límites señalados donde corresponde."
          />
          <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {DOC_GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={docGuidePath(guide.slug)}
                  className="group flex h-full flex-col rounded-card border border-border p-6 transition-[background-color,border-color,box-shadow] duration-200 ease-out-expo hover:border-primary/40 hover:bg-card hover:shadow-elevated"
                >
                  <span className="type-heading">{guide.title}</span>
                  <span className="type-body mt-3 text-muted-foreground">
                    {guide.summary}
                  </span>
                  <span className="type-small mt-4 inline-flex items-center gap-1.5 font-semibold text-primary-ink">
                    Leer la guía
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Band>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <Band id="faq" tinted>
          <div className="mx-auto max-w-4xl">
            <SectionHead
              id="faq"
              eyebrow="Dudas"
              title="Preguntas frecuentes"
              lead="Las que de verdad frenan la compra, incluidas las incómodas."
            />
            <div className="mt-10 divide-y divide-border border-y border-border">
              {faq.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="type-heading cursor-pointer list-none marker:content-none focus-visible:outline-2 focus-visible:outline-offset-4">
                    <span className="flex items-start justify-between gap-4">
                      {question}
                      <span
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-expo group-open:rotate-45"
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="type-body mt-3 max-w-3xl text-muted-foreground">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </Band>

        {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
        <Band id="cta-final">
          <div className="relative overflow-hidden rounded-surface border border-border bg-card p-8 shadow-elevated sm:p-14">
            <div
              aria-hidden="true"
              className="product-halo pointer-events-none absolute -right-20 -top-32 h-80 w-80"
            />
            <h2 id="cta-final" className="type-title max-w-2xl">
              Empieza tu primer plano en línea
            </h2>
            <p className="type-lead mt-4 max-w-2xl text-muted-foreground">
              Crea la cuenta, abre un proyecto y dibuja. Si ya tienes un DXF,
              súbelo y sigue desde ahí.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className={buttonClass({ variant: "primary", size: "lg" })}
              >
                Crear cuenta gratis
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link
                href={PRICING_PATH}
                className={buttonClass({ variant: "secondary", size: "lg" })}
              >
                Ver precios
              </Link>
            </div>
          </div>
        </Band>

        <footer className="border-t border-border px-5 py-12 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Logo />
              <p className="type-small mt-3 text-muted-foreground">
                {BRAND.copyright}
              </p>
              {/*
                Aviso de marcas: nombrar a la competencia para posicionarse es
                legítimo; dejar que alguien deduzca una afiliación que no existe,
                no. Va en el pie, visible en todas las secciones.
              */}
              <p className="type-small mt-2 max-w-md text-muted-foreground">
                AutoCAD y DWG son marcas de Autodesk, Inc. {BRAND.brandName} no
                está afiliado a Autodesk ni respaldado por Autodesk.
              </p>
            </div>
            <nav
              aria-label="Enlaces legales y de ayuda"
              className="type-small flex flex-wrap gap-x-5 gap-y-3 text-muted-foreground"
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
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </main>
    </>
  );
}
