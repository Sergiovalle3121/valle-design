/**
 * ORÁCULO G contra `wasm.toolchain`: `mpmath` (PyPI, BSD-3-Clause) emite el
 * teselado de arcos y elipses con precisión arbitraria, y aquí se contrasta
 * contra los DOS motores que `curve-kernel-parity.spec.ts` sólo compara entre
 * sí — el teselador de referencia en JavaScript y el kernel WASM en Rust.
 *
 * ## Por qué hacía falta esto
 *
 * `curve-kernel-parity.spec.ts` lo dice en su propia cabecera: «comparar los
 * motores entre sí dice si se parecen, nunca cuál tiene razón, y un gate que
 * sólo sabe medir parecido acepta que los dos se equivoquen de acuerdo». Para
 * la SPLINE ese spec ya tiene árbitro (la Bézier cúbica de Bernstein, forma
 * cerrada del mismo objeto). Para ARCOS y ELIPSES no lo tenía:
 * `docs/cad/evidence/independencia-por-fila.json` lo señala en el criterio
 * `wasm.toolchain` — «la referencia analítica cerrada también la escribimos
 * aquí […] falta que el que calcule sea otro».
 *
 * ## El corpus: el MISMO que ya existía, no uno nuevo
 *
 * Los diez arcos y siete elipses de `ARC_EDGE_CASES`/`ELLIPSE_EDGE_CASES` en
 * `curve-kernel-corpus.ts` se copian aquí LITERALES (no se importan: ese
 * archivo no los exporta, y no hace falta tocar código de producto para
 * duplicar diez líneas de datos ya públicos). Son las esquinas escritas a
 * mano precisamente porque el generador aleatorio no las alcanza — barrido
 * nulo, radio de micra, centro lejos del origen — y por eso son el corpus
 * correcto para un oráculo caro de generar como `mpmath` a precisión
 * arbitraria: pequeño, elegido con criterio, no un muestreo masivo.
 *
 * ## Qué mide, exactamente
 *
 * La MISMA magnitud que `curve-kernel-corpus.ts` ya usa para publicar la
 * tolerancia de paridad: la desviación absoluta dividida por la ESCALA de la
 * curva (`máx(|cx|,|cy|) + extensión`), no el ULP crudo del resultado — cerca
 * de un cero matemático (`cos 90°`) el ULP crudo dispara a números absurdos
 * por cancelación, que es justo el motivo por el que ese archivo inventó
 * `curveScale`. La tolerancia aquí es más ancha que la de paridad JS↔WASM
 * porque compara contra una referencia EXACTA, sin el margen de que ambos
 * motores compartan el mismo sesgo de redondeo: medido en esta máquina, el
 * peor caso es 2,22×10⁻¹⁵ (JS y WASM, idéntico); se declara el doble con
 * margen, 16 épsilon de máquina ≈ 3,55×10⁻¹⁵.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tessellateArc, tessellateEllipse } from "../curve-tessellate";
import {
  CAD_ARC_STRIDE,
  CAD_ELLIPSE_STRIDE,
  createCadCurveKernel,
  createCadCurveKernelJs,
} from "./curve-kernel";

const RAIZ = path.resolve(process.cwd(), "../..");
const ARTEFACTO = path.join(RAIZ, "docs/cad/corpus/oraculos/mpmath-1.4.1.json");
const CENSO = path.join(RAIZ, "docs/cad/corpus/oraculos/censo-mpmath.py");
const HERRAMIENTAS = path.join(RAIZ, "docs/cad/corpus/oraculos/HERRAMIENTAS.md");

let comprobaciones = 0;
let magnitudes = 0;
const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  comprobaciones += 1;
};

/** 16 épsilon de máquina: el doble, con margen, del peor caso medido (2,22×10⁻¹⁵). */
const F64_EPSILON = 2 ** -52;
const TOLERANCIA_ESCALADA = 16 * F64_EPSILON;

// ─────────────────────────────────────────────────────────────────────────────
// El corpus: copia LITERAL de ARC_EDGE_CASES/ELLIPSE_EDGE_CASES en curve-kernel-corpus.ts
// ─────────────────────────────────────────────────────────────────────────────

const ARC_EDGE_CASES: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
  ["vuelta-completa", 0, 0, 1, 0, 360],
  ["barrido-nulo", 0, 0, 1, 0, 0],
  ["cruza-origen-de-angulos", 0, 0, 1, 350, 10],
  ["barrido-negativo", 0, 0, 1, 90, 45],
  ["dos-vueltas", 0, 0, 1, 0, 720],
  ["radio-de-micra", 0, 0, 1e-6, 0, 90],
  ["radio-de-decenas-de-km", 0, 0, 1e7, 0, 90],
  ["lejos-del-origen", 1e6, -1e6, 25, 30, 300],
  ["radio-cero", 0, 0, 0, 0, 90],
  ["radio-negativo", 0, 0, -5, 0, 90],
];

const ELLIPSE_EDGE_CASES: ReadonlyArray<readonly [string, number, number, number, number, number, number, number]> = [
  ["circulo-por-elipse", 0, 0, 10, 0, 1, 0, 360],
  ["casi-un-segmento", 0, 0, 10, 0, 0.02, 0, 360],
  ["eje-mayor-vertical", 0, 0, 0, 10, 0.5, 0, 360],
  ["rotada-45", 0, 0, 7.07, 7.07, 0.5, 45, 315],
  ["lejos-rotada-negativa", -1e5, 1e5, 250, -120, 0.33, 200, 120],
  ["eje-mayor-nulo", 0, 0, 0, 0, 0.5, 0, 360],
  ["razon-nula", 0, 0, 10, 0, 0, 0, 360],
];

const STEPS = [24, 96] as const;

function scaleArc(cx: number, cy: number, r: number): number {
  return Math.max(Math.max(Math.abs(cx), Math.abs(cy)) + Math.abs(r), 1);
}
function scaleEllipse(cx: number, cy: number, mx: number, my: number, ratio: number): number {
  return Math.max(Math.max(Math.abs(cx), Math.abs(cy)) + Math.hypot(mx, my) * Math.max(1, ratio), 1);
}

interface CensoPunto {
  leido: boolean;
  n?: number;
  puntos?: number[][];
  porQueNo?: string;
}
interface CensoMpmath {
  herramienta: { nombre: string; version: string; licencia: string; precisionDecimales: number };
  steps: number[];
  arcos: Record<string, Record<string, CensoPunto>>;
  elipses: Record<string, Record<string, CensoPunto>>;
}

ok(fs.existsSync(ARTEFACTO), "falta el censo congelado de mpmath: corre censo-mpmath.py primero");
const censo = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as CensoMpmath;
ok(censo.herramienta.nombre === "mpmath", "el censo congelado no dice mpmath");
ok(censo.herramienta.licencia === "BSD-3-Clause", "el censo congelado declara otra licencia");
ok(censo.steps.length === STEPS.length && censo.steps.every((s, i) => s === STEPS[i]), "el censo no cubre los mismos steps");

const registro = fs.readFileSync(HERRAMIENTAS, "utf8");
ok(registro.includes("mpmath"), "HERRAMIENTAS.md no registra mpmath");

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 1 · El teselador de referencia (JavaScript) contra mpmath
// ─────────────────────────────────────────────────────────────────────────────

let worstScaledJs = 0;
for (const steps of STEPS) {
  for (const [nombre, cx, cy, r, start, end] of ARC_EDGE_CASES) {
    const referencia = censo.arcos[nombre]?.[String(steps)];
    ok(referencia !== undefined, `el censo no trae el arco «${nombre}»@${steps}`);
    const puntos = tessellateArc({ x: cx, y: cy }, r, start, end, steps);
    if (!referencia.leido) {
      ok(puntos.length === 0, `«${nombre}»: el censo declara cero puntos y el teselador produjo ${puntos.length}`);
      continue;
    }
    ok(puntos.length === (referencia.n! + 1), `«${nombre}»@${steps}: ${puntos.length} puntos, el censo esperaba ${referencia.n! + 1}`);
    const scale = scaleArc(cx, cy, r);
    referencia.puntos!.forEach(([rx, ry], indice) => {
      const punto = puntos[indice];
      const dx = Math.abs(punto.x - rx) / scale;
      const dy = Math.abs(punto.y - ry) / scale;
      worstScaledJs = Math.max(worstScaledJs, dx, dy);
      magnitudes += 2;
      assert.ok(dx <= TOLERANCIA_ESCALADA, `arco «${nombre}»@${steps} pto ${indice} x: ${dx} > ${TOLERANCIA_ESCALADA}`);
      assert.ok(dy <= TOLERANCIA_ESCALADA, `arco «${nombre}»@${steps} pto ${indice} y: ${dy} > ${TOLERANCIA_ESCALADA}`);
    });
    comprobaciones += 1;
  }
  for (const [nombre, cx, cy, mx, my, ratio, start, end] of ELLIPSE_EDGE_CASES) {
    const referencia = censo.elipses[nombre]?.[String(steps)];
    ok(referencia !== undefined, `el censo no trae la elipse «${nombre}»@${steps}`);
    const puntos = tessellateEllipse({ x: cx, y: cy }, { x: mx, y: my }, ratio, start, end, steps);
    if (!referencia.leido) {
      ok(puntos.length === 0, `«${nombre}»: el censo declara cero puntos y el teselador produjo ${puntos.length}`);
      continue;
    }
    ok(puntos.length === (referencia.n! + 1), `«${nombre}»@${steps}: ${puntos.length} puntos, el censo esperaba ${referencia.n! + 1}`);
    const scale = scaleEllipse(cx, cy, mx, my, ratio);
    referencia.puntos!.forEach(([rx, ry], indice) => {
      const punto = puntos[indice];
      const dx = Math.abs(punto.x - rx) / scale;
      const dy = Math.abs(punto.y - ry) / scale;
      worstScaledJs = Math.max(worstScaledJs, dx, dy);
      magnitudes += 2;
      assert.ok(dx <= TOLERANCIA_ESCALADA, `elipse «${nombre}»@${steps} pto ${indice} x: ${dx} > ${TOLERANCIA_ESCALADA}`);
      assert.ok(dy <= TOLERANCIA_ESCALADA, `elipse «${nombre}»@${steps} pto ${indice} y: ${dy} > ${TOLERANCIA_ESCALADA}`);
    });
    comprobaciones += 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTO 2 · El kernel WASM del árbol, EL MISMO binario, contra mpmath
// ─────────────────────────────────────────────────────────────────────────────

async function verificaWasm(): Promise<number> {
  const wasmPath = path.join(RAIZ, "apps/web/public/wasm/valle-cad-kernel.wasm");
  ok(fs.existsSync(wasmPath), "no existe apps/web/public/wasm/valle-cad-kernel.wasm");
  const bytes = fs.readFileSync(wasmPath);
  const wasm = await createCadCurveKernel(new Uint8Array(bytes));
  ok(wasm.backend === "wasm", `el binario debe cargar como kernel wasm, no caer al fallback: ${wasm.fallbackReason}`);

  const arcInput = new Float64Array(ARC_EDGE_CASES.length * CAD_ARC_STRIDE);
  ARC_EDGE_CASES.forEach(([, cx, cy, r, start, end], indice) =>
    arcInput.set([cx, cy, r, start, end], indice * CAD_ARC_STRIDE),
  );
  const ellipseInput = new Float64Array(ELLIPSE_EDGE_CASES.length * CAD_ELLIPSE_STRIDE);
  ELLIPSE_EDGE_CASES.forEach(([, cx, cy, mx, my, ratio, start, end], indice) =>
    ellipseInput.set([cx, cy, mx, my, ratio, start, end], indice * CAD_ELLIPSE_STRIDE),
  );

  let worstScaledWasm = 0;
  for (const steps of STEPS) {
    const arcBatch = wasm.tessellateArcs(arcInput, ARC_EDGE_CASES.length, steps);
    let cursor = 0;
    ARC_EDGE_CASES.forEach(([nombre, cx, cy, r], indice) => {
      const count = arcBatch.counts[indice];
      const referencia = censo.arcos[nombre][String(steps)];
      if (!referencia.leido) {
        ok(count === 0, `wasm «${nombre}»: el censo declara cero puntos y el kernel produjo ${count}`);
        cursor += count * 2;
        return;
      }
      const scale = scaleArc(cx, cy, r);
      referencia.puntos!.forEach(([rx, ry], punto) => {
        const x = arcBatch.points[cursor + punto * 2];
        const y = arcBatch.points[cursor + punto * 2 + 1];
        const dx = Math.abs(x - rx) / scale;
        const dy = Math.abs(y - ry) / scale;
        worstScaledWasm = Math.max(worstScaledWasm, dx, dy);
        magnitudes += 2;
        assert.ok(dx <= TOLERANCIA_ESCALADA, `wasm arco «${nombre}»@${steps} pto ${punto} x: ${dx} > ${TOLERANCIA_ESCALADA}`);
        assert.ok(dy <= TOLERANCIA_ESCALADA, `wasm arco «${nombre}»@${steps} pto ${punto} y: ${dy} > ${TOLERANCIA_ESCALADA}`);
      });
      cursor += count * 2;
    });

    const ellipseBatch = wasm.tessellateEllipses(ellipseInput, ELLIPSE_EDGE_CASES.length, steps);
    cursor = 0;
    ELLIPSE_EDGE_CASES.forEach(([nombre, cx, cy, mx, my, ratio], indice) => {
      const count = ellipseBatch.counts[indice];
      const referencia = censo.elipses[nombre][String(steps)];
      if (!referencia.leido) {
        ok(count === 0, `wasm «${nombre}»: el censo declara cero puntos y el kernel produjo ${count}`);
        cursor += count * 2;
        return;
      }
      const scale = scaleEllipse(cx, cy, mx, my, ratio);
      referencia.puntos!.forEach(([rx, ry], punto) => {
        const x = ellipseBatch.points[cursor + punto * 2];
        const y = ellipseBatch.points[cursor + punto * 2 + 1];
        const dx = Math.abs(x - rx) / scale;
        const dy = Math.abs(y - ry) / scale;
        worstScaledWasm = Math.max(worstScaledWasm, dx, dy);
        magnitudes += 2;
        assert.ok(dx <= TOLERANCIA_ESCALADA, `wasm elipse «${nombre}»@${steps} pto ${punto} x: ${dx} > ${TOLERANCIA_ESCALADA}`);
        assert.ok(dy <= TOLERANCIA_ESCALADA, `wasm elipse «${nombre}»@${steps} pto ${punto} y: ${dy} > ${TOLERANCIA_ESCALADA}`);
      });
      cursor += count * 2;
    });
  }
  comprobaciones += 1;
  return worstScaledWasm;
}

// El motor JS de referencia también se ejercita sin el WASM, para dejar
// constancia de que el ORÁCULO no depende del binario compilado.
void createCadCurveKernelJs(null);

void (async () => {
  const worstScaledWasm = await verificaWasm();

  // ───────────────────────────────────────────────────────────────────────
  // ACTO 3 · Si `mpmath` está en esta máquina, se vuelve a correr el censo
  // ───────────────────────────────────────────────────────────────────────

  function mpmathDisponible(): boolean {
    const resultado = spawnSync("python3", ["-c", "import mpmath; print(mpmath.__version__)"], { encoding: "utf8" });
    return resultado.status === 0 && resultado.stdout.trim() === censo.herramienta.version;
  }

  const exigido = process.env.VALLE_ORACULO_MPMATH === "1";
  const hay = mpmathDisponible();
  if (exigido && !hay) {
    throw new Error(
      "VALLE_ORACULO_MPMATH=1 exige reejecutar el censo y `mpmath` no está en esta máquina. " +
        "Instálala con `pip install mpmath==1.4.1` o quita la variable.",
    );
  }
  let reejecutado = false;
  if (hay) {
    const destino = path.join(os.tmpdir(), "valle-censo-mpmath-reejecutado.json");
    const corrida = spawnSync("python3", [CENSO, "--destino", destino], { cwd: RAIZ, encoding: "utf8" });
    assert.ok(corrida.status === 0, `el censo de mpmath no volvió a correr: ${corrida.stderr?.trim() ?? ""}`);
    assert.ok(
      fs.readFileSync(destino).equals(fs.readFileSync(ARTEFACTO)),
      "el censo de mpmath ya no da los bytes comprometidos: revisa el diff antes de comprometer nada",
    );
    reejecutado = true;
  } else {
    console.log("  · oráculo G (`mpmath`): AUSENTE en esta máquina. El censo se usa congelado.");
  }

  console.log(
    `curve-kernel-mpmath: ${comprobaciones} comprobaciones · ${magnitudes} magnitudes contrastadas contra mpmath ` +
      `(50 dígitos) · peor desviación de escala JS ${worstScaledJs.toExponential(2)}, WASM ${worstScaledWasm.toExponential(2)} ` +
      `(tope ${TOLERANCIA_ESCALADA.toExponential(2)}) · reejecutado: ${reejecutado}`,
  );
})();
