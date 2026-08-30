"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FilePlus2,
  FolderPlus,
  LogOut,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SkipLink } from "@/components/SkipLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Surface, buttonClass, cx } from "@/components/ui";
import { FeedbackButton } from "@/components/feedback/FeedbackDialog";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { FirstMinute } from "./FirstMinute";
import { OrganizationOnboarding } from "./OrganizationOnboarding";
import type {
  CadDocumentInline,
  CadDocumentSummary,
  CadProject,
  CommercialSubscriptionResponse,
  OrganizationList,
} from "@valle/design-sdk";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { TrialBanner } from "@/components/commercial/TrialBanner";
import { trialStatus } from "@/lib/commercial/trial-phase";
import { designClient, DesignApiError } from "@/lib/cad/repositories/client";
import {
  importDocumentFile,
  isDwgNativeImportBetaEnabled,
  splitDocumentSelection,
} from "@/lib/cad/document-import-client";
import { EMPTY_CAD_STARTER_CHOICE } from "./starter-choice";
import { Status } from "./Status";
import { abrirPlanoDeEjemplo } from "./sample-plan";
import { prefetchCadStudio } from "@/components/cad/prefetch-studio";

import {
  abortError,
  gzipDocument,
  ImportStatus,
  type ImportState,
} from "./import-status";
import {
  StartNotes,
  startDocumentContent,
  useDemoAdoption,
  useGalleryStart,
} from "./gallery-start";

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
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );
  const [projectName, setProjectName] = useState("");
  const [documentName, setDocumentName] = useState("");
  /**
   * Plantilla de arranque, lámina y responsiva. Plantilla vacía = lienzo en
   * blanco, que sigue siendo una opción legítima: quien va a importar un DXF
   * encima no quiere capas inventadas de por medio.
   */
  const [starter, setStarter] = useState(EMPTY_CAD_STARTER_CHOICE);
  const [galleryStart, clearGalleryStart] = useGalleryStart();
  const [demoAdoption, clearDemoAdoption] = useDemoAdoption();

  /**
   * Quien llega al tablero va a abrir un plano: es lo único que se hace aquí.
   * El editor son ~3,8 MB que hoy empezaban a bajar en el momento del clic, con
   * la persona ya mirando la pantalla de carga. Se piden antes, cuando el
   * navegador esté ocioso — y no se piden si el usuario activó el ahorro de
   * datos o va por 2G (ver `prefetch-studio.ts`).
   */
  useEffect(() => prefetchCadStudio(), []);
  const [selectedProject, setSelectedProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
  });
  const importAbort = useRef<AbortController | null>(null);
  /**
   * «Crea un plano en blanco» NO abre otro formulario: lleva el foco al que ya
   * está en la página. Duplicar el formulario habría duplicado también las seis
   * ramas de validación que tiene detrás.
   */
  const documentNameRef = useRef<HTMLInputElement>(null);
  /**
   * DOS condiciones, no una. El permiso `cad:edit` sale de la membresía; la
   * vigencia sale de la suscripción. Con la prueba vencida el servidor
   * conserva el permiso y niega la escritura (`read_only_after_lapse`), así
   * que enseñar aquí el formulario de «Nuevo proyecto» sería ofrecer un botón
   * que responde 403 — la clase de mentira que esta campaña existe para
   * quitar. Lo que NO se toca es la lectura: la lista de documentos, abrir y
   * exportar siguen exactamente igual.
   */
  const canEdit =
    auth.permissions.includes("cad:edit") && trialStatus(subscription).canEdit;

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
      /**
       * El primer proyecto se resuelve AQUÍ, dentro del `try`, y no dentro del
       * actualizador perezoso de `setSelectedProject`.
       *
       * No es estilo: es dónde cae el error. Un actualizador perezoso se
       * ejecuta después, durante el render, FUERA de este `try` — así que si la
       * respuesta llega sin `items` (una API antigua, un proxy que devuelve una
       * lista pelada, un despliegue a medias), el `TypeError` escapaba del
       * manejador de errores del tablero, subía hasta la frontera de ruta y
       * sustituía el tablero entero por «algo se rompió de nuestro lado». Con
       * la lectura aquí, el mismo fallo cae en el `catch` de abajo y el usuario
       * ve el estado de error del tablero, con su reintento y su navegación.
       */
      const primerProyecto = projectPage.items[0]?.id ?? "";
      setProjects(projectPage.items);
      setDocuments(documentPage.items);
      setSubscription(subscriptionResult.subscription);
      setEntitlements(entitlementResult.items);
      setSelectedProject((current) => current || primerProyecto);
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

  const createOrganization = async (input: { name: string; slug: string }) => {
    if (!input.name.trim() || !input.slug.trim() || busy) return;
    setBusy(true);
    setOrganizationError(null);
    try {
      await designClient.organizations.create({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
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
      // La plantilla se escribe ANTES de abrir el estudio. Al revés —abrir y
      // que el editor la aplique— habría dos escritores del mismo documento en
      // la misma décima de segundo: el guardado inicial del editor y el de la
      // plantilla, con un 409 de CAS como resultado más probable. Aquí el
      // documento llega al estudio ya configurado y el editor sólo lo lee.
      const arranque = await startDocumentContent(demoAdoption, galleryStart);
      if (arranque) {
        await designClient.documents.saveContent(
          document.id,
          arranque as CadDocumentInline,
          0,
        );
      } else if (starter.templateId) {
        const project = projects.find((item) => item.id === selectedProject);
        // El generador viaja con el catálogo de plantillas: se trae aquí, con
        // el usuario ya comprometido a crear el documento, y no al abrir la
        // página. `import()` cachea el módulo, así que el segundo documento no
        // vuelve a pagarlo.
        const { createCadStarterDocument } =
          await import("@/lib/cad/starter-templates");
        await designClient.documents.saveContent(
          document.id,
          createCadStarterDocument({
            templateId: starter.templateId,
            project: project?.name,
            title: name.trim(),
            drawnBy: auth.user?.email,
            date: new Date().toISOString().slice(0, 10),
            // Papel, ubicación de la obra y responsiva del D.R.O.: los tres van
            // al cajetín desde el minuto cero. Descubrir en ventanilla que las
            // veinte láminas del juego no tienen dónde firmar es rehacerlas.
            ...(starter.paper ? { paper: starter.paper } : {}),
            ...(starter.location.trim() ? { location: starter.location } : {}),
            ...(starter.dro.trim() ? { dro: starter.dro } : {}),
          }) as unknown as CadDocumentInline,
          0,
        );
      }
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

  /**
   * 4.4 · ABRIR EL PLANO DE EJEMPLO.
   *
   * Reutiliza la MISMA secuencia que `createDocument` —crear el documento y
   * escribir su contenido ANTES de abrir el estudio— porque el motivo es el
   * mismo: si el editor abriera un documento vacío y escribiera después, habría
   * dos escritores del mismo documento en la misma décima de segundo y el CAS
   * devolvería un 409.
   *
   * El plano NO se escribe a mano en el código: `sample-plan.json` lo genera
   * `npm run capture:product` dibujando con los comandos reales, y es
   * literalmente el mismo dibujo que sale en la portada.
   */
  const openSamplePlan = async () => {
    if (!canEdit || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      // La secuencia (crear proyecto si hace falta, crear documento, escribir
      // el contenido) vive en `sample-plan.ts`: aquí sólo queda lo que es de
      // esta pantalla — el estado ocupado, el error y a dónde se va después.
      const { documentId, proyectoCreado } = await abrirPlanoDeEjemplo(
        selectedProject || projects[0]?.id,
      );
      if (proyectoCreado) {
        setProjects((items) => [...items, proyectoCreado]);
        setSelectedProject(proyectoCreado.id);
      }
      router.push(`/studio/${documentId}`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "No se pudo abrir el plano de ejemplo.",
      );
      setBusy(false);
    }
  };

  const importDocument = async (
    file: File,
    sidecars: { shx?: File; dbf?: File; prj?: File; cpg?: File } = {},
  ) => {
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
        sidecars,
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

      const { serializeCadDocument } = await import("@/lib/cad/cad-document");
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

  if (state === "loading") return <DashboardSkeleton />;
  if (state === "organization-required") {
    return (
      <OrganizationOnboarding
        organizations={organizations}
        email={auth.user?.email}
        busy={busy}
        error={organizationError}
        onCreate={(input) => void createOrganization(input)}
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
    <>
      <SkipLink />
      <main
        id="contenido"
        className="mx-auto min-h-screen w-full max-w-6xl p-6 md:p-10"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Logo markClassName="h-6 w-6" showWordmark={false} />
            <p className="type-eyebrow mt-3 text-primary-ink">Organización</p>
            <h1 className="type-title mt-1">
              {auth.organizationName ?? auth.tenantId}
            </h1>
            {subscription && (
              <p
                className="type-caption mt-2 text-muted-foreground"
                data-testid="subscription-status"
              >
                Suscripción {subscription.status}
                {subscription.status === "trialing" && subscription.trialEndsAt
                  ? ` hasta ${new Date(subscription.trialEndsAt).toLocaleDateString()}`
                  : ""}
                {entitlements.includes("design.cad") ? " · CAD habilitado" : ""}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            {organizations.length > 1 && (
              <select
                aria-label="Organización activa"
                value={auth.organizationId ?? ""}
                disabled={busy}
                onChange={(event) =>
                  void activateOrganization(event.target.value)
                }
                className="type-small min-h-11 rounded-control border border-border bg-card px-3 text-foreground"
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            )}
            {/*
              La página de seguridad de la cuenta no era alcanzable desde
              NINGUNA navegación del producto: existía la ruta y no había cómo
              llegar. Una función de seguridad que el usuario no encuentra es
              una función que no protege a nadie.
            */}
            {/*
              El canal de vuelta, en el cromo y no flotando sobre nada. La
              lección del aviso de tableta: cualquier cosa encima del área de
              trabajo acaba robando un clic que el usuario quería dar.
            */}
            <FeedbackButton />
            {/*
              Misma lección que la de arriba, y el mismo hueco: el producto
              sabía invitar a una organización desde su primer día y no había
              una sola pantalla donde hacerlo.
            */}
            <Link href="/equipo" className={buttonClass({ variant: "ghost" })}>
              <Users aria-hidden="true" className="h-4 w-4" />
              Equipo
            </Link>
            <Link href="/cuenta" className={buttonClass({ variant: "ghost" })}>
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Seguridad
            </Link>
            <Button
              variant="ghost"
              onClick={auth.logout}
              iconLeft={<LogOut className="h-4 w-4" />}
            >
              Cerrar sesión
            </Button>
          </div>
        </header>

        {/*
          EL ORDEN DEPENDE DEL ESTADO, y no es maquetación por gusto. Con
          documentos creados, quien entra viene a abrir uno o a crear el
          siguiente: mandan los formularios. Con el espacio VACÍO, quien mira
          acaba de terminar el alta y todavía no sabe qué es un «proyecto»:
          enseñarle dos formularios de seis campos antes que nada es darle
          deberes en lugar de producto.

          Se resuelve con `order` y no duplicando los dos bloques en las dos
          ramas de un ternario: duplicarlos habría duplicado también las seis
          validaciones que cuelgan de ellos, y la copia de abajo empieza a
          divergir el día que alguien arregle sólo la de arriba.
        */}
        {/*
          EL AVISO VA ARRIBA DEL TODO, antes de los formularios y de la lista.
          Con la prueba a punto de terminar —o terminada— es la información más
          importante de la pantalla, y enterrarla bajo el contenido es la forma
          educada de ocultarla.
        */}
        <TrialBanner subscription={subscription} className="mt-8" />

        <div className="flex flex-col">
          {canEdit ? (
            <section
              className={cx(
                "mt-10 grid gap-5 md:grid-cols-2",
                state === "empty" ? "order-3" : "order-1",
              )}
            >
              <Surface
                as="form"
                onSubmit={createProject}
                className="flex flex-col"
              >
                <h2 className="type-heading">Nuevo proyecto</h2>
                <p className="type-small mt-1 text-muted-foreground">
                  Un proyecto agrupa los planos de una misma obra.
                </p>
                <div className="mt-4 flex gap-2">
                  <input
                    aria-label="Nombre del proyecto"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="type-small min-h-11 min-w-0 flex-1 rounded-control border border-input bg-card px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    placeholder="Ej. Reforma planta norte"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy}
                    aria-label="Crear proyecto"
                    className="px-4"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </div>
              </Surface>

              <Surface
                as="form"
                onSubmit={(event: React.FormEvent) => {
                  event.preventDefault();
                  void createDocument(documentName);
                }}
                className="flex flex-col"
              >
                <h2 className="type-heading">Nuevo documento</h2>
                <select
                  aria-label="Proyecto"
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="type-small mt-4 min-h-11 w-full rounded-control border border-input bg-card px-3 text-foreground"
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
                    ref={documentNameRef}
                    aria-label="Nombre del documento"
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    className="type-small min-h-11 min-w-0 flex-1 rounded-control border border-input bg-card px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    placeholder="Plano general"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy || !selectedProject}
                    aria-label="Crear documento"
                    className="px-4"
                  >
                    <FilePlus2 className="h-4 w-4" />
                  </Button>
                </div>
                {/*
                La plantilla va DEBAJO del nombre y no en un asistente aparte: es
                una decisión de un segundo que ahorra media hora de configuración,
                y un asistente de tres pasos para elegirla costaría más que el
                tiempo que ahorra. Lo que se pinta vive en `starter-template-fields`
                por el presupuesto de tamaño de esta página.
              */}
                {/*
                El formulario de plantilla llega por red (import dinámico) y
                pinta un catálogo entero. Su frontera es compacta porque vive
                dentro del formulario de creación: si se cae, se puede seguir
                creando el documento en blanco, que es la ruta que más se usa.
              */}
                <StartNotes
                  demo={demoAdoption}
                  gallery={galleryStart}
                  onClearDemo={clearDemoAdoption}
                  onClearGallery={clearGalleryStart}
                  starter={starter}
                  onStarterChange={setStarter}
                  busy={busy}
                />
                <label className="type-small mt-4 inline-flex cursor-pointer items-center gap-2 font-medium text-primary-ink">
                  <Upload className="h-4 w-4" /> Importar como documento
                  <input
                    type="file"
                    className="sr-only"
                    accept={
                      isDwgNativeImportBetaEnabled()
                        ? ".dxf,.json,.shp,.shx,.dbf,.prj,.cpg,.dwg"
                        : ".dxf,.json,.shp,.shx,.dbf,.prj,.cpg"
                    }
                    multiple
                    disabled={!selectedProject || busy}
                    onChange={(e) => {
                      // Un shapefile son varios archivos que hay que elegir juntos.
                      const chosen = splitDocumentSelection([
                        ...(e.target.files ?? []),
                      ]);
                      if (chosen)
                        void importDocument(chosen.primary, chosen.sidecars);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <ImportStatus
                  state={importState}
                  onCancel={() => importAbort.current?.abort()}
                  onOpen={(documentId) => router.push(`/studio/${documentId}`)}
                />
              </Surface>
            </section>
          ) : (
            <p
              data-testid="dashboard-read-only"
              className={cx(
                "type-small mt-10 rounded-card border border-warning/30 bg-warning/10 px-5 py-4 text-warning-ink",
                state === "empty" ? "order-3" : "order-1",
              )}
            >
              Tu rol permite consultar proyectos y documentos. La creación y la
              importación requieren permiso de edición.
            </p>
          )}

          {actionError && (
            <p role="alert" className="order-2 type-small mt-4 text-danger-ink">
              {actionError}
            </p>
          )}

          {state === "empty" ? (
            <FirstMinute
              className="order-1"
              canEdit={canEdit}
              busy={busy}
              onOpenSample={() => void openSamplePlan()}
              onCreateBlank={() => documentNameRef.current?.focus()}
              onImport={(files) => {
                const chosen = splitDocumentSelection([...(files ?? [])]);
                if (chosen)
                  void importDocument(chosen.primary, chosen.sidecars);
              }}
            />
          ) : (
            <section className="order-3 mt-12" aria-labelledby="documentos">
              <h2 id="documentos" className="type-heading">
                Documentos
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {documents.map((document) => (
                  <button
                    key={document.id}
                    onClick={() => router.push(`/studio/${document.id}`)}
                    className={cx(
                      "rounded-card border border-border bg-card p-4 text-left",
                      "transition-[border-color,box-shadow] duration-200 ease-out-expo",
                      "hover:border-primary/50 hover:shadow-elevated",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    )}
                  >
                    <strong className="type-small block font-semibold text-foreground">
                      {document.name}
                    </strong>
                    <span className="type-mono type-micro mt-2 block truncate text-muted-foreground">
                      {document.id}
                    </span>
                  </button>
                ))}
              </div>
              {documents.length === 0 && (
                <p className="type-small mt-4 text-muted-foreground">
                  Este espacio todavía no contiene documentos.
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
