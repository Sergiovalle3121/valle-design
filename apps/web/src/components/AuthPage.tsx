"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { loginRequiresMfa } from "@valle/design-sdk";
import { localReturnTo } from "@/lib/session";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import {
  authFailureMessage,
  loginPayload,
  registerPayload,
} from "@/lib/identity-actions";
import { AuthShell } from "@/components/AuthShell";
import { FreeLaunchNote } from "@/components/marketing/FreeLaunchNote";
import { ResendTimerButton } from "@/components/ResendTimerButton";
import { Button, Checkbox, Input, PasswordField } from "@/components/ui";

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
  /**
   * T-63d (petición F8-1). Nadie veía ni confirmaba nada al crear la cuenta.
   * Los documentos vigentes se piden a `GET /v1/legal/documents` (pública) para
   * que la casilla nombre la VERSIÓN que se está aceptando. Si la petición
   * falla, conservamos los enlaces pero no permitimos crear una cuenta sin
   * versión: el servidor sólo registra la aceptación del texto vigente.
   */
  const [legalDocuments, setLegalDocuments] = useState<LegalLink[] | null>(
    null,
  );
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  useEffect(() => {
    if (!register) return;
    let alive = true;
    designClient.legal
      .documents()
      .then(({ documents }) => {
        if (!alive) return;
        // Una casilla marcada antes de resolver la versión no puede contar
        // como aceptación del documento que acaba de aparecer.
        setAcceptedTerms(false);
        setLegalDocuments(
          documents.map((doc) => ({
            documento: doc.documento,
            version: doc.version,
            url: doc.url,
          })),
        );
        if (
          !documents.some((doc) => doc.documento === "terms" && doc.version)
        ) {
          setError(
            "No pudimos consultar la versión vigente de los términos. Recarga la página para continuar.",
          );
        }
      })
      .catch(() => {
        if (alive) {
          setLegalDocuments([]);
          setError(
            "No pudimos consultar la versión vigente de los términos. Recarga la página para continuar.",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [register]);
  const legalLinks = legalLinksFor(legalDocuments);
  const termsReady = !!legalLinks.terms.version;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    // Se valida en español ANTES de salir del navegador. La validación nativa
    // del formulario habla en el idioma del navegador, y lo que la pasa —un
    // correo con espacios, un nombre más largo que el techo— volvía como el
    // 400 en inglés del API. `registerPayload`/`loginPayload` cortan aquí.
    const form = new FormData(event.currentTarget);
    const values = {
      displayName: String(form.get("displayName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      termsVersion: legalLinks.terms.version,
      acceptedTerms,
    };
    const registration = register ? registerPayload(values) : null;
    const signIn = register ? null : loginPayload(values);
    const payload = registration ?? signIn;
    if (!payload || !payload.ok) {
      setError(payload?.message ?? "Revisa los datos del formulario.");
      return;
    }
    const body = payload.body;

    submitting.current = true;
    setBusy(true);
    setError(null);

    try {
      if (registration?.ok) {
        await designClient.identity.register(registration.body);
      } else if (signIn?.ok) {
        const resultado = await designClient.identity.login(signIn.body);
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
      // Nunca el `message` crudo del servidor ni del navegador: el 400 de
      // class-validator viene en inglés, el 500 dice «Internal server error»
      // y un fallo de red dice «Failed to fetch». Lo que se enseña es siempre
      // nuestro, en español, y dice qué hacer ahora.
      setError(authFailureMessage(cause, mode));
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
      hint={
        !register && error ? (
          <>
            ¿Acabas de crear la cuenta y no has confirmado tu correo?{" "}
            <Link
              className="font-semibold text-primary-ink underline-offset-4 hover:underline"
              href="/resend-verification"
            >
              Reenvía el enlace
            </Link>
            .
          </>
        ) : undefined
      }
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
        {register && (
          <Checkbox
            name="acceptedTerms"
            data-testid="register-accept-terms"
            required
            disabled={!termsReady}
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            // El botón «Crear cuenta» está deshabilitado hasta marcarla (golden
            // 197). Un botón muerto sin explicación parece un fallo del
            // producto; la pista dice por qué, enlazada por aria-describedby.
            hint={
              termsReady
                ? "Necesaria para crear la cuenta."
                : "Cargando la versión vigente de los términos."
            }
            label={
              <>
                Acepto los{" "}
                <Link
                  href={legalLinks.terms.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Términos de Servicio
                </Link>
                {legalLinks.terms.version
                  ? ` (versión ${legalLinks.terms.version})`
                  : ""}{" "}
                y he leído el{" "}
                <Link
                  href={legalLinks.privacy.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Aviso de Privacidad
                </Link>
                {legalLinks.privacy.version
                  ? ` (versión ${legalLinks.privacy.version})`
                  : ""}
                .
              </>
            }
          />
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          disabled={register && (!acceptedTerms || !termsReady)}
        >
          {busy ? "Procesando…" : register ? "Crear cuenta" : "Iniciar sesión"}
        </Button>
      </form>
    </AuthShell>
  );
}

interface LegalLink {
  documento: "terms" | "privacy";
  version: string;
  url: string;
}

/**
 * Los dos enlaces de la casilla. Mientras cargan, o si la carga falló, apuntan
 * a las páginas fijas del producto (`/terms`, `/privacy`) SIN versión: un
 * enlace sin número es verdad; un número inventado no.
 */
function legalLinksFor(documents: LegalLink[] | null): {
  terms: LegalLink;
  privacy: LegalLink;
} {
  const find = (documento: LegalLink["documento"], url: string): LegalLink =>
    documents?.find((doc) => doc.documento === documento) ?? {
      documento,
      version: "",
      url,
    };
  return {
    terms: find("terms", "/terms"),
    privacy: find("privacy", "/privacy"),
  };
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
  const [resendError, setResendError] = useState<string | null>(null);
  return (
    <AuthShell
      titleId="check-inbox-title"
      title="Revisa tu correo"
      description="El último paso es confirmar que la dirección es tuya."
      // El fallo del reenvío sale por la región `role="alert"` de la cáscara,
      // con la tinta de peligro del sistema (`text-danger-ink`); el relleno
      // `destructive` no es tinta y no se usa como tal.
      error={resendError}
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
              setResendError(null);
              try {
                await designClient.identity.resendVerification(email);
                return true;
              } catch (cause) {
                // Antes se tragaba TODO y el temporizador arrancaba igual: un
                // 429 o un fallo de red parecían un reenvío exitoso. Ahora los
                // dos se dicen y el botón sigue disponible. Lo demás se sigue
                // tratando como enviado: la API responde igual exista o no la
                // cuenta —no se filtra quién está registrado— y el primer
                // correo ya va en camino.
                const rateLimited =
                  cause instanceof DesignApiError && cause.status === 429;
                if (rateLimited || cause instanceof TypeError) {
                  setResendError(authFailureMessage(cause, "register"));
                  return false;
                }
                return true;
              }
            }}
          />
          {resendError ? (
            <p role="alert" className="type-small text-center text-destructive">
              {resendError}
            </p>
          ) : null}
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
