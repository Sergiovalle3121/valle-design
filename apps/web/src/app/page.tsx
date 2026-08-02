import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  DraftingCompass,
  FileCheck2,
  GitCompareArrows,
  LockKeyhole,
  MessageSquareCheck,
  ShieldCheck,
} from "lucide-react";
import { BRAND, PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS, COMMERCIAL_PLANS } from "@/config/commercial";

const features = [
  {
    icon: DraftingCompass,
    title: "Precisión 2D",
    text: "Dibuja con coordenadas, referencias a objetos, capas, bloques y cotas asociativas sin perder intención técnica.",
  },
  {
    icon: GitCompareArrows,
    title: "Interoperabilidad demostrada",
    text: "Importa, inspecciona y entrega DXF; el manifiesto de conversión hace visibles las simplificaciones antes de publicar.",
  },
  {
    icon: MessageSquareCheck,
    title: "Versiones y reviews",
    text: "Compara revisiones, conserva comentarios y recupera el contexto de cada cambio en un historial trazable.",
  },
  {
    icon: Bot,
    title: "IA con confirmación humana",
    text: "La IA propone geometría y comprobaciones. Tú revisas, corriges y confirmas antes de incorporar cualquier resultado.",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad desde el diseño",
    text: "Controles de acceso, aislamiento de espacios y trazabilidad para proteger el trabajo durante todo su ciclo de vida.",
  },
  {
    icon: LockKeyhole,
    title: "Tus datos siguen siendo tuyos",
    text: "Conservas la propiedad de tus archivos y entregables. Puedes exportarlos en formatos documentados cuando los necesites.",
  },
];

const faq = [
  [
    "¿Puedo trabajar con archivos existentes?",
    "Sí. Puedes importar DXF, revisar el resultado de la conversión y exportar entregables sin ocultar posibles simplificaciones.",
  ],
  [
    "¿La IA modifica mis planos automáticamente?",
    "No. Sus resultados son propuestas: una persona debe revisarlas y confirmarlas antes de aplicarlas.",
  ],
  [
    "¿Cómo funcionan las revisiones?",
    "Cada versión mantiene su contexto para comparar cambios, solicitar una revisión y documentar decisiones.",
  ],
  [
    "¿Qué ocurre con mis datos?",
    "Tus archivos y entregables siguen siendo tuyos. Los controles de acceso delimitan quién puede consultarlos o modificarlos.",
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
            className="h-6 w-6 text-cyan-500"
          />
          {PRODUCT_LABEL.design}
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
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
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-cyan-600">
            Diseño técnico, sin cajas negras
          </p>
          <h1
            id="hero-title"
            className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Del primer trazo a la revisión aprobada, con precisión y control.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">
            {PRODUCT_LABEL.design} reúne dibujo 2D, interoperabilidad
            verificable, revisiones e IA supervisada para que tu equipo entregue
            con confianza.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white"
            >
              Empezar ahora{" "}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a
              href={COMMERCIAL_LINKS.sales}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-black/15 px-5 py-3 font-semibold dark:border-white/20"
            >
              Solicitar demostración
            </a>
          </div>
        </div>
        <div
          aria-label="Flujo de entrega verificable"
          className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 p-6 sm:p-9"
        >
          <FileCheck2 aria-hidden="true" className="h-10 w-10 text-cyan-500" />
          <h2 className="mt-8 text-2xl font-semibold">
            Cada entrega deja evidencia
          </h2>
          <ol className="mt-6 space-y-4">
            {[
              "Dibuja con ayudas de precisión",
              "Comprueba la conversión y los cambios",
              "Solicita revisión y registra la aprobación",
              "Publica un archivo listo para entregar",
            ].map((item, index) => (
              <li key={item} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-600"
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
            Control técnico de principio a fin
          </h2>
          <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
            Herramientas claras para crear, comprobar, colaborar y decidir.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-black/10 bg-white/60 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <Icon aria-hidden="true" className="h-7 w-7 text-cyan-600" />
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
        aria-labelledby="plans"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8"
      >
        <h2 id="plans" className="text-3xl font-bold sm:text-4xl">
          Planes para cada forma de trabajar
        </h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {COMMERCIAL_PLANS.map((plan) => (
            <article
              key={plan.name}
              className="flex rounded-2xl border border-black/10 p-6 dark:border-white/10"
            >
              <div className="flex w-full flex-col">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-3 min-h-12 text-gray-600 dark:text-gray-300">
                  {plan.description}
                </p>
                <p className="mt-6 text-lg font-semibold">
                  {plan.approvedPrice ??
                    (plan.salesOnly
                      ? "Contactar ventas"
                      : "Precio no publicado")}
                </p>
                <ul className="mt-5 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check
                        aria-hidden="true"
                        className="mt-1 h-4 w-4 shrink-0 text-emerald-600"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.salesOnly ? COMMERCIAL_LINKS.sales : "/register"}
                  className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-500 px-4 py-2 font-semibold text-indigo-600 dark:text-indigo-300"
                >
                  {plan.salesOnly ? "Contactar ventas" : "Crear cuenta"}
                </a>
              </div>
            </article>
          ))}
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
