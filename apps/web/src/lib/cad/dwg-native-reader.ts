/**
 * El ÚNICO punto del producto que importa el códec DWG propio en runtime.
 *
 * Autorizado por la firma del dueño de 2026-08-24 (`docs/adr/0009-dwg-promotion-package.md`
 * §6-bis, ampliada §6-ter), acotada al perfil `AC1015_MODELSPACE_2D_V2`:
 * importación únicamente, AC1015 (AutoCAD 2000), model space 2D.
 * `scripts/dwg/check-product-boundary.mjs` verifica que ningún otro archivo
 * de `apps/web` ni `apps/api` referencie `@valle-design/dwg-codec` — este
 * archivo es la excepción nombrada, y sólo el worker de importación
 * (`document-import.worker.ts`) lo consume. Ningún componente de React lo
 * importa, directa ni transitivamente.
 *
 * QUÉ HACE Y QUÉ NO. Llama al lector real (`readDwg`) y estrecha su base de
 * datos de 33 tipos de entidad decodificados al perfil que la beta V2
 * declara soportado (LINE, POINT, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT,
 * ELLIPSE, SPLINE no racional de escenario 1) — el mismo conjunto que
 * `dwg-neutral-model.ts` modela y `dwg-document-bridge.ts` sabe proyectar al
 * documento canónico. Una entidad que el laboratorio SÍ decodifica (MTEXT,
 * DIMENSION, HATCH, spline racional o de puntos de ajuste, …) pero que el
 * perfil V2 no cubre NO se cuenta como «no decodificada»: sería falso, el
 * laboratorio la leyó. Se declara aparte, en diagnósticos, con su propio
 * código y razón — fuera de perfil, no fuera de alcance del decodificador.
 *
 * Sólo AC1015 pasa. Otra firma reconocida (AC1018 incluido, que el
 * laboratorio también lee) se rechaza con un error tipado que nombra la
 * versión detectada: anunciarla aquí adelantaría una promoción que ADR-0009
 * no ha hecho para ese perfil. AC1018 tiene su propio hito (M3) y su propio
 * flag cuando llegue.
 */
import {
  probeDwg,
  readDwg,
  type DwgDatabase,
  type DwgDatabaseBlock,
  type DwgDatabaseEntityRecord,
  type DwgGeometryEntity,
} from "@valle-design/dwg-codec";
import type {
  DwgNeutralBlock,
  DwgNeutralDatabase,
  DwgNeutralDiagnostic,
  DwgNeutralEntityRecord,
  DwgNeutralGeometry,
  DwgNeutralLayer,
} from "./dwg-neutral-model";

/** Las entidades del perfil `AC1015_MODELSPACE_2D_V2`. */
const BETA_PROFILE_ENTITY_KINDS = new Set<DwgGeometryEntity["kind"]>([
  "line",
  "point",
  "circle",
  "arc",
  "lwpolyline",
  "text",
  "insert",
  "ellipse",
  "spline",
]);

/**
 * Estrecha una entidad ya decodificada al subconjunto del perfil V2.
 *
 * Los tipos del perfil son estructuralmente idénticos entre el modelo del
 * laboratorio y el espejo del producto (mismos campos, mismo nombre): no hay
 * conversión que hacer, sólo un filtro tipado. `null` = fuera de perfil.
 *
 * SPLINE es la excepción: sólo el escenario 1 (nudos + puntos de control) NO
 * racional entra, porque es lo único que la primitiva canónica de destino
 * sabe representar hoy (`CadDxfPrimitive` no lleva pesos ni puntos de
 * ajuste). Un fit-spline o una spline racional SÍ las decodifica el
 * laboratorio — por eso caen a "fuera de perfil", nunca a "no decodificado".
 */
function toBetaProfileGeometry(entity: DwgGeometryEntity): DwgNeutralGeometry | null {
  if (!BETA_PROFILE_ENTITY_KINDS.has(entity.kind)) return null;
  switch (entity.kind) {
    case "line":
    case "point":
    case "circle":
    case "arc":
    case "lwpolyline":
    case "text":
    case "insert":
    case "ellipse":
      return entity;
    case "spline":
      return entity.scenario === 1 && entity.rational !== true ? entity : null;
    default:
      return null;
  }
}

function outOfProfileDiagnostic(handle: number, kind: string): DwgNeutralDiagnostic {
  return {
    code: "dwg_beta_profile_entity_excluded",
    severity: "info",
    offset: handle,
    message:
      `Entidad "${kind}" (handle 0x${handle.toString(16)}) decodificada por el ` +
      `laboratorio pero fuera del perfil AC1015_MODELSPACE_2D_V2 de esta beta; ` +
      "no se importa en este release.",
  };
}

function toBetaProfileRecord(
  record: DwgDatabaseEntityRecord,
  diagnostics: DwgNeutralDiagnostic[],
): DwgNeutralEntityRecord | null {
  const geometry = toBetaProfileGeometry(record.entity);
  if (geometry === null) {
    diagnostics.push(outOfProfileDiagnostic(record.handle, record.entity.kind));
    return null;
  }
  return {
    handle: record.handle,
    entity: geometry,
    layerHandle: record.layerHandle,
    insertedBlockName: record.insertedBlockName,
  };
}

function toBetaProfileBlock(
  block: DwgDatabaseBlock,
  diagnostics: DwgNeutralDiagnostic[],
): DwgNeutralBlock {
  const entities: DwgNeutralEntityRecord[] = [];
  for (const record of block.entities) {
    const mapped = toBetaProfileRecord(record, diagnostics);
    if (mapped !== null) entities.push(mapped);
  }
  return {
    handle: block.handle,
    name: block.name,
    blockBeginHandle: block.blockBeginHandle,
    blockEndHandle: block.blockEndHandle,
    entities,
  };
}

const toBetaProfileLayer = (layer: DwgDatabase["layers"][number]): DwgNeutralLayer => ({
  handle: layer.handle,
  name: layer.name,
  colorIndex: layer.colorIndex,
  stateFlags: layer.stateFlags,
});

/**
 * Lo único de `DwgDatabase` que este módulo lee. Un `Pick` en vez del tipo
 * completo: la base real del laboratorio también trae `tables`,
 * `dictionaries` y `classMap` (fase D5), que el perfil V1 no proyecta —
 * exigirlos aquí sería acoplarse a campos que esta función nunca toca, y
 * fabricarlos en una prueba sería ruido sin señal.
 */
type DwgDatabaseSlice = Pick<
  DwgDatabase,
  "layers" | "blocks" | "modelSpaceEntities" | "unsupported" | "diagnostics"
>;

/**
 * Estrecha la base neutral completa del laboratorio al perfil V1. Función
 * pura: la misma base de entrada produce siempre la misma base de salida.
 */
export function toBetaProfileDatabase(database: DwgDatabaseSlice): DwgNeutralDatabase {
  const diagnostics: DwgNeutralDiagnostic[] = [...database.diagnostics];
  const modelSpaceEntities: DwgNeutralEntityRecord[] = [];
  for (const record of database.modelSpaceEntities) {
    const mapped = toBetaProfileRecord(record, diagnostics);
    if (mapped !== null) modelSpaceEntities.push(mapped);
  }
  return {
    layers: database.layers.map(toBetaProfileLayer),
    blocks: database.blocks.map((block) => toBetaProfileBlock(block, diagnostics)),
    modelSpaceEntities,
    unsupported: database.unsupported.map((object) => ({
      handle: object.handle,
      type: object.type,
    })),
    diagnostics,
  };
}

/**
 * Lee bytes DWG hostiles y devuelve la base neutral del perfil V1, o falla
 * tipado y en español. Ésta es la función que se registra como
 * `DwgNeutralDatabaseReader` (`dwg-neutral-model.ts`) en el worker.
 *
 * Sólo AC1015. Se prueba la firma ANTES de decodificar para poder nombrar la
 * versión detectada en el mensaje de error — «archivo corrupto» y «versión
 * no soportada en esta beta» son cosas distintas y el usuario tiene que poder
 * distinguirlas.
 */
export function readDwgNeutralDatabase(bytes: Uint8Array): DwgNeutralDatabase {
  const probe = probeDwg(bytes);
  if (!probe.ok || probe.probe === null) {
    throw new Error(
      "El archivo no se reconoce como DWG (firma inválida o archivo truncado). " +
        "Verifica que sea un .dwg y vuelve a intentarlo.",
    );
  }
  if (probe.probe.versionKind !== "known") {
    throw new Error(
      `El archivo declara la firma "${probe.probe.signature}", que no corresponde ` +
        "a ninguna versión de AutoCAD reconocida.",
    );
  }
  if (probe.probe.version.code !== "AC1015") {
    throw new Error(
      `Se detectó un DWG de AutoCAD ${probe.probe.version.label} (${probe.probe.version.code}). ` +
        "Esta beta sólo lee AutoCAD 2000 (AC1015). Guarda el archivo como 2000 desde tu " +
        "CAD, o expórtalo a DXF e impórtalo: DXF entra completo, con su informe de pérdidas.",
    );
  }
  let database: DwgDatabase;
  try {
    database = readDwg(bytes);
  } catch (error) {
    throw new Error(
      "El archivo se reconoce como AC1015 pero su estructura interna no se pudo leer " +
        `(${error instanceof Error ? error.message : "error desconocido"}). El archivo ` +
        "puede estar dañado o usar una característica que este perfil de beta no cubre.",
    );
  }
  return toBetaProfileDatabase(database);
}
