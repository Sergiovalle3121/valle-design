/**
 * Corpus SINTÉTICO de PDF: los archivos contra los que se mide el importador.
 *
 * ## Qué es y qué NO es
 *
 * Cada archivo de aquí está construido byte a byte por este módulo para imitar
 * una forma de PDF que un despacho recibe de verdad: el vectorial que sale de un
 * CAD, el que trae el texto en curvas, el escaneado, el que lleva capas
 * opcionales, el de varias páginas, el comprimido, el del `MediaBox` desplazado,
 * el girado, y el moderno que esconde sus páginas dentro de un objeto
 * comprimido.
 *
 * **Imitar una forma NO es haberla recibido.** Este corpus no acredita cobertura
 * del mundo real y la matriz que genera lo dice dentro, con una spec que falla
 * si esa declaración desaparece. Es exactamente la misma honestidad que ya
 * gobierna el corpus de DXF ajeno, y por la misma razón: una tabla de
 * compatibilidad que se cita como si fueran archivos reales acaba prometiendo
 * cosas que nadie ha comprobado.
 *
 * ## Por qué se escriben PDF de verdad y no maquetas
 *
 * Los archivos llevan su tabla de referencias cruzadas correcta —clásica o como
 * flujo, según el caso— y los abre cualquier visor. Un corpus de maquetas que
 * sólo entiende nuestro lector probaría que nuestro lector entiende nuestras
 * maquetas, que no es lo que hace falta saber.
 */
import { cadPdfZlibStored } from "./pdf-inflate";

/** Qué tipo de contenido declara traer un archivo del corpus. */
export type CadPdfContentType =
  | "PATH_LINE"
  | "PATH_CURVE"
  | "PATH_RECT"
  | "PATH_FILL"
  | "TEXT"
  | "TEXT_AS_CURVES"
  | "TEXT_GLYPH_INDICES"
  | "TEXT_INVISIBLE"
  | "IMAGE"
  | "FORM_XOBJECT"
  | "OCG_LAYER_ON"
  | "OCG_LAYER_OFF"
  | "SHADING";

export interface CadPdfCorpusFile {
  id: string;
  /** Cómo es el archivo, en una frase. Sale tal cual en la matriz. */
  shape: string;
  /** Por qué existe: qué suposición del lector pone a prueba. */
  purpose: string;
  bytes: Uint8Array;
  /** Cuántos ejemplares de cada cosa lleva DENTRO, contados al escribirlo. */
  declares: Partial<Record<CadPdfContentType, number>>;
  pages: number;
  /** Página que la matriz mide. Por defecto la 1. */
  measurePage?: number;
}

// ---------------------------------------------------------------------------
// Escritor de PDF
// ---------------------------------------------------------------------------

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);

interface PdfObject {
  num: number;
  /** Cuerpo del objeto ya serializado (diccionario, array, número…). */
  body: string;
  /** Datos del flujo, si el objeto es un flujo. */
  stream?: Uint8Array;
  /** Si va DENTRO de un objeto comprimido. Los flujos no pueden. */
  packed?: boolean;
}

class PdfFile {
  private readonly objects: PdfObject[] = [];
  private next = 1;

  /** Reserva un número de objeto sin escribirlo todavía. */
  reserve(): number {
    const num = this.next;
    this.next += 1;
    return num;
  }

  add(body: string, stream?: Uint8Array, num = this.reserve(), packed = false): number {
    this.objects.push({ num, body, stream, packed });
    return num;
  }

  /** Flujo con `/Length` correcto y, si se pide, comprimido de verdad. */
  addStream(dictBody: string, data: Uint8Array, compress: boolean, num?: number): number {
    const payload = compress ? cadPdfZlibStored(data) : data;
    const filter = compress ? " /Filter /FlateDecode" : "";
    const dict = `<< ${dictBody}${filter} /Length ${payload.length} >>`;
    return this.add(dict, payload, num ?? this.reserve());
  }

  /**
   * Serializa el archivo.
   *
   * `objectStreams` mete los objetos marcados dentro de un `/Type /ObjStm` y
   * escribe la tabla como FLUJO de referencias cruzadas, que es lo que exige la
   * especificación en ese caso y lo que emite cualquier escritor desde PDF 1.5.
   * Con la tabla clásica el archivo sería inválido y el corpus estaría probando
   * un archivo que nadie produce.
   */
  build(root: number, options: { version?: string; objectStreams?: boolean } = {}): Uint8Array {
    const version = options.version ?? "1.7";
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const push = (data: Uint8Array | string) => {
      const bytes = typeof data === "string" ? ascii(data) : data;
      chunks.push(bytes);
      offset += bytes.length;
    };

    push(`%PDF-${version}\n`);
    // Cuatro bytes altos: la marca que le dice a cualquier herramienta que el
    // archivo es binario y no debe pasar por una conversión de fin de línea.
    push(Uint8Array.of(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));

    const offsets = new Map<number, number>();
    const packedIndex = new Map<number, number>();
    const loose = this.objects.filter((object) => !object.packed || object.stream);
    const packed = this.objects.filter((object) => object.packed && !object.stream);

    const writeObject = (object: PdfObject) => {
      offsets.set(object.num, offset);
      push(`${object.num} 0 obj\n${object.body}\n`);
      if (object.stream) {
        push("stream\n");
        push(object.stream);
        push("\nendstream\n");
      }
      push("endobj\n");
    };

    for (const object of loose) writeObject(object);

    let objStmNum = 0;
    if (options.objectStreams && packed.length) {
      const bodies = packed.map((object) => `${object.body} `);
      let cursor = 0;
      const header = packed
        .map((object, index) => {
          const entry = `${object.num} ${cursor}`;
          cursor += bodies[index].length;
          return entry;
        })
        .join(" ");
      const headerText = `${header}\n`;
      const payload = ascii(headerText + bodies.join(""));
      objStmNum = this.reserve();
      packed.forEach((object, index) => packedIndex.set(object.num, index));
      const compressed = cadPdfZlibStored(payload);
      offsets.set(objStmNum, offset);
      push(
        `${objStmNum} 0 obj\n<< /Type /ObjStm /N ${packed.length} /First ${headerText.length} ` +
          `/Filter /FlateDecode /Length ${compressed.length} >>\n`,
      );
      push("stream\n");
      push(compressed);
      push("\nendstream\nendobj\n");
    } else {
      for (const object of packed) writeObject(object);
    }

    const size = this.next;
    const startxref = offset;

    if (options.objectStreams && objStmNum) {
      // Flujo de referencias cruzadas: tres campos por entrada —tipo, valor,
      // valor— con anchos `/W [1 4 2]`. Se emite SIN filtro para que el archivo
      // se pueda leer con un editor y el corpus sea auditable.
      const entries: number[] = [];
      const write = (type: number, big: number, small: number) => {
        entries.push(type, (big >>> 24) & 0xff, (big >>> 16) & 0xff, (big >>> 8) & 0xff, big & 0xff, (small >>> 8) & 0xff, small & 0xff);
      };
      const xrefNum = this.reserve();
      write(0, 0, 65535);
      for (let num = 1; num < size + 1; num += 1) {
        if (num === xrefNum) {
          write(1, startxref, 0);
          continue;
        }
        const packedAt = packedIndex.get(num);
        if (packedAt !== undefined) write(2, objStmNum, packedAt);
        else if (offsets.has(num)) write(1, offsets.get(num)!, 0);
        else write(0, 0, 0);
      }
      const data = Uint8Array.from(entries);
      push(
        `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size + 1} /W [1 4 2] /Root ${root} 0 R ` +
          `/Length ${data.length} >>\n`,
      );
      push("stream\n");
      push(data);
      push("\nendstream\nendobj\n");
      push(`startxref\n${startxref}\n%%EOF\n`);
    } else {
      const lines = ["xref", `0 ${size}`, "0000000000 65535 f "];
      for (let num = 1; num < size; num += 1)
        lines.push(`${String(offsets.get(num) ?? 0).padStart(10, "0")} 00000 n `);
      push(`${lines.join("\n")}\ntrailer\n<< /Size ${size} /Root ${root} 0 R >>\n`);
      push(`startxref\n${startxref}\n%%EOF\n`);
    }

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Piezas de contenido
// ---------------------------------------------------------------------------

/** Un plano sencillo: cuatro muros, un rectángulo y una curva. */
const CAD_CONTENT =
  "q 1 w 0 0 0 RG\n" +
  "72 72 m 288 72 l S\n" +
  "288 72 m 288 216 l S\n" +
  "288 216 m 72 216 l S\n" +
  "72 216 m 72 72 l S\n" +
  "108 108 72 36 re S\n" +
  "180 180 m 216 252 252 252 288 180 c S\n" +
  "0.5 w 0 0 1 RG 72 144 m 288 144 l S\n" +
  "Q\n";

const TEXT_CONTENT =
  "BT /F1 12 Tf 90 240 Td (PLANTA BAJA) Tj ET\n" +
  "BT /F1 8 Tf 90 228 Td (Escala 1:50 \\226 nivel \\261 0.00) Tj ET\n";

/** El mismo rótulo, pero DIBUJADO: es lo que hace «convertir texto a curvas». */
const TEXT_AS_CURVES_CONTENT =
  "q 0 0 0 rg\n" +
  "90 240 m 90 252 l 96 252 l 96 246 l 90 246 l f\n" +
  "100 240 m 100 252 l 106 252 106 246 100 246 c f\n" +
  "110 240 m 110 252 l 116 240 l f\n" +
  "Q\n";

const FONT_BODY =
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

/** `/ToUnicode` mínimo pero real, para el caso de la fuente incrustada. */
const TO_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<00> <FF>
endcodespacerange
2 beginbfrange
<41> <5A> <0041>
<61> <7A> <0061>
endbfrange
1 beginbfchar
<20> <0020>
endbfchar
endcmap
end
end
`;

function catalogAndPages(
  file: PdfFile,
  pageBodies: (pagesNum: number) => string[],
  options: { packed?: boolean; ocProperties?: string } = {},
): number {
  const catalogNum = file.reserve();
  const pagesNum = file.reserve();
  const bodies = pageBodies(pagesNum);
  const pageNums = bodies.map((body) => file.add(body, undefined, file.reserve(), options.packed));
  file.add(
    `<< /Type /Pages /Kids [${pageNums.map((num) => `${num} 0 R`).join(" ")}] /Count ${pageNums.length} >>`,
    undefined,
    pagesNum,
    options.packed,
  );
  file.add(
    `<< /Type /Catalog /Pages ${pagesNum} 0 R${options.ocProperties ?? ""} >>`,
    undefined,
    catalogNum,
    options.packed,
  );
  return catalogNum;
}

// ---------------------------------------------------------------------------
// Los archivos
// ---------------------------------------------------------------------------

function vectorCad(compress: boolean): Uint8Array {
  const file = new PdfFile();
  const content = file.addStream("", ascii(CAD_CONTENT + TEXT_CONTENT), compress);
  const font = file.add(FONT_BODY);
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

function textAsCurves(): Uint8Array {
  const file = new PdfFile();
  const content = file.addStream("", ascii(CAD_CONTENT + TEXT_AS_CURVES_CONTENT), true);
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/**
 * Un escaneo: una imagen que ocupa la página entera y NADA más.
 *
 * La imagen va con `/DCTDecode` porque es lo que produce un escáner. No se
 * incrusta un JPEG de verdad —bastan unos bytes— porque lo que se prueba es que
 * el importador RECONOZCA que ahí no hay geometría, no que sepa decodificar
 * JPEG, que es justamente lo que no va a hacer nunca.
 */
function scanned(withOcr: boolean): Uint8Array {
  const file = new PdfFile();
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const image = file.add(
    `<< /Type /XObject /Subtype /Image /Width 2480 /Height 3508 /ColorSpace /DeviceGray ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
    jpeg,
  );
  const ocr = withOcr
    ? "BT 3 Tr /F1 9 Tf 100 700 Td (PLANO LEVANTAMIENTO 1980) Tj ET\n"
    : "";
  const content = file.addStream(
    "",
    ascii(`q 612 0 0 792 0 0 cm /Im0 Do Q\n${ocr}`),
    true,
  );
  const font = withOcr ? file.add(FONT_BODY) : 0;
  const resources =
    `<< /XObject << /Im0 ${image} 0 R >>` +
    (withOcr ? ` /Font << /F1 ${font} 0 R >>` : "") +
    " >>";
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/** Capas opcionales: una encendida y otra APAGADA en la configuración. */
function optionalLayers(): Uint8Array {
  const file = new PdfFile();
  const muros = file.add("<< /Type /OCG /Name (Muros) >>");
  const cotas = file.add("<< /Type /OCG /Name (Cotas) >>");
  const content = file.addStream(
    "",
    ascii(
      "/OC /L0 BDC q 1 w 72 72 m 288 72 l S 288 72 m 288 216 l S Q EMC\n" +
        "/OC /L1 BDC q 0.3 w 72 60 m 288 60 l S Q EMC\n",
    ),
    true,
  );
  const root = catalogAndPages(
    file,
    (pages) => [
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Properties << /L0 ${muros} 0 R /L1 ${cotas} 0 R >> >> /Contents ${content} 0 R >>`,
    ],
    {
      ocProperties:
        ` /OCProperties << /OCGs [${muros} 0 R ${cotas} 0 R] /D << /OFF [${cotas} 0 R] >> >>`,
    },
  );
  return file.build(root);
}

function multipage(): Uint8Array {
  const file = new PdfFile();
  const first = file.addStream("", ascii(CAD_CONTENT), true);
  const second = file.addStream("", ascii("q 2 w 100 100 m 500 700 l S Q\n"), true);
  const third = file.addStream("", ascii("q 1 w 200 200 200 300 re S Q\n"), true);
  const root = catalogAndPages(file, (pages) =>
    [first, second, third].map(
      (content) =>
        `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents ${content} 0 R >>`,
    ),
  );
  return file.build(root);
}

/** `MediaBox` que NO empieza en el origen: el recorte de una lámina grande. */
function shiftedMediaBox(): Uint8Array {
  const file = new PdfFile();
  // Las mismas coordenadas del plano base, DESPLAZADAS al cuadro del MediaBox.
  const shifted = CAD_CONTENT.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) ([mlc])/g, (_all, x: string, y: string, op: string) =>
    `${Number(x) + 850} ${Number(y) + 400} ${op}`,
  ).replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) re/g, (_all, x: string, y: string, w: string, h: string) =>
    `${Number(x) + 850} ${Number(y) + 400} ${w} ${h} re`,
  );
  const content = file.addStream("", ascii(shifted), true);
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [850 400 1400 800] /Resources << >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

function rotated90(): Uint8Array {
  const file = new PdfFile();
  const content = file.addStream("", ascii(CAD_CONTENT), true);
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/** PDF 1.5: las páginas viven DENTRO de un objeto comprimido. */
function objectStreams(): Uint8Array {
  const file = new PdfFile();
  const content = file.addStream("", ascii(CAD_CONTENT), true);
  const root = catalogAndPages(
    file,
    (pages) => [
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents ${content} 0 R >>`,
    ],
    { packed: true },
  );
  return file.build(root, { version: "1.5", objectStreams: true });
}

/**
 * Fuente incrustada SIN `/ToUnicode`: los bytes son índices de glifo.
 *
 * Es el caso que `pdf-measure.ts` ya declaraba imposible y que aquí tiene que
 * salir como pérdida DECLARADA, no como texto inventado.
 */
function glyphIndices(): Uint8Array {
  const file = new PdfFile();
  // El programa de fuente no es una fuente de verdad: lo que importa es que el
  // descriptor lleve `/FontFile2`, porque eso es lo que convierte al rótulo en
  // índices de glifo irrecuperables. Incrustar una TrueType real no cambiaría
  // el resultado y añadiría cien kilobytes al corpus.
  const program = Uint8Array.from({ length: 64 }, (_value, index) => index & 0xff);
  const fontFile = file.addStream(`/Length1 ${program.length}`, program, false);
  const descriptor = file.add(
    `<< /Type /FontDescriptor /FontName /ABCDEF+PlanoCAD /Flags 4 /FontBBox [0 0 1000 1000] ` +
      `/ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 ${fontFile} 0 R >>`,
  );
  const descendant = file.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+PlanoCAD ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptor} 0 R /DW 1000 >>`,
  );
  const font = file.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+PlanoCAD /Encoding /Identity-H ` +
      `/DescendantFonts [${descendant} 0 R] >>`,
  );
  const content = file.addStream(
    "",
    ascii(`${CAD_CONTENT}BT /F1 12 Tf 90 240 Td <00030004000500060007> Tj ET\n`),
    true,
  );
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/** Fuente incrustada CON `/ToUnicode`: el texto sí se recupera. */
function embeddedTextWithToUnicode(): Uint8Array {
  const file = new PdfFile();
  const toUnicode = file.addStream("", ascii(TO_UNICODE), true);
  const font = file.add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+Arquitecto /FirstChar 32 /LastChar 122 ` +
      `/ToUnicode ${toUnicode} 0 R >>`,
  );
  const content = file.addStream(
    "",
    ascii(`${CAD_CONTENT}BT /F1 14 Tf 90 240 Td (CORTE A A) Tj ET\n`),
    true,
  );
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/** Un bloque reutilizado: XObject de formulario insertado dos veces. */
function formXObjects(): Uint8Array {
  const file = new PdfFile();
  const symbol = ascii("q 0.5 w 0 0 m 20 0 l S 0 0 m 0 20 l S 0 0 20 20 re S Q\n");
  const form = file.addStream(
    `/Type /XObject /Subtype /Form /BBox [0 0 20 20] /Resources << >>`,
    symbol,
    true,
  );
  const content = file.addStream(
    "",
    ascii(
      `${CAD_CONTENT}q 1 0 0 1 100 300 cm /Fm0 Do Q\nq 2 0 0 2 200 300 cm /Fm0 Do Q\n`,
    ),
    true,
  );
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /XObject << /Fm0 ${form} 0 R >> >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/** Un degradado y un relleno macizo: lo que se degrada y lo que se pierde. */
function shadingAndFills(): Uint8Array {
  const file = new PdfFile();
  const shading = file.add(
    "<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 200 200] " +
      "/Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >>",
  );
  const content = file.addStream(
    "",
    ascii(
      `${CAD_CONTENT}q 0.8 0.8 0.8 rg 300 300 120 80 re f Q\nq 100 500 200 200 re W n /Sh0 sh Q\n`,
    ),
    true,
  );
  const root = catalogAndPages(file, (pages) => [
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Shading << /Sh0 ${shading} 0 R >> >> /Contents ${content} 0 R >>`,
  ]);
  return file.build(root);
}

/**
 * El corpus completo.
 *
 * Se construye una sola vez por proceso: escribir catorce PDF en cada llamada
 * haría que la spec del corpus tardase más en generar los archivos que en
 * medirlos.
 */
let corpus: CadPdfCorpusFile[] | null = null;

export function cadPdfCorpus(): readonly CadPdfCorpusFile[] {
  if (corpus) return corpus;
  corpus = [
    {
      id: "cad-vector-uncompressed",
      shape: "PDF vectorial de CAD, flujo SIN comprimir",
      purpose:
        "El caso base y el único que un lector de expresiones regulares podría leer. Sirve de referencia: si algo falla aquí, no es cuestión de compresión ni de estructura.",
      bytes: vectorCad(false),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, TEXT: 2 },
      pages: 1,
    },
    {
      id: "cad-vector-compressed",
      shape: "PDF vectorial de CAD, flujo con `/FlateDecode`",
      purpose:
        "Lo que emite cualquier exportador de verdad. Sin descomprimir no hay nada que leer, y es donde el escalímetro del trazado se paraba a propósito.",
      bytes: vectorCad(true),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, TEXT: 2 },
      pages: 1,
    },
    {
      id: "text-embedded-tounicode",
      shape: "Texto con fuente incrustada y tabla `/ToUnicode`",
      purpose:
        "La fuente viaja subconjuntada y el PDF trae la tabla para recuperar los caracteres. Es el PDF de CAD moderno bien hecho.",
      bytes: embeddedTextWithToUnicode(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, TEXT: 1 },
      pages: 1,
    },
    {
      id: "text-glyph-indices",
      shape: "Texto con fuente incrustada SIN `/ToUnicode`",
      purpose:
        "Los bytes son índices de glifo y no hay tabla que los traduzca. Tiene que salir como pérdida DECLARADA, jamás como texto adivinado.",
      bytes: glyphIndices(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, TEXT_GLYPH_INDICES: 1 },
      pages: 1,
    },
    {
      id: "text-as-curves",
      shape: "Texto convertido a CURVAS al exportar",
      purpose:
        "Media industria exporta así para que no haga falta la fuente. El texto deja de ser texto: son trazos, y ningún lector puede devolverlo a MTEXT sin inventarlo.",
      bytes: textAsCurves(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, TEXT_AS_CURVES: 3 },
      pages: 1,
    },
    {
      id: "scanned-image-only",
      shape: "PDF escaneado: una sola imagen a página completa",
      purpose:
        "El plano de 1980 que alguien pasó por el escáner. No tiene geometría y el importador tiene que DECIRLO, no devolver un documento vacío.",
      bytes: scanned(false),
      declares: { IMAGE: 1 },
      pages: 1,
    },
    {
      id: "scanned-with-ocr-layer",
      shape: "PDF escaneado con capa de texto invisible de OCR",
      purpose:
        "El mismo escaneo pasado por un OCR. El texto invisible NO es contenido: si contase, los escaneos mejor procesados dejarían de detectarse como escaneos.",
      bytes: scanned(true),
      declares: { IMAGE: 1, TEXT_INVISIBLE: 1 },
      pages: 1,
    },
    {
      id: "optional-content-groups",
      shape: "Capas opcionales (OCG), una encendida y otra apagada",
      purpose:
        "Las capas del CAD de origen sobreviven al PDF. Importar la que el remitente había apagado añade al plano líneas que él no ve.",
      bytes: optionalLayers(),
      declares: { OCG_LAYER_ON: 1, OCG_LAYER_OFF: 1, PATH_LINE: 3 },
      pages: 1,
    },
    {
      id: "multipage-three",
      shape: "Tres páginas con contenido distinto",
      purpose:
        "Una serie de láminas en un solo archivo. Elegir página tiene que devolver ESA página, no la primera ni la suma de todas.",
      bytes: multipage(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1 },
      pages: 3,
    },
    {
      id: "shifted-mediabox",
      shape: "`MediaBox` desplazado: `[850 400 1400 800]`",
      purpose:
        "El recorte de una lámina grande. Un lector que no reste el origen deja todo el plano fuera del papel, y el dibujo sigue pareciendo correcto.",
      bytes: shiftedMediaBox(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1 },
      pages: 1,
    },
    {
      id: "rotated-90",
      shape: "Página con `/Rotate 90`",
      purpose:
        "Un plano apaisado guardado como vertical girado. Sin aplicar el giro, lo que se calque encima sale girado noventa grados y nadie lo nota hasta la obra.",
      bytes: rotated90(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1 },
      pages: 1,
    },
    {
      id: "object-streams-1-5",
      shape: "PDF 1.5 con las páginas dentro de un `/Type /ObjStm`",
      purpose:
        "Lo que emite cualquier escritor desde 2003. Un lector que sólo barra `obj` NO ENCUENTRA LAS PÁGINAS y concluiría que el PDF no tiene ninguna.",
      bytes: objectStreams(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1 },
      pages: 1,
    },
    {
      id: "form-xobjects",
      shape: "Bloques reutilizados como XObject de formulario",
      purpose:
        "Un bloque del CAD de origen sale como un XObject insertado varias veces con su matriz. Sin seguirlos, un plano lleno de puertas entra vacío.",
      bytes: formXObjects(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, FORM_XOBJECT: 2 },
      pages: 1,
    },
    {
      id: "shading-and-fills",
      shape: "Degradado (`sh`) y relleno macizo",
      purpose:
        "Lo que no tiene equivalente en el dibujo. El relleno entra como contorno y el degradado no entra: las dos cosas se declaran por separado.",
      bytes: shadingAndFills(),
      declares: { PATH_LINE: 5, PATH_RECT: 1, PATH_CURVE: 1, PATH_FILL: 1, SHADING: 1 },
      pages: 1,
    },
  ];
  return corpus;
}
