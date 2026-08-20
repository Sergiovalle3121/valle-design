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
      className="pointer-events-none max-h-[32vh] overflow-y-auto rounded-xl border border-emerald-400/25 bg-gray-950/95 p-2.5 text-[11px] text-emerald-50 shadow-2xl backdrop-blur"
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
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">
          Primeros cinco minutos · {progress.doneStepIds.length}/{CAD_GUIDED_TOUR_STEPS.length}
        </span>
        <button
          type="button"
          data-testid="cad-guided-tour-skip"
          onClick={() => cadTourHost.dispatch({ type: "skip", now: Date.now() })}
          className="pointer-events-auto rounded-lg border border-white/15 px-2 py-1 text-[10px] text-emerald-100/80 hover:bg-white/10"
        >
          Saltar recorrido
        </button>
      </header>
      <progress
        aria-label="Progreso del recorrido"
        data-testid="cad-guided-tour-progress"
        className="mb-2 w-full"
        max={100}
        value={progress.percent}
      />
      <ol className="grid gap-1">
        {CAD_GUIDED_TOUR_STEPS.map((step) => {
          const done = progress.doneStepIds.includes(step.id);
          const current = progress.currentStepId === step.id;
          return (
            <li
              key={step.id}
              data-testid={`cad-guided-tour-step-${step.id}`}
              data-state={done ? "done" : current ? "current" : "pending"}
              className={
                done
                  ? "flex gap-2 opacity-60 line-through"
                  : current
                    ? "flex gap-2 rounded-lg bg-emerald-400/10 p-1.5"
                    : "flex gap-2 opacity-70"
              }
            >
              <span aria-hidden className="shrink-0">
                {done ? "✓" : current ? "▸" : "·"}
              </span>
              <span className="min-w-0">
                <strong className="block">{step.title}</strong>
                {current ? (
                  <>
                    <span className="block text-emerald-100/85">{step.instruction}</span>
                    <span className="block text-[10px] text-emerald-100/60">{step.hint}</span>
                    {step.id === "lamina" ? (
                      <button
                        type="button"
                        data-testid="cad-guided-tour-acknowledge"
                        onClick={() => cadTourHost.dispatch({ type: "acknowledge" })}
                        className="pointer-events-auto mt-1 rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-emerald-950"
                      >
                        Entendido, a dibujar
                      </button>
                    ) : null}
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {elapsed !== null ? (
        <p data-testid="cad-guided-tour-elapsed" className="mt-2 text-[10px] text-emerald-100/70">
          Llevas {formatCadTourDuration(elapsed)}.
        </p>
      ) : null}
    </section>
  );
}

export default CadGuidedTourDock;
