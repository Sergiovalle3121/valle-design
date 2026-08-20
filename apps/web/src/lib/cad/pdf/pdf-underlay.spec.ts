/**
 * PDFATTACH: el sustrato se adjunta, se escala a medida conocida y NO estorba.
 *
 * Todo pasa por `executeCadEntityCommandBatch`, que es la única ruta de
 * mutación del documento. Comprobar los comandos sin aplicarlos probaría que
 * sabemos construir listas; lo que hay que saber es que el documento QUEDA como
 * se dice, con su capa, su definición y su lámina en el sitio correcto.
 *
 * Con anclas absolutas. Una lámina Carta a tamaño de papel mide 215,9 mm de
 * ancho; escalada a partir de dos puntos que en la realidad miden 5 m, mide lo
 * que tenga que medir y se comprueba con el número, no con «es más grande».
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-underlay.spec.ts
 */
import assert from "node:assert/strict";
import { migrateCadDocument, type CadDocument } from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import { cadPdfCorpus } from "./pdf-corpus";
import { readCadPdfPageList } from "./pdf-import";
import {
  CAD_PDF_UNDERLAY_MM_PER_POINT,
  cadFindPdfUnderlay,
  cadPdfAttachCommands,
  cadPdfClipCommands,
  cadPdfClipRectangle,
  cadPdfDeleteClipCommands,
  cadPdfDetachCommands,
  cadPdfReloadCommands,
  cadPdfScaleToDistanceCommands,
  cadPdfUnderlayContains,
  cadPdfUnderlayFadeCommands,
  cadPdfUnderlayList,
  cadPdfUnderlayLockCommands,
  cadPdfUnderlayPageCommands,
  cadPdfUnderlayTransformCommands,
  cadPdfUnloadCommands,
  type CadPdfUnderlaySource,
} from "./pdf-underlay";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: se esperaba ${expected} ± ${tolerance} y se midió ${actual}`,
  );
  checks += 1;
};

const emptyDocument = (): CadDocument =>
  migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  });

const bytesOf = (id: string) => {
  const entry = cadPdfCorpus().find((file) => file.id === id);
  assert.ok(entry, `falta ${id} en el corpus`);
  return entry.bytes;
};

/** El levantamiento del topógrafo: un PDF de verdad, leído de verdad. */
function sourceFrom(id: string, fileName: string): CadPdfUnderlaySource {
  return {
    uri: `tenant-asset://levantamientos/${fileName}`,
    fileName,
    pages: readCadPdfPageList(bytesOf(id)),
    contentHash: "sha256:levantamiento",
  };
}

const apply = (document: CadDocument, commands: Parameters<typeof executeCadEntityCommandBatch>[1], label: string) =>
  executeCadEntityCommandBatch(document, commands, label).document;

// --- 1. adjuntar deja el documento entero, no a medias ---------------------
{
  const source = sourceFrom("scanned-image-only", "levantamiento-1980.pdf");
  const document = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), { id: "topo", source }),
    "PDFATTACH",
  );

  const found = cadFindPdfUnderlay(document, "topo");
  ok(!!found, "tras adjuntar tiene que haber un sustrato localizable por su id");
  const { entity, underlay } = found!;

  // La lámina Carta a tamaño de papel: 612 × 792 puntos.
  near(entity.size.width, 612, 0.5, "el ancho de la lámina en puntos");
  near(entity.size.height, 792, 0.5, "el alto de la lámina en puntos");
  near(underlay.unitsPerPoint, CAD_PDF_UNDERLAY_MM_PER_POINT, 1e-9, "la escala por defecto");

  // La capa nace BLOQUEADA: es lo que permite dibujar encima sin designarla.
  const layer = document.layers.find((candidate) => candidate.id === entity.layer);
  ok(!!layer, "el sustrato trae su propia capa");
  ok(layer!.locked, "la capa del sustrato nace bloqueada");
  ok(layer!.plot === false, "un sustrato de calco no se imprime por defecto");
  ok(entity.context?.editable === false, "y la lámina nace no editable");

  // La definición existe y apunta al archivo.
  const definition = document.imageDefinitions?.find((item) => item.id === entity.definition);
  ok(!!definition, "la definición de la lámina tiene que quedar en el documento");
  ok(definition!.uri.includes("levantamiento-1980.pdf"), "con la ruta del archivo guardada");

  // Y va AL FONDO: un sustrato al frente taparía el dibujo.
  assert.equal(document.modelSpace.entityIds[0], entity.id);
  checks += 1;

  // Adjuntar dos veces el mismo id falla en vez de duplicar la lámina.
  assert.throws(
    () => cadPdfAttachCommands(document, { id: "topo", source }),
    /ya está adjuntado/,
    "adjuntar dos veces el mismo id tiene que fallar",
  );
  checks += 1;
}

// --- 2. escalar a medida conocida: la operación que lo hace útil -----------
{
  const source = sourceFrom("scanned-image-only", "predio.pdf");
  let document = apply(emptyDocument(), cadPdfAttachCommands(emptyDocument(), { id: "predio", source }), "PDFATTACH");

  // El arquitecto designa dos puntos del sustrato que en el plano de papel
  // distan 100 mm, y dice que en la realidad son 5 metros (1:50).
  const from = { x: 20, y: 20 };
  const to = { x: 120, y: 20 };
  const result = cadPdfScaleToDistanceCommands(document, "predio", from, to, 5000);
  near(result.measured, 100, 1e-9, "lo designado medía 100 mm");
  near(result.factor, 50, 1e-9, "y la realidad son 5 m: factor 50");

  document = apply(document, result.commands, "PDFSCALE");
  const after = cadFindPdfUnderlay(document, "predio")!;

  // El sustrato entero pasa a medir cincuenta veces más.
  near(
    after.entity.size.width * after.underlay.unitsPerPoint,
    612 * CAD_PDF_UNDERLAY_MM_PER_POINT * 50,
    0.5,
    "la lámina escalada mide cincuenta veces el papel",
  );

  // Y el PRIMER punto designado se queda quieto: es una homotecia de centro
  // `from`, no un escalado desde el origen que mandaría la lámina a otra parte.
  const before = { x: 20, y: 20 };
  ok(
    cadPdfUnderlayContains(after.entity, before),
    "el punto designado sigue cayendo sobre la lámina tras escalar",
  );
  // El segundo punto acaba a 5000 mm del primero, que es lo que se pidió.
  const scaledSecond = {
    x: from.x + (to.x - from.x) * result.factor,
    y: from.y + (to.y - from.y) * result.factor,
  };
  near(
    Math.hypot(scaledSecond.x - from.x, scaledSecond.y - from.y),
    5000,
    1e-9,
    "tras escalar, lo designado mide la medida real declarada",
  );

  // Los dos casos que producirían una escala absurda fallan cerrado.
  assert.throws(
    () => cadPdfScaleToDistanceCommands(document, "predio", from, from, 1000),
    /el mismo/,
    "dos puntos iguales no definen una medida",
  );
  checks += 1;
  assert.throws(
    () => cadPdfScaleToDistanceCommands(document, "predio", from, to, 0),
    /mayor que cero/,
    "una medida real de cero tiene que rechazarse",
  );
  checks += 1;
}

// --- 3. recortar la lámina: PDFCLIP -----------------------------------------
{
  const source = sourceFrom("scanned-image-only", "municipio.pdf");
  let document = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), { id: "muni", source }),
    "PDFATTACH",
  );

  // Un rectángulo de recorte en coordenadas de MUNDO, que es como se designa.
  const boundary = cadPdfClipRectangle({ x: 20, y: 20 }, { x: 120, y: 100 });
  document = apply(document, cadPdfClipCommands(document, "muni", boundary), "PDFCLIP");
  const clipped = cadFindPdfUnderlay(document, "muni")!.entity;
  ok((clipped.clipBoundary?.length ?? 0) === 4, "el recorte queda en el campo del esquema");

  // Dentro se ve; fuera no. Es la afirmación entera de un recorte.
  ok(cadPdfUnderlayContains(clipped, { x: 60, y: 60 }), "lo de dentro del recorte se ve");
  ok(!cadPdfUnderlayContains(clipped, { x: 150, y: 60 }), "lo de fuera del recorte NO se ve");

  // El recorte va en coordenadas de la lámina: (20,20) mm son 56,7 puntos.
  near(
    clipped.clipBoundary![0].x,
    20 / CAD_PDF_UNDERLAY_MM_PER_POINT,
    0.01,
    "el contorno se guarda en la unidad de la lámina",
  );

  document = apply(document, cadPdfDeleteClipCommands(document, "muni"), "PDFCLIP borrar");
  const unclipped = cadFindPdfUnderlay(document, "muni")!.entity;
  ok(!unclipped.clipBoundary, "borrar el recorte devuelve la lámina entera");
  ok(cadPdfUnderlayContains(unclipped, { x: 150, y: 60 }), "y vuelve a verse lo que tapaba");

  // Un contorno que no toca la lámina se rechaza: dejaría la lámina invisible
  // sin que nadie entienda por qué.
  assert.throws(
    () => cadPdfClipCommands(document, "muni", cadPdfClipRectangle({ x: 9000, y: 9000 }, { x: 9100, y: 9100 })),
    /no toca la lámina/,
    "un recorte fuera de la lámina tiene que rechazarse",
  );
  checks += 1;
  assert.throws(
    () => cadPdfClipCommands(document, "muni", boundary, { inverted: true }),
    /invertido/,
    "el recorte invertido se rechaza en vez de guardarse y mentir",
  );
  checks += 1;
}

// --- 4. bloquear, desvanecer, descargar: la ceremonia del xref -------------
{
  const source = sourceFrom("scanned-image-only", "estructura.pdf");
  let document = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), { id: "est", source, locked: false }),
    "PDFATTACH",
  );
  ok(
    document.layers.find((layer) => layer.id.includes("pdfunderlay"))?.locked === false,
    "se puede adjuntar SIN bloquear si el usuario lo pide",
  );

  document = apply(document, cadPdfUnderlayLockCommands(document, "est", true), "PDFLOCK");
  const locked = cadFindPdfUnderlay(document, "est")!;
  ok(locked.underlay.locked, "la ficha registra que está bloqueado");
  ok(
    document.layers.find((layer) => layer.id === locked.entity.layer)?.locked === true,
    "bloquear el sustrato bloquea su CAPA, que es donde de verdad estorba",
  );

  document = apply(document, cadPdfUnderlayFadeCommands(document, "est", 70), "PDFFADE");
  assert.equal(cadFindPdfUnderlay(document, "est")!.entity.fade, 70);
  checks += 1;
  assert.throws(
    () => cadPdfUnderlayFadeCommands(document, "est", 140),
    /0 a 100/,
    "un desvanecido fuera de rango se rechaza",
  );
  checks += 1;

  // DESCARGAR conserva la ficha y la ruta; sólo deja de verse.
  document = apply(document, cadPdfUnloadCommands(document, "est"), "PDFUNLOAD");
  const unloaded = cadFindPdfUnderlay(document, "est")!;
  assert.equal(unloaded.underlay.status, "unloaded");
  checks += 1;
  ok(unloaded.entity.showImage === false, "descargado deja de mostrarse");
  ok(
    unloaded.underlay.uri.includes("estructura.pdf"),
    "y conserva la ruta para poder recargarlo sin buscarlo",
  );

  document = apply(document, cadPdfReloadCommands(document, "est"), "PDFRELOAD");
  assert.equal(cadFindPdfUnderlay(document, "est")!.underlay.status, "loaded");
  checks += 1;
}

// --- 5. el gestor enseña lo que hace falta para detectar un disparate ------
{
  const first = sourceFrom("multipage-three", "serie.pdf");
  const second = sourceFrom("scanned-image-only", "predio.pdf");
  let document = emptyDocument();
  document = apply(document, cadPdfAttachCommands(document, { id: "a", source: first, page: 2 }), "PDFATTACH");
  document = apply(document, cadPdfAttachCommands(document, { id: "b", source: second }), "PDFATTACH");

  const rows = cadPdfUnderlayList(document);
  assert.equal(rows.length, 2);
  checks += 1;
  const serie = rows.find((row) => row.fileName === "serie.pdf")!;
  assert.equal(serie.page, 2);
  assert.equal(serie.pageCount, 3);
  checks += 2;
  // El ancho que ocupa DE VERDAD en el dibujo, no el de la página: es el número
  // que delata una escala absurda antes de calcar media planta.
  near(serie.width, 215.9, 0.5, "a tamaño de papel, una Carta ocupa 215,9 mm");
  assert.equal(serie.scale, 1);
  checks += 1;
  ok(rows.every((row) => row.locked), "los dos sustratos salen bloqueados en el gestor");
  ok(rows[0].fileName <= rows[1].fileName, "el gestor sale ordenado");

  // Cambiar de página conserva sitio y escala.
  document = apply(
    document,
    cadPdfUnderlayPageCommands(document, "a", 3, first.pages),
    "PDFPAGE",
  );
  assert.equal(cadFindPdfUnderlay(document, "a")!.underlay.page, 3);
  checks += 1;
  assert.throws(
    () => cadPdfUnderlayPageCommands(document, "a", 9, first.pages),
    /no tiene la página 9/,
    "pedir una página que no existe tiene que fallar",
  );
  checks += 1;
}

// --- 6. mover, girar y escalar a mano --------------------------------------
{
  const source = sourceFrom("scanned-image-only", "giro.pdf");
  let document = apply(emptyDocument(), cadPdfAttachCommands(emptyDocument(), { id: "g", source }), "PDFATTACH");

  document = apply(
    document,
    cadPdfUnderlayTransformCommands(document, "g", { move: { x: 100, y: 50 } }),
    "PDFMOVE",
  );
  const moved = cadFindPdfUnderlay(document, "g")!.entity;
  near(moved.insertion.x, 100, 1e-9, "mover desplaza la esquina de la lámina");
  near(moved.insertion.y, 50, 1e-9, "mover desplaza la esquina de la lámina");

  // Girar 90° alrededor de la propia esquina: los vectores giran, la esquina no.
  document = apply(
    document,
    cadPdfUnderlayTransformCommands(document, "g", { rotate: Math.PI / 2 }),
    "PDFROTATE",
  );
  const turned = cadFindPdfUnderlay(document, "g")!.entity;
  near(turned.insertion.x, 100, 1e-9, "girar alrededor de la esquina no la mueve");
  near(turned.uVector.x, 0, 1e-9, "el vector U gira noventa grados");
  near(turned.uVector.y, CAD_PDF_UNDERLAY_MM_PER_POINT, 1e-9, "y conserva su longitud");

  assert.throws(
    () => cadPdfUnderlayTransformCommands(document, "g", { scale: 0 }),
    /mayor que cero/,
    "una escala de cero aplastaría la lámina",
  );
  checks += 1;
}

// --- 7. desadjuntar no deja restos -----------------------------------------
{
  const source = sourceFrom("scanned-image-only", "temporal.pdf");
  let document = apply(emptyDocument(), cadPdfAttachCommands(emptyDocument(), { id: "t", source }), "PDFATTACH");
  const layerId = cadFindPdfUnderlay(document, "t")!.entity.layer;

  document = apply(document, cadPdfDetachCommands(document, "t"), "PDFDETACH");
  ok(!cadFindPdfUnderlay(document, "t"), "tras desadjuntar no queda sustrato");
  ok(
    !document.layers.some((layer) => layer.id === layerId),
    "ni su capa vacía en el gestor de capas",
  );
  ok(
    !document.entities.some((entity) => entity.type === "image"),
    "ni la lámina en el espacio de modelo",
  );

  assert.throws(
    () => cadPdfDetachCommands(document, "t"),
    /No hay ningún PDF adjuntado/,
    "desadjuntar lo que no está tiene que decirlo",
  );
  checks += 1;
}

// --- 8. una imagen que NO es un sustrato no se confunde con uno ------------
{
  const document = migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    entities: [
      {
        id: "foto",
        type: "image",
        definition: "def-foto",
        insertion: { x: 0, y: 0, z: 0 },
        uVector: { x: 1, y: 0, z: 0 },
        vVector: { x: 0, y: 1, z: 0 },
        size: { width: 100, height: 100 },
        layer: "0",
      },
    ],
    layers: [{ id: "0", name: "0", color: "#ffffff", visible: true, locked: false }],
  });
  ok(!cadFindPdfUnderlay(document, "foto"), "una imagen normal no es un sustrato de PDF");
  assert.equal(cadPdfUnderlayList(document).length, 0);
  checks += 1;
}

// --- 9. la página que se adjunta es la que se pidió -------------------------
{
  const source = sourceFrom("rotated-90", "apaisado.pdf");
  const document = apply(
    emptyDocument(),
    cadPdfAttachCommands(emptyDocument(), { id: "r", source }),
    "PDFATTACH",
  );
  const { entity, underlay } = cadFindPdfUnderlay(document, "r")!;
  assert.equal(underlay.pageRotation, 90);
  checks += 1;
  // Con `/Rotate 90` la lámina es APAISADA: el giro ya viene aplicado al tamaño,
  // así que el sustrato se coloca como se ve en el visor y no tumbado.
  ok(entity.size.width > entity.size.height, "una página girada se adjunta apaisada");
  near(entity.size.width, 792, 0.5, "y mide 792 puntos de ancho");

  assert.throws(
    () => cadPdfAttachCommands(emptyDocument(), { id: "x", source, page: 7 }),
    /se pidió la 7/,
    "adjuntar una página que no existe tiene que fallar con su número",
  );
  checks += 1;
}

console.log(`pdf-underlay.spec.ts ✅ ${checks} comprobaciones`);
