#!/usr/bin/env node
/**
 * Spec del arnés de re-escritura del corpus.
 *
 * LO QUE HAY QUE PROBAR AQUÍ NO ES QUE EL WRITER ESCRIBA. Es que el arnés
 * SEPA VER LA PÉRDIDA. Un medidor que sólo sabe decir «todo bien» no mide
 * nada: el valor entero está en los gemelos tristes —un campo que se cae, un
 * arreglo que encoge, un valor que se aparta del oráculo, una clase que el
 * writer rechaza— y en que cada uno de ellos mueva la fila de la matriz al
 * estado que le toca.
 *
 * Por eso la mitad de esta spec no toca el corpus: fabrica entidades a mano,
 * las estropea a propósito y exige que el comparador lo note. La otra mitad
 * corre el arnés COMPLETO sobre los archivos ajenos y comprueba tres cosas que
 * sólo se pueden ver ahí: que la aritmética de la matriz cierra, que el
 * informe es DETERMINISTA (mismo corpus → mismo JSON salvo el bloque de
 * entorno) y que el límite del método viaja escrito en el propio informe.
 *
 * Sin corpus a mano la spec NO se pone verde de mentira: corre lo que puede,
 * lo dice en la línea final, y además exige que el arnés falle CERRADO —error
 * tipado del gate— en vez de devolver un informe vacío que parezca correcto.
 */
import assert from "node:assert/strict";
import {
  anchorAgainstOracle,
  deepDiff,
  emptyClassRow,
  oracleFieldDiffs,
  projectForOracle,
  resolveClassState,
} from "./corpus-rewrite-compare.mjs";
import { runCorpusRewrite } from "./corpus-rewrite.mjs";
import { loadCorpusPin, resolveCorpusSource, DwgCorpusGateError } from "./corpus-consumer.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

// ---------------------------------------------------------------------------
// 1. El comparador campo a campo: lo que importa es que DETECTE
// ---------------------------------------------------------------------------

const line = (end = { x: 10, y: 0, z: 0 }) => ({
  kind: "line",
  start: { x: 0, y: 0, z: 0 },
  end,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
});

eq(deepDiff(line(), line()), [], "dos entidades iguales no producen diferencias");

eq(
  deepDiff(line(), { ...line(), end: { x: 10 + 1e-9, y: 0, z: 0 } }),
  [],
  "una diferencia por debajo de la tolerancia declarada no es una diferencia",
);

const moved = deepDiff(line(), { ...line(), end: { x: 10.5, y: 0, z: 0 } });
eq(moved.length, 1, "una coordenada movida es UNA diferencia");
eq(moved[0].campo, "end.x", "y la diferencia dice qué campo exactamente");

// EL CASO QUE JUSTIFICA LA COMPARACIÓN PROFUNDA: un writer que dejara de
// emitir un campo. Con una lista de campos escrita a mano esto pasaría
// desapercibido hasta que alguien se acordara de añadirlo.
const dropped = deepDiff(line(), { kind: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } });
ok(
  dropped.some((difference) => difference.campo === "thickness"),
  "un campo que el releído ya no trae aparece como diferencia",
);
ok(
  dropped.some((difference) => difference.campo.startsWith("extrusion")),
  "y también el objeto anidado que desapareció entero",
);

const shrunk = deepDiff(
  { kind: "lwpolyline", vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
  { kind: "lwpolyline", vertices: [{ x: 0, y: 0 }] },
);
eq(shrunk.length, 1, "un arreglo que encoge es UNA diferencia, no una por índice");
eq(shrunk[0].campo, "vertices", "y se reporta en el arreglo, no dentro de él");

// ---------------------------------------------------------------------------
// 2. La proyección al vocabulario del oráculo
// ---------------------------------------------------------------------------

const arc = {
  kind: "arc",
  center: { x: 1, y: 2, z: 0 },
  radius: 5,
  startAngle: 0,
  endAngle: Math.PI,
  thickness: 0,
  extrusion: { x: 0, y: 0, z: 1 },
};
eq(
  projectForOracle(arc),
  { center: [1, 2, 0], radius: 5, startAngle: 0, endAngle: Math.PI },
  "un ARC se proyecta a los campos que el helper del oráculo entrega, ni uno más",
);
eq(
  projectForOracle({ kind: "spline", degree: 3 }),
  {},
  "una clase que el writer no emite no inventa campos proyectados",
);

const insertProjection = projectForOracle(
  {
    kind: "insert",
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    extrusion: { x: 0, y: 0, z: 1 },
    attributesFollow: false,
  },
  [...Buffer.from("marco-a", "latin1")],
);
eq(insertProjection.block, "MARCO-A", "el nombre del bloque insertado viaja en mayúsculas, como el oráculo");

// El ATTRIB se proyecta con la ETIQUETA, que es lo que lo separa de un TEXT
// suelto: sin ella, un atributo mal escrito se anclaría contra el texto de al
// lado y el informe diría que volvió.
const attribProjection = projectForOracle({
  kind: "attrib",
  insertion: { x: 15, y: 30 },
  height: 5,
  valueBytes: [...Buffer.from("PLANTA BAJA", "latin1")],
  tagBytes: [...Buffer.from("PLANO", "latin1")],
});
eq(attribProjection.tag, "PLANO", "el ATTRIB proyecta su etiqueta para el oráculo");
eq(attribProjection.value, "PLANTA BAJA", "y su valor");
eq(
  oracleFieldDiffs(
    { tag: "PLANO", value: "PLANTA BAJA" },
    { tag: "ESCALA", value: "PLANTA BAJA" },
  ).length,
  1,
  "un atributo con OTRA etiqueta y el mismo valor no se da por anclado",
);

eq(
  oracleFieldDiffs({ radius: 5 }, { radius: 5 + 1e-9 }),
  [],
  "el anclaje usa la misma tolerancia declarada",
);
eq(
  oracleFieldDiffs({ radius: 5 }, { radius: 6 }).length,
  1,
  "y un radio distinto del que declara el oráculo sí es una diferencia",
);

// ---------------------------------------------------------------------------
// 3. El anclaje: nada desaparece del informe
// ---------------------------------------------------------------------------

const expectedCircle = (radius, layer = "MUROS") => ({
  kind: "circle",
  layer,
  fields: { center: [0, 0, 0], radius },
});
const actualCircle = (radius, layer = "MUROS") => ({
  kind: "circle",
  layer,
  fields: { center: [0, 0, 0], radius },
});

let anchorDiffs = [];
let table = anchorAgainstOracle([expectedCircle(5)], [actualCircle(5)], "model-space", anchorDiffs);
eq(table.circle.ancladas, 1, "un valor que coincide con el oráculo queda anclado");
eq(anchorDiffs.length, 0, "y no genera discrepancia");

anchorDiffs = [];
table = anchorAgainstOracle([expectedCircle(5)], [actualCircle(7)], "model-space", anchorDiffs);
eq(table.circle.valorDistinto, 1, "un valor que se aparta del oráculo se cuenta como tal");
eq(anchorDiffs[0].problema, "valor-distinto-del-oraculo", "y viaja como discrepancia nombrada");

anchorDiffs = [];
table = anchorAgainstOracle([expectedCircle(5)], [], "model-space", anchorDiffs);
eq(table.circle.sinAnclar, 1, "lo que el oráculo declara y no escribimos queda SIN ANCLAR, no desaparece");

anchorDiffs = [];
table = anchorAgainstOracle([], [actualCircle(5)], "model-space", anchorDiffs);
eq(table.circle.releidasSinPareja, 1, "y una entidad nuestra que la fuente ajena no declaraba es discrepancia");
eq(
  anchorDiffs[0].problema,
  "releida-sin-correspondencia-en-el-oraculo",
  "con su nombre propio, porque significa que inventamos geometría",
);

anchorDiffs = [];
table = anchorAgainstOracle(
  [expectedCircle(5, "MUROS")],
  [actualCircle(5, "EJES")],
  "model-space",
  anchorDiffs,
);
eq(table.circle.ancladas, 0, "la CAPA es parte del anclaje: la geometría correcta en otra capa no cuadra");

// ---------------------------------------------------------------------------
// 4. Los tres estados de una fila, y lo que NO decide el estado
// ---------------------------------------------------------------------------

const row = (overrides) => ({ ...emptyClassRow(), ...overrides });

eq(
  resolveClassState(row({ vistas: 3, escritas: 0, noEscribibles: 3 })),
  "no-escribible",
  "ninguna instancia escrita: la clase no es escribible",
);
eq(
  resolveClassState(row({ vistas: 3, escritas: 3, releidasIguales: 3, ancladasAlOraculo: 3 })),
  "regrabada-integra",
  "todo escrito, todo releído igual y anclado: íntegra",
);
eq(
  resolveClassState(row({ vistas: 4, escritas: 2, noEscribibles: 2, releidasIguales: 2 })),
  "regrabada-con-perdida-declarada",
  "una parte rechazada por el writer: pérdida declarada",
);
eq(
  resolveClassState(row({ vistas: 2, escritas: 2, releidasIguales: 1, releidasConDiferencia: 1 })),
  "regrabada-con-perdida-declarada",
  "un campo distinto al releer también es pérdida declarada",
);
eq(
  resolveClassState(row({ vistas: 2, escritas: 2, releidasIguales: 2, valorDistintoDelOraculo: 1 })),
  "regrabada-con-perdida-declarada",
  "y un valor que el oráculo desmiente, igual",
);
// El vocabulario del oráculo no es el del modelo neutral (una POLYLINE 2D del
// DXF se proyecta a `lwpolyline` y en el DWG llega como `polyline2d`), así que
// un esperado sin anclar puede pertenecer a OTRA clase: no puede degradar esta.
eq(
  resolveClassState(
    row({ vistas: 2, escritas: 2, releidasIguales: 2, declaradasPorOraculoSinAnclar: 5 }),
  ),
  "regrabada-integra",
  "un esperado del oráculo sin anclar NO degrada una clase que se regrabó entera",
);

// ---------------------------------------------------------------------------
// 5. Sin corpus, fallo CERRADO: nunca un informe vacío que parezca correcto
// ---------------------------------------------------------------------------

let closed = null;
try {
  await runCorpusRewrite({ env: { PATH: process.env.PATH ?? "" } });
} catch (error) {
  closed = error;
}
ok(closed instanceof DwgCorpusGateError, "sin origen de corpus el arnés lanza el error tipado del gate");
eq(closed.code, "CORPUS_TRANSPORT_FAILED", "con su código, no con una frase");

// ---------------------------------------------------------------------------
// 6. El arnés completo sobre los archivos ajenos (si hay corpus)
// ---------------------------------------------------------------------------

const pin = loadCorpusPin();
const { transport } = resolveCorpusSource({ pin });
let alcance = `sin ${pin.mirrorEnv}: la parte de corpus no corrió`;

if (transport !== null) {
  const first = await runCorpusRewrite();
  ok(first.resumen.archivos > 0, "el arnés encuentra fixtures admitidos que re-escribir");
  eq(
    first.resumen.abiertos,
    first.resumen.archivos,
    "el lector abre todos los fixtures ajenos antes de re-escribirlos",
  );
  eq(
    first.resumen.reescritos,
    first.resumen.archivos,
    "y el writer arma un archivo propio para cada uno",
  );
  eq(
    first.resumen.releidos,
    first.resumen.archivos,
    "y nuestro lector abre cada archivo propio",
  );

  // Aritmética de la matriz: ninguna fila puede contar más de lo que vio.
  const estados = new Set(["regrabada-integra", "regrabada-con-perdida-declarada", "no-escribible"]);
  let vistas = 0;
  let escritas = 0;
  for (const [kind, cell] of Object.entries(first.matrizPorClase)) {
    ok(estados.has(cell.estado), `la fila ${kind} declara uno de los tres estados`);
    eq(
      cell.escritas + cell.noEscribibles,
      cell.vistas,
      `la fila ${kind} cierra: escritas + no escribibles = vistas`,
    );
    eq(
      cell.releidasIguales + cell.releidasConDiferencia,
      cell.escritas,
      `la fila ${kind} cierra: lo releído suma lo escrito`,
    );
    if (cell.estado === "no-escribible") {
      eq(cell.escritas, 0, `la fila ${kind} dice no-escribible y no escribió nada`);
    }
    if (cell.estado !== "regrabada-integra") {
      ok(cell.motivos.length > 0, `la fila ${kind} no está íntegra y DECLARA por qué`);
    }
    vistas += cell.vistas;
    escritas += cell.escritas;
  }
  eq(first.resumen.entidadesVistas, vistas, "el resumen no inventa entidades: suma la matriz");
  eq(first.resumen.entidadesEscritas, escritas, "ni entidades escritas");
  ok(
    first.resumen.clasesIntegras.length + first.resumen.clasesConPerdidaDeclarada.length + first.resumen.clasesNoEscribibles.length ===
      Object.keys(first.matrizPorClase).length,
    "cada clase de la matriz cae en exactamente una de las tres listas",
  );

  // El límite del método viaja en el informe, no en la cabeza de quien lo leyó.
  ok(
    first.limiteDeclarado.includes("SIMÉTRICO"),
    "el informe declara el hueco del error simétrico entre writer y lector",
  );
  ok(
    first.limiteDeclarado.includes("oda-roundtrip.mjs"),
    "y nombra el arnés que sí lo cierra, que es acción del titular",
  );

  // Determinismo: mismo corpus → mismo JSON (el entorno y el reloj van fuera).
  const second = await runCorpusRewrite();
  eq(
    JSON.stringify(second),
    JSON.stringify(first),
    "dos corridas sobre el mismo corpus producen el MISMO informe",
  );

  alcance =
    `corpus: ${first.resumen.archivos} archivos ajenos · ${first.resumen.entidadesEscritas}/${first.resumen.entidadesVistas} entidades regrabadas (${first.resumen.porcentajeRegrabado}%) · ` +
    `${first.resumen.clasesIntegras.length} clases íntegras, ${first.resumen.clasesConPerdidaDeclarada.length} con pérdida declarada, ${first.resumen.clasesNoEscribibles.length} no escribibles`;
}

console.log(`corpus-rewrite: ${checks} comprobaciones · ${alcance}`);
