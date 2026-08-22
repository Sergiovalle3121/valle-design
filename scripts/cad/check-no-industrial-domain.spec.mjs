#!/usr/bin/env node
/**
 * Spec del gate de identidad.
 *
 * Lo que hay que probar no es que sepa buscar una palabra: es que distinga el
 * plano DE una fábrica —que un CAD universal debe poder dibujar— del software
 * que OPERA una fábrica, que no pertenece a este repositorio. Cada caso feliz
 * lleva su gemelo triste: el símbolo de gimnasio que NO debe caer junto al rack
 * de almacén que SÍ, el mes fiscal que NO junto al takt time que SÍ.
 *
 * También se prueba el trinquete: una entrada de `residueBacklog` que ya no
 * encuentra nada tiene que hacer fallar el gate, o la lista se vuelve un
 * escondite permanente.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  forbiddenIdentifierFragments,
  forbiddenTextFragments,
  isPermittedPath,
  permittedExceptions,
  permittedFiles,
  residueBacklog,
  scanSourceForIndustrialDomain,
  formatProblems,
} from "./check-no-industrial-domain.mjs";

const root = path.resolve(import.meta.dirname, "../..");

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

const tokens = (source, file = "sample.ts") =>
  scanSourceForIndustrialDomain(file, source).map((finding) => finding.token);

// ─── Cae lo que opera una fábrica ────────────────────────────────────────────

ok(
  tokens("const taktTimeSec = 42;").includes("taktTimeSec"),
  "takt time es planificación de manufactura",
);
ok(
  tokens("export function analyzeLineBalance() {}").length > 0,
  "balanceo de línea cae",
);
ok(
  tokens("const c = { conveyor: 1 };").includes("conveyor"),
  "transportador cae",
);
ok(
  tokens("const f = 'forklift_path';").includes("forklift_path"),
  "montacargas cae",
);
ok(
  tokens("const g = generateWarehouseRackRows();").includes(
    "generateWarehouseRackRows",
  ),
  "racks de almacén caen",
);
ok(
  tokens("const k = supermarketKitting;").includes("supermarketKitting"),
  "surtido de kitting cae",
);
ok(
  tokens("const t = traceMaterialRoute;").includes("traceMaterialRoute"),
  "ruta de material cae",
);
ok(
  tokens("const label = 'Balanceo de línea';").length > 0,
  "la cadena visible acentuada cae igual que la sin acento",
);
ok(
  tokens("const label = 'balanceo de linea';").length > 0,
  "y la cadena sin acento también",
);
ok(
  tokens("const help = 'Órdenes de trabajo pendientes';").length > 0,
  "órdenes de trabajo es ERP",
);
ok(
  tokens("const j = <p>Ruta de montacargas</p>;", "sample.tsx").length > 0,
  "el texto JSX visible también se audita",
);

// ─── NO cae lo que dibuja un plano ───────────────────────────────────────────

const falsePositives = [
  "const s = 'power-rack';", // gimnasio
  "const s = 'weight-rack';", // gimnasio
  "const s = 'tire-rack';", // llantera
  "const s = 'bread-rack';", // panadería
  "const s = 'coat-rack';", // perchero
  "const s = 'wash-station';", // lavabo
  "const s = 'tortilla-machine';", // máquina de tortillas
  "const t = 'nave-industrial';", // tipología de edificio
  "const t = 'planta-embotelladora';", // tipología de edificio
  "const t = 'centro-distribucion';", // tipología de edificio
  "const t = 'planta-tratamiento-agua';", // tipología de edificio
  "const t = 'mep-plantroom';", // cuarto de máquinas: MEP arquitectónico
  "const label = 'Planta arquitectónica';", // floor plan
  "const label = 'Planta baja';", // floor plan
  "const mes = factura.mesFiscal;", // mes del calendario, no MES
  "const razon = 'Sergio Valle Enterprise Software';", // razón social real
  "const label = 'Transportador de ángulos';", // el instrumento de dibujo
  "const label = 'Secuencia de trabajo';", // flujo de trabajo del dibujante
];
for (const source of falsePositives) {
  eq(tokens(source), [], `falso positivo evitado: ${source}`);
}

// ─── El tipo persistido `station` no lo persigue este gate ───────────────────

eq(
  tokens("const kind: CadObjectKind = 'station';"),
  [],
  "`station` es un tipo PERSISTIDO: se congela y se oculta, no se caza con un grep",
);

// ─── Excepciones legítimas ───────────────────────────────────────────────────

ok(
  isPermittedPath("apps/api/src/migration-cli/seed-enterprise-fixture.ts"),
  "el CLI de migración es puerta de entrada de clientes, no residuo",
);
ok(
  isPermittedPath("packages/contracts/src/legacy/dxf-xdata-apps.ts"),
  "los identificadores persistidos congelados están exentos",
);
ok(
  isPermittedPath("apps/api/src/commercial/cfdi-issuance.service.ts"),
  "el mes fiscal del CFDI está exento por archivo",
);
ok(
  !isPermittedPath("apps/web/src/lib/cad/templates.ts"),
  "el código de producto normal NO está exento",
);

// ─── El trinquete del backlog ────────────────────────────────────────────────

{
  const problems = formatProblems({
    findings: [],
    staleBacklog: ["apps/web/src/lib/cad/warehouse-generators.ts"],
  });
  ok(problems.length > 0, "una entrada de backlog sin hallazgos hace fallar");
  ok(
    problems.join(" ").includes("warehouse-generators"),
    "y nombra la entrada obsoleta que hay que borrar",
  );
}

eq(
  formatProblems({ findings: [], staleBacklog: [] }),
  [],
  "sin hallazgos y sin backlog obsoleto no hay problema que reportar",
);

// ─── Las listas dicen la verdad ──────────────────────────────────────────────

for (const [fragment, reason] of [
  ...forbiddenIdentifierFragments,
  ...forbiddenTextFragments,
]) {
  ok(
    typeof fragment === "string" && fragment.length > 2,
    `fragmento prohibido usable: ${fragment}`,
  );
  ok(
    typeof reason === "string" && reason.length > 0,
    `cada prohibición explica por qué: ${fragment}`,
  );
}

for (const [prefix, reason] of [...permittedExceptions, ...permittedFiles]) {
  ok(
    typeof reason === "string" && reason.length > 0,
    `cada excepción lleva su motivo escrito: ${prefix}`,
  );
}

for (const [target, wave] of residueBacklog) {
  ok(
    fs.existsSync(path.join(root, target)),
    `el backlog no apunta a un archivo inexistente: ${target}`,
  );
  ok(
    /^ola \d+$/.test(wave),
    `cada entrada del backlog dice en qué ola se retira: ${target}`,
  );
}

console.log(
  `Spec del gate de identidad OK: ${checks} comprobaciones, ` +
    `${residueBacklog.length} entradas de residuo pendientes.`,
);
