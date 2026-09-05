import { strict as assert } from "node:assert";
import { cadEntityLength } from "../curve-edit";
import type { CadDocument, CadEntity } from "../cad-document";

/**
 * EL INSTRUMENTO DE MEDIDA DE LA JORNADA SOBRE EL PLANO AJENO.
 *
 * `terceros-jornada.spec.ts` recorre los cinco actos; aquí vive con qué los
 * mide. La costura está donde tiene que estar: a este lado no hay ni una
 * afirmación sobre el plano, sólo la máquina que permite hacerlas —los dos
 * contadores, la comparación por bolsa, las claves geométricas y la forma de
 * lo que devuelven los dos oráculos—.
 *
 * Vive aparte por el presupuesto de monolito (800 líneas por archivo no
 * presupuestado), y la separación se paga sola: los contadores dejan de ser
 * variables sueltas de un script y pasan a ser un objeto con nombre, así que
 * quien lea `contador.magnitudes` sabe que está leyendo «medidas del dibujo
 * comparadas contra un oráculo» y no «aserciones».
 *
 * LOS DOS CONTADORES SON DISTINTOS A PROPÓSITO. `comprobaciones` incluye la
 * contabilidad de la comparación (que las claves cuadren, que el censo sea el
 * que es). `magnitudes` cuenta SÓLO medidas del dibujo contrastadas una a una
 * contra un programa que no es éste. La cifra que se publica es la segunda, y
 * separarlas es lo que impide que un número grande no deje ver de qué está
 * hecho.
 */

/** Los dos contadores de la jornada. Uno cuenta aserciones; el otro, dibujo. */
export const contador = { comprobaciones: 0, magnitudes: 0 };

export const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  contador.comprobaciones += 1;
};
export const eq = <T>(actual: T, esperado: T, mensaje: string) => {
  assert.deepStrictEqual(actual, esperado, mensaje);
  contador.comprobaciones += 1;
};
export const cerca = (actual: number, esperado: number, tolerancia: number, mensaje: string) => {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia,
    `${mensaje}: ${actual} ≠ ${esperado} (±${tolerancia})`,
  );
  contador.comprobaciones += 1;
};

export interface MedidaOraculoB {
  etiqueta: string;
  sha256: string;
  bytes: number;
  leido: boolean;
  error?: string;
  dialecto?: string;
  version?: string;
  insunits?: number;
  capasDeclaradas?: number;
  capas?: string[];
  estilosDeCota?: number;
  tiposDeLinea?: number;
  espacioModelo?: Record<string, number>;
  lineas?: { n: number; longitudTotal: number; porGeometria: Array<[string, number]> };
  circulos?: { n: number; porGeometria: Array<[string, number]> };
  arcos?: { n: number; longitudTotal: number; porGeometria: Array<[string, number, number, number]> };
  polilineas?: {
    n: number;
    cerradas: number;
    conVerticeDeCierreRepetido: number;
    longitudTotal: number;
    porGeometria: Array<[string, number, number, boolean, number]>;
  };
  cotas?: { n: number; porGeometria: Array<[string, number, number | string]> };
  extension?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  auditoria?: { errores: number; correcciones: number };
}

export interface ArtefactoMedidas {
  herramienta: { nombre: string; version: string };
  experimentoSubclases: {
    entidadesParcheadas: number;
    /** Las que ya los traían. Desde P-evidencia-07 son todas y la anterior es 0. */
    entidadesQueYaLosTraian: number;
    sha256Origen: string;
    leido: boolean;
    espacioModelo?: Record<string, number>;
    auditoria?: { errores: number; correcciones: number };
    error?: string;
  } | null;
  archivos: MedidaOraculoB[];
}

/* ══════════════════════════════════════════════════════════════════════════
   LA COMPARACIÓN POR BOLSA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Compara dos listas `[clave, magnitud]` agrupando por clave.
 *
 * Un plano de verdad tiene entidades coincidentes —en éste hay 18 claves de
 * línea con más de un ejemplar—, así que la clave sola no identifica. La
 * comparación exige que cada clave traiga el MISMO número de ejemplares en las
 * dos lecturas y compara sus magnitudes ORDENADAS, una a una. Emparejar cada
 * cual con la más parecida habría tapado justo lo que se busca: una entidad
 * que llegó con otra medida.
 */
export function comparaPorClave(
  nombre: string,
  mios: Array<[string, number]>,
  suyos: Array<[string, number]>,
  tolerancia: number | ((clave: string) => number),
): number {
  const agrupa = (filas: Array<[string, number]>) => {
    const mapa = new Map<string, number[]>();
    for (const [clave, valor] of filas) {
      const lista = mapa.get(clave);
      if (lista) lista.push(valor);
      else mapa.set(clave, [valor]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a - b);
    return mapa;
  };
  const A = agrupa(mios);
  const B = agrupa(suyos);
  // Se comparan las LISTAS, no un booleano: cuando esto falla hay que ver QUÉ
  // clave sobra o falta, y un `true ≠ false` no lo dice.
  eq(
    [...A.keys()].sort(),
    [...B.keys()].sort(),
    `${nombre}: las claves geométricas no coinciden (producto ${A.size}, oráculo ${B.size})`,
  );
  let peor = 0;
  const desiguales: string[] = [];
  for (const [clave, listaA] of A) {
    const listaB = B.get(clave)!;
    if (listaA.length !== listaB.length)
      desiguales.push(`${clave} (${listaA.length} contra ${listaB.length})`);
    const limite = typeof tolerancia === "number" ? tolerancia : tolerancia(clave);
    for (let i = 0; i < Math.min(listaA.length, listaB.length); i += 1) {
      const delta = Math.abs(listaA[i] - listaB[i]);
      if (delta > peor) peor = delta;
      // UNA comprobación por MAGNITUD comparada. Es lo que la campaña publica
      // como «caso numérico verificado contra oráculo independiente», y aquí
      // cada una lo es: una longitud del plano de otro contra la que midió una
      // implementación que no es ésta. El recuento de claves, en cambio, se
      // agrega: son contabilidad de la comparación, no medidas del dibujo.
      contador.magnitudes += 1;
      ok(delta <= limite, `${nombre} · ${clave}: ${listaA[i]} ≠ ${listaB[i]} (±${limite})`);
    }
  }
  eq(desiguales, [], `${nombre}: hay claves con distinto número de ejemplares — ${desiguales.join(", ")}`);
  return peor;
}

/** Compara dos bolsas de magnitudes SIN clave, ordenadas. */
export function comparaOrdenado(
  nombre: string,
  mios: readonly number[],
  suyos: readonly number[],
  tolerancia: number,
): number {
  eq(mios.length, suyos.length, `${nombre}: ${mios.length} magnitudes contra ${suyos.length}`);
  const a = [...mios].sort((x, y) => x - y);
  const b = [...suyos].sort((x, y) => x - y);
  let peor = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta > peor) peor = delta;
    contador.magnitudes += 1;
    ok(delta <= tolerancia, `${nombre} · puesto ${i}: ${a[i]} ≠ ${b[i]} (±${tolerancia})`);
  }
  return peor;
}

/** Cota superior en potencia de diez: estable entre máquinas, honesta. */
export const cota = (peor: number) => (peor === 0 ? 0 : 10 ** Math.ceil(Math.log10(peor)));

export const seis = (valor: number) => valor.toFixed(6);
export const clavePunto = (x: number, y: number) => `${seis(x)},${seis(y)}`;
export const claveSegmento = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const p = clavePunto(a.x, a.y);
  const q = clavePunto(b.x, b.y);
  return p <= q ? `${p}|${q}` : `${q}|${p}`;
};

/* ── La forma de lo que devuelve el oráculo A (dxf-parser) ──────────────── */

export interface EntidadOraculoA {
  type: string;
  layer?: string;
  vertices?: Array<{ x: number; y: number; bulge?: number }>;
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  angleLength?: number;
  shape?: boolean;
  actualMeasurement?: number;
  linearOrAngularPoint1?: { x: number; y: number };
  linearOrAngularPoint2?: { x: number; y: number };
}

/** Longitud de una polilínea con bulges. La misma fórmula que el oráculo B, escrita aparte. */
export function longitudPolilinea(
  vertices: ReadonlyArray<{ x: number; y: number; bulge?: number }>,
  cerrada: boolean,
): number {
  let total = 0;
  const n = vertices.length;
  const ultimo = cerrada ? n : n - 1;
  for (let i = 0; i < ultimo; i += 1) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const cuerda = Math.hypot(b.x - a.x, b.y - a.y);
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) < 1e-12 || cuerda === 0) {
      total += cuerda;
      continue;
    }
    const barrido = 4 * Math.atan(Math.abs(bulge));
    total += (cuerda / (2 * Math.sin(barrido / 2))) * barrido;
  }
  return total;
}

/* ── Sacar entidades del documento y medirlas con el propio producto ────────
 *
 * `longitudDe` usa `cadEntityLength`, que es la medida del PRODUCTO: es el
 * lado nuestro de cada comparación, y por eso está aquí y no en el spec — para
 * que quede claro que el instrumento tiene dos brazos y uno es el de casa.
 */

export type Linea = Extract<CadEntity, { type: "line" }>;
export type Circulo = Extract<CadEntity, { type: "circle" }>;
export type Arco = Extract<CadEntity, { type: "arc" }>;
export type Polilinea = Extract<CadEntity, { type: "polyline" }>;

export const deTipo = <T extends CadEntity["type"]>(documento: CadDocument, tipo: T) =>
  documento.entities.filter((entidad): entidad is Extract<CadEntity, { type: T }> => entidad.type === tipo);

export const longitudDe = (entidad: CadEntity, que: string) => {
  const longitud = cadEntityLength(entidad);
  assert.ok(longitud !== null, `${que}: el producto no sabe medir esta entidad`);
  return longitud;
};
