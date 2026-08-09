/**
 * La importación DXF conserva el espejo.
 *
 * La geometría entra al documento canónico por dos puertas y las dos perdían
 * la orientación:
 *
 *  1. **La proyección de importación.** `cadDxfPrimitivesToCanonicalEntities`
 *     admite una proyección que puede reflejar el plano. Arcos y elipses ya lo
 *     trataban intercambiando extremos; la polilínea copiaba su `bulge` tal
 *     cual, con un comentario que decía que era angular y sobrevivía. Es cierto
 *     para una escala y falso para una reflexión.
 *  2. **La escala de un INSERT.** Se reconstruía con `Math.hypot`, que es una
 *     magnitud: el group code 41 = −1 volvía como +1, y con `scale.z` fijado a
 *     1 no quedaba ningún canal por el que recuperar la orientación.
 *
 * Y el camino heredado que aplana un INSERT a primitivas movía los PUNTOS con
 * `sx`/`sy` con signo mientras a los ángulos del arco sólo les sumaba el giro:
 * un resultado incoherente consigo mismo, con los extremos donde tocaba y el
 * arco combado hacia el lado contrario.
 *
 * Las afirmaciones son absolutas. Una ida y vuelta por DXF pasaría con el
 * espejo roto, porque el importador descartaba el signo ANTES de que nadie
 * pudiera comprobarlo.
 */
import assert from "node:assert/strict";
import type { CadEntity } from "./cad-document";
import { cadDxfBlocksToCadDocumentParts, cadDxfPrimitivesToCanonicalEntities } from "./dxf-cad-document";
import { exportCadDxf } from "./dxf-export";
import { importDxfPrimitives } from "./dxf-import";
import type { CadDxfPrimitive, CadDxfSemanticBlock, CadDxfSemanticInsert } from "./dxf-import";
import type { CadDxfProjection } from "./dxf-projection";

/** Reflexión sobre el eje X: la más común, y la que anula los guardas ingenuos. */
const mirrorX: CadDxfProjection = { point: (point) => ({ x: point.x, y: -point.y }) };
/** Y una que NO refleja, para que cada afirmación tenga su contraste. */
const shift: CadDxfProjection = { point: (point) => ({ x: point.x + 1000, y: point.y }) };

const around = (value: number) => ((value % 360) + 360) % 360;

// --- 1. el bulge de una polilínea cambia de signo bajo reflexión --------------

const polyline: CadDxfPrimitive = {
  kind: "polyline",
  layer: "0",
  closed: false,
  points: [
    { x: 0, y: 0, bulge: 0.5 },
    { x: 400, y: 0, bulge: -0.25 },
    { x: 400, y: 300 },
  ],
};

const flippedPolyline = cadDxfPrimitivesToCanonicalEntities([polyline], { projection: mirrorX })[0];
assert.ok(flippedPolyline?.type === "polyline");
assert.equal(flippedPolyline.vertices[0].bulge, -0.5, "el bulge se NIEGA bajo una proyección reflectante");
assert.equal(flippedPolyline.vertices[1].bulge, 0.25, "y el negativo se vuelve positivo");
assert.equal(flippedPolyline.vertices[2].bulge, undefined, "un vértice recto no adquiere bulge");
assert.equal(flippedPolyline.vertices[0].y, -0, "y el punto se refleja, claro");

const shiftedPolyline = cadDxfPrimitivesToCanonicalEntities([polyline], { projection: shift })[0];
assert.ok(shiftedPolyline?.type === "polyline");
assert.equal(shiftedPolyline.vertices[0].bulge, 0.5, "sin reflexión el bulge NO se toca");
assert.equal(shiftedPolyline.vertices[0].x, 1000, "sólo se mueve el punto");

// --- 2. el arco intercambia sus extremos (contraste con lo anterior) ----------

const arc: CadDxfPrimitive = {
  kind: "arc",
  layer: "0",
  points: [{ x: 0, y: 0 }],
  radius: 150,
  startAngle: 30,
  endAngle: 200,
};
const flippedArc = cadDxfPrimitivesToCanonicalEntities([arc], { projection: mirrorX })[0];
assert.ok(flippedArc?.type === "arc");
assert.ok(Math.abs(around(flippedArc.startAngle) - 160) < 1e-8, `el inicio sale del FINAL reflejado: ${flippedArc.startAngle}`);
assert.ok(Math.abs(around(flippedArc.endAngle) - 330) < 1e-8, `y el final del inicio reflejado: ${flippedArc.endAngle}`);

// --- 3. el INSERT conserva su orientación bajo una proyección reflectante -----

const block: CadDxfSemanticBlock = {
  name: "PUERTA",
  basePoint: { x: 0, y: 0 },
  primitives: [{ kind: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
  inserts: [],
  attributes: {},
};
const insert: CadDxfSemanticInsert = {
  block: "PUERTA",
  insertion: { x: 500, y: 400 },
  scaleX: 2,
  scaleY: 3,
  rotation: 30,
  layer: "0",
  attributes: {},
};

const straight = cadDxfBlocksToCadDocumentParts([block], [insert], { projection: shift }).inserts[0];
assert.equal(straight.scale.x, 2, "sin reflexión las escalas llegan como estaban");
assert.equal(straight.scale.y, 3, "las dos");
assert.ok(straight.scale.x * straight.scale.y > 0, "y el dibujo no queda invertido");

const reflectedInsert = cadDxfBlocksToCadDocumentParts([block], [insert], { projection: mirrorX }).inserts[0];
assert.ok(Math.abs(Math.abs(reflectedInsert.scale.x) - 2) < 1e-8, `magnitud x intacta: ${reflectedInsert.scale.x}`);
assert.ok(Math.abs(Math.abs(reflectedInsert.scale.y) - 3) < 1e-8, `magnitud y intacta: ${reflectedInsert.scale.y}`);
assert.ok(
  reflectedInsert.scale.x * reflectedInsert.scale.y < 0,
  `una proyección reflectante DEBE dejar exactamente un eje negado: ${reflectedInsert.scale.x}, ${reflectedInsert.scale.y}`,
);
// El giro que devuelve `projectedAngle` bajo reflexión es `ψ − θ`, que con
// ψ = 0 y θ = 30 son −30. Junto con el eje negado reconstruye la matriz
// original: es la misma descomposición que aplica el adaptador nativo.
assert.ok(Math.abs(around(reflectedInsert.rotation) - 330) < 1e-8, `el giro se refleja: ${reflectedInsert.rotation}`);

// Y el signo del PROPIO archivo, sin proyección que refleje, también sobrevive.
const negative = cadDxfBlocksToCadDocumentParts([block], [{ ...insert, scaleX: -2 }], {}).inserts[0];
assert.equal(negative.scale.x, -2, "un group code 41 negativo NO se convierte en positivo");
assert.equal(negative.scale.y, 3, "sin contagiar el signo al otro eje");

// Los dos espejos juntos se cancelan: reflejar un bloque ya espejado devuelve
// un dibujo NO invertido. Es la comprobación que distingue multiplicar el signo
// de asignarlo, y sin ella `Math.abs` volvería a colarse.
const twice = cadDxfBlocksToCadDocumentParts([block], [{ ...insert, scaleX: -2 }], { projection: mirrorX }).inserts[0];
assert.ok(twice.scale.x * twice.scale.y > 0, `dos espejos se cancelan: ${twice.scale.x}, ${twice.scale.y}`);

// --- 4. el aplanado heredado deja de contradecirse a sí mismo -----------------
//
// `expandInsert` produce las primitivas de compatibilidad: un INSERT aplanado.
// Sus PUNTOS ya usaban `sx`/`sy` con signo, pero a los ángulos del arco sólo se
// les sumaba el giro. Resultado: los extremos aterrizaban donde tocaba y el
// arco iba del uno al otro por el lado equivocado — no hay forma de ver eso en
// un número, así que se comprueba comparando el extremo que dicen los ÁNGULOS
// contra el que dice la matriz de puntos.
{
  const dxf = exportCadDxf({
    blocks: [{ name: "ARCO", basePoint: { x: 0, y: 0 }, primitives: [{ kind: "arc", layer: "0", points: [{ x: 100, y: 0 }], radius: 50, startAngle: 30, endAngle: 200 }] }],
    inserts: [{ block: "ARCO", x: 0, y: 0, rotation: 0, scaleX: -1, scaleY: 1, layer: "0" }],
  }).content;
  const flattened = importDxfPrimitives(dxf).primitives.find((item) => item.kind === "arc");
  assert.ok(flattened, "el INSERT se aplana a una primitiva de arco");
  assert.ok(Math.abs(flattened.points[0].x + 100) < 1e-8, `el centro se refleja: ${flattened.points[0].x}`);
  // Espejo sobre el eje Y ⇒ 2φ = 180°, así que 30…200 pasa a 180−200 = −20 ≡ 340
  // y 180−30 = 150, INTERCAMBIADOS. Sumar el giro habría dejado 30 y 200.
  assert.ok(Math.abs(around(flattened.startAngle ?? 0) - 340) < 1e-8, `inicio ${flattened.startAngle}`);
  assert.ok(Math.abs(around(flattened.endAngle ?? 0) - 150) < 1e-8, `final ${flattened.endAngle}`);
  // Y el punto de llegada del arco reflejado es la imagen del de PARTIDA del
  // original: la comprobación que ata los ángulos a los puntos.
  const tip = { x: -(100 + Math.cos(Math.PI / 6) * 50), y: Math.sin(Math.PI / 6) * 50 };
  const end = {
    x: flattened.points[0].x + Math.cos(((flattened.endAngle ?? 0) * Math.PI) / 180) * (flattened.radius ?? 0),
    y: flattened.points[0].y + Math.sin(((flattened.endAngle ?? 0) * Math.PI) / 180) * (flattened.radius ?? 0),
  };
  assert.ok(
    Math.abs(end.x - tip.x) < 1e-8 && Math.abs(end.y - tip.y) < 1e-8,
    `los ángulos deben describir el MISMO arco que los puntos: ${end.x},${end.y} vs ${tip.x},${tip.y}`,
  );
}

// Un INSERT con las DOS escalas negativas es un giro de 180°, no un espejo, y
// ahí el ángulo base es `θ + 180`. Antes se le sumaba sólo `θ`: los puntos
// giraban media vuelta y los ángulos se quedaban, otra vez incoherente.
{
  const dxf = exportCadDxf({
    blocks: [{ name: "ARCO2", basePoint: { x: 0, y: 0 }, primitives: [{ kind: "arc", layer: "0", points: [{ x: 100, y: 0 }], radius: 50, startAngle: 0, endAngle: 90 }] }],
    inserts: [{ block: "ARCO2", x: 0, y: 0, rotation: 0, scaleX: -1, scaleY: -1, layer: "0" }],
  }).content;
  const flattened = importDxfPrimitives(dxf).primitives.find((item) => item.kind === "arc");
  assert.ok(flattened);
  assert.ok(Math.abs(around(flattened.startAngle ?? 0) - 180) < 1e-8, `media vuelta: ${flattened.startAngle}`);
  assert.ok(Math.abs(around(flattened.endAngle ?? 0) - 270) < 1e-8, `media vuelta: ${flattened.endAngle}`);
}

// --- 5. sanidad: nada de esto rompe la ausencia de proyección ------------------

const plain = cadDxfPrimitivesToCanonicalEntities([polyline])[0] as Extract<CadEntity, { type: "polyline" }>;
assert.equal(plain.vertices[0].bulge, 0.5, "sin proyección el bulge llega tal cual");

console.log(
  "dxf-mirror-import.spec.ts OK: bulge negado, arco intercambiado y escala de INSERT con signo bajo proyección reflectante",
);
