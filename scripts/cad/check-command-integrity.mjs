#!/usr/bin/env node
/**
 * Gate de INTEGRIDAD del registro de comandos.
 *
 * Corre la sonda (`apps/web/scripts/command-integrity-probe.mts`) sobre los
 * ~294 comandos del registro real y falla si alguno queda en ROJO: terminó
 * afirmando o insinuando éxito sin ningún efecto verificable en el documento,
 * las variables, la selección o una petición a un anfitrión — o terminó en
 * silencio absoluto ante una entrada sustantiva. Un «Hecho» vacío rompe la
 * confianza en todo lo demás; este gate existe para que no vuelva a entrar.
 *
 * Los `no-concluyentes` — comandos que el auto-respondedor no sabe llevar a
 * término — se toleran SOLO si están declarados con razón en
 * `command-integrity-exemptions.json`. Un comando nuevo que la sonda no sepa
 * terminar obliga a declararlo, con lo que la lista de exentos es visible y
 * revisable en cada PR en vez de crecer en silencio. Y no basta con escribir
 * una razón: cada exención nombra el spec que CI ejecuta, el fragmento que
 * CONDUCE el comando con entradas reales y la aserción que COMPRUEBA su
 * efecto, y el gate verifica las tres cosas (`validarExencion`).
 *
 * Antes de la sonda corre `command-integrity-rules.spec.mjs`: el árbol de
 * decisión tiene que seguir atrapando las trampas conocidas aunque el registro
 * de hoy no contenga ninguna.
 *
 * La sonda conduce cada comando DOS veces —el documento plano de siempre y la
 * probeta con dos sólidos y una presentación abierta— y combina los dos
 * veredictos de forma monótona: un ROJO en cualquiera de las dos gana, y sólo
 * un efecto verificado asciende. El artefacto lleva el desglose de cada pasada
 * y los invariantes MEDIDOS de la probeta, para que una deriva del fixture se
 * vea como diff en un PR.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validarExencion } from "./command-integrity-rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const web = path.join(root, "apps/web");
const probe = path.join(web, "scripts/command-integrity-probe.mts");
const rulesSpec = path.join(here, "command-integrity-rules.spec.mjs");
const exemptionsPath = path.join(here, "command-integrity-exemptions.json");

const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");

/**
 * El spec de las reglas va por tsx y desde apps/web porque algunas de sus
 * pruebas evalúan entidades con los evaluadores reales del producto.
 */
function runRulesSpec() {
  try {
    const stdout = execFileSync(process.execPath, [tsx, rulesSpec], {
      cwd: web,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    // Salir con 0 sin anunciar el final no prueba nada (ver run-specs.mjs).
    if (!/comprobaciones OK/.test(stdout)) throw Object.assign(new Error("el spec no anunció su final"), { stdout });
    process.stdout.write(stdout);
  } catch (error) {
    console.error("Gate de integridad de comandos: FALLÓ el spec de las reglas");
    console.error(String(error.stdout ?? ""), String(error.stderr ?? error));
    process.exit(1);
  }
}

function runProbe() {
  const stdout = execFileSync(process.execPath, [tsx, probe], {
    cwd: web,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env },
  });
  return JSON.parse(stdout);
}

const exemptions = JSON.parse(readFileSync(exemptionsPath, "utf8"));
const declared = new Set(Object.keys(exemptions.noConcluyentes ?? {}));

runRulesSpec();
const failures = [];

// R4. Antes sólo se leían las CLAVES: la razón y su «Spec:» nunca se
// comprobaban, y una exención podía citar un spec que sólo cancela el comando
// (o uno que no existe: CHAMFEREDGE y FILLETEDGE citaban «solids-modify.spec.ts»).
const webSrc = path.join(web, "src");
const leerSpec = (spec) => {
  const absoluto = path.resolve(web, spec);
  if (!absoluto.startsWith(webSrc + path.sep) || !existsSync(absoluto)) return null;
  return readFileSync(absoluto, "utf8");
};
for (const [name, entry] of Object.entries(exemptions.noConcluyentes ?? {})) {
  failures.push(...validarExencion(name, entry, leerSpec));
}

const report = runProbe();

const rojos = report.outcomes.filter((outcome) => outcome.verdict === "ROJO");
for (const outcome of rojos) {
  failures.push(
    `${outcome.command}: ROJO en la pasada «${outcome.pasada}» — ${outcome.note ?? "sin nota"} · ` +
      `últimos mensajes: ${outcome.lastMessages.join(" § ").slice(0, 400) || "(ninguno)"}`,
  );
}

const inconclusive = report.outcomes.filter(
  (outcome) => outcome.verdict === "no-concluyente",
);
for (const outcome of inconclusive) {
  if (!declared.has(outcome.command)) {
    failures.push(
      `${outcome.command}: no-concluyente sin declarar en command-integrity-exemptions.json — ` +
        `o se enseña a la sonda a completarlo, o se declara con razón escrita`,
    );
  }
}

// Una exención que ya no hace falta es deuda saldada: se exige retirarla para
// que la lista refleje la verdad de hoy, no la de cuando se escribió.
const inconclusiveNames = new Set(inconclusive.map((outcome) => outcome.command));
for (const name of declared) {
  if (!inconclusiveNames.has(name)) {
    failures.push(
      `${name}: está exento pero la sonda ya lo lleva a término — retire la exención`,
    );
  }
}

if (failures.length > 0) {
  console.error("Gate de integridad de comandos: FALLÓ");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

// El artefacto de evidencia que consume la rúbrica (fila de integridad) se
// escribe SOLO con --write, pero se COMPARA siempre — un archivo que sólo se
// escribe y nunca se revisa envejece en silencio (BACKLOG P2-10). El patrón
// es el mismo que scripts/dwg/dwg-evidence.mjs: recomputar en el proceso y
// comparar contra lo committeado; sin campos volátiles que limpiar aquí,
// porque `total`/`verdicts`/`exemptions` son deterministas para un árbol
// dado (a diferencia de dwg-evidence.mjs, este artefacto no lleva timestamp
// ni datos de entorno).
const artifact = path.join(root, "docs/cad/evidence/command-integrity.json");
const payload = {
  generatedBy: "scripts/cad/check-command-integrity.mjs --write",
  total: report.total,
  verdicts: report.verdicts,
  // El desglose por pasada y los invariantes MEDIDOS del fixture. Van al
  // artefacto por la misma razón que las cifras: la probeta de sólidos y lámina
  // es lo que le quita a 27 comandos su precondición imposible, y «muta» se
  // concede comparando serializaciones — un fixture que derivara podría
  // ascender comandos. La sonda ya ABORTA si sus invariantes no cuadran; esto
  // hace además que una deriva salga como diff en un PR y no sólo como
  // excepción en consola.
  pasadas: report.pasadas,
  // Los comandos en los que UNA pasada no concluye y la otra sí, con NOMBRE. El
  // recuento por pasada no basta: «solidos3d no-concluyente 10 vs plano2d 9»
  // era exactamente PLOT, que se quedaba con el honesto-limitado de la base
  // sostenido por una precondición que la probeta desmiente, y el artefacto no
  // decía quién era.
  noConcluyentesDeUnaPasada: report.noConcluyentesDeUnaPasada ?? [],
  probeta: report.probeta,
  exemptions: Object.keys(exemptions.noConcluyentes ?? {}).sort(),
};

if (process.argv.includes("--write")) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(artifact, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Artefacto escrito: ${path.relative(root, artifact)}`);
} else if (existsSync(artifact)) {
  const onDisk = JSON.parse(readFileSync(artifact, "utf8"));
  if (JSON.stringify(onDisk) !== JSON.stringify(payload)) {
    const fields = [];
    if (onDisk.total !== payload.total) fields.push(`total: ${onDisk.total} → ${payload.total}`);
    for (const key of new Set([
      ...Object.keys(onDisk.verdicts ?? {}),
      ...Object.keys(payload.verdicts ?? {}),
    ])) {
      const before = onDisk.verdicts?.[key];
      const after = payload.verdicts?.[key];
      if (before !== after) fields.push(`verdicts.${key}: ${before} → ${after}`);
    }
    for (const pasada of new Set([
      ...Object.keys(onDisk.pasadas ?? {}),
      ...Object.keys(payload.pasadas ?? {}),
    ])) {
      for (const key of new Set([
        ...Object.keys(onDisk.pasadas?.[pasada] ?? {}),
        ...Object.keys(payload.pasadas?.[pasada] ?? {}),
      ])) {
        const before = onDisk.pasadas?.[pasada]?.[key];
        const after = payload.pasadas?.[pasada]?.[key];
        if (before !== after) fields.push(`pasadas.${pasada}.${key}: ${before} → ${after}`);
      }
    }
    for (const key of new Set([
      ...Object.keys(onDisk.probeta ?? {}),
      ...Object.keys(payload.probeta ?? {}),
    ])) {
      const before = onDisk.probeta?.[key];
      const after = payload.probeta?.[key];
      if (before !== after) fields.push(`probeta.${key}: ${before} → ${after}`);
    }
    const antesAsimetricos = new Set(onDisk.noConcluyentesDeUnaPasada ?? []);
    const ahoraAsimetricos = new Set(payload.noConcluyentesDeUnaPasada);
    const asimetricosNuevos = payload.noConcluyentesDeUnaPasada.filter(
      (entrada) => !antesAsimetricos.has(entrada),
    );
    const asimetricosIdos = (onDisk.noConcluyentesDeUnaPasada ?? []).filter(
      (entrada) => !ahoraAsimetricos.has(entrada),
    );
    if (asimetricosNuevos.length > 0)
      fields.push(`no-concluyentes de una sola pasada, nuevos: ${asimetricosNuevos.join(", ")}`);
    if (asimetricosIdos.length > 0)
      fields.push(`no-concluyentes de una sola pasada, resueltos: ${asimetricosIdos.join(", ")}`);
    const beforeExemptions = new Set(onDisk.exemptions ?? []);
    const afterExemptions = new Set(payload.exemptions ?? []);
    const added = payload.exemptions.filter((name) => !beforeExemptions.has(name));
    const removed = (onDisk.exemptions ?? []).filter((name) => !afterExemptions.has(name));
    if (added.length > 0) fields.push(`exemptions agregadas: ${added.join(", ")}`);
    if (removed.length > 0) fields.push(`exemptions retiradas: ${removed.join(", ")}`);
    console.error(
      `${path.relative(root, artifact)} no coincide con lo que el árbol genera hoy — ` +
        `corre "node scripts/cad/check-command-integrity.mjs --write":`,
    );
    for (const field of fields) console.error(`  - ${field}`);
    process.exit(1);
  }
} else {
  console.error(
    `${path.relative(root, artifact)} no existe — corre "node scripts/cad/check-command-integrity.mjs --write"`,
  );
  process.exit(1);
}

const verdicts = report.verdicts;
console.log(
  `Integridad de comandos OK: ${report.total} comandos · ` +
    `${verdicts.muta} mutan verificado · ${verdicts.delegado} delegan · ` +
    `${verdicts.informa} informan · ${verdicts["honesto-limitado"]} declaran su límite · ` +
    `${verdicts["no-concluyente"]} exentos declarados · 0 éxitos falsos.`,
);
for (const [pasada, cifras] of Object.entries(report.pasadas ?? {})) {
  console.log(
    `  pasada ${pasada}: ${cifras.muta} mutan · ${cifras.delegado} delegan · ` +
      `${cifras.informa} informan · ${cifras["honesto-limitado"]} declaran su límite · ` +
      `${cifras["no-concluyente"]} no-concluyentes · ${cifras.ROJO} ROJOS.`,
  );
}
const asimetricos = report.noConcluyentesDeUnaPasada ?? [];
console.log(
  asimetricos.length > 0
    ? `  no-concluyentes de una sola pasada: ${asimetricos.join(", ")}`
    : "  no-concluyentes de una sola pasada: ninguno.",
);
const probeta = report.probeta ?? {};
console.log(
  `  probeta: ${probeta.solidos} sólidos de ${probeta.triangulos} triángulos · ` +
    `volumen ${probeta.volumen} · área ${probeta.area} · región ${probeta.region} · ` +
    `contorno de ${probeta.aristasDelContorno} aristas y ${probeta.areaDelContorno} mm² · ` +
    `lámina ${probeta.lamina} con ${probeta.viewports} ventanas (${probeta.vistasDerivadas} derivada).`,
);
