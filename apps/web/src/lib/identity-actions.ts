export const IDENTITY_FIELD_LIMITS = {
  email: 254,
  tokenMin: 32,
  tokenMax: 256,
  passwordMin: 12,
  passwordMax: 128,
} as const;

export type IdentityAction = "verify" | "resend" | "forgot" | "reset";

export interface IdentityActionValues {
  email?: string;
  token?: string;
  password?: string;
}

export type IdentityActionResult =
  | { kind: "success" }
  | { kind: "validation"; message: string }
  | { kind: "rate-limited" }
  | { kind: "request-error" }
  | { kind: "network-error" };

export interface IdentityActionClient {
  verifyEmail(token: string): Promise<unknown>;
  resendVerification(email: string): Promise<unknown>;
  requestPasswordReset(email: string): Promise<unknown>;
  resetPassword(input: { token: string; password: string }): Promise<unknown>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type FieldValidation =
  { ok: true; value: string } | { ok: false; message: string };

function characterCount(value: string): number {
  return Array.from(value).length;
}

function validateEmail(rawEmail: string | undefined): FieldValidation {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (
    !email ||
    characterCount(email) > IDENTITY_FIELD_LIMITS.email ||
    !EMAIL_PATTERN.test(email)
  ) {
    return { ok: false, message: "Escribe un correo electrónico válido." };
  }
  return { ok: true, value: email };
}

function validateToken(rawToken: string | undefined): FieldValidation {
  const token = (rawToken ?? "").trim();
  const length = characterCount(token);
  if (
    length < IDENTITY_FIELD_LIMITS.tokenMin ||
    length > IDENTITY_FIELD_LIMITS.tokenMax
  ) {
    return {
      ok: false,
      message: "El enlace o token no es válido. Solicita uno nuevo.",
    };
  }
  return { ok: true, value: token };
}

function validatePassword(password: string | undefined): FieldValidation {
  const value = password ?? "";
  const length = characterCount(value);
  if (
    length < IDENTITY_FIELD_LIMITS.passwordMin ||
    length > IDENTITY_FIELD_LIMITS.passwordMax
  ) {
    return {
      ok: false,
      message: `La contraseña debe tener entre ${IDENTITY_FIELD_LIMITS.passwordMin} y ${IDENTITY_FIELD_LIMITS.passwordMax} caracteres.`,
    };
  }
  return { ok: true, value };
}

export function identityActionPayload(
  action: IdentityAction,
  values: IdentityActionValues,
): { ok: true; body: Record<string, string> } | { ok: false; message: string } {
  if (action === "resend" || action === "forgot") {
    const email = validateEmail(values.email);
    return !email.ok
      ? { ok: false, message: email.message }
      : { ok: true, body: { email: email.value } };
  }

  const token = validateToken(values.token);
  if (!token.ok) return { ok: false, message: token.message };

  if (action === "verify") {
    return { ok: true, body: { token: token.value } };
  }

  const password = validatePassword(values.password);
  return !password.ok
    ? { ok: false, message: password.message }
    : {
        ok: true,
        body: { token: token.value, password: password.value },
      };
}

/**
 * Dispatches only through the generated SDK surface. Tokens and passwords are
 * method arguments that the SDK serializes into a JSON body, never a URL.
 */
export async function performIdentityAction(
  action: IdentityAction,
  values: IdentityActionValues,
  client: IdentityActionClient,
): Promise<IdentityActionResult> {
  const payload = identityActionPayload(action, values);
  if (!payload.ok) {
    return { kind: "validation", message: payload.message };
  }

  try {
    if (action === "verify") {
      await client.verifyEmail(payload.body.token);
    } else if (action === "resend") {
      await client.resendVerification(payload.body.email);
    } else if (action === "forgot") {
      await client.requestPasswordReset(payload.body.email);
    } else {
      await client.resetPassword({
        token: payload.body.token,
        password: payload.body.password,
      });
    }
    return { kind: "success" };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 429
    ) {
      return { kind: "rate-limited" };
    }
    return error instanceof TypeError
      ? { kind: "network-error" }
      : { kind: "request-error" };
  }
}

export function identitySuccessMessage(action: IdentityAction): string {
  switch (action) {
    case "verify":
      return "Tu correo quedó verificado. Ya puedes iniciar sesión.";
    case "resend":
      return "Si existe una cuenta pendiente de verificación para ese correo, enviaremos nuevas instrucciones.";
    case "forgot":
      return "Si existe una cuenta asociada a ese correo, enviaremos instrucciones para restablecer la contraseña.";
    case "reset":
      return "Tu contraseña se actualizó. Las sesiones anteriores quedaron cerradas.";
  }
}

export function identityFailureMessage(
  action: IdentityAction,
  result: Exclude<IdentityActionResult, { kind: "success" }>,
): string {
  if (result.kind === "validation") return result.message;
  if (result.kind === "rate-limited") {
    return "Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.";
  }
  if (result.kind === "network-error") {
    return "No se pudo conectar con el servicio de identidad. Intenta de nuevo.";
  }
  if (action === "verify" || action === "reset") {
    return "El enlace o token no es válido o ya expiró. Solicita uno nuevo.";
  }
  return "No se pudo procesar la solicitud. Intenta de nuevo más tarde.";
}

export function cleanIdentityUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete("token");
  url.searchParams.delete("password");
  url.searchParams.delete("newPassword");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function initialIdentityToken(
  value: string | string[] | undefined,
): string {
  const token = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return characterCount(token) <= IDENTITY_FIELD_LIMITS.tokenMax ? token : "";
}
