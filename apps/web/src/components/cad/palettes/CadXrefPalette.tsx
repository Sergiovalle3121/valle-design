"use client";

import { useState } from "react";
import type { CadExternalReference } from "@/lib/cad/cad-document";
import type {
  CadXrefGraph,
  CadXrefVersionComparison,
} from "@/lib/cad/cad-xrefs";

export interface CadXrefAttachDraft {
  assetId: string;
  revision: string;
  name: string;
  mode: "attachment" | "overlay";
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface CadXrefPaletteProps {
  references: CadExternalReference[];
  graph: CadXrefGraph;
  defaultPoint: { x: number; y: number };
  onAttach(draft: CadXrefAttachDraft): Promise<void>;
  onCompare(
    reference: CadExternalReference,
  ): Promise<CadXrefVersionComparison | null>;
  onReload(reference: CadExternalReference): Promise<void>;
  onUnload(id: string): void;
  onDetach(id: string): void;
  onBind(id: string): void;
}

const tone: Record<string, string> = {
  loaded: "border-success/30 bg-success/15 text-success-ink",
  unloaded: "border-gray-300/15 bg-muted/40 text-foreground",
  stale: "border-warning/30 bg-warning/15 text-warning-ink",
  missing: "border-danger/30 bg-danger/15 text-danger-ink",
  denied: "border-danger/30 bg-danger/15 text-danger-ink",
  cycle: "border-danger/30 bg-danger/15 text-danger-ink",
  depth_exceeded: "border-danger/30 bg-danger/15 text-danger-ink",
};

export function CadXrefPalette(props: CadXrefPaletteProps) {
  const [draft, setDraft] = useState<CadXrefAttachDraft>({
    assetId: "",
    revision: "UNIVERSAL",
    name: "",
    mode: "attachment",
    x: props.defaultPoint.x,
    y: props.defaultPoint.y,
    scale: 1,
    rotation: 0,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [comparison, setComparison] = useState<CadXrefVersionComparison | null>(
    null,
  );
  const input =
    "mt-1 w-full rounded border border-border bg-black/30 px-2 py-1 text-foreground outline-none focus:border-primary/30";
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la operación Xref.",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <div
      data-testid="cad-xref-palette"
      className="h-full overflow-y-auto p-3 type-micro"
    >
      <div className="flex items-center justify-between">
        <strong className="text-primary-ink">EXTERNAL REFERENCES</strong>
        <span className="text-muted-foreground">{props.references.length} linked</span>
      </div>
      <p className="mt-1 type-micro leading-relaxed text-muted-foreground">
        Referencias a layouts del mismo tenant. Nunca se persisten rutas locales
        del navegador.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-card border border-border bg-muted/40 p-2.5">
        <label className="text-muted-foreground">
          Asset / model
          <input
            data-testid="cad-xref-asset"
            value={draft.assetId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                assetId: event.target.value.slice(0, 96),
              }))
            }
            placeholder="PLANT-ARCH"
            className={input}
          />
        </label>
        <label className="text-muted-foreground">
          Revision
          <input
            data-testid="cad-xref-revision"
            value={draft.revision}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                revision: event.target.value.slice(0, 64),
              }))
            }
            className={input}
          />
        </label>
        <label className="text-muted-foreground">
          Display name
          <input
            data-testid="cad-xref-name"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value.slice(0, 80),
              }))
            }
            placeholder={draft.assetId || "Reference"}
            className={input}
          />
        </label>
        <label className="text-muted-foreground">
          Type
          <select
            data-testid="cad-xref-mode"
            value={draft.mode}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                mode: event.target.value as CadXrefAttachDraft["mode"],
              }))
            }
            className={input}
          >
            <option value="attachment">Attachment</option>
            <option value="overlay">Overlay</option>
          </select>
        </label>
        {(["x", "y", "scale", "rotation"] as const).map((key) => (
          <label key={key} className="text-muted-foreground">
            {key}
            <input
              data-testid={`cad-xref-${key}`}
              type="number"
              value={draft[key]}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [key]: Number(event.target.value) || 0,
                }))
              }
              className={input}
            />
          </label>
        ))}
        <button
          data-testid="cad-xref-attach"
          disabled={
            busy !== null ||
            !draft.assetId.trim() ||
            !draft.revision.trim() ||
            draft.scale <= 0
          }
          onClick={() =>
            void run("attach", () =>
              props.onAttach({
                ...draft,
                assetId: draft.assetId.trim(),
                revision: draft.revision.trim(),
                name: draft.name.trim() || draft.assetId.trim(),
              }),
            )
          }
          className="col-span-2 rounded-control bg-indigo-500 px-3 py-1.5 font-semibold text-gray-950 disabled:opacity-40"
        >
          {busy === "attach" ? "Resolving tenant asset…" : "Attach tenant Xref"}
        </button>
      </div>
      {message && (
        <div
          data-testid="cad-xref-message"
          className="mt-2 rounded-control border border-danger/30 bg-danger/15 px-2 py-1.5 text-rose-100"
        >
          {message}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {props.references.map((reference) => {
          const status =
            reference.status ?? (reference.loaded ? "loaded" : "unloaded");
          return (
            <article
              key={reference.id}
              data-testid={`cad-xref-row-${reference.assetId ?? reference.id}`}
              className="rounded-card border border-border bg-surface/80 p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-foreground">
                    {reference.name}
                  </strong>
                  <span className="block truncate type-micro text-muted-foreground">
                    {reference.relativePath ?? reference.uri}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-1.5 py-0.5 type-micro ${tone[status] ?? tone.unloaded}`}
                >
                  {status}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 type-micro text-muted-foreground">
                <span>{reference.mode ?? "attachment"}</span>
                <span>v{reference.sourceVersion ?? 0}</span>
                <span>{reference.contentHash?.slice(0, 10) ?? "no hash"}</span>
              </div>
              {reference.error && (
                <p className="mt-1 type-micro text-danger-ink">
                  {reference.error}
                </p>
              )}
              <div className="mt-2 grid grid-cols-5 gap-1">
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`compare:${reference.id}`, async () =>
                      setComparison(await props.onCompare(reference)),
                    )
                  }
                  className="rounded border border-border px-1 py-1 text-foreground disabled:opacity-30"
                >
                  Compare
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    void run(`reload:${reference.id}`, () =>
                      props.onReload(reference),
                    )
                  }
                  className="rounded border border-primary/30 px-1 py-1 text-primary-ink disabled:opacity-30"
                >
                  {reference.loaded ? "Reload" : "Load"}
                </button>
                <button
                  disabled={!reference.loaded || busy !== null}
                  onClick={() => props.onUnload(reference.id)}
                  className="rounded border border-border px-1 py-1 text-foreground disabled:opacity-30"
                >
                  Unload
                </button>
                <button
                  disabled={!reference.loaded || busy !== null}
                  onClick={() => props.onBind(reference.id)}
                  className="rounded border border-warning/30 px-1 py-1 text-warning-ink disabled:opacity-30"
                >
                  Bind
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() => props.onDetach(reference.id)}
                  className="rounded border border-danger/30 px-1 py-1 text-danger-ink disabled:opacity-30"
                >
                  Detach
                </button>
              </div>
            </article>
          );
        })}
        {!props.references.length && (
          <div className="rounded-card border border-dashed border-border p-4 text-center text-muted-foreground">
            No tenant Xrefs attached.
          </div>
        )}
      </div>

      {comparison && (
        <div
          data-testid="cad-xref-comparison"
          className="mt-3 rounded-card border border-violet-300/20 bg-violet-400/[0.08] p-2 text-violet-100"
        >
          <strong>
            Version compare {comparison.currentVersion} →{" "}
            {comparison.incomingVersion}
          </strong>
          <div className="mt-1 grid grid-cols-3 type-micro">
            <span>+{comparison.added.length} added</span>
            <span>~{comparison.modified.length} modified</span>
            <span>−{comparison.deleted.length} deleted</span>
          </div>
          <div className="mt-1 type-micro text-violet-200/70">
            {comparison.currentHash.slice(0, 10)} →{" "}
            {comparison.incomingHash.slice(0, 10)}
          </div>
        </div>
      )}
      <div
        data-testid="cad-xref-graph"
        className="mt-3 rounded-card border border-border bg-muted/40 p-2"
      >
        <div className="flex justify-between">
          <strong className="text-foreground">Dependency graph</strong>
          <span className="text-muted-foreground">
            depth {props.graph.maxDepth}/{8}
          </span>
        </div>
        {props.graph.edges.map((edge, index) => (
          <div
            key={`${edge.from}:${edge.to}:${index}`}
            className="mt-1 font-mono type-micro text-muted-foreground"
          >
            {edge.from} → {edge.to} [{edge.mode}]
          </div>
        ))}
        {props.graph.issues.map((issue, index) => (
          <div
            key={`${issue.code}:${index}`}
            className="mt-1 type-micro text-danger-ink"
          >
            {issue.code}: {issue.detail}
          </div>
        ))}
      </div>
      <p className="mt-2 type-micro leading-relaxed text-muted-foreground">
        Publish incluye sólo referencias cargadas mediante BLOCK/INSERT
        vectorial. DXF conserva esa proyección como BLOCK/INSERT; Bind la
        convierte en geometría local editable.
      </p>
    </div>
  );
}
