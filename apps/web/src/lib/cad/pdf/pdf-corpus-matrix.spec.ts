/**
 * La matriz del corpus de PDF no puede quedarse obsoleta EN SILENCIO.
 *
 * `docs/cad/evidence/pdf-import-corpus-matrix.json` es una afirmación sobre qué
 * entra, qué degrada y qué se pierde al importar un PDF. Una afirmación así,
 * escrita en un archivo que nadie ejecuta, envejece en cuanto alguien toca el
 * importador — y envejece hacia el optimismo, porque nadie regenera un documento
 * para empeorarlo. Este spec vuelve a MEDIR el corpus con el importador real y
 * compara con lo comprometido: si divergen, falla y dice cómo regenerar.
 *
 * Además fija los invariantes que la matriz no puede perder aunque se regenere:
 *
 *   1. La limitación —«corpus SINTÉTICO»— sigue dentro del artefacto. Sin ella
 *      la matriz se leería como cobertura del mundo real, que es exactamente la
 *      afirmación que no tenemos derecho a hacer.
 *   2. Cada veredicto lleva su criterio publicado, y cada `degradado` dice en
 *      qué degrada. Una tabla de compatibilidad sin el criterio es una opinión.
 *   3. Nada se pierde EN SILENCIO.
 *   4. El corpus cubre las formas de PDF que el encargo exige, y ninguna
 *      desaparece sin que se note.
 *
 * Correr:  npx tsx src/lib/cad/pdf/pdf-corpus-matrix.spec.ts
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { cadPdfCorpus } from "./pdf-corpus";
import {
  buildCadPdfCorpusMatrix,
  type CadPdfCorpusMatrix,
} from "./pdf-corpus-matrix";

const ARTIFACT = path.resolve(
  process.cwd(),
  "../../docs/cad/evidence/pdf-import-corpus-matrix.json",
);
const REGENERATE = "node scripts/cad/build-pdf-import-corpus.mjs";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const measured = buildCadPdfCorpusMatrix();

// --- 1. el corpus cubre las formas que un despacho recibe -------------------
{
  const corpus = cadPdfCorpus();
  ok(corpus.length >= 14, "el corpus no puede encoger sin que se note");
  const ids = corpus.map((file) => file.id);
  assert.equal(new Set(ids).size, ids.length, "los identificadores del corpus son únicos");
  checks += 1;

  // Las formas que exige el encargo. Cada una es un archivo y una suposición
  // menos del lector.
  const shapes = corpus.map((file) => `${file.id} ${file.shape}`).join(" | ");
  for (const [needle, what] of [
    ["vector", "PDF vectorial de CAD"],
    ["compressed", "flujo comprimido"],
    ["uncompressed", "flujo sin comprimir"],
    ["text-embedded", "texto incrustado"],
    ["text-as-curves", "texto en curvas"],
    ["scanned", "PDF escaneado"],
    ["optional-content", "capas opcionales (OCG)"],
    ["multipage", "multipágina"],
    ["shifted-mediabox", "MediaBox desplazado"],
    ["rotated-90", "página girada 90°"],
    ["object-streams", "objetos comprimidos"],
  ] as const)
    ok(shapes.includes(needle), `el corpus no ejercita: ${what}`);

  // Y los archivos son PDF de verdad, no maquetas: empiezan por su cabecera y
  // terminan por su marca de fin.
  for (const file of corpus) {
    const head = String.fromCharCode(...file.bytes.subarray(0, 8));
    ok(head.startsWith("%PDF-"), `${file.id}: no empieza por %PDF-`);
    const tail = String.fromCharCode(...file.bytes.subarray(file.bytes.length - 32));
    ok(tail.includes("%%EOF"), `${file.id}: no termina en %%EOF`);
    ok(tail.includes("startxref"), `${file.id}: no lleva tabla de referencias cruzadas`);
  }
}

// --- 2. la matriz comprometida coincide con la medición de hoy -------------
{
  ok(fs.existsSync(ARTIFACT), `Falta ${ARTIFACT}. Genérala con: ${REGENERATE}`);
  const committed = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as CadPdfCorpusMatrix;

  // Se comparan los VEREDICTOS y los recuentos, que es lo que la matriz afirma.
  // El bloque de rendimiento se deja fuera a propósito: son milisegundos de una
  // máquina compartida y compararlos convertiría este spec en ruido.
  assert.deepEqual(
    committed.resumen,
    measured.resumen,
    `El resumen de la matriz no coincide con el comportamiento real. Regenera con: ${REGENERATE}`,
  );
  checks += 1;
  assert.deepEqual(
    committed.archivos.map((file) => file.id),
    measured.archivos.map((file) => file.id),
    `Los archivos de la matriz cambiaron. Regenera con: ${REGENERATE}`,
  );
  checks += 1;

  for (const [index, file] of measured.archivos.entries()) {
    const stored = committed.archivos[index];
    assert.equal(stored.legible, file.legible, `${file.id}: legibilidad distinta. ${REGENERATE}`);
    assert.deepEqual(
      stored.error,
      file.error,
      `${file.id}: el motivo del rechazo cambió. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      stored.entrada.map((row) => [row.tipo, row.veredicto, row.intactos, row.declarados]),
      file.entrada.map((row) => [row.tipo, row.veredicto, row.intactos, row.declarados]),
      `${file.id}: la fidelidad de entrada cambió. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      stored.avisos,
      file.avisos,
      `${file.id}: los avisos del importador cambiaron. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      stored.curvas,
      file.curvas,
      `${file.id}: el error de las curvas cambió. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      stored.capasOpcionales,
      file.capasOpcionales,
      `${file.id}: las capas opcionales cambiaron. Regenera con: ${REGENERATE}`,
    );
    checks += 6;
  }
}

// --- 3. la honestidad del artefacto no se puede regenerar fuera ------------
{
  assert.equal(measured.corpusSintetico, true);
  checks += 1;
  ok(
    measured.limitacion.includes("SINTÉTICO") && measured.limitacion.includes("no acredita cobertura"),
    "la matriz DEBE declarar que su corpus es sintético y que no acredita cobertura real",
  );
  ok(
    measured.limitacion.includes("bloques ALMACENADOS"),
    "y DEBE declarar el límite de su propia compresión, que es el que un lector podría dar por cubierto",
  );
  ok(
    measured.alcance.includes("VECTORES") && measured.alcance.includes("escaneada"),
    "el alcance tiene que decir que se importan vectores y NO imágenes escaneadas",
  );
  ok(measured.generadoPor.includes("build-pdf-import-corpus"), measured.generadoPor);

  for (const row of measured.archivos.flatMap((file) => file.entrada)) {
    ok(row.criterio.length > 60, `veredicto sin criterio publicado: ${row.tipo}`);
    if (row.veredicto === "degradado")
      ok(!!row.degradaA, `${row.tipo}: «degradado» sin decir en qué no sirve de nada`);
  }

  // El rendimiento va con la máquina declarada y con su mediana: una cifra
  // suelta sin máquina no es una medida, es una anécdota.
  ok(measured.rendimiento.medianaDe === 3, "el rendimiento se publica como mediana de 3");
  ok(
    measured.rendimiento.maquina.includes("Ryzen") && measured.rendimiento.maquina.includes("Node"),
    "el rendimiento tiene que declarar la máquina y el runtime",
  );
  ok(
    measured.rendimiento.archivos.length === measured.archivos.length,
    "el rendimiento cubre todo el corpus",
  );
  ok(
    measured.rendimiento.archivos.every((entry) => entry.medianaMs >= 0 && entry.bytes > 0),
    "toda medida de rendimiento tiene su tamaño y su tiempo",
  );
}

// --- 4. nada se pierde en silencio -----------------------------------------
{
  assert.equal(
    measured.resumen.perdidosEnSilencio,
    0,
    "Hay contenido que NO entra y que el importador no menciona. Eso es deuda del lector, " +
      "no una limitación asumida: o se importa, o se declara.",
  );
  checks += 1;

  // Y lo que se declara perdido, se declara DE VERDAD: cada fila
  // `perdido_declarado` tiene detrás o un aviso o un error tipado.
  for (const file of measured.archivos) {
    const declared = file.entrada.filter((row) => row.veredicto === "perdido_declarado");
    if (declared.length === 0) continue;
    ok(
      file.error !== null || Object.keys(file.avisos).length > 0,
      `${file.id}: declara pérdidas sin un solo aviso ni error que las respalde`,
    );
  }
}

// --- 5. las tres promesas del entregable, leídas desde la matriz -----------
{
  const scanned = measured.archivos.find((file) => file.id === "scanned-image-only")!;
  ok(!scanned.legible, "un PDF escaneado NO se importa");
  ok(
    scanned.error?.codigo === "scanned_image" &&
      scanned.error.mensaje.includes("PDFATTACH"),
    "y se rechaza con su código, remitiendo a la plantilla de fondo",
  );

  const glyphs = measured.archivos.find((file) => file.id === "text-glyph-indices")!;
  ok(
    glyphs.entrada.some(
      (row) => row.tipo === "TEXT_GLYPH_INDICES" && row.veredicto === "perdido_declarado",
    ),
    "un rótulo irrecuperable se declara perdido, no se inventa",
  );
  ok(glyphs.legible, "pero el resto del plano SÍ entra: se pierde el texto, no el dibujo");

  const curves = measured.archivos.find((file) => file.id === "cad-vector-uncompressed")!;
  ok(!!curves.curvas, "el archivo con curvas publica su fidelidad");
  ok(
    curves.curvas!.errorMaximoMedidoUnidades <= curves.curvas!.toleranciaUnidades,
    "el error MEDIDO no puede superar la tolerancia declarada",
  );
  ok(
    curves.curvas!.errorMaximoMedidoUnidades > 0,
    "y no puede ser cero: aplanar una curva SIEMPRE desvía algo, y fingir lo contrario sería el claim falso",
  );

  // El PDF moderno entra igual que el clásico: es la prueba de que los objetos
  // comprimidos no se quedaron fuera.
  const modern = measured.archivos.find((file) => file.id === "object-streams-1-5")!;
  ok(modern.legible, "un PDF 1.5 con las páginas en un objeto comprimido tiene que entrar");
}

console.log(`pdf-corpus-matrix.spec.ts ✅ ${checks} comprobaciones`);
