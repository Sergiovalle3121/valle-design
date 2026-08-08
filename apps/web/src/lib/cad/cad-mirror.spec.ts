/**
 * MIRROR — la orden que faltaba entera.
 *
 * EL HUECO. El motor tiene MOVE, ROTATE, SCALE y COPY sobre entidades nativas.
 * MIRROR no existe en ninguna forma: buscando «mirror» en el proyecto sólo
 * aparecen muebles de plantilla («espejo de pared»). Es una de las órdenes de
 * modificación más usadas de cualquier CAD 2D — media planta simétrica se
 * dibuja una vez.
 *
 * POR QUÉ NO BASTABA CON AÑADIR UN CAMPO A `CadEntityTransform`. Esa estructura
 * es `{ translation, rotationDeg, scale, origin }`: una SEMEJANZA, y todas
 * conservan la orientación. Una reflexión la invierte (determinante negativo) y
 * eso no se puede colar como un `scale` negativo sin romper el resto: `radius *
 * Math.abs(scale)` en el adaptador de círculo ya descarta el signo, y un arco
 * reflejado necesita además INTERCAMBIAR sus ángulos, no sólo transformarlos.
 *
 * LAS DOS REGLAS QUE HAY QUE ACERTAR, y por las que este spec existe:
 *
 *   · ARCO. Un arco barre en sentido antihorario de `startAngle` a `endAngle`.
 *     Reflejarlo invierte el barrido, así que no basta con llevar cada ángulo a
 *     2θ − ángulo: hay que INTERCAMBIARLOS. Si no, el arco resultante recorre
 *     el complementario — el trozo de circunferencia que antes no existía.
 *   · POLILÍNEA. El `bulge` es un número CON SIGNO: dice hacia qué lado se
 *     comba el tramo. Reflejar los vértices sin cambiarle el signo deja los
 *     arcos combados hacia el lado equivocado, y encima sin avisar.
 *
 * LO QUE SE RECHAZA, y a propósito. El texto reflejado sale del revés. AutoCAD
 * lo resuelve con la variable MIRRTEXT, que es una DECISIÓN de producto, no un
 * detalle: con 0 el texto se reposiciona pero sigue legible, con 1 se refleja de
 * verdad. Mientras esa decisión no esté tomada, reflejar geometría y dejar los
 * textos a medias sería peor que negarse. Se rechaza la operación entera
 * nombrando el tipo que la impide, en vez de reflejar unas cosas sí y otras no.
 */
import { strict as assert } from "node:assert";
import {
  mirrorCanonicalEntity,
  mirrorRejectionFor,
  applyCadMirror,
  MIRROR_REJECTION_MESSAGE,
} from "./cad-mirror";
import type { CadDocument, CadEntity } from "./cad-document";

type CadLine = Extract<CadEntity, { type: "line" }>;
type CadArc = Extract<CadEntity, { type: "arc" }>;
type CadCircle = Extract<CadEntity, { type: "circle" }>;
type CadPolyline = Extract<CadEntity, { type: "polyline" }>;
type CadSpline = Extract<CadEntity, { type: "spline" }>;

const near = (value: number, expected: number, what: string) =>
  assert.ok(
    Math.abs(value - expected) < 1e-9,
    `${what}: se esperaba ${expected} y llegó ${value}`,
  );

/** Eje vertical por x = 100: refleja izquierda ↔ derecha. */
const VERTICAL_AXIS = { a: { x: 100, y: -50 }, b: { x: 100, y: 900 } };
/** Eje horizontal por y = 0. */
const HORIZONTAL_AXIS = { a: { x: -50, y: 0 }, b: { x: 900, y: 0 } };

const ok = (result: ReturnType<typeof mirrorCanonicalEntity>) => {
  assert.ok(result.ok, `se esperaba éxito y llegó: ${JSON.stringify(result)}`);
  return result.entity;
};

// ---------------------------------------------------------------------------
// LÍNEA: el caso de manual
// ---------------------------------------------------------------------------

{
  const line: CadLine = {
    id: "muro",
    type: "line",
    start: { x: 20, y: 10, z: 0 },
    end: { x: 60, y: 40, z: 0 },
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(line, VERTICAL_AXIS, { newId: () => "muro-esp" }),
  ) as CadLine;

  assert.equal(mirrored.id, "muro-esp", "el reflejo es una entidad NUEVA");
  assert.equal(mirrored.layer, "0", "en la misma capa");
  near(mirrored.start.x, 180, "x = 100 + (100 − 20)");
  near(mirrored.start.y, 10, "la coordenada paralela al eje no cambia");
  near(mirrored.end.x, 140, "x = 100 + (100 − 60)");
  near(mirrored.end.y, 40, "idem");
  // El original no se toca.
  near(line.start.x, 20, "reflejar no muta la entidad de entrada");
}

{
  // Un punto SOBRE el eje se queda donde está.
  const line: CadLine = {
    id: "sobre",
    type: "line",
    start: { x: 100, y: 5, z: 0 },
    end: { x: 130, y: 5, z: 0 },
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(line, VERTICAL_AXIS, { newId: () => "x" }),
  ) as CadLine;
  near(mirrored.start.x, 100, "lo que está sobre el eje no se mueve");
  near(mirrored.end.x, 70, "y el otro extremo cruza al lado opuesto");
}

// ---------------------------------------------------------------------------
// CÍRCULO: sólo se mueve el centro
// ---------------------------------------------------------------------------

{
  const circle: CadCircle = {
    id: "rotonda",
    type: "circle",
    center: { x: 40, y: 30, z: 0 },
    radius: 25,
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(circle, VERTICAL_AXIS, { newId: () => "r2" }),
  ) as CadCircle;
  near(mirrored.center.x, 160, "el centro se refleja");
  near(mirrored.center.y, 30, "sin cambiar la altura");
  near(mirrored.radius, 25, "y el radio no cambia: reflejar no reescala");
}

// ---------------------------------------------------------------------------
// ARCO: el barrido se INVIERTE, así que los ángulos se intercambian
// ---------------------------------------------------------------------------

{
  // Semicírculo superior centrado en el origen, reflejado sobre y = 0.
  // Debe quedar el semicírculo INFERIOR: de 180° a 360°.
  const arc: CadArc = {
    id: "curva",
    type: "arc",
    center: { x: 0, y: 0, z: 0 },
    radius: 100,
    startAngle: 0,
    endAngle: 180,
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(arc, HORIZONTAL_AXIS, { newId: () => "c2" }),
  ) as CadArc;
  near(mirrored.center.x, 0, "el centro está sobre el eje");
  near(mirrored.center.y, 0, "el centro está sobre el eje");
  near(mirrored.radius, 100, "el radio no cambia");
  // Reflejar 0°→180° sobre y=0 da el semicírculo INFERIOR: el punto que era el
  // FINAL pasa a ser el INICIO. Sin intercambiar, saldría 0°→180° otra vez — el
  // arco equivocado, y encima idéntico al original.
  near(mirrored.startAngle, 180, "el antiguo FIN reflejado pasa a ser el inicio");
  // Los ángulos se guardan normalizados en [0,360), donde 0 y 360 son el mismo
  // sitio; lo que de verdad describe el arco es el BARRIDO desde el inicio.
  near(mirrored.endAngle, 0, "y el antiguo INICIO reflejado pasa a ser el fin");
  near(
    ((mirrored.endAngle - mirrored.startAngle) % 360 + 360) % 360,
    180,
    "el barrido sigue siendo medio giro, pero por abajo",
  );
  assert.notEqual(
    mirrored.startAngle,
    arc.startAngle,
    "y no coincide con el original: reflejar un semicírculo lo cambia de lado",
  );
}

{
  // La prueba que de verdad separa «intercambiar» de «no intercambiar»: un arco
  // muestreado punto a punto tiene que caer sobre el reflejo del original.
  const arc: CadArc = {
    id: "sesgada",
    type: "arc",
    center: { x: 30, y: 20, z: 0 },
    radius: 55,
    startAngle: 300,
    endAngle: 40, // cruza el origen de ángulos
    layer: "0",
  };
  const axis = { a: { x: 10, y: 10 }, b: { x: 90, y: 70 } }; // eje oblicuo
  const mirrored = ok(
    mirrorCanonicalEntity(arc, axis, { newId: () => "s2" }),
  ) as CadArc;

  const reflectPoint = (p: { x: number; y: number }) => {
    const theta = Math.atan2(axis.b.y - axis.a.y, axis.b.x - axis.a.x);
    const dx = p.x - axis.a.x;
    const dy = p.y - axis.a.y;
    const c = Math.cos(2 * theta);
    const s = Math.sin(2 * theta);
    return { x: axis.a.x + c * dx + s * dy, y: axis.a.y + s * dx - c * dy };
  };
  const sample = (a: CadArc, t: number) => {
    const sweep = ((a.endAngle - a.startAngle) % 360 + 360) % 360 || 360;
    const angle = ((a.startAngle + sweep * t) * Math.PI) / 180;
    return {
      x: a.center.x + a.radius * Math.cos(angle),
      y: a.center.y + a.radius * Math.sin(angle),
    };
  };
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20;
    const want = reflectPoint(sample(arc, t));
    // El barrido va al revés, así que el parámetro se recorre invertido.
    const got = sample(mirrored, 1 - t);
    assert.ok(
      Math.hypot(want.x - got.x, want.y - got.y) < 1e-9,
      `el arco reflejado se sale del reflejo real en t=${t}`,
    );
  }
}

// ---------------------------------------------------------------------------
// POLILÍNEA: el signo del bulge cambia
// ---------------------------------------------------------------------------

{
  const polyline: CadPolyline = {
    id: "contorno",
    type: "polyline",
    vertices: [
      { x: 20, y: 0, z: 0, bulge: 0.5 },
      { x: 60, y: 0, z: 0 },
      { x: 60, y: 40, z: 0, bulge: -0.25 },
      { x: 20, y: 40, z: 0 },
    ],
    closed: true,
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(polyline, VERTICAL_AXIS, { newId: () => "c-esp" }),
  ) as CadPolyline;

  near(mirrored.vertices[0].x, 180, "los vértices se reflejan");
  near(mirrored.vertices[1].x, 140, "los vértices se reflejan");
  assert.equal(mirrored.closed, true, "cerrada sigue cerrada");
  assert.equal(
    mirrored.vertices[0].bulge,
    -0.5,
    "el bulge CAMBIA DE SIGNO: si no, el arco se comba hacia el lado equivocado",
  );
  assert.equal(mirrored.vertices[2].bulge, 0.25, "y el negativo se vuelve positivo");
  assert.equal(
    mirrored.vertices[1].bulge,
    undefined,
    "un tramo recto sigue recto: no se le inventa un bulge 0",
  );
}

// ---------------------------------------------------------------------------
// SPLINE: reflejar es afín, así que basta con los puntos de control
// ---------------------------------------------------------------------------

{
  const spline: CadSpline = {
    id: "curva-libre",
    type: "spline",
    degree: 3,
    controlPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 30, y: 60, z: 0 },
      { x: 90, y: 60, z: 0 },
      { x: 120, y: 0, z: 0 },
    ],
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    layer: "0",
  };
  const mirrored = ok(
    mirrorCanonicalEntity(spline, VERTICAL_AXIS, { newId: () => "cl2" }),
  ) as CadSpline;
  near(mirrored.controlPoints[0].x, 200, "cada punto de control se refleja");
  near(mirrored.controlPoints[3].x, 80, "cada punto de control se refleja");
  assert.deepEqual(mirrored.knots, spline.knots, "los nudos no cambian");
  assert.equal(mirrored.degree, 3, "ni el grado");
}

// ---------------------------------------------------------------------------
// Lo que se rechaza, nombrando el motivo
// ---------------------------------------------------------------------------

{
  const text: CadEntity = {
    id: "etiqueta",
    type: "text",
    x: 10,
    y: 10,
    text: "SALA 1",
    layer: "0",
  } as CadEntity;
  const result = mirrorCanonicalEntity(text, VERTICAL_AXIS, {
    newId: () => "t2",
  });
  assert.equal(result.ok, false, "el texto no se refleja a ciegas");
  assert.ok(
    !result.ok && result.reason === "mirrored-text-undecided",
    `se esperaba el motivo del texto y llegó ${JSON.stringify(result)}`,
  );
  assert.match(
    MIRROR_REJECTION_MESSAGE["mirrored-text-undecided"],
    /MIRRTEXT|leg/i,
    "y el mensaje explica por qué, no sólo que no",
  );
}

{
  // `mirrorRejectionFor` es el oráculo que usa la compuerta de la interfaz para
  // decidir si ofrece el botón. Tiene que decir exactamente lo mismo que
  // `mirrorCanonicalEntity`, o la interfaz ofrecería órdenes imposibles — que
  // es justo el defecto que se corrigió en los paneles de esquina.
  const samples: Array<[CadEntity, string | null]> = [
    [
      { id: "l", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" },
      null,
    ],
    [{ id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "0" }, null],
    [
      { id: "m", type: "mtext", insertion: { x: 0, y: 0, z: 0 }, text: "x", layer: "0" },
      "mirrored-text-undecided",
    ],
    [
      { id: "h", type: "hatch", pattern: "SOLID", solid: true, boundaries: [], layer: "0" },
      "unsupported-entity",
    ],
  ];
  for (const [entity, expected] of samples) {
    assert.equal(
      mirrorRejectionFor(entity),
      expected,
      `el oráculo se equivoca con ${entity.type}`,
    );
    const result = mirrorCanonicalEntity(entity, VERTICAL_AXIS, {
      newId: () => "n",
    });
    assert.equal(
      result.ok,
      expected === null,
      `el oráculo y la operación no coinciden en ${entity.type}`,
    );
  }
}

{
  const degenerate: CadLine = {
    id: "d",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 0, z: 0 },
    layer: "0",
  };
  const result = mirrorCanonicalEntity(
    degenerate,
    { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } },
    { newId: () => "x" },
  );
  assert.equal(result.ok, false, "dos puntos iguales no definen un eje");
  assert.ok(!result.ok && result.reason === "degenerate-axis");
}

// ---------------------------------------------------------------------------
// Sobre el documento: todo o nada, y en un solo paso
// ---------------------------------------------------------------------------

const baseDocument = (entities: CadEntity[]): CadDocument => ({
  meta: { version: 4, schema: 3, unit: "mm" },
  layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
  entities,
  history: [],
  modelSpace: { entityIds: entities.map((entity) => entity.id) },
  paperSpaces: [],
  styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
  blocks: [],
  constraints: [],
  externalReferences: [],
  unsupportedEntities: [],
  lossManifest: [],
  publications: [],
});

const wall: CadLine = {
  id: "muro",
  type: "line",
  start: { x: 20, y: 10, z: 0 },
  end: { x: 60, y: 40, z: 0 },
  layer: "0",
};
const round: CadCircle = {
  id: "rotonda",
  type: "circle",
  center: { x: 40, y: 30, z: 0 },
  radius: 25,
  layer: "0",
};

{
  const document = baseDocument([wall, round]);
  const applied = applyCadMirror(document, {
    entityIds: ["muro", "rotonda"],
    axis: VERTICAL_AXIS,
    keepOriginal: true,
    newId: (index) => `esp-${index}`,
  });

  assert.equal(applied.meta.version, 5, "una versión, no una por entidad");
  assert.equal(applied.history.length, 1, "UN solo paso deshacible");
  assert.equal(applied.entities.length, 4, "los originales siguen ahí");
  assert.deepEqual(
    applied.modelSpace.entityIds,
    ["muro", "rotonda", "esp-0", "esp-1"],
    "los reflejos se dibujan AL FRENTE sin reordenar lo que había",
  );
  const mirroredWall = applied.entities.find(
    (entity): entity is CadLine => entity.id === "esp-0" && entity.type === "line",
  );
  near(mirroredWall!.start.x, 180, "con la geometría reflejada");
}

{
  // MIRROR con borrado del original: la otra mitad de la orden en AutoCAD.
  const document = baseDocument([wall, round]);
  const applied = applyCadMirror(document, {
    entityIds: ["muro"],
    axis: VERTICAL_AXIS,
    keepOriginal: false,
    newId: (index) => `esp-${index}`,
  });
  assert.equal(
    applied.entities.some((entity) => entity.id === "muro"),
    false,
    "sin conservar el original, el original desaparece",
  );
  assert.equal(
    applied.entities.some((entity) => entity.id === "rotonda"),
    true,
    "y lo que no estaba seleccionado no se toca",
  );
  assert.deepEqual(
    applied.modelSpace.entityIds,
    ["rotonda", "esp-0"],
    "el espacio de modelo también pierde el original",
  );
}

{
  // TODO O NADA: si una entidad de la selección no se puede reflejar, no se
  // refleja ninguna. Media planta reflejada y media no es un plano roto.
  const label: CadEntity = {
    id: "etiqueta",
    type: "text",
    x: 10,
    y: 10,
    text: "SALA 1",
    layer: "0",
  } as CadEntity;
  const document = baseDocument([wall, label]);
  assert.throws(
    () =>
      applyCadMirror(document, {
        entityIds: ["muro", "etiqueta"],
        axis: VERTICAL_AXIS,
        keepOriginal: true,
        newId: (index) => `esp-${index}`,
      }),
    /MIRRTEXT|texto/i,
    "una entidad que no se puede reflejar aborta la operación entera",
  );
}

{
  const document = baseDocument([wall]);
  assert.throws(
    () =>
      applyCadMirror(document, {
        entityIds: [],
        axis: VERTICAL_AXIS,
        keepOriginal: true,
        newId: (index) => `esp-${index}`,
      }),
    /selecci|entidad/i,
    "sin selección no hay nada que reflejar",
  );
  assert.throws(
    () =>
      applyCadMirror(document, {
        entityIds: ["fantasma"],
        axis: VERTICAL_AXIS,
        keepOriginal: true,
        newId: (index) => `esp-${index}`,
      }),
    /fantasma|existe/i,
    "ni se refleja una entidad que no está en el documento",
  );
}

console.log(
  "cad mirror: líneas, círculos, arcos, polilíneas y splines se reflejan con el barrido y el bulge correctos, y lo que no se sabe reflejar aborta la operación entera",
);
