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
 * - identity: userId/tenantId del JWT de Platform (claves de storage del
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

import React, { useCallback, useMemo } from "react";
import Layout3DEditor, {
  type Layout3DEditorPlatformProps,
  type Layout3DEditorProps,
} from "@/components/line-engineering/Layout3DEditor";
import { useToast } from "@/contexts/ToastContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
import { BRAND } from "@/config/brand";

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
};

const noopFullscreenChange: NonNullable<
  Layout3DEditorPlatformProps["onFullscreenChange"]
> = () => undefined;

export default function CadStudioHost({
  documentId,
  projectId,
  ...props
}: CadStudioHostProps) {
  const toast = useToast();
  const { user, tenantId } = useDesignAuth();
  const { resolvedScheme } = useTheme();

  const identity = useMemo<
    NonNullable<Layout3DEditorPlatformProps["identity"]>
  >(
    () => ({ userId: user?.id, tenantId: tenantId ?? undefined }),
    [user?.id, tenantId],
  );

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
    <Layout3DEditor
      {...props}
      model={documentId ?? props.model}
      identity={identity}
      scope={scope}
      theme={resolvedScheme}
      onNotify={onNotify}
      onFullscreenChange={noopFullscreenChange}
      branding={branding}
      // Edición Design pura: sin paneles de análisis industrial (WP6).
    />
  );
}
