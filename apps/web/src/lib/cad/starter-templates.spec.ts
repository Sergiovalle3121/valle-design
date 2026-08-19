/**
 * Plantillas de arranque: lo que se afirma es que el documento SALE CONFIGURADO
 * COMO UN PLANO MEXICANO.
 *
 * Una prueba que sólo comprobara «hay seis plantillas» no distingue una
 * plantilla de una etiqueta. Lo que se ancla aquí es lo que le ahorra el trabajo
 * al arquitecto y lo que rompería el producto si faltara:
 *
 *  1. Las capas del sustrato del editor ESTÁN. Sin ellas, insertar un bloque
 *     sembrado —que dibuja en `architecture` y `equipment`— produce un documento
 *     que la API rechaza con 400.
 *  2. Las capas de oficio salen de la NORMA y no de esta plantilla, y dos capas
 *     de la misma lámina nunca salen idénticas en el papel.
 *  3. La escala llega hasta la ventana gráfica, bloqueada, con su escala de
 *     anotación, y la ventana NO invade ni la zona de archivo ni el cajetín.
 *  4. Las cotas nacen en METROS con dos decimales y con garrapata, que es la
 *     costumbre mexicana, y el documento trae estilo para cada escala de dibujo
 *     mexicana —incluida 1:75— y no sólo para la suya.
 *  5. El cajetín es el mexicano: trae ubicación, propietario y la responsiva del
 *     Director Responsable de Obra, y cabe entero en el panel A4 que queda a la
 *     vista al doblar la lámina.
 *  6. El documento es determinista: dos llamadas iguales, el mismo JSON.
 */
import { strict as assert } from "node:assert";
import { serializeCadDocument, type CadDocument } from "./cad-document";
import { DEFAULT_CAD_LAYERS } from "./layers";
import { cadAnnotativeModelHeight } from "./layout/annotative-scale";
import {
  CAD_MEXICAN_TITLE_BLOCK_HEIGHT_MM,
  layoutCadTitleBlock,
  cadTitleBlockOverflowMm,
} from "./plot/title-block";
import { CAD_SHEET_PAPERS } from "./paper-space";
import { cadMexicanLayerCollisions } from "./standards/mexican-layers";
import { CAD_MEXICAN_SCALES, cadMexicanDimensionStyleName } from "./standards/mexican-annotation";
import { cadFitsInFrontPanel, CadMexicanPaperError } from "./standards/mexican-sheets";
import {
  CAD_STARTER_ARROW_MM,
  CAD_STARTER_MLEADER_STYLE,
  CAD_STARTER_PLOT_STYLE,
  CAD_STARTER_TEMPLATE_IDS,
  CAD_STARTER_TEMPLATES,
  CAD_STARTER_TEXT_MM,
  CAD_STARTER_TEXT_STYLE,
  CAD_STARTER_TITLE_MM,
  CAD_STARTER_TITLE_STYLE,
  CadStarterTemplateError,
  cadStarterDimensionStyleName,
  cadStarterModelBounds,
  cadStarterTemplate,
  createCadStarterDocument,
} from "./starter-templates";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- EL CATÁLOGO -------------------------------------------------------------
{
  assert.equal(CAD_STARTER_TEMPLATES.length, 6);
  assert.deepEqual(
    CAD_STARTER_TEMPLATES.map((template) => template.id),
    [...CAD_STARTER_TEMPLATE_IDS],
  );
  // Las seis que pide el oficio, por nombre.
  assert.deepEqual([...CAD_STARTER_TEMPLATE_IDS], [
    "planta-arquitectonica",
    "planta-de-conjunto",
    "alzados-y-cortes",
    "planta-de-demolicion",
    "plano-estructural",
    "plano-de-instalaciones",
  ]);
  for (const template of CAD_STARTER_TEMPLATES) {
    ok(cadStarterTemplate(template.id) === template, `${template.id} se resuelve por id`);
    ok(template.scale > 0, `${template.id} declara escala`);
    ok(template.layerIds.length >= 6, `${template.id} trae capas de oficio`);
    // La capa en la que se empieza a dibujar tiene que existir de verdad.
    ok(
      template.layerIds.includes(template.startLayer),
      `${template.id}: la capa inicial ${template.startLayer} está declarada`,
    );
    // Ids de capa únicos dentro de la plantilla: la API rechaza duplicados.
    assert.equal(
      new Set(template.layerIds).size,
      template.layerIds.length,
      `${template.id} repite una capa`,
    );
    // Y ninguna pareja de capas de la MISMA lámina sale idéntica impresa: si dos
    // comparten color, tipo de línea y grosor, separarlas por capas es
    // decoración —se puede apagar una y no saber cuál se apagó—.
    assert.deepEqual(
      cadMexicanLayerCollisions(template.layerIds),
      [],
      `${template.id}: dos capas indistinguibles en el papel`,
    );
  }
  // Las escalas no son adorno: el conjunto va más lejos que la planta.
  assert.equal(cadStarterTemplate("planta-arquitectonica")?.scale, 50);
  assert.equal(cadStarterTemplate("planta-de-conjunto")?.scale, 200);
  assert.equal(cadStarterTemplate("alzados-y-cortes")?.scale, 50);
  assert.equal(cadStarterTemplate("plano-de-instalaciones")?.scale, 50);
  // La clave de lámina lleva la letra de disciplina que se usa en México.
  assert.equal(cadStarterTemplate("plano-estructural")?.sheetNumber, "E-101");
  assert.equal(cadStarterTemplate("plano-de-instalaciones")?.sheetNumber, "I-101");
}

// --- FALLO CERRADO -----------------------------------------------------------
{
  assert.equal(cadStarterTemplate("planta-de-marte"), undefined);
  assert.throws(
    () => createCadStarterDocument({ templateId: "planta-de-marte" }),
    (error: unknown) => {
      assert.ok(error instanceof CadStarterTemplateError);
      assert.equal(error.code, "cad_starter_template_unknown");
      assert.equal(error.templateId, "planta-de-marte");
      // El mensaje enumera las que sí: un error que no dice la salida obliga a
      // leer el código fuente.
      assert.match(error.message, /planta-arquitectonica/);
      return true;
    },
  );
  checks += 1;

  // Un papel ANSI no se acepta en silencio: en México los planos van en serie A,
  // y una lámina «Tabloid» es un plano que la copiadora no sabe imprimir.
  assert.throws(
    () => createCadStarterDocument({ templateId: "planta-arquitectonica", paper: "tabloid" }),
    (error: unknown) => {
      assert.ok(error instanceof CadMexicanPaperError);
      assert.equal(error.code, "cad_mexican_paper_unsupported");
      assert.match(error.message, /serie A/);
      return true;
    },
  );
  checks += 1;
}

// --- EL SUSTRATO DEL EDITOR SOBREVIVE ---------------------------------------
{
  for (const id of CAD_STARTER_TEMPLATE_IDS) {
    const document = createCadStarterDocument({ templateId: id });
    const declared = new Set(document.layers.map((item) => item.id));
    for (const base of DEFAULT_CAD_LAYERS)
      ok(declared.has(base.id), `${id} declara la capa del editor ${base.id}`);
    // Las dos que usan los 30 bloques sembrados. Si alguna faltara, colocar una
    // puerta dejaría el documento sin poder guardarse.
    ok(declared.has("architecture"), `${id} admite geometría de bloque en architecture`);
    ok(declared.has("equipment"), `${id} admite geometría de bloque en equipment`);
    // Y ninguna capa duplicada en el documento entero.
    assert.equal(declared.size, document.layers.length, `${id} repite una capa`);
    for (const item of document.layers) {
      assert.ok(item.id.length > 0 && item.id.length <= 128);
      assert.equal(item.visible, true);
      assert.equal(item.locked, false);
    }
  }
}

// --- LA ESCALA LLEGA A LA VENTANA, Y LA VENTANA RESPETA LA HOJA -------------
{
  for (const template of CAD_STARTER_TEMPLATES) {
    const document = createCadStarterDocument({ templateId: template.id });
    assert.equal(document.paperSpaces.length, 1, `${template.id}: una lámina`);
    const [sheet] = document.paperSpaces;
    assert.equal(sheet.id, `layout:${template.id}`);
    assert.equal(sheet.name, template.sheetName);
    // A1 apaisado son 841 × 594 mm exactos.
    assert.equal(sheet.page.width, CAD_SHEET_PAPERS.A1.height);
    assert.equal(sheet.page.height, CAD_SHEET_PAPERS.A1.width);
    assert.equal(sheet.page.orientation, "landscape");
    assert.equal(sheet.page.unit, "mm");
    // Márgenes ISO 5457: 20 a la izquierda para el archivado.
    assert.equal(sheet.pageSetup?.margins.left, 20);
    assert.equal(sheet.pageSetup?.margins.top, 10);
    assert.equal(sheet.pageSetup?.paper, "A1");
    assert.equal(sheet.pageSetup?.colorMode, "monochrome");

    const [viewport] = sheet.viewports ?? [];
    assert.ok(viewport, `${template.id}: la lámina nace con ventana`);
    assert.equal(viewport.scale, template.scale, `${template.id}: escala de ventana`);
    assert.equal(viewport.annotationScale, template.scale);
    assert.equal(viewport.locked, true, `${template.id}: la ventana nace bloqueada`);
    // La ventana arranca EN el margen de archivo, no dentro de él: el dibujo que
    // entra en esos 20 mm es el dibujo por el que se perfora el plano.
    assert.equal(viewport.paperBounds.x, 20, `${template.id}: la ventana respeta la zona de archivo`);
    assert.equal(viewport.paperBounds.width, 811);
    // Y termina donde empieza el cajetín mexicano, que mide 50 y no 30.
    assert.equal(viewport.paperBounds.height, 594 - 10 - 10 - CAD_MEXICAN_TITLE_BLOCK_HEIGHT_MM);
    assert.equal(viewport.paperBounds.height, 524);
  }
}

// --- EL ÁREA QUE CABE EN LA LÁMINA ------------------------------------------
{
  // A1 apaisado: 841 − 20 − 10 = 811 mm útiles de ancho;
  //              594 − 10 − 10 − 50 (cajetín mexicano) = 524 mm de alto.
  const planta = cadStarterTemplate("planta-arquitectonica")!;
  const bounds = cadStarterModelBounds(planta);
  assert.equal(bounds.width, 811 * 50);
  assert.equal(bounds.height, 524 * 50);
  assert.equal(bounds.width, 40_550);
  assert.equal(bounds.height, 26_200);

  // Y el de conjunto, a 1:200, encuadra CUATRO VECES más terreno. La propiedad
  // que importa: la plantilla de conjunto sirve para un predio y la de planta
  // no.
  const conjunto = cadStarterModelBounds(cadStarterTemplate("planta-de-conjunto")!);
  assert.equal(conjunto.width, 811 * 200);
  assert.equal(conjunto.width / bounds.width, 4);
  ok(conjunto.width > 160_000, "el conjunto encuadra más de 160 m de frente");

  // Un A3 apaisado encuadra bastante menos, y el número sale de la hoja y no de
  // una tabla escrita a mano: 420 − 30 = 390 de ancho, 297 − 20 − 50 = 227 de
  // alto.
  const enA3 = cadStarterModelBounds(planta, "A3");
  assert.equal(enA3.width, 390 * 50);
  assert.equal(enA3.height, 227 * 50);
  ok(enA3.width < bounds.width, "un A3 encuadra menos que un A1");

  // La huella del documento es ese mismo encuadre: el lienzo que se abre.
  const document = createCadStarterDocument({ templateId: "planta-arquitectonica" });
  assert.equal(document.meta.footprintW, bounds.width);
  assert.equal(document.meta.footprintH, bounds.height);
  assert.equal(document.meta.gridSize, 100);
  assert.equal(document.meta.unit, "mm");
}

// --- 2,5 mm SON 2,5 mm, Y LA COTA ES MEXICANA -------------------------------
{
  for (const template of CAD_STARTER_TEMPLATES) {
    const document = createCadStarterDocument({ templateId: template.id });
    const styleName = cadStarterDimensionStyleName(template);
    assert.equal(styleName, `COTA 1:${template.scale}`);

    const text = document.styles.text[CAD_STARTER_TEXT_STYLE];
    const title = document.styles.text[CAD_STARTER_TITLE_STYLE];
    const dimension = document.styles.dimension[styleName];
    assert.ok(text && title && dimension, `${template.id}: estilos presentes`);

    // La ida: el estilo mide lo que tiene que medir en el MODELO…
    assert.equal(text.height, CAD_STARTER_TEXT_MM * template.scale);
    assert.equal(title.height, CAD_STARTER_TITLE_MM * template.scale);
    assert.equal(dimension.arrowSize, CAD_STARTER_ARROW_MM * template.scale);
    // …y la vuelta: eso son 2,5 mm sobre el PAPEL, que es la propiedad real.
    assert.equal(
      cadAnnotativeModelHeight(CAD_STARTER_TEXT_MM, template.scale, "mm"),
      text.height,
    );
    assert.equal(dimension.textStyle, CAD_STARTER_TEXT_STYLE);
    // Lo que un arquitecto mexicano cambiaría el primer día si no viniera dado:
    // metros con dos decimales y garrapata en vez de flecha.
    assert.equal(dimension.precision, 2, `${template.id}: dos decimales`);
    assert.equal(dimension.units, "m", `${template.id}: se acota en metros`);
    assert.equal(dimension.arrowhead, "architectural-tick", `${template.id}: garrapata`);

    const mleader = document.styles.mleader?.[CAD_STARTER_MLEADER_STYLE];
    assert.ok(mleader, `${template.id}: estilo de directriz`);
    assert.equal(mleader.landing, true);
    assert.equal(document.styles.plot[CAD_STARTER_PLOT_STYLE]?.colorMode, "monochrome");

    // Y trae estilo para CADA escala de dibujo mexicana, no sólo para la suya:
    // cambiar una planta de 1:50 a 1:75 no puede obligar a reacotar el plano.
    for (const scale of CAD_MEXICAN_SCALES)
      ok(
        !!document.styles.dimension[cadMexicanDimensionStyleName(scale)],
        `${template.id}: trae el estilo de 1:${scale.denominator}`,
      );
  }

  // Los números concretos, para que la fórmula no se pueda cambiar en silencio.
  const planta = createCadStarterDocument({ templateId: "planta-arquitectonica" });
  assert.equal(planta.styles.text.ROTULO.height, 125);
  assert.equal(planta.styles.text.SUBTITULO.height, 175);
  assert.equal(planta.styles.text.TITULO.height, 250);
  assert.equal(planta.styles.dimension["COTA 1:50"].arrowSize, 125);
  // 1:75 no está en ISO 5455 y se ofrece igual, porque en México se usa: 2,5 mm
  // sobre el papel a 1:75 son 187,5 unidades de modelo.
  assert.equal(planta.styles.dimension["COTA 1:75"].arrowSize, 187.5);
  // El estilo de DETALLE acota en centímetros enteros, no en metros: es la otra
  // mitad de la costumbre, y confundirlas rotula «0.12» donde dice «12».
  assert.equal(planta.styles.dimension["COTA DET 1:20"].units, "cm");
  assert.equal(planta.styles.dimension["COTA DET 1:20"].precision, 0);

  const conjunto = createCadStarterDocument({ templateId: "planta-de-conjunto" });
  assert.equal(conjunto.styles.text.ROTULO.height, 500);
  assert.equal(conjunto.styles.dimension["COTA 1:200"].arrowSize, 500);
  // Y que NO son el mismo número: una plantilla que rotulara igual a 1:50 y a
  // 1:200 tendría la letra de la de conjunto a 0,625 mm en el papel.
  assert.notEqual(planta.styles.text.ROTULO.height, conjunto.styles.text.ROTULO.height);
}

// --- EL CAJETÍN MEXICANO, LEÍDO POR EL TRAZADOR -----------------------------
{
  const document = createCadStarterDocument({
    templateId: "planta-arquitectonica",
    project: "Casa Zaragoza",
    client: "Familia Zaragoza",
    title: "Planta baja",
    drawnBy: "S. Valle",
    checkedBy: "A. Núñez",
    date: "2026-08-18",
    revision: "B",
    location: "Av. Álvaro Obregón 145, Roma Norte, Cuauhtémoc, CDMX",
    owner: "Familia Zaragoza",
    dro: "Arq. L. Mendoza",
    droRegistration: "DRO-1284",
  });
  const [sheet] = document.paperSpaces;
  const layout = layoutCadTitleBlock({
    sheetId: sheet.id,
    page: { width: sheet.page.width, height: sheet.page.height },
    margins: sheet.pageSetup!.margins,
    layout: sheet,
    viewportScales: ["1:50"],
    units: "mm",
  });
  // La disposición viaja con la LÁMINA: quien traza no tiene que acordarse.
  assert.equal(layout.variant, "mexicano");
  const value = (key: string) =>
    layout.cells.find((cell) => cell.key === key)?.value ?? "";
  assert.equal(value("project"), "Casa Zaragoza");
  assert.equal(value("title"), "Planta baja");
  assert.equal(value("date"), "2026-08-18");
  assert.equal(value("drawnBy"), "S. Valle");
  assert.equal(value("checkedBy"), "A. Núñez");
  assert.equal(value("revision"), "B");
  assert.equal(value("sheetNumber"), "A-101");
  assert.equal(value("discipline"), "Arquitectura");
  assert.equal(value("units"), "mm");
  // Los tres campos que AutoCAD no trae y una ventanilla mexicana sí pide.
  assert.match(value("location"), /Roma Norte/);
  assert.equal(value("owner"), "Familia Zaragoza");
  assert.equal(value("dro"), "Arq. L. Mendoza");
  assert.equal(value("droRegistration"), "DRO-1284");
  // La escala la pone la VENTANA, no un atributo escrito a mano.
  assert.equal(value("scale"), "1:50");

  // La casilla de FIRMA se imprime vacía a propósito: es papel para firmar
  // encima. Que llevara el nombre repetido invitaría a entregar sin firmar.
  const firma = layout.cells.find((cell) => cell.label === "FIRMA DEL D.R.O.");
  assert.ok(firma, "el cajetín reserva el hueco de la firma del D.R.O.");
  assert.equal(firma.value, "");
  ok(firma.height >= 9, "el hueco de firma da para firmar a mano");

  // Nada del cajetín se sale de la hoja y nada queda por debajo del mínimo
  // legible: un cajetín cortado es una lámina sin número de plano.
  assert.equal(
    cadTitleBlockOverflowMm(layout, {
      width: sheet.page.width,
      height: sheet.page.height,
    }),
    0,
  );
  assert.equal(layout.shrink, 1);
  assert.deepEqual(layout.issues, []);
  // Y cabe ENTERO en el panel A4 que queda a la vista con la lámina doblada. Si
  // cayera al dorso, la carpeta del cliente serían veinte rectángulos iguales.
  ok(
    cadFitsInFrontPanel(layout.box, "A1", "landscape"),
    "el cajetín queda a la vista con la lámina doblada a A4",
  );
  // Con todos los datos dados, lo ÚNICO que queda sin rellenar es la posición
  // en la serie («3/6»), y eso es correcto: una plantilla crea UNA lámina
  // suelta, y el número de hojas lo pone el conjunto de planos cuando existe.
  assert.deepEqual(layout.missing, ["sheetOf"]);

  // Y sin datos, el cajetín NO miente: dice «—» y lo declara como ausente. El
  // D.R.O. en blanco es lo correcto — inventar un responsable en un plano que
  // se presenta ante una autoridad sería mucho peor que dejar el hueco.
  const anonimo = createCadStarterDocument({ templateId: "planta-arquitectonica" });
  const vacio = layoutCadTitleBlock({
    sheetId: "x",
    page: { width: 841, height: 594 },
    margins: { top: 10, right: 10, bottom: 10, left: 20 },
    layout: anonimo.paperSpaces[0],
    units: "mm",
  });
  assert.equal(
    vacio.cells.find((cell) => cell.key === "project")?.value,
    "Proyecto sin nombre",
  );
  ok(
    vacio.missing.includes("location") && vacio.missing.includes("dro"),
    "los campos sin dato se declaran ausentes, el D.R.O. incluido",
  );
}

// --- EL PAPEL LO ELIGE EL USUARIO -------------------------------------------
{
  const enA2 = createCadStarterDocument({ templateId: "planta-arquitectonica", paper: "A2" });
  const [sheet] = enA2.paperSpaces;
  // A2 apaisado: 594 × 420.
  assert.equal(sheet.page.width, 594);
  assert.equal(sheet.page.height, 420);
  assert.equal(sheet.pageSetup?.paper, "A2");
  assert.equal(sheet.viewports?.[0].paperBounds.width, 594 - 30);
  assert.equal(sheet.viewports?.[0].paperBounds.height, 420 - 20 - 50);
  // Y el cajetín sigue cabiendo entero en el panel visible al doblar.
  const layout = layoutCadTitleBlock({
    sheetId: sheet.id,
    page: { width: sheet.page.width, height: sheet.page.height },
    margins: sheet.pageSetup!.margins,
    layout: sheet,
  });
  assert.equal(layout.shrink, 1);
  ok(cadFitsInFrontPanel(layout.box, "A2", "landscape"), "en A2 el cajetín queda a la vista");
}

// --- DETERMINISTA -----------------------------------------------------------
{
  const build = (): CadDocument =>
    createCadStarterDocument({
      templateId: "plano-de-instalaciones",
      project: "Clínica San Andrés",
      date: "2026-08-18",
    });
  assert.equal(serializeCadDocument(build()), serializeCadDocument(build()));
  // Y el documento arranca VACÍO de geometría: la plantilla configura, no
  // dibuja. Un arranque con geometría de ejemplo obliga a borrarla antes de
  // empezar, que es peor que un lienzo en blanco.
  const document = build();
  assert.deepEqual(document.entities, []);
  assert.deepEqual(document.modelSpace.entityIds, []);
  assert.deepEqual(document.blocks, []);
  assert.equal(document.history.length, 1);
  assert.match(document.history[0].label, /Plantilla de arranque/);
  // Las capas de instalaciones, que son la razón de ser de esta plantilla.
  const ids = new Set(document.layers.map((item) => item.id));
  for (const expected of ["INST-HID", "INST-SAN", "INST-ELE", "INST-GAS"])
    ok(ids.has(expected), `instalaciones declara ${expected}`);
  // La arquitectura de fondo se dibuja fina: es referencia, no protagonista.
  assert.equal(document.layers.find((item) => item.id === "ARQ-FONDO")?.lineweight, 0.13);
  // Y la auxiliar NO se imprime.
  assert.equal(document.layers.find((item) => item.id === "AUXILIAR")?.plot, false);
  // El eje va a trazo y punto, como en cualquier plano.
  assert.equal(document.layers.find((item) => item.id === "EJE")?.linetype, "CENTER");

  // La plantilla de remodelación trae el código de color mexicano: amarillo a
  // trazos lo que se quita, rojo continuo lo que se pone.
  const remodelacion = createCadStarterDocument({ templateId: "planta-de-demolicion" });
  const capa = (id: string) => remodelacion.layers.find((item) => item.id === id);
  assert.equal(capa("MURO-DEM")?.color, "#ffff00");
  assert.equal(capa("MURO-DEM")?.linetype, "DASHED");
  assert.equal(capa("MURO-NUE")?.color, "#ff0000");
  assert.equal(capa("MURO-NUE")?.linetype, undefined);
  assert.equal(capa("MURO-EXI")?.color, "#808080");
}

console.log(`starter-templates.spec: ${checks} comprobaciones nombradas + aserciones directas OK`);
