import { strict as assert } from "node:assert";
import {
  authFailureMessage,
  cleanIdentityUrl,
  identityActionPayload,
  loginPayload,
  registerPayload,
  validateDisplayName,
  identityFailureMessage,
  identitySuccessMessage,
  initialIdentityToken,
  performIdentityAction,
  type IdentityAction,
  type IdentityActionClient,
  type IdentityActionValues,
} from "./identity-actions";

async function main() {
  const token = "t".repeat(32);
  const password = "correct horse battery staple";

  assert.deepEqual(
    identityActionPayload("forgot", { email: " USER@Example.COM " }),
    { ok: true, body: { email: "user@example.com" } },
  );
  assert.equal(
    identityActionPayload("forgot", { email: "not-an-email" }).ok,
    false,
  );
  assert.equal(identityActionPayload("verify", { token: "short" }).ok, false);
  assert.equal(
    identityActionPayload("reset", { token, password: "too short" }).ok,
    false,
  );
  assert.deepEqual(
    identityActionPayload("reset", { token: ` ${token} `, password }),
    { ok: true, body: { token, password } },
  );

  const cases: ReadonlyArray<{
    action: IdentityAction;
    values: IdentityActionValues;
    expectedCall: readonly [string, unknown];
  }> = [
    {
      action: "verify",
      values: { token },
      expectedCall: ["verifyEmail", token],
    },
    {
      action: "resend",
      values: { email: "user@example.com" },
      expectedCall: ["resendVerification", "user@example.com"],
    },
    {
      action: "forgot",
      values: { email: "user@example.com" },
      expectedCall: ["requestPasswordReset", "user@example.com"],
    },
    {
      action: "reset",
      values: { token, password },
      expectedCall: ["resetPassword", { token, password }],
    },
  ];

  for (const testCase of cases) {
    const calls: Array<readonly [string, unknown]> = [];
    const client: IdentityActionClient = {
      verifyEmail: async (value) => void calls.push(["verifyEmail", value]),
      resendVerification: async (value) =>
        void calls.push(["resendVerification", value]),
      requestPasswordReset: async (value) =>
        void calls.push(["requestPasswordReset", value]),
      resetPassword: async (value) => void calls.push(["resetPassword", value]),
    };
    const result = await performIdentityAction(
      testCase.action,
      testCase.values,
      client,
    );
    assert.deepEqual(result, { kind: "success" });
    assert.deepEqual(calls, [testCase.expectedCall]);
  }

  const clientThrowing = (error: unknown): IdentityActionClient => ({
    verifyEmail: async () => Promise.reject(error),
    resendVerification: async () => Promise.reject(error),
    requestPasswordReset: async () => Promise.reject(error),
    resetPassword: async () => Promise.reject(error),
  });
  assert.deepEqual(
    await performIdentityAction(
      "verify",
      { token },
      clientThrowing({ status: 429 }),
    ),
    { kind: "rate-limited" },
  );
  assert.deepEqual(
    await performIdentityAction(
      "verify",
      { token },
      clientThrowing(new Error("invalid token")),
    ),
    { kind: "request-error" },
  );
  assert.deepEqual(
    await performIdentityAction(
      "verify",
      { token },
      clientThrowing(new TypeError("network unavailable")),
    ),
    { kind: "network-error" },
  );

  for (const action of ["forgot", "resend"] as const) {
    const success = identitySuccessMessage(action);
    const failure = identityFailureMessage(action, { kind: "request-error" });
    assert.match(success, /^Si existe/u);
    assert.doesNotMatch(success, /encontramos|no existe|registrad[ao]/iu);
    assert.doesNotMatch(failure, /encontramos|no existe|registrad[ao]/iu);
  }

  assert.equal(
    cleanIdentityUrl(
      `https://design.example/reset-password?token=${token}&next=%2Flogin&password=secret#form`,
    ),
    "/reset-password?next=%2Flogin#form",
  );
  assert.equal(initialIdentityToken([token, "ignored"]), token);
  assert.equal(initialIdentityToken("x".repeat(257)), "");

  /* ── El alta y el inicio de sesión: validación en español antes del fetch ── */
  assert.deepEqual(
    registerPayload({
      displayName: "  Arquitecta fundadora ",
      email: " Arquitecta@Despacho.MX ",
      password,
      termsVersion: "2026-09-16",
      acceptedTerms: true,
    }),
    {
      ok: true,
      body: {
        email: "arquitecta@despacho.mx",
        password,
        displayName: "Arquitecta fundadora",
        termsVersion: "2026-09-16",
        acceptedTerms: true,
      },
    },
  );
  assert.deepEqual(validateDisplayName("   "), {
    ok: false,
    message: "Escribe tu nombre.",
  });
  const nombreLargo = registerPayload({
    displayName: "n".repeat(121),
    email: "a@b.mx",
    password,
    termsVersion: "2026-09-16",
    acceptedTerms: true,
  });
  assert.equal(nombreLargo.ok, false);
  assert.match(!nombreLargo.ok ? nombreLargo.message : "", /120 caracteres/u);
  const correoConEspacios = registerPayload({
    displayName: "Alguien",
    email: "arqui tecta@despacho.mx",
    password,
    termsVersion: "2026-09-16",
    acceptedTerms: true,
  });
  assert.deepEqual(correoConEspacios, {
    ok: false,
    message: "Escribe un correo electrónico válido.",
  });
  assert.deepEqual(
    registerPayload({
      displayName: "Alguien",
      email: "a@b.mx",
      password,
      termsVersion: "2026-09-16",
      acceptedTerms: false,
    }),
    {
      ok: false,
      message: "Acepta los Términos de Servicio para crear la cuenta.",
    },
  );
  assert.deepEqual(
    registerPayload({
      displayName: "Alguien",
      email: "a@b.mx",
      password,
      acceptedTerms: true,
    }),
    {
      ok: false,
      message:
        "No pudimos consultar la versión vigente de los términos. Recarga la página.",
    },
  );
  const contrasenaCorta = loginPayload({ email: "a@b.mx", password: "corta" });
  assert.equal(contrasenaCorta.ok, false);
  assert.match(
    !contrasenaCorta.ok ? contrasenaCorta.message : "",
    /entre 12 y 128 caracteres/u,
  );
  assert.deepEqual(loginPayload({ email: "A@B.mx", password }), {
    ok: true,
    body: { email: "a@b.mx", password },
  });

  /* ── Mensajes de fallo: siempre nuestros, nunca el `message` del servidor ── */
  const failedToFetch = authFailureMessage(
    new TypeError("Failed to fetch"),
    "register",
  );
  assert.match(failedToFetch, /No se pudo conectar/u);
  assert.doesNotMatch(failedToFetch, /Failed to fetch/u);

  const validacionEnIngles = {
    status: 400,
    body: {
      statusCode: 400,
      message: [
        "password must be longer than or equal to 12 characters",
        "password must be a string",
      ],
      error: "Bad Request",
    },
  };
  const contrasenaRechazada = authFailureMessage(
    validacionEnIngles,
    "register",
  );
  assert.match(contrasenaRechazada, /contraseña debe tener entre 12 y 128/u);
  assert.doesNotMatch(contrasenaRechazada, /must be/u);
  assert.match(
    authFailureMessage(
      { status: 400, body: { message: ["email must be an email"] } },
      "register",
    ),
    /correo electrónico válido/u,
  );
  assert.equal(
    authFailureMessage(
      {
        status: 400,
        body: { code: "legal_document_outdated", message: "internal text" },
      },
      "register",
    ),
    "Los términos cambiaron mientras creabas tu cuenta. Recarga la página y vuelve a confirmarlos.",
  );
  assert.match(
    authFailureMessage(
      {
        status: 400,
        body: {
          message: [
            "displayName must be shorter than or equal to 160 characters",
          ],
        },
      },
      "register",
    ),
    /nombre/u,
  );
  assert.equal(
    authFailureMessage(
      { status: 400, body: { message: "Bad Request" } },
      "login",
    ),
    "Revisa los datos del formulario e inténtalo de nuevo.",
  );
  assert.equal(
    authFailureMessage(
      { status: 401, body: { message: "Credenciales inválidas." } },
      "login",
    ),
    "Correo o contraseña incorrectos, o la cuenta aún no está verificada.",
  );
  assert.equal(
    authFailureMessage(
      {
        status: 429,
        body: {
          message: "Demasiados intentos; inténtalo más tarde.",
          retryAfterSeconds: 37,
        },
      },
      "register",
    ),
    "Demasiados intentos. Espera 37 segundos e inténtalo de nuevo.",
  );
  assert.match(
    authFailureMessage({ status: 429, body: null }, "login"),
    /^Demasiados intentos\. Espera un momento/u,
  );
  const errorInterno = authFailureMessage(
    {
      status: 500,
      body: { statusCode: 500, message: "Internal server error" },
    },
    "register",
  );
  assert.match(errorInterno, /no respondió/u);
  assert.doesNotMatch(errorInterno, /Internal server error/u);
  assert.match(
    authFailureMessage(new Error("algo raro"), "register"),
    /no respondió/u,
  );
  assert.doesNotMatch(
    authFailureMessage(new Error("algo raro"), "register"),
    /algo raro/u,
  );

  console.log(
    "identity-actions: validación, transporte SDK seguro de secretos y mensajes de fallo en español verificados",
  );
}

void main();
