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

/**
 * LINE de verdad: `start`/`end`, que es como la declara el esquema canónico.
 * El fixture anterior escribía `{a,b}` y lo pasaba por `as unknown as
 * CadEntity` — o sea, comprobaba la fusión sobre una entidad que el producto
 * no acepta, y ninguna de estas aserciones tocaba geometría real.
 */
const line = (id: string, x: number): Extract<CadEntity, { type: "line" }> => ({
  id,
  type: "line",
  layer: "0",
  start: { x, y: 0, z: 0 },
  end: { x: x + 100, y: 0, z: 0 },
});

const startX = (entity: CadEntity | undefined): number => {
  assert.ok(entity && entity.type === "line", "se esperaba una LINE");
  return entity.start.x;
};

/**
 * Con tabla de capas DECLARADA: es la única forma de que el cierre referencial
 * se pueda comprobar. Un documento que llega sin capas no permite decidir si
 * `entity.layer` existe, y ni el servidor ni la fusión lo rechazan por eso.
 */
const doc = (entities: CadEntity[], layerIds = ["0", "GUIA"]): CadDocument =>
  migrateCadDocument({
    layers: layerIds.map((id) => ({
      id,
      name: id,
      color: "#ffffff",
      visible: true,
      locked: false,
    })),
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
  assert.equal(startX(merged.get("a")), 50, "mi edición sobrevive");
  assert.equal(startX(merged.get("b")), 1500, "la suya también");
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
  assert.deepEqual(blocked.referenceBreaks, []);

  // Decidida, el plan sale y respeta la elección.
  for (const [strategy, expectedX] of [["mine", 50], ["theirs", 90]] as const) {
    const decided = planCadConflictResolution("merge", {
      ...collide,
      resolutions: { a: { strategy } },
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) throw new Error("plan esperado");
    assert.equal(
      startX(decided.plan.document.entities.find((item) => item.id === "a")),
      expectedX,
    );
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
  assert.equal(
    startX(result.plan.document.entities.find((item) => item.id === "b")),
    1000,
    "sobrescribir descarta lo del servidor: eso es lo que anuncia y lo que hace",
  );
}

/* ── Un plano no son sólo sus entidades: las capas también bloquean ──────── */
{
  const recolour = (document: CadDocument, color: string): CadDocument => ({
    ...document,
    layers: document.layers.map((layer) =>
      layer.id === "0" ? { ...layer, color } : layer,
    ),
  });
  const clash: CadConflictInputs = {
    base,
    mine: recolour(mine, "#ff0000"),
    theirs: recolour(theirs, "#00ff00"),
    theirsVersion: 9,
  };
  const summary = summarizeCadConflict(clash);
  assert.deepEqual(
    summary.unresolvedSections,
    ["layers:0"],
    "que ambos hayan repintado la misma capa es una colisión, no un ganador silencioso",
  );
  assert.equal(summary.mergeReady, false, "y bloquea la fusión igual que una entidad");

  const blocked = planCadConflictResolution("merge", clash);
  assert.equal(blocked.ok, false);
  if (blocked.ok) throw new Error("no debía haber plan");
  assert.equal(blocked.reason, "unresolved-collisions");
  assert.deepEqual(blocked.unresolvedSections, ["layers:0"]);

  const decided = planCadConflictResolution("merge", {
    ...clash,
    sectionResolutions: { "layers:0": { strategy: "theirs" } },
  });
  assert.equal(decided.ok, true, "decidida la capa, la fusión sale");
  if (!decided.ok) throw new Error("plan esperado");
  assert.equal(
    decided.plan.document.layers.find((layer) => layer.id === "0")?.color,
    "#00ff00",
  );
}

/* ── Una fusión que dejaría referencias colgantes NO se ofrece ───────────── */
{
  // Yo borro la capa `0` y todo lo que había en ella —me queda `GUIA`, así que
  // el documento SIGUE declarando capas y la comprobación aplica—; la otra
  // sesión sigue dibujando encima. Fusionar traería sus entidades a una capa
  // que ya no existe: exactamente el documento que el servidor rechaza.
  // Lo único que yo cambio es la tabla de capas; lo único que cambia la otra
  // sesión es una entidad nueva. Ninguna entidad está en disputa: la fusión se
  // bloquea EXCLUSIVAMENTE por el cierre referencial.
  const iDropTheLayer: CadDocument = {
    ...base,
    layers: base.layers.filter((layer) => layer.id !== "0"),
  };
  const theyKeepDrawing: CadDocument = {
    ...base,
    entities: [...base.entities, line("c", 3000)],
    modelSpace: { entityIds: [...base.modelSpace.entityIds, "c"] },
  };
  const inputsBroken: CadConflictInputs = {
    base,
    mine: iDropTheLayer,
    theirs: theyKeepDrawing,
    theirsVersion: 9,
  };
  const summary = summarizeCadConflict(inputsBroken);
  assert.equal(summary.unresolved.length, 0, "no queda ninguna entidad por decidir");
  assert.equal(summary.unresolvedSections.length, 0, "ni ningún recurso");
  assert.ok(
    summary.referenceBreaks.some(
      (item) => item.section === "layers" && item.resourceId === "0",
    ),
    "y aun así la capa que borré sigue haciendo falta",
  );
  assert.equal(
    summary.mergeReady,
    false,
    "ofrecer esta fusión sería prometer un guardado que sólo puede terminar en error",
  );

  const blocked = planCadConflictResolution("merge", inputsBroken);
  assert.equal(blocked.ok, false);
  if (blocked.ok) throw new Error("no debía haber plan");
  assert.equal(blocked.reason, "reference-breaks");
  assert.ok(blocked.referenceBreaks[0].dependents.length > 0, "dice qué se queda huérfano");

  // Recargar y sobrescribir siguen disponibles: adoptan un documento entero y
  // coherente de un lado, así que no pueden romper referencias.
  assert.equal(planCadConflictResolution("reload", inputsBroken).ok, true);
  assert.equal(planCadConflictResolution("overwrite", inputsBroken).ok, true);
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
