/**
 * «INGENIERÍA QUE PUEDES AUDITAR» — la prueba social de un producto sin
 * clientes todavía: números que salen de artefactos de CI, no de testimonios.
 * Servidor puro: las cifras se resuelven en build desde `site-evidence.ts`
 * (que a su vez las importa de docs/cad/evidence/); el conteo animado es un
 * adorno del camino, nunca del dato — el HTML ya trae el número completo.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CountUp } from "./CountUp";
import { RevealOnScroll } from "./RevealOnScroll";
import { siteEvidenceFigures } from "@/lib/marketing/site-evidence";

export function EngineeringEvidence() {
  const figures = siteEvidenceFigures();
  return (
    <div className="mt-12">
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((figure, index) => (
          <RevealOnScroll as="li" key={figure.label} delayMs={index * 90}>
            <div className="flex h-full flex-col rounded-card border border-border bg-card p-6 shadow-resting">
              <p
                className="font-mono text-4xl font-semibold tracking-tight text-primary-ink"
                aria-hidden="true"
              >
                <CountUp value={figure.value} />
              </p>
              {/* La cifra visible es el adorno; la frase completa —número
                  incluido— es lo que lee un lector de pantalla. */}
              <h3 className="mt-2 font-semibold text-foreground">
                <span className="sr-only">{figure.value.toLocaleString("es-MX")} </span>
                {figure.label}
              </h3>
              <p className="type-small mt-3 text-muted-foreground">{figure.detail}</p>
            </div>
          </RevealOnScroll>
        ))}
      </ul>
      <p className="type-small mt-6 max-w-2xl text-muted-foreground">
        Cada cifra sale de un artefacto de evidencia generado por la propia
        integración continua — si el número cambia, es porque se midió de
        nuevo.{" "}
        <Link
          href="/docs"
          className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline"
        >
          Cómo se verifica cada una
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
