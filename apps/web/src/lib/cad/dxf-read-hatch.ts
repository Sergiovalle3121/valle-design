/**
 * EL ESCANEO CRUDO DE HATCH.
 *
 * `dxf-parser` no trae manejador de HATCH —es su punto ciego, medido contra
 * `ezdxf` en `verification/dxf-fidelidad-terceros.spec.ts`— así que el
 * sombreado se lee a mano sobre los pares código/valor, igual que el MTEXT en
 * `dxf-read-annotations.ts`. Vive aquí y no dentro de `dxf-import.ts` por la
 * misma razón que su hermano: es una pieza coherente, y aquel archivo está en
 * su asignación de tamaño.
 *
 * Lo que este escaneo aprendió del material ajeno, y que conviene no volver a
 * perder:
 *
 *   · SÓLO la sección `ENTITIES`. Un HATCH de dentro de una definición de
 *     BLOCK saldría con las coordenadas locales del bloque, sin la
 *     transformación del INSERT que lo trae.
 *   · Un contorno de RUTA DE ARISTAS cuyas aristas sean todas rectas es un
 *     polígono y se reconstruye. Se descartaba entero por «no poligonal»
 *     mientras las cuatro LINE que el remitente dibujó encima sí entraban: el
 *     documento tenía la forma y no el relleno.
 *
 * Módulo sin estado y sin DOM.
 */
import type {
  CadDxfHatch,
  CadDxfImportWarning,
  CadDxfPoint,
} from "./dxf-import";
import { dxfPairsInEntitiesSection, num, rawDxfPairs } from "./dxf-read-core";

/** El mismo tope que el resto de escaneos crudos: un fichero hostil no cuelga. */
const MAX_DXF_ENTITIES = 50000;
/** La capa `0`, la que el formato da por defecto cuando la entidad no dice otra. */
const DEFAULT_LAYER = "0";

export function parseRawDxfHatches(text: string): {
  hatches: CadDxfHatch[];
  warnings: CadDxfImportWarning[];
} {
  const pairs = rawDxfPairs(text);
  // El mismo ámbito que el escaneo hermano de MTEXT, y por el mismo motivo.
  // Aquí el cambio es PREVENTIVO y conviene decirlo así: ningún fichero del
  // corpus ajeno trae un HATCH dentro de un bloque, así que no corrige un
  // defecto medido — se pide por simetría, para que el día que llegue uno no
  // salga al espacio modelo con las coordenadas del bloque.
  const inEntities = dxfPairsInEntitiesSection(pairs);
  const hatches: CadDxfHatch[] = [];
  const warnings: CadDxfImportWarning[] = [];
  let scannedHatches = 0;
  for (let start = 0; start < pairs.length && scannedHatches < MAX_DXF_ENTITIES; start += 1) {
    if (pairs[start].code !== 0 || pairs[start].value.toUpperCase() !== "HATCH") continue;
    if (!inEntities[start]) continue;
    scannedHatches += 1;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const first = (code: number) => entityPairs.find((pair) => pair.code === code)?.value;
    const layer = first(8) || DEFAULT_LAYER;
    const pattern = first(2) || "SOLID";
    const solid = Number(first(70) ?? 0) === 1 || pattern.toUpperCase() === "SOLID";
    const scale = num(first(41));
    const angle = num(first(52));
    const islandCode = Number(first(75) ?? 0);
    const islandStyle: CadDxfHatch["islandStyle"] = islandCode === 1 ? "outer" : islandCode === 2 ? "ignore" : "normal";
    const seedCountIndex = entityPairs.findIndex((pair) => pair.code === 98);
    const seedX = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 10)?.value)
      : null;
    const seedY = seedCountIndex >= 0
      ? num(entityPairs.find((pair, index) => index > seedCountIndex && pair.code === 20)?.value)
      : null;
    const patternOriginX = num(first(43));
    const patternOriginY = num(first(44));
    const origin = seedX !== null && seedY !== null
      ? { x: seedX, y: seedY }
      : patternOriginX !== null && patternOriginY !== null
        ? { x: patternOriginX, y: patternOriginY }
        : undefined;
    const paperSpace = first(67) === "1";
    const boundaries: CadDxfPoint[][] = [];
    let unsupportedEdgePath = false;
    for (let cursor = 0; cursor < entityPairs.length; cursor += 1) {
      if (entityPairs[cursor].code !== 92) continue;
      const pathFlags = Number(entityPairs[cursor].value) || 0;
      const nextPath = entityPairs.findIndex((pair, index) => index > cursor && pair.code === 92);
      const pathEnd = nextPath >= 0 ? nextPath : entityPairs.length;
      if ((pathFlags & 2) === 0) {
        // RUTA DE ARISTAS (el bit 2 dice «polilínea»; sin él, el contorno viene
        // arista a arista). Si TODAS son rectas —código 72 igual a 1— el
        // contorno es un polígono y sus vértices son el inicio de cada arista:
        // no hace falta saber de curvas para reconstruirlo.
        //
        // Medido sobre `bjnortier-dxf/hatches.dxf`: su contorno son cuatro
        // aristas rectas, un cuadrado de 100 × 100, y se descartaba entero. El
        // detalle que lo hacía incómodo es que las cuatro LINE que el remitente
        // dibujó ENCIMA del sombreado sí entraban, y son exactamente el mismo
        // cuadrado: el documento tenía la forma y no tenía el relleno.
        //
        // Un contorno con arcos, elipses o splines sigue sin entrar y se sigue
        // declarando igual que hasta hoy. Esto no tesela curvas: deja de tirar
        // los polígonos.
        const aristas: CadDxfPoint[] = [];
        let todasRectas = true;
        for (let index = cursor + 1; index < pathEnd; index += 1) {
          const pair = entityPairs[index];
          if (pair.code === 72 && Number(pair.value) !== 1) {
            todasRectas = false;
            break;
          }
          if (pair.code === 10) {
            const px = num(pair.value);
            const siguiente = entityPairs[index + 1];
            const py = siguiente?.code === 20 ? num(siguiente.value) : null;
            if (px !== null && py !== null) aristas.push({ x: px, y: py });
          }
        }
        if (todasRectas && aristas.length >= 3) boundaries.push(aristas);
        else unsupportedEdgePath = true;
        cursor = pathEnd - 1;
        continue;
      }
      const countIndex = entityPairs.findIndex((pair, index) => index > cursor && index < pathEnd && pair.code === 93);
      const vertexCount = countIndex >= 0 ? Number(entityPairs[countIndex].value) : 0;
      const boundary: CadDxfPoint[] = [];
      let pendingX: number | null = null;
      for (let index = countIndex + 1; index < pathEnd && boundary.length < vertexCount; index += 1) {
        const pair = entityPairs[index];
        if (pair.code === 10) pendingX = num(pair.value);
        else if (pair.code === 20 && pendingX !== null) {
          const y = num(pair.value);
          if (y !== null) boundary.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      if (boundary.length >= 3) boundaries.push(boundary);
      cursor = pathEnd - 1;
    }
    if (boundaries.length) {
      hatches.push({
        layer,
        pattern,
        solid,
        boundaries,
        ...(scale !== null && scale > 0 ? { scale } : {}),
        ...(angle !== null ? { angle } : {}),
        ...(origin ? { origin } : {}),
        islandStyle,
        ...(paperSpace ? { paperSpace } : {}),
      });
      if (unsupportedEdgePath)
        warnings.push({
          code: "hatch_edge_path_partial",
          message: "HATCH conserva sus contornos poligonales; un contorno curvo no soportado fue omitido.",
          entityType: "HATCH",
          layer,
        });
    } else {
      warnings.push({
        code: "hatch_unsupported_boundary",
        message: "HATCH sin contorno poligonal compatible; no se importó el relleno.",
        entityType: "HATCH",
        layer,
      });
    }
    start = end - 1;
  }
  return { hatches, warnings };
}
