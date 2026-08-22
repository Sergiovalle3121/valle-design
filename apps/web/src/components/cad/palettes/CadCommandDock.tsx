"use client";

import type { RefObject } from "react";
import { WandSparkles } from "lucide-react";
import { describeCadIntent, type CadIntent } from "@/lib/cad/cad-intent";
import type {
  CadCommandHistoryItem,
  CadCommandPreview,
  CadOperation,
} from "@/lib/cad/commands";
import type { CadCommandSuggestion } from "@/lib/cad/command-line-assist";

export interface CadAiProposal {
  source: "intent" | "optimize";
  intents: CadIntent[];
  descriptions?: string[];
  errors: string[];
  message?: string;
}

export interface CadCommandDockPreview {
  preview: CadCommandPreview;
}

interface CadCommandDockProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  preview: CadCommandDockPreview | null;
  log: CadCommandHistoryItem[];
  suggestions: CadCommandSuggestion[];
  selectionCount: number;
  aiBusy: null | "intent" | "optimize";
  aiProposal: CadAiProposal | null;
  canUndo: boolean;
  canRedo: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onHistory: (direction: "older" | "newer") => void;
  onRepeat: () => void;
  onClearInput: () => void;
  onDismissPreview: () => void;
  onRequestAi: (source: "intent" | "optimize") => void;
  onApplyAi: () => void;
  onDiscardAi: () => void;
  onApplyPreview: () => void;
  onSuggestion: (suggestion: CadCommandSuggestion) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const describeCadPreviewOperation = (
  operation: CadOperation,
): string => {
  switch (operation.type) {
    case "move":
      return `Mover ${operation.objectId} → (${Math.round(operation.after.x)}, ${Math.round(operation.after.y)})`;
    case "create":
      return `Crear ${operation.object.label} en (${Math.round(operation.object.x)}, ${Math.round(operation.object.y)})`;
    case "delete":
      return `Borrar ${operation.objectId}`;
    case "rename":
      return `Renombrar a "${operation.label}"`;
    case "clear_annotations":
      return `Quitar ${operation.kind === "dims" ? "cotas" : operation.kind === "notes" ? "notas" : "anotaciones"}`;
    case "annotate":
      return operation.annotation.kind === "text"
        ? `Texto "${operation.annotation.text}"`
        : `Cota ${operation.annotation.text}`;
    case "connect":
      return `Conectar ${operation.from} → ${operation.to}`;
    case "measure":
      return `Medir ${Math.round(operation.distance)} ${operation.unit}`;
    case "focus":
      return `Enfocar ${operation.objectIds.length || "todo"}`;
    case "history":
      return operation.action === "undo" ? "Deshacer" : "Rehacer";
    case "studio_export":
      return `Exportar ${operation.format.toUpperCase()}`;
    case "studio_view":
      return `Cambiar a vista ${operation.mode.toUpperCase()}`;
    case "studio_save":
      return "Guardar estudio";
    case "report":
      return operation.title;
  }
};

export function CadCommandDock({
  inputRef,
  value,
  preview,
  log,
  suggestions,
  selectionCount,
  aiBusy,
  aiProposal,
  canUndo,
  canRedo,
  onValueChange,
  onSubmit,
  onHistory,
  onRepeat,
  onClearInput,
  onDismissPreview,
  onRequestAi,
  onApplyAi,
  onDiscardAi,
  onApplyPreview,
  onSuggestion,
  onUndo,
  onRedo,
}: CadCommandDockProps) {
  return (
    <div className="border-b border-primary/30 bg-primary/15 p-3">
      <div className="flex items-center gap-2 type-micro font-semibold uppercase tracking-wide text-primary-ink">
        <WandSparkles className="h-3.5 w-3.5" /> Copiloto CAD
      </div>
      <p className="mt-1 type-micro leading-snug text-muted-foreground dark:text-muted-foreground">
        Comandos determinísticos locales (Preview) o interpretación con IA
        (CIDE) — la IA solo propone; tú apruebas.
      </p>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          aria-label="Copiloto CAD en lenguaje natural"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onHistory("older");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onHistory("newer");
            } else if (
              (event.key === "Enter" || event.key === " ") &&
              !value.trim()
            ) {
              event.preventDefault();
              onRepeat();
            } else if (event.key === "Escape") {
              event.preventDefault();
              if (preview) onDismissPreview();
              else onClearInput();
            }
          }}
          placeholder="pasillo 1.2 entre SMT e inspección"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface/80 px-2 py-1.5 type-caption text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/30"
        />
        <button
          type="submit"
          className="rounded-control bg-indigo-500 px-2.5 py-1.5 type-caption font-semibold text-foreground hover:bg-indigo-400"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => onRequestAi("intent")}
          disabled={aiBusy !== null}
          title="Interpreta la instrucción con el motor de IA (CIDE)"
          className="rounded-control bg-violet-600 px-2.5 py-1.5 type-caption font-semibold text-foreground hover:bg-violet-500 disabled:opacity-50"
        >
          {aiBusy === "intent" ? "…" : "IA"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => onRequestAi("optimize")}
        disabled={aiBusy !== null}
        className="mt-1.5 w-full rounded-control border border-violet-400/30 bg-violet-400/[0.08] px-2 py-1.5 type-micro font-semibold text-violet-200 hover:bg-violet-400/[0.14] disabled:opacity-50"
      >
        {aiBusy === "optimize"
          ? "Analizando layout…"
          : "Optimizar recorrido con IA"}
      </button>

      {aiProposal && (
        <div className="mt-2 rounded-card border border-violet-400/25 bg-surface/80 p-2">
          <div className="type-micro font-semibold text-violet-200">
            Propuesta IA ·{" "}
            {aiProposal.source === "intent" ? "instrucción" : "optimización"}
          </div>
          {aiProposal.message && (
            <div className="mt-1 type-micro text-warning-ink">
              {aiProposal.message}
            </div>
          )}
          {aiProposal.intents.slice(0, 6).map((intent, index) => (
            <div
              key={`ai-${index}`}
              className="mt-1 rounded-control bg-muted/40 px-1.5 py-1 type-micro text-foreground"
            >
              {aiProposal.descriptions?.[index] ?? describeCadIntent(intent)}
            </div>
          ))}
          {aiProposal.intents.length > 6 && (
            <div className="mt-1 type-micro text-muted-foreground">
              …y {aiProposal.intents.length - 6} acción(es) más.
            </div>
          )}
          {aiProposal.errors.slice(0, 2).map((error) => (
            <div key={error} className="mt-1 type-micro text-danger-ink">
              Descartada: {error}
            </div>
          ))}
          <div className="mt-2 flex gap-1.5">
            {aiProposal.intents.length > 0 && (
              <button
                type="button"
                onClick={onApplyAi}
                className="rounded-control bg-emerald-700 px-2 py-1 type-micro font-semibold text-foreground hover:bg-emerald-600"
              >
                Aplicar {aiProposal.intents.length}
              </button>
            )}
            <button
              type="button"
              onClick={onDiscardAi}
              className="rounded-control border border-border px-2 py-1 type-micro text-foreground hover:bg-muted"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="mt-2 rounded-card border border-border bg-surface/80 p-2">
          <div className="type-micro font-semibold text-foreground">
            {preview.preview.summary}
          </div>
          <div className="mt-1 type-micro text-muted-foreground dark:text-muted-foreground">
            {preview.preview.affectedObjectIds.length} objeto(s) ·{" "}
            {preview.preview.operations.length} operación(es)
          </div>
          {preview.preview.operations.slice(0, 3).map((operation, index) => (
            <div
              key={`${operation.type}-${index}`}
              className="mt-1 rounded-control bg-muted/40 px-1.5 py-1 type-micro text-foreground"
            >
              {operation.type === "report" ? (
                <div>
                  <div className="font-semibold text-primary-ink">
                    {operation.title}
                  </div>
                  {operation.rows.slice(0, 3).map((row) => (
                    <div
                      key={`${row.label}-${row.value}`}
                      className="mt-0.5 flex justify-between gap-2 text-muted-foreground dark:text-muted-foreground"
                    >
                      <span className="truncate">{row.label}</span>
                      <span className="shrink-0 text-foreground">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                describeCadPreviewOperation(operation)
              )}
            </div>
          ))}
          {preview.preview.issues.slice(0, 2).map((issue) => (
            <div
              key={`${issue.code}-${issue.message}`}
              className={`mt-1 type-micro ${issue.level === "error" ? "text-danger-ink" : issue.level === "warning" ? "text-warning-ink" : "text-primary-ink"}`}
            >
              {issue.message}
            </div>
          ))}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={onApplyPreview}
              className="rounded-control bg-emerald-700 px-2 py-1 type-micro font-semibold text-foreground hover:bg-emerald-600"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={onDismissPreview}
              className="rounded-control border border-border px-2 py-1 type-micro text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDismissPreview}
              className="rounded-control border border-border px-2 py-1 type-micro text-foreground hover:bg-muted"
            >
              Editar
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between type-micro uppercase tracking-wide text-muted-foreground">
            <span>Sugerencias</span>
            <span>{selectionCount} sel</span>
          </div>
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion.id}
              onClick={() => onSuggestion(suggestion)}
              title={suggestion.example}
              className={`w-full rounded-control border px-2 py-1.5 text-left hover:bg-muted/60 ${suggestion.ready ? "border-primary/30 bg-primary/15" : "border-warning/30 bg-warning/15"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate type-micro font-semibold text-foreground">
                  {suggestion.label}
                </span>
                <span
                  className={`shrink-0 type-micro uppercase tracking-wide ${suggestion.ready ? "text-primary-ink" : "text-warning-ink"}`}
                >
                  {suggestion.ready ? "Preview" : "Pendiente"}
                </span>
              </span>
              <span className="mt-0.5 block truncate type-micro text-muted-foreground">
                {suggestion.example}
              </span>
              <span
                className={`mt-0.5 block truncate type-micro ${suggestion.ready ? "text-primary-ink/70" : "text-warning-ink/80"}`}
              >
                {suggestion.reason}
              </span>
            </button>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between type-micro uppercase tracking-wide text-muted-foreground">
            <span>Historial</span>
            <span>{log.length}</span>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="flex-1 rounded-control border border-border px-2 py-1 type-micro text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Deshacer cmd
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="flex-1 rounded-control border border-border px-2 py-1 type-micro text-foreground disabled:opacity-40 hover:bg-muted"
            >
              Rehacer cmd
            </button>
          </div>
          {log.slice(0, 3).map((item) => (
            <div
              key={item.id}
              className="rounded-control bg-muted/40 px-2 py-1 type-micro text-foreground"
            >
              <span
                className={
                  item.status === "failed"
                    ? "text-danger-ink"
                    : item.status === "applied"
                      ? "text-success-ink"
                      : "text-primary-ink"
                }
              >
                {item.status}
              </span>{" "}
              · {item.label}
              {item.durationMs !== undefined ? ` · ${item.durationMs} ms` : ""}
              {item.affectedObjectIds?.length
                ? ` · ${item.affectedObjectIds.length} obj`
                : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
