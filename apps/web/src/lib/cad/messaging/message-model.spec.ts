import assert from "node:assert/strict";
import {
  buildMessageThreads,
  groupMessagesByDay,
  messageAnchorPins,
  type TeamMessage,
} from "./message-model";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

function message(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: overrides.id ?? "m-1",
    channelId: "c-1",
    author: { userId: "u-1", email: "arq@test.mx", displayName: "Arq. Ana" },
    body: "hola",
    parentMessageId: null,
    anchor: null,
    createdAt: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

// ── groupMessagesByDay ──────────────────────────────────────────────────────
{
  const now = new Date(2026, 7, 31, 10, 0, 0); // 31 ago 2026, local
  const messages = [
    message({ id: "old", createdAt: new Date(2026, 6, 1, 9).toISOString() }),
    message({ id: "yesterday", createdAt: new Date(2026, 7, 30, 9).toISOString() }),
    message({ id: "today-a", createdAt: new Date(2026, 7, 31, 8).toISOString() }),
    message({ id: "today-b", createdAt: new Date(2026, 7, 31, 9).toISOString() }),
  ];

  const groups = groupMessagesByDay(messages, { now });

  ok(groups.length === 3, "un mensaje de julio, uno de ayer y dos de hoy dan tres grupos");
  ok(groups[0].label.includes("julio"), "el grupo más viejo lleva el mes en la etiqueta");
  ok(groups[1].label === "Ayer", "el grupo intermedio se etiqueta Ayer");
  ok(groups[2].label === "Hoy", "el grupo más reciente se etiqueta Hoy");
  ok(
    groups[2].messages.map((m) => m.id).join(",") === "today-a,today-b",
    "el grupo de hoy conserva el orden de llegada",
  );
  ok(groupMessagesByDay([]).length === 0, "una lista vacía produce cero grupos");
}

// ── buildMessageThreads ─────────────────────────────────────────────────────
{
  const root = message({ id: "root", createdAt: "2026-08-31T10:00:00.000Z" });
  const replyLate = message({
    id: "reply-late",
    parentMessageId: "root",
    createdAt: "2026-08-31T10:05:00.000Z",
  });
  const replyEarly = message({
    id: "reply-early",
    parentMessageId: "root",
    createdAt: "2026-08-31T10:02:00.000Z",
  });
  const otherRoot = message({ id: "other-root", createdAt: "2026-08-31T11:00:00.000Z" });

  const threads = buildMessageThreads([root, replyLate, replyEarly, otherRoot]);

  ok(threads.length === 2, "dos raíces producen dos hilos");
  const rootThread = threads.find((t) => t.root.id === "root");
  ok(!!rootThread, "el hilo de la raíz con respuestas existe");
  ok(
    !!rootThread && rootThread.replies.map((r) => r.id).join(",") === "reply-early,reply-late",
    "las respuestas quedan ordenadas por fecha, no por llegada",
  );
  const otherThread = threads.find((t) => t.root.id === "other-root");
  ok(!!otherThread && otherThread.replies.length === 0, "una raíz sin respuestas tiene hilo vacío");

  const orphanReply = message({ id: "orphan", parentMessageId: "no-existe" });
  ok(
    buildMessageThreads([orphanReply]).length === 0,
    "una respuesta cuyo padre no está en la lista se omite, no inventa raíz",
  );
}

// ── messageAnchorPins ────────────────────────────────────────────────────────
{
  const anchoredMessage = message({
    id: "anchored",
    anchor: {
      kind: "point",
      version: 1,
      space: "model",
      x: 12.5,
      y: 4,
      entityId: "wall-1",
    },
  });
  const unanchored = message({ id: "plain", anchor: null });

  const pins = messageAnchorPins([unanchored, anchoredMessage]);
  ok(pins.length === 1, "sólo el mensaje anclado produce chincheta");
  ok(pins[0].id === "anchored" && pins[0].messageId === "anchored", "conserva el id del mensaje");
  ok(pins[0].world.x === 12.5 && pins[0].world.y === 4, "la posición viene del ancla leída");
  ok(pins[0].space === "model", "conserva el espacio del ancla");
  ok(pins[0].ordinal === 1, "el primer mensaje anclado es el ordinal 1");

  const unreadable = message({
    id: "future",
    anchor: { kind: "point", version: 99, space: "model", x: 1, y: 1 },
  });
  ok(
    messageAnchorPins([unreadable]).length === 0,
    "un ancla ilegible (formato futuro) no produce chincheta — fallo cerrado",
  );
}

console.log(`ok messaging message-model: ${checks} comprobaciones`);
