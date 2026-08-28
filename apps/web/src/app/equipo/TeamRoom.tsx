"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Users } from "lucide-react";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { Button, Select, Surface, Textarea, buttonClass, cx } from "@/components/ui";
import { parseRoster, rosterRejectionText, ROSTER_MAX } from "@/lib/education/roster";

/**
 * EL EQUIPO — la pantalla que el backend llevaba meses esperando.
 *
 * ── EL HUECO, QUE ES EL MISMO QUE TENÍA LA CUENTA ───────────────────────────
 * `GET /v1/organizations/:id/memberships` y `POST .../invitations` existen,
 * están probados, tienen su control de asientos y su correo transaccional, y el
 * SDK los expone tipados. El web NO llamaba a ninguno de los dos. Es decir: el
 * producto sabía invitar a alguien a una organización y no había ni un solo
 * sitio donde hacerlo. Es exactamente el mismo hallazgo de la ola 2 con las
 * sesiones, y tiene la misma consecuencia: `/educacion` afirmaba «invitas a tus
 * alumnos por correo» y era verdad del backend y mentira de la interfaz.
 *
 * ── POR QUÉ PEGAR LA LISTA ES LA FUNCIÓN, NO UN ADORNO ──────────────────────
 * Un profesor no escribe su grupo: lo tiene, en una hoja o en un correo. Un
 * formulario de un correo por vez convierte treinta alumnos en treinta gestos
 * idénticos, y ahí es donde se abandona. `lib/education/roster.ts` acepta las
 * formas que llegan de verdad (comas, líneas, `Nombre <correo>`, columnas con
 * tabulador), quita duplicados y DEVUELVE los descartes con su motivo.
 *
 * ── LAS INVITACIONES SE MANDAN DE UNA EN UNA, A PROPÓSITO ───────────────────
 * No hay endpoint de lote y no se inventa uno aquí. Se llama al que existe, en
 * serie, y cada fila muestra su resultado. En serie y no en paralelo por dos
 * razones que se notan: el límite de asientos se comprueba en el servidor y
 * treinta peticiones simultáneas contra ese límite producen un reparto
 * arbitrario de quién entra; y una ráfaga desde el navegador es indistinguible
 * de un abuso.
 *
 * Lo que un endpoint de lote añadiría —atomicidad y un solo veredicto de
 * asientos— está escrito en el informe de la campaña como lo que es: trabajo
 * pendiente, no algo que esta pantalla finja tener.
 *
 * ── EL LÍMITE DE ASIENTOS NO SE ESCONDE ─────────────────────────────────────
 * Cuando el servidor responde 409 se para el envío y se dice cuántas quedaron
 * sin mandar. Seguir intentando las veinte restantes contra un límite que ya
 * dijo que no es regalarle al usuario veinte errores idénticos.
 */

type Membresia = {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  currentUser: boolean;
  createdAt: string;
};

type Organizacion = {
  id: string;
  name: string;
  role: string;
};

type ResultadoInvitacion = {
  email: string;
  estado: "enviada" | "error";
  detalle?: string;
};

const PAPEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
  viewer: "Observador",
};

const QUE_PUEDE: Record<string, string> = {
  owner: "Todo, incluida la facturación y el cierre de la organización.",
  admin: "Invitar, gestionar documentos y publicar. No toca la facturación.",
  member: "Dibujar, editar y comentar los planos de la organización.",
  viewer: "Ver y comentar. No puede modificar el plano.",
};

const ERROR_LECTURA =
  "No se pudo leer tu equipo. Actualiza la página o vuelve en un momento.";

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

export function TeamRoom() {
  const auth = useDesignAuth();
  const [organizacion, setOrganizacion] = useState<Organizacion | null>(null);
  const [miembros, setMiembros] = useState<Membresia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState("");
  const [papel, setPapel] = useState("member");
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoInvitacion[] | null>(null);

  /** Leer es una función pura de red: pide y devuelve, no escribe estado. */
  const leerEquipo = useCallback(async () => {
    const listado = await designClient.organizations.list();
    const activa =
      listado.items.find((item) => item.id === auth.organizationId) ??
      listado.items[0];
    if (!activa) return { organizacion: null, miembros: [] as Membresia[] };
    const membresias = await designClient.organizations.memberships(activa.id);
    return {
      organizacion: {
        id: activa.id,
        name: activa.name,
        role: activa.role,
      } as Organizacion,
      miembros: membresias.items as Membresia[],
    };
  }, [auth.organizationId]);

  const recargar = useCallback(async () => {
    try {
      const leido = await leerEquipo();
      setOrganizacion(leido.organizacion);
      setMiembros(leido.miembros);
      setError(null);
    } catch {
      setError(ERROR_LECTURA);
    }
  }, [leerEquipo]);

  useEffect(() => {
    if (!auth.isAuthenticated) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const leido = await leerEquipo();
        if (controller.signal.aborted) return;
        setOrganizacion(leido.organizacion);
        setMiembros(leido.miembros);
      } catch {
        if (!controller.signal.aborted) setError(ERROR_LECTURA);
      }
    })();
    return () => controller.abort();
  }, [auth.isAuthenticated, leerEquipo]);

  const analisis = parseRoster(lista);
  const puedeInvitar =
    organizacion !== null && ["owner", "admin"].includes(organizacion.role);

  async function invitar() {
    if (!organizacion || analisis.emails.length === 0) return;
    setEnviando(true);
    setResultados(null);
    const hechos: ResultadoInvitacion[] = [];
    try {
      for (const [indice, email] of analisis.emails.entries()) {
        try {
          await designClient.organizations.invitations.create(organizacion.id, {
            email,
            role: papel as "admin" | "member" | "viewer",
          });
          hechos.push({ email, estado: "enviada" });
        } catch (fallo) {
          const api = fallo instanceof DesignApiError ? fallo : null;
          hechos.push({
            email,
            estado: "error",
            detalle: api?.message ?? "No se pudo enviar.",
          });
          // 409 es el límite de asientos: seguir intentando las restantes sólo
          // produce el mismo error repetido.
          if (api?.status === 409) {
            const restantes = analisis.emails.length - indice - 1;
            if (restantes > 0) {
              hechos.push({
                email: `y ${restantes} más`,
                estado: "error",
                detalle: "sin enviar: no quedan asientos disponibles",
              });
            }
            break;
          }
        }
      }
    } finally {
      setResultados(hechos);
      setEnviando(false);
      setLista("");
      await recargar();
    }
  }

  if (auth.isLoading) {
    return (
      <Marco>
        <p className="type-body text-muted-foreground">Cargando tu equipo…</p>
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
          href="/login?returnTo=%2Fequipo"
          className={cx(buttonClass({ variant: "primary" }), "mt-6")}
        >
          Iniciar sesión
        </Link>
      </Marco>
    );
  }

  return (
    <Marco>
      {error ? (
        <p role="alert" className="type-small mb-6 text-danger-ink">
          {error}
        </p>
      ) : null}

      {organizacion === null ? (
        <Surface as="section" padded="lg" texture="corners">
          <h2 className="type-heading">Todavía no tienes una organización</h2>
          <p className="type-small mt-3 max-w-2xl text-muted-foreground">
            La organización es lo que comparte los planos: un despacho, un
            estudio o el taller de una asignatura. Se crea desde el panel y
            después esta página sirve para llenarla.
          </p>
          <Link
            href="/dashboard"
            className={cx(buttonClass({ variant: "primary" }), "mt-6")}
          >
            Ir al panel
          </Link>
        </Surface>
      ) : (
        <>
          <Seccion
            icon={Users}
            numero="01"
            titulo={`Quién está en ${organizacion.name}`}
            descripcion="Los papeles se deciden en el servidor: quien mira no puede modificar el plano aunque encuentre el botón."
          >
            {miembros === null ? (
              <p className="type-small text-muted-foreground">Cargando…</p>
            ) : (
              <ul className="divide-y divide-border">
                {miembros.map((miembro) => (
                  <li
                    key={miembro.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                  >
                    <span className="type-small text-foreground">
                      {miembro.displayName ?? miembro.email}
                      {miembro.currentUser ? (
                        <span className="ml-2 type-micro text-primary-ink">
                          tú
                        </span>
                      ) : null}
                    </span>
                    <span className="type-micro text-muted-foreground">
                      {PAPEL[miembro.role] ?? miembro.role} · desde{" "}
                      {fecha.format(new Date(miembro.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion
            icon={ClipboardList}
            numero="02"
            titulo="Invitar pegando la lista"
            descripcion="Pega la lista de tu grupo tal y como la tengas: separada por comas, una por línea, o con el nombre delante del correo. Se limpia sola y te dice qué no entendió."
          >
            {puedeInvitar ? (
              <div className="space-y-5">
                <Textarea
                  label="Correos"
                  rows={6}
                  value={lista}
                  onChange={(evento) => setLista(evento.target.value)}
                  placeholder={"ana@alumnos.uni.mx, luis@alumnos.uni.mx\nAna Ruiz <ana@uni.mx>"}
                  hint={`Hasta ${ROSTER_MAX} de una vez. Cada persona recibe un enlace que caduca en siete días.`}
                />

                <Select
                  label="Con qué papel entran"
                  value={papel}
                  onChange={(evento) => setPapel(evento.target.value)}
                  hint={QUE_PUEDE[papel]}
                >
                  <option value="member">Miembro</option>
                  <option value="viewer">Observador</option>
                  <option value="admin">Administrador</option>
                </Select>

                {/*
                  El recuento se calcula MIENTRAS se escribe y antes de mandar
                  nada. Enterarse de que dos líneas están rotas después de
                  mandar veintiocho invitaciones no sirve de nada.
                */}
                {lista.trim() ? (
                  <div className="rounded-control border border-border bg-muted/30 p-4">
                    <p className="type-small text-foreground">
                      <span className="type-numeric font-semibold">
                        {analisis.emails.length}
                      </span>{" "}
                      {analisis.emails.length === 1
                        ? "invitación lista"
                        : "invitaciones listas"}
                      {analisis.truncated > 0
                        ? ` · ${analisis.truncated} por encima del tope, no se mandarán`
                        : ""}
                    </p>
                    {analisis.rejected.length > 0 ? (
                      <ul className="mt-3 space-y-1">
                        {analisis.rejected.map((descarte, indice) => (
                          <li
                            key={`${descarte.raw}-${indice}`}
                            className="type-micro text-muted-foreground"
                          >
                            <span className="text-warning-ink">
                              {descarte.raw}
                            </span>{" "}
                            — {rosterRejectionText(descarte.reason)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <Button
                  variant="primary"
                  onClick={() => void invitar()}
                  disabled={enviando || analisis.emails.length === 0}
                >
                  {enviando
                    ? "Enviando…"
                    : `Invitar a ${analisis.emails.length}`}
                </Button>

                {resultados ? (
                  <div role="status" className="rounded-control border border-border p-4">
                    <p className="type-small font-semibold text-foreground">
                      {resultados.filter((r) => r.estado === "enviada").length}{" "}
                      enviadas
                    </p>
                    <ul className="mt-3 space-y-1">
                      {resultados.map((resultado, indice) => (
                        <li
                          key={`${resultado.email}-${indice}`}
                          className="type-micro text-muted-foreground"
                        >
                          <span
                            className={
                              resultado.estado === "enviada"
                                ? "text-success-ink"
                                : "text-danger-ink"
                            }
                          >
                            {resultado.email}
                          </span>
                          {resultado.detalle ? ` — ${resultado.detalle}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="type-small text-muted-foreground">
                Sólo el propietario y los administradores pueden invitar. Es una
                regla del servidor, no de esta pantalla: pedírselo a quien puede
                es más rápido que buscar la forma de saltársela.
              </p>
            )}
          </Seccion>
        </>
      )}
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
          <span className="type-sheet-number opacity-60">00</span>
          Tu equipo
        </p>
        <h1 className="type-title mt-4">Quién dibuja contigo</h1>
        <p className="type-lead mt-4 max-w-2xl text-muted-foreground">
          Un despacho, un estudio o el taller de una asignatura: la organización
          es lo que comparte los planos, y esta página es donde se llena.
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
  icon: typeof Users;
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
