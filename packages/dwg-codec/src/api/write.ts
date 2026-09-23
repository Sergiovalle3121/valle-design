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
 * CONTENIDO DE BLOQUE (corte 2026-09-21): el contenido de un bloque de
 * usuario SÍ viaja ahora, reutilizando `canonicalDocumentToDwgEntities` — sin
 * tocar `api/canonical.ts` (fuera de la frontera de esta sesión) — sobre un
 * documento SINTÉTICO cuyas `entities` son `document.blocks[].entities`; es
 * la misma función pública que ya resuelve el nivel de model space, así que
 * el bloque queda sujeto exactamente a las mismas clases escribibles y al
 * mismo límite ASCII, sin un segundo camino de mapeo. Los INSERT anidados
 * se recorren transitivamente y conservan el grafo de BLOCK_RECORDs; lo que
 * sigue declarado como pérdida, explícito y no silencioso:
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

/** El único tipo de línea que el archivo mínimo sabe emitir hoy. */
const WRITABLE_LINETYPE_NAME = "CONTINUOUS";
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

  // ---- contenido de bloque: para todos los nombres que un INSERT escribible
  // alcanza, incluidos los INSERT anidados transitivamente (no todo
  // `document.blocks`). Se resuelve ANTES de fijar las capas — sus propias
  // entidades pueden nombrar capas que el nivel de model space nunca
  // menciona. Reusa `canonicalDocumentToDwgEntities` sobre un documento
  // sintético (mismas capas, `entities` = las del bloque): la MISMA función
  // pública, sin segundo camino de mapeo ni tocar canonical.ts.
  const blockDefByName = new Map(document.blocks.map((b) => [b.name, b] as const));
  const referencedBlockNames = new Set<string>();
  for (const item of entities) {
    if (item.entity.kind === "insert" && item.blockName !== undefined) {
      referencedBlockNames.add(item.blockName);
    }
  }
  const blockContentByName = new Map<string, CanonicalToDwgEntity[]>();
  // BFS determinista del grafo de bloques. No expandimos geometría ni
  // recursión: cada BLOCK_RECORD se escribe una sola vez y un ciclo sólo
  // conserva sus referencias explícitas, como hace el writer de bajo nivel.
  const pendingBlockNames = [...referencedBlockNames];
  for (let pendingIndex = 0; pendingIndex < pendingBlockNames.length; pendingIndex += 1) {
    const name = pendingBlockNames[pendingIndex]!;
    const blockDef = blockDefByName.get(name);
    if (blockDef === undefined) continue; // sin definición: bloque vacío, declarado más abajo.
    // `paperSpaces: []` NO es una omisión: el documento sintético existe para
    // traducir el CONTENIDO de un bloque, y las hojas del documento real no
    // son suyas. Sin este vaciado la ventana de la hoja se escribiría una vez
    // por bloque referenciado, dentro de cada bloque.
    const sub = canonicalDocumentToDwgEntities({
      ...document,
      entities: blockDef.entities,
      paperSpaces: [],
    });
    for (const loss of sub.lossManifest) losses.push(loss);
    blockContentByName.set(name, [...sub.entities]);
    for (const item of sub.entities) {
      if (item.entity.kind === "insert" && item.blockName !== undefined) {
        if (!referencedBlockNames.has(item.blockName)) {
          referencedBlockNames.add(item.blockName);
          pendingBlockNames.push(item.blockName);
        }
      }
    }
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

  // LOS PATRONES DE TIPO DE LÍNEA QUE EL DOCUMENTO TRAE. El documento canónico
  // los lleva en `styles.linetype` —el lector los proyecta desde la tabla LTYPE
  // del dibujo—, así que el writer puede emitir la entrada REAL en vez de
  // apuntarlo todo a Continuous. Continuous no entra aquí: el archivo mínimo ya
  // la lleva fija, y duplicarla daría dos entradas con el mismo nombre.
  const patternByLinetypeKey = new Map<string, { name: string; pattern: number[] }>();
  for (const [styleName, style] of Object.entries(document.styles?.linetype ?? {})) {
    const key = styleName.trim().toUpperCase();
    if (key === WRITABLE_LINETYPE_NAME || key.length === 0) continue;
    if (!Array.isArray(style?.pattern) || style.pattern.length === 0) continue;
    if (!patternByLinetypeKey.has(key))
      patternByLinetypeKey.set(key, { name: styleName, pattern: [...style.pattern] });
  }
  const linetypeSpecs = [...patternByLinetypeKey.values()].map((style) => ({
    name: asciiNameBytes(style.name) ?? [],
    // La longitud del patrón es la suma de los VALORES ABSOLUTOS de sus
    // trazos: los negativos son huecos y también ocupan.
    patternLength: style.pattern.reduce((total, dash) => total + Math.abs(dash), 0),
    dashes: style.pattern.map((dash) => ({ length: dash })),
  }));
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
    const definition = definitionByName.get(name);
    const colorIndex =
      definition?.color === undefined ? undefined : aciIndexFromHex(definition.color);
    if (definition?.color !== undefined && colorIndex === undefined) {
      losses.push({
        code: "layer-color-not-in-aci-basic",
        sourceType: "LAYER",
        detail: `La capa "${name}" usa el color ${definition!.color}, que no está en la tabla ACI básica que este writer sabe escribir; se escribe con el color por defecto y se declara en vez de aproximarlo al más cercano.`,
        severity: "warning",
      });
    }
    // EL TIPO DE LÍNEA SE ESCRIBE CUANDO EL DIBUJO LO DEFINE. Hasta el corte
    // anterior el archivo sólo llevaba Continuous y toda capa salía continua;
    // ahora el writer emite entradas propias, así que lo único que se pierde
    // es un tipo de línea que el documento NOMBRA pero no DEFINE —y eso sí se
    // declara, en vez de dejar que el archivo afirme un patrón inventado—.
    const declaredLinetype = definition?.linetype;
    const linetypeKey = declaredLinetype?.trim().toUpperCase();
    if (
      linetypeKey !== undefined &&
      linetypeKey !== WRITABLE_LINETYPE_NAME &&
      !patternByLinetypeKey.has(linetypeKey)
    ) {
      losses.push({
        code: "layer-linetype-not-writable",
        sourceType: "LAYER",
        detail: `La capa "${name}" usa el tipo de línea "${declaredLinetype}", que el documento nombra pero no define con un patrón; la capa se escribe continua y se declara aquí en vez de inventarle trazos.`,
        severity: "warning",
      });
    }
    // Se registra ANTES de empujar: layerIndex es 1-based (0 = "0" implícita
    // del archivo mínimo), así que el índice de esta capa es su posición
    // FINAL en `layers` (longitud actual, antes de añadirla) más uno.
    layerIndexByName.set(name, layers.length + 1);
    layers.push({
      name: bytes,
      ...(colorIndex === undefined ? {} : { colorIndex }),
      // El estado viaja al archivo desde el 2026-09-01: antes toda capa
      // exportada salía descongelada y desbloqueada, se pidiera lo que se
      // pidiera, y sin declararlo.
      ...(definition?.frozen === undefined ? {} : { frozen: definition.frozen }),
      ...(definition?.locked === undefined ? {} : { locked: definition.locked }),
      ...(declaredLinetype !== undefined &&
      linetypeKey !== undefined &&
      patternByLinetypeKey.has(linetypeKey)
        ? { linetypeName: declaredLinetype }
        : {}),
    });
  }
  const layerIndexFor = (name: string): number =>
    name === "0" ? 0 : (layerIndexByName.get(name) ?? 0);

  // ---- bloques: un BLOCK_RECORD por cada nombre que un INSERT escribible
  // realmente referencia, con su contenido YA resuelto arriba.
  const blocks: Ac1015MinimalFileBlockSpec[] = [];
  const blockIndexByName = new Map<string, number>();
  const writableBlockNames: { readonly name: string; readonly bytes: readonly number[] }[] = [];
  for (const name of referencedBlockNames) {
    const bytes = asciiNameBytes(name);
    if (bytes === undefined) {
      continue;
    }
    blockIndexByName.set(name, writableBlockNames.length);
    writableBlockNames.push({ name, bytes });
  }
  for (const { name, bytes } of writableBlockNames) {
    const content = blockContentByName.get(name);
    if (content === undefined) {
      losses.push({
        code: "insert-block-not-declared",
        sourceType: "BLOCK",
        detail: `El bloque "${name}" no aparece en "document.blocks"; se escribe con su registro y su nombre para que el INSERT que lo referencia resuelva, pero sin contenido (no hay de dónde tomarlo).`,
        severity: "info",
      });
    }
    blocks.push({
      name: bytes,
      entities: (content ?? []).reduce<Ac1015MinimalFileEntitySpec[]>((specs, item) => {
        const layerIndex = layerIndexFor(item.layerName);
        if (item.entity.kind !== "insert") {
          specs.push({ entity: item.entity, layerIndex });
          return specs;
        }
        const nestedName = item.blockName ?? "";
        const nestedIndex = blockIndexByName.get(nestedName);
        if (nestedIndex === undefined) {
          losses.push({
            code: "insert-block-name-not-ascii",
            entityId: item.canonicalId,
            sourceType: "insert",
            detail: `El INSERT "${item.canonicalId}" dentro del bloque "${name}" referencia el bloque "${nestedName}", que no cumple el límite ASCII (1 a 255 bytes, ninguno por encima de 127) que esta fase del writer exige para nombres; la entidad se omite en vez de insertar en un bloque distinto del pedido.`,
            severity: "warning",
          });
          return specs;
        }
        specs.push({
          entity: item.entity,
          layerIndex,
          insertBlockIndex: nestedIndex,
          ...(item.attributes === undefined
            ? {}
            : { attributes: item.attributes.map((entity) => ({ entity })) }),
        });
        return specs;
      }, []),
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
        ...(item.space === "paper" ? { space: "paper" as const } : {}),
        insertBlockIndex: blockIndex,
        // LOS ATTRIB DEL RÓTULO. Van en la capa del INSERT porque es lo que
        // el producto modela: un atributo posicionado no tiene capa propia.
        ...(item.attributes === undefined
          ? {}
          : { attributes: item.attributes.map((entity) => ({ entity })) }),
      });
      continue;
    }
    finalEntities.push({
      entity: item.entity,
      layerIndex: layerIndexFor(item.layerName),
      // EL ESPACIO VIAJA (2026-09-04). Sin esta línea la ventana y el cajetín
      // de una hoja caerían en model space, que es donde caía TODO hasta esta
      // ola: el archivo llevaría el dibujo, pero no la hoja.
      ...(item.space === "paper" ? { space: "paper" as const } : {}),
    });
  }

  const bytes = writeAc1015MinimalFile({
    layers,
    ...(linetypeSpecs.length > 0 ? { linetypes: linetypeSpecs } : {}),
    blocks,
    entities: finalEntities,
  });
  return { bytes, lossManifest: losses };
}
