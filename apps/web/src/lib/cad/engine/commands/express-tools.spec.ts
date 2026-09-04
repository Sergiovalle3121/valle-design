/**
 * Las cinco Express Tools de la entrega, arrancadas por su descriptor y con su
 * lote APLICADO: BREAKLINE, TCOUNT, TXT2MTXT, FLATTEN y LAYDEL.
 *
 * Dos reglas, las mismas que la spec de COMPARE y la de las diez órdenes de PDF:
 *
 * 1. **La orden se conduce entera**, desde `begin` hasta el resultado, con las
 *    entradas que el usuario teclearía. Llamar a las funciones internas
 *    demostraría que sabemos aplastar una línea; lo que hay que saber aquí es
 *    que la ORDEN llega hasta ellas.
 * 2. **Se comprueba el DOCUMENTO, no la lista de órdenes.** Cada lote pasa por
 *    `executeCadEntityCommandBatch`, que es la única ruta de mutación, y lo que
 *    se mide es lo que quedó escrito.
 *
 * Y con números absolutos, no con «cambió»: el símbolo de BREAKLINE mide lo que
 * dice la escala, TCOUNT numera 1-2-3 en el orden pedido y no en otro, TXT2MTXT
 * deja un MTEXT y cero TEXT, FLATTEN deja Z=0 en todo y nombra lo que aplastó,
 * y LAYDEL se niega sobre la capa 0 con su motivo.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/express-tools.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity, type CadLayerDef } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import type { CadVariableAccess } from "../../system-variables";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { CAD_EXPRESS_TOOL_COMMANDS } from "./express-tools";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message} (esperado ${expected}, llegó ${actual})`);
  checks += 1;
};

const p = (x: number, y: number, z = 0) => ({ x, y, z });
const point = (x: number, y: number): CadCommandInput => ({
  kind: "point",
  point: { x, y },
  source: "typed",
});
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const palabra = (keyword: string): CadCommandInput => ({ kind: "keyword", keyword });
const enter: CadCommandInput = { kind: "enter" };
const designar = (...entityIds: string[]): CadCommandInput => ({ kind: "selection", entityIds });

const capa = (name: string, extra: Partial<CadLayerDef> = {}): CadLayerDef => ({
  id: name.toLowerCase(),
  name,
  color: "#ffffff",
  visible: true,
  locked: false,
  ...extra,
});

const documento = (entities: CadEntity[], layers: CadLayerDef[] = [capa("0")]): CadDocument =>
  migrateCadDocument({
    meta: { version: 7, schema: 7, unit: "mm" },
    entities,
    layers,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });

/**
 * La mesa de dibujo: un documento vivo, una capa actual, una tabla de variables
 * y el mismo generador de identificadores en todas las corridas, para que dos
 * pasadas den exactamente el mismo documento.
 */
class Mesa {
  document: CadDocument;
  activeLayer: string;
  private readonly variables: Record<string, number>;
  private ids = 0;

  constructor(document: CadDocument, activeLayer = "0", variables: Record<string, number> = {}) {
    this.document = document;
    this.activeLayer = activeLayer;
    this.variables = variables;
  }

  private access(): CadVariableAccess {
    const values = this.variables;
    return {
      get: (name) => values[name],
      set: () => ({ ok: false, reason: "la spec no escribe variables" }),
      publish: () => ({ ok: false, reason: "la spec no escribe variables" }),
    };
  }

  context(selection: readonly string[] = []): CadCommandContext {
    const document = this.document;
    return {
      entityIds: document.entities.map((entity) => entity.id),
      entity: (id) => document.entities.find((entity) => entity.id === id),
      selection,
      activeLayer: this.activeLayer,
      unit: "mm",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      layers: () => document.layers,
      document: () => document,
      variables: this.access(),
      newEntityId: () => `n${(this.ids += 1)}`,
    };
  }

  run(name: string, inputs: readonly CadCommandInput[], selection: readonly string[] = []) {
    const descriptor = CAD_EXPRESS_TOOL_COMMANDS.find((candidate) => candidate.name === name);
    assert.ok(descriptor, `no existe el descriptor ${name}`);
    const context = this.context(selection);
    let step = descriptor.begin(context);
    const prompts = [step.prompt.message];
    for (const input of inputs) {
      if (step.result) break;
      step = descriptor.step(step.state, input, context);
      prompts.push(step.prompt.message);
    }
    const result: CadCommandResult | undefined = step.result;
    const before = this.document;
    if (result?.kind === "document")
      this.document = executeCadEntityCommandBatch(before, result.commands, result.label).document;
    return { result, prompts, before, after: this.document };
  }

  find(id: string): CadEntity | undefined {
    return this.document.entities.find((entity) => entity.id === id);
  }
}

/** Todas las cotas Z que cuelgan de una entidad, a cualquier profundidad. */
function zetas(value: unknown, into: number[] = []): number[] {
  if (Array.isArray(value)) {
    for (const item of value) zetas(item, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.x === "number" && typeof record.y === "number" && typeof record.z === "number")
      into.push(record.z);
    for (const inner of Object.values(record)) zetas(inner, into);
    return into;
  }
  return into;
}

// ===========================================================================
// 1. BREAKLINE — el símbolo mide lo que dice la escala
// ===========================================================================

{
  // DIMSCALE 20 y tamaño base 10: el símbolo tiene que medir 200 en el dibujo.
  const mesa = new Mesa(documento([]), "0", { DIMSCALE: 20 });
  const corrida = mesa.run("BREAKLINE", [
    palabra("Tamaño"),
    { kind: "distance", value: 10 },
    point(0, 0),
    point(1000, 0),
    enter,
  ]);

  ok(corrida.prompts[0].includes("Precise el primer punto"), "arranca pidiendo el primer punto");
  ok(
    corrida.prompts.some((prompt) => prompt.includes("DIMSCALE 20")),
    "y al pedir el tamaño dice a qué escala se va a dibujar",
  );
  ok(corrida.result?.kind === "document", "BREAKLINE escribe en el documento");
  if (corrida.result?.kind !== "document") throw new Error("BREAKLINE no escribió");
  ok(
    corrida.result.label.includes("símbolo de 200") && corrida.result.label.includes("DIMSCALE 20"),
    `la etiqueta dice el tamaño real del símbolo: ${corrida.result.label}`,
  );

  const dibujada = mesa.document.entities.find((entity) => entity.type === "polyline");
  ok(!!dibujada && dibujada.type === "polyline", "quedó UNA polilínea en el documento");
  if (!dibujada || dibujada.type !== "polyline") throw new Error("no hay polilínea");
  eq(dibujada.vertices.length, 6, "seis vértices: prolongación, las cuatro del gesto y prolongación");

  // La medida con regla: la excursión perpendicular es exactamente el tamaño.
  const ys = dibujada.vertices.map((vertex) => vertex.y);
  near(Math.max(...ys) - Math.min(...ys), 200, "el símbolo mide 200 de altura, que es 10 × DIMSCALE 20");
  near(Math.max(...ys), 100, "y está centrado en el eje: +100 arriba");
  near(Math.min(...ys), -100, "y −100 abajo");

  // El gesto quedó en el medio del tramo, que es lo que pidió el Enter.
  const cruce = dibujada.vertices.filter((vertex) => vertex.y !== 0);
  near((cruce[0].x + cruce[1].x) / 2, 500, "el símbolo se colocó en el punto medio");

  // Prolongación por defecto: la mitad del tamaño base, también a la escala.
  near(dibujada.vertices[0].x, -100, "la polilínea arranca 100 antes del primer punto");
  near(dibujada.vertices[5].x, 1100, "y termina 100 después del segundo");
  eq(dibujada.closed, false, "una rotura no es un contorno cerrado");
  eq(
    dibujada.vertices.every((vertex) => vertex.z === 0),
    true,
    "y se dibuja en el plano del papel",
  );
}

{
  // El símbolo colocado DONDE SE PIDE, y sujeto para que quepa entero dentro.
  const mesa = new Mesa(documento([]), "0", { DIMSCALE: 1 });
  mesa.run("BREAKLINE", [
    palabra("Tamaño"),
    { kind: "distance", value: 100 },
    point(0, 0),
    point(1000, 0),
    point(800, 40),
  ]);
  const dibujada = mesa.document.entities.find((entity) => entity.type === "polyline");
  if (!dibujada || dibujada.type !== "polyline") throw new Error("no hay polilínea");
  const cruce = dibujada.vertices.filter((vertex) => vertex.y !== 0);
  near((cruce[0].x + cruce[1].x) / 2, 800, "el gesto se colocó en la abscisa pedida, no en el medio");
}

{
  // Y se NIEGA cuando no cabe, en vez de dibujar una rotura desbordada.
  const mesa = new Mesa(documento([]), "0", { DIMSCALE: 50 });
  const corrida = mesa.run("BREAKLINE", [point(0, 0), point(30, 0), enter]);
  ok(corrida.result?.kind === "message", "sin sitio, BREAKLINE no escribe");
  ok(
    corrida.result?.kind === "message" && /no cabe/.test(corrida.result.text),
    `y dice por qué: ${corrida.result?.kind === "message" ? corrida.result.text : ""}`,
  );
  eq(mesa.document.entities.length, 0, "el documento sigue vacío");
}

// ===========================================================================
// 2. TCOUNT — 1-2-3 en el orden pedido, y no en otro
// ===========================================================================

/** Tres rótulos DESORDENADOS en Y respecto de su orden de designación. */
const tresTextos = (): CadEntity[] => [
  { id: "t-medio", type: "text", x: 100, y: 500, text: "SALA", height: 100, layer: "0" },
  { id: "t-alto", type: "text", x: 700, y: 900, text: "COCINA", height: 100, layer: "0" },
  { id: "t-bajo", type: "text", x: 400, y: 100, text: "BAÑO", height: 100, layer: "0" },
];

const leer = (mesa: Mesa, id: string) => {
  const entity = mesa.find(id);
  return entity && entity.type === "text" ? entity.text : "";
};

{
  // Por Y: de arriba abajo, que es como se lee un plano.
  const mesa = new Mesa(documento(tresTextos()));
  const corrida = mesa.run("TCOUNT", [
    designar("t-medio", "t-alto", "t-bajo"),
    enter,
    palabra("Y"),
    text("1,1"),
    enter,
    palabra("Anteponer"),
  ]);
  ok(corrida.result?.kind === "document", "TCOUNT escribe en el documento");
  eq(leer(mesa, "t-alto"), "1COCINA", "el 1 va al de arriba");
  eq(leer(mesa, "t-medio"), "2SALA", "el 2 al del medio");
  eq(leer(mesa, "t-bajo"), "3BAÑO", "y el 3 al de abajo");
  ok(
    corrida.result?.kind === "document" && corrida.result.label.includes("de 1 a 3"),
    "y la etiqueta dice de qué número a qué número numeró",
  );
}

{
  // El MISMO conjunto por orden de DESIGNACIÓN da otra numeración: es la
  // comprobación de que el orden se obedece y no se ignora.
  const mesa = new Mesa(documento(tresTextos()));
  mesa.run("TCOUNT", [
    designar("t-medio", "t-alto", "t-bajo"),
    enter,
    palabra("Designación"),
    text("1,1"),
    enter,
    palabra("Anteponer"),
  ]);
  eq(leer(mesa, "t-medio"), "1SALA", "designado primero, numerado 1");
  eq(leer(mesa, "t-alto"), "2COCINA", "designado segundo, numerado 2");
  eq(leer(mesa, "t-bajo"), "3BAÑO", "designado tercero, numerado 3");
}

{
  // Por X, con prefijo, sufijo, incremento y SUSTITUCIÓN.
  const mesa = new Mesa(documento(tresTextos()));
  const corrida = mesa.run("TCOUNT", [
    designar("t-medio", "t-alto", "t-bajo"),
    enter,
    palabra("X"),
    text("10,5"),
    text("(,)"),
    palabra("Sustituir"),
  ]);
  eq(leer(mesa, "t-medio"), "(10)", "el más a la izquierda arranca en 10 y el texto viejo desaparece");
  eq(leer(mesa, "t-bajo"), "(15)", "el siguiente en X, 15");
  eq(leer(mesa, "t-alto"), "(20)", "y el último, 20");
  ok(
    corrida.result?.kind === "document" && corrida.result.label.includes("incremento 5"),
    "la etiqueta declara el incremento",
  );
}

{
  // Añadir al final, que es lo que hace un despiece.
  const mesa = new Mesa(documento(tresTextos()));
  mesa.run("TCOUNT", [
    designar("t-alto"),
    enter,
    palabra("Designación"),
    text("7,1"),
    text("-,"),
    palabra("Añadir"),
  ]);
  eq(leer(mesa, "t-alto"), "COCINA-7", "el número se añadió al final con su prefijo");
}

{
  // Un incremento de 0 no numera: se rechaza diciéndolo y se vuelve a pedir.
  const mesa = new Mesa(documento(tresTextos()));
  const corrida = mesa.run("TCOUNT", [
    designar("t-alto"),
    enter,
    palabra("Designación"),
    text("1,0"),
    text("1,1"),
    enter,
    palabra("Anteponer"),
  ]);
  ok(
    corrida.prompts.some((prompt) => prompt.includes("incremento de 0")),
    "el incremento nulo se rechaza con su motivo",
  );
  eq(leer(mesa, "t-alto"), "1COCINA", "y tras corregirlo la orden termina");
}

{
  // Lo que no es texto se deja fuera POR SU NOMBRE, no en silencio.
  const mesa = new Mesa(
    documento([...tresTextos(), { id: "l1", type: "line", start: p(0, 0), end: p(10, 0), layer: "0" }]),
  );
  const corrida = mesa.run("TCOUNT", [
    designar("t-alto", "l1"),
    enter,
    palabra("Designación"),
    text("1,1"),
    enter,
    palabra("Anteponer"),
  ]);
  ok(
    corrida.result?.kind === "document" && !!corrida.result.notice?.includes("línea"),
    `el aviso nombra lo que quedó fuera: ${corrida.result?.kind === "document" ? corrida.result.notice : ""}`,
  );
  eq(leer(mesa, "t-alto"), "1COCINA", "y lo que sí era texto se numeró");
}

{
  // TCOUNT numera también un MTEXT: su rótulo es texto igual que el de un TEXT.
  const mesa = new Mesa(
    documento([
      { id: "p1", type: "mtext", insertion: p(0, 900), text: "NOTA", height: 200, layer: "0" },
      { id: "t-bajo", type: "text", x: 0, y: 100, text: "PIE", height: 100, layer: "0" },
    ]),
  );
  mesa.run("TCOUNT", [designar("t-bajo", "p1"), enter, palabra("Y"), text("1,1"), enter, palabra("Anteponer")]);
  const parrafo = mesa.find("p1");
  ok(!!parrafo && parrafo.type === "mtext" && parrafo.text === "1NOTA", "el MTEXT de arriba se llevó el 1");
  eq(leer(mesa, "t-bajo"), "2PIE", "y el TEXT de abajo el 2");
}

// ===========================================================================
// 3. TXT2MTXT — un MTEXT y cero TEXT
// ===========================================================================

{
  const mesa = new Mesa(
    documento([
      { id: "a", type: "text", x: 200, y: 100, text: "tercera", height: 250, style: "ROTULO", layer: "NOTAS" },
      { id: "b", type: "text", x: 100, y: 900, text: "primera", height: 250, style: "ROTULO", layer: "NOTAS" },
      { id: "c", type: "text", x: 150, y: 500, text: "segunda", height: 250, style: "ROTULO", layer: "NOTAS" },
    ], [capa("0"), capa("NOTAS")]),
  );
  const corrida = mesa.run("TXT2MTXT", [designar("a", "b", "c"), enter]);
  ok(corrida.result?.kind === "document", "TXT2MTXT escribe en el documento");

  const mtexts = mesa.document.entities.filter((entity) => entity.type === "mtext");
  const texts = mesa.document.entities.filter((entity) => entity.type === "text");
  eq(mtexts.length, 1, "queda UN MTEXT");
  eq(texts.length, 0, "y CERO TEXT: los originales murieron en el mismo lote");
  eq(mesa.document.modelSpace.entityIds.length, 1, "y el orden de dibujo no guarda fantasmas");

  const parrafo = mtexts[0];
  if (parrafo.type !== "mtext") throw new Error("no es un MTEXT");
  eq(parrafo.text, "primera\nsegunda\ntercera", "en orden de lectura: de arriba abajo");
  eq(parrafo.height, 250, "hereda la altura del primero en orden de lectura");
  eq(parrafo.style, "ROTULO", "y su estilo");
  eq(parrafo.layer, "NOTAS", "y su capa");
  eq(parrafo.alignment, "top-left", "anclado arriba a la izquierda");
  near(parrafo.insertion.x, 100, "la inserción es la X mínima del conjunto");
  near(parrafo.insertion.y, 900, "y la Y máxima: la esquina superior izquierda");
  eq(parrafo.width, undefined, "sin ancho de columna: conserva los saltos originales");
}

{
  // Lo que se pierde se DICE: color explícito y alturas distintas.
  const mesa = new Mesa(
    documento([
      { id: "a", type: "text", x: 0, y: 400, text: "arriba", height: 100, color: "#ff0000", layer: "0" },
      { id: "b", type: "text", x: 0, y: 100, text: "abajo", height: 300, layer: "0" },
    ]),
  );
  const corrida = mesa.run("TXT2MTXT", [designar("a", "b"), enter]);
  ok(corrida.result?.kind === "document", "funde igual");
  const notice = corrida.result?.kind === "document" ? (corrida.result.notice ?? "") : "";
  ok(/color explícito/.test(notice), `declara el color que un MTEXT no guarda: ${notice}`);
  ok(/otra altura/.test(notice), "y las alturas que igualó");
  const parrafo = mesa.document.entities.find((entity) => entity.type === "mtext");
  ok(!!parrafo && parrafo.type === "mtext" && parrafo.height === 100, "con la altura del primero en lectura");
}

{
  // Con un solo TEXT no hay nada que fundir, y se dice.
  const mesa = new Mesa(documento([{ id: "a", type: "text", x: 0, y: 0, text: "solo", layer: "0" }]));
  const corrida = mesa.run("TXT2MTXT", [designar("a"), enter]);
  ok(
    corrida.result?.kind === "message" && /al menos dos TEXT/.test(corrida.result.text),
    "se niega con su motivo",
  );
  eq(mesa.document.entities.length, 1, "y no toca el documento");
}

// ===========================================================================
// 4. FLATTEN — Z=0 en todo, y nombra lo que aplastó
// ===========================================================================

{
  const mesa = new Mesa(
    documento([
      { id: "l1", type: "line", start: p(0, 0, 120), end: p(1000, 0, 340), layer: "0" },
      { id: "l2", type: "line", start: p(0, 500, -80), end: p(1000, 500, -80), layer: "0" },
      {
        id: "pl1",
        type: "polyline",
        vertices: [p(0, 0, 50), { ...p(500, 200, 50), bulge: 0.5 }, p(900, 0, 50)],
        closed: false,
        layer: "0",
      },
      { id: "c1", type: "circle", center: p(200, 200, 25), radius: 80, layer: "0" },
      { id: "t1", type: "text", x: 0, y: 0, text: "plano", layer: "0" },
      {
        id: "s1",
        type: "solid3d",
        root: "caja",
        nodes: [{ id: "caja", op: "box", min: p(0, 0, 0), max: p(100, 100, 100) }],
        layer: "0",
      },
      { id: "m1", type: "wall", start: p(0, 0, 300), end: p(3000, 0, 300), thickness: 150, height: 2400, layer: "0" },
    ]),
  );

  const corrida = mesa.run("FLATTEN", [
    designar("l1", "l2", "pl1", "c1", "t1", "s1", "m1"),
    enter,
  ]);
  ok(corrida.result?.kind === "document", "FLATTEN escribe");
  if (corrida.result?.kind !== "document") throw new Error("FLATTEN no escribió");

  // Nombra lo que aplastó, por tipo y por cantidad.
  ok(/2 líneas/.test(corrida.result.label), `nombra las líneas: ${corrida.result.label}`);
  ok(/1 polilínea/.test(corrida.result.label), "nombra la polilínea");
  ok(/1 círculo/.test(corrida.result.label), "nombra el círculo");
  ok(/1 muro/.test(corrida.result.label), "nombra el muro");
  ok(/5 objetos aplastados/.test(corrida.result.label), "y cuántos objetos en total");
  ok(/10 puntos bajados/.test(corrida.result.label), `y cuántos puntos bajó: ${corrida.result.label}`);

  const notice = corrida.result.notice ?? "";
  ok(/ya estaban en Z=0: 1 texto/.test(notice), `dice lo que ya estaba plano: ${notice}`);
  ok(/sólido 3D/.test(notice) && /FLATSHOT/.test(notice), "y por qué no aplastó el sólido, con su salida");
  ok(/CONSERVA su altura/.test(notice), "y que el muro conserva su altura");

  // El documento: Z=0 en todo lo aplastado, y el sólido intacto.
  for (const id of ["l1", "l2", "pl1", "c1", "m1"]) {
    const entity = mesa.find(id);
    ok(!!entity, `${id} sigue existiendo con su mismo identificador`);
    eq(zetas(entity).every((z) => z === 0), true, `${id} quedó entero en Z=0`);
  }
  const muro = mesa.find("m1");
  ok(!!muro && muro.type === "wall" && muro.height === 2400, "el muro conserva su altura tras el aplastado");
  const solido = mesa.find("s1");
  ok(
    !!solido && solido.type === "solid3d" && zetas(solido).some((z) => z !== 0),
    "y el sólido 3D sigue con su volumen: no se tocó",
  );
  eq(
    mesa.document.entities.length,
    7,
    "sustituir no crea ni borra: siguen siendo siete entidades",
  );
  eq(
    mesa.document.modelSpace.entityIds.length,
    7,
    "y el orden de dibujo no cambió de longitud",
  );
}

{
  // Todo ya plano: no se escribe un lote inerte, se dice.
  const mesa = new Mesa(documento([{ id: "l1", type: "line", start: p(0, 0), end: p(10, 0), layer: "0" }]));
  const corrida = mesa.run("FLATTEN", [designar("l1"), enter]);
  ok(
    corrida.result?.kind === "message" && /no bajó ningún punto/.test(corrida.result.text),
    "no hay paso de deshacer que no deshaga nada",
  );
}

{
  // Una recta de construcción vertical no se aplasta: dejaría de ser una recta.
  const mesa = new Mesa(
    documento([{ id: "x1", type: "xline", basePoint: p(0, 0, 10), direction: p(0, 0, 1), layer: "0" }]),
  );
  const corrida = mesa.run("FLATTEN", [designar("x1"), enter]);
  ok(
    corrida.result?.kind === "message" && /dejaría de definir una recta/.test(corrida.result.text),
    "se niega con su motivo",
  );
}

// ===========================================================================
// 5. LAYDEL — se niega sobre la 0, la actual y las bloqueadas; y borra de verdad
// ===========================================================================

const dibujoConCapas = () =>
  documento(
    [
      { id: "l0", type: "line", start: p(0, 0), end: p(10, 0), layer: "0" },
      { id: "a1", type: "line", start: p(0, 0), end: p(10, 0), layer: "AUXILIAR" },
      { id: "a2", type: "circle", center: p(5, 5), radius: 2, layer: "AUXILIAR" },
      { id: "m1", type: "line", start: p(0, 0), end: p(10, 0), layer: "MUROS" },
    ],
    [capa("0"), capa("AUXILIAR"), capa("MUROS"), capa("BLOQUEADA", { locked: true })],
  );

{
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("0")]);
  ok(corrida.result?.kind === "message", "LAYDEL no escribe sobre la capa 0");
  ok(
    corrida.result?.kind === "message" && /La capa 0 no se puede borrar/.test(corrida.result.text),
    `y da el motivo en vez de callar: ${corrida.result?.kind === "message" ? corrida.result.text : ""}`,
  );
  eq(mesa.document.layers.length, 4, "la tabla de capas sigue intacta");
  eq(mesa.document.entities.length, 4, "y el dibujo también");
}

{
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("MUROS")]);
  ok(
    corrida.result?.kind === "message" && /es la capa actual/.test(corrida.result.text),
    "se niega sobre la capa actual con su motivo",
  );
  ok(
    corrida.result?.kind === "message" && /-LAYER definir/.test(corrida.result.text),
    "y dice cómo salir del atasco",
  );
}

{
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("BLOQUEADA")]);
  ok(
    corrida.result?.kind === "message" && /está bloqueada/.test(corrida.result.text),
    "se niega sobre una capa bloqueada",
  );
}

{
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("NO-EXISTE")]);
  ok(
    corrida.result?.kind === "message" && /No existe la capa/.test(corrida.result.text),
    "y sobre una capa que no existe",
  );
}

{
  // La confirmación que AutoCAD exige: cuenta los objetos y por defecto dice No.
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("AUXILIAR"), enter]);
  ok(
    corrida.prompts.some((prompt) => /Se borrarán 2 objetos de la capa "AUXILIAR"/.test(prompt)),
    `la confirmación cuenta lo que va a desaparecer: ${corrida.prompts.join(" | ")}`,
  );
  ok(
    corrida.result?.kind === "message" && /cancelado/.test(corrida.result.text),
    "y Enter sin decir nada NO borra: el defecto es No",
  );
  eq(mesa.document.entities.length, 4, "el dibujo sigue entero");
}

{
  // Y con un «Sí» explícito borra la capa Y sus objetos, en un solo lote.
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [text("AUXILIAR"), palabra("Sí")]);
  ok(corrida.result?.kind === "document", "LAYDEL escribe");
  eq(
    mesa.document.layers.map((layer) => layer.name).includes("AUXILIAR"),
    false,
    "la capa desapareció de la tabla",
  );
  eq(
    mesa.document.entities.map((entity) => entity.id).sort(),
    ["l0", "m1"],
    "y sus dos objetos con ella; los de las demás capas siguen",
  );
  eq(
    mesa.document.modelSpace.entityIds.sort(),
    ["l0", "m1"],
    "el orden de dibujo no guarda identificadores fantasma",
  );
  ok(
    corrida.result?.kind === "document" && !!corrida.result.notice?.includes("definiciones de bloque"),
    "y declara lo que esta versión no alcanza",
  );
}

{
  // Designando un objeto en vez de teclear el nombre.
  const mesa = new Mesa(dibujoConCapas(), "MUROS");
  const corrida = mesa.run("LAYDEL", [
    palabra("Designar"),
    { kind: "entityPick", entityId: "a2", point: { x: 5, y: 5 } },
    palabra("Sí"),
  ]);
  ok(corrida.result?.kind === "document", "la capa se resuelve desde el objeto designado");
  eq(
    mesa.document.layers.map((layer) => layer.name).includes("AUXILIAR"),
    false,
    "y se borra igual",
  );
}

console.log(`engine/commands/express-tools.spec: ${checks} comprobaciones OK`);
