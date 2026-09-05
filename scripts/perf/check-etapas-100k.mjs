#!/usr/bin/env node
/**
 * TRINQUETE del reparto por etapa de `architecture@100k`.
 *
 * ## De qué avería concreta protege
 *
 * El ×6,75 que ganaron el índice de tiles y la caché de bloques (PR #139,
 * 2026-08-31) está publicado en `docs/cad/evidence/render-stage-architecture-100k.json`
 * y hasta hoy no lo vigilaba nadie. Un artefacto que sólo existe no defiende
 * nada: cualquier cambio puede devolver el teselado a 4,5 s y la evidencia
 * seguiría diciendo la verdad de agosto mientras el producto dice otra. Eso no
 * es una hipótesis — **ya pasó**, y este verificador nació de comprobarlo: ver
 * el bloque `contraste` del propio artefacto.
 *
 * Aquí vive la REGLA. El programa que produce lo juzgado es otro
 * (`etapas-100k-medir.mjs`), y están separados por la misma cicatriz que la
 * entrega 2 de este frente: un verificador enterrado dentro del generador se
 * mueve con él, y el día que el número no pase, aflojar la regla es un renglón
 * más del mismo commit. Aquí no: bajar un techo tiene su propia bandera, se
 * niega a subirlo, y el spec le mete artefactos degradados etapa por etapa.
 *
 * ## Qué se presupuesta, y por qué esas cinco etapas y no otras
 *
 * `tessellate`, `batchPush`, `spatialIndex`, `insertExpand` y `tileEnqueue`:
 * las cinco que el reparto de agosto señaló como el coste real de abrir el
 * dibujo. Y con ellas dos totales, porque un techo por etapa a solas se
 * esquiva sin querer:
 *
 * - `stageTotalMs`, porque mover trabajo a una etapa NO presupuestada
 *   (`textRequest`, `offThreadSeed`, …) pasaría en verde.
 * - `segmentsAtRest`, porque el reloj de una etapa baja también cuando se
 *   dibuja menos, y «más rápido porque dibuja menos» es un plano mal dibujado,
 *   no una optimización. Es además el número que habría cazado la fuga real:
 *   pasó de 15.250 a 2.199.624 sin que ningún reloj de agosto se enterara.
 *
 * ## El escenario juzgado
 *
 * `sync · sin reconciliar · reloj real`: el que aísla el coste de CPU del
 * pipeline sin mezclarlo con la cadencia de pantalla. Es `runs[0]` del
 * perfilador, y es el mismo que el artefacto de agosto usó para su ×6,75, así
 * que los dos números se comparan sin traducción.
 *
 * ## Uso
 *
 *   node scripts/perf/check-etapas-100k.mjs            # juzga lo publicado
 *   node scripts/perf/check-etapas-100k.mjs --json     # el veredicto en JSON
 *   node scripts/perf/check-etapas-100k.mjs --bajar    # BAJA techos, nunca sube
 *   node scripts/perf/check-etapas-100k.mjs --evidencia <ruta> --presupuesto <ruta>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, "../..");

export const EVIDENCE_FILE = path.join(
  RAIZ,
  "docs/cad/evidence/render-stage-architecture-100k.json",
);
export const BUDGET_FILE = path.join(AQUI, "etapas-100k-budget.json");

/**
 * Las cinco etapas con techo. No es «las que había»: son las que el reparto de
 * agosto identificó como el coste de abrir `architecture@100k`. Añadir una
 * sexta es una decisión, no un descuido, y por eso el presupuesto tiene que
 * declarar EXACTAMENTE estas cinco: ni una de menos (un techo que desaparece
 * deja de proteger en silencio) ni una de más (un techo inventado a mano no
 * salió de ninguna corrida).
 */
export const ETAPAS_PRESUPUESTADAS = Object.freeze([
  "tessellate",
  "batchPush",
  "spatialIndex",
  "insertExpand",
  "tileEnqueue",
]);

/** El escenario que se juzga, y cómo se reconoce dentro de `runs`. */
export const ESCENARIO_JUZGADO = Object.freeze({
  label: "sync",
  reconciled: false,
  descripcion: "sync · sin reconciliar · reloj real · presupuesto adaptativo",
});

/**
 * Suelo y techo del margen relativo de un techo.
 *
 * El SUELO existe por la cicatriz de `bundle-budget.mjs`: un trinquete sin
 * holgura no mide regresiones, mide ruido de máquina, y convierte cualquier
 * corrida —incluso una idéntica— en un fallo rojo. El TECHO existe por la
 * contraria: si una etapa dispersa más del 75 % entre corridas de la misma
 * máquina, su techo no está midiendo el producto y ensancharlo hasta caber
 * sería fabricar un gate que no puede fallar.
 */
export const MARGEN_MINIMO = 0.05;
export const MARGEN_MAXIMO = 0.75;

const redondear = (valor, decimales = 3) =>
  Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : valor;

export function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  if (ordenados.length === 0) return Number.NaN;
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[medio - 1] + ordenados[medio]) / 2
    : ordenados[medio];
}

/**
 * La máquina, compuesta de datos REALES, nunca escrita a mano.
 *
 * Mismo criterio que `slo-navegador-contract.mjs`: un dato que falta se
 * escribe «desconocido» en vez de dejar un hueco, porque el hueco produce una
 * frase que PARECE una máquina y la palabra desconocido es justo la que el
 * verificador usa para negarse. Aquí, además, la frase dice en voz alta lo que
 * esta medida NO es: no hay GPU ni navegador, es CPU de Node.
 */
export function componerMaquina(instantanea) {
  const {
    cpuModelo = "",
    hilos = 0,
    memoriaBytes = 0,
    tipoSO = "",
    versionSO = "",
    arquitectura = "",
    node = "",
    fecha = new Date().toISOString().slice(0, 10),
    nota = "",
  } = instantanea ?? {};
  const dato = (valor, ausente) => {
    const texto = String(valor ?? "").trim();
    return texto === "" ? ausente : texto;
  };
  const gb = memoriaBytes > 0 ? (memoriaBytes / 1024 ** 3).toFixed(1) : "0,0";
  return (
    `${dato(cpuModelo, "CPU desconocida")} (${hilos} hilos lógicos), ` +
    `${gb.replace(".", ",")} GB de RAM, ` +
    `${dato(tipoSO, "sistema desconocido")} ${String(versionSO).trim()} (${dato(
      arquitectura,
      "arquitectura desconocida",
    )}), Node ${dato(node, "de versión desconocida")}. ` +
    "SIN GPU y SIN navegador: esto es CPU de Node, no fotogramas — no se compara número a número " +
    "con docs/cad/evidence/browser-slo-100k.json. " +
    `Corrida ${fecha} con scripts/perf/etapas-100k-medir.mjs${nota ? `. ${nota}` : "."}`
  );
}

/** Instantánea de la máquina de AHORA, para componer la frase de arriba. */
export function instantaneaDeEstaMaquina() {
  const cpus = os.cpus();
  return {
    cpuModelo: cpus[0]?.model ?? "",
    hilos: os.availableParallelism?.() ?? cpus.length,
    memoriaBytes: os.totalmem(),
    tipoSO: os.type(),
    versionSO: os.release(),
    arquitectura: process.arch,
    node: process.version,
  };
}

/** El escenario juzgado dentro de una corrida, o `undefined` si no está. */
export function corridaJuzgada(corrida) {
  const runs = Array.isArray(corrida?.runs) ? corrida.runs : [];
  return runs.find(
    (run) => run?.label === ESCENARIO_JUZGADO.label && run?.reconciled === ESCENARIO_JUZGADO.reconciled,
  );
}

// ---------------------------------------------------------------------------
// La regla
// ---------------------------------------------------------------------------

/**
 * ¿Es publicable este reparto contra este presupuesto? Devuelve las
 * violaciones, no lanza.
 *
 * Es la MISMA función que corre la CLI y que corre el spec. Un verificador que
 * sólo se prueba a sí mismo desde dentro del generador no es una prueba: el
 * spec le inyecta artefactos degradados etapa por etapa y exige un rojo por
 * cada uno, con su motivo.
 */
export function verificarEtapas(evidencia, presupuesto) {
  const violations = [];
  const fail = (mensaje) => violations.push(mensaje);
  const filas = [];

  // --- 0. El presupuesto, antes que nada -----------------------------------
  //
  // Un presupuesto roto no puede dar verde: sería un gate que no puede fallar.
  if (!presupuesto || typeof presupuesto !== "object")
    return { passed: false, violations: ["el presupuesto no es un objeto"], filas };
  const alcance = presupuesto.alcance;
  if (!alcance || typeof alcance !== "object") fail("el presupuesto no declara `alcance`");
  const etapas = presupuesto.etapas;
  if (!etapas || typeof etapas !== "object") {
    fail("el presupuesto no declara `etapas`");
  } else {
    const declaradas = Object.keys(etapas).sort();
    const esperadas = [...ETAPAS_PRESUPUESTADAS].sort();
    if (declaradas.join(",") !== esperadas.join(","))
      fail(
        `el presupuesto declara las etapas [${declaradas.join(", ")}] y se exigen ` +
          `exactamente [${esperadas.join(", ")}]`,
      );
    for (const [etapa, techo] of Object.entries(etapas))
      if (!Number.isFinite(techo?.ms) || techo.ms <= 0)
        fail(`el techo de ${etapa} no es un número de milisegundos positivo`);
  }
  const totales = presupuesto.totales ?? {};
  if (!Number.isFinite(totales.stageTotalMs?.ms) || totales.stageTotalMs.ms <= 0)
    fail("el presupuesto no declara un techo de `stageTotalMs`");
  if (!Number.isFinite(totales.segmentsAtRest?.instancias) || totales.segmentsAtRest.instancias <= 0)
    fail("el presupuesto no declara un techo de `segmentsAtRest`");
  const invariantes = presupuesto.invariantes ?? {};
  const corridasMinimas = presupuesto.condiciones?.corridasMinimas;
  if (!Number.isInteger(corridasMinimas) || corridasMinimas < 1)
    fail("el presupuesto no declara `condiciones.corridasMinimas`");
  if (violations.length > 0) return { passed: false, violations, filas };

  // --- 1. El artefacto existe y declara MÁQUINA ----------------------------
  if (!evidencia || typeof evidencia !== "object")
    return { passed: false, violations: ["el artefacto no es un objeto"], filas };

  const env = evidencia.environment;
  if (!env || typeof env !== "object") {
    fail("falta el bloque `environment`: el artefacto no declara máquina");
  } else {
    for (const campo of ["node", "cpuModel", "logicalCpuCount", "platform", "declaredMachine"])
      if (env[campo] === undefined || env[campo] === null || env[campo] === "")
        fail(`environment.${campo} falta o está vacío`);
    const declarada = typeof env.declaredMachine === "string" ? env.declaredMachine.trim() : "";
    if (declarada.length > 0 && declarada.length < 40)
      fail("environment.declaredMachine no describe la máquina");
    if (/desconocid/i.test(declarada))
      fail("environment.declaredMachine trae datos desconocidos: falta el dato, no se publica");
    // La frontera del artefacto. Aquí no hay GPU ni navegador y un fichero que
    // dijera lo contrario estaría mintiendo por construcción — es exactamente
    // el error que la regla 4 de la matriz competitiva vino a impedir.
    if (env.gpu !== false) fail("environment.gpu debe ser false: esta medida es CPU en Node");
    if (env.browser !== false)
      fail("environment.browser debe ser false: aquí no hay navegador que medir");
    if (env.measurementKind !== "cpu-node")
      fail(
        `environment.measurementKind debe ser "cpu-node", no ${JSON.stringify(env.measurementKind)}`,
      );
  }

  // --- 2. Identificador de publicación --------------------------------------
  const publicacion = evidencia.publication;
  if (!publicacion || typeof publicacion !== "object")
    fail("falta el bloque `publication`: la corrida no se puede identificar");
  else {
    if (typeof publicacion.publicationId !== "string" || publicacion.publicationId.trim() === "")
      fail("publication.publicationId falta o está vacío");
    if (typeof publicacion.publishedAt !== "string" || publicacion.publishedAt.trim() === "")
      fail("publication.publishedAt falta o está vacío");
  }

  // --- 3. El corpus, atado a su sha ------------------------------------------
  const corpus = evidencia.corpus ?? {};
  if (corpus.mix !== alcance.mezcla)
    fail(`el artefacto mide la mezcla ${JSON.stringify(corpus.mix)} y el presupuesto es de ${alcance.mezcla}`);
  if (corpus.entities !== alcance.entidades)
    fail(`el artefacto mide ${corpus.entities} entidades y el presupuesto es de ${alcance.entidades}`);
  if (corpus.matchesManifest !== true)
    fail("el corpus medido no es el que versiona corpus-mixes-manifest.json");
  if (alcance.corpusSha256 && corpus.documentSha256 !== alcance.corpusSha256)
    fail(
      `el corpus medido (${String(corpus.documentSha256).slice(0, 12)}…) no es el del presupuesto ` +
        `(${String(alcance.corpusSha256).slice(0, 12)}…): los techos juzgarían otro dibujo`,
    );

  // --- 4. Las corridas -------------------------------------------------------
  const corridas = Array.isArray(evidencia.corridas) ? evidencia.corridas : [];
  if (corridas.length === 0) {
    fail("el artefacto no trae corridas");
    return { passed: false, violations, filas };
  }
  if (corridas.length < corridasMinimas)
    fail(
      `el artefacto trae ${corridas.length} corrida(s) y se exigen ${corridasMinimas}: ` +
        "una sola corrida afortunada no distingue una regresión de un vecino ruidoso",
    );

  for (const [indice, corrida] of corridas.entries()) {
    const nombre = corrida?.runId ? `corrida ${corrida.runId}` : `corrida #${indice}`;
    if (typeof corrida?.runId !== "string" || corrida.runId.trim() === "")
      fail(`${nombre}: no declara runId, así que no se puede identificar`);
    if (!Number.isFinite(corrida?.loadavg1m))
      fail(`${nombre}: no declara la carga de la máquina (loadavg1m)`);

    const juzgada = corridaJuzgada(corrida);
    if (!juzgada) {
      fail(`${nombre}: no trae el escenario juzgado (${ESCENARIO_JUZGADO.descripcion})`);
      continue;
    }

    const ms = juzgada.stages?.ms ?? {};
    for (const etapa of ETAPAS_PRESUPUESTADAS) {
      const medido = ms[etapa];
      const techo = etapas[etapa].ms;
      if (!Number.isFinite(medido)) {
        fail(`${nombre}: la etapa ${etapa} no trae milisegundos`);
        continue;
      }
      filas.push({ corrida: corrida.runId ?? `#${indice}`, clave: etapa, medido, techo, unidad: "ms" });
      if (medido > techo)
        fail(
          `${nombre}: ${etapa} ${medido} ms se pasa del techo ${techo} ms ` +
            `(+${redondear(((medido / techo) - 1) * 100, 1)} %)`,
        );
    }

    const total = juzgada.stageTotalMs;
    if (!Number.isFinite(total)) fail(`${nombre}: no trae stageTotalMs`);
    else {
      filas.push({ corrida: corrida.runId ?? `#${indice}`, clave: "stageTotalMs", medido: total, techo: totales.stageTotalMs.ms, unidad: "ms" });
      if (total > totales.stageTotalMs.ms)
        fail(
          `${nombre}: stageTotalMs ${total} ms se pasa del techo ${totales.stageTotalMs.ms} ms ` +
            "(mover coste a una etapa sin techo no es ahorrarlo)",
        );
    }

    const instancias = juzgada.segmentsAtRest;
    if (!Number.isFinite(instancias)) fail(`${nombre}: no trae segmentsAtRest`);
    else {
      filas.push({ corrida: corrida.runId ?? `#${indice}`, clave: "segmentsAtRest", medido: instancias, techo: totales.segmentsAtRest.instancias, unidad: "inst" });
      if (instancias > totales.segmentsAtRest.instancias)
        fail(
          `${nombre}: segmentsAtRest ${instancias} se pasa del techo ${totales.segmentsAtRest.instancias}: ` +
            "el LOD está pidiendo más segmentos de los presupuestados",
        );
    }

    // --- 5. Y que no se haya ido más rápido dibujando menos ----------------
    //
    // La trampa clásica de un presupuesto de rendimiento. `detailedAtRest` y
    // `visibleAtRest` los decide el escenario y el índice de visibilidad, no
    // el LOD: si cambian, se está midiendo otra vista y el techo deja de
    // significar lo que significaba.
    if (Number.isInteger(invariantes.detailedAtRest) && juzgada.detailedAtRest !== invariantes.detailedAtRest)
      fail(
        `${nombre}: detailedAtRest ${juzgada.detailedAtRest} ≠ ${invariantes.detailedAtRest} calibrado: ` +
          "ir más rápido dibujando menos entidades no es una optimización",
      );
    if (Number.isInteger(invariantes.visibleAtRest) && juzgada.visibleAtRest !== invariantes.visibleAtRest)
      fail(
        `${nombre}: visibleAtRest ${juzgada.visibleAtRest} ≠ ${invariantes.visibleAtRest} calibrado: ` +
          "la vista al reposo no es la que se presupuestó",
      );
    if (Number.isInteger(invariantes.callsTessellateMax)) {
      const llamadas = juzgada.stages?.calls?.tessellate;
      if (!Number.isInteger(llamadas)) fail(`${nombre}: no trae stages.calls.tessellate`);
      else if (llamadas > invariantes.callsTessellateMax)
        fail(
          `${nombre}: ${llamadas} llamadas a tessellate se pasan de las ${invariantes.callsTessellateMax} ` +
            "calibradas: hay más trabajo, no sólo más lento",
        );
    }
  }

  return { passed: violations.length === 0, violations, filas };
}

// ---------------------------------------------------------------------------
// El trinquete: recalcular techos, y sólo hacia abajo
// ---------------------------------------------------------------------------

/**
 * Recalcula los techos desde las corridas publicadas. **Sólo baja.**
 *
 * El techo NO es la medida: es la peor de las corridas ensanchada por la
 * dispersión que esas mismas corridas mostraron. Cada etapa lleva su propio
 * margen porque su ruido es suyo — `insertExpand` oscila medio milisegundo
 * sobre medio milisegundo y `tessellate` no—, y un margen único elegido a mano
 * sería o una cárcel para la etapa ruidosa o una barra libre para la estable.
 *
 * Subir un techo NO se hace desde aquí. Cuando el producto empeora a
 * conciencia y con razón —como pasó con el LOD del sombreado, que se corrigió
 * por corrección del dibujo y se pagó en milisegundos—, el techo se edita a
 * mano y el porqué se escribe en el commit. Un actualizador que sube techos
 * convierte cada regresión en un `--bajar` y el gate deja de existir.
 */
export function recalcularPresupuesto(evidencia, presupuestoVigente) {
  const corridas = Array.isArray(evidencia?.corridas) ? evidencia.corridas : [];
  const juzgadas = corridas.map((corrida) => corridaJuzgada(corrida)).filter(Boolean);
  if (juzgadas.length === 0)
    return { presupuesto: presupuestoVigente, cambios: [], error: "no hay corridas juzgables" };

  const cambios = [];
  /**
   * El techo de una clave, desde sus corridas.
   *
   * `mediana × (1 + dispersión)`, con un suelo en `max × (1 + 5 %)` para que
   * la peor corrida medida siempre quepa.
   *
   * La primera versión era `max × (1 + dispersión)` y estaba mal: una sola
   * corrida con un vecino ruidoso cobraba DOS veces —subía el máximo y, al
   * subirlo, ensanchaba la dispersión que multiplicaba a ese mismo máximo—. En
   * las corridas de calibración eso infló el techo de `spatialIndex` a 1.216 ms
   * sobre una mediana de 745. Con la mediana como base, el ruido de una
   * corrida ensancha el margen pero no arrastra el centro, y el suelo del 5 %
   * sigue garantizando que la corrida que calibró el techo no lo rompa.
   */
  const techoDesde = (valores, decimales) => {
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    const med = mediana(valores);
    const dispersion = med > 0 ? (max - min) / med : 0;
    const margen = Math.min(MARGEN_MAXIMO, Math.max(MARGEN_MINIMO, dispersion));
    const techo = Math.max(med * (1 + margen), max * (1 + MARGEN_MINIMO));
    return {
      techo: redondear(techo, decimales),
      medido: { min: redondear(min, decimales), mediana: redondear(med, decimales), max: redondear(max, decimales) },
      dispersionRelativa: redondear(dispersion, 4),
      margenRelativo: redondear(margen, 4),
    };
  };

  const aplicar = (clave, calculado, vigente) => {
    // Sólo baja. Si lo calculado es mayor que lo vigente, se queda lo vigente
    // y el trinquete se pone rojo en la siguiente comprobación — que es
    // exactamente lo que tiene que pasar.
    const baja = vigente === undefined || calculado.techo < vigente;
    cambios.push({
      clave,
      antes: vigente ?? null,
      despues: baja ? calculado.techo : vigente,
      accion: vigente === undefined ? "nuevo" : baja ? "baja" : "se queda",
    });
    return baja ? calculado.techo : vigente;
  };

  const etapas = {};
  for (const etapa of ETAPAS_PRESUPUESTADAS) {
    const calculado = techoDesde(juzgadas.map((run) => run.stages.ms[etapa]), 3);
    const vigente = presupuestoVigente?.etapas?.[etapa]?.ms;
    etapas[etapa] = {
      ms: aplicar(etapa, calculado, vigente),
      medidoMs: calculado.medido,
      dispersionRelativa: calculado.dispersionRelativa,
      margenRelativo: calculado.margenRelativo,
    };
  }

  const totalCalculado = techoDesde(juzgadas.map((run) => run.stageTotalMs), 3);
  const instanciasCalculado = techoDesde(juzgadas.map((run) => run.segmentsAtRest), 0);
  const totales = {
    stageTotalMs: {
      ms: aplicar("stageTotalMs", totalCalculado, presupuestoVigente?.totales?.stageTotalMs?.ms),
      medidoMs: totalCalculado.medido,
      dispersionRelativa: totalCalculado.dispersionRelativa,
      margenRelativo: totalCalculado.margenRelativo,
    },
    segmentsAtRest: {
      instancias: aplicar(
        "segmentsAtRest",
        instanciasCalculado,
        presupuestoVigente?.totales?.segmentsAtRest?.instancias,
      ),
      medido: instanciasCalculado.medido,
      dispersionRelativa: instanciasCalculado.dispersionRelativa,
      margenRelativo: instanciasCalculado.margenRelativo,
    },
  };

  const detailed = [...new Set(juzgadas.map((run) => run.detailedAtRest))];
  const visible = [...new Set(juzgadas.map((run) => run.visibleAtRest))];
  const llamadas = juzgadas.map((run) => run.stages.calls.tessellate);

  const presupuesto = {
    descripcion:
      "Techos por etapa del reparto de architecture@100k, en milisegundos de CPU de Node. " +
      "SÓLO BAJAN: los sube a mano quien pueda explicar en el commit por qué el producto " +
      "vale más lento.",
    alcance: {
      mezcla: evidencia.corpus?.mix ?? presupuestoVigente?.alcance?.mezcla,
      entidades: evidencia.corpus?.entities ?? presupuestoVigente?.alcance?.entidades,
      corpusSha256: evidencia.corpus?.documentSha256 ?? presupuestoVigente?.alcance?.corpusSha256,
      escenario: ESCENARIO_JUZGADO.descripcion,
      porQueEseEscenario:
        "Es el que aísla el coste de CPU del pipeline sin mezclarlo con la cadencia de " +
        "pantalla inyectada, y es el mismo con el que se midió el ×6,75 de agosto: los dos " +
        "números se comparan sin traducción.",
    },
    condiciones: {
      medidor: "scripts/perf/etapas-100k-medir.mjs",
      juez: "scripts/perf/check-etapas-100k.mjs",
      evidencia: "docs/cad/evidence/render-stage-architecture-100k.json",
      que:
        "Reparto por etapa de abrir architecture@100k y hacer el recorrido de paneo y zoom " +
        "de scenario.ts, con la instrumentación de render-stage-profile.ts encendida. " +
        "CPU de Node: sin GPU, sin navegador, sin fotogramas.",
      maquina: evidencia.environment?.declaredMachine ?? "",
      corridas: juzgadas.length,
      corridasMinimas: presupuestoVigente?.condiciones?.corridasMinimas ?? juzgadas.length,
      cargaAlCalibrar: corridas.map((corrida) => corrida.loadavg1m),
      margen:
        "techo = MEDIANA × (1 + margen), nunca por debajo de la PEOR corrida × 1,05. El margen " +
        "de cada etapa es su propia dispersión relativa (max−min)/mediana, acotada entre " +
        `${MARGEN_MINIMO * 100} % y ${MARGEN_MAXIMO * 100} %: el ruido de cada etapa es suyo y ` +
        "un margen único elegido a mano sería cárcel para la ruidosa y barra libre para la " +
        "estable. La base es la mediana y no el máximo para que una corrida con un vecino " +
        "ruidoso no cobre dos veces. No es holgura para crecer: una subida real se come el " +
        "margen y falla en la siguiente corrida.",
      trinquete:
        "`--bajar` sólo BAJA. Subir un techo exige editar este fichero a mano y explicarlo en " +
        "el commit; así una regresión no se «arregla» ejecutando el actualizador.",
    },
    invariantes: {
      // Lo que tiene que seguir siendo verdad para que los techos signifiquen
      // lo mismo. Si esto cambia, no es que el reparto vaya mejor o peor: es
      // que se está midiendo otra vista.
      detailedAtRest: detailed.length === 1 ? detailed[0] : (presupuestoVigente?.invariantes?.detailedAtRest ?? null),
      visibleAtRest: visible.length === 1 ? visible[0] : (presupuestoVigente?.invariantes?.visibleAtRest ?? null),
      callsTessellateMax: Math.max(...llamadas),
      porQue:
        "Un reloj baja también cuando se dibuja menos. Estas tres cifras son el candado " +
        "contra «más rápido porque dibuja menos»: las dos primeras las decide el escenario " +
        "y el índice de visibilidad, no el LOD.",
    },
    etapas,
    totales,
  };

  // La deuda, si el artefacto la trae medida. Un techo calibrado hoy dice
  // «esto es lo que hay», y sin este bloque se leería como «esto es lo que
  // debe haber». No se escribe a mano: sale del contraste que el medidor
  // calculó contra la evidencia de agosto.
  if (evidencia.contraste?.etapas) {
    presupuesto.deuda = {
      que:
        "Estos techos NO son la meta: son lo que esta máquina mide hoy. El reparto de " +
        "2026-08-31 (PR #139, el del ×6,75) medía menos en las etapas de abajo, sobre el " +
        "mismo corpus y el mismo escenario. Mientras el cociente sea > 1, el techo es deuda " +
        "reconocida, y bajarlo es trabajo pendiente, no una regresión de nadie.",
      referencia: "docs/cad/evidence/render-stage-architecture-100k.json · comparisonWithinThisSession.afterThisPr",
      cocientesContraAgosto: Object.fromEntries(
        Object.entries(evidencia.contraste.etapas).map(([etapa, dato]) => [etapa, dato.cociente]),
      ),
      segmentsAtRestContraAgosto: evidencia.contraste.segmentsAtRest?.cociente ?? null,
    };
  }

  return { presupuesto, cambios, error: null };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const AYUDA = `
Trinquete del reparto por etapa de architecture@100k.

  node scripts/perf/check-etapas-100k.mjs [opciones]

  --evidencia <ruta>    Artefacto a juzgar (por defecto el publicado).
  --presupuesto <ruta>  Presupuesto a aplicar (por defecto scripts/perf/etapas-100k-budget.json).
  --bajar               Recalcula los techos desde la evidencia. SÓLO BAJA.
  --json                Escribe el veredicto en JSON por stdout.
  --help                Esto.

Sale 0 si el reparto cabe en el presupuesto, 1 si alguna etapa se pasa.
`;

function leerJson(ruta) {
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch (error) {
    throw new Error(`no se pudo leer ${ruta}: ${error.message}`);
  }
}

function principal(argv) {
  const opciones = { evidencia: EVIDENCE_FILE, presupuesto: BUDGET_FILE, bajar: false, json: false };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];
    if (argumento === "--evidencia") opciones.evidencia = path.resolve(argv[++indice] ?? "");
    else if (argumento === "--presupuesto") opciones.presupuesto = path.resolve(argv[++indice] ?? "");
    else if (argumento === "--bajar") opciones.bajar = true;
    else if (argumento === "--json") opciones.json = true;
    else if (argumento === "--help" || argumento === "-h") {
      process.stdout.write(`${AYUDA}\n`);
      return 0;
    } else {
      // Una bandera desconocida es un error. Ignorarla es cómo un `--bajarr`
      // silencioso deja el presupuesto sin tocar y a alguien creyendo que sí.
      process.stderr.write(`Bandera desconocida: ${argumento}\n${AYUDA}\n`);
      return 2;
    }
  }

  const evidencia = leerJson(opciones.evidencia);
  if (!evidencia) {
    process.stderr.write(`No hay evidencia en ${opciones.evidencia}.\n`);
    return 1;
  }

  if (opciones.bajar) {
    const vigente = leerJson(opciones.presupuesto);
    const { presupuesto, cambios, error } = recalcularPresupuesto(evidencia, vigente);
    if (error) {
      process.stderr.write(`No se pudo recalcular: ${error}\n`);
      return 1;
    }
    fs.writeFileSync(opciones.presupuesto, `${JSON.stringify(presupuesto, null, 2)}\n`, "utf8");
    for (const cambio of cambios)
      process.stdout.write(
        `  ${cambio.clave.padEnd(16)} ${String(cambio.antes ?? "—").padStart(12)} → ` +
          `${String(cambio.despues).padStart(12)}  ${cambio.accion}\n`,
      );
    process.stdout.write(`Presupuesto escrito en ${opciones.presupuesto}\n`);
  }

  const presupuesto = leerJson(opciones.presupuesto);
  if (!presupuesto) {
    process.stderr.write(`No hay presupuesto en ${opciones.presupuesto}.\n`);
    return 1;
  }

  const veredicto = verificarEtapas(evidencia, presupuesto);
  if (opciones.json) {
    process.stdout.write(`${JSON.stringify(veredicto, null, 2)}\n`);
    return veredicto.passed ? 0 : 1;
  }

  process.stdout.write(
    `\nTrinquete · ${presupuesto.alcance?.mezcla}@${presupuesto.alcance?.entidades} · ` +
      `${presupuesto.alcance?.escenario}\n` +
      `  corridas juzgadas: ${(evidencia.corridas ?? []).length}\n\n` +
      `  ${"corrida".padEnd(26)}${"clave".padEnd(16)}${"medido".padStart(12)}${"techo".padStart(12)}${"  margen"}\n`,
  );
  for (const fila of veredicto.filas) {
    const holgura = fila.techo > 0 ? ((fila.techo - fila.medido) / fila.techo) * 100 : 0;
    process.stdout.write(
      `  ${String(fila.corrida).padEnd(26)}${fila.clave.padEnd(16)}` +
        `${String(fila.medido).padStart(12)}${String(fila.techo).padStart(12)}` +
        `${`${holgura >= 0 ? "+" : ""}${holgura.toFixed(1)} %`.padStart(10)}\n`,
    );
  }
  if (!veredicto.passed) {
    process.stdout.write("\nROJO:\n");
    for (const violacion of veredicto.violations) process.stdout.write(`  · ${violacion}\n`);
    process.stdout.write("\n");
    return 1;
  }
  process.stdout.write("\nVERDE: el reparto cabe en el presupuesto.\n\n");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(principal(process.argv.slice(2)));
}
