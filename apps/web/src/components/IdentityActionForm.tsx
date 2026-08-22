"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { designClient } from "@/lib/cad/repositories/client";
import { AuthShell } from "@/components/AuthShell";
import { Button, Input } from "@/components/ui";
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
      "Pega el token recibido para confirmar tu dirección de correo.",
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    submitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await performIdentityAction(
        action,
        { email, token, password },
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
          {asksForToken && (
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
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
          >
            {busy ? content.busy : content.button}
          </Button>
        </fieldset>
      </form>
    </AuthShell>
  );
}
