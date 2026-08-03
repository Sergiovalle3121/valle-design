import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  DraftingCompass,
  FileText,
  FolderPlus,
} from "lucide-react";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS } from "@/config/commercial";

const capabilities = [
  {
    icon: FolderPlus,
    title: "Proyectos y documentos",
    text: "Crea proyectos, asocia documentos y vuelve a abrirlos desde un panel conectado a la API del producto.",
  },
  {
    icon: DraftingCompass,
    title: "Estudio CAD 2D",
    text: "Abre cada documento por su identificador y trabaja con las herramientas de geometría, capas y dibujo disponibles en el estudio.",
  },
  {
    icon: CircleAlert,
    title: "Estados comprensibles",
    text: "La interfaz distingue una sesión expirada, falta de permisos, ausencia de conexión y documentos que ya no existen.",
  },
] as const;

const faq = [
  [
    "¿Qué necesito para empezar?",
    "Una cuenta activa y acceso a una organización con permisos para usar el CAD. Después puedes crear un proyecto y un documento desde el panel.",
  ],
  [
    "¿Puedo crear un documento importando un archivo?",
    "Sí. El panel convierte archivos DXF y documentos JSON canónicos mediante un pipeline real con validación, progreso y reporte de pérdidas. Valle Design no anuncia compatibilidad DWG nativa.",
  ],
  [
    "¿Dónde consulto la disponibilidad del servicio?",
    "La página de estado indica si este despliegue tiene una fuente pública de telemetría configurada. No muestra un estado operativo inventado.",
  ],
  [
    "¿Cuánto cuesta?",
    "Esta web no publica tarifas ni ofrece un proceso de compra. La disponibilidad comercial se consulta mediante el canal de contacto configurado.",
  ],
] as const;

export default function LandingPage() {
  return (
    <main
      id="contenido"
      className="min-h-screen overflow-hidden text-foreground"
    >
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"
      >
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <DraftingCompass
            aria-hidden="true"
            className="h-6 w-6 text-indigo-500"
          />
          {PRODUCT_LABEL.design}
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/5"
            href="/login"
          >
            Iniciar sesión
          </Link>
          <Link
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/register"
          >
            Crear cuenta
          </Link>
        </div>
      </nav>

      <section
        aria-labelledby="hero-title"
        className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-28"
      >
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-indigo-600 dark:text-indigo-300">
            CAD 2D para proyectos técnicos
          </p>
          <h1
            id="hero-title"
            className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Organiza tus planos y abre cada documento en un estudio CAD web.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">
            {PRODUCT_LABEL.design} conecta cuentas, proyectos y documentos con
            un editor 2D. Las funciones disponibles dependen de los permisos y
            de la configuración de cada despliegue.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500"
            >
              Empezar ahora
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a
              href={COMMERCIAL_LINKS.documentation}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 px-5 py-3 font-semibold hover:bg-black/[.025] dark:border-white/20 dark:hover:bg-white/[.025]"
            >
              Consultar documentación
            </a>
          </div>
        </div>
        <div
          aria-label="Flujo disponible en Valle Design"
          className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-slate-500/5 p-6 sm:p-9"
        >
          <FileText aria-hidden="true" className="h-10 w-10 text-indigo-500" />
          <h2 className="mt-8 text-2xl font-semibold">
            Del panel al documento
          </h2>
          <ol className="mt-6 space-y-4">
            {[
              "Crea una cuenta o inicia sesión",
              "Crea un proyecto en tu organización",
              "Añade un documento al proyecto",
              "Ábrelo en el estudio CAD",
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
        </div>
      </section>

      <section
        aria-labelledby="capabilities"
        className="bg-black/[.025] px-5 py-20 dark:bg-white/[.025] sm:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 id="capabilities" className="text-3xl font-bold sm:text-4xl">
            Capacidades que puedes comprobar
          </h2>
          <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
            La superficie pública describe sólo flujos presentes en el producto.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-black/10 bg-white/60 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <Icon
                  aria-hidden="true"
                  className="h-7 w-7 text-indigo-600 dark:text-indigo-300"
                />
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="commercial-availability"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8"
      >
        <div className="rounded-3xl border border-black/10 p-6 sm:p-10 dark:border-white/10">
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-300">
            Precio no publicado
          </p>
          <h2
            id="commercial-availability"
            className="mt-3 text-3xl font-bold sm:text-4xl"
          >
            Consulta la disponibilidad comercial
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-gray-600 dark:text-gray-300">
            No hay tarifas, planes de pago ni compra automática publicados en
            esta web. Una evaluación o un acuerdo comercial requiere confirmar
            alcance y condiciones por escrito.
          </p>
          <a
            href={COMMERCIAL_LINKS.sales}
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-500/5 dark:text-indigo-200"
          >
            Contactar ventas
          </a>
        </div>
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

      <footer className="px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold">{PRODUCT_LABEL.design}</p>
            <p className="mt-2 text-sm text-gray-500">{BRAND.copyright}</p>
          </div>
          <nav
            aria-label="Enlaces legales y de ayuda"
            className="flex flex-wrap gap-x-5 gap-y-3 text-sm"
          >
            {[
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
                className="underline-offset-4 hover:underline"
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
