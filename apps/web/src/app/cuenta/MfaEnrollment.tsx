"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { designClient } from "@/lib/cad/repositories/client";
import { Button, Input, PasswordField, QrCode, Surface } from "@/components/ui";

/**
 * EL ALTA DEL SEGUNDO FACTOR, en tres pasos que no se pueden confundir.
 *
 * ── EL RECORRIDO, Y POR QUÉ ESTE Y NO OTRO ──────────────────────────────────
 *   1. ESCANEAR. Se emite un secreto sin confirmar y se pinta su QR. Debajo,
 *      SIEMPRE, la clave para teclear a mano: un lector que no enfoca, una
 *      cámara sin permiso o un teléfono corporativo bloqueado no pueden ser el
 *      final del camino.
 *   2. CONFIRMAR con un código. Hasta aquí el factor no protege nada — el alta
 *      no ha terminado y el inicio de sesión sigue funcionando igual. Esto es
 *      deliberado: un factor que se activara antes de comprobar que la
 *      aplicación quedó bien configurada dejaría al usuario fuera de su propia
 *      cuenta, que es el peor fallo posible en esta función.
 *   3. GUARDAR LOS CÓDIGOS DE RESPALDO. Se enseñan UNA vez. No es una
 *      limitación técnica que haya que disculpar: es la propiedad. Un producto
 *      que puede volver a mostrar tus códigos de respaldo es un producto que
 *      puede entregárselos a quien se haga pasar por ti.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 * No ofrece «enviar un código al correo» como recuperación. Sería convertir el
 * segundo factor en decoración: quien controle el correo entraría igual, y el
 * factor dejaría de añadir nada a lo que ya protege la contraseña.
 */

const ERROR_LECTURA = "No se pudo leer el estado del segundo factor.";

type Estado = {
  enabled: boolean;
  pending: boolean;
  confirmedAt: string | null;
  backupCodesRemaining: number;
};

export function MfaEnrollment() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [alta, setAlta] = useState<{ secret: string; uri: string } | null>(
    null,
  );
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /** Pide y DEVUELVE; no escribe estado. Ver la nota de `AccountSecurity`. */
  const leerEstado = useCallback(
    async () => (await designClient.identity.mfa.status()) as Estado,
    [],
  );

  const recargar = useCallback(async () => {
    try {
      setEstado(await leerEstado());
    } catch {
      setError(ERROR_LECTURA);
    }
  }, [leerEstado]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const leido = await leerEstado();
        if (!controller.signal.aborted) setEstado(leido);
      } catch {
        if (!controller.signal.aborted) setError(ERROR_LECTURA);
      }
    })();
    return () => controller.abort();
  }, [leerEstado]);

  async function empezar() {
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await designClient.identity.mfa.setup();
      setAlta({ secret: respuesta.secret, uri: respuesta.uri });
    } catch {
      setError("No se pudo empezar el alta. Vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  }

  async function activar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await designClient.identity.mfa.activate(code);
      setCodigos(respuesta.backupCodes as string[]);
      setAlta(null);
      await recargar();
    } catch {
      setError(
        "El código no coincide. Revisa que la hora de tu teléfono esté al día y vuelve a intentarlo.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setOcupado(true);
    setError(null);
    try {
      await designClient.identity.mfa.disable(password);
      setCodigos(null);
      await recargar();
    } catch {
      setError("Contraseña incorrecta.");
    } finally {
      setOcupado(false);
    }
  }

  async function rehacerCodigos(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setOcupado(true);
    setError(null);
    try {
      const respuesta =
        await designClient.identity.mfa.regenerateBackupCodes(password);
      setCodigos(respuesta.backupCodes as string[]);
      await recargar();
    } catch {
      setError("Contraseña incorrecta.");
    } finally {
      setOcupado(false);
    }
  }

  function copiarSecreto(secret: string) {
    void navigator.clipboard?.writeText(secret).then(() => {
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    });
  }

  if (estado === null) {
    return <p className="type-small text-muted-foreground">Leyendo…</p>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="type-small text-danger-ink">
          {error}
        </p>
      ) : null}

      {/* ── LOS CÓDIGOS, cuando acaban de emitirse ────────────────────────── */}
      {codigos ? (
        <Surface
          padded="sm"
          elevation="none"
          className="border-warning/40 bg-warning/[.07]"
        >
          <div className="flex gap-3">
            <ShieldAlert
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink"
            />
            <div>
              <p className="type-small font-semibold text-foreground">
                Guarda estos códigos ahora
              </p>
              <p className="type-caption mt-1 text-muted-foreground">
                Son tu única salida si pierdes el teléfono. Cada uno sirve una
                sola vez y no se pueden volver a mostrar: el servidor sólo
                guarda un derivado del que no se puede volver atrás.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {codigos.map((codigo) => (
              <li
                key={codigo}
                className="type-mono type-caption rounded-control border border-border bg-card px-2.5 py-2 text-center text-foreground"
              >
                {codigo}
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setCodigos(null)}
          >
            Ya los guardé
          </Button>
        </Surface>
      ) : null}

      {/* ── ACTIVO ────────────────────────────────────────────────────────── */}
      {estado.enabled ? (
        <div className="space-y-5">
          <p className="type-small text-foreground">
            <Check
              aria-hidden="true"
              className="mr-1.5 inline h-4 w-4 text-success-ink"
            />
            Activo desde el{" "}
            {estado.confirmedAt
              ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(
                  new Date(estado.confirmedAt),
                )
              : "—"}
            . Te quedan{" "}
            <span className="type-numeric font-semibold">
              {estado.backupCodesRemaining}
            </span>{" "}
            códigos de respaldo sin usar.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <form onSubmit={rehacerCodigos} className="space-y-3">
              <p className="type-caption text-muted-foreground">
                ¿Se te acabaron o los perdiste? Genera diez nuevos; los
                anteriores dejan de valer en el acto.
              </p>
              <PasswordField
                label="Tu contraseña"
                name="password"
                autoComplete="current-password"
                required
              />
              <Button type="submit" variant="secondary" loading={ocupado}>
                Generar códigos nuevos
              </Button>
            </form>

            <form onSubmit={desactivar} className="space-y-3">
              <p className="type-caption text-muted-foreground">
                Desactivarlo deja tu cuenta protegida sólo por la contraseña. Se
                pide la contraseña porque estar dentro no basta: una sesión
                abierta en una máquina ajena es justo el escenario del que
                protege el segundo factor.
              </p>
              <PasswordField
                label="Tu contraseña"
                name="password"
                autoComplete="current-password"
                required
              />
              <Button type="submit" variant="danger" loading={ocupado}>
                Desactivar el segundo factor
              </Button>
            </form>
          </div>
        </div>
      ) : alta ? (
        /* ── PASOS 1 Y 2 ─────────────────────────────────────────────────── */
        <div className="grid gap-8 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div>
            <div className="w-44 overflow-hidden rounded-card border border-border p-3">
              <QrCode
                value={alta.uri}
                label="Código para configurar tu aplicación de autenticación"
              />
            </div>
            <p className="type-caption mt-3 max-w-44 text-muted-foreground">
              Escanéalo con la aplicación de códigos temporales que uses.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <p className="type-small font-medium text-foreground">
                ¿No puedes escanear?
              </p>
              <p className="type-caption mt-1 text-muted-foreground">
                Añade la cuenta a mano con esta clave. Es la misma que lleva el
                código de al lado.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="type-mono type-caption flex-1 truncate rounded-control border border-border bg-muted px-3 py-2 text-foreground">
                  {alta.secret}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copiarSecreto(alta.secret)}
                  iconLeft={<Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                >
                  {copiado ? "Copiada" : "Copiar"}
                </Button>
              </div>
            </div>

            <form onSubmit={activar} className="space-y-3">
              <Input
                label="Código de seis dígitos"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                maxLength={8}
                mono
                required
                hint="El que muestra tu aplicación ahora mismo."
              />
              <Button type="submit" variant="primary" loading={ocupado}>
                Activar el segundo factor
              </Button>
            </form>
          </div>
        </div>
      ) : (
        /* ── APAGADO ──────────────────────────────────────────────────────── */
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="type-small text-muted-foreground">
            Ahora mismo tu cuenta entra sólo con la contraseña.
          </p>
          <Button
            variant="primary"
            loading={ocupado}
            onClick={() => void empezar()}
          >
            Activar el segundo factor
          </Button>
        </div>
      )}
    </div>
  );
}
