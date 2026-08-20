/**
 * Presencia: la propiedad que se defiende aquí es que la lista de compañeros
 * NUNCA contenga a alguien que no está, ni un cursor en un sitio inventado.
 * Un cursor ajeno mal colocado no es un adorno estropeado: es información
 * falsa sobre dónde está trabajando otra persona.
 */
import assert from "node:assert/strict";
import {
  CAD_PRESENCE_TTL_MS,
  applyCadPresenceBeat,
  cadPeerColor,
  cadPresenceRoster,
  cadPresenceSharesView,
  pruneCadPresence,
  type CadPresenceBeat,
  type CadPresencePeer,
} from "./presence";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const DOC = "doc-1";
const beat = (patch: Partial<CadPresenceBeat> = {}): CadPresenceBeat => ({
  peerId: "peer-a",
  documentId: DOC,
  name: "Ana",
  at: 1_000,
  cursor: { x: 100, y: 200 },
  viewport: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
  guest: false,
  ...patch,
});

const empty = new Map<string, CadPresencePeer>();

// ── Aplicar un latido ───────────────────────────────────────────────────────
const first = applyCadPresenceBeat(empty, beat(), DOC, 5_000);
assert.equal(first.status, "applied");
const withAna = first.status === "applied" ? first.peers : empty;
ok(withAna.size === 1, "un latido añade un compañero");
ok(empty.size === 0, "el mapa de entrada no se muta");
ok(
  withAna.get("peer-a")?.receivedAt === 5_000,
  "la caducidad se cuenta con el reloj LOCAL de recepción",
);
ok(withAna.get("peer-a")?.color === cadPeerColor("peer-a"), "el color sale del id");

// ── Rechazos: cada uno con su motivo ────────────────────────────────────────
const rejections: [CadPresenceBeat, string][] = [
  [beat({ peerId: "" }), "presence_peer_missing"],
  [beat({ documentId: "otro-doc" }), "presence_document_mismatch"],
  [beat({ cursor: { x: Number.NaN, y: 0 } }), "presence_cursor_not_finite"],
  [
    beat({ viewport: { minX: 0, minY: 0, maxX: Number.POSITIVE_INFINITY, maxY: 1 } }),
    "presence_viewport_not_finite",
  ],
];
for (const [candidate, expected] of rejections) {
  const result = applyCadPresenceBeat(withAna, candidate, DOC, 6_000);
  assert.equal(result.status, "rejected", `debía rechazar ${expected}`);
  assert.equal(result.status === "rejected" ? result.reason : "", expected);
  checks += 2;
}

// El latido de OTRO documento es el rechazo que más importa: es la fuga de
// aislamiento del canal — un enlace de revisión da acceso a UN documento.
ok(
  applyCadPresenceBeat(withAna, beat({ documentId: "doc-2" }), DOC, 6_000).status ===
    "rejected",
  "un latido de otro documento jamás entra en esta lista",
);

// ── Reordenación del mismo emisor ───────────────────────────────────────────
const moved = applyCadPresenceBeat(withAna, beat({ at: 2_000, cursor: { x: 7, y: 8 } }), DOC, 6_000);
assert.equal(moved.status, "applied");
const afterMove = moved.status === "applied" ? moved.peers : empty;
ok(afterMove.get("peer-a")?.cursor?.x === 7, "un latido más nuevo mueve el cursor");
const stale = applyCadPresenceBeat(afterMove, beat({ at: 1_500 }), DOC, 7_000);
ok(
  stale.status === "rejected" && stale.reason === "presence_beat_stale",
  "un latido viejo del mismo emisor no retrocede el cursor",
);

// ── Caducidad ───────────────────────────────────────────────────────────────
ok(
  pruneCadPresence(afterMove, 6_000 + CAD_PRESENCE_TTL_MS) === afterMove,
  "sin caducados devuelve el MISMO mapa (no provoca un render por segundo)",
);
const pruned = pruneCadPresence(afterMove, 6_001 + CAD_PRESENCE_TTL_MS);
ok(pruned.size === 0, "quien deja de latir desaparece");
ok(pruned !== afterMove, "cuando sí caduca, el mapa es nuevo");

// Un reloj de emisor adelantado NO hace inmortal a nadie: la poda sólo mira
// `receivedAt`. Éste es el caso que rompía la lista antes de separarlos.
const skewed = applyCadPresenceBeat(
  empty,
  beat({ peerId: "peer-futuro", at: Date.now() + 600_000 }),
  DOC,
  1_000,
);
ok(
  skewed.status === "applied" &&
    pruneCadPresence(skewed.peers, 1_001 + CAD_PRESENCE_TTL_MS).size === 0,
  "un reloj adelantado no sobrevive a su propia caducidad",
);

// ── Orden de la lista ───────────────────────────────────────────────────────
let roster = empty as ReadonlyMap<string, CadPresencePeer>;
for (const candidate of [
  beat({ peerId: "p3", name: "Zoe", cursor: null }),
  beat({ peerId: "p1", name: "Beto", cursor: { x: 1, y: 1 } }),
  beat({ peerId: "p2", name: "Ana", cursor: { x: 2, y: 2 } }),
]) {
  const applied = applyCadPresenceBeat(roster, candidate, DOC, 9_000);
  assert.equal(applied.status, "applied");
  roster = applied.status === "applied" ? applied.peers : roster;
}
assert.deepEqual(
  cadPresenceRoster(roster).map((peer) => peer.name),
  ["Ana", "Beto", "Zoe"],
  "primero quien tiene el cursor sobre el plano, luego por nombre",
);
checks += 4;

// ── ¿Estamos mirando lo mismo? ──────────────────────────────────────────────
const mine = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
ok(cadPresenceSharesView(mine, { minX: 90, minY: 90, maxX: 200, maxY: 200 }), "se solapan");
ok(!cadPresenceSharesView(mine, { minX: 101, minY: 0, maxX: 200, maxY: 100 }), "no se solapan");
ok(!cadPresenceSharesView(mine, null), "sin encuadre conocido, no se afirma nada");

// Colores: estables y dentro de la paleta declarada.
ok(cadPeerColor("peer-a") === cadPeerColor("peer-a"), "el color de un id no cambia");
ok(
  new Set(["p1", "p2", "p3", "p4", "p5", "p6"].map(cadPeerColor)).size >= 3,
  "la paleta reparte: seis ids no caen todos en el mismo color",
);

console.log(`ok presence: ${checks} comprobaciones`);
