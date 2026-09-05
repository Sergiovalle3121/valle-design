/**
 * La orden COMPARE, arrancada entera y con su lote APLICADO.
 *
 * Dos reglas, las mismas que la spec de las diez órdenes de PDF:
 *
 * 1. **La orden se conduce entera**, desde `begin` hasta el resultado, con las
 *    entradas que el usuario teclearía. Llamar a las funciones internas
 *    demostraría que sabemos comparar documentos —eso ya lo prueba
 *    `compare-documents.spec.ts`—; lo que hay que saber aquí es que la ORDEN
 *    llega hasta ellas.
 * 2. **El lote se APLICA** con `executeCadEntityCommandBatch`, que es la única
 *    ruta de mutación. Comprobar listas de órdenes sin aplicarlas probaría que
 *    sabemos construir listas.
 *
 * Y la comprobación que da nombre al entregable: **comparar un dibujo consigo
 * mismo no escribe nada y lo dice**. Un lote vacío daría un paso de deshacer
 * que no deshace, y tres capas «por si acaso» ensuciarían un dibujo que no
 * cambió.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/compare-drawings.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument, type CadEntity } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import type { CadXrefCatalogEntry } from "../../xref/xref-paths";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { CAD_COMPARE_COMMANDS } from "./compare-drawings";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const p = (x: number, y: number) => ({ x, y, z: 0 });
const text = (value: string): CadCommandInput => ({ kind: "text", value });
const palabra = (keyword: string): CadCommandInput => ({ kind: "keyword", keyword });

const documento = (entities: CadEntity[]): CadDocument =>
  migrateCadDocument({
    meta: { version: 7, schema: 7, unit: "mm" },
    entities,
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });

/** El dibujo que mandó el compañero: la revisión A. */
const revisionA = documento([
  { id: "m1", type: "wall", start: p(0, 0), end: p(5000, 0), thickness: 150, height: 2400, layer: "MUROS" },
  { id: "t1", type: "text", x: 1200, y: 900, text: "SALA", height: 250, layer: "TEXTOS" },
  { id: "c1", type: "circle", center: p(9000, 5000), radius: 400, layer: "0" },
]);

/** El que está abierto: la revisión B. */
const revisionB = documento([
  { id: "m1", type: "wall", start: p(0, 250), end: p(5000, 250), thickness: 150, height: 2400, layer: "MUROS" },
  { id: "t1", type: "text", x: 1200, y: 900, text: "SALA", height: 250, layer: "COTAS" },
  { id: "l9", type: "line", start: p(6000, 0), end: p(6000, 2400), layer: "MUROS" },
]);

const catalogEntry = (name: string, snapshot: CadDocument | null): CadXrefCatalogEntry => ({
  assetId: `activo-${name}`,
  revision: "UNIVERSAL",
  name,
  uri: `tenant-layout://activo-${name}/UNIVERSAL`,
  relativePath: `revisiones/${name}.vdz`,
  ...(snapshot
    ? {
        snapshot: {
          tenantId: "t1",
          assetId: `activo-${name}`,
          name,
          revision: "UNIVERSAL",
          version: snapshot.meta.version,
          document: snapshot,
          contentHash: `hash-${name}`,
          fetchedAt: "2026-09-04T00:00:00.000Z",
        },
      }
    : {}),
});

/** El estudio: un documento vivo y la biblioteca que el anfitrión publica. */
class Estudio {
  document: CadDocument;
  catalog: CadXrefCatalogEntry[];
  private ids = 0;

  constructor(document: CadDocument, catalog: CadXrefCatalogEntry[]) {
    this.document = document;
    this.catalog = catalog;
  }

  context(): CadCommandContext {
    const document = this.document;
    return {
      entityIds: document.entities.map((entity) => entity.id),
      entity: (id) => document.entities.find((entity) => entity.id === id),
      selection: [],
      activeLayer: "0",
      unit: "mm",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      layers: () => document.layers,
      document: () => document,
      xrefCatalog: () => this.catalog,
      newEntityId: () => `n${(this.ids += 1)}`,
    };
  }

  run(inputs: readonly CadCommandInput[]) {
    const descriptor = CAD_COMPARE_COMMANDS.find((candidate) => candidate.name === "COMPARE");
    assert.ok(descriptor, "no existe el descriptor COMPARE");
    const context = this.context();
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
}

// --- 1. La orden entera: dibujo, nubes y lote aplicado ---------------------

const estudio = new Estudio(revisionB, [catalogEntry("revision-a", revisionA)]);
const primera = estudio.run([]);
ok(
  primera.prompts[0].includes("Indique el dibujo con el que comparar"),
  "el primer paso pide el dibujo, y con la biblioteca cargada lo enumera",
);
ok(primera.prompts[0].includes("revision-a"), "nombrando lo que hay disponible");

const conNubes = estudio.run([text("revision-a"), palabra("Nubes")]);
ok(
  conNubes.prompts.some((prompt) => prompt.includes("¿Marcar con nubes de revisión o sólo el informe?")),
  "tras resolver el dibujo pregunta qué hacer con las diferencias",
);
ok(
  conNubes.prompts.some((prompt) => prompt.includes("1 añadida, 1 borrada, 2 modificadas")),
  "y ya dice cuántas diferencias de cada clase encontró antes de escribir nada",
);
eq(conNubes.result?.kind, "document", "elegir Nubes escribe en el documento");
if (conNubes.result?.kind !== "document") throw new Error("COMPARE no devolvió un lote");
eq(conNubes.result.label, "COMPARE", "con la etiqueta de la orden, que es la frontera del deshacer");

const notice = conNubes.result.notice ?? "";
ok(notice.includes("1 añadida"), "el aviso dice las añadidas");
ok(notice.includes("1 borrada"), "las borradas");
ok(notice.includes("2 modificadas"), "las modificadas");
ok(notice.includes("1 de geometría, 1 de propiedad"), "y de qué clase es cada modificación");
ok(
  notice.includes("VD-COMPARE-NUEVO") && notice.includes("VD-COMPARE-BORRADO") && notice.includes("VD-COMPARE-CAMBIADO"),
  "y en qué capa quedó cada nube",
);

eq(estudio.document.meta.version, revisionB.meta.version + 1, "un solo paso de deshacer para toda la comparación");
const capas = estudio.document.layers.filter((layer) => layer.name.startsWith("VD-COMPARE-"));
eq(
  capas.map((layer) => `${layer.name}=${layer.color}`).sort(),
  ["VD-COMPARE-BORRADO=#ff0000", "VD-COMPARE-CAMBIADO=#ffff00", "VD-COMPARE-NUEVO=#00ff00"],
  "las tres capas, con el calco de colores de DWG Compare",
);
const nubes = estudio.document.entities.filter(
  (entity) => entity.type === "polyline" && entity.layer.startsWith("VD-COMPARE-"),
);
eq(nubes.length, 3, "las tres nubes llegaron al dibujo, una por clase");
ok(
  nubes.every((nube) => nube.context?.metadata?.["compare:class"] !== undefined),
  "y cada una deja escrito de qué clase es",
);
eq(
  estudio.document.entities.filter((entity) => !entity.layer.startsWith("VD-COMPARE-")).length,
  revisionB.entities.length,
  "COMPARE no toca ni una entidad del dibujo: sólo añade sus marcas",
);

// --- 2. El informe: cuenta sin escribir -----------------------------------

const soloInforme = new Estudio(revisionB, [catalogEntry("revision-a", revisionA)]);
const informe = soloInforme.run([text("revision-a"), palabra("Informe")]);
eq(informe.result?.kind, "message", "el informe es un mensaje, no una escritura");
eq(soloInforme.document, revisionB, "y el documento queda intacto");
if (informe.result?.kind !== "message") throw new Error("COMPARE Informe no devolvió mensaje");
ok(informe.result.text.includes("1 añadida, 1 borrada, 2 modificadas"), "con el mismo recuento");
ok(
  informe.result.text.includes("~ text t1: capa TEXTOS → COTAS."),
  "y el detalle entidad por entidad, diciendo QUÉ cambió",
);
ok(informe.result.text.includes("~ wall m1: geometría."), "distinguiendo el movimiento del cambio de capa");
ok(informe.result.text.includes("+ line l9"), "y lo añadido");

// --- 3. Un dibujo contra sí mismo: no escribe nada y lo dice ---------------

const espejo = new Estudio(revisionB, [catalogEntry("copia", revisionB)]);
const igual = espejo.run([text("copia")]);
eq(igual.result?.kind, "message", "comparar un dibujo consigo mismo termina en un mensaje");
if (igual.result?.kind !== "message") throw new Error("COMPARE consigo mismo no devolvió mensaje");
ok(
  igual.result.text.includes("los dos dibujos son iguales entidad por entidad"),
  "y lo DICE con esas palabras",
);
ok(igual.result.text.includes("No se ha escrito nada"), "declarando que no escribió");
ok(igual.result.text.includes("3 entidad(es)"), "y cuántas entidades comparó, para que no parezca que no miró");
eq(espejo.document, revisionB, "el documento es el MISMO objeto: ni una versión de más");
eq(espejo.document.meta.version, revisionB.meta.version, "y la versión no se movió");
eq(
  espejo.document.layers.filter((layer) => layer.name.startsWith("VD-COMPARE-")).length,
  0,
  "ni se creó ninguna capa de comparación",
);

// --- 3-bis. Sólo se crean las capas de las clases que hubo -----------------

const soloAnadidos = new Estudio(
  revisionB,
  [
    catalogEntry(
      "sin-la-linea",
      documento(revisionB.entities.filter((entity) => entity.id !== "l9")),
    ),
  ],
);
const anadido = soloAnadidos.run([text("sin-la-linea"), palabra("Nubes")]);
eq(anadido.result?.kind, "document", "una sola diferencia también se marca");
eq(
  soloAnadidos.document.layers.filter((layer) => layer.name.startsWith("VD-COMPARE-")).map((layer) => layer.name),
  ["VD-COMPARE-NUEVO"],
  "sin borrados ni cambios no se crean sus capas: un dibujo no se llena de capas vacías",
);

// --- 4. Las negativas dicen por qué ---------------------------------------

const sinBiblioteca = new Estudio(revisionB, []);
const ciego = sinBiblioteca.run([text("lo-que-sea")]);
if (ciego.result?.kind !== "message") throw new Error("se esperaba mensaje");
ok(
  ciego.result.text.includes("no publica todavía la biblioteca"),
  "sin biblioteca la orden culpa al editor, no al dibujo",
);
ok(ciego.result.text.includes("identificador de activo"), "y explica por dónde entra el segundo dibujo");

const sinContenido = new Estudio(revisionB, [catalogEntry("listado-sin-bajar", null)]);
const vacio = sinContenido.run([text("listado-sin-bajar")]);
if (vacio.result?.kind !== "message") throw new Error("se esperaba mensaje");
ok(
  vacio.result.text.includes("su contenido no está cargado"),
  "«lo conozco y no lo tengo» es un problema distinto de «no existe», y se dice distinto",
);
ok(vacio.result.text.includes("XATTACH"), "y se remite a la orden que sí lo trae");

const noExiste = new Estudio(revisionB, [catalogEntry("revision-a", revisionA)]);
const perdido = noExiste.run([text("no-existe")]);
if (perdido.result?.kind !== "message") throw new Error("se esperaba mensaje");
ok(perdido.result.text.includes("no hay ningún dibujo «no-existe»"), "un nombre inexistente se nombra");
ok(perdido.result.text.includes("revision-a"), "y se lista lo que sí hay");

// --- 5. La biblioteca se puede consultar antes de elegir -------------------

const consulta = new Estudio(revisionB, [catalogEntry("revision-a", revisionA), catalogEntry("otra", null)]);
const listado = consulta.run([palabra("?")]);
if (listado.result?.kind !== "message") throw new Error("se esperaba mensaje");
ok(listado.result.text.includes("revision-a"), "el listado enumera los dibujos");
ok(
  listado.result.text.includes("otra (sin contenido cargado)"),
  "y marca cuáles no se pueden comparar todavía, en vez de dejar descubrirlo al elegirlo",
);

// --- 6. Sin documento, la orden no finge ----------------------------------

const descriptor = CAD_COMPARE_COMMANDS[0];
const ciegoDelTodo = descriptor.step(
  descriptor.begin({
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "n1",
  } as unknown as CadCommandContext).state,
  text("revision-a"),
  {
    entityIds: [],
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "n1",
  } as unknown as CadCommandContext,
);
eq(ciegoDelTodo.result?.kind, "message", "sin documento expuesto la orden contesta");
ok(
  ciegoDelTodo.result?.kind === "message" && ciegoDelTodo.result.text.includes("no expone el documento"),
  "diciendo exactamente qué le falta",
);

eq(CAD_COMPARE_COMMANDS.length, 1, "un solo descriptor: COMPARE");
eq(descriptor.name, "COMPARE", "con el nombre canónico de AutoCAD");
ok(descriptor.aliases.includes("DWGCOMPARE"), "y el alias con el que se conoce en AutoCAD");
ok(descriptor.aliases.includes("COMPARAR"), "más el español");
ok(descriptor.mutates, "declara que escribe: la cinta y el guion lo necesitan");

console.log(`compare-drawings.spec: ${checks} comprobaciones OK`);
