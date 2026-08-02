/**
 * Review links SERVER-OWNED en el adaptador legacy→v1.
 *
 * Lo que se demuestra aquí es exactamente lo que se rompió antes: que el
 * NAVEGADOR no fabrica ni transporta la credencial. El token lo emite la API,
 * llega una sola vez en la respuesta de creación y se canjea por la CABECERA
 * `X-Review-Token` — nunca por la query string, que queda en el historial, en
 * el `Referer` hacia terceros y en los logs de cualquier proxy.
 */
import { strict as assert } from "node:assert";
import { handleLegacyCadRequest, isLegacyCadRequest } from "@/lib/cad-api";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const calls: Call[] = [];
const SHARE_TOKEN = "vdrl_TOKEN_EMITIDO_POR_EL_SERVIDOR";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";

function record(input: RequestInfo | URL, init?: RequestInit): Call {
  const headers = new Headers(init?.headers);
  const flat: Record<string, string> = {};
  headers.forEach((value, key) => {
    flat[key.toLowerCase()] = value;
  });
  const call: Call = {
    url: String(input),
    method: (init?.method ?? "GET").toUpperCase(),
    headers: flat,
    body: typeof init?.body === "string" ? init.body : null,
  };
  calls.push(call);
  return call;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const call = record(input, init);
  const path = new URL(call.url).pathname;
  if (path === "/v1/cad/documents" && call.method === "GET") {
    return jsonResponse({
      items: [
        {
          id: DOCUMENT_ID,
          projectId: null,
          name: "Plano",
          model: "AXOS-CAD-STUDIO",
          revision: "UNIVERSAL",
          cadDocumentVersion: 3,
        },
      ],
      total: 1,
    });
  }
  if (path === `/v1/cad/documents/${DOCUMENT_ID}/review-sessions`) {
    return jsonResponse(
      {
        session: {
          id: "session-1",
          documentId: DOCUMENT_ID,
          status: "open",
          hasShareLink: true,
          allowComments: true,
          expiresAt: "2026-08-09T00:00:00.000Z",
        },
        shareToken: SHARE_TOKEN,
      },
      201,
    );
  }
  if (path === "/v1/cad/review-sessions/session-1/close") {
    return jsonResponse({ id: "session-1", status: "closed" });
  }
  if (path === "/v1/cad/review/context") {
    return call.headers["x-review-token"] === SHARE_TOKEN
      ? jsonResponse({ readOnly: true, session: { id: "session-1" } })
      : jsonResponse({ code: "review_token_invalid" }, 401);
  }
  return jsonResponse({ message: `ruta no simulada: ${path}` }, 404);
}) as typeof fetch;

async function main(): Promise<void> {
  const BASE = "http://localhost:4000";
  const scope = "model=AXOS-CAD-STUDIO&revision=UNIVERSAL";

  // ── Las rutas nuevas SON del adaptador legacy ───────────────────────────────
  assert.equal(
    isLegacyCadRequest(`${BASE}/line-engineering/layout/review-sessions`),
    true,
    "the review session route is handled by the legacy adapter",
  );

  // ── CREAR: el servidor emite el token; el cliente no lo genera ──────────────
  const created = await handleLegacyCadRequest(
    `${BASE}/line-engineering/layout/review-sessions?${scope}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowComments: true }) },
  );
  assert.equal(created.status, 201, "creating a review link proxies the v1 status");
  const createdBody = (await created.json()) as { shareToken?: string; session?: { id?: string } };
  assert.equal(createdBody.shareToken, SHARE_TOKEN, "the plaintext token comes from the server response");
  assert.equal(createdBody.session?.id, "session-1", "the caller gets the server session id");
  const createCall = calls.find((call) => call.url.includes("/review-sessions") && call.method === "POST");
  assert.ok(createCall, "the adapter hits POST /v1/cad/documents/:id/review-sessions");
  assert.equal(
    JSON.parse(createCall!.body ?? "{}").shareLink,
    true,
    "the adapter asks the SERVER for the share link (it never mints one)",
  );
  assert.equal(
    createCall!.url.includes("token"),
    false,
    "no token is ever placed in the creation URL",
  );

  // ── CANJEAR: cabecera sí, query string jamás ───────────────────────────────
  const context = await handleLegacyCadRequest(`${BASE}/line-engineering/layout/review-context`, {
    headers: { "X-Review-Token": SHARE_TOKEN },
  });
  assert.equal(context.status, 200, "a live token redeems into the read-only context");
  assert.equal(((await context.json()) as { readOnly?: boolean }).readOnly, true, "the SERVER decides read-only");
  const redeemCall = calls.find((call) => call.url.includes("/v1/cad/review/context"));
  assert.ok(redeemCall, "the adapter hits GET /v1/cad/review/context");
  assert.equal(redeemCall!.headers["x-review-token"], SHARE_TOKEN, "the token travels in X-Review-Token");
  assert.equal(redeemCall!.url.includes(SHARE_TOKEN), false, "the token NEVER appears in the redemption URL");
  assert.equal(new URL(redeemCall!.url).search, "", "the redemption URL carries no query string at all");

  // Sin token no se llama a la red siquiera: 401 local.
  const beforeUnauthorized = calls.length;
  const unauthorized = await handleLegacyCadRequest(`${BASE}/line-engineering/layout/review-context`);
  assert.equal(unauthorized.status, 401, "no token is an immediate 401");
  assert.equal(calls.length, beforeUnauthorized, "a missing token never reaches the network");

  // Un token desconocido muere en el SERVIDOR (401 propagado tal cual).
  const rejected = await handleLegacyCadRequest(`${BASE}/line-engineering/layout/review-context`, {
    headers: { "X-Review-Token": "vdrl_token_que_el_navegador_se_inventa" },
  });
  assert.equal(rejected.status, 401, "a browser-minted token authorizes nothing");

  // ── REVOCAR: cerrar la sesión en el servidor ───────────────────────────────
  const closed = await handleLegacyCadRequest(
    `${BASE}/line-engineering/layout/review-sessions/session-1/close`,
    { method: "POST" },
  );
  assert.equal(closed.status, 200, "revocation proxies to /v1/cad/review-sessions/:id/close");
  assert.ok(
    calls.some((call) => call.url.endsWith("/v1/cad/review-sessions/session-1/close")),
    "revocation is server-side (closing the session kills the token immediately)",
  );

  // ── Ninguna URL emitida en todo el flujo contiene la credencial ────────────
  for (const call of calls) {
    assert.equal(call.url.includes(SHARE_TOKEN), false, `the token leaked into a URL: ${call.url}`);
    assert.equal(call.url.includes("cadReview"), false, `the legacy query param resurfaced: ${call.url}`);
  }

  console.log("cad review link (server-owned) specs passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
