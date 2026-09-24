import assert from "node:assert/strict";
import { demoSupportDraftHref } from "./demo-support-draft";

assert.equal(demoSupportDraftHref(undefined, "1.0", "Firefox", "esencial"), null);

const href = demoSupportDraftHref(
  "soporte@vallecad.com",
  "2026.09.23",
  "Mozilla/5.0 (Windows)",
  "esencial",
);
assert.ok(href);
const draft = new URL(href);
assert.equal(draft.protocol, "mailto:");
assert.equal(draft.pathname, "soporte@vallecad.com");
const body = draft.searchParams.get("body") ?? "";
assert.match(body, /Versión: 2026\.09\.23/u);
assert.match(body, /Navegador: Mozilla\/5\.0 \(Windows\)/u);
assert.match(body, /Modo: esencial/u);
assert.doesNotMatch(body, /plano|documento|documentId|[0-9a-f]{8}-[0-9a-f-]{27}/iu);

console.log("demo-support-draft: contexto mínimo, sin plano ni identificador");
