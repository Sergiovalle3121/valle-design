/**
 * Las diez órdenes de PDF, con PDF de VERDAD y contra el documento de verdad.
 *
 * Dos reglas gobiernan esta spec, y las dos vienen de cicatrices:
 *
 * 1. **El archivo es real.** Cada descriptor arranca con un PDF de
 *    `cadPdfCorpus()` —escrito byte a byte, con su tabla de referencias
 *    cruzadas, abrible por cualquier visor— metido en el sobre de
 *    `pdf-attach-payload.ts`. Probar las órdenes con una maqueta demostraría
 *    que nuestras órdenes entienden nuestras maquetas.
 * 2. **El resultado se APLICA.** Todo lote pasa por
 *    `executeCadEntityCommandBatch`, que es la única ruta de mutación del
 *    documento, igual que hace `pdf-underlay.spec.ts`. Comprobar listas de
 *    órdenes sin aplicarlas probaría que sabemos construir listas; lo que hay
 *    que saber es que el dibujo QUEDA como la orden dice.
 *
 * Con anclas absolutas, no con «es más grande»: una lámina Carta a tamaño de
 * papel mide 215,9 mm; escalada a partir de dos puntos que en la realidad miden
 * 5 m, mide 10 795; el recorte de media lámina cae en 306 × 396 PUNTOS de
 * página.
 *
 * Correr:  npx tsx src/lib/cad/engine/commands/pdf-underlay-commands.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument } from "../../cad-document";
import { executeCadEntityCommandBatch } from "../../entity-commands";
import { cadPdfCorpus } from "../../pdf/pdf-corpus";
import {
  CAD_PDF_PAYLOAD_ERROR_KIND,
  cadPdfAttachPayloadFor,
  encodeCadPdfPayload,
} from "../../pdf/pdf-attach-payload";
import { cadFindPdfUnderlay, cadPdfUnderlayList } from "../../pdf/pdf-underlay";
import type { CadCommandContext, CadCommandInput, CadCommandResult } from "../command-types";
import { CAD_PDF_UNDERLAY_COMMANDS } from "./pdf-underlay-commands";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = <T>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: se esperaba ${expected} ± ${tolerance} y se midió ${actual}`,
  );
  checks += 1;
};

const bytesOf = (id: string) => {
  const entry = cadPdfCorpus().find((file) => file.id === id);
  assert.ok(entry, `falta ${id} en el corpus`);
  return entry.bytes;
};

/** El sobre que el anfitrión entregaría por la puerta de texto. */
const sobre = (corpusId: string, fileName: string) =>
  cadPdfAttachPayloadFor({ name: fileName, bytes: bytesOf(corpusId) });

const emptyDocument = (): CadDocument =>
  migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  });

const text = (value: string): CadCommandInput => ({ kind: "text", value });
const punto = (x: number, y: number): CadCommandInput => ({ kind: "point", point: { x, y }, source: "typed" });
const distancia = (value: number): CadCommandInput => ({ kind: "distance", value });
const palabra = (keyword: string): CadCommandInput => ({ kind: "keyword", keyword });
const intro: CadCommandInput = { kind: "enter" };

/**
 * El estudio: un documento vivo y el contexto que las órdenes ven.
 *
 * Cada orden se conduce contra el documento tal como quedó tras la anterior, que
 * es como se usan de verdad: adjuntar, escalar, recortar y desadjuntar el mismo
 * sustrato. Un contexto nuevo por orden con un documento vacío no encontraría
 * nada que designar.
 */
class Estudio {
  document: CadDocument = emptyDocument();
  selection: string[] = [];
  private ids = 0;

  context(): CadCommandContext {
    const document = this.document;
    return {
      entityIds: document.entities.map((entity) => entity.id),
      entity: (id) => document.entities.find((entity) => entity.id === id),
      selection: this.selection,
      activeLayer: "0",
      unit: "mm",
      view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
      layers: () => document.layers,
      document: () => document,
      newEntityId: () => `n${(this.ids += 1)}`,
    };
  }

  run(name: string, inputs: readonly CadCommandInput[]) {
    const descriptor = CAD_PDF_UNDERLAY_COMMANDS.find((candidate) => candidate.name === name);
    assert.ok(descriptor, `no existe el descriptor ${name}`);
    const context = this.context();
    let step = descriptor.begin(context);
    const prompts = [step.prompt.message];
    for (const input of inputs) {
      if (step.result) break;
      step = descriptor.step(step.state, input, context);
      prompts.push(step.prompt.message);
    }
    const result: CadCommandResult | undefined = step.result;
    // Aplicar AQUÍ, por la única ruta de mutación, es lo que convierte esta spec
    // en una prueba del producto y no de una lista de intenciones.
    if (result?.kind === "document")
      this.document = executeCadEntityCommandBatch(this.document, result.commands, result.label).document;
    return { result, prompts };
  }

  /** La única fila del gestor, que es lo que el usuario ve en el panel. */
  row(index = 0) {
    const rows = cadPdfUnderlayList(this.document);
    assert.ok(rows[index], `se esperaba un sustrato en la posición ${index}`);
    return rows[index];
  }
}

function escribio(run: { result?: CadCommandResult }, label: string) {
  const result = run.result;
  assert.ok(result && result.kind === "document", `debía escribir, dio ${result?.kind ?? "nada"}${result?.kind === "message" ? `: ${result.text}` : ""}`);
  eq(result.label, label, `la etiqueta de deshacer de ${label}`);
  return { commands: result.commands, notice: result.notice ?? "" };
}

function mensaje(run: { result?: CadCommandResult }): string {
  const result = run.result;
  assert.ok(result && result.kind === "message", `debía terminar con mensaje, dio ${result?.kind ?? "nada"}`);
  checks += 1;
  return result.text;
}

/* ── 1. Las diez órdenes existen y declaran lo que son ──────────────────── */
{
  const names = CAD_PDF_UNDERLAY_COMMANDS.map((command) => command.name);
  eq(
    names,
    ["PDFATTACH", "PDFIMPORT", "PDFCLIP", "PDFADJUST", "PDFPAGE", "PDFSCALE", "PDFDETACH", "PDFUNLOAD", "PDFRELOAD", "PDFLIST"],
    "las diez órdenes, en el orden en que se usan",
  );
  eq(new Set(names).size, 10, "ningún nombre repetido");
  eq(
    CAD_PDF_UNDERLAY_COMMANDS.filter((command) => !command.mutates).map((command) => command.name),
    ["PDFLIST"],
    "sólo el gestor es de consulta; las otras nueve escriben",
  );
  ok(
    CAD_PDF_UNDERLAY_COMMANDS.every((command) => command.aliases.length > 0 && command.aliases.every((alias) => alias === alias.toUpperCase())),
    "todas traen su alias en español, en mayúsculas como el nombre canónico",
  );
}

/* ── 2. PDFATTACH: la lámina Carta queda de 215,9 mm ────────────────────── */
const CARTA = "levantamiento-1980.pdf";
const estudio = new Estudio();
{
  const run = estudio.run("PDFATTACH", [text(sobre("scanned-image-only", CARTA)), punto(0, 0), intro, intro]);
  // Con UNA página no se pregunta cuál: se pasa directo a la inserción.
  eq(
    run.prompts[1],
    `«${CARTA}» p.1 (215.9 × 279.4 mm). Precise el punto de inserción (esquina inferior izquierda)`,
    "tras el sobre, la inserción, con el tamaño de papel medido del archivo",
  );
  eq(run.prompts[2], "Precise la escala del sustrato: 1 lo deja a tamaño de papel (215.9 × 279.4 mm)", "luego la escala");
  eq(run.prompts[3], "¿Bloquear el sustrato? Bloqueado se dibuja encima sin designarlo por error", "luego el bloqueo");

  const { commands, notice } = escribio(run, "PDFATTACH");
  eq(commands.length, 3, "la capa, la definición y la lámina: una sola transacción");
  eq(
    notice,
    `PDFATTACH: «${CARTA}» p.1 de 1 (215.9 × 279.4 mm de papel) en (0, 0); escala 1, ocupa 215.9 × 279.4 unidades. ` +
      "Bloqueado. Escálalo a medida real con PDFSCALE.",
    "la orden dice sus números",
  );

  const found = cadFindPdfUnderlay(estudio.document, CARTA);
  assert.ok(found, "el sustrato se localiza por el nombre del archivo");
  checks += 1;
  const { entity } = found;
  near(estudio.row().width, 215.9, 1e-6, "el ancho de la lámina en el dibujo, en milímetros");
  near(estudio.row().height, 279.4, 1e-6, "y su alto");
  near(estudio.row().scale, 1, 1e-9, "a tamaño de papel");
  eq([estudio.row().locked, estudio.row().fade, estudio.row().clipped], [true, 0, false], "bloqueada, opaca y sin recortar");

  const layer = estudio.document.layers.find((candidate) => candidate.id === entity.layer);
  assert.ok(layer, "el sustrato trae su propia capa");
  checks += 1;
  ok(layer.locked && layer.plot === false, "la capa nace bloqueada y no se imprime");
  eq(estudio.document.modelSpace.entityIds[0], entity.id, "y la lámina va al FONDO: un sustrato al frente taparía el dibujo");

  const definition = estudio.document.imageDefinitions?.find((item) => item.id === entity.definition);
  assert.ok(definition, "la definición queda en el documento");
  checks += 1;
  ok(definition.uri.startsWith("data:application/pdf;base64,"), "con el PDF entero dentro del dibujo");
}

/* ── 3. Lo que PDFATTACH todavía no hace, y lo que rechaza ──────────────── */
{
  const pedido = new Estudio().run("PDFATTACH", [palabra("Archivo")]);
  ok(
    mensaje(pedido).includes("el selector de archivos para PDF todavía no está conectado"),
    "la opción Archivo DECLARA su límite en vez de abrir un cuadro que no existe",
  );
  ok(
    mensaje(new Estudio().run("PDFATTACH", [text("0\nSECTION")])).includes("Un PDF son bytes"),
    "un DXF pegado se rechaza diciendo por qué un PDF no se pega",
  );
  const roto = encodeCadPdfPayload({ kind: CAD_PDF_PAYLOAD_ERROR_KIND, name: "grande.pdf", reason: "pesa 12.0 MB y el tope es 8 MB." });
  ok(
    mensaje(new Estudio().run("PDFATTACH", [text(roto)])).includes("«grande.pdf» no se adjunta: pesa 12.0 MB"),
    "el sobre de error llega hasta la línea de órdenes con su motivo",
  );
  const noEsPdf = new Estudio().run("PDFATTACH", [text(cadPdfAttachPayloadFor({ name: "plano.pdf", bytes: new TextEncoder().encode("hola") }))]);
  ok(mensaje(noEsPdf).includes("%PDF-"), "un .pdf que no lo es lo dice el LECTOR, con sus palabras");
}

/* ── 4. PDFSCALE: dos puntos que miden 5 m ──────────────────────────────── */
{
  // Los dos puntos designados distan 100 unidades sobre la lámina a tamaño de
  // papel; el plano dice que ese muro mide 5 m. Factor 50, y la lámina Carta
  // pasa a medir 10 795 mm.
  const run = estudio.run("PDFSCALE", [text(CARTA), punto(0, 0), punto(100, 0), distancia(5000)]);
  eq(run.prompts[1], "Precise el primer punto de una medida que el plano ya lleve escrita", "PDFSCALE pide el primer punto");
  eq(run.prompts[3], "Entre esos dos puntos hay 100 unidades. Precise cuánto miden DE VERDAD", "y enseña lo medido antes de pedir lo real");
  const { notice } = escribio(run, "PDFSCALE");
  eq(
    notice,
    `PDFSCALE: «${CARTA}» medía 100 unidades entre los dos puntos y ahora mide 5000: factor 50. ` +
      "La lámina queda a escala 50 frente al tamaño de papel.",
    "la orden publica el factor que acaba de aplicar al plano entero",
  );
  near(estudio.row().width, 10795, 1e-6, "215,9 mm × 50: la lámina ya está a medida real");
  near(estudio.row().scale, 50, 1e-9, "y el gestor lo dice");

  const { entity } = cadFindPdfUnderlay(estudio.document, CARTA)!;
  eq([entity.insertion.x, entity.insertion.y], [0, 0], "el primer punto designado se queda quieto: es una homotecia de centro ahí");

  ok(
    mensaje(estudio.run("PDFSCALE", [text(CARTA), punto(10, 10), punto(10, 10), distancia(1000)])).includes("son el mismo"),
    "dos puntos iguales fallan cerrado en vez de producir una escala absurda",
  );
  ok(
    mensaje(estudio.run("PDFSCALE", [text(CARTA), punto(0, 0), punto(100, 0), distancia(0)])).includes("mayor que cero"),
    "y una medida real de cero también",
  );
}

/* ── 5. PDFCLIP: el recorte cae en PUNTOS de página ─────────────────────── */
const recortes = new Estudio();
{
  recortes.run("PDFATTACH", [text(sobre("scanned-image-only", CARTA)), punto(0, 0), intro, intro]);
  // Media lámina: 107,95 × 139,7 mm de papel son 306 × 396 puntos exactos.
  const run = recortes.run("PDFCLIP", [text(CARTA), intro, intro, punto(0, 0), punto(107.95, 139.7)]);
  eq(run.prompts[1], "Indique la opción de recorte", "primero Nuevo o Eliminar");
  eq(run.prompts[2], "Indique el tipo de contorno", "luego Rectangular o Poligonal");
  const { notice } = escribio(run, "PDFCLIP");
  eq(notice, `PDFCLIP: «${CARTA}» recortado por 4 vértices.`, "la orden lo dice");

  const { entity } = cadFindPdfUnderlay(recortes.document, CARTA)!;
  const boundary = entity.clipBoundary ?? [];
  eq(boundary.length, 4, "cuatro vértices");
  near(boundary[1].x, 306, 1e-6, "la esquina derecha del recorte, en puntos de página");
  near(boundary[2].y, 396, 1e-6, "y la superior");
  ok(recortes.row().clipped, "el gestor enseña la lámina como recortada");

  const quitado = recortes.run("PDFCLIP", [text(CARTA), palabra("Eliminar")]);
  eq(escribio(quitado, "PDFCLIP").notice, `PDFCLIP: recorte eliminado de «${CARTA}».`, "Eliminar lo retira");
  eq(cadFindPdfUnderlay(recortes.document, CARTA)!.entity.clipBoundary, undefined, "y el campo queda vacío de verdad");

  ok(
    mensaje(recortes.run("PDFCLIP", [text(CARTA), intro, palabra("Poligonal"), punto(9000, 9000), punto(9100, 9000), punto(9000, 9100), intro])).includes(
      "no toca la lámina",
    ),
    "un contorno fuera de la lámina se rechaza en vez de dejarla invisible",
  );
  ok(mensaje(recortes.run("PDFCLIP", [text("no-existe.pdf")])).includes("no hay ningún sustrato de PDF que se llame"), "un nombre que no está se dice");
}

/* ── 6. PDFADJUST: el desvanecido sobrevive al cambio de bloqueo ────────── */
{
  const run = recortes.run("PDFADJUST", [text(CARTA), palabra("Desvanecido"), distancia(60), palabra("Bloqueo"), palabra("Listo")]);
  eq(run.prompts[1], "Desvanecido 0 · bloqueado. Indique el ajuste", "PDFADJUST arranca con las cifras vigentes");
  eq(run.prompts[2], "Precise el desvanecido (0 opaco a 100 invisible)", "Desvanecido pide su valor");
  eq(escribio(run, "PDFADJUST").notice, `PDFADJUST: «${CARTA}» desvanecido 60, editable.`, "y publica cómo queda");

  const { entity, underlay } = cadFindPdfUnderlay(recortes.document, CARTA)!;
  // La comprobación que justifica el módulo: desvanecer y desbloquear
  // SUSTITUYEN la entidad entera, así que la segunda orden se construye sobre
  // el resultado de la primera. Si no, el 60 volvería a 0 sin que nada avisara.
  eq(entity.fade, 60, "el desvanecido sigue puesto después de tocar el bloqueo");
  eq([entity.context?.editable, underlay.locked], [true, false], "y el sustrato quedó editable");
  eq(recortes.document.layers.find((layer) => layer.id === entity.layer)?.locked, false, "la CAPA es la que se desbloquea: es la que estorba al designar");
  ok(mensaje(recortes.run("PDFADJUST", [text(CARTA), palabra("Listo")])).includes("queda como estaba"), "sin cambios no se escribe, y se dice");
}

/* ── 7. PDFPAGE: cambiar de página sin volver a pedir el archivo ────────── */
const conjunto = new Estudio();
const TRES = "conjunto.pdf";
{
  const adjuntado = conjunto.run("PDFATTACH", [text(sobre("multipage-three", TRES)), distancia(2), punto(1000, 500), distancia(2), palabra("No")]);
  eq(
    adjuntado.prompts[1],
    `«${TRES}» tiene 3 páginas (1: 215.9 × 279.4 mm · 2: 215.9 × 279.4 mm · 3: 215.9 × 279.4 mm). Precise la página`,
    "con varias páginas se pregunta cuál, con sus tamaños medidos",
  );
  const { notice } = escribio(adjuntado, "PDFATTACH");
  ok(notice.startsWith(`PDFATTACH: «${TRES}» p.2 de 3`), `se adjuntó la página pedida: ${notice}`);
  near(conjunto.row().width, 431.8, 1e-6, "a escala 2 la lámina Carta ocupa 431,8 unidades");
  eq(conjunto.row().locked, false, "y se pidió editable");

  const run = conjunto.run("PDFPAGE", [text(TRES), distancia(3)]);
  ok(run.prompts[1].startsWith(`«${TRES}» está en la página 2 de 3`), `PDFPAGE lee la lista de páginas del propio dibujo: ${run.prompts[1]}`);
  eq(
    escribio(run, "PDFPAGE").notice,
    `PDFPAGE: «${TRES}» pasa de la página 2 a la 3 de 3 (215.9 × 279.4 mm de papel).`,
    "y lo dice con la página de destino",
  );
  eq(conjunto.row().page, 3, "el sustrato quedó en la página 3");
  near(conjunto.row().width, 431.8, 1e-6, "sin perder la escala que tenía");
  ok(mensaje(conjunto.run("PDFPAGE", [text(TRES), distancia(9)])).includes("no tiene la página 9"), "una página que no existe se rechaza con su número");
}

/* ── 8. PDFIMPORT de un escaneo: falla con su nombre y remite a PDFATTACH ─ */
{
  const antes = conjunto.document.entities.length;
  const run = conjunto.run("PDFIMPORT", [text(sobre("scanned-image-only", CARTA)), punto(0, 0)]);
  const texto = mensaje(run);
  ok(texto.startsWith(`PDFIMPORT: «${CARTA}» no entró.`), `el fallo lleva el nombre del archivo: ${texto}`);
  ok(texto.includes("Este PDF es una imagen, no tiene geometría que importar"), "dice qué pasa de verdad");
  ok(texto.includes("PDFATTACH"), "y remite a la orden que SÍ resuelve un escaneo");
  ok(texto.includes("calca encima"), "explicando qué se hace con ella");
  eq(conjunto.document.entities.length, antes, "y el dibujo no cambió");
}

/* ── 9. PDFIMPORT vectorial: el informe de pérdidas viaja en el aviso ───── */
{
  const importa = new Estudio();
  const run = importa.run("PDFIMPORT", [text(sobre("text-glyph-indices", "estructural.pdf")), punto(0, 0), intro]);
  ok(
    run.prompts[2].includes("¿Insertar en el dibujo?") && run.prompts[2].includes("índices de glifo"),
    `las pérdidas se leen ANTES de tocar el dibujo: ${run.prompts[2]}`,
  );
  const { notice } = escribio(run, "PDFIMPORT (7 entidades)");
  ok(notice.startsWith("PDFIMPORT: «estructural.pdf» p.1 de 1 · Entraron 7 trazo(s)"), `el aviso empieza por el titular del informe: ${notice}`);
  ok(notice.includes("1 cosa(s) NO entraron"), "con la cuenta de lo perdido");
  ok(notice.includes("índices de glifo"), "y el detalle de la pérdida, no sólo su código");
  ok(notice.includes("tamaño de papel"), "más el límite de la escala: un PDF no dice a qué escala se dibujó");
  eq(importa.document.entities.length, 7, "las siete entidades entraron al documento de verdad");
  ok(
    importa.document.layers.some((layer) => layer.id === "PDF"),
    "y su capa se creó",
  );

  const rechazado = new Estudio();
  const cancelado = rechazado.run("PDFIMPORT", [text(sobre("optional-content-groups", "capas.pdf")), punto(0, 0), palabra("No")]);
  ok(mensaje(cancelado).includes("El dibujo no ha cambiado"), "leído el informe, se puede decir que no");
  eq(rechazado.document.entities.length, 0, "y no se escribe nada");

  const capas = new Estudio();
  const conCapas = capas.run("PDFIMPORT", [text(sobre("optional-content-groups", "capas.pdf")), punto(0, 0), intro]);
  ok(escribio(conCapas, "PDFIMPORT (2 entidades)").notice.includes("venían APAGADAS"), "una capa apagada en el PDF se declara como pérdida");
}

/* ── 10. Descargar, recargar, desadjuntar y el gestor ───────────────────── */
{
  eq(
    escribio(conjunto.run("PDFUNLOAD", [text(TRES)]), "PDFUNLOAD").notice,
    `PDFUNLOAD: «${TRES}» descargado. Conserva su sitio, su escala y su ruta: PDFRELOAD lo devuelve.`,
    "descargar conserva la ficha",
  );
  eq(conjunto.row().status, "unloaded", "el gestor lo enseña descargado");
  eq(cadFindPdfUnderlay(conjunto.document, TRES)!.entity.showImage, false, "y deja de dibujarse");
  ok(mensaje(conjunto.run("PDFUNLOAD", [text(TRES)])).includes("ya estaba descargado"), "descargar dos veces no escribe: lo dice");

  escribio(conjunto.run("PDFRELOAD", [text(TRES)]), "PDFRELOAD");
  eq(conjunto.row().status, "loaded", "recargar lo devuelve sin ir a buscar el archivo");
  near(conjunto.row().width, 431.8, 1e-6, "con su escala intacta");

  const listado = mensaje(conjunto.run("PDFLIST", []));
  ok(listado.startsWith("PDFLIST: 1 sustrato(s) de PDF."), `el gestor cuenta lo que hay: ${listado}`);
  ok(listado.includes(`«${TRES}» p.3 de 3`) && listado.includes("escala 2") && listado.includes("editable"), "con archivo, página, escala y estado");

  const capa = cadFindPdfUnderlay(conjunto.document, TRES)!.entity.layer;
  escribio(conjunto.run("PDFDETACH", [text(TRES)]), "PDFDETACH");
  eq(cadFindPdfUnderlay(conjunto.document, TRES), null, "desadjuntar se lleva la lámina");
  ok(!conjunto.document.layers.some((layer) => layer.id === capa), "y su capa, que quedaría vacía");
  eq(mensaje(conjunto.run("PDFLIST", [])), "PDFLIST: no hay ningún PDF adjuntado en este dibujo.", "el gestor lo dice en vez de enseñar una tabla vacía");
  ok(mensaje(conjunto.run("PDFDETACH", [text(TRES)])).includes("no hay ningún PDF adjuntado"), "y desadjuntar sin nada adjuntado también");
}

/* ── 11. El sustrato designado ANTES de teclear la orden ────────────────── */
{
  const designado = new Estudio();
  designado.run("PDFATTACH", [text(sobre("scanned-image-only", CARTA)), punto(0, 0), intro, intro]);
  designado.selection = [cadFindPdfUnderlay(designado.document, CARTA)!.entity.id];
  eq(designado.run("PDFCLIP", []).prompts[0], "Indique la opción de recorte", "con el sustrato designado, PDFCLIP arranca en las opciones");
  eq(designado.run("PDFADJUST", []).prompts[0], "Desvanecido 0 · bloqueado. Indique el ajuste", "y PDFADJUST en las suyas");
  eq(designado.run("PDFSCALE", []).prompts[0], "Precise el primer punto de una medida que el plano ya lleve escrita", "y PDFSCALE pide ya los puntos");
  escribio(designado.run("PDFUNLOAD", []), "PDFUNLOAD");
  eq(designado.row().status, "unloaded", "y PDFUNLOAD actúa sin preguntar nada");
}

console.log(
  `pdf-underlay-commands: ${checks} comprobaciones · diez órdenes contra PDF reales del corpus, aplicadas con executeCadEntityCommandBatch: ` +
    "Carta a 215,9 mm, PDFSCALE a 10 795 con dos puntos de 5 m, PDFCLIP en 306 × 396 puntos de página, PDFIMPORT de un escaneo remite a PDFATTACH " +
    "y el informe de pérdidas viaja en el aviso",
);
