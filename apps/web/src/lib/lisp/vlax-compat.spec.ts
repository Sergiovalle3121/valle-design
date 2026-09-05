/**
 * El puente Visual LISP, comprobado con valores concretos.
 *
 * ## Qué exige esta spec
 *
 * 1. **Que el viaje de ida y vuelta no pierda identidad.**
 *    `(vlax-vla-object->ename (vlax-ename->vla-object e))` devuelve el MISMO
 *    nombre de entidad. Suena obvio y es justo lo que se rompe cuando el puente
 *    fabrica un objeto con estado propio: el segundo viaje devuelve otra cosa y
 *    la rutina deja de reconocer lo que ella misma designó.
 *
 * 2. **Que escribir escriba, y por la puerta buena.** `(vla-put-Layer obj
 *    "MUROS")` tiene que mover la entidad de capa EN EL DOCUMENTO y hacerlo por
 *    `host.apply`; se comprueba la etiqueta del lote, porque un puente que
 *    mutara el documento por su cuenta pasaría igual de verde la primera mitad
 *    de la comprobación y se saltaría el historial.
 *
 * 3. **Que el número sea el del producto.**
 *    `(vlax-curve-getPointAtDist e d)` se compara, en tres casos y con
 *    tolerancia 1e-9, contra `pointAtDistance` —la función con la que DIVIDE y
 *    MEASURE reparten sus marcas— aplicada a los contornos que reparte
 *    `cadEntityContours`. No es una comparación contra un número copiado a
 *    mano: es contra la misma función que usa el producto, de modo que el día
 *    que la geometría cambie, cambien las dos a la vez o falle esto.
 *
 * 4. **Que `(type obj)` diga VLA-OBJECT**, que es lo que comprueba media
 *    rutina publicada antes de llamar a `vla-get-*`.
 *
 * 5. **Que la frontera se diga en voz alta.** Cada función del lado de
 *    aplicación —`vlax-get-acad-object`, `vlax-create-object`, `vlax-invoke`—
 *    y cada reactor `vlr-*` lanza NOMBRANDO su motivo. Se comprueba el texto,
 *    no sólo que falle: «no function definition» y «no está disponible porque
 *    aquí no hay ActiveX» fallan igual y sirven para cosas distintas.
 *
 * Correr: `npx tsx src/lib/lisp/vlax-compat.spec.ts`
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad/cad-document";
import { pointAtDistance } from "../cad/divide-measure";
import { CAD_ENTITY_REGISTRY } from "../cad/entity-runtime";
import { cadEntityArea, cadEntityContours } from "../cad/inquiry/contours";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { printLisp } from "./printer";
import { LispSession, ScriptedResponder } from "./session";

// Las implementaciones de los comandos llegan a demanda en el navegador
// (`engine/lazy-commands.ts`). Un `.spec.ts` se carga como CommonJS y no puede
// esperarlas con `await`, así que las trae de golpe con este import estático.
import "@/lib/cad/engine/all-commands";

let checks = 0;
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function contains(haystack: string, needle: string, message: string): void {
  assert.ok(haystack.includes(needle), `${message} — se leyó: ${haystack}`);
  checks += 1;
}
function near(actual: number, expected: number, tolerance: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} — se esperaba ${expected} ± ${tolerance} y llegó ${actual}`,
  );
  checks += 1;
}

// ---------------------------------------------------------------------------
// El banco: un dibujo con una de cada
// ---------------------------------------------------------------------------

const ENTIDADES: CadEntity[] = [
  { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
  {
    id: "p1",
    type: "polyline",
    layer: "0",
    closed: true,
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 0, z: 0 },
      { x: 40, y: 30, z: 0 },
      { x: 0, y: 30, z: 0 },
    ],
  },
  { id: "c1", type: "circle", layer: "MUROS", center: { x: 500, y: 0, z: 0 }, radius: 50 },
  { id: "t1", type: "text", layer: "0", x: 0, y: 200, text: "PLANO", height: 10 },
  {
    id: "a1",
    type: "arc",
    layer: "0",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    startAngle: 0,
    endAngle: 90,
  },
] as unknown as CadEntity[];

function seed(entities: CadEntity[] = ENTIDADES): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muros", name: "MUROS", color: "#ff0000", visible: true, locked: false },
    ],
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
  } as unknown as CadDocument;
}

interface Corrida {
  ok: boolean;
  text: string;
  host: CadDocumentLispHost;
}

function correr(source: string, entities: CadEntity[] = ENTIDADES): Corrida {
  let serial = 0;
  const host = new CadDocumentLispHost(seed(entities), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `nuevo-${serial}`;
    },
  });
  const result = new LispSession({ builtins: CAD_LISP_BUILTINS, host }).run(
    source,
    new ScriptedResponder([]),
  );
  return { ok: result.ok, text: result.ok ? printLisp(result.value) : result.failure.message, host };
}

/** Evalúa y devuelve lo impreso, o el mensaje del fallo. */
function ev(source: string): string {
  return correr(source).text;
}

/**
 * El banco no tiene handles, así que a cada entidad se llega por su posición en
 * el ORDEN DE DIBUJO, que es como recorre el dibujo una rutina de verdad.
 * Escrito una vez aquí para que las ciento y pico llamadas de abajo no repitan
 * la cadena de `entnext`.
 */
const INDICES: Record<string, number> = { l1: 0, p1: 1, c1: 2, t1: 3, a1: 4 };

/** El ename de una entidad del banco, por posición en el orden de dibujo. */
function ename(id: string): string {
  const veces = INDICES[id];
  let expresion = "(entnext)";
  for (let paso = 0; paso < veces; paso += 1) expresion = `(entnext ${expresion})`;
  return expresion;
}

/** Deja el objeto VLA de esa entidad en `o` y evalúa el resto. */
function conObjeto(id: string, resto: string): string {
  return `(setq o (vlax-ename->vla-object ${ename(id)})) ${resto}`;
}

function evObjeto(id: string, resto: string): string {
  return ev(conObjeto(id, resto));
}

// ---------------------------------------------------------------------------
// 1. La ida y la vuelta
// ---------------------------------------------------------------------------

{
  eq(
    ev(`(equal (vlax-vla-object->ename (vlax-ename->vla-object ${ename("l1")})) ${ename("l1")})`),
    "T",
    "el viaje de ida y vuelta devuelve el MISMO nombre de entidad",
  );
  eq(
    ev(`(eq (vlax-ename->vla-object ${ename("c1")}) (vlax-ename->vla-object ${ename("c1")}))`),
    "T",
    "dos objetos de la misma entidad son eq, como los punteros COM que se reutilizan",
  );
  eq(
    ev(`(eq (vlax-ename->vla-object ${ename("c1")}) (vlax-ename->vla-object ${ename("l1")}))`),
    "nil",
    "y dos objetos de entidades distintas no lo son",
  );
  eq(
    ev(`(type (vlax-ename->vla-object ${ename("l1")}))`),
    "VLA-OBJECT",
    "(type obj) dice VLA-OBJECT: es lo que comprueba la rutina antes de llamar a vla-get-*",
  );
  eq(
    ev(`(vlax-object-p (vlax-ename->vla-object ${ename("l1")}))`),
    "T",
    "vlax-object-p reconoce el objeto",
  );
  eq(ev(`(vlax-object-p ${ename("l1")})`), "nil", "y no confunde un ename con un objeto");
  contains(
    ev(`(vlax-ename->vla-object "l1")`),
    "se esperaba un nombre de entidad",
    "una cadena no es un ename: se rechaza en vez de fabricar un objeto que apunta a nada",
  );
  contains(
    ev(`(vla-get-Layer ${ename("l1")})`),
    "vlax-ename->vla-object",
    "pasar un ename donde va un objeto dice CÓMO se convierte",
  );
  contains(
    ev(`(vlax-ename->vla-object (tblobjname "LAYER" "MUROS"))`),
    "tabla de capas",
    "el registro de una capa no es un objeto del dibujo, y se dice",
  );
}

// ---------------------------------------------------------------------------
// 2. La escritura: al documento, y por host.apply
// ---------------------------------------------------------------------------

{
  const corrida = correr(
    conObjeto("l1", '(vla-put-Layer o "MUROS") (vla-get-Layer o)'),
  );
  eq(corrida.text, '"MUROS"', "vla-put-Layer deja la entidad en MUROS");
  eq(
    corrida.host.document().entities.find((entity) => entity.id === "l1")?.layer,
    "MUROS",
    "y el cambio está EN EL DOCUMENTO, no sólo en la respuesta del puente",
  );
  eq(
    [...corrida.host.appliedLabels],
    ["LISP vla-put-Layer"],
    "la escritura salió por host.apply con su etiqueta: un lote, un paso de deshacer",
  );
  eq(
    corrida.host.pendingCommands.map((command) => command.type),
    ["replace"],
    "y lo hizo con un CadEntityCommand canónico, no con una mutación",
  );

  contains(
    evObjeto("l1", '(vla-put-Layer o "NO-EXISTE")'),
    '(command "-LAYER"',
    "una capa que no está en la tabla se rechaza DICIENDO por dónde se crea",
  );
  eq(
    correr(conObjeto("l1", '(vla-put-Layer o "NO-EXISTE")')).host.appliedLabels.length,
    0,
    "y no se aplicó nada: el rechazo es antes de tocar el documento",
  );
}

// ---------------------------------------------------------------------------
// 3. Los pares generados, con su valor concreto
// ---------------------------------------------------------------------------

{
  // Línea
  eq(evObjeto("l1", "(vla-get-StartPoint o)"), "(0.0 0.0 0.0)", "StartPoint de la línea");
  eq(evObjeto("l1", "(vla-get-EndPoint o)"), "(100.0 0.0 0.0)", "EndPoint de la línea");
  eq(evObjeto("l1", "(vla-get-Length o)"), "100.0", "Length de la línea");
  eq(
    evObjeto("l1", "(vla-put-EndPoint o (vlax-3d-point 100 100 0)) (vla-get-Length o)"),
    "141.4213562373095",
    "moviendo el extremo cambia la longitud: la propiedad se recalcula, no se cachea",
  );
  eq(evObjeto("l1", "(vla-get-Color o)"), "256", "sin color explícito, PorCapa (256)");
  eq(evObjeto("l1", "(vla-put-Color o 1) (vla-get-Color o)"), "1", "el rojo va y vuelve como 1");
  eq(
    evObjeto("l1", "(vla-put-Color o 0) (vla-get-Color o)"),
    "0",
    "y PorBloque es el 0, que es lo que lee una rutina de bloques",
  );
  eq(
    evObjeto("l1", '(vla-put-Linetype o "TRAZOS") (vla-get-Linetype o)'),
    '"TRAZOS"',
    "el tipo de línea explícito",
  );
  eq(
    evObjeto("l1", '(vla-put-Linetype o "TRAZOS") (vla-put-Linetype o "ByLayer") (vla-get-Linetype o)'),
    '"ByLayer"',
    "y se puede devolver a PorCapa, que es un resultado distinto de no tocar nada",
  );
  eq(evObjeto("l1", "(vla-get-LinetypeScale o)"), "1.0", "sin escala propia, 1.0");
  eq(
    evObjeto("l1", "(vla-put-LinetypeScale o 0.5) (vla-get-LinetypeScale o)"),
    "0.5",
    "la escala de tipo de línea va y vuelve",
  );

  // Círculo
  eq(evObjeto("c1", "(vla-get-Center o)"), "(500.0 0.0 0.0)", "Center del círculo");
  eq(evObjeto("c1", "(vla-get-Radius o)"), "50.0", "Radius del círculo");
  eq(
    evObjeto("c1", "(vla-put-Radius o 25.0) (vla-get-Radius o)"),
    "25.0",
    "el radio nuevo queda en el documento",
  );
  eq(
    evObjeto("c1", "(vla-put-Center o (list 10 20)) (vla-get-Center o)"),
    "(10.0 20.0 0.0)",
    "un punto de dos coordenadas vale: es como lo teclea medio mundo",
  );

  // Texto
  eq(evObjeto("t1", "(vla-get-TextString o)"), '"PLANO"', "TextString del rótulo");
  eq(
    evObjeto("t1", '(vla-put-TextString o "EJE-1") (vla-get-TextString o)'),
    '"EJE-1"',
    "renombrar un rótulo LLEGA al documento (antes el traductor lo aceptaba y no lo aplicaba)",
  );
  eq(evObjeto("t1", "(vla-get-Height o)"), "10.0", "Height del rótulo");
  eq(
    evObjeto("t1", "(vla-put-Height o 2.5) (vla-get-Height o)"),
    "2.5",
    "y la altura nueva también llega",
  );
  eq(evObjeto("t1", "(vla-get-InsertionPoint o)"), "(0.0 200.0 0.0)", "InsertionPoint del rótulo");
  eq(
    evObjeto("t1", "(vla-put-InsertionPoint o (vlax-3d-point 5 6 0)) (vla-get-InsertionPoint o)"),
    "(5.0 6.0 0.0)",
    "mover un rótulo con vlax-3d-point, que es como lo escriben las rutinas",
  );

  // Polilínea
  eq(evObjeto("p1", "(vla-get-Closed o)"), "T", "la polilínea del banco está cerrada");
  eq(
    evObjeto("p1", "(vla-put-Closed o nil) (vla-get-Closed o)"),
    "nil",
    "abrirla llega al documento",
  );
  eq(
    evObjeto("p1", "(vla-get-Coordinates o)"),
    "(0.0 0.0 40.0 0.0 40.0 30.0 0.0 30.0)",
    "Coordinates es la lista PLANA de la LWPOLYLINE, como en AutoCAD",
  );
  eq(
    evObjeto("p1", "(vla-put-Coordinates o (list 0 0 10 0 10 10 0 10)) (vla-get-Coordinates o)"),
    "(0.0 0.0 10.0 0.0 10.0 10.0 0.0 10.0)",
    "y se reescribe entera",
  );
  eq(evObjeto("p1", "(vla-get-Area o)"), "1200.0", "el área del rectángulo de 40 × 30");
  eq(evObjeto("p1", "(vla-get-Length o)"), "140.0", "y su perímetro, con el tramo de cierre");

  // Arco: las dos puntas son consecuencia, y se leen
  eq(evObjeto("a1", "(vla-get-StartPoint o)"), "(10.0 0.0 0.0)", "StartPoint del arco a 0°");
  eq(
    evObjeto("a1", "(vla-get-EndPoint o)").startsWith("(6.123"),
    true,
    "y EndPoint a 90° cae sobre el eje Y (con el cero numérico del coseno)",
  );
}

// ---------------------------------------------------------------------------
// 4. Lo que no tiene esa propiedad, y lo que es de sólo lectura
// ---------------------------------------------------------------------------

{
  contains(
    evObjeto("l1", "(vla-get-Area o)"),
    "un LINE no tiene la propiedad Area",
    "una línea no encierra área, y se dice con el tipo delante",
  );
  contains(
    evObjeto("l1", "(vla-get-TextString o)"),
    "no tiene la propiedad TextString",
    "una línea no tiene rótulo",
  );
  contains(
    evObjeto("p1", "(vla-put-Area o 5)"),
    "es el RESULTADO de la geometría",
    "el área es de sólo lectura, y el motivo es el útil: qué vértice habría que mover",
  );
  contains(
    evObjeto("l1", "(vla-put-Length o 5)"),
    "sólo lectura",
    "la longitud tampoco se escribe",
  );
  contains(
    evObjeto("a1", "(vla-put-StartPoint o (list 1 1))"),
    "CONSECUENCIA de su centro",
    "el arranque de un arco no se escribe, y se dice por qué",
  );
  eq(
    correr(conObjeto("a1", "(vla-put-StartPoint o (list 1 1))")).host.appliedLabels.length,
    0,
    "y una negativa no deja escrituras a medias en el lote",
  );
  contains(
    evObjeto("l1", "(vlax-get o 'Rotation)"),
    "(entget e)",
    "una propiedad que este puente no sabe responder nombra las que sí y la puerta completa",
  );
  contains(
    evObjeto("c1", "(vla-put-Radius o -3)"),
    "mayor que cero",
    "un radio negativo se rechaza",
  );
  contains(
    evObjeto("l1", "(vla-put-Color o 300)"),
    "no es un color de AutoCAD",
    "un índice fuera de la tabla ACI se rechaza",
  );
}

// ---------------------------------------------------------------------------
// 5. vlax-get / vlax-put contestan lo MISMO que los pares generados
// ---------------------------------------------------------------------------

{
  eq(
    evObjeto("c1", "(vlax-get o 'Radius)"),
    evObjeto("c1", "(vla-get-Radius o)"),
    "vlax-get y vla-get-Radius son la misma lectura",
  );
  eq(
    evObjeto("c1", '(vlax-get-property o "Center")'),
    evObjeto("c1", "(vla-get-Center o)"),
    "vlax-get-property acepta el nombre como cadena y contesta igual",
  );
  eq(
    evObjeto("c1", "(vlax-put o 'Radius 12.5) (vla-get-Radius o)"),
    "12.5",
    "vlax-put escribe por el mismo camino",
  );
  eq(
    correr(conObjeto("c1", "(vlax-put-property o 'Radius 12.5)")).host.appliedLabels[0],
    "LISP vla-put-Radius",
    "y su lote lleva la misma etiqueta: una sola implementación detrás",
  );
  eq(
    evObjeto("c1", '(list (vlax-property-available-p o "Radius") (vlax-property-available-p o "TextString"))'),
    "(T nil)",
    "vlax-property-available-p distingue lo que el objeto tiene de lo que no",
  );
  eq(
    evObjeto("p1", '(vlax-property-available-p o "Area" T)'),
    "nil",
    "y con el tercer argumento distingue leer de ESCRIBIR",
  );
  eq(
    evObjeto("l1", "(vlax-safearray->list (vlax-variant-value (vla-get-StartPoint o)))"),
    "(0.0 0.0 0.0)",
    "la línea que escribe media biblioteca publicada corre sin tocarla: aquí no hay variantes",
  );
}

// ---------------------------------------------------------------------------
// 6. vlax-curve-*: los números son los del producto
// ---------------------------------------------------------------------------

{
  eq(ev(`(vlax-curve-getStartPoint ${ename("l1")})`), "(0.0 0.0 0.0)", "getStartPoint por ename");
  eq(
    evObjeto("l1", "(vlax-curve-getEndPoint o)"),
    "(100.0 0.0 0.0)",
    "y también por objeto VLA: las dos formas están en el código publicado",
  );
  eq(ev(`(vlax-curve-isClosed ${ename("p1")})`), "T", "la polilínea cerrada lo dice");
  eq(ev(`(vlax-curve-isClosed ${ename("l1")})`), "nil", "y la línea no");
  eq(ev(`(vlax-curve-isClosed ${ename("c1")})`), "T", "un círculo es cerrado por naturaleza");

  // La comprobación central: el mismo número que el producto, en tres casos.
  const documento = seed();
  for (const [id, distancia] of [
    ["l1", 25],
    ["p1", 55],
    ["a1", 7.5],
  ] as [string, number][]) {
    const entidad = documento.entities.find((entity) => entity.id === id)!;
    const contornos = cadEntityContours(entidad, CAD_ENTITY_REGISTRY, documento);
    const puntos = contornos[0].points.map((punto) => ({ x: punto.x, y: punto.y }));
    if (contornos[0].closed) puntos.push({ x: puntos[0].x, y: puntos[0].y });
    const esperado = pointAtDistance(puntos, distancia).point;
    const texto = ev(`(vlax-curve-getPointAtDist ${ename(id)} ${distancia.toFixed(6)})`);
    const leidos = texto
      .replace(/[()]/g, "")
      .split(/\s+/)
      .map((parte) => Number(parte));
    near(leidos[0], esperado.x, 1e-9, `getPointAtDist sobre ${id}: la X es la de pointAtDistance`);
    near(leidos[1], esperado.y, 1e-9, `getPointAtDist sobre ${id}: la Y es la de pointAtDistance`);
  }

  eq(
    ev(`(vlax-curve-getPointAtDist ${ename("l1")} 500.0)`),
    "nil",
    "una distancia fuera de la curva devuelve nil; recortarla en silencio dejaría la marca en el extremo",
  );
  eq(
    ev(`(vlax-curve-getDistAtPoint ${ename("l1")} (list 25.0 0.0 0.0))`),
    "25.0",
    "getDistAtPoint es el inverso exacto sobre un tramo recto",
  );
  eq(
    ev(`(vlax-curve-getDistAtPoint ${ename("l1")} (list 0.0 50.0 0.0))`),
    "nil",
    "un punto que no cae sobre la curva devuelve nil, que es la comprobación de la rutina",
  );
  eq(
    ev(`(vlax-curve-getDistAtPoint ${ename("a1")} (vlax-curve-getStartPoint ${ename("a1")}))`),
    "0.0",
    "y el arranque de un arco teselado sí se reconoce como suyo",
  );
  eq(
    ev(`(vlax-curve-getClosestPointTo ${ename("l1")} (list 30 20))`),
    "(30.0 0.0 0.0)",
    "getClosestPointTo proyecta sobre el tramo",
  );
  contains(
    ev(`(vlax-curve-getClosestPointTo ${ename("l1")} (list 300 20) T)`),
    "prolongarla devolvería un punto que no está sobre la curva real",
    "la extensión más allá de los extremos se declara fuera de alcance con su motivo",
  );
  contains(
    ev(`(vlax-curve-getStartPoint ${ename("t1")})`),
    "no es una curva",
    "un rótulo no es una curva, y se dice con la lista de las que sí",
  );

  // Área: la MISMA que enseña el producto, calculada por la misma función.
  const documentoArea = seed();
  for (const id of ["p1", "c1", "a1"]) {
    const entidad = documentoArea.entities.find((entity) => entity.id === id)!;
    const medida = cadEntityArea(entidad, CAD_ENTITY_REGISTRY, documentoArea)!;
    near(
      Number(ev(`(vlax-curve-getArea ${ename(id)})`)),
      medida.area,
      1e-9,
      `vlax-curve-getArea sobre ${id} es el área que mide el producto`,
    );
  }
  near(
    Number(evObjeto("c1", "(vla-get-Area o)")),
    Math.PI * 50 * 50,
    1e-9,
    "y el círculo vale πr² exacto, no el polígono de 192 lados",
  );
}

// ---------------------------------------------------------------------------
// 7. El objeto sobrevive a la entidad
// ---------------------------------------------------------------------------

{
  eq(evObjeto("l1", "(vlax-erased-p o)"), "nil", "una entidad viva no está borrada");
  eq(
    evObjeto("l1", "(entdel (vlax-vla-object->ename o)) (vlax-erased-p o)"),
    "T",
    "borrada la entidad, el objeto lo dice en vez de reventar: aquí no hay puntero colgante",
  );
  contains(
    evObjeto("l1", "(entdel (vlax-vla-object->ename o)) (vla-get-Layer o)"),
    "vlax-erased-p",
    "y preguntar por una propiedad de lo borrado nombra la comprobación que faltó",
  );
  eq(
    evObjeto("l1", "(vlax-release-object o)"),
    "nil",
    "vlax-release-object es un no-op honesto: no hay puntero COM que soltar",
  );
}

// ---------------------------------------------------------------------------
// 8. La frontera, dicha con su motivo
// ---------------------------------------------------------------------------

{
  for (const nombre of [
    "vlax-get-acad-object",
    "vlax-create-object",
    "vlax-get-or-create-object",
    "vlax-import-type-library",
    "vlax-invoke",
    "vlax-invoke-method",
    "vlax-method-applicable-p",
  ]) {
    const texto = ev(`(${nombre})`);
    contains(texto, "no está disponible", `${nombre} se declara fuera de alcance`);
    contains(texto, "el navegador", `${nombre} dice DÓNDE corre esto`);
    contains(texto, "vlax-ename->vla-object", `${nombre} nombra el puente que SÍ existe`);
  }

  for (const nombre of [
    "vlr-acdb-reactor",
    "vlr-object-reactor",
    "vlr-editor-reactor",
    "vlr-command-reactor",
    "vlr-dwg-reactor",
    "vlr-lisp-reactor",
    "vlr-remove",
    "vlr-remove-all",
    "vlr-reactors",
  ]) {
    const texto = ev(`(${nombre})`);
    contains(texto, "no está disponible", `${nombre} se declara fuera de alcance`);
    contains(texto, "presupuesto", `${nombre} da el motivo real: el sandbox, no la ausencia de COM`);
  }

  for (const nombre of [
    "vlax-curve-getParamAtDist",
    "vlax-curve-getDistAtParam",
    "vlax-curve-getParamAtPoint",
    "vlax-curve-getPointAtParam",
    "vlax-curve-getFirstDeriv",
    "vlax-curve-getSecondDeriv",
  ]) {
    const texto = ev(`(${nombre})`);
    contains(texto, "parametrización interna", `${nombre} dice qué falta: el parámetro, no la curva`);
    contains(texto, "vlax-curve-getPointAtDist", `${nombre} nombra la alternativa por LONGITUD`);
  }

  // `vl-load-com` sigue siendo el no-op que deja arrancar a la rutina.
  eq(ev("(vl-load-com)"), "nil", "vl-load-com no promete COM: promete no morir en la línea 1");
}

// ---------------------------------------------------------------------------
// 9. Una rutina de despacho, entera
// ---------------------------------------------------------------------------

{
  /**
   * El gesto real: cargar el puente, recorrer las polilíneas del dibujo, leer
   * su área por ActiveX, moverlas de capa y devolver el total. Es la forma en
   * que está escrito un cuadro de áreas de despacho, y hasta esta entrega no
   * pasaba de su primera línea.
   */
  const rutina = `
    (vl-load-com)
    (defun c:cuadro (/ ss i e obj total)
      (setq total 0.0)
      (setq ss (ssget "X" '((0 . "LWPOLYLINE"))))
      (setq i 0)
      (while (< i (sslength ss))
        (setq e (ssname ss i))
        (setq obj (vlax-ename->vla-object e))
        (if (vlax-property-available-p obj "Area")
          (setq total (+ total (vla-get-Area obj))))
        (vla-put-Layer obj "MUROS")
        (vlax-release-object obj)
        (setq i (1+ i)))
      total)
    (c:cuadro)
  `;
  const corrida = correr(rutina);
  eq(corrida.text, "1200.0", "la rutina de cuadro de áreas corre entera y devuelve el total");
  eq(
    corrida.host.document().entities.find((entity) => entity.id === "p1")?.layer,
    "MUROS",
    "y dejó la polilínea en MUROS: la rutina tuvo EFECTO en el documento",
  );
  eq(
    [...corrida.host.appliedLabels],
    ["LISP vla-put-Layer"],
    "con un solo lote por escritura, por la única puerta que hay",
  );
}

console.log(
  `vlax-compat: ${checks} aserciones verdes (ida y vuelta ename↔vla-object, ${
    "vla-get-*/vla-put-* con valor concreto"
  }, escritura por host.apply, vlax-curve-* contra la geometría del producto, y la frontera COM/reactores declarada con su motivo).`,
);
