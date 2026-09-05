import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * EL CENSO DE LAS FILAS QUE RETIENEN UN PUNTO, GENERADO DESDE LA RÚBRICA.
 *
 * ─── Qué problema resuelve ─────────────────────────────────────────────────
 *
 * `node scripts/cad/rubric.mjs` termina con una línea que nadie puede accionar:
 *
 *     «31 fila(s) retienen 1 pt por carecer de evidencia independiente.»
 *
 * Treinta y una filas, un punto cada una, y ni una palabra sobre CUÁL de sus
 * criterios podría cargar esa evidencia ni qué haría falta para conseguirla.
 * Quien quisiera atacarlas tenía que abrir `docs/competitive/rubric.json`
 * —3.812 líneas— y reconstruir a mano la aritmética del tope. Este censo es esa
 * reconstrucción, hecha por la máquina y comprometida como artefacto.
 *
 * ─── La regla 4 de la campaña de cimientos, cumplida al pie ────────────────
 *
 * «Ninguna cifra vive en dos lugares.» Las 31 filas NO están escritas a mano
 * aquí: este spec importa `scripts/cad/rubric.mjs`, puntúa el árbol de hoy y
 * saca del resultado qué filas tienen tope, cuántos puntos valen, qué criterios
 * tienen ya concedidos y con qué clase de evidencia. Lo único escrito a mano es
 * el DICTAMEN —qué criterio es el candidato natural y si el material ajeno que
 * hay en el árbol puede servirlo—, porque eso es juicio y no se calcula. Y el
 * dictamen está atado por los dos lados: una fila con tope sin dictamen falla,
 * y un dictamen de una fila que ya no tiene tope falla también.
 *
 * ─── Lo que este censo NO hace, y es la mitad de su valor ──────────────────
 *
 * No marca `independent: true` sobre evidencia que fabricó este proyecto.
 * `verification/oracle.ts` —el oráculo por fuerza bruta— es honesto y es útil, y
 * lo escribimos nosotros: marcarlo sería inflar exactamente la rúbrica que la
 * regla del corte existe para impedir. Por eso hay una lista cerrada de fuentes
 * admitidas (`FUENTES_INDEPENDIENTES`), cada una con su razón, y el spec RECHAZA
 * cualquier parche que marque como independiente algo que no esté en ella.
 *
 * Y por eso seis filas se quedan fuera del reparto teniendo el oráculo delante:
 * cuando el testigo ajeno CONTRADICE el criterio —`ezdxf` no abre nuestros
 * MTEXT ni nuestros HATCH, la tabla de capas se poda sin aviso—, la respuesta
 * honesta no es cobrar el punto con el testigo callado, es escribir qué dijo.
 *
 * ─── El trinquete ──────────────────────────────────────────────────────────
 *
 * `TECHO_FILAS_CON_TOPE` sólo puede BAJAR. Si una fila que hoy tiene evidencia
 * independiente la pierde —se borra el corpus ajeno, se mueve un artefacto— el
 * número sube y el gate se pone rojo, en vez de dejarlo pasar en silencio.
 *
 * Se escribe el artefacto con `VALLE_ESCRIBIR_CENSO=1`.
 */

import {
  DICTAMENES,
  FUENTES_INDEPENDIENTES,
  NO_SON_INDEPENDIENTES,
  VEREDICTOS,
} from "./independencia-dictamen";

const RAIZ = path.resolve(process.cwd(), "../..");
const RUBRICA_MJS = path.join(RAIZ, "scripts/cad/rubric.mjs");
const CENSO = path.join(RAIZ, "docs/cad/evidence/independencia-por-fila.json");

/**
 * TECHO DE FILAS CON TOPE. Medido el 2026-09-04 contra el árbol de hoy.
 *
 * Sólo puede BAJAR. Subirlo para poner el gate en verde es exactamente lo que
 * la regla del corte prohíbe: significaría que una fila perdió su evidencia
 * independiente y que lo estamos aceptando.
 */
const TECHO_FILAS_CON_TOPE = 31;

/* ══════════════════════════════════════════════════════════════════════════
 * EL MOTOR: lo que sale de la rúbrica, no de aquí
 * ══════════════════════════════════════════════════════════════════════════ */

type ItemDeEvidencia = { kind: string; path?: string; independent?: boolean };
type CriterioDefinido = {
  id: string;
  text: string;
  points: number;
  evidence?: ItemDeEvidencia[];
};
type CategoriaDefinida = {
  id: string;
  group?: string;
  name: string;
  scope?: string;
  points: number;
  criteria?: CriterioDefinido[];
};
type Rubrica = { totalPoints: number; categories: CategoriaDefinida[] };

type CriterioPuntuado = {
  id: string;
  points: number;
  earned: number;
  independent: boolean;
  status: string;
};
type CategoriaPuntuada = {
  id: string;
  group?: string;
  name: string;
  scope: string;
  points: number;
  earned: number;
  independentEarned: number;
  independenceCap: boolean;
  criteria: CriterioPuntuado[];
};
type Puntuacion = {
  totalPoints: number;
  earned: number;
  percentage: number;
  scopes: {
    hoy: { points: number; earned: number; percentage: number };
    destino: { points: number; earned: number; percentage: number };
  };
  evidenceClasses: {
    independiente: number;
    propia: number;
    categoriasConTecho: number;
  };
  definitionErrors: string[];
  categories: CategoriaPuntuada[];
};

/**
 * La rúbrica es ESM en `.mjs` y vive fuera de `apps/web`, así que se carga por
 * import dinámico con la ruta compuesta en tiempo de ejecución: TypeScript no
 * intenta resolverla y `allowJs` no arrastra el archivo al typecheck del web.
 * Lo que sí se declara es la forma exacta de lo que consumimos.
 */
type ModuloRubrica = {
  DEFAULT_RUBRIC: string;
  loadRubric: (file?: string) => Rubrica;
  createContext: (options?: { root?: string; now?: Date }) => unknown;
  scoreRubric: (rubric: Rubrica, ctx?: unknown) => Puntuacion;
};

let comprobaciones = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};
const igual = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.deepStrictEqual(actual, esperado, mensaje);
  comprobaciones += 1;
};

const clonar = <T,>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

void (async () => {
  const rubricaMjs = (await import(
    pathToFileURL(RUBRICA_MJS).href
  )) as ModuloRubrica;
  const { loadRubric, createContext, scoreRubric, DEFAULT_RUBRIC } = rubricaMjs;

  const definicion = loadRubric(DEFAULT_RUBRIC);
  const puntuada = scoreRubric(definicion, createContext());

  /* ── 0. La rúbrica de la que salimos tiene que estar sana ──────────────── */
  igual(
    puntuada.definitionErrors,
    [],
    "la rúbrica tiene errores de DEFINICIÓN: censar sobre ella sería censar aritmética inventada",
  );

  const conTope = puntuada.categories.filter((fila) => fila.independenceCap);

  /* ── 1. EL TRINQUETE ───────────────────────────────────────────────────── */
  ok(
    conTope.length <= TECHO_FILAS_CON_TOPE,
    `${conTope.length} filas retienen 1 pt y el techo medido es ${TECHO_FILAS_CON_TOPE}. ` +
      "El número sólo puede BAJAR: si subió, una fila perdió su evidencia independiente y " +
      "la respuesta correcta es devolvérsela, jamás subir el techo.",
  );

  /* ── 2. El dictamen está atado por los DOS lados ───────────────────────── */
  const idsConTope = new Set(conTope.map((fila) => fila.id));
  const idsDictaminados = new Set(Object.keys(DICTAMENES));
  igual(
    [...idsConTope].filter((id) => !idsDictaminados.has(id)).sort(),
    [],
    "hay filas con tope sin dictamen: el censo dejaría de ser completo en silencio",
  );
  igual(
    [...idsDictaminados].filter((id) => !idsConTope.has(id)).sort(),
    [],
    "hay dictámenes de filas que YA NO tienen tope: el censo está describiendo un árbol que no es éste",
  );

  /* ── 3. Ninguna ruta marcada independiente sale de la lista admitida ───── */
  for (const [id, dictamen] of Object.entries(DICTAMENES)) {
    ok(
      (VEREDICTOS as readonly string[]).includes(dictamen.veredicto),
      `${id}: veredicto fuera del vocabulario (${dictamen.veredicto})`,
    );
    for (const entrada of dictamen.parche?.evidencia ?? []) {
      if (entrada.independent !== true) continue;
      ok(
        entrada.path in FUENTES_INDEPENDIENTES,
        `${id}: el parche marca \`independent: true\` sobre ${entrada.path}, que NO está en la ` +
          "lista de fuentes admitidas. Marcar como independiente evidencia que fabricó este " +
          "proyecto es inflar la rúbrica que la regla del corte existe para impedir.",
      );
      ok(
        !(entrada.path in NO_SON_INDEPENDIENTES),
        `${id}: ${entrada.path} está en la lista de lo que NO es independiente`,
      );
    }
  }
  // La frontera, dicha de frente: el oráculo por fuerza bruta es nuestro.
  ok(
    !("apps/web/src/lib/cad/verification/oracle.ts" in FUENTES_INDEPENDIENTES) &&
      "apps/web/src/lib/cad/verification/oracle.ts" in NO_SON_INDEPENDIENTES,
    "`verification/oracle.ts` no puede entrar nunca en las fuentes independientes: lo escribimos aquí",
  );
  for (const ruta of Object.keys(FUENTES_INDEPENDIENTES))
    ok(
      fs.existsSync(path.join(RAIZ, ruta)),
      `la fuente independiente ${ruta} no existe en el árbol`,
    );

  /* ── 4. El candidato existe, está CONCEDIDO y no es independiente ya ───── */
  const definidaPorId = new Map(definicion.categories.map((c) => [c.id, c]));
  for (const fila of conTope) {
    const dictamen = DICTAMENES[fila.id];
    const criterio = fila.criteria.find((c) => c.id === dictamen.candidato);
    ok(
      criterio !== undefined,
      `${fila.id}: el candidato ${dictamen.candidato} no es un criterio de esta fila`,
    );
    ok(
      criterio?.status === "otorgado",
      `${fila.id}: el candidato ${dictamen.candidato} no está concedido, así que no puede cargar el punto`,
    );
    ok(
      criterio?.independent === false,
      `${fila.id}: el candidato ${dictamen.candidato} ya es independiente y la fila seguiría con tope: imposible`,
    );
    // Cada veredicto obliga a escribir su mitad.
    if (dictamen.veredicto === "servible_hoy") {
      ok(
        dictamen.parche !== undefined && dictamen.limiteDelParche !== undefined,
        `${fila.id}: un veredicto \`servible_hoy\` sin parche o sin límite declarado no vale`,
      );
      ok(
        dictamen.parche?.criterio === dictamen.candidato,
        `${fila.id}: el parche apunta a un criterio distinto del candidato`,
      );
      ok(
        (dictamen.parche?.evidencia ?? []).some((e) => e.independent === true),
        `${fila.id}: un parche sin una sola entrada independiente no levanta el tope`,
      );
    } else {
      ok(
        dictamen.parche === undefined && dictamen.loQueFaltaria !== undefined,
        `${fila.id}: los veredictos que no son \`servible_hoy\` no llevan parche y sí llevan «lo que faltaría»`,
      );
    }
    // Un parche que apunta a un archivo que no está es una promesa, no un parche.
    for (const entrada of dictamen.parche?.evidencia ?? [])
      ok(
        fs.existsSync(path.join(RAIZ, entrada.path)),
        `${fila.id}: el parche cita ${entrada.path} y ese archivo no existe`,
      );
    // Y un parche que añade lo que ya está sería ruido.
    const definida = definidaPorId.get(fila.id);
    const criterioDefinido = (definida?.criteria ?? []).find(
      (c) => c.id === dictamen.candidato,
    );
    for (const entrada of dictamen.parche?.evidencia ?? []) {
      const yaEsta = (criterioDefinido?.evidence ?? []).some(
        (e) => e.kind === entrada.kind && e.path === entrada.path,
      );
      if (dictamen.parche?.operacion === "marcar")
        ok(
          yaEsta,
          `${fila.id}: la operación \`marcar\` exige que la evidencia YA esté en el criterio`,
        );
      else
        ok(
          !yaEsta,
          `${fila.id}: la operación \`anadir\` no puede repetir una evidencia que ya está`,
        );
    }
  }

  /* ── 5. LA MEDICIÓN: aplicar los parches a una COPIA y volver a puntuar ── */
  // El archivo compartido NO se toca. La copia vive en memoria: se clona la
  // rúbrica, se le aplican los parches del censo y se vuelve a llamar a
  // `scoreRubric` con el mismo contexto. Así la cifra que publica el censo está
  // MEDIDA y no estimada, y P-evidencia-05 llega con su efecto ya comprobado.
  const parcheada = clonar(definicion);
  const servibles = conTope
    .filter((fila) => DICTAMENES[fila.id].veredicto === "servible_hoy")
    .map((fila) => fila.id);
  for (const id of servibles) {
    const dictamen = DICTAMENES[id];
    const parche = dictamen.parche!;
    const categoria = parcheada.categories.find((c) => c.id === id)!;
    const criterio = (categoria.criteria ?? []).find(
      (c) => c.id === parche.criterio,
    )!;
    criterio.evidence = criterio.evidence ?? [];
    if (parche.operacion === "marcar")
      for (const entrada of parche.evidencia) {
        const existente = criterio.evidence.find(
          (e) => e.kind === entrada.kind && e.path === entrada.path,
        )!;
        existente.independent = true;
      }
    else criterio.evidence.push(...clonar(parche.evidencia));
  }
  const despues = scoreRubric(parcheada, createContext());

  igual(
    despues.definitionErrors,
    [],
    "los parches del censo rompen la DEFINICIÓN de la rúbrica",
  );
  igual(
    despues.evidenceClasses.categoriasConTecho,
    conTope.length - servibles.length,
    "aplicar los parches no quita exactamente una fila del tope por cada `servible_hoy`",
  );
  // Ninguna otra fila se mueve: el parche es quirúrgico o no es un parche.
  const antesPorId = new Map(puntuada.categories.map((c) => [c.id, c]));
  for (const fila of despues.categories) {
    const antes = antesPorId.get(fila.id)!;
    const esperado = servibles.includes(fila.id) ? antes.earned + 1 : antes.earned;
    ok(
      fila.earned === esperado,
      `${fila.id}: pasa de ${antes.earned} a ${fila.earned} y se esperaba ${esperado}`,
    );
  }
  igual(
    despues.earned,
    puntuada.earned + servibles.length,
    "el total no sube exactamente un punto por fila servida",
  );

  /* ── 6. El censo, generado ─────────────────────────────────────────────── */
  const claseDeEvidencia = (item: ItemDeEvidencia) => item.kind;
  const filas = conTope.map((fila) => {
    const dictamen = DICTAMENES[fila.id];
    const definida = definidaPorId.get(fila.id)!;
    return {
      id: fila.id,
      grupo: fila.group ?? null,
      alcance: fila.scope,
      nombre: fila.name,
      puntos: fila.points,
      otorgadosAntesDelTope: fila.earned + 1,
      conElTope: fila.earned,
      criteriosOtorgados: fila.criteria
        .filter((c) => c.status === "otorgado")
        .map((c) => {
          const def = (definida.criteria ?? []).find((d) => d.id === c.id)!;
          return {
            id: c.id,
            puntos: c.points,
            clasesDeEvidencia: [
              ...new Set((def.evidence ?? []).map(claseDeEvidencia)),
            ].sort(),
          };
        }),
      candidato: dictamen.candidato,
      porQueEseCandidato: dictamen.porQueEseCandidato,
      veredicto: dictamen.veredicto,
      loQueDiceElTestigo: dictamen.loQueDiceElTestigo,
      limiteDelParche: dictamen.limiteDelParche ?? null,
      loQueFaltaria: dictamen.loQueFaltaria ?? null,
      peticion: dictamen.peticion ?? null,
      parche: dictamen.parche ?? null,
    };
  });

  const censo = {
    generadoPor:
      "apps/web/src/lib/cad/verification/independencia-rubrica.spec.ts",
    verificadoPor:
      "el mismo spec: recalcula el censo desde scripts/cad/rubric.mjs y hace deepStrictEqual contra este archivo",
    regenerar:
      "cd apps/web && VALLE_ESCRIBIR_CENSO=1 npx tsx src/lib/cad/verification/independencia-rubrica.spec.ts",
    queEs:
      "Las filas de la rúbrica competitiva que hoy retienen 1 pt por carecer de evidencia independiente, con el criterio candidato de cada una y el parche exacto cuando lo hay. No están escritas a mano: salen de scoreRubric() sobre el árbol de hoy (regla 4 de la campaña de cimientos).",
    reglaDelTope:
      "scripts/cad/rubric.mjs resta 1 pt a una fila cuando earned === points y independentEarned === 0. El punto vuelve con UNA sola evidencia `independent: true` que verifique, en cualquiera de sus criterios ya concedidos.",
    loQueEsteCensoNoHace:
      "Marcar `independent: true` sobre evidencia que fabricó este proyecto. El oráculo por fuerza bruta de verification/oracle.ts verifica de verdad y lo escribimos nosotros: marcarlo convertiría «lo comprobamos aparte» en «lo comprobó otro», que es justo lo que la regla del corte del 2026-08-22 impide.",
    fuentesIndependientesAdmitidas: FUENTES_INDEPENDIENTES,
    loQueNoEsIndependiente: NO_SON_INDEPENDIENTES,
    vocabularioDeVeredictos: {
      servible_hoy:
        "Hay un testigo ajeno en el árbol, ya verifica, y dice que SÍ sobre el criterio candidato. El parche va escrito y su efecto está medido.",
      bloqueado_por_defecto_medido:
        "Hay un testigo ajeno en el árbol y dice que NO. El punto vuelve cuando el defecto se arregle; la petición que lo arregla va con nombre.",
      el_corpus_de_hoy_no_lo_alcanza:
        "El material ajeno del árbol no llega hasta aquí. Lo que sí llegaría está nombrado y es alcanzable: PyPI, npm y crates.io responden.",
      no_lo_sirve_material_ajeno:
        "Ningún fichero de terceros puede atestiguar esto. Falta la tercera pata de la regla: un usuario real.",
    },
    hallazgo:
      "La ÚNICA marca `independent: true` del lado DXF de la rúbrica de hoy está en dxf.corpus-external y apunta a docs/cad/evidence/dxf-external-corpus-matrix.json, cuyo propio encabezado dice `corpusSintetico: true`. Hoy no infla la cuenta porque ese criterio no se concede (falta la firma humana de derechos), pero el día que la firma llegue sin P-evidencia-04 concedería 2 pt de «independencia» a un corpus que generó este proyecto. P-evidencia-04 sustituye esa entrada por el corpus real.",
    medido: {
      antes: {
        total: `${puntuada.earned}/${puntuada.totalPoints}`,
        porcentaje: puntuada.percentage,
        alcanceHoy: `${puntuada.scopes.hoy.earned}/${puntuada.scopes.hoy.points}`,
        puntosConEvidenciaIndependiente: puntuada.evidenceClasses.independiente,
        filasConTope: puntuada.evidenceClasses.categoriasConTecho,
      },
      despuesDeAplicarLosParchesDeEsteCenso: {
        total: `${despues.earned}/${despues.totalPoints}`,
        porcentaje: despues.percentage,
        alcanceHoy: `${despues.scopes.hoy.earned}/${despues.scopes.hoy.points}`,
        puntosConEvidenciaIndependiente: despues.evidenceClasses.independiente,
        filasConTope: despues.evidenceClasses.categoriasConTecho,
      },
      comoSeMidio:
        "Clonando la rúbrica en memoria, aplicándole los parches de las filas `servible_hoy` y volviendo a llamar a scoreRubric() con el mismo contexto. docs/competitive/rubric.json NO se toca: es archivo compartido y lo aplica el coordinador.",
    },
    resumen: {
      filasConTope: conTope.length,
      puntosRetenidos: conTope.length,
      porVeredicto: Object.fromEntries(
        VEREDICTOS.map((veredicto) => [
          veredicto,
          filas.filter((f) => f.veredicto === veredicto).length,
        ]),
      ),
    },
    filas,
  };

  /* ── 7. Contra lo comprometido ─────────────────────────────────────────── */
  const serializado = `${JSON.stringify(censo, null, 2)}\n`;
  if (process.env.VALLE_ESCRIBIR_CENSO === "1") {
    fs.writeFileSync(CENSO, serializado);
    console.log(`· censo escrito en ${path.relative(RAIZ, CENSO)}`);
  }
  ok(fs.existsSync(CENSO), `no existe ${path.relative(RAIZ, CENSO)}`);
  igual(
    JSON.parse(fs.readFileSync(CENSO, "utf8")),
    JSON.parse(serializado),
    "el censo comprometido ya no es el que sale de la rúbrica de hoy: regenéralo con VALLE_ESCRIBIR_CENSO=1 y mira qué cambió antes de comprometerlo",
  );

  const servibleHoy = filas.filter((f) => f.veredicto === "servible_hoy").length;
  console.log(
    `censo de independencia: ${conTope.length} fila(s) con tope · ` +
      `${servibleHoy} servible(s) hoy · ${comprobaciones} afirmaciones estructurales ` +
      `(0 casos numéricos: este censo no mide el dibujo)`,
  );
  console.log(
    "  · no suma al total de check:cad-math a propósito: sus afirmaciones son estructurales " +
      "sobre la rúbrica, no medidas del dibujo contra un oráculo externo.",
  );
  console.log(
    `  · medido sobre una COPIA en memoria: ${puntuada.earned}/${puntuada.totalPoints} → ` +
      `${despues.earned}/${despues.totalPoints}, filas con tope ${conTope.length} → ` +
      `${despues.evidenceClasses.categoriasConTecho}, pt independientes ` +
      `${puntuada.evidenceClasses.independiente} → ${despues.evidenceClasses.independiente}.`,
  );
})();
