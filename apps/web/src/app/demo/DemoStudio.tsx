"use client";

/**
 * El estudio en modo demostración: el MISMO editor, con el puerto de
 * documentos sin red (`createDemoDocumentPort`). Nada está capado por
 * interfaz — dibujar, acotar, capas, línea de comandos y trazar a PDF
 * funcionan; lo que no existe aquí es la nube, y el aviso lo dice.
 *
 * OLA «ARMAZÓN»: el aviso era una tarjeta FLOTANTE (`fixed bottom-24`) que
 * tapaba el lienzo por encima del plano — exactamente la clase de capa
 * permanente que esta ola vino a quitar. Ahora es una pastilla más DENTRO de
 * la fila superior (`demoBanner`, prop de `Layout3DEditor`, pintada en el
 * grupo fijo junto a Guardar/Cerrar editor): no flota, no tapa nada, y sigue
 * siendo tan permanente y alcanzable como antes — sólo que vive donde vive
 * el resto del chrome, no encima del dibujo.
 *
 * MEDIDO el 2026-09-22 a 1280×720 (`e2e/public/demo-studio.spec.ts`, rojo en
 * la CI de la #224): la fila superior pide 1243 px sin el aviso, así que
 * sobran 37 px, y la pastilla con su frase medía 387: el grupo fijo no cede,
 * la fila entera desbordaba y «Crea tu cuenta» quedaba fuera de la ventana,
 * sin barra que avisara. Dos cosas, ninguna de más:
 *   · la pastilla es SÓLO el botón (128 px); la frase «se guarda en tu
 *     navegador» ya está en el subtítulo del estudio y viaja en el `title`;
 *   · en la demostración no se pinta el selector de estado de aprobación
 *     (116 px): sin nube no hay revisores ni aprobación que registrar, y
 *     `Layout3DEditor` lo omite cuando recibe `demoBanner`.
 * Con eso el botón cabe a 1280 (sobran ~30 px) y el spec vuelve a poder
 * pulsarlo en su centro.
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
    void import("@/components/cad/document-lifecycle/demo-port").then(({ createDemoDocumentPort }) => {
      if (alive) setDocumentPort(createDemoDocumentPort());
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!documentPort) {
    return <CadStudioSkeleton etapa="Preparando la demostración…" />;
  }
  const demoBanner = (
    <aside
      data-testid="demo-banner"
      aria-label="Aviso de demostración"
      className="flex h-8 shrink-0 items-center type-micro"
    >
      <Link
        href={`/register?returnTo=${encodeURIComponent("/dashboard?demo=1")}`}
        data-testid="demo-register-cta"
        title="Demostración: tu dibujo se guarda en este navegador. Crea tu cuenta para llevártelo."
        className={buttonClass({ variant: "primary", size: "sm" })}
      >
        Crea tu cuenta
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </aside>
  );
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
        demoBanner={demoBanner}
        uiModeDefault="esencial"
      />
    </div>
  );
}
