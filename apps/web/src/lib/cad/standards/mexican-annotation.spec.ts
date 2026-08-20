/**
 * Cómo se acota y se rotula un plano mexicano, comprobado con números.
 *
 * Las tres afirmaciones que este archivo defiende:
 *
 *  1. **La cota arquitectónica dice metros con dos decimales y la de detalle
 *     dice centímetros enteros.** Se comprueba sobre la ETIQUETA, no sobre la
 *     configuración: 3.450 mm de dibujo tienen que rotularse `3.45`, y 120 mm
 *     tienen que rotularse `12`. Una prueba que sólo mirara `precision: 2` no
 *     distinguiría dos decimales de milímetro de dos decimales de metro, que es
 *     un factor mil.
 *  2. **El remate es la garrapata**, y se dice cuál mitad de eso es norma —ISO
 *     129-1 admite el trazo oblicuo— y cuál es costumbre —elegirlo para
 *     arquitectura—.
 *  3. **2,5 mm son 2,5 mm a 1:50, a 1:75 y a 1:100.** La escala anotativa se
 *     comprueba en las dos direcciones para que la fórmula no pueda equivocarse
 *     igual en el código y en la prueba.
 */
import { strict as assert } from "node:assert";
import { cadAnnotativeModelHeight, cadAnnotativePaperHeight } from "../layout/annotative-scale";
import {
  CAD_MEXICAN_DIMENSION_RULES,
  CAD_MEXICAN_SCALES,
  CAD_MEXICAN_TEXT_MM,
  CAD_MEXICAN_TEXT_STYLES,
  CAD_MEXICAN_TICK_MM,
  CadMexicanScaleError,
  cadMexicanAnnotationSourceProblems,
  cadMexicanDimensionStyle,
  cadMexicanDimensionStyleName,
  cadMexicanDimensionStyles,
  cadMexicanScale,
  cadMexicanTextStyles,
  formatCadMexicanDimension,
} from "./mexican-annotation";
import { cadStandardSource } from "./mexican-drafting-sources";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- LAS CITAS ESTÁN, Y APUNTAN A ALGO --------------------------------------
{
  assert.deepEqual(cadMexicanAnnotationSourceProblems(), []);
  for (const scale of CAD_MEXICAN_SCALES) {
    ok(scale.sources.length > 0, `1:${scale.denominator} cita su fuente`);
    ok(scale.purpose.length > 10, `1:${scale.denominator} dice para qué se usa`);
  }
}

// --- LA UNIDAD DE LA COTA, EN LA ETIQUETA -----------------------------------
{
  // El dibujo está en milímetros y la cota dice metros. No es contradicción: es
  // exactamente lo que hace un plano mexicano.
  assert.equal(formatCadMexicanDimension(3450, "arquitectonico"), "3.45");
  assert.equal(formatCadMexicanDimension(3000, "arquitectonico"), "3.00");
  assert.equal(formatCadMexicanDimension(12345, "arquitectonico"), "12.35");
  // Y en detalle, centímetros enteros: «12», no «0.12».
  assert.equal(formatCadMexicanDimension(120, "detalle"), "12");
  assert.equal(formatCadMexicanDimension(125, "detalle"), "13");
  // La unidad NO se escribe en la etiqueta: se declara en el cajetín y se calla
  // en las cotas. Escribirla duplicaría el ancho de cada rótulo.
  ok(!formatCadMexicanDimension(3450, "arquitectonico").includes("m"), "la cota no escribe la unidad");

  // Con el dibujo en metros la etiqueta sale igual: la conversión mira la unidad
  // del dibujo y no da por hecho milímetros.
  assert.equal(formatCadMexicanDimension(3.45, "arquitectonico", "m"), "3.45");
  assert.equal(formatCadMexicanDimension(3.45, "detalle", "m"), "345");

  assert.equal(CAD_MEXICAN_DIMENSION_RULES.arquitectonico.unit, "m");
  assert.equal(CAD_MEXICAN_DIMENSION_RULES.arquitectonico.precision, 2);
  assert.equal(CAD_MEXICAN_DIMENSION_RULES.detalle.unit, "cm");
  assert.equal(CAD_MEXICAN_DIMENSION_RULES.detalle.precision, 0);
}

// --- LA GARRAPATA, Y QUÉ MITAD ES NORMA -------------------------------------
{
  for (const scale of CAD_MEXICAN_SCALES) {
    const style = cadMexicanDimensionStyle(scale);
    assert.equal(style.arrowhead, "architectural-tick", `1:${scale.denominator} remata con garrapata`);
    assert.equal(style.textStyle, CAD_MEXICAN_TEXT_STYLES.rotulo);
  }
  // La terminación está NORMADA: ISO 129-1 admite el trazo oblicuo.
  const norma = cadStandardSource("iso-129-1-terminacion");
  assert.equal(norma.kind, "norma");
  ok(norma.kind === "norma" && /oblicuo/i.test(norma.says), "la norma admite el trazo oblicuo");
  // ELEGIRLA para arquitectura es costumbre, y se dice así.
  const costumbre = cadStandardSource("garrapata-arquitectonica");
  assert.equal(costumbre.kind, "costumbre");
}

// --- 2,5 mm SON 2,5 mm A 1:50, 1:75 Y 1:100 ---------------------------------
{
  for (const denominator of [50, 75, 100]) {
    const scale = cadMexicanScale(denominator);
    const styles = cadMexicanTextStyles(denominator, "mm");
    const rotulo = styles[CAD_MEXICAN_TEXT_STYLES.rotulo];
    // La ida: cuánto mide en el modelo.
    assert.equal(rotulo.height, CAD_MEXICAN_TEXT_MM.rotulo * denominator);
    // La vuelta: eso son 2,5 mm sobre el papel, que es la propiedad real.
    assert.equal(cadAnnotativePaperHeight(rotulo.height!, denominator, "mm"), 2.5);
    // Y la garrapata acompaña a la letra: si una escalara y la otra no, la cota
    // de la lámina de conjunto tendría un remate de medio milímetro.
    const dimension = cadMexicanDimensionStyle(scale);
    assert.equal(dimension.arrowSize, cadAnnotativeModelHeight(CAD_MEXICAN_TICK_MM, denominator, "mm"));
    checks += 1;
  }
  // Los tres números concretos, para que la fórmula no cambie en silencio.
  assert.equal(cadMexicanTextStyles(50).ROTULO.height, 125);
  assert.equal(cadMexicanTextStyles(75).ROTULO.height, 187.5);
  assert.equal(cadMexicanTextStyles(100).ROTULO.height, 250);
  // Los tres escalones de letra son de la serie de ISO 3098-1.
  assert.deepEqual(
    [CAD_MEXICAN_TEXT_MM.rotulo, CAD_MEXICAN_TEXT_MM.subtitulo, CAD_MEXICAN_TEXT_MM.titulo],
    [2.5, 3.5, 5],
  );
}

// --- 1:75 SE OFRECE Y SE DICE QUE NO ESTÁ NORMALIZADA -----------------------
{
  const recomendadas = CAD_MEXICAN_SCALES.filter((item) => item.isoRecommended).map(
    (item) => item.denominator,
  );
  const costumbre = CAD_MEXICAN_SCALES.filter((item) => !item.isoRecommended).map(
    (item) => item.denominator,
  );
  assert.deepEqual(recomendadas, [200, 100, 50, 20, 10, 5]);
  // Ésta es la honestidad concreta: se usan a diario y NO están en ISO 5455.
  assert.deepEqual(costumbre, [75, 25]);
  const iso = cadStandardSource("iso-5455-escalas");
  ok(iso.kind === "norma" && /1:75/.test(iso.says), "la norma dice explícitamente que 1:75 no figura");
}

// --- LOS NOMBRES DE ESTILO SEPARAN PLANTA DE DETALLE ------------------------
{
  assert.equal(cadMexicanDimensionStyleName(cadMexicanScale(50)), "COTA 1:50");
  assert.equal(cadMexicanDimensionStyleName(cadMexicanScale(20)), "COTA DET 1:20");
  // El prefijo distinto no es estética: un estilo llamado `COTA 1:20` invitaría
  // a usarlo en la planta y sacaría centímetros en medio de una lámina en
  // metros. Un `3.45` que de pronto dice `345` es un muro mal construido.
  const table = cadMexicanDimensionStyles("mm");
  assert.equal(Object.keys(table).length, CAD_MEXICAN_SCALES.length);
  assert.equal(table["COTA 1:50"].units, "m");
  assert.equal(table["COTA DET 1:20"].units, "cm");
  for (const name of Object.keys(table))
    ok(name.startsWith("COTA"), `«${name}» se reconoce como estilo de cota`);
}

// --- FALLO CERRADO -----------------------------------------------------------
{
  assert.throws(
    () => cadMexicanScale(37),
    (error: unknown) => {
      assert.ok(error instanceof CadMexicanScaleError);
      assert.equal(error.code, "cad_mexican_scale_unknown");
      assert.equal(error.denominator, 37);
      assert.match(error.message, /1:50/);
      return true;
    },
  );
  checks += 1;
}

console.log(
  `mexican-annotation.spec: ${CAD_MEXICAN_SCALES.length} escalas, ${checks} comprobaciones nombradas OK`,
);
