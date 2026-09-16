export const IDENTITY_FIELD_LIMITS = {
  email: 254,
  tokenMin: 32,
  tokenMax: 256,
  passwordMin: 12,
  passwordMax: 128,
  /** Techo del campo «Nombre» del alta (el API admite hasta 160). */
  displayName: 120,
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

export function validateEmail(rawEmail: string | undefined): FieldValidation {
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

export function validatePassword(password: string | undefined): FieldValidation {
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

export function validateDisplayName(
  rawName: string | undefined,
): FieldValidation {
  const value = (rawName ?? "").trim();
  if (!value) {
    return { ok: false, message: "Escribe tu nombre." };
  }
  if (characterCount(value) > IDENTITY_FIELD_LIMITS.displayName) {
    return {
      ok: false,
      message: `El nombre no puede superar ${IDENTITY_FIELD_LIMITS.displayName} caracteres.`,
    };
  }
  return { ok: true, value };
}

export interface AuthFormValues {
  displayName?: string;
  email?: string;
  password?: string;
}

/**
 * Cuerpo del inicio de sesión, validado ANTES de salir del navegador.
 *
 * La validación nativa del formulario (`required`, `type=email`, `minLength`)
 * habla en el idioma del navegador; lo que la pasa —un correo con espacios,
 * una contraseña de 200 caracteres— revienta en el 400 del API, que viene en
 * inglés. Aquí se corta antes y se explica en español.
 */
export function loginPayload(
  values: AuthFormValues,
):
  | { ok: true; body: { email: string; password: string } }
  | { ok: false; message: string } {
  const email = validateEmail(values.email);
  if (!email.ok) return { ok: false, message: email.message };
  const password = validatePassword(values.password);
  if (!password.ok) return { ok: false, message: password.message };
  return { ok: true, body: { email: email.value, password: password.value } };
}

/** Cuerpo del alta: los tres campos del embudo, validados en español. */
export function registerPayload(
  values: AuthFormValues,
):
  | {
      ok: true;
      body: { email: string; password: string; displayName: string };
    }
  | { ok: false; message: string } {
  const displayName = validateDisplayName(values.displayName);
  if (!displayName.ok) return { ok: false, message: displayName.message };
  const login = loginPayload(values);
  if (!login.ok) return login;
  return { ok: true, body: { ...login.body, displayName: displayName.value } };
}

/**
 * Lo que se le dice a la persona cuando el alta o el inicio de sesión fallan.
 *
 * Nunca se reexpone `body.message` ni `Error.message`: el 400 del
 * ValidationPipe llega en inglés («password must be longer than or equal to
 * 12 characters»), un 500 llega como «Internal server error» y un fallo de
 * red es «Failed to fetch» del navegador. Ninguno de los tres le sirve a un
 * ingeniero que sólo quiere saber qué hacer ahora. El cuerpo del error se
 * mira sólo para CLASIFICAR (qué campo rechazó el API, cuántos segundos pide
 * el 429); el texto que se enseña es siempre nuestro.
 */
export function authFailureMessage(
  cause: unknown,
  mode: "login" | "register",
): string {
  if (cause instanceof TypeError) {
    return "No se pudo conectar con el servicio de identidad. Revisa tu conexión e intenta de nuevo.";
  }
  const status = httpStatusOf(cause);
  const body = httpBodyOf(cause);
  if (status === 429) {
    const retryAfter = body?.retryAfterSeconds;
    return typeof retryAfter === "number" && Number.isFinite(retryAfter)
      ? `Demasiados intentos. Espera ${Math.max(1, Math.ceil(retryAfter))} segundos e inténtalo de nuevo.`
      : "Demasiados intentos. Espera un momento antes de intentarlo de nuevo.";
  }
  if (status === 400) {
    const detail = validationDetail(body?.message);
    if (/displayName/u.test(detail)) {
      return `Revisa el nombre: no puede estar vacío ni superar ${IDENTITY_FIELD_LIMITS.displayName} caracteres.`;
    }
    if (/email/u.test(detail)) {
      return "Escribe un correo electrónico válido.";
    }
    if (/password/u.test(detail)) {
      return `La contraseña debe tener entre ${IDENTITY_FIELD_LIMITS.passwordMin} y ${IDENTITY_FIELD_LIMITS.passwordMax} caracteres.`;
    }
    return "Revisa los datos del formulario e inténtalo de nuevo.";
  }
  if (status === 401 && mode === "login") {
    return "Correo o contraseña incorrectos, o la cuenta aún no está verificada.";
  }
  return "El servicio de identidad no respondió. Intenta de nuevo en unos minutos.";
}

function httpStatusOf(cause: unknown): number | null {
  return cause &&
    typeof cause === "object" &&
    "status" in cause &&
    typeof cause.status === "number"
    ? cause.status
    : null;
}

function httpBodyOf(
  cause: unknown,
): { message?: unknown; retryAfterSeconds?: unknown } | null {
  if (!cause || typeof cause !== "object" || !("body" in cause)) return null;
  const body = cause.body;
  return body && typeof body === "object"
    ? (body as { message?: unknown; retryAfterSeconds?: unknown })
    : null;
}

/** El `message` de class-validator es una lista de frases; se une para buscar el campo. */
function validationDetail(message: unknown): string {
  return Array.isArray(message)
    ? message.filter((item) => typeof item === "string").join(" ")
    : typeof message === "string"
      ? message
      : "";
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
