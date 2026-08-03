import { strict as assert } from "node:assert";
import {
  cleanIdentityUrl,
  identityActionPayload,
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
      resetPassword: async (value) =>
        void calls.push(["resetPassword", value]),
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

  console.log(
    "identity-actions: validación y transporte SDK seguro de secretos verificados",
  );
}

void main();
