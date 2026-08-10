/**
 * Tablas de plumas: la traducción «color 7 → negro de 0,25 mm».
 *
 * La ida y vuelta de una tabla se cumpliría de forma VACÍA si el analizador
 * devolviera siempre una tabla por defecto y el formateador la escribiera. Por
 * eso cada ronda parte de una tabla con valores RAROS —intensidades al 40 %,
 * plumas físicas, grosores fuera del catálogo— y además se ancla el resultado
 * de RESOLVER: qué color y qué grosor le toca a una entidad concreta.
 */
import { strict as assert } from "node:assert";
import { deflateSync, inflateSync } from "node:zlib";
import { aciToHex, hexToAci, screenHex, toGrayscaleHex } from "./aci-palette";
import {
  CAD_PLOT_TABLE_HEADER,
  cadPlotStyleTableFileName,
  createCadColorTable,
  createCadMonochromeTable,
  createCadNamedTable,
  createCadPlotStyle,
  exportCadPlotStyleTable,
  formatCadPlotStyleTable,
  importCadPlotStyleTable,
  parseCadPlotStyleTable,
  resolveCadPlotStyle,
  type CadZlibCodec,
} from "./plot-style-table";

const codec: CadZlibCodec = {
  inflate: (data) => new Uint8Array(inflateSync(Buffer.from(data))),
  deflate: (data) => new Uint8Array(deflateSync(Buffer.from(data))),
};

// --- la paleta ACI, en los índices que sí son exactos -------------------------
{
  assert.equal(aciToHex(1), "#ff0000");
  assert.equal(aciToHex(2), "#ffff00");
  assert.equal(aciToHex(3), "#00ff00");
  assert.equal(aciToHex(4), "#00ffff");
  assert.equal(aciToHex(5), "#0000ff");
  assert.equal(aciToHex(6), "#ff00ff");
  assert.equal(aciToHex(7), "#ffffff");
  assert.equal(aciToHex(8), "#808080");
  assert.equal(aciToHex(9), "#c0c0c0");
  assert.equal(aciToHex(250), "#333333");

  for (const aci of [1, 2, 3, 4, 5, 6, 7, 8, 9, 250, 251, 252, 253, 254])
    assert.equal(hexToAci(aciToHex(aci)), aci, `el ACI ${aci} tiene que ir y volver`);

  // Un color que no está en la tabla cae en el más cercano, no en el 7 por
  // defecto: un rojo apenas oscurecido sigue siendo el color 1.
  assert.equal(hexToAci("#fe0101"), 1);
  assert.equal(hexToAci("no es un color"), 7);

  // Luma BT.601 del rojo puro: 0,299 · 255 = 76 = 0x4c.
  assert.equal(toGrayscaleHex("#ff0000"), "#4c4c4c");
  assert.equal(toGrayscaleHex("#ffffff"), "#ffffff");
  // Al 50 % sobre blanco, el negro sale a medio gris.
  assert.equal(screenHex("#000000", 50), "#808080");
  assert.equal(screenHex("#000000", 100), "#000000");
  assert.equal(screenHex("#000000", 0), "#ffffff");
}

// --- resolver: lo que de verdad decide el grosor del papel -------------------
{
  const table = createCadMonochromeTable("estudio");
  // El color 5 (azul) en una monocroma ISO sale negro y a 0,50 mm.
  const blue = resolveCadPlotStyle(table, { color: "#0000ff", lineweight: 0.18 });
  assert.equal(blue.color, "#000000");
  assert.equal(blue.lineweight, 0.5);
  // El color 4 (cian), a 0,13.
  assert.equal(resolveCadPlotStyle(table, { color: "#00ffff" }).lineweight, 0.13);
  // El 7 (blanco en pantalla), a 0,25 — que es el general de cualquier plano.
  assert.equal(resolveCadPlotStyle(table, { color: "#ffffff" }).lineweight, 0.25);

  // Sin tabla, la entidad manda: es lo que garantiza que trazar sin CTB no
  // cambie nada en vez de cambiarlo todo a un valor inventado.
  const raw = resolveCadPlotStyle(null, { color: "#123456", lineweight: 0.7 });
  assert.equal(raw.color, "#123456");
  assert.equal(raw.lineweight, 0.7);
  assert.equal(raw.style, null);

  // Con `applyScaleFactor`, los grosores se escalan globalmente.
  const scaled = { ...table, applyScaleFactor: true, scaleFactor: 2 };
  assert.equal(resolveCadPlotStyle(scaled, { color: "#0000ff" }).lineweight, 1);

  // Intensidad: un 40 % aclara el color de salida.
  const screened = createCadColorTable("trama");
  screened.styles[6] = createCadPlotStyle({
    name: "Color_7",
    color: "#000000",
    screen: 40,
    lineweight: 0.13,
  });
  assert.equal(resolveCadPlotStyle(screened, { color: "#ffffff" }).color, "#999999");

  // STB: manda el NOMBRE, no el color.
  const named = createCadNamedTable("estudio");
  named.styles = [
    createCadPlotStyle({ name: "Normal" }),
    createCadPlotStyle({ name: "Muro", color: "#000000", lineweight: 0.6 }),
  ];
  const wall = resolveCadPlotStyle(named, { color: "#ff0000", styleName: "Muro" });
  assert.equal(wall.color, "#000000");
  assert.equal(wall.lineweight, 0.6);
  // Sin estilo asignado se usa `Normal`, que no cambia nada.
  assert.equal(resolveCadPlotStyle(named, { color: "#ff0000" }).color, "#ff0000");
  assert.equal(resolveCadPlotStyle(named, { color: "#ff0000", styleName: "Nope" }).color, "#ff0000");
}

// --- ida y vuelta por TEXTO, con valores raros -------------------------------
{
  const table = createCadColorTable("estudio-2004");
  table.description = "Tabla del estudio, 2004";
  table.scaleFactor = 1.25;
  table.applyScaleFactor = true;
  table.styles[0] = createCadPlotStyle({
    name: "Color_1",
    description: "Contornos",
    color: "#102030",
    convertToGrayscale: true,
    enableDither: false,
    pen: 3,
    virtualPen: 11,
    screen: 40,
    linetype: "DASHED",
    adaptiveLinetype: false,
    lineweight: 0.42,
    fillStyle: "crosshatch",
    lineEndStyle: "round",
    lineJoinStyle: "bevel",
  });
  table.customLineweights = [0, 0.11, 0.22, 0.33];

  const text = formatCadPlotStyleTable(table);
  assert.ok(text.includes('description="Tabla del estudio, 2004"'));
  assert.ok(text.includes("plot_style{"));
  assert.ok(text.includes("custom_lineweight_table{"));

  const back = parseCadPlotStyleTable(text, "estudio-2004");
  assert.equal(back.kind, "ctb");
  assert.equal(back.description, "Tabla del estudio, 2004");
  assert.equal(back.scaleFactor, 1.25);
  assert.equal(back.applyScaleFactor, true);
  assert.equal(back.styles.length, 255, "una CTB tiene 255 estilos, siempre");
  assert.deepEqual(back.customLineweights, [0, 0.11, 0.22, 0.33]);

  const first = back.styles[0];
  assert.equal(first.name, "Color_1");
  assert.equal(first.description, "Contornos");
  assert.equal(first.color, "#102030");
  assert.equal(first.convertToGrayscale, true);
  assert.equal(first.enableDither, false);
  assert.equal(first.pen, 3);
  assert.equal(first.virtualPen, 11);
  assert.equal(first.screen, 40);
  assert.equal(first.linetype, "DASHED");
  assert.equal(first.adaptiveLinetype, false);
  assert.equal(first.lineweight, 0.42);
  assert.equal(first.fillStyle, "crosshatch");
  assert.equal(first.lineEndStyle, "round");
  assert.equal(first.lineJoinStyle, "bevel");

  // El segundo estilo sigue siendo «usar el del objeto»: la ida y vuelta no
  // inventó un color donde no lo había.
  assert.equal(back.styles[1].color, null);
  assert.equal(back.styles[1].linetype, null);

  // Y una segunda vuelta da EXACTAMENTE el mismo texto: es lo que hace que un
  // archivo guardado dos veces no ensucie el control de versiones.
  assert.equal(formatCadPlotStyleTable(back), text);
}

// --- ida y vuelta por ARCHIVO, con el contenedor comprimido ------------------
{
  const table = createCadMonochromeTable("estudio");
  const bytes = exportCadPlotStyleTable(table, codec);
  const head = Buffer.from(bytes.subarray(0, CAD_PLOT_TABLE_HEADER.length)).toString("latin1");
  assert.equal(head, CAD_PLOT_TABLE_HEADER, "lleva la cabecera de AutoCAD");
  assert.ok(bytes.length < formatCadPlotStyleTable(table).length, "y va comprimido de verdad");

  const imported = importCadPlotStyleTable(bytes, "estudio", codec);
  assert.equal(imported.compressed, true);
  assert.equal(imported.table.styles.length, 255);
  assert.equal(imported.table.styles[4].lineweight, 0.5, "el color 5 sigue a 0,50 mm");
  assert.equal(imported.table.styles[4].color, "#000000");

  // Sin códec, se exporta e importa el cuerpo en claro — que sigue siendo una
  // ida y vuelta completa dentro del producto.
  const plain = exportCadPlotStyleTable(table);
  const plainBack = importCadPlotStyleTable(plain, "estudio");
  assert.equal(plainBack.compressed, false);
  assert.equal(plainBack.table.styles[4].lineweight, 0.5);

  // Y un archivo comprimido sin códec se niega en voz alta.
  assert.throws(() => importCadPlotStyleTable(bytes, "estudio"), /códec zlib/);

  assert.equal(cadPlotStyleTableFileName(table), "estudio.ctb");
  assert.equal(cadPlotStyleTableFileName(createCadNamedTable("estudio")), "estudio.stb");
}

// --- una tabla truncada se completa en vez de dejar huecos -------------------
{
  const truncated = parseCadPlotStyleTable(
    ['aci_table_available=TRUE', "plot_style{", " 0{", '  name="Color_1"', "  lineweight=0.5", " }", "}"].join("\r\n"),
  );
  assert.equal(truncated.styles.length, 255);
  assert.equal(truncated.styles[0].lineweight, 0.5);
  assert.equal(truncated.styles[254].name, "Color_255");
  // Resolver un ACI alto no revienta.
  assert.equal(resolveCadPlotStyle(truncated, { color: "#333333" }).lineweight, 0);
}

console.log("cad plot style table specs passed");
