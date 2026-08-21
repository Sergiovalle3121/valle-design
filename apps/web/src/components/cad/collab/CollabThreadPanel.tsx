"use client";

/**
 * El panel de hilos: la MISMA pieza en el estudio del arquitecto y en la
 * página del cliente.
 *
 * Que sea la misma no es economía de código, es una promesa de producto: el
 * cliente escribe «esta ventana no cabe» sobre la ventana, y el arquitecto ve
 * ESE comentario en ESE punto, numerado igual, con el mismo estado. Dos
 * paneles distintos habrían acabado con dos ordenaciones y dos maneras de
 * marcar resuelto, y entonces «el comentario 3» dejaría de querer decir lo
 * mismo a los dos lados del enlace.
 *
 * Es puramente presentacional: no lee la API ni conoce la cámara. Quien le da
 * datos es `use-cad-comments.ts`, y quien coloca el ancla es la superficie de
 * cada lado (el overlay del estudio o el SVG de la revisión).
 */
import type { CadCommentThread } from "./use-cad-comments";
import type { CadCommentAnchorPoint } from "@/lib/cad/collab/comment-anchor";
import type { CadPresencePeer } from "@/lib/cad/collab/presence";

export interface CollabThreadPanelProps {
  threads: CadCommentThread[];
  error: string | null;
  busy: boolean;
  activeId: string | null;
  onSelect: (commentId: string | null) => void;
  /** null ⇒ esta superficie no puede resolver (p. ej. sesión sin permiso). */
  onResolve: ((commentId: string) => void) | null;
  /** null ⇒ esta superficie no admite comentarios (sesión con ellos apagados). */
  onSubmit: ((body: string) => void) | null;
  draft: string;
  onDraftChange: (value: string) => void;
  /** Arranca el modo «elige el punto». null ⇒ no se puede anclar aquí. */
  onStartPlacing: (() => void) | null;
  placing: boolean;
  onCancelPlacing: () => void;
  /** Ancla ya elegida para el comentario que se está escribiendo. */
  pendingAnchor: CadCommentAnchorPoint | null;
  onClearAnchor: () => void;
  peers: CadPresencePeer[];
  presenceConnected: boolean;
  /** Aviso de por qué no se puede comentar, cuando `onSubmit` es null. */
  disabledReason?: string;
}

const CARD =
  "rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left transition-colors hover:border-indigo-300/30";
const BUTTON =
  "rounded-md border border-white/15 px-2 py-1 text-[11px] font-medium text-gray-200 transition-colors hover:border-indigo-300/40 hover:text-indigo-100 disabled:cursor-not-allowed disabled:opacity-40";

export default function CollabThreadPanel({
  threads,
  error,
  busy,
  activeId,
  onSelect,
  onResolve,
  onSubmit,
  draft,
  onDraftChange,
  onStartPlacing,
  placing,
  onCancelPlacing,
  pendingAnchor,
  onClearAnchor,
  peers,
  presenceConnected,
  disabledReason,
}: CollabThreadPanelProps) {
  const open = threads.filter((thread) => !thread.resolved).length;
  return (
    <section
      data-testid="cad-collab-panel"
      className="flex h-full min-h-0 flex-col gap-2 text-[11.5px] text-gray-300"
    >
      <header className="flex items-center justify-between gap-2">
        <strong className="text-gray-100">Comentarios sobre el plano</strong>
        <span
          data-testid="cad-collab-count"
          className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-100"
        >
          {open} sin resolver · {threads.length} en total
        </span>
      </header>

      {/* Presencia. Se enseña el estado del canal en vez de un número a secas:
          sin transporte no se puede afirmar que no haya nadie más mirando. */}
      <div
        data-testid="cad-collab-presence"
        data-connected={presenceConnected ? "true" : "false"}
        className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1.5"
      >
        {!presenceConnected ? (
          <span className="text-[10px] text-gray-500">
            Presencia no disponible en este navegador.
          </span>
        ) : peers.length === 0 ? (
          <span className="text-[10px] text-gray-500">
            Nadie más en este documento ahora mismo.
          </span>
        ) : (
          peers.map((peer) => (
            <span
              key={peer.peerId}
              data-testid={`cad-collab-peer-${peer.peerId}`}
              className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px]"
              title={
                peer.cursor
                  ? `Cursor en ${Math.round(peer.cursor.x)}, ${Math.round(peer.cursor.y)}`
                  : "Mirando el plano"
              }
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: peer.color }}
              />
              {peer.name.trim() || "Invitado"}
              {peer.guest ? " · revisión" : ""}
            </span>
          ))
        )}
      </div>

      {/* Redactor */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
        {onSubmit ? (
          <>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="cad-collab-place"
                disabled={!onStartPlacing || busy}
                onClick={() => (placing ? onCancelPlacing() : onStartPlacing?.())}
                className={`${BUTTON} ${placing ? "border-amber-300/50 text-amber-100" : ""}`}
              >
                {placing ? "Cancelar (Esc)" : "Anclar en el plano"}
              </button>
              {pendingAnchor ? (
                <span
                  data-testid="cad-collab-pending-anchor"
                  className="flex items-center gap-1 rounded-md border border-indigo-300/30 bg-indigo-400/10 px-2 py-1 text-[10px] text-indigo-100"
                >
                  {Math.round(pendingAnchor.x)}, {Math.round(pendingAnchor.y)}
                  <button
                    type="button"
                    data-testid="cad-collab-clear-anchor"
                    onClick={onClearAnchor}
                    className="text-indigo-200/70 hover:text-indigo-100"
                    aria-label="Quitar el ancla"
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="text-[10px] text-gray-500">Sin ancla</span>
              )}
            </div>
            <textarea
              data-testid="cad-collab-draft"
              value={draft}
              rows={2}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={
                pendingAnchor
                  ? "Qué pasa en ese punto del plano"
                  : "Comentario sobre el documento"
              }
              className="mt-2 w-full rounded-md border border-white/15 bg-gray-950/60 px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-indigo-300/50"
            />
            <button
              type="button"
              data-testid="cad-collab-submit"
              disabled={busy || !draft.trim()}
              onClick={() => onSubmit(draft)}
              className={`${BUTTON} mt-1 w-full border-indigo-300/30 text-indigo-100`}
            >
              {busy ? "Enviando…" : "Comentar"}
            </button>
          </>
        ) : (
          <p data-testid="cad-collab-disabled" className="text-[10.5px] text-amber-200/80">
            {disabledReason ?? "Esta revisión no admite comentarios."}
          </p>
        )}
      </div>

      {error ? (
        <p
          data-testid="cad-collab-error"
          role="alert"
          className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-2 py-1 text-[10.5px] text-rose-100"
        >
          {error}
        </p>
      ) : null}

      {/* Hilos */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {threads.length === 0 ? (
          <p data-testid="cad-collab-empty" className="p-2 text-[10.5px] text-gray-500">
            Todavía no hay comentarios. Ancla el primero sobre el punto del plano
            del que quieras hablar.
          </p>
        ) : null}
        {threads.map((thread) => (
          <article
            key={thread.id}
            data-testid={`cad-collab-thread-${thread.id}`}
            data-resolved={thread.resolved ? "true" : "false"}
            className={`${CARD} ${activeId === thread.id ? "border-indigo-300/50" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect(activeId === thread.id ? null : thread.id)}
              className="flex w-full items-start gap-2 text-left"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  thread.resolved
                    ? "bg-emerald-500/85 text-gray-950"
                    : "bg-amber-400 text-gray-950"
                }`}
              >
                {thread.ordinal}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] text-gray-500">
                  {thread.author}
                </span>
                <span className="block whitespace-pre-wrap break-words text-gray-200">
                  {thread.body}
                </span>
                <AnchorNote thread={thread} />
              </span>
            </button>
            {onResolve && !thread.resolved ? (
              <button
                type="button"
                data-testid={`cad-collab-resolve-${thread.id}`}
                disabled={busy}
                onClick={() => onResolve(thread.id)}
                className={`${BUTTON} mt-1 w-full`}
              >
                Marcar resuelto
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Qué se dice del ancla, incluidos los casos feos.
 *
 * Un ancla ilegible NO se pinta en el plano (lo impide `comment-anchor.ts`) y
 * aquí se DICE por qué. La alternativa —callarlo— deja un comentario que el
 * autor no encuentra en el dibujo y no puede saber que jamás lo encontrará.
 */
function AnchorNote({ thread }: { thread: CadCommentThread }) {
  if (thread.anchor.status === "anchored") {
    return (
      <span className="mt-0.5 block text-[9.5px] text-indigo-200/70">
        Anclado en {Math.round(thread.anchor.anchor.x)},{" "}
        {Math.round(thread.anchor.anchor.y)}
        {thread.anchor.anchor.entityId ? ` · ${thread.anchor.anchor.entityId}` : ""}
      </span>
    );
  }
  if (thread.anchor.status === "unreadable") {
    return (
      <span
        data-testid={`cad-collab-anchor-unreadable-${thread.id}`}
        className="mt-0.5 block text-[9.5px] text-rose-200/80"
      >
        Sin posición en el plano: {thread.anchor.message}
      </span>
    );
  }
  return (
    <span className="mt-0.5 block text-[9.5px] text-gray-500">
      Comentario del documento (sin punto)
    </span>
  );
}
