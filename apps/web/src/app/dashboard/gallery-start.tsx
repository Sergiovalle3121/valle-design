"use client";

/**
 * Aterrizaje «empieza con esta plantilla» (galería pública → tablero).
 *
 * La ficha de /plantillas manda al registro con
 * `returnTo=/dashboard?plantilla=<id>`; este módulo lee ese parámetro ya en el
 * tablero, resuelve la plantilla y produce el contenido del documento con el
 * catálogo REAL. Vive fuera de `dashboard/page.tsx` por su presupuesto de
 * líneas, y todo lo pesado entra por `import()` dinámico: el catálogo de
 * 5 000 líneas solo baja si el parámetro está presente (o al crear).
 *
 * El hook lee `window.location` en un efecto en vez de `useSearchParams` a
 * propósito: el tablero es una página cliente y el hook de Next exigiría una
 * frontera de Suspense por un dato que solo se necesita tras montar.
 */
import { useEffect, useState } from "react";
import { LayoutTemplate, X } from "lucide-react";

export interface GalleryStart {
  id: string;
  label: string;
}

export function useGalleryStart(): [GalleryStart | null, () => void] {
  const [start, setStart] = useState<GalleryStart | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("plantilla");
    if (!id) return;
    let alive = true;
    void import("@/lib/marketing/template-gallery").then(({ galleryTemplate }) => {
      const template = galleryTemplate(id);
      if (alive && template) setStart({ id: template.id, label: template.label });
    });
    return () => {
      alive = false;
    };
  }, []);
  return [start, () => setStart(null)];
}

/** El contenido del documento, construido por el mismo conversor de la galería. */
export async function buildGalleryDocumentContent(id: string) {
  const { buildCadTemplateDocument } = await import("@/lib/cad/template-document");
  return buildCadTemplateDocument(id as never).document;
}

/** Aviso compacto sobre el formulario de creación: qué plantilla va a abrirse. */
export function GalleryStartNote({
  start,
  onClear,
}: {
  start: GalleryStart;
  onClear: () => void;
}) {
  return (
    <p
      data-testid="gallery-start-note"
      className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 type-small text-foreground"
    >
      <LayoutTemplate aria-hidden="true" className="h-4 w-4 text-primary-ink" />
      El documento nacerá de la plantilla «{start.label}» con sus capas y su
      lámina puestas.
      <button
        type="button"
        onClick={onClear}
        aria-label="Quitar la plantilla elegida"
        className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </p>
  );
}
