"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { DraftingCompass } from "lucide-react";
import { PRODUCT_LABEL } from "@/config/brand";
import { COMMERCIAL_LINKS } from "@/config/commercial";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { localReturnTo } from "@/lib/session";
import { useDesignAuth } from "@/contexts/DesignAuthContext";

type AuthMode = "login" | "register";

/**
 * Conserva el destino al saltar entre registro e inicio de sesión.
 *
 * Quien llega desde la página de precios trae en `returnTo` el plan que eligió.
 * Perderlo al pulsar "¿Ya tienes cuenta?" obligaría a volver a elegirlo tras
 * autenticarse, que es justo donde se cae una compra.
 */
function crossLink(path: string, returnTo: string | null): string {
  const target = localReturnTo(returnTo);
  return target === "/dashboard"
    ? path
    : `${path}?returnTo=${encodeURIComponent(target)}`;
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const register = mode === "register";
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const auth = useDesignAuth();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const body = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      ...(register
        ? { displayName: String(form.get("displayName") ?? "").trim() }
        : {}),
    };

    try {
      if (register) await designClient.identity.register(body);
      else await designClient.identity.login(body);

      if (register) {
        setMessage(
          "Cuenta creada. Completa la verificación de correo antes de continuar.",
        );
        event.currentTarget.reset();
      } else {
        // `router.replace` navega en cliente y el proveedor de identidad vive
        // en el layout raíz: no se remonta, así que su `refresh()` de montaje
        // NO vuelve a correr y `router.refresh()` sólo revalida los server
        // components. El contexto se quedaba con la sesión nula leída ANTES de
        // iniciar sesión, y el destino — que sí depende de él — anunciaba
        // "Tu sesión ha expirado" justo después de un login correcto.
        // Se relee la sesión ANTES de navegar para que el destino monte ya
        // autenticado; el servidor sigue siendo la autoridad.
        await auth.refresh();
        router.replace(localReturnTo(returnTo));
        router.refresh();
      }
    } catch (cause) {
      const detail =
        cause instanceof DesignApiError
          ? Array.isArray(cause.body?.message)
            ? cause.body.message.join(" ")
            : cause.body?.message
          : undefined;
      setError(
        detail ||
          (cause instanceof DesignApiError && cause.status === 429
            ? "Demasiados intentos. Espera un momento."
            : cause instanceof Error
              ? cause.message
              : "No se pudo conectar con el servicio de identidad."),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section
        aria-labelledby="auth-title"
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white/70 p-6 shadow-xl shadow-indigo-500/5 dark:border-white/10 dark:bg-white/5 sm:p-9"
      >
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <DraftingCompass
            aria-hidden="true"
            className="h-6 w-6 text-indigo-500"
          />
          {PRODUCT_LABEL.design}
        </Link>
        <h1 id="auth-title" className="mt-8 text-3xl font-bold">
          {register ? "Crea tu cuenta" : "Te damos la bienvenida"}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {register
            ? "Empieza a preparar entregables técnicos con un flujo verificable."
            : "Accede a tus dibujos, revisiones y entregables."}
        </p>

        <form method="post" onSubmit={submit} className="mt-8 space-y-5">
          {register && (
            <div>
              <label
                htmlFor="displayName"
                className="mb-2 block text-sm font-medium"
              >
                Nombre
              </label>
              <input
                id="displayName"
                name="displayName"
                autoComplete="name"
                maxLength={120}
                required
                className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              required
              className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
              className="min-h-11 w-full rounded-xl border border-black/15 bg-transparent px-3 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/20"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? "Procesando…"
              : register
                ? "Crear cuenta"
                : "Iniciar sesión"}
          </button>
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

        <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">
          {register ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
          <Link
            className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300"
            href={crossLink(register ? "/login" : "/register", returnTo)}
          >
            {register ? "Inicia sesión" : "Regístrate"}
          </Link>
        </p>
        {!register && (
          <p className="mt-3 text-center text-sm">
            <Link className="underline" href="/forgot-password">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        )}
        <p className="mt-5 text-center text-xs text-gray-500">
          ¿Necesitas ayuda?{" "}
          <a className="underline" href={COMMERCIAL_LINKS.support}>
            Contacta con soporte
          </a>
          .
        </p>
      </section>
    </main>
  );
}
