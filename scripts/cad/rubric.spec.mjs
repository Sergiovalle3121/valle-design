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
  scoreRubric,
  validateRubric,
  writeHistory,
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
        criterion("cat-a.file", 2, [
          { kind: "file", path: "apps/web/src/lib/demo/present.ts" },
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
  eq(scored.earned, 6, "la evidencia completa concede los 6 puntos");
  eq(scored.percentage, 100, "el porcentaje sale del denominador publicado");
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
  eq(published.totalPoints, 200, "el denominador publicado son 200 puntos");
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

fs.rmSync(root, { recursive: true, force: true });

console.log(
  `rubric.spec.mjs: ${checks} comprobaciones verdes — puntuación, denominador, huérfanos, umbrales con máquina, caducidad de lo manual, no-verificable≠otorgado, errores de definición, histórico y prioridad.`,
);
