/**
 * GOLDEN del SCU en tres dimensiones: dibujar sobre una cara inclinada y que la
 * geometría caiga donde debía, con el error medido en milímetros.
 *
 * ## Qué se prueba aquí y no en otro sitio
 *
 * Las conversiones sueltas ya se comprueban en `session-catalogs.spec.ts`. Lo
 * que se comprueba aquí es la CADENA ENTERA, que es donde se pierden los
 * milímetros: un sólido de verdad → el comando UCS designando una de sus caras
 * → el analizador de coordenadas interpretando lo tecleado en ese SCU → LINE
 * escribiendo la entidad → `PLAN` devolviendo la vista a esa planta → y la
 * comprobación de que el punto que se tecleó es el punto que se lee.
 *
 * Cualquiera de esos seis eslabones puede aplanar una cota o girar un eje sin
 * que ninguna prueba unitaria lo note: el resultado sigue pareciendo correcto
 * en pantalla. Por eso el golden mide la separación en MILÍMETROS y la publica
 * como número, en vez de conformarse con un booleano.
 *
 * ## La pieza
 *
 * Una cuña de 100 × 80 con la cara superior sobre el plano `z = 40 − 0,15x −
 * 0,10y`. Esa cara no es paralela a NINGUNO de los tres planos del mundo —su
 * normal tiene las tres componentes distintas de cero— que es justo el caso que
 * el SCU 2D no podía representar y por el que existe esta ola.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadPoint3 } from "./cad-document";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { executeCadEntityCommandBatch } from "./entity-commands";
import {
  EMPTY_CAD_COMMAND_ENGINE,
  cadCommandEngineReduce,
  type CadCommandEffect,
} from "./engine/command-engine";
import type { CadCommandContext, CadCommandInput } from "./engine/command-types";
import { CAD_COMMAND_REGISTRY_V2 } from "./engine";
import { solid3dBody } from "./solid3d-build";
import {
  CadSystemVariableStore,
  cadActiveUcs,
  cadActiveUcsIsTilted,
} from "./system-variables";
import { CadUcsCatalog } from "./ucs";
import {
  cadUcsPlaneDistance,
  cadUcsPointFromPlanPick,
  cadUcsRotationDeg,
  isCadUcsPlanar,
  ucsToWorld,
  worldToUcs,
} from "./ucs";
import { cadSolidFaceUnderPoint, cadUcsFromSolidFace } from "./ucs-solid";
import { cadUcsIconState, cadUcsPlanPoint } from "./ucs-view";

let checks = 0;
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}
function equal(actual: unknown, expected: unknown, what: string) {
  checks += 1;
  assert.equal(actual, expected, `${what}: se esperaba ${String(expected)}, salió ${String(actual)}`);
}
/** Distancia entre dos puntos del mundo, en unidades de dibujo (aquí, mm). */
function separation(a: CadPoint3, b: CadPoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function within(actual: number, limit: number, what: string) {
  checks += 1;
  assert.ok(actual <= limit, `${what}: ${actual.toExponential(3)} mm supera el límite de ${limit} mm`);
}

/**
 * Tolerancia declarada, en MILÍMETROS.
 *
 * Un micrómetro es tres órdenes de magnitud menos que lo que cualquier taller
 * puede mecanizar y seis menos que lo que un plano acota. Que el golden pase
 * con margen no es suerte: la cadena entera es aritmética exacta en coma
 * flotante de doble precisión y el error real, que este spec imprime, vive
 * cinco órdenes por debajo de este límite. Si algún día lo roza, es que alguien
 * metió una aproximación por el camino.
 */
const TOLERANCIA_MM = 1e-6;

// ---------------------------------------------------------------------------
// La pieza: una cuña con la cara superior inclinada en las dos direcciones
// ---------------------------------------------------------------------------

const ANCHO = 100;
const FONDO = 80;
/** `z = ALTURA − PENDIENTE_X·x − PENDIENTE_Y·y` define la cara de trabajo. */
const ALTURA = 40;
const PENDIENTE_X = 0.15;
const PENDIENTE_Y = 0.1;

function techo(x: number, y: number): number {
  return ALTURA - PENDIENTE_X * x - PENDIENTE_Y * y;
}

const PUNTOS: CadPoint3[] = [
  { x: 0, y: 0, z: 0 },
  { x: ANCHO, y: 0, z: 0 },
  { x: ANCHO, y: FONDO, z: 0 },
  { x: 0, y: FONDO, z: 0 },
  { x: 0, y: 0, z: techo(0, 0) },
  { x: ANCHO, y: 0, z: techo(ANCHO, 0) },
  { x: ANCHO, y: FONDO, z: techo(ANCHO, FONDO) },
  { x: 0, y: FONDO, z: techo(0, FONDO) },
];

/** Lazos exteriores en sentido antihorario VISTOS DESDE FUERA de la pieza. */
const CARAS = [
  { outer: [0, 3, 2, 1] }, // suelo, normal −Z
  { outer: [4, 5, 6, 7] }, // cara de trabajo, normal hacia arriba e inclinada
  { outer: [0, 1, 5, 4] }, // frente, normal −Y
  { outer: [1, 2, 6, 5] }, // derecha, normal +X
  { outer: [2, 3, 7, 6] }, // fondo, normal +Y
  { outer: [3, 0, 4, 7] }, // izquierda, normal −X
];

const CARA_DE_TRABAJO = 1;

const cuna: CadSolid3dEntity = {
  id: "cuna",
  type: "solid3d",
  nodes: [{ id: "cuerpo", op: "brep", points: PUNTOS, faces: CARAS }],
  root: "cuerpo",
  layer: "0",
};

function documento(): CadDocument {
  return {
    meta: { version: 1, schema: 5, unit: "mm" },
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    entities: [cuna],
    history: [],
    modelSpace: { entityIds: [cuna.id] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as never as CadDocument;
}

// ---------------------------------------------------------------------------
// El anfitrión de mentira: teclea, aplica el lote y aplica las variables
// ---------------------------------------------------------------------------

interface Sesion {
  effects: CadCommandEffect[];
  document: CadDocument;
  variables: CadSystemVariableStore;
}

function sesion(): Sesion {
  return { effects: [], document: documento(), variables: new CadSystemVariableStore() };
}

/**
 * Mete entradas por el motor como lo haría el editor: un texto va por el
 * analizador de tokens —que es donde el SCU tiene que morder—, y un objeto
 * entra ya resuelto, que es lo que hace el puntero al designar.
 */
function teclea(
  sesion: Sesion,
  entradas: readonly (string | CadCommandInput)[],
  cursor?: { x: number; y: number },
): Sesion {
  let state = EMPTY_CAD_COMMAND_ENGINE;
  let ids = 0;
  for (const entrada of entradas) {
    const context: CadCommandContext = {
      entityIds: sesion.document.entities.map((entity) => entity.id),
      entity: (id) => sesion.document.entities.find((entity) => entity.id === id),
      selection: [],
      activeLayer: "0",
      unit: sesion.document.meta.unit,
      variables: sesion.variables,
      catalogs: { coordinateSystems: catalogo },
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      ...(cursor ? { cursor } : {}),
      newEntityId: () => `nueva-${(ids += 1)}`,
    };
    const reduction =
      typeof entrada === "string"
        ? cadCommandEngineReduce(state, { kind: "token", value: entrada }, context, registry)
        : cadCommandEngineReduce(state, { kind: "input", input: entrada }, context, registry);
    state = reduction.state;
    sesion.effects.push(...reduction.effects);
    for (const effect of reduction.effects) {
      if (effect.kind === "execute")
        sesion.document = executeCadEntityCommandBatch(
          sesion.document,
          effect.commands,
          effect.label,
        ).document;
      if (effect.kind === "variables")
        for (const [name, value] of Object.entries(effect.patch))
          if (effect.system) sesion.variables.publish(name, value);
          else sesion.variables.set(name, value);
    }
  }
  return sesion;
}

const registry = CAD_COMMAND_REGISTRY_V2;
const catalogo = new CadUcsCatalog();

const mensajes = (effects: readonly CadCommandEffect[]) =>
  effects.flatMap((effect) => (effect.kind === "message" ? [effect.text] : []));

// ---------------------------------------------------------------------------
// 1. La cara existe, es plana, y está inclinada respecto de los tres planos
// ---------------------------------------------------------------------------

const cuerpo = solid3dBody(cuna);
equal(cuerpo.faces.length, 6, "la cuña tiene seis caras");

{
  const bajoElPunto = cadSolidFaceUnderPoint(cuerpo, { x: 50, y: 40 });
  ok(bajoElPunto.ok && bajoElPunto.face === CARA_DE_TRABAJO, "bajo el centro de la pieza se ve el techo");

  const construido = cadUcsFromSolidFace(cuna, CARA_DE_TRABAJO, { name: "TECHO" });
  ok(construido.ok, "la cara de trabajo da un SCU");
  if (!construido.ok) throw new Error(construido.message);
  const scu = construido.ucs;

  // La normal esperada sale de la ecuación del plano, no de la topología: si
  // las dos coinciden es que el kernel y el SCU están mirando lo mismo.
  const largo = Math.hypot(PENDIENTE_X, PENDIENTE_Y, 1);
  const normalEsperada = { x: PENDIENTE_X / largo, y: PENDIENTE_Y / largo, z: 1 / largo };
  within(
    separation(scu.zAxis, normalEsperada),
    TOLERANCIA_MM,
    "el eje Z del SCU es la normal del plano de la cara",
  );
  ok(!isCadUcsPlanar(scu), "y el SCU NO es de planta: la cara está inclinada");
  equal(cadUcsRotationDeg(scu), null, "un SCU inclinado no tiene giro en planta, y lo dice");

  // Ortonormalidad: sin ella todo lo que sigue mediría mal sin avisar.
  const dot = (a: CadPoint3, b: CadPoint3) => a.x * b.x + a.y * b.y + a.z * b.z;
  within(Math.abs(dot(scu.xAxis, scu.yAxis)), TOLERANCIA_MM, "ejes X e Y perpendiculares");
  within(Math.abs(dot(scu.xAxis, scu.zAxis)), TOLERANCIA_MM, "ejes X y Z perpendiculares");
  within(Math.abs(Math.hypot(scu.xAxis.x, scu.xAxis.y, scu.xAxis.z) - 1), TOLERANCIA_MM, "eje X unitario");
  within(Math.abs(Math.hypot(scu.yAxis.x, scu.yAxis.y, scu.yAxis.z) - 1), TOLERANCIA_MM, "eje Y unitario");

  // El origen cae EN la cara: el centroide de una cara plana está en su plano.
  within(Math.abs(cadUcsPlaneDistance(scu.origin, scu)), TOLERANCIA_MM, "el origen del SCU está en la cara");
  within(
    Math.abs(scu.origin.z - techo(scu.origin.x, scu.origin.y)),
    TOLERANCIA_MM,
    "y a la cota que le toca según la ecuación del techo",
  );
}

// ---------------------------------------------------------------------------
// 2. Ida y vuelta: mundo → SCU → mundo devuelve el punto original
// ---------------------------------------------------------------------------

let peorIdaYVuelta = 0;
{
  const construido = cadUcsFromSolidFace(cuna, CARA_DE_TRABAJO, { name: "TECHO" });
  if (!construido.ok) throw new Error(construido.message);
  const scu = construido.ucs;
  const muestras: CadPoint3[] = [
    { x: 0, y: 0, z: 0 },
    { x: 1234.5, y: -678.9, z: 42 },
    { x: -1e5, y: 1e5, z: 1e5 },
    { x: 0.001, y: 0.002, z: 0.003 },
    { x: 50, y: 40, z: techo(50, 40) },
  ];
  for (const punto of muestras) {
    const vuelta = ucsToWorld(worldToUcs(punto, scu), scu);
    peorIdaYVuelta = Math.max(peorIdaYVuelta, separation(punto, vuelta));
  }
  within(peorIdaYVuelta, TOLERANCIA_MM, "mundo → SCU → mundo devuelve el punto original");
}

// ---------------------------------------------------------------------------
// 3. La cadena completa: UCS Cara → LINE → PLAN
// ---------------------------------------------------------------------------

let errorDibujo = 0;
let errorPlanta = 0;
let errorFueraDePlano = 0;
{
  const s = sesion();

  // El comando UCS, tecleado, designando la cara con el puntero sobre el centro
  // de la pieza y aceptando la cara que ofrece.
  teclea(s, [
    "UCS",
    "C",
    { kind: "entityPick", entityId: cuna.id, point: { x: 50, y: 40 } },
    { kind: "enter" },
  ]);

  const activo = cadActiveUcs(s.variables);
  ok(cadActiveUcsIsTilted(s.variables), "tras UCS Cara el motor sabe que el SCU está fuera del plano del mundo");
  const esperado = cadUcsFromSolidFace(cuna, CARA_DE_TRABAJO, { name: "" });
  if (!esperado.ok) throw new Error(esperado.message);
  within(
    separation(activo.origin, esperado.ucs.origin),
    TOLERANCIA_MM,
    "el SCU que quedó activo es el de la cara",
  );
  within(separation(activo.zAxis, esperado.ucs.zAxis), TOLERANCIA_MM, "con la normal de la cara como eje Z");

  // Se dibuja tecleando coordenadas del SCU, que es como se dibuja sobre una
  // cara: 0,0 es la esquina del sistema y 60,25 está 60 mm en X y 25 en Y
  // MEDIDOS SOBRE LA CARA, no sobre el suelo.
  teclea(s, ["LINE", "0,0", "60,25", { kind: "enter" }]);

  const linea = s.document.entities.find((entity) => entity.type === "line");
  ok(linea !== undefined, "LINE escribió la entidad");
  if (!linea || linea.type !== "line") throw new Error("no hay línea");

  const inicioEsperado = ucsToWorld({ x: 0, y: 0, z: 0 }, activo);
  const finEsperado = ucsToWorld({ x: 60, y: 25, z: 0 }, activo);
  errorDibujo = Math.max(
    separation(linea.start, inicioEsperado),
    separation(linea.end, finEsperado),
  );
  within(errorDibujo, TOLERANCIA_MM, "la línea cayó donde el SCU dice que cae");

  // Y cayó SOBRE la cara, no flotando encima ni hundida: la separación al plano
  // de trabajo es la medida que un CAD que aplanase la cota estropearía.
  errorFueraDePlano = Math.max(
    Math.abs(cadUcsPlaneDistance(linea.start, activo)),
    Math.abs(cadUcsPlaneDistance(linea.end, activo)),
  );
  within(errorFueraDePlano, TOLERANCIA_MM, "los dos extremos están EN el plano de la cara");
  ok(
    Math.abs(linea.end.z) > 1,
    "y la cota del extremo no es cero: se dibujó en el espacio, no aplanado contra el suelo",
  );

  // Las dos comprobaciones que NO usan la aritmética del SCU, y que por eso son
  // las que de verdad atrapan un error de signo o de eje: la cota de cada
  // extremo tiene que salir de la ECUACIÓN del techo, y la longitud del
  // segmento tiene que ser la que se tecleó, porque un cambio de sistema de
  // coordenadas ortonormal no estira nada.
  const errorEcuacion = Math.max(
    Math.abs(linea.start.z - techo(linea.start.x, linea.start.y)),
    Math.abs(linea.end.z - techo(linea.end.x, linea.end.y)),
  );
  within(errorEcuacion, TOLERANCIA_MM, "los extremos cumplen la ecuación del plano del techo");
  errorFueraDePlano = Math.max(errorFueraDePlano, errorEcuacion);
  within(
    Math.abs(separation(linea.start, linea.end) - Math.hypot(60, 25)),
    TOLERANCIA_MM,
    "y la línea mide en el mundo exactamente lo que se tecleó en el SCU",
  );

  // PLAN devuelve la vista a la planta de ese SCU. En esa planta, el punto que
  // se tecleó tiene que leerse tal cual se tecleó.
  teclea(s, ["PLAN", { kind: "enter" }]);
  const peticion = s.effects
    .flatMap((effect) => (effect.kind === "host" ? [effect.request] : []))
    .find((request) => request.kind === "ucs-plan");
  ok(peticion !== undefined && peticion.kind === "ucs-plan", "PLAN emite su petición de planta");
  if (!peticion || peticion.kind !== "ucs-plan") throw new Error("PLAN no emitió la planta");

  equal(
    peticion.plan.twistDeg,
    null,
    "y avisa de que el visor 2D no puede componer esta planta girando: hace falta cámara",
  );
  within(
    separation(peticion.plan.target, activo.origin),
    TOLERANCIA_MM,
    "la planta mira al origen del SCU",
  );

  const inicioEnPlanta = cadUcsPlanPoint(linea.start, peticion.plan);
  const finEnPlanta = cadUcsPlanPoint(linea.end, peticion.plan);
  errorPlanta = Math.max(
    Math.hypot(inicioEnPlanta.x - 0, inicioEnPlanta.y - 0),
    Math.hypot(finEnPlanta.x - 60, finEnPlanta.y - 25),
  );
  within(errorPlanta, TOLERANCIA_MM, "en la planta del SCU se lee lo mismo que se tecleó");
}

// ---------------------------------------------------------------------------
// 4. Fallo cerrado: lo que todavía no sabe trabajar fuera del plano se niega
// ---------------------------------------------------------------------------

{
  const s = sesion();
  teclea(s, [
    "UCS",
    "C",
    { kind: "entityPick", entityId: cuna.id, point: { x: 50, y: 40 } },
    { kind: "enter" },
  ]);
  const antes = s.document.entities.length;
  const negado = teclea(s, ["PLINE", "0,0", "40,0"]);
  equal(negado.document.entities.length, antes, "PLINE no escribió nada con el SCU inclinado");
  ok(
    mensajes(negado.effects).some((text) => text.includes("PLINE") && text.includes("cota cero")),
    "y lo dijo, en vez de aplanar el trazo en silencio",
  );

  // La entrada directa de distancia tampoco: la dirección del cursor vive en la
  // pantalla y no en el plano de trabajo.
  const directa = teclea(sesionInclinada(), ["LINE", "0,0", "250"], { x: 80, y: 40 });
  ok(
    mensajes(directa.effects).some((text) => text.includes("entrada directa")),
    "la entrada directa de distancia se niega sobre un SCU inclinado",
  );
}

function sesionInclinada(): Sesion {
  const s = sesion();
  teclea(s, [
    "UCS",
    "C",
    { kind: "entityPick", entityId: cuna.id, point: { x: 50, y: 40 } },
    { kind: "enter" },
  ]);
  s.effects.length = 0;
  return s;
}

// ---------------------------------------------------------------------------
// 5. El SCU de planta de siempre no cambia de comportamiento
// ---------------------------------------------------------------------------

{
  const s = sesion();
  teclea(s, ["UCS", "100,50", { kind: "enter" }, "UCS", "Z", "90"]);
  const activo = cadActiveUcs(s.variables);
  ok(isCadUcsPlanar(activo), "origen trasladado y giro de 90° siguen dando un SCU de planta");
  equal(Math.round(cadUcsRotationDeg(activo) ?? -1), 90, "con su giro en planta legible");
  ok(!cadActiveUcsIsTilted(s.variables), "y el motor no lo trata como inclinado");

  // Teclear en ese SCU: 10,0 está diez a la izquierda... no: girado 90°, la X
  // del SCU apunta al norte del mundo, así que 10,0 cae en (100, 60).
  teclea(s, ["LINE", "10,0", "0,10", { kind: "enter" }]);
  const linea = s.document.entities.find((entity) => entity.type === "line");
  if (!linea || linea.type !== "line") throw new Error("no hay línea");
  within(separation(linea.start, { x: 100, y: 60, z: 0 }), TOLERANCIA_MM, "10,0 en el SCU girado 90°");
  within(separation(linea.end, { x: 90, y: 50, z: 0 }), TOLERANCIA_MM, "y 0,10 en el mismo SCU");
}

// ---------------------------------------------------------------------------
// 6. El asterisco escapa al mundo, y designar proyecta sobre el plano
// ---------------------------------------------------------------------------

{
  const s = sesion();
  teclea(s, ["UCS", "100,50", { kind: "enter" }]);
  teclea(s, ["LINE", "*0,0", "*10,0", { kind: "enter" }]);
  const linea = s.document.entities.find((entity) => entity.type === "line");
  if (!linea || linea.type !== "line") throw new Error("no hay línea");
  within(
    separation(linea.start, { x: 0, y: 0, z: 0 }),
    TOLERANCIA_MM,
    "`*0,0` es el origen del MUNDO aunque el SCU esté trasladado",
  );

  const construido = cadUcsFromSolidFace(cuna, CARA_DE_TRABAJO, { name: "" });
  if (!construido.ok) throw new Error(construido.message);
  const proyectado = cadUcsPointFromPlanPick({ x: 10, y: 70 }, construido.ucs);
  ok(proyectado.ok, "designar sobre el lienzo cae en el plano del SCU");
  if (!proyectado.ok) throw new Error(proyectado.message);
  within(
    Math.abs(proyectado.point.z - techo(10, 70)),
    TOLERANCIA_MM,
    "y a la cota que marca la ecuación del techo",
  );

  // Un plano de canto no se puede designar desde la planta: se dice.
  const deCanto = cadUcsPointFromPlanPick(
    { x: 0, y: 0 },
    { name: "", origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 0, y: 1, z: 0 }, yAxis: { x: 0, y: 0, z: 1 }, zAxis: { x: 1, y: 0, z: 0 } },
  );
  ok(!deCanto.ok && deCanto.code === "plano-de-canto", "un plano vertical se niega con su código");
}

// ---------------------------------------------------------------------------
// 7. Guardar y restituir un SCU inclinado no lo aplana
// ---------------------------------------------------------------------------

{
  const s = sesionInclinada();
  const inclinado = cadActiveUcs(s.variables);
  teclea(s, ["UCS", "NO", "G", "TECHO"]);
  teclea(s, ["UCS", "U"]);
  ok(!cadActiveUcsIsTilted(s.variables), "volver al universal deja el SCU de planta");
  teclea(s, ["UCS", "NO", "R", "techo"]);
  const restituido = cadActiveUcs(s.variables);
  within(separation(restituido.origin, inclinado.origin), TOLERANCIA_MM, "restituir devuelve el origen");
  within(separation(restituido.zAxis, inclinado.zAxis), TOLERANCIA_MM, "y la normal de la cara");
  within(separation(restituido.xAxis, inclinado.xAxis), TOLERANCIA_MM, "y el eje X exacto");

  // Previo alterna con el anterior, que es lo que recuerda: uno, no diez.
  teclea(s, ["UCS", "P"]);
  ok(!cadActiveUcsIsTilted(s.variables), "Previo vuelve al SCU que había antes de restituir");
}

// ---------------------------------------------------------------------------
// 8. UCSICON guarda su estado donde se dijo que lo guardaba
// ---------------------------------------------------------------------------

{
  const s = sesion();
  equal(cadUcsIconState(s.variables).visible, true, "el icono empieza visible");
  teclea(s, ["UCSICON", "DE"]);
  equal(cadUcsIconState(s.variables).visible, false, "DEsactivado lo apaga");
  teclea(s, ["UCSICON", "AC"]);
  teclea(s, ["UCSICON", "OR"]);
  const icono = cadUcsIconState(s.variables);
  ok(icono.visible && icono.atOrigin, "ACtivado y ORigen lo encienden en el origen");
  teclea(s, ["UCSICON", "P", "40"]);
  equal(cadUcsIconState(s.variables).sizePx, 40, "Propiedades fija el tamaño");
  teclea(s, ["UCSICON", "P", "7"]);
  equal(cadUcsIconState(s.variables).sizePx, 40, "y un tamaño fuera de rango se rechaza sin cambiar nada");
}

console.log(
  `ucs-3d golden: ${checks} comprobaciones verdes. ` +
    `Tolerancia declarada ${TOLERANCIA_MM} mm. ` +
    `Errores medidos — dibujo sobre la cara: ${errorDibujo.toExponential(3)} mm; ` +
    `separación al plano de trabajo: ${errorFueraDePlano.toExponential(3)} mm; ` +
    `lectura en la planta de PLAN: ${errorPlanta.toExponential(3)} mm; ` +
    `ida y vuelta mundo→SCU→mundo: ${peorIdaYVuelta.toExponential(3)} mm.`,
);
