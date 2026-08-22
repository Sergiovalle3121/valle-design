"use client";

/**
 * El recorrido guiado, encima del diálogo de comandos.
 *
 * ## Por qué se monta AQUÍ y no en el editor
 *
 * Porque montarlo en `Layout3DEditor.tsx` costaría JSX y un `useState` en un
 * archivo cuyo presupuesto sólo puede bajar. Se cuelga de `CadCommandLineDock`,
 * que ya vive fuera del monolito, exactamente como hace la consola AutoLISP.
 * El editor no se entera de que existe.
 *
 * ## Cómo sabe por dónde va
 *
 * No cuenta clics: lee el DIBUJO. El anfitrión del motor expone una vista de
 * sólo lectura y el recorrido pregunta «¿hay un muro?, ¿hay una puerta?, ¿hay
 * una cota?». Así da igual que la puerta se colocara desde la paleta, tecleando
 * `I` o arrastrándola: las tres cuentan, porque las tres dejan el mismo plano.
 *
 * El trazado es la excepción —trazar no cambia el dibujo— y llega por el aviso
 * que el anfitrión de trazado emite cuando el PDF YA está entregado.
 *
 * ## Por qué hay un temporizador
 *
 * El diálogo de comandos sólo se vuelve a pintar cuando pasa algo POR ÉL. Una
 * puerta colocada desde la paleta no lo despierta, y el recorrido se quedaría
 * diciendo «todavía no» delante de una puerta ya puesta. Un latido de 700 ms
 * mientras el recorrido está abierto lo resuelve sin obligar al monolito a
 * avisar de nada, y se apaga en cuanto el recorrido se cierra.
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronRight, PartyPopper } from "lucide-react";
import { Button, ProgressBar, cx } from "@/components/ui";
import {
  CAD_GUIDED_TOUR_STEPS,
  cadGuidedTourProgress,
  formatCadTourDuration,
  type CadTourEvidence,
} from "@/lib/cad/onboarding/guided-tour";
import type { CadCommandDocumentView } from "@/lib/cad/engine/command-types";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { onCadPlotDelivered } from "../command-line/plot-host";
import { cadTourHost, noteCadTourPlot } from "./tour-host";

/** Latido del acompañante. Sólo late mientras el recorrido está abierto. */
const HEARTBEAT_MS = 700;

export interface CadGuidedTourDockProps {
  host: CadCommandEngineHost;
  /** En sólo lectura no hay recorrido: no se puede dibujar nada. */
  disabled?: boolean;
}

/**
 * Quién ATA el almacén al usuario: `CadStudioHost`, que es donde vive la
 * identidad. Aquí no se hace porque el diálogo de comandos lo monta el editor y
 * el editor no puede recibir una prop más sin engordar.
 */
export function CadGuidedTourDock({ host, disabled }: CadGuidedTourDockProps) {
  const record = useSyncExternalStore(
    cadTourHost.subscribe,
    cadTourHost.getSnapshot,
    cadTourHost.getSnapshot,
  );
  /**
   * Lo que el recorrido ve del dibujo, releído en cada latido. Se guarda en
   * estado y no se lee en el render porque leerlo en el render haría que el
   * componente pintara cosas distintas sin que React lo supiera.
   */
  const [seen, setSeen] = useState<{
    document: CadCommandDocumentView | null;
    now: number;
  }>({ document: null, now: 0 });

  // El aviso de trazado se escucha SIEMPRE que el recorrido esté vivo, esté o no
  // desplegado: alguien puede plegar el panel, trazar y volver a abrirlo.
  useEffect(() => onCadPlotDelivered(() => noteCadTourPlot()), []);

  const open = !disabled && (record.status === "pending" || record.status === "running");

  useEffect(() => {
    if (!open) return;
    const read = () => setSeen({ document: host.documentView(), now: Date.now() });
    read();
    const timer = window.setInterval(read, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [open, host]);

  const evidence = useMemo<CadTourEvidence>(
    () => ({
      document: seen.document,
      plotted: record.plotted,
      acknowledged: record.acknowledged,
    }),
    [seen.document, record.plotted, record.acknowledged],
  );
  const progress = useMemo(() => cadGuidedTourProgress(evidence), [evidence]);

  // Terminar es un efecto del progreso, no de un botón: el recorrido se cierra
  // solo cuando el PDF ya salió. Pedirle al usuario que además pulse «he
  // terminado» sería un paso más después del que importaba.
  useEffect(() => {
    if (open && progress.completed) cadTourHost.dispatch({ type: "complete", now: Date.now() });
  }, [open, progress.completed]);

  useEffect(() => {
    if (open && record.status === "pending")
      cadTourHost.dispatch({ type: "start", now: Date.now() });
  }, [open, record.status]);

  if (!open) return null;

  // Mientras corre no hay `finishedAt`, así que el transcurrido se mide contra
  // el último latido. `cadGuidedTourDuration` es para el registro CERRADO.
  const elapsed = record.startedAt > 0 && seen.now > record.startedAt
    ? seen.now - record.startedAt
    : null;
  return (
    <section
      data-testid="cad-guided-tour"
      aria-label="Recorrido guiado"
      /*
        QUIÉN SE QUEDA EL RATÓN, y por qué el panel entero ya no.

        El envoltorio del muelle de comandos es `pointer-events-none` a
        propósito —flota sobre la barra inferior y taparía Undo—, así que cada
        control que quiera ratón lo reactiva por su cuenta. Este panel lo hacía
        ENTERO, y eso lo convertía en un telón: medido con
        `elementsFromPoint`, en una ventana de 1.280×720 el acompañante cubría
        el CENTRO del lienzo, y el editor dejaba de ver el ratón ahí —el HUD de
        coordenadas se quedaba en blanco y con él la captura a objeto, la banda
        elástica y cualquier clic de dibujo—. Un acompañante que impide dibujar
        es peor que ninguno.

        Ahora el ratón lo reclaman sólo los CONTROLES —el botón «Saltar
        recorrido» y el botón del paso—, no las filas que los envuelven: un
        contenedor de ancho completo que reclama el puntero es el mismo telón en
        pequeño. El resto del panel se ve, se lee y deja pasar el puntero al
        plano. Y la altura baja a un tercio de la pantalla: en una tableta,
        medio viewport de acompañante es medio plano menos.
      */
      /*
        5.5 · LA PIEL, no la lógica. La lógica de este acompañante es lo mejor
        del código —lee el DIBUJO, no cuenta clics— y no se toca ni una línea.
        Lo que cambia es que se veía como un panel verde de 11 px con viñetas de
        texto («✓», «▸», «·») y una `<progress>` sin estilar, que en Windows se
        pinta como una barra verde chata y en macOS como una pastilla azul: el
        mismo producto con tres apariencias según el equipo del cliente.

        Ahora es una tarjeta del sistema, con la barra de progreso de las
        primitivas y iconos en vez de caracteres. El verde desaparece del
        contenedor: era el color de «correcto» gastado en un panel entero, y por
        eso los pasos ya terminados no destacaban dentro de él.
      */
      className="pointer-events-none max-h-[32vh] w-full overflow-y-auto rounded-card border border-border bg-popover/95 p-3.5 text-popover-foreground shadow-floating backdrop-blur"
    >
      {/*
        La cabecera NO reclama el ratón: sólo su botón.

        `pointer-events-auto` en una fila `flex` de ancho completo no deja pasar
        el puntero por el TÍTULO ni por el hueco entre el título y el botón, y
        eso convierte la cabecera en una PERSIANA de 458×25 px flotando sobre el
        plano —medido con `elementsFromPoint`: en 1.280×720 se comía la banda
        donde el golden 28 busca el punto medio y el 40 designa el arco—. Peor
        aún, la persiana se MUEVE: el panel es bottom-anchored sobre el diálogo
        de comandos, así que crece hacia arriba cada vez que el diálogo suma una
        línea, y la banda muerta cae cada vez a una altura distinta del lienzo.

        Un botón de 83 px sí puede reclamarlo; la fila que lo contiene, no.
      */}
      <header className="mb-3 flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="type-eyebrow block text-primary-ink">
            Primeros cinco minutos
          </span>
          <span className="type-small mt-1 block font-semibold text-foreground">
            {progress.completed
              ? "Recorrido terminado"
              : (CAD_GUIDED_TOUR_STEPS.find(
                  (step) => step.id === progress.currentStepId,
                )?.title ?? "Sigue dibujando")}
          </span>
        </span>
        {/* Sólo el BOTÓN reclama el puntero, nunca la fila que lo envuelve:
            ver la nota de arriba sobre el telón. */}
        <Button
          variant="ghost"
          size="sm"
          data-testid="cad-guided-tour-skip"
          onClick={() => cadTourHost.dispatch({ type: "skip", now: Date.now() })}
          className="pointer-events-auto shrink-0"
        >
          Saltar
        </Button>
      </header>
      <ProgressBar
        data-testid="cad-guided-tour-progress"
        value={progress.doneStepIds.length}
        max={CAD_GUIDED_TOUR_STEPS.length}
        showCount
        tone={progress.completed ? "success" : "brand"}
        label="Progreso del recorrido"
        className="mb-3"
      />
      <ol className="grid gap-0.5">
        {CAD_GUIDED_TOUR_STEPS.map((step) => {
          const done = progress.doneStepIds.includes(step.id);
          const current = progress.currentStepId === step.id;
          return (
            <li
              key={step.id}
              data-testid={`cad-guided-tour-step-${step.id}`}
              data-state={done ? "done" : current ? "current" : "pending"}
              className={cx(
                "flex gap-2.5 rounded-control px-2 py-1.5",
                current && "bg-primary/10",
              )}
            >
              {/*
                El estado se lee por ICONO y por color, no tachando el texto.
                Un `line-through` sobre un paso terminado lo vuelve más difícil
                de leer justo cuando el usuario quiere confirmar QUÉ terminó.
              */}
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                {done ? (
                  <Check className="h-3.5 w-3.5 text-success-ink" />
                ) : current ? (
                  <ChevronRight className="h-3.5 w-3.5 text-primary-ink" />
                ) : (
                  <span className="block h-3.5 w-3.5 rounded-full border border-border" />
                )}
              </span>
              <span className="min-w-0">
                <strong
                  className={cx(
                    "type-caption block font-semibold",
                    done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.title}
                </strong>
                {current ? (
                  <>
                    <span className="type-caption mt-1 block text-muted-foreground">
                      {step.instruction}
                    </span>
                    <span className="type-micro mt-0.5 block text-muted-foreground">
                      {step.hint}
                    </span>
                    {step.id === "lamina" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid="cad-guided-tour-acknowledge"
                        onClick={() =>
                          cadTourHost.dispatch({ type: "acknowledge" })
                        }
                        className="pointer-events-auto mt-2"
                      >
                        Entendido, a dibujar
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {/*
        LA CELEBRACIÓN ES DISCRETA a propósito. El recorrido se cierra solo
        cuando el PDF ya salió, así que este bloque se ve durante el último
        latido: una confirmación breve, no una fanfarria que tape el plano que
        el usuario acaba de terminar.
      */}
      {progress.completed ? (
        <p
          data-testid="cad-guided-tour-done"
          className="type-caption mt-3 flex items-center gap-2 rounded-control border border-success/25 bg-success/10 px-2.5 py-2 text-success-ink"
        >
          <PartyPopper aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            Ya entregaste una lámina completa
            {elapsed !== null ? ` en ${formatCadTourDuration(elapsed)}` : ""}.
          </span>
        </p>
      ) : elapsed !== null ? (
        <p
          data-testid="cad-guided-tour-elapsed"
          className="type-micro mt-3 text-muted-foreground"
        >
          Llevas {formatCadTourDuration(elapsed)}.
        </p>
      ) : null}
    </section>
  );
}

export default CadGuidedTourDock;
