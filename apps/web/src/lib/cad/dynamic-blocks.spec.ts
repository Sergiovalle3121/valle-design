/**
 * Bloques dinámicos y comportamiento anotativo, demostrados sobre un documento.
 *
 * ## Qué se puede falsificar y por eso se afirma
 *
 * «Es dinámico» es una palabra hasta que se enseña QUE LA GEOMETRÍA CAMBIA y a
 * qué coordenadas concretas. Un generador que ignorase el ángulo de apertura
 * pasaría cualquier prueba que sólo cuente entidades, y la puerta saldría
 * siempre abierta a 90°.
 *
 * Así que aquí se afirma, en este orden:
 *
 *  1. Los valores se sanean y se DICE cuándo se ajustaron; un parámetro que la
 *     familia no declara revienta con error tipado en vez de ignorarse.
 *  2. La puerta a 45° tiene la punta de la hoja donde la trigonometría dice, y
 *     su arco barre 45° y no 90°.
 *  3. El espejo refleja también el ARCO, que es el trozo que un reflejo hecho a
 *     medias se deja: la hoja se voltea y el barrido se queda al otro lado.
 *  4. Colocar, ESTIRAR y volver a leer sobre un documento real, resolviendo el
 *     INSERT con la misma función que usa el render. Estirar no mueve la puerta.
 *  5. Dos puertas iguales comparten definición; una distinta añade una.
 *  6. Los parámetros SOBREVIVEN al guardado: se serializa y se vuelve a leer.
 *  7. Anotativo: el mismo símbolo mide 3 mm en el papel a 1:50 y a 1:5, el signo
 *     del espejo se conserva, y se demuestra el reparto de trabajo con
 *     `annotative-scale.ts` — lo que aquélla declara que NO puede reescalar es
 *     exactamente lo que reescala esto.
 */
import { strict as assert } from "node:assert";
import {
  serializeCadDocument,
  type CadDocument,
  type CadEntity,
  type CadPaperSpace,
} from "./cad-document";
import { executeCadEntityCommandBatch } from "./entity-commands";
import { resolveCadInsert } from "./professional-blocks";
import {
  CAD_ANNOTATIVE_HEIGHT_METADATA,
  cadAnnotativeRescaleCommands,
} from "./layout/annotative-scale";
import {
  CAD_DYNAMIC_BLOCK_PREFIX,
  CAD_DYNAMIC_BLOCKS,
  CAD_DYNAMIC_DOOR,
  CAD_DYNAMIC_FAMILY_METADATA,
  CAD_DYNAMIC_LEVEL_MARK,
  CadDynamicBlockError,
  cadAnnotativeBlockRescaleCommands,
  cadAnnotativeBlockScale,
  cadDynamicBlockFamily,
  cadDynamicBlockKey,
  cadDynamicInsertCommands,
  cadDynamicInsertFamilyId,
  cadDynamicInsertValues,
  cadDynamicResolveValues,
  cadDynamicRestretchCommands,
  cadDynamicShapes,
  markCadAnnotativeBlockCommand,
  materializeCadDynamicBlock,
} from "./dynamic-blocks";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const near = (actual: number, expected: number, message: string, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: ${actual} ≉ ${expected}`,
  );
  checks += 1;
};

function emptyDocument(): CadDocument {
  return {
    meta: { version: 1, schema: 6, unit: "mm" },
    layers: [
      { id: "architecture", name: "Arquitectura", color: "#ffffff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

// --- 1. RESOLUCIÓN DE PARÁMETROS: SANEA Y LO DICE ---------------------------
{
  const base = cadDynamicResolveValues(CAD_DYNAMIC_DOOR);
  assert.deepEqual(base.values, { claro: 900, apertura: 90, muro: 150, espejo: 0 });
  assert.deepEqual(base.adjustments, []);

  // Un ancho que no se vende se ajusta al comercial más cercano, y se dice.
  const raro = cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { claro: 873 });
  assert.equal(raro.values.claro, 900);
  ok(
    raro.adjustments.some((text) => /no es una medida comercial/.test(text)),
    "el ajuste al ancho comercial se declara",
  );

  // Fuera de rango: se acota por el extremo y también se dice.
  const enorme = cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { claro: 5_000 });
  assert.equal(enorme.values.claro, 1_200);
  ok(
    enorme.adjustments.some((text) => /supera el máximo/.test(text)),
    "el recorte al máximo se declara",
  );

  // Un interruptor es 0 o 1, nunca 0,3.
  assert.equal(cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { espejo: 0.3 }).values.espejo, 1);
  assert.equal(cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { espejo: 0 }).values.espejo, 0);

  // FALLO CERRADO: un parámetro mal escrito revienta en vez de ignorarse.
  assert.throws(
    () => cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { ancho: 900 }),
    (error: unknown) => {
      assert.ok(error instanceof CadDynamicBlockError);
      assert.equal(error.code, "cad_dynamic_parameter_unknown");
      assert.match(error.message, /claro/);
      return true;
    },
  );
  checks += 1;
  assert.throws(
    () => cadDynamicBlockFamily("puerta-de-marte"),
    (error: unknown) => {
      assert.ok(error instanceof CadDynamicBlockError);
      assert.equal(error.code, "cad_dynamic_family_unknown");
      return true;
    },
  );
  checks += 1;
  assert.equal(cadDynamicBlockFamily("puerta-abatible"), CAD_DYNAMIC_DOOR);
  assert.equal(CAD_DYNAMIC_BLOCKS.length, 2);
}

// --- 2. LA GEOMETRÍA OBEDECE AL ÁNGULO --------------------------------------
{
  const shapes90 = cadDynamicShapes(
    CAD_DYNAMIC_DOOR,
    cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { claro: 900, apertura: 90 }).values,
  );
  // Hoja + arco + dos batientes.
  assert.equal(shapes90.length, 4);
  const leaf90 = shapes90[0];
  assert.equal(leaf90.type, "polyline");
  if (leaf90.type !== "polyline") throw new Error("la hoja debe ser polilínea");
  assert.equal(leaf90.closed, true);
  // Abierta a 90°: la hoja va del quicial a (0, 900) y su espesor cae hacia +X,
  // que es EXACTAMENTE como está dibujada la puerta sembrada.
  near(leaf90.vertices[1].x, 0, "punta de la hoja a 90°, x", 1e-9);
  near(leaf90.vertices[1].y, 900, "punta de la hoja a 90°, y");
  near(leaf90.vertices[2].x, 45, "canto de la hoja a 90°, x");
  near(leaf90.vertices[2].y, 900, "canto de la hoja a 90°, y");

  // A 45° la punta se va a (900·cos45, 900·sen45) y NO se queda donde estaba.
  const shapes45 = cadDynamicShapes(
    CAD_DYNAMIC_DOOR,
    cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { claro: 900, apertura: 45 }).values,
  );
  const leaf45 = shapes45[0];
  if (leaf45.type !== "polyline") throw new Error("la hoja debe ser polilínea");
  const media = (900 * Math.SQRT2) / 2;
  near(leaf45.vertices[1].x, media, "punta de la hoja a 45°, x", 1e-6);
  near(leaf45.vertices[1].y, media, "punta de la hoja a 45°, y", 1e-6);
  ok(Math.abs(leaf45.vertices[1].x - leaf90.vertices[1].x) > 600, "el ángulo mueve la hoja");

  // El barrido es el del ángulo pedido, no siempre 90°.
  const arco45 = shapes45.find((shape) => shape.type === "arc");
  assert.ok(arco45 && arco45.type === "arc");
  assert.equal(arco45.startAngle, 0);
  assert.equal(arco45.endAngle, 45);
  assert.equal(arco45.radius, 900);

  // Cerrada del todo: NO se dibuja un arco degenerado encima del muro.
  const cerrada = cadDynamicShapes(
    CAD_DYNAMIC_DOOR,
    cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { apertura: 0 }).values,
  );
  assert.equal(cerrada.filter((shape) => shape.type === "arc").length, 0);
  assert.equal(cerrada.length, 3);

  // El muro manda en los batientes: 250 mm son 250 mm.
  const gorda = cadDynamicShapes(
    CAD_DYNAMIC_DOOR,
    cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { muro: 250 }).values,
  );
  const batiente = gorda.find((shape) => shape.type === "line");
  assert.ok(batiente && batiente.type === "line");
  assert.equal(batiente.end.y, -250);
}

// --- 3. EL ESPEJO REFLEJA TAMBIÉN EL ARCO -----------------------------------
{
  const values = cadDynamicResolveValues(CAD_DYNAMIC_DOOR, {
    claro: 900,
    apertura: 60,
    espejo: 1,
  }).values;
  const shapes = cadDynamicShapes(CAD_DYNAMIC_DOOR, values);
  const leaf = shapes[0];
  if (leaf.type !== "polyline") throw new Error("la hoja debe ser polilínea");
  // El claro corre ahora hacia −X: la puerta abre al otro lado.
  near(leaf.vertices[1].x, -900 * Math.cos(Math.PI / 3), "hoja espejada, x", 1e-6);
  near(leaf.vertices[1].y, 900 * Math.sin(Math.PI / 3), "hoja espejada, y", 1e-6);

  const arco = shapes.find((shape) => shape.type === "arc");
  assert.ok(arco && arco.type === "arc");
  // 0→60 reflejado es 120→180. Si sólo se reflejara el centro, seguiría siendo
  // 0→60 y el barrido quedaría en el lado por el que la hoja ya no pasa.
  assert.equal(arco.startAngle, 120);
  assert.equal(arco.endAngle, 180);
  const derecha = cadDynamicShapes(
    CAD_DYNAMIC_DOOR,
    cadDynamicResolveValues(CAD_DYNAMIC_DOOR, { claro: 900, apertura: 60 }).values,
  ).find((shape) => shape.type === "arc");
  assert.ok(derecha && derecha.type === "arc");
  assert.notDeepEqual(
    [arco.startAngle, arco.endAngle],
    [derecha.startAngle, derecha.endAngle],
  );

  // Y el atributo de sentido lo cuenta en el plano, no sólo en la geometría.
  const definition = materializeCadDynamicBlock(CAD_DYNAMIC_DOOR, values);
  assert.equal(definition.attributes?.SENTIDO.defaultValue, "derecha");
  assert.equal(definition.attributes?.ANCHO.defaultValue, "0.90");
}

// --- 4. COLOCAR, ESTIRAR Y VOLVER A LEER SOBRE UN DOCUMENTO -----------------
{
  const vacio = emptyDocument();
  const colocacion = cadDynamicInsertCommands(
    vacio,
    CAD_DYNAMIC_DOOR,
    { claro: 900, apertura: 90 },
    { entityId: "puerta-1", insertion: { x: 3_000, y: 1_500, z: 0 }, layer: "architecture" },
  );
  assert.equal(colocacion.commands.length, 3);
  ok(
    colocacion.blockId.startsWith(CAD_DYNAMIC_BLOCK_PREFIX),
    "el bloque materializado va por el carril dinámico",
  );
  // La llave es determinista y ordenada por nombre de parámetro.
  assert.equal(
    colocacion.blockId,
    "valle:din:puerta-abatible:apertura=90:claro=900:espejo=0:muro=150",
  );

  let document = executeCadEntityCommandBatch(
    vacio,
    colocacion.commands,
    "INSERT dinámico",
  ).document;
  assert.equal(document.blocks.length, 1);
  const insert = document.entities.find((entity) => entity.id === "puerta-1");
  assert.ok(insert && insert.type === "insert");
  assert.equal(insert.block, colocacion.blockId);
  assert.equal(cadDynamicInsertFamilyId(insert), "puerta-abatible");
  assert.deepEqual(cadDynamicInsertValues(insert), {
    claro: 900,
    apertura: 90,
    muro: 150,
    espejo: 0,
  });

  // La geometría RESUELTA —la que dibuja el render y la que exporta el DXF—
  // está donde se insertó, no en el origen del bloque.
  const resuelta = resolveCadInsert(document, insert);
  assert.deepEqual(resuelta.diagnostics, []);
  const arco = resuelta.entities.find((entity) => entity.type === "arc");
  assert.ok(arco && arco.type === "arc");
  near(arco.center.x, 3_000, "el barrido gira sobre el quicial insertado, x");
  near(arco.center.y, 1_500, "el barrido gira sobre el quicial insertado, y");
  near(arco.radius, 900, "radio del barrido resuelto");

  // ── ESTIRAR: el gesto que hace dinámico a un bloque dinámico ──
  const estirada = cadDynamicRestretchCommands(document, CAD_DYNAMIC_DOOR, insert, {
    claro: 700,
  });
  assert.deepEqual(estirada.values, { claro: 700, apertura: 90, muro: 150, espejo: 0 });
  document = executeCadEntityCommandBatch(document, estirada.commands, "Estirar puerta").document;
  const estirado = document.entities.find((entity) => entity.id === "puerta-1");
  assert.ok(estirado && estirado.type === "insert");
  assert.equal(estirado.block, estirada.blockId);
  assert.notEqual(estirado.block, colocacion.blockId);
  // …y NO se movió. Estirar no es borrar y volver a insertar: si lo fuera, la
  // puerta se colocaría de nuevo donde el usuario pinchara, y aquí no pinchó.
  near(estirado.insertion.x, 3_000, "estirar no mueve la puerta, x");
  near(estirado.insertion.y, 1_500, "estirar no mueve la puerta, y");
  assert.equal(estirado.rotation, 0);

  const resuelta700 = resolveCadInsert(document, estirado);
  const arco700 = resuelta700.entities.find((entity) => entity.type === "arc");
  assert.ok(arco700 && arco700.type === "arc");
  near(arco700.radius, 700, "el barrido encogió con el claro");

  // ── 5. Deduplicación de definiciones ──
  // Otra puerta IGUAL no añade bloque: comparte la definición anónima.
  const gemela = cadDynamicInsertCommands(
    document,
    CAD_DYNAMIC_DOOR,
    { claro: 700 },
    { entityId: "puerta-2", insertion: { x: 6_000, y: 1_500, z: 0 }, layer: "architecture" },
  );
  const conGemela = executeCadEntityCommandBatch(document, gemela.commands, "Segunda puerta").document;
  assert.equal(gemela.blockId, estirada.blockId);
  // La definición ya estaba: el lote NO la reescribe. Reescribirla subiría la
  // versión del bloque y regeneraría todas las puertas iguales del plano.
  assert.equal(gemela.commands.length, 2);
  ok(
    !gemela.commands.some((command) => command.type === "block"),
    "una puerta gemela no vuelve a definir el bloque",
  );
  assert.equal(
    conGemela.blocks.filter((block) => block.id.startsWith(CAD_DYNAMIC_BLOCK_PREFIX)).length,
    2,
    "quedan las dos definiciones distintas creadas hasta ahora, no tres",
  );
  // Una DISTINTA sí añade.
  const distinta = cadDynamicInsertCommands(
    conGemela,
    CAD_DYNAMIC_DOOR,
    { claro: 700, espejo: 1 },
    { entityId: "puerta-3", insertion: { x: 9_000, y: 1_500, z: 0 }, layer: "architecture" },
  );
  assert.notEqual(distinta.blockId, gemela.blockId);
  assert.equal(distinta.commands.length, 3);
  const conTres = executeCadEntityCommandBatch(conGemela, distinta.commands, "Tercera puerta").document;
  assert.equal(
    conTres.blocks.filter((block) => block.id.startsWith(CAD_DYNAMIC_BLOCK_PREFIX)).length,
    3,
  );

  // ── 6. Los parámetros sobreviven al guardado ──
  const reloaded = JSON.parse(serializeCadDocument(conTres)) as CadDocument;
  const revivida = reloaded.entities.find((entity) => entity.id === "puerta-3");
  assert.ok(revivida);
  assert.equal(cadDynamicInsertFamilyId(revivida), "puerta-abatible");
  assert.deepEqual(cadDynamicInsertValues(revivida), {
    claro: 700,
    apertura: 90,
    muro: 150,
    espejo: 1,
  });
  // Y se puede volver a estirar DESPUÉS de recargar, que es lo que separa un
  // bloque dinámico de una geometría materializada y muerta.
  const otraVez = cadDynamicRestretchCommands(reloaded, CAD_DYNAMIC_DOOR, revivida, {
    apertura: 30,
  });
  assert.deepEqual(otraVez.values, { claro: 700, apertura: 30, muro: 150, espejo: 1 });
}

// --- 7. ANOTATIVO: 3 mm SON 3 mm --------------------------------------------
{
  // La escala de inserción de un símbolo de altura 1 ES su altura en el modelo.
  assert.equal(cadAnnotativeBlockScale(3, 50, "mm"), 150);
  assert.equal(cadAnnotativeBlockScale(3, 5, "mm"), 15);
  assert.equal(cadAnnotativeBlockScale(3, 50, "m"), 0.15);

  // El símbolo se dibuja a altura 1 exacta: si no, la escala mentiría.
  const marca = materializeCadDynamicBlock(
    CAD_DYNAMIC_LEVEL_MARK,
    cadDynamicResolveValues(CAD_DYNAMIC_LEVEL_MARK).values,
  );
  const triangulo = marca.entities[0];
  assert.ok(triangulo.type === "polyline");
  const ys = triangulo.vertices.map((vertex) => vertex.y);
  near(Math.max(...ys) - Math.min(...ys), 1, "el símbolo anotativo mide 1 de alto");
  // El interruptor voltea la punta: en planta mira abajo, en corte arriba.
  const arriba = materializeCadDynamicBlock(CAD_DYNAMIC_LEVEL_MARK, { invertido: 1 });
  const trianguloArriba = arriba.entities[0];
  assert.ok(trianguloArriba.type === "polyline");
  assert.notDeepEqual(
    trianguloArriba.vertices.map((vertex) => vertex.y),
    triangulo.vertices.map((vertex) => vertex.y),
  );
  assert.notEqual(
    cadDynamicBlockKey(CAD_DYNAMIC_LEVEL_MARK, { invertido: 1 }),
    cadDynamicBlockKey(CAD_DYNAMIC_LEVEL_MARK, { invertido: 0 }),
  );

  // ── El símbolo colocado, y la hoja que decide su tamaño ──
  const base = emptyDocument();
  const colocacion = cadDynamicInsertCommands(
    base,
    CAD_DYNAMIC_LEVEL_MARK,
    {},
    { entityId: "nivel-1", insertion: { x: 1_000, y: 0, z: 0 }, layer: "architecture" },
  );
  let document = executeCadEntityCommandBatch(
    base,
    colocacion.commands,
    "Símbolo de nivel",
  ).document;
  const nivel = document.entities.find((entity) => entity.id === "nivel-1");
  assert.ok(nivel && nivel.type === "insert");
  // La familia anotativa se marca sola al colocarse: nadie tiene que acordarse.
  assert.equal(nivel.context?.metadata?.[CAD_ANNOTATIVE_HEIGHT_METADATA], 3);

  const hoja = (scale: number): CadPaperSpace => ({
    id: "layout:planta",
    name: "Planta",
    entityIds: [],
    page: { width: 841, height: 594, unit: "mm", orientation: "landscape" },
    viewports: [
      {
        id: "layout:planta:viewport:1",
        paperBounds: { x: 20, y: 10, width: 811, height: 544 },
        modelBounds: { x: 0, y: 0, width: 40_000, height: 27_000 },
        scale,
        annotationScale: scale,
        locked: true,
      },
    ],
  });

  const a50 = cadAnnotativeBlockRescaleCommands({ entities: document.entities }, hoja(50));
  assert.deepEqual(a50.rescaledEntityIds, ["nivel-1"]);
  document = executeCadEntityCommandBatch(document, a50.commands, "Escala anotativa 1:50").document;
  const escalado50 = document.entities.find((entity) => entity.id === "nivel-1");
  assert.ok(escalado50 && escalado50.type === "insert");
  assert.equal(escalado50.scale.x, 150);
  assert.equal(escalado50.scale.y, 150);

  // Ahora la MISMA marca en una ventana de detalle a 1:5: encoge veinte veces
  // en el modelo para seguir midiendo lo mismo en el papel.
  const a5 = cadAnnotativeBlockRescaleCommands({ entities: document.entities }, hoja(5));
  assert.deepEqual(a5.rescaledEntityIds, ["nivel-1"]);
  document = executeCadEntityCommandBatch(document, a5.commands, "Escala anotativa 1:5").document;
  const escalado5 = document.entities.find((entity) => entity.id === "nivel-1");
  assert.ok(escalado5 && escalado5.type === "insert");
  assert.equal(escalado5.scale.x, 15);

  // La PROPIEDAD, medida al derecho: la altura impresa no cambió aunque la del
  // modelo se dividió por diez. El triángulo mide 1 de alto, así que la altura
  // en papel es escala · mm-por-unidad / escalaVentana.
  const impresa = (modelScale: number, viewportScale: number) =>
    (modelScale * 1) / viewportScale;
  near(impresa(150, 50), 3, "3 mm impresos a 1:50");
  near(impresa(15, 5), 3, "3 mm impresos a 1:5");

  // Idempotente: pasar dos veces por la misma escala no emite órdenes. Un lote
  // vacío que sube la versión del documento gasta un paso de deshacer para nada.
  const repetido = cadAnnotativeBlockRescaleCommands({ entities: document.entities }, hoja(5));
  assert.deepEqual(repetido.commands, []);
  assert.deepEqual(repetido.rescaledEntityIds, []);

  // El SIGNO se conserva: un símbolo espejado sigue espejado tras reescalar.
  const espejado = document.entities.map((entity) =>
    entity.id === "nivel-1" && entity.type === "insert"
      ? { ...entity, scale: { x: -15, y: 15, z: 1 } }
      : entity,
  );
  const conEspejo = cadAnnotativeBlockRescaleCommands({ entities: espejado }, hoja(50));
  assert.equal(conEspejo.commands.length, 1);
  const patch = conEspejo.commands[0];
  assert.equal(patch.type, "properties");
  if (patch.type !== "properties") throw new Error("debe ser un parche de propiedades");
  assert.equal(patch.patch.scaleX, -150);
  assert.equal(patch.patch.scaleY, 150);

  // Una ventana que oculta la capa no reescala nada que no se vea en ella.
  const oculta = hoja(50);
  oculta.viewports![0].layerVisibility = { architecture: false };
  assert.deepEqual(
    cadAnnotativeBlockRescaleCommands({ entities: document.entities }, oculta).commands,
    [],
  );
}

// --- 8. EL REPARTO CON annotative-scale.ts ----------------------------------
{
  // Un rótulo de texto y un símbolo de bloque, los dos anotativos, en la misma
  // hoja. Cada módulo hace su mitad y NINGUNO finge hacer la del otro.
  const rotulo = {
    id: "rotulo-1",
    type: "mtext",
    layer: "architecture",
    height: 1,
    context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: 2.5 } },
  } as unknown as CadEntity;
  const simbolo = {
    id: "nivel-9",
    type: "insert",
    block: "valle:din:nivel:invertido=0",
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: "architecture",
    context: { metadata: { [CAD_ANNOTATIVE_HEIGHT_METADATA]: 3 } },
  } as unknown as CadEntity;
  const space: CadPaperSpace = {
    id: "layout:reparto",
    name: "Reparto",
    entityIds: [],
    page: { width: 841, height: 594, unit: "mm", orientation: "landscape" },
    viewports: [
      {
        id: "layout:reparto:viewport:1",
        paperBounds: { x: 20, y: 10, width: 811, height: 544 },
        modelBounds: { x: 0, y: 0, width: 40_000, height: 27_000 },
        scale: 50,
        annotationScale: 50,
        locked: true,
      },
    ],
  };

  const texto = cadAnnotativeRescaleCommands({ entities: [rotulo, simbolo] }, space);
  // El módulo de texto reescala el rótulo y DECLARA que el INSERT se le escapa.
  assert.deepEqual(texto.rescaledEntityIds, ["rotulo-1"]);
  assert.deepEqual(texto.skippedEntityIds, ["nivel-9"]);

  const bloques = cadAnnotativeBlockRescaleCommands({ entities: [rotulo, simbolo] }, space);
  // Y este módulo hace exactamente el complementario: coge el que aquél dejó y
  // declara ajeno el que aquél ya resolvió. La unión son los dos, la
  // intersección está vacía.
  assert.deepEqual(bloques.rescaledEntityIds, ["nivel-9"]);
  assert.deepEqual(bloques.skippedEntityIds, ["rotulo-1"]);
  assert.deepEqual(
    [...texto.rescaledEntityIds, ...bloques.rescaledEntityIds].sort(),
    ["nivel-9", "rotulo-1"],
  );
  ok(
    texto.rescaledEntityIds.every((id) => !bloques.rescaledEntityIds.includes(id)),
    "ningún módulo reescala lo que reescala el otro",
  );

  // Y lo que NO está marcado como anotativo no lo toca nadie.
  const suelto = { ...simbolo, id: "nivel-suelto", context: undefined } as CadEntity;
  assert.deepEqual(
    cadAnnotativeBlockRescaleCommands({ entities: [suelto] }, space).commands,
    [],
  );
  // Marcarlo es una orden explícita, no un efecto colateral.
  const marca = markCadAnnotativeBlockCommand("nivel-suelto", 3);
  assert.equal(marca.type, "metadata");
  if (marca.type !== "metadata") throw new Error("debe ser un parche de metadatos");
  assert.equal(marca.patch[CAD_ANNOTATIVE_HEIGHT_METADATA], 3);
  assert.equal(marca.patch[CAD_DYNAMIC_FAMILY_METADATA], undefined);
}

console.log(`dynamic-blocks.spec: ${checks} comprobaciones nombradas + aserciones directas OK`);
