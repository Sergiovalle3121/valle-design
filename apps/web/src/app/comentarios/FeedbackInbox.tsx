"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { designClient } from "@/lib/cad/repositories/client";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { FeedbackButton } from "@/components/feedback/FeedbackDialog";
import { Surface, buttonClass, cx } from "@/components/ui";

/**
 * MIS COMENTARIOS — la mitad del canal que casi nadie construye.
 *
 * ── POR QUÉ ESTA PÁGINA ES EL PRODUCTO, NO UN EXTRA ─────────────────────────
 * Recoger comentarios es fácil: un formulario y un correo. Lo difícil —y lo que
 * decide si el canal sigue vivo dentro de seis meses— es DEVOLVER algo. Quien
 * escribe una sugerencia y nunca vuelve a saber de ella aprende que escribir no
 * sirve, y deja de hacerlo. El dueño lo dijo con todas las letras: «que se
 * sienta escuchado es el punto».
 *
 * Así que aquí no hay una lista de lo que enviaste: hay una lista de lo que
 * enviaste CON SU ESTADO. «Leído» ya es una respuesta. «Planeado» es una
 * promesa. «Resuelto» es una razón para volver a escribir la próxima vez.
 *
 * ── LO QUE NO PROMETE ───────────────────────────────────────────────────────
 * No hay fechas, ni votos, ni un hueco donde el equipo escriba una réplica. Las
 * tres cosas parecen mejoras y las tres son deuda: una fecha se incumple, los
 * votos convierten el canal en un concurso, y un hilo de conversación exige a
 * alguien contestarlo todos los días o se ve peor que no tenerlo. Cuatro
 * estados, honestos, y ya.
 */

type Comentario = {
  id: string;
  kind: "falla" | "sugerencia" | "duda";
  message: string;
  status: "nuevo" | "leido" | "planeado" | "resuelto";
  createdAt: string;
};

const CLASE: Record<Comentario["kind"], string> = {
  falla: "Algo no funciona",
  sugerencia: "Sugerencia",
  duda: "Duda",
};

/** El estado, con lo que SIGNIFICA para quien escribió. */
const ESTADO: Record<
  Comentario["status"],
  { etiqueta: string; explicacion: string; clase: string }
> = {
  nuevo: {
    etiqueta: "Enviado",
    explicacion: "Está en la cola. Todavía no lo hemos leído.",
    clase: "bg-muted text-muted-foreground",
  },
  leido: {
    etiqueta: "Leído",
    explicacion: "Alguien lo leyó y lo entendió. Sin decisión todavía.",
    clase: "bg-primary/15 text-primary-ink",
  },
  planeado: {
    etiqueta: "Planeado",
    explicacion:
      "Va a hacerse. No prometemos fecha, pero está en la cola real.",
    clase: "bg-warning/15 text-warning-ink",
  },
  resuelto: {
    etiqueta: "Resuelto",
    explicacion: "Hecho, o cerrado con una razón.",
    clase: "bg-success/15 text-success-ink",
  },
};

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });

export function FeedbackInbox() {
  const auth = useDesignAuth();
  const [items, setItems] = useState<Comentario[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(
    async () => (await designClient.feedback.mine()).items as Comentario[],
    [],
  );

  useEffect(() => {
    if (!auth.isAuthenticated) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const leidos = await leer();
        if (!controller.signal.aborted) setItems(leidos);
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudieron leer tus comentarios ahora mismo.");
        }
      }
    })();
    return () => controller.abort();
  }, [auth.isAuthenticated, leer]);

  if (auth.isLoading) {
    return (
      <Marco>
        <p className="type-body text-muted-foreground">Cargando…</p>
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
          href="/login?returnTo=%2Fcomentarios"
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
        <p role="alert" className="type-small text-danger-ink">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="type-body text-muted-foreground">Leyendo…</p>
      ) : items.length === 0 ? (
        <Surface padded="lg" texture="grid" className="text-center">
          <p className="type-heading">Todavía no nos has contado nada</p>
          <p className="type-body mx-auto mt-3 max-w-lg text-muted-foreground">
            Si algo no funciona, si se te ocurre una mejora o si no encuentras
            cómo hacer algo, escríbenos desde aquí. Lo leemos todo y verás el
            estado de cada comentario en esta misma página.
          </p>
          <FeedbackButton className="mt-6" />
        </Surface>
      ) : (
        <ul className="space-y-4">
          {items.map((comentario) => {
            const estado = ESTADO[comentario.status];
            return (
              <li key={comentario.id}>
                <Surface padded="sm" as="article">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cx(
                        "type-micro rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.06em]",
                        estado.clase,
                      )}
                    >
                      {estado.etiqueta}
                    </span>
                    <span className="type-caption text-muted-foreground">
                      {CLASE[comentario.kind]} ·{" "}
                      <time dateTime={comentario.createdAt}>
                        {fecha.format(new Date(comentario.createdAt))}
                      </time>
                    </span>
                  </div>
                  <p className="type-body mt-3 whitespace-pre-wrap text-foreground">
                    {comentario.message}
                  </p>
                  <p className="type-caption mt-3 text-muted-foreground">
                    {estado.explicacion}
                  </p>
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenido"
      className="mx-auto min-h-screen w-full max-w-3xl p-6 md:p-10"
    >
      <header className="mb-10">
        <p className="type-eyebrow flex items-center gap-3 text-primary-ink">
          <span className="type-sheet-number opacity-60">00</span>
          Tu cuenta
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-title">Mis comentarios</h1>
            <p className="type-lead mt-3 max-w-xl text-muted-foreground">
              Lo que nos has contado y en qué punto está. Cada estado quiere
              decir algo concreto, y ninguno es un acuse de recibo automático.
            </p>
          </div>
          <FeedbackButton />
        </div>
      </header>
      {children}
    </main>
  );
}
