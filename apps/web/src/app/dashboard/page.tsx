"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, FolderPlus, LogIn, LogOut, Upload } from "lucide-react";
import { API_BASE, rawApiFetch } from "@/lib/apiFetch";
import { useDesignAuth } from "@/contexts/DesignAuthContext";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
};
type Document = {
  id: string;
  projectId: string | null;
  name: string;
  cadDocumentVersion: number;
};
type ViewState =
  | "loading"
  | "ready"
  | "empty"
  | "offline"
  | "forbidden"
  | "expired"
  | "error";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawApiFetch(`${API_BASE}/v1/cad${path}`, init);
  if (!response.ok)
    throw Object.assign(new Error("request failed"), {
      status: response.status,
    });
  return response.json() as Promise<T>;
}

export default function DashboardPage() {
  const auth = useDesignAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [state, setState] = useState<ViewState>("loading");
  const [projectName, setProjectName] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) return setState("expired");
    setState("loading");
    try {
      const [projectPage, documentPage] = await Promise.all([
        jsonRequest<{ items: Project[] }>("/projects?limit=200"),
        jsonRequest<{ items: Document[] }>("/documents?limit=200"),
      ]);
      setProjects(projectPage.items);
      setDocuments(documentPage.items);
      setSelectedProject(
        (current) => current || projectPage.items[0]?.id || "",
      );
      setState(
        projectPage.items.length || documentPage.items.length
          ? "ready"
          : "empty",
      );
    } catch (error) {
      const status = (error as { status?: number }).status;
      setState(
        status === 401
          ? "expired"
          : status === 403
            ? "forbidden"
            : navigator.onLine
              ? "error"
              : "offline",
      );
    }
  }, [auth.isAuthenticated, auth.isLoading]);

  useEffect(() => void load(), [load]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    setBusy(true);
    try {
      const project = await jsonRequest<Project>("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName.trim() }),
      });
      setProjects((items) => [...items, project]);
      setSelectedProject(project.id);
      setProjectName("");
      setState("ready");
    } catch (error) {
      setState(
        (error as { status?: number }).status === 403 ? "forbidden" : "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const createDocument = async (name: string) => {
    if (!name.trim() || !selectedProject) return;
    setBusy(true);
    try {
      // model/revision se omiten deliberadamente: son alias exclusivos de migración.
      const document = await jsonRequest<Document>("/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), projectId: selectedProject }),
      });
      router.push(`/studio/${document.id}`);
    } catch (error) {
      setState(
        (error as { status?: number }).status === 403 ? "forbidden" : "error",
      );
      setBusy(false);
    }
  };

  if (state === "loading")
    return <Status text="Cargando proyectos y documentos…" />;
  if (state !== "ready" && state !== "empty") {
    const message = {
      offline:
        "Estás sin conexión. Tus proyectos estarán disponibles al reconectar.",
      forbidden: "Permiso insuficiente: necesitas cad:view y cad:edit.",
      expired: "Tu sesión ha expirado. Inicia sesión de nuevo.",
      error: "No pudimos cargar tus proyectos.",
    }[state];
    return (
      <Status
        text={message}
        action={state === "expired" ? () => auth.login() : load}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl p-6 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
            Organización
          </p>
          <h1 className="text-3xl font-semibold">{auth.tenantId}</h1>
          <p className="text-sm text-gray-500">Proyectos y documentos CAD</p>
        </div>
        <button
          onClick={auth.logout}
          className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </header>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <form
          onSubmit={createProject}
          className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
        >
          <h2 className="font-semibold">Nuevo proyecto</h2>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Nombre del proyecto"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2"
              placeholder="Ej. Reforma planta norte"
            />
            <button
              disabled={busy}
              className="rounded-xl bg-indigo-600 px-4 text-white"
              aria-label="Crear proyecto"
            >
              <FolderPlus />
            </button>
          </div>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createDocument(documentName);
          }}
          className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
        >
          <h2 className="font-semibold">Nuevo documento</h2>
          <select
            aria-label="Proyecto"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="mt-3 w-full rounded-xl border bg-transparent px-3 py-2"
          >
            <option value="">Selecciona un proyecto</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Nombre del documento"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2"
              placeholder="Plano general"
            />
            <button
              disabled={busy || !selectedProject}
              className="rounded-xl bg-indigo-600 px-4 text-white"
              aria-label="Crear documento"
            >
              <FilePlus2 />
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-indigo-500">
            <Upload className="h-4 w-4" /> Importar como documento
            <input
              type="file"
              className="sr-only"
              accept=".dxf,.json"
              disabled={!selectedProject || busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void createDocument(file.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
        </form>
      </section>

      {state === "empty" ? (
        <p className="mt-10 rounded-2xl border border-dashed p-10 text-center text-gray-500">
          Aún no hay proyectos ni documentos. Crea tu primer proyecto para
          comenzar.
        </p>
      ) : (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Documentos</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((document) => (
              <button
                key={document.id}
                onClick={() => router.push(`/studio/${document.id}`)}
                className="rounded-2xl border border-black/10 p-4 text-left hover:border-indigo-400 dark:border-white/10"
              >
                <strong>{document.name}</strong>
                <span className="mt-2 block truncate text-xs text-gray-500">
                  {document.id}
                </span>
              </button>
            ))}
          </div>
          {documents.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">
              Este espacio todavía no contiene documentos.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function Status({ text, action }: { text: string; action?: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <p role="status">{text}</p>
        {action && (
          <button
            onClick={action}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white"
          >
            <LogIn className="h-4 w-4" /> Continuar
          </button>
        )}
      </div>
    </main>
  );
}
