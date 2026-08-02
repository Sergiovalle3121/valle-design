"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DraftingCompass,
  FilePlus2,
  FolderPlus,
  LogIn,
  RefreshCw,
} from "lucide-react";
import { rawApiFetch, API_BASE } from "@/lib/apiFetch";
import { useDesignAuth } from "@/contexts/DesignAuthContext";

type Project = { id: string; name: string };
type Document = {
  id: string;
  projectId: string | null;
  name: string;
  updatedAt?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await rawApiFetch(`${API_BASE}/v1/cad${path}`, init);
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Tu sesión expiró. Inicia sesión nuevamente."
        : "No se pudo completar la operación.",
    );
  return response.json() as Promise<T>;
}

export default function DashboardPage() {
  const auth = useDesignAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [projectId, setProjectId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, d] = await Promise.all([
        api<{ items: Project[] }>("/projects"),
        api<{ items: Document[] }>("/documents"),
      ]);
      setProjects(p.items);
      setDocuments(d.items);
      setProjectId((current) => current || p.items[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) void load();
  }, [auth.isAuthenticated, load]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectName.trim()) return;
    const created = await api<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.trim() }),
    });
    setProjects((items) => [created, ...items]);
    setProjectId(created.id);
    setProjectName("");
  }

  async function createDocument(event: FormEvent) {
    event.preventDefault();
    if (!documentName.trim() || !projectId) return;
    const created = await api<Document>("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name: documentName.trim() }),
    });
    window.location.href = `/studio/${created.id}?projectId=${encodeURIComponent(projectId)}`;
  }

  if (!auth.isLoading && !auth.isAuthenticated)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="max-w-md rounded-3xl border border-black/10 bg-white/80 p-8 text-center dark:border-white/10 dark:bg-white/5">
          <LogIn className="mx-auto mb-4 h-8 w-8 text-cyan-500" />
          <h1 className="text-2xl font-semibold">Accede a tus dibujos</h1>
          <p className="mt-2 text-sm text-gray-500">
            Inicia sesión para abrir proyectos y documentos de tu organización.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white"
          >
            Ir al inicio
          </Link>
        </section>
      </main>
    );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-cyan-600">Valle Design</p>
          <h1 className="text-3xl font-semibold">Proyectos y documentos</h1>
          <p className="mt-1 text-gray-500">
            Continúa tu trabajo o inicia un dibujo con un ID independiente.
          </p>
        </div>
        <button
          onClick={() => void load()}
          aria-label="Actualizar"
          className="rounded-xl border p-3"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
        >
          {error}
        </div>
      )}
      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <form
          onSubmit={createProject}
          className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <FolderPlus className="h-5 w-5" /> Nuevo proyecto
          </h2>
          <div className="mt-4 flex gap-2">
            <input
              aria-label="Nombre del proyecto"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nombre del proyecto"
              className="min-w-0 flex-1 rounded-xl border bg-transparent px-4 py-3"
            />
            <button className="rounded-xl bg-indigo-600 px-4 font-semibold text-white">
              Crear
            </button>
          </div>
        </form>
        <form
          onSubmit={createDocument}
          className="rounded-2xl border border-black/10 p-5 dark:border-white/10"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <FilePlus2 className="h-5 w-5" /> Nuevo documento
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              aria-label="Nombre del documento"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Nombre del dibujo"
              className="rounded-xl border bg-transparent px-4 py-3"
            />
            <select
              aria-label="Proyecto"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-xl border bg-transparent px-3"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              disabled={!projectId}
              className="rounded-xl bg-cyan-600 px-4 font-semibold text-white disabled:opacity-40"
            >
              Crear y abrir
            </button>
          </div>
        </form>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Documentos recientes</h2>
        {loading ? (
          <div className="mt-4 h-28 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
        ) : documents.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed p-10 text-center text-gray-500">
            <DraftingCompass className="mx-auto mb-3 h-8 w-8" />
            Todavía no hay documentos. Crea un proyecto y tu primer dibujo.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/studio/${doc.id}${doc.projectId ? `?projectId=${encodeURIComponent(doc.projectId)}` : ""}`}
                className="rounded-2xl border border-black/10 p-5 transition hover:border-cyan-500 dark:border-white/10"
              >
                <h3 className="font-semibold">{doc.name}</h3>
                <p className="mt-2 font-mono text-xs text-gray-500">{doc.id}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
