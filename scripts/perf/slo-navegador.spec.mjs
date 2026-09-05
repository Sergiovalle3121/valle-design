#!/usr/bin/env node
/**
 * Spec del runner de medición en GPU real.
 *
 * ## El problema de probar aquí algo que sólo se puede medir allí
 *
 * Este contenedor no tiene GPU. La corrida que este runner existe para lanzar
 * —fps de paneo, detalle completo, memoria de GPU sobre 100.000 entidades— NO
 * se puede ejecutar aquí, y fingir que sí es exactamente la clase de evidencia
 * que la campaña vino a desmontar. Así que lo que se prueba aquí es la otra
 * mitad, que es la que decide si lo publicado sigue siendo cierto: **que el
 * runner se NIEGA**.
 *
 * Y se prueba con negativos REALES, no simulados:
 *
 * (a) Se invoca el runner de verdad con el registro de navegadores de
 *     Playwright apuntando a un directorio vacío: el fallo lo produce el
 *     lanzador de Playwright, no una bandera de prueba. Y se invoca otra vez
 *     con el entorno TAL CUAL ES esta máquina, que aquí no tiene GPU (Chromium
 *     rasteriza con SwiftShader) y no tiene build de producción. En los dos
 *     casos: código distinto de cero y NINGÚN artefacto escrito.
 * (b) El parseo de argumentos, incluida la bandera desconocida.
 * (c) El escritor rechaza una máquina vacía o genérica.
 * (d) Una corrida PARCIAL —y una que encoge la cobertura— deja el artefacto
 *     vigente de `docs/cad/evidence` byte a byte como estaba.
 *
 * Más `--dry-run`, que imprime el plan y no toca nada.
 *
 *   node scripts/perf/slo-navegador.spec.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTEFACTO_NAVEGADOR,
  DIRECTORIO_EVIDENCIA,
  RAIZ,
  clasificarRasterizador,
  componerMaquina,
  verificarArtefactoNavegador,
  verificarComprobacionPrevia,
  verificarCorridasDensas,
  verificarMaquinaDeclarada,
} from "./slo-navegador-contract.mjs";
import {
  PROYECTOS,
  observarMaquina,
  observarNavegador,
  observarServidor,
  parsearArgumentos,
  publicarArtefactoNavegador,
} from "./slo-navegador.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(aqui, "slo-navegador.mjs");
const VIGENTE = path.join(DIRECTORIO_EVIDENCIA, ARTEFACTO_NAVEGADOR);

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const rechaza = (veredicto, patron, message) => {
  assert.ok(!veredicto.passed, `${message} — pero se aceptó`);
  assert.ok(
    veredicto.violations.some((violacion) => patron.test(violacion)),
    `${message} — rechazado, pero por otra razón: ${veredicto.violations.join("; ")}`,
  );
  checks += 1;
};
const sha = (ruta) =>
  fs.existsSync(ruta) ? createHash("sha256").update(fs.readFileSync(ruta)).digest("hex") : null;

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), "slo-navegador-spec-"));
const correrRunner = (args, entorno = {}) =>
  spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: 240_000,
    env: { ...process.env, ...entorno },
  });

// ---------------------------------------------------------------------------
// (b) Argumentos. Va primero porque no cuesta nada y falla instantáneo.
// ---------------------------------------------------------------------------

{
  const { opciones, errores } = parsearArgumentos([]);
  ok(errores.length === 0, "sin argumentos no hay errores");
  ok(opciones.salida === DIRECTORIO_EVIDENCIA, "por defecto se publica en docs/cad/evidence");
  ok(opciones.proyecto === "chromium", "el proyecto por defecto es chromium");
  ok(opciones.dryRun === false, "no se planifica en seco si no se pide");
  ok(opciones.corridasDensas === 3, "el cruce denso exige tres corridas y ése es el defecto");
  ok(opciones.mezclas.length === 0 && opciones.entidades.length === 0, "sin filtros, cobertura entera");
}

{
  const { opciones, errores } = parsearArgumentos([
    "--mix",
    "architecture,mechanical",
    "--entities",
    "100000",
    "--output",
    temporal,
    "--dry-run",
  ]);
  ok(errores.length === 0, `las cuatro banderas del enunciado parsean: ${errores.join("; ")}`);
  assert.deepEqual(opciones.mezclas, ["architecture", "mechanical"]);
  checks += 1;
  assert.deepEqual(opciones.entidades, [100_000]);
  checks += 1;
  ok(opciones.salida === temporal, "--output se resuelve a ruta absoluta");
  ok(opciones.dryRun === true, "--dry-run se recoge");
}

{
  // Repetir --mix acumula: es lo que hace quien escribe la invocación a mano.
  const { opciones } = parsearArgumentos(["--mix", "architecture", "--mix", "cartography"]);
  assert.deepEqual(opciones.mezclas, ["architecture", "cartography"]);
  checks += 1;
}

{
  const { errores } = parsearArgumentos(["--mixes", "architecture"]);
  ok(
    errores.some((error) => /bandera desconocida: --mixes/.test(error)),
    "una bandera desconocida es un error, no algo que se ignora midiendo otra cosa",
  );
}
{
  const { errores } = parsearArgumentos(["--entities", "cien mil"]);
  ok(
    errores.some((error) => /no es un entero positivo/.test(error)),
    "--entities exige un entero",
  );
}
{
  const { errores } = parsearArgumentos(["--mix"]);
  ok(errores.some((error) => /--mix necesita un valor/.test(error)), "--mix sin valor es un error");
}
{
  const { errores } = parsearArgumentos(["--project", "safari"]);
  ok(
    errores.some((error) => new RegExp(PROYECTOS.join(".*")).test(error)),
    "un proyecto inexistente se rechaza diciendo cuáles hay",
  );
}
{
  const { errores } = parsearArgumentos(["--corridas", "0"]);
  ok(errores.some((error) => /entero ≥ 1/.test(error)), "--corridas 0 no es una corrida");
}

// ---------------------------------------------------------------------------
// (c) La máquina: ni vacía, ni genérica, ni inventada
// ---------------------------------------------------------------------------

const MAQUINA_REAL =
  "AMD Ryzen 5 5500U with Radeon Graphics (12 hilos lógicos), 7,4 GB de RAM, Windows_NT 10.0.26100 " +
  "(x64), chromium 141.0.7390.37 sobre ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164C) " +
  "Direct3D11 vs_5_0 ps_5_0, D3D11) [proveedor Google Inc. (AMD)]. Corrida 2026-09-04 con " +
  "scripts/perf/slo-navegador.mjs.";

ok(verificarMaquinaDeclarada(MAQUINA_REAL).passed, "una máquina real y completa se acepta");
rechaza(verificarMaquinaDeclarada(""), /vacío/, "una máquina vacía");
rechaza(verificarMaquinaDeclarada(undefined), /vacío/, "una máquina ausente");
rechaza(verificarMaquinaDeclarada("   "), /vacío/, "una máquina de espacios");
rechaza(verificarMaquinaDeclarada("linux x64"), /caracteres/, "«linux x64» no es una máquina");
rechaza(
  verificarMaquinaDeclarada(
    "CPU desconocida (4 hilos lógicos), 15,7 GB de RAM, Linux 6.18 (x64), chromium 141 sobre ANGLE (Google).",
  ),
  /genérica/,
  "una máquina con «desconocida» dentro",
);
rechaza(
  verificarMaquinaDeclarada(
    "Intel(R) Xeon(R) Processor @ 2.10GHz (4 hilos lógicos), Linux 6.18.44 (x64), chromium 141 sobre ANGLE (Intel).",
  ),
  /RAM/,
  "una máquina sin RAM declarada",
);
rechaza(
  verificarMaquinaDeclarada(
    "Intel(R) Xeon(R) Processor @ 2.10GHz (4 hilos lógicos), 15,7 GB de RAM, Linux 6.18.44 (x64). Corrida 2026-09-04.",
  ),
  /navegador/,
  "una máquina sin navegador: la mitad de la medida es el navegador",
);
rechaza(
  verificarMaquinaDeclarada(
    "Intel(R) Xeon(R) Processor @ 2.10GHz (4 hilos lógicos), 15,7 GB de RAM, Linux 6.18.44 (x64), chromium 141. Corrida 2026-09-04.",
  ),
  /rasterizador/,
  "una máquina sin rasterizador: sin él un fps no se puede reproducir",
);

// La composición desde una instantánea DEGENERADA tiene que salir rechazada:
// es el caso que el runner atrapa antes de gastar una hora de máquina.
rechaza(
  verificarMaquinaDeclarada(
    componerMaquina({ cpuModelo: "", hilos: 0, memoriaBytes: 0, tipoSO: "", versionSO: "", arquitectura: "" }),
  ),
  /genérica|RAM|sistema/,
  "una máquina compuesta de nada",
);
// Y la composición desde datos reales tiene que salir aceptada, o el runner no
// podría publicar nunca.
ok(
  verificarMaquinaDeclarada(
    componerMaquina({
      cpuModelo: "AMD Ryzen 5 5500U with Radeon Graphics",
      hilos: 12,
      memoriaBytes: 7_896_625_152,
      tipoSO: "Windows_NT",
      versionSO: "10.0.26100",
      arquitectura: "x64",
      navegador: {
        nombre: "chromium",
        version: "141.0.7390.37",
        webglRenderer: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
        webglVendor: "Google Inc. (AMD)",
      },
    }),
  ).passed,
  "la máquina compuesta de datos reales pasa el contrato",
);

// El rasterizador, en las dos direcciones. La cadena de software es la que
// devolvió ESTE contenedor; la real, la del artefacto publicado.
ok(
  clasificarRasterizador({
    vendor: "Google Inc. (AMD)",
    renderer: "ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164C) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  }).real,
  "una GPU real se reconoce como real",
);
for (const renderer of [
  "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
  "llvmpipe (LLVM 15.0.7, 256 bits)",
  "Microsoft Basic Render Driver",
  "Mesa OffScreen",
])
  ok(
    !clasificarRasterizador({ vendor: "", renderer }).real,
    `«${renderer.slice(0, 40)}…» tiene que quedar fuera: es rasterizado por software`,
  );
ok(
  !clasificarRasterizador({ vendor: "Mozilla", renderer: "" }).real,
  "sin rasterizador declarado no se puede afirmar que hubo GPU",
);

// ---------------------------------------------------------------------------
// La comprobación previa, como regla, sobre hechos inventados a propósito
// ---------------------------------------------------------------------------

const PREVIA_BUENA = {
  navegador: { nombre: "chromium", ruta: "/opt/pw/chrome", presente: true, version: "141.0.7390.37" },
  rasterizador: {
    vendor: "Google Inc. (AMD)",
    renderer: "ANGLE (AMD, AMD Radeon(TM) Graphics, D3D11)",
  },
  servidor: { url: "http://localhost:3000", alcanzable: false, esDesarrollo: false, compilacionPresente: true },
};
ok(verificarComprobacionPrevia(PREVIA_BUENA).passed, "GPU real + build presente: se puede medir");
rechaza(
  verificarComprobacionPrevia({
    ...PREVIA_BUENA,
    navegador: { ...PREVIA_BUENA.navegador, presente: false },
  }),
  /NO está instalado/,
  "sin binario de navegador no se mide",
);
rechaza(
  verificarComprobacionPrevia({
    ...PREVIA_BUENA,
    rasterizador: { vendor: "Google Inc.", renderer: "ANGLE (Google, Vulkan, SwiftShader driver)" },
  }),
  /SOFTWARE/,
  "con SwiftShader no se mide",
);
rechaza(
  verificarComprobacionPrevia({
    ...PREVIA_BUENA,
    servidor: { ...PREVIA_BUENA.servidor, alcanzable: true, esDesarrollo: true },
  }),
  /DESARROLLO/,
  "un servidor de desarrollo publicaría los tiempos del build sin minificar",
);
rechaza(
  verificarComprobacionPrevia({
    ...PREVIA_BUENA,
    servidor: { ...PREVIA_BUENA.servidor, compilacionPresente: false },
  }),
  /build de producción/,
  "sin build ni servidor no hay nada que medir",
);

// ---------------------------------------------------------------------------
// (d) Corrida parcial y corrida que encoge: el vigente no se toca
// ---------------------------------------------------------------------------

const vigente = JSON.parse(fs.readFileSync(VIGENTE, "utf8"));
const shaAntes = sha(VIGENTE);
ok(shaAntes !== null, "hay un artefacto vigente que proteger");

const completo = () => {
  const copia = JSON.parse(JSON.stringify(vigente));
  copia.run = {
    ...copia.run,
    complete: true,
    plannedProfiles: copia.profiles.length,
    producedProfiles: copia.profiles.length,
    failures: [],
  };
  return copia;
};

ok(
  verificarArtefactoNavegador(completo(), { vigente }).passed,
  `una corrida completa sobre la misma cobertura se acepta: ${verificarArtefactoNavegador(
    completo(),
    { vigente },
  ).violations.join("; ")}`,
);

const parcial = completo();
parcial.run.complete = false;
parcial.run.producedProfiles = parcial.profiles.length - 3;
rechaza(
  verificarArtefactoNavegador(parcial, { vigente }),
  /PARCIAL/,
  "una corrida parcial no puede publicarse",
);

const encoge = completo();
encoge.profiles = encoge.profiles.slice(0, 2);
encoge.run.plannedProfiles = 2;
encoge.run.producedProfiles = 2;
rechaza(
  verificarArtefactoNavegador(encoge, { vigente }),
  /ENCOGE/,
  "una corrida que mide dos perfiles no sustituye a la que midió veinte",
);

const porSoftware = completo();
porSoftware.environment.browser.webglRenderer =
  "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)";
rechaza(
  verificarArtefactoNavegador(porSoftware, { vigente }),
  /GPU real/,
  "un artefacto de SLO rasterizado por software",
);

const sinMaquina = completo();
sinMaquina.environment.declaredMachine = "";
rechaza(verificarArtefactoNavegador(sinMaquina, { vigente }), /vacío/, "un artefacto sin máquina");

const conFallos = completo();
conFallos.run.failures = ["chromium/architecture@100000: console: WebGL context lost"];
rechaza(
  verificarArtefactoNavegador(conFallos, { vigente }),
  /fallo/,
  "un artefacto con fallos registrados",
);

const enSmoke = completo();
enSmoke.run.tier = "smoke";
rechaza(verificarArtefactoNavegador(enSmoke, { vigente }), /escalón full/, "el escalón smoke no trae los 100k");

// Y ahora la puerta de verdad, apuntando al `docs/cad/evidence` REAL: tiene que
// negarse y dejar el fichero exactamente como estaba.
const resultadoParcial = publicarArtefactoNavegador({
  artefacto: parcial,
  directorio: DIRECTORIO_EVIDENCIA,
});
ok(!resultadoParcial.publicado, "el escritor se niega ante una corrida parcial");
ok(
  sha(VIGENTE) === shaAntes,
  "el artefacto vigente sigue byte a byte como estaba tras el intento parcial",
);
const resultadoEncoge = publicarArtefactoNavegador({
  artefacto: encoge,
  directorio: DIRECTORIO_EVIDENCIA,
});
ok(!resultadoEncoge.publicado, "el escritor se niega ante una corrida que encoge la cobertura");
ok(sha(VIGENTE) === shaAntes, "el artefacto vigente sigue intacto tras el intento de recorte");

// Contraprueba de que el escritor SÍ escribe cuando todo cuadra: un verificador
// que nunca publica también pasaría todas las negativas de arriba.
const destinoLimpio = path.join(temporal, "publicable");
fs.mkdirSync(destinoLimpio, { recursive: true });
const resultadoBueno = publicarArtefactoNavegador({
  artefacto: completo(),
  directorio: destinoLimpio,
});
ok(resultadoBueno.publicado, `el escritor publica lo que cuadra: ${resultadoBueno.violaciones.join("; ")}`);
ok(
  fs.existsSync(path.join(destinoLimpio, ARTEFACTO_NAVEGADOR)),
  "y el fichero queda escrito donde se pidió",
);
// Sobre lo ya escrito, una corrida parcial tampoco pasa.
const resultadoSegundo = publicarArtefactoNavegador({
  artefacto: parcial,
  directorio: destinoLimpio,
});
ok(!resultadoSegundo.publicado, "ni siquiera sobre un destino propio se publica una corrida parcial");

// Las corridas densas, con la misma regla.
const corridaDensa = (extra = {}) => ({
  runId: "chromium-2026-09-04",
  complete: true,
  failures: [],
  corpus: { entities: 100_000 },
  environment: { declaredMachine: MAQUINA_REAL },
  ...extra,
});
ok(
  verificarCorridasDensas([corridaDensa(), corridaDensa(), corridaDensa()]).passed,
  "tres corridas densas completas y con máquina se cruzan",
);
rechaza(
  verificarCorridasDensas([corridaDensa(), corridaDensa()]),
  /exige 3/,
  "dos corridas densas no son una mediana",
);
rechaza(
  verificarCorridasDensas([corridaDensa({ complete: false }), corridaDensa(), corridaDensa()]),
  /incompleta/,
  "una corrida densa cortada a la mitad",
);
rechaza(
  verificarCorridasDensas([
    corridaDensa({ environment: { declaredMachine: "" } }),
    corridaDensa(),
    corridaDensa(),
  ]),
  /vacío/,
  "una corrida densa sin máquina declarada",
);

// ---------------------------------------------------------------------------
// (a) El negativo REAL: el runner, invocado de verdad, en esta máquina
// ---------------------------------------------------------------------------

const destinoNegativo = path.join(temporal, "negativo");
fs.mkdirSync(destinoNegativo, { recursive: true });

// a.1 · Sin navegadores instalados. El registro de Playwright apunta a un
// directorio VACÍO, así que quien falla es el lanzador real de Playwright.
const registroVacio = path.join(temporal, "sin-navegadores");
fs.mkdirSync(registroVacio, { recursive: true });
const sinNavegadores = correrRunner(["--output", destinoNegativo], {
  PLAYWRIGHT_BROWSERS_PATH: registroVacio,
});
ok(
  sinNavegadores.status !== 0,
  `sin navegadores el runner tiene que abortar; salió con ${sinNavegadores.status}`,
);
ok(
  /NO está instalado/.test(sinNavegadores.stdout ?? ""),
  `y tiene que decir que falta el navegador. Salida: ${(sinNavegadores.stdout ?? "").slice(-400)}`,
);
ok(
  fs.readdirSync(destinoNegativo).length === 0,
  "sin navegadores no se escribe NADA en el destino",
);
ok(sha(VIGENTE) === shaAntes, "y el artefacto vigente no se toca");

// a.2 · Esta máquina, tal cual es. Aquí no hay GPU (Chromium rasteriza con
// SwiftShader) ni build de producción, así que el runner tiene que abortar
// antes de lanzar Playwright. En una máquina que SÍ pase la comprobación
// previa —la del titular— este spec no lanza la corrida de horas: comprueba con
// `--dry-run` que la previa pasa y lo dice.
const maquina = observarMaquina();
const observadoNavegador = await observarNavegador({ proyecto: "chromium" });
const servidor = await observarServidor();
const previaDeEstaMaquina = verificarComprobacionPrevia({ ...observadoNavegador, servidor });
let ramaNegativa;
if (!previaDeEstaMaquina.passed) {
  const real = correrRunner(["--output", destinoNegativo]);
  ok(
    real.status !== 0,
    `esta máquina no puede medir en GPU real y el runner tiene que negarse; salió con ${real.status}`,
  );
  ok(
    /NO se mide y NO se escribe nada/.test(real.stderr ?? ""),
    `y tiene que decir por qué. Salida: ${(real.stderr ?? "").slice(-400)}`,
  );
  ok(fs.readdirSync(destinoNegativo).length === 0, "una corrida abortada no deja artefacto");
  ok(sha(VIGENTE) === shaAntes, "ni toca el vigente");
  ramaNegativa = `NEGATIVO REAL: ${previaDeEstaMaquina.violations.join(" · ")}`;
} else {
  const plan = correrRunner(["--dry-run", "--output", destinoNegativo]);
  ok(plan.status === 0, "en una máquina que sí puede medir, el plan sale limpio");
  ok(
    /La corrida real puede medir/.test(plan.stdout ?? ""),
    "y lo dice, sin lanzar aquí una corrida de horas",
  );
  ramaNegativa =
    "esta máquina SÍ pasa la comprobación previa: el spec no lanza la corrida larga, sólo el plan";
}

// --- `--dry-run`: el plan, sin tocar nada ---------------------------------
const destinoSeco = path.join(temporal, "seco");
fs.mkdirSync(destinoSeco, { recursive: true });
const seco = correrRunner(["--dry-run", "--output", destinoSeco]);
ok(seco.status === 0, `--dry-run siempre sale con 0; salió con ${seco.status}: ${seco.stderr}`);
for (const trozo of [
  "Plan de corrida",
  "Comprobación previa",
  "máquina compuesta",
  ARTEFACTO_NAVEGADOR,
  "no se ha tocado nada",
])
  ok(
    (seco.stdout ?? "").includes(trozo),
    `el plan tiene que nombrar «${trozo}». Salida: ${(seco.stdout ?? "").slice(-300)}`,
  );
ok(fs.readdirSync(destinoSeco).length === 0, "--dry-run no escribe en el destino");
ok(sha(VIGENTE) === shaAntes, "--dry-run no toca el artefacto vigente");

fs.rmSync(temporal, { recursive: true, force: true });

console.log(
  `slo-navegador: ${checks} comprobaciones — ` +
    `máquina de esta corrida «${componerMaquina({
      ...maquina,
      navegador: {
        nombre: observadoNavegador.navegador.nombre,
        version: observadoNavegador.navegador.version ?? "",
        webglRenderer: observadoNavegador.rasterizador?.renderer ?? "",
        webglVendor: observadoNavegador.rasterizador?.vendor ?? "",
      },
    }).slice(0, 150)}…»; ${ramaNegativa}; el artefacto vigente (${ARTEFACTO_NAVEGADOR}, sha ${String(
      shaAntes,
    ).slice(0, 12)}…) sigue intacto.`,
);
