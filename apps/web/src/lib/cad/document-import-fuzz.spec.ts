/**
 * El corpus hostil y el fuzzing de importación, ejecutados en NODE.
 *
 * Este spec es la mitad barata del par. La otra —`e2e/performance/cad-import-fuzzing.spec.ts`—
 * ejecuta EL MISMO corpus dentro de Chromium y de Firefox, que es lo que la
 * rúbrica pide y lo que de verdad responde a las preguntas que dependen del
 * motor: si `__proto__` llega como propiedad propia enumerable, dónde revienta
 * la pila de `JSON.parse`, y cuántos bytes cuenta `TextEncoder` ante media
 * pareja subrogada.
 *
 * Aquí se exige lo que no depende del motor:
 *
 * 1. Que el fuzzer sea DETERMINISTA. Dos pasadas de la misma semilla tienen que
 *    dar el mismo digest y el mismo histograma. Sin eso, cualquier cifra que se
 *    publique después describe el azar de esa tarde y no el producto.
 * 2. Que NINGÚN caso escape por el error genérico. Un caso que clasifica en
 *    «desconocido» es una puerta que nadie ha revisado, aunque no haya roto
 *    nada.
 * 3. Que nadie lance algo que no sea `Error`. Una cadena lanzada a pelo rompe
 *    la promesa de error tipado aunque el texto resultante suene razonable.
 * 4. Que el corpus declarado caiga donde dice que va a caer. Un corpus hostil
 *    cuyas expectativas no se comprueban es una lista de cadenas raras.
 * 5. Que todo lo que el importador ACEPTA sobreviva a su propia serialización.
 *    Aceptar una entrada que después no se puede guardar es peor que
 *    rechazarla.
 */
import assert from "node:assert/strict";
import {
  CAD_IMPORT_FUZZ_SEED,
  classifyCadImportError,
  hostileCorpus,
  runCadImportFuzz,
  validCanonicalDocument,
} from "./document-import-fuzz";
import { importDocumentText } from "./document-import";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// El control positivo: el documento base TIENE que importar bien. Sin esto, un
// corpus que rechaza absolutamente todo pasaría los cinco puntos de arriba
// mientras el importador está roto de raíz.
const baseline = importDocumentText("plano.json", JSON.stringify(validCanonicalDocument()));
ok(baseline.format === "json", "el documento base debe reconocerse como JSON canónico");
ok(baseline.importedEntityCount === 12, `el documento base trae 12 entidades, no ${baseline.importedEntityCount}`);

// Cada caso del corpus declarado trae escrito POR QUÉ existe. Un caso sin
// motivo es un caso que dentro de un año nadie sabrá si puede borrar.
for (const hostile of hostileCorpus({ includeHuge: false }))
  ok(
    hostile.why.length > 40,
    `el caso ${hostile.id} no explica qué puerta ataca`,
  );

const run = runCadImportFuzz({ mutations: 500, includeHuge: true });

ok(
  run.deterministic,
  `el fuzzer no es determinista con la semilla ${CAD_IMPORT_FUZZ_SEED}: ${run.divergence}`,
);
ok(run.seed === CAD_IMPORT_FUZZ_SEED, "la semilla publicada debe ser la que se usó");

for (const pass of run.passes) {
  ok(pass.cases > 500, `una pasada debe ejercitar el corpus entero, no ${pass.cases} casos`);
  ok(
    pass.unknownOutcomes.length === 0,
    `${pass.unknownOutcomes.length} caso(s) escaparon por el error genérico: ` +
      pass.unknownOutcomes
        .slice(0, 3)
        .map((entry) => `${entry.id} → «${entry.message}»`)
        .join(" · "),
  );
  ok(
    pass.nonErrorThrows.length === 0,
    `alguien lanzó algo que no es Error: ${pass.nonErrorThrows.join(" · ")}`,
  );
  ok(
    pass.unexpected.length === 0,
    `${pass.unexpected.length} caso(s) del corpus declarado no cayeron donde debían: ` +
      pass.unexpected
        .slice(0, 4)
        .map((entry) => `${entry.id} esperaba ${entry.expected} y dio ${entry.got}`)
        .join(" · "),
  );
  // Un histograma con una sola clase significaría que el corpus ataca una sola
  // puerta. El valor de un corpus hostil está en su reparto.
  ok(
    Object.keys(pass.histogram).length >= 5,
    `el histograma sólo tiene ${Object.keys(pass.histogram).length} clase(s): el corpus no reparte`,
  );
}

// Round-trip: todo lo que se aceptó tiene que volver a salir idéntico.
const accepted = runCadImportFuzz({ mutations: 200, includeHuge: false, keepResults: true })
  .passes[0].results.filter((result) => result.outcome === "ok");
ok(accepted.length > 0, "ninguna entrada se aceptó: el fuzzer no está midiendo el camino feliz");
const unstable = accepted.filter((result) => result.roundTripStable !== true);
ok(
  unstable.length === 0,
  `${unstable.length} documento(s) aceptados NO sobreviven a su propia serialización: ` +
    unstable.slice(0, 3).map((result) => result.id).join(" · "),
);

// El clasificador tiene que ser capaz de decir «no sé». Si devolviera siempre
// una clase conocida, el invariante de «cero desconocidos» sería un espejo.
ok(
  classifyCadImportError("un mensaje que nadie ha escrito nunca") === "desconocido",
  "el clasificador debe reconocer lo que no conoce",
);

const histogram = run.passes[0].histogram;
console.log(
  `document-import-fuzz: ${checks} comprobaciones verdes — ` +
    `${run.passes[0].cases} casos × ${run.passes.length} pasadas, digest ${run.passes[0].digest}, ` +
    `histograma ${Object.entries(histogram)
      .map(([outcome, count]) => `${outcome}:${count}`)
      .join(" ")}`,
);
