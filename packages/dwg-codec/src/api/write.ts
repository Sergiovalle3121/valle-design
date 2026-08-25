/**
 * Escritor público del laboratorio a partir del documento canónico —
 * ADR-0009 §8 (M5, exportación DWG). Simétrico a `readDwg` (`api/read.ts`):
 * tan delgado como sea posible, sin I/O y determinista.
 *
 * Encadena las dos piezas YA VERIFICADAS del laboratorio:
 * `canonicalDocumentToDwgEntities` (documento canónico → entidades DWG
 * escribibles, con su propio manifiesto de pérdidas por tipo de entidad) y
 * `writeAc1015MinimalFile` (entidades → archivo AC1015 completo; su propio
 * comentario documenta que el round-trip contra `readAc1015Database` es la
 * mitad de la evidencia y que el oráculo EXTERNO vive en
 * `scripts/dwg/oda-roundtrip.mjs`). Esta función resuelve la única pieza que
 * falta entre ambas: nombres de capa y de bloque, que el documento canónico
 * lleva como STRING y el archivo mínimo exige como `readonly number[]`
 * (bytes) más un índice numérico (`layerIndex`/`insertBlockIndex`).
 *
 * LÍMITE DECLARADO DE ESTA FASE: sólo nombres de capa y de bloque ASCII (1 a
 * 255 caracteres, ninguno por encima de 127) — el mismo límite que hoy sólo
 * vive ad-hoc en el helper `ascii()` de `oda-roundtrip.mjs`, aquí hecho
 * explícito y con pérdida declarada en vez de repetido a ciegas. Un nombre
 * que no cumple ese límite NUNCA se trunca ni se transcribe con pérdida
 * silenciosa: una capa así declarada cae a la capa "0" (pérdida declarada,
 * la entidad se sigue escribiendo) y un INSERT hacia un bloque así declarado
 * se omite del archivo por completo (pérdida declarada — insertar en la capa
 * "0" en vez del bloque correcto dibujaría algo distinto de lo pedido, así
 * que aquí NO hay equivalente al *fallback* de capa). El CONTENIDO de un
 * bloque de usuario tampoco viaja todavía en esta fase: un INSERT
 * referenciado obtiene un BLOCK_RECORD real y vacío (para que la referencia
 * resuelva y el archivo sea válido), y esa omisión de contenido se declara
 * igual que las demás — mapear `document.blocks[].entities` es trabajo de
 * una fase posterior, no de este primer contrato público.
 *
 * Verificación: el round-trip PROPIO (`writeCanonicalDwg` → `readDwg`) tiene
 * su spec en `tests/unit/write-canonical-dwg.spec.ts`. La otra mitad de la
 * evidencia — el oráculo EXTERNO — todavía no ejercita este contrato público
 * exacto (los cuatro casos existentes de `oda-roundtrip.mjs` sólo pasan por
 * la forma de opciones de bajo nivel de `writeAc1015MinimalFile`
 * directamente); un caso nuevo queda añadido y listo para ese script, a la
 * espera de que el propietario lo corra con el ODA File Converter
 * (ADR-0009 §8.2 lo exige antes de cablear nada al producto).
 */
import {
  canonicalDocumentToDwgEntities,
  type CanonicalCadDocumentJson,
  type CanonicalLossEntry,
} from "./canonical.js";
import {
  writeAc1015MinimalFile,
  type Ac1015MinimalFileBlockSpec,
  type Ac1015MinimalFileEntitySpec,
  type Ac1015MinimalFileLayerSpec,
} from "../writer/ac1015-minimal-file-writer.js";

export interface WriteCanonicalDwgResult {
  readonly bytes: Uint8Array;
  readonly lossManifest: readonly CanonicalLossEntry[];
}

/**
 * Bytes ASCII del nombre, o `undefined` si no es representable en esta fase:
 * vacío, más de 255 caracteres, o con algún carácter por encima de 127 (el
 * mismo rango 1..255 que exige `Ac1015MinimalFileLayerSpec`/`BlockSpec`,
 * comprobado por adelantado en vez de dejar que el writer de archivo lo
 * rechace).
 */
function asciiNameBytes(name: string): readonly number[] | undefined {
  if (name.length < 1 || name.length > 0xff) return undefined;
  const bytes: number[] = [];
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code > 127) return undefined;
    bytes.push(code);
  }
  return bytes;
}

/**
 * Escribe un documento canónico como un archivo AC1015 completo. Función
 * pura: mismo documento → mismos bytes, mismo manifiesto de pérdidas (que
 * incluye, en orden, las de `canonicalDocumentToDwgEntities` seguidas de las
 * propias de esta resolución de nombres).
 */
export function writeCanonicalDwg(
  document: CanonicalCadDocumentJson,
): WriteCanonicalDwgResult {
  const { entities, layerNames, lossManifest } =
    canonicalDocumentToDwgEntities(document);
  const losses: CanonicalLossEntry[] = [...lossManifest];

  // ---- capas: unión de las declaradas por el documento y las realmente
  // referenciadas por una entidad (pueden no coincidir: una entidad puede
  // nombrar una capa que `document.layers` nunca declaró) — "0" aparte,
  // porque el archivo mínimo ya la trae implícita en layerIndex 0.
  const referencedLayerNames = new Set(layerNames);
  for (const item of entities) referencedLayerNames.add(item.layerName);
  referencedLayerNames.delete("0");

  const layers: Ac1015MinimalFileLayerSpec[] = [];
  const layerIndexByName = new Map<string, number>();
  for (const name of referencedLayerNames) {
    const bytes = asciiNameBytes(name);
    if (bytes === undefined) {
      losses.push({
        code: "layer-name-not-ascii",
        sourceType: "LAYER",
        detail: `La capa "${name}" no cumple el límite ASCII (1 a 255 bytes, ninguno por encima de 127) que esta fase del writer exige para nombres; sus entidades caen a la capa "0" en vez de quedar sin capa o con un nombre transcrito a medias.`,
        severity: "warning",
      });
      continue;
    }
    // Se registra ANTES de empujar: layerIndex es 1-based (0 = "0" implícita
    // del archivo mínimo), así que el índice de esta capa es su posición
    // FINAL en `layers` (longitud actual, antes de añadirla) más uno.
    layerIndexByName.set(name, layers.length + 1);
    layers.push({ name: bytes });
  }
  const layerIndexFor = (name: string): number =>
    name === "0" ? 0 : (layerIndexByName.get(name) ?? 0);

  // ---- bloques: sólo se declara un BLOCK_RECORD por cada nombre que un
  // INSERT escribible realmente referencia (no todo `document.blocks`) —
  // resolución de NOMBRE, no de contenido; ver límite declarado arriba.
  const blocks: Ac1015MinimalFileBlockSpec[] = [];
  const blockIndexByName = new Map<string, number>();
  const unwritableBlockNames = new Set<string>();
  for (const item of entities) {
    if (item.entity.kind !== "insert" || item.blockName === undefined) continue;
    const name = item.blockName;
    if (blockIndexByName.has(name) || unwritableBlockNames.has(name)) continue;
    const bytes = asciiNameBytes(name);
    if (bytes === undefined) {
      unwritableBlockNames.add(name);
      continue;
    }
    blockIndexByName.set(name, blocks.length);
    blocks.push({ name: bytes, entities: [] });
    losses.push({
      code: "insert-block-content-not-written",
      sourceType: "BLOCK",
      detail: `El bloque "${name}" se escribe con su registro y su nombre para que el INSERT que lo referencia resuelva, pero SIN el contenido geométrico del bloque: mapear las entidades de un bloque canónico es trabajo pendiente de una fase posterior de esta ola de escritura.`,
      severity: "info",
    });
  }

  // ---- entidades finales: resuelve layerIndex/insertBlockIndex; un INSERT
  // cuyo bloque no es representable en esta fase se omite del archivo
  // (declarado) en vez de apuntar a un bloque que no es el pedido.
  const finalEntities: Ac1015MinimalFileEntitySpec[] = [];
  for (const item of entities) {
    if (item.entity.kind === "insert") {
      const name = item.blockName ?? "";
      const blockIndex = blockIndexByName.get(name);
      if (blockIndex === undefined) {
        losses.push({
          code: "insert-block-name-not-ascii",
          entityId: item.canonicalId,
          sourceType: "insert",
          detail: `El INSERT "${item.canonicalId}" referencia el bloque "${name}", que no cumple el límite ASCII (1 a 255 bytes, ninguno por encima de 127) que esta fase del writer exige para nombres; la entidad se omite del archivo en vez de insertar en un bloque distinto del pedido.`,
          severity: "warning",
        });
        continue;
      }
      finalEntities.push({
        entity: item.entity,
        layerIndex: layerIndexFor(item.layerName),
        insertBlockIndex: blockIndex,
      });
      continue;
    }
    finalEntities.push({
      entity: item.entity,
      layerIndex: layerIndexFor(item.layerName),
    });
  }

  const bytes = writeAc1015MinimalFile({ layers, blocks, entities: finalEntities });
  return { bytes, lossManifest: losses };
}
