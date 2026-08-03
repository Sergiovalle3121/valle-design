import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicPageShell,
  PublicSection,
  publicActionClass,
} from "./PublicPageShell";

export const metadata: Metadata = {
  title: "Documentación",
  description: "Guía pública del alcance actual de Valle Design.",
};

export default function DocumentationPage() {
  return (
    <PublicPageShell
      eyebrow="Documentación"
      title="Primeros pasos con Valle Design"
      intro="Esta guía describe el recorrido que está conectado al producto hoy y señala de forma expresa lo que todavía no se publica como una capacidad disponible."
    >
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
            Gestión de proyectos y documentos mediante la API del producto.
          </li>
          <li>Acceso al estudio por un identificador único de documento.</li>
          <li>Herramientas CAD 2D visibles en el propio estudio.</li>
          <li>Mensajes diferenciados para errores de acceso y conectividad.</li>
        </ul>
      </PublicSection>

      <PublicSection title="Archivos y compatibilidad">
        <p>
          La creación de un documento desde el panel no se presenta como una
          conversión de archivo. Las herramientas DXF que aparezcan dentro del
          estudio deben usarse atendiendo a sus avisos de elementos omitidos o
          degradados.
        </p>
        <p>
          No se anuncia compatibilidad DWG nativa. Antes de entregar un archivo,
          revisa el resultado en el programa que vaya a consumirlo.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
