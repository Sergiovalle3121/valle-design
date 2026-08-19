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
/** SHA del mismo corpus hoy, ya con esquema 7. */
const SHA_CON_ESQUEMA_7 = "d569bc9d27db3cd5170f9d5da621a7d4b112afee91e68c8f48e405a820ee8f25";

const corpus = createCadCorpusMix({ mix: "plano-real", entities: ENTIDADES });
const serializado = serializeCadDocument(corpus.document);
const sha = (texto: string): string => createHash("sha256").update(texto).digest("hex");

assert.equal(
  sha(serializado),
  SHA_CON_ESQUEMA_7,
  "el corpus de 20.000 ya no serializa a lo que dice plan-budget.spec.ts",
);

// El serializado declara el esquema UNA sola vez. Que sea una y no varias es
// parte de lo que se demuestra: si apareciera dos veces, revertir «el entero»
// dejaría de ser una operación bien definida.
const apariciones = serializado.split(`"schema":7`).length - 1;
assert.equal(
  apariciones,
  1,
  "el esquema aparece más de una vez en el serializado: revertirlo ya no es una sola sustitución",
);

// LA PRUEBA: revertido el entero, y NADA más, vuelve el SHA de antes.
const revertido = serializado.replace(`"schema":7`, `"schema":6`);
assert.equal(
  sha(revertido),
  SHA_CON_ESQUEMA_6,
  "revertir el esquema NO reproduce el SHA anterior: el corpus cambió de contenido y hay que recalibrar plan-budget.ts con una corrida nueva",
);

// Y la diferencia de longitud es exactamente cero: un dígito por otro dígito.
assert.equal(
  revertido.length,
  serializado.length,
  "la sustitución del esquema cambió la longitud del serializado",
);

console.log(
  `OK procedencia del SHA: ${ENTIDADES} entidades, único cambio "schema":6 -> 7, presupuestos no recalibrados con motivo medido`,
);
