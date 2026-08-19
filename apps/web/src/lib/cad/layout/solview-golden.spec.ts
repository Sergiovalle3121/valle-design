/**
 * GOLDEN de punta a punta de la vista derivada: de los muros de una planta a
 * una serie de láminas trazable, y de vuelta cuando el modelo cambia.
 *
 * ## Qué se demuestra, y por qué esto y no otra cosa
 *
 * Un arquitecto dibuja la planta y luego vuelve a dibujar a mano el alzado y el
 * corte de lo mismo. Eliminar esa SEGUNDA vez es lo único que justifica que
 * este producto tenga 3D. Y la frase que gobierna todo esto es que un corte que
 * hay que redibujar a mano no ahorra nada: la asociatividad no es opcional, es
 * el producto.
 *
 * Así que este golden no comprueba que SOLVIEW «funcione». Comprueba las cuatro
 * cosas de las que depende que sirva, y las tres primeras con un NÚMERO:
 *
 *  1. De cuatro muros salen una planta, dos alzados y un corte, en una
 *     presentación real, en una serie de hojas y en un trazado con su cajetín.
 *  2. Se mueve un muro que SÍ sale en el corte y el corte cambia solo. La
 *     diferencia se MIDE —desplazamiento del sombreado, en unidades de dibujo—
 *     y se publica en la salida del spec.
 *  3. Se mueve algo que NO sale en el corte y el corte NO se ensucia. Dos
 *     casos: un muro que queda por delante del plano de corte, y un sólido
 *     fuera del encuadre. Sin esta mitad, una asociatividad que marcase todo
 *     como obsoleto siempre también pasaría el punto 2, y no valdría nada.
 *  4. CONTROL NEGATIVO: apagado el recálculo, la afirmación del punto 2 FALLA.
 *     Una asociatividad que pasa su propio spec incluso apagada no está
 *     probada; aquí se comprueba que apagarla rompe el golden, y que además la
 *     vista se declara obsoleta en vez de mentir.
 */
import { strict as assert } from "node:assert";
import {
  cadDocumentStats,
  commitChange,
  migrateCadDocument,
  parseCadDocument,
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
  type CadPaperSpace,
} from "../cad-document";
import { executeCadEntityCommandBatch } from "../entity-commands";
import type { CadEntityCommand } from "../entity-commands";
import { createCadLayout } from "./layout-operations";
import { createCadSolView } from "./solview";
import { cadSoldrawCommands, describeCadSoldraw } from "./soldraw";
import {
  cadSolviewFreshness,
  cadStaleSolviews,
  describeCadSolviewFreshness,
} from "./solview-associativity";
import {
  cadViewportOrthoView,
  cadViewportSectionView,
  cadViewportViewCensus,
} from "./viewport-view";
import { addCadSheet, createCadSheetSet, validateCadSheetSet } from "../sheet-set/sheet-set";
import { buildCadPlotJob } from "../plot/plot-job";
import { defaultCadPageSetup } from "../plot/page-setup";

// ---------------------------------------------------------------------------
// El modelo: una habitación de cuatro muros, y dos cosas que no salen en el corte
// ---------------------------------------------------------------------------

const ANCHO = 6_000;
const FONDO = 4_000;
const GROSOR = 250;
const ALTURA = 2_800;

/** Cota a la que se traza la línea de corte, en planta. */
const CORTE_Y = 1_500;

const muro = (
  id: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): CadEntity => ({
  id,
  type: "wall",
  start: { x: ax, y: ay, z: 0 },
  end: { x: bx, y: by, z: 0 },
  thickness: GROSOR,
  height: ALTURA,
  layer: "MUROS",
});

/**
 * Un sólido MUY lejos: no entra en el encuadre de ninguna vista.
 *
 * Está aquí para el punto 3. Sin algo fuera del encuadre, el filtro por ventana
 * de `solview-model.ts` no se ejercita y la asociatividad podría estar mirando
 * el documento entero sin que nadie lo notase.
 */
const LEJANO: CadEntity = {
  id: "s-lejano",
  type: "solid3d",
  nodes: [
    {
      id: "n",
      op: "box",
      min: { x: 100_000, y: 100_000, z: 0 },
      max: { x: 101_000, y: 101_000, z: 1_000 },
    },
  ],
  root: "n",
  layer: "MOBILIARIO",
};

const MUROS = [
  // Sur: y = 0. Queda DETRÁS del plano de corte, así que sale en el corte.
  muro("w-sur", 0, 0, ANCHO, 0),
  // Norte: y = FONDO. Queda DELANTE del plano de corte y NO sale en el corte.
  muro("w-norte", 0, FONDO, ANCHO, FONDO),
  // Oeste y este: cruzan la línea de corte, así que el plano los CORTA.
  muro("w-oeste", 0, 0, 0, FONDO),
  muro("w-este", ANCHO, 0, ANCHO, FONDO),
];

function documentoDePartida(): CadDocument {
  const entities = [...MUROS, LEJANO];
  return migrateCadDocument({
    meta: { version: 1, schema: 8, unit: "mm" },
    layers: [
      { id: "0", name: "0", visible: true, locked: false, color: "#ffffff" },
      { id: "MUROS", name: "MUROS", visible: true, locked: false, color: "#c0c0c0" },
      { id: "MOBILIARIO", name: "MOBILIARIO", visible: true, locked: false, color: "#8080ff" },
    ],
    entities,
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  });
}

/** Ids deterministas: sin esto, dos corridas producirían documentos distintos. */
function contadorDeIds(prefijo: string): () => string {
  let n = 0;
  return () => `${prefijo}-${(n += 1)}`;
}

function aplicar(
  document: CadDocument,
  commands: readonly CadEntityCommand[],
  etiqueta: string,
): CadDocument {
  return executeCadEntityCommandBatch(document, commands, etiqueta).document;
}

// ---------------------------------------------------------------------------
// 1. De cuatro muros a cuatro vistas en una lámina
// ---------------------------------------------------------------------------

const MUROS_IDS = MUROS.map((entity) => entity.id);

const corte = cadViewportSectionView({
  from: { x: -1_000, y: CORTE_Y },
  to: { x: ANCHO + 1_000, y: CORTE_Y },
});
assert.ok(!("ok" in corte), "la línea de corte del golden no define una vista");

const VISTAS = [
  { name: "PLANTA", view: cadViewportOrthoView("planta", { x: 0, y: 0, z: 0 }), paper: { x: 20, y: 160, width: 170, height: 110 } },
  { name: "ALZADO SUR", view: cadViewportOrthoView("frontal", { x: 0, y: 0, z: 0 }), paper: { x: 210, y: 160, width: 170, height: 110 } },
  { name: "ALZADO OESTE", view: cadViewportOrthoView("izquierda", { x: 0, y: 0, z: 0 }), paper: { x: 20, y: 40, width: 170, height: 100 } },
  { name: "CORTE A-A", view: corte, paper: { x: 210, y: 40, width: 170, height: 100 } },
] as const;

function montarLamina(document: CadDocument): { document: CadDocument; space: CadPaperSpace } {
  const layout = createCadLayout(document.paperSpaces, {
    id: "layout:planta-baja",
    name: "Planta baja",
    templateId: "a3-landscape",
    modelBounds: { x: 0, y: 0, width: ANCHO, height: FONDO },
    unit: "mm",
    metadata: {
      project: "Vivienda unifamiliar",
      drawingNumber: "A-101",
      title: "Planta, alzados y corte",
      sheetNumber: "1",
      revision: "P01",
      discipline: "Arquitectura",
      preparedBy: "Estudio",
      checkedBy: "Dirección",
    },
  });
  let doc = aplicar(document, [{ type: "paper-space", op: "upsert", space: layout }], "LAYOUT");
  let space = doc.paperSpaces.find((s) => s.id === layout.id)!;

  for (const [indice, vista] of VISTAS.entries()) {
    const creada = createCadSolView({
      document: doc,
      space,
      viewportId: `${space.id}:solview:${indice + 1}`,
      name: vista.name,
      view: vista.view,
      paperBounds: vista.paper,
      // El encuadre lo definen los MUROS: el sólido lejano queda fuera, que es
      // lo que permite comprobar que moverlo no ensucia ninguna vista.
      sourceIds: MUROS_IDS,
    });
    assert.ok(creada.ok, `SOLVIEW ${vista.name} falló: ${creada.ok ? "" : creada.message}`);
    doc = aplicar(doc, creada.commands, `SOLVIEW ${vista.name}`);
    space = doc.paperSpaces.find((s) => s.id === layout.id)!;
  }
  return { document: doc, space };
}

const montada = montarLamina(documentoDePartida());
const space = montada.space;
let doc = montada.document;

{
  const censo = cadViewportViewCensus(doc);
  // La lámina nace con su ventana de modelo (planta), y SOLVIEW añade cuatro.
  assert.equal(censo.plan, 2, "debería haber dos vistas de planta: la de la lámina y la de SOLVIEW");
  assert.equal(censo.elevation, 2, "faltan alzados");
  assert.equal(censo.section, 1, "falta el corte");
  assert.equal(censo.sinVista, 0, "hay ventanas sin declarar desde dónde miran");

  // Las cuatro capas por vista, con su nombre normalizado.
  for (const vista of VISTAS) {
    const base = vista.name.replace(/\s+/gu, "-");
    for (const sufijo of ["VIS", "HID", "HAT", "DIM"])
      assert.ok(
        doc.layers.some((layer) => layer.name === `${base}-${sufijo}`),
        `SOLVIEW no creó la capa ${base}-${sufijo}`,
      );
  }

  // Antes de SOLDRAW, TODAS las vistas derivadas están obsoletas. Una ventana
  // de corte vacía en una lámina firmada es tan falsa como una que enseña el
  // muro donde estaba, así que `never-drawn` cuenta como obsoleta.
  const pendientes = cadStaleSolviews(doc);
  assert.equal(pendientes.length, 4, "las cuatro vistas deberían estar pendientes de dibujar");
  assert.ok(
    pendientes.every((entrada) => entrada.status === "never-drawn"),
    "una vista recién creada no puede declararse fresca",
  );
}

// ---------------------------------------------------------------------------
// 2. SOLDRAW: el dibujo derivado aparece
// ---------------------------------------------------------------------------

const idsPrimera = contadorDeIds("sd1");
const primera = cadSoldrawCommands({ document: doc, newEntityId: idsPrimera });
assert.equal(primera.reports.length, 4, "SOLDRAW debería haber atendido las cuatro vistas");
assert.ok(
  primera.reports.every((report) => report.status === "drawn"),
  `SOLDRAW se saltó alguna vista: ${JSON.stringify(primera.reports.filter((r) => r.status !== "drawn"))}`,
);
doc = aplicar(doc, primera.commands, "SOLDRAW");

const CORTE_ID = `${space.id}:solview:4`;

/** Trazos que SOLDRAW dejó para una ventana, ordenados de forma estable. */
function trazosDe(document: CadDocument, viewportId: string) {
  return document.entities
    .filter((entity) => entity.context?.metadata?.solviewFor === viewportId)
    .map((entity) => {
      if (entity.type === "line")
        return {
          tipo: "line" as const,
          layer: entity.layer,
          puntos: [entity.start, entity.end].map((p) => ({ x: p.x, y: p.y })),
        };
      if (entity.type === "hatch")
        return {
          tipo: "hatch" as const,
          layer: entity.layer,
          puntos: entity.boundaries.flat().map((p) => ({ x: p.x, y: p.y })),
        };
      throw new Error(`trazo derivado de tipo inesperado: ${entity.type}`);
    })
    .sort((a, b) =>
      `${a.tipo}${a.layer}${JSON.stringify(a.puntos)}`.localeCompare(
        `${b.tipo}${b.layer}${JSON.stringify(b.puntos)}`,
      ),
    );
}

/** Centroide del SOMBREADO del corte: lo que se mueve si el corte cambia. */
function centroideSombreado(document: CadDocument, viewportId: string) {
  const puntos = trazosDe(document, viewportId)
    .filter((trazo) => trazo.tipo === "hatch")
    .flatMap((trazo) => trazo.puntos);
  assert.ok(puntos.length > 0, "el corte no tiene sombreado: no hay nada que medir");
  return {
    x: puntos.reduce((total, p) => total + p.x, 0) / puntos.length,
    y: puntos.reduce((total, p) => total + p.y, 0) / puntos.length,
    n: puntos.length,
  };
}

{
  const corteTrazos = trazosDe(doc, CORTE_ID);
  const sombreados = corteTrazos.filter((trazo) => trazo.tipo === "hatch");
  assert.ok(
    sombreados.length >= 2,
    `el corte debería sombrear los dos muros que el plano atraviesa; sombreó ${sombreados.length}`,
  );
  assert.ok(
    sombreados.every((trazo) => trazo.layer === "CORTE-A-A-HAT"),
    "el sombreado del corte no está en su capa -HAT",
  );
  assert.ok(
    corteTrazos.some((trazo) => trazo.tipo === "line" && trazo.layer === "CORTE-A-A-VIS"),
    "el corte no dibujó ni una arista vista: el muro sur tenía que verse detrás",
  );
  // El muro NORTE queda delante del plano y NO puede salir: si sale, el corte
  // está enseñando lo que el observador tiene entre los ojos y la pieza.
  const informeCorte = primera.reports.find((report) => report.viewportId === CORTE_ID)!;
  assert.ok(
    !informeCorte.contributors.includes("w-norte"),
    "el muro que queda DELANTE del plano de corte no puede alimentar el corte",
  );
  assert.ok(
    !informeCorte.contributors.includes("s-lejano"),
    "el sólido fuera del encuadre no puede alimentar el corte",
  );
  assert.deepEqual(
    [...informeCorte.contributors].sort(),
    ["w-este", "w-oeste", "w-sur"],
    "el corte no está alimentado por los muros que le corresponden",
  );
  // Los prismas de muro son convexos, así que la clasificación de aristas
  // ocultas es DEMOSTRABLEMENTE exacta aquí. Se afirma para que el día que
  // deje de serlo se vea.
  assert.ok(informeCorte.exact, "el perfil oculto del corte debería ser exacto sobre prismas");

  assert.equal(cadStaleSolviews(doc).length, 0, describeCadSolviewFreshness(doc));
}

const SOMBREADO_ANTES = centroideSombreado(doc, CORTE_ID);
const TRAZOS_ANTES = JSON.stringify(trazosDe(doc, CORTE_ID));

// ---------------------------------------------------------------------------
// 3. La lámina entra en una serie de hojas y en un trazado con su cajetín
// ---------------------------------------------------------------------------

{
  const juego = addCadSheet(
    createCadSheetSet({
      id: "set:vivienda",
      name: "Vivienda unifamiliar",
      fields: { PROJECT: "Vivienda unifamiliar" },
    }),
    {
      id: "sheet:1",
      documentId: "doc:vivienda",
      layoutId: space.id,
      title: "Planta, alzados y corte",
    },
  );
  const problemas = validateCadSheetSet(juego, {
    documentIds: new Set(["doc:vivienda"]),
    layoutIdsByDocument: new Map([["doc:vivienda", new Set([space.id])]]),
  });
  assert.deepEqual(
    problemas.filter((issue) => issue.severity === "error"),
    [],
    "el juego de planos con la lámina derivada no valida",
  );

  const trabajo = buildCadPlotJob({
    document: doc,
    layoutIds: [space.id],
    pageSetup: defaultCadPageSetup({ paper: "A3", orientation: "landscape" }),
    generatedAt: "2026-08-19T00:00:00.000Z",
  });
  const hoja = trabajo.sheets.find((sheet) => sheet.id === space.id);
  assert.ok(hoja, "la lámina derivada no llegó al trazado");
  const ventanaCorte = hoja.viewports.find((viewport) => viewport.id === CORTE_ID);
  assert.ok(ventanaCorte, "la ventana del corte no llegó al trazado");
  assert.ok(
    ventanaCorte.commands.length > 0,
    "la ventana del corte llegó al trazado VACÍA: el dibujo derivado no se está emitiendo",
  );
  const cajetin = trabajo.titleBlocks.find((block) => block.sheetId === space.id);
  assert.ok(cajetin, "la lámina se trazó sin cajetín");
  assert.equal(cajetin.fields.project, "Vivienda unifamiliar");
  assert.equal(cajetin.fields.drawingNumber, "A-101");
}

// ---------------------------------------------------------------------------
// 4. LA PRUEBA: se mueve un muro y el corte cambia SOLO
// ---------------------------------------------------------------------------

/** Cuánto se mueve el muro oeste, en unidades de dibujo (mm). */
const DESPLAZAMIENTO = 900;

function moverMuro(document: CadDocument, id: string, dx: number, dy: number): CadDocument {
  return aplicar(
    document,
    [{ type: "transform", entityId: id, transform: { translation: { x: dx, y: dy } } }],
    "MOVE",
  );
}

doc = moverMuro(doc, "w-oeste", DESPLAZAMIENTO, 0);

{
  // Antes de redibujar nada, el producto ya SABE que el corte miente. Esto es
  // lo que separa una vista obsoleta declarada de una vista que engaña.
  const frescura = cadSolviewFreshness(doc);
  const delCorte = frescura.find((entrada) => entrada.viewportId === CORTE_ID)!;
  assert.equal(
    delCorte.status,
    "stale",
    "mover un muro que sale en el corte tiene que declarar el corte obsoleto",
  );
  assert.notEqual(delCorte.storedDigest, delCorte.currentDigest, "la huella no cambió");
  // Y nadie ha tenido que avisar: la huella se recalcula, no se anuncia.
  assert.ok(delCorte.reason.includes("ha cambiado"), delCorte.reason);
}

const idsSegunda = contadorDeIds("sd2");
const segunda = cadSoldrawCommands({ document: doc, newEntityId: idsSegunda });
doc = aplicar(doc, segunda.commands, "SOLDRAW");

const SOMBREADO_DESPUES = centroideSombreado(doc, CORTE_ID);
const TRAZOS_DESPUES = JSON.stringify(trazosDe(doc, CORTE_ID));

/** LA DIFERENCIA MEDIDA. Es el número que este golden existe para publicar. */
const DIFERENCIA = Math.hypot(
  SOMBREADO_DESPUES.x - SOMBREADO_ANTES.x,
  SOMBREADO_DESPUES.y - SOMBREADO_ANTES.y,
);

{
  assert.notEqual(TRAZOS_ANTES, TRAZOS_DESPUES, "el corte no cambió al mover el muro");
  assert.equal(
    SOMBREADO_ANTES.n,
    SOMBREADO_DESPUES.n,
    "el corte cambió de número de vértices: se movió un muro, no se añadió ninguno",
  );
  // El sombreado de DOS muros cortados; sólo uno se movió, así que el
  // centroide se desplaza la mitad. Es una predicción cerrada, no un «cambió
  // algo»: cualquier otro valor significa que se movió lo que no era.
  const ESPERADO = DESPLAZAMIENTO / 2;
  assert.ok(
    Math.abs(DIFERENCIA - ESPERADO) < 1e-6,
    `el sombreado del corte se desplazó ${DIFERENCIA} u en vez de ${ESPERADO}`,
  );
  assert.equal(cadStaleSolviews(doc).length, 0, describeCadSolviewFreshness(doc));
}

// ---------------------------------------------------------------------------
// 5. EL CASO CONTRARIO: mover lo que no sale NO ensucia
// ---------------------------------------------------------------------------

{
  // (a) El muro NORTE queda delante del plano de corte: no sale en el corte.
  //     Sí sale en los alzados, y ésos SÍ se ensucian — que es la otra mitad
  //     de la afirmación y lo que impide que ésta se cumpla por no mirar nada.
  const movido = moverMuro(doc, "w-norte", 0, 500);
  const frescura = cadSolviewFreshness(movido);
  const delCorte = frescura.find((entrada) => entrada.viewportId === CORTE_ID)!;
  assert.equal(
    delCorte.status,
    "fresh",
    "mover un muro que queda DELANTE del plano de corte no puede ensuciar el corte",
  );
  assert.equal(delCorte.storedDigest, delCorte.currentDigest, "la huella del corte cambió");

  const alzados = frescura.filter((entrada) => entrada.viewportId.endsWith(":solview:2"));
  assert.equal(alzados.length, 1);
  assert.equal(
    alzados[0].status,
    "stale",
    "el alzado sur SÍ ve el muro norte: moverlo tiene que ensuciarlo",
  );

  // (b) El sólido lejano está fuera del encuadre de todas las vistas.
  const lejos = moverMuro(doc, "s-lejano", 5_000, 5_000);
  const sucias = cadStaleSolviews(lejos);
  assert.deepEqual(
    sucias.map((entrada) => entrada.viewportId),
    [],
    `mover algo fuera del encuadre ensució ${sucias.length} vista(s): ${describeCadSolviewFreshness(lejos)}`,
  );
}

// ---------------------------------------------------------------------------
// 6. CONTROL NEGATIVO: apagado el recálculo, el golden FALLA
// ---------------------------------------------------------------------------

{
  // Se repite el punto 4 sin ejecutar SOLDRAW: es exactamente «la
  // asociatividad está apagada». Si la afirmación «el corte cambió» siguiera
  // pasando, este golden no estaría midiendo el recálculo sino cualquier otra
  // cosa, y valdría cero.
  let apagado = montarLamina(documentoDePartida()).document;
  const ids = contadorDeIds("neg");
  apagado = aplicar(apagado, cadSoldrawCommands({ document: apagado, newEntityId: ids }).commands, "SOLDRAW");
  const antes = JSON.stringify(trazosDe(apagado, CORTE_ID));
  const centroAntes = centroideSombreado(apagado, CORTE_ID);

  apagado = moverMuro(apagado, "w-oeste", DESPLAZAMIENTO, 0);
  // …y AQUÍ no se llama a SOLDRAW. El recálculo está apagado.
  const despues = JSON.stringify(trazosDe(apagado, CORTE_ID));
  const centroDespues = centroideSombreado(apagado, CORTE_ID);

  assert.throws(
    () => {
      assert.notEqual(antes, despues, "el corte no cambió al mover el muro");
    },
    /el corte no cambió al mover el muro/,
    "CONTROL NEGATIVO ROTO: el corte cambia aunque el recálculo esté apagado, así que el golden no estaba midiendo el recálculo",
  );
  assert.equal(
    Math.hypot(centroDespues.x - centroAntes.x, centroDespues.y - centroAntes.y),
    0,
    "sin SOLDRAW el dibujo derivado no puede haberse movido ni un micrón",
  );

  // Y lo que salva la situación: con el recálculo apagado, la vista NO se
  // declara fresca. Es preferible una vista marcada como obsoleta a una vista
  // silenciosamente mentirosa.
  const sucias = cadStaleSolviews(apagado);
  assert.ok(
    sucias.some((entrada) => entrada.viewportId === CORTE_ID),
    "con el recálculo apagado el corte miente Y dice estar al día: fallo abierto",
  );
}

// ---------------------------------------------------------------------------
// 7. Lo editado a mano no se pisa, y el documento sobrevive al disco
// ---------------------------------------------------------------------------

{
  const trazoDelCorte = doc.entities.find(
    (entity) => entity.context?.metadata?.solviewFor === CORTE_ID && entity.type === "line",
  )!;
  // El usuario retoca una línea del corte a mano.
  let editado = aplicar(
    doc,
    [
      {
        type: "transform",
        entityId: trazoDelCorte.id,
        transform: { translation: { x: 37, y: 0 } },
      },
    ],
    "MOVE",
  );
  editado = moverMuro(editado, "w-este", -300, 0);
  const ids = contadorDeIds("sd3");
  const resultado = cadSoldrawCommands({ document: editado, newEntityId: ids });
  const informe = resultado.reports.find((report) => report.viewportId === CORTE_ID)!;
  assert.deepEqual(
    informe.adopted,
    [trazoDelCorte.id],
    "SOLDRAW no respetó el trazo que el usuario había editado a mano",
  );
  editado = aplicar(editado, resultado.commands, "SOLDRAW");
  assert.ok(
    editado.entities.some((entity) => entity.id === trazoDelCorte.id),
    "SOLDRAW borró un trazo editado a mano: eso destruye trabajo humano en silencio",
  );
  assert.ok(
    describeCadSoldraw(resultado).includes("editados a mano"),
    "el informe de SOLDRAW no avisa de los trazos adoptados",
  );

  // Y el viaje por el disco: la cámara, la derivación y la huella sobreviven.
  const reabierto = parseCadDocument(serializeCadDocument(commitChange(editado, "guardar")));
  assert.deepEqual(
    cadViewportViewCensus(reabierto),
    cadViewportViewCensus(editado),
    "el censo de vistas cambió al guardar y abrir",
  );
  assert.equal(
    cadStaleSolviews(reabierto).length,
    0,
    `al reabrir, alguna vista se declara obsoleta sin que el modelo haya cambiado: ${describeCadSolviewFreshness(reabierto)}`,
  );
  const stats = cadDocumentStats(reabierto);
  assert.equal(stats.wall, 4, "se perdió algún muro por el camino");
  assert.equal(stats.solid3d, 1, "se perdió el sólido lejano");
  assert.ok(stats.hatch > 0, "se perdió el sombreado del corte");
}

console.log(
  `OK golden SOLVIEW/SOLDRAW: 4 muros -> planta + 2 alzados + corte en una lámina A3 con cajetín; ` +
    `mover el muro oeste ${DESPLAZAMIENTO} u desplaza el sombreado del corte ${DIFERENCIA} u ` +
    `(${SOMBREADO_ANTES.n} vértices de sombreado, sin cambiar de número); ` +
    `mover lo que no sale en el corte lo deja fresco; ` +
    `control negativo: con el recálculo apagado la diferencia es 0 u y el corte se declara obsoleto`,
);
