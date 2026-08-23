/**
 * Fidelidad de trazado: la escala se mide y las fuentes se declaran.
 *
 * ## Las dos reglas que este archivo defiende
 *
 * **Una.** Que 1:50 mida 1:50 con el escalímetro sobre el papel. No «que la
 * función de escala devuelva 0,02»: que el segmento escrito en el PDF mida los
 * milímetros que tiene que medir. Todo lo que se afirma aquí se lee del
 * archivo emitido.
 *
 * **Dos, y es la que impide que esto envejezca en silencio.** Ninguna fuente
 * puede sustituirse sin quedar declarada. La comprobación va en los dos
 * sentidos, y el segundo es el que importa:
 *
 * - toda familia que el dibujo pide o viaja con su nombre en el PDF, o el
 *   informe dice por cuál se cambió;
 * - y **todo `/BaseFont` que aparezca en el PDF tiene que estar explicado por
 *   el informe**. Sin esta segunda mitad, un emisor puede colar una tipografía
 *   que nadie pidió y el informe seguiría diciendo la verdad sobre las otras.
 *
 * No es hipotético: esta segunda regla cazó un `Times-Bold` que se colaba en
 * todos los cajetines trazados con una fuente incrustada sin corte negrita.
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  CAD_TEXT_HEIGHT_CLAMP_MM,
  measureCadPlotCharacterSet,
  measureCadPlotFidelity,
  type CadPlotFidelityReport,
} from "./plot-fidelity";
import type { CadPlotFontProgram } from "./plot-pdf";

/** Tolerancia del escalímetro, en milímetros de papel. */
const SCALE_TOLERANCE_MM = 1e-3;

/**
 * Fuente de prueba para el camino de INCRUSTACIÓN.
 *
 * Se toma de `three`, que es dependencia declarada de este paquete y por tanto
 * está tras `npm ci`. Si algún día no está, este spec FALLA en vez de saltarse
 * la comprobación: el camino de incrustación sin probar es exactamente el que
 * produce planos que el municipio rechaza.
 */
/** Familia bajo la que se registra la fuente incrustada de prueba. */
const EMBEDDED_FAMILY = "JetBrainsMono";

function embeddableFont(): CadPlotFontProgram {
  // three 0.185 dejó de traer la fuente de ejemplo; se usa la TTF
  // AUTOHOSPEDADA del producto (OFL), que está en el repositorio.
  const candidates = [
    path.resolve(process.cwd(), "src/fonts/JetBrainsMono-wght.ttf"),
    path.resolve(process.cwd(), "apps/web/src/fonts/JetBrainsMono-wght.ttf"),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(
    file,
    `No se encontró ninguna fuente TTF para probar la incrustación. Buscado en:\n${candidates.join("\n")}`,
  );
  return {
    family: EMBEDDED_FAMILY,
    style: "normal",
    fileName: "JetBrainsMono-wght.ttf",
    base64: fs.readFileSync(file).toString("base64"),
  };
}

/** Raíz del nombre de una fuente del PDF: `ABCDEF+Arial-BoldMT` → `arial`. */
function fontStem(baseFont: string): string {
  return baseFont
    .replace(/^[A-Z]{6}\+/, "")
    .split("-")[0]
    .toLowerCase();
}

/**
 * LA REGLA: ninguna sustitución sin declarar, en los dos sentidos.
 *
 * Se aplica a cada trazado que hace este spec, no a un caso elegido. Es la
 * pieza que hace que el artefacto de evidencia no pueda envejecer en silencio:
 * el día que alguien cambie el emisor y una familia empiece a salir por otra,
 * este bloque falla nombrando la fuente.
 */
function assertFontsDeclared(report: CadPlotFidelityReport, label: string): void {
  for (const font of report.fonts.declared) {
    const travelsWithItsName = report.fonts.inPdf.some(
      (entry) => fontStem(entry.baseFont) === font.family.trim().toLowerCase(),
    );
    if (travelsWithItsName) {
      assert.notEqual(
        font.disposition,
        "substituted",
        `${label}: ${font.family} viaja con su nombre en el PDF pero el informe la da por sustituida`,
      );
      continue;
    }
    assert.equal(
      font.disposition,
      "substituted",
      `${label}: ${font.family} no aparece en el PDF y el informe NO la declara sustituida`,
    );
    const substitutedBy = font.substitutedBy;
    assert.ok(
      substitutedBy,
      `${label}: ${font.family} se declara sustituida sin decir por cuál`,
    );
    assert.ok(
      report.warnings.some(
        (warning) => warning.includes(font.family) && warning.includes(substitutedBy),
      ),
      `${label}: la sustitución ${font.family} → ${substitutedBy} no produjo aviso. Una sustitución que nadie ve es una sustitución silenciosa.`,
    );
  }

  // La otra mitad: nada en el PDF que el informe no explique.
  const accounted = new Set(
    report.fonts.declared.flatMap((font) => [
      font.family.trim().toLowerCase(),
      fontStem(font.baseFont),
    ]),
  );
  for (const entry of report.fonts.inPdf)
    assert.ok(
      accounted.has(fontStem(entry.baseFont)),
      `${label}: el PDF lleva la fuente ${entry.baseFont}, que el informe de fuentes no menciona. ` +
        `Declaradas: ${[...accounted].join(", ")}.`,
    );
}

const BASE = {
  wallLengthUnits: 10_000,
  wallHeightUnits: 6_000,
  textHeightUnits: 125,
  fontFamily: "Arial",
  unit: "mm",
} as const;

async function specs(): Promise<void> {
  const measured: Array<{ label: string; report: CadPlotFidelityReport }> = [];

  // --- C4: EL ESCALÍMETRO SOBRE EL PAPEL --------------------------------------
  const cases = [
    { label: "A1 apaisado 1:50", paper: "A1" as const, orientation: "landscape" as const, scaleDenominator: 50, ...BASE },
    {
      label: "A3 apaisado 1:100",
      paper: "A3" as const,
      orientation: "landscape" as const,
      scaleDenominator: 100,
      ...BASE,
      wallLengthUnits: 30_000,
      wallHeightUnits: 18_000,
      textHeightUnits: 250,
    },
    {
      label: "A4 vertical 1:20",
      paper: "A4" as const,
      orientation: "portrait" as const,
      scaleDenominator: 20,
      ...BASE,
      wallLengthUnits: 3_000,
      wallHeightUnits: 2_000,
      textHeightUnits: 50,
    },
    {
      label: "A2 apaisado 1:50, dibujo en METROS",
      paper: "A2" as const,
      orientation: "landscape" as const,
      scaleDenominator: 50,
      ...BASE,
      unit: "m",
      wallLengthUnits: 10,
      wallHeightUnits: 6,
      textHeightUnits: 0.125,
    },
  ];

  for (const { label, ...input } of cases) {
    const report = await measureCadPlotFidelity(input);
    measured.push({ label, report });

    assert.ok(
      Math.abs(report.horizontal.errorMm) <= SCALE_TOLERANCE_MM,
      `${label}: el muro debía medir ${report.horizontal.expectedMm} mm y mide ${report.horizontal.measuredMm} mm (error ${report.horizontal.errorMm} mm)`,
    );
    assert.ok(
      Math.abs(report.vertical.errorMm) <= SCALE_TOLERANCE_MM,
      `${label}: el muro vertical erró ${report.vertical.errorMm} mm`,
    );
    assert.ok(
      report.page.errorMm <= SCALE_TOLERANCE_MM,
      `${label}: el papel del PDF mide ${JSON.stringify(report.page.measuredMm)} y debía medir ${JSON.stringify(report.page.expectedMm)}`,
    );

    // Lo que se ve ES lo que se imprime: cada trazo de la vista previa, en el PDF.
    assert.ok(report.geometry.comparedSegments > 0, `${label}: no había geometría que comparar`);
    assert.equal(report.geometry.matchedSegments, report.geometry.comparedSegments);
    assert.ok(
      report.geometry.maxDeviationMm <= SCALE_TOLERANCE_MM,
      `${label}: la vista previa y el PDF se separan hasta ${report.geometry.maxDeviationMm} mm`,
    );

    assert.equal(
      report.segmentsOutsidePage,
      0,
      `${label}: ${report.segmentsOutsidePage} trazo(s) se dibujan fuera del papel y no se imprimen`,
    );
    assert.deepEqual(report.unreadable, [], `${label}: la medida quedó incompleta`);
    assertFontsDeclared(report, label);
  }

  // --- C3: LA ALTURA DE ROTULO SE RECORTA, Y SE DICE ---------------------------
  {
    // 300 unidades a 1:20 pedirían 15 mm de rótulo; el plan de publicación
    // recorta a 12. Es una desviación REAL entre lo pedido y lo impreso, y se
    // afirma para que quede escrita en vez de descubrirse en papel.
    const grande = await measureCadPlotFidelity({
      paper: "A4",
      orientation: "portrait",
      scaleDenominator: 20,
      ...BASE,
      wallLengthUnits: 3_000,
      wallHeightUnits: 2_000,
      textHeightUnits: 300,
    });
    assert.equal(grande.text.clamped, true, "15 mm de rótulo se recortan y el informe lo dice");
    assert.equal(grande.text.unclampedExpectedMm, 15);
    assert.equal(grande.text.expectedMm, CAD_TEXT_HEIGHT_CLAMP_MM.max);
    assert.ok(Math.abs(grande.text.errorMm) <= SCALE_TOLERANCE_MM);

    const chico = await measureCadPlotFidelity({
      paper: "A1",
      orientation: "landscape",
      scaleDenominator: 200,
      ...BASE,
      wallLengthUnits: 100_000,
      wallHeightUnits: 60_000,
      textHeightUnits: 200,
    });
    assert.equal(chico.text.clamped, true, "1 mm de rótulo se agranda a 1,5 y el informe lo dice");
    assert.equal(chico.text.expectedMm, CAD_TEXT_HEIGHT_CLAMP_MM.min);
    measured.push({ label: "recorte de rótulo grande", report: grande });
    measured.push({ label: "recorte de rótulo chico", report: chico });
  }

  // --- C3: LA SUSTITUCIÓN SE DECLARA CON NOMBRE Y APELLIDOS -------------------
  {
    const isocp = await measureCadPlotFidelity({ ...BASE, paper: "A3", orientation: "landscape", scaleDenominator: 100, fontFamily: "ISOCPEUR", wallLengthUnits: 30_000, wallHeightUnits: 18_000 });
    assertFontsDeclared(isocp, "ISOCPEUR sin programa");
    assert.deepEqual(
      isocp.fonts.substituted,
      [{ family: "ISOCPEUR", substitutedBy: "helvetica" }],
      "la fuente de rotulación ISO se sustituye por Helvetica, y se dice cuál",
    );
    assert.deepEqual(isocp.fonts.embedded, []);
    measured.push({ label: "ISOCPEUR sin programa", report: isocp });
  }

  // --- C3: UNA FUENTE QUE SÍ SE INCRUSTA --------------------------------------
  {
    const embedded = await measureCadPlotFidelity({
      ...BASE,
      paper: "A3",
      orientation: "landscape",
      scaleDenominator: 100,
      wallLengthUnits: 30_000,
      wallHeightUnits: 18_000,
      fontFamily: EMBEDDED_FAMILY,
      fontPrograms: [embeddableFont()],
    });
    assertFontsDeclared(embedded, "fuente incrustada");
    assert.deepEqual(embedded.fonts.embedded, [EMBEDDED_FAMILY]);
    assert.deepEqual(embedded.fonts.substituted, []);
    assert.ok(
      embedded.fonts.inPdf.some((entry) => entry.baseFont === EMBEDDED_FAMILY && entry.embedded),
      "el programa de la fuente tiene que estar DENTRO del archivo, no sólo declarado",
    );
    // Y ni rastro de la tipografía que jsPDF colaba al pedirle una negrita que
    // la fuente incrustada no tiene.
    assert.ok(
      !embedded.fonts.inPdf.some((entry) => /times/i.test(entry.baseFont)),
      `se coló una fuente que nadie pidió: ${embedded.fonts.inPdf.map((entry) => entry.baseFont).join(", ")}`,
    );
    measured.push({ label: `${EMBEDDED_FAMILY} incrustada`, report: embedded });
  }

  // --- C3: UN PROGRAMA DE FUENTE ROTO NO TUMBA EL TRAZADO ---------------------
  {
    // jsPDF no lanza al añadir una fuente ilegible: publica el error en su bus
    // y estalla mucho después, dentro de `text()`. Antes esto se llevaba por
    // delante el trazado entero con un TypeError sin nombre.
    const roto = await measureCadPlotFidelity({
      ...BASE,
      paper: "A3",
      orientation: "landscape",
      scaleDenominator: 100,
      wallLengthUnits: 30_000,
      wallHeightUnits: 18_000,
      fontFamily: "Falsa",
      fontPrograms: [
        {
          family: "Falsa",
          style: "normal",
          fileName: "falsa.ttf",
          base64: Buffer.from("esto no es una fuente").toString("base64"),
        },
      ],
    });
    assertFontsDeclared(roto, "programa de fuente roto");
    assert.deepEqual(roto.fonts.embedded, [], "no se puede decir que se incrustó lo que no se pudo leer");
    assert.deepEqual(roto.fonts.substituted, [{ family: "Falsa", substitutedBy: "helvetica" }]);
    assert.ok(
      roto.warnings.some((warning) => warning.includes("no es legible")),
      "el motivo del descarte se dice, no sólo el resultado",
    );
    // Y el plano sigue saliendo bien: la escala no se resiente del percance.
    assert.ok(Math.abs(roto.horizontal.errorMm) <= SCALE_TOLERANCE_MM);
    measured.push({ label: "programa de fuente roto", report: roto });
  }

  // --- C4: CAMBIAR EL PAPEL RECOLOCA LA VENTANA — DEFECTO ARREGLADO -----------
  {
    // Era el defecto medido `paper-change-does-not-move-viewport`: PAGESETUP
    // cambiaba el papel de A1 a A3 sin tocar `viewports[].paperBounds` y dos
    // trazos caían fuera del papel — se dibujaban y no se imprimían. Desde que
    // `applyCadPageSetupToLayout` recoloca las ventanas a la zona imprimible
    // nueva, el listón sube: CERO trazos fuera, y esta aserción impide que el
    // defecto regrese en silencio.
    const cambiado = await measureCadPlotFidelity({
      ...BASE,
      paper: "A1",
      orientation: "landscape",
      scaleDenominator: 100,
      wallLengthUnits: 30_000,
      wallHeightUnits: 18_000,
      plotOnPaper: "A3",
    });
    assert.equal(cambiado.page.measuredMm.width, 420, "la hoja del PDF sí cambia a A3");
    assert.equal(
      cambiado.segmentsOutsidePage,
      0,
      `cambiar el papel ya recoloca la ventana; se midieron ${cambiado.segmentsOutsidePage} trazo(s) fuera`,
    );
    // Y la escala sigue siendo exacta: recolocar es COLOCACIÓN, y la escala es
    // contrato del plano que este arreglo tiene prohibido tocar.
    assert.ok(Math.abs(cambiado.horizontal.errorMm) <= SCALE_TOLERANCE_MM);
    measured.push({ label: "papel cambiado tras crear la presentación", report: cambiado });
  }

  // --- C3: EL JUEGO DE CARACTERES QUE SOBREVIVE -------------------------------
  {
    const charset = await measureCadPlotCharacterSet();
    // Todo lo español entra con las fuentes residentes. Que esto se afirme
    // impide que una «mejora» del emisor se cargue las eñes sin que nadie lo note.
    for (const char of "áéíóúÁÉÍÓÚñÑüÜ¿¡ºª°±²³×÷µØ—–…·")
      assert.ok(
        charset.rendered.includes(char),
        `el carácter «${char}» no llegó al PDF; perdidos: ${charset.lost.join("")}`,
      );
    // Y lo que NO entra se sabe de antemano en vez de descubrirse en ventanilla.
    assert.deepEqual(
      charset.lost.sort(),
      ["Ω", "⌀"].sort(),
      `el juego de caracteres cambió: perdidos ${JSON.stringify(charset.lost)}`,
    );
  }

  const worst = measured.reduce(
    (max, entry) => Math.max(max, Math.abs(entry.report.horizontal.errorMm)),
    0,
  );
  console.log(
    `fidelidad: ${measured.length} trazados medidos sobre el PDF; ` +
      `error de escala máximo ${worst.toExponential(3)} mm; ` +
      `fuentes sustituidas ${measured.flatMap((entry) => entry.report.fonts.substituted).length}, ` +
      `incrustadas ${measured.flatMap((entry) => entry.report.fonts.embedded).length}`,
  );
}

specs().then(
  () => {
    console.log("cad plot fidelity specs passed");
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
