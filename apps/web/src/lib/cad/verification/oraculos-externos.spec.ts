import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { booleanDifference } from "../../brep/boolean";
import { extrudeProfile, revolveProfile } from "../../brep/extrude";
import { makeBox, makeBoxWithThroughHole, makeTetrahedron } from "../../brep/primitives";
import { circleProfile, vec2 } from "../../brep/profile";
import { exportStep } from "../../brep/step-export";
import { eulerCounts, halfEdgeDestination, type BrepBody } from "../../brep/topology";
import { vec3 } from "../../brep/vec3";
import { BINARIOS, INTENTOS, ORACULOS, RAIZ, sondea } from "./oraculos-externos-registro";

/**
 * ORÁCULOS EXTERNOS: los que se cablearon, los que no, y el motivo medido.
 *
 * Cierra el punto que la cola dejó abierto —«un segundo oráculo binario, y si
 * no se puede, se declara con el intento y el motivo»— con lo MEDIDO en esta
 * máquina, no con lo supuesto. Dos suposiciones del corte ya resultaron falsas
 * (PyPI responde, y hay corpus ajeno al alcance) y las dos cambiaron la cola
 * entera; ésta se escribe para que la siguiente no se vuelva a suponer.
 *
 * ─── QUÉ AFIRMA, EN ORDEN ──────────────────────────────────────────────────
 *
 *  1. El CENSO de la máquina: siete candidatos y veintiún binarios, sondeados
 *     de verdad en cada corrida.
 *  2. La REGLA DE UNA SOLA DIRECCIÓN. Un oráculo ADMISIBLE declarado ausente
 *     que aparece pone esto en ROJO: disponible y no usado es evidencia que se
 *     está dejando en la mesa. Al revés no: `ezdxf` y `steputils` no están en
 *     CI a propósito, y cuando faltan se DECLARA la ausencia en vez de fingir
 *     la medición — igual que el repositorio ya hace con ODA File Converter.
 *  3. El ANCLAJE de lo registrado: el sha256 de cada licencia y de cada rueda
 *     tiene que coincidir en los TRES sitios donde está escrito (HERRAMIENTAS.md,
 *     el artefacto de disponibilidad y el censo congelado de la herramienta).
 *     Tres cosas escritas en días distintos sólo hablan de lo mismo si cuadran.
 *  4. El ARNÉS DEL ORÁCULO B: con `ezdxf` presente vuelve a correr el censo del
 *     corpus ajeno y lo compara BYTE A BYTE contra `ezdxf-1.4.4.json`.
 *  5. El ARNÉS DEL ORÁCULO C, que es nuevo: `steputils` 0.1 (MIT) lee el STEP
 *     que exporta el modelador 3D. Hasta hoy el único lector que había leído
 *     nuestro STEP era el nuestro — `interop.spec.ts` compara volumen, área y
 *     género del sólido reimportado contra el original, y esa comparación es
 *     buena salvo por que la escribe y la lee la misma casa.
 *
 * ─── POR QUÉ EL RECUENTO NO CUENTA LAS REEJECUCIONES ───────────────────────
 *
 * `check:cad-math` suma lo que cada suite imprime, y una cifra que suba en la
 * máquina que tiene Python instalado y baje en CI sería una cifra que depende
 * del entorno — el defecto exacto que ese gate se escribió para no tener. Así
 * que las comprobaciones que se cuentan son las que salen del artefacto
 * CONGELADO, iguales en todas partes, y las reejecuciones del arnés se cuentan
 * aparte y se anuncian aparte.
 */

const ARTEFACTO = path.join(RAIZ, "docs/cad/evidence/oraculos-externos-disponibilidad.json");
const HERRAMIENTAS = path.join(RAIZ, "docs/cad/corpus/oraculos/HERRAMIENTAS.md");
const CENSO_B = path.join(RAIZ, "docs/cad/corpus/oraculos/ezdxf-1.4.4.json");
const CENSO_C = path.join(RAIZ, "docs/cad/corpus/oraculos/steputils-0.1.json");
const LICENCIAS = path.join(RAIZ, "docs/cad/corpus/oraculos/licencias");
const ESPEC = "apps/web/src/lib/cad/verification/oraculos-externos.spec.ts";

const contador = { comprobaciones: 0, magnitudes: 0, reejecuciones: 0 };
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  contador.comprobaciones += 1;
};
const eq = <T>(actual: T, esperado: T, mensaje: string) => {
  assert.deepStrictEqual(actual, esperado, mensaje);
  contador.comprobaciones += 1;
};
/** Como `eq`, pero además cuenta como MAGNITUD: es el sólido contra el oráculo. */
const eqMagnitud = <T>(actual: T, esperado: T, mensaje: string) => {
  eq(actual, esperado, mensaje);
  contador.magnitudes += 1;
};
const cerca = (actual: number, esperado: number, tolerancia: number, mensaje: string) => {
  assert.ok(Math.abs(actual - esperado) <= tolerancia, `${mensaje}: ${actual} ≠ ${esperado} (±${tolerancia})`);
  contador.comprobaciones += 1;
  contador.magnitudes += 1;
};

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

// ───────────────────────────────────────────────────────────────────────────
// ACTO 1 · El censo de la máquina, sondeado de verdad
// ───────────────────────────────────────────────────────────────────────────

const observado = new Map(ORACULOS.map((o) => [o.id, sondea(o.sonda)]));
const binariosObservados = BINARIOS.map((b) => ({
  ...b,
  ...sondea({ tipo: "command -v", comando: `command -v ${b.binario}`, objetivo: b.binario }),
}));

ok(observado.size === ORACULOS.length, "cada candidato del registro se sondea exactamente una vez");
ok(binariosObservados.length === 21, `el censo de binarios son 21, no ${binariosObservados.length}`);

// ───────────────────────────────────────────────────────────────────────────
// ACTO 2 · La regla de una sola dirección
// ───────────────────────────────────────────────────────────────────────────

for (const oraculo of ORACULOS) {
  const ahora = observado.get(oraculo.id)!;
  if (oraculo.admisible && !oraculo.disponibleAlDeclarar) {
    ok(
      !ahora.disponible,
      `«${oraculo.nombre}» se declaró ausente y HOY ESTÁ (${oraculo.sonda.comando}). Un oráculo ` +
        "disponible y no usado es evidencia que se está dejando en la mesa: cablearlo o " +
        `explicar por escrito por qué no, en ${ESPEC}. Bajar esta comprobación no es una opción.`,
    );
  }
  if (!oraculo.admisible) {
    // Su aparición no obliga a nada: la política ya lo excluyó. Lo que sí se
    // exige es que NADIE lo haya cableado por descuido.
    eq(
      oraculo.arnes,
      [],
      `«${oraculo.nombre}» es inadmisible (${oraculo.licencia}) y tiene arnés: eso es material ` +
        "prohibido dentro del corpus, que CORPUS_POLICY.md excluye sin excepción",
    );
    ok(oraculo.porQueAdmisible.startsWith("NO admisible"), `${oraculo.id}: la cláusula que lo excluye está escrita`);
  }
  // Un arnés que apunta a un archivo que ya no está es una promesa, no un arnés.
  for (const ruta of oraculo.arnes)
    ok(
      fs.existsSync(path.join(RAIZ, ruta)),
      `«${oraculo.nombre}» declara como arnés ${ruta} y ese archivo no existe`,
    );
  const congelado = oraculo.artefactoCongelado;
  if (congelado !== null && !congelado.includes(" ("))
    ok(
      fs.existsSync(path.join(RAIZ, congelado)),
      `«${oraculo.nombre}» cita el artefacto congelado ${congelado} y no está en el árbol`,
    );
  if (oraculo.estado === "cableado") {
    ok(oraculo.arnes.length > 0, `«${oraculo.nombre}» se declara cableado y no dice a qué`);
    ok(oraculo.queHariaFalta === null, `«${oraculo.nombre}» está cableado: no le puede faltar nada`);
  } else {
    ok(
      (oraculo.queHariaFalta ?? "").length > 40,
      `«${oraculo.nombre}» no está cableado y no dice qué haría falta; un «no» sin motivo no es evidencia`,
    );
  }
}

for (const binario of binariosObservados) {
  if (binario.admisible) {
    ok(
      !binario.disponible,
      `el binario «${binario.binario}» (${binario.proyecto}) APARECIÓ en esta máquina y su licencia ` +
        "lo permite. Hay que usarlo o declarar por qué no.",
    );
  }
}

for (const intento of INTENTOS) {
  ok(intento.comando.length > 10, `el intento «${intento.id}» no trae el comando que se corrió`);
  ok(intento.salidaReal.length > 10, `el intento «${intento.id}» no trae su salida real`);
  ok(intento.porQue.length > 60, `el intento «${intento.id}» no explica qué significa lo que salió`);
}

// ───────────────────────────────────────────────────────────────────────────
// ACTO 3 · El artefacto sigue describiendo el registro
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lo que se compara contra el artefacto comprometido es TODO menos lo que sólo
 * puede saber la máquina que lo declaró. `disponibleAlDeclarar` es historia
 * fechada y por eso viaja en el artefacto sin recalcularse; la regla del acto 2
 * es la que lo mantiene honesto.
 */
const construyeArtefacto = () => ({
  generadoPor: `${ESPEC} (VALLE_ESCRIBIR_ORACULOS=1)`,
  declaradoEl: "2026-09-05",
  queEsto:
    "El censo de oráculos externos de este repositorio: qué herramienta de terceros puede atestiguar qué superficie del producto, cuál está cableada, cuál no, y el motivo medido de cada ausencia. Cierra la cola que pedía «un segundo oráculo binario, y si no se puede, el intento y el motivo».",
  registroDeHerramientas: "docs/cad/corpus/oraculos/HERRAMIENTAS.md",
  reglaDeUnaSolaDireccion:
    "El spec vuelve a sondear la máquina en cada corrida. Un oráculo ADMISIBLE declarado ausente que aparece pone la suite en ROJO, porque un oráculo disponible y no usado es evidencia que se está dejando en la mesa. Al revés NO: una herramienta declarada presente que falta se declara ausente y su medición congelada se usa tal cual, en vez de fingirse. La asimetría es deliberada.",
  porQueLaLicenciaDecide:
    "La regla anterior se aplica sólo a lo ADMISIBLE. CORPUS_POLICY.md prohíbe GPL, AGPL, LGPL, MPL, SSPL, BUSL y source-available sin excepción, así que la aparición de LibreDWG o de IfcOpenShell no crearía ninguna obligación: seguiríamos sin poder usarlos.",
  maquinaDeclarada: {
    nota: "Informativo. NO se compara: un artefacto que exigiera la misma máquina sería rojo en cualquier otra.",
    sistema: "Linux (contenedor del frente), Ubuntu 24.04 noble",
    python: "3.11.15",
    egreso:
      "PyPI, crates.io y npm responden; los repositorios de sistema (archive.ubuntu.com) y opendesign.com no. Es el hecho que convirtió «no hay oráculo binario posible» en «hay dos, y hay que mirarles la licencia».",
  },
  oraculos: ORACULOS.map((o) => ({
    id: o.id,
    nombre: o.nombre,
    version: o.version,
    familia: o.familia,
    papel: o.papel,
    estado: o.estado,
    licencia: o.licencia,
    admisible: o.admisible,
    porQueAdmisible: o.porQueAdmisible,
    sonda: o.sonda,
    disponibleAlDeclarar: o.disponibleAlDeclarar,
    arnes: o.arnes,
    artefactoCongelado: o.artefactoCongelado,
    queHariaFalta: o.queHariaFalta,
  })),
  binariosSondeados: BINARIOS.map((b) => ({ ...b })),
  intentos: INTENTOS.map((i) => ({ ...i })),
  resumen: {
    candidatos: ORACULOS.length,
    cableados: ORACULOS.filter((o) => o.estado === "cableado").length,
    descartadosPorLicencia: ORACULOS.filter((o) => o.estado === "descartado_por_licencia").length,
    ausentesDeclarados: ORACULOS.filter((o) => o.estado === "ausente_declarado").length,
    binariosSondeados: BINARIOS.length,
    binariosPresentesAlDeclarar: 0,
  },
  loQueNoSeSondea:
    "El sondeo es `command -v` y `python3 -c import`, así que mide la RUTA del proceso, no el disco entero: una herramienta instalada fuera del PATH no la ve. En Windows `command -v` no existe y todo saldría ausente. Tampoco se sondea si una herramienta presente FUNCIONA — eso lo dicen sus artefactos congelados, no este censo.",
  loQueNoAcredita:
    "Ninguno de los tres oráculos cableados es AutoCAD, ni un kernel comercial. Acreditan interoperabilidad con implementaciones independientes; no compatibilidad con AutoCAD, SolidWorks ni CATIA. Y dos de los tres (ezdxf, steputils) son del MISMO AUTOR: entre ellos no son testigos independientes, aunque contra el producto lo sean.",
});

const artefacto = construyeArtefacto();

if (process.env.VALLE_ESCRIBIR_ORACULOS === "1") {
  fs.writeFileSync(ARTEFACTO, `${JSON.stringify(artefacto, null, 2)}\n`, "utf8");
  console.log(`artefacto reescrito: ${path.relative(RAIZ, ARTEFACTO)}`);
}

const comprometido = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as ReturnType<typeof construyeArtefacto>;
eq(
  comprometido,
  artefacto,
  "el artefacto comprometido ya no es el que sale del registro de hoy: regenéralo con " +
    "VALLE_ESCRIBIR_ORACULOS=1 y mira qué cambió antes de comprometerlo",
);

// ───────────────────────────────────────────────────────────────────────────
// ACTO 4 · El anclaje de lo registrado: la misma cifra en tres sitios
// ───────────────────────────────────────────────────────────────────────────

const registro = fs.readFileSync(HERRAMIENTAS, "utf8");
const censoB = JSON.parse(fs.readFileSync(CENSO_B, "utf8")) as {
  herramienta: { nombre: string; version: string; licencia: string; sha256Rueda: string };
};
const censoC = JSON.parse(fs.readFileSync(CENSO_C, "utf8")) as {
  herramienta: { nombre: string; version: string; licencia: string; sha256Rueda: string; sha256Licencia: string };
  archivos: Record<string, MedidaC>;
  resumen: { solidos: number; leidos: number; rechazados: number; esquemas: string[] };
};

/**
 * Los sha256 se declaran AQUÍ una sola vez y se exigen iguales en el registro
 * en prosa y en el censo de cada herramienta. No es duplicar la cifra: es el
 * mismo candado que `terceros-filas.ts` puso sobre los ficheros del corpus —
 * tres cosas escritas en días distintos sólo hablan de lo mismo si coinciden.
 */
const ANCLAS = [
  {
    id: "ezdxf",
    rueda: "7f75a4f2924ebdda0f5b2779ff2135ba92de2596c95a8fa9b1d9ebcabea1be41",
    licencia: "db97ca426fc0d2b8124145de0f36181db73e6e713ce642d42fed2efc442edf19",
    archivoDeLicencia: "ezdxf-1.4.4-MIT.txt",
    censo: censoB.herramienta,
  },
  {
    id: "steputils",
    rueda: "8d3dd966b8778a6b5bcc6613414ba6adcd9948d313c67dec4feb328afcc2f582",
    licencia: "2d07e6d2bbaec0adc374f2412fda27635cf6c6c1a8d6ff3a5c128785abb602f5",
    archivoDeLicencia: "steputils-0.1-MIT.txt",
    censo: censoC.herramienta,
  },
];

for (const ancla of ANCLAS) {
  const oraculo = ORACULOS.find((o) => o.id === ancla.id)!;
  eq(ancla.censo.nombre, oraculo.nombre, `${ancla.id}: el censo congelado nombra otra herramienta`);
  eq(ancla.censo.version, oraculo.version, `${ancla.id}: el censo congelado declara otra versión`);
  eq(ancla.censo.licencia, "MIT", `${ancla.id}: el censo congelado declara otra licencia`);
  eq(ancla.censo.sha256Rueda, ancla.rueda, `${ancla.id}: el sha256 de la rueda no coincide con el censo`);
  ok(registro.includes(ancla.rueda), `${ancla.id}: HERRAMIENTAS.md no registra el sha256 de la rueda`);
  ok(registro.includes(ancla.licencia), `${ancla.id}: HERRAMIENTAS.md no registra el sha256 de la licencia`);
  const texto = fs.readFileSync(path.join(LICENCIAS, ancla.archivoDeLicencia));
  eq(sha256(texto), ancla.licencia, `${ancla.id}: el texto de licencia del árbol no es el registrado`);
  ok(texto.toString("utf8").includes("MIT License"), `${ancla.id}: el texto guardado no es la MIT`);
  ok(
    texto.toString("utf8").includes("Manfred Moitzi"),
    `${ancla.id}: el aviso de copyright del titular no viaja con la licencia`,
  );
}
// La cifra de la rueda de ezdxf ya vivía en el censo desde el 2026-09-04; lo
// que se registra hoy es de dónde salió y contra qué se comprobó.
ok(
  registro.includes("https://pypi.org/pypi/ezdxf/1.4.4/json"),
  "HERRAMIENTAS.md no dice contra qué se comprobó el sha256 de la rueda de ezdxf",
);

// ───────────────────────────────────────────────────────────────────────────
// ACTO 5 · El arnés del oráculo B: vuelve a correr el censo si la herramienta está
// ───────────────────────────────────────────────────────────────────────────

const exigidoB = process.env.VALLE_ORACULO_EZDXF === "1";
const hayB = observado.get("ezdxf")!.disponible;
const declaracionesDeAusencia: string[] = [];

if (exigidoB && !hayB) {
  throw new Error(
    "VALLE_ORACULO_EZDXF=1 exige reejecutar el censo del oráculo B y `ezdxf` no está en esta " +
      "máquina. Instálala con `pip install ezdxf==1.4.4` o quita la variable; lo que no se hace " +
      "es dar por buena una medición que no se ha hecho.",
  );
}
if (hayB) {
  const destino = path.join(os.tmpdir(), "valle-censo-ezdxf-reejecutado.json");
  const corrida = spawnSync(
    "python3",
    [path.join(RAIZ, "docs/cad/corpus/oraculos/censo-ezdxf.py"), "--destino", destino],
    { cwd: RAIZ, encoding: "utf8" },
  );
  // Estas dos aserciones usan `assert` directo y NO tocan el contador: sólo
  // corren donde la herramienta está, y una cifra que suba en esta máquina y
  // baje en CI sería exactamente la cifra dependiente del entorno que
  // `check:cad-math` se escribió para no tener.
  assert.ok(corrida.status === 0, `el censo del oráculo B no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  // BYTE A BYTE, y a un temporal a propósito: si el script escribiera sobre el
  // artefacto que compara, la comparación sería una tautología siempre verde.
  assert.ok(
    fs.readFileSync(destino).equals(fs.readFileSync(CENSO_B)),
    "el censo de `ezdxf` sobre el corpus ajeno YA NO da los bytes comprometidos. O cambió el " +
      "corpus, o cambió la herramienta: mira el diff antes de comprometer nada.",
  );
  contador.reejecuciones += 1;
} else {
  declaracionesDeAusencia.push(
    "oráculo B (`ezdxf` 1.4.4): AUSENTE en esta máquina. El censo del corpus ajeno se usa congelado " +
      "y anclado por sha256; no se finge la medición. Se reejecuta con `pip install ezdxf==1.4.4`.",
  );
}

// ───────────────────────────────────────────────────────────────────────────
// ACTO 6 · El arnés del oráculo C: un lector de STEP ajeno mide el 3D
// ───────────────────────────────────────────────────────────────────────────

interface MedidaC {
  leido: boolean;
  sha256: string;
  bytes: number;
  esquemaDeclarado: string;
  instancias: number;
  conteo: Record<string, number>;
  vertices: number[][];
  longitudesDeArista: number[];
  contornosPorCara: number[];
}

/**
 * Los cinco sólidos, con el mismo reparto que `interop.spec.ts` usa para su ida
 * y vuelta: dos primitivas, uno de género 1, uno de revolución y uno nacido de
 * una booleana. La lista se repite aquí y no se importa de allí a propósito —
 * aquella suite prueba otra cosa y no debe poder cambiar lo que este oráculo
 * midió sin que salte el ancla de sha256.
 */
const SOLIDOS: Array<[string, BrepBody]> = [
  ["caja", makeBox({ min: vec3(-1, -2, -3), max: vec3(4, 5, 6) })],
  ["tetraedro", makeTetrahedron(2)],
  [
    "caja-con-agujero-pasante",
    makeBoxWithThroughHole({ min: vec3(0, 0, 0), max: vec3(10, 10, 4), holeMin: { x: 3, y: 3 }, holeMax: { x: 7, y: 6 } }),
  ],
  [
    "tubo-de-revolucion",
    revolveProfile({ profile: { outer: [vec2(2, 0), vec2(5, 0), vec2(5, 3), vec2(2, 3)] }, segments: 12 }),
  ],
  [
    "placa-taladrada-por-booleana",
    booleanDifference(
      makeBox({ min: vec3(-3, -3, 0), max: vec3(3, 3, 2) }),
      extrudeProfile({ profile: { outer: circleProfile(1.5, 12) }, height: 6, frame: undefined }),
    ),
  ],
];

/**
 * TOLERANCIA 1e-9, con su razón: el oráculo publica sus coordenadas redondeadas
 * a nueve decimales (es lo que hace estable el JSON), así que la desviación
 * máxima que ese redondeo puede introducir es 5e-10. No es un margen para que
 * quepan errores: es exactamente el ancho del redondeo declarado.
 */
const TOLERANCIA = 1e-9;

/** Los tipos de la parte 21 cuyo recuento tiene que cuadrar con el B-rep. */
const CORRESPONDENCIA: Array<[string, (b: BrepBody) => number]> = [
  ["VERTEX_POINT", (b) => b.vertices.length],
  ["EDGE_CURVE", (b) => b.edges.length],
  ["ORIENTED_EDGE", (b) => b.halfEdges.length],
  ["ADVANCED_FACE", (b) => b.faces.length],
  ["PLANE", (b) => b.faces.length],
  ["CLOSED_SHELL", () => 1],
  ["MANIFOLD_SOLID_BREP", () => 1],
];

for (const [nombre, cuerpo] of SOLIDOS) {
  const texto = exportStep(cuerpo, { timestamp: "2026-01-01T00:00:00", name: nombre });
  fs.writeFileSync(path.join(os.tmpdir(), `valle-step-${nombre}.stp`), texto, "utf8");

  const medida = censoC.archivos[nombre];
  ok(medida !== undefined && medida.leido, `${nombre}: el oráculo C no trae medida de este sólido`);

  // EL ANCLA. Sin esto la medida congelada seguiría pareciendo evidencia
  // después de que el exportador cambie, que es la peor forma de mentir.
  eq(
    sha256(texto),
    medida.sha256,
    `${nombre}: el STEP que exportamos HOY no es el que midió el oráculo C. La lectura congelada ` +
      "ya no habla de estos bytes: reejecútala con `pip install steputils==0.1` y " +
      "`python3 docs/cad/corpus/oraculos/censo-steputils.py`, en ese orden y después del spec.",
  );
  eq(Buffer.byteLength(texto, "utf8"), medida.bytes, `${nombre}: el tamaño medido no es el de hoy`);
  ok(
    medida.esquemaDeclarado.startsWith("AUTOMOTIVE_DESIGN"),
    `${nombre}: el esquema que LEE un tercero es «${medida.esquemaDeclarado}»`,
  );

  // Los recuentos: la topología que salió del kernel es la que otro programa
  // encuentra dentro del fichero.
  for (const [tipo, cuantos] of CORRESPONDENCIA) {
    eqMagnitud(
      medida.conteo[tipo],
      cuantos(cuerpo),
      `${nombre}: el oráculo C cuenta ${medida.conteo[tipo]} ${tipo} y el B-rep tiene ${cuantos(cuerpo)}`,
    );
  }
  eqMagnitud(
    medida.conteo.FACE_OUTER_BOUND + medida.conteo.FACE_BOUND,
    cuerpo.loops.length,
    `${nombre}: los contornos que ve el oráculo C no son los lazos del B-rep`,
  );

  // EULER-POINCARÉ DESDE FUERA. V − A + C − (lazos interiores) = 2(1 − género).
  // Es la comprobación que ningún test del repositorio hacía con números que no
  // fueran suyos: aquí los cinco términos salen del lector ajeno.
  const interiores = medida.conteo.FACE_BOUND;
  const caracteristica =
    medida.conteo.VERTEX_POINT - medida.conteo.EDGE_CURVE + medida.conteo.ADVANCED_FACE - interiores;
  const genero = 1 - caracteristica / 2;
  eqMagnitud(
    genero,
    eulerCounts(cuerpo).genus,
    `${nombre}: el género que sale de los números del oráculo C es ${genero} y el producto dice ` +
      `${eulerCounts(cuerpo).genus}`,
  );

  // Los vértices, uno a uno y por biyección: cada punto que el lector ajeno
  // encontró tiene que ser un vértice del B-rep, y no puede sobrar ninguno.
  const pendientes = cuerpo.vertices.map((v) => v.point);
  const usados = new Set<number>();
  for (const punto of medida.vertices) {
    const indice = pendientes.findIndex(
      (v, i) =>
        !usados.has(i) &&
        Math.abs(v.x - punto[0]) <= TOLERANCIA &&
        Math.abs(v.y - punto[1]) <= TOLERANCIA &&
        Math.abs(v.z - punto[2]) <= TOLERANCIA,
    );
    ok(indice >= 0, `${nombre}: el oráculo C leyó el punto (${punto.join(", ")}) y el B-rep no lo tiene`);
    usados.add(indice);
    contador.magnitudes += 1;
  }
  eqMagnitud(usados.size, cuerpo.vertices.length, `${nombre}: quedaron vértices del B-rep sin encontrar en el STEP`);

  // Las longitudes de arista, ordenadas y comparadas una a una. La lista del
  // oráculo sale de sus propias referencias EDGE_CURVE→VERTEX_POINT, no de
  // ningún número nuestro.
  const nuestras = cuerpo.edges
    .map((arista) => {
      // La arista guarda sus dos MEDIAS-aristas, no sus vértices: el origen es
      // el de `a` y el destino, el origen de su siguiente.
      const a = cuerpo.vertices[cuerpo.halfEdges[arista.a].origin].point;
      const b = cuerpo.vertices[halfEdgeDestination(cuerpo, arista.a)].point;
      return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    })
    .sort((x, y) => x - y);
  eq(
    medida.longitudesDeArista.length,
    nuestras.length,
    `${nombre}: el oráculo C mide ${medida.longitudesDeArista.length} aristas y el B-rep tiene ${nuestras.length}`,
  );
  medida.longitudesDeArista.forEach((largo, i) => {
    cerca(largo, nuestras[i], TOLERANCIA, `${nombre}: arista ${i}`);
  });
}

const exigidoC = process.env.VALLE_ORACULO_STEPUTILS === "1";
const hayC = observado.get("steputils")!.disponible;
if (exigidoC && !hayC) {
  throw new Error(
    "VALLE_ORACULO_STEPUTILS=1 exige reejecutar el censo del oráculo C y `steputils` no está. " +
      "Instálala con `pip install steputils==0.1` o quita la variable.",
  );
}
if (hayC) {
  const destino = path.join(os.tmpdir(), "valle-censo-steputils-reejecutado.json");
  const corrida = spawnSync(
    "python3",
    [path.join(RAIZ, "docs/cad/corpus/oraculos/censo-steputils.py"), "--destino", destino],
    { cwd: RAIZ, encoding: "utf8" },
  );
  assert.ok(corrida.status === 0, `el censo del oráculo C no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
  assert.ok(
    fs.readFileSync(destino).equals(fs.readFileSync(CENSO_C)),
    "la lectura de `steputils` sobre lo que exportamos YA NO da los bytes comprometidos",
  );
  contador.reejecuciones += 1;
} else {
  declaracionesDeAusencia.push(
    "oráculo C (`steputils` 0.1): AUSENTE en esta máquina. Su lectura del STEP se usa congelada y " +
      "anclada al sha256 de los bytes que este mismo spec acaba de exportar; el ancla es lo que " +
      "impide que una medida vieja siga pareciendo evidencia.",
  );
}

eq(
  censoC.resumen,
  { solidos: 5, leidos: 5, rechazados: 0, esquemas: ["AUTOMOTIVE_DESIGN { 1 0 10303 214 3 1 1 }"] },
  "el oráculo C rechazó alguno de los cinco sólidos, o leyó otro esquema del declarado",
);

// ───────────────────────────────────────────────────────────────────────────

console.log(
  `oráculos externos: ${contador.comprobaciones} comprobaciones · ${contador.magnitudes} magnitudes del ` +
    `sólido contrastadas contra steputils 0.1 · ${ORACULOS.filter((o) => o.estado === "cableado").length}/` +
    `${ORACULOS.length} candidatos cableados · ${BINARIOS.length} binarios sondeados, ` +
    `${binariosObservados.filter((b) => b.disponible).length} presentes`,
);
console.log(
  `  · reejecuciones del arnés en esta máquina: ${contador.reejecuciones} de 2 (no suman al total a ` +
    "propósito: una cifra que dependa de qué haya instalado sería una cifra que depende del entorno).",
);
for (const linea of declaracionesDeAusencia) console.log(`  · ${linea}`);
console.log(
  "  · TODAVÍA NO (2026-09-05): ODA File Converter sigue ausente y su descarga exige que una PERSONA " +
    "acepte términos; LibreDWG queda descartada por GPL, no por falta de intento.",
);
