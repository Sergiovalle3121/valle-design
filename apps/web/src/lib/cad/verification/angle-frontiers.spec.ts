import { strict as assert } from "node:assert";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { importDxfPrimitives } from "../dxf-import";
import { curvePointAt, type CadCurve } from "../curve-model";
import { cadEntityCurves } from "../curve-model";
import { rotatePrimitive } from "../primitives";
import { cadAffineApply, cadAffineRotation } from "../transform2d";
import { formatAngle, toUserAngle, normalizeDegrees } from "../unit-angle";
import { buildCadDimensionGeometry, type CadDimensionEntity } from "../associative-dimension";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadEntity } from "../cad-document";
import { angleGap, deg, dist, rad, rotatePoint } from "./oracle";

/**
 * 1.4 — TODAS LAS FRONTERAS DONDE UN ÁNGULO CRUZA DE UN SUBSISTEMA A OTRO.
 *
 * ─── Por qué existe esta suite ─────────────────────────────────────────────
 *
 * La campaña de paridad encontró que el escritor DWG mandaba GRADOS por un
 * canal que esperaba RADIANES: un arco de 180° salía escrito como 180 radianes
 * crudos (≈10.31°, envuelto). El lado de LECTURA sí convertía; el de escritura
 * no. Nadie lo vio porque cada mitad estaba probada por separado y ninguna
 * prueba cruzaba la frontera.
 *
 * Esta suite recorre TODAS las fronteras equivalentes y deja UNA prueba de ida
 * y vuelta en cada una, con el mismo ángulo:
 *
 *   **37.5°**, elegido a propósito. No es múltiplo de 45 ni de 30, su seno y
 *   su coseno no son «bonitos», y en radianes vale 0.65449846949787…: si
 *   alguien confunde las unidades, el número que sale no se parece en nada al
 *   que entró, en vez de coincidir por casualidad como pasaría con 0°, 90° o
 *   180°.
 *
 * Fronteras cubiertas, una por bloque:
 *
 *   1. documento ↔ geometría de render (teselado de un arco)
 *   2. documento ↔ DXF (ida y vuelta por el código de grupo 50)
 *   3. documento ↔ DWG (la frontera del defecto original)
 *   4. comandos ↔ motor (rotación de primitivas y matriz afín)
 *   5. LISP ↔ motor (radianes de AutoLISP contra grados del documento)
 *   6. rotación de INSERT / TEXT / hatch
 *   7. sistema de unidades angulares del usuario (AUNITS)
 *   8. cota angular (el valor que se imprime)
 */

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** EL ángulo de esta suite. Un solo sitio: si cambia, cambia en las ocho. */
const A = 37.5;
/** 37.5° en radianes, escrito para que se vea que NO se parece al grado. */
const A_RAD = 0.6544984694978736;

ok(
  near(rad(A), A_RAD, 1e-15),
  `37.5° son ${A_RAD} radianes: dos números que no se pueden confundir`,
);
ok(
  Math.abs(A - A_RAD) > 36,
  "y se diferencian en más de 36 unidades — por eso este ángulo delata una confusión de unidades",
);

/**
 * Documento canónico MÍNIMO pero COMPLETO. Las colecciones vacías
 * (`blocks`, `modelSpace`, `styles`…) no son ceremonia: el exportador DXF las
 * recorre, y omitirlas sólo conseguiría que este test fallara por su propio
 * andamiaje en vez de por el ángulo que quiere medir.
 */
function document(entities: CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [{ name: "0", color: 7, visible: true, frozen: false, locked: false }],
    entities,
    history: [{ version: 1, label: "verificación de ángulos" }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: {},
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as unknown as CadDocument;
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 1 — documento ↔ geometría de render
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Un arco que EMPIEZA en 37.5°. El punto inicial de su teselado tiene que
  // caer donde lo pone la trigonometría directa del oráculo.
  const arc = {
    id: "arc-1",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 100,
    startAngle: A,
    endAngle: A + 90,
    layer: "0",
  } as CadEntity;
  const curves = cadEntityCurves(arc);
  ok(!!curves && curves.length === 1, "el arco produce una curva de render");
  const start = curvePointAt(curves![0] as CadCurve, 0);
  const oracle = {
    x: 100 * Math.cos(rad(A)),
    y: 100 * Math.sin(rad(A)),
  };
  ok(
    dist(start, oracle) < 1e-9,
    `el arranque del arco cae en (${oracle.x.toFixed(9)}, ${oracle.y.toFixed(9)}) — grados en el documento, radianes sólo dentro del coseno`,
  );
  // Y si alguien tratara los 37.5 como radianes, el punto estaría AQUÍ:
  const wrong = { x: 100 * Math.cos(A), y: 100 * Math.sin(A) };
  ok(
    dist(start, wrong) > 50,
    `la confusión de unidades habría puesto el arranque a ${dist(oracle, wrong).toFixed(1)} unidades de distancia: es detectable a simple vista`,
  );
  const end = curvePointAt(curves![0] as CadCurve, 1);
  ok(
    near(normalizeDegrees(deg(Math.atan2(end.y, end.x))), A + 90, 1e-9),
    "y el final del barrido está exactamente 90° más allá",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 2 — documento ↔ DXF (código de grupo 50)
   ══════════════════════════════════════════════════════════════════════════ */

{
  const arc = {
    id: "arc-dxf",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 250,
    startAngle: A,
    endAngle: A + 120,
    layer: "0",
  } as CadEntity;
  const exported = exportCadDocumentDxf(document([arc]));

  // El DXF guarda los ángulos en GRADOS (el formato lo exige). Se comprueba
  // leyendo el texto: el 37.5 tiene que estar ahí tal cual.
  ok(
    /\n\s*50\n\s*37\.5/u.test(exported.content),
    "el DXF escribe el ángulo inicial en GRADOS bajo el código 50, como manda el formato",
  );
  ok(
    !exported.content.includes("0.654498"),
    "y NO escribe el valor en radianes: eso sería el defecto del DWG repetido aquí",
  );

  // VUELTA: se reimporta y el ángulo tiene que volver idéntico.
  const back = importDxfPrimitives(exported.content);
  const arcs = back.primitives.filter((primitive) => primitive.kind === "arc");
  ok(arcs.length === 1, "la reimportación recupera el arco");
  const recovered = arcs[0] as { startAngle: number; endAngle: number };
  ok(
    near(recovered.startAngle, A, 1e-9),
    `y su ángulo inicial vuelve como ${A} (obtenido ${recovered.startAngle})`,
  );
  ok(
    angleGap(recovered.endAngle, A + 120) < 1e-9,
    "y el final también, sin acumular la vuelta",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 3 — documento ↔ DWG (donde vivía el defecto)
   ══════════════════════════════════════════════════════════════════════════

   ESTA FRONTERA SE MIDE EN OTRO ARCHIVO, Y NO POR COMODIDAD.

   ADR-0009 autoriza a tocar el laboratorio DWG —el códec y el punto de
   escritura— a exactamente cuatro archivos: los dos adaptadores y sus dos
   specs. Ni siquiera se les puede NOMBRAR desde fuera: el gate del límite de
   producto (`scripts/dwg/check-product-boundary.mjs`) busca la mención como
   texto, a propósito, porque una referencia es el primer paso de un import.

   La primera versión de esta suite escribía aquí la prueba de ida y vuelta, y
   ese gate la rechazó dos veces —primero por importar, después por nombrar—.
   Tenía razón las dos: la frontera clean-room no se ensancha para acomodar
   una prueba; la prueba se muda a donde la política ya la permite. Vive en la
   spec del adaptador de ESCRITURA (ADR-0009 §8), §5, con el mismo 37,5° y
   comparando el radián que quedó escrito en el archivo.

   Que siga viva allí no depende de la buena memoria de nadie: lo comprueba
   `scripts/cad/check-cad-math.mjs`, que corre en `check:cad` y que, por vivir
   fuera de `apps/` y `packages/`, sí puede nombrar el archivo. Sin esa
   comprobación, borrar aquella prueba dejaría esta suite diciendo «8
   fronteras» con siete medidas — justo la clase de afirmación que la campaña
   existe para quitar.                                                        */

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 4 — comandos ↔ motor (ROTATE)
   ══════════════════════════════════════════════════════════════════════════ */

{
  // Las dos rutas del producto —primitiva y matriz afín— tienen que coincidir
  // entre sí Y con el oráculo. Tres caminos, un solo número.
  const pivot = { x: 10, y: -4 };
  const point = { x: 30, y: 12 };
  const viaPrimitive = rotatePrimitive(
    { kind: "line", a: point, b: point },
    pivot,
    A,
  ) as { a: { x: number; y: number } };
  const viaMatrix = cadAffineApply(cadAffineRotation(A, pivot), point);
  const viaOracle = rotatePoint(point, pivot, A);
  ok(dist(viaPrimitive.a, viaOracle) < 1e-12, "la rotación de primitiva coincide con el oráculo");
  ok(dist(viaMatrix, viaOracle) < 1e-12, "la rotación matricial también");
  ok(dist(viaPrimitive.a, viaMatrix) < 1e-12, "y las dos rutas del producto coinciden entre sí");

  // Un ARCO rotado 37.5° gana 37.5° en sus dos ángulos. Ni más, ni en radianes.
  const rotatedArc = rotatePrimitive(
    { kind: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: 90 },
    { x: 0, y: 0 },
    A,
  ) as { startAngle: number; endAngle: number };
  ok(
    angleGap(rotatedArc.startAngle, A) < 1e-9 && angleGap(rotatedArc.endAngle, 90 + A) < 1e-9,
    "rotar un arco 37.5° suma 37.5° a sus ángulos, en grados",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 5 — LISP ↔ motor
   ══════════════════════════════════════════════════════════════════════════ */

{
  /**
   * AutoLISP trabaja en RADIANES (`(angle p1 p2)` devuelve radianes; `pi` es
   * una constante del lenguaje) mientras el documento guarda GRADOS. La
   * frontera está en la conversión, y es exactamente la clase de sitio donde
   * vivía el defecto del DWG.
   *
   * Se verifica con el par de valores del ángulo de la suite: el radián que
   * AutoLISP entregaría para una dirección de 37.5° y el grado que el
   * documento debe guardar.
   */
  const direction = { x: Math.cos(rad(A)), y: Math.sin(rad(A)) };
  const lispRadians = Math.atan2(direction.y, direction.x);
  ok(
    near(lispRadians, A_RAD, 1e-12),
    `la dirección de 37.5° vale ${A_RAD} rad, que es lo que un (angle …) de LISP entrega`,
  );
  const documentDegrees = normalizeDegrees(deg(lispRadians));
  ok(
    near(documentDegrees, A, 1e-12),
    "y al cruzar al documento vuelve a ser 37.5 GRADOS, no 0.654",
  );
  // Ida y vuelta completa, que es lo que la campaña pide en cada frontera.
  ok(
    near(deg(rad(A)), A, 1e-12),
    "grados → radianes → grados devuelve el mismo número",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 6 — rotación de INSERT, TEXT y hatch
   ══════════════════════════════════════════════════════════════════════════ */

{
  // TEXT canónico: coordenadas PLANAS (`x`, `y`) y `text`, no `insertion`.
  // La forma la fija `cad-document.ts`; escribirla mal aquí habría hecho que
  // el exportador descartara la entidad y el test midiera sólo dos fronteras
  // creyendo que medía tres.
  const text = {
    id: "t",
    type: "text",
    x: 0,
    y: 0,
    text: "Ángulo",
    height: 10,
    rotation: A,
    layer: "0",
  } as CadEntity;
  const insert = {
    id: "i",
    type: "insert",
    block: "PUERTA",
    insertion: { x: 100, y: 200, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: A,
    layer: "0",
  } as CadEntity;
  const hatch = {
    id: "h",
    type: "hatch",
    boundaries: [
      [
        { x: 0, y: 0, z: 0 },
        { x: 50, y: 0, z: 0 },
        { x: 50, y: 50, z: 0 },
        { x: 0, y: 50, z: 0 },
      ],
    ],
    pattern: "ANSI31",
    solid: false,
    angle: A,
    scale: 1,
    layer: "0",
  } as CadEntity;

  // UNA exportación por entidad, no las tres juntas: contar cuántos «37.5»
  // aparecen en un DXF con tres entidades no dice CUÁL de las tres lo escribió,
  // y un test que pasa con dos de tres es peor que ninguno. Así, si TEXT deja
  // de escribir su rotación, el fallo lleva su nombre.
  // El HATCH persiste el ángulo ABSOLUTO de sus rayas; en el DXF viaja como
  // giro (52 = ángulo − 45 para ANSI31) y como ángulo de familia (53 = ángulo).
  // Se mide el 53, que es el que lleva los 37.5° en grados.
  for (const [label, entity, code] of [
    ["TEXT", text, 50],
    ["INSERT", insert, 50],
    ["HATCH", hatch, 53],
  ] as const) {
    const one = exportCadDocumentDxf(document([entity]));
    ok(
      one.entityCount > 0,
      `el ${label} llega al DXF (si no, este bloque no estaría midiendo nada)`,
    );
    const written = [
      ...one.content.matchAll(new RegExp(`\\n\\s*${code}\\n\\s*(-?[\\d.]+)`, "gu")),
    ].map((match) => Number(match[1]));
    ok(
      written.some((value) => Math.abs(value - A) < 1e-9),
      `${label} escribe su rotación de 37.5° en GRADOS bajo el código ${code} (escribió ${JSON.stringify(written)})`,
    );
    ok(
      !written.some((value) => Math.abs(value - A_RAD) < 1e-6),
      `y ${label} no la escribe en radianes`,
    );
  }

  const exported = exportCadDocumentDxf(document([text, insert, hatch]));
  const anglePairs = [...exported.content.matchAll(/\n\s*5[02]\n\s*(-?[\d.]+)/gu)].map(
    (match) => Number(match[1]),
  );
  ok(
    !anglePairs.some((value) => Math.abs(value - A_RAD) < 1e-6),
    "y ninguno la escribe en radianes",
  );

  // VUELTA por el importador: el INSERT recupera su rotación.
  const back = importDxfPrimitives(exported.content);
  const recovered = back.inserts.find((entry) => entry.block === "PUERTA");
  if (recovered) {
    ok(
      near(recovered.rotation ?? 0, A, 1e-9),
      `el INSERT vuelve con rotación ${A}° (obtenido ${recovered.rotation})`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 7 — el sistema de unidades angulares del usuario (AUNITS)
   ══════════════════════════════════════════════════════════════════════════ */

{
  // El mundo guarda GRADOS; el usuario puede pedir grados, radianes,
  // centesimales, grados-minutos-segundos o rumbos topográficos. La conversión
  // vive en `formatAngle`, no en `toUserAngle` —que sólo aplica ANGBASE y
  // ANGDIR y sigue devolviendo grados—, así que la frontera se mide donde de
  // verdad está: en lo que se ESCRIBE.
  ok(
    formatAngle(A, { system: "decimal", precision: 2 }) === "37.50",
    `en grados decimales, 37.5 se escribe «37.50» (obtenido «${formatAngle(A, { system: "decimal", precision: 2 })}»)`,
  );
  ok(
    formatAngle(A, { system: "radians", precision: 6 }) === "0.654498r",
    `en radianes, «0.654498r» (obtenido «${formatAngle(A, { system: "radians", precision: 6 })}»)`,
  );
  ok(
    formatAngle(A, { system: "grads", precision: 4 }) === "41.6667g",
    `y en centesimales «41.6667g» — 400/360 del grado (obtenido «${formatAngle(A, { system: "grads", precision: 4 })}»)`,
  );
  ok(
    formatAngle(A, { system: "dms", precision: 0 }) === `37d30'0"`,
    `y en grados-minutos-segundos «37d30'0"», porque 0.5° son exactamente 30' (obtenido «${formatAngle(A, { system: "dms", precision: 0 })}»)`,
  );
  // `toUserAngle` es la OTRA mitad de la frontera: aplica el cero del usuario
  // (ANGBASE) y el sentido (ANGDIR), y sigue hablando en grados.
  ok(
    near(toUserAngle(A, { system: "decimal" }), A, 1e-12),
    "sin ANGBASE ni ANGDIR el ángulo del mundo es el del usuario",
  );
  ok(
    near(toUserAngle(A, { system: "decimal", base: 90 }), 307.5, 1e-12),
    "con el cero girado a 90°, 37.5 se lee como 307.5",
  );
  ok(
    near(toUserAngle(A, { system: "decimal", direction: 1 }), 322.5, 1e-12),
    "y en sentido horario como 322.5 — la vuelta menos el ángulo",
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FRONTERA 8 — la cota angular (lo que se imprime)
   ══════════════════════════════════════════════════════════════════════════ */

{
  const dimension = buildCadDimensionGeometry({
    id: "da",
    type: "dimension",
    layer: "0",
    dimensionKind: "angular",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    c: { x: 100 * Math.cos(rad(A)), y: 100 * Math.sin(rad(A)) },
  } as CadDimensionEntity)!;
  ok(
    near(dimension.measurement, A, 1e-9),
    `la cota angular mide 37.5° (obtenido ${dimension.measurement})`,
  );
  ok(
    dimension.label === "37.50°",
    `y lo IMPRIME como «37.50°» (obtenido «${dimension.label}»)`,
  );
}

console.log(
  `verificación 1.4 (ángulos en las fronteras): ${checks} comprobaciones sobre 8 fronteras, todas con 37.5°`,
);
