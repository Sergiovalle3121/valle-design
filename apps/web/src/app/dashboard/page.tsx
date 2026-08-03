"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, FolderPlus, LogIn, LogOut, Upload, X } from "lucide-react";
import type {
  CadDocumentInline,
  CadDocumentSummary,
  CadProject,
  CommercialSubscriptionResponse,
  OrganizationList,
} from "@valle/design-sdk";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import { importDocumentFile } from "@/lib/cad/document-import-client";
import type { DocumentImportReport } from "@/lib/cad/document-import";
import { serializeCadDocument } from "@/lib/cad/cad-document";

type Project = CadProject;
type Document = CadDocumentSummary;
type ViewState =
  | "loading"
  | "organization-required"
  | "ready"
  | "empty"
  | "offline"
  | "forbidden"
  | "expired"
  | "error";
type OrganizationItem = OrganizationList["items"][number];

type ImportState =
  | { status: "idle" }
  | {
      status: "running";
      progress: number;
      stage: string;
      canCancel: boolean;
    }
  | {
      status: "success";
      report: DocumentImportReport;
      documentId: string;
    }
  | { status: "error"; message: string };

export default function DashboardPage() {
  const auth = useDesignAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [subscription, setSubscription] =
    useState<CommercialSubscriptionResponse["subscription"]>(null);
  const [entitlements, setEntitlements] = useState<string[]>([]);
  const [state, setState] = useState<ViewState>("loading");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );
  const [projectName, setProjectName] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
  });
  const importAbort = useRef<AbortController | null>(null);
  const canEdit = auth.permissions.includes("cad:edit");

  const load = useCallback(async () => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) return setState("expired");
    setState("loading");
    try {
      const organizationPage = await designClient.organizations.list();
      setOrganizations(organizationPage.items);
      if (!auth.organizationId) {
        setState("organization-required");
        return;
      }
      const [projectPage, documentPage, subscriptionResult, entitlementResult] =
        await Promise.all([
          designClient.projects.list({ limit: 200 }),
          designClient.documents.list({ limit: 200 }),
          designClient.commercial.subscription(),
          designClient.commercial.entitlements(),
        ]);
      setProjects(projectPage.items);
      setDocuments(documentPage.items);
      setSubscription(subscriptionResult.subscription);
      setEntitlements(entitlementResult.items);
      setSelectedProject(
        (current) => current || projectPage.items[0]?.id || "",
      );
      setState(
        projectPage.items.length || documentPage.items.length
          ? "ready"
          : "empty",
      );
    } catch (error) {
      const status = error instanceof DesignApiError ? error.status : undefined;
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
  }, [auth.isAuthenticated, auth.isLoading, auth.organizationId]);

  useEffect(() => void load(), [load]);

  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationName.trim() || !organizationSlug.trim() || busy) return;
    setBusy(true);
    setOrganizationError(null);
    try {
      await designClient.organizations.create({
        name: organizationName.trim(),
        slug: organizationSlug.trim().toLowerCase(),
      });
      await auth.refresh();
    } catch (error) {
      setOrganizationError(
        error instanceof Error
          ? error.message
          : "No se pudo crear la organización.",
      );
    } finally {
      setBusy(false);
    }
  };

  const activateOrganization = async (organizationId: string) => {
    if (busy || organizationId === auth.organizationId) return;
    setBusy(true);
    setOrganizationError(null);
    try {
      await designClient.organizations.activate(organizationId);
      await auth.refresh();
    } catch (error) {
      setOrganizationError(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar de organización.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !projectName.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const project = await designClient.projects.create({
        name: projectName.trim(),
      });
      setProjects((items) => [...items, project]);
      setSelectedProject(project.id);
      setProjectName("");
      setState("ready");
    } catch (error) {
      setActionError(
        error instanceof DesignApiError && error.status === 403
          ? "Tu rol ya no permite crear proyectos. Actualiza la sesión."
          : error instanceof Error
            ? error.message
            : "No se pudo crear el proyecto.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createDocument = async (name: string) => {
    if (!canEdit || !name.trim() || !selectedProject || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      // model/revision se omiten deliberadamente: son alias exclusivos de migración.
      const document = await designClient.documents.create({
        name: name.trim(),
        projectId: selectedProject,
      });
      router.push(`/studio/${document.id}`);
    } catch (error) {
      setActionError(
        error instanceof DesignApiError && error.status === 403
          ? "Tu rol ya no permite crear documentos. Actualiza la sesión."
          : error instanceof Error
            ? error.message
            : "No se pudo crear el documento.",
      );
      setBusy(false);
    }
  };

  const importDocument = async (file: File) => {
    if (!canEdit || !selectedProject || busy) return;
    const controller = new AbortController();
    importAbort.current?.abort();
    importAbort.current = controller;
    setBusy(true);
    setImportState({
      status: "running",
      progress: 0,
      stage: "Preparando importación",
      canCancel: true,
    });
    let created: Document | null = null;
    try {
      const report = await importDocumentFile(file, {
        signal: controller.signal,
        onProgress: (progress, stage) =>
          setImportState({
            status: "running",
            progress: progress * 0.65,
            stage,
            canCancel: true,
          }),
      });
      if (controller.signal.aborted) throw abortError();
      setImportState({
        status: "running",
        progress: 0.7,
        stage: "Creando documento",
        canCancel: false,
      });
      created = await designClient.documents.create({
        name: file.name
          .replace(/\.[^.]+$/, "")
          .trim()
          .slice(0, 160),
        projectId: selectedProject,
      });

      const serialized = serializeCadDocument(report.document);
      const serializedBytes = new Blob([serialized]).size;
      if (serializedBytes > 1_000_000) {
        setImportState({
          status: "running",
          progress: 0.82,
          stage: "Comprimiendo documento grande",
          canCancel: false,
        });
        const archive = await gzipDocument(serialized);
        await designClient.documents.saveArchive(created.id, archive, 0);
      } else {
        setImportState({
          status: "running",
          progress: 0.86,
          stage: "Guardando contenido",
          canCancel: false,
        });
        await designClient.documents.saveContent(
          created.id,
          report.document as unknown as CadDocumentInline,
          0,
        );
      }
      setDocuments((items) => [created!, ...items]);
      setState("ready");
      setImportState({
        status: "success",
        report,
        documentId: created.id,
      });
    } catch (error) {
      let rollbackFailed = false;
      if (created) {
        try {
          await designClient.documents.discardProvisional(created.id);
        } catch {
          rollbackFailed = true;
        }
      }
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Importación cancelada."
          : error instanceof Error
            ? error.message
            : "No se pudo importar el documento.";
      setImportState({
        status: "error",
        message: rollbackFailed
          ? `${message} No se pudo descartar el documento provisional; revisa el dashboard.`
          : message,
      });
    } finally {
      if (importAbort.current === controller) importAbort.current = null;
      setBusy(false);
    }
  };

  if (state === "loading")
    return <Status text="Cargando proyectos y documentos…" />;
  if (state === "organization-required") {
    return (
      <OrganizationOnboarding
        organizations={organizations}
        name={organizationName}
        slug={organizationSlug}
        busy={busy}
        error={organizationError}
        onNameChange={setOrganizationName}
        onSlugChange={setOrganizationSlug}
        onCreate={createOrganization}
        onActivate={activateOrganization}
        onLogout={() => void auth.logout()}
      />
    );
  }
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
          <h1 className="text-3xl font-semibold">
            {auth.organizationName ?? auth.tenantId}
          </h1>
          {subscription && (
            <p
              className="mt-1 text-xs text-gray-500"
              data-testid="subscription-status"
            >
              Suscripción {subscription.status}
              {subscription.status === "trialing" && subscription.trialEndsAt
                ? ` hasta ${new Date(subscription.trialEndsAt).toLocaleDateString()}`
                : ""}
              {entitlements.includes("design.cad") ? " · CAD habilitado" : ""}
            </p>
          )}
          <p className="text-sm text-gray-500">Proyectos y documentos CAD</p>
        </div>
        {organizations.length > 1 && (
          <select
            aria-label="Organización activa"
            value={auth.organizationId ?? ""}
            disabled={busy}
            onChange={(event) => void activateOrganization(event.target.value)}
            className="rounded-xl border bg-transparent px-3 py-2 text-sm"
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={auth.logout}
          className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </header>

      {canEdit ? (
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
                  if (file) void importDocument(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <ImportStatus
              state={importState}
              onCancel={() => importAbort.current?.abort()}
              onOpen={(documentId) => router.push(`/studio/${documentId}`)}
            />
          </form>
        </section>
      ) : (
        <p
          data-testid="dashboard-read-only"
          className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-400/5 px-5 py-4 text-sm text-amber-700 dark:text-amber-200"
        >
          Tu rol permite consultar proyectos y documentos. La creación y la
          importación requieren permiso de edición.
        </p>
      )}

      {actionError && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {actionError}
        </p>
      )}

      {state === "empty" ? (
        <p className="mt-10 rounded-2xl border border-dashed p-10 text-center text-gray-500">
          {canEdit
            ? "Aún no hay proyectos ni documentos. Crea tu primer proyecto para comenzar."
            : "Este espacio todavía no contiene proyectos ni documentos."}
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

function OrganizationOnboarding({
  organizations,
  name,
  slug,
  busy,
  error,
  onNameChange,
  onSlugChange,
  onCreate,
  onActivate,
  onLogout,
}: {
  organizations: OrganizationItem[];
  name: string;
  slug: string;
  busy: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  onActivate: (organizationId: string) => void;
  onLogout: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
            Primer acceso
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Elige tu organización</h1>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>

      {organizations.length > 0 && (
        <section className="mt-8 rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <h2 className="font-semibold">Organizaciones disponibles</h2>
          <div className="mt-3 grid gap-2">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                disabled={busy}
                onClick={() => onActivate(organization.id)}
                className="flex items-center justify-between rounded-xl border px-4 py-3 text-left"
              >
                <span>
                  <strong className="block">{organization.name}</strong>
                  <span className="text-xs text-gray-500">
                    {organization.slug} · {organization.role}
                  </span>
                </span>
                <span className="text-sm text-indigo-500">Abrir</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <form
        onSubmit={onCreate}
        className="mt-6 rounded-2xl border border-black/10 p-5 dark:border-white/10"
      >
        <h2 className="font-semibold">Crear una organización</h2>
        <p className="mt-1 text-sm text-gray-500">
          La primera organización recibe un periodo de prueba configurable con
          acceso CAD; no se publica ningún precio desde esta pantalla.
        </p>
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="organization-name"
        >
          Nombre
        </label>
        <input
          id="organization-name"
          name="organizationName"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          minLength={2}
          maxLength={160}
          required
          className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2"
          placeholder="Ej. Estudio Valle"
        />
        <label
          className="mt-4 block text-sm font-medium"
          htmlFor="organization-slug"
        >
          Identificador
        </label>
        <input
          id="organization-slug"
          name="organizationSlug"
          value={slug}
          onChange={(event) => onSlugChange(event.target.value.toLowerCase())}
          minLength={2}
          maxLength={80}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
          className="mt-2 w-full rounded-xl border bg-transparent px-3 py-2 font-mono"
          placeholder="estudio-valle"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-5 min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Creando…" : "Crear organización y comenzar"}
        </button>
        {error && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

function ImportStatus({
  state,
  onCancel,
  onOpen,
}: {
  state: ImportState;
  onCancel: () => void;
  onOpen: (documentId: string) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "running") {
    return (
      <div className="mt-3 rounded-xl bg-indigo-500/10 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span role="status">{state.stage}</span>
          {state.canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 text-xs"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          )}
        </div>
        <progress
          aria-label="Progreso de importación"
          className="mt-2 w-full"
          max={1}
          value={state.progress}
        />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm">
        {state.message}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">
      <p role="status">
        Importado: {state.report.importedEntityCount} entidades y{" "}
        {state.report.importedBlockCount} bloques.
      </p>
      {state.report.warnings.length > 0 && (
        <details className="mt-2">
          <summary>
            {state.report.warnings.length} advertencias de interoperabilidad
          </summary>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {state.report.warnings.slice(0, 6).map((warning, index) => (
              <li key={`${warning.code}:${index}`}>{warning.message}</li>
            ))}
          </ul>
        </details>
      )}
      <button
        type="button"
        onClick={() => onOpen(state.documentId)}
        className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-white"
      >
        Abrir documento importado
      </button>
    </div>
  );
}

async function gzipDocument(serialized: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "Este navegador no puede comprimir documentos grandes. Actualízalo o importa un archivo menor de 1 MB.",
    );
  }
  const compressed = new Blob([serialized])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(compressed).arrayBuffer()], {
    type: "application/gzip",
  });
}

function abortError(): DOMException {
  return new DOMException("Importación cancelada.", "AbortError");
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
