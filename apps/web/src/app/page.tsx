import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PRODUCT_LABEL } from "@/config/brand";
import { DOC_GUIDES, PRICING_PATH, docGuidePath } from "@/config/site-routes";
import { JsonLd } from "@/components/JsonLd";
import { PublicNav } from "@/components/PublicNav";
import { SkipLink } from "@/components/SkipLink";
import { Comparison } from "@/components/marketing/Comparison";
import { FaqCenter } from "@/components/marketing/FaqCenter";
import { FreeLaunchNote } from "@/components/marketing/FreeLaunchNote";
import { ProductFrame } from "@/components/marketing/ProductFrame";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { buttonClass } from "@/components/ui";
import { FAQ_COUNT, FAQ_FOR_STRUCTURED_DATA } from "@/lib/marketing/faq";
import { dwgClaim } from "@/lib/marketing/dwg-claim";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import {
  faqPageJsonLd,
  productJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo/structured-data";

/**
 * LA PORTADA PÚBLICA.
 *
 * ── LO QUE CAMBIA EN LA CAMPAÑA VALLECAD (2026-09-16) ────────────────────────
 *
 * La versión anterior era un catálogo, no una portada: doce bandas, una
 * treintena de tarjetas con borde, un hero a dos columnas con una lámina SVG
 * animada en vez del producto, una insignia «Nuevo» con un sólido WebGL
 * girando, numeración de lámina, tres orbes, malla cónica, halo y flotación.
 * Cada pieza tenía una razón escrita; juntas se veían baratas y saturadas. El
 * dueño la puso al lado de la página de un CAD de escritorio y la diferencia
 * no era de texto: era de AIRE.
 *
 * Esta portada tiene siete secciones. El hero reparte título y activación
 * en dos columnas de escritorio y conserva su orden de lectura en móvil:
 *
 *   1 · HERO oscuro: un titular, un párrafo de dos líneas, dos botones y la
 *       captura REAL del estudio a lo ancho. La captura sale de
 *       `public/product/`, generada conduciendo el editor de verdad
 *       (`npm run capture:product`); es el LCP y va con `priority`.
 *   2 · TRES PILARES sin tarjetas: 2D de precisión, 3D con sólidos, DXF y DWG
 *       reales. Cada frase tiene módulo y spec detrás.
 *   3 · EL ESTUDIO, grande: el espacio papel con su cajetín, a lo ancho.
 *   4 · COMPARATIVA con un CAD de escritorio tradicional, en una tabla sobria
 *       (`Comparison.tsx`), con el aviso de marcas debajo.
 *   5 · PRECIOS sin cifras: el modelo, y el botón a `/precios`, que las lee
 *       del catálogo. `public-pages.spec.ts` y el e2e móvil prohíben una
 *       cifra aquí, y con razón: dos verdades sobre el mismo importe es una
 *       de más.
 *   6 · CENTRO DE PREGUNTAS (`h2#faq`, que el e2e móvil exige) y las guías.
 *   7 · CTA final.
 *
 * Lo que se retiró de la portada sigue existiendo como componente
 * (`CapabilityExplorer`, `ShowcaseFlows`, `EngineeringEvidence`,
 * `FeaturedTemplates`, `PlanViewport`, `Brep3DBadge`, `HeroBackdrop`): quitar
 * los archivos es un seguimiento aparte, no parte de esta reescritura.
 *
 * ── LO QUE NO CAMBIA ─────────────────────────────────────────────────────────
 *
 * El criterio de qué se cuenta: cada capacidad anunciada tiene módulo, spec y
 * —en la mayoría— golden en el repositorio; las que existen a medias se
 * anuncian CON su límite en la misma frase. Lo de DWG sale de
 * `lib/marketing/dwg-claim.ts`, que lee las banderas de ESTA build; el hero
 * ya no puede decir «no abrimos DWG» mientras el importador de la misma
 * build acepta AC1015. Y el reposicionamiento del 2026-08-28 sigue en pie: la
 * página dice lo que hace, no contra quién compite; la única mención a otra
 * marca es la línea de `<TrademarkNotice/>` bajo la comparativa, y
 * `check:surface` falla si aparece otra.
 *
 * Tampoco hay testimonios, logotipos de clientes ni CIFRAS DE PRECIO: no
 * existe ni un testimonio real, y el catálogo vive en `/precios`.
 */

const description =
  "CAD en el navegador para arquitectura e ingeniería: dibujo 2D de precisión, sólidos 3D, DXF real e impresión a PDF a escala, sin instalar nada.";

export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "CAD en línea: dibuja en 2D y modela en 3D en el navegador",
  description,
});

/**
 * La lista de capacidades del JSON-LD dice EXACTAMENTE lo que la página
 * enseña. La fila de DWG entra sólo si esta build abre alguno.
 */
function featureListFor(dwgEnabled: boolean): readonly string[] {
  return [
    "Dibujo 2D con referencias a objetos y línea de comandos",
    "Modelado 3D directo con kernel B-rep propio (extrusión, booleanas, redondeo)",
    "Cotas asociativas con estilos de cota",
    "Capas, bloques con atributos, sombreado asociativo y texto de párrafo",
    "Espacio papel con varias ventanas y escalas",
    "Impresión a PDF con tamaño de papel y tabla de plumas",
    "Importación y exportación DXF con manifiesto de pérdidas",
    ...(dwgEnabled ? ["Importación DWG en beta (sólo lectura)"] : []),
    "Intérprete LISP con DCL en entorno aislado",
    "Documentos en la nube con diario de recuperación",
  ];
}

/** Sección con fondo tenue. Alterna con el fondo base para marcar el ritmo. */
function Band({
  children,
  id,
  tinted = false,
}: {
  children: React.ReactNode;
  id: string;
  tinted?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={tinted ? "border-y border-border bg-muted/30" : undefined}
    >
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
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
  lead?: string;
}) {
  return (
    <header className="max-w-3xl">
      <p className="type-eyebrow text-primary-ink">{eyebrow}</p>
      <h2 id={`${id}-title`} className="type-title mt-3">
        {title}
      </h2>
      {lead ? (
        <p className="type-lead mt-4 text-muted-foreground">{lead}</p>
      ) : null}
    </header>
  );
}

export default function LandingPage() {
  const dwg = dwgClaim();
  const featureList = featureListFor(dwg.importEnabled);

  /**
   * TRES PILARES, y por qué estos tres. Son las tres preguntas con las que
   * llega quien viene de un CAD de escritorio: ¿dibuja con precisión?,
   * ¿modela?, ¿abre mis archivos? Cada respuesta lleva su límite dentro.
   */
  const pillars: ReadonlyArray<{
    eyebrow: string;
    title: string;
    text: string;
    /** Enlace a la guía que lo cuenta largo, cuando existe. */
    guide?: { slug: (typeof DOC_GUIDES)[number]["slug"]; label: string };
  }> = [
    {
      eyebrow: "01 · Dibujo",
      title: "2D de precisión",
      text: "Referencias a objetos, línea de comandos con los alias de siempre, capas, bloques con atributos y cotas asociativas que se recalculan al mover la geometría. Espacio papel con varias ventanas y la lámina a PDF con su tamaño de página exacto.",
      guide: {
        slug: "acotacion-asociativa",
        label: "Por qué la cota se mueve con el dibujo",
      },
    },
    {
      eyebrow: "02 · Modelado",
      title: "3D con sólidos",
      text: "Modelado directo sobre el mismo documento que tu plano, con un kernel B-rep propio: extrusión, PRESSPULL sobre una cara, booleanas y redondeo. Facetado, no exacto: sin caras NURBS y sin BIM.",
    },
    {
      eyebrow: "03 · Archivos",
      title: "DXF y DWG, sin letra pequeña",
      // DXF: `lib/cad/dxf-export.ts` escribe AC1015 con manifiesto de pérdidas.
      // DWG: la frase sale de las banderas de ESTA build (`dwg-claim.ts`).
      text: `DXF en AC1015, lectura y escritura, con un manifiesto de pérdidas que dice entidad por entidad qué no viajó igual. ${dwg.short}`,
      guide: { slug: "dxf-vs-dwg", label: "Qué significa cada formato" },
    },
  ];

  /** El modelo de licencia, sin importes: los importes viven en `/precios`. */
  const pricingFacts = [
    [
      "Por mes, y se cancela desde el portal",
      "Sin contrato anual obligatorio. Conservas el acceso hasta el final del periodo pagado.",
    ],
    [
      "En pesos, con IVA incluido y CFDI",
      "Los importes se publican en pesos mexicanos con el IVA ya dentro, y el comprobante sale con los datos fiscales de tu despacho.",
    ],
    [
      "Sin instalar ni activar nada",
      "Entras con el navegador que ya tienes. El dibujo vive en el servidor, aislado por organización.",
    ],
  ] as const;

  return (
    <>
      <SkipLink />
      <PublicNav />

      <main id="contenido" className="text-foreground">
        <JsonLd
          data={softwareApplicationJsonLd({ description, featureList })}
        />
        <JsonLd data={productJsonLd({ description })} />
        <JsonLd data={faqPageJsonLd(FAQ_FOR_STRUCTURED_DATA)} />

        {/* ── 1 · HERO ───────────────────────────────────────────────────── */}
        {/*
          `dark` en la sección y no en <html>: el hero es oscuro en los dos
          temas porque la captura del estudio es oscura y un marco claro
          alrededor de un lienzo negro se lee como una ventana recortada. La
          variante `@custom-variant dark (&:where(.dark, .dark *))` y los
          tokens de `.dark` en globals.css hacen el resto: dentro de esta
          sección `bg-background`, `text-foreground` y los botones resuelven a
          la paleta oscura sin una sola clase `dark:`.
        */}
        <section
          aria-labelledby="hero-title"
          data-landing="vallecad-2026-09"
          className="dark bg-background text-foreground"
        >
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-16 lg:pb-20">
            <div className="flex flex-col gap-10 sm:gap-12">
              <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)] lg:gap-14">
                <div>
                  <p className="type-eyebrow text-primary-ink">
                    {PRODUCT_LABEL.design} · CAD en el navegador
                  </p>
                  <h1 id="hero-title" className="type-display mt-5">
                    Dibuja con precisión. Entrega con confianza.
                  </h1>
                </div>
                <div>
                  <p className="type-lead mt-6 max-w-2xl text-muted-foreground">
                    CAD 2D y modelado 3D en tu navegador. Traza, acota y prepara
                    planos a escala, con tus documentos guardados en la nube.
                  </p>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:flex-col">
                    <Link
                      href="/register"
                      className={buttonClass({
                        variant: "primary",
                        size: "lg",
                      })}
                    >
                      Crear cuenta gratis
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                    {/* La segunda acción del hero es TOCAR el producto: la
                    demostración abre el editor real sin cuenta. */}
                    <Link
                      href="/demo"
                      data-testid="hero-demo-cta"
                      className={buttonClass({
                        variant: "secondary",
                        size: "lg",
                      })}
                    >
                      Probar sin cuenta
                    </Link>
                  </div>
                  {/* El número lo publica el backend: la portada no promete una
                  duración que el alta luego no conceda. */}
                  <FreeLaunchNote className="mt-6 max-w-xl type-small text-muted-foreground" />
                </div>
              </div>

              {/*
              EL PRODUCTO, A LO ANCHO. Una página de CAD que no enseña el CAD
              a lo ancho es lo contrario de lo que quiere ver quien compra
              CAD. Sin halo ni flotación: el estudio tiene peso propio.
            */}
              <ProductFrame
                src="/product/estudio-dark.png"
                alt={`El estudio de ${PRODUCT_LABEL.design} con una planta arquitectónica acotada`}
                priority
                float={false}
                halo={false}
                sizes="(min-width: 1280px) 72rem, 100vw"
                data-testid="hero-figure"
              />
            </div>
          </div>
        </section>

        {/* ── 2 · TRES PILARES ───────────────────────────────────────────── */}
        <Band id="producto">
          <SectionHead
            id="producto"
            eyebrow="El producto"
            title="Del primer trazo al plano entregado"
          />
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {pillars.map(({ eyebrow, title, text, guide }) => (
              <article key={title}>
                <p className="type-eyebrow text-muted-foreground">{eyebrow}</p>
                <h3 className="type-heading mt-3">{title}</h3>
                <p className="type-body mt-4 text-muted-foreground">{text}</p>
                {guide ? (
                  <Link
                    href={docGuidePath(guide.slug)}
                    className="type-small mt-4 inline-flex items-center gap-1.5 font-semibold text-primary-ink"
                  >
                    {guide.label}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </Band>

        {/* ── 3 · EL ESTUDIO ─────────────────────────────────────────────── */}
        <Band id="estudio" tinted>
          <SectionHead
            id="estudio"
            eyebrow="Prepara la entrega"
            title="Tu plano, con su hoja y su escala"
            lead="Organiza las vistas en espacio papel, añade el cajetín y publica una lámina PDF. Esta captura muestra el editor real."
          />
          <ProductFrame
            src="/product/espacio-papel.png"
            alt="Espacio papel con la lámina y su cajetín"
            caption="El espacio papel con su cajetín: eliges tamaño de hoja y escala, y la lámina sale a PDF con el tamaño de página exacto."
            float={false}
            halo={false}
            sizes="(min-width: 1280px) 72rem, 100vw"
            className="mt-14"
          />
        </Band>

        {/* ── 4 · COMPARATIVA ────────────────────────────────────────────── */}
        <Band id="comparativa">
          <SectionHead
            id="comparativa"
            eyebrow="Comparar"
            title="Frente a un CAD de escritorio tradicional"
            lead="Comprueba qué encaja con tu forma de trabajar y revisa los límites de intercambio antes de importar un proyecto."
          />
          <Comparison />
        </Band>

        {/* ── 5 · PRECIOS ────────────────────────────────────────────────── */}
        <Band id="precios" tinted>
          <SectionHead
            id="precios"
            eyebrow="Precios"
            title="Elige cómo seguir trabajando"
            lead="Consulta los planes disponibles y sus condiciones en el catálogo de precios."
          />
          <dl className="mt-14 grid gap-10 md:grid-cols-3">
            {pricingFacts.map(([title, text]) => (
              <div key={title}>
                <dt className="type-heading">{title}</dt>
                <dd className="type-body mt-3 text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={PRICING_PATH}
            className={`${buttonClass({ variant: "primary", size: "lg" })} mt-12`}
          >
            Ver precios
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Band>

        {/* ── 6 · CENTRO DE PREGUNTAS ────────────────────────────────────── */}
        {/*
          El `<h2 id="faq">` es un contrato: `e2e/public/mobile-accessibility`
          lo busca por ancla, no por titular. Las guías van aquí como una línea
          de enlaces, no como tarjetas: el pie ya las lista y el spec de SEO
          pide que la portada las enlace.
        */}
        <section id="faq-centro" aria-labelledby="faq">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <header className="max-w-3xl">
              <p className="type-eyebrow text-primary-ink">
                Centro de preguntas
              </p>
              <h2 id="faq" className="type-title mt-3">
                Resuelve tus dudas antes de empezar
              </h2>
              <p className="type-lead mt-4 text-muted-foreground">
                {FAQ_COUNT} respuestas sobre dibujo, archivos, cuenta y planes.
                Busca tu pregunta o elige un tema.
              </p>
            </header>
            <FaqCenter />
            <p className="type-small mt-12 text-muted-foreground">
              Para leerlo largo, las guías:{" "}
              {DOC_GUIDES.map((guide, index) => (
                <span key={guide.slug}>
                  {index > 0 ? " · " : null}
                  <Link
                    href={docGuidePath(guide.slug)}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {guide.title}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </section>

        {/* ── 7 · CTA FINAL ──────────────────────────────────────────────── */}
        <Band id="cta-final" tinted>
          <div className="max-w-3xl">
            <h2 id="cta-final-title" className="type-title">
              Empieza tu primer plano en línea
            </h2>
            <p className="type-lead mt-4 text-muted-foreground">
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

        <SiteFooter />
      </main>
    </>
  );
}
