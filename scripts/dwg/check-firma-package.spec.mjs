#!/usr/bin/env node
/**
 * Spec del gate del paquete de firma.
 *
 * LO QUE HAY QUE PROBAR AQUÍ NO ES QUE EL DOCUMENTO PASE. Eso lo dice el gate
 * corriendo, y un gate que sólo sabe decir «todo bien» no protege de nada: el
 * documento pasaría igual de verde si el gate no mirara nada. El valor entero
 * está en los gemelos tristes — que cada una de las cuatro reglas MUERDA cuando
 * el documento hace justo lo que la regla persigue.
 *
 * Por eso la mayor parte de esta spec toma el documento REAL, lo estropea a
 * propósito de cinco maneras distintas —un caso inventado, un caso saltado, un
 * bloque generado que se quedó atrás, un bloque que desapareció, un porcentaje
 * escrito a mano— y exige que el gate lo note. Y la otra mitad prueba lo
 * contrario: que un número que NO es una cifra de cobertura (una fecha, una
 * versión, un número de ADR, `AC1015`) no dispare un falso positivo, porque un
 * gate ruidoso se acaba apagando.
 *
 * No toca el corpus ni la red: lee sólo artefactos committeados, así que da el
 * mismo resultado en cualquier máquina.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DOCUMENTO,
  GENERADORES,
  banderaDeclarada,
  bloquesDelDocumento,
  casosNombrados,
  cifrasEscritasAMano,
  objetoCongelado,
  perfilDeImportacion,
  prosaDelDocumento,
  reescribirBloques,
  revisarBanderas,
  revisarCasos,
  revisarDocumento,
} from "./check-firma-package.mjs";
import { CASES } from "./oda-roundtrip-cases.mjs";

let checks = 0;
const ok = (condicion, mensaje) => {
  assert.ok(condicion, mensaje);
  checks += 1;
};
const eq = (actual, esperado, mensaje) => {
  assert.deepEqual(actual, esperado, mensaje);
  checks += 1;
};
const lanza = (fn, mensaje) => {
  assert.throws(fn, mensaje);
  checks += 1;
};

const original = fs.readFileSync(DOCUMENTO, "utf8");

// ---------------------------------------------------------------------------
// 1. Leer las fuentes de producto: si cambian de forma, el gate GRITA
// ---------------------------------------------------------------------------

const perfil = perfilDeImportacion();
ok(perfil.length > 0, "el perfil de importación se lee del fuente del producto");
ok(perfil.includes("line"), "y trae las clases que el perfil declara");
ok(
  !perfil.includes("viewport"),
  "y NO trae las que el perfil deja fuera — si trajera todas, la columna no diría nada",
);

// La forma importa: un gate que devuelve una lista vacía en silencio cuando el
// fuente cambia es peor que uno que se cae, porque la matriz saldría con todo
// en «no» y nadie lo notaría.
lanza(
  () => perfilDeImportacion("const OTRA_COSA = new Set<string>([]);"),
  "sin la constante del perfil, la lectura falla ruidosamente",
);

eq(
  banderaDeclarada("export const DWG_IMPORT_FLAG: boolean = false;", "DWG_IMPORT_FLAG"),
  false,
  "una bandera apagada se lee apagada",
);
eq(
  banderaDeclarada("export const DWG_EXPORT_FLAG: boolean = true;", "DWG_EXPORT_FLAG"),
  true,
  "y una encendida se lee encendida — sin esto la regla 4 no podría morder",
);
lanza(
  () => banderaDeclarada("export const OTRA: boolean = false;", "DWG_EXPORT_FLAG"),
  "una bandera que ya no existe con ese nombre falla en vez de darse por apagada",
);

const gates = objetoCongelado(
  'export const G: T = Object.freeze({\n  uno: true,\n  dos: 0,\n  tres: "AC1015",\n});',
  "G",
);
eq([...gates.keys()], ["uno", "dos", "tres"], "los campos salen en su orden de fuente");
eq(gates.get("dos"), "0", "y con su valor literal, incluido el cero");

// ---------------------------------------------------------------------------
// 2. Las banderas: la regla que impide publicar esto DESPUÉS de encender
// ---------------------------------------------------------------------------

const apagada = (n) => `export const ${n}: boolean = false;`;
const encendida = (n) => `export const ${n}: boolean = true;`;

eq(
  revisarBanderas(apagada("DWG_IMPORT_FLAG"), apagada("DWG_EXPORT_FLAG")),
  [],
  "con las dos apagadas no hay nada que decir",
);
eq(
  revisarBanderas(encendida("DWG_IMPORT_FLAG"), apagada("DWG_EXPORT_FLAG")).length,
  1,
  "la de importación encendida es un problema",
);
eq(
  revisarBanderas(encendida("DWG_IMPORT_FLAG"), encendida("DWG_EXPORT_FLAG")).length,
  2,
  "y las dos encendidas son dos",
);

// ---------------------------------------------------------------------------
// 3. Los bloques generados
// ---------------------------------------------------------------------------

const bloques = bloquesDelDocumento(original);
eq(
  bloques.map((b) => b.clave).sort(),
  Object.keys(GENERADORES).sort(),
  "el documento lleva exactamente los bloques que hay generadores para verificar",
);

// REGRESIÓN. Un bloque recién puesto está VACÍO, y con el `\n` obligatorio a
// cada lado del cuerpo no casaba: `--write` decía «ya estaba al día» sobre un
// documento sin una sola cifra dentro. Se descubrió redactando esta página.
const vacio =
  "antes\n<!-- generado:banderas -->\n<!-- /generado:banderas -->\ndespués\n";
eq(bloquesDelDocumento(vacio).length, 1, "un bloque VACÍO también se encuentra");
eq(bloquesDelDocumento(vacio)[0].cuerpo, "", "y su cuerpo es la cadena vacía");
ok(
  reescribirBloques(vacio).includes("DWG_IMPORT_FLAG"),
  "y --write lo llena en vez de dejarlo vacío para siempre",
);

// Idempotencia: regenerar dos veces no mueve un byte. Sin esto, `--check`
// fallaría eternamente contra su propio `--write`.
eq(
  reescribirBloques(reescribirBloques(original)),
  reescribirBloques(original),
  "regenerar es idempotente",
);
eq(reescribirBloques(original), original, "y el documento committeado ya está al día");

// Un bloque cuya clave nadie genera se deja intacto pero se DENUNCIA: si se
// reescribiera en silencio, un bloque huérfano parecería verificado.
const huerfano = "<!-- generado:inventado -->\ncosas\n<!-- /generado:inventado -->\n";
eq(reescribirBloques(huerfano), huerfano, "un bloque sin generador no se toca");
ok(
  revisarDocumento(huerfano).some((p) => p.includes("sin generador")),
  "pero se declara: nadie puede verificarlo",
);

// La prosa conserva los números de línea del archivo real.
const prosa = prosaDelDocumento(original);
eq(
  prosa.split("\n").length,
  original.split("\n").length,
  "quitar los bloques no mueve el número de línea que el gate reporta",
);
ok(!prosa.includes("| `arc` |"), "y el contenido generado sí desaparece de la prosa");

// ---------------------------------------------------------------------------
// 4. Las cifras escritas a mano: lo que persigue y lo que NO
// ---------------------------------------------------------------------------

const cifras = (t) => cifrasEscritasAMano(t).map((h) => h.forma);

eq(cifras("el writer regraba el 86,9 % del corpus"), ["porcentaje"], "un porcentaje es una cifra");
eq(cifras("regraba 284/327 entidades").sort(), ["fracción N/M", "recuento de material medido"].sort(),
  "una fracción y su recuento lo son las dos");
eq(cifras("cubre 4 de 24 casos").sort(), ["«N de M»", "recuento de material medido"].sort(),
  "«N de M» también");
eq(cifras("hay 57 fixtures admitidos"), ["recuento de material medido"], "y un recuento de material");
eq(cifras("mide 74 capas y 12 clases").length, 2, "cada aparición cuenta por separado");

// Y AHORA LOS FALSOS POSITIVOS, que son los que apagan un gate:
eq(cifras("firmado el 2026-08-25 en ADR-0009 §8.2"), [], "una fecha y una sección no son cifras de cobertura");
eq(cifras("el conversor ODA File Converter 27.1 sobre AC1015 y AC1032"), [], "una versión y un formato tampoco");
eq(cifras("el tope son 16 MiB por archivo y 2 s de pared"), [], "un límite configurado no es una medición");
eq(cifras("`DWG_LIMIT_BOUNDS` sólo permite bajarlos"), [], "un nombre de constante no lleva cifra");

// La cifra DENTRO de un bloque generado no cuenta: ahí es donde tiene que estar.
const conBloque =
  "<!-- generado:banderas -->\nregraba 284/327 entidades\n<!-- /generado:banderas -->\n";
eq(cifras(conBloque), [], "una cifra dentro de un bloque generado es legítima");

// El documento REAL no lleva ninguna a mano.
eq(cifrasEscritasAMano(original), [], "la página committeada no escribe una sola cifra a mano");

// ---------------------------------------------------------------------------
// 5. Los casos: derivados del arnés, ni inventados ni saltados
// ---------------------------------------------------------------------------

eq(
  casosNombrados("el caso `figuras` y los casos `elipse` van juntos"),
  ["figuras", "elipse"],
  "se nombran con la forma «caso ‹nombre›», en singular y en plural",
);
eq(
  casosNombrados("la fila queda en `no-escribible` con transporte `local-mirror`"),
  [],
  "un token con guiones que NO va detrás de «caso» no es un caso — sin esto el gate adivinaría",
);

const nombresReales = CASES.map((c) => c.name);
const revision = revisarCasos(original);
eq(revision.inventados, [], "el documento real no inventa ningún caso");
eq(revision.omitidos, [], "y no se salta ninguno");
ok(
  nombresReales.every((n) => revision.nombrados.includes(n)),
  "los nombres que enumera son los del arnés, uno por uno",
);
eq(
  revisarCasos("el caso `vacio-publico` es el gemelo", ["vacio"]).inventados,
  [],
  "el gemelo -publico de un caso cuenta como ese caso",
);
eq(
  revisarCasos("el caso `sombreado-triple` no existe", ["vacio"]).inventados,
  ["sombreado-triple"],
  "un caso inventado se denuncia por su nombre",
);
eq(
  revisarCasos("el caso `vacio` está", ["vacio", "elipse"]).omitidos,
  ["elipse"],
  "y un caso del arnés que la página no nombra también",
);

// ---------------------------------------------------------------------------
// 6. El documento real, entero, y sus cinco gemelos tristes
// ---------------------------------------------------------------------------

eq(revisarDocumento(original), [], "el documento committeado no tiene un solo problema");

const muerde = (texto, aguja, mensaje) => {
  const problemas = revisarDocumento(texto);
  ok(problemas.some((p) => p.includes(aguja)), mensaje);
};

// (a) un caso inventado en la prosa
muerde(
  `${original}\n\nY además el caso \`sombreado-triple\` conviene correrlo.\n`,
  "NO existe en CASES",
  "inventar un caso pone el gate rojo",
);

// (b) un caso del arnés que la página deja de nombrar
const sinUno = original.replaceAll(nombresReales[nombresReales.length - 1], "otro-nombre");
muerde(sinUno, "se salta el caso", "saltarse un caso del arnés pone el gate rojo");

// (c) un bloque generado que se quedó atrás (una fila editada a mano)
const filaCambiada = original.replace("| `arc` |", "| `arco` |");
ok(filaCambiada !== original, "la fila de prueba existía en el documento");
muerde(filaCambiada, "no coincide con lo que su evidencia dice HOY", "un bloque tocado a mano pone el gate rojo");

// (d) un bloque entero que desaparece
const sinBloque = original.replace(
  /<!-- generado:matriz-por-clase[\s\S]*?<!-- \/generado:matriz-por-clase -->\n/,
  "",
);
ok(sinBloque !== original, "el bloque de la matriz existía");
muerde(sinBloque, "falta el bloque generado", "borrar una sección medida pone el gate rojo");

// (e) una cifra de cobertura escrita a mano en la prosa
muerde(
  `${original}\n\nHoy el writer regraba el 86,9 % del corpus ajeno.\n`,
  "cifra escrita a mano",
  "copiar una cifra en vez de enlazarla pone el gate rojo",
);

// Y el documento no se tocó en ninguno de los cinco: se trabajó sobre copias.
eq(fs.readFileSync(DOCUMENTO, "utf8"), original, "la spec no escribe en el documento");

console.log(
  `check-firma-package: ${checks} comprobaciones · ${bloques.length} bloques generados · ` +
    `${nombresReales.length} casos derivados de CASES · cinco mutaciones verificadas`,
);
