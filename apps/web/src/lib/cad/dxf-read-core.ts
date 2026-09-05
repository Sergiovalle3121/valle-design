/**
 * Lectura de pares código/valor DXF y coerciones básicas.
 *
 * `dxf-parser` no expone las entidades que este producto necesita leer con
 * fidelidad —HATCH, MTEXT, DIMENSION con XDATA, y ahora los ocho tipos del
 * esquema 4—, así que la importación las lee a mano sobre los pares crudos.
 * Esa lectura es la MISMA para todos, y vive aquí para que no se duplique.
 *
 * Módulo HOJA: sólo importa tipos, así que puede importarlo cualquiera sin
 * cerrar un ciclo de carga.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CadDxfPoint } from "./dxf-import";

export interface RawDxfPair {
  code: number;
  value: string;
}

/**
 * Un DXF de texto es una secuencia de LÍNEAS ALTERNAS: código, valor, código,
 * valor. Se lee así y no con una gramática porque lo que hace falta es
 * localizar entidades y sus grupos, no validar el fichero entero.
 */
export function rawDxfPairs(text: string): RawDxfPair[] {
  const lines = text.split(/\r?\n/);
  const pairs: RawDxfPair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (Number.isInteger(code)) pairs.push({ code, value: lines[index + 1].trim() });
  }
  return pairs;
}

/**
 * EN QUÉ SECCIÓN ESTÁ CADA PAR: `true` donde el par pertenece a `ENTITIES`.
 *
 * Los escaneos crudos —MTEXT en `dxf-read-annotations.ts`, HATCH en
 * `dxf-import.ts`— recorren el fichero entero buscando su `0 <TIPO>` y hasta
 * hoy no sabían dónde estaban. Un MTEXT de dentro de una definición de BLOCK
 * salía entonces como entidad suelta de espacio modelo, con las coordenadas
 * LOCALES del bloque: sin la traslación, sin la escala y sin la rotación del
 * INSERT que lo trae, porque a ese nivel no hay INSERT ninguno.
 *
 * Medido sobre material ajeno antes de escribir esto: en `blocks2.dxf` dos de
 * los tres MTEXT que el lector entregaba vivían dentro de `block01`/`block02` y
 * caían 175 mm a la izquierda y 25 mm abajo, además de dibujarse dos veces; en
 * `dimensions.dxf` el rótulo del bloque de dibujo de cada cota (`*D1`, `*D2`)
 * salía encima del número que la propia cota recalcula, nueve entidades donde
 * `ezdxf` cuenta siete. Y el tamaño lo pone el plano grande: de los 144 MTEXT
 * de `floorplan.dxf`, el remitente puso 9 en espacio modelo y los otros 135
 * viven dentro de bloques.
 *
 * Se calcula una vez por fichero y se comparte: es O(n) sobre los pares y los
 * dos escaneos lo necesitan igual.
 */
export function dxfPairsInEntitiesSection(pairs: readonly RawDxfPair[]): boolean[] {
  const inEntities = new Array<boolean>(pairs.length).fill(false);
  let section = "";
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code === 0) {
      const value = pairs[index].value.toUpperCase();
      if (value === "SECTION")
        section = pairs[index + 1]?.code === 2 ? pairs[index + 1].value.trim().toUpperCase() : "";
      else if (value === "ENDSEC") section = "";
    }
    inEntities[index] = section === "ENTITIES";
  }
  return inEntities;
}

/**
 * NORMALIZA LOS BOOLEANOS DE CABECERA FUERA DE RANGO, y dice cuántos tocó.
 *
 * `dxf-parser` convierte los códigos 290–299 a booleano y sólo acepta `0` y
 * `1`: cualquier otro valor levanta `String '2' cannot be cast to Boolean type`
 * y **tumba el fichero entero**. El formato REAL permite más — `$XCLIPFRAME`
 * vale 0, 1 o 2 desde AutoCAD 2010 —, así que un fichero perfectamente válido
 * se rechazaba con un mensaje que acusaba al remitente de haberlo corrompido.
 *
 * Medido sobre `bjnortier-dxf/blocks2.dxf`, material de prueba de una
 * biblioteca MIT que `ezdxf` abre sin una queja: su cabecera trae
 * `$XCLIPFRAME 2` y era lo ÚNICO que impedía leerlo. Normalizado ese par, el
 * fichero entra completo con su anidado de dos niveles intacto.
 *
 * Se normaliza a `1` porque para una bandera todo lo que no es cero es cierto,
 * y se DEVUELVE la cuenta para que el importador pueda avisar: una
 * normalización silenciosa sería cambiar un defecto por otro más callado.
 */
export function normalizeDxfHeaderBooleans(text: string): {
  text: string;
  normalized: number;
} {
  const lines = text.split(/\r?\n/);
  let normalized = 0;
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number(lines[index].trim());
    if (!Number.isInteger(code) || code < 290 || code > 299) continue;
    const raw = lines[index + 1].trim();
    const value = Number(raw);
    if (!Number.isFinite(value) || value === 0 || value === 1) continue;
    lines[index + 1] = "1";
    normalized += 1;
  }
  return normalized === 0 ? { text, normalized } : { text: lines.join("\n"), normalized };
}

/**
 * CUÁNTAS entidades de estos tipos viven FUERA de la sección `ENTITIES`.
 *
 * Es la contrapartida obligatoria de `dxfPairsInEntitiesSection`: darle ámbito
 * al escaneo crudo hizo que dejaran de entrar cosas que antes entraban —mal
 * colocadas, pero entraban—, y una entidad que el fichero trae y el documento
 * no puede quedarse sin que nadie lo diga. El techo de pérdidas silenciosas de
 * `dxf-corpus-terceros-matrix.json` es cero, y lo cazó a la primera.
 */
export function countDxfEntitiesOutsideEntitiesSection(
  pairs: readonly RawDxfPair[],
  types: readonly string[],
  /**
   * Bloques cuyo contenido SÍ llega al dibujo por su INSERT. Lo que viva en
   * ellos no se cuenta: no falta, se dibuja desde el bloque que lo trae. Sin
   * este filtro el aviso saltaría en todo dibujo normal —cualquier rótulo
   * dentro de un bloque insertado— y un aviso que sale siempre no informa de
   * nada. Se cuenta sólo lo que está en el fichero y NO llega a ninguna parte.
   */
  reachableBlocks: ReadonlySet<string> = new Set(),
): Record<string, number> {
  const inEntities = dxfPairsInEntitiesSection(pairs);
  const wanted = new Set(types.map((type) => type.toUpperCase()));
  const counts: Record<string, number> = {};
  let currentBlock: string | null = null;
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code !== 0) continue;
    const type = pairs[index].value.toUpperCase();
    if (type === "BLOCK") {
      currentBlock = null;
      // El nombre del bloque es su código 2, dentro del preámbulo del BLOCK.
      for (let j = index + 1; j < pairs.length && pairs[j].code !== 0; j += 1)
        if (pairs[j].code === 2) {
          currentBlock = pairs[j].value.trim();
          break;
        }
      continue;
    }
    if (type === "ENDBLK") {
      currentBlock = null;
      continue;
    }
    if (inEntities[index] || !wanted.has(type)) continue;
    if (currentBlock !== null && reachableBlocks.has(currentBlock)) continue;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

export const pt = (v: any): CadDxfPoint | null => {
  const x = num(v?.x);
  const y = num(v?.y);
  if (x == null || y == null) return null;
  // El bulge viaja en el vértice: descartarlo aplanaba a cuerda recta todos
  // los arcos de polilínea del fichero importado, en silencio.
  const bulge = num(v?.bulge);
  // La cota (código 30) viaja igual, y por la misma razón: descartarla
  // aplanaba contra el suelo cada pilar y cada planta elevada, también en
  // silencio (Ola C, 2026-09-02). El cero se omite: el suelo es la ausencia.
  const z = num(v?.z);
  return { x, y, ...(bulge ? { bulge } : {}), ...(z ? { z } : {}) };
};

export function decodeComponent(value: string | undefined): string {
  try { return decodeURIComponent(value ?? ''); } catch { return value ?? ''; }
}
