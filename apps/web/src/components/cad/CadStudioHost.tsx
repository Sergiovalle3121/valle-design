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

import React, { useCallback, useEffect, useMemo } from "react";
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

  return (
    <>
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
        documentPort={documentPort}
        // Edición Design pura: sin paneles de análisis industrial (WP6).
      />
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
        Mismo trato que la colaboración: la llamada vive AL LADO del editor,
        no dentro — se monta con una línea y una `RTCPeerConnection` que
        revienta por una razón de red no puede llevarse el lienzo con ella.
      */}
      {documentId && withCollaboration ? (
        <ErrorBoundary zona="Llamada" documentId={documentId} compacta>
          <CallBar documentId={documentId} displayName={user?.email} />
        </ErrorBoundary>
      ) : null}
    </>
  );
}
