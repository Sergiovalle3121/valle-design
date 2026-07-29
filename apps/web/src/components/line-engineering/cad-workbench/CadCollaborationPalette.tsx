"use client";

import { useMemo, useState } from "react";
import type { CadDocument, CadEntity, CadReviewLink, CadReviewThread } from "@/lib/cad/cad-document";
import {
  addCadReviewThread,
  auditCadMerge,
  cadVersionDocument,
  createCadReviewLink,
  createCadVersion,
  diffCadDocuments,
  mergeCadDocuments,
  resolveCadReviewThread,
  revokeCadReviewLink,
  type CadEntityDiffRow,
  type CadMergeResolution,
} from "@/lib/cad/cad-collaboration";

interface CadCollaborationPaletteProps {
  document: CadDocument;
  actor: string;
  reviewReadOnly: boolean;
  onDocumentChange(document: CadDocument, label: string): void;
  onVisualize(rows: CadEntityDiffRow[]): void;
  onNavigate(entityId: string): void;
}

type DiffFilter = "all" | "added" | "modified" | "deleted";

const button = "rounded-lg border border-white/10 px-2 py-1 text-[10px] text-gray-200 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35";
const input = "w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-[10.5px] text-white outline-none focus:border-cyan-300/40";

function id(prefix: string) {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function reviewUrl(link: CadReviewLink): string {
  if (typeof window === "undefined") return `?cadReview=${encodeURIComponent(link.token)}`;
  const url = new URL(window.location.href);
  url.searchParams.set("cadReview", link.token);
  return url.toString();
}

function versionOptions(document: CadDocument) {
  return [
    ...(document.collaboration?.versions ?? []).map((version) => ({ id: version.id, label: `${version.label} · ${version.contentHash}` })),
    { id: "current", label: `Current · v${document.meta.version}` },
  ];
}

export function CadCollaborationPalette({
  document,
  actor,
  reviewReadOnly,
  onDocumentChange,
  onVisualize,
  onNavigate,
}: CadCollaborationPaletteProps) {
  const versions = versionOptions(document);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [baseId, setBaseId] = useState(versions[0]?.id ?? "current");
  const [mineId, setMineId] = useState(versions.at(-2)?.id ?? "current");
  const [theirsId, setTheirsId] = useState("current");
  const [filter, setFilter] = useState<DiffFilter>("all");
  const [cursor, setCursor] = useState(0);
  const [resolutions, setResolutions] = useState<Record<string, CadMergeResolution>>({});
  const [manualJson, setManualJson] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [markup, setMarkup] = useState<"note" | "arrow" | "cloud">("cloud");
  const [linkLabel, setLinkLabel] = useState("Authenticated design review");

  const base = cadVersionDocument(document, baseId) ?? document;
  const mine = cadVersionDocument(document, mineId) ?? document;
  const theirs = cadVersionDocument(document, theirsId) ?? document;
  const diff = useMemo(() => diffCadDocuments(mine, theirs), [mine, theirs]);
  const rows = filter === "all" ? diff.rows : diff[filter];
  const selected = rows.length ? rows[Math.min(cursor, rows.length - 1)] : null;
  const merge = useMemo(
    () => mergeCadDocuments(base, mine, theirs, resolutions),
    [base, mine, resolutions, theirs],
  );
  const collaboration = document.collaboration;

  const mutate = (next: CadDocument, label: string) => {
    onDocumentChange(next, label);
    setMessage(label);
  };
  const checkpoint = () => {
    const at = new Date().toISOString();
    const label = checkpointLabel.trim() || `Checkpoint ${new Date(at).toLocaleString()}`;
    mutate(createCadVersion(document, { id: id("version"), label, actor, at }), `Version created: ${label}`);
    setCheckpointLabel("");
  };
  const choose = (entityId: string, resolution: CadMergeResolution) => {
    setResolutions((current) => ({ ...current, [entityId]: resolution }));
  };
  const parseManual = (entityId: string) => {
    try {
      const raw = JSON.parse(manualJson[entityId] ?? "null") as CadEntity | null;
      if (raw !== null && (!raw || typeof raw !== "object" || raw.id !== entityId || typeof raw.type !== "string"))
        throw new Error("The manual entity must preserve id and type.");
      choose(entityId, { strategy: "manual", entity: raw });
      setMessage(`Manual resolution staged for ${entityId}.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Invalid manual entity JSON.");
    }
  };
  const applyMerge = () => {
    if (merge.unresolved.length) {
      setMessage(`${merge.unresolved.length} collision(s) remain unresolved; merge rejected.`);
      return;
    }
    const at = new Date().toISOString();
    mutate(auditCadMerge({ ...merge.document, collaboration: document.collaboration }, actor, at, merge), `Three-way merge applied · ${merge.autoMergedIds.length} auto · ${merge.appliedResolutions.length} reviewed`);
    setResolutions({});
  };
  const addThread = () => {
    if (!commentBody.trim()) return;
    const at = new Date().toISOString();
    const thread: CadReviewThread = {
      id: id("thread"),
      ...(selected ? { entityId: selected.entityId } : {}),
      body: commentBody.trim().slice(0, 1_000),
      author: actor,
      ...(assignee.trim() ? { assignedTo: assignee.trim().slice(0, 160) } : {}),
      status: "open",
      createdAt: at,
      markup: { kind: markup, color: "#f43f5e" },
    };
    mutate(addCadReviewThread(document, thread), `Review comment added${thread.entityId ? ` · ${thread.entityId}` : ""}`);
    setCommentBody("");
  };
  const createLink = () => {
    const at = new Date().toISOString();
    const link: CadReviewLink = {
      id: id("review"),
      token: id("token"),
      label: linkLabel.trim().slice(0, 100) || "Authenticated design review",
      readOnly: true,
      createdAt: at,
      createdBy: actor,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
    mutate(createCadReviewLink(document, link), `Read-only review link created · ${link.label}`);
  };
  const copyLink = async (link: CadReviewLink) => {
    try {
      await navigator.clipboard.writeText(reviewUrl(link));
      setMessage("Authenticated, tenant-scoped review URL copied.");
    } catch {
      setMessage(reviewUrl(link));
    }
  };
  const moveCursor = (delta: number) => {
    if (!rows.length) return;
    const next = (cursor + delta + rows.length) % rows.length;
    setCursor(next);
    onNavigate(rows[next].entityId);
  };

  return (
    <div data-testid="cad-collaboration-palette" data-cad-review-allowed className="h-full overflow-y-auto p-3 text-[10.5px] text-gray-300">
      <div className="flex items-start justify-between gap-2">
        <div><strong className="text-cyan-100">COMPARE / MERGE / REVIEW</strong><p className="mt-0.5 text-[9px] text-gray-500">Canonical entities · tenant CAS · immutable server audit on save</p></div>
        {reviewReadOnly && <span data-testid="cad-review-readonly" className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[9px] text-amber-200">READ ONLY</span>}
      </div>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-center justify-between"><strong className="text-gray-100">Version history</strong><span className="text-gray-500">{collaboration?.versions.length ?? 0}/12</span></div>
        <div className="mt-2 flex gap-1"><input data-testid="cad-version-label" value={checkpointLabel} onChange={(event) => setCheckpointLabel(event.target.value)} placeholder="Checkpoint label" className={input} /><button data-testid="cad-version-create" disabled={reviewReadOnly} onClick={checkpoint} className={`${button} shrink-0 border-cyan-300/20 text-cyan-100`}>Capture current</button></div>
        <div className="mt-2 space-y-1">{[...(collaboration?.versions ?? [])].reverse().slice(0, 4).map((version) => <div key={version.id} className="flex justify-between gap-2 text-[9px] text-gray-500"><span className="truncate">{version.label}</span><span className="font-mono">{version.contentHash}</span></div>)}</div>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {([['Base', baseId, setBaseId], ['Mine', mineId, setMineId], ['Theirs', theirsId, setTheirsId]] as const).map(([label, value, setter]) => <label key={label} className="text-[9px] text-gray-500">{label}<select data-testid={`cad-merge-${label.toLowerCase()}`} value={value} onChange={(event) => { setter(event.target.value); setResolutions({}); setCursor(0); }} className={`${input} mt-1`}>{versions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</select></label>)}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">{(['all', 'added', 'modified', 'deleted'] as const).map((kind) => <button key={kind} data-testid={`cad-diff-filter-${kind}`} onClick={() => { setFilter(kind); setCursor(0); }} className={`${button} ${filter === kind ? 'border-violet-300/30 bg-violet-400/10 text-violet-100' : ''}`}>{kind} {kind === 'all' ? diff.rows.length : diff[kind].length}</button>)}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button data-testid="cad-diff-overlay" disabled={!rows.length} onClick={() => onVisualize(rows)} className={button}>Visual overlay</button>
          <div className="flex items-center gap-1"><button disabled={!rows.length} onClick={() => moveCursor(-1)} className={button}>Prev</button><span data-testid="cad-diff-cursor" className="min-w-12 text-center text-[9px] text-gray-500">{rows.length ? `${Math.min(cursor + 1, rows.length)}/${rows.length}` : '0/0'}</span><button disabled={!rows.length} onClick={() => moveCursor(1)} className={button}>Next</button></div>
        </div>
        {selected ? <article data-testid="cad-diff-selected" className="mt-2 rounded-lg border border-violet-300/15 bg-violet-400/[0.06] p-2">
          <div className="flex justify-between"><strong className="text-violet-100">{selected.change.toUpperCase()} · {selected.entityType}</strong><button onClick={() => onNavigate(selected.entityId)} className="font-mono text-cyan-200 hover:text-white">{selected.entityId}</button></div>
          <div className="mt-1 text-[9px] text-gray-400">Geometry: {selected.geometryPaths.join(', ') || '—'}</div><div className="mt-0.5 text-[9px] text-gray-400">Properties: {selected.propertyPaths.join(', ') || '—'}</div>
        </article> : <div className="mt-2 rounded-lg border border-dashed border-white/10 p-3 text-center text-gray-500">Mine and theirs are identical.</div>}
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex justify-between"><strong className="text-gray-100">Three-way merge</strong><span data-testid="cad-merge-summary" className={merge.unresolved.length ? 'text-rose-200' : 'text-emerald-200'}>{merge.autoMergedIds.length} auto · {merge.collisions.length} collision · {merge.unresolved.length} unresolved</span></div>
        {merge.collisions.map((collision) => <article key={collision.entityId} data-testid={`cad-merge-conflict-${collision.entityId}`} className="mt-2 rounded-lg border border-rose-300/20 bg-rose-400/[0.06] p-2">
          <div className="flex justify-between"><strong className="text-rose-100">{collision.entityId}</strong><span className="text-[9px] text-rose-200">{collision.reason}</span></div>
          <div className="mt-1 text-[9px] text-gray-500">Mine: {collision.minePaths.join(', ') || 'deleted'}<br />Theirs: {collision.theirsPaths.join(', ') || 'deleted'}</div>
          <div className="mt-2 grid grid-cols-3 gap-1"><button onClick={() => choose(collision.entityId, { strategy: 'mine' })} className={`${button} ${resolutions[collision.entityId]?.strategy === 'mine' ? 'bg-cyan-400/15 text-cyan-100' : ''}`}>Keep mine</button><button onClick={() => choose(collision.entityId, { strategy: 'theirs' })} className={`${button} ${resolutions[collision.entityId]?.strategy === 'theirs' ? 'bg-cyan-400/15 text-cyan-100' : ''}`}>Keep theirs</button><button onClick={() => setResolutions((current) => { const next = { ...current }; delete next[collision.entityId]; return next; })} className={button}>Reject / reset</button></div>
          <textarea value={manualJson[collision.entityId] ?? JSON.stringify(collision.mine ?? null, null, 2)} onChange={(event) => setManualJson((current) => ({ ...current, [collision.entityId]: event.target.value }))} rows={3} className={`${input} mt-2 font-mono text-[9px]`} /><button onClick={() => parseManual(collision.entityId)} className={`${button} mt-1 w-full`}>Stage manual merge</button>
        </article>)}
        <button data-testid="cad-merge-apply" disabled={reviewReadOnly || merge.unresolved.length > 0 || (!merge.autoMergedIds.length && !merge.appliedResolutions.length)} onClick={applyMerge} className="mt-2 w-full rounded-lg bg-emerald-500 px-2 py-1.5 font-semibold text-gray-950 disabled:cursor-not-allowed disabled:opacity-35">Apply atomic merge</button>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex justify-between"><strong className="text-gray-100">Comments & markups</strong><span className="text-gray-500">{collaboration?.threads.filter((thread) => thread.status === 'open').length ?? 0} open</span></div>
        <textarea data-testid="cad-review-comment" disabled={reviewReadOnly} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} rows={2} placeholder={selected ? `Comment on ${selected.entityId}` : 'Drawing-level comment'} className={`${input} mt-2`} />
        <div className="mt-1 grid grid-cols-[1fr_90px_58px] gap-1"><input disabled={reviewReadOnly} value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Assign to" className={input} /><select data-testid="cad-review-markup" disabled={reviewReadOnly} value={markup} onChange={(event) => setMarkup(event.target.value as typeof markup)} className={input}><option value="cloud">Cloud</option><option value="arrow">Arrow</option><option value="note">Note</option></select><button data-testid="cad-review-add" disabled={reviewReadOnly || !commentBody.trim()} onClick={addThread} className={button}>Add</button></div>
        <div className="mt-2 space-y-1.5">{[...(collaboration?.threads ?? [])].reverse().slice(0, 10).map((thread) => <article key={thread.id} className={`rounded-lg border p-2 ${thread.status === 'open' ? 'border-amber-300/15 bg-amber-400/[0.05]' : 'border-white/10 opacity-60'}`}><div className="flex justify-between gap-2"><span className="truncate text-gray-100">{thread.entityId ?? 'Drawing'} · {thread.markup?.kind ?? 'comment'}</span><span className="text-[9px] text-gray-500">{thread.status}</span></div><p className="mt-1 text-[10px] text-gray-300">{thread.body}</p><div className="mt-1 flex items-center justify-between text-[9px] text-gray-500"><span>{thread.author}{thread.assignedTo ? ` → ${thread.assignedTo}` : ''}</span>{thread.status === 'open' && <button disabled={reviewReadOnly} onClick={() => mutate(resolveCadReviewThread(document, thread.id, actor, new Date().toISOString()), `Comment resolved · ${thread.entityId ?? 'drawing'}`)} className="text-emerald-200 hover:text-white disabled:opacity-40">Resolve</button>}</div></article>)}</div>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex justify-between"><strong className="text-gray-100">Read-only review links</strong><span className="text-gray-500">tenant-authenticated · 7 days</span></div>
        <div className="mt-2 flex gap-1"><input disabled={reviewReadOnly} value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} className={input} /><button data-testid="cad-review-link-create" disabled={reviewReadOnly} onClick={createLink} className={`${button} shrink-0`}>Create</button></div>
        <div className="mt-2 space-y-1">{[...(collaboration?.reviewLinks ?? [])].reverse().map((link) => <div key={link.id} className="flex items-center gap-1 rounded-lg border border-white/10 p-1.5"><span className={`min-w-0 flex-1 truncate ${link.revokedAt ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{link.label}</span><button disabled={!!link.revokedAt} onClick={() => void copyLink(link)} className={button}>Copy</button><button disabled={reviewReadOnly || !!link.revokedAt} onClick={() => mutate(revokeCadReviewLink(document, link.id, actor, new Date().toISOString()), `Review link revoked · ${link.label}`)} className={`${button} text-rose-200`}>Revoke</button></div>)}</div>
      </section>

      <section className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"><div className="flex justify-between"><strong className="text-gray-100">Audit</strong><span className="text-gray-500">{collaboration?.audit.length ?? 0} event(s)</span></div><div className="mt-2 space-y-1">{[...(collaboration?.audit ?? [])].reverse().slice(0, 12).map((entry) => <div key={entry.id} className="border-l border-cyan-300/20 pl-2 text-[9px]"><div className="text-gray-300">{entry.action} · {entry.actor}</div><div className="truncate text-gray-500">{entry.detail}</div></div>)}</div></section>
      {message && <div data-testid="cad-collaboration-message" className="sticky bottom-2 mt-3 rounded-lg border border-cyan-300/20 bg-gray-950/95 px-2 py-1.5 text-cyan-100 shadow-xl">{message}</div>}
    </div>
  );
}
