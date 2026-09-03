/**
 * QUE UNA LÍNEA DE PROCESO TENGA NOMBRE, Y QUE LA LISTA NO MIENTA.
 *
 * En una planta industrial una tubería no se llama «esa de allá»: se llama
 * `6"-P-1001-CS150`. Ese nombre es la clave con la que aparece en el P&ID, en
 * el isométrico, en la lista de líneas, en la requisición y en la prueba
 * hidrostática. Sin número de línea no hay proyecto de planta: hay dibujos.
 *
 * Se afirma abajo que el nombre se lee y se escribe como lo escribe un
 * proyectista —con sus comillas de pulgada y sus fracciones—, que el
 * correlativo sale del dibujo, y las cuatro cosas que se pueden comprobar SIN
 * el catálogo de nadie: número repetido, un servicio con dos especificaciones,
 * diámetro que no se compra, y número ilegible que se cuenta en vez de
 * desaparecer de la lista.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import {
  CAD_PL_LINE,
  CAD_PL_NPS,
  cadFormatPlantLine,
  cadNextPlantLineNumber,
  cadParsePlantLine,
  cadPlantFindings,
  cadPlantLineMetadata,
  cadPlantLinesOf,
  cadPlantRunLength,
} from "./line-numbers";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const tramo = (id: string, metadata: Record<string, string>, metros = 10): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: metros * 1_000, y: 0, z: 0 },
    ],
    closed: false,
    layer: "TU-PROC",
    context: { metadata },
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities"> => ({ entities });

// --- 1 · el número se lee como lo escribe un proyectista -------------------
{
  assert.deepEqual(
    cadParsePlantLine('6"-P-1001-CS150'),
    { size: '6"', service: "P", number: 1_001, spec: "CS150" },
    "la forma canónica",
  );
  assert.deepEqual(
    cadParsePlantLine('1-1/2"-V-1002-SS300'),
    { size: '1-1/2"', service: "V", number: 1_002, spec: "SS300" },
    "pulgada y media: por eso no basta con partir por guiones",
  );
  assert.deepEqual(
    cadParsePlantLine(' 3/4”-a-12-cs150 '),
    { size: '3/4"', service: "A", number: 12, spec: "CS150" },
    "con comilla tipográfica, minúsculas y espacios, como sale de un correo",
  );
  verdes += 3;

  eq(cadParsePlantLine('6-P-1001-CS150'), null, "sin la comilla de pulgada no es un diámetro");
  eq(cadParsePlantLine('6"-P-CS150'), null, "sin correlativo no es un número de línea");
  eq(cadParsePlantLine('6"-P-0-CS150'), null, "el cero no es un correlativo");
  eq(cadParsePlantLine('6"-PROCESO-1001-CS150'), null, "el servicio son una a tres letras");
  eq(
    cadFormatPlantLine('6"', "p", 1_001, "cs150"),
    '6"-P-1001-CS150',
    "y se escribe en mayúsculas, como se rotula",
  );
}

// --- 2 · el correlativo sale del dibujo, y empieza en 1001 ----------------
{
  const documento = doc([
    tramo("a", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("b", cadPlantLineMetadata({ size: '4"', service: "P", number: 1_007, spec: "CS150" })),
    tramo("c", cadPlantLineMetadata({ size: '2"', service: "V", number: 1_001, spec: "SS300" })),
  ]);
  eq(cadNextPlantLineNumber(documento, "P"), 1_008, "sigue al mayor del servicio");
  eq(cadNextPlantLineNumber(documento, "V"), 1_002, "cada servicio lleva su cuenta");
  eq(
    cadNextPlantLineNumber(documento, "N"),
    1_001,
    "un servicio nuevo empieza en 1001: los de tres cifras se confunden con los de equipo",
  );

  const sinElSiete = doc(documento.entities.filter((e) => e.id !== "b"));
  eq(
    cadNextPlantLineNumber(sinElSiete, "P"),
    1_002,
    "control: el hueco no se rellena — el 1007 de un plano entregado no vuelve",
  );
}

// --- 3 · dos tramos con el MISMO número es un error -----------------------
{
  const documento = doc([
    tramo("a", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("b", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
  ]);
  const hallazgos = cadPlantFindings(documento);
  const repetido = hallazgos.find((h) => h.kind === "numero-repetido");
  ok(repetido, "el número repetido se caza");
  ok(/P-1001/.test(repetido!.detail), `y se dice cuál: ${repetido!.detail}`);
  assert.deepEqual(repetido!.entityIds, ["a", "b"], "y quiénes lo llevan");
  verdes += 1;
}

// --- 4 · un servicio con DOS especificaciones no es una opción ------------
{
  const documento = doc([
    tramo("a", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("b", cadPlantLineMetadata({ size: '4"', service: "P", number: 1_002, spec: "SS300" })),
  ]);
  const hallazgo = cadPlantFindings(documento).find(
    (h) => h.kind === "servicio-con-dos-especificaciones",
  );
  ok(hallazgo, "un servicio con dos especificaciones se caza");
  ok(
    /el servicio P usa CS150 y SS300/.test(hallazgo!.detail),
    `y se nombran las dos: ${hallazgo!.detail}`,
  );

  // Dos servicios con especificaciones distintas es lo NORMAL: no es hallazgo.
  const normal = doc([
    tramo("a", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("b", cadPlantLineMetadata({ size: '4"', service: "V", number: 1_001, spec: "SS300" })),
  ]);
  eq(
    cadPlantFindings(normal).length,
    0,
    "dos servicios con dos especificaciones no es un error: es un proyecto",
  );
}

// --- 5 · un diámetro que no se compra se caza aquí, no en la requisición --
{
  const documento = doc([
    tramo("a", cadPlantLineMetadata({ size: '5"', service: "P", number: 1_001, spec: "CS150" })),
  ]);
  const hallazgo = cadPlantFindings(documento).find((h) => h.kind === "diametro-no-comercial");
  ok(hallazgo, 'un 5" no es comercial y se dice');
  ok(/5"/.test(hallazgo!.detail), `nombrando el diámetro: ${hallazgo!.detail}`);
  ok(CAD_PL_NPS.includes('6"'), 'el 6" sí está en la lista de medidas comerciales');
  ok(!CAD_PL_NPS.includes('5"'), 'y el 5" no, que es justo lo que se comprueba');
}

// --- 6 · un número ilegible SE CUENTA, no desaparece de la lista ----------
{
  const documento = doc([
    tramo("bueno", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("malo", { [CAD_PL_LINE]: "la de vapor" }),
  ]);
  eq(cadPlantLinesOf(documento).length, 1, "sólo la bien escrita entra en la lista");
  const hallazgo = cadPlantFindings(documento).find((h) => h.kind === "numero-ilegible");
  ok(hallazgo, "y la otra se cuenta en vez de desaparecer");
  ok(
    /«la de vapor» no tiene la forma/.test(hallazgo!.detail),
    `con lo que se escribió y lo que se esperaba: ${hallazgo!.detail}`,
  );
  ok(
    hallazgo!.entityIds.includes("malo"),
    "y con la entidad, para poder ir a arreglarla",
  );
}

// --- 7 · la longitud sale del recorrido, no de la recta ------------------
{
  const codo = {
    id: "codo",
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 3_000, y: 0, z: 0 },
      { x: 3_000, y: 4_000, z: 0 },
    ],
    closed: false,
    layer: "TU-PROC",
  } as unknown as CadEntity;
  eq(
    cadPlantRunLength(codo),
    7_000,
    "una tubería con un codo mide lo que recorre, no lo que separa sus puntas",
  );
}

// --- 8 · un dibujo sano no produce hallazgos ------------------------------
{
  const documento = doc([
    tramo("a", cadPlantLineMetadata({ size: '6"', service: "P", number: 1_001, spec: "CS150" })),
    tramo("b", cadPlantLineMetadata({ size: '4"', service: "P", number: 1_002, spec: "CS150" })),
    tramo("c", cadPlantLineMetadata({ size: '2"', service: "V", number: 1_001, spec: "SS300" })),
  ]);
  eq(cadPlantFindings(documento).length, 0, "sin errores, no se inventa ninguno");
  eq(cadPlantLinesOf(documento).length, 3, "y las tres líneas están en la lista");
}

console.log(
  `plant/line-numbers: ${verdes} comprobaciones verdes — el número de línea se lee como se escribe, el correlativo sale del dibujo y las cuatro comprobaciones no piden el catálogo de nadie`,
);
