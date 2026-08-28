"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { loginRequiresMfa } from "@valle/design-sdk";
import { localReturnTo } from "@/lib/session";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { AuthShell } from "@/components/AuthShell";
import { FreeLaunchNote } from "@/components/marketing/FreeLaunchNote";
import { ResendTimerButton } from "@/components/ResendTimerButton";
import { Button, Input, PasswordField } from "@/components/ui";

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
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  /**
   * El desafío de segundo factor. Cuando existe, la pantalla cambia entera: la
   * contraseña ya se validó y lo único que queda es el código. Se guarda en
   * estado y NO en la URL a propósito — un desafío en la barra de direcciones
   * acaba en el historial, en un registro de servidor y en el portapapeles de
   * quien comparte el enlace «para que veas el error».
   */
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
      ...(register
        ? { displayName: String(form.get("displayName") ?? "").trim() }
        : {}),
    };

    try {
      if (register) {
        await designClient.identity.register(body);
      } else {
        const resultado = await designClient.identity.login(body);
        // La respuesta del inicio de sesión es una de dos: sesión creada, o
        // desafío de segundo factor. Sin cookie en el segundo caso — la
        // contraseña sola no abre nada en una cuenta protegida.
        if (loginRequiresMfa(resultado)) {
          setMfaChallenge(resultado.challenge);
          submitting.current = false;
          setBusy(false);
          return;
        }
      }

      if (register) {
        // El correo se guarda ANTES de limpiar el formulario: la pantalla de
        // "revisa tu correo" tiene que poder decir a QUÉ dirección se envió, y
        // ése es el dato que un usuario que se equivocó de letra necesita ver.
        setRegisteredEmail(body.email);
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

  if (registeredEmail) {
    return <CheckYourInbox email={registeredEmail} />;
  }

  if (mfaChallenge) {
    return (
      <MfaChallenge
        challenge={mfaChallenge}
        onCancel={() => setMfaChallenge(null)}
        onSuccess={async () => {
          await auth.refresh();
          router.replace(localReturnTo(returnTo));
          router.refresh();
        }}
      />
    );
  }

  return (
    <AuthShell
      title={register ? "Crea tu cuenta" : "Te damos la bienvenida"}
      description={
        register
          ? "Empieza a preparar entregables técnicos con un flujo verificable."
          : "Accede a tus dibujos, revisiones y entregables."
      }
      error={error}
      // El panel del producto, sólo en el embudo de alta y sólo en escritorio.
      // Responde las dos preguntas que se hace quien está a punto de teclear su
      // correo —«¿qué es esto?» y «¿puedo fiarme?»— justo mientras las piensa.
      showcase
      footer={
        <>
          <p className="type-small mt-6 text-center text-muted-foreground">
            {register ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
            <Link
              className="font-semibold text-primary-ink underline-offset-4 hover:underline"
              href={crossLink(register ? "/login" : "/register", returnTo)}
            >
              {register ? "Inicia sesión" : "Regístrate"}
            </Link>
          </p>
          {!register && (
            <p className="type-small mt-3 text-center">
              <Link
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                href="/forgot-password"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </p>
          )}
        </>
      }
    >
      {/*
        La oferta se enseña ANTES del formulario, no debajo del botón: quien
        llega aquí decide si teclea su correo en los tres primeros segundos, y
        «sin tarjeta» es la frase que desbloquea esa decisión. El alta nunca ha
        pedido un medio de pago —tres campos: nombre, correo y contraseña— y
        `free-launch-funnel.spec.ts` lo vigila contra el stack real para que
        siga siendo verdad.
      */}
      {register && (
        <FreeLaunchNote className="mt-6 type-small text-muted-foreground" />
      )}

      <form method="post" onSubmit={submit} className="mt-8 space-y-5">
        {register && (
          <Input
            label="Nombre"
            name="displayName"
            autoComplete="name"
            maxLength={120}
            required
          />
        )}
        <Input
          label="Correo electrónico"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
        />
        {/*
          `PasswordField` en vez de `Input type="password"`: añade mostrar/
          ocultar —la razón número uno por la que alguien falla al registrarse
          es teclear mal algo que no puede ver, y en un teléfono con teclado
          predictivo pasa constantemente— y, al ELEGIR contraseña, un medidor
          que mide entropía en vez de premiar la mayúscula-número-símbolo que
          empuja a la gente hacia `P@ssw0rd1`. Al ENTRAR no hay medidor: juzgar
          la contraseña que ya existe no ayuda a nadie y sólo distrae.
        */}
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete={register ? "new-password" : "current-password"}
          showStrength={register}
          required
          hint={register ? "Mínimo 12 caracteres." : undefined}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
        >
          {busy ? "Procesando…" : register ? "Crear cuenta" : "Iniciar sesión"}
        </Button>
      </form>
    </AuthShell>
  );
}

/**
 * 4.1 · SIN CALLEJÓN TRAS EL REGISTRO.
 *
 * Lo que había: un `<p>` verde que decía "Cuenta creada. Completa la
 * verificación de correo antes de continuar." — y ahí terminaba. No decía a qué
 * dirección se había enviado (así que quien tecleó mal una letra no tenía cómo
 * saberlo), no ofrecía reenviar, y no llevaba a ningún sitio. El siguiente paso
 * del embudo quedaba a cargo de la memoria del usuario.
 *
 * Se extrae a su propio componente en vez de crecer el formulario: son dos
 * pantallas distintas del mismo paso, no dos estados de un mismo formulario.
 */
function CheckYourInbox({ email }: { email: string }) {
  return (
    <AuthShell
      titleId="check-inbox-title"
      title="Revisa tu correo"
      description="El último paso es confirmar que la dirección es tuya."
      // El resultado se anuncia con `role="status"`, no sólo se pinta: quien usa
      // lector de pantalla acaba de pulsar un botón y la página no ha navegado,
      // así que sin una región viva no se entera de que la cuenta ya existe.
      // `status` y no `alert` porque es una buena noticia: espera turno en vez
      // de cortar la frase que se estaba leyendo.
      message={
        <>
          Cuenta creada. Enviamos un enlace de verificación a{" "}
          <strong className="type-mono font-semibold text-foreground">
            {email}
          </strong>
          . Ábrelo desde este dispositivo y entrarás directo.
        </>
      }
      footer={
        <div className="mt-6 space-y-4">
          <div className="rounded-card border border-border bg-muted/50 p-4">
            <p className="type-small font-semibold text-foreground">
              ¿No llegó?
            </p>
            <ul className="type-small mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Mira en la carpeta de correo no deseado.</li>
              <li>
                Tarda hasta un par de minutos: el envío se encola y se
                reintenta.
              </li>
              <li>
                Si escribiste mal la dirección, vuelve a{" "}
                <Link
                  className="underline underline-offset-4 hover:text-foreground"
                  href="/register"
                >
                  registrarte
                </Link>{" "}
                con la correcta.
              </li>
            </ul>
          </div>
          {/*
            El reenvío se hace AQUÍ, sin salir de la pantalla: mandar al usuario
            a otra página a reescribir el correo que acaba de teclear es pedirle
            que repita trabajo en el momento en que ya dudaba de si funcionó.
            El temporizador evita los cinco correos y los cinco tokens que
            produce un botón sin espera.
          */}
          <ResendTimerButton
            onResend={async () => {
              await designClient.identity
                .resendVerification(email)
                .catch(() => {
                  /* La API responde igual exista o no la cuenta: no se filtra
                   quién está registrado, y un fallo de red aquí no debe
                   convertirse en un error rojo que asuste — el usuario ya tiene
                   el primer correo en camino. */
                });
            }}
          />
          <p className="type-small text-center text-muted-foreground">
            <Link
              className="underline underline-offset-4 hover:text-foreground"
              href="/verify-email"
            >
              Tengo un código
            </Link>
          </p>
        </div>
      }
    >
      <div className="mt-8" />
    </AuthShell>
  );
}

/**
 * EL SEGUNDO ACTO DEL INICIO DE SESIÓN.
 *
 * Pantalla propia y no un campo más del formulario, por la misma razón que
 * «revisa tu correo» es pantalla propia: son dos PASOS distintos, no dos
 * estados de un mismo formulario. Mezclarlos obliga al usuario a releer una
 * pantalla que ya rellenó para encontrar el único campo que ahora importa.
 *
 * El campo acepta las dos formas de entrar —los seis dígitos de la aplicación o
 * un código de respaldo— sin preguntar cuál es cuál: el servidor lo distingue
 * solo, y obligar a elegir en un menú desplegable es trabajo que el usuario no
 * tiene por qué hacer justo cuando ya está bloqueado fuera.
 *
 * `autoComplete="one-time-code"` es lo que permite que iOS y Android ofrezcan
 * el código desde el teclado; sin él, el usuario cambia de aplicación, lo
 * memoriza y vuelve, y a veces se le pasa la ventana de treinta segundos.
 */
function MfaChallenge({
  challenge,
  onCancel,
  onSuccess,
}: {
  challenge: string;
  onCancel: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    try {
      await designClient.identity.completeMfaLogin({ challenge, code });
      await onSuccess();
    } catch (cause) {
      setError(
        cause instanceof DesignApiError && cause.status === 429
          ? "Demasiados intentos. Espera un momento."
          : "El código no es válido o ya caducó. Pide uno nuevo a tu aplicación.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Confirma que eres tú"
      description="Tu cuenta pide un segundo factor. Escribe el código de seis dígitos de tu aplicación, o uno de tus códigos de respaldo."
      titleId="mfa-title"
      error={error}
      footer={
        <p className="type-small mt-6 text-center">
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Volver a empezar
          </button>
        </p>
      }
    >
      <form onSubmit={submit} className="mt-8 space-y-5">
        <Input
          label="Código"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={32}
          mono
          autoFocus
          required
          hint="Seis dígitos, o un código de respaldo con su guion."
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
        >
          {busy ? "Comprobando…" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
