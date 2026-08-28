"use client";

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
 * El cuadro enseña, campo por campo, exactamente lo que va a salir de este
 * navegador. Nada se recoge en segundo plano. La versión, el navegador y el
 * comando en curso viajan siempre porque sin ellos «no me funciona» no se
 * puede reproducir; el plano NO viaja nunca —ni su contenido ni su
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
import { designClient } from "@/lib/cad/repositories/client";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";

export interface CadIncidentReporterProps {
  /** Versión del estudio. Por defecto la del build, que es la que hace falta. */
  appVersion?: string;
  /** Documento abierto, si lo hay. Sólo viaja con autorización explícita. */
  documentId?: string | null;
  /** El comando en curso cuando el usuario decidió que algo iba mal. */
  activeCommand?: string | null;
  className?: string;
}

type Estado = "cerrado" | "abierto" | "enviando" | "enviado" | "error";

const MINIMO = 10;

export function CadIncidentReporter({
  appVersion = APP_VERSION,
  documentId,
  activeCommand,
  className,
}: CadIncidentReporterProps) {
  const [estado, setEstado] = useState<Estado>("cerrado");
  /** El centro de comentarios, que es el OTRO canal. Ver la nota de abajo. */
  const [comentarios, setComentarios] = useState(false);
  const [texto, setTexto] = useState("");
  const [autorizado, setAutorizado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const userAgent =
    typeof navigator === "undefined" ? "desconocido" : navigator.userAgent;

  const enviar = async () => {
    setEstado("enviando");
    setProblema(null);
    try {
      await designClient.support.report({
        summary: texto,
        appVersion,
        userAgent,
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
      setProblema(
        error && typeof error === "object" && "body" in error
          ? ((error as { body?: { message?: string } }).body?.message ??
              "No se pudo enviar el reporte.")
          : "No se pudo enviar el reporte.",
      );
    }
  };

  if (estado === "cerrado")
    return (
      /*
        LOS DOS CANALES, JUNTOS. Este botón reporta un INCIDENTE —algo se rompió
        y alguien tiene que mirarlo hoy— y manda un correo. El de al lado abre el
        centro de comentarios, que GUARDA con estado y sirve para lo otro: la
        sugerencia, la duda, la falla pequeña que no justifica un incidente.

        Van pegados a propósito. Son dos cosas distintas y el usuario no tiene
        por qué saber cuál es cuál antes de decidir escribir: encuentra el sitio
        donde se habla con nosotros, y elige ahí.

        Y van AQUÍ, en el mismo montaje, porque `Layout3DEditor.tsx` sólo puede
        encoger: cada línea que no se le añade cuenta, y este componente ya
        estaba montado con una sola.
      */
      <div className="fixed bottom-14 left-3 z-[70] flex items-center gap-1.5">
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
          Algo salió mal
        </button>
        <button
          type="button"
          data-testid="cad-feedback-open"
          onClick={() => setComentarios(true)}
          title="Una idea, una duda o algo que podríamos hacer mejor"
          className="rounded-lg border border-border bg-surface/80 px-2.5 py-1 type-micro text-muted-foreground shadow hover:text-foreground"
        >
          Comentarios
        </button>
        <FeedbackDialog
          open={comentarios}
          onClose={() => setComentarios(false)}
          documentId={documentId}
        />
      </div>
    );

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
              <div>Comando en curso: {activeCommand || "ninguno"}</div>
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
