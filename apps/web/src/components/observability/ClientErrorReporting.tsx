"use client";

import { useEffect } from "react";
import { browserErrorReporter, toClientErrorReport } from "@/lib/observability/client-error-reporter";

/**
 * Escucha lo que ninguna frontera de React ve: excepciones de manejadores de
 * eventos, de `setTimeout` y promesas rechazadas sin `catch`. Sin
 * `NEXT_PUBLIC_SENTRY_DSN` no registra nada — ni un listener.
 */
export function ClientErrorReporting() {
  useEffect(() => {
    const reporter = browserErrorReporter();
    if (!reporter) return;
    const onError = (event: ErrorEvent) => {
      reporter.report(toClientErrorReport(event.error ?? event.message, "window.error"));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reporter.report(toClientErrorReport(event.reason, "unhandledrejection"));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
