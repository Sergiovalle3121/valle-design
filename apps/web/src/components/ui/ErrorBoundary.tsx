"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "./Button";
import { cx } from "./styles";

/**
 * FRONTERA DE ERROR POR ZONA.
 *
 * ## Por qué hace falta habiendo ya `app/error.tsx`
 *
 * `app/error.tsx` cubre la RUTA: cuando algo revienta, sustituye la pantalla
 * entera por la de recuperación. Para la landing o el tablero es lo correcto —
 * no hay nada que salvar detrás. Para el estudio no lo es: si la paleta de
 * propiedades lanza al pintar una entidad rara, el usuario pierde el lienzo, la
 * selección, el historial local y el guardado pendiente, por un fallo que
 * ocurrió en una columna de 320 píxeles.
 *
 * Esta frontera acota el daño al subárbol que envuelve. Lo que se cae se
 * sustituye por su tarjeta de recuperación; lo de al lado sigue vivo.
 *
 * ## Qué NO hace, a propósito
 *
 * No captura errores de manejadores de eventos, ni de `setTimeout`, ni de
 * promesas rechazadas: React sólo llama a `getDerivedStateFromError` para lo
 * que ocurre DURANTE EL RENDER, y ninguna frontera de error de React hace otra
 * cosa. Prometer aquí una red que no existe sería peor que no tenerla, porque
 * nadie buscaría la de verdad. Lo que se lanza fuera del render sigue siendo
 * asunto de quien lo lanza.
 *
 * ## La recuperación
 *
 * `Reintentar` vuelve a montar el subárbol —no recarga la página— porque el
 * fallo suele ser de un dato concreto y remontar con el estado ya corregido
 * basta. El botón de reporte llega **precargado**: la zona, el mensaje y el
 * digest los sabe el programa, y un reporte de fallo llega vacío o no llega.
 */
type Props = {
  /** Nombre humano de la zona. Sale en la tarjeta y en el reporte. */
  zona: string;
  children: React.ReactNode;
  /**
   * Versión de una línea, para paneles estrechos donde una tarjeta con botones
   * no cabe sin romper el layout.
   */
  compacta?: boolean;
  /** Se propaga al reporte cuando la zona vive dentro de un documento. */
  documentId?: string | null;
  /**
   * Efecto lateral al capturar. Existe para telemetría; nunca para arreglar el
   * error — si esto lanza, la frontera queda inútil.
   */
  onError?: (error: Error, zona: string) => void;
  className?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // La consola es la única superficie de diagnóstico del navegador; el
    // `componentStack` es lo que dice QUÉ componente de la zona falló.
    console.error(`[${this.props.zona}] se cayó:`, error, info.componentStack);
    try {
      this.props.onError?.(error, this.props.zona);
    } catch {
      // Un reportero roto no puede tumbar la pantalla de recuperación.
    }
  }

  private reintentar = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { zona, compacta, className } = this.props;

    if (compacta) {
      return (
        <div
          role="alert"
          className={cx(
            "flex items-center justify-between gap-2 rounded-control border border-danger/40 bg-danger/[0.06] px-3 py-2",
            className,
          )}
        >
          <span className="type-small text-danger-ink">
            {zona} no se pudo mostrar.
          </span>
          <Button variant="ghost" size="sm" onClick={this.reintentar}>
            Reintentar
          </Button>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className={cx(
          "rounded-surface border border-danger/40 bg-danger/[0.05] p-5",
          className,
        )}
      >
        <p className="type-eyebrow text-danger-ink">{zona}</p>
        <h2 className="type-heading mt-2">Esta parte se rompió</h2>
        <p className="type-body mt-2 text-muted-foreground">
          El resto de la pantalla sigue funcionando y tu dibujo no se ha tocado:
          esto sólo afectó a lo que se estaba pintando aquí.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={this.reintentar}
            iconLeft={<RotateCcw aria-hidden="true" className="h-4 w-4" />}
          >
            Reintentar
          </Button>
          <ReporteDeFallo
            zona={zona}
            error={error}
            documentId={this.props.documentId}
          />
        </div>
      </div>
    );
  }
}

/**
 * El botón de reporte se carga aparte y sólo cuando ya hay un fallo.
 *
 * El diálogo de comentarios arrastra el cliente de la API y el describidor de
 * navegador. Meterlo estáticamente en esta primitiva metería ese peso en toda
 * pantalla que use una frontera — es decir, en todas. Aquí llega justo cuando
 * hay algo que reportar, que es exactamente cuando el usuario puede esperar
 * doscientos milisegundos.
 */
const FeedbackButtonPerezoso = React.lazy(() =>
  import("@/components/feedback/FeedbackDialog").then((m) => ({
    default: m.FeedbackButton,
  })),
);

function ReporteDeFallo({
  zona,
  error,
  documentId,
}: {
  zona: string;
  error: Error & { digest?: string };
  documentId?: string | null;
}) {
  const mensaje = [
    `Se cayó: ${zona}`,
    "",
    `Error: ${error.message || "(sin mensaje)"}`,
    error.digest ? `Código: ${error.digest}` : null,
    "",
    "Qué estaba haciendo:",
  ]
    .filter((linea) => linea !== null)
    .join("\n");

  return (
    <React.Suspense fallback={null}>
      <FeedbackButtonPerezoso
        documentId={documentId}
        etiqueta="Reportar el fallo"
        claseInicial="falla"
        mensajeInicial={mensaje}
        variant="ghost"
      />
    </React.Suspense>
  );
}
