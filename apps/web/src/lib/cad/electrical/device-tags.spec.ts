/**
 * QUE CADA COMPONENTE TENGA SU ETIQUETA, Y QUE NO HAYA DOS IGUALES.
 *
 * En un proyecto eléctrico el motor es `-M1`, el botón `-PB2`, la luminaria
 * `-LT3`. Esa etiqueta es la que sale en el esquema, en el plano de gabinete, en
 * la lista de materiales y en la regleta de bornes — y es por lo que el
 * electricista pregunta cuando llama por teléfono. Dos componentes con la misma
 * etiqueta es el mismo desastre que dos conductores con el mismo número.
 *
 * Se afirma abajo dónde vive la etiqueta —en los ATRIBUTOS del bloque, que es
 * lo que se DIBUJA y lo que viaja al DXF como `ATTRIB`, no en metadatos que no
 * se ven—, que el número sale del dibujo, que el hueco no se rellena y que el
 * repetido se caza.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import {
  CAD_IE_FAMILIES,
  CAD_IE_TAG,
  cadDeviceTagClashes,
  cadDeviceTagsOf,
  cadFormatDeviceTag,
  cadIsElectricalInsert,
  cadNextDeviceNumber,
  cadParseDeviceTag,
  cadUntaggedDevices,
} from "./device-tags";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const componente = (
  id: string,
  attributes: Record<string, string> | undefined,
  extra: { block?: string; layer?: string } = {},
): CadEntity =>
  ({
    id,
    type: "insert",
    block: extra.block ?? "MEP-LUMINARIA",
    insertion: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    layer: extra.layer ?? "IE-ALU",
    ...(attributes ? { attributes } : {}),
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities"> => ({ entities });

// --- 1 · la etiqueta se lee de los ATRIBUTOS, que es donde se ve ------------
{
  const documento = doc([componente("i1", { [CAD_IE_TAG]: "-M1" })]);
  const leidas = cadDeviceTagsOf(documento);
  eq(leidas.length, 1, "el componente etiquetado se lee");
  eq(leidas[0].prefix, "M", "con su familia");
  eq(leidas[0].number, 1, "y su número");

  // Un componente sin atributos no es un componente etiquetado a medias.
  eq(cadDeviceTagsOf(doc([componente("i2", undefined)])).length, 0, "sin atributos, no hay etiqueta");
  // Y algo que no es una inserción no entra jamás.
  eq(
    cadDeviceTagsOf(doc([{ id: "r", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, layer: "0" } as CadEntity])).length,
    0,
    "una línea no lleva etiqueta de componente",
  );
}

// --- 2 · la etiqueta la teclea una persona, y se normaliza -----------------
{
  assert.deepEqual(cadParseDeviceTag("-M1"), { prefix: "M", number: 1 }, "con guion");
  assert.deepEqual(cadParseDeviceTag("m1"), { prefix: "M", number: 1 }, "sin guion y en minúscula");
  assert.deepEqual(cadParseDeviceTag(" pb12 "), { prefix: "PB", number: 12 }, "con espacios");
  verdes += 3;
  eq(cadParseDeviceTag("M"), null, "una familia sin número no es una etiqueta");
  eq(cadParseDeviceTag("1"), null, "ni un número sin familia");
  eq(cadParseDeviceTag("-M0"), null, "ni el cero, que no es un ordinal");
  eq(cadParseDeviceTag("MOTOR1"), null, "ni una palabra: la familia son una a tres letras");
  eq(cadFormatDeviceTag("m", 3), "-M3", "y se escribe con guion y en mayúscula, como en el esquema");
}

// --- 3 · el número sale del DIBUJO, por familia ----------------------------
{
  const documento = doc([
    componente("a", { [CAD_IE_TAG]: "-M1" }),
    componente("b", { [CAD_IE_TAG]: "-M7" }),
    componente("c", { [CAD_IE_TAG]: "-PB2" }),
  ]);
  eq(cadNextDeviceNumber(documento, "M"), 8, "sigue al mayor de la familia, no al conteo");
  eq(cadNextDeviceNumber(documento, "PB"), 3, "cada familia lleva su cuenta");
  eq(cadNextDeviceNumber(documento, "LT"), 1, "una familia nueva empieza en 1");
  eq(cadNextDeviceNumber(documento, "m"), 8, "y la familia no distingue mayúsculas");

  const sinElSiete = doc(documento.entities.filter((e) => e.id !== "b"));
  eq(
    cadNextDeviceNumber(sinElSiete, "M"),
    2,
    "control: el hueco NO se rellena — el -M7 de un plano entregado no vuelve",
  );
}

// --- 4 · una etiqueta repetida se caza -------------------------------------
{
  const documento = doc([
    componente("a", { [CAD_IE_TAG]: "-M1" }),
    // El clásico: se copió el símbolo y la etiqueta viajó con él.
    componente("b", { [CAD_IE_TAG]: "-M1" }),
    componente("c", { [CAD_IE_TAG]: "-M2" }),
  ]);
  const choques = cadDeviceTagClashes(documento);
  eq(choques.length, 1, "un solo choque");
  eq(choques[0].tag, "-M1", "con la etiqueta repetida");
  assert.deepEqual(choques[0].entityIds, ["a", "b"], "y quiénes la llevan");
  verdes += 1;

  // La misma etiqueta escrita de dos formas TAMBIÉN choca: es el mismo
  // componente para el electricista, aunque el archivo diga otra cosa.
  const mezclado = doc([
    componente("a", { [CAD_IE_TAG]: "-M1" }),
    componente("b", { [CAD_IE_TAG]: "m1" }),
  ]);
  eq(cadDeviceTagClashes(mezclado).length, 1, "«-M1» y «m1» son la misma etiqueta");
}

// --- 5 · el componente SIN etiquetar se cuenta, no desaparece --------------
{
  const documento = doc([
    componente("etiquetado", { [CAD_IE_TAG]: "-LT1" }),
    componente("pelado", undefined),
    componente("ilegible", { [CAD_IE_TAG]: "luminaria" }),
    // Una inserción que NO es eléctrica no se cuenta: no es asunto de esta lista.
    componente("puerta", undefined, { block: "PUERTA-90", layer: "ARQ-PUE" }),
  ]);
  const pelados = cadUntaggedDevices(documento, cadIsElectricalInsert);
  assert.deepEqual(
    pelados.sort(),
    ["ilegible", "pelado"],
    "los dos eléctricos sin etiqueta legible se cuentan, y la puerta no",
  );
  verdes += 1;

  // Un componente sin etiqueta no sale en la lista de materiales ni en la
  // regleta: desaparece del proyecto sin que nadie lo note. Por eso se cuenta.
  ok(!pelados.includes("etiquetado"), "el que sí la tiene no molesta en la lista");
}

// --- 6 · el catálogo de familias es el del esquema mexicano ---------------
{
  const prefijos = CAD_IE_FAMILIES.map((familia) => familia.prefix);
  for (const esperado of ["M", "PB", "LT", "CT", "SW", "TB"])
    ok(prefijos.includes(esperado), `la familia ${esperado} está en el catálogo`);
  eq(new Set(prefijos).size, prefijos.length, "y ningún prefijo se repite: sería ambiguo");
}

console.log(
  `device-tags: ${verdes} comprobaciones verdes — la etiqueta vive en los ATRIBUTOS, el número sale del dibujo y el repetido se caza`,
);
