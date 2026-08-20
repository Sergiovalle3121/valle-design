"use client";

import { useMemo, useState } from "react";

/**
 * El explorador y el lanzador de peticiones de la consola pública.
 *
 * POR QUÉ ES CLIENTE Y NO SERVIDOR. La petición de prueba tiene que salir del
 * NAVEGADOR del integrador, con SU cookie de sesión y SU cabecera CSRF. Si la
 * lanzara el servidor de esta web, estaría actuando como intermediario con
 * credenciales ajenas: un proxy que ve tokens de clientes es exactamente la
 * pieza que ningún despacho quiere en medio, y además mentiría sobre el CORS
 * —el error más común de una primera integración— porque un servidor no lo
 * sufre.
 *
 * POR QUÉ NO HAY CAMPO DE CONTRASEÑA NI DE CLAVE DE API. La consola no
 * autentica: reutiliza la sesión que el integrador ya abrió en su despliegue.
 * Un formulario de credenciales en una página pública es una superficie de
 * phishing con nuestro propio dominio, y no hace falta para nada.
 */

interface ConsoleParameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
}

interface ConsoleOperation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  entitlement: string | null;
  permission: string | null;
  authentication: string;
  parameters: ConsoleParameter[];
  requestBody: { required: boolean; schema: string | null } | null;
  responses: string[];
}

export interface ApiConsoleData {
  operationCount: number;
  cadOperationCount: number;
  apiVersion: string;
  openapi: string;
  operations: ConsoleOperation[];
}

interface AttemptState {
  status: number | null;
  statusText: string;
  elapsedMs: number;
  body: string;
  error: string | null;
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  POST: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  PUT: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  PATCH: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  DELETE: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
};

const AUTH_LABEL: Record<string, string> = {
  public: "Sin sesión",
  sessionCookie: "Cookie de sesión",
  reviewToken: "Token de revisión",
};

/** Cookie legible por diseño; es la mitad pública del par CSRF. */
function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)valle_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isMutation(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

/** Sustituye `{param}` por lo que el integrador escribió, ya codificado. */
function resolvePath(
  operation: ConsoleOperation,
  values: Record<string, string>,
): { url: string; missing: string[] } {
  const missing: string[] = [];
  const path = operation.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name]?.trim();
    if (!value) {
      missing.push(name);
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  const query = operation.parameters
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => [parameter.name, values[parameter.name]?.trim() ?? ""])
    .filter(([, value]) => value !== "")
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  return { url: query ? `${path}?${query}` : path, missing };
}

function OperationBadge({ operation }: { operation: ConsoleOperation }) {
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
        METHOD_STYLES[operation.method] ?? "bg-gray-200 text-gray-800"
      }`}
    >
      {operation.method}
    </span>
  );
}

export function ApiConsole({ data }: { data: ApiConsoleData }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(data.operations[0].operationId);
  const [baseUrl, setBaseUrl] = useState("http://localhost:4000");
  const [values, setValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es-MX");
    if (!needle) return data.operations;
    return data.operations.filter((operation) =>
      [
        operation.operationId,
        operation.path,
        operation.summary,
        operation.method,
        ...operation.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("es-MX")
        .includes(needle),
    );
  }, [data.operations, query]);

  const selected =
    data.operations.find(
      (operation) => operation.operationId === selectedId,
    ) ?? data.operations[0];

  const send = async () => {
    const { url, missing } = resolvePath(selected, values);
    if (missing.length > 0) {
      setAttempt({
        status: null,
        statusText: "",
        elapsedMs: 0,
        body: "",
        error: `Faltan parámetros de ruta: ${missing.join(", ")}.`,
      });
      return;
    }
    const headers: Record<string, string> = {};
    if (isMutation(selected.method)) {
      const csrf = readCsrfCookie();
      if (csrf) headers["X-CSRF-Token"] = csrf;
      if (body.trim()) headers["Content-Type"] = "application/json";
    }
    setSending(true);
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${url}`, {
        method: selected.method,
        credentials: "include",
        headers,
        body:
          isMutation(selected.method) && body.trim() ? body : undefined,
      });
      const text = await response.text();
      setAttempt({
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Math.round(performance.now() - started),
        body: text.slice(0, 20_000),
        error: null,
      });
    } catch (error) {
      setAttempt({
        status: null,
        statusText: "",
        elapsedMs: Math.round(performance.now() - started),
        body: "",
        error:
          error instanceof Error
            ? `${error.message} — si dice «Failed to fetch», casi siempre es CORS: el despliegue no declara este origen en ALLOWED_ORIGIN.`
            : "Error desconocido.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6" aria-label="Consola de operaciones">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold">Origen de la API</span>
          <input
            className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-mono text-sm dark:border-white/20 dark:bg-black/30"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.tu-despliegue.mx"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Buscar operación</span>
          <input
            className="mt-1 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-black/30"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="documento, proyecto, dxf, bloque…"
          />
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-black/10 dark:border-white/15">
          <ul>
            {filtered.map((operation) => (
              <li key={operation.operationId}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(operation.operationId);
                    setValues({});
                    setBody("");
                    setAttempt(null);
                  }}
                  className={`flex w-full items-start gap-2 border-b border-black/5 px-3 py-2 text-left text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 ${
                    operation.operationId === selected.operationId
                      ? "bg-indigo-50 dark:bg-indigo-950/40"
                      : ""
                  }`}
                >
                  <OperationBadge operation={operation} />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs">
                      {operation.path}
                    </span>
                    <span className="block text-xs text-gray-600 dark:text-gray-400">
                      {operation.operationId}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                Ninguna operación coincide con «{query}».
              </li>
            ) : null}
          </ul>
        </div>

        <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <OperationBadge operation={selected} />
              <code className="text-sm">{selected.path}</code>
            </div>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {selected.summary}
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div>
                <dt className="inline font-semibold">Autenticación: </dt>
                <dd className="inline">
                  {AUTH_LABEL[selected.authentication] ??
                    selected.authentication}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">operationId: </dt>
                <dd className="inline font-mono">{selected.operationId}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Entitlement: </dt>
                <dd className="inline font-mono">
                  {selected.entitlement ?? "ninguno"}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Permiso: </dt>
                <dd className="inline font-mono">
                  {selected.permission ?? "ninguno"}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Respuestas: </dt>
                <dd className="inline font-mono">
                  {selected.responses.join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold">Cuerpo: </dt>
                <dd className="inline font-mono">
                  {selected.requestBody?.schema ?? "ninguno"}
                </dd>
              </div>
            </dl>
          </header>

          {selected.parameters.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Parámetros</h3>
              {selected.parameters.map((parameter) => (
                <label
                  key={`${parameter.in}:${parameter.name}`}
                  className="block text-xs"
                >
                  <span className="font-mono">
                    {parameter.name}
                    <span className="ml-2 text-gray-500">
                      ({parameter.in}
                      {parameter.required ? ", obligatorio" : ""})
                    </span>
                  </span>
                  {parameter.description ? (
                    <span className="block text-gray-600 dark:text-gray-400">
                      {parameter.description}
                    </span>
                  ) : null}
                  <input
                    className="mt-1 w-full rounded border border-black/15 bg-white px-2 py-1 font-mono text-xs dark:border-white/20 dark:bg-black/30"
                    value={values[parameter.name] ?? ""}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [parameter.name]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}

          {selected.requestBody ? (
            <label className="block text-xs">
              <span className="text-sm font-semibold">
                Cuerpo JSON
                {selected.requestBody.required ? " (obligatorio)" : ""}
              </span>
              <textarea
                className="mt-1 h-32 w-full rounded border border-black/15 bg-white px-2 py-1 font-mono text-xs dark:border-white/20 dark:bg-black/30"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={`{ "…": "según el esquema ${selected.requestBody.schema ?? "del contrato"}" }`}
              />
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {sending ? "Enviando…" : "Lanzar petición"}
          </button>

          {attempt ? (
            <div className="rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">
              {attempt.error ? (
                <p className="text-rose-700 dark:text-rose-300">
                  {attempt.error}
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    HTTP {attempt.status} {attempt.statusText} ·{" "}
                    {attempt.elapsedMs} ms
                  </p>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                    {attempt.body || "(sin cuerpo)"}
                  </pre>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
