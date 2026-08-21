"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { DraftingCompass } from "lucide-react";
import { PRODUCT_LABEL } from "@/config/brand";
import { designClient } from "@/lib/cad/repositories/client";
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
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section
        aria-labelledby="identity-action-title"
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white/70 p-6 shadow-xl shadow-indigo-500/5 dark:border-white/10 dark:bg-white/5 sm:p-9"
      >
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <DraftingCompass
            aria-hidden="true"
            className="h-6 w-6 text-indigo-500"
          />
          {PRODUCT_LABEL.design}
        </Link>
        <h1 id="identity-action-title" className="mt-8 text-3xl font-bold">
          {content.title}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {content.description}
        </p>

        <form method="post" onSubmit={submit} className="mt-8 space-y-5">
          <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
            {asksForEmail && (
              <div>
                <label
                  htmlFor="identity-email"
                  className="mb-2 block text-sm font-medium"
                >
                  Correo electrónico
                </label>
                <input
                  id="identity-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={IDENTITY_FIELD_LIMITS.email}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
                />
              </div>
            )}
            {asksForToken && (
              <div>
                <label
                  htmlFor="identity-token"
                  className="mb-2 block text-sm font-medium"
                >
                  Token
                </label>
                <input
                  id="identity-token"
                  name="token"
                  type="text"
                  autoComplete="one-time-code"
                  minLength={IDENTITY_FIELD_LIMITS.tokenMin}
                  maxLength={IDENTITY_FIELD_LIMITS.tokenMax}
                  spellCheck={false}
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
                />
              </div>
            )}
            {asksForPassword && (
              <div>
                <label
                  htmlFor="identity-password"
                  className="mb-2 block text-sm font-medium"
                >
                  Contraseña nueva
                </label>
                <input
                  id="identity-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={IDENTITY_FIELD_LIMITS.passwordMin}
                  maxLength={IDENTITY_FIELD_LIMITS.passwordMax}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Entre {IDENTITY_FIELD_LIMITS.passwordMin} y{" "}
                  {IDENTITY_FIELD_LIMITS.passwordMax} caracteres.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? content.busy : content.button}
            </button>
          </fieldset>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="mt-4 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-sm">
          <Link className="underline" href={content.linkHref}>
            {content.linkLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
