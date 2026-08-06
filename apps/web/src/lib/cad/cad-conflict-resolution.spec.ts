/**
 * Resolver un conflicto CAS borra trabajo. Cuál, depende de la salida elegida,
 * y el plan tiene que decir exactamente cuál sin margen de interpretación.
 *
 * Lo que se comprueba aquí no es que la fusión funcione —eso lo cubre
 * cad-collaboration— sino las tres reglas que pueden destruir un plano sin que
 * nadie se entere: contra qué versión se guarda, qué pasa con las colisiones
 * sin decidir, y cuándo se puede tirar el borrador de recuperación local.
 */
import { strict as assert } from "node:assert";
import {
  CAD_CONFLICT_CONSEQUENCE,
  planCadConflictResolution,
  summarizeCadConflict,
  type CadConflictInputs,
} from "./cad-conflict-resolution";
import { migrateCadDocument, type CadDocument, type CadEntity } from "./cad-document";

const line = (id: string, x: number): CadEntity =>
  ({
    id,
    type: "line",
    layer: "0",
    a: { x, y: 0, z: 0 },
    b: { x: x + 100, y: 0, z: 0 },
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): CadDocument =>
  migrateCadDocument({
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  } as unknown as CadDocument);

/* Base común: dos entidades. Cada rama toca una distinta → fusión automática. */
const base = doc([line("a", 0), line("b", 1000)]);
const mine = doc([line("a", 50), line("b", 1000)]);
const theirs = doc([line("a", 0), line("b", 1500)]);
const inputs: CadConflictInputs = { base, mine, theirs, theirsVersion: 9 };

/* ── Ediciones disjuntas: se fusionan solas, sin preguntar ───────────────── */
{
  const summary = summarizeCadConflict(inputs);
  assert.equal(summary.collisions.length, 0, "tocar entidades distintas no es una colisión");
  assert.equal(summary.autoMerged, 1, "el cambio del servidor entra solo");
  assert.equal(summary.mergeReady, true);

  const result = planCadConflictResolution("merge", inputs);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("plan esperado");
  const ids = result.plan.document.entities.map((entity) => entity.id).sort();
  assert.deepEqual(ids, ["a", "b"]);
  // Sobrevive lo de cada lado: mi 'a' movida y su 'b' movida.
  const merged = new Map(result.plan.document.entities.map((entity) => [entity.id, entity]));
  assert.equal((merged.get("a") as { a: { x: number } }).a.x, 50, "mi edición sobrevive");
  assert.equal((merged.get("b") as { a: { x: number } }).a.x, 1500, "la suya también");
}

/* ── EL INVARIANTE: se guarda contra la versión del SERVIDOR ─────────────── */
{
  for (const strategy of ["merge", "overwrite"] as const) {
    const result = planCadConflictResolution(strategy, inputs);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("plan esperado");
    assert.equal(
      result.plan.saveAgainstVersion,
      9,
      `${strategy} tiene que reapuntar el CAS a la versión vigente: guardar contra la obsoleta volvería a fallar, y saltárselo dejaría el documento sin control de concurrencia`,
    );
  }
}

/* ── Colisión real: fusionar NO produce plan hasta que se decide ─────────── */
{
  // Ambas ramas mueven la misma entidad.
  const collide: CadConflictInputs = {
    base,
    mine: doc([line("a", 50), line("b", 1000)]),
    theirs: doc([line("a", 90), line("b", 1000)]),
    theirsVersion: 9,
  };
  const summary = summarizeCadConflict(collide);
  assert.equal(summary.collisions.length, 1, "ambos tocaron 'a'");
  assert.deepEqual(summary.unresolved, ["a"]);
  assert.equal(summary.mergeReady, false);

  const blocked = planCadConflictResolution("merge", collide);
  assert.equal(
    blocked.ok,
    false,
    "rellenar la colisión con un lado cualquiera sería descartar trabajo ajeno con cara de éxito",
  );
  if (blocked.ok) throw new Error("no debía haber plan");
  assert.equal(blocked.reason, "unresolved-collisions");
  assert.deepEqual(blocked.unresolved, ["a"]);

  // Decidida, el plan sale y respeta la elección.
  for (const [strategy, expectedX] of [["mine", 50], ["theirs", 90]] as const) {
    const decided = planCadConflictResolution("merge", {
      ...collide,
      resolutions: { a: { strategy } },
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) throw new Error("plan esperado");
    const entity = decided.plan.document.entities.find((item) => item.id === "a");
    assert.equal((entity as unknown as { a: { x: number } }).a.x, expectedX);
  }

  // Y las otras dos salidas no quedan bloqueadas por una colisión: elegirlas
  // ES la decisión.
  assert.equal(planCadConflictResolution("reload", collide).ok, true);
  assert.equal(planCadConflictResolution("overwrite", collide).ok, true);
}

/* ── Recargar no escribe y no puede tirar la recuperación local ──────────── */
{
  const result = planCadConflictResolution("reload", inputs);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("plan esperado");
  assert.equal(
    result.plan.saveAgainstVersion,
    null,
    "recargar adopta lo del servidor: no hay nada que escribir",
  );
  assert.equal(
    result.plan.clearsRecovery,
    false,
    "el journal es lo ÚNICO que queda del trabajo local tras recargar; borrarlo haría falso el aviso",
  );
  assert.deepEqual(
    result.plan.document.entities.map((entity) => entity.id).sort(),
    theirs.entities.map((entity) => entity.id).sort(),
  );
}

/* ── Las salidas que sí llegan al servidor sí pueden tirarlo ─────────────── */
{
  for (const strategy of ["merge", "overwrite"] as const) {
    const result = planCadConflictResolution(strategy, inputs);
    if (!result.ok) throw new Error("plan esperado");
    assert.equal(
      result.plan.clearsRecovery,
      true,
      `${strategy} sube el trabajo local: a partir de ahí el borrador ya no es la única copia`,
    );
  }
}

/* ── Sobrescribir conserva lo mío tal cual, incluido lo que el otro borró ── */
{
  const result = planCadConflictResolution("overwrite", inputs);
  if (!result.ok) throw new Error("plan esperado");
  assert.deepEqual(
    result.plan.document.entities.map((entity) => entity.id).sort(),
    mine.entities.map((entity) => entity.id).sort(),
  );
  const entity = result.plan.document.entities.find((item) => item.id === "b");
  assert.equal(
    (entity as unknown as { a: { x: number } }).a.x,
    1000,
    "sobrescribir descarta lo del servidor: eso es lo que anuncia y lo que hace",
  );
}

/* ── Cada salida declara qué pierde, y ninguna se calla ──────────────────── */
{
  for (const strategy of ["merge", "reload", "overwrite"] as const) {
    assert.ok(
      CAD_CONFLICT_CONSEQUENCE[strategy]?.trim().length,
      `${strategy} tiene que decir qué destruye antes de que alguien la elija`,
    );
  }
  assert.match(CAD_CONFLICT_CONSEQUENCE.reload, /recuperación local/);
  assert.match(CAD_CONFLICT_CONSEQUENCE.overwrite, /otra sesión/);
}

console.log(
  "cad-conflict-resolution: se guarda contra la versión del servidor, las colisiones bloquean la fusión y recargar conserva el borrador local",
);
