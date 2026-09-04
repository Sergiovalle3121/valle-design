#!/usr/bin/env node
/**
 * Spec del trinquete del reparto por etapa de `architecture@100k`.
 *
 * ## Qué prueba, y por qué en las DOS direcciones
 *
 * Un verificador que sólo se comprueba contra el artefacto de hoy no está
 * probado: un verificador que dijera «pasa» siempre también pasaría esa
 * prueba. Así que aquí lo primero es lo contrario — se fabrican artefactos
 * DEGRADADOS **etapa por etapa** y se exige un rojo por cada uno, citando la
 * etapa que se pasó. Y se degrada en las tres corridas por turnos, porque un
 * verificador que sólo mirara la primera daría verde con las otras dos rotas.
 *
 * Después, las trampas que no son un reloj:
 *
 * - Un artefacto **sin `environment`** se rechaza por no declarar máquina. Es
 *   la regla que impide que una cifra de CPU en un contenedor compartido pase
 *   por una medición de la máquina del titular.
 * - Un artefacto que va más rápido **dibujando menos** (menos entidades al
 *   reposo, menos instancias residentes) se rechaza aunque todos los relojes
 *   quepan: eso no es una optimización, es un plano mal dibujado.
 * - Un artefacto medido sobre **otro corpus** se rechaza: los techos juzgarían
 *   otro dibujo.
 * - Un **presupuesto roto** —una etapa que falta, un techo que no es un
 *   número— no da verde. Un gate que no puede fallar no es un gate.
 *
 * Y el trinquete propiamente dicho: `recalcularPresupuesto` con una corrida
 * MEJOR baja el techo; con una PEOR lo deja donde estaba. Nunca sube. Es la
 * regla que impide que una regresión se «arregle» ejecutando el actualizador.
 *
 *   node scripts/perf/check-etapas-100k.spec.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUDGET_FILE,
  ESCENARIO_JUZGADO,
  ETAPAS_PRESUPUESTADAS,
  EVIDENCE_FILE,
  MARGEN_MAXIMO,
  MARGEN_MINIMO,
  componerMaquina,
  corridaJuzgada,
  mediana,
  recalcularPresupuesto,
  verificarEtapas,
} from "./check-etapas-100k.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CHECKER = path.join(AQUI, "check-etapas-100k.mjs");

let comprobaciones = 0;
const ok = (condicion, mensaje) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

/** Rechaza, y por el motivo que toca: un rechazo por otra cosa no vale. */
const rechaza = (evidencia, presupuesto, patron, mensaje) => {
  const veredicto = verificarEtapas(evidencia, presupuesto);
  assert.ok(!veredicto.passed, `${mensaje} — pero el verificador lo aceptó`);
  assert.ok(
    veredicto.violations.some((violacion) => patron.test(violacion)),
    `${mensaje} — rechazado, pero por otra razón: ${veredicto.violations.join("; ")}`,
  );
  comprobaciones += 1;
};

const clonar = (valor) => JSON.parse(JSON.stringify(valor));

// ---------------------------------------------------------------------------
// El par publicado: es el que el frente defiende de verdad
// ---------------------------------------------------------------------------

const evidenciaPublicada = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf8"));
const presupuestoPublicado = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf8"));

{
  const veredicto = verificarEtapas(evidenciaPublicada, presupuestoPublicado);
  ok(
    veredicto.passed,
    `la evidencia publicada no cabe en el presupuesto publicado: ${veredicto.violations.join("; ")}`,
  );
  ok(veredicto.filas.length > 0, "el veredicto no trae ninguna fila que enseñar");
  ok(
    evidenciaPublicada.corridas.length >= presupuestoPublicado.condiciones.corridasMinimas,
    "lo publicado no llega a las corridas mínimas que el presupuesto exige",
  );
  ok(
    evidenciaPublicada.corridas.every((corrida) => typeof corrida.runId === "string" && corrida.runId.length > 8),
    "alguna corrida publicada no trae identificador",
  );
  ok(
    typeof evidenciaPublicada.environment.declaredMachine === "string" &&
      evidenciaPublicada.environment.declaredMachine.includes("Xeon"),
    "la evidencia publicada no declara la máquina de este contenedor",
  );
  ok(
    evidenciaPublicada.corpus.matchesManifest === true &&
      evidenciaPublicada.corpus.documentSha256 === presupuestoPublicado.alcance.corpusSha256,
    "la evidencia publicada no está atada al corpus versionado del presupuesto",
  );
}

// ---------------------------------------------------------------------------
// 1. Degradación ETAPA POR ETAPA, rotando la corrida degradada
// ---------------------------------------------------------------------------

/** Pone una etapa por encima de su techo en la corrida `indice`. */
const degradarEtapa = (etapa, indice, factor = 1.2) => {
  const roto = clonar(evidenciaPublicada);
  const juzgada = corridaJuzgada(roto.corridas[indice]);
  juzgada.stages.ms[etapa] = presupuestoPublicado.etapas[etapa].ms * factor;
  return roto;
};

for (const [posicion, etapa] of ETAPAS_PRESUPUESTADAS.entries()) {
  // Cada etapa se degrada en una corrida distinta: si el verificador sólo
  // mirara la primera, alguna de estas cinco lo delataría.
  const indice = posicion % evidenciaPublicada.corridas.length;
  rechaza(
    degradarEtapa(etapa, indice),
    presupuestoPublicado,
    new RegExp(`${etapa}.*se pasa del techo`),
    `${etapa} un 20 % por encima del techo en la corrida ${indice}`,
  );
  // Y justo por encima: el techo es un tope, no una orientación.
  rechaza(
    degradarEtapa(etapa, indice, 1.000_001),
    presupuestoPublicado,
    new RegExp(`${etapa}.*se pasa del techo`),
    `${etapa} apenas por encima del techo`,
  );
}

// Justo EN el techo cabe: un trinquete que rechazara su propio techo no
// dejaría publicar la corrida que lo calibró.
for (const etapa of ETAPAS_PRESUPUESTADAS) {
  const justo = clonar(evidenciaPublicada);
  corridaJuzgada(justo.corridas[0]).stages.ms[etapa] = presupuestoPublicado.etapas[etapa].ms;
  ok(
    verificarEtapas(justo, presupuestoPublicado).passed,
    `${etapa} exactamente en el techo tendría que caber`,
  );
}

// Etapa sin milisegundos: no es verde, es un dato que falta.
{
  const roto = clonar(evidenciaPublicada);
  delete corridaJuzgada(roto.corridas[0]).stages.ms.tessellate;
  rechaza(roto, presupuestoPublicado, /tessellate no trae milisegundos/, "una etapa sin reloj");
}

// ---------------------------------------------------------------------------
// 2. Los dos totales: mover el coste no es ahorrarlo
// ---------------------------------------------------------------------------

{
  const roto = clonar(evidenciaPublicada);
  const juzgada = corridaJuzgada(roto.corridas[2]);
  // Todas las etapas presupuestadas por debajo del techo y aun así el total se
  // dispara: es exactamente el escape que `stageTotalMs` cierra.
  juzgada.stageTotalMs = presupuestoPublicado.totales.stageTotalMs.ms * 1.5;
  rechaza(
    roto,
    presupuestoPublicado,
    /stageTotalMs .* se pasa del techo/,
    "coste mudado a una etapa sin techo",
  );
  ok(
    ETAPAS_PRESUPUESTADAS.every((etapa) => juzgada.stages.ms[etapa] <= presupuestoPublicado.etapas[etapa].ms),
    "el caso del total tenía que dejar las cinco etapas dentro de techo",
  );
}

{
  const roto = clonar(evidenciaPublicada);
  corridaJuzgada(roto.corridas[1]).segmentsAtRest =
    presupuestoPublicado.totales.segmentsAtRest.instancias + 1;
  rechaza(
    roto,
    presupuestoPublicado,
    /segmentsAtRest .* se pasa del techo/,
    "el LOD pidiendo más segmentos de los presupuestados",
  );
}

// ---------------------------------------------------------------------------
// 3. Más rápido dibujando menos: la trampa clásica
// ---------------------------------------------------------------------------

{
  const roto = clonar(evidenciaPublicada);
  const juzgada = corridaJuzgada(roto.corridas[0]);
  juzgada.detailedAtRest = presupuestoPublicado.invariantes.detailedAtRest - 1;
  for (const etapa of ETAPAS_PRESUPUESTADAS) juzgada.stages.ms[etapa] = 0.1;
  juzgada.stageTotalMs = 1;
  rechaza(
    roto,
    presupuestoPublicado,
    /detailedAtRest .* no es una optimización/,
    "una corrida rapidísima que detalla una entidad menos",
  );
}

{
  const roto = clonar(evidenciaPublicada);
  corridaJuzgada(roto.corridas[1]).visibleAtRest =
    presupuestoPublicado.invariantes.visibleAtRest + 3;
  rechaza(roto, presupuestoPublicado, /visibleAtRest/, "otra vista al reposo");
}

{
  const roto = clonar(evidenciaPublicada);
  corridaJuzgada(roto.corridas[2]).stages.calls.tessellate =
    presupuestoPublicado.invariantes.callsTessellateMax + 1;
  rechaza(roto, presupuestoPublicado, /llamadas a tessellate/, "más llamadas de las calibradas");
}

{
  const roto = clonar(evidenciaPublicada);
  delete corridaJuzgada(roto.corridas[0]).stages.calls.tessellate;
  rechaza(roto, presupuestoPublicado, /stages.calls.tessellate/, "sin recuento de llamadas");
}

// Menos llamadas SÍ cabe: es trabajo ahorrado, no trabajo escondido.
{
  const mejor = clonar(evidenciaPublicada);
  for (const corrida of mejor.corridas) corridaJuzgada(corrida).stages.calls.tessellate -= 1000;
  ok(
    verificarEtapas(mejor, presupuestoPublicado).passed,
    "menos llamadas a tessellate tendrían que caber: es trabajo ahorrado",
  );
}

// ---------------------------------------------------------------------------
// 4. La máquina: sin ella no hay evidencia
// ---------------------------------------------------------------------------

{
  const sinEntorno = clonar(evidenciaPublicada);
  delete sinEntorno.environment;
  rechaza(
    sinEntorno,
    presupuestoPublicado,
    /no declara máquina/,
    "un artefacto sin `environment`",
  );
}

for (const campo of ["node", "cpuModel", "logicalCpuCount", "platform", "declaredMachine"]) {
  const roto = clonar(evidenciaPublicada);
  delete roto.environment[campo];
  rechaza(
    roto,
    presupuestoPublicado,
    new RegExp(`environment.${campo} falta`),
    `sin environment.${campo}`,
  );
}

{
  const corta = clonar(evidenciaPublicada);
  corta.environment.declaredMachine = "un contenedor";
  rechaza(corta, presupuestoPublicado, /no describe la máquina/, "una máquina declarada de siete palabras");
}

{
  const desconocida = clonar(evidenciaPublicada);
  desconocida.environment.declaredMachine = componerMaquina({ hilos: 0 });
  rechaza(
    desconocida,
    presupuestoPublicado,
    /datos desconocidos/,
    "una máquina compuesta sin datos",
  );
  ok(
    /CPU desconocida/.test(desconocida.environment.declaredMachine),
    "componerMaquina tendría que escribir «desconocida» donde falta el dato, no dejar el hueco",
  );
}

{
  const conGpu = clonar(evidenciaPublicada);
  conGpu.environment.gpu = true;
  rechaza(conGpu, presupuestoPublicado, /gpu debe ser false/, "una medida de CPU que declara GPU");

  const conNavegador = clonar(evidenciaPublicada);
  conNavegador.environment.browser = true;
  rechaza(conNavegador, presupuestoPublicado, /browser debe ser false/, "una medida de CPU que declara navegador");

  const otraClase = clonar(evidenciaPublicada);
  otraClase.environment.measurementKind = "browser-frame";
  rechaza(otraClase, presupuestoPublicado, /measurementKind/, "una medida que se declara de fotogramas");
}

// ---------------------------------------------------------------------------
// 5. Identificador de corrida y de publicación
// ---------------------------------------------------------------------------

{
  const sinPublicacion = clonar(evidenciaPublicada);
  delete sinPublicacion.publication;
  rechaza(sinPublicacion, presupuestoPublicado, /no se puede identificar/, "sin bloque `publication`");

  const sinId = clonar(evidenciaPublicada);
  sinId.publication.publicationId = "";
  rechaza(sinId, presupuestoPublicado, /publicationId/, "con identificador de publicación vacío");

  const sinFecha = clonar(evidenciaPublicada);
  delete sinFecha.publication.publishedAt;
  rechaza(sinFecha, presupuestoPublicado, /publishedAt/, "sin fecha de publicación");
}

{
  const sinRunId = clonar(evidenciaPublicada);
  delete sinRunId.corridas[1].runId;
  rechaza(sinRunId, presupuestoPublicado, /no declara runId/, "una corrida sin identificador");

  const sinCarga = clonar(evidenciaPublicada);
  delete sinCarga.corridas[0].loadavg1m;
  rechaza(sinCarga, presupuestoPublicado, /carga de la máquina/, "una corrida sin la carga declarada");
}

{
  const pocas = clonar(evidenciaPublicada);
  pocas.corridas = [pocas.corridas[0]];
  rechaza(pocas, presupuestoPublicado, /se exigen 3/, "una sola corrida afortunada");

  const ninguna = clonar(evidenciaPublicada);
  ninguna.corridas = [];
  rechaza(ninguna, presupuestoPublicado, /no trae corridas/, "sin corridas");
}

{
  const sinEscenario = clonar(evidenciaPublicada);
  sinEscenario.corridas[2].runs = sinEscenario.corridas[2].runs.filter(
    (run) => !(run.label === ESCENARIO_JUZGADO.label && run.reconciled === false),
  );
  rechaza(
    sinEscenario,
    presupuestoPublicado,
    /no trae el escenario juzgado/,
    "una corrida sin el escenario que se juzga",
  );
}

// ---------------------------------------------------------------------------
// 6. El corpus: un techo sobre otro dibujo no significa nada
// ---------------------------------------------------------------------------

{
  const otroSha = clonar(evidenciaPublicada);
  otroSha.corpus.documentSha256 = "f".repeat(64);
  rechaza(otroSha, presupuestoPublicado, /no es el del presupuesto/, "medido sobre otro documento");

  const sinManifiesto = clonar(evidenciaPublicada);
  sinManifiesto.corpus.matchesManifest = false;
  rechaza(sinManifiesto, presupuestoPublicado, /corpus-mixes-manifest/, "un corpus que no versiona el manifiesto");

  const otraMezcla = clonar(evidenciaPublicada);
  otraMezcla.corpus.mix = "mechanical";
  rechaza(otraMezcla, presupuestoPublicado, /mezcla/, "otra mezcla");

  const otroTamano = clonar(evidenciaPublicada);
  otroTamano.corpus.entities = 10_000;
  rechaza(otroTamano, presupuestoPublicado, /entidades/, "otro número de entidades");
}

// ---------------------------------------------------------------------------
// 7. Un presupuesto roto no da verde
// ---------------------------------------------------------------------------

{
  rechaza(evidenciaPublicada, null, /no es un objeto/, "sin presupuesto");

  const sinEtapa = clonar(presupuestoPublicado);
  delete sinEtapa.etapas.tileEnqueue;
  rechaza(
    evidenciaPublicada,
    sinEtapa,
    /se exigen exactamente/,
    "un presupuesto al que le falta una etapa",
  );

  const conEtapaInventada = clonar(presupuestoPublicado);
  conEtapaInventada.etapas.textRequest = { ms: 50 };
  rechaza(
    evidenciaPublicada,
    conEtapaInventada,
    /se exigen exactamente/,
    "un presupuesto con una etapa de más",
  );

  const techoRaro = clonar(presupuestoPublicado);
  techoRaro.etapas.tessellate.ms = "3610";
  rechaza(evidenciaPublicada, techoRaro, /no es un número/, "un techo que es texto");

  const techoCero = clonar(presupuestoPublicado);
  techoCero.etapas.batchPush.ms = 0;
  rechaza(evidenciaPublicada, techoCero, /positivo/, "un techo en cero");

  const sinTotal = clonar(presupuestoPublicado);
  delete sinTotal.totales.stageTotalMs;
  rechaza(evidenciaPublicada, sinTotal, /stageTotalMs/, "un presupuesto sin techo de total");

  const sinInstancias = clonar(presupuestoPublicado);
  delete sinInstancias.totales.segmentsAtRest;
  rechaza(evidenciaPublicada, sinInstancias, /segmentsAtRest/, "un presupuesto sin techo de instancias");

  const sinMinimo = clonar(presupuestoPublicado);
  delete sinMinimo.condiciones.corridasMinimas;
  rechaza(evidenciaPublicada, sinMinimo, /corridasMinimas/, "un presupuesto sin mínimo de corridas");
}

// ---------------------------------------------------------------------------
// 8. El trinquete: sólo baja
// ---------------------------------------------------------------------------

{
  // Una corrida MEJOR: los techos bajan.
  const mejor = clonar(evidenciaPublicada);
  for (const corrida of mejor.corridas) {
    const juzgada = corridaJuzgada(corrida);
    for (const etapa of ETAPAS_PRESUPUESTADAS) juzgada.stages.ms[etapa] /= 2;
    juzgada.stageTotalMs /= 2;
    juzgada.segmentsAtRest = Math.round(juzgada.segmentsAtRest / 2);
  }
  const bajado = recalcularPresupuesto(mejor, presupuestoPublicado);
  ok(bajado.error === null, "recalcular con una corrida mejor no tendría que dar error");
  for (const etapa of ETAPAS_PRESUPUESTADAS)
    ok(
      bajado.presupuesto.etapas[etapa].ms < presupuestoPublicado.etapas[etapa].ms,
      `${etapa}: el techo tendría que BAJAR con una corrida mejor`,
    );
  ok(
    bajado.presupuesto.totales.segmentsAtRest.instancias <
      presupuestoPublicado.totales.segmentsAtRest.instancias,
    "el techo de instancias tendría que bajar con la mitad de instancias",
  );
  ok(
    bajado.cambios.every((cambio) => cambio.accion === "baja"),
    "todos los cambios tendrían que ser bajadas",
  );

  // Una corrida PEOR: los techos NO suben. Es la regla entera del trinquete.
  const peor = clonar(evidenciaPublicada);
  for (const corrida of peor.corridas) {
    const juzgada = corridaJuzgada(corrida);
    for (const etapa of ETAPAS_PRESUPUESTADAS) juzgada.stages.ms[etapa] *= 3;
    juzgada.stageTotalMs *= 3;
    juzgada.segmentsAtRest *= 3;
  }
  const subido = recalcularPresupuesto(peor, presupuestoPublicado);
  for (const etapa of ETAPAS_PRESUPUESTADAS)
    ok(
      subido.presupuesto.etapas[etapa].ms === presupuestoPublicado.etapas[etapa].ms,
      `${etapa}: el techo NO puede subir por ejecutar el actualizador`,
    );
  ok(
    subido.presupuesto.totales.stageTotalMs.ms === presupuestoPublicado.totales.stageTotalMs.ms,
    "el techo del total tampoco sube",
  );
  ok(
    subido.cambios.every((cambio) => cambio.accion === "se queda"),
    "con una corrida peor no se toca ningún techo",
  );
  // Y el resultado de no tocarlos es un ROJO, que es lo que tiene que pasar.
  const veredicto = verificarEtapas(peor, subido.presupuesto);
  ok(!veredicto.passed, "una corrida tres veces peor tiene que quedar en rojo tras --bajar");
  ok(
    veredicto.violations.some((violacion) => /tessellate/.test(violacion)),
    "el rojo tenía que citar la etapa que se pasó",
  );
}

{
  // El margen de cada techo sale de la dispersión de esa etapa, acotada.
  const sinRuido = clonar(evidenciaPublicada);
  for (const corrida of sinRuido.corridas) {
    const juzgada = corridaJuzgada(corrida);
    for (const etapa of ETAPAS_PRESUPUESTADAS) juzgada.stages.ms[etapa] = 100;
  }
  const { presupuesto } = recalcularPresupuesto(sinRuido, null);
  for (const etapa of ETAPAS_PRESUPUESTADAS) {
    ok(
      presupuesto.etapas[etapa].margenRelativo === MARGEN_MINIMO,
      `${etapa}: sin dispersión, el margen tendría que ser el suelo (${MARGEN_MINIMO})`,
    );
    ok(
      Math.abs(presupuesto.etapas[etapa].ms - 105) < 1e-6,
      `${etapa}: 100 ms sin ruido tendría que dar un techo de 105 ms`,
    );
  }

  // Un pico no cobra DOS veces. Con [100, 100, 400] la mediana sigue en 100 y
  // el techo lo pone el suelo (la peor corrida + 5 %), no `max × (1+dispersión)`
  // —que daría 1.600 ms de techo sobre una mediana de 100—.
  const conPico = clonar(evidenciaPublicada);
  [100, 100, 400].forEach((valor, indice) => {
    corridaJuzgada(conPico.corridas[indice]).stages.ms.tessellate = valor;
  });
  const picado = recalcularPresupuesto(conPico, null).presupuesto;
  ok(
    Math.abs(picado.etapas.tessellate.ms - 420) < 1e-6,
    `un pico aislado tendría que dar techo 420 (peor × 1,05), no ${picado.etapas.tessellate.ms}`,
  );
  ok(
    picado.etapas.tessellate.medidoMs.mediana === 100,
    "y la mediana publicada tiene que seguir siendo la mediana medida",
  );

  // Y cuando la dispersión es de verdad —las tres corridas separadas— manda la
  // mediana ensanchada, que queda por encima del suelo.
  const disperso = clonar(evidenciaPublicada);
  [100, 130, 140].forEach((valor, indice) => {
    corridaJuzgada(disperso.corridas[indice]).stages.ms.tessellate = valor;
  });
  const ensanchado = recalcularPresupuesto(disperso, null).presupuesto;
  ok(
    Math.abs(ensanchado.etapas.tessellate.ms - 170) < 1e-6,
    `con dispersión repartida manda la mediana ensanchada (170), no el suelo: ${ensanchado.etapas.tessellate.ms}`,
  );

  const ruidoso = clonar(evidenciaPublicada);
  const valores = [10, 100, 1000];
  ruidoso.corridas.forEach((corrida, indice) => {
    corridaJuzgada(corrida).stages.ms.tessellate = valores[indice];
  });
  const conTope = recalcularPresupuesto(ruidoso, null).presupuesto;
  ok(
    conTope.etapas.tessellate.margenRelativo === MARGEN_MAXIMO,
    "una etapa que dispersa ×100 tendría que toparse en el margen máximo",
  );
  ok(
    conTope.etapas.tessellate.dispersionRelativa === Number((990 / 100).toFixed(4)),
    "la dispersión relativa se publica tal cual se midió, aunque el margen se tope",
  );
}

{
  const vacio = recalcularPresupuesto({ corridas: [] }, presupuestoPublicado);
  ok(vacio.error !== null, "recalcular sin corridas tiene que dar error, no un presupuesto vacío");
  ok(
    vacio.presupuesto === presupuestoPublicado,
    "sin corridas, el presupuesto vigente se devuelve intacto",
  );
}

{
  ok(mediana([3, 1, 2]) === 2, "la mediana de tres ordena antes de elegir");
  ok(mediana([4, 1, 2, 3]) === 2.5, "la mediana de cuatro promedia las dos centrales");
}

// ---------------------------------------------------------------------------
// 9. El programa, no sólo la función
// ---------------------------------------------------------------------------

const correr = (argumentos) =>
  spawnSync(process.execPath, [CHECKER, ...argumentos], { encoding: "utf8" });

{
  const verde = correr([]);
  ok(verde.status === 0, `el par publicado tendría que salir en verde: ${verde.stdout}${verde.stderr}`);
  ok(/VERDE/.test(verde.stdout), "el verde tendría que decirse en voz alta");

  const desconocida = correr(["--noexiste"]);
  ok(desconocida.status === 2, "una bandera desconocida es un error, no algo que se ignora");
  ok(/Bandera desconocida/.test(desconocida.stderr), "y se dice cuál");

  const ayuda = correr(["--help"]);
  ok(ayuda.status === 0 && /trinquete/i.test(ayuda.stdout.toLowerCase()), "--help explica el trinquete");

  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "etapas-spec-"));
  try {
    const roto = degradarEtapa("tessellate", 0, 1.5);
    const ruta = path.join(temporal, "degradado.json");
    fs.writeFileSync(ruta, JSON.stringify(roto));
    const rojo = correr(["--evidencia", ruta]);
    ok(rojo.status === 1, "un artefacto degradado tiene que salir con código 1");
    ok(/ROJO/.test(rojo.stdout), "y decir ROJO");
    ok(/tessellate/.test(rojo.stdout), "citando la etapa que se pasó");

    const enJson = correr(["--evidencia", ruta, "--json"]);
    const veredicto = JSON.parse(enJson.stdout);
    ok(enJson.status === 1 && veredicto.passed === false, "--json también sale con código 1");
    ok(Array.isArray(veredicto.violations) && veredicto.violations.length > 0, "--json trae las violaciones");

    const inexistente = correr(["--evidencia", path.join(temporal, "no-existe.json")]);
    ok(inexistente.status === 1, "sin evidencia no hay verde");

    // `--bajar` sobre una evidencia peor NO puede tocar el presupuesto de
    // verdad: se copia, se ejecuta contra la copia y se compara byte a byte.
    const copia = path.join(temporal, "presupuesto.json");
    fs.copyFileSync(BUDGET_FILE, copia);
    const peor = clonar(evidenciaPublicada);
    for (const corrida of peor.corridas)
      for (const etapa of ETAPAS_PRESUPUESTADAS) corridaJuzgada(corrida).stages.ms[etapa] *= 2;
    const rutaPeor = path.join(temporal, "peor.json");
    fs.writeFileSync(rutaPeor, JSON.stringify(peor));
    const bajada = correr(["--evidencia", rutaPeor, "--presupuesto", copia, "--bajar"]);
    ok(bajada.status === 1, "--bajar con una corrida peor deja el rojo puesto");
    const tras = JSON.parse(fs.readFileSync(copia, "utf8"));
    for (const etapa of ETAPAS_PRESUPUESTADAS)
      ok(
        tras.etapas[etapa].ms === presupuestoPublicado.etapas[etapa].ms,
        `${etapa}: --bajar no puede subir el techo escrito`,
      );
    ok(/se queda/.test(bajada.stdout), "--bajar dice qué techos se quedaron como estaban");
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }

  // Y el fichero publicado sigue intacto tras todo el spec.
  ok(
    fs.readFileSync(BUDGET_FILE, "utf8") === JSON.stringify(presupuestoPublicado, null, 2) + "\n",
    "el presupuesto publicado tenía que quedar byte a byte como estaba",
  );
}

console.log(`check-etapas-100k.spec.mjs · ${comprobaciones} comprobaciones · OK`);
