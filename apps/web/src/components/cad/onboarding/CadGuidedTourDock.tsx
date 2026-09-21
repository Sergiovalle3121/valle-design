"use client";

/**
 * El recorrido guiado, en el muelle izquierdo.
 *
 * ## Por qué se monta en la línea de comandos y se PINTA en el muelle
 *
 * Se monta en `CadCommandLineDock` porque ahí está el anfitrión del motor, que
 * es de donde lee el dibujo, y porque montarlo en `Layout3DEditor.tsx` costaría
 * JSX y un `useState` en un archivo cuyo presupuesto sólo puede bajar. Pero se
 * PINTA, por portal, en el hueco que el muelle izquierdo publica
 * (`tour-slot.ts`): ésa es la columna que no tapa nada.
 *
 * Antes flotaba sobre el lienzo, encima de la línea de comandos, y media caja
 * caía sobre la paleta de herramientas. Como era `pointer-events-none`, pulsar
 * la tarjeta encendía la herramienta de debajo —«Pasillo», «Área», «Ajustar
 * todo»—. Sólo vuelve a flotar cuando el muelle no está a la vista (ventana
 * estrecha, modo enfoque, muelle plegado o apagado), y entonces la tarjeta se
 * queda con sus propios clics: lo que se ve es lo que se pulsa.
 *
 * ## Por qué arranca plegado
 *
 * Porque un recién llegado necesita saber EN QUÉ PASO va, no leer los cinco a
 * la vez encima de su plano. Plegado es una línea —«Primeros cinco minutos» y
 * el paso actual— con el botón para desplegarlo; la elección de la persona se
 * guarda en el registro (`tour-host.ts`) y manda desde entonces.
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
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight, ChevronUp, PartyPopper } from "lucide-react";
import { Button, ProgressBar, cx } from "@/components/ui";
import {
  CAD_GUIDED_TOUR_STEPS,
  cadGuidedTourProgress,
  cadGuidedTourStepCopy,
  formatCadTourDuration,
  type CadTourEvidence,
} from "@/lib/cad/onboarding/guided-tour";
import type { CadCommandDocumentView } from "@/lib/cad/engine/command-types";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { onCadPlotDelivered } from "../command-line/plot-host";
import { cadTourHost, noteCadTourPlot } from "./tour-host";
import { cadTourSlot } from "./tour-slot";

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
  /**
   * Plegado, persistido en el registro del recorrido. La cabecera SIEMPRE se
   * ve — el usuario nunca pierde el hilo de en qué paso va— pero el cuerpo
   * (barra de progreso, lista de pasos) sólo sale cuando se pide. El registro
   * nace plegado (`EMPTY_CAD_TOUR_RECORD`) y lo que el usuario elija se guarda
   * en localStorage: si lo despliega, la próxima vez sigue desplegado.
   */
  const minimized = record.minimized;
  /** El hueco del muelle izquierdo, sólo mientras se ve. `null`: se flota. */
  const slot = useSyncExternalStore(
    cadTourSlot.subscribe,
    cadTourSlot.getSnapshot,
    cadTourSlot.getServerSnapshot,
  );
  const docked = slot !== null;

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
  const card = (
    <section
      data-testid="cad-guided-tour"
      aria-label="Recorrido guiado"
      data-placement={docked ? "dock" : "floating"}
      /*
        QUIÉN SE QUEDA EL RATÓN: la tarjeta entera, siempre.

        Hubo una época en que flotaba sobre el lienzo con `pointer-events-none`
        para no taparle el ratón al plano, y ése fue el defecto: se VEÍA
        encima de la paleta y del dibujo pero los clics la atravesaban, así que
        pulsar el texto del recorrido encendía la herramienta de debajo. Una
        capa que se ve y no se puede pulsar miente sobre lo que hay debajo.

        La salida no era devolverle el puntero a la capa sino quitar la capa
        de encima: en el muelle izquierdo (`data-placement="dock"`) no hay nada
        debajo que tapar. Cuando tiene que flotar —el muelle no se ve—, el
        envoltorio de la línea de comandos es `pointer-events-none` y la
        tarjeta lo reactiva para sí; arranca plegada, así que lo que reclama es
        una franja de una línea, no un tercio del plano. Golden 67.
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
      data-collapsed={minimized ? "true" : "false"}
      className={cx(
        "overflow-y-auto rounded-card border border-border text-popover-foreground",
        // En el muelle es una tarjeta más de la columna, sin sombra de capa
        // flotante: no está encima de nada.
        docked
          ? "m-2 bg-popover"
          : "pointer-events-auto w-full bg-popover/95 shadow-floating backdrop-blur",
        // Un tercio de la pantalla como mucho, en el muelle también: desplegado
        // entero no debe empujar la biblioteca fuera de la ventana.
        minimized ? "p-2" : "max-h-[32vh] p-3.5",
      )}
    >
      {/*
        Dos renglones: arriba el rótulo con los botones, abajo el paso actual a
        todo el ancho. En el muelle (240 px) título y botones no caben en una
        fila: el título se partía en tres renglones y la cabecera «plegada»
        medía casi lo que el cuerpo. Abajo, sólo, el paso cabe en uno.
      */}
      <header className={cx("flex flex-col gap-1", !minimized && "mb-3")}>
        <span className="flex items-center justify-between gap-2">
          <span className="type-eyebrow min-w-0 text-primary-ink">
            Primeros cinco minutos
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {/*
              EL PLIEGUE. Deja sólo la cabecera sin mover ni un dato del
              recorrido. La flecha apunta hacia donde se abrirá el cuerpo:
              hacia abajo en el muelle, hacia arriba cuando flota sobre la
              línea de comandos (ahí crece hacia arriba).
            */}
            <Button
              variant="ghost"
              size="sm"
              data-testid="cad-guided-tour-toggle"
              onClick={() => cadTourHost.dispatch({ type: "minimize", minimized: !minimized })}
              aria-expanded={!minimized}
              title={minimized ? "Mostrar el recorrido guiado" : "Minimizar el recorrido guiado"}
              className="shrink-0 px-1.5"
            >
              {minimized === docked ? (
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              <span className="sr-only">
                {minimized ? "Mostrar el recorrido guiado" : "Minimizar el recorrido guiado"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="cad-guided-tour-skip"
              onClick={() => cadTourHost.dispatch({ type: "skip", now: Date.now() })}
              className="shrink-0"
            >
              Saltar
            </Button>
          </span>
        </span>
        <span
          data-testid="cad-guided-tour-title"
          className="type-small block font-semibold text-foreground"
        >
          {progress.completed
            ? "Recorrido terminado"
            : (() => {
                const current = CAD_GUIDED_TOUR_STEPS.find(
                  (step) => step.id === progress.currentStepId,
                );
                return current
                  ? cadGuidedTourStepCopy(current, evidence).title
                  : "Sigue dibujando";
              })()}
        </span>
      </header>
      {!minimized && (
      <>
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
          const copy = cadGuidedTourStepCopy(step, evidence);
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
                  {copy.title}
                </strong>
                {current ? (
                  <>
                    <span className="type-caption mt-1 block text-muted-foreground">
                      {copy.instruction}
                    </span>
                    <span className="type-micro mt-0.5 block text-muted-foreground">
                      {copy.hint}
                    </span>
                    {step.id === "lamina" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid="cad-guided-tour-acknowledge"
                        onClick={() =>
                          cadTourHost.dispatch({ type: "acknowledge" })
                        }
                        className="mt-2"
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
      </>
      )}
    </section>
  );
  // En el muelle, por portal: el hueco no tiene hijos de React y el árbol de
  // React (eventos, estado, latido) sigue siendo éste.
  return slot ? createPortal(card, slot) : card;
}

export default CadGuidedTourDock;
