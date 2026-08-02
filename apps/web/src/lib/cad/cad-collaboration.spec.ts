import { strict as assert } from "node:assert";
import { layoutToCadDocument, type CadDocument, type CadEntity } from "./cad-document";
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
} from "./cad-collaboration";

function drawing(): CadDocument {
  return layoutToCadDocument({ assets: [
    { id: "a", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0, label: "A" },
    { id: "b", kind: "wall", x: 0, y: 50, w: 100, h: 10, rotation: 0, label: "B" },
    { id: "c", kind: "wall", x: 0, y: 100, w: 100, h: 10, rotation: 0, label: "C" },
  ] });
}

function entity(document: CadDocument, id: string): CadEntity {
  return document.entities.find((candidate) => candidate.id === id)!;
}

function replace(document: CadDocument, id: string, patch: Record<string, unknown>): CadDocument {
  const entities = document.entities.map((candidate) => candidate.id === id ? { ...candidate, ...patch } as CadEntity : candidate);
  return { ...document, entities };
}

const base = drawing();
const mine = replace(base, "a", { x: 25 });
const theirs = replace(base, "b", { label: "B theirs" });
const diff = diffCadDocuments(base, { ...theirs, entities: [...theirs.entities.filter((candidate) => candidate.id !== "c"), { ...entity(base, "a"), id: "d" }] });
assert.deepEqual(diff.added.map((row) => row.entityId), ["d"], "added entities are explicit");
assert.deepEqual(diff.deleted.map((row) => row.entityId), ["c"], "deleted entities are explicit");
assert.deepEqual(diff.modified.map((row) => row.entityId), ["b"], "modified entities are explicit");
assert.deepEqual(diff.modified[0].propertyPaths, ["label"], "property changes are separate from geometry");
assert.deepEqual(diffCadDocuments(base, mine).modified[0].geometryPaths, ["x"], "geometry changes are separate from properties");

const disjoint = mergeCadDocuments(base, mine, theirs);
assert.equal(disjoint.unresolved.length, 0, "disjoint changes auto-merge");
assert.deepEqual(disjoint.autoMergedIds, ["b"], "theirs-only entity is auto-merged");
assert.equal((entity(disjoint.document, "a") as Extract<CadEntity, { type: "box" }>).x, 25);
assert.equal((entity(disjoint.document, "b") as Extract<CadEntity, { type: "box" }>).label, "B theirs");

const collidingTheirs = replace(base, "a", { x: 75 });
const rejected = mergeCadDocuments(base, mine, collidingTheirs);
assert.deepEqual(rejected.unresolved, ["a"], "a collision is rejected until explicitly resolved");
assert.equal(rejected.collisions[0].reason, "both_modified");
const keepTheirs = mergeCadDocuments(base, mine, collidingTheirs, { a: { strategy: "theirs" } });
assert.equal((entity(keepTheirs.document, "a") as Extract<CadEntity, { type: "box" }>).x, 75, "keep theirs is exact");
const keepMine = mergeCadDocuments(base, mine, collidingTheirs, { a: { strategy: "mine" } });
assert.equal((entity(keepMine.document, "a") as Extract<CadEntity, { type: "box" }>).x, 25, "keep mine is exact");
const manual = mergeCadDocuments(base, mine, collidingTheirs, { a: { strategy: "manual", entity: { ...entity(base, "a"), x: 50 } as CadEntity } });
assert.equal((entity(manual.document, "a") as Extract<CadEntity, { type: "box" }>).x, 50, "manual merge accepts a reviewed entity");
const deleteModify = mergeCadDocuments(base, { ...base, entities: base.entities.filter((candidate) => candidate.id !== "a") }, collidingTheirs);
assert.equal(deleteModify.collisions[0].reason, "delete_modify", "delete/modify is never silently merged");

let reviewed = createCadVersion(base, { id: "v1", label: "Base", actor: "ana", at: "2026-07-28T20:00:00.000Z" });
reviewed = createCadVersion(reviewed, { id: "v2", label: "Mine", actor: "ana", at: "2026-07-28T20:01:00.000Z" });
assert.equal(reviewed.collaboration?.versions.length, 2, "canonical version history persists snapshots");
assert.equal(cadVersionDocument(reviewed, "v1")?.entities.length, 3, "a version restores full canonical content");
reviewed = addCadReviewThread(reviewed, {
  id: "thread-1", entityId: "a", body: "Move this wall", author: "reviewer", assignedTo: "ana",
  status: "open", createdAt: "2026-07-28T20:02:00.000Z", markup: { kind: "cloud", color: "#f43f5e", point: { x: 25, y: 5 } },
});
assert.equal(reviewed.collaboration?.threads[0].assignedTo, "ana", "comments support assignment and markup");
reviewed = resolveCadReviewThread(reviewed, "thread-1", "ana", "2026-07-28T20:03:00.000Z");
assert.equal(reviewed.collaboration?.threads[0].status, "resolved", "threads resolve with audit identity");
// SESIÓN DE REVISIÓN SERVER-OWNED: el documento guarda METADATO, nunca la
// credencial. `id` es el id de la sesión (`cad_review_sessions`), cuyo token
// sólo existe hasheado en el servidor y viaja por `X-Review-Token`.
reviewed = createCadReviewLink(reviewed, { id: "review-session-1", label: "Client review", readOnly: true, createdAt: "2026-07-28T20:04:00.000Z", createdBy: "ana", expiresAt: "2027-07-28T20:04:00.000Z" });
const issuedLink = reviewed.collaboration!.reviewLinks[0] as unknown as Record<string, unknown>;
assert.equal(issuedLink.id, "review-session-1", "the document references the server review session");
assert.equal("token" in issuedLink, false, "no review link token is ever written into the document");
assert.equal(JSON.stringify(reviewed).includes("tenant-token"), false, "no browser-minted secret survives anywhere in the document");
reviewed = revokeCadReviewLink(reviewed, "link-1", "ana", "2026-07-28T20:06:00.000Z");
assert.equal(reviewed.collaboration?.reviewLinks[0].revokedAt, undefined, "revoking an unknown link id is a no-op");
reviewed = revokeCadReviewLink(reviewed, "review-session-1", "ana", "2026-07-28T20:06:00.000Z");
assert.equal(reviewed.collaboration?.reviewLinks[0].revokedAt, "2026-07-28T20:06:00.000Z", "revocation is mirrored as metadata (the server owns the real revocation)");
assert.ok(reviewed.collaboration?.audit.some((entry) => entry.action === "review_link_revoked"), "revocation is audited");
assert.equal("token" in (reviewed.collaboration!.reviewLinks[0] as unknown as Record<string, unknown>), false, "revocation does not reintroduce a token");
reviewed = auditCadMerge(reviewed, "ana", "2026-07-28T20:08:00.000Z", keepMine);
assert.ok(reviewed.collaboration?.audit.some((entry) => entry.action === "merge_applied"), "merge, comments, links and versions share one audit trail");

console.log("cad collaboration specs passed");
