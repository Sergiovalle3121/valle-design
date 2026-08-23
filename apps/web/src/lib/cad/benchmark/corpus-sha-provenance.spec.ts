/**
 * PROCEDENCIA del SHA del corpus «plano real» a 20.000 entidades.
 *
 * ## Por qué existe este spec
 *
 * `plan-budget.spec.ts` cambió su SHA esperado al subir el esquema canónico de
 * 6 a 7, y NO volvió a calibrar los presupuestos de rendimiento. Esa decisión
 * es correcta sólo si es verdad la razón que la acompaña: que el serializado
 * del corpus no cambió de CONTENIDO, sino únicamente en el entero del esquema.
 * Escrita en prosa, esa razón es un adjetivo. Aquí se mide.
 *
 * Cada subida del esquema vuelve a plantear la misma pregunta, y por eso la
 * cadena crece en vez de reescribirse: se guardan los cuatro SHA y se
 * comprueba que se llega de uno a otro cambiando un dígito. Que la subida al 8
 * no toque este corpus no es evidente a priori: SÍ toca las láminas,
 * escribiendo una cámara de planta en cada ventana al abrir; este corpus no
 * tiene ninguna —`paperSpaces` está vacío— y se comprueba abajo. La subida al
 * 9 (frozen y layerStates) es puramente aditiva y NO materializa nada: este
 * corpus no congela capas ni trae estados, y también se comprueba.
 *
 * El argumento importa porque los presupuestos (p95 de panear y de zoom) están
 * calibrados sobre una corrida concreta. Si el corpus hubiera cambiado de
 * entidades, los presupuestos medirían un plano que ya no existe y habría que
 * volver a medir. Si lo único que cambió es un número de versión en la
 * cabecera, recalibrar sería sustituir una medida buena por una peor —tomada
 * en una máquina con sesiones vecinas— sin haber medido nada distinto.
 *
 * ## Qué demuestra exactamente
 *
 * Que revertir el ÚNICO entero del esquema sobre el texto serializado de HOY
 * reproduce, byte a byte, el SHA anterior a la subida. Si algún día alguien
 * mete una entidad en el corpus, este spec cae en el acto y con él la coartada
 * para no recalibrar.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serializeCadDocument } from "../cad-document";
import { createCadCorpusMix } from "./corpus-mixes";

const ENTIDADES = 20_000;

/** SHA del corpus cuando el documento canónico declaraba esquema 6. */
const SHA_CON_ESQUEMA_6 = "b91c346856bf914dc0ed51b8b10a3382a10064923bad419dd17c05bd214b44ef";
/** SHA del mismo corpus con esquema 7. */
const SHA_CON_ESQUEMA_7 = "d569bc9d27db3cd5170f9d5da621a7d4b112afee91e68c8f48e405a820ee8f25";
/** SHA del mismo corpus con esquema 8. */
const SHA_CON_ESQUEMA_8 = "000a45f20f3dc18f48aec976ef6ee388108c0852f00d963e7f5e4b6b5ecb6eb2";
/** SHA del mismo corpus con esquema 9. */
const SHA_CON_ESQUEMA_9 = "45407772af70744b0308ee791df9d4885befb3e1ce7c944d37a6a6b66322a2ba";
/** SHA del mismo corpus hoy, ya con esquema 10. */
const SHA_CON_ESQUEMA_10 = "8d6b3e816cd9632ef3fb195b1453ddf82eae8752c4157c64029f34a02425802d";

const corpus = createCadCorpusMix({ mix: "plano-real", entities: ENTIDADES });
const serializado = serializeCadDocument(corpus.document);
const sha = (texto: string): string => createHash("sha256").update(texto).digest("hex");

assert.equal(
  sha(serializado),
  SHA_CON_ESQUEMA_10,
  "el corpus de 20.000 ya no serializa a lo que dice plan-budget.spec.ts",
);

// Sin láminas no hay ventanas, y sin ventanas la migración 7→8 no tiene dónde
// escribir una cámara. Es la única razón por la que la subida al 8 se reduce a
// un dígito en este corpus, así que se comprueba en vez de suponerse.
assert.equal(
  corpus.document.paperSpaces.length,
  0,
  "el corpus estrenó láminas: la subida al 8 ya no es sólo el entero del esquema y hay que recalibrar",
);

/*
 * La subida al 10 tampoco tiene dónde escribir en este corpus. Y aquí la
 * coartada NO es «no hay cotas» —las hay—, sino que los siete DIMVARs nuevos
 * son opcionales-ausentes: una cota que no los trae serializa exactamente igual
 * que ayer. Se comprueba cota por cota, que es la única forma de saberlo.
 */
const cotas = corpus.document.entities.filter(
  (entity) => entity.type === "dimension",
);
assert.ok(cotas.length > 0, "el corpus dejó de traer cotas: revisa esta coartada");
assert.ok(
  cotas.every(
    (cota) =>
      cota.type === "dimension" &&
      cota.textHeight === undefined &&
      cota.textStyle === undefined &&
      cota.textColor === undefined &&
      cota.dimLineColor === undefined &&
      cota.extensionLineColor === undefined &&
      cota.textVertical === undefined &&
      cota.textJustification === undefined,
  ),
  "alguna cota del corpus estrenó DIMVARs del esquema 10: ya no es sólo el entero y hay que recalibrar",
);

// La subida al 9 tampoco tenía dónde escribir en este corpus: ninguna capa
// viene congelada y la sección de estados sigue ausente. Se comprueba, no se
// supone — es la coartada exacta para no recalibrar.
assert.equal(corpus.document.layerStates, undefined, "el corpus estrenó layerStates: recalibra");
assert.ok(
  corpus.document.layers.every((layer) => layer.frozen === undefined),
  "el corpus estrenó capas congeladas: la subida al 9 ya no es sólo el entero del esquema",
);

// El serializado declara el esquema UNA sola vez. Que sea una y no varias es
// parte de lo que se demuestra: si apareciera dos veces, revertir «el entero»
// dejaría de ser una operación bien definida.
const apariciones = serializado.split(`"schema":10`).length - 1;
assert.equal(
  apariciones,
  1,
  "el esquema aparece más de una vez en el serializado: revertirlo ya no es una sola sustitución",
);

// LA PRUEBA, eslabón a eslabón: revertido el entero, y NADA más, vuelve el SHA
// de antes. Cuatro saltos, porque el corpus ha sobrevivido a cuatro subidas.
const comoEsquema9 = serializado.replace(`"schema":10`, `"schema":9`);
assert.equal(
  sha(comoEsquema9),
  SHA_CON_ESQUEMA_9,
  "revertir 10→9 NO reproduce el SHA anterior: el corpus cambió de contenido y hay que recalibrar plan-budget.ts con una corrida nueva",
);
const comoEsquema8 = comoEsquema9.replace(`"schema":9`, `"schema":8`);
assert.equal(
  sha(comoEsquema8),
  SHA_CON_ESQUEMA_8,
  "revertir 9→8 NO reproduce el SHA anterior: el corpus cambió de contenido y hay que recalibrar plan-budget.ts con una corrida nueva",
);
const comoEsquema7 = comoEsquema8.replace(`"schema":8`, `"schema":7`);
assert.equal(
  sha(comoEsquema7),
  SHA_CON_ESQUEMA_7,
  "revertir 8→7 NO reproduce el SHA de entonces: la cadena de procedencia está rota",
);
const comoEsquema6 = comoEsquema7.replace(`"schema":7`, `"schema":6`);
assert.equal(
  sha(comoEsquema6),
  SHA_CON_ESQUEMA_6,
  "revertir 7→6 NO reproduce el SHA de entonces: la cadena de procedencia está rota",
);

/*
 * La longitud. Hasta el 9 la sustitución era un dígito por otro dígito y la
 * diferencia era exactamente cero. El 10 es la PRIMERA subida con dos cifras,
 * así que revertir a 9 acorta el texto en un carácter — uno, ni más ni menos, y
 * de ahí hacia abajo vuelve a ser estable. Se afirma con ese detalle en vez de
 * relajar la comprobación: si algún día la diferencia fuera otra, sería porque
 * cambió algo más que el entero.
 */
assert.equal(
  comoEsquema9.length,
  serializado.length - 1,
  "revertir 10→9 cambió la longitud en algo distinto de un carácter",
);
assert.equal(
  comoEsquema6.length,
  comoEsquema9.length,
  "la sustitución del esquema por debajo del 9 cambió la longitud del serializado",
);

console.log(
  `OK procedencia del SHA: ${ENTIDADES} entidades, único cambio "schema":6 -> 7 -> 8 -> 9 -> 10, presupuestos no recalibrados con motivo medido`,
);
