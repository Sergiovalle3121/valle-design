/**
 * Migración del documento canónico hasta el esquema vigente.
 *
 * Vive fuera de `cad-document.ts` por tamaño y porque es una responsabilidad
 * distinta: aquel DEFINE el modelo, esto NORMALIZA lo que llega del disco, de
 * la red o de una versión anterior del producto. Sólo importa TIPOS del
 * modelo, así que no cierra ningún ciclo de carga.
 *
 * ## Qué significa «aditiva» aquí
 *
 * Un documento v1/v2/v3/v4 se lee sin perder un campo, sin reinterpretar ninguno
 * y sin materializar secciones que no traía —`cells` e `imageDefinitions` sólo
 * aparecen si existían—. Lo único que cambia al subir de esquema es
 * `meta.schema`. Las entidades nuevas no se inventan: no hay nada en un v3 que
 * se parezca a un XLINE ni nada en un v4 que se parezca a un SOLID3D, así que
 * fabricar uno sería adivinar.
 *
 * El paso de v4 a v5 merece una frase propia porque es el que más tienta a
 * hacer algo listo: un documento v4 tiene POLILÍNEAS CERRADAS y CÍRCULOS, que
 * son exactamente lo que consume EXTRUDE, y sería fácil convertirlos en REGION
 * «para que ya estén listos». No se hace. Una polilínea cerrada es un trazo que
 * alguien dibujó y una región es un ÁREA con semántica de sólido; convertir la
 * una en la otra al abrir cambiaría lo que el usuario ve, lo que exporta a DXF y
 * el hash de todos los documentos existentes, y todo ello sin que nadie lo haya
 * pedido. La conversión existe: se llama REGION y la teclea quien la quiere.
 *
 * Que la migración no pierda nada NO se demuestra con una ida y vuelta: migrar
 * dos veces devuelve lo mismo aunque el código no toque un solo campo. Por eso
 * su spec compara CAMPO A CAMPO contra valores absolutos.
 */
import type {
  CadDocument,
  CadEntity,
  CadLossManifestEntry,
  CadPaperSpace,
  CadPoint2,
} from "./cad-document";
import { CAD_VIEWPORT_PLAN_VIEW } from "./cad-paper-viewport";
import {
  byId,
  CAD_DOCUMENT_SCHEMA,
  emptyStyles,
  point3,
  preserveDrawOrder,
} from "./cad-document-shared";

function finite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === "object") return Object.values(value).every(finite);
  return true;
}

/**
 * Rellena las secciones que un documento antiguo pueda no traer, SIN inventar
 * las opcionales.
 *
 * La distinción entre «obligatoria y ausente» (se materializa vacía) y
 * «opcional y ausente» (se deja ausente) no es cosmética: materializar `cells`
 * o `imageDefinitions` como `[]` cambiaría el texto serializado de TODOS los
 * documentos existentes, y con él su hash de versión — un guardado espurio por
 * cada documento del sistema la primera vez que alguien lo abriese.
 */
function withSchemaDefaults(doc: Partial<CadDocument>): CadDocument {
  const entities = Array.isArray(doc.entities) ? doc.entities : [];
  return {
    meta: {
      version: Number(doc.meta?.version) || 1,
      schema: CAD_DOCUMENT_SCHEMA,
      unit: doc.meta?.unit || "mm",
      // La huella declarada del documento se conserva tal cual. Normalizar el
      // esquema no puede inventar un lienzo ni descartar el que ya existía.
      ...(Number.isFinite(doc.meta?.footprintW) ? { footprintW: doc.meta!.footprintW } : {}),
      ...(Number.isFinite(doc.meta?.footprintH) ? { footprintH: doc.meta!.footprintH } : {}),
      ...(Number.isFinite(doc.meta?.gridSize) ? { gridSize: doc.meta!.gridSize } : {}),
    },
    layers: Array.isArray(doc.layers) ? doc.layers : [],
    entities,
    history: Array.isArray(doc.history) ? doc.history : [],
    // Documento heredado sin `modelSpace`: el orden del array `entities` es la
    // mejor señal disponible del orden de dibujo. Ordenar por id imponía un
    // z-order alfabético que nunca estuvo en los datos.
    modelSpace: doc.modelSpace ?? { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: Array.isArray(doc.paperSpaces) ? doc.paperSpaces : [],
    styles: doc.styles ?? emptyStyles(),
    blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
    constraints: Array.isArray(doc.constraints) ? doc.constraints : [],
    ...(Array.isArray(doc.parameters) ? { parameters: doc.parameters } : {}),
    externalReferences: Array.isArray(doc.externalReferences) ? doc.externalReferences : [],
    unsupportedEntities: Array.isArray(doc.unsupportedEntities) ? doc.unsupportedEntities : [],
    lossManifest: Array.isArray(doc.lossManifest) ? doc.lossManifest : [],
    publications: Array.isArray(doc.publications) ? doc.publications : [],
    collaboration:
      doc.collaboration && typeof doc.collaboration === "object"
        ? doc.collaboration
        : undefined,
    // Secciones OPCIONALES: sólo aparecen si el documento las traía. Vale
    // igual para `parameters`, que llega con el dibujo paramétrico.
    ...(Array.isArray(doc.cells) ? { cells: doc.cells } : {}),
    ...(Array.isArray(doc.imageDefinitions) ? { imageDefinitions: doc.imageDefinitions } : {}),
  };
}

const legacyPointEqual = (a: CadPoint2, b: CadPoint2, tolerance = 1e-6) =>
  Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;

/**
 * The former editor emitted a leader as two `ld_*` legacy DIM annotations plus
 * one `nt_*` TEXT at the landing endpoint. Only that exact, isolated signature
 * is folded into one MLEADER; ambiguous candidates remain untouched and gain a
 * loss-manifest warning instead of being guessed.
 */
export function migrateLegacyMleaderCompositions(document: CadDocument): CadDocument {
  const dimensions = document.entities.filter((entity): entity is Extract<CadEntity, { type: "dimension" }> =>
    entity.type === "dimension" && !entity.dimensionKind && /^ld_/.test(entity.id));
  const texts = document.entities.filter((entity): entity is Extract<CadEntity, { type: "text" }> =>
    entity.type === "text" && /^nt_/.test(entity.id));
  const used = new Set<string>();
  const created: Extract<CadEntity, { type: "mleader" }>[] = [];
  const warnings: CadLossManifestEntry[] = [];
  for (const dogleg of dimensions) {
    if (used.has(dogleg.id) || Math.abs(dogleg.a.y - dogleg.b.y) > 1e-6) continue;
    const candidates = dimensions.filter((leader) =>
      leader.id !== dogleg.id && !used.has(leader.id) &&
      [leader.a, leader.b].some((point) => legacyPointEqual(point, dogleg.a) || legacyPointEqual(point, dogleg.b)));
    const textCandidates = texts.filter((text) =>
      !used.has(text.id) && (legacyPointEqual({ x: text.x, y: text.y }, dogleg.a) || legacyPointEqual({ x: text.x, y: text.y }, dogleg.b)));
    if (candidates.length !== 1 || textCandidates.length !== 1) {
      if (candidates.length || textCandidates.length) warnings.push({
        code: "legacy_mleader_ambiguous",
        entityId: dogleg.id,
        sourceType: "DIM+DIM+TEXT",
        detail: "Legacy leader composition was not uniquely identifiable and remains unflattened.",
        severity: "warning",
      });
      continue;
    }
    const leader = candidates[0];
    const text = textCandidates[0];
    const shared = [leader.a, leader.b].find((point) => legacyPointEqual(point, dogleg.a) || legacyPointEqual(point, dogleg.b))!;
    const tip = legacyPointEqual(leader.a, shared) ? leader.b : leader.a;
    const textPosition = { x: text.x, y: text.y, z: 0 };
    const id = `mleader:migrated:${[leader.id, dogleg.id, text.id].sort().join("+")}`;
    created.push({
      id,
      type: "mleader",
      vertices: [point3(tip.x, tip.y), point3(shared.x, shared.y)],
      leaderLines: [[point3(tip.x, tip.y), point3(shared.x, shared.y)]],
      text: text.text,
      textPosition,
      contentType: "text",
      landing: true,
      doglegLength: Math.hypot(dogleg.b.x - dogleg.a.x, dogleg.b.y - dogleg.a.y),
      arrowhead: "closed-filled",
      associationStatus: "detached",
      associative: false,
      style: "Standard",
      layer: text.layer || leader.layer,
      context: { provenance: { provider: "legacy-editor" }, metadata: { migratedLeader: leader.id, migratedDogleg: dogleg.id, migratedText: text.id } },
    });
    used.add(leader.id); used.add(dogleg.id); used.add(text.id);
  }
  if (!created.length && !warnings.length) return document;
  const entities = [...document.entities.filter((entity) => !used.has(entity.id)), ...created].sort(byId);
  return {
    ...document,
    entities,
    // Mismo defecto que en `replaceEditorProjection`: `entities` está ordenado
    // por id y derivar de ahí el orden de dibujo lo alfabetizaba. Migrar
    // MLEADER heredados no debe reordenar el plano del usuario.
    modelSpace: {
      entityIds: preserveDrawOrder(
        document.modelSpace.entityIds,
        entities.map((entity) => entity.id),
      ),
    },
    lossManifest: [...document.lossManifest, ...warnings],
  };
}

/**
 * Saneado idempotente de referencias colgantes en `constraints`.
 *
 * Documentos guardados antes del GC transaccional del borrado podían quedar
 * con restricciones que apuntan a entidades inexistentes, y la frontera del
 * servidor ahora las rechaza al GUARDAR. Sanear al ABRIR garantiza que ningún
 * documento heredado quede inaccesible: abrir → sanear → guardar limpio. No
 * es una migración de forma (no toca `meta.schema`), y un documento limpio
 * pasa intacto, misma referencia incluida. La retirada queda anotada en el
 * `lossManifest`: descartar una restricción es pérdida y debe verse.
 */
function dropDanglingConstraintReferences(document: CadDocument): CadDocument {
  if (!document.constraints.length) return document;
  const ids = new Set(document.entities.map((entity) => entity.id));
  const parameterNames = new Set((document.parameters ?? []).map((parameter) => parameter.name));
  const dropped: CadDocument["lossManifest"] = [];
  let changed = false;
  const constraints = document.constraints.flatMap((constraint) => {
    if (!constraint.entityIds.every((id) => ids.has(id))) {
      changed = true;
      dropped.push({
        code: "constraint_dangling_reference_dropped",
        entityId: constraint.id,
        sourceType: "CONSTRAINT",
        detail: `Constraint ${constraint.id} referenced deleted entities and was removed on open.`,
        severity: "warning",
      });
      return [];
    }
    if (constraint.parameter !== undefined && !parameterNames.has(constraint.parameter)) {
      // El parámetro ya no existe; `value` conserva su última evaluación, así
      // que la restricción sigue siendo válida como cota fija.
      changed = true;
      const { parameter: _dangling, ...rest } = constraint;
      return [rest];
    }
    return [constraint];
  });
  if (!changed) return document;
  return {
    ...document,
    constraints,
    lossManifest: dropped.length ? [...document.lossManifest, ...dropped] : document.lossManifest,
  };
}

/**
 * 7→8: toda ventana gráfica declara desde dónde mira.
 *
 * Una ventana del esquema 7 sólo sabía mirar en planta —`modelBounds` es un
 * rectángulo del plano XY y no hay otra lectura posible—, así que escribirle
 * `CAD_VIEWPORT_PLAN_VIEW` no reinterpreta nada: pone por escrito lo que ya
 * significaba. Lo que la lámina enseña no cambia, y el spec del censo lo mide
 * proyectando puntos en vez de creérselo.
 *
 * Se escribe SIEMPRE, incluso donde el default coincidiría, para que después
 * de abrir «esta ventana no dice desde dónde mira» sea un estado imposible. El
 * argumento largo está en la cabecera de `cad-paper-viewport.ts`; el corto es
 * que un default implícito obliga a adivinar a todo el que lea la ventana, y
 * la adivinanza no se ve fallar.
 *
 * IDEMPOTENTE, y por omisión en vez de por comparación: una ventana que ya
 * trae `view` se devuelve TAL CUAL, con la misma referencia. Sobrescribirla
 * con la de planta convertiría abrir un alzado en perderlo.
 */
function declarePlanViewports(document: CadDocument): CadDocument {
  let changed = false;
  const paperSpaces: CadPaperSpace[] = document.paperSpaces.map((space) => {
    const viewports = space.viewports;
    if (!Array.isArray(viewports) || viewports.length === 0) return space;
    if (viewports.every((viewport) => viewport.view)) return space;
    changed = true;
    return {
      ...space,
      viewports: viewports.map((viewport) =>
        viewport.view ? viewport : { ...viewport, view: { ...CAD_VIEWPORT_PLAN_VIEW } },
      ),
    };
  });
  return changed ? { ...document, paperSpaces } : document;
}

/** Deterministic additive migration from v1/v2/v3 to the current schema. */
export function migrateCadDocument(value: unknown): CadDocument {
  if (!value || typeof value !== "object") throw new Error("CadDocument must be an object.");
  const raw = value as Partial<CadDocument>;
  const schema = Number(raw.meta?.schema) || 1;
  if (schema > CAD_DOCUMENT_SCHEMA) throw new Error(`Unsupported CadDocument schema ${schema}.`);
  const migrated = declarePlanViewports(
    dropDanglingConstraintReferences(
      migrateLegacyMleaderCompositions(withSchemaDefaults(raw)),
    ),
  );
  if (!finite(migrated)) throw new Error("CadDocument contains non-finite numeric values.");
  const ids = migrated.entities.map((entity) => entity.id);
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
    throw new Error("CadDocument entity ids must be non-empty and unique.");
  }
  return migrated;
}

export function parseCadDocument(serialized: string): CadDocument {
  if (serialized.length > 20_000_000) throw new Error("CadDocument exceeds the 20 MB client limit.");
  return migrateCadDocument(JSON.parse(serialized));
}
