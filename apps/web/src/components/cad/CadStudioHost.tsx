"use client";

/**
 * CadStudioHost — adaptador DESIGN del editor CAD (equivalente al
 * `Layout3DEditorHost` enterprise, que quedó en el origen).
 *
 * El editor (`Layout3DEditor`) es agnóstico de plataforma: recibe identidad,
 * alcance, tema, notificaciones y marca por props
 * (`Layout3DEditorPlatformProps`). Este Host lee los providers de la
 * plataforma Design (DesignAuth/Theme/Toast) y los inyecta:
 *
 * - identity: userId/tenantId de la sesión y membresía first-party (claves de storage del
 *   workspace CAD, recovery local y scoping de la biblioteca de bloques).
 * - scope: el proyecto CAD lo pasa la página (en Design no hay
 *   building/project enterprise; el alcance ES el proyecto de dibujo).
 * - theme/onNotify: ThemeContext + ToastContext de Design (mapeo 1:1).
 * - branding: Valle Design (legalEntityName desde el manifiesto/env).
 * - SIN `analysisPanels`: edición Design pura. Los 17 paneles industriales
 *   son ENTERPRISE_OWNED; sin descriptores el menú "Análisis" no se
 *   renderiza y los comandos de análisis del kernel degradan con su aviso
 *   (`analysis_pack_missing`, cubierto por analysis-extensions.spec).
 * - onFullscreenChange: no-op — el estudio Design no tiene chrome que ocultar.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Layout3DEditor, {
  type Layout3DEditorPlatformProps,
  type Layout3DEditorProps,
} from "@/components/cad/editor/Layout3DEditor";
import { useToast } from "@/contexts/ToastContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import StudioCollaborationLayer from "@/components/cad/collab/StudioCollaborationLayer";
import TeamMessagingHost from "@/components/cad/messaging/TeamMessagingHost";
import { CallBar } from "@/components/cad/calls/CallBar";
import { BRAND } from "@/config/brand";
import { ErrorBoundary } from "@/components/ui";
import { cadTourHost } from "@/components/cad/onboarding/tour-host";
import { createDesignDocumentPort } from "@/components/cad/document-lifecycle/design-port";
import {
  wrapDocumentPortForCrashRecovery,
  writeCrashRecovery,
  type LastSavedSnapshot,
} from "@/components/cad/document-lifecycle/crash-recovery-port";
import type { CadRecoveryScope } from "@/lib/cad/cad-recovery";
import { EditorCrashRecoveryAction } from "@/components/cad/studio/EditorCrashRecoveryAction";

/** Props del Host: las del editor SIN las de plataforma (las inyecta el Host),
 *  más el proyecto CAD que define el alcance de trabajo en Design. */
export type CadStudioHostProps = Omit<
  Layout3DEditorProps,
  keyof Layout3DEditorPlatformProps
> & {
  /** ID canónico del documento. En rutas nuevas sustituye cualquier alias legacy. */
  documentId?: string;
  /** Proyecto CAD activo (alcance de recovery/historial). */
  projectId?: string;
  /** Puerto de documentos alternativo (modo demostración). Se reexpone aquí
   *  porque es prop de plataforma y el Omit de arriba la recorta. */
  documentPort?: Layout3DEditorPlatformProps["documentPort"];
  /** La capa de colaboración pide presencia y comentarios por red; en el modo
   *  demostración no hay documento en la nube contra el que colaborar. */
  withCollaboration?: boolean;
};

const noopFullscreenChange: NonNullable<
  Layout3DEditorPlatformProps["onFullscreenChange"]
> = () => undefined;

export default function CadStudioHost({
  documentId,
  projectId,
  readOnly,
  documentPort,
  withCollaboration = true,
  ...props
}: CadStudioHostProps) {
  const toast = useToast();
  const { user, tenantId, permissions } = useDesignAuth();
  const { resolvedScheme } = useTheme();
  const effectiveReadOnly = readOnly ?? !permissions.includes("cad:edit");

  const identity = useMemo<
    NonNullable<Layout3DEditorPlatformProps["identity"]>
  >(
    () => ({ userId: user?.id, tenantId: tenantId ?? undefined }),
    [user?.id, tenantId],
  );

  // El recorrido guiado se ata AQUÍ porque aquí vive la identidad. «Ya vi el
  // recorrido» es de esta persona: sin la clave por usuario, el segundo
  // arquitecto de un estudio que comparte máquina hereda el «ya lo vi» del
  // primero y se queda sin los cinco minutos que deciden si se queda.
  useEffect(() => {
    cadTourHost.attach(user?.id ?? null);
  }, [user?.id]);

  // En Design el alcance es el proyecto CAD (sin buildingId enterprise).
  const scope = useMemo<NonNullable<Layout3DEditorPlatformProps["scope"]>>(
    () => ({ projectId }),
    [projectId],
  );

  const branding = useMemo<
    NonNullable<Layout3DEditorPlatformProps["branding"]>
  >(
    () => ({
      brandName: "Valle Design",
      legalEntityName: BRAND.legalEntityName,
      productLabel: "Valle Design",
    }),
    [],
  );

  const onNotify = useCallback<
    NonNullable<Layout3DEditorPlatformProps["onNotify"]>
  >(
    (level, message, title) => {
      toast[level](message, title);
    },
    [toast],
  );

  // T-72(h): el editor era lo único del estudio sin ErrorBoundary. La cadena
  // de abajo cierra ese hueco sin tocar Layout3DEditor.tsx (§5.3): el puerto
  // de documentos —la única puerta de red del editor— se envuelve para
  // guardar una copia del último documento que de verdad viajó al servidor,
  // y si el editor se cae, la frontera escribe esa copia en el diario de
  // recuperación (IndexedDB) y ofrece descargarla en DXF. Es un segundo
  // intento, fuera del monolito, para el caso en que la caída ocurrió antes
  // de que la cola interna del editor alcanzara a escribir un checkpoint —
  // y NO debe suplantar a ese checkpoint cuando sí existe: por eso el
  // registro se sella con la hora del guardado que capturó y no con la de la
  // caída (`writeCrashRecovery`, revisión de T-72h). Sellado con la hora de
  // la caída era el más nuevo del carril y `loadCadRecovery` devolvía el
  // documento ya guardado en vez del checkpoint con las ediciones perdidas.
  const crashSnapshotRef = useRef<LastSavedSnapshot | null>(null);
  const onSaveContent = useCallback((snapshot: LastSavedSnapshot) => {
    crashSnapshotRef.current = snapshot;
  }, []);
  const effectiveDocumentPort = useMemo(
    () => wrapDocumentPortForCrashRecovery(documentPort ?? createDesignDocumentPort(), onSaveContent),
    [documentPort, onSaveContent],
  );

  const userId = user?.id;
  const recoveryScope = useMemo<CadRecoveryScope | null>(
    () =>
      tenantId && userId
        ? {
            tenantId,
            userId,
            projectId,
            model: documentId ?? props.model,
            revision: props.revision,
          }
        : null,
    [documentId, projectId, props.model, props.revision, tenantId, userId],
  );

  const handleEditorCrash = useCallback(() => {
    const snapshot = crashSnapshotRef.current;
    if (!recoveryScope || !snapshot) return;
    // `cad-recovery.ts` llega por `import()`, no estático: el gate de
    // presupuesto de bytes cazó que esta única llamada —que sólo se ejecuta
    // si el editor se cae— subía el JS de primera carga del estudio para
    // toda visita, se caiga o no. Fuego y olvido: si esto también falla, la
    // frontera de error ya se está pintando de todos modos.
    void import("@/lib/cad/cad-recovery")
      .then(({ saveCadRecovery }) => writeCrashRecovery(saveCadRecovery, recoveryScope, snapshot))
      .catch(() => undefined);
  }, [recoveryScope]);

  return (
    // T-73(e): axe marca `page-has-heading-one` y `region` (moderate) sin
    // que este gate hoy reprobara por ellos — el estudio no tenía NI un
    // `<h1>` ni un solo landmark, así que TODO su contenido (editor,
    // colaboración, mensajería, llamada) quedaba fuera de cualquier región
    // para un lector de pantalla. Se resuelve aquí, fuera del monolito:
    // `<main>` con `display: contents` no añade ninguna caja nueva al
    // layout (cero riesgo visual, cero golden roto) y el `<h1>` va oculto
    // visualmente (`sr-only`) porque el título YA lo dice el navegador y la
    // barra de estado — repetirlo en pantalla sería ruido, pero un lector de
    // pantalla sin él no tiene ningún encabezado del que partir.
    <main className="contents" aria-label="Estudio de dibujo">
      <h1 className="sr-only">Editor de planos — Valle Design</h1>
      <ErrorBoundary zona="El editor" documentId={documentId} onError={handleEditorCrash} extraActions={<EditorCrashRecoveryAction scope={recoveryScope} />}>
        <Layout3DEditor
          {...props}
          documentId={documentId}
          readOnly={effectiveReadOnly}
          model={documentId ?? props.model}
          identity={identity}
          scope={scope}
          theme={resolvedScheme}
          onNotify={onNotify}
          onFullscreenChange={noopFullscreenChange}
          branding={branding}
          documentPort={effectiveDocumentPort}
          // Edición Design pura: sin paneles de análisis industrial (WP6).
        />
      </ErrorBoundary>
      {/*
        La colaboración se monta AL LADO del editor, no dentro. Se engancha a
        su lienzo por el registro de viewport (`viewport-registry.ts`), así que
        el monolito no tiene que saber que existe — que es lo que permite
        crecer aquí sin tocar un archivo con trinquete de tamaño. Sin
        `documentId` no hay documento contra el que comentar (rutas legacy y
        sentinel), y entonces no se monta nada.
      */}
      {documentId && withCollaboration ? (
        // La capa de colaboración va dentro de su propia frontera: se alimenta
        // de datos de OTROS usuarios —comentarios, presencia, revisiones— que
        // llegan por red y no los controla este cliente. Un comentario con una
        // forma inesperada tumbaba hasta aquí el estudio entero, dibujo
        // incluido. Ahora se cae la capa y el lienzo sigue.
        <ErrorBoundary zona="Colaboración" documentId={documentId} compacta>
          <StudioCollaborationLayer
            documentId={documentId}
            viewerName={user?.email ?? "Yo"}
            canReview={permissions.includes("cad:review")}
          />
        </ErrorBoundary>
      ) : null}
      {/*
        La mensajería de equipo es de PROYECTO/ORGANIZACIÓN, no de documento:
        se monta con la misma condición que la colaboración de revisión
        (sin red en modo demostración) pero no depende de `documentId`, sólo
        de tener sesión. Su propio ErrorBoundary la aísla igual que a la
        colaboración: un mensaje con forma inesperada no debe tumbar el
        lienzo.
      */}
      {withCollaboration && user?.id ? (
        <ErrorBoundary zona="Mensajería" documentId={documentId} compacta>
          <TeamMessagingHost
            projectId={projectId}
            viewerUserId={user.id}
            canWrite={permissions.includes("cad:edit")}
          />
        </ErrorBoundary>
      ) : null}
      {/*
        Mismo trato que la colaboración y que la mensajería: la llamada vive AL
        LADO del editor, no dentro — se monta con una línea, y una
        `RTCPeerConnection` que revienta por una razón de red no puede llevarse
        el lienzo con ella.
      */}
      {documentId && withCollaboration ? (
        <ErrorBoundary zona="Llamada" documentId={documentId} compacta>
          <CallBar documentId={documentId} displayName={user?.email} />
        </ErrorBoundary>
      ) : null}
    </main>
  );
}
