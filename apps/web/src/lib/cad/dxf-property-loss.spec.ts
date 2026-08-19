/**
 * Lo que se PIERDE de un DXF ajeno cuando la entidad llega y el dibujo no.
 *
 * ## Por qué este spec nace en rojo y se comitea igual
 *
 * El recuento de entidades del corpus externo sale perfecto para estos cinco
 * ficheros: entran todas las líneas, todos los bloques y todas las capas. Y aun
 * así el plano llega mal, porque el eje del pórtico aterriza continuo, el muro
 * de carga se imprime del grosor de una directriz auxiliar y la cota del
 * estructurista deja de medir. Nada de eso lo detecta contar entidades — hace
 * falta medir PROPIEDADES, y para eso hay que medir primero y arreglar después.
 *
 * Este spec fija la medición. Las sondas que hoy fallan están en `PENDIENTES`
 * con su número, no borradas: un pendiente que se cierra hay que quitarlo de la
 * lista, y un verde que se rompe vuelve a fallar. La lista sólo puede encoger.
 *
 * ## Las tres invariantes que la matriz no puede perder al regenerarse
 *
 *   1. La limitación —corpus SINTÉTICO— sigue dentro del artefacto. Sin ella la
 *      tabla se leería como compatibilidad con el mundo real.
 *   2. Cada veredicto lleva publicado su criterio. Una tabla sin criterio es
 *      una opinión con formato de dato.
 *   3. La matriz del artefacto y la que sale de medir AHORA coinciden. Un
 *      documento que nadie recalcula envejece siempre hacia el optimismo.
 *
 * Correr:  npx tsx src/lib/cad/dxf-property-loss.spec.ts
 */
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { CAD_DXF_PROPERTY_CORPUS } from "./dxf-property-corpus";
import {
  buildCadDxfPropertyMatrix,
  type CadDxfPropertyMatrix,
  type CadDxfPropertyRow,
} from "./dxf-property-matrix";

const ARTIFACT = path.resolve(
  process.cwd(),
  "../../docs/cad/evidence/dxf-property-loss-matrix.json",
);
const REGENERATE = "node scripts/cad/build-dxf-property-matrix.mjs";

const measured = buildCadDxfPropertyMatrix();
const rows = new Map<string, CadDxfPropertyRow>(
  measured.archivos.flatMap((file) => file.sondas.map((row) => [row.sonda, row] as const)),
);

/**
 * Sondas que HOY se pierden, con el veredicto medido el día que se escribió
 * esta lista. No están borradas a propósito: cada renglón es una pérdida
 * declarada y medible, y el spec falla si alguna se arregla sin quitarla de
 * aquí. Es la única forma de que la lista no pueda mentir en ninguna dirección.
 */
const PENDIENTES: Readonly<Record<string, string>> = {
  // LTYPE: ni la tabla de patrones, ni el código 6 de la capa, ni el de la
  // entidad se leen. El eje del pórtico entra continuo y nadie lo dice.
  "ltype-patron-center": "perdido_en_silencio: esperaba 31.75,-6.35,6.35,-6.35, no se lee",
  "ltype-patron-dashed": "perdido_en_silencio: esperaba 12.7,-6.35, no se lee",
  "ltype-capa-ejes": "perdido_en_silencio: esperaba CENTER, no se lee",
  "ltype-capa-muros": "perdido_en_silencio: esperaba CONTINUOUS, no se lee",
  "ltype-capa-auxiliar": "perdido_en_silencio: esperaba DASHED, no se lee",
  "ltype-entidad-origen-ejes": "perdido_en_silencio: esperaba byLayer, no se lee",
  "ltype-entidad-valor-muros": "perdido_en_silencio: esperaba DASHED, no se lee",
  "ltype-entidad-origen-muros": "perdido_en_silencio: esperaba explicit, no se lee",
  "ltype-entidad-origen-auxiliar": "perdido_en_silencio: esperaba byLayer, no se lee",
  "ltype-efectivo-ejes": "perdido_en_silencio: esperaba CENTER, no se lee",
  "ltype-efectivo-muros": "perdido_en_silencio: esperaba DASHED, no se lee",
  "ltype-efectivo-auxiliar": "perdido_en_silencio: esperaba DASHED, no se lee",
  "ltype-visor-ejes": "perdido_en_silencio: esperaba 1, 0",
  // LTSCALE: el dibujo no tiene dónde guardar su escala global y la de entidad
  // se descarta. Aunque el patrón llegase, el guion saldría del tamaño ajeno.
  "ltscale-documento": "perdido_en_silencio: esperaba 25, no se lee",
  "ltscale-entidad": "perdido_en_silencio: esperaba 0.5, no se lee",
  "ltscale-efectiva-global": "perdido_en_silencio: esperaba 25, no se lee",
  "ltscale-efectiva-entidad": "perdido_en_silencio: esperaba 12.5, no se lee",
  // Grosores: el código 370 no se lee en ningún ámbito. Todo se imprime igual.
  "lw-capa-muros": "perdido_en_silencio: esperaba 50, no se lee",
  "lw-capa-ejes": "perdido_en_silencio: esperaba 13, no se lee",
  "lw-capa-cajetin": "perdido_en_silencio: esperaba -3, no se lee",
  "lw-entidad-origen-muros": "perdido_en_silencio: esperaba byLayer, no se lee",
  "lw-entidad-origen-ejes": "perdido_en_silencio: esperaba byLayer, no se lee",
  "lw-entidad-valor-remarcado": "perdido_en_silencio: esperaba 211, no se lee",
  "lw-entidad-origen-remarcado": "perdido_en_silencio: esperaba explicit, no se lee",
  "lw-efectivo-muros": "perdido_en_silencio: esperaba 50, no se lee",
  "lw-efectivo-ejes": "perdido_en_silencio: esperaba 13, no se lee",
  "lw-efectivo-cajetin": "perdido_en_silencio: esperaba -3, no se lee",
  "lw-visor-remarcado": "perdido_en_silencio: esperaba 4.22, 0.5",
  "lw-visor-muros": "perdido_en_silencio: esperaba 1, 0.5",
  // BYBLOCK: la herencia de la inserción no existe en el modelo importado.
  "byblock-origen-linetype": "perdido_en_silencio: esperaba byBlock, no se lee",
  "byblock-origen-lineweight": "perdido_en_silencio: esperaba byBlock, no se lee",
  "byblock-insercion-linetype": "perdido_en_silencio: esperaba DASHED, no se lee",
  "byblock-insercion-lineweight": "perdido_en_silencio: esperaba 50, no se lee",
  "byblock-efectivo-linetype": "perdido_en_silencio: esperaba DASHED, no se lee",
  "byblock-efectivo-lineweight": "perdido_en_silencio: esperaba 50, no se lee",
  // La cota ajena: entra como la geometría suelta de su bloque *D. Se ve
  // igual, no mide, y el informe de importación no menciona ninguna pérdida.
  "cota-ajena-presente": "perdido_en_silencio: esperaba 1, 0",
  "cota-ajena-a": "perdido_en_silencio: esperaba 0,0, no se lee",
  "cota-ajena-b": "perdido_en_silencio: esperaba 3200,0, no se lee",
  "cota-ajena-medida": "perdido_en_silencio: esperaba 3200, no se lee",
  "cota-ajena-tipo": "perdido_en_silencio: esperaba aligned, no se lee",
  "cota-ajena-estilo": "perdido_en_silencio: esperaba ISO-25, no se lee",
  "cota-ajena-capa-lineweight": "perdido_en_silencio: esperaba 13, no se lee",
};

// --- 1. el corpus mide las tres familias del encargo ------------------------
{
  const ids = CAD_DXF_PROPERTY_CORPUS.map((file) => file.id);
  assert.equal(new Set(ids).size, ids.length, "los identificadores del corpus son únicos");
  const sondaIds = CAD_DXF_PROPERTY_CORPUS.flatMap((file) => file.probes.map((probe) => probe.id));
  assert.equal(new Set(sondaIds).size, sondaIds.length, "los identificadores de sonda son únicos");
  assert.ok(sondaIds.length >= 40, "la medición no puede encoger sin que se note");

  const kinds = new Set(CAD_DXF_PROPERTY_CORPUS.flatMap((file) => file.probes.map((p) => p.kind)));
  // Las tres familias del encargo, cada una medida en sus tres alturas: lo que
  // declara el fichero, lo que resuelve la herencia y lo que dibuja el visor.
  for (const kind of [
    "tabla.ltype.patron", "capa.linetype", "entidad.linetype.origen", "efectivo.linetype",
    "documento.ltscale", "entidad.linetype.escala", "efectivo.escala",
    "capa.lineweight", "entidad.lineweight.valor", "efectivo.lineweight",
    "visor.medioGrosorPx", "visor.linetypeIndex",
    "cota.presente", "cota.a", "cota.medida", "cota.estilo",
  ] as const)
    assert.ok(kinds.has(kind), `falta una sonda de tipo ${kind}`);

  // Cada sonda dice qué se pierde. Una fila sin esa frase es un número que
  // nadie sabe si le importa.
  for (const file of CAD_DXF_PROPERTY_CORPUS)
    for (const probe of file.probes)
      assert.ok(probe.matters.length > 20, `la sonda ${probe.id} no dice qué se pierde`);
}

// --- 2. todos los ficheros del corpus se dejan leer -------------------------
{
  for (const file of measured.archivos)
    assert.ok(file.legible, `el corpus no puede traer un fichero ilegible: ${file.id} (${file.razon})`);
}

// --- 3. las invariantes del artefacto --------------------------------------
{
  assert.ok(measured.corpusSintetico, "la matriz declara que el corpus es sintético");
  assert.ok(
    measured.limitacion.toUpperCase().includes("SINTÉTICO"),
    "la limitación tiene que seguir dentro del artefacto",
  );
  for (const veredicto of ["intacto", "solo_entrada", "perdido_declarado", "perdido_en_silencio"] as const)
    assert.ok(measured.criterios[veredicto].length > 40, `el criterio de ${veredicto} no está publicado`);
  assert.equal(measured.generadoPor, REGENERATE, "el artefacto dice cómo se regenera");
}

// --- 4. cada sonda: o está intacta, o está declarada como pendiente ---------
{
  const rotasSinDeclarar: string[] = [];
  const pendientesYaVerdes: string[] = [];
  for (const [id, row] of rows) {
    const pendiente = id in PENDIENTES;
    if (row.veredicto === "intacto" && pendiente) pendientesYaVerdes.push(id);
    if (row.veredicto !== "intacto" && !pendiente)
      rotasSinDeclarar.push(`${id} (${row.veredicto}: esperaba ${JSON.stringify(row.esperado)}, entró ${JSON.stringify(row.entrada)}, volvió ${JSON.stringify(row.idaYVuelta)})`);
  }
  assert.deepEqual(
    pendientesYaVerdes,
    [],
    `estas sondas ya pasan y siguen en PENDIENTES; quítalas de la lista: ${pendientesYaVerdes.join(", ")}`,
  );
  assert.deepEqual(
    rotasSinDeclarar,
    [],
    `pérdidas sin declarar en PENDIENTES:\n  ${rotasSinDeclarar.join("\n  ")}`,
  );
  for (const id of Object.keys(PENDIENTES))
    assert.ok(rows.has(id), `PENDIENTES nombra una sonda que ya no existe: ${id}`);
}

// --- 5. el artefacto publicado coincide con lo que se acaba de medir --------
{
  assert.ok(fs.existsSync(ARTIFACT), `falta el artefacto de la matriz. Genera con: ${REGENERATE}`);
  const published = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")) as CadDxfPropertyMatrix;
  assert.deepEqual(
    published.resumen,
    measured.resumen,
    `la matriz publicada está desfasada. Regenera con: ${REGENERATE}`,
  );
  assert.deepEqual(
    published.archivos.flatMap((file) => file.sondas.map((row) => [row.sonda, row.veredicto])),
    measured.archivos.flatMap((file) => file.sondas.map((row) => [row.sonda, row.veredicto])),
    `los veredictos publicados no son los medidos. Regenera con: ${REGENERATE}`,
  );
}

const { sondas, intactas, soloEntrada, perdidasDeclaradas, perdidasEnSilencio } = measured.resumen;
console.log(
  `dxf-property-loss: ${sondas} sondas sobre ${measured.resumen.archivos} ficheros — ` +
    `${intactas} intactas, ${soloEntrada} sólo a la entrada, ` +
    `${perdidasDeclaradas} perdidas declaradas, ${perdidasEnSilencio} perdidas EN SILENCIO. ` +
    `${Object.keys(PENDIENTES).length} pendientes declarados. ✅`,
);
