/**
 * La nube de puntos: lo que entra, y el LAZ que se rechaza por su nombre.
 *
 * Lo que se fija aquí, por orden de importancia:
 *
 *   1. Que las coordenadas salen EXACTAS. En LAS no se guardan metros: se
 *      guardan enteros de 32 bits que hay que multiplicar por una escala y
 *      sumarles un desplazamiento. Equivocarse de escala da una nube que se ve
 *      perfectamente bien y que mide mil veces menos de lo que mide.
 *   2. Que un LAZ —el mismo formato comprimido— se detecta aunque se llame
 *      `.las`, y se rechaza diciendo qué es y qué hacer.
 *   3. Que las cuentas del archivo tienen que cerrar. Un LAS cortado no se lee
 *      «hasta donde llegó»: se rechaza. Media nube parece una nube entera.
 *   4. Que el sistema de referencia se LEE del archivo y no se supone.
 */
import { strict as assert } from "node:assert";
import { GeoError } from "./errors";
import { buildLasBytes } from "./fixtures";
import { readLas, readLasHeader } from "./las";

const rejects = (fn: () => unknown, code: string, what: string) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof GeoError, `${what}: el error no es un GeoError sino ${error}`);
    assert.equal((error as GeoError).code, code, `${what}: código inesperado`);
    return error as GeoError;
  }
  assert.fail(`${what}: no falló, y debía fallar cerrado`);
};

const mutated = (source: Uint8Array, edit: (view: DataView, bytes: Uint8Array) => void) => {
  const copy = new Uint8Array(source);
  edit(new DataView(copy.buffer), copy);
  return copy;
};

// ---------------------------------------------------------------------------
// Los bytes de la cabecera, contra la especificación ASPRS
// ---------------------------------------------------------------------------

const survey = buildLasBytes({ count: 5_000, pointFormat: 1, versionMinor: 2, epsg: 32_614 });
const view = new DataView(survey.buffer);
assert.equal(String.fromCharCode(...survey.subarray(0, 4)), "LASF", "bytes 0-3: la firma");
assert.equal(survey[24], 1, "byte 24: versión mayor");
assert.equal(survey[25], 2, "byte 25: versión menor");
assert.equal(view.getUint16(94, true), 227, "byte 94: la cabecera de una 1.2 mide 227");
assert.equal(survey[104], 1, "byte 104: formato de registro de punto");
assert.equal(view.getUint16(105, true), 28, "byte 105: el formato 1 ocupa 28 bytes");
assert.equal(view.getUint32(107, true), 5_000, "byte 107: conteo heredado de 32 bits");

// ---------------------------------------------------------------------------
// Las coordenadas salen exactas
// ---------------------------------------------------------------------------

const header = readLasHeader({ las: survey, name: "levantamiento.las" });
assert.equal(header.pointCount, 5_000, "los 5000 puntos declarados");
assert.equal(header.scale.x, 0.001, "escala de un milímetro");
assert.equal(header.offset.x, 660_000, "desplazamiento en el este");

const cloud = readLas({ las: survey, name: "levantamiento.las", withIntensity: true });
assert.equal(cloud.x.length, 5_000, "una abscisa por punto");
assert.ok(cloud.x instanceof Float64Array, "las coordenadas salen en arreglos tipados");
assert.ok(cloud.intensity instanceof Uint16Array, "y la intensidad también, cuando se pide");

// Cada coordenada tiene que ser exactamente entero × escala + desplazamiento.
// Se recalcula aquí a partir de los bytes crudos, sin volver a usar el lector.
const dataOffset = view.getUint32(96, true);
let worstCoordinateErrorM = 0;
for (const index of [0, 1, 7, 999, 4_999]) {
  const at = dataOffset + index * 28;
  worstCoordinateErrorM = Math.max(
    worstCoordinateErrorM,
    Math.abs(cloud.x[index] - (view.getInt32(at, true) * 0.001 + 660_000)),
    Math.abs(cloud.y[index] - (view.getInt32(at + 4, true) * 0.001 + 2_140_000)),
    Math.abs(cloud.z[index] - view.getInt32(at + 8, true) * 0.001),
  );
}
assert.equal(worstCoordinateErrorM, 0, "la escala y el desplazamiento se aplican exactos");

// El volumen medido tiene que caber en el declarado: es la comprobación que
// caza una longitud de registro equivocada.
assert.ok(
  cloud.measuredBounds.minX >= header.bounds.minX && cloud.measuredBounds.maxX <= header.bounds.maxX,
  "los puntos caben en el volumen declarado",
);
// Y la nube tiene que ocupar de verdad el cuadrado de un kilómetro que se pidió.
assert.ok(
  cloud.measuredBounds.maxX - cloud.measuredBounds.minX > 900,
  `la nube abarca ${cloud.measuredBounds.maxX - cloud.measuredBounds.minX} m en el este`,
);

// Clasificación ASPRS: suelo, vegetación baja y edificio, repartidas.
const classes = new Set(cloud.classification);
assert.deepEqual([...classes].sort((a, b) => a - b), [2, 3, 6], "las tres clases del levantamiento");

// El sistema de referencia se LEE de las claves GeoTIFF del archivo.
assert.equal(cloud.crsSource, "geokey", "el sistema viene de la clave GeoTIFF 3072");
assert.equal(cloud.crs?.id, "EPSG:32614", "y es la zona 14N sobre WGS84");

// Sin claves no hay sistema, y no se inventa uno.
const anonymous = readLas({ las: buildLasBytes({ count: 10 }) });
assert.equal(anonymous.crsSource, "ninguno", "sin declaración no hay sistema");
assert.equal(anonymous.crs, undefined, "y desde luego no se supone WGS84");

// Un sistema declarado que este producto NO soporta se anota, no se lanza: las
// coordenadas del archivo siguen siendo las del archivo. Lo que se impide es
// suponer, y por eso `crs` queda sin resolver y el motivo queda escrito.
const nad83 = readLas({ las: buildLasBytes({ count: 10, epsg: 26_914 }) });
assert.equal(nad83.crs, undefined, "EPSG:26914 (NAD83) no se resuelve");
assert.ok(nad83.crsRejection?.includes("26914"), "y el motivo nombra el código");

// LAS 1.4 con el conteo de 64 bits y el formato 6, que mueve la clasificación.
const modern = readLas({ las: buildLasBytes({ count: 300, pointFormat: 6, versionMinor: 4 }) });
assert.equal(modern.header.versionMinor, 4, "LAS 1.4");
assert.equal(modern.x.length, 300, "el conteo de 64 bits manda en la 1.4");
assert.deepEqual(
  [...new Set(modern.classification)].sort((a, b) => a - b),
  [2, 3, 6],
  "en el formato 6 la clasificación tiene byte propio, el 16",
);

// ---------------------------------------------------------------------------
// Fallo cerrado
// ---------------------------------------------------------------------------

// EL CASO QUE MÁS SE VA A DAR: un .laz al que alguien le cambió la extensión.
const laz = rejects(
  () => readLas({ las: buildLasBytes({ count: 100, pretendCompressed: true }), name: "nube.las" }),
  "variante-no-soportada",
  "LAZ disfrazado de LAS",
);
assert.ok(laz.message.includes("LASzip"), "el mensaje tiene que nombrar el códec");
assert.ok(laz.message.includes("las2las"), "y decir con qué herramienta se descomprime");

rejects(
  () => readLas({ las: mutated(survey, (_, bytes) => { bytes[0] = 0x5a; }) }),
  "formato-desconocido",
  "firma que no es LASF",
);
rejects(
  () => readLas({ las: mutated(survey, (_, bytes) => { bytes[25] = 9; }) }),
  "variante-no-soportada",
  "LAS 1.9, que no existe",
);
// Formato 4: lleva la forma de onda completa del retorno del láser.
rejects(
  () => readLas({ las: mutated(survey, (_, bytes) => { bytes[104] = 4; }) }),
  "variante-no-soportada",
  "formato con forma de onda",
);

// Archivo cortado. Media nube parece una nube.
const truncated = rejects(
  () => readLas({ las: survey.slice(0, survey.byteLength - 500), name: "nube.las" }),
  "archivo-truncado",
  "LAS cortado a la mitad",
);
assert.ok(
  truncated.message.includes("falta terreno"),
  "el mensaje tiene que decir la consecuencia, no sólo que faltan bytes",
);

// Longitud de registro menor que la que exige el formato: los campos se
// solaparían y saldrían coordenadas creíbles y falsas.
rejects(
  () => readLas({ las: mutated(survey, (v) => v.setUint16(105, 20, true)) }),
  "longitud-incoherente",
  "longitud de registro por debajo del mínimo del formato",
);
// Escala cero: multiplicaría toda la nube por cero y la dejaría en un punto.
rejects(
  () => readLas({ las: mutated(survey, (v) => v.setFloat64(131, 0, true)) }),
  "longitud-incoherente",
  "factor de escala nulo",
);

// Volumen declarado que no contiene los puntos: el archivo se contradice.
rejects(
  () => readLas({ las: mutated(survey, (v) => v.setFloat64(179, 660_100, true)) }),
  "geometria-invalida",
  "puntos fuera del volumen declarado",
);

// Tope de puntos: el archivo es válido y se declara demasiado grande.
rejects(
  () => readLas({ las: survey, maxPoints: 100 }),
  "demasiado-grande",
  "más puntos que el tope",
);

console.log(
  `las: ${cloud.x.length} puntos leídos exactos (error ${worstCoordinateErrorM} m), ` +
    `sistema ${cloud.crs?.id} leído del archivo, LAS 1.4 formato 6 verificado y ` +
    "10 averías rechazadas con su código — LAZ incluido",
);
