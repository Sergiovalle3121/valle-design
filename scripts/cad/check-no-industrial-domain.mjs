/**
 * GATE DE IDENTIDAD — nada de dominio industrial en el producto.
 *
 * Valle Design es un CAD 2D general y universal: dibuja planos. No es un ERP,
 * no es un MES, no planifica plantas de manufactura ni balancea líneas de
 * producción. Ver `IDENTITY.md`.
 *
 * Este gate recorre el código de producto y falla si reaparece vocabulario o
 * funcionalidad de gestión industrial, ya sea como identificador de código o
 * como cadena visible al usuario.
 *
 * Dos listas, con papeles distintos:
 *
 *   `permittedExceptions` / `permittedFiles` — excepciones LEGÍTIMAS y
 *   permanentes, cada una con su motivo escrito. Un plano DE una fábrica sí se
 *   dibuja; el software que OPERA la fábrica no vive aquí.
 *
 *   `residueBacklog` — residuo conocido que la campaña de identidad todavía no
 *   ha retirado. Es un TRINQUETE: si una entrada deja de tener hallazgos, el
 *   gate falla pidiendo que se borre la línea, para que la lista no mienta ni
 *   sirva de escondite. Debe llegar a cero y quedarse en cero.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");

/** Raíces de código de producto que se auditan. */
const scanRoots = ["apps/web/src", "apps/api/src", "packages"];

const ignoredDirectories = new Set([
  // .claude aloja worktrees efímeros que el harness de agentes crea DENTRO del
  // repo; su contenido es una copia del árbol y barrerla duplica cada hallazgo.
  ".claude",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

const sourceExtensions = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

/**
 * Vocabulario prohibido en IDENTIFICADORES (nombres de variables, funciones,
 * tipos y propiedades). Se compara contra el identificador en minúsculas y sin
 * separadores, de modo que `taktSeconds`, `takt_seconds` y `TAKT` caen igual.
 */
export const forbiddenIdentifierFragments = [
  ["takt", "takt time es planificación de manufactura"],
  ["yamazumi", "diagrama de balanceo de línea"],
  ["linebalance", "balanceo de línea de producción"],
  ["balanceline", "balanceo de línea de producción"],
  ["workorder", "orden de trabajo: es ERP/MES"],
  ["conveyor", "transportador de línea de producción"],
  ["forklift", "montacargas: logística de planta"],
  ["warehouserack", "rack de almacén: inventario"],
  ["materialroute", "ruta de material: planificación de flujo"],
  ["stationoverlay", "capa de estaciones del planificador de plantas"],
  ["flowmetric", "métricas de flujo de producción"],
  ["flowoptimization", "optimización de flujo de planta"],
  ["arrangeline", "acomodo de línea de producción"],
  ["connectline", "conexión de flujo entre estaciones"],
  ["industrypack", "paquete de dominio industrial"],
  ["industryrollup", "consolidado de indicadores industriales"],
  ["kitting", "surtido de materiales: logística interna"],
  ["andonboard", "señalización de paro de línea"],
  ["replenish", "reabasto de materiales"],
];

/**
 * Vocabulario prohibido en CADENAS visibles o de datos. Se compara contra el
 * texto en minúsculas y sin acentos, para que «balanceo de línea» y «balanceo
 * de linea» caigan igual.
 */
export const forbiddenTextFragments = [
  ["takt", "takt time"],
  ["yamazumi", "balanceo de línea"],
  ["balanceo de linea", "balanceo de línea de producción"],
  ["orden de trabajo", "ERP/MES"],
  ["ordenes de trabajo", "ERP/MES"],
  ["linea de produccion", "planificación industrial"],
  ["lineas de produccion", "planificación industrial"],
  ["planta de manufactura", "planificación industrial"],
  ["montacargas", "logística de planta"],
  ["rack de almacen", "inventario"],
  ["supermercado de kitting", "logística interna"],
  ["reabasto", "logística interna"],
];

/**
 * Excepciones LEGÍTIMAS y permanentes, por prefijo de ruta, con su motivo.
 */
export const permittedExceptions = [
  // La puerta por la que un cliente del ERP viejo trae sus datos a Valle
  // Design. Es adquisición de clientes, no residuo. Ver IDENTITY.md.
  ["apps/api/src/migration-cli/", "CLI de migración enterprise a Design"],
  // Valores PERSISTIDOS congelados: renombrarlos es migrar datos de clientes.
  ["packages/contracts/src/legacy/", "identificadores persistidos congelados"],
  ["apps/web/src/lib/cad/legacy/", "adaptador HTTP de compatibilidad"],
];

/**
 * Falsos positivos verificados archivo por archivo.
 */
export const permittedFiles = [
  // «MES» aquí es el mes fiscal de una factura, no Manufacturing Execution
  // System; y el archivo describe el flujo de timbrado, no una planta.
  ["apps/api/src/commercial/cfdi-issuance.service.ts", "mes fiscal del CFDI"],
  // «Sergio Valle Enterprise Software» es la razón social real de la empresa.
  ["packages/contracts/src/brand.ts", "razón social real"],
  // CATÁLOGOS DE CONTENIDO DIBUJABLE. Son datos puros —sin lógica— y la regla
  // que aplican es la de IDENTITY.md: un plano DE una fábrica sí se dibuja. Una
  // nave industrial necesita poder llevar dibujados su banda transportadora, su
  // montacargas y su línea de producción, igual que la panadería lleva su
  // `bread-rack`. Lo que no vive aquí ni en ningún otro sitio es la
  // FUNCIONALIDAD industrial: nada calcula takt, balancea líneas ni rutea
  // material. Si alguien mete lógica en estos archivos, se saca de la lista.
  ["apps/web/src/lib/cad/symbols.ts", "catálogo de símbolos dibujables"],
  ["apps/web/src/lib/cad/symbols.spec.ts", "spec del catálogo de símbolos"],
  ["apps/web/src/lib/cad/templates.ts", "catálogo de plantillas dibujables"],
  // Las FICHAS del mismo catálogo (etiqueta, grupo y descripción), generadas
  // de `templates.ts` por `scripts/templates-catalog.mts` para que la paleta
  // no cargue el cuerpo de las plantillas: mismo texto, misma regla.
  ["apps/web/src/lib/cad/templates-catalog.ts", "fichas generadas del catálogo de plantillas"],
  // Valor PERSISTIDO congelado: `forklift_path` vive dentro de documentos
  // guardados. Se lee para no romperlos; ninguna acción del editor crea uno
  // nuevo (los pasillos se crean como `aisle`). Ver IDENTITY.md.
  [
    "apps/web/src/lib/cad/safety-zones.ts",
    "tipo de zona persistido y congelado",
  ],
  ["apps/web/src/lib/cad/safety-zones.spec.ts", "spec del tipo persistido"],
];

/**
 * Residuo conocido pendiente de retirar. TRINQUETE: una entrada sin hallazgos
 * hace fallar el gate. Objetivo: lista vacía, y que se quede vacía.
 */
export const residueBacklog = [];

const stripAccents = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "");

const normalizeIdentifier = (value) =>
  stripAccents(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "");

const normalizeText = (value) => stripAccents(value).toLowerCase();

function relativePath(root_, file) {
  return path.relative(root_, file).replaceAll(path.sep, "/");
}

export function isPermittedPath(relative) {
  return (
    permittedExceptions.some(([prefix]) => relative.startsWith(prefix)) ||
    permittedFiles.some(([file]) => relative === file)
  );
}

/**
 * Analiza UNA fuente y devuelve los hallazgos de dominio industrial.
 * Es la unidad que la spec ejercita: no toca disco ni conoce el backlog.
 */
export function scanSourceForIndustrialDomain(relative, sourceText) {
  const source = ts.createSourceFile(
    relative,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith(".tsx") || relative.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const findings = [];

  const positionOf = (node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source));

  const push = (node, token, reason) => {
    const { line, character } = positionOf(node);
    findings.push({
      relative,
      line: line + 1,
      column: character + 1,
      location: `${relative}:${line + 1}:${character + 1}`,
      token,
      reason,
    });
  };

  const reportIdentifier = (node, name) => {
    const normalized = normalizeIdentifier(name);
    for (const [fragment, reason] of forbiddenIdentifierFragments) {
      if (!normalized.includes(fragment)) continue;
      push(node, name.slice(0, 60), reason);
      return true;
    }
    return false;
  };

  const reportText = (node, text) => {
    const normalized = normalizeText(text);
    for (const [fragment, reason] of forbiddenTextFragments) {
      if (!normalized.includes(fragment)) continue;
      push(node, text.trim().slice(0, 60), reason);
      return true;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      reportIdentifier(node, node.text);
    } else if (ts.isStringLiteral(node)) {
      if (!reportIdentifier(node, node.text)) reportText(node, node.text);
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      reportText(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      reportText(node.head, node.head.text);
      for (const span of node.templateSpans)
        reportText(span.literal, span.literal.text);
    } else if (ts.isJsxText(node)) {
      reportText(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

/**
 * Recorre las raíces de producto y devuelve `{ findings, staleBacklog, scannedFiles }`.
 * `findings` excluye lo que cubre el backlog; `staleBacklog` son las entradas
 * del backlog que ya no encuentran nada — el trinquete que impide que la lista
 * mienta.
 */
export function auditRepository(repoRoot) {
  const findings = [];
  const backlogHits = new Set();
  let scannedFiles = 0;

  const inspect = (file) => {
    const relative = relativePath(repoRoot, file);
    if (isPermittedPath(relative)) return;
    scannedFiles += 1;
    const backlogged = residueBacklog.find(([prefix]) =>
      relative.startsWith(prefix),
    );
    const hits = scanSourceForIndustrialDomain(
      relative,
      fs.readFileSync(file, "utf8"),
    );
    if (!hits.length) return;
    if (backlogged) {
      backlogHits.add(backlogged[0]);
      return;
    }
    findings.push(...hits);
  };

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (sourceExtensions.has(path.extname(entry.name))) inspect(file);
    }
  };

  for (const scanRoot of scanRoots) {
    const absolute = path.join(repoRoot, scanRoot);
    if (fs.existsSync(absolute)) walk(absolute);
  }

  const staleBacklog = residueBacklog
    .map(([prefix]) => prefix)
    .filter((prefix) => !backlogHits.has(prefix));

  return { findings, staleBacklog, scannedFiles };
}

/** Convierte el resultado de la auditoría en las líneas del reporte de error. */
export function formatProblems({ findings, staleBacklog }) {
  const problems = [];
  if (findings.length) {
    const grouped = new Map();
    for (const finding of findings) {
      const list = grouped.get(finding.relative) ?? [];
      list.push(finding);
      grouped.set(finding.relative, list);
    }
    problems.push(
      "Dominio industrial en codigo de producto. Valle Design dibuja planos, no opera fabricas (ver IDENTITY.md):",
    );
    for (const [relative, list] of [...grouped].sort()) {
      problems.push(`  ${relative}`);
      for (const finding of list.slice(0, 12)) {
        problems.push(
          `    ${finding.location}  <<${finding.token}>> - ${finding.reason}`,
        );
      }
      if (list.length > 12)
        problems.push(`    ... y ${list.length - 12} mas en este archivo`);
    }
  }
  if (staleBacklog.length) {
    problems.push(
      "Entradas de residueBacklog sin hallazgos: el residuo ya se retiro. Borra la linea del gate para que la lista no mienta:",
      ...staleBacklog.map((prefix) => `  ${prefix}`),
    );
  }
  return problems;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  const audit = auditRepository(root);
  const problems = formatProblems(audit);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const pending = residueBacklog.length;
  console.log(
    `Gate de identidad OK: ${audit.scannedFiles} fuentes de producto sin dominio industrial` +
      (pending
        ? ` (${pending} entradas de residuo pendientes de retirar).`
        : "."),
  );
}
