"use client";

import { createPortal } from "react-dom";
import Link from "next/link";

/**
 * «ALGO SALIÓ MAL» — el camino de vuelta.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Los primeros arquitectos van a chocar con cosas que ninguna prueba de este
 * repositorio ha imaginado. Sin un camino de vuelta esa información se pierde
 * entera: la persona cierra la pestaña, no vuelve, y nadie sabe por qué. Un
 * enlace `mailto:` en una página de soporte no cuenta — obliga a salir del
 * estudio, a redactar el contexto a mano y a acertar con lo que hace falta
 * para reproducirlo, que es justo lo que nadie sabe de antemano.
 *
 * ── La decisión que ordena el diseño: se ve TODO lo que se manda ───────────
 *
 * El cuadro enseña los datos que salen de este navegador y avisa qué datos de
 * la sesión añade el servidor. La versión, el navegador, el
 * modo y el comando en curso viajan siempre: sin ellos «no me funciona» no
 * se puede reproducir. El plano NO viaja nunca —ni su contenido ni su
 * identificador— salvo que la persona marque la casilla, que nace apagada.
 *
 * Y lo que se autoriza es MIRAR el documento, no mandarlo: viaja su
 * identificador, jamás el dibujo. El plano ya vive en el servidor, con su
 * control de acceso; una copia en un buzón de correo no lo tiene.
 *
 * ── Por qué es un componente y no está en el monolito ──────────────────────
 *
 * La razón de siempre: `Layout3DEditor.tsx` sólo puede encoger. El estudio lo
 * monta con una línea.
 */
import { useState } from "react";
import { APP_VERSION } from "@/config/launch";
import { COMMERCIAL_CONTACTS } from "@/config/commercial";
import { designClient } from "@/lib/cad/repositories/client";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { Button, buttonClass } from "@/components/ui";
import { useStudioTraySlot } from "@/components/cad/studio/use-studio-tray";
import { useCadUiMode } from "@/components/cad/shell/ui-mode-host";
import { supportIncidentErrorMessage } from "./support-incident-error";
import { demoSupportDraftHref } from "./demo-support-draft";

export interface CadIncidentReporterProps {
  /** Versión del estudio. Por defecto la del build, que es la que hace falta. */
  appVersion?: string;
  /** Documento abierto, si lo hay. Sólo viaja con autorización explícita. */
  documentId?: string | null;
  /** El comando en curso cuando el usuario decidió que algo iba mal. */
  activeCommand?: string | null;
  /** /demo usa un documento local sin sesión; el endpoint exige cad:view. */
  localDemo?: boolean;
  className?: string;
}

type Estado = "cerrado" | "abierto" | "enviando" | "enviado" | "error";

const MINIMO = 10;

export function CadIncidentReporter({
  appVersion = APP_VERSION,
  documentId,
  activeCommand,
  localDemo = false,
  className,
}: CadIncidentReporterProps) {
  // En Esencial la bandeja deja sólo «Reportar un fallo»: quien abre por
  // primera vez no necesita dos buzones, y el de fallos es el que nos importa.
  // «Comentarios» sigue en Pro autenticado; el demo anónimo no tiene el permiso
  // cad:view que exige su endpoint y no debe ofrecer un envío que dará 401.
  const modo = useCadUiMode();
  const [estado, setEstado] = useState<Estado>("cerrado");
  /** El centro de comentarios, que es el OTRO canal. Ver la nota de abajo. */
  const [comentarios, setComentarios] = useState(false);
  const [texto, setTexto] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const userAgent =
    typeof navigator === "undefined" ? "desconocido" : navigator.userAgent;
  const demoDraftHref = localDemo
    ? demoSupportDraftHref(COMMERCIAL_CONTACTS.support, appVersion, userAgent, modo)
    : null;

  const enviar = async () => {
    setEstado("enviando");
    setProblema(null);
    try {
      await designClient.support.report({
        summary: texto,
        appVersion,
        userAgent,
        uiMode: modo,
        activeCommand: activeCommand ?? null,
        // El identificador sólo se ADJUNTA si está autorizado. El servidor lo
        // vuelve a comprobar; esto evita mandarlo siquiera.
        documentId: autorizado ? (documentId ?? null) : null,
        documentAuthorized: autorizado,
      });
      setEstado("enviado");
      setTexto("");
      setAutorizado(false);
    } catch (error) {
      setEstado("error");
      setProblema(supportIncidentErrorMessage(error));
    }
  };

  const tray = useStudioTraySlot();

  const trayButtonStyle =
    "inline-flex items-center rounded-control border border-border bg-surface px-1.5 py-0.5 type-micro text-muted-foreground hover:text-foreground";
  const pillButtons = tray ? (
    <>
      <button
        type="button"
        data-testid="cad-incident-open"
        onClick={() => setEstado("abierto")}
        title="Algo salió mal — cuéntanoslo sin salir del plano"
        // El rótulo dice lo que el botón HACE, no lo que pudo pasar. «Algo
        // salió mal» fijo en la bandeja de la barra de estado se lee como un
        // aviso de avería —parece que la aplicación está informando de un
        // fallo suyo— cuando en realidad es la puerta para contarnos uno. La
        // frase entera sigue en el tooltip, que es donde no alarma.
        //
        // Y un solo nombre accesible: antes convivían el rótulo ancho y el
        // corto (`sr-only`), así que un lector de pantalla anunciaba «Algo
        // salió mal Reportar». Ahora el nombre lo fija `aria-label` y los dos
        // rótulos son decorativos.
        aria-label="Reportar un fallo"
        className={className ?? trayButtonStyle}
      >
        <span aria-hidden="true" className="@max-[40rem]:hidden">
          Reportar un fallo
        </span>
        <span aria-hidden="true" className="sr-only @max-[40rem]:not-sr-only">
          Reportar
        </span>
      </button>
      <button
        type="button"
        hidden={modo === "esencial" || localDemo}
        data-testid="cad-feedback-open"
        onClick={() => setComentarios(true)}
        title="Una idea, una duda o algo que podríamos hacer mejor"
        className={trayButtonStyle}
      >
        <span className="@max-[40rem]:hidden">Comentarios</span>
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        data-testid="cad-incident-open"
        onClick={() => setEstado("abierto")}
        title="Algo salió mal — cuéntanoslo sin salir del plano"
        className={
          className ??
          "rounded-lg border border-border bg-surface/80 px-2.5 py-1 type-micro text-muted-foreground shadow hover:text-foreground"
        }
      >
        {/* Mismo criterio que la variante de bandeja de arriba. */}
        Reportar un fallo
      </button>
      <button
        type="button"
        data-testid="cad-feedback-open"
        hidden={localDemo}
        onClick={() => setComentarios(true)}
        title="Una idea, una duda o algo que podríamos hacer mejor"
        className="rounded-lg border border-border bg-surface/80 px-2.5 py-1 type-micro text-muted-foreground shadow hover:text-foreground"
      >
        Comentarios
      </button>
    </>
  );

  if (estado === "cerrado") {
    /*
      En el estudio la barra vive en la BANDEJA de la barra de estado
      (`cad-status-tray`, ver `CadStatusBar.tsx:392-400`): los botones son
      elementos más de la barra, como la barra de llamada
      (`TeamMessagingHost.tsx:50-56`). La posición anterior, `fixed left-3
      top-[11.5rem]`, caía dentro del muelle izquierdo (`w-60`, 240 px, abierto
      de fábrica) porque `fixed` se mide contra el viewport, no contra el lienzo.
    */
    if (tray)
      return (
        <>
          {createPortal(
            <span className="relative inline-flex items-center gap-1.5">
              {pillButtons}
            </span>,
            tray,
          )}
          <FeedbackDialog
            open={comentarios}
            onClose={() => setComentarios(false)}
            documentId={documentId}
          />
        </>
      );

    // Sin bandeja (el estudio sin editor, o antes de que monte): la posición
    // fija de siempre. `top-[11.5rem]` NO es lienzo: es la columna del muelle
    // izquierdo (`CadLeftDockPanel.tsx:122`, `w-60` anclado en x=0 bajo la
    // cinta). Sin editor no existe el muelle, así que la posición fija no tapa
    // nada. `z-[75]` porque el editor se monta en `fixed inset-0 z-[70]` y
    // crea su propio contexto de apilamiento.
    return (
      <>
        <div className="pointer-events-none fixed left-3 top-[11.5rem] z-[75] flex items-center gap-1.5 [&>*]:pointer-events-auto">
          {pillButtons}
        </div>
        <FeedbackDialog
          open={comentarios}
          onClose={() => setComentarios(false)}
          documentId={documentId}
        />
      </>
    );
  }

  if (localDemo) {
    return (
      <div
        data-testid="cad-incident-dialog"
        role="dialog"
        aria-label="Reportar un problema"
        className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4"
        onClick={() => setEstado("cerrado")}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="w-[34rem] max-w-full rounded-card border border-border bg-surface p-5 shadow-floating"
        >
          <h2 className="type-heading">Reportar un fallo</h2>
          <p data-testid="cad-incident-demo-auth" className="type-small mt-3 text-foreground">
            Este dibujo de demostración se guarda en tu navegador y no envía
            reportes. Para reportar desde el editor, inicia sesión o crea una cuenta.
          </p>
          {demoDraftHref && (
            <p className="type-small mt-3 text-muted-foreground">
              También puedes abrir un borrador de correo con versión, navegador y
              modo. Revísalo antes de enviarlo; no incluye tu plano.
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button size="sm" variant="ghost" onClick={() => setEstado("cerrado")}>
              Cerrar
            </Button>
            {demoDraftHref && (
              <a href={demoDraftHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
                Abrir borrador de correo
              </a>
            )}
            <Link href="/login?returnTo=%2Fdashboard" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Iniciar sesión
            </Link>
            <Link href="/register?returnTo=%2Fdashboard%3Fdemo%3D1" className={buttonClass({ variant: "primary", size: "sm" })}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="cad-incident-dialog"
      role="dialog"
      aria-label="Reportar un problema"
      className="fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4"
      onClick={() => estado !== "enviando" && setEstado("cerrado")}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-[34rem] max-w-full rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h2 className="type-heading">¿Qué salió mal?</h2>

        {estado === "enviado" ? (
          <>
            <p
              data-testid="cad-incident-sent"
              className="type-small mt-3 text-foreground"
            >
              Gracias: el reporte va en camino. No hace falta que hagas nada más
              — si necesitamos algo, te escribimos al correo de tu cuenta.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setEstado("cerrado")}
                className="rounded-lg bg-primary/15 px-3 py-1.5 type-small font-semibold text-primary-ink"
              >
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="type-small mt-2 text-muted-foreground">
              Cuéntalo con tus palabras. Lo importante es qué estabas haciendo y
              qué esperabas que pasara.
            </p>

            <textarea
              data-testid="cad-incident-text"
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              rows={4}
              placeholder="Acoté un muro y la cota salió del revés…"
              className="mt-3 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 type-small text-foreground outline-none focus:ring-1 focus:ring-indigo-500/40"
            />

            {/* Lo que se manda, a la vista. Nada en segundo plano. */}
            <div
              data-testid="cad-incident-payload"
              className="mt-3 rounded-lg border border-border bg-muted/30 p-3 type-micro text-muted-foreground"
            >
              <div className="mb-1.5 uppercase tracking-wide">Se enviará</div>
              <div>Versión del estudio: {appVersion}</div>
              <div className="truncate">Navegador: {userAgent}</div>
              <div>Modo de interfaz: {modo === "esencial" ? "Esencial" : "Pro"}</div>
              <div>Comando en curso: {activeCommand || "ninguno"}</div>
              <div>El servidor añade el correo de tu cuenta (o su identificador) y el identificador de tu organización, si existe.</div>
              <div>
                Tu plano:{" "}
                {autorizado && documentId
                  ? `su identificador (${documentId.slice(0, 8)}…), nunca el dibujo`
                  : "no se envía"}
              </div>
            </div>

            {documentId && (
              <label className="mt-3 flex items-start gap-2 type-small text-foreground">
                <input
                  type="checkbox"
                  data-testid="cad-incident-authorize"
                  checked={autorizado}
                  onChange={(event) => setAutorizado(event.target.checked)}
                  className="mt-0.5 accent-indigo-500"
                />
                <span>
                  Autorizo a revisar este plano para entender el problema. Viaja
                  su identificador, no el dibujo, y sólo si marcas esta casilla.
                </span>
              </label>
            )}

            {problema && (
              <p
                role="alert"
                data-testid="cad-incident-error"
                className="mt-3 type-small text-danger-ink"
              >
                {problema}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEstado("cerrado")}
                disabled={estado === "enviando"}
                className="rounded-lg px-3 py-1.5 type-small text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="cad-incident-send"
                onClick={() => void enviar()}
                disabled={estado === "enviando" || texto.trim().length < MINIMO}
                className="rounded-lg bg-primary/15 px-3 py-1.5 type-small font-semibold text-primary-ink disabled:opacity-40"
              >
                {estado === "enviando" ? "Enviando…" : "Enviar reporte"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
