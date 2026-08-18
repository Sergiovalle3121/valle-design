/**
 * La matriz del corpus externo no puede quedarse obsoleta EN SILENCIO.
 *
 * `docs/cad/evidence/dxf-external-corpus-matrix.json` es una afirmación sobre
 * qué entra, qué degrada y qué se pierde. Una afirmación así, escrita en un
 * archivo que nadie ejecuta, envejece en cuanto alguien toca el lector — y
 * envejece hacia el optimismo, porque nadie regenera un documento para
 * empeorarlo. Este spec vuelve a MEDIR el corpus con el lector y el escritor
 * reales y compara con lo comprometido: si divergen, falla y dice cómo
 * regenerar.
 *
 * Además fija tres invariantes que la matriz no puede perder aunque se
 * regenere:
 *
 *   1. La limitación —«corpus SINTÉTICO»— sigue dentro del artefacto. Sin ella
 *      la matriz se leería como cobertura del mundo real, que es exactamente la
 *      afirmación que no tenemos derecho a hacer.
 *   2. Cada veredicto lleva su criterio publicado. Una tabla de compatibilidad
 *      sin el criterio es una opinión.
 *   3. Nada se pierde EN SILENCIO. Es el número que este trabajo bajó de cinco
 *      a cero, y el que no puede volver a subir sin que alguien lo vea.
 *
 * Correr:  npx tsx src/lib/cad/dxf-external-corpus.spec.ts
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { CAD_DXF_EXTERNAL_CORPUS } from "./dxf-external-corpus";
import {
  buildCadDxfExternalCorpusMatrix,
  type CadDxfExternalCorpusMatrix,
  type CadDxfMatrixEntityRow,
} from "./dxf-external-corpus-matrix";

const ARTIFACT = path.resolve(
  process.cwd(),
  "../../docs/cad/evidence/dxf-external-corpus-matrix.json",
);
const REGENERATE = "node scripts/cad/build-dxf-external-corpus.mjs";

const measured = buildCadDxfExternalCorpusMatrix();

// --- 1. el corpus cubre lo que trae un plano de arquitectura ----------------
{
  assert.ok(CAD_DXF_EXTERNAL_CORPUS.length >= 15, "el corpus no puede encoger sin que se note");
  const ids = CAD_DXF_EXTERNAL_CORPUS.map((file) => file.id);
  assert.equal(new Set(ids).size, ids.length, "los identificadores del corpus son únicos");

  // Las formas ajenas que un lector escrito contra sus propios ficheros nunca
  // pone a prueba. Cada una es un archivo del corpus y una suposición menos.
  const dialects = CAD_DXF_EXTERNAL_CORPUS.map((file) => file.dialect).join(" | ");
  for (const version of ["AC1009", "AC1015", "AC1021", "AC1027", "AC1032"])
    assert.ok(dialects.includes(version), `falta un dialecto de versión ${version}`);
  assert.ok(
    CAD_DXF_EXTERNAL_CORPUS.some((file) => file.content.includes("\r\n")),
    "hace falta al menos un archivo con finales de línea de Windows",
  );
  assert.ok(
    CAD_DXF_EXTERNAL_CORPUS.some((file) => /\n\s{2,}\d+\s*\n/.test(file.content)),
    "hace falta un archivo con códigos de grupo con relleno",
  );
  assert.ok(
    CAD_DXF_EXTERNAL_CORPUS.some((file) => /E[+-]\d/i.test(file.content)),
    "hace falta un archivo con coordenadas en notación científica",
  );
  assert.ok(
    CAD_DXF_EXTERNAL_CORPUS.some((file) => /[ÁÉÍÓÚÑáéíóúñ]/.test(file.content)),
    "hace falta un archivo con capas acentuadas",
  );

  // Lo que trae un plano de arquitectura real, no una demo de geometría.
  const declared = new Set(
    CAD_DXF_EXTERNAL_CORPUS.flatMap((file) => Object.keys(file.declares)),
  );
  for (const type of ["LWPOLYLINE", "SPLINE", "HATCH", "MTEXT", "DIMENSION", "INSERT"])
    assert.ok(declared.has(type), `el corpus no ejercita ${type}`);
}

// --- 2. la matriz comprometida coincide con la medición de hoy --------------
{
  assert.ok(
    fs.existsSync(ARTIFACT),
    `Falta ${ARTIFACT}. Genérala con: ${REGENERATE}`,
  );
  const committed = JSON.parse(
    fs.readFileSync(ARTIFACT, "utf8"),
  ) as CadDxfExternalCorpusMatrix;

  // Se comparan los VEREDICTOS y los recuentos, que es lo que la matriz afirma.
  // Comparar el JSON entero también valdría, pero el mensaje de fallo sería un
  // volcado de treinta kilobytes en vez de la fila que cambió.
  assert.deepEqual(
    committed.resumen,
    measured.resumen,
    `El resumen de la matriz no coincide con el comportamiento real. Regenera con: ${REGENERATE}`,
  );
  assert.deepEqual(
    committed.archivos.map((file) => file.id),
    measured.archivos.map((file) => file.id),
    `Los archivos de la matriz cambiaron. Regenera con: ${REGENERATE}`,
  );
  for (const [index, file] of measured.archivos.entries()) {
    const stored = committed.archivos[index];
    assert.equal(stored.legible, file.legible, `${file.id}: legibilidad distinta. ${REGENERATE}`);
    assert.deepEqual(
      stored.entrada.map((row) => [row.tipo, row.veredicto, row.intactos, row.declarados]),
      file.entrada.map((row) => [row.tipo, row.veredicto, row.intactos, row.declarados]),
      `${file.id}: la fidelidad de entrada cambió. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      [stored.idaYVuelta.completado, stored.idaYVuelta.entidadesTrasReexportar],
      [file.idaYVuelta.completado, file.idaYVuelta.entidadesTrasReexportar],
      `${file.id}: el ciclo de ida y vuelta cambió. Regenera con: ${REGENERATE}`,
    );
    assert.deepEqual(
      stored.avisos,
      file.avisos,
      `${file.id}: los avisos del lector cambiaron. Regenera con: ${REGENERATE}`,
    );
  }
}

// --- 3. la honestidad del artefacto no se puede regenerar fuera ------------
{
  assert.equal(measured.corpusSintetico, true);
  assert.ok(
    measured.limitacion.includes("SINTÉTICO") && measured.limitacion.includes("no acredita cobertura"),
    "la matriz DEBE declarar que su corpus es sintético y que no acredita cobertura real",
  );
  assert.ok(measured.generadoPor.includes("build-dxf-external-corpus"), measured.generadoPor);
  for (const row of measured.archivos.flatMap((file) => file.entrada)) {
    assert.ok(row.criterio.length > 40, `veredicto sin criterio publicado: ${row.tipo}`);
    if (row.veredicto === "degradado")
      assert.ok(row.degradaA, `${row.tipo}: «degradado» sin decir en qué no sirve de nada`);
  }
}

// --- 4. lo que este trabajo cerró, y no puede reabrirse en silencio --------
{
  // Antes de esta ola, 3DSOLID, MESH, REGION y LEADER desaparecían sin aviso:
  // `dxf-parser` los descarta antes del mapeador y nadie contaba lo que faltaba.
  // Cinco filas de la matriz decían «perdido EN SILENCIO». Ahora, cero.
  assert.equal(
    measured.resumen.perdidosEnSilencio,
    0,
    "una entidad que desaparece sin aviso es deuda del lector, no una limitación: " +
      `${measured.archivos
        .flatMap((file) => file.entrada.filter((row) => row.veredicto === "perdido_en_silencio").map((row) => `${file.id}:${row.tipo}`))
        .join(", ")}`,
  );
  const zoo = measured.archivos.find((file) => file.id === "foreign-unsupported-zoo");
  assert.ok(zoo, "el archivo con entidades de otras disciplinas sigue en el corpus");
  for (const type of ["3DFACE", "3DSOLID", "MESH", "REGION", "LEADER"]) {
    const row: CadDxfMatrixEntityRow | undefined = zoo!.entrada.find(
      (entry) => entry.tipo === type,
    );
    assert.ok(row, `${type} debe estar evaluado`);
    assert.equal(row!.veredicto, "perdido_declarado", `${type} debe perderse DICIÉNDOLO`);
  }

  // Y el archivo truncado: lo que se comprueba no es que entre, sino que el
  // fallo sea explícito y no un dibujo vacío que parece bueno.
  const truncated = measured.archivos.find((file) => file.id === "foreign-truncated");
  assert.equal(truncated?.legible, false, "un archivo cortado no puede darse por bueno");
  assert.equal(truncated?.idaYVuelta.completado, false);
}

console.log(
  `dxf-external-corpus: ${measured.resumen.archivos} archivos sintéticos, ` +
    `${measured.resumen.tiposEvaluados} tipos evaluados — ${measured.resumen.intactos} intactos, ` +
    `${measured.resumen.degradados} degradados, ${measured.resumen.perdidosDeclarados} perdidos ` +
    `declarados, ${measured.resumen.perdidosEnSilencio} perdidos en silencio; la matriz comprometida ` +
    "coincide con el comportamiento real",
);
