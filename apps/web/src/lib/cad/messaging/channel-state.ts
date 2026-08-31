/**
 * Estado LOCAL de la lista de canales: lo que el host aplica en cuanto llega
 * un mensaje por `@Sse` o el usuario marca leído, SIN esperar el próximo
 * `GET /v1/messaging/channels` — la insignia de no leídos que no se mueve
 * hasta el siguiente refresco se siente rota en un chat.
 *
 * Aritmética pura e inmutable: cada función devuelve una lista NUEVA: React
 * la puede usar tal cual como estado (mismo patrón que
 * `../collab/presence.ts`).
 */
import type { TeamMessage, TeamMessageAuthor } from "./message-model";

export type TeamChannelKind = "project" | "direct";

export interface TeamChannelSummary {
  id: string;
  kind: TeamChannelKind;
  projectId: string | null;
  name: string | null;
  otherMember: TeamMessageAuthor | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

/**
 * Aplica un mensaje entrante (del propio `@Sse` o de un `POST` optimista):
 * sube `lastMessageAt` y, si NO es autoría de quien mira, suma uno a
 * `unreadCount`. Un canal que no está en la lista (mensaje de un canal
 * directo recién creado, todavía no listado) se ignora — el host debe volver
 * a listar canales en ese caso, no se inventa una fila aquí.
 */
export function applyIncomingMessage(
  channels: readonly TeamChannelSummary[],
  channelId: string,
  message: TeamMessage,
  viewerUserId: string,
): TeamChannelSummary[] {
  const isOwn = message.author.userId === viewerUserId;
  return channels.map((channel) =>
    channel.id === channelId
      ? {
          ...channel,
          lastMessageAt: message.createdAt,
          unreadCount: isOwn ? channel.unreadCount : channel.unreadCount + 1,
        }
      : channel,
  );
}

/** Baja `unreadCount` a 0 localmente, sin esperar la respuesta del `POST /read`. */
export function applyMarkRead(
  channels: readonly TeamChannelSummary[],
  channelId: string,
): TeamChannelSummary[] {
  return channels.map((channel) =>
    channel.id === channelId ? { ...channel, unreadCount: 0 } : channel,
  );
}

/** Más reciente primero: por `lastMessageAt`, o `createdAt` si el canal aún no tiene mensajes. */
export function sortChannelsByActivity(
  channels: readonly TeamChannelSummary[],
): TeamChannelSummary[] {
  return [...channels].sort((a, b) => activityTime(b) - activityTime(a));
}

function activityTime(channel: TeamChannelSummary): number {
  return Date.parse(channel.lastMessageAt ?? channel.createdAt);
}

/** Suma de no leídos de todos los canales — la insignia global de navegación. */
export function totalUnreadCount(
  channels: readonly TeamChannelSummary[],
): number {
  return channels.reduce((sum, channel) => sum + channel.unreadCount, 0);
}

/**
 * Título para pintar en la lista: el nombre en canales de proyecto, la otra
 * persona en canales directos. `"Conversación"` es el único caso sin datos
 * suficientes (autor aún no resuelto) — nunca una cadena vacía.
 */
export function channelDisplayTitle(channel: TeamChannelSummary): string {
  if (channel.kind === "project") return channel.name ?? "Canal";
  return (
    channel.otherMember?.displayName || channel.otherMember?.email || "Conversación"
  );
}
