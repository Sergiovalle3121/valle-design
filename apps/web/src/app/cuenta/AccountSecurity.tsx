"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Download,
  KeyRound,
  Laptop,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import {
  Button,
  Input,
  PasswordField,
  Surface,
  buttonClass,
  cx,
} from "@/components/ui";
import { MfaEnrollment } from "./MfaEnrollment";
import { describeUserAgent } from "@/lib/user-agent";
import { formatRegionDateTime } from "@/lib/cad/region";
import { getClientRegion } from "@/lib/cad/region/client";

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
 * ── LAS CINCO COSAS QUE ENSEÑA ───────────────────────────────────────────────
 *   1. Nombre visible y correo (T-60d). Hasta esta ficha no había ruta: el
 *      nombre se ponía una vez al registrarse y ahí se quedaba, y el correo
 *      no se podía corregir sin escribirle a soporte. Cambiar el correo pide
 *      la contraseña actual y vuelve a poner `emailVerifiedAt` en null — la
 *      cuenta queda con el correo nuevo pero sin verificar hasta confirmarlo.
 *   2. Las sesiones abiertas, con su dispositivo aproximado y un botón de
 *      cerrar. La actual marcada, porque cerrar la propia por error asusta.
 *   3. La actividad reciente: inicios de sesión con su método, y los sucesos de
 *      identidad que ya se auditaban. Es lo que responde «¿entró alguien más?».
 *   4. El segundo factor, con su alta completa.
 *   5. Cambiar la contraseña SIN SALIR DE LA CUENTA (T-60b). Hasta esta ficha
 *      la única vía era el enlace por correo —perder el acceso primero para
 *      poder cambiarla—; el formulario de abajo pide la actual, la cambia, y
 *      cierra todas las demás sesiones automáticamente, que es exactamente lo
 *      que hay que poder hacer cuando sospechas que alguien más entró.
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
  "identity.password_changed": "Contraseña cambiada",
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

const fecha = (d: Date) =>
  formatRegionDateTime(d, getClientRegion(), {
    dateStyle: "medium",
    timeStyle: "short",
  });

function cuando(iso: string): string {
  return fecha(new Date(iso));
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
        icon={UserRound}
        numero="01"
        titulo="Nombre y correo"
        descripcion="Cómo te reconocemos y a dónde te escribimos. Cambiar el correo pide tu contraseña actual y vuelve a pedirte que lo confirmes."
      >
        <CambiarPerfil />
      </Seccion>

      <Seccion
        icon={ShieldCheck}
        numero="02"
        titulo="Segundo factor"
        descripcion="Un código de seis dígitos además de tu contraseña. Es la diferencia entre que te roben la contraseña y que te roben la cuenta."
      >
        <MfaEnrollment />
      </Seccion>

      <Seccion
        icon={Laptop}
        numero="03"
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
        numero="04"
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
        numero="05"
        titulo="Contraseña"
        descripcion="Se guarda con Argon2id: nunca almacenamos tu contraseña, sólo un derivado del que no se puede volver atrás."
      >
        <CambiarContrasena />
        <p className="type-caption mt-4 text-muted-foreground">
          ¿No recuerdas la actual?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-primary-ink underline underline-offset-4 hover:text-foreground"
          >
            Restablécela por correo
          </Link>
          .
        </p>
      </Seccion>

      <Seccion
        icon={Download}
        numero="06"
        titulo="Tus datos"
        descripcion="Descarga lo que sabemos de tu cuenta: perfil, sesiones (sin IP), organizaciones a las que perteneces, estado del segundo factor y actividad reciente. Nunca tu contraseña ni secretos de MFA."
      >
        <ExportarDatos />
      </Seccion>
    </Marco>
  );
}

/**
 * T-62(c): el derecho ARCO mínimo indiscutible. El archivo se arma en el
 * NAVEGADOR a partir de la respuesta JSON — no hay ruta de descarga en el
 * servidor que sirva un archivo, así que no hace falta inventar un
 * `Content-Disposition` ni un tipo MIME especial en el API.
 */
function ExportarDatos() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setOcupado(true);
    setError(null);
    try {
      const datos = await designClient.identity.exportPersonalData();
      const blob = new Blob([JSON.stringify(datos, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `valle-design-datos-personales-${new Date().toISOString().slice(0, 10)}.json`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar la descarga. Vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="type-small mb-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      <Button
        variant="secondary"
        loading={ocupado}
        onClick={() => void descargar()}
      >
        Descargar mis datos (JSON)
      </Button>
    </div>
  );
}

/**
 * T-60d: nombre visible y correo. Igual que `CambiarContrasena`, su propio
 * estado — no el de `AccountSecurity` — porque son formularios independientes
 * que no deben deshabilitarse entre sí.
 *
 * `currentPassword` sólo se envía si `email` cambió: el campo se muestra
 * siempre (nadie sabe de antemano si va a tocar el correo) pero queda vacío
 * y sin enviar cuando sólo se cambia el nombre, que es la ruta que NO exige
 * contraseña en el servidor (`IdentityService.updateProfile`).
 */
function CambiarPerfil() {
  const auth = useDesignAuth();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const correoActual = auth.user?.email ?? "";

  async function guardar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const currentPassword = String(form.get("currentPassword") ?? "");
    const cambiaCorreo = email.length > 0 && email !== correoActual;
    setOcupado(true);
    setError(null);
    setExito(null);
    try {
      const resultado = await designClient.identity.updateProfile({
        displayName: displayName.length > 0 ? displayName : null,
        ...(cambiaCorreo ? { email, currentPassword } : {}),
      });
      await auth.refresh();
      setExito(
        resultado.emailChangePending
          ? "Guardado. Te mandamos un correo al nuevo buzón para confirmarlo."
          : "Guardado.",
      );
      const passwordField =
        event.currentTarget.elements.namedItem("currentPassword");
      if (passwordField instanceof HTMLInputElement) passwordField.value = "";
    } catch (cause) {
      setError(
        cause instanceof DesignApiError && cause.status === 401
          ? "Contraseña actual incorrecta."
          : cause instanceof DesignApiError && cause.status === 409
            ? "Ese correo ya pertenece a otra cuenta."
            : "No se pudo guardar. Vuelve a intentarlo.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={guardar} className="max-w-sm space-y-4">
      {exito ? (
        <p role="status" className="type-small text-success-ink">
          {exito}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-small text-danger-ink">
          {error}
        </p>
      ) : null}
      <Input
        label="Nombre visible"
        name="displayName"
        autoComplete="name"
        maxLength={160}
        defaultValue={auth.user?.displayName ?? ""}
      />
      <Input
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={correoActual}
      />
      <PasswordField
        label="Contraseña actual"
        name="currentPassword"
        autoComplete="current-password"
        hint="Sólo hace falta si cambias el correo."
      />
      <Button type="submit" variant="secondary" loading={ocupado}>
        Guardar
      </Button>
    </form>
  );
}

/**
 * T-60b: el formulario en sí. Vive aparte de `AccountSecurity` por la misma
 * razón que `MfaEnrollment` — su estado (ocupado, error, éxito) es del
 * FORMULARIO, no de la página, y mezclarlo con el `ocupado` de sesiones
 * haría que cerrar una sesión deshabilitara este botón sin motivo.
 */
function CambiarContrasena() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function cambiar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    setOcupado(true);
    setError(null);
    setExito(false);
    try {
      await designClient.identity.changePassword({
        currentPassword,
        newPassword,
      });
      setExito(true);
      event.currentTarget.reset();
    } catch (cause) {
      setError(
        cause instanceof DesignApiError && cause.status === 401
          ? "Contraseña actual incorrecta."
          : "No se pudo cambiar la contraseña. Vuelve a intentarlo.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={cambiar} className="max-w-sm space-y-4">
      {exito ? (
        <p role="status" className="type-small text-success-ink">
          Contraseña cambiada. Tus demás sesiones se cerraron; ésta sigue
          abierta.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-small text-danger-ink">
          {error}
        </p>
      ) : null}
      <PasswordField
        label="Contraseña actual"
        name="currentPassword"
        autoComplete="current-password"
        required
      />
      <PasswordField
        label="Contraseña nueva"
        name="newPassword"
        autoComplete="new-password"
        showStrength
        required
        hint="Mínimo 12 caracteres."
      />
      <Button type="submit" variant="secondary" loading={ocupado}>
        Cambiar mi contraseña
      </Button>
    </form>
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
