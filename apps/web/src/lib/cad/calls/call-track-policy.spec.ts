/**
 * La propiedad que se defiende: sólo la PRIMERA vez que un carril (video o
 * audio) se usa dispara una transceiver nueva — todo cambio después de eso
 * es un replace/mute que la máquina de estados de WebRTC no renegocia.
 */
import assert from "node:assert/strict";
import {
  CLOSED_TRACK_SLOTS,
  desiredVideoSource,
  planAudioChange,
  planNeedsNegotiation,
  planVideoChange,
  slotsAfterPlan,
  type CallTrackSlots,
} from "./call-track-policy";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ── pantalla compartida gana sobre cámara ───────────────────────────────────
ok(
  desiredVideoSource({ cameraEnabled: true, micEnabled: false, screenShareEnabled: true }) ===
    "screen",
  "con los dos prendidos, pantalla compartida gana — 'enseña el plano, no la cara'",
);
ok(
  desiredVideoSource({ cameraEnabled: true, micEnabled: false, screenShareEnabled: false }) ===
    "camera",
  "sólo cámara prendida → camera",
);
ok(
  desiredVideoSource({ cameraEnabled: false, micEnabled: false, screenShareEnabled: false }) ===
    "none",
  "nada prendido → none",
);

// ── primer video: abre transceiver (renegocia) ──────────────────────────────
const firstVideo = planVideoChange("none", "camera", CLOSED_TRACK_SLOTS);
ok(firstVideo.action === "open-video-transceiver", "el primer video abre la transceiver");
ok(planNeedsNegotiation(firstVideo), "abrir la transceiver SÍ necesita renegociar");

const openVideoSlots = slotsAfterPlan(CLOSED_TRACK_SLOTS, firstVideo);
ok(openVideoSlots.videoTransceiverOpen, "el slot queda abierto tras ejecutar el plan");

// ── cambiar de cámara a pantalla con el carril YA abierto: sólo replace ────
const swapToScreen = planVideoChange("camera", "screen", openVideoSlots);
ok(
  swapToScreen.action === "replace-video-track" &&
    "source" in swapToScreen &&
    swapToScreen.source === "screen",
  "cambiar de fuente con el carril abierto es un replace, no una transceiver nueva",
);
ok(!planNeedsNegotiation(swapToScreen), "un replace NO renegocia");

// apagar el video con el carril abierto también es un replace(null), no un cierre
const toNone = planVideoChange("screen", "none", openVideoSlots);
ok(
  toNone.action === "replace-video-track" && "source" in toNone && toNone.source === "none",
  "apagar video con el carril abierto es replace a 'none', nunca se cierra la transceiver",
);

// mismo estado → noop
ok(planVideoChange("camera", "camera", openVideoSlots).action === "noop", "sin cambio, noop");

// pedir 'none' sin haber abierto NUNCA el carril: noop, no hay nada que abrir para apagar
ok(
  planVideoChange("none", "none", CLOSED_TRACK_SLOTS).action === "noop",
  "'none' desde 'none' sin carril abierto es noop",
);

// ── audio: misma lógica, primer prendido abre, luego sólo mutea ────────────
const firstAudio = planAudioChange(false, true, CLOSED_TRACK_SLOTS);
ok(firstAudio.action === "open-audio-transceiver", "el primer audio abre la transceiver");
ok(planNeedsNegotiation(firstAudio), "abrir audio SÍ renegocia");

const openAudioSlots: CallTrackSlots = slotsAfterPlan(CLOSED_TRACK_SLOTS, firstAudio);
const mute = planAudioChange(true, false, openAudioSlots);
ok(
  mute.action === "set-audio-enabled" && "enabled" in mute && mute.enabled === false,
  "silenciar con el carril ya abierto es un set-enabled, no cerrar nada",
);
ok(!planNeedsNegotiation(mute), "silenciar NO renegocia");

// pedir apagar audio sin haberlo prendido nunca: noop
ok(
  planAudioChange(false, false, CLOSED_TRACK_SLOTS).action === "noop",
  "audio apagado desde el inicio, sin carril, es noop",
);

console.log(`ok call-track-policy: ${checks} comprobaciones`);
