"use client";

/**
 * El panel de mensajería de equipo: lista de canales + hilo del canal
 * abierto + redactor. Puramente presentacional — igual que
 * `CollabThreadPanel.tsx`, no lee la API ni conoce la cámara; quien le da
 * datos es `use-team-messaging.ts` vía el host (`TeamMessagingHost.tsx`).
 *
 * Mismo lenguaje visual que el panel de comentarios (tokens, sin primitivas
 * de `@/components/ui`): son dos muelles flotantes de la MISMA familia de
 * colaboración sobre el estudio, y uno con chrome distinto al lado del otro
 * se leería como dos productos.
 */
import type { MessagingMessage } from "@valle/design-sdk";
import type { TeamChannelSummary } from "@/lib/cad/messaging/channel-state";
import { channelDisplayTitle } from "@/lib/cad/messaging/channel-state";
import { groupMessagesByDay, type TeamMessage } from "@/lib/cad/messaging/message-model";

/**
 * El SDK generado tipa `anchor` como `Record<string, never>` (mismo límite
 * de openapi-typescript que `CadComment.anchor`, ver
 * `lib/cad/repositories/reviews.ts`) mientras que la aritmética pura
 * (`message-model.ts`) lo tipa `Record<string, unknown>` — es el mismo JSON
 * en ambos casos; sólo cambia qué tan preciso lo describe cada capa. El cast
 * vive en ESTA frontera, una sola vez, en vez de perseguir el tipo por cada
 * consumidor.
 */
function asTeamMessages(messages: readonly MessagingMessage[]): TeamMessage[] {
  return messages as unknown as TeamMessage[];
}

export interface TeamMessagingPanelProps {
  channels: TeamChannelSummary[];
  channelsLoading: boolean;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  messages: MessagingMessage[];
  messagesLoading: boolean;
  hasMoreOlder: boolean;
  onLoadOlder: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  /** null ⇒ sin permiso de escritura (rol viewer). */
  onSend: (() => void) | null;
  busy: boolean;
  error: string | null;
  connected: boolean;
  viewerUserId: string | null;
}

const CARD =
  "rounded-control border border-border bg-muted/40 p-2 text-left transition-colors hover:border-primary/30";
const BUTTON =
  "rounded-control border border-border px-2 py-1 type-micro font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary-ink disabled:cursor-not-allowed disabled:opacity-40";

export default function TeamMessagingPanel({
  channels,
  channelsLoading,
  selectedChannelId,
  onSelectChannel,
  messages,
  messagesLoading,
  hasMoreOlder,
  onLoadOlder,
  draft,
  onDraftChange,
  onSend,
  busy,
  error,
  connected,
  viewerUserId,
}: TeamMessagingPanelProps) {
  const totalUnread = channels.reduce((sum, c) => sum + c.unreadCount, 0);
  const dayGroups = groupMessagesByDay(asTeamMessages(messages));

  return (
    <section
      data-testid="team-messaging-panel"
      className="flex h-full min-h-0 flex-col gap-2 type-micro text-foreground"
    >
      <header className="flex items-center justify-between gap-2">
        <strong className="text-foreground">Mensajería de equipo</strong>
        <span
          data-testid="team-messaging-connection"
          data-connected={connected ? "true" : "false"}
          className="type-micro text-muted-foreground"
        >
          {connected ? "En vivo" : "Reconectando…"}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[9rem_1fr] gap-2">
        {/* Canales */}
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-0.5">
          {channelsLoading && channels.length === 0 ? (
            <p className="p-1 type-micro text-muted-foreground">Cargando…</p>
          ) : null}
          {!channelsLoading && channels.length === 0 ? (
            <p
              data-testid="team-messaging-channels-empty"
              className="p-1 type-micro text-muted-foreground"
            >
              Sin canales todavía.
            </p>
          ) : null}
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              data-testid={`team-messaging-channel-${channel.id}`}
              onClick={() => onSelectChannel(channel.id)}
              className={`${CARD} flex w-full items-center justify-between gap-1 ${
                selectedChannelId === channel.id ? "border-primary/30" : ""
              }`}
            >
              <span className="min-w-0 truncate">
                {channelDisplayTitle(channel)}
              </span>
              {channel.unreadCount > 0 ? (
                <span
                  data-testid={`team-messaging-unread-${channel.id}`}
                  className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 type-micro font-semibold text-primary-ink"
                >
                  {channel.unreadCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Hilo */}
        <div className="flex min-h-0 flex-col gap-2">
          {!selectedChannelId ? (
            <p
              data-testid="team-messaging-no-selection"
              className="p-2 type-micro text-muted-foreground"
            >
              Elige un canal para ver sus mensajes.
              {totalUnread > 0
                ? ` Tienes ${totalUnread} mensaje(s) sin leer.`
                : ""}
            </p>
          ) : (
            <>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                {hasMoreOlder ? (
                  <button
                    type="button"
                    data-testid="team-messaging-load-older"
                    onClick={onLoadOlder}
                    disabled={messagesLoading}
                    className={`${BUTTON} w-full`}
                  >
                    {messagesLoading ? "Cargando…" : "Cargar mensajes anteriores"}
                  </button>
                ) : null}
                {dayGroups.length === 0 && !messagesLoading ? (
                  <p
                    data-testid="team-messaging-messages-empty"
                    className="p-2 type-micro text-muted-foreground"
                  >
                    Todavía no hay mensajes en este canal. Escribe el primero.
                  </p>
                ) : null}
                {dayGroups.map((group) => (
                  <div key={group.dayKey} className="space-y-1">
                    <p className="type-micro text-muted-foreground">
                      {group.label}
                    </p>
                    {group.messages.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        own={message.author.userId === viewerUserId}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div className="rounded-control border border-border bg-muted/40 p-2">
                {onSend ? (
                  <>
                    <textarea
                      data-testid="team-messaging-draft"
                      value={draft}
                      rows={2}
                      onChange={(event) => onDraftChange(event.target.value)}
                      placeholder="Escribe un mensaje al equipo"
                      className="w-full rounded-control border border-border bg-surface/80 px-2 py-1 type-micro text-foreground outline-none focus:border-primary/30"
                    />
                    <button
                      type="button"
                      data-testid="team-messaging-send"
                      disabled={busy || !draft.trim()}
                      onClick={onSend}
                      className={`${BUTTON} mt-1 w-full border-primary/30 text-primary-ink`}
                    >
                      {busy ? "Enviando…" : "Enviar"}
                    </button>
                  </>
                ) : (
                  <p
                    data-testid="team-messaging-disabled"
                    className="type-micro text-warning-ink/80"
                  >
                    Tu rol no incluye el permiso de edición (cad:edit): puedes
                    leer este canal pero no escribir en él.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p
          data-testid="team-messaging-error"
          role="alert"
          className="rounded-control border border-danger/30 bg-danger/15 px-2 py-1 type-micro text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MessageRow({
  message,
  own,
}: {
  message: TeamMessage;
  own: boolean;
}) {
  const author = message.author.displayName || message.author.email;
  return (
    <article
      data-testid={`team-messaging-message-${message.id}`}
      className={`${CARD} ${own ? "border-primary/20 bg-primary/5" : ""}`}
    >
      <span className="block truncate type-micro text-muted-foreground">
        {own ? "Tú" : author}
      </span>
      <span className="block whitespace-pre-wrap break-words text-foreground">
        {message.body}
      </span>
      {message.parentMessageId ? (
        <span className="mt-0.5 block type-micro text-muted-foreground">
          En respuesta a otro mensaje
        </span>
      ) : null}
      {message.anchor ? (
        <span className="mt-0.5 block type-micro text-primary-ink">
          Anclado al dibujo
        </span>
      ) : null}
    </article>
  );
}
