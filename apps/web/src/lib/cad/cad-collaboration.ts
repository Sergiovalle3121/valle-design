import {
  serializeCadDocument,
  type CadCollaborationAuditEvent,
  type CadCollaborationState,
  type CadDocument,
  type CadEntity,
  type CadReviewLink,
  type CadReviewThread,
  type CadVersionSnapshot,
} from "./cad-document";

export type CadEntityChangeKind = "added" | "modified" | "deleted";

export interface CadEntityDiffRow {
  entityId: string;
  entityType: string;
  change: CadEntityChangeKind;
  geometryPaths: string[];
  propertyPaths: string[];
  before?: CadEntity;
  after?: CadEntity;
}

export interface CadDocumentDiff {
  added: CadEntityDiffRow[];
  modified: CadEntityDiffRow[];
  deleted: CadEntityDiffRow[];
  rows: CadEntityDiffRow[];
}

export interface CadMergeCollision {
  entityId: string;
  entityType: string;
  reason: "both_added" | "both_modified" | "delete_modify";
  base?: CadEntity;
  mine?: CadEntity;
  theirs?: CadEntity;
  minePaths: string[];
  theirsPaths: string[];
}

export type CadMergeResolution =
  | { strategy: "mine" }
  | { strategy: "theirs" }
  | { strategy: "manual"; entity: CadEntity | null };

export interface CadMergeResult {
  document: CadDocument;
  autoMergedIds: string[];
  collisions: CadMergeCollision[];
  unresolved: string[];
  appliedResolutions: string[];
}

const GEOMETRY_KEYS = new Set([
  "x", "y", "z", "w", "h", "rotation", "a", "b", "c", "center",
  "radius", "startAngle", "endAngle", "majorAxis", "ratio", "points",
  "vertices", "leaderLines", "controlPoints", "fitPoints", "knots",
  "weights", "insertion", "scale", "textPosition", "boundaryLoops",
]);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function changedPaths(left: unknown, right: unknown, prefix = ""): string[] {
  if (same(left, right)) return [];
  if (
    !left || !right || typeof left !== "object" || typeof right !== "object" ||
    Array.isArray(left) || Array.isArray(right)
  ) return [prefix || "value"];
  const keys = new Set([
    ...Object.keys(left as Record<string, unknown>),
    ...Object.keys(right as Record<string, unknown>),
  ]);
  return [...keys]
    .sort()
    .flatMap((key) => changedPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ));
}

function splitPaths(paths: string[]) {
  const geometryPaths: string[] = [];
  const propertyPaths: string[] = [];
  for (const path of paths) {
    const root = path.split(".")[0].replace(/\[.*$/, "");
    (GEOMETRY_KEYS.has(root) ? geometryPaths : propertyPaths).push(path);
  }
  return { geometryPaths, propertyPaths };
}

function entityMap(document: CadDocument): Map<string, CadEntity> {
  return new Map(document.entities.map((entity) => [entity.id, entity]));
}

function row(
  entityId: string,
  change: CadEntityChangeKind,
  before?: CadEntity,
  after?: CadEntity,
): CadEntityDiffRow {
  const paths = change === "modified" ? changedPaths(before, after).filter((path) => path !== "id") : [];
  return {
    entityId,
    entityType: after?.type ?? before?.type ?? "unknown",
    change,
    ...splitPaths(paths),
    ...(before ? { before: structuredClone(before) } : {}),
    ...(after ? { after: structuredClone(after) } : {}),
  };
}

export function diffCadDocuments(before: CadDocument, after: CadDocument): CadDocumentDiff {
  const left = entityMap(before);
  const right = entityMap(after);
  const rows: CadEntityDiffRow[] = [];
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const id of ids) {
    const a = left.get(id);
    const b = right.get(id);
    if (!a && b) rows.push(row(id, "added", undefined, b));
    else if (a && !b) rows.push(row(id, "deleted", a));
    else if (a && b && !same(a, b)) rows.push(row(id, "modified", a, b));
  }
  return {
    added: rows.filter((candidate) => candidate.change === "added"),
    modified: rows.filter((candidate) => candidate.change === "modified"),
    deleted: rows.filter((candidate) => candidate.change === "deleted"),
    rows,
  };
}

function entityChanged(base: CadEntity | undefined, candidate: CadEntity | undefined): boolean {
  return !same(base, candidate);
}

function collisionReason(
  base: CadEntity | undefined,
  mine: CadEntity | undefined,
  theirs: CadEntity | undefined,
): CadMergeCollision["reason"] {
  if (!base) return "both_added";
  if (!mine || !theirs) return "delete_modify";
  return "both_modified";
}

/**
 * Entity-granular three-way merge. Disjoint edits merge automatically; the
 * result refuses to silently choose when both branches changed one entity.
 */
export function mergeCadDocuments(
  baseDocument: CadDocument,
  mineDocument: CadDocument,
  theirsDocument: CadDocument,
  resolutions: Record<string, CadMergeResolution> = {},
): CadMergeResult {
  const base = entityMap(baseDocument);
  const mine = entityMap(mineDocument);
  const theirs = entityMap(theirsDocument);
  const merged = new Map(mine);
  const autoMergedIds: string[] = [];
  const appliedResolutions: string[] = [];
  const collisions: CadMergeCollision[] = [];
  const unresolved: string[] = [];
  const ids = [...new Set([...base.keys(), ...mine.keys(), ...theirs.keys()])].sort();

  for (const id of ids) {
    const baseEntity = base.get(id);
    const mineEntity = mine.get(id);
    const theirsEntity = theirs.get(id);
    const mineChanged = entityChanged(baseEntity, mineEntity);
    const theirsChanged = entityChanged(baseEntity, theirsEntity);
    if (!theirsChanged) continue;
    if (!mineChanged || same(mineEntity, theirsEntity)) {
      if (theirsEntity) merged.set(id, structuredClone(theirsEntity));
      else merged.delete(id);
      autoMergedIds.push(id);
      continue;
    }
    const conflict: CadMergeCollision = {
      entityId: id,
      entityType: mineEntity?.type ?? theirsEntity?.type ?? baseEntity?.type ?? "unknown",
      reason: collisionReason(baseEntity, mineEntity, theirsEntity),
      ...(baseEntity ? { base: structuredClone(baseEntity) } : {}),
      ...(mineEntity ? { mine: structuredClone(mineEntity) } : {}),
      ...(theirsEntity ? { theirs: structuredClone(theirsEntity) } : {}),
      minePaths: changedPaths(baseEntity, mineEntity),
      theirsPaths: changedPaths(baseEntity, theirsEntity),
    };
    collisions.push(conflict);
    const resolution = resolutions[id];
    if (!resolution) {
      unresolved.push(id);
      continue;
    }
    const chosen = resolution.strategy === "mine"
      ? mineEntity
      : resolution.strategy === "theirs"
        ? theirsEntity
        : resolution.entity ?? undefined;
    if (chosen) merged.set(id, structuredClone(chosen));
    else merged.delete(id);
    appliedResolutions.push(id);
  }

  const entities = [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
  return {
    document: {
      ...structuredClone(mineDocument),
      entities,
      modelSpace: { entityIds: entities.map((entity) => entity.id) },
    },
    autoMergedIds,
    collisions,
    unresolved,
    appliedResolutions,
  };
}

export function emptyCadCollaboration(): CadCollaborationState {
  return { versions: [], threads: [], reviewLinks: [], audit: [] };
}

function collaboration(document: CadDocument): CadCollaborationState {
  const current = document.collaboration ?? emptyCadCollaboration();
  return {
    versions: [...(current.versions ?? [])],
    threads: [...(current.threads ?? [])],
    reviewLinks: [...(current.reviewLinks ?? [])],
    audit: [...(current.audit ?? [])],
  };
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashCadVersion(document: CadDocument): string {
  return hashText(serializeCadDocument({ ...document, collaboration: undefined }));
}

function event(
  input: Omit<CadCollaborationAuditEvent, "id"> & { id?: string },
): CadCollaborationAuditEvent {
  return { ...input, id: input.id ?? `audit-${input.at}-${input.action}` };
}

function appendAudit(state: CadCollaborationState, entry: CadCollaborationAuditEvent) {
  return { ...state, audit: [...state.audit, entry].slice(-500) };
}

export function createCadVersion(
  document: CadDocument,
  input: { id: string; label: string; actor: string; at: string },
): CadDocument {
  const state = collaboration(document);
  const snapshot: CadVersionSnapshot = {
    id: input.id,
    label: input.label.slice(0, 100),
    createdAt: input.at,
    createdBy: input.actor,
    contentHash: hashCadVersion(document),
    document: structuredClone({ ...document, collaboration: undefined }),
  };
  const next = appendAudit(
    { ...state, versions: [...state.versions.filter((item) => item.id !== snapshot.id), snapshot].slice(-12) },
    event({ action: "version_created", actor: input.actor, at: input.at, detail: `${snapshot.label} · ${snapshot.contentHash}`, id: `${input.id}:audit` }),
  );
  return { ...document, collaboration: next };
}

export function cadVersionDocument(document: CadDocument, versionId: string): CadDocument | null {
  if (versionId === "current") return structuredClone(document);
  const version = document.collaboration?.versions.find((candidate) => candidate.id === versionId);
  return version ? { ...structuredClone(version.document), collaboration: structuredClone(document.collaboration) } : null;
}

export function addCadReviewThread(
  document: CadDocument,
  thread: CadReviewThread,
): CadDocument {
  const state = collaboration(document);
  const next = appendAudit(
    { ...state, threads: [...state.threads.filter((item) => item.id !== thread.id), structuredClone(thread)].slice(-500) },
    event({ action: "comment_added", actor: thread.author, at: thread.createdAt, detail: thread.body.slice(0, 160), entityIds: thread.entityId ? [thread.entityId] : undefined, id: `${thread.id}:added` }),
  );
  return { ...document, collaboration: next };
}

export function resolveCadReviewThread(
  document: CadDocument,
  threadId: string,
  actor: string,
  at: string,
): CadDocument {
  const state = collaboration(document);
  const target = state.threads.find((thread) => thread.id === threadId);
  if (!target || target.status === "resolved") return document;
  const threads = state.threads.map((thread) => thread.id === threadId
    ? { ...thread, status: "resolved" as const, resolvedAt: at, resolvedBy: actor }
    : thread);
  return {
    ...document,
    collaboration: appendAudit(
      { ...state, threads },
      event({ action: "comment_resolved", actor, at, detail: target.body.slice(0, 160), entityIds: target.entityId ? [target.entityId] : undefined, id: `${threadId}:resolved:${at}` }),
    ),
  };
}

/**
 * Registra en el documento el METADATO de un review link creado en el
 * SERVIDOR. `link` no lleva —ni puede llevar— token: el navegador ya no genera
 * credenciales de compartición (lo hacía y las persistía aquí en claro, en
 * paralelo a `cad_review_sessions.token_hash`; ver
 * `cad-document-validation.ts` y la migración de purga).
 */
export function createCadReviewLink(document: CadDocument, link: CadReviewLink): CadDocument {
  const state = collaboration(document);
  return {
    ...document,
    collaboration: appendAudit(
      { ...state, reviewLinks: [...state.reviewLinks.filter((item) => item.id !== link.id), structuredClone(link)].slice(-20) },
      event({ action: "review_link_created", actor: link.createdBy, at: link.createdAt, detail: `${link.label} · tenant-authenticated · read-only`, id: `${link.id}:created` }),
    ),
  };
}

export function revokeCadReviewLink(
  document: CadDocument,
  linkId: string,
  actor: string,
  at: string,
): CadDocument {
  const state = collaboration(document);
  const target = state.reviewLinks.find((link) => link.id === linkId);
  if (!target || target.revokedAt) return document;
  return {
    ...document,
    collaboration: appendAudit(
      { ...state, reviewLinks: state.reviewLinks.map((link) => link.id === linkId ? { ...link, revokedAt: at } : link) },
      event({ action: "review_link_revoked", actor, at, detail: target.label, id: `${linkId}:revoked:${at}` }),
    ),
  };
}

export function auditCadMerge(
  document: CadDocument,
  actor: string,
  at: string,
  result: CadMergeResult,
): CadDocument {
  const state = collaboration(document);
  const ids = [...new Set([...result.autoMergedIds, ...result.appliedResolutions])];
  return {
    ...document,
    collaboration: appendAudit(
      state,
      event({ action: "merge_applied", actor, at, detail: `${result.autoMergedIds.length} auto · ${result.appliedResolutions.length} resolved · ${result.collisions.length} collisions`, entityIds: ids, id: `merge:${at}` }),
    ),
  };
}

/**
 * ELIMINADO a propósito: `cadReviewLinkIsActive(document, token)`.
 *
 * Decidía en el NAVEGADOR si un token de review era válido comparándolo con
 * los tokens que el propio documento traía en claro. Eso exigía persistir el
 * secreto en el JSON (fuente de verdad paralela e insegura) y además la
 * "autorización" era cosmética: el servidor no participaba. La vigencia de un
 * review link —hash, expiración y revocación— la resuelve HOY el backend en
 * CADA request (`GET /v1/cad/review/context` con `X-Review-Token`), que es el
 * único que conoce `cad_review_sessions`.
 */
