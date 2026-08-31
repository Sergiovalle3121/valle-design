/**
 * El transporte con un doble de `EventSource`: nada de red real. Lo que se
 * prueba es la costura — un evento mal formado se descarta antes de llegar
 * a `onEvent`, y sólo un `readyState` CERRADO cuenta como conexión perdida
 * (el reintento automático de `EventSource` no debe disparar `onError`).
 */
import assert from "node:assert/strict";
import {
  createCallSignalingClient,
  type CallEventSourcePort,
} from "./call-signaling-transport";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

class FakeEventSource implements CallEventSourcePort {
  readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();
  onerror: ((event: unknown) => void) | null = null;
  readyState = 1; // OPEN
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, handler: (event: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ data });
  }
}

let lastSource: FakeEventSource | null = null;
const client = createCallSignalingClient((url) => (lastSource = new FakeEventSource(url)));

const received: unknown[] = [];
const errors: unknown[] = [];
const close = client.connect("room-1", "participant-1", (event) => received.push(event), (err) =>
  errors.push(err),
);

// ── un roster bien formado llega ────────────────────────────────────────────
lastSource!.emit(
  "roster",
  JSON.stringify({
    participants: [
      { id: "p1", userId: "u1", name: "Ana", joinedAt: "2026-08-31T00:00:00.000Z" },
    ],
  }),
);
ok(received.length === 1, "un roster válido llega a onEvent");

// ── basura se descarta sin llegar a onEvent ─────────────────────────────────
lastSource!.emit("roster", "no es json");
lastSource!.emit("signal", JSON.stringify({ signal: { id: "s1" } }));
ok(received.length === 1, "eventos mal formados se descartan antes de onEvent");

// ── error transitorio (reconectando) NO dispara onError ────────────────────
lastSource!.readyState = 0; // CONNECTING — EventSource reintentando por su cuenta
lastSource!.onerror?.({});
ok(errors.length === 0, "un error mientras EventSource reintenta no cuenta como perdida");

// ── error con readyState CLOSED sí dispara onError ──────────────────────────
lastSource!.readyState = 2; // CLOSED
lastSource!.onerror?.({});
ok(errors.length === 1, "readyState CLOSED sí se reporta como señalización perdida");

// ── cerrar suelta el EventSource ────────────────────────────────────────────
close();
ok(lastSource!.closed, "cerrar el transporte cierra el EventSource subyacente");

console.log(`ok call-signaling-transport: ${checks} comprobaciones`);
