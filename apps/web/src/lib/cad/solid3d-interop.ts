/**
 * STEP e IGES: la puerta por la que un sólido entra y sale del producto.
 *
 * Los dos escritores y los dos lectores ya existían en `lib/brep/`, completos y
 * con su spec de ida y vuelta. Lo que faltaba —y es todo lo que hay aquí— es la
 * conversión entre un archivo y una ENTIDAD del documento: qué nodo de árbol de
 * construcción representa un sólido importado, y qué cuerpo se escribe al
 * exportar uno cuya receta vive en nodos.
 *
 * ## Un sólido importado entra como nodo `brep`
 *
 * Un archivo STEP trae vértices y caras, no la historia de cómo se hicieron: esa
 * información no está en el formato. Fingir una receta —«esto parece una
 * extrusión»— sería inventar. El nodo `brep` guarda la geometría explícita y
 * anota su procedencia, así que el sólido importado se puede mover, restar,
 * redondear y volver a exportar como cualquier otro; lo único que no se puede es
 * reeditar un parámetro que nunca existió.
 *
 * ## Al exportar se escribe el cuerpo COLOCADO
 *
 * `solid3dBody` devuelve el sólido con su `placement` ya aplicado, así que el
 * archivo lleva la pieza donde está en el dibujo y no donde se construyó. Es lo
 * que espera quien abra el STEP en otro programa, y además hace que la ida y
 * vuelta conserve la posición además del volumen.
 *
 * ## Marca de tiempo
 *
 * Se EXIGE desde fuera y no se toma del reloj. Un exportador que mira la hora
 * produce archivos distintos en cada corrida, y con eso se pierde la comparación
 * byte a byte —que es la única forma barata de detectar que un cambio en el
 * kernel movió una coordenada.
 */
import {
  exportIges,
  exportStep,
  importIges,
  importStep,
  stepExportBlockers,
  validateBody,
  type BrepBody,
} from "../brep";
import type { CadSolid3dEntity } from "./cad-entities-v5";
import { bodyToSolidNode, solid3dBody } from "./solid3d-build";

export type CadSolidInteropFormat = "step" | "iges";

/** Marca de tiempo neutra por defecto: un archivo reproducible. */
export const CAD_INTEROP_EPOCH = "1970-01-01T00:00:00";

export interface CadSolidExportOptions {
  format: CadSolidInteropFormat;
  /** ISO 8601 para STEP, `YYYYMMDD.HHNNSS` para IGES. */
  timestamp?: string;
  name?: string;
  author?: string;
  organization?: string;
}

/**
 * Escribe UN sólido del documento como texto STEP o IGES.
 *
 * Lanza si el cuerpo tiene algo que el formato no sabe expresar; `stepExportBlockers`
 * lo dice cara a cara en vez de escribir un archivo que el receptor rechazará.
 */
export function exportSolidEntity(entity: CadSolid3dEntity, options: CadSolidExportOptions): string {
  const body = solid3dBody(entity);
  const name = options.name ?? entity.name ?? entity.id;
  if (options.format === "iges")
    return exportIges(body, {
      name: name.slice(0, 64),
      timestamp: options.timestamp,
      author: options.author,
      organization: options.organization,
    });
  const blockers = stepExportBlockers(body);
  if (blockers.length > 0)
    throw new Error(`El sólido ${entity.id} no se puede escribir en STEP: ${blockers.join(" · ")}`);
  return exportStep(body, {
    name: name.replace(/\s+/g, "_").slice(0, 64),
    timestamp: options.timestamp ?? CAD_INTEROP_EPOCH,
    author: options.author,
    organization: options.organization,
  });
}

export interface CadSolidImportResult {
  entity: CadSolid3dEntity;
  format: CadSolidInteropFormat;
  /** Nombre de los sólidos hallados en el archivo, si el formato los nombra. */
  names: string[];
  faces: number;
}

/**
 * Reconstruye un SOLID3D desde el texto de un archivo.
 *
 * El formato se DETECTA por la cabecera —`ISO-10303-21` para STEP— en vez de
 * pedírselo al usuario, porque el usuario ya lo dijo al elegir el archivo y
 * volver a preguntarlo sólo crea la ocasión de equivocarse. Un texto que no es
 * ninguno de los dos se rechaza con su motivo.
 */
export function importSolidEntity(
  text: string,
  options: { id: string; layer: string; name?: string; tolerance?: number },
): CadSolidImportResult {
  const format = detectInteropFormat(text);
  if (!format)
    throw new Error(
      "El texto no parece ni un STEP (`ISO-10303-21`) ni un IGES (registros `S`/`G`/`D`/`P`).",
    );
  const tolerance = options.tolerance ?? 1e-7;
  let body: BrepBody;
  let names: string[] = [];
  let faces = 0;
  if (format === "step") {
    const result = importStep(text, tolerance);
    body = result.body;
    names = result.solids;
    faces = result.body.faces.length;
  } else {
    const result = importIges(text, tolerance);
    body = result.body;
    faces = result.faces;
  }

  // Se valida ANTES de meterlo en el documento. Un archivo de otro programa
  // puede traer una cáscara abierta perfectamente legal para él y que aquí sería
  // un sólido que revienta en la primera booleana; decirlo ahora es lo que
  // separa «este archivo no vale» de «el CAD se rompió al restar».
  const report = validateBody(body, { requireClosed: true });
  if (!report.ok)
    throw new Error(
      `El archivo ${format.toUpperCase()} no describe un sólido cerrado y válido: ` +
        report.violations.slice(0, 3).map((violation) => violation.message).join(" · "),
    );

  return {
    format,
    names,
    faces,
    entity: {
      id: options.id,
      type: "solid3d",
      nodes: [bodyToSolidNode(body, "importado", { format, name: names[0] ?? options.name })],
      root: "importado",
      layer: options.layer,
      ...(options.name ? { name: options.name } : names[0] ? { name: names[0] } : {}),
    },
  };
}

/** `"step"`, `"iges"` o `null` si el texto no es ninguno de los dos. */
export function detectInteropFormat(text: string): CadSolidInteropFormat | null {
  const head = text.slice(0, 4_096);
  if (/ISO-10303-21/.test(head)) return "step";
  // Un IGES tiene la columna 73 marcada con la letra de sección. Se busca una
  // línea de start (`S`) o global (`G`), que son las dos primeras del archivo.
  if (/^.{72}[SG]\s*\d*\s*$/m.test(head)) return "iges";
  return null;
}
