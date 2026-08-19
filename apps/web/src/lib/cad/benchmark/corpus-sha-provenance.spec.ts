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
 * La subida al esquema 8 —la ventana gráfica con cámara— vuelve a plantear la
 * misma pregunta, y por eso la cadena crece en vez de reescribirse: se guardan
 * los tres SHA y se comprueba que se llega de uno a otro cambiando un dígito.
 * Que la subida al 8 no toque este corpus no es evidente a priori: SÍ toca las
 * láminas, escribiendo una cámara de planta en cada ventana al abrir. Lo que
 * pasa es que este corpus no tiene ninguna —`paperSpaces` está vacío—, y esa
 * afirmación se comprueba abajo en vez de suponerse.
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
/** SHA del mismo corpus hoy, ya con esquema 8. */
const SHA_CON_ESQUEMA_8 = "000a45f20f3dc18f48aec976ef6ee388108c0852f00d963e7f5e4b6b5ecb6eb2";

const corpus = createCadCorpusMix({ mix: "plano-real", entities: ENTIDADES });
const serializado = serializeCadDocument(corpus.document);
const sha = (texto: string): string => createHash("sha256").update(texto).digest("hex");

assert.equal(
  sha(serializado),
  SHA_CON_ESQUEMA_8,
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

// El serializado declara el esquema UNA sola vez. Que sea una y no varias es
// parte de lo que se demuestra: si apareciera dos veces, revertir «el entero»
// dejaría de ser una operación bien definida.
const apariciones = serializado.split(`"schema":8`).length - 1;
assert.equal(
  apariciones,
  1,
  "el esquema aparece más de una vez en el serializado: revertirlo ya no es una sola sustitución",
);

// LA PRUEBA, eslabón a eslabón: revertido el entero, y NADA más, vuelve el SHA
// de antes. Dos saltos, porque el corpus ha sobrevivido a dos subidas.
const comoEsquema7 = serializado.replace(`"schema":8`, `"schema":7`);
assert.equal(
  sha(comoEsquema7),
  SHA_CON_ESQUEMA_7,
  "revertir 8→7 NO reproduce el SHA anterior: el corpus cambió de contenido y hay que recalibrar plan-budget.ts con una corrida nueva",
);
const comoEsquema6 = comoEsquema7.replace(`"schema":7`, `"schema":6`);
assert.equal(
  sha(comoEsquema6),
  SHA_CON_ESQUEMA_6,
  "revertir 7→6 NO reproduce el SHA de entonces: la cadena de procedencia está rota",
);

// Y la diferencia de longitud es exactamente cero: un dígito por otro dígito.
assert.equal(
  comoEsquema6.length,
  serializado.length,
  "la sustitución del esquema cambió la longitud del serializado",
);

console.log(
  `OK procedencia del SHA: ${ENTIDADES} entidades, único cambio "schema":6 -> 7 -> 8, presupuestos no recalibrados con motivo medido`,
);
