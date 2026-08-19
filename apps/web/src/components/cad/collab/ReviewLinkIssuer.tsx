"use client";

/**
 * Emisión y revocación del ENLACE DE REVISIÓN — la pieza que convierte una
 * cuenta de arquitecto en una conversación con su cliente.
 *
 * ## El token se enseña UNA vez, y va en el fragmento
 *
 * El servidor genera el token, guarda sólo su sha256 y lo devuelve en claro
 * exclusivamente en la respuesta de creación: no hay ninguna ruta para volver
 * a leerlo. Así que si esta pantalla no lo enseña ahora, se pierde — y por eso
 * el aviso es explícito en vez de decorativo.
 *
 * El enlace lo lleva DESPUÉS de la almohadilla (`/revision#cadReview=…`). Un
 * fragmento no viaja al servidor: no entra en los logs del web, no aparece en
 * la cabecera `Referer` cuando el cliente pincha un enlace externo desde esa
 * página, y no se queda en el historial de un proxy. Es la misma decisión que
 * ya tomó el canje del estudio, y repetirla aquí no es copiar: es que meter el
 * token en la ruta habría deshecho esa protección sin que nadie lo notara.
 *
 * ## Cerrar es revocar
 *
 * «Cerrar la revisión» estampa `revoked_at` en el servidor y el siguiente
 * canje del enlace muere, porque el token se revalida contra la fila en CADA
 * petición. No hay un estado intermedio en el que el enlace «se va apagando».
 */
import { useCallback, useEffect, useState } from "react";
import type { CadReviewSession } from "@valle/design-sdk";
import { reviewsRepository } from "@/lib/cad/repositories/reviews";

const BUTTON =
  "rounded-md border border-white/15 px-2 py-1 text-[11px] font-medium text-gray-200 transition-colors hover:border-cyan-300/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40";

export default function ReviewLinkIssuer({ documentId }: { documentId: string }) {
  const [sessions, setSessions] = useState<CadReviewSession[]>([]);
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Trae las sesiones SIN tocar estado: quien escribe es `apply`. Separarlo
   * deja que el efecto de abajo escriba después del `await` en vez de en su
   * cuerpo síncrono, que es lo que encadena renders.
   */
  const fetchSessions = useCallback(async (): Promise<
    { ok: true; items: CadReviewSession[] } | { ok: false; message: string }
  > => {
    try {
      const page = await reviewsRepository.list(documentId, "open");
      return { ok: true, items: page.items };
    } catch (cause) {
      return {
        ok: false,
        message: message(cause, "No pudimos leer las revisiones abiertas."),
      };
    }
  }, [documentId]);

  const apply = useCallback(
    (result: { ok: true; items: CadReviewSession[] } | { ok: false; message: string }) => {
      if (result.ok) setSessions(result.items);
      else setError(result.message);
    },
    [],
  );

  const load = useCallback(async () => {
    apply(await fetchSessions());
  }, [apply, fetchSessions]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const result = await fetchSessions();
      if (!cancelled) apply(result);
    };
    void pull();
    return () => {
      cancelled = true;
    };
  }, [apply, fetchSessions]);

  const create = useCallback(async () => {
    setBusy(true);
    setCopied(false);
    try {
      const created = await reviewsRepository.create(documentId, {
        shareLink: true,
        allowComments: true,
      });
      // Fallo cerrado: si el servidor no devolvió token, NO se enseña un
      // enlace a medias que no abriría nada. Se dice que no hay enlace.
      if (!created.shareToken) {
        setError(
          "La revisión se creó pero el servidor no emitió enlace. Ciérrala y vuelve a intentarlo.",
        );
      } else {
        setIssued(created.shareToken);
        setError(null);
      }
      await load();
    } catch (cause) {
      setError(message(cause, "No pudimos crear el enlace de revisión."));
    } finally {
      setBusy(false);
    }
  }, [documentId, load]);

  const close = useCallback(
    async (sessionId: string) => {
      setBusy(true);
      try {
        await reviewsRepository.close(sessionId);
        setIssued(null);
        setError(null);
        await load();
      } catch (cause) {
        setError(message(cause, "No pudimos cerrar la revisión."));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const url = issued ? reviewLinkUrl(issued) : null;

  return (
    <section
      data-testid="cad-review-link-panel"
      className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[11px] text-gray-300"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-gray-100">Enlace para el cliente</strong>
        <button
          type="button"
          data-testid="cad-review-link-new"
          disabled={busy}
          onClick={() => void create()}
          className={`${BUTTON} border-cyan-300/30 text-cyan-100`}
        >
          {busy ? "…" : "Crear enlace"}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-gray-500">
        Quien lo reciba ve el plano y comenta sobre él sin instalar nada ni
        crear cuenta. Solo lectura, solo este documento.
      </p>

      {url ? (
        <div
          data-testid="cad-review-link-issued"
          className="mt-2 rounded-lg border border-amber-300/25 bg-amber-400/[0.07] p-2"
        >
          <strong className="text-[10.5px] text-amber-100">
            Cópialo ahora: no se vuelve a mostrar
          </strong>
          <code
            data-testid="cad-review-link-url"
            className="mt-1 block break-all font-mono text-[9.5px] text-amber-50/90"
          >
            {url}
          </code>
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              data-testid="cad-review-link-copy"
              onClick={() => void copy(url).then(setCopied)}
              className={`${BUTTON} flex-1`}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              type="button"
              data-testid="cad-review-link-hide"
              onClick={() => setIssued(null)}
              className={`${BUTTON} flex-1`}
            >
              Ya lo copié
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="cad-review-link-error"
          className="mt-2 rounded-md border border-rose-300/25 bg-rose-400/10 px-2 py-1 text-[10.5px] text-rose-100"
        >
          {error}
        </p>
      ) : null}

      <ul className="mt-2 space-y-1">
        {sessions.length === 0 ? (
          <li className="text-[10px] text-gray-500">Sin revisiones abiertas.</li>
        ) : null}
        {sessions.map((session) => (
          <li
            key={session.id}
            data-testid={`cad-review-session-${session.id}`}
            className="flex items-center gap-1 rounded-md border border-white/10 p-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-[10px] text-gray-400">
              {session.hasShareLink ? "Enlace activo" : "Sin enlace"}
              {session.expiresAt ? ` · caduca ${session.expiresAt.slice(0, 10)}` : ""}
              {session.allowComments ? "" : " · sin comentarios"}
            </span>
            <button
              type="button"
              data-testid={`cad-review-session-close-${session.id}`}
              disabled={busy}
              onClick={() => void close(session.id)}
              className={`${BUTTON} shrink-0 text-rose-200`}
            >
              Revocar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** El enlace que se le manda al cliente. El token, siempre tras la almohadilla. */
export function reviewLinkUrl(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}/revision#cadReview=${encodeURIComponent(token)}`;
}

async function copy(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function message(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const detail = (cause as { message?: unknown }).message;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}
