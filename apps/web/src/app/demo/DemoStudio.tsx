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
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, House, PenLine, Store } from "lucide-react";
import { CadStudioSkeleton } from "@/components/cad/studio/CadStudioSkeleton";
import { Button, Card, buttonClass } from "@/components/ui";
import { DEMO_DOCUMENT_ID } from "@/lib/cad/demo/demo-constants";
import {
  DEMO_STARTING_CHOICES,
  readDemoFirstChoice,
  rememberDemoFirstChoice,
  type DemoStartingChoice,
} from "@/lib/cad/demo/demo-first-choice";
import type { DemoDocumentPort } from "@/components/cad/document-lifecycle/demo-port";

const CadStudioHost = dynamic(() => import("@/components/cad/CadStudioHost"), {
  ssr: false,
  loading: () => <CadStudioSkeleton etapa="Preparando la demostración…" />,
});

const CHOICE_ICONS = {
  "casa-habitacion": House,
  departamento: Building2,
  "local-comercial": Store,
  "en-blanco": PenLine,
} as const;

function demoStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function DemoStudio() {
  const router = useRouter();
  /**
   * El puerto llega por import() DESPUÉS de hidratar, igual que el editor: el
   * conversor de plantillas y las normas mexicanas que arrastra (~70 KB gzip
   * medidos) no pertenecen a la primera carga de una página pública. La página
   * pinta el esqueleto al instante y todo lo pesado llega junto, un latido
   * después, sobre los mismos huecos.
   */
  const [documentPort, setDocumentPort] = useState<DemoDocumentPort | null>(null);
  const [opening, setOpening] = useState<DemoStartingChoice | "choose" | null>(null);
  const portModule = useRef<Promise<typeof import("@/components/cad/document-lifecycle/demo-port")> | null>(null);
  const [restored, setRestored] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => {
    let alive = true;
    portModule.current = import("@/components/cad/document-lifecycle/demo-port");
    const storage = demoStorage();
    const previousChoice = readDemoFirstChoice(storage);
    // Un autosave de antes de este selector ya es una visita previa. Recordar
    // su arranque conserva ese hecho incluso si luego adopta o limpia el plano.
    if (previousChoice) rememberDemoFirstChoice(storage, previousChoice);
    queueMicrotask(() => {
      if (alive) setOpening(previousChoice ?? "choose");
    });
    return () => { alive = false; };
  }, []);
  const chooseDemo = useCallback((choice: DemoStartingChoice) => {
    rememberDemoFirstChoice(demoStorage(), choice);
    setOpening(choice);
  }, []);
  useEffect(() => {
    if (opening !== "choose") return;
    const timer = window.setTimeout(() => chooseDemo("en-blanco"), 4800);
    return () => window.clearTimeout(timer);
  }, [chooseDemo, opening]);
  useEffect(() => {
    if (!opening || opening === "choose") return;
    let alive = true;
    void (portModule.current ?? import("@/components/cad/document-lifecycle/demo-port"))
      .then(({ createDemoDocumentPort }) => {
        if (alive) setDocumentPort(createDemoDocumentPort(demoStorage(), opening));
      });
    return () => { alive = false; };
  }, [opening]);

  if (opening === "choose") {
    return (
      <main data-testid="demo-first-choice" className="flex min-h-dvh items-center bg-background px-4 py-8 text-foreground sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <p className="type-eyebrow mb-3 text-primary-ink">VALLECAD · DEMOSTRACIÓN</p>
          <h1 className="type-display">¿Qué vas a dibujar?</h1>
          <p className="type-lead mt-3 max-w-2xl text-muted-foreground">
            Elige un punto de partida. Puedes editarlo de inmediato y tu dibujo se guarda en este navegador.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DEMO_STARTING_CHOICES.map(({ id, label, description }) => {
              const Icon = CHOICE_ICONS[id];
              return (
                <Card key={id} as="article" data-testid={`demo-choice-${id}`} className="flex flex-col">
                  <Icon aria-hidden="true" className="mb-5 h-7 w-7 text-primary-ink" />
                  <h2 className="type-heading">{label}</h2>
                  <p className="type-small mt-2 flex-1 text-muted-foreground">{description}</p>
                  <Button className="mt-6" fullWidth onClick={() => chooseDemo(id)}>
                    Abrir {label.toLowerCase()}
                  </Button>
                </Card>
              );
            })}
          </div>
          <p className="type-small mt-6 text-muted-foreground" role="status">
            Si no eliges, abriremos un plano en blanco en cinco segundos.
          </p>
        </div>
      </main>
    );
  }
  if (!documentPort || !opening) {
    return <CadStudioSkeleton etapa="Preparando la demostración…" />;
  }
  const recoverPrevious = () => {
    if (!documentPort.restorePrevious()) return;
    setRestored(true);
    // El editor abre su documento al montar. La misma instancia de puerto
    // entrega ahora el dibujo elegido, sin añadir una ruta de carga al monolito.
    setEditorKey((value) => value + 1);
  };
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
        key={editorKey}
        documentId={DEMO_DOCUMENT_ID}
        model={DEMO_DOCUMENT_ID}
        revision="demo"
        open
        onClose={() => router.push("/")}
        readOnly={false}
        documentPort={documentPort}
        withCollaboration={false}
        title="Demostración"
        subtitle={`${DEMO_STARTING_CHOICES.find(({ id }) => id === opening)?.label ?? "Dibujo"} · se guarda en tu navegador`}
        demoBanner={demoBanner}
        uiModeDefault="esencial"
      />
      {documentPort.hasRecoverableDocument && !restored
        ? createPortal(
            <aside
              data-testid="demo-recovery-notice"
              role="status"
              className="fixed bottom-16 right-14 z-[80]"
            >
              <Button size="sm" onClick={recoverPrevious} title="Tu dibujo anterior sigue guardado en este navegador">
                Recuperar mi dibujo anterior
              </Button>
            </aside>,
            document.body,
          )
        : null}
    </div>
  );
}
