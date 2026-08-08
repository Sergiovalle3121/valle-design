"use client";

/**
 * La línea de comandos.
 *
 * Sustituye a `CadCommandDock`, que a pesar del nombre es un **copiloto en
 * lenguaje natural**: su marcador de posición dice «pasillo 1.2 entre SMT e
 * inspección», su botón principal dice *Preview* y para que algo ocurra hay que
 * pulsar después *Aplicar*. Tres gestos y una lectura donde AutoCAD tiene cero.
 *
 * Esto es lo contrario: se escribe `L`, se pulsa Enter y se dibuja. El prompt y
 * sus opciones se muestran en el mismo renglón —`Precise el punto siguiente o
 * [Cerrar/desHacer]:`— y las opciones son pulsables, porque leerlas y no poder
 * tocarlas es peor que no mostrarlas.
 *
 * Componente **presentacional**: no conoce el motor ni el documento. Recibe el
 * prompt y emite lo tecleado. Así se pueden probar por separado el tacto (aquí)
 * y la semántica (en las specs del motor).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CadPrompt } from "@/lib/cad/engine/command-types";
import { formatCadKeyword, formatCadPrompt } from "@/lib/cad/engine/prompt";

export interface CadCommandLineEntry {
  /** Lo que se escribió, o el prompt que se resolvió. */
  text: string;
  level: "prompt" | "input" | "info" | "error";
}

export interface CadCommandLineProps {
  /** Prompt activo. `null` cuando no hay comando en curso. */
  prompt: CadPrompt | null;
  /** Últimas líneas del diálogo, de la más antigua a la más reciente. */
  history: readonly CadCommandLineEntry[];
  /** Nombre del último comando repetible, para el marcador de posición. */
  lastCommand?: string | null;
  disabled?: boolean;
  onSubmit(value: string): void;
  /** Pulsar una opción equivale a teclear su atajo. */
  onKeyword(keyword: string): void;
  onCancel(): void;
  /** Enter o Espacio con la caja vacía: repetir el último comando. */
  onRepeat(): void;
}

const LEVEL_CLASS: Record<CadCommandLineEntry["level"], string> = {
  prompt: "text-gray-400",
  input: "text-cyan-300",
  info: "text-gray-300",
  error: "text-red-400",
};

export function CadCommandLine({
  prompt,
  history,
  lastCommand,
  disabled,
  onSubmit,
  onKeyword,
  onCancel,
  onRepeat,
}: CadCommandLineProps) {
  const [value, setValue] = useState("");
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  /** Sólo lo tecleado por el usuario se recupera con las flechas. */
  const typed = useMemo(
    () => history.filter((entry) => entry.level === "input").map((entry) => entry.text),
    [history],
  );

  useEffect(() => {
    // El diálogo se lee de abajo arriba, como cualquier consola.
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [history]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Esc con texto escrito lo borra; sin texto, cancela el comando. Es la
        // cascada de AutoCAD: primero se deshace lo tecleado, luego la orden.
        if (value) setValue("");
        else onCancel();
        setRecallIndex(null);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (typed.length === 0) return;
        event.preventDefault();
        const current = recallIndex ?? typed.length;
        const next =
          event.key === "ArrowUp"
            ? Math.max(0, current - 1)
            : Math.min(typed.length, current + 1);
        setRecallIndex(next);
        setValue(next >= typed.length ? "" : typed[next]);
        return;
      }
      if (event.key === "Enter" || (event.key === " " && !value)) {
        event.preventDefault();
        setRecallIndex(null);
        // Con la caja vacía, Enter y Espacio repiten. Es el gesto más usado de
        // AutoCAD y hoy no existe en ningún sitio del editor.
        if (!value.trim()) {
          onRepeat();
          return;
        }
        const submitted = value;
        setValue("");
        onSubmit(submitted);
      }
    },
    [onCancel, onRepeat, onSubmit, recallIndex, typed, value],
  );

  const line = prompt ? formatCadPrompt(prompt) : "";

  return (
    <div
      data-testid="cad-command-line"
      className="pointer-events-auto flex w-full flex-col rounded-lg border border-white/10 bg-[#0b1020]/95 text-[12px] shadow-lg backdrop-blur"
    >
      <div
        ref={logRef}
        data-testid="cad-command-line-log"
        className="max-h-24 overflow-y-auto px-2 py-1 font-mono leading-snug"
      >
        {history.map((entry, index) => (
          <div key={`${index}-${entry.text}`} className={LEVEL_CLASS[entry.level]}>
            {entry.level === "input" ? `> ${entry.text}` : entry.text}
          </div>
        ))}
      </div>

      {prompt && (
        <div className="flex flex-wrap items-center gap-1 border-t border-white/5 px-2 py-1">
          <span data-testid="cad-command-prompt" className="font-mono text-gray-200">
            {line}
          </span>
          {prompt.options.map((option) => (
            <button
              key={option.keyword}
              type="button"
              data-testid={`cad-command-keyword-${option.keyword}`}
              onClick={() => {
                onKeyword(option.shortcut);
                inputRef.current?.focus();
              }}
              className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[11px] text-cyan-200 transition-colors hover:bg-white/10"
              title={`Atajo: ${option.shortcut.toUpperCase()}`}
            >
              {formatCadKeyword(option)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-white/5 px-2 py-1">
        <span className="font-mono text-gray-500">{prompt ? "»" : "Comando:"}</span>
        <input
          ref={inputRef}
          data-testid="cad-command-input"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Línea de comandos CAD"
          placeholder={
            prompt
              ? "coordenada, distancia u opción"
              : lastCommand
                ? `escribe un comando · Espacio repite ${lastCommand}`
                : "escribe un comando (L, C, TR, MI…)"
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-gray-100 outline-none placeholder:text-gray-600"
        />
      </div>
    </div>
  );
}

export default CadCommandLine;
