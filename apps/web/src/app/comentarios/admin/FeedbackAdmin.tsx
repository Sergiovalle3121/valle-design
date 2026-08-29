"use client";

import { useCallback, useEffect, useState } from "react";
import { designClient } from "@/lib/cad/repositories/client";
import { Button, Select, Surface, cx } from "@/components/ui";

/**
 * EL PANEL DE QUIEN OPERA EL PRODUCTO.
 *
 * ── QUÉ ES ──────────────────────────────────────────────────────────────────
 * La materia prima del backlog real: todo lo que la gente escribe desde dentro
 * del producto, de todas las organizaciones, en una lista que se puede filtrar y
 * clasificar en cuatro estados. Es deliberadamente mínimo — el dueño pidió «una
 * vista de administración mínima», y para una lista que revisa una persona una
 * vez por semana, mínima es exactamente la talla correcta.
 *
 * ── LA PUERTA ───────────────────────────────────────────────────────────────
 * El servidor decide, no esta página. Quien no esté en `PRODUCT_OPERATOR_EMAILS`
 * recibe un 403 y aquí sólo ve el aviso correspondiente. Es importante que sea
 * así y no al revés: una pantalla que se esconde en el cliente pero cuyo
 * endpoint responde a todo el mundo no es una puerta, es una cortina.
 *
 * ── LO QUE NO TIENE, Y POR QUÉ ──────────────────────────────────────────────
 * Ni paginación, ni búsqueda, ni exportación. Con un tope de 500 filas y un
 * producto que acaba de abrir, las tres serían código que hay que mantener para
 * un problema que todavía no existe. Cuando la lista no quepa en una pantalla,
 * el propio uso dirá cuál de las tres hace falta primero.
 */

type Comentario = {
  id: string;
  kind: "falla" | "sugerencia" | "duda";
  message: string;
  status: "nuevo" | "leido" | "planeado" | "resuelto";
  createdAt: string;
  authorEmail: string;
  organizationId: string | null;
  context: Record<string, unknown> | null;
};

const ESTADOS = ["nuevo", "leido", "planeado", "resuelto"] as const;
const CLASES = ["falla", "sugerencia", "duda"] as const;

const ETIQUETA_ESTADO: Record<Comentario["status"], string> = {
  nuevo: "Nuevo",
  leido: "Leído",
  planeado: "Planeado",
  resuelto: "Resuelto",
};

const COLOR_ESTADO: Record<Comentario["status"], string> = {
  nuevo: "bg-muted text-foreground",
  leido: "bg-primary/15 text-primary-ink",
  planeado: "bg-warning/15 text-warning-ink",
  resuelto: "bg-success/15 text-success-ink",
};

const fecha = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function FeedbackAdmin() {
  const [items, setItems] = useState<Comentario[] | null>(null);
  const [estado, setEstado] = useState("");
  const [clase, setClase] = useState("");
  const [denegado, setDenegado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(
    async (filtro: { status?: string; kind?: string }) =>
      (await designClient.feedback.all(filtro)).items as Comentario[],
    [],
  );

  const recargar = useCallback(async () => {
    try {
      setItems(
        await leer({ status: estado || undefined, kind: clase || undefined }),
      );
      setDenegado(false);
      setError(null);
    } catch (causa) {
      // 403 no es un error que haya que disculpar: es la puerta funcionando.
      if ((causa as { status?: number }).status === 403) setDenegado(true);
      else setError("No se pudieron leer los comentarios.");
    }
  }, [clase, estado, leer]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const leidos = await leer({
          status: estado || undefined,
          kind: clase || undefined,
        });
        if (!controller.signal.aborted) {
          setItems(leidos);
          setDenegado(false);
        }
      } catch (causa) {
        if (controller.signal.aborted) return;
        if ((causa as { status?: number }).status === 403) setDenegado(true);
        else setError("No se pudieron leer los comentarios.");
      }
    })();
    return () => controller.abort();
  }, [clase, estado, leer]);

  async function cambiarEstado(id: string, siguiente: string) {
    try {
      await designClient.feedback.setStatus(id, siguiente);
      await recargar();
    } catch {
      setError("No se pudo cambiar el estado.");
    }
  }

  if (denegado) {
    return (
      <Marco>
        <Surface padded="lg">
          <p className="type-heading">
            Esta vista es para quien opera Valle Design
          </p>
          <p className="type-body mt-3 text-muted-foreground">
            Si deberías tener acceso, tu correo tiene que estar en la lista de
            operadores del despliegue. Se configura fuera del producto a
            propósito: concederlo desde dentro sería concederlo a quien entre en
            cualquier cuenta de administrador.
          </p>
        </Surface>
      </Marco>
    );
  }

  return (
    <Marco>
      <div className="mb-8 flex flex-wrap items-end gap-4">
        <Select
          label="Estado"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
          wrapperClassName="w-48"
        >
          <option value="">Todos</option>
          {ESTADOS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ESTADO[valor]}
            </option>
          ))}
        </Select>
        <Select
          label="Clase"
          value={clase}
          onChange={(event) => setClase(event.target.value)}
          wrapperClassName="w-48"
        >
          <option value="">Todas</option>
          {CLASES.map((valor) => (
            <option key={valor} value={valor}>
              {valor}
            </option>
          ))}
        </Select>
        {items ? (
          <p className="type-small text-muted-foreground">
            <span className="type-numeric font-semibold text-foreground">
              {items.length}
            </span>{" "}
            {items.length === 1 ? "comentario" : "comentarios"}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="type-small mb-6 text-danger-ink">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="type-body text-muted-foreground">Leyendo…</p>
      ) : items.length === 0 ? (
        <p className="type-body text-muted-foreground">Nada con ese filtro.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((comentario) => (
            <li key={comentario.id}>
              <Surface padded="sm" as="article">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cx(
                        "type-micro rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.06em]",
                        COLOR_ESTADO[comentario.status],
                      )}
                    >
                      {ETIQUETA_ESTADO[comentario.status]}
                    </span>
                    <span className="type-caption text-muted-foreground">
                      {comentario.kind} · {comentario.authorEmail} ·{" "}
                      {fecha.format(new Date(comentario.createdAt))}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {ESTADOS.filter((valor) => valor !== comentario.status).map(
                      (valor) => (
                        <Button
                          key={valor}
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            void cambiarEstado(comentario.id, valor)
                          }
                        >
                          {ETIQUETA_ESTADO[valor]}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
                <p className="type-body mt-3 whitespace-pre-wrap text-foreground">
                  {comentario.message}
                </p>
                {comentario.context ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-1 type-caption text-muted-foreground sm:grid-cols-2">
                    {Object.entries(comentario.context).map(
                      ([campo, valor]) => (
                        <div key={campo} className="flex gap-2">
                          <dt className="type-mono shrink-0">{campo}</dt>
                          <dd className="type-mono truncate">
                            {String(valor)}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                ) : null}
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenido"
      className="mx-auto min-h-screen w-full max-w-5xl p-6 md:p-10"
    >
      <header className="mb-10">
        <p className="type-eyebrow flex items-center gap-3 text-primary-ink">
          <span className="type-sheet-number opacity-85">00</span>
          Operación
        </p>
        <h1 className="type-title mt-4">Comentarios del producto</h1>
        <p className="type-lead mt-3 max-w-2xl text-muted-foreground">
          Todo lo que la gente escribe desde dentro del producto, de todas las
          organizaciones. Clasificar un comentario aquí es lo que su autor ve en
          su lista.
        </p>
      </header>
      {children}
    </main>
  );
}
