#!/usr/bin/env node
/**
 * Presentación de la rúbrica competitiva: el informe de consola y la sección
 * fila a fila de `docs/competitive/autocad-2027-gap-matrix.md`.
 *
 * Vive separado de `rubric.mjs` por el presupuesto de monolito (≤800 líneas
 * por archivo no presupuestado): el motor puntúa, este módulo cuenta lo que
 * el motor puntuó. La dependencia es de ida y vuelta pero segura: de aquí se
 * llama a `cheapestWins` sólo en tiempo de ejecución, cuando los dos módulos
 * ya terminaron de cargarse.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cheapestWins } from "./rubric.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MATRIX_FILE = path.resolve(
  here,
  "../..",
  "docs/competitive/autocad-2027-gap-matrix.md",
);

// ---------------------------------------------------------------------------
// Informe de consola
// ---------------------------------------------------------------------------

const bar = (ratio) => {
  const filled = Math.round(ratio * 20);
  return `${"█".repeat(filled)}${"·".repeat(20 - filled)}`;
};

export function formatReport(scored, { verbose = false } = {}) {
  const lines = [];
  lines.push("RÚBRICA COMPETITIVA CAD — Valle Design frente a AutoCAD 2027");
  lines.push(`Corte de la rúbrica: ${scored.cutoffDate ?? "sin fecha"}`);
  lines.push("");
  for (const error of scored.definitionErrors)
    lines.push(`❌ DEFINICIÓN: ${error}`);
  if (scored.definitionErrors.length) lines.push("");
  for (const category of scored.categories) {
    lines.push(
      `${bar(category.ratio)} ${String(category.earned).padStart(3)}/${String(category.points).padEnd(3)} ${category.name}` +
        (category.independenceCap
          ? " · retiene 1 pt: toda su evidencia es propia"
          : ""),
    );
    for (const criterion of category.criteria) {
      if (criterion.status === "otorgado" && !verbose) continue;
      const mark =
        criterion.status === "otorgado"
          ? "✅"
          : criterion.status === "no-verificable"
            ? "❓"
            : "⬜";
      lines.push(`      ${mark} ${criterion.points} pt · ${criterion.text}`);
      for (const item of criterion.evidence)
        if (item.ok !== true || verbose)
          lines.push(
            `           ${item.ok === true ? "·" : item.ok === null ? "?" : "×"} ${item.detail}`,
          );
    }
  }
  lines.push("");
  // La coletilla se CALCULA. Decía «ninguna fila llega a su tope» como texto
  // fijo, y el día que una llegó siguió diciéndolo: una rúbrica que se escribe
  // a sí misma una frase que ya no es cierta es la misma tabla escrita a mano
  // que este script existe para sustituir.
  const capped = scored.categories.filter(
    (category) => category.earned >= category.points,
  );
  // Los DOS denominadores, siempre juntos: el de HOY (el flujo diario de
  // dibujo 2D técnico, donde se exige el 10/10 y que se enseña a un cliente)
  // y el de DESTINO (AutoCAD completo, que mide si avanzamos hacia donde
  // queremos llegar). Publicar sólo uno es elegir a quién mentirle.
  if (scored.scopes) {
    lines.push(
      `ALCANCE DE HOY   ${scored.scopes.hoy.earned}/${scored.scopes.hoy.points} (${scored.scopes.hoy.percentage} %) — flujo diario de dibujo 2D técnico; la cifra de cliente.`,
    );
    lines.push(
      `ALCANCE DESTINO  ${scored.scopes.destino.earned}/${scored.scopes.destino.points} (${scored.scopes.destino.percentage} %) — AutoCAD completo; la cifra de inversionista. Lo excluido de hoy es «todavía no», nunca «nunca».`,
    );
  }
  if (scored.evidenceClasses) {
    lines.push(
      `EVIDENCIA: ${scored.evidenceClasses.independiente} pt con evidencia INDEPENDIENTE (oráculos externos, material de terceros) · ` +
        `${scored.evidenceClasses.propia} pt sólo con evidencia propia · ` +
        `${scored.evidenceClasses.categoriasConTecho} fila(s) retienen 1 pt por carecer de evidencia independiente.`,
    );
  }
  lines.push(
    `TOTAL ${scored.earned}/${scored.totalPoints} (${scored.percentage} %) — el denominador es ` +
      `público y ${
        capped.length === 0
          ? "ninguna fila llega a su tope"
          : `${capped.length} fila(s) llegan a su tope: ${capped
              .map((category) => category.name ?? category.id)
              .join(", ")}`
      }.`,
  );
  const blocked = scored.categories
    .flatMap((c) => c.criteria)
    .filter((c) => c.status === "no-verificable");
  if (blocked.length)
    lines.push(
      `${blocked.length} criterio(s) NO VERIFICABLES en este entorno; no se conceden. Instala dependencias (npm ci) para resolverlos.`,
    );
  lines.push(
    "Informativo: este script nunca bloquea el CI. Una rúbrica que bloquea se infla.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Matriz fila a fila (docs/competitive/autocad-2027-gap-matrix.md)
// ---------------------------------------------------------------------------

const MARK_BEGIN = "<!-- rubric:begin -->";
const MARK_END = "<!-- rubric:end -->";

const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");

/**
 * La sección fila a fila de la matriz, RENDERIZADA desde la puntuación.
 *
 * La prosa manual de esa sección envejeció dos veces y en las dos direcciones:
 * primero afirmó 131 mientras el script decía 166, y después afirmó cosas que
 * ya no eran ciertas hacia arriba («no hay comando HATCH» con HATCH en el
 * registro). Lo que se genera no puede discrepar del script porque ES el
 * script. Determinista a propósito: sin fecha de generación ni commit, para
 * que regenerar sobre el mismo árbol no produzca un diff.
 */
export function renderMatrixSection(rubric, scored) {
  const lines = [];
  lines.push(
    "> Esta sección la genera `node scripts/cad/rubric.mjs --markdown` desde",
    "> `docs/competitive/rubric.json` verificando cada evidencia contra el árbol.",
    "> Editarla a mano es reintroducir el defecto que motivó el script: la prosa",
    "> manual envejeció dos veces y en las dos direcciones.",
    "",
  );
  const capped = scored.categories.filter((c) => c.earned >= c.points);
  lines.push(
    `**Puntuación (rúbrica ${scored.rubricVersion ?? "sin versión"}).** ` +
      (scored.scopes
        ? `**Alcance de HOY: ${scored.scopes.hoy.earned}/${scored.scopes.hoy.points} ` +
          `(${scored.scopes.hoy.percentage} %)** — el flujo diario de dibujo 2D técnico, ` +
          `la cifra que se enseña a un cliente. **Alcance de DESTINO: ` +
          `${scored.scopes.destino.earned}/${scored.scopes.destino.points} ` +
          `(${scored.scopes.destino.percentage} %)** — AutoCAD completo con sus verticales, ` +
          `la cifra que mide el camino; lo excluido de hoy es «todavía no», nunca «nunca». `
        : `${scored.earned}/${scored.totalPoints} (${scored.percentage} %). `) +
      (scored.evidenceClasses
        ? `${scored.evidenceClasses.independiente} pt provienen de evidencia INDEPENDIENTE y ` +
          `${scored.evidenceClasses.propia} pt sólo de evidencia propia; ` +
          `${scored.evidenceClasses.categoriasConTecho} fila(s) retienen 1 pt hasta tener evidencia independiente. `
        : "") +
      `${capped.length} de ${scored.categories.length} filas están en su tope` +
      (capped.length
        ? `: ${capped.map((c) => c.name ?? c.id).join(", ")}. `
        : ". ") +
      "Una fila sólo llega a su tope cuando TODOS sus criterios verifican, " +
      "incluidos los que nombran gaps documentados; un gap conocido se declara " +
      "como criterio que falla, no como nota al pie.",
    "",
  );
  const blocked = scored.categories
    .flatMap((c) => c.criteria)
    .filter((c) => c.status === "no-verificable");
  if (blocked.length)
    lines.push(
      `> ${blocked.length} criterio(s) NO VERIFICABLES en el entorno de esta corrida; no se conceden.`,
      "",
    );
  for (const group of rubric.groups ?? []) {
    const categories = scored.categories.filter((c) => c.group === group.id);
    if (!categories.length) continue;
    const earned = categories.reduce((acc, c) => acc + c.earned, 0);
    lines.push(`### ${group.name} — ${earned}/${group.points}`, "");
    lines.push(
      "| Categoría | Puntos | Estado | Qué verifica hoy | Qué falta exactamente |",
      "| --- | ---: | --- | --- | --- |",
    );
    for (const category of categories) {
      const granted = category.criteria.filter((c) => c.status === "otorgado");
      const pending = category.criteria.filter((c) => c.status !== "otorgado");
      const status =
        category.earned >= category.points
          ? "Completa"
          : category.earned === 0
            ? "Ausente"
            : "Parcial";
      lines.push(
        `| ${cell(category.name)} | ${category.earned}/${category.points} | ${status} | ` +
          `${granted.length ? cell(granted.map((c) => c.text).join("; ")) : "Nada verificado"} | ` +
          `${
            pending.length
              ? cell(
                  pending
                    .map((c) => `${c.text} (${c.points} pt)`)
                    .join("; "),
                )
              : "Nada pendiente: todos los criterios declarados verifican"
          } |`,
      );
    }
    lines.push("");
  }
  const wins = cheapestWins(rubric, scored);
  if (wins.length) {
    lines.push(
      "### Prioridad: los diez puntos más baratos por valor comercial",
      "",
      "Entre los criterios NO otorgados, ordenados por puntos entre `costDays`",
      "declarados. Reproducible con `node scripts/cad/rubric.mjs --priorities`.",
      "",
      "| # | Puntos | Días | Categoría | Criterio |",
      "| ---: | ---: | ---: | --- | --- |",
    );
    for (const [index, win] of wins.entries())
      lines.push(
        `| ${index + 1} | ${win.points} | ${win.costDays ?? "?"} | ${cell(win.category)} | ${cell(win.text)} |`,
      );
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Reemplaza la sección entre `rubric:begin` y `rubric:end` del documento. */
export function writeMatrixMarkdown(
  rubric,
  scored,
  { file = MATRIX_FILE, write = true } = {},
) {
  const original = fs.readFileSync(file, "utf8");
  const begin = original.indexOf(MARK_BEGIN);
  const end = original.indexOf(MARK_END);
  if (begin === -1 || end === -1 || end < begin)
    throw new Error(
      `${file} no tiene los marcadores ${MARK_BEGIN} … ${MARK_END}: sin ellos no se puede regenerar la sección sin pisar la prosa escrita a mano.`,
    );
  const next =
    original.slice(0, begin + MARK_BEGIN.length) +
    "\n\n" +
    renderMatrixSection(rubric, scored) +
    "\n\n" +
    original.slice(end);
  const changed = next !== original;
  // `write: false` = modo verificación: reporta si la matriz está al día sin
  // tocar el árbol — un pipeline de COMPROBACIÓN no muta archivos versionados.
  if (changed && write) fs.writeFileSync(file, next);
  return { file, changed };
}
