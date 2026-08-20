import { isDxfXdataApp } from "@valle-design/contracts";
import { rawDxfPairs } from "./dxf-read-core";

/**
 * Lectura del XDATA propio con el que viajan los bloques y sus atributos.
 *
 * Sale del lector de DXF por el presupuesto de monolito: ese archivo estaba en
 * su techo y sólo puede encoger, así que el código nuevo se muda a un módulo
 * aparte en vez de subirle el techo. Y encaja bien aquí: esto no interpreta
 * geometría, interpreta METADATOS nuestros incrustados en un archivo ajeno,
 * que es un trabajo distinto con reglas distintas.
 *
 * Todo lo que se lee aquí es texto de un archivo de terceros, así que nada se
 * da por bueno: un XDATA que no sea nuestro se ignora en silencio en vez de
 * hacer fallar la importación entera del dibujo del cliente.
 */
export interface RawBlockXdata {
  definitions: Map<string, Map<string, string>>;
  insertAttributes: Map<string, Array<Record<string, string>>>;
}

/**
 * Un valor mal codificado no puede tumbar la importación: si no decodifica, se
 * devuelve tal cual. El nombre del bloque de un cliente vale más crudo que
 * perdido.
 */
export function decodeComponent(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? "");
  } catch {
    return value ?? "";
  }
}

/**
 * Firma posicional de una inserción. El XDATA no puede apuntar a un
 * identificador estable —el archivo viene de otro CAD—, así que la inserción se
 * reconoce por su nombre y su sitio, con precisión fija para que dos lecturas
 * del mismo archivo produzcan la misma clave.
 */
export function insertSignature(
  name: string,
  x: number,
  y: number,
  rotation: number,
): string {
  return `${name}|${x.toFixed(9)}|${y.toFixed(9)}|${rotation.toFixed(9)}`;
}

export function parseRawBlockXdata(text: string): RawBlockXdata {
  const pairs = rawDxfPairs(text);
  const definitions = new Map<string, Map<string, string>>();
  const insertAttributes = new Map<string, Array<Record<string, string>>>();
  for (let start = 0; start < pairs.length; start += 1) {
    const kind = pairs[start].code === 0 ? pairs[start].value.toUpperCase() : "";
    if (kind !== "BLOCK" && kind !== "INSERT") continue;
    let end = start + 1;
    while (end < pairs.length && pairs[end].code !== 0) end += 1;
    const entityPairs = pairs.slice(start + 1, end);
    const application = entityPairs.findIndex(
      (pair) => pair.code === 1001 && isDxfXdataApp("block", pair.value),
    );
    if (application < 0) {
      start = end - 1;
      continue;
    }
    const first = (code: number) =>
      entityPairs.find((pair) => pair.code === code)?.value;
    const metadata = entityPairs
      .slice(application + 1)
      .filter((pair) => pair.code === 1000)
      .map((pair) => pair.value);
    if (kind === "BLOCK") {
      const name = first(2) ?? "";
      const values = new Map<string, string>();
      metadata.forEach((entry) => {
        const separator = entry.indexOf("=");
        if (separator > 0)
          values.set(entry.slice(0, separator), entry.slice(separator + 1));
      });
      if (name) definitions.set(name, values);
    } else {
      const attributes: Record<string, string> = {};
      metadata
        .filter((entry) => entry.startsWith("attribute="))
        .forEach((entry) => {
          const [tag, ...value] = entry.slice("attribute=".length).split(",");
          if (tag) attributes[decodeComponent(tag)] = decodeComponent(value.join(","));
        });
      const signature = insertSignature(
        first(2) ?? "",
        Number(first(10) ?? 0) || 0,
        Number(first(20) ?? 0) || 0,
        Number(first(50) ?? 0) || 0,
      );
      const queue = insertAttributes.get(signature) ?? [];
      queue.push(attributes);
      insertAttributes.set(signature, queue);
    }
    start = end - 1;
  }
  return { definitions, insertAttributes };
}
