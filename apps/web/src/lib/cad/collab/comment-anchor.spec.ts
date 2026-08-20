/**
 * El ancla es el contrato entre DOS superficies —el estudio del autor y la
 * página del invitado— sobre una columna que el servidor guarda como JSON
 * libre. Lo que este spec defiende es que la tolerancia sea CERO: cada forma
 * que casi-casi vale se rechaza con motivo, porque colocarla «donde se
 * entiende» es plantar la flecha del cliente en el sitio equivocado.
 */
import assert from "node:assert/strict";
import {
  CAD_COMMENT_ANCHOR_VERSION,
  cadCommentAnchor,
  cadCommentAnchorMessage,
  readCadCommentAnchor,
} from "./comment-anchor";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ── Ida y vuelta ────────────────────────────────────────────────────────────
const anchor = cadCommentAnchor({ x: 3_150.5, y: -820.25 }, { entityId: "wall-7" });
assert.deepEqual(anchor, {
  kind: "point",
  version: CAD_COMMENT_ANCHOR_VERSION,
  space: "model",
  x: 3_150.5,
  y: -820.25,
  entityId: "wall-7",
});
const read = readCadCommentAnchor(JSON.parse(JSON.stringify(anchor)));
assert.equal(read.status, "anchored");
assert.deepEqual(read.status === "anchored" ? read.anchor : null, anchor);
checks += 3;

// Sin entidad debajo se ancla igual: el punto es lo que posiciona.
const loose = cadCommentAnchor({ x: 0, y: 0 });
ok(loose.entityId === null, "sin entidad, entityId es null explícito");

// El espacio papel arrastra su presentación; el modelo NO la lleva aunque se
// pase, para que no se cuele un campo que en ese espacio no significa nada.
const paper = cadCommentAnchor({ x: 10, y: 20 }, { space: "paper", layout: "PLANTA-1" });
ok(paper.layout === "PLANTA-1", "el ancla de papel conserva la presentación");
ok(
  !("layout" in cadCommentAnchor({ x: 1, y: 2 }, { space: "model", layout: "X" })),
  "el ancla de modelo no arrastra presentación",
);

// ── Sin ancla NO es un error ────────────────────────────────────────────────
assert.equal(readCadCommentAnchor(null).status, "unanchored");
assert.equal(readCadCommentAnchor(undefined).status, "unanchored");
checks += 2;

// ── Fallo cerrado: cada rechazo con su motivo ───────────────────────────────
const rejections: [unknown, string][] = [
  [42, "anchor_not_object"],
  ["{}", "anchor_not_object"],
  [[{ kind: "point" }], "anchor_not_object"],
  [{ x: 10, y: 20 }, "anchor_kind_unknown"],
  [{ kind: "entity", version: 1, space: "model", x: 1, y: 2 }, "anchor_kind_unknown"],
  [{ kind: "point", version: 99, space: "model", x: 1, y: 2 }, "anchor_version_unsupported"],
  [{ kind: "point", version: 1, space: "sheet", x: 1, y: 2 }, "anchor_space_unknown"],
  [{ kind: "point", version: 1, space: "model", x: "1", y: 2 }, "anchor_point_not_finite"],
  [{ kind: "point", version: 1, space: "model", x: Number.NaN, y: 2 }, "anchor_point_not_finite"],
  [
    { kind: "point", version: 1, space: "model", x: Number.POSITIVE_INFINITY, y: 2 },
    "anchor_point_not_finite",
  ],
  [
    { kind: "point", version: 1, space: "model", x: 1, y: 2, entityId: 7 },
    "anchor_entity_not_string",
  ],
];
for (const [value, expected] of rejections) {
  const result = readCadCommentAnchor(value);
  assert.equal(result.status, "unreadable", `debía rechazar ${JSON.stringify(value)}`);
  assert.equal(
    result.status === "unreadable" ? result.problem : "",
    expected,
    `motivo esperado ${expected} para ${JSON.stringify(value)}`,
  );
  // El motivo tiene que ser DECIBLE: se enseña al arquitecto tal cual.
  assert.ok(
    result.status === "unreadable" && result.message.length > 20 && result.message.endsWith("."),
    "cada rechazo trae una frase que se puede enseñar",
  );
  checks += 3;
}

// `{x, y}` a secas es el dialecto tentador y por eso está en la lista: leerlo
// «porque se entiende» reabriría el hueco que este módulo cierra.
ok(
  readCadCommentAnchor({ x: 10, y: 20 }).status === "unreadable",
  "un punto sin tipo NO se acepta por conveniencia",
);

// El mensaje sale de la tabla, no del sitio de la lectura: la página del
// invitado y el estudio dicen exactamente lo mismo ante el mismo problema.
ok(
  cadCommentAnchorMessage("anchor_version_unsupported").includes("versión"),
  "los motivos se consultan por código",
);

// Campos de más se IGNORAN al leer y no viajan al modelo: un ancla escrita por
// una versión futura con extras se pinta igual si su núcleo es válido.
const extra = readCadCommentAnchor({
  kind: "point",
  version: 1,
  space: "model",
  x: 5,
  y: 6,
  entityId: null,
  mood: "urgente",
});
ok(
  extra.status === "anchored" && !("mood" in extra.anchor),
  "los campos desconocidos no entran en el modelo",
);

console.log(`ok comment-anchor: ${checks} comprobaciones`);
