/**
 * El transporte con un doble del canal. Lo que se prueba es lo que el
 * navegador no protege: que por un `BroadcastChannel` compartido puede pasar
 * tráfico ajeno, y que un objeto a medias se convertiría en un compañero
 * fantasma plantado en el origen del dibujo.
 */
import assert from "node:assert/strict";
import {
  cadPresenceChannelName,
  openCadPresenceTransport,
  type CadPresenceChannelPort,
} from "./presence-channel";
import type { CadPresenceBeat } from "./presence";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

class FakeChannel implements CadPresenceChannelPort {
  readonly sent: unknown[] = [];
  closed = false;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {}
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  close(): void {
    this.closed = true;
  }
  deliver(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const beat = (patch: Partial<CadPresenceBeat> = {}): CadPresenceBeat => ({
  peerId: "peer-b",
  documentId: "doc-1",
  name: "Beto",
  at: 10,
  cursor: { x: 1, y: 2 },
  viewport: null,
  guest: false,
  ...patch,
});

let channel: FakeChannel | null = null;
const received: CadPresenceBeat[] = [];
const transport = openCadPresenceTransport({
  documentId: "doc-1",
  selfPeerId: "peer-a",
  onBeat: (incoming) => received.push(incoming),
  factory: (name) => (channel = new FakeChannel(name)),
});

ok(transport.connected, "con canal, el transporte se declara conectado");
ok(
  channel!.name === cadPresenceChannelName("doc-1"),
  "un documento, un canal: el nombre lleva el id",
);

// ── Emitir ──────────────────────────────────────────────────────────────────
transport.send(beat({ peerId: "peer-a" }));
ok(channel!.sent.length === 1, "el latido sale por el canal");
assert.deepEqual(
  (channel!.sent[0] as { channel: string; version: number }).channel,
  "valle.cad.presence",
  "el sobre va marcado",
);
checks += 1;

// ── Recibir lo válido ───────────────────────────────────────────────────────
channel!.deliver(channel!.sent[0]);
ok(received.length === 0, "el eco de uno mismo se descarta");
channel!.deliver({ channel: "valle.cad.presence", version: 1, beat: beat() });
ok(received.length === 1 && received[0].peerId === "peer-b", "un latido ajeno llega");

// ── Descartar lo que no lo es ───────────────────────────────────────────────
const basura: unknown[] = [
  null,
  "hola",
  42,
  {},
  { channel: "otra.cosa", version: 1, beat: beat() },
  { channel: "valle.cad.presence", version: 2, beat: beat() },
  { channel: "valle.cad.presence", version: 1 },
  { channel: "valle.cad.presence", version: 1, beat: { peerId: "" } },
  { channel: "valle.cad.presence", version: 1, beat: { ...beat(), peerId: 7 } },
  { channel: "valle.cad.presence", version: 1, beat: { ...beat(), documentId: undefined } },
  { channel: "valle.cad.presence", version: 1, beat: { ...beat(), name: null } },
  { channel: "valle.cad.presence", version: 1, beat: { ...beat(), at: "10" } },
  { channel: "valle.cad.presence", version: 1, beat: { ...beat(), guest: "sí" } },
];
const before = received.length;
for (const item of basura) channel!.deliver(item);
ok(
  received.length === before,
  `nada de ${basura.length} formas inválidas produce un compañero fantasma`,
);

// Un latido sin cursor ni encuadre SÍ es válido: es quien mira sin señalar.
channel!.deliver({
  channel: "valle.cad.presence",
  version: 1,
  beat: { peerId: "peer-c", documentId: "doc-1", name: "", at: 1, guest: true },
});
ok(
  received.length === before + 1 &&
    received.at(-1)!.cursor === null &&
    received.at(-1)!.viewport === null,
  "mirar sin señalar es presencia legítima",
);

transport.close();
ok(channel!.closed && channel!.onmessage === null, "cerrar suelta el canal y el escucha");

// ── Sin canal disponible ────────────────────────────────────────────────────
const dead = openCadPresenceTransport({
  documentId: "doc-1",
  selfPeerId: "peer-a",
  onBeat: () => assert.fail("no debería llegar nada"),
  factory: () => null,
});
ok(!dead.connected, "sin BroadcastChannel el transporte lo DICE en vez de fingir");
dead.send(beat());
dead.close();
ok(true, "emitir y cerrar sin canal no revienta el estudio");

console.log(`ok collab presence-channel: ${checks} comprobaciones`);
