import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * LA FONTANERÍA DE LAS CUATRO FILAS SOBRE MATERIAL AJENO.
 *
 * `terceros-jornada.spec.ts` recorre UN plano entero. Estas cuatro suites hacen
 * lo contrario: cada una coge el fichero ajeno más pequeño que atestigua UNA
 * capacidad —capas, bloques, texto, cota y sombreado— y la afirma sobre bytes
 * que este proyecto no escribió. Aquí vive lo que las cuatro comparten y nada
 * más: dónde está el corpus, cómo se ancla a su hash, de dónde sale el oráculo
 * congelado y cómo cada una publica su renglón en el artefacto común.
 *
 * ─── Por qué el ancla es un hash y no una ruta ─────────────────────────────
 *
 * `ezdxf` es Python y no corre en CI: su lectura llega CONGELADA en
 * `medidas-cuatro-filas-ezdxf.json`. Una medida congelada sin ancla es peor que
 * ninguna, porque sigue pareciendo evidencia después de que los bytes cambien.
 * `abreAjeno()` recalcula el sha256 del fichero y lo exige igual en TRES sitios
 * a la vez —el manifiesto de derechos, el censo del oráculo y estas medidas—;
 * cuando uno no cuadra, la suite se pone en rojo en vez de creerse un número
 * que ya no habla de ese fichero.
 *
 * ─── El artefacto compartido, y por qué se compara en vez de escribirse ────
 *
 * Las cuatro suites escriben en `docs/cad/evidence/independencia-terceros.json`,
 * una fila cada una. Escribir en cada corrida convertiría el artefacto en un
 * eco: diría siempre lo que el código diga hoy. Así que por defecto se RECALCULA
 * el renglón y se hace `deepStrictEqual` contra el comprometido —el `--check`
 * de un generador, sin tocar `scripts/`— y sólo se escribe a mano:
 *
 *   cd apps/web && VALLE_ESCRIBIR_TERCEROS=1 npx tsx src/lib/cad/verification/terceros-capas.spec.ts
 *
 * Un cambio en lo que el producto hace sale entonces como diferencia revisable
 * en el árbol, que es donde tiene que salir.
 */

export const RAIZ = path.resolve(process.cwd(), "../..");
export const CORPUS = path.join(RAIZ, "docs/cad/corpus");
export const ARTEFACTO = path.join(RAIZ, "docs/cad/evidence/independencia-terceros.json");

/** Las cuatro filas de la rúbrica que estas suites sirven, en su orden. */
export const FILAS = ["layers", "blocks", "mtext", "dimensions-hatch"] as const;
export type Fila = (typeof FILAS)[number];

/**
 * LOS DOS CONTADORES, distintos a propósito y con la misma razón que en la
 * jornada: `comprobaciones` cuenta aserciones (incluida la contabilidad de la
 * comparación) y `magnitudes` cuenta SÓLO datos del dibujo contrastados uno a
 * uno contra un programa que no es éste. Un número grande sin ese desglose no
 * deja ver de qué está hecho.
 */
export const contador = { comprobaciones: 0, magnitudes: 0 };

export const ok = (condicion: boolean, mensaje: string) => {
  assert.ok(condicion, mensaje);
  contador.comprobaciones += 1;
};
export const eq = <T>(actual: T, esperado: T, mensaje: string) => {
  assert.deepStrictEqual(actual, esperado, mensaje);
  contador.comprobaciones += 1;
};
/** Como `eq`, pero además cuenta como MAGNITUD: es dibujo contra el oráculo. */
export const eqMagnitud = <T>(actual: T, esperado: T, mensaje: string) => {
  eq(actual, esperado, mensaje);
  contador.magnitudes += 1;
};
export const cerca = (actual: number, esperado: number, tolerancia: number, mensaje: string) => {
  assert.ok(
    Math.abs(actual - esperado) <= tolerancia,
    `${mensaje}: ${actual} ≠ ${esperado} (±${tolerancia})`,
  );
  contador.comprobaciones += 1;
  contador.magnitudes += 1;
};

interface ArchivoManifiesto {
  id: string;
  ruta: string;
  sha256: string;
  bytes: number;
}
interface MedidaB {
  ruta: string;
  sha256: string;
  bytes: number;
  dialecto: string;
  version: string;
  [clave: string]: unknown;
}
interface MedidasCuatroFilas {
  oraculo: string;
  herramienta: string;
  archivos: Record<string, MedidaB>;
}
interface CensoB {
  archivos: Array<{ id: string; sha256Archivo: string; leido: boolean; [clave: string]: unknown }>;
}

const manifiesto = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "manifest.json"), "utf8"),
) as { archivos: ArchivoManifiesto[] };

export const MEDIDAS_B = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "oraculos/medidas-cuatro-filas-ezdxf.json"), "utf8"),
) as MedidasCuatroFilas;

const CENSO_B = JSON.parse(
  fs.readFileSync(path.join(CORPUS, "oraculos/ezdxf-1.4.4.json"), "utf8"),
) as CensoB;

export interface Ajeno {
  id: string;
  nombre: string;
  texto: string;
  sha256: string;
  bytes: number;
  /** Lo que el oráculo B midió sobre EXACTAMENTE estos bytes. */
  b: MedidaB;
}

/**
 * Abre un fichero del corpus ajeno con las tres anclas puestas.
 *
 * Que el mismo hash tenga que cuadrar en el manifiesto de derechos, en el censo
 * y en las medidas no es redundancia: son tres artefactos que se escribieron en
 * días distintos y sólo hablan del mismo fichero si coinciden. El día que uno
 * se quede atrás, esto lo dice.
 */
export function abreAjeno(nombre: string): Ajeno {
  const id = `bjnortier-dxf/${nombre}`;
  const declarado = manifiesto.archivos.find((archivo) => archivo.id === id);
  ok(declarado !== undefined, `${id}: no está declarado en el manifiesto de derechos del corpus`);
  const ruta = path.join(CORPUS, declarado!.ruta);
  const bytes = fs.readFileSync(ruta);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  ok(
    sha256 === declarado!.sha256,
    `${id}: los bytes del árbol no son los del manifiesto (${sha256.slice(0, 12)}… ≠ ${declarado!.sha256.slice(0, 12)}…). ` +
      "Un fichero de terceros que cambió dejó de ser material ajeno.",
  );
  ok(bytes.length === declarado!.bytes, `${id}: el tamaño no cuadra con el manifiesto`);
  const censo = CENSO_B.archivos.find((archivo) => archivo.id === id);
  ok(censo !== undefined, `${id}: el censo del oráculo B no lo tiene`);
  ok(
    censo!.sha256Archivo === sha256,
    `${id}: el censo congelado del oráculo B habla de otros bytes; regenera censo-ezdxf.py antes de creértelo`,
  );
  const b = MEDIDAS_B.archivos[id];
  ok(b !== undefined, `${id}: las medidas del oráculo B no lo incluyen`);
  ok(
    b.sha256 === sha256,
    `${id}: las medidas congeladas del oráculo B hablan de otros bytes (${b.sha256.slice(0, 12)}…); ` +
      "regenera medidas-cuatro-filas.py antes de creértelas",
  );
  ok(b.bytes === bytes.length, `${id}: el tamaño medido por el oráculo B no cuadra`);
  return { id, nombre, texto: bytes.toString("utf8"), sha256, bytes: bytes.length, b };
}

/** El censo congelado del oráculo B para un fichero, ya anclado por `abreAjeno`. */
export function censoDe(id: string): Record<string, unknown> {
  return CENSO_B.archivos.find((archivo) => archivo.id === id) as unknown as Record<string, unknown>;
}

export interface Renglon {
  fila: Fila;
  filasDeLaRubrica: string[];
  spec: string;
  archivosAjenos: Array<{ id: string; sha256: string; bytes: number; dialecto: string }>;
  loQueAfirmaLaFila: string;
  loQueDicenLosOraculos: Record<string, unknown>;
  loQueHaceElLector: Record<string, unknown>;
  hallazgos: Array<{ id: string; que: string; silencioso: boolean; peticion: string | null }>;
  veredicto: "servible_hoy" | "bloqueado_por_defecto_medido";
  porQueEseVeredicto: string;
  loQueNoSeMide: string;
}

/**
 * Publica (o comprueba) el renglón de una fila en el artefacto compartido.
 *
 * FAIL-CLOSED en los dos sentidos: un renglón que no está en el artefacto es un
 * fallo, y un renglón del artefacto cuya suite ya no existe, también. Sin la
 * segunda mitad, borrar una suite dejaría al artefacto afirmando por su cuenta.
 */
export function publicaRenglon(renglon: Renglon): void {
  const artefacto = JSON.parse(fs.readFileSync(ARTEFACTO, "utf8")) as {
    corpusSintetico: boolean;
    renglones: Renglon[];
    [clave: string]: unknown;
  };
  if (process.env.VALLE_ESCRIBIR_TERCEROS === "1") {
    const otros = artefacto.renglones.filter((otro) => otro.fila !== renglon.fila);
    artefacto.renglones = [...otros, renglon].sort(
      (a, b) => FILAS.indexOf(a.fila) - FILAS.indexOf(b.fila),
    );
    fs.writeFileSync(ARTEFACTO, `${JSON.stringify(artefacto, null, 1)}\n`, "utf8");
    console.log(`  · renglón «${renglon.fila}» ESCRITO en docs/cad/evidence/independencia-terceros.json`);
    return;
  }
  ok(
    artefacto.corpusSintetico === false,
    "el artefacto tiene que declarar que su corpus NO es sintético; ésa es la diferencia entera con la matriz que ya había",
  );
  const comprometido = artefacto.renglones.find((otro) => otro.fila === renglon.fila);
  ok(comprometido !== undefined, `el artefacto no tiene renglón para la fila «${renglon.fila}»`);
  eq(
    renglon,
    comprometido!,
    `el renglón «${renglon.fila}» recalculado no es el comprometido. Si el producto cambió, regenera con ` +
      "VALLE_ESCRIBIR_TERCEROS=1 y revisa la diferencia; no la escribas a mano.",
  );
  for (const otro of artefacto.renglones)
    ok(
      fs.existsSync(path.join(RAIZ, otro.spec)),
      `el artefacto declara la suite ${otro.spec} y ese archivo no está: un renglón sin quien lo verifique no afirma nada`,
    );
  ok(
    artefacto.renglones.length === FILAS.length,
    `el artefacto tiene ${artefacto.renglones.length} renglones y las filas son ${FILAS.length}`,
  );
}

/** Clave geométrica de un segmento con los extremos ordenados, a seis decimales. */
export const claveSegmento = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): string => {
  const p = `${a.x.toFixed(6)},${a.y.toFixed(6)}`;
  const q = `${b.x.toFixed(6)},${b.y.toFixed(6)}`;
  return p <= q ? `${p}|${q}` : `${q}|${p}`;
};

/** El mismo, sobre el par `[[x,y],[x,y]]` que publica el oráculo B. */
export const claveSegmentoB = (de: number[], a: number[]): string =>
  claveSegmento({ x: de[0], y: de[1] }, { x: a[0], y: a[1] });

/** Cuenta por tipo de entidad, que es como hablan los dos oráculos. */
export function porTipo(entidades: ReadonlyArray<{ type: string }>): Record<string, number> {
  const censo: Record<string, number> = {};
  for (const entidad of entidades) censo[entidad.type] = (censo[entidad.type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(censo).sort(([a], [b]) => a.localeCompare(b)));
}
