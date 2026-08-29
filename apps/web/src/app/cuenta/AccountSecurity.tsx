"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, KeyRound, Laptop, ShieldCheck } from "lucide-react";
import { designClient } from "@/lib/cad/repositories/client";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { Button, Surface, buttonClass, cx } from "@/components/ui";
import { MfaEnrollment } from "./MfaEnrollment";
import { describeUserAgent } from "@/lib/user-agent";

/**
 * LA PÁGINA QUE FALTABA.
 *
 * ── EL HUECO QUE LLENA ──────────────────────────────────────────────────────
 * El API llevaba desde el primer día ofreciendo `GET /v1/auth/sessions`, y el
 * SDK tenía las cuatro operaciones de sesión implementadas y tipadas. El web no
 * llamaba a ninguna. Había un producto que sabía decir «éstas son tus sesiones
 * abiertas y puedes cerrar cualquiera» y ningún sitio donde lo dijera.
 *
 * Eso no es una carencia de interfaz: es una carencia de SEGURIDAD. Un usuario
 * que sospecha que alguien entró en su cuenta no tenía forma de comprobarlo ni
 * de expulsarlo, y la única defensa disponible —cambiar la contraseña, que ya
 * revocaba todas las demás sesiones— no estaba escrita en ninguna parte, así
 * que nadie sabía que existía.
 *
 * ── LAS CUATRO COSAS QUE ENSEÑA ─────────────────────────────────────────────
 *   1. Las sesiones abiertas, con su dispositivo aproximado y un botón de
 *      cerrar. La actual marcada, porque cerrar la propia por error asusta.
 *   2. La actividad reciente: inicios de sesión con su método, y los sucesos de
 *      identidad que ya se auditaban. Es lo que responde «¿entró alguien más?».
 *   3. El segundo factor, con su alta completa.
 *   4. Lo que el producto YA hace y nunca decía: cambiar la contraseña cierra
 *      todas las demás sesiones. Una defensa que el usuario no conoce es una
 *      defensa que no usa.
 *
 * ── POR QUÉ NO HAY «CAMBIAR CONTRASEÑA» AQUÍ ────────────────────────────────
 * Porque el API no tiene ese endpoint: la única vía es el enlace por correo, y
 * esta página enlaza a ella en vez de fingir un formulario que no existiría. La
 * regla del repositorio es que no se muestra un botón cuyo comportamiento no
 * esté probado, y eso incluye no insinuarlo.
 */

type Sesion = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
};

type Suceso = {
  id: string;
  action: string;
  createdAt: string;
  method: string | null;
  userAgent: string | null;
};

/** Los sucesos que la auditoría guarda, en el idioma del usuario. */
const ACCION: Record<string, string> = {
  "identity.signed_in": "Inicio de sesión",
  "identity.registered": "Cuenta creada",
  "identity.email_verified": "Correo verificado",
  "identity.password_reset": "Contraseña restablecida",
  "identity.mfa_enabled": "Segundo factor activado",
  "identity.mfa_disabled": "Segundo factor desactivado",
};

const METODO: Record<string, string> = {
  password: "con contraseña",
  totp: "con contraseña y código",
  backup_code: "con un código de respaldo",
};

const ERROR_LECTURA =
  "No se pudo leer el estado de tu cuenta. Actualiza la página o vuelve en un momento.";

const fecha = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function cuando(iso: string): string {
  return fecha.format(new Date(iso));
}

export function AccountSecurity() {
  const auth = useDesignAuth();
  const [sesiones, setSesiones] = useState<Sesion[] | null>(null);
  const [sucesos, setSucesos] = useState<Suceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /**
   * LEER es una función pura de red: pide y DEVUELVE. No escribe estado.
   *
   * Separarlo así no es ceremonia. El efecto de montaje y los tres manejadores
   * necesitan lo mismo —volver a leer— pero en momentos distintos, y una
   * función que además escribiera estado obligaría a llamarla desde el cuerpo
   * del efecto, que es exactamente el patrón que React desaconseja (cascada de
   * renders) y que el linter del repositorio marca. Con la lectura separada, el
   * efecto escribe su propio estado dentro de la promesa y cada manejador
   * escribe el suyo cuando toca.
   *
   * La señal de cancelación arregla además un defecto real: quien cierra una
   * sesión y sale de la página antes de que responda el servidor provocaba un
   * `setState` sobre un componente ya desmontado.
   */
  const leerEstado = useCallback(async () => {
    const [listado, actividad] = await Promise.all([
      designClient.identity.sessions.list(),
      designClient.identity.activity(),
    ]);
    return {
      sesiones: listado.sessions as Sesion[],
      sucesos: actividad.events as Suceso[],
    };
  }, []);

  const recargar = useCallback(async () => {
    try {
      const leido = await leerEstado();
      setSesiones(leido.sesiones);
      setSucesos(leido.sucesos);
      setError(null);
    } catch {
      setError(ERROR_LECTURA);
    }
  }, [leerEstado]);

  useEffect(() => {
    if (!auth.isAuthenticated) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const leido = await leerEstado();
        if (controller.signal.aborted) return;
        setSesiones(leido.sesiones);
        setSucesos(leido.sucesos);
      } catch {
        if (!controller.signal.aborted) setError(ERROR_LECTURA);
      }
    })();
    return () => controller.abort();
  }, [auth.isAuthenticated, leerEstado]);

  async function cerrarSesion(id: string) {
    setOcupado(true);
    try {
      await designClient.identity.sessions.revoke(id);
      await recargar();
    } catch {
      setError("No se pudo cerrar esa sesión.");
    } finally {
      setOcupado(false);
    }
  }

  async function cerrarLasDemas() {
    setOcupado(true);
    try {
      await designClient.identity.sessions.revokeOthers();
      await recargar();
    } catch {
      setError("No se pudieron cerrar las demás sesiones.");
    } finally {
      setOcupado(false);
    }
  }

  if (auth.isLoading) {
    return (
      <Marco>
        <p className="type-body text-muted-foreground">Cargando tu cuenta…</p>
      </Marco>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Marco>
        <p role="alert" className="type-body text-danger-ink">
          Tu sesión expiró.
        </p>
        <Link
          href="/login?returnTo=%2Fcuenta"
          className={cx(buttonClass({ variant: "primary" }), "mt-6")}
        >
          Iniciar sesión
        </Link>
      </Marco>
    );
  }

  // Las revocadas no se listan: son historia, y la pregunta que trae al usuario
  // aquí es «qué está abierto AHORA». La actividad reciente cuenta el pasado.
  const activas = (sesiones ?? []).filter((sesion) => !sesion.revokedAt);
  const otras = activas.filter((sesion) => !sesion.current);

  return (
    <Marco>
      {error ? (
        <p role="alert" className="type-small mb-6 text-danger-ink">
          {error}
        </p>
      ) : null}

      <Seccion
        icon={ShieldCheck}
        numero="01"
        titulo="Segundo factor"
        descripcion="Un código de seis dígitos además de tu contraseña. Es la diferencia entre que te roben la contraseña y que te roben la cuenta."
      >
        <MfaEnrollment />
      </Seccion>

      <Seccion
        icon={Laptop}
        numero="02"
        titulo="Sesiones abiertas"
        descripcion="Cada navegador donde entraste y sigue con acceso. Si ves una que no reconoces, ciérrala."
      >
        {sesiones === null ? (
          <p className="type-small text-muted-foreground">Leyendo…</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {activas.map((sesion) => {
                const dispositivo = describeUserAgent(sesion.userAgent);
                return (
                  <li
                    key={sesion.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="type-small font-medium text-foreground">
                        {dispositivo}
                        {sesion.current ? (
                          <span className="type-micro ml-2 rounded-full bg-success/15 px-2 py-0.5 text-success-ink">
                            Esta sesión
                          </span>
                        ) : null}
                      </p>
                      <p className="type-caption mt-1 text-muted-foreground">
                        Desde el {cuando(sesion.createdAt)} · caduca el{" "}
                        {cuando(sesion.expiresAt)}
                      </p>
                    </div>
                    {sesion.current ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => void cerrarSesion(sesion.id)}
                      >
                        Cerrar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {otras.length > 0 ? (
              <Button
                variant="danger"
                size="sm"
                className="mt-5"
                disabled={ocupado}
                onClick={() => void cerrarLasDemas()}
              >
                Cerrar las otras {otras.length}{" "}
                {otras.length === 1 ? "sesión" : "sesiones"}
              </Button>
            ) : (
              <p className="type-caption mt-4 text-muted-foreground">
                No hay ninguna otra sesión abierta.
              </p>
            )}
          </>
        )}
      </Seccion>

      <Seccion
        icon={Clock}
        numero="03"
        titulo="Actividad reciente"
        descripcion="Los últimos movimientos de tu cuenta. Si alguno no fuiste tú, cambia la contraseña: eso cierra todas las demás sesiones."
      >
        {sucesos === null ? (
          <p className="type-small text-muted-foreground">Leyendo…</p>
        ) : sucesos.length === 0 ? (
          <p className="type-small text-muted-foreground">
            Todavía no hay actividad registrada.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sucesos.map((suceso) => (
              <li key={suceso.id} className="flex gap-4 py-3">
                <span className="type-sheet-number shrink-0 pt-0.5 text-muted-foreground">
                  {cuando(suceso.createdAt)}
                </span>
                <span className="type-small text-foreground">
                  {ACCION[suceso.action] ?? suceso.action}
                  {suceso.method ? ` ${METODO[suceso.method] ?? ""}` : ""}
                  {suceso.userAgent ? (
                    <span className="text-muted-foreground">
                      {" · "}
                      {describeUserAgent(suceso.userAgent)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        icon={KeyRound}
        numero="04"
        titulo="Contraseña"
        descripcion="Se guarda con Argon2id: nunca almacenamos tu contraseña, sólo un derivado del que no se puede volver atrás."
      >
        <p className="type-small text-muted-foreground">
          El cambio se hace por correo, con un enlace de un solo uso que caduca
          en una hora.{" "}
          <strong className="font-semibold text-foreground">
            Al cambiarla se cierran todas tus demás sesiones automáticamente
          </strong>
          , que es exactamente lo que hay que poder hacer cuando sospechas que
          alguien más entró.
        </p>
        <Link
          href="/forgot-password"
          className={cx(buttonClass({ variant: "secondary" }), "mt-5")}
        >
          Cambiar mi contraseña
        </Link>
      </Seccion>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenido"
      className="mx-auto min-h-screen w-full max-w-4xl p-6 md:p-10"
    >
      <header>
        <p className="type-eyebrow flex items-center gap-3 text-primary-ink">
          <span className="type-sheet-number opacity-85">00</span>
          Tu cuenta
        </p>
        <h1 className="type-title mt-4">Seguridad</h1>
        <p className="type-lead mt-4 max-w-2xl text-muted-foreground">
          Quién tiene acceso, desde dónde, y con qué. Todo lo de esta página se
          puede cambiar desde aquí sin escribirle a nadie.
        </p>
      </header>
      <div className="mt-10 space-y-6">{children}</div>
    </main>
  );
}

function Seccion({
  icon: Icon,
  numero,
  titulo,
  descripcion,
  children,
}: {
  icon: typeof ShieldCheck;
  numero: string;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <Surface as="section" padded="lg" texture="corners">
      <header className="flex gap-4">
        <Icon
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 text-primary-ink"
        />
        <div>
          <p className="type-sheet-number text-muted-foreground">{numero}</p>
          <h2 className="type-heading mt-1">{titulo}</h2>
          <p className="type-small mt-2 max-w-2xl text-muted-foreground">
            {descripcion}
          </p>
        </div>
      </header>
      <div className="mt-6 border-t border-border pt-6">{children}</div>
    </Surface>
  );
}
