/**
 * El fallback a JavaScript, PROBADO en sus cuatro formas de fallar.
 *
 * ## Por qué este spec existe aparte del de paridad
 *
 * Porque «si el wasm no carga seguimos en JavaScript» es una promesa que casi
 * todo el mundo hace y casi nadie prueba, y cuando se prueba se prueba UNA
 * forma de fallar: el archivo que no está. Las otras tres son las que muerden
 * en producción — una CDN que devuelve un HTML de error con estado 200, un
 * binario truncado a medio descargar, un despliegue en el que el `.wasm` se
 * quedó atrás y declara una ABI anterior. En las tres, el binario ES
 * descargable y no sirve; si el cargador sólo comprueba «¿hubo respuesta?», el
 * editor se cae con la excepción en vez de dibujar más despacio.
 *
 * ## Qué se exige aquí
 *
 * Dos cosas, y la segunda es la que importa. Primera: que el kernel devuelto
 * sea el de JavaScript y traiga escrito POR QUÉ. Segunda: que ese kernel
 * degradado dé exactamente los mismos números que el teselador del producto —
 * un fallback que sigue vivo pero dibuja otra cosa no es un fallback, es un
 * segundo producto silencioso.
 */
import assert from "node:assert/strict";
import {
  CAD_ARC_STRIDE,
  CAD_CURVE_KERNEL_ABI,
  CadCurveKernelError,
  createCadCurveKernel,
  createCadCurveKernelJs,
} from "./curve-kernel";
import { tessellateArc, tessellateSpline } from "../curve-tessellate";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// ---------------------------------------------------------------------------
// Un ensamblador mínimo de wasm, para fabricar binarios ROTOS a propósito
// ---------------------------------------------------------------------------

/**
 * LEB128 sin signo. Las secciones de un módulo declaran su tamaño con este
 * formato y la de exports de aquí abajo pasa de 127 bytes, así que no vale
 * escribir el byte suelto.
 */
function uleb(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

const section = (id: number, payload: number[]) => [id, ...uleb(payload.length), ...payload];
const name = (text: string) => {
  const bytes = [...new TextEncoder().encode(text)];
  return [...uleb(bytes.length), ...bytes];
};

/**
 * Módulo con TODOS los exports del contrato pero con la ABI equivocada.
 *
 * Se fabrica a mano en vez de compilar un segundo crate porque el caso que hay
 * que provocar es exactamente «un binario plausible que miente sobre su
 * versión», y para eso hacen falta 60 bytes, no un segundo toolchain.
 */
function moduleDeclaringAbi(abi: number): Uint8Array<ArrayBuffer> {
  const exported = [
    "valle_kernel_abi",
    "valle_alloc",
    "valle_free",
    "valle_tessellate_arcs",
    "valle_tessellate_ellipses",
    "valle_tessellate_spline",
  ];
  const types = section(1, [0x01, 0x60, 0x00, 0x01, 0x7f]); // () -> i32
  const functions = section(3, [...uleb(exported.length), ...exported.map(() => 0)]);
  const memory = section(5, [0x01, 0x00, 0x01]); // una memoria, mínimo 1 página
  const exports = section(7, [
    ...uleb(exported.length + 1),
    ...name("memory"),
    0x02,
    0x00,
    ...exported.flatMap((label, index) => [...name(label), 0x00, ...uleb(index)]),
  ]);
  // Cada cuerpo: sin locales, `i32.const abi`, `end`.
  const body = [0x00, 0x41, ...uleb(abi), 0x0b];
  const code = section(10, [
    ...uleb(exported.length),
    ...exported.flatMap(() => [...uleb(body.length), ...body]),
  ]);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...types,
    ...functions,
    ...memory,
    ...exports,
    ...code,
  ]);
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  // Las cuatro formas de caer
  // ---------------------------------------------------------------------------

  const sinBinario = await createCadCurveKernel(null, "no había binario");
  ok(sinBinario.backend === "javascript", "sin binario debe caer al motor JavaScript");
  ok(sinBinario.fallbackReason === "no había binario", "el motivo debe llegar tal cual");
  ok(sinBinario.abi === null, "el motor JavaScript no declara ABI");

  // Un HTML de error servido con estado 200 es la forma más común de «binario
  // descargable que no sirve»: no empieza por el número mágico de wasm.
  const htmlDeError = await createCadCurveKernel(
    new TextEncoder().encode("<!doctype html><title>502 Bad Gateway</title>"),
  );
  ok(htmlDeError.backend === "javascript", "un HTML de error debe caer al motor JavaScript");
  ok(
    (htmlDeError.fallbackReason ?? "").includes("no instanció"),
    `el motivo debe señalar la instanciación: ${htmlDeError.fallbackReason}`,
  );

  // Módulo VÁLIDO pero vacío: instancia sin problema y no exporta nada. Es el
  // caso del despliegue que sirvió otro `.wasm` cualquiera.
  const moduloVacio = await createCadCurveKernel(
    new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
  );
  ok(moduloVacio.backend === "javascript", "un módulo sin exports debe caer al motor JavaScript");
  ok(
    (moduloVacio.fallbackReason ?? "").includes("faltan exports"),
    `el motivo debe enumerar los exports que faltan: ${moduloVacio.fallbackReason}`,
  );

  // ABI anterior: el binario se quedó atrás en el despliegue.
  const abiVieja = await createCadCurveKernel(moduleDeclaringAbi(CAD_CURVE_KERNEL_ABI + 1));
  ok(abiVieja.backend === "javascript", "una ABI distinta debe caer al motor JavaScript");
  ok(
    (abiVieja.fallbackReason ?? "").includes("ABI"),
    `el motivo debe nombrar la ABI: ${abiVieja.fallbackReason}`,
  );

  // Y el control positivo del ensamblador: con la ABI CORRECTA el cargador acepta
  // el módulo. Sin esto, los cuatro casos de arriba pasarían igual si el
  // ensamblador produjera basura, y el spec sería un espejo.
  const abiCorrecta = await createCadCurveKernel(moduleDeclaringAbi(CAD_CURVE_KERNEL_ABI));
  ok(
    abiCorrecta.backend === "wasm",
    `el ensamblador de prueba debe producir un módulo aceptable: ${abiCorrecta.fallbackReason}`,
  );

  // ---------------------------------------------------------------------------
  // El motor degradado dibuja LO MISMO que el producto
  // ---------------------------------------------------------------------------

  const degradado = createCadCurveKernelJs("comprobación de equivalencia");
  const arcos = new Float64Array([
    0, 0, 10, 0, 90,
    1500, -2500, 42.5, 350, 10,
    0, 0, 0, 0, 90, // radio cero: cero puntos, sin excepción
  ]);
  const lote = degradado.tessellateArcs(arcos, 3, 24);
  let cursor = 0;
  for (let curva = 0; curva < 3; curva += 1) {
    const base = curva * CAD_ARC_STRIDE;
    const esperado = tessellateArc(
      { x: arcos[base], y: arcos[base + 1] },
      arcos[base + 2],
      arcos[base + 3],
      arcos[base + 4],
      24,
    );
    ok(
      lote.counts[curva] === esperado.length,
      `curva ${curva}: ${lote.counts[curva]} puntos frente a ${esperado.length} del teselador del producto`,
    );
    for (let punto = 0; punto < esperado.length; punto += 1) {
      ok(
        Object.is(lote.points[cursor + punto * 2], esperado[punto].x) &&
          Object.is(lote.points[cursor + punto * 2 + 1], esperado[punto].y),
        `curva ${curva}, punto ${punto}: el motor degradado debe dar el MISMO f64 que el producto`,
      );
    }
    cursor += esperado.length * 2;
  }

  const control = new Float64Array([0, 0, 10, 30, 25, -10, 40, 20, 55, 5]);
  const spline = degradado.tessellateSpline(control, 3, null, 24);
  const splineEsperada = tessellateSpline(
    [
      { x: 0, y: 0 },
      { x: 10, y: 30 },
      { x: 25, y: -10 },
      { x: 40, y: 20 },
      { x: 55, y: 5 },
    ],
    3,
    undefined,
    24,
  );
  ok(spline.length === splineEsperada.length * 2, "la spline degradada debe traer los mismos puntos");
  for (let punto = 0; punto < splineEsperada.length; punto += 1)
    ok(
      Object.is(spline[punto * 2], splineEsperada[punto].x) &&
        Object.is(spline[punto * 2 + 1], splineEsperada[punto].y),
      `spline, punto ${punto}: el motor degradado debe dar el MISMO f64 que el producto`,
    );

  // ---------------------------------------------------------------------------
  // Lo que NO es fallback: un kernel de wasm ya cargado que se porta mal
  // ---------------------------------------------------------------------------

  const usarLiberado = () => {
    abiCorrecta.dispose();
    abiCorrecta.tessellateArcs(arcos, 1, 24);
  };
  assert.throws(usarLiberado, CadCurveKernelError, "usar un kernel liberado debe ser error TIPADO");
  checks += 1;

  console.log(`✅ curve-kernel-fallback: ${checks} comprobaciones`);
}

void main();
