/**
 * Spec del banco de calidad NL→CAD.
 *
 * DOS TRABAJOS DISTINTOS, y conviene no confundirlos:
 *
 *  1. **Que el banco sea un banco.** Ids únicos, expectativas declaradas en
 *     todos los casos, las cinco familias adversariales representadas y un
 *     tamaño mínimo. Un corpus con ids repetidos publicaría desgloses que no
 *     suman, y uno de treinta casos daría una tasa donde cada caso vale más de
 *     tres puntos porcentuales: eso no es una medición, es una anécdota.
 *
 *  2. **Trinquete.** Las cifras medidas se congelan como SUELO. La spec falla
 *     si el producto empeora, y pasa si mejora. Sin esto el banco sería un
 *     informe que nadie vuelve a mirar: alguien tocaría el parser, la tasa
 *     caería y el CI seguiría verde.
 *
 * LOS SUELOS SÓLO SUBEN. Bajarlos para que pase la suite es exactamente lo que
 * este archivo existe para impedir; si el producto empeora, se arregla el
 * producto o se explica por escrito en el commit por qué el suelo baja.
 */
import { strict as assert } from "node:assert";
import { NL_CAD_CORPUS_ADVERSARIAL } from "./corpus-adversarial";
import { NL_CAD_CORPUS_DESPACHO } from "./corpus-despacho";
import { runNlCadBenchmark, NL_CAD_CORPUS } from "./index";
import { runNlCadCase } from "./harness";
import type { NlCadAdversarialFamily } from "./types";

/**
 * Trinquete medido en el árbol. Cada número es una cifra REAL publicada en
 * `docs/cad/evidence/nl-cad-quality-benchmark.json`, no una aspiración.
 */
const SUELO_ACIERTO_DESPACHO = 0.7653;
const SUELO_RECHAZO_TIPADO = 0.4444;
const TECHO_FALLOS_GRAVES = 9;

// ── 1. El banco es un banco ────────────────────────────────────────────────
const ids = NL_CAD_CORPUS.map((kase) => kase.id);
assert.equal(
  new Set(ids).size,
  ids.length,
  "ids duplicados: los desgloses del artefacto dejarían de sumar",
);
assert.ok(
  NL_CAD_CORPUS.length >= 120,
  `el corpus tiene ${NL_CAD_CORPUS.length} casos y el banco exige ≥120`,
);
assert.ok(
  NL_CAD_CORPUS_ADVERSARIAL.length >= 40,
  `la mitad adversarial tiene ${NL_CAD_CORPUS_ADVERSARIAL.length} casos y exige ≥40`,
);
for (const kase of NL_CAD_CORPUS) {
  assert.ok(kase.text.trim().length > 0, `${kase.id}: instrucción vacía`);
  assert.ok(kase.trait.trim().length > 0, `${kase.id}: sin rasgo declarado`);
  if (kase.lane === "despacho")
    assert.equal(
      kase.expect.kind,
      "command",
      `${kase.id}: un caso de despacho debe esperar un comando`,
    );
  else
    assert.equal(
      kase.expect.kind,
      "reject",
      `${kase.id}: un caso adversarial debe esperar rechazo`,
    );
}

const FAMILIAS: NlCadAdversarialFamily[] = [
  "ambigua",
  "contradictoria",
  "imposible",
  "unidades",
  "absurda",
];
const familiasPresentes = new Set(
  NL_CAD_CORPUS_ADVERSARIAL.map((kase) =>
    kase.expect.kind === "reject" ? kase.expect.family : "",
  ),
);
for (const familia of FAMILIAS)
  assert.ok(
    familiasPresentes.has(familia),
    `la familia adversarial '${familia}' no está representada`,
  );

// El corpus normal tiene que ejercitar el vocabulario que dice ejercitar; si
// alguien lo diluyera a 'dibuja una línea', el banco seguiría verde midiendo
// otra cosa.
const OBRA = [
  "recámara",
  "recamara",
  "cochera",
  "closet",
  "clóset",
  "sardinel",
  "castillo",
  "tablaroca",
  "trabe",
  "pretil",
  "dala",
  "patio de servicio",
  "portón",
  "porton",
  "bóiler",
  "boiler",
  "tinaco",
  "cisterna",
];
const textoDespacho = NL_CAD_CORPUS_DESPACHO.map((k) => k.text.toLowerCase()).join(" | ");
const ausentes = OBRA.filter((palabra) => !textoDespacho.includes(palabra));
assert.ok(
  ausentes.length <= 2,
  `el corpus de despacho perdió vocabulario de obra: ${ausentes.join(", ")}`,
);

// ── 2. El arnés clasifica lo que dice clasificar ───────────────────────────
// Dos casos ancla, uno por carril, para que un cambio en la clasificación no
// pase inadvertido detrás de un promedio.
const anclaDespacho = runNlCadCase({
  id: "spec-ancla-1",
  lane: "despacho",
  text: "muro de 0,0 a 6000,0",
  trait: "ancla de la spec",
  expect: { kind: "command", commandId: "draw_wall_segment" },
});
assert.equal(anclaDespacho.outcome, "acierto", "el ancla de despacho no acierta");
assert.equal(anclaDespacho.grave, false);

const anclaAdversarial = runNlCadCase({
  id: "spec-ancla-2",
  lane: "adversarial",
  text: "arregla eso",
  trait: "ancla de la spec",
  expect: { kind: "reject", family: "ambigua" },
});
assert.ok(
  anclaAdversarial.outcome.startsWith("rechazo"),
  "el ancla adversarial debería rechazarse",
);
assert.equal(anclaAdversarial.grave, false);

// Un caso de despacho cuya expectativa NO se cumple tiene que clasificarse como
// fallo, no como acierto: sin esto el banco podría estar aprobándolo todo.
const anclaFallo = runNlCadCase({
  id: "spec-ancla-3",
  lane: "despacho",
  text: "muro de 0,0 a 6000,0",
  trait: "ancla de la spec",
  expect: { kind: "command", commandId: "place_symbol" },
});
assert.equal(anclaFallo.outcome, "comando_equivocado");

// ── 3. Trinquete sobre la corrida completa ─────────────────────────────────
function graveList(current: ReturnType<typeof runNlCadBenchmark>) {
  return current.results
    .filter((result) => result.grave)
    .map((result) => `${result.id} «${result.text}» → ${result.detail}`)
    .join(" | ");
}

const run = runNlCadBenchmark();
assert.equal(
  run.summary.corpus.total,
  NL_CAD_CORPUS.length,
  "la corrida no clasificó todos los casos",
);
assert.ok(
  run.summary.despacho.accuracy >= SUELO_ACIERTO_DESPACHO,
  `acierto de despacho ${run.summary.despacho.accuracy} < suelo ${SUELO_ACIERTO_DESPACHO}`,
);
assert.ok(
  run.summary.adversarial.typedRejectionRate >= SUELO_RECHAZO_TIPADO,
  `rechazo tipado ${run.summary.adversarial.typedRejectionRate} < suelo ${SUELO_RECHAZO_TIPADO}`,
);
assert.ok(
  run.summary.global.graves <= TECHO_FALLOS_GRAVES,
  `${run.summary.global.graves} fallos graves > techo ${TECHO_FALLOS_GRAVES}: ${graveList(run)}`,
);

console.log(
  `nl-cad quality bench: ${run.summary.corpus.total} casos · despacho ${(run.summary.despacho.accuracy * 100).toFixed(1)} % · rechazo tipado ${(run.summary.adversarial.typedRejectionRate * 100).toFixed(1)} % · graves ${run.summary.global.graves}`,
);
