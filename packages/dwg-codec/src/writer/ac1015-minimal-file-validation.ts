/**
 * QUÉ OPCIONES ACEPTA un archivo mínimo AC1015 — la puerta de entrada, con
 * fallo cerrado.
 *
 * Vive aparte de `ac1015-minimal-file-support.ts` desde el 2026-09-04, cuando
 * el intake del ESPACIO PAPEL empujó aquel archivo por encima del presupuesto
 * de 800 líneas del monorepo. La costura tiene sentido propio y no es un corte
 * por tamaño: allá quedan las SECCIONES auxiliares del archivo —AuxHeader,
 * previsualización, ObjFreeSpace, second header— y los tipos públicos, que son
 * bytes y disposiciones; aquí queda el criterio de qué entrada es escribible,
 * que es lo que crece cada vez que el archivo aprende a llevar algo nuevo.
 *
 * El contrato de todo lo de aquí es el mismo: o vuelve sin decir nada, o falla
 * CERRADO con su error tipado. Nada corrige, redondea ni completa un campo
 * ausente: un archivo a medias desplaza bits y un lector ajeno lee otro dibujo,
 * no un dibujo incompleto.
 */
import type { DwgGeometryEntity } from "../model/entity-geometry.js";
import { throwDwgError } from "../security/parse-error.js";
import type {
  Ac1015MinimalFileBlockSpec,
  Ac1015MinimalFileEntitySpec,
  Ac1015MinimalFileLayerSpec,
  Ac1015MinimalFileLinetypeSpec,
  Ac1015MinimalFileOptions,
  Ac1015MinimalFileSpace,
} from "./ac1015-minimal-file-support.js";


/** Un bloque YA normalizado: sus entidades son siempre la forma larga. */
export interface ValidatedBlockSpec {
  readonly name: readonly number[];
  readonly entities: readonly Ac1015MinimalFileEntitySpec[];
}

export interface ValidatedOptions {
  readonly layers: readonly Ac1015MinimalFileLayerSpec[];
  readonly linetypes: readonly Ac1015MinimalFileLinetypeSpec[];
  readonly blocks: readonly ValidatedBlockSpec[];
  /** Las entidades sueltas de model space, en el orden de las opciones. */
  readonly modelEntities: readonly Ac1015MinimalFileEntitySpec[];
  /** Las de la HOJA, en el orden de las opciones. Cadena aparte. */
  readonly paperEntities: readonly Ac1015MinimalFileEntitySpec[];
  readonly measurement: 0 | 1;
}

/**
 * Resuelve la forma corta de una entidad de bloque (`DwgGeometryEntity` a
 * secas) a la larga (`{ entity }`, capa "0" implícita) — la forma larga pasa
 * tal cual. El discriminador es la presencia de `entity`: ninguna entidad
 * neutral del modelo tiene ese campo en su nivel superior.
 */
function normalizeBlockEntity(
  item: Ac1015MinimalFileBlockSpec["entities"][number],
): Ac1015MinimalFileEntitySpec {
  if (typeof item === "object" && item !== null && "entity" in item) {
    return item as Ac1015MinimalFileEntitySpec;
  }
  return { entity: item as DwgGeometryEntity };
}

export function validateOptions(options: Ac1015MinimalFileOptions): ValidatedOptions {
  if (typeof options !== "object" || options === null) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file options must be an object.",
    );
  }
  const layers = options.layers ?? [];
  const linetypes = options.linetypes ?? [];
  const blocks = options.blocks ?? [];
  const entities = options.entities ?? [];
  const measurement = options.measurement ?? 0;
  if (
    !Array.isArray(layers) ||
    !Array.isArray(linetypes) ||
    !Array.isArray(blocks) ||
    !Array.isArray(entities)
  ) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The minimal file layers, linetypes, blocks and entities must be arrays.",
    );
  }
  if (measurement !== 0 && measurement !== 1) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The MEASUREMENT variable must be 0 (English) or 1 (metric).",
    );
  }
  for (const layer of layers) {
    assertNameBytes(layer.name, "A minimal file layer name");
  }
  const normalizedBlocks: ValidatedBlockSpec[] = blocks.map((block) => {
    assertNameBytes(block.name, "A minimal file block name");
    if (!Array.isArray(block.entities)) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A minimal file block needs an entities array.",
      );
    }
    const normalizedEntities = block.entities.map(normalizeBlockEntity);
    for (const spec of normalizedEntities) {
      assertEntitySpec(spec, layers, blocks.length, true);
    }
    return { name: block.name, entities: normalizedEntities };
  });
  entities.forEach((spec) => {
    assertEntitySpec(spec, layers, blocks.length);
  });
  // EL REPARTO POR ESPACIO SE HACE UNA SOLA VEZ, AQUÍ. El plan de handles y
  // el armado del archivo tienen que ver EXACTAMENTE la misma partición: dos
  // filtros gemelos podrían separarse y dejar la cadena de un espacio
  // apuntando a handles del otro, que es un archivo que sólo se ve mal al
  // abrirlo con un lector ajeno.
  return {
    layers,
    linetypes,
    blocks: normalizedBlocks,
    modelEntities: entities.filter((spec) => spaceOfEntitySpec(spec) === "model"),
    paperEntities: entities.filter((spec) => spaceOfEntitySpec(spec) === "paper"),
    measurement,
  };
}

/** El espacio declarado de una entidad suelta; ausente = model space. */
export function spaceOfEntitySpec(
  spec: Ac1015MinimalFileEntitySpec,
): Ac1015MinimalFileSpace {
  return spec.space ?? "model";
}

/**
 * Un `Ac1015MinimalFileEntitySpec` es válido tanto en model space como
 * dentro de un bloque — misma forma, misma validación (cero marcos gemelos).
 * Un INSERT dentro de un bloque referencia OTRO bloque por índice, igual que
 * en model space: el handle de cada BLOCK_RECORD ya está resuelto por
 * adelantado (`planAc1015MinimalFile`), así que una referencia hacia
 * adelante en `blocks` resuelve igual que una hacia atrás.
 */
function assertEntitySpec(
  spec: Ac1015MinimalFileEntitySpec,
  layers: readonly Ac1015MinimalFileLayerSpec[],
  blocksCount: number,
  insideBlock = false,
): void {
  if (spec.space !== undefined) {
    if (spec.space !== "model" && spec.space !== "paper") {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "A minimal file entity space must be either model or paper.",
      );
    }
    if (insideBlock) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An entity inside a block cannot declare a space of its own: its space is the block.",
      );
    }
  }
  if (spec.entity.kind === "viewport" && insideBlock) {
    // Una VENTANA es una entidad de HOJA, no contenido reutilizable: el
    // corpus no muestra ninguna dentro de un bloque de usuario y escribirla
    // ahí estrenaría una forma que nadie ha medido.
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A viewport entity cannot live inside a user block.",
    );
  }
  const layerIndex = spec.layerIndex ?? 0;
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex > layers.length) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "A minimal file entity layer index escapes the declared layers.",
    );
  }
  if (spec.entity.kind === "insert") {
    const blockIndex = spec.insertBlockIndex;
    if (
      blockIndex === undefined ||
      !Number.isInteger(blockIndex) ||
      blockIndex < 0 ||
      blockIndex >= blocksCount
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An INSERT entity needs the index of a declared block.",
      );
    }
    assertAttributeSpecs(spec, layers);
  } else if (spec.attributes !== undefined) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Only an INSERT entity may carry ATTRIB entities.",
    );
  } else if (spec.insertBlockIndex !== undefined) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "Only an INSERT entity may name an inserted block.",
    );
  }
}

/**
 * LOS ATRIBUTOS Y SU BANDERA SE COMPRUEBAN JUNTOS. `attributesFollow` es lo
 * que un lector ajeno mira para decidir si va a buscar los ATTRIB; los specs
 * son los objetos que encontrará. Un INSERT con la bandera encendida y sin
 * atributos manda al lector a buscar algo que no existe, y uno con atributos
 * y la bandera apagada escribe objetos que nadie va a leer. Las dos formas
 * son un archivo que se contradice a sí mismo, así que las dos fallan
 * cerrado aquí, antes de repartir un solo handle.
 */
function assertAttributeSpecs(
  spec: Ac1015MinimalFileEntitySpec,
  layers: readonly Ac1015MinimalFileLayerSpec[],
): void {
  const attributes = spec.attributes;
  const declared =
    spec.entity.kind === "insert" && spec.entity.attributesFollow === true;
  if (attributes !== undefined && !Array.isArray(attributes)) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "The ATTRIB entities of an INSERT must be an array.",
    );
  }
  const count = attributes?.length ?? 0;
  if (declared !== count > 0) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      "An INSERT must declare attributesFollow exactly when it carries ATTRIB entities.",
    );
  }
  for (const attribute of attributes ?? []) {
    if (attribute?.entity?.kind !== "attrib") {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "The attributes of an INSERT must be ATTRIB entities.",
      );
    }
    const layerIndex = attribute.layerIndex;
    if (
      layerIndex !== undefined &&
      (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex > layers.length)
    ) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        "An ATTRIB layer index escapes the declared layers.",
      );
    }
  }
}

function assertNameBytes(name: readonly number[], what: string): void {
  if (!Array.isArray(name) || name.length < 1 || name.length > 0xff) {
    throwDwgError(
      "DWG_INPUT_INVALID",
      "input",
      0,
      `${what} needs between 1 and 255 byte values.`,
    );
  }
  for (const byte of name) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throwDwgError(
        "DWG_INPUT_INVALID",
        "input",
        0,
        `${what} must hold byte values between 0 and 255.`,
      );
    }
  }
}
