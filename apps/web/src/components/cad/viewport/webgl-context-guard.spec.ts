/**
 * El guardián del contexto WebGL: qué escucha, qué cancela y qué suelta.
 *
 * Se prueba con un lienzo falso —un emisor de eventos mínimo— porque lo que hay
 * que fijar no es el dibujo sino tres contratos que se olvidan siempre:
 *
 *   1. `preventDefault()` sobre `webglcontextlost`. Sin esa llamada el
 *      navegador NUNCA emite `webglcontextrestored`: la recuperación depende
 *      literalmente de cancelar el evento. Un guardián que avisa y no cancela
 *      convierte una pérdida temporal en una permanente.
 *   2. Los dos avisos llegan, y llegan al que toca.
 *   3. Soltar quita LOS DOS escuchadores y es idempotente — un `dispose` que se
 *      llama dos veces es la norma en un efecto de React con modo estricto.
 *
 * Correr:  npx tsx src/components/cad/viewport/webgl-context-guard.spec.ts
 */
import { strict as assert } from "node:assert";
import { guardCadWebglContext } from "./webgl-context-guard";

type Escuchador = { tipo: string; fn: (e: unknown) => void };

function lienzoFalso() {
  const escuchadores: Escuchador[] = [];
  const canvas = {
    addEventListener(tipo: string, fn: (e: unknown) => void) {
      escuchadores.push({ tipo, fn });
    },
    removeEventListener(tipo: string, fn: (e: unknown) => void) {
      const i = escuchadores.findIndex((l) => l.tipo === tipo && l.fn === fn);
      if (i >= 0) escuchadores.splice(i, 1);
    },
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    escuchadores,
    emitir(tipo: string, evento: unknown) {
      for (const l of [...escuchadores]) if (l.tipo === tipo) l.fn(evento);
    },
  };
}

/* ── 1 · Se cancela la pérdida, que es lo que permite recuperarla ─────────── */
{
  const { canvas, emitir } = lienzoFalso();
  let perdidas = 0;
  guardCadWebglContext(canvas, {
    onLost: () => {
      perdidas += 1;
    },
    onRestored: () => {},
  });
  let cancelado = false;
  emitir("webglcontextlost", {
    preventDefault() {
      cancelado = true;
    },
  });
  assert.equal(
    cancelado,
    true,
    "sin preventDefault el navegador no vuelve a dar el contexto nunca",
  );
  assert.equal(perdidas, 1, "el aviso de pérdida tiene que llegar");
}

/* ── 2 · La restauración avisa ────────────────────────────────────────────── */
{
  const { canvas, emitir } = lienzoFalso();
  let restauradas = 0;
  guardCadWebglContext(canvas, {
    onLost: () => {},
    onRestored: () => {
      restauradas += 1;
    },
  });
  emitir("webglcontextrestored", {});
  assert.equal(restauradas, 1);
}

/* ── 3 · Soltar quita los dos, y soltar dos veces no rompe ────────────────── */
{
  const { canvas, escuchadores, emitir } = lienzoFalso();
  let avisos = 0;
  const soltar = guardCadWebglContext(canvas, {
    onLost: () => {
      avisos += 1;
    },
    onRestored: () => {
      avisos += 1;
    },
  });
  assert.equal(escuchadores.length, 2, "se enganchan exactamente dos");
  soltar();
  soltar();
  assert.equal(escuchadores.length, 0, "soltar quita los dos y es idempotente");
  emitir("webglcontextlost", { preventDefault() {} });
  emitir("webglcontextrestored", {});
  assert.equal(avisos, 0, "tras soltar no llega ningún aviso");
}

console.log("guardián del contexto WebGL: 3/3");
