import assert from "node:assert/strict";
import { supportIncidentErrorMessage } from "./support-incident-error";

const internal = "postgres password and stack trace must stay private";
assert.equal(
  supportIncidentErrorMessage({ body: { code: "support_channel_unavailable", message: internal } }),
  "El canal de reportes no está disponible todavía. Tu texto sigue aquí; inténtalo más tarde.",
);
assert.equal(
  supportIncidentErrorMessage({ body: { code: "internal_error", message: internal } }),
  "No se pudo enviar el reporte. Tu texto sigue aquí; inténtalo más tarde.",
);
assert.ok(!supportIncidentErrorMessage({ body: { message: internal } }).includes(internal));
assert.equal(
  supportIncidentErrorMessage({ body: { code: "rate_limited", message: internal, retryAfterSeconds: 37 } }),
  "Has enviado demasiados reportes. Espera un minuto antes de volver a intentarlo; tu texto sigue aquí.",
);
console.log("support-incident-error: 4 casos seguros");
