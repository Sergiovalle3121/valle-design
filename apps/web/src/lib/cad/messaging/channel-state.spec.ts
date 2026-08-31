import assert from "node:assert/strict";
import {
  applyIncomingMessage,
  applyMarkRead,
  channelDisplayTitle,
  sortChannelsByActivity,
  totalUnreadCount,
  type TeamChannelSummary,
} from "./channel-state";
import type { TeamMessage } from "./message-model";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function channel(overrides: Partial<TeamChannelSummary> = {}): TeamChannelSummary {
  return {
    id: "c-1",
    kind: "project",
    projectId: "p-1",
    name: "General",
    otherMember: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function message(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: "m-1",
    channelId: "c-1",
    author: { userId: "u-2", email: "otro@test.mx", displayName: null },
    body: "hola",
    parentMessageId: null,
    anchor: null,
    createdAt: "2026-08-31T09:00:00.000Z",
    ...overrides,
  };
}

// ── applyIncomingMessage ─────────────────────────────────────────────────────
{
  const channels = [channel({ unreadCount: 2 })];
  const next = applyIncomingMessage(
    channels,
    "c-1",
    message({ author: { userId: "u-2", email: "x@test.mx", displayName: null } }),
    "u-1",
  );
  ok(next[0].unreadCount === 3, "suma no leídos cuando el mensaje NO es de quien mira");
  ok(next[0].lastMessageAt === "2026-08-31T09:00:00.000Z", "actualiza lastMessageAt");
  ok(channels[0].unreadCount === 2, "la lista original no cambia (inmutable)");

  const own = applyIncomingMessage(
    [channel({ unreadCount: 0 })],
    "c-1",
    message({ author: { userId: "u-1", email: "yo@test.mx", displayName: null } }),
    "u-1",
  );
  ok(own[0].unreadCount === 0, "NO suma no leídos cuando el mensaje es propio");

  const missing = applyIncomingMessage([channel({ id: "c-1" })], "c-otro", message(), "u-1");
  ok(missing[0].id === "c-1" && missing[0].unreadCount === 0, "un canal ausente de la lista se ignora sin lanzar");
}

// ── applyMarkRead ─────────────────────────────────────────────────────────────
{
  const channels = [
    channel({ id: "c-1", unreadCount: 5 }),
    channel({ id: "c-2", unreadCount: 3 }),
  ];
  const next = applyMarkRead(channels, "c-1");
  ok(next.find((c) => c.id === "c-1")!.unreadCount === 0, "baja el canal marcado a 0");
  ok(next.find((c) => c.id === "c-2")!.unreadCount === 3, "deja los demás intactos");
}

// ── sortChannelsByActivity ───────────────────────────────────────────────────
{
  const channels = [
    channel({ id: "old-activity", lastMessageAt: "2026-08-29T00:00:00.000Z" }),
    channel({ id: "no-messages", lastMessageAt: null, createdAt: "2026-08-31T00:00:00.000Z" }),
    channel({ id: "recent-activity", lastMessageAt: "2026-08-31T12:00:00.000Z" }),
  ];
  const order = sortChannelsByActivity(channels).map((c) => c.id).join(",");
  ok(
    order === "recent-activity,no-messages,old-activity",
    "ordena por lastMessageAt, y por createdAt si aún no hay mensajes",
  );
}

// ── totalUnreadCount ──────────────────────────────────────────────────────────
{
  const channels = [channel({ unreadCount: 2 }), channel({ id: "c-2", unreadCount: 5 })];
  ok(totalUnreadCount(channels) === 7, "suma el no leído de todos los canales");
}

// ── channelDisplayTitle ────────────────────────────────────────────────────────
{
  ok(
    channelDisplayTitle(channel({ kind: "project", name: "Obra" })) === "Obra",
    "canal de proyecto: su nombre",
  );

  const withName = channel({
    kind: "direct",
    name: null,
    otherMember: { userId: "u-2", email: "x@test.mx", displayName: "Ing. Luz" },
  });
  ok(channelDisplayTitle(withName) === "Ing. Luz", "canal directo: el displayName de la otra persona");

  const withoutName = channel({
    kind: "direct",
    name: null,
    otherMember: { userId: "u-2", email: "x@test.mx", displayName: null },
  });
  ok(channelDisplayTitle(withoutName) === "x@test.mx", "sin displayName, cae al email");
}

console.log(`ok messaging channel-state: ${checks} comprobaciones`);
