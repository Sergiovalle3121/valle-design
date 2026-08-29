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
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LayoutTemplate, X } from "lucide-react";
import { ErrorBoundary } from "@/components/ui";
import type { CadStarterChoice } from "./starter-choice";

/**
 * El formulario de plantilla de arranque llega cuando el usuario abre
 * «documento nuevo», no al listar documentos. Arrastra `CAD_STARTER_TEMPLATES`
 * y con él 1 036 KB de fuente —capas normalizadas, cajetín, papeles mexicanos,
 * operaciones de layout— que no hacen falta para ver una lista. `ssr: false`
 * porque es puro cliente y su hueco lo ocupa un marcador de la misma altura.
 */
const CadStarterTemplateFields = dynamic(
  () =>
    import("./starter-template-fields").then((m) => m.CadStarterTemplateFields),
  {
    ssr: false,
    loading: () => (
      <div
        className="mt-4 h-[4.5rem] animate-pulse rounded-xl bg-muted/40"
        aria-hidden="true"
      />
    ),
  },
);

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
    void import("@/lib/marketing/template-gallery").then(
      ({ galleryTemplate }) => {
        const template = galleryTemplate(id);
        if (alive && template)
          setStart({ id: template.id, label: template.label });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return [start, () => setStart(null)];
}

/** El contenido del documento, construido por el mismo conversor de la galería. */
export async function buildGalleryDocumentContent(id: string) {
  const { buildCadTemplateDocument } =
    await import("@/lib/cad/template-document");
  return buildCadTemplateDocument(id as never).document;
}

/**
 * Aterrizaje desde la DEMOSTRACIÓN (?demo=1): si el visitante dejó un dibujo
 * en su navegador, el primer documento de la cuenta nace de ese dibujo — la
 * promesa del banner («crea tu cuenta y llévatelo») cumplida con el mecanismo
 * de siempre: contenido escrito antes de abrir el estudio.
 */
export function useDemoAdoption(): [boolean, () => void] {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    let alive = true;
    void import("@/lib/cad/demo/demo-port").then(({ storedDemoDocument }) => {
      if (alive && storedDemoDocument()) setPending(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return [pending, () => setPending(false)];
}

/** El dibujo de la demo como contenido del documento; lo limpia tras leerlo. */
export async function takeDemoDocumentContent() {
  const { storedDemoDocument, clearDemoDocument } =
    await import("@/lib/cad/demo/demo-port");
  const document = storedDemoDocument();
  clearDemoDocument();
  return document;
}

/** Aviso: el documento nacerá del dibujo que dejaste en la demostración. */
export function DemoAdoptionNote({ onClear }: { onClear: () => void }) {
  return (
    <p
      data-testid="demo-adoption-note"
      className="mt-3 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 type-small text-foreground"
    >
      <LayoutTemplate aria-hidden="true" className="h-4 w-4 text-primary-ink" />
      Tu dibujo de la demostración está aquí: el primer documento nacerá de él.
      <button
        type="button"
        onClick={onClear}
        aria-label="Empezar sin el dibujo de la demostración"
        className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </p>
  );
}

/**
 * El aviso de arranque que toque — demo, plantilla de galería o el formulario
 * normal (children). Un solo punto de decisión para que `dashboard/page.tsx`
 * no cargue el ternario (su presupuesto de líneas es ley).
 */
export function StartNotes({
  demo,
  gallery,
  onClearDemo,
  onClearGallery,
  starter,
  onStarterChange,
  busy,
}: {
  demo: boolean;
  gallery: GalleryStart | null;
  onClearDemo: () => void;
  onClearGallery: () => void;
  starter: CadStarterChoice;
  onStarterChange: (choice: CadStarterChoice) => void;
  busy: boolean;
}) {
  if (demo) return <DemoAdoptionNote onClear={onClearDemo} />;
  if (gallery)
    return <GalleryStartNote start={gallery} onClear={onClearGallery} />;
  return (
    <ErrorBoundary zona="Plantilla de arranque" compacta className="mt-4">
      <CadStarterTemplateFields
        value={starter}
        onChange={onStarterChange}
        disabled={busy}
      />
    </ErrorBoundary>
  );
}

/**
 * El contenido de arranque del documento nuevo, con la precedencia del
 * tablero: el dibujo adoptado de la demo manda sobre la plantilla de galería;
 * null = sigue el flujo normal (starter o lienzo en blanco).
 */
export async function startDocumentContent(
  demo: boolean,
  gallery: GalleryStart | null,
): Promise<unknown | null> {
  if (demo) {
    const adopted = await takeDemoDocumentContent();
    if (adopted) return adopted;
  }
  if (gallery) return buildGalleryDocumentContent(gallery.id);
  return null;
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
