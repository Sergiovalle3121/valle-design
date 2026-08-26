"use client";

/**
 * Los hilos de comentario del documento, contra el servidor.
 *
 * ## Una sola fuente, dos superficies
 *
 * El estudio del autor y la página del invitado leen y escriben por aquí. Lo
 * que cambia entre ellos es el PUERTO (`CadCommentSource`): el autor usa la
 * superficie con sesión y permiso `cad:review`; el invitado, la del review
 * link, que el backend acota a UN documento. El componente de hilos no sabe
 * cuál de las dos tiene detrás, y por eso los dos lados se comportan igual.
 *
 * ## Por qué SONDEO y no tiempo real
 *
 * Porque no hay canal en vivo en la API —ni WebSocket ni SSE, comprobado— y
 * fingirlo con un `setInterval` disfrazado de suscripción sería mentir sobre
 * la latencia. El sondeo es explícito, se para cuando la pestaña no se ve
 * (`visibilitychange`) para no cobrarle batería a nadie por una pestaña de
 * fondo, y se refresca de inmediato al volver. El comentario propio no espera
 * al sondeo: se aplica en cuanto responde el POST.
 *
 * ## Por qué la lectura y la escritura del estado están separadas
 *
 * `fetchThreads` sólo trae datos y `apply` sólo escribe estado. Así el efecto
 * puede escribir DESPUÉS del `await` —nunca en su cuerpo síncrono, que es lo
 * que dispara renders en cascada— y el mismo camino de datos sirve para el
 * sondeo, para el refresco manual y para el POST, sin tres copias.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CadComment } from "@valle/design-sdk";
import { DesignApiError } from "@/lib/cad/repositories/client";
import {
  readCadCommentAnchor,
  type CadCommentAnchorPoint,
  type CadCommentAnchorRead,
} from "@/lib/cad/collab/comment-anchor";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Techo defensivo sobre `retryAfterSeconds`: el servidor ya lo acota a un
 * entero ≥1 (VD-RL-001), pero una interfaz interactiva no debe quedar
 * esperando un valor inesperadamente grande sin decírselo al usuario.
 */
const MAX_RATE_LIMIT_WAIT_MS = 65_000;

/** Cada cuánto se relee el hilo mientras la pestaña está a la vista. */
export const CAD_COMMENTS_POLL_MS = 5_000;

const EMPTY: CadCommentThread[] = [];

export interface CadCommentSource {
  list(): Promise<{ items: CadComment[] }>;
  create(input: {
    body: string;
    anchor?: CadCommentAnchorPoint | null;
  }): Promise<CadComment>;
  resolve(commentId: string): Promise<CadComment>;
}

export interface CadCommentThread {
  id: string;
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  /** Lectura del ancla, con sus tres estados. Nunca una posición inventada. */
  anchor: CadCommentAnchorRead;
  /** Posición en el hilo (1..n): es el número que se pinta en la chincheta. */
  ordinal: number;
}

/** Resultado de una lectura: o los hilos, o el motivo por el que no hay. */
type Pull =
  | { ok: true; threads: CadCommentThread[] }
  | { ok: false; message: string }
  | { ok: "skipped" };

export interface CadCommentsState {
  threads: CadCommentThread[];
  /** Mensaje de error legible, o null. */
  error: string | null;
  busy: boolean;
  refresh: () => void;
  create: (body: string, anchor: CadCommentAnchorPoint | null) => Promise<boolean>;
  resolve: (commentId: string) => Promise<boolean>;
}

export function useCadComments(
  source: CadCommentSource | null,
  options: { pollMs?: number } = {},
): CadCommentsState {
  const pollMs = options.pollMs ?? CAD_COMMENTS_POLL_MS;
  const [threads, setThreads] = useState<CadCommentThread[]>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // El puerto se guarda en una ref para que recrearlo en el render del padre
  // no reinicie el sondeo: un intervalo que se reinicia cada render no es un
  // sondeo, es una tormenta de peticiones. Se sincroniza en un efecto propio,
  // declarado ANTES del que sondea para que ése ya lea el valor nuevo.
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const fetchThreads = useCallback(async (): Promise<Pull> => {
    const current = sourceRef.current;
    if (!current) return { ok: "skipped" };
    try {
      const page = await current.list();
      return { ok: true, threads: toThreads(page.items) };
    } catch (cause) {
      return { ok: false, message: messageOf(cause, "No pudimos leer los comentarios.") };
    }
  }, []);

  const apply = useCallback((pull: Pull) => {
    if (pull.ok === "skipped") return;
    if (pull.ok) {
      setThreads(pull.threads);
      setError(null);
      return;
    }
    setError(pull.message);
  }, []);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    // Cada lectura escribe sólo DESPUÉS del await, y sólo si sigue vigente:
    // una respuesta lenta no puede pisar a una posterior ni a un desmontaje.
    const pull = async () => {
      const result = await fetchThreads();
      if (!cancelled) apply(result);
    };
    void pull();

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void pull(), pollMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pull();
        start();
      } else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [apply, fetchThreads, pollMs, source]);

  const create = useCallback(
    async (body: string, anchor: CadCommentAnchorPoint | null) => {
      const current = sourceRef.current;
      const text = body.trim();
      // Fallo cerrado en el cliente también: un comentario vacío no viaja para
      // que el servidor lo rechace; se impide antes, con el motivo delante.
      if (!current || !text) {
        setError("El comentario no puede estar vacío.");
        return false;
      }
      setBusy(true);
      try {
        await createWithRateLimitRetry(current, { body: text, anchor }, setError);
        setError(null);
        // Relee: el servidor es quien ordena el hilo y quien decide el número
        // de cada chincheta si mientras tanto entró otro comentario.
        apply(await fetchThreads());
        return true;
      } catch (cause) {
        setError(messageOf(cause, "No pudimos guardar el comentario."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply, fetchThreads],
  );

  const resolve = useCallback(
    async (commentId: string) => {
      const current = sourceRef.current;
      if (!current) return false;
      setBusy(true);
      try {
        await current.resolve(commentId);
        setError(null);
        apply(await fetchThreads());
        return true;
      } catch (cause) {
        setError(messageOf(cause, "No pudimos marcar el comentario."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply, fetchThreads],
  );

  const refresh = useCallback(() => {
    void fetchThreads().then(apply);
  }, [apply, fetchThreads]);

  return {
    // Sin puerto no hay hilos que enseñar. Se DERIVA en vez de vaciarlos con
    // un `setState` al desmontar: así no queda un fotograma con los hilos del
    // documento anterior sobre el documento nuevo.
    threads: source ? threads : EMPTY,
    error: source ? error : null,
    busy,
    refresh,
    create,
    resolve,
  };
}

function toThreads(items: readonly CadComment[]): CadCommentThread[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  unique.sort((left, right) => {
    const byDate = String(left.createdAt).localeCompare(String(right.createdAt));
    return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
  });
  return unique.map((item, index) => ({
    id: item.id,
    author: item.author || "anónimo",
    body: item.body,
    resolved: !!item.resolved,
    createdAt: String(item.createdAt),
    anchor: readCadCommentAnchor(item.anchor ?? null),
    ordinal: index + 1,
  }));
}

/**
 * Un comentario nunca debe fallar en seco por una tormenta legítima —el
 * techo de `reviewCommentsPerSession` es GENEROSO a propósito (VD-RL-001),
 * no mide uso real— así que un 429 con `retryAfterSeconds` se espera y se
 * reintenta UNA vez, con el motivo visible mientras tanto. Si el reintento
 * también falla, lo decide el `catch` de quien llama, igual que cualquier
 * otro error.
 */
/** Exportada para probarla sin montar el hook — es lógica pura, no React. */
export async function createWithRateLimitRetry(
  source: CadCommentSource,
  input: { body: string; anchor?: CadCommentAnchorPoint | null },
  setError: (message: string | null) => void,
): Promise<CadComment> {
  try {
    return await source.create(input);
  } catch (cause) {
    if (!(cause instanceof DesignApiError) || !cause.isRateLimited()) throw cause;
    const waitMs = Math.min(
      cause.body.retryAfterSeconds * 1000,
      MAX_RATE_LIMIT_WAIT_MS,
    );
    setError(
      `Mucha actividad en esta sesión ahora mismo — reintentando en ${Math.ceil(waitMs / 1000)}s…`,
    );
    await sleep(waitMs);
    return source.create(input);
  }
}

function messageOf(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
