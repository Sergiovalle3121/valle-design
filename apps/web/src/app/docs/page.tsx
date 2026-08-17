import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "./PublicPageShell";
import { DOC_GUIDES, PRICING_PATH, docGuidePath } from "@/config/site-routes";
import { publicPageMetadata } from "@/lib/seo/page-metadata";

/**
 * El índice de documentación deja de ser sólo una nota de alcance y pasa a ser
 * también la puerta de las guías. Los títulos y resúmenes NO se escriben aquí:
 * salen de `DOC_GUIDES`, la misma lista que alimenta el sitemap y el `metadata`
 * de cada guía, para que el enlace y el artículo no puedan discrepar.
 */
export const metadata: Metadata = publicPageMetadata({
  path: "/docs",
  title: "Guías y documentación",
  description:
    "Guías prácticas de CAD en línea: dibujar una planta arquitectónica, intercambio DXF, AutoLISP en el navegador, acotación asociativa e impresión a PDF a escala.",
});

export default function DocumentationPage() {
  return (
    <PublicPageShell
      eyebrow="Documentación"
      title="Guías y documentación de Valle Design"
      intro="Aquí se explica cómo se trabaja de verdad con el producto y dónde están sus límites hoy. Las guías están escritas desde lo que el editor hace, no desde lo que nos gustaría que hiciera."
    >
      <PublicSection title="Guías paso a paso">
        <ul className="space-y-6">
          {DOC_GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                className="text-lg font-semibold text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-200"
                href={docGuidePath(guide.slug)}
              >
                {guide.title}
              </Link>
              <p className="mt-1">{guide.summary}</p>
            </li>
          ))}
        </ul>
      </PublicSection>

      <PublicSection title="Recorrido básico">
        <ol className="list-decimal space-y-3 pl-6">
          <li>Crea una cuenta o inicia sesión.</li>
          <li>Abre el panel y crea un proyecto dentro de tu organización.</li>
          <li>Crea un documento y asígnalo al proyecto.</li>
          <li>Abre el documento para entrar al estudio CAD.</li>
        </ol>
        <Link className={publicActionClass} href="/register">
          Crear cuenta
        </Link>
      </PublicSection>

      <PublicSection title="Alcance publicado">
        <ul className="list-disc space-y-3 pl-6">
          <li>
            Dibujo 2D con referencias a objetos, rastreo polar y línea de
            comandos con alias.
          </li>
          <li>
            Capas, bloques con atributos, sombreado asociativo y texto de
            párrafo.
          </li>
          <li>
            Cotas asociativas con estilos de cota aplicables al plano entregado.
          </li>
          <li>
            Espacio papel con varias ventanas a distintas escalas e impresión a
            PDF con tabla de plumas.
          </li>
          <li>
            Importación y exportación DXF de texto con manifiesto de pérdidas.
          </li>
          <li>
            Intérprete AutoLISP con DCL, ejecutado en el navegador dentro de un
            entorno aislado.
          </li>
          <li>
            Documentos en servidor con versiones, comparación, comentarios
            anclados y enlaces de revisión revocables.
          </li>
        </ul>
      </PublicSection>

      <PublicSection title="Archivos y compatibilidad">
        <p>
          Valle Design importa y exporta DXF de texto. El resultado de una
          exportación incluye un manifiesto de pérdidas que enumera, entidad por
          entidad, qué se degradó al escribir el archivo; revísalo antes de
          entregar.
        </p>
        <p>
          No se anuncia compatibilidad DWG nativa: el editor detecta ese formato
          y lo rechaza en lugar de producir un dibujo degradado. Antes de
          entregar un archivo, revisa el resultado en el programa que vaya a
          consumirlo.
        </p>
        <Link className={publicActionClass} href={docGuidePath("dxf-vs-dwg")}>
          Leer la guía de DXF y DWG
        </Link>
      </PublicSection>

      <PublicSection title="Planes y condiciones">
        <p>
          Los planes disponibles y sus condiciones se publican en la página de
          precios, que es su única fuente.
        </p>
        <Link className={publicActionClass} href={PRICING_PATH}>
          Ver precios
        </Link>
      </PublicSection>
    </PublicPageShell>
  );
}
