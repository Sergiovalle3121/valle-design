/**
 * La regla de la afirmación de ausencia, caso por caso, y su cableado: de
 * nada sirve una función correcta si el hook sigue calculando `connected`
 * por su cuenta o el panel afirma «nadie» cuando no puede.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cadPresenceCanAffirmNobody } from "./presence-affirmation";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ── La regla ────────────────────────────────────────────────────────────────
ok(
  !cadPresenceCanAffirmNobody({
    guest: true,
    channelAvailable: true,
    serverChannelAvailable: false,
  }),
  "invitado con sólo BroadcastChannel: ve sus pestañas, no al arquitecto → no puede afirmar que no hay nadie",
);
ok(
  cadPresenceCanAffirmNobody({
    guest: false,
    channelAvailable: true,
    serverChannelAvailable: true,
  }),
  "first-party con canal del servidor: alcanza otras máquinas → sí puede afirmar",
);
ok(
  !cadPresenceCanAffirmNobody({
    guest: false,
    channelAvailable: true,
    serverChannelAvailable: false,
  }),
  "first-party sin EventSource: sólo pestañas propias → no puede afirmar",
);
ok(
  !cadPresenceCanAffirmNobody({
    guest: true,
    channelAvailable: true,
    serverChannelAvailable: true,
  }),
  "invitado con todo disponible: el servidor no se le abre → no puede afirmar",
);
ok(
  !cadPresenceCanAffirmNobody({
    guest: false,
    channelAvailable: false,
    serverChannelAvailable: false,
  }),
  "first-party sin ningún transporte → no puede afirmar",
);
ok(
  cadPresenceCanAffirmNobody({
    guest: false,
    channelAvailable: false,
    serverChannelAvailable: true,
  }),
  "first-party con servidor y sin BroadcastChannel: el que cruza máquinas basta solo",
);

// ── El cableado ─────────────────────────────────────────────────────────────
const hook = readFileSync("src/components/cad/collab/use-cad-presence.ts", "utf8");
ok(
  hook.includes("cadPresenceCanAffirmNobody({"),
  "el hook delega `connected` en la regla en vez de recalcularla",
);
ok(
  !hook.includes("channelAvailable ||"),
  "y la regla vieja —«cualquiera de los dos transportes»— ya no vive en el hook",
);

const panel = readFileSync("src/components/cad/collab/CollabThreadPanel.tsx", "utf8");
ok(
  panel.includes("No se puede saber quién más está mirando desde aquí."),
  "sin transporte entre máquinas el panel dice que no puede saberlo",
);
ok(
  /presenceConnected && peers\.length === 0[\s\S]{0,200}Nadie más en este documento ahora mismo\./.test(
    panel,
  ),
  "«Nadie más» sólo se afirma con la lista vacía Y el transporte que alcanza otras máquinas",
);
ok(
  (panel.match(/Nadie más en este documento ahora mismo\./g) ?? []).length === 1,
  "la afirmación de ausencia aparece una sola vez, la que está guardada",
);
ok(
  !panel.includes("Presencia no disponible en este navegador."),
  "la frase que culpaba al navegador se fue: para el invitado no era cierta",
);

console.log(`ok collab presence-affirmation: ${checks} comprobaciones`);
