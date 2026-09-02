#!/usr/bin/env node
/**
 * Spec de la calculadora de la rúbrica competitiva.
 *
 * Lo que hay que probar aquí no es que sume. Es que NO CONCEDA. Una rúbrica se
 * degrada en autobombo por un camino muy concreto: alguien declara un punto,
 * la evidencia se mueve o nunca existió, y el script lo da por bueno «porque
 * está en el documento». Por eso cada caso feliz tiene aquí su gemelo triste, y
 * el gemelo triste es el que importa.
 *
 * Los casos se montan sobre un árbol de mentira en un directorio temporal: así
 * la spec prueba el motor de puntuación y no el estado del repositorio de hoy,
 * que cambia cada semana y convertiría este archivo en un golden frágil.
 *
 * Imprime un resumen por stdout: es la convención del runner de specs del web
 * (`apps/web/scripts/run-specs.mjs`), donde una spec silenciosa es una spec
 * fallida, y no hay razón para que ésta se comporte distinto.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_RUBRIC,
  cheapestWins,
  createContext,
  findImporters,
  loadRubric,
  readHistory,
  renderMatrixSection,
  scoreRubric,
  validateRubric,
  writeHistory,
  writeMatrixMarkdown,
} from "./rubric.mjs";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "valle-rubric-"));
const write = (rel, body) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
};

// --- árbol de mentira -------------------------------------------------------
write("apps/web/src/lib/demo/present.ts", "export const present = 1;\n");
write("apps/web/src/lib/demo/present.spec.ts", "console.log('demo ok');\n");
write("apps/web/src/lib/used/index.ts", "export const used = 2;\n");
write(
  "apps/web/src/lib/used/used.spec.ts",
  'import "./index";\nconsole.log("used ok");\n',
);
write("apps/web/src/lib/orphan/index.ts", "export const orphan = 3;\n");
write(
  "apps/web/src/lib/orphan/orphan.spec.ts",
  'import "./index";\nconsole.log("orphan ok");\n',
);
// Una spec de FUERA del módulo: es el caso que distingue «probado» de «usado».
write(
  "apps/web/src/lib/orphan-suite.spec.ts",
  'import "./orphan";\nconsole.log("suite ok");\n',
);
write(
  "apps/web/src/components/Screen.tsx",
  'import { used } from "@/lib/used";\nexport default () => used;\n',
);
write("apps/web/e2e/golden/01-demo.spec.ts", "// golden\n");
write(
  "docs/evidence/metrics.json",
  JSON.stringify({
    environment: { cpuModel: "Xeon de mentira" },
    measurements: { firstMs: 750 },
  }),
);
write(
  "docs/evidence/sin-maquina.json",
  JSON.stringify({ measurements: { firstMs: 10 } }),
);
write(
  "docs/evidence/veredicto.json",
  JSON.stringify({
    verdict: { passed: true, motivo: "todo verde" },
    profiles: [{ fullDetailMs: 48200.4, pan: { fpsP95: 1.395 } }],
  }),
);
write("docs/evidence/roto.json", "esto no es JSON {");

const today = new Date("2026-08-09T12:00:00.000Z");
const ctx = () => createContext({ root, now: today });

const criterion = (id, points, evidence, extra = {}) => ({
  id,
  points,
  text: id,
  evidence,
  ...extra,
});
const rubricWith = (categories) => ({
  version: "test",
  cutoffDate: "2026-08-09",
  totalPoints: categories.reduce((acc, c) => acc + c.points, 0),
  manualMaxAgeDays: 180,
  categories,
});
const byId = (scored, id) =>
  scored.categories.flatMap((c) => c.criteria).find((c) => c.id === id);

// ---------------------------------------------------------------------------
// 1. El caso feliz suma exactamente lo declarado
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-a",
      name: "Categoría A",
      points: 6,
      criteria: [
        // Con minLines: un criterio de ≥2 pt cuya única evidencia fuera la
        // EXISTENCIA de un archivo es, desde el corte 2026-08-20, un error de
        // definición (véase el caso 10).
        criterion("cat-a.file", 2, [
          { kind: "file", path: "apps/web/src/lib/demo/present.ts", minLines: 1 },
        ]),
        criterion("cat-a.spec", 3, [
          { kind: "spec", path: "apps/web/src/lib/demo/present.spec.ts" },
        ]),
        criterion("cat-a.golden", 1, [
          { kind: "golden", path: "apps/web/e2e/golden/01-demo.spec.ts" },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(
    validateRubric(rubric),
    [],
    "una rúbrica bien formada no tiene errores de definición",
  );
  // Corte 2026-08-22: TODA la evidencia de esta categoría es PROPIA, así que
  // aunque cada criterio verifique, la fila retiene 1 punto — una capacidad
  // validada sólo contra material propio no puede llegar a su tope.
  eq(scored.earned, 5, "evidencia completa pero sólo propia: 6 − 1 de techo");
  eq(
    scored.categories[0].independenceCap,
    true,
    "y el techo queda declarado en la categoría",
  );
  eq(
    scored.evidenceClasses.categoriasConTecho,
    1,
    "y contado en el resumen de clases de evidencia",
  );

  // Con UNA evidencia independiente verificada, el techo se levanta.
  const independentRubric = rubricWith([
    {
      id: "cat-a",
      name: "Categoría A",
      points: 6,
      criteria: [
        criterion("cat-a.file", 2, [
          {
            kind: "file",
            path: "apps/web/src/lib/demo/present.ts",
            minLines: 1,
            independent: true,
          },
        ]),
        criterion("cat-a.spec", 3, [
          { kind: "spec", path: "apps/web/src/lib/demo/present.spec.ts" },
        ]),
        criterion("cat-a.golden", 1, [
          { kind: "golden", path: "apps/web/e2e/golden/01-demo.spec.ts" },
        ]),
      ],
    },
  ]);
  const independentScored = scoreRubric(independentRubric, ctx());
  eq(
    independentScored.earned,
    6,
    "con evidencia independiente la fila SÍ llega a su tope",
  );
  eq(
    independentScored.evidenceClasses.independiente,
    2,
    "y sus puntos se cuentan como independientes",
  );
}

// ---------------------------------------------------------------------------
// 2. Evidencia que falta: el punto NO se otorga. Éste es el caso que importa.
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-b",
      name: "Categoría B",
      points: 10,
      criteria: [
        criterion("cat-b.ok", 4, [
          { kind: "file", path: "apps/web/src/lib/demo/present.ts" },
        ]),
        criterion("cat-b.missing-file", 3, [
          { kind: "file", path: "apps/web/src/lib/demo/fantasma.ts" },
        ]),
        criterion("cat-b.missing-golden", 2, [
          { kind: "golden", path: "apps/web/e2e/golden/99-fantasma.spec.ts" },
        ]),
        // Un solo trozo de evidencia rota tumba el criterio ENTERO: no hay
        // crédito parcial dentro de un punto.
        criterion("cat-b.partial", 1, [
          { kind: "file", path: "apps/web/src/lib/demo/present.ts" },
          { kind: "file", path: "apps/web/src/lib/demo/fantasma.ts" },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(scored.earned, 4, "sólo el criterio con evidencia real puntúa");
  eq(
    byId(scored, "cat-b.missing-file").status,
    "no-otorgado",
    "archivo ausente = punto no otorgado",
  );
  eq(
    byId(scored, "cat-b.missing-golden").earned,
    0,
    "golden ausente no da puntos",
  );
  eq(
    byId(scored, "cat-b.partial").earned,
    0,
    "evidencia a medias no da crédito parcial",
  );
}

// ---------------------------------------------------------------------------
// 3. Un módulo que nadie importa no cuenta como implementado
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-c",
      name: "Categoría C",
      points: 4,
      criteria: [
        criterion("cat-c.used", 2, [
          { kind: "imported", module: "apps/web/src/lib/used" },
        ]),
        criterion("cat-c.orphan", 2, [
          { kind: "imported", module: "apps/web/src/lib/orphan" },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(
    scored.earned,
    2,
    "el módulo huérfano no puntúa aunque tenga su propia spec verde",
  );
  eq(
    byId(scored, "cat-c.orphan").status,
    "no-otorgado",
    "importarse sólo desde su spec no es uso",
  );
  eq(
    findImporters(createContext({ root, now: today }), "apps/web/src/lib/used"),
    ["apps/web/src/components/Screen.tsx"],
    "el importador real se resuelve por el alias @/ y sin extensión",
  );
  eq(
    findImporters(
      createContext({ root, now: today }),
      "apps/web/src/lib/orphan",
      { includeSpecs: true },
    ).length,
    1,
    "con includeSpecs la spec propia sí aparece — por eso NO es el valor por defecto",
  );
}

// ---------------------------------------------------------------------------
// 4. Números: umbral respetado, umbral roto y número sin máquina
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-d",
      name: "Categoría D",
      points: 3,
      criteria: [
        criterion("cat-d.under", 1, [
          {
            kind: "metric",
            path: "docs/evidence/metrics.json",
            pointer: "measurements/firstMs",
            max: 1000,
          },
        ]),
        criterion("cat-d.over", 1, [
          {
            kind: "metric",
            path: "docs/evidence/metrics.json",
            pointer: "measurements/firstMs",
            max: 100,
          },
        ]),
        criterion("cat-d.no-machine", 1, [
          {
            kind: "metric",
            path: "docs/evidence/sin-maquina.json",
            pointer: "measurements/firstMs",
            max: 1000,
          },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(
    scored.earned,
    1,
    "sólo el número dentro de umbral y con máquina declarada puntúa",
  );
  ok(
    byId(scored, "cat-d.no-machine").evidence[0].detail.includes("máquina"),
    "un número sin máquina se rechaza diciendo por qué",
  );
}

// ---------------------------------------------------------------------------
// 5. Lo manual necesita firma, fecha y no estar caducado
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-e",
      name: "Categoría E",
      points: 4,
      criteria: [
        criterion("cat-e.signed", 1, [
          {
            kind: "manual",
            verifiedBy: "quien-sea",
            verifiedAt: "2026-07-01",
            note: "revisado a mano",
          },
        ]),
        criterion("cat-e.unsigned", 1, [
          { kind: "manual", verifiedAt: "2026-07-01" },
        ]),
        criterion("cat-e.undated", 1, [
          { kind: "manual", verifiedBy: "quien-sea" },
        ]),
        criterion("cat-e.stale", 1, [
          { kind: "manual", verifiedBy: "quien-sea", verifiedAt: "2024-01-01" },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(
    scored.earned,
    1,
    "sólo la comprobación manual firmada, fechada y fresca puntúa",
  );
  ok(
    byId(scored, "cat-e.stale").evidence[0].detail.includes("caducada"),
    "lo manual caduca y lo dice",
  );
}

// ---------------------------------------------------------------------------
// 6. Lo que no se puede verificar tampoco se concede
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-f",
      name: "Categoría F",
      points: 2,
      criteria: [
        criterion("cat-f.command", 2, [{ kind: "command", name: "TRIM" }]),
      ],
    },
  ]);
  // El árbol de mentira no tiene dependencias instaladas: el registro no se
  // puede consultar. La respuesta correcta es cero puntos y una explicación,
  // nunca «se lo concedo mientras tanto».
  const scored = scoreRubric(rubric, ctx());
  eq(scored.earned, 0, "sin registro consultable no se conceden puntos");
  eq(
    byId(scored, "cat-f.command").status,
    "no-verificable",
    "y se distingue de un fallo real",
  );
}

// ---------------------------------------------------------------------------
// 7. Errores de definición: el denominador no se cuadra a mano
// ---------------------------------------------------------------------------
{
  const mismatched = {
    totalPoints: 99,
    categories: [
      {
        id: "cat-g",
        name: "G",
        points: 5,
        criteria: [criterion("cat-g.one", 2, [{ kind: "file", path: "x" }])],
      },
      {
        id: "cat-g",
        name: "G duplicada",
        points: 1,
        criteria: [criterion("cat-g.two", 1, [])],
      },
    ],
  };
  const errors = validateRubric(mismatched);
  ok(
    errors.some((e) => e.includes("suman 2")),
    "detecta criterios que no cuadran con su categoría",
  );
  ok(
    errors.some((e) => e.includes("duplicada")),
    "detecta categorías duplicadas",
  );
  ok(
    errors.some((e) => e.includes("de oficio")),
    "detecta un criterio sin evidencia declarada",
  );
  ok(
    errors.some((e) => e.includes("denominador")),
    "detecta que el denominador publicado no cuadra",
  );
  ok(
    validateRubric({
      totalPoints: 1,
      categories: [
        {
          id: "h",
          points: 1,
          criteria: [criterion("h.x", 1, [{ kind: "inventada" }])],
        },
      ],
    }).some((e) => e.includes("inventada")),
    "rechaza tipos de evidencia que el script no sabe comprobar",
  );
}

// ---------------------------------------------------------------------------
// 8. La rúbrica publicada del repositorio está bien formada
// ---------------------------------------------------------------------------
{
  const published = loadRubric(DEFAULT_RUBRIC);
  eq(
    validateRubric(published),
    [],
    "docs/competitive/rubric.json no tiene errores de definición",
  );
  // Corte 2026-08-22: el denominador de DESTINO creció a 220 al nacer las
  // filas de integridad y de capacidad de crecer, y se publica JUNTO al de
  // HOY (las categorías scope:"hoy"), que es el que se enseña a un cliente.
  // Corte 2026-08-31: BAJÓ a 216. La categoría `nl-cad` (asistencia por IA)
  // valía 4 puntos de destino y se RETIRÓ con el motor: Valle Design no tiene
  // IA — era de Axos OS, el ERP del que nació este producto (`IDENTITY.md`).
  // Un denominador que cuenta una capacidad que el producto ya no quiere mide
  // contra un producto que no existe; los puntos ganados de la fila se van.
  // Corte 2026-09-02: SUBIÓ a 260 — nacen `recognition` (14 pt de HOY, por
  // goldens y specs que leen bytes), las siete filas de toolsets (28 pt de
  // DESTINO, casi todas en 0) y `hatch.pattern-table` (2 pt): un techo sin MEP
  // medía contra otro producto. Ola C: 265 — `modeling3d` (5 pt de DESTINO).
  // Ola D (2026-09-02): 271 — `foreign-work` (6 pt de HOY: la prueba de
  // despacho, el portapapeles y las seis órdenes del plano ajeno).
  eq(published.totalPoints, 271, "el denominador de destino publicado son 271 puntos");
  eq(
    published.categories.every((c) => c.scope === "hoy" || c.scope === "destino"),
    true,
    "cada categoría declara su alcance",
  );
  eq(
    published.categories
      .filter((c) => c.scope === "hoy")
      .reduce((acc, c) => acc + c.points, 0),
    197,
    "el denominador de HOY (flujo diario 2D + reconocimiento + trabajo ajeno) son 197 puntos",
  );
  const groups = new Map(published.groups.map((g) => [g.id, g.points]));
  for (const [id, points] of groups) {
    const sum = published.categories
      .filter((c) => c.group === id)
      .reduce((acc, c) => acc + c.points, 0);
    eq(sum, points, `el grupo ${id} suma lo que declara`);
  }
}

// ---------------------------------------------------------------------------
// 9. Histórico y tabla de prioridad
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-i",
      name: "Categoría I",
      points: 7,
      criteria: [
        criterion(
          "cat-i.done",
          1,
          [{ kind: "file", path: "apps/web/src/lib/demo/present.ts" }],
          { costDays: 1 },
        ),
        criterion("cat-i.cheap", 3, [{ kind: "file", path: "no/existe.ts" }], {
          costDays: 1,
        }),
        criterion("cat-i.dear", 2, [{ kind: "file", path: "no/existe.ts" }], {
          costDays: 40,
        }),
        criterion("cat-i.unpriced", 1, [
          { kind: "file", path: "no/existe.ts" },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  const wins = cheapestWins(rubric, scored, 5);
  eq(
    wins.map((w) => w.id),
    ["cat-i.cheap", "cat-i.dear", "cat-i.unpriced"],
    "la prioridad ordena por puntos entre días y deja lo ya otorgado fuera",
  );
  eq(
    wins.at(-1).costDays,
    null,
    "un criterio sin coste declarado va al final, no se le inventa uno",
  );

  const dir = path.join(root, "docs/competitive/history");
  const file = writeHistory(scored, { root, dir, now: today });
  ok(fs.existsSync(file), "el histórico se escribe con su fecha");
  const series = readHistory(dir);
  eq(series.length, 1, "la serie se lee de vuelta");
  eq(series[0].earned, 1, "el histórico guarda la nota de esa corrida");
  eq(
    series[0].categories[0].notGranted.length,
    3,
    "y qué criterios quedaron pendientes",
  );
}

// ---------------------------------------------------------------------------
// 10. jsonValue: el contenido del artefacto manda, no su existencia
// ---------------------------------------------------------------------------
{
  const rubric = rubricWith([
    {
      id: "cat-j",
      name: "Categoría J",
      points: 6,
      criteria: [
        criterion("cat-j.verdict-ok", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "verdict/passed",
            equals: true,
          },
        ]),
        criterion("cat-j.verdict-wrong", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "verdict/motivo",
            equals: "otro texto",
          },
        ]),
        // El caso que motivó el checker: el archivo EXISTE y su contenido
        // desmiente el criterio. 48.200 ms no son menos de 5.000.
        criterion("cat-j.threshold-broken", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "profiles/0/fullDetailMs",
            lte: 5000,
          },
        ]),
        criterion("cat-j.threshold-ok", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "profiles/0/pan/fpsP95",
            gt: 1,
          },
        ]),
        criterion("cat-j.missing-pointer", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "no/existe",
            equals: true,
          },
        ]),
        criterion("cat-j.not-json", 1, [
          {
            kind: "jsonValue",
            path: "docs/evidence/roto.json",
            pointer: "verdict/passed",
            equals: true,
          },
        ]),
      ],
    },
  ]);
  const scored = scoreRubric(rubric, ctx());
  eq(
    scored.earned,
    2,
    "jsonValue concede sólo cuando el CONTENIDO del artefacto cumple lo declarado",
  );
  eq(
    byId(scored, "cat-j.threshold-broken").status,
    "no-otorgado",
    "un artefacto que existe pero desmiente el umbral NO da el punto",
  );
  ok(
    byId(scored, "cat-j.threshold-broken").evidence[0].detail.includes("48200.4"),
    "y el detalle enseña el número que lo desmintió",
  );
  ok(
    byId(scored, "cat-j.missing-pointer").evidence[0].detail.includes("no tiene nada"),
    "un pointer que no existe se explica, no se concede",
  );
  eq(byId(scored, "cat-j.not-json").earned, 0, "un JSON ilegible no puntúa");
}

// ---------------------------------------------------------------------------
// 11. Lint de definición: existencia sin contenido en criterios de peso
// ---------------------------------------------------------------------------
{
  const onlyFile = rubricWith([
    {
      id: "cat-k",
      name: "Categoría K",
      points: 6,
      criteria: [
        // 2 pt sólo con existencia: el patrón exacto que infló la rúbrica
        // (performance.browser-slo cobraba por un JSON que medía 48 s).
        criterion("cat-k.inflated", 2, [
          { kind: "file", path: "docs/evidence/veredicto.json" },
        ]),
        // 1 pt sólo con existencia: permitido; el lint apunta al peso.
        criterion("cat-k.small", 1, [
          { kind: "file", path: "docs/evidence/veredicto.json" },
        ]),
        // 2 pt con minLines: la existencia CON cuerpo mínimo sí es contenido.
        criterion("cat-k.body", 2, [
          { kind: "file", path: "apps/web/src/lib/demo/present.ts", minLines: 1 },
        ]),
        // 2 pt con file + jsonValue: el contenido lo aporta la otra evidencia.
        criterion("cat-k.mixed", 1, [
          { kind: "file", path: "docs/evidence/veredicto.json" },
          {
            kind: "jsonValue",
            path: "docs/evidence/veredicto.json",
            pointer: "verdict/passed",
            equals: true,
          },
        ]),
      ],
    },
  ]);
  const errors = validateRubric(onlyFile);
  ok(
    errors.some((e) => e.startsWith("cat-k.inflated:")),
    "≥2 pt sólo con existencia de archivo es un error de DEFINICIÓN",
  );
  eq(
    errors.filter(
      (e) =>
        e.startsWith("cat-k.small:") ||
        e.startsWith("cat-k.body:") ||
        e.startsWith("cat-k.mixed:"),
    ),
    [],
    "1 pt, minLines o evidencia de contenido acompañante no se marcan",
  );
  const badJsonValue = validateRubric(
    rubricWith([
      {
        id: "cat-l",
        name: "L",
        points: 2,
        criteria: [
          criterion("cat-l.no-op", 1, [
            {
              kind: "jsonValue",
              path: "docs/evidence/veredicto.json",
              pointer: "verdict/passed",
            },
          ]),
          criterion("cat-l.no-pointer", 1, [
            { kind: "jsonValue", path: "docs/evidence/veredicto.json", gte: 1 },
          ]),
        ],
      },
    ]),
  );
  ok(
    badJsonValue.some((e) => e.includes("sin comparador")),
    "jsonValue sin comparador es un error de definición",
  );
  ok(
    badJsonValue.some((e) => e.includes("sin path o sin pointer")),
    "jsonValue sin pointer es un error de definición",
  );
}

// ---------------------------------------------------------------------------
// 12. La matriz fila a fila se regenera desde la puntuación, no desde la prosa
// ---------------------------------------------------------------------------
{
  const rubric = {
    ...rubricWith([
      {
        id: "cat-m",
        group: "demo",
        name: "Categoría M",
        points: 3,
        criteria: [
          criterion("cat-m.done", 2, [
            { kind: "file", path: "apps/web/src/lib/demo/present.ts", minLines: 1 },
          ]),
          criterion("cat-m.gap", 1, [
            { kind: "file", path: "no/existe.ts" },
          ]),
        ],
      },
    ]),
    groups: [{ id: "demo", name: "Grupo demo", points: 3 }],
  };
  const scored = scoreRubric(rubric, ctx());
  const section = renderMatrixSection(rubric, scored);
  ok(section.includes("2/3"), "la sección publica la nota calculada");
  ok(
    section.includes("cat-m.gap (1 pt)"),
    "lo no otorgado aparece como «qué falta», con sus puntos",
  );
  ok(
    section.includes("| Categoría M | 2/3 | Parcial |"),
    "el estado sale de la puntuación, no de una etiqueta manual",
  );

  const file = path.join(root, "docs/matriz-demo.md");
  fs.writeFileSync(
    file,
    "# Prosa a mano\n\n<!-- rubric:begin -->\nvieja tabla\n<!-- rubric:end -->\n\n## Más prosa\n",
  );
  const first = writeMatrixMarkdown(rubric, scored, { file });
  ok(first.changed, "la primera regeneración escribe la sección");
  const written = fs.readFileSync(file, "utf8");
  ok(
    written.includes("# Prosa a mano") && written.includes("## Más prosa"),
    "la prosa escrita a mano fuera de los marcadores no se toca",
  );
  ok(!written.includes("vieja tabla"), "la tabla vieja desaparece");
  const second = writeMatrixMarkdown(rubric, scored, { file });
  eq(
    second.changed,
    false,
    "regenerar sobre el mismo árbol es idempotente: sin diff",
  );
  fs.writeFileSync(file, "# Documento sin marcadores\n");
  let threw = false;
  try {
    writeMatrixMarkdown(rubric, scored, { file });
  } catch {
    threw = true;
  }
  ok(threw, "sin marcadores no se regenera nada: mejor fallar que pisar prosa");
}

fs.rmSync(root, { recursive: true, force: true });

console.log(
  `rubric.spec.mjs: ${checks} comprobaciones verdes — puntuación, denominador, huérfanos, umbrales con máquina, caducidad de lo manual, no-verificable≠otorgado, errores de definición, histórico, prioridad, jsonValue contra contenido, lint de existencia-sin-contenido y matriz regenerada.`,
);
