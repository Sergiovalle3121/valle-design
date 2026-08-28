import type { components } from "./generated/design-api";

type Schemas = components["schemas"];

export type RegisterRequest = Schemas["RegisterRequest"];
export type LoginRequest = Schemas["LoginRequest"];
export type LoginResponse = Schemas["LoginResponse"];
export type MfaChallengeResponse = Schemas["MfaChallengeResponse"];
export type AuthSessionResponse = Schemas["AuthSessionResponse"];
export type IdentitySessionList = Schemas["IdentitySessionList"];

/**
 * LO QUE DEVUELVE `login`, que desde el segundo factor son DOS cosas.
 *
 * La unión está tipada a propósito en vez de devolver `LoginResponse` con
 * campos opcionales: obliga a quien llama a distinguir los dos casos antes de
 * leer `user`, y el compilador lo comprueba. Una respuesta con `user?` habría
 * dejado pasar en silencio el código que navega al panel tras un inicio que
 * todavía no ha terminado — que es exactamente el defecto que convierte un
 * segundo factor en decoración.
 */
export type LoginOutcome = LoginResponse | MfaChallengeResponse;

/** Estrecha la unión sin repetir la comprobación en cada consumidor. */
export function loginRequiresMfa(
  outcome: LoginOutcome,
): outcome is MfaChallengeResponse {
  return "mfaRequired" in outcome && outcome.mfaRequired === true;
}

/**
 * LA SUPERFICIE DE IDENTIDAD DEL SDK.
 *
 * ── POR QUÉ VIVE EN SU PROPIO ARCHIVO ───────────────────────────────────────
 * Porque es la que más crece. `client.ts` reunía las siete superficies del API
 * en un archivo, y al añadir el segundo factor y la actividad de la cuenta pasó
 * de 781 a 852 líneas — por encima del techo de 800 que vigila el gate del
 * monolito, cuya instrucción es explícita: «divídelo; no lo añadas al
 * manifiesto salvo que exista una razón escrita». No la había.
 *
 * El corte está donde ya estaba la costura: identidad era la única superficie
 * con submenús propios (`sessions`, `mfa`) y la única que no habla de CAD ni de
 * facturación. `client.ts` conserva el transporte —construcción de URL, CSRF,
 * manejo de errores— y esta fábrica recibe sólo lo que necesita.
 *
 * La fábrica toma `call` y `resource` en vez de reimplementarlos: el transporte
 * sigue siendo UNO. Si esto abriera su propio `fetch`, la política de CSRF y el
 * desempaquetado de errores tendrían dos verdades y divergirían a la primera
 * prisa.
 */
export interface IdentityTransport {
  call<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  resource(apiPath: string): string;
}

export function createIdentitySurface({ call, resource }: IdentityTransport) {
  return {
    register: (input: RegisterRequest) =>
      call<Schemas["AcceptedResponse"]>(
        "POST",
        resource("/v1/auth/register"),
        input,
      ),
    login: (input: LoginRequest) =>
      call<LoginOutcome>("POST", resource("/v1/auth/login"), input),
    currentSession: () =>
      call<AuthSessionResponse>("GET", resource("/v1/auth/session")),
    logout: () => call<void>("POST", resource("/v1/auth/logout")),
    verifyEmail: (token: string) =>
      call<Schemas["EmailVerificationResponse"]>(
        "POST",
        resource("/v1/auth/verify-email"),
        { token },
      ),
    resendVerification: (email: string) =>
      call<Schemas["AcceptedResponse"]>(
        "POST",
        resource("/v1/auth/verify-email/resend"),
        { email },
      ),
    requestPasswordReset: (email: string) =>
      call<Schemas["AcceptedResponse"]>(
        "POST",
        resource("/v1/auth/password/forgot"),
        { email },
      ),
    resetPassword: (input: Schemas["PasswordResetRequest"]) =>
      call<Schemas["PasswordResetResponse"]>(
        "POST",
        resource("/v1/auth/password/reset"),
        input,
      ),
    /**
     * SEGUNDO ACTO DEL INICIO DE SESIÓN.
     *
     * Sólo se llama cuando `login` respondió `mfaRequired`. Va aquí y no
     * dentro de `sessions` porque no administra sesiones: las CREA, igual que
     * `login`, y esconderlo un nivel más abajo habría invitado a olvidarlo.
     */
    completeMfaLogin: (input: Schemas["MfaLoginRequest"]) =>
      call<LoginResponse>("POST", resource("/v1/auth/login/mfa"), input),

    /** Sucesos recientes de identidad de la cuenta. Nunca incluye la IP. */
    activity: () =>
      call<Schemas["IdentityActivityList"]>(
        "GET",
        resource("/v1/auth/activity"),
      ),

    mfa: {
      status: () => call<Schemas["MfaStatus"]>("GET", resource("/v1/auth/mfa")),
      /** Emite un secreto SIN confirmar y su URI para el código QR. */
      setup: () =>
        call<Schemas["MfaSetupResponse"]>(
          "POST",
          resource("/v1/auth/mfa/setup"),
        ),
      /**
       * Confirma el alta. Los códigos de respaldo que devuelve son la ÚNICA
       * vez que salen del servidor: se guardan en hash y no hay forma de
       * volver a mostrarlos.
       */
      activate: (code: string) =>
        call<Schemas["MfaActivationResponse"]>(
          "POST",
          resource("/v1/auth/mfa/activate"),
          { code },
        ),
      disable: (password: string) =>
        call<Schemas["MfaDisabledResponse"]>(
          "POST",
          resource("/v1/auth/mfa/disable"),
          { password },
        ),
      regenerateBackupCodes: (password: string) =>
        call<Schemas["MfaBackupCodesResponse"]>(
          "POST",
          resource("/v1/auth/mfa/backup-codes"),
          { password },
        ),
    },

    sessions: {
      list: () =>
        call<IdentitySessionList>("GET", resource("/v1/auth/sessions")),
      rotate: () =>
        call<Schemas["SessionRotationResponse"]>(
          "POST",
          resource("/v1/auth/sessions/rotate"),
        ),
      revoke: (sessionId: string) =>
        call<void>("DELETE", resource(`/v1/auth/sessions/${sessionId}`)),
      revokeOthers: () =>
        call<void>("POST", resource("/v1/auth/sessions/revoke-all")),
    },
  };
}
