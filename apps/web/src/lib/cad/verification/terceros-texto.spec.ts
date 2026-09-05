import DxfParser from "dxf-parser";
import { importDocumentText } from "../document-import";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { cadMTextHasCodes, parseCadMText } from "../mtext-codes";
import {
  abreAjeno,
  cerca,
  censoDe,
  contador,
  eq,
  eqMagnitud,
  ok,
  porTipo,
  publicaRenglon,
} from "./terceros-filas";

/**
 * FILA `mtext` SOBRE TEXTO CON FORMATO AJENO.
 *
 * `bjnortier-dxf/texts.dxf` son dos MTEXT y nada más. Parece poco y es justo lo
 * que hace falta: los dos están escritos con formato DISTINTO a propósito
 * —alturas 20 y 30, anchos 121,67 y 282,5, estilos `iso` y `unicode`, y dos
 * puntos de anclaje que caen en esquinas opuestas de la caja (1 = arriba a la
 * izquierda, 7 = abajo a la izquierda)—, así que un lector que se inventara un
 * valor por defecto fallaría en uno de los dos.
 *
 * ─── QUÉ SE AFIRMA Y QUÉ NO, sobre «texto con formato» ─────────────────────
 *
 * Estos dos MTEXT NO traen códigos de control dentro de la cadena: su formato
 * es el de la entidad (altura, ancho, anclaje, estilo, interlineado). Decir que
 * este fichero acredita el texto enriquecido sería mentir, así que la parte
 * enriquecida se afirma aparte y sobre otro material ajeno: las 129 cadenas
 * de `floorplan.dxf` que sí traen `\A`, `\H` y `\S` (apilado de fracción). Y
 * con su límite escrito: la CADENA es ajena, el intérprete es nuestro. Lo que
 * se demuestra es que el producto entiende lo que otro escribió, no que lo
 * dibuje igual que AutoCAD.
 *
 * ─── EL DEFECTO QUE YA ESTABA MEDIDO, REPRODUCIDO EN DOS ENTIDADES ─────────
 *
 * La jornada sobre el plano grande destapó que `ezdxf` no abre lo que
 * exportamos porque MTEXT sale sin sus marcadores de subclase. Aquí se vuelve a
 * medir sobre un fichero de dos entidades, donde se lee a ojo: lo que
 * escribimos no lleva `100 AcDbEntity` ni `100 AcDbMText` aunque la cabecera
 * declare AC1015, dialecto donde son obligatorios. Es P-evidencia-07 y es la
 * razón de que esta fila NO se pueda conceder hoy.
 */

const AJENO = abreAjeno("texts");
const PLANO = abreAjeno("floorplan");
const ESPEC = "apps/web/src/lib/cad/verification/terceros-texto.spec.ts";

/**
 * TECHO: marcadores de subclase que faltan en lo que exportamos.
 * Sólo puede bajar. Cuando P-evidencia-07 entre, esta lista queda vacía.
 */
const TECHO_MARCADORES_QUE_FALTAN = ["AcDbEntity", "AcDbMText"];

/** Tolerancia de las magnitudes de texto; misma razón que en las otras suites. */
const TOL = 1e-9;

/**
 * El punto de anclaje del MTEXT (código 71), del 1 al 9, con el nombre que le
 * da el documento. No es una tabla nuestra: es la del formato, la misma que
 * publica cualquier lector. Sólo se AFIRMAN los dos que este fichero trae.
 */
const ANCLAJE: Record<number, string> = {
  1: "top-left",
  2: "top-center",
  3: "top-right",
  4: "middle-left",
  5: "middle-center",
  6: "middle-right",
  7: "bottom-left",
  8: "bottom-center",
  9: "bottom-right",
};

interface MTextB {
  texto: string;
  capa: string;
  insercion: number[];
  altura: number;
  ancho: number;
  puntoDeAnclaje: number;
  estilo: string;
  rotacionGrados: number;
  factorDeInterlineado: number;
  estiloDeInterlineado: number;
}
const medidaB = AJENO.b as unknown as { mtext: MTextB[]; estilosDeTexto: string[] };

// --- 1. los tres testigos cuentan lo mismo ---------------------------------
const informe = importDocumentText("texts.dxf", AJENO.texto);
{
  const censo = censoDe(AJENO.id) as { archivoEntero: Record<string, number> };
  eqMagnitud(censo.archivoEntero, { MTEXT: 2 }, "el oráculo B: dos MTEXT y nada más en todo el fichero");
  eq(medidaB.mtext.length, 2, "y sus dos medidas");
  const a = new DxfParser().parseSync(AJENO.texto) as { entities: Array<{ type: string }> } | null;
  eqMagnitud(
    porTipo(a?.entities ?? []),
    { MTEXT: 2 },
    "el oráculo A cuenta los mismos dos (aquí sí ve el tipo; en HATCH es ciego)",
  );
  eq(informe.importedEntityCount, 2, "y el lector trae los dos");
  eqMagnitud(porTipo(informe.document.entities), { mtext: 2 }, "los dos como `mtext`, ninguno degradado a texto simple");
  eq(informe.warnings, [], "sin un aviso");
  const fila = (informe.dxfReport?.rows ?? []).find((fila) => fila.code === "kept_mtext");
  ok(fila?.fidelity === "kept" && fila.count === 2, "y el informe los declara íntegros");
}

// --- 2. propiedad a propiedad, contra el oráculo B -------------------------
const leidos: Array<{ texto: string; altura: number; ancho: number; anclaje: string; estilo: string }> = [];
{
  const entidades = informe.document.entities as unknown as Array<{
    text: string;
    insertion: { x: number; y: number };
    height: number;
    width: number;
    rotation: number;
    alignment: string;
    style: string;
    lineSpacing: number;
    layer?: string;
  }>;
  for (const b of medidaB.mtext) {
    const nuestro = entidades.find((entidad) => entidad.text === b.texto);
    ok(nuestro !== undefined, `el MTEXT «${b.texto}» del remitente no llegó con su texto`);
    contador.magnitudes += 1;
    cerca(nuestro!.insertion.x, b.insercion[0], TOL, `«${b.texto}»: X del punto de inserción`);
    cerca(nuestro!.insertion.y, b.insercion[1], TOL, `«${b.texto}»: Y del punto de inserción`);
    cerca(nuestro!.height, b.altura, TOL, `«${b.texto}»: altura de carácter`);
    cerca(nuestro!.width, b.ancho, TOL, `«${b.texto}»: ancho de la caja`);
    cerca(nuestro!.rotation, b.rotacionGrados, TOL, `«${b.texto}»: rotación`);
    cerca(nuestro!.lineSpacing, b.factorDeInterlineado, TOL, `«${b.texto}»: factor de interlineado`);
    eqMagnitud(nuestro!.alignment, ANCLAJE[b.puntoDeAnclaje], `«${b.texto}»: el anclaje ${b.puntoDeAnclaje} del fichero`);
    eqMagnitud(nuestro!.style, b.estilo, `«${b.texto}»: el estilo de texto del remitente`);
    eqMagnitud(nuestro!.layer, b.capa, `«${b.texto}»: la capa del remitente`);
    leidos.push({
      texto: b.texto,
      altura: b.altura,
      ancho: b.ancho,
      anclaje: ANCLAJE[b.puntoDeAnclaje],
      estilo: b.estilo,
    });
  }
  // Los dos anclajes son ESQUINAS OPUESTAS: si el lector devolviera un valor
  // por defecto acertaría en uno como mucho. Es lo que hace que dos entidades
  // basten para afirmar el mapeo.
  eq(
    new Set(medidaB.mtext.map((b) => b.puntoDeAnclaje)),
    new Set([1, 7]),
    "los dos anclajes del fichero son 1 (arriba-izquierda) y 7 (abajo-izquierda)",
  );
  eq(
    new Set(leidos.map((fila) => fila.anclaje)).size,
    2,
    "y el lector los distingue en vez de dar el mismo a los dos",
  );
  eqMagnitud(medidaB.estilosDeTexto.sort(), ["Standard", "iso", "unicode"], "los tres estilos de texto de la tabla STYLE");
}

// --- 3. el texto ENRIQUECIDO, sobre cadenas ajenas -------------------------
const enriquecido = { cadenasAjenas: 0, conApilado: 0, conCambioDeAltura: 0, tramos: 0 };
{
  // Estas dos entidades no traen códigos de control, y decirlo es la mitad de
  // la afirmación: sin esto, «texto con formato» se estaría cobrando aquí.
  for (const b of medidaB.mtext)
    ok(!cadMTextHasCodes(b.texto), `«${b.texto}» no trae códigos de control: su formato es el de la entidad`);

  // Los que sí los traen están en el plano ajeno. La cadena es de otro; el
  // intérprete es nuestro, y eso va escrito en el renglón.
  const delPlano = importDocumentText("floorplan.dxf", PLANO.texto).document.entities.filter(
    (entidad) => entidad.type === "mtext",
  ) as unknown as Array<{ text: string; height: number }>;
  const conCodigos = delPlano.filter((entidad) => cadMTextHasCodes(entidad.text));
  enriquecido.cadenasAjenas = conCodigos.length;
  ok(conCodigos.length > 0, "el plano ajeno trae cadenas MTEXT con códigos de control");
  for (const entidad of conCodigos) {
    const parrafos = parseCadMText(entidad.text);
    ok(parrafos.length > 0, `la cadena ajena «${entidad.text.slice(0, 24)}…» se resuelve en al menos un párrafo`);
    // Un párrafo ES la lista de tramos (`CadMTextParagraph = readonly CadMTextRun[]`).
    const tramos = parrafos.flat();
    enriquecido.tramos += tramos.length;
    if (/\\S/u.test(entidad.text)) {
      const apilados = tramos.filter((tramo) => tramo.stack !== undefined);
      ok(apilados.length > 0, `«${entidad.text.slice(0, 24)}…» trae \\S y sale con tramo apilado, no con la barra literal`);
      enriquecido.conApilado += 1;
    }
    if (/\\H/u.test(entidad.text)) {
      ok(
        tramos.some((tramo) => tramo.heightScale !== 1),
        `«${entidad.text.slice(0, 24)}…» trae \\H y algún tramo cambia de altura`,
      );
      enriquecido.conCambioDeAltura += 1;
    }
  }
  eq(enriquecido.cadenasAjenas, 129, "129 de los 144 MTEXT del plano ajeno traen códigos de control");
  eq(enriquecido.conApilado, 8, "ocho traen apilado de fracción, y salen apiladas en vez de con la barra literal");
  eq(enriquecido.conCambioDeAltura, 8, "las mismas ocho cambian de altura a mitad de cadena");
  eq(enriquecido.tramos, 147, "las 129 cadenas ajenas se resuelven en 147 tramos con sus atributos");
}

// --- 4. la vuelta, que es donde la fila se queda ---------------------------
const exportado = { tieneEntidad: false, tieneMText: false, dialecto: "", mtextEscritos: 0 };
{
  const salida = exportCadDocumentDxf(informe.document).content;
  exportado.dialecto = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/u.exec(salida)?.[1] ?? "";
  eq(exportado.dialecto, "AC1015", "lo que exportamos declara dialecto AC1015 en su cabecera");
  const bloques = salida.split(/\r?\n/u).map((linea) => linea.trim());
  const inicios: number[] = [];
  for (let i = 0; i + 1 < bloques.length; i += 1)
    if (bloques[i] === "0" && bloques[i + 1] === "MTEXT") inicios.push(i);
  exportado.mtextEscritos = inicios.length;
  eq(exportado.mtextEscritos, 2, "los dos MTEXT vuelven al fichero");
  // Los textos vuelven: el contenido no se pierde.
  for (const b of medidaB.mtext)
    ok(salida.includes(b.texto), `el texto «${b.texto}» está en el fichero que devolvemos`);
  // Los marcadores de subclase, no. AC1015 los exige y no están.
  for (const inicio of inicios) {
    const trozo = bloques.slice(inicio, inicio + 40).join("\n");
    if (/100\nAcDbEntity/u.test(trozo)) exportado.tieneEntidad = true;
    if (/100\nAcDbMText/u.test(trozo)) exportado.tieneMText = true;
  }
  eq(exportado.tieneEntidad, false, "ningún MTEXT exportado lleva `100 AcDbEntity`");
  eq(exportado.tieneMText, false, "ningún MTEXT exportado lleva `100 AcDbMText`");
  eq(
    TECHO_MARCADORES_QUE_FALTAN,
    ["AcDbEntity", "AcDbMText"],
    "el techo de marcadores que faltan sólo puede bajar; con P-evidencia-07 queda vacío",
  );
  // El oráculo A sí lo abre, porque es tolerante. Que lo abra NO acredita nada:
  // es exactamente el motivo de que hiciera falta un segundo oráculo.
  const releido = new DxfParser().parseSync(salida) as { entities: Array<{ type: string; text?: string }> } | null;
  eqMagnitud(
    (releido?.entities ?? []).filter((entidad) => entidad.type === "MTEXT").length,
    2,
    "el oráculo A reencuentra los dos MTEXT en lo que escribimos — y por eso no bastaba",
  );
}

// --- 5. el renglón del artefacto compartido --------------------------------
publicaRenglon({
  fila: "mtext",
  filasDeLaRubrica: ["mtext"],
  spec: ESPEC,
  archivosAjenos: [
    { id: AJENO.id, sha256: AJENO.sha256, bytes: AJENO.bytes, dialecto: AJENO.b.dialecto },
    { id: PLANO.id, sha256: PLANO.sha256, bytes: PLANO.bytes, dialecto: PLANO.b.dialecto },
  ],
  loQueAfirmaLaFila:
    "MTEXT y texto: que un texto con formato ajeno llega con su altura, su ancho, su anclaje y su estilo, y vuelve al fichero en los dos sentidos.",
  loQueDicenLosOraculos: {
    losTresCuentanDos: true,
    mtext: medidaB.mtext.map((b) => ({
      texto: b.texto,
      insercion: b.insercion,
      altura: b.altura,
      ancho: b.ancho,
      anclaje: b.puntoDeAnclaje,
      estilo: b.estilo,
    })),
    estilosDeTexto: medidaB.estilosDeTexto,
    cadenasConCodigosDeControlEnElPlanoAjeno: enriquecido.cadenasAjenas,
  },
  loQueHaceElLector: {
    ida: leidos,
    anclajesDistinguidos: ["top-left", "bottom-left"],
    textoEnriquecido: {
      cadenasAjenasResueltas: enriquecido.cadenasAjenas,
      conApilado: enriquecido.conApilado,
      conCambioDeAltura: enriquecido.conCambioDeAltura,
      tramosResueltos: enriquecido.tramos,
      limite: "la CADENA es ajena; el intérprete (mtext-codes.ts) es nuestro. Esto acredita que entendemos lo que otro escribió, no que lo dibujemos como AutoCAD.",
    },
    vuelta: {
      dialectoDeclarado: exportado.dialecto,
      mtextEscritos: exportado.mtextEscritos,
      textoConservado: true,
      marcadorAcDbEntity: exportado.tieneEntidad,
      marcadorAcDbMText: exportado.tieneMText,
    },
  },
  hallazgos: [
    {
      id: "mtext-exportado-sin-marcadores-de-subclase",
      que:
        "Lo que exportamos declara AC1015 y escribe los MTEXT sin `100 AcDbEntity` ni `100 AcDbMText`, obligatorios en ese dialecto. El oráculo A lo abre porque es tolerante; el oráculo B lo rechaza («missing 'AcDbMText' subclass»). Aquí se reproduce sobre dos entidades el mismo defecto que la jornada midió sobre 1101.",
      silencioso: false,
      peticion: "P-evidencia-07",
    },
    {
      id: "lo-que-si-viaja",
      que:
        "La ida está bien y medida entera: texto, punto de inserción, altura, ancho, rotación, interlineado, anclaje y estilo de los dos MTEXT, con los dos anclajes en esquinas opuestas para que un valor por defecto no pudiera colar. Y el intérprete resuelve las 129 cadenas con códigos del plano ajeno en 147 tramos, ocho de ellas con apilado de fracción y cambio de altura a mitad de cadena.",
      silencioso: false,
      peticion: null,
    },
  ],
  veredicto: "bloqueado_por_defecto_medido",
  porQueEseVeredicto:
    "El criterio de esta fila dice «en los dos sentidos», y hoy un lector estricto ajeno sólo puede recorrer uno. Marcarla independiente sería cobrar «viaja en los dos sentidos» con un programa que no es nuestro diciendo que no vuelve. Sale de aquí con P-evidencia-07.",
  loQueNoSeMide:
    "Las columnas, la máscara de fondo, el color por tramo y las fuentes SHX de trazo: ninguna de las dos entidades de texts.dxf las trae. El plano ajeno sí trae sustitución de fuente (`\\F archquik.shx` → Arial) y esa sustitución no se afirma aquí. Tampoco se mide el dibujo: que el apilado se ENTIENDA no dice que se pinte como AutoCAD lo pinta.",
});

console.log(
  `texto ajeno: ${contador.comprobaciones} comprobaciones · ${contador.magnitudes} datos del dibujo ` +
    "contrastados contra ezdxf 1.4.4 y dxf-parser sobre texto que no escribimos",
);
console.log(
  "  · TODAVÍA NO (2026-09-05): la ida está medida entera y la VUELTA no la abre un lector estricto — " +
    "MTEXT sale sin `100 AcDbEntity` ni `100 AcDbMText` con la cabecera declarando AC1015. P-evidencia-07.",
);
