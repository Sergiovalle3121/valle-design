/**
 * MTEXT con formato: códigos de control y fuentes SHX/TTF.
 *
 * ## Qué se afirma aquí
 *
 * Un despacho no rotula con texto llano. Rotula con fracciones apiladas, con
 * tolerancias, con el símbolo de diámetro pegado a su número, con un cambio de
 * fuente a media línea y con la anchura apretada para que el rótulo quepa en la
 * casilla del cajetín sin bajar la altura, que la fija la norma. Todo eso son
 * los CÓDIGOS DE CONTROL de un MTEXT, y todo eso llega dentro del `.dxf` que
 * manda el cliente.
 *
 * Esta spec cierra dos afirmaciones distintas y las mantiene separadas a
 * propósito, porque confundirlas es la forma habitual de mentir sobre fuentes:
 *
 * 1. **Qué se LEE.** Los códigos que el analizador entiende, con sus valores
 *    exactos, y los que NO entiende —que se conservan visibles en vez de
 *    desaparecer del plano—.
 * 2. **Qué se DIBUJA.** Qué familia acaba pintando el rótulo, y cuándo eso NO
 *    es la que pedía el dibujo. Ninguna `.shx` se interpreta; las cinco más
 *    comunes se sustituyen por su familia de trazos Hershey cuando el
 *    anfitrión las declara —la maqueta de pantalla lo hace—, y el resto por la
 *    TTF más parecida. Siempre se dice por cuál.
 *
 * La frontera entre las dos —lo que se lee bien pero todavía no se dibuja
 * tramo a tramo— se afirma también, para que no se pueda confundir «el
 * analizador lo entiende» con «el plano sale así».
 */
import { strict as assert } from "node:assert";
import {
  CAD_MTEXT_HARD_SPACE,
  cadMTextHasCodes,
  cadMTextPlainText,
  cadMTextRunHeight,
  cadMTextStackCode,
  escapeCadMText,
  parseCadMText,
  type CadMTextRun,
} from "./mtext-codes";
import {
  CAD_MTEXT_DEFAULT_FAMILY,
  cadMTextFontsUsed,
  describeCadMTextFont,
  parseCadMTextFontCode,
  resolveCadMTextFont,
  resolveCadMTextFonts,
} from "./mtext-fonts";
import { layoutCadMText, measureCadMText, type CadMTextEntity } from "./mtext-layout";

let checks = 0;
function eq<T>(actual: T, expected: T, what: string) {
  checks += 1;
  assert.deepEqual(actual, expected, what);
}
function ok(condition: boolean, what: string) {
  checks += 1;
  assert.ok(condition, what);
}

/** Primer párrafo de un texto, que es donde viven casi todas las pruebas. */
function runs(source: string): readonly CadMTextRun[] {
  return parseCadMText(source)[0];
}

function mtext(text: string, extra: Partial<CadMTextEntity> = {}): CadMTextEntity {
  return {
    id: "m1",
    type: "mtext",
    insertion: { x: 0, y: 0, z: 0 },
    text,
    height: 100,
    width: 10_000,
    layer: "0",
    ...extra,
  } as CadMTextEntity;
}

// ===========================================================================
// PARTE 1 — LOS CÓDIGOS DE CONTROL
// ===========================================================================

// --- \P: el salto de párrafo ------------------------------------------------
{
  eq(cadMTextPlainText("PLANTA BAJA\\PESC 1:50"), "PLANTA BAJA\nESC 1:50", "\\P parte párrafos");
  eq(parseCadMText("uno\\Pdos\\Ptres").length, 3, "tres párrafos de un solo texto");
  // El editor en sitio escribe saltos de verdad y el importador de DXF escribe
  // `\P`. Los dos tienen que significar lo mismo o el mismo rótulo se maquetaría
  // distinto según por dónde entró.
  eq(parseCadMText("uno\r\ndos").length, 2, "un CRLF real vale por un \\P");
  eq(parseCadMText("uno\ndos").length, 2, "y un salto suelto también");
}

// --- \S: el apilado, con los TRES separadores -------------------------------
{
  // `^` — tolerancia: una encima de otra y sin raya. Es la mitad del texto de
  // un plano de taller: sin esto una pieza se describe, no se acota.
  const tolerance = runs("Ø25\\S+0.05^-0.02;");
  eq(tolerance.length, 2, "el prefijo y el apilado son tramos distintos");
  eq(tolerance[0].text, "Ø25", "el prefijo se conserva entero");
  eq(
    tolerance[1].stack,
    { upper: "+0.05", lower: "-0.02", style: "tolerance" },
    "tolerancia apilada, sin raya",
  );

  // `/` — fracción con raya horizontal. Es como se rotula 1/2" en un plano de
  // instalaciones hecho en un despacho que trabaja en pulgadas.
  const fraction = runs('\\S1/2;"');
  eq(fraction[0].stack?.style, "fraction", "la barra da fracción con raya");
  eq(fraction[0].stack?.upper, "1", "numerador");
  eq(fraction[0].stack?.lower, "2", "denominador");

  // `#` — fracción diagonal, la que AutoCAD escribe al teclear `1#4`.
  eq(runs("\\S3#4;")[0].stack?.style, "diagonal", "la almohadilla da fracción diagonal");

  // Aplanado de una línea: es lo que miden y dibujan los consumidores que
  // todavía no saben apilar, y no miente sobre el contenido.
  eq(runs("\\S+0.05^-0.02;")[0].text, "+0.05/-0.02", "el apilado tiene versión de una línea");

  // Un `\S` sin cerrar apila hasta el fin del PÁRRAFO, no del texto entero: un
  // texto mal formado no debe fundir cuatro párrafos en uno.
  const unterminated = parseCadMText("\\S1^2\\Psiguiente");
  eq(unterminated.length, 2, "el salto de párrafo corta el apilado sin cerrar");
  eq(unterminated[1][0].text, "siguiente", "y el párrafo siguiente sobrevive intacto");

  // Sin separador no hay apilado: se conserva literal en vez de desaparecer.
  eq(runs("\\Sabc")[0].text, "\\Sabc", "un \\S sin separador se conserva tal cual");
  eq(runs("\\Sabc")[0].stack, undefined, "y no inventa un apilado");

  // Ida y vuelta con el constructor, que es lo que usan TOLERANCE y el editor.
  eq(cadMTextStackCode("+0.1", "-0.1"), "\\S+0.1^-0.1;", "se construye la tolerancia");
  eq(cadMTextStackCode("1", "2", "fraction"), "\\S1/2;", "y la fracción con raya");
  eq(
    runs(cadMTextStackCode("3", "4", "diagonal"))[0].stack,
    { upper: "3", lower: "4", style: "diagonal" },
    "lo construido se vuelve a leer igual",
  );
}

// --- \f: el cambio de fuente a media línea ----------------------------------
{
  const mixed = runs("NIVEL \\fISOCPEUR|b0|i0|c0|p34;+2.85");
  eq(mixed.length, 2, "el cambio de fuente parte el texto en dos tramos");
  eq(mixed[0].fontFamily, undefined, "el primero va con la fuente de la entidad");
  eq(mixed[1].fontFamily, "ISOCPEUR", "y el segundo con la que pide el código");
  eq(mixed[1].text, "+2.85", "sin comerse ni un carácter del contenido");

  // Los cinco campos del código se leen; sólo la familia decide qué se dibuja,
  // y eso se afirma para que la diferencia no quede como sobreentendido.
  const code = parseCadMTextFontCode("Arial|b1|i0|c0|p34");
  eq(code.family, "Arial", "familia");
  eq(code.bold, true, "negrita declarada en el código");
  eq(code.italic, false, "cursiva declarada en el código");
  eq(code.codePage, 0, "página de códigos leída");
  eq(code.pitchAndFamily, 34, "paso y familia leídos");
  // La negrita y la cursiva del código NO viajan al tramo: el modelo canónico
  // las lleva como campos propios de la ENTIDAD, y tener dos sitios donde vive
  // «negrita» es tener dos que se pueden contradecir.
  eq(runs("\\fArial|b1|i1;texto")[0].fontFamily, "Arial", "del código sólo sube la familia");
  ok(
    !("bold" in runs("\\fArial|b1|i1;texto")[0]),
    "la negrita del código no se cuela en el tramo",
  );
}

// --- \H: la altura, absoluta y relativa -------------------------------------
{
  eq(runs("\\H2x;grande")[0].heightScale, 2, "\\H2x; es un multiplicador");
  eq(cadMTextRunHeight(runs("\\H2x;grande")[0], 120), 240, "120 × 2 = 240");
  eq(cadMTextRunHeight(runs("\\H300;fijo")[0], 120), 300, "\\H300; ignora la altura de la entidad");
  eq(cadMTextRunHeight(runs("llano")[0], 120), 120, "sin código, la de la entidad");
}

// --- \W: el factor de anchura -----------------------------------------------
{
  eq(runs("\\W0.8;apretado")[0].widthFactor, 0.8, "0,8 aprieta el texto");
  eq(runs("\\W1.2;ancho")[0].widthFactor, 1.2, "1,2 lo ensancha");
  eq(runs("llano")[0].widthFactor, 1, "sin código, anchura natural");
  // Cero o negativo no aprieta: hace desaparecer el texto o lo dibuja del
  // revés. Se ignora y se conserva el anterior, que es la regla de todo el
  // módulo: ante lo imposible, no cambiar nada.
  eq(runs("\\W1.5;a\\W0;b")[0].widthFactor, 1.5, "un \\W0; no borra el rótulo");
  eq(runs("\\W-2;a")[0].widthFactor, 1, "ni un factor negativo lo voltea");
  eq(cadMTextPlainText("\\W0.8;apretado"), "apretado", "y el código no se dibuja como texto");
}

// --- \Q: la oblicuidad ------------------------------------------------------
{
  eq(runs("\\Q15;inclinado")[0].oblique, 15, "15 grados, la inclinación de ISOCPEUR");
  eq(runs("\\Q-15;alreves")[0].oblique, -15, "y puede inclinarse hacia el otro lado");
  eq(runs("llano")[0].oblique, 0, "sin código, recto");
  eq(cadMTextPlainText("\\Q15;inclinado"), "inclinado", "tampoco se dibuja el código");
}

// --- \C: el color por tramo -------------------------------------------------
{
  const colored = runs("normal\\C1;rojo");
  eq(colored.length, 2, "el color parte el texto en dos tramos");
  eq(colored[0].color, undefined, "el primero hereda el color de la entidad");
  eq(colored[1].color, "1", "y el segundo lleva el índice ACI tal cual se escribió");
}

// --- \L\l y \O\o: subrayado y sobrerrayado ----------------------------------
{
  const underlined = runs("antes\\Lsubrayado\\ldespués");
  eq(underlined.map((run) => run.text), ["antes", "subrayado", "después"], "tres tramos");
  eq(underlined.map((run) => run.underline), [false, true, false], "el subrayado abre y cierra");
  const overlined = runs("\\Oarriba\\oabajo");
  eq(overlined.map((run) => run.overline), [true, false], "el sobrerrayado, igual");
  // Los dos a la vez son atributos independientes, no un modo con tres estados.
  const both = runs("\\L\\Oambos\\l\\ollano");
  eq(both[0].underline && both[0].overline, true, "se pueden llevar los dos");
  eq(both[1].underline || both[1].overline, false, "y quitarse los dos");
}

// --- \A: la alineación vertical del tramo -----------------------------------
{
  eq(runs("\\A0;abajo")[0].verticalAlign, "bottom", "\\A0; apoya abajo");
  eq(runs("\\A1;centro")[0].verticalAlign, "center", "\\A1; centra");
  eq(runs("\\A2;arriba")[0].verticalAlign, "top", "\\A2; sube");
  eq(runs("llano")[0].verticalAlign, undefined, "sin código no se fija ninguna");
  // Un valor fuera de los tres no cambia nada, en vez de elegir uno al azar.
  eq(runs("\\A1;a\\A9;b")[0].verticalAlign, "center", "\\A9; no existe y no toca lo puesto");
  eq(cadMTextPlainText("\\A1;PLANTA"), "PLANTA", "y el código no llega al dibujo");
}

// --- \~: el espacio DURO ----------------------------------------------------
{
  const hard = cadMTextPlainText("Ø\\~25");
  eq(hard, `Ø${CAD_MTEXT_HARD_SPACE}25`, "\\~ produce un espacio de verdad, no un marcador");
  eq(hard.length, 4, "que ocupa UN carácter, como el espacio corriente");
  ok(hard !== "Ø 25", "pero no es el espacio corriente");
  // Y la diferencia se NOTA donde tiene que notarse: en el ajuste de línea. El
  // mismo rótulo con espacio corriente se parte en dos renglones y con espacio
  // duro no, que es exactamente para lo que existe el código.
  // «Ø 25» a altura 100 mide 207 unidades; en una caja de 150 no cabe entero.
  const narrow = { width: 150, height: 100 };
  const soft = layoutCadMText(mtext("Ø 25", narrow));
  const stiff = layoutCadMText(mtext("Ø\\~25", narrow));
  ok(soft.lines.length > 1, `con espacio corriente el rótulo se parte (${soft.lines.length} líneas)`);
  eq(stiff.lines.length, 1, "y con espacio duro NO se parte");
  eq(stiff.lines[0].text, `Ø${CAD_MTEXT_HARD_SPACE}25`, "el rótulo entero en un renglón");
}

// --- \\ \{ \}: los literales escapados --------------------------------------
{
  eq(cadMTextPlainText("C:\\\\planos"), "C:\\planos", "\\\\ es una barra literal");
  eq(cadMTextPlainText("\\{no es grupo\\}"), "{no es grupo}", "las llaves escapadas son literales");
  eq(escapeCadMText("a{b}c\\d"), "a\\{b\\}c\\\\d", "escapar un literal para que viaje intacto");
  eq(cadMTextPlainText(escapeCadMText("a{b}c\\d")), "a{b}c\\d", "y la vuelta es exacta");
  // Una barra suelta al final no puede tragarse nada ni romper el análisis.
  eq(cadMTextPlainText("final\\"), "final\\", "una barra huérfana se conserva");
}

// --- {}: los grupos, ANIDADOS -----------------------------------------------
{
  const nested = runs("a{\\Lb{\\Oc}d}e");
  eq(nested.map((run) => run.text), ["a", "b", "c", "d", "e"], "cinco tramos");
  eq(
    nested.map((run) => run.underline),
    [false, true, true, true, false],
    "el subrayado vive dentro de su llave y no se escapa",
  );
  eq(
    nested.map((run) => run.overline),
    [false, false, true, false, false],
    "y el sobrerrayado del grupo interior sólo alcanza a su tramo",
  );
  eq(cadMTextPlainText("a{\\Lb{\\Oc}d}e"), "abcde", "las llaves no son contenido");

  // Una llave que cierra de más no rompe nada: se vuelve al estado inicial.
  eq(runs("}}suelto")[0].text, "suelto", "cerrar de más no borra el texto");
  // Y una que abre y no cierra tampoco: lo que quede dentro conserva su formato.
  eq(runs("{\\Labierto")[0].underline, true, "abrir sin cerrar deja el formato vivo");
}

// --- Los que NO se entienden, y por qué se ven ------------------------------
{
  // Es la diferencia entre «no lo entiendo» y «lo borro». Un dibujo importado
  // puede traer códigos que este módulo todavía no conoce, y comérselos
  // quitaría contenido del plano sin que nada avisara. Que se vea es feo; que
  // desaparezca es una entrega mal hecha que nadie detecta.
  eq(cadMTextPlainText("\\T2;espaciado"), "\\T2;espaciado", "\\T (espaciado) se conserva visible");
  eq(cadMTextPlainText("\\pxi-2,l2;sangría"), "\\pxi-2,l2;sangría", "\\p (sangrías) también");
  eq(cadMTextPlainText("\\Z"), "\\Z", "y cualquier otro código desconocido");
  ok(cadMTextHasCodes("\\T2;x"), "y siguen contando como texto CON códigos");
}

// --- Un rótulo real, con todo junto -----------------------------------------
{
  // Es el pie de una cota de un plano de instalaciones: fuente propia, anchura
  // apretada para que quepa, un apilado, un espacio duro y dos párrafos.
  const source =
    "{\\fISOCPEUR|b0|i0;\\W0.8;\\Q15;TUBO Ø\\~25 \\S+0.05^-0.02;}\\PPENDIENTE \\S1/2;%";
  const paragraphs = parseCadMText(source);
  eq(paragraphs.length, 2, "dos párrafos");
  const [first, second] = paragraphs;
  eq(first[0].fontFamily, "ISOCPEUR", "el primer párrafo va en la fuente del grupo");
  eq(first[0].widthFactor, 0.8, "apretado");
  eq(first[0].oblique, 15, "e inclinado");
  ok(
    first[0].text.includes(`Ø${CAD_MTEXT_HARD_SPACE}25`),
    "con el diámetro pegado a su número",
  );
  eq(first[first.length - 1].stack?.style, "tolerance", "y la tolerancia apilada al final");
  // La llave cerró: el segundo párrafo vuelve a la fuente y a la anchura de la
  // entidad. Es lo que hace que un rótulo no contamine al siguiente.
  eq(second[0].fontFamily, undefined, "el segundo párrafo ya no lleva la fuente del grupo");
  eq(second[0].widthFactor, 1, "ni su anchura");
  eq(second[0].oblique, 0, "ni su inclinación");
}

// ===========================================================================
// PARTE 2 — FUENTES SHX Y TTF: QUÉ SE RESUELVE Y QUÉ SE SUSTITUYE
// ===========================================================================

// --- Ninguna .shx se resuelve, y se dice por qué ----------------------------
{
  // Una SHX es un programa de trazos compilado, no una fuente de contornos.
  // Dibujarla exige un intérprete de formas que este producto NO tiene, así que
  // TODAS se sustituyen. Decir que «se soportan» porque sale algo parecido sería
  // exactamente la clase de afirmación que aquí no se admite.
  const txt = resolveCadMTextFont("txt.shx");
  eq(txt.kind, "shx", "se reconoce como SHX");
  eq(txt.disposition, "substituted", "y se declara SUSTITUIDA, no resuelta");
  eq(txt.substitutedBy, "Arial", "por Arial: es la de trazo simple sin serifas");
  eq(txt.metricsDiffer, true, "y se avisa de que las anchuras no son las mismas");
  ok((txt.reason ?? "").includes("no lo interpreta"), `la razón lo dice: ${txt.reason}`);

  eq(resolveCadMTextFont("romand.shx").substitutedBy, "Times New Roman", "las romanas, a una romana");
  eq(resolveCadMTextFont("italict.shx").substitutedBy, "Times New Roman", "las inclinadas también");
  eq(resolveCadMTextFont("monotxt.shx").substitutedBy, "Courier New", "la de paso fijo, a Courier");
  eq(resolveCadMTextFont("isocp.shx").substitutedBy, "Arial", "la ISO, a Arial");

  // Citada sin extensión sigue siendo una SHX: `txt` a secas es como la nombra
  // media plantilla de estudio, y tratarla como TTF la daría por resuelta.
  eq(resolveCadMTextFont("romans").kind, "shx", "`romans` sin extensión sigue siendo SHX");
  eq(resolveCadMTextFont("romans").disposition, "substituted", "y sigue sustituyéndose");

  // Una SHX desconocida no se resuelve por no estar en la tabla: se sustituye
  // igual y se dice que no había tabla, que es la verdad.
  const unknown = resolveCadMTextFont("estudio-2004.shx");
  eq(unknown.disposition, "substituted", "una SHX que no está en la tabla también se sustituye");
  ok((unknown.reason ?? "").includes("no hay tabla"), "diciendo justo eso");

  // Y la ruta completa no confunde: lo que importa es el nombre del archivo.
  eq(resolveCadMTextFont("C:\\\\Fuentes\\\\TXT.SHX").substitutedBy, "Arial", "con ruta y en mayúsculas");
}

// --- Las SHX que no dibujan letras, aparte ----------------------------------
{
  // `gdt.shx` son los símbolos de tolerancia geométrica. Sustituirla por una
  // fuente de texto pinta LETRAS donde el dibujo tenía símbolos, que es peor que
  // dejar un hueco: parece contenido y no lo es. Se marca aparte para que quien
  // lo reciba lo trate como pérdida y no como cambio de estilo.
  const gdt = resolveCadMTextFont("gdt.shx");
  eq(gdt.disposition, "symbols-lost", "una fuente de símbolos no es una sustitución cualquiera");
  ok((gdt.reason ?? "").includes("no letras"), `y la razón lo explica: ${gdt.reason}`);
  ok(describeCadMTextFont(gdt).includes("SÍMBOLOS PERDIDOS"), "el renglón que se enseña lo grita");
  eq(resolveCadMTextFont("ltypeshp.shx").disposition, "symbols-lost", "las formas de tipos de línea");
  eq(resolveCadMTextFont("symath.shx").disposition, "symbols-lost", "y las matemáticas");
}

// --- Las TTF: se resuelven las que están ------------------------------------
{
  for (const family of ["Arial", "Times New Roman", "Courier New", "Verdana", "Georgia"]) {
    const resolution = resolveCadMTextFont(family);
    eq(resolution.disposition, "resolved", `${family} se dibuja tal cual`);
    eq(resolution.substitutedBy, null, `${family} no se sustituye por nada`);
    eq(resolution.metricsDiffer, false, `${family} conserva sus anchuras`);
  }
  eq(resolveCadMTextFont("arial.ttf").disposition, "resolved", "con extensión, igual");
  eq(resolveCadMTextFont("ARIAL").disposition, "resolved", "y sin distinguir mayúsculas");

  // `ISOCPEUR` es la que más se cita al lado de las SHX de trazo y NO es una:
  // es TrueType. Se clasifica como tal aunque acabe sustituida por la misma
  // familia, porque un resultado que coincide con el motivo equivocado es como
  // se cuelan los errores que nadie encuentra.
  const isocpeur = resolveCadMTextFont("ISOCPEUR");
  eq(isocpeur.kind, "ttf", "ISOCPEUR es TrueType, no una .shx");
  eq(isocpeur.disposition, "substituted", "pero no la tiene todo el mundo");
  eq(resolveCadMTextFont("isocp.shx").kind, "shx", "la que sí es SHX se llama isocp");

  // Una TTF de estudio no está en ningún sistema: se sustituye y se dice.
  const custom = resolveCadMTextFont("City Blueprint");
  eq(custom.kind, "ttf", "es una TTF");
  eq(custom.disposition, "substituted", "pero no de las que todo sistema tiene");
  eq(custom.substitutedBy, "Arial", "y se sustituye por la más cercana");
  ok(
    custom.fontStack.startsWith("City Blueprint"),
    `la pedida va DELANTE en la pila por si el equipo la tiene: ${custom.fontStack}`,
  );

  // El anfitrión puede declarar lo que sí tiene cargado, igual que en el
  // trazado: quien sabe qué fuentes hay es él, no una lista escrita a mano.
  const declared = resolveCadMTextFont("City Blueprint", { available: ["City Blueprint"] });
  eq(declared.disposition, "resolved", "declarada disponible, se resuelve");

  // Sin nombre no hay sustitución que declarar: se usa la de siempre.
  const nameless = resolveCadMTextFont(undefined);
  eq(nameless.kind, "unnamed", "sin familia");
  eq(nameless.family, CAD_MTEXT_DEFAULT_FAMILY, "se dibuja con la de siempre");
  eq(nameless.disposition, "resolved", "y eso no es una sustitución");
}

// --- El informe de un rótulo entero -----------------------------------------
{
  const source = "NIVEL \\ftxt.shx;+2.85 \\fArial;m";
  eq(cadMTextFontsUsed(source), ["txt.shx", "Arial"], "las familias que NOMBRA el texto, en orden");
  const report = resolveCadMTextFonts(source, "ISOCPEUR");
  eq(report.length, 3, "la de la entidad y las dos del texto");
  eq(report[0].requested, "ISOCPEUR", "la de la entidad va primera");
  eq(report.filter((font) => font.disposition === "substituted").length, 2, "dos se sustituyen");
  eq(report.filter((font) => font.disposition === "resolved").length, 1, "y sólo Arial se resuelve");
  const lines = report.map(describeCadMTextFont);
  ok(
    lines.some((line) => line.includes("SUSTITUIDA por Arial")),
    `hay un renglón que lo dice con nombre y apellidos: ${lines.join(" | ")}`,
  );

  // Un `\f` ESCAPADO no nombra ninguna fuente: leerlo con una expresión regular
  // sobre la cadena daría un falso positivo, y por eso se lee de los tramos.
  eq(cadMTextFontsUsed("ruta C:\\\\fuentes\\\\lista"), [], "una barra escapada no es un código");
}

// ===========================================================================
// PARTE 3 — LO CONSTRUIDO SE ENTREGA, Y LA FRONTERA SE DECLARA
// ===========================================================================

// --- La maqueta CONSUME los códigos -----------------------------------------
{
  // Regla del repositorio: construir el módulo no es entregarlo. Si la maqueta
  // no llamara al analizador, todo lo de arriba estaría verde y el producto
  // seguiría dibujando `\S1^2;` como diez caracteres sueltos.
  const layout = layoutCadMText(mtext("Ø25\\S+0.05^-0.02;"));
  eq(layout.lines.length, 1, "un solo renglón");
  eq(layout.lines[0].text, "Ø25+0.05/-0.02", "la maqueta ya no ve el código");
  eq(
    layoutCadMText(mtext("primera\\Psegunda")).lines.map((line) => line.text),
    ["primera", "segunda"],
    "\\P sigue partiendo renglones en la maqueta",
  );
  // Y los códigos nuevos tampoco se dibujan como caracteres: un `\W0.8;` que se
  // pintara literalmente ocuparía el ancho de seis caracteres que nadie escribió.
  eq(layoutCadMText(mtext("\\W0.8;\\Q15;\\A1;CAJETÍN")).lines[0].text, "CAJETÍN", "ni \\W ni \\Q ni \\A");
}

// --- La sustitución de fuente llega al DIBUJO, no se queda en el informe -----
{
  // La maqueta de PANTALLA declara disponibles las familias Hershey (van
  // compiladas), así que `txt.shx` ya no cae en la sans: va a trazos, y la
  // resolución lo dice entero — sigue siendo una sustitución con métrica
  // distinta de la .shx original, no un «soportamos SHX».
  const withShx = layoutCadMText(mtext("COTA", { fontFamily: "txt.shx" } as Partial<CadMTextEntity>));
  eq(withShx.font.disposition, "substituted", "la maqueta declara la sustitución");
  eq(withShx.font.substitutedBy, "Hershey Simplex", "y por cuál: los trazos Hershey");
  eq(withShx.font.strokeFamily, "Hershey Simplex", "con la familia de trazos para quien pinta");
  eq(withShx.font.metricsDiffer, true, "sin fingir la métrica del binario original");
  ok(
    !withShx.fontStack.toLowerCase().includes(".shx"),
    `la pila que va al lienzo no pide una .shx: ${withShx.fontStack}`,
  );
  ok(
    withShx.fontStack.startsWith("Arial"),
    "y la pila de RESPALDO es una sans de verdad, porque «Hershey Simplex» no es una fuente CSS",
  );
  // La anchura del renglón es la métrica de trazos, no la estimación sans:
  // la suma de avances Hershey de C+O+T+A (21+22+16+18 = 77 unidades).
  eq(withShx.lines[0].width, 77 * (100 / 21), "el renglón mide la suma de avances Hershey");

  const withTtf = layoutCadMText(mtext("COTA", { fontFamily: "Arial" } as Partial<CadMTextEntity>));
  eq(withTtf.font.disposition, "resolved", "y una TTF corriente se declara resuelta");
  eq(withTtf.font.strokeFamily, null, "sin trazos: la pinta el lienzo con su pila");
}

// --- La frontera: qué se LEE y qué todavía no se DIBUJA ---------------------
{
  // Esto es una declaración, no un fallo disfrazado. La maqueta produce
  // RENGLONES —texto, posición y anchura— y mide todos con la altura, la
  // anchura y la fuente de la ENTIDAD. Los factores por tramo están leídos y
  // disponibles en `parseCadMText`, pero consumirlos exige que el render dibuje
  // tramo a tramo, que es trabajo del pipeline de render. Se afirma aquí para
  // que nadie pueda confundir «el analizador lo entiende» con «el plano sale
  // así», que es justo la confusión que hace que un plano se entregue mal.
  const entity = mtext("normal\\H2x;\\W0.5;GRANDE");
  const layout = layoutCadMText(entity);
  eq(layout.fontSize, 100, "la maqueta usa la altura de la entidad");
  eq(layout.lines[0].text, "normalGRANDE", "y mide el renglón entero como uno solo");
  eq(
    layout.lines[0].width,
    measureCadMText("normalGRANDE", 100, entity),
    "con la altura y la fuente de la entidad, no con las del tramo",
  );
  // Pero la información NO se ha perdido: está leída y quien sepa dibujar
  // tramos la tiene entera.
  const parsed = runs("normal\\H2x;\\W0.5;GRANDE");
  eq(parsed[1].heightScale, 2, "el tramo sabe que va al doble de altura");
  eq(parsed[1].widthFactor, 0.5, "y a la mitad de anchura");
}

console.log(
  `mtext-rich-format: ${checks} comprobaciones verdes · códigos \\P \\S(^ / #) \\f \\H \\W \\Q \\C ` +
    "\\L\\l \\O\\o \\A \\~ \\\\ y llaves anidadas; \\T y \\p declarados sin interpretar; " +
    "SHX SIEMPRE sustituida (las cinco comunes a trazos Hershey en pantalla; " +
    "gdt/ltypeshp/symath como símbolos perdidos), TTF resuelta sólo si está.",
);
