/**
 * El ÚNICO punto del producto que importa el códec DWG propio en runtime.
 *
 * Autorizado por la firma del dueño de 2026-08-24 (`docs/adr/0009-dwg-promotion-package.md`
 * §6-bis, ampliada §6-ter y §6-quater), acotada al perfil
 * `AC1015_MODELSPACE_2D_V3`: importación únicamente, model space 2D.
 * `scripts/dwg/check-product-boundary.mjs` verifica que ningún otro archivo
 * de `apps/web` ni `apps/api` referencie `@valle-design/dwg-codec` — este
 * archivo es la excepción nombrada, y sólo el worker de importación
 * (`document-import.worker.ts`) lo consume. Ningún componente de React lo
 * importa, directa ni transitivamente.
 *
 * QUÉ HACE Y QUÉ NO. Llama al lector real (`readDwg`) y estrecha su base de
 * datos de 33 tipos de entidad decodificados al perfil que la beta V3
 * declara soportado (LINE, POINT, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT,
 * ELLIPSE, SPLINE no racional de escenario 1, MTEXT, DIMENSION salvo
 * angular de dos líneas, HATCH de contorno poligonal) — el mismo conjunto
 * que `dwg-neutral-model.ts` modela y `dwg-document-bridge.ts` sabe
 * proyectar al documento canónico. Una entidad que el laboratorio SÍ
 * decodifica (spline racional o de puntos de ajuste, cota angular de dos
 * líneas, contorno de HATCH curvo, …) pero que el perfil V3 no cubre NO se
 * cuenta como «no decodificada»: sería falso, el laboratorio la leyó. Se
 * declara aparte, en diagnósticos, con su propio código y razón — fuera de
 * perfil, no fuera de alcance del decodificador. MTEXT y DIMENSION y HATCH
 * sólo se proyectan en MODEL SPACE: dentro de un bloque caen al mismo
 * diagnóstico genérico que cualquier entidad sin primitiva, porque el
 * modelo de bloques del producto tampoco las admite hoy para DXF.
 *
 * VERSIÓN: AC1015 siempre pasa. AC1018 (2004) pasa TAMBIÉN cuando quien
 * llama pide `allowAc1018: true` — su propio hito (M3), su propio flag
 * (`dwgAc1018BetaImportIsEnabled`, ADR-0009 §7), NUNCA una ampliación
 * silenciosa del gate de V3. El perfil de entidades es el mismo para las
 * dos firmas: `readDwg` ya devuelve la misma forma de base neutral para
 * AC1015 y AC1018 (confirmado en `packages/dwg-codec/src/api/read.ts`), así
 * que nada de este archivo por debajo de la versión distingue una de otra.
 * Cualquier OTRA firma reconocida (AC1021, la familia 2010+) se rechaza con
 * un error tipado que nombra la versión detectada: anunciarla aquí
 * adelantaría una promoción que ADR-0009 no ha hecho para ese perfil.
 */
import {
  probeDwg,
  readDwg,
  type DwgDatabase,
  type DwgDatabaseBlock,
  type DwgDatabaseEntityRecord,
  type DwgError,
  type DwgErrorCode,
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

/** Las entidades del perfil `AC1015_MODELSPACE_2D_V3`. */
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
  "mtext",
  "dimension",
  "hatch",
]);

/**
 * Estrecha una entidad ya decodificada al subconjunto del perfil V3.
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
 *
 * DIMENSION tiene su propia excepción: la angular DE DOS LÍNEAS necesitaría
 * intersecar dos rectas para hallar el vértice, y un par casi paralelo la
 * manda al infinito sin que nada falle — el mismo riesgo por el que
 * `dxf-read-foreign-dimensions.ts` ya declina esa variante para cotas DXF
 * ajenas. Las otras seis variantes SÍ entran: el puente porta esa misma
 * reconstrucción por puntos.
 *
 * HATCH entra siempre a este filtro: un HATCH puede traer una mezcla de
 * caminos poligonales (proyectables) y curvos (no); decidir camino por
 * camino es trabajo del puente, no de este filtro por tipo.
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
    case "mtext":
    case "hatch":
      return entity;
    case "spline":
      return entity.scenario === 1 && entity.rational !== true ? entity : null;
    case "dimension":
      return entity.dimensionKind !== "angular2ln" ? entity : null;
    default:
      return null;
  }
}

function outOfProfileDiagnostic(handle: number, kind: string, profile: string): DwgNeutralDiagnostic {
  return {
    code: "dwg_beta_profile_entity_excluded",
    severity: "info",
    offset: handle,
    message:
      `Entidad "${kind}" (handle 0x${handle.toString(16)}) decodificada por el ` +
      `laboratorio pero fuera del perfil ${profile} de esta beta; ` +
      "no se importa en este release.",
  };
}

// ---------------------------------------------------------------------------
// Perfil 3D heredado (AC1015_3D_WIREFRAME_V1) — 3DFACE, POLYLINE 3D, POLYLINE
// MESH, POLYLINE PFACE. PROPUESTO en ADR-0009 §9, SIN FIRMA todavía
// (`dwg-interop-flag.ts`): `allow3dWireframe` puede pasarse en cualquier
// entorno de prueba, pero en el worker del producto sólo llega en `true`
// cuando `dwg3dWireframeBetaImportIsEnabled` ya dijo que sí, y esa función
// siempre devuelve `false` mientras `DWG_3D_WIREFRAME_BETA_AUTHORIZATION.
// ownerSigned` sea `false`.
//
// Las cuatro cabeceras son entidades 3D REALES (WCS): a diferencia de
// CIRCLE/LWPOLYLINE/TEXT, el laboratorio no les decodifica `elevation` ni
// `extrusion` porque el formato no las tiene — sus puntos ya son 3D directos,
// hecho confirmado leyendo `entity-geometry.ts` del laboratorio antes de
// escribir este filtro. No hace falta ningún álgebra de eje arbitrario aquí;
// la trampa de OCS que sí aplica a CIRCLE/LWPOLYLINE con extrusión no aplica
// a estas cuatro.
// ---------------------------------------------------------------------------

function toWireframe3dProfileGeometry(entity: DwgGeometryEntity): DwgNeutralGeometry | null {
  switch (entity.kind) {
    case "face3d":
    case "polyline3d":
    case "polymesh":
    case "polyfaceMesh":
      return entity;
    default:
      return null;
  }
}

/**
 * Un hijo VERTEX/cara de una cabecera del perfil 3D heredado
 * (`record.vertices` del laboratorio). No pasa por `toWireframe3dProfileGeometry`:
 * ese filtro decide qué entra como entidad de NIVEL SUPERIOR, y un VERTEX/cara
 * nunca lo es — vive colgado de su cabecera, igual que un ATTRIB de un INSERT.
 */
function toWireframe3dChildRecord(
  record: DwgDatabaseEntityRecord,
): DwgNeutralEntityRecord | null {
  switch (record.entity.kind) {
    case "vertex3d":
    case "vertexMesh":
    case "vertexPface":
    case "pfaceFace":
      return {
        handle: record.handle,
        entity: record.entity,
        layerHandle: record.layerHandle,
        insertedBlockName: undefined,
        attributes: undefined,
        // Un VERTEX/cara nunca es propietario de otra secuencia.
        vertices: undefined,
      };
    default:
      return null;
  }
}

/**
 * Un ATTRIB atado a un INSERT (`record.attributes` del laboratorio). No pasa
 * por `toBetaProfileGeometry`: ese filtro decide qué entra como entidad de
 * NIVEL SUPERIOR del perfil V3, y un ATTRIB nunca lo es — vive colgado de un
 * INSERT que ya está en perfil, igual que `insertedBlockName`.
 *
 * El ensamblado del laboratorio (`pendingSequenceMembers` en
 * `database-assembly.ts`) sólo ata AC1015_TYPE_ATTRIB a `attributes`: este
 * miembro siempre decodifica a `kind: "attrib"`. Se comprueba en vez de
 * forzarlo con un `as`, para que un cambio futuro en esa garantía no cuele un
 * tipo ajeno en silencio.
 */
function toBetaProfileAttributeRecord(
  record: DwgDatabaseEntityRecord,
): DwgNeutralEntityRecord | null {
  if (record.entity.kind !== "attrib") return null;
  return {
    handle: record.handle,
    entity: record.entity,
    layerHandle: record.layerHandle,
    insertedBlockName: undefined,
    // Un ATTRIB nunca es propietario de otra secuencia (sólo un INSERT lo
    // es): siempre llega sin atributos propios.
    attributes: undefined,
    vertices: undefined,
  };
}

/**
 * Estrecha una entidad al perfil V3 y, si no entra ahí, intenta el perfil 3D
 * heredado propuesto (`allow3dWireframe`) ANTES de declararla fuera de
 * perfil. Los dos perfiles son conjuntos de tipos disjuntos —V3 nunca
 * contiene face3d/polyline3d/polymesh/polyfaceMesh y el perfil 3D nunca
 * contiene los doce tipos de V3—, así que el orden no puede colar una
 * entidad por el perfil equivocado.
 */
function toProductProfileRecord(
  record: DwgDatabaseEntityRecord,
  diagnostics: DwgNeutralDiagnostic[],
  allow3dWireframe: boolean,
): DwgNeutralEntityRecord | null {
  const v3Geometry = toBetaProfileGeometry(record.entity);
  if (v3Geometry !== null) {
    const attributes = record.attributes
      ?.map(toBetaProfileAttributeRecord)
      .filter((attribute): attribute is DwgNeutralEntityRecord => attribute !== null);
    return {
      handle: record.handle,
      entity: v3Geometry,
      layerHandle: record.layerHandle,
      insertedBlockName: record.insertedBlockName,
      attributes: attributes !== undefined && attributes.length > 0 ? attributes : undefined,
      vertices: undefined,
    };
  }
  if (allow3dWireframe) {
    const wireframeGeometry = toWireframe3dProfileGeometry(record.entity);
    if (wireframeGeometry !== null) {
      const vertices = record.vertices
        ?.map(toWireframe3dChildRecord)
        .filter((child): child is DwgNeutralEntityRecord => child !== null);
      return {
        handle: record.handle,
        entity: wireframeGeometry,
        layerHandle: record.layerHandle,
        insertedBlockName: undefined,
        attributes: undefined,
        vertices: vertices !== undefined && vertices.length > 0 ? vertices : undefined,
      };
    }
  }
  diagnostics.push(
    outOfProfileDiagnostic(
      record.handle,
      record.entity.kind,
      allow3dWireframe ? "AC1015_MODELSPACE_2D_V3 / AC1015_3D_WIREFRAME_V1" : "AC1015_MODELSPACE_2D_V3",
    ),
  );
  return null;
}

function toProductProfileBlock(
  block: DwgDatabaseBlock,
  diagnostics: DwgNeutralDiagnostic[],
  allow3dWireframe: boolean,
): DwgNeutralBlock {
  const entities: DwgNeutralEntityRecord[] = [];
  for (const record of block.entities) {
    const mapped = toProductProfileRecord(record, diagnostics, allow3dWireframe);
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

// El estado de capa llega YA interpretado del códec —congelada es el bit 0 y
// bloqueada el bit 3, medidos contra el oráculo DXF— y aquí sólo se proyecta.
// El adaptador NO descifra el `BS`: un segundo criterio en el producto es
// exactamente la divergencia silenciosa que ningún gate vería.
const toBetaProfileLayer = (layer: DwgDatabase["layers"][number]): DwgNeutralLayer => ({
  handle: layer.handle,
  name: layer.name,
  colorIndex: layer.colorIndex,
  stateFlags: layer.stateFlags,
  frozen: layer.frozen,
  locked: layer.locked,
  unmeasuredStateBits: layer.unmeasuredStateBits,
  linetypeName: layer.linetypeName,
});

/**
 * Lo único de `DwgDatabase` que este módulo lee. Un `Pick` en vez del tipo
 * completo: la base real del laboratorio también trae `tables`,
 * `dictionaries` y `classMap` (fase D5), que el perfil V3 no proyecta —
 * exigirlos aquí sería acoplarse a campos que esta función nunca toca, y
 * fabricarlos en una prueba sería ruido sin señal.
 */
type DwgDatabaseSlice = Pick<
  DwgDatabase,
  "layers" | "blocks" | "modelSpaceEntities" | "insunits" | "unsupported" | "diagnostics"
>;

export interface DwgProductProfileOptions {
  /**
   * Perfil 3D heredado propuesto (`AC1015_3D_WIREFRAME_V1`, ADR-0009 §9):
   * 3DFACE, POLYLINE 3D, POLYLINE MESH, POLYLINE PFACE. `false`/`undefined`
   * reproduce EXACTAMENTE el comportamiento de siempre — sólo V3 — porque
   * `BETA_PROFILE_ENTITY_KINDS` (el conjunto de tipos de V3) no se toca ni un
   * bit por esta opción: es un perfil independiente, no una ampliación.
   */
  readonly allow3dWireframe?: boolean;
}

/**
 * Estrecha la base neutral completa del laboratorio al perfil (o perfiles)
 * que el llamador autoriza. Función pura: la misma base de entrada y las
 * mismas opciones producen siempre la misma base de salida.
 *
 * Sin `options` (o con `allow3dWireframe` ausente/`false`) es BYTE A BYTE el
 * mismo comportamiento que antes de que existiera esta opción: todas las
 * llamadas existentes (specs incluidas) siguen viendo sólo el perfil V3.
 */
export function toBetaProfileDatabase(
  database: DwgDatabaseSlice,
  options: DwgProductProfileOptions = {},
): DwgNeutralDatabase {
  const allow3dWireframe = options.allow3dWireframe === true;
  const diagnostics: DwgNeutralDiagnostic[] = [...database.diagnostics];
  const modelSpaceEntities: DwgNeutralEntityRecord[] = [];
  for (const record of database.modelSpaceEntities) {
    const mapped = toProductProfileRecord(record, diagnostics, allow3dWireframe);
    if (mapped !== null) modelSpaceEntities.push(mapped);
  }
  return {
    layers: database.layers.map(toBetaProfileLayer),
    blocks: database.blocks.map((block) => toProductProfileBlock(block, diagnostics, allow3dWireframe)),
    modelSpaceEntities,
    // Escalar de documento, no de entidad: no hay nada de perfil que filtrar
    // aquí, viaja igual para toda versión/perfil.
    insunits: database.insunits,
    unsupported: database.unsupported.map((object) => ({
      handle: object.handle,
      type: object.type,
    })),
    diagnostics,
  };
}

/**
 * Las tres versiones MODERNAS que el códec lee con cero discrepancias y que
 * `allowModern` deja entrar de golpe. Viven en una constante y no sueltas en
 * el `if` porque el mensaje de error de abajo las tiene que nombrar igual: dos
 * listas de versiones que se pueden desincronizar es como se acaba diciendo al
 * usuario que no admites un formato que sí admites.
 */
const MODERN_VERSION_CODES = ["AC1024", "AC1027", "AC1032"] as const;

/** Rótulo humano de las versiones admitidas, para el mensaje de rechazo. */
function describeAcceptedVersions(accepted: ReadonlySet<string>): string {
  const labels: string[] = [];
  if (accepted.has("AC1015")) labels.push("AutoCAD 2000 (AC1015)");
  if (accepted.has("AC1018")) labels.push("2004 (AC1018)");
  if (accepted.has("AC1024")) labels.push("2010 (AC1024)");
  if (accepted.has("AC1027")) labels.push("2013 (AC1027)");
  if (accepted.has("AC1032")) labels.push("2018 (AC1032)");
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]!}`;
}

/**
 * `allowAc1018` nace y por defecto queda `false`: quien no lo pasa —el resto
 * de este archivo, cualquier spec anterior a M3— sigue viendo exactamente el
 * comportamiento de siempre, sólo AC1015. Sólo el worker lo enciende, y sólo
 * cuando `dwgAc1018BetaImportIsEnabled` (`dwg-interop-flag.ts`) ya dijo que
 * sí — este módulo no lee flags ni entorno, recibe el booleano ya resuelto.
 */
export interface DwgNeutralDatabaseReaderOptions {
  readonly allowAc1018?: boolean;
  /**
   * Perfil 3D heredado propuesto (`AC1015_3D_WIREFRAME_V1`). Igual que
   * `allowAc1018`: nace `false`, y este módulo no lee flags ni entorno —
   * recibe el booleano ya resuelto por `dwg3dWireframeBetaImportIsEnabled`
   * (`dwg-interop-flag.ts`), que hoy siempre devuelve `false` porque nadie ha
   * firmado el perfil todavía (ADR-0009 §9).
   */
  readonly allow3dWireframe?: boolean;
  /**
   * Familia MODERNA (AC1024/AC1027/AC1032). Igual que las dos de arriba: nace
   * `false`, y este módulo no lee flags ni entorno — recibe el booleano ya
   * resuelto por `dwgModernBetaImportIsEnabled` (`dwg-interop-flag.ts`), que
   * hoy siempre devuelve `false` porque nadie ha firmado esta familia.
   *
   * Que el códec las lea con CERO discrepancias no basta para dejarlas entrar:
   * medir y autorizar son dos cosas distintas, y ésta es la segunda.
   */
  readonly allowModern?: boolean;
}

/**
 * `readDwg`/`probeDwg` sólo lanzan `DwgParseError` en su frontera pública
 * (regla del laboratorio: "ninguna entrada malformada puede escapar... sin
 * tipar"). La clase no se exporta desde `@valle-design/dwg-codec`, pero su
 * `.detail: DwgError` sí es un campo público y enumerable — se lee por forma
 * (duck typing) en vez de `instanceof` para no depender de una clase que el
 * paquete no expone.
 */
function dwgErrorDetail(error: unknown): DwgError | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("detail" in error) ||
    typeof (error as { detail?: unknown }).detail !== "object" ||
    (error as { detail: unknown }).detail === null
  ) {
    return undefined;
  }
  return (error as { detail: DwgError }).detail;
}

/**
 * Un mensaje en español por código de error tipado, para que "demasiado
 * grande", "presupuesto de trabajo agotado", "tiempo interno agotado",
 * "cancelado", "corrupto" y "firma inválida/truncada" no colapsen todos en
 * el mismo texto genérico (hallazgo P2 de la campaña de producto: antes de
 * este cambio, un archivo simplemente grande recibía el mismo mensaje que
 * uno con la firma inválida — `probe.probe===null` en los dos casos).
 * `undefined` deja al llamador decidir su propio mensaje de reserva.
 */
function describeDwgErrorCode(code: DwgErrorCode | undefined): string | undefined {
  switch (code) {
    case "DWG_FILE_LIMIT_EXCEEDED":
      return "El archivo supera el tamaño máximo admitido por esta beta.";
    case "DWG_WORK_LIMIT_EXCEEDED":
      return (
        "El archivo exige más trabajo del presupuesto permitido en esta beta " +
        "(estructura inusualmente grande o compleja para el perfil actual)."
      );
    case "DWG_DEADLINE_EXCEEDED":
      return "La lectura superó el tiempo máximo interno asignado a esta beta.";
    case "DWG_CANCELLED":
      return "La importación fue cancelada.";
    case "DWG_STRUCTURE_CORRUPT":
      return "El archivo está dañado: su estructura interna no se pudo leer.";
    case "DWG_SIGNATURE_TRUNCATED":
      return "El archivo está truncado: no tiene suficientes bytes para reconocer su firma DWG.";
    case "DWG_SIGNATURE_INVALID":
      return "El archivo no se reconoce como DWG (firma inválida).";
    default:
      return undefined;
  }
}

/**
 * Lee bytes DWG hostiles y devuelve la base neutral del perfil vigente, o
 * falla tipado y en español. Ésta es la función que se registra como
 * `DwgNeutralDatabaseReader` (`dwg-neutral-model.ts`) en el worker.
 *
 * AC1015 siempre; AC1018 sólo con `allowAc1018: true` (ADR-0009 §7). Se
 * prueba la firma ANTES de decodificar para poder nombrar la versión
 * detectada en el mensaje de error — «archivo corrupto» y «versión no
 * soportada en esta beta» son cosas distintas y el usuario tiene que poder
 * distinguirlas.
 */
export function readDwgNeutralDatabase(
  bytes: Uint8Array,
  options: DwgNeutralDatabaseReaderOptions = {},
): DwgNeutralDatabase {
  const probe = probeDwg(bytes);
  // OJO: `probe.ok` es `false` para una firma RECONOCIDA cuyo decodificador
  // el laboratorio aún no implementa (AC1021, la familia 1024/1027/1032) —
  // `probe.probe` sigue viniendo poblado en ese caso, con la versión y todo.
  // Comprobar sólo `probe.probe === null` es lo que de verdad distingue
  // «no es un DWG» de «es un DWG de una versión que esta beta no lee», que
  // es justo la distinción que este comentario ya prometía más abajo. Entre
  // los casos que SÍ caen aquí (`probe.probe===null`), `probe.error.code`
  // todavía distingue "archivo demasiado grande" de "firma inválida" — antes
  // de este cambio los dos decían lo mismo.
  if (probe.probe === null) {
    // `probe.probe===null` sólo ocurre en la rama de fallo, pero TypeScript
    // discrimina `DwgProbeResult` por `probe.ok`, no por `probe.probe` — el
    // ternario sobre `probe.ok` es el que de verdad estrecha el tipo para
    // que `.error` sea accesible; en runtime siempre toma la rama derecha.
    const specific = probe.ok ? undefined : describeDwgErrorCode(probe.error.code);
    throw new Error(
      (specific ??
        "El archivo no se reconoce como DWG (firma inválida o archivo truncado).") +
        " Verifica que sea un .dwg y vuelve a intentarlo.",
    );
  }
  if (probe.probe.versionKind !== "known") {
    throw new Error(
      `El archivo declara la firma "${probe.probe.signature}", que no corresponde ` +
        "a ninguna versión de AutoCAD reconocida.",
    );
  }
  // Cada versión entra por SU puerta, y la puerta se abre acumulando: la base
  // es AC1015, `allowAc1018` añade una firma y `allowModern` añade tres. Nunca
  // una lista suelta por rama — con cinco versiones, un `if` por combinación es
  // donde se cuela la que no debía entrar.
  const acceptedVersions = new Set(["AC1015"]);
  if (options.allowAc1018 === true) acceptedVersions.add("AC1018");
  if (options.allowModern === true) {
    for (const code of MODERN_VERSION_CODES) acceptedVersions.add(code);
  }
  if (!acceptedVersions.has(probe.probe.version.code)) {
    throw new Error(
      `Se detectó un DWG de AutoCAD ${probe.probe.version.label} (${probe.probe.version.code}). ` +
        `Esta beta sólo lee ${describeAcceptedVersions(acceptedVersions)}.` +
        " Guarda el archivo con esa versión desde tu CAD, o expórtalo a DXF e impórtalo: " +
        "DXF entra completo, con su informe de pérdidas.",
    );
  }
  let database: DwgDatabase;
  try {
    database = readDwg(bytes);
  } catch (error) {
    const specific = describeDwgErrorCode(dwgErrorDetail(error)?.code);
    throw new Error(
      specific !== undefined
        ? `El archivo se reconoce como ${probe.probe.version.code}. ${specific}`
        : `El archivo se reconoce como ${probe.probe.version.code} pero su estructura interna ` +
            `no se pudo leer (${error instanceof Error ? error.message : "error desconocido"}). ` +
            "El archivo puede estar dañado o usar una característica que este perfil de beta no cubre.",
    );
  }
  return toBetaProfileDatabase(database, { allow3dWireframe: options.allow3dWireframe === true });
}
