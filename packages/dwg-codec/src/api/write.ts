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
 * que aquí NO hay equivalente al *fallback* de capa).
 *
 * CONTENIDO DE BLOQUE (corte 2026-08-31): el contenido de un bloque de
 * usuario SÍ viaja ahora, reutilizando `canonicalDocumentToDwgEntities` — sin
 * tocar `api/canonical.ts` (fuera de la frontera de esta sesión) — sobre un
 * documento SINTÉTICO cuyas `entities` son `document.blocks[].entities`; es
 * la misma función pública que ya resuelve el nivel de model space, así que
 * el bloque queda sujeto exactamente a las mismas siete clases escribibles y
 * al mismo límite ASCII, sin un segundo camino de mapeo. Lo que sigue
 * declarado como pérdida, explícito y no silencioso:
 * - un INSERT dentro de un bloque (bloque que inserta OTRO bloque) no se
 *   escribe todavía — el writer de bajo nivel (`ac1015-minimal-file-writer.ts`)
 *   ya sabe resolverlo (mismo `Ac1015MinimalFileEntitySpec` que model space),
 *   pero encontrar y registrar el grafo completo de bloques referenciados
 *   transitivamente es trabajo de una fase posterior; la entidad se omite del
 *   bloque con pérdida declarada;
 * - un INSERT que referencia un nombre de bloque ausente de `document.blocks`
 *   sigue obteniendo un BLOCK_RECORD real y vacío (para que la referencia
 *   resuelva y el archivo sea válido), con su propia pérdida declarada.
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
import { aciIndexFromHex } from "../objects/aci-basic.js";
import {
  canonicalDocumentToDwgEntities,
  type CanonicalCadDocumentJson,
  type CanonicalLossEntry,
  type CanonicalToDwgEntity,
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

  // ---- contenido de bloque: sólo para los nombres que un INSERT escribible
  // realmente referencia (no todo `document.blocks`), resuelto ANTES de fijar
  // las capas — sus propias entidades pueden nombrar capas que el nivel de
  // model space nunca menciona. Reusa `canonicalDocumentToDwgEntities` sobre
  // un documento sintético (mismas capas, `entities` = las del bloque): la
  // MISMA función pública, sin segundo camino de mapeo ni tocar canonical.ts.
  const blockDefByName = new Map(document.blocks.map((b) => [b.name, b] as const));
  const referencedBlockNames = new Set<string>();
  for (const item of entities) {
    if (item.entity.kind === "insert" && item.blockName !== undefined) {
      referencedBlockNames.add(item.blockName);
    }
  }
  const blockContentByName = new Map<string, CanonicalToDwgEntity[]>();
  for (const name of referencedBlockNames) {
    const blockDef = blockDefByName.get(name);
    if (blockDef === undefined) continue; // sin definición: bloque vacío, declarado más abajo.
    const sub = canonicalDocumentToDwgEntities({ ...document, entities: blockDef.entities });
    for (const loss of sub.lossManifest) losses.push(loss);
    const kept: CanonicalToDwgEntity[] = [];
    for (const item of sub.entities) {
      if (item.entity.kind === "insert") {
        losses.push({
          code: "insert-block-nested-insert-not-written",
          entityId: item.canonicalId,
          sourceType: "BLOCK",
          detail: `El bloque "${name}" contiene un INSERT ("${item.canonicalId}" → "${item.blockName ?? ""}"); un bloque que inserta OTRO bloque no se escribe todavía en esta fase (el writer de bajo nivel ya lo resolvería, pero recorrer el grafo completo de bloques referenciados es trabajo pendiente). La entidad se omite del bloque.`,
          severity: "warning",
        });
        continue;
      }
      kept.push(item);
    }
    blockContentByName.set(name, kept);
  }

  // ---- capas: unión de las declaradas por el documento, las referenciadas
  // por una entidad de model space y las referenciadas por el contenido de
  // un bloque — "0" aparte, porque el archivo mínimo ya la trae implícita en
  // layerIndex 0.
  const referencedLayerNames = new Set(layerNames);
  for (const item of entities) referencedLayerNames.add(item.layerName);
  for (const items of blockContentByName.values()) {
    for (const item of items) referencedLayerNames.add(item.layerName);
  }
  referencedLayerNames.delete("0");

  // Las capas del documento canónico por nombre: de ahí sale su color.
  const definitionByName = new Map(document.layers.map((layer) => [layer.name, layer] as const));
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
    // EL COLOR DE LA CAPA. Hasta el 2026-09-01 esta línea empujaba sólo el
    // nombre, así que TODA capa exportada por el camino público salía con el
    // color por defecto del archivo mínimo —el 7, blanco— y el color real del
    // dibujo se perdía SIN declararlo. Se descubrió al exigir lo que pide el
    // ADR-0009 §8.2: que el oráculo externo verifique la función PÚBLICA y no
    // la interna. La interna recibe el índice ya resuelto y siempre estuvo
    // bien; la pública recibe un documento canónico con el color en hexadecimal
    // y no lo traducía. Verificar sólo una de las dos no podía ver esto.
    const colorIndex =
      definitionByName.get(name)?.color === undefined
        ? undefined
        : aciIndexFromHex(definitionByName.get(name)!.color);
    if (definitionByName.get(name)?.color !== undefined && colorIndex === undefined) {
      losses.push({
        code: "layer-color-not-in-aci-basic",
        sourceType: "LAYER",
        detail: `La capa "${name}" usa el color ${definitionByName.get(name)!.color}, que no está en la tabla ACI básica que este writer sabe escribir; se escribe con el color por defecto y se declara en vez de aproximarlo al más cercano.`,
        severity: "warning",
      });
    }
    // Se registra ANTES de empujar: layerIndex es 1-based (0 = "0" implícita
    // del archivo mínimo), así que el índice de esta capa es su posición
    // FINAL en `layers` (longitud actual, antes de añadirla) más uno.
    layerIndexByName.set(name, layers.length + 1);
    layers.push(colorIndex === undefined ? { name: bytes } : { name: bytes, colorIndex });
  }
  const layerIndexFor = (name: string): number =>
    name === "0" ? 0 : (layerIndexByName.get(name) ?? 0);

  // ---- bloques: un BLOCK_RECORD por cada nombre que un INSERT escribible
  // realmente referencia, con su contenido YA resuelto arriba.
  const blocks: Ac1015MinimalFileBlockSpec[] = [];
  const blockIndexByName = new Map<string, number>();
  const unwritableBlockNames = new Set<string>();
  for (const name of referencedBlockNames) {
    const bytes = asciiNameBytes(name);
    if (bytes === undefined) {
      unwritableBlockNames.add(name);
      continue;
    }
    const content = blockContentByName.get(name);
    if (content === undefined) {
      losses.push({
        code: "insert-block-not-declared",
        sourceType: "BLOCK",
        detail: `El bloque "${name}" no aparece en "document.blocks"; se escribe con su registro y su nombre para que el INSERT que lo referencia resuelva, pero sin contenido (no hay de dónde tomarlo).`,
        severity: "info",
      });
    }
    blockIndexByName.set(name, blocks.length);
    blocks.push({
      name: bytes,
      entities: (content ?? []).map((item) => ({
        entity: item.entity,
        layerIndex: layerIndexFor(item.layerName),
      })),
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
