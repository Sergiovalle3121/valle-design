/**
 * ENSAMBLADO de la base neutral para R2010+ (AC1024/AC1027/AC1032) —
 * intake 2026-08-31, cierre de la serie M4.
 *
 * POR QUÉ ES UN CAMINO PROPIO Y NO EL ADAPTADOR DE AC1018. El adaptador de
 * AC1018 normaliza cuerpos a la forma R2000 porque en esa versión los campos
 * SIGUEN siendo los mismos: cambia el envoltorio, no el contenido. En R2010+
 * eso deja de ser cierto —el nombre se muda a un flujo de cadenas propio y los
 * handles a otro— así que normalizar sería inventar una forma R2000 que el
 * archivo no tiene. Este módulo ensambla desde los lectores YA MEDIDOS:
 *
 *   - `readR2010ObjectHeader`  · 2893/2893 handles exactos
 *   - `readR2010EntityBody`    · 72/72 geometrías exactas (5 tipos sin cadena)
 *   - `readR2010HandleStream`  · 105/105 consumo y prefijo exactos
 *   - `deriveR2010HandleShape` · 105/105 campos de forma, del propio archivo
 *   - `readR2010ObjectName`    · 303/303 nombres exactos
 *
 * QUÉ PRODUCE, Y QUÉ NO. Produce capas y bloques CON NOMBRE, y entidades con
 * geometría exacta y su handle de CAPA resuelto. No produce, y lo dice en vez
 * de rellenarlo:
 *
 *  - **El color y las banderas de una capa.** Se intentó medirlos con la misma
 *    técnica que resolvió el cuerpo de entidad —barrer la anchura del prólogo
 *    de objeto y quedarse con la que reproduce los campos del gemelo— y el
 *    resultado fue CERO aciertos en todo el barrido de 0..120 bits: las
 *    banderas de capa de R2010+ no son el `BS` de R2000 en ninguna posición.
 *    El modelo relajado que suelta el color «acierta» 18/18 en CUATRO anchuras
 *    distintas a la vez (4, 24, 53 y 59 en AC1024), y eso NO es evidencia:
 *    los tres campos de xref valen su defecto en todo el corpus, así que
 *    coincidir con ellos es coincidir con ceros. Medirlos de verdad exige un
 *    corpus con capas de colores y estados variados, y es un intake aparte.
 *    `colorIndex` y `stateFlags` viajan `undefined`, y el mapeo canónico
 *    declara la ausencia como pérdida en vez de pintar blanco.
 *  - **El contenido de los bloques.** La pertenencia entidad→bloque necesita
 *    el propietario, que sólo se escribe cuando el modo de entidad es 0; el
 *    corpus admitido no ejercita ni un solo objeto así, de modo que la regla
 *    está implementada pero NO medida, y cada uso deja diagnóstico.
 *  - **Todo tipo sin decodificador**: entra en `unsupported` con su tipo. Nunca
 *    se descarta en silencio.
 *
 * La regla de colocación (modo 0 → su bloque; modo 1 → paper space, que no se
 * modela; resto → model space) es la MISMA que aplica el ensamblado AC1015, y
 * se reusa a propósito para que no existan dos criterios distintos.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import type { DwgDiagnostic } from "../api/diagnostics.js";
import {
  readR2010ObjectBody,
  readR2010ObjectHeader,
  type R2010ObjectBounds,
} from "../container/r2010-object-envelope.js";
import { AC1015_TYPE_LAYER } from "../objects/table-layer.js";
import { AC1015_TYPE_BLOCK_HEADER } from "../objects/table-block.js";
import {
  AC1015_TYPE_APPID,
  AC1015_TYPE_DIMSTYLE,
  AC1015_TYPE_LTYPE,
  AC1015_TYPE_STYLE,
  AC1015_TYPE_UCS,
  AC1015_TYPE_VIEW,
  AC1015_TYPE_VPORT,
  type Ac1015DatabaseSymbolTables,
  type Ac1015DatabaseTableEntry,
} from "../objects/tables-symbol.js";
import {
  readR2010EntityBody,
  type R2010MeasuredVersion,
} from "./r2010-entity-body.js";
import {
  deriveR2010HandleShape,
  interpretR2010HandleStream,
  readR2010HandleStream,
} from "./r2010-handle-stream.js";
import {
  locateR2010StringStream,
  readR2010ObjectName,
} from "./r2010-string-stream.js";
import type {
  Ac1015DatabaseBlock,
  Ac1015DatabaseEntityRecord,
  Ac1015DatabaseLayer,
  Ac1015NeutralDatabase,
  Ac1015UnsupportedDatabaseObject,
} from "./database-assembly.js";

/** Una entrada del mapa de objetos, tal como la entrega el contenedor. */
export interface R2010AssemblyEntry {
  readonly handle: number;
  readonly offset: number;
}

/** Lo que el llamador ya resolvió del contenedor y aquí no se vuelve a leer. */
export interface R2010AssemblyContext {
  readonly version: R2010MeasuredVersion;
  readonly insunits: number | undefined;
  readonly classMap: Ac1015NeutralDatabase["classMap"];
}

/**
 * Los tipos cuyo NOMBRE se lee del flujo de cadenas (medido 303/303). Las
 * capas y los bloques viven en el primer nivel de la base neutral; el resto
 * son entradas de tabla y se encaminan a su array por el tipo del encabezado,
 * que `readR2010ObjectHeader` ya entrega verificado.
 */
type NamedSlot = "layer" | "block" | keyof Ac1015DatabaseSymbolTables;
const NAMED_TABLE_TYPES: ReadonlyMap<number, NamedSlot> = new Map<
  number,
  NamedSlot
>([
  [AC1015_TYPE_LAYER, "layer"],
  [AC1015_TYPE_BLOCK_HEADER, "block"],
  [AC1015_TYPE_STYLE, "styles"],
  [AC1015_TYPE_LTYPE, "linetypes"],
  [AC1015_TYPE_DIMSTYLE, "dimstyles"],
  [AC1015_TYPE_APPID, "appids"],
  [AC1015_TYPE_VPORT, "vports"],
  [AC1015_TYPE_VIEW, "views"],
  [AC1015_TYPE_UCS, "ucss"],
]);

function diagnostic(
  code: string,
  severity: DwgDiagnostic["severity"],
  offset: number,
  message: string,
): DwgDiagnostic {
  return Object.freeze({ code, severity, offset, message });
}

/**
 * Ensambla la base neutral de un archivo R2010+ ya paginado y descomprimido.
 *
 * Ningún objeto se pierde: lo que no tiene decodificador entra en
 * `unsupported` con su tipo, y cada decisión que el corpus no ejercita deja
 * diagnóstico. Un objeto cuyo cuerpo esté corrupto SÍ propaga el error: una
 * base ensamblada a medias sobre bytes rotos es peor que no abrir el archivo.
 */
export function assembleR2010Database(
  objectsPayload: Uint8Array,
  bounds: readonly R2010ObjectBounds[],
  context: R2010AssemblyContext,
): Ac1015NeutralDatabase {
  const layers: Ac1015DatabaseLayer[] = [];
  const blocks: Ac1015DatabaseBlock[] = [];
  const modelSpace: Ac1015DatabaseEntityRecord[] = [];
  const unsupported: Ac1015UnsupportedDatabaseObject[] = [];
  // Las ocho tablas de símbolos, cada una con sus entradas NOMBRADAS. Los
  // campos no-nombre de cada entrada NO se decodifican en R2010+ (misma razón
  // que el color de una capa), así que `fields` va vacío y no cero.
  const tables: {
    [K in keyof Ac1015DatabaseSymbolTables]: Ac1015DatabaseTableEntry[];
  } = {
    styles: [],
    linetypes: [],
    dimstyles: [],
    appids: [],
    vports: [],
    views: [],
    ucss: [],
    mlinestyles: [],
  };
  const diagnostics: DwgDiagnostic[] = [];

  for (const bound of bounds) {
    const bodyBytes = readR2010ObjectBody(objectsPayload, bound).bodyBytes;
    const header = readR2010ObjectHeader(bodyBytes, bound.handle);

    const named = NAMED_TABLE_TYPES.get(header.type);
    if (named !== undefined) {
      const span = locateR2010StringStream(bodyBytes, header);
      if (!span.present) {
        // Una tabla con nombre que no declara cadenas no es un nombre vacío:
        // es una estructura que no se entiende, y se enumera como tal.
        unsupported.push(
          Object.freeze({ handle: bound.handle, type: header.type }),
        );
        diagnostics.push(
          diagnostic(
            "r2010-named-object-without-strings",
            "warning",
            bound.start,
            "A named R2010+ table object declares no string stream; its name was not read.",
          ),
        );
        continue;
      }
      const name = readR2010ObjectName(bodyBytes, span);
      if (named !== "layer" && named !== "block") {
        tables[named].push(
          Object.freeze({
            handle: bound.handle,
            name,
            fields: Object.freeze({}),
          }),
        );
        continue;
      }
      if (named === "layer") {
        layers.push(
          Object.freeze({
            handle: bound.handle,
            name,
            // Medido que NO se pueden medir con este corpus — ver cabecera.
            colorIndex: undefined,
            stateFlags: undefined,
          }),
        );
      } else {
        blocks.push(
          Object.freeze({
            handle: bound.handle,
            name,
            blockBeginHandle: undefined,
            blockEndHandle: undefined,
            entities: Object.freeze([]),
          }),
        );
      }
      continue;
    }

    let body;
    try {
      body = readR2010EntityBody(bodyBytes, context.version, bound.handle);
    } catch {
      // Sin decodificador de cuerpo para este tipo: enumerado, nunca callado.
      unsupported.push(
        Object.freeze({ handle: bound.handle, type: header.type }),
      );
      continue;
    }

    const shape = deriveR2010HandleShape(bodyBytes, header);
    const references = interpretR2010HandleStream(
      readR2010HandleStream(bodyBytes, header),
      shape,
    );

    const record: Ac1015DatabaseEntityRecord = Object.freeze({
      handle: bound.handle,
      entity: body.entity,
      layerHandle: references.layer.handle,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    });

    // MISMA regla de colocación que el ensamblado AC1015, a propósito.
    if (shape.entityMode === 0) {
      // El corpus admitido no trae ni un objeto de modo 0, así que esta rama
      // está implementada pero NO medida, y lo dice cada vez que se usa.
      diagnostics.push(
        diagnostic(
          "r2010-owned-entity-not-measured",
          "warning",
          bound.start,
          "An R2010+ entity declares an owner; block membership is implemented but not exercised by the admitted corpus, so it was kept in model space.",
        ),
      );
    } else if (shape.entityMode === 1) {
      diagnostics.push(
        diagnostic(
          "database-paper-space-entity",
          "warning",
          bound.start,
          "A paper-space entity is not modeled yet; it was kept in model space.",
        ),
      );
    }
    modelSpace.push(record);
  }

  return Object.freeze({
    layers: Object.freeze(layers),
    blocks: Object.freeze(blocks),
    modelSpaceEntities: Object.freeze(modelSpace),
    insunits: context.insunits,
    tables: Object.freeze({
      styles: Object.freeze(tables.styles),
      linetypes: Object.freeze(tables.linetypes),
      dimstyles: Object.freeze(tables.dimstyles),
      appids: Object.freeze(tables.appids),
      vports: Object.freeze(tables.vports),
      views: Object.freeze(tables.views),
      ucss: Object.freeze(tables.ucss),
      mlinestyles: Object.freeze(tables.mlinestyles),
    }),
    dictionaries: Object.freeze([]),
    classMap: context.classMap,
    unsupported: Object.freeze(unsupported),
    diagnostics: Object.freeze(diagnostics),
  });
}
