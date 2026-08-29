"use client";

/**
 * El estudio en modo demostración: el MISMO editor, con el puerto de
 * documentos sin red (`createDemoDocumentPort`). Nada está capado por
 * interfaz — dibujar, acotar, capas, línea de comandos y trazar a PDF
 * funcionan; lo que no existe aquí es la nube, y el banner lo dice.
 *
 * El banner es PERMANENTE y discreto a la vez: una tira fija abajo que no
 * roba puntero fuera de sí misma ni tapa la línea de comandos (queda por
 * encima del borde inferior del lienzo, con `pointer-events` solo en la
 * tira). No se puede cerrar a propósito: una demostración que se disfraza de
 * producto completo es una promesa falsa.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CadStudioSkeleton } from "@/components/cad/studio/CadStudioSkeleton";
import { buttonClass } from "@/components/ui";
import { DEMO_DOCUMENT_ID } from "@/lib/cad/demo/demo-constants";
import type { DocumentLifecyclePort } from "@/components/cad/document-lifecycle/controller";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
  loading: () => <CadStudioSkeleton etapa="Preparando la demostración…" />,
});

export function DemoStudio() {
  const router = useRouter();
  /**
   * El puerto llega por import() DESPUÉS de hidratar, igual que el editor: el
   * conversor de plantillas y las normas mexicanas que arrastra (~70 KB gzip
   * medidos) no pertenecen a la primera carga de una página pública. La página
   * pinta el esqueleto al instante y todo lo pesado llega junto, un latido
   * después, sobre los mismos huecos.
   */
  const [documentPort, setDocumentPort] = useState<DocumentLifecyclePort | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/lib/cad/demo/demo-port").then(({ createDemoDocumentPort }) => {
      if (alive) setDocumentPort(createDemoDocumentPort());
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!documentPort) {
    return <CadStudioSkeleton etapa="Preparando la demostración…" />;
  }
  return (
    <div className="relative h-dvh">
      <CadStudioHost
        documentId={DEMO_DOCUMENT_ID}
        model={DEMO_DOCUMENT_ID}
        revision="demo"
        open
        onClose={() => router.push("/")}
        readOnly={false}
        documentPort={documentPort}
        withCollaboration={false}
        title="Demostración"
        subtitle="Casa habitación · se guarda en tu navegador"
      />
      <aside
        data-testid="demo-banner"
        aria-label="Aviso de demostración"
        className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3"
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-full border border-border bg-card/95 py-2 pl-5 pr-2 shadow-elevated backdrop-blur">
          <p className="type-small text-foreground">
            Estás en la demostración — tu dibujo vive en este navegador.
          </p>
          <Link
            href={`/register?returnTo=${encodeURIComponent("/dashboard?demo=1")}`}
            data-testid="demo-register-cta"
            className={buttonClass({ variant: "primary", size: "sm" })}
          >
            Crea tu cuenta gratis y llévatelo
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
