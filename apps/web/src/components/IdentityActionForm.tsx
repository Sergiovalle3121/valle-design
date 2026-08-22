"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { designClient } from "@/lib/cad/repositories/client";
import { AuthShell } from "@/components/AuthShell";
import { Button, Input, Spinner, buttonClass } from "@/components/ui";
import {
  cleanIdentityUrl,
  IDENTITY_FIELD_LIMITS,
  identityFailureMessage,
  identitySuccessMessage,
  performIdentityAction,
  type IdentityAction,
} from "@/lib/identity-actions";

const CONTENT: Record<
  IdentityAction,
  {
    title: string;
    description: string;
    button: string;
    busy: string;
    linkHref: string;
    linkLabel: string;
  }
> = {
  verify: {
    title: "Verifica tu correo",
    description:
      "Normalmente esto se hace solo al abrir el enlace que te enviamos. Si llegaste hasta aquí a mano, usa el código del correo.",
    button: "Verificar correo",
    busy: "Verificando…",
    linkHref: "/resend-verification",
    linkLabel: "Solicitar otro correo de verificación",
  },
  resend: {
    title: "Reenvía la verificación",
    description: "Te enviaremos instrucciones si la cuenta puede verificarse.",
    button: "Enviar instrucciones",
    busy: "Enviando…",
    linkHref: "/verify-email",
    linkLabel: "Ya tengo un token",
  },
  forgot: {
    title: "Recupera tu contraseña",
    description: "Te enviaremos instrucciones si existe una cuenta asociada.",
    button: "Enviar instrucciones",
    busy: "Enviando…",
    linkHref: "/login",
    linkLabel: "Volver a iniciar sesión",
  },
  reset: {
    title: "Restablece tu contraseña",
    description: "Usa el token recibido y elige una contraseña nueva.",
    button: "Guardar contraseña",
    busy: "Guardando…",
    linkHref: "/forgot-password",
    linkLabel: "Solicitar otro enlace",
  },
};

export function IdentityActionForm({
  action,
  initialToken = "",
}: {
  action: IdentityAction;
  initialToken?: string;
}) {
  const content = CONTENT[action];
  const asksForEmail = action === "resend" || action === "forgot";
  const asksForToken = action === "verify" || action === "reset";
  const asksForPassword = action === "reset";
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  /** El campo de token sólo aparece si alguien lo pide (ver 4.2). */
  const [showToken, setShowToken] = useState(Boolean(initialToken));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanUrl = cleanIdentityUrl(window.location.href);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (cleanUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", cleanUrl);
    }
  }, []);

  /**
   * La acción, separada del `<form>` para que la pueda disparar TAMBIÉN el
   * efecto de auto-verificación. `useCallback` con las dependencias reales:
   * el efecto de abajo la tiene en su lista y sin memoizar se reejecutaría en
   * cada render, es decir, verificaría en bucle.
   */
  const run = useCallback(
    async (values: { email: string; token: string; password: string }) => {
      if (submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const result = await performIdentityAction(
          action,
          values,
          designClient.identity,
        );
        if (result.kind === "success") {
          setMessage(identitySuccessMessage(action));
          setEmail("");
          setToken("");
          setPassword("");
        } else {
          setError(identityFailureMessage(action, result));
        }
      } catch {
        setError(identityFailureMessage(action, { kind: "network-error" }));
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    },
    [action],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run({ email, token, password });
  }

  /**
   * 4.2 · VERIFICAR AL HACER CLIC, NO AL PEGAR UN TOKEN.
   *
   * Pedirle a alguien que copie un token de su correo y lo pegue en un campo es
   * de herramienta interna: son cuatro gestos —abrir, seleccionar, copiar,
   * pegar— en el paso más frágil del embudo, y en el móvil, donde el correo y
   * el navegador son dos aplicaciones, la mitad se pierde por el camino.
   *
   * El correo YA traía un enlace absoluto con el token
   * (`apps/api/.../email-templates.ts`); lo que faltaba era que al abrirlo
   * pasara algo. Ahora la verificación corre sola y el campo queda como
   * respaldo para quien llega a esta pantalla sin enlace.
   *
   * `verifiedOnce` impide el bucle: en desarrollo React monta dos veces cada
   * efecto a propósito, y sin la guarda el token se canjearía dos veces — la
   * segunda fallaría, y el usuario vería «token inválido» tras una
   * verificación que SÍ funcionó.
   */
  const autoVerified = useRef(false);
  useEffect(() => {
    if (action !== "verify" || !initialToken || autoVerified.current) return;
    autoVerified.current = true;
    void run({ email: "", token: initialToken, password: "" });
  }, [action, initialToken, run]);

  /**
   * Mientras la verificación automática está en vuelo, la pantalla NO enseña un
   * formulario: enseña que está trabajando. Un formulario que se autoenvía y se
   * queda visible invita a pulsar el botón encima de una petición ya en curso.
   */
  if (action === "verify" && initialToken && !error && !message) {
    return (
      <AuthShell
        titleId="identity-action-title"
        title="Verificando tu correo"
        description="Un momento: estamos confirmando que la dirección es tuya."
      >
        <div className="mt-8 flex items-center gap-3 text-muted-foreground">
          <Spinner size="md" label="Verificando" />
          <span className="type-small">Comprobando el enlace…</span>
        </div>
      </AuthShell>
    );
  }

  /** Verificado. El siguiente paso es entrar, así que se ofrece entrar. */
  if (action === "verify" && message) {
    return (
      <AuthShell
        titleId="identity-action-title"
        title="Listo, tu correo está verificado"
        description="Ya puedes entrar y abrir tu primer plano."
        message={message}
        footer={
          <Link
            href="/login"
            className={`${buttonClass({ variant: "primary", size: "lg", fullWidth: true })} mt-6`}
          >
            Iniciar sesión
          </Link>
        }
      >
        <div className="mt-2" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      titleId="identity-action-title"
      title={content.title}
      description={content.description}
      error={error}
      message={message}
      footer={
        <p className="type-small mt-6 text-center">
          <Link
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href={content.linkHref}
          >
            {content.linkLabel}
          </Link>
        </p>
      }
    >
      <form method="post" onSubmit={submit} className="mt-8">
        {/* `fieldset[disabled]` apaga TODOS los campos de una vez mientras la
            petición viaja. Deshabilitar sólo el botón deja los campos vivos, y
            entonces alguien corrige el correo mientras se envía el anterior. */}
        <fieldset disabled={busy} className="space-y-5">
          {asksForEmail && (
            <Input
              label="Correo electrónico"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={IDENTITY_FIELD_LIMITS.email}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
          {asksForToken && !showToken && action === "verify" && (
            // El respaldo no se enseña de entrada: quien llega aquí sin enlace
            // es la excepción, y un campo de token a la vista convierte la
            // excepción en el camino principal.
            <button
              type="button"
              onClick={() => setShowToken(true)}
              data-testid="identity-show-token"
              className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              ¿Tienes un código?
            </button>
          )}
          {asksForToken && (showToken || action !== "verify") && (
            <Input
              label="Código de verificación"
              name="token"
              type="text"
              autoComplete="one-time-code"
              minLength={IDENTITY_FIELD_LIMITS.tokenMin}
              maxLength={IDENTITY_FIELD_LIMITS.tokenMax}
              spellCheck={false}
              required
              mono
              value={token}
              onChange={(event) => setToken(event.target.value)}
              hint="Lo normal es entrar desde el enlace del correo; esto es el respaldo."
            />
          )}
          {asksForPassword && (
            <Input
              label="Contraseña nueva"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={IDENTITY_FIELD_LIMITS.passwordMin}
              maxLength={IDENTITY_FIELD_LIMITS.passwordMax}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={`Entre ${IDENTITY_FIELD_LIMITS.passwordMin} y ${IDENTITY_FIELD_LIMITS.passwordMax} caracteres.`}
            />
          )}
          {asksForToken && !showToken && action === "verify" ? null : (
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
            >
              {busy ? content.busy : content.button}
            </Button>
          )}
        </fieldset>
      </form>
    </AuthShell>
  );
}
