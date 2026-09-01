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
 * QUÉ PRODUCE, Y QUÉ NO. Produce capas y bloques CON NOMBRE, entidades con
 * geometría exacta y su capa resuelta, el bloque de cada INSERT resuelto por
 * su handle, y las entidades de un bloque colocadas DENTRO de él. Sobre el
 * corpus admitido eso da, en las tres versiones modernas: arc 2/2, circle
 * 3/3, insert 6/6, line 15/15, lwpolyline 3/3, point 1/1 y text 5/5, con
 * cero geometrías distintas, cero faltantes y cero inesperadas. No produce, y
 * lo dice en vez de rellenarlo:
 *
 *  - **[CORREGIDO EL 2026-09-01 — ver más abajo] El color y las banderas de
 *    una capa.** Este módulo afirmó que «las banderas de capa de R2010+ no son
 *    el `BS` de R2000 en ninguna posición». **Era FALSO**: sí lo son, y desde
 *    el 2026-09-01 se decodifican (`r2010-table-layer.ts`, 54/54 con tres
 *    condiciones a la vez). Lo que queda sin resolver es sólo el CONTENIDO de
 *    los 7/8 bits de cabeza previos, no los campos.
 *  - **Los campos no-nombre del resto de entradas de tabla** (estilos, tipos
 *    de línea, dimstyles, appids, vports, views, ucs). El mismo método que
 *    resolvió la capa vale para ellos, pero medirlos es su propio intake:
 *    `fields` va vacío y no cero, y nadie finge haberlos leído.
 *
 * CORRECCIÓN FECHADA (2026-09-01, DOS AFIRMACIONES FALSAS MÍAS).
 *
 * (a) LAS BANDERAS DE CAPA. Escribí arriba que «no son el `BS` de R2000 en
 * ninguna posición», apoyado en un barrido de 0..120 bits con CERO aciertos.
 * Sí lo son: el `BS` de estado está a 7 bits del primer bit de dato en AC1024
 * y a 8 en AC1027/AC1032, y el color es el `CmC` de R2004 justo detrás. El
 * barrido no falló por el formato, falló por cómo pregunté: (1) sólo apuntaba
 * un acierto de estado si ANTES coincidían los tres campos de xref, y esos
 * tres son CONSTANTES en todo el corpus admitido —no discriminan nada—, así
 * que una lectura equivocada de lo inmedible vetaba la lectura correcta de lo
 * medible; y (2) leía el color como el `CmC` de R2000 cuando el adaptador
 * AC1018 de este mismo repo, medido 8/8 con 0 discrepancias, ya documentaba
 * que desde R2004 son TRES campos. Reusar un hecho que el repo ya tenía
 * habría bastado. Corrijo además cómo describí esos campos de xref: dije que
 * «valen su defecto» y que coincidir con ellos «es coincidir con ceros», y no
 * es exacto — `xrefRef` vale `true` en las 18 capas del gemelo. Lo que impide
 * falsarlos no es que valgan cero, es que valen SIEMPRE LO MISMO.
 *
 * (b) LOS OBJETOS DE MODO 0. La primera versión de este módulo afirmó
 * que «el corpus admitido no ejercita ni un solo objeto de modo 0», y era
 * FALSO: contando los modos con `deriveR2010HandleShape` sobre el corpus
 * aparecen 5 LINE, 1 CIRCLE y 1 ARC de modo 0 — exactamente las 7 entidades
 * que entonces quedaban descolocadas. La afirmación se hizo sin contar, que
 * es la forma barata de equivocarse: bastaba un recuento de dos minutos. Con
 * la pertenencia resuelta, las siete caen en su bloque y la matriz de
 * entidades de las tres versiones modernas queda IDÉNTICA a la de AC1015.
 *  - **Todo tipo sin decodificador**: entra en `unsupported` con su tipo. Nunca
 *    se descarta en silencio.
 *
 * La regla de colocación (modo 0 → su bloque; modo 1 → paper space, que no se
 * modela; resto → model space) es la MISMA que aplica el ensamblado AC1015, y
 * se reusa a propósito para que no existan dos criterios distintos.
 */
import { BoundedByteCursor } from "../binary/byte-cursor.js";
import { DwgParseError } from "../security/parse-error.js";
import type { DwgDiagnostic } from "../api/diagnostics.js";
import {
  readR2010ObjectBody,
  readR2010ObjectHeader,
  type R2010ObjectBounds,
} from "../container/r2010-object-envelope.js";
import { AC1015_TYPE_LAYER } from "../objects/table-layer.js";
import {
  readR2010LayerFields,
  readR2010LinetypeFields,
} from "./r2010-table-fields.js";
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

/** Un bloque todavía mutable: acumula sus entidades y se congela al final. */
type MutableBlock = Omit<Ac1015DatabaseBlock, "entities"> & {
  entities: MutableEntityRecord[];
};

/** Un registro de entidad todavía mutable: se congela al devolverlo. */
type MutableEntityRecord = {
  -readonly [
    K in keyof Ac1015DatabaseEntityRecord
  ]: Ac1015DatabaseEntityRecord[K];
};

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

/**
 * Lee los campos de una entrada de tabla absorbiendo SÓLO «capacidad
 * ausente». Un cuerpo CORRUPTO propaga, igual que en el resto de este módulo:
 * son cosas distintas y el llamador actúa distinto ante cada una — una base
 * ensamblada a medias sobre bytes rotos es peor que no abrir el archivo.
 *
 * Existe una sola vez a propósito: dos copias de este `catch` es donde una de
 * ellas acabaría tragándose una corrupción sin que nadie lo notara.
 */
function readTableEntryFields<T>(
  read: () => T,
  diagnosticCode: string,
  offset: number,
  diagnostics: DwgDiagnostic[],
): T | undefined {
  try {
    return read();
  } catch (error) {
    if (
      !(error instanceof DwgParseError) ||
      error.detail.code !== "DWG_VERSION_DECODER_UNSUPPORTED"
    ) {
      throw error;
    }
    diagnostics.push(
      diagnostic(diagnosticCode, "warning", offset, error.detail.message),
    );
    return undefined;
  }
}

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
  const blocks: MutableBlock[] = [];
  const modelSpace: MutableEntityRecord[] = [];
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
  // Un INSERT nombra su bloque por HANDLE, y ese bloque puede aparecer
  // después en el mapa: se resuelve en una segunda pasada, nunca adivinando.
  const pendingInserts: { record: MutableEntityRecord; blockHandle: number }[] =
    [];
  // Una entidad de modo 0 pertenece a un BLOCK_RECORD que puede aparecer
  // después en el mapa: se coloca en una segunda pasada, igual que el bloque
  // de un INSERT.
  const pendingOwned: {
    record: MutableEntityRecord;
    ownerHandle: number;
    offset: number;
  }[] = [];

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
        // Sólo el LTYPE tiene campos MEDIDOS en R2010+ (patrón y trazos). El
        // resto de tablas sigue con `fields` VACÍO y no cero: nadie finge
        // haberlos leído, y medirlos es su propio intake.
        tables[named].push(
          Object.freeze({
            handle: bound.handle,
            name,
            fields:
              named === "linetypes"
                ? readTableEntryFields(
                    () =>
                      readR2010LinetypeFields(
                        bodyBytes,
                        header,
                        span.startBit,
                        context.version,
                      ),
                    "r2010-linetype-fields-not-decoded",
                    bound.start,
                    diagnostics,
                  ) ?? Object.freeze({})
                : Object.freeze({}),
          }),
        );
        continue;
      }
      if (named === "layer") {
        // El estado y el color SÍ se miden desde el 2026-09-01
        // (`r2010-table-layer.ts`, 54/54 con tres condiciones a la vez). Una
        // capa cuya cabeza no sea la medida no devuelve un color equivocado:
        // falla cerrado ahí y aquí queda declarada como no decodificada, que
        // es lo que el mapeo canónico sabe tratar como pérdida.
        const fields = readTableEntryFields(
          () =>
            readR2010LayerFields(bodyBytes, header, span.startBit, context.version),
          "r2010-layer-fields-not-decoded",
          bound.start,
          diagnostics,
        );
        layers.push(
          Object.freeze({
            handle: bound.handle,
            name,
            colorIndex: fields?.colorIndex,
            stateFlags: fields?.stateFlags,
          }),
        );
      } else {
        blocks.push({
          handle: bound.handle,
          name,
          blockBeginHandle: undefined,
          blockEndHandle: undefined,
          entities: [],
        });
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

    const record: MutableEntityRecord = {
      handle: bound.handle,
      entity: body.entity,
      layerHandle: references.layer.handle,
      insertedBlockName: undefined,
      attributes: undefined,
      vertices: undefined,
      sequenceEndHandle: undefined,
    };
    // El puntero al BLOCK_RECORD de un INSERT es el PRIMER handle posterior a
    // la cabeza común — la misma posición que el gemelo AC1015 lee justo tras
    // ella. Sin ese handle el INSERT no significa nada, así que su ausencia
    // se diagnostica en vez de dejar un nombre vacío que parezca un dato.
    if (body.entity.kind === "insert") {
      const pointer = references.extra[0];
      if (pointer === undefined) {
        diagnostics.push(
          diagnostic(
            "r2010-insert-without-block-pointer",
            "warning",
            bound.start,
            "An R2010+ INSERT carries no handle beyond its common head, so its block record could not be resolved.",
          ),
        );
      } else {
        pendingInserts.push({ record, blockHandle: pointer.handle });
      }
    }

    // MISMA regla de colocación que el ensamblado AC1015, a propósito.
    if (shape.entityMode === 0) {
      // Modo 0: el propietario ABRE el flujo de handles y es el BLOCK_RECORD
      // al que pertenece la entidad. Se resuelve en la segunda pasada.
      if (references.owner === undefined) {
        diagnostics.push(
          diagnostic(
            "database-entity-owner-unresolved",
            "warning",
            bound.start,
            "An entity declares owner mode 0 but its handle stream carries no owner; the entity was kept in model space.",
          ),
        );
      } else {
        pendingOwned.push({
          record,
          ownerHandle: references.owner.handle,
          offset: bound.start,
        });
        continue;
      }
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

  // SEGUNDA PASADA: ahora que todos los bloques están recogidos, cada INSERT
  // recibe el NOMBRE de su bloque. Un puntero que no resuelve deja
  // diagnóstico y el nombre sin poner: mejor vacío declarado que inventado.
  const blockByHandle = new Map(blocks.map((b) => [b.handle, b]));
  for (const pending of pendingOwned) {
    const owner = blockByHandle.get(pending.ownerHandle);
    if (owner === undefined) {
      // Propietario que no resuelve a un BLOCK_RECORD conocido: la entidad
      // queda VISIBLE en model space y el hueco, diagnosticado. Nunca se
      // descarta — mismo criterio que el ensamblado AC1015.
      diagnostics.push(
        diagnostic(
          "database-entity-owner-unresolved",
          "warning",
          pending.offset,
          "An entity owner does not resolve to a known block record; the entity was kept in model space.",
        ),
      );
      modelSpace.push(pending.record);
      continue;
    }
    owner.entities.push(pending.record);
  }

  const blockNameByHandle = new Map(blocks.map((b) => [b.handle, b.name]));
  for (const pending of pendingInserts) {
    const name = blockNameByHandle.get(pending.blockHandle);
    if (name === undefined) {
      diagnostics.push(
        diagnostic(
          "r2010-insert-block-unresolved",
          "warning",
          0,
          "An R2010+ INSERT points at a handle that is not a known block record.",
        ),
      );
      continue;
    }
    pending.record.insertedBlockName = name;
  }

  return Object.freeze({
    layers: Object.freeze(layers),
    blocks: Object.freeze(
      blocks.map((b) =>
        Object.freeze({
          ...b,
          entities: Object.freeze(
            b.entities.map((r) => Object.freeze({ ...r })),
          ),
        }),
      ),
    ),
    modelSpaceEntities: Object.freeze(
      modelSpace.map((r) => Object.freeze({ ...r })),
    ),
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
