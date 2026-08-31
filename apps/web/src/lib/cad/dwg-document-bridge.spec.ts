/**
 * El puente DWG: probado entero, con la puerta cerrada.
 *
 * Esta spec tiene un trabajo que no es el habitual. No viene a demostrar que
 * una capacidad funciona: viene a demostrar que NO está disponible, que no se
 * puede habilitar por descuido y que el mapeo —lo único que se puede construir
 * sin firma— está escrito y probado para el día que la firma llegue.
 *
 * EL CASO QUE IMPORTA es el bloque «la bandera no se enciende sola». Si alguien
 * pone `DWG_IMPORT_FLAG = true` sin los gates, esta spec FALLA y el CI la
 * bloquea. No es un recordatorio: es el gate. ADR-0004 y ADR-0007 exigen otro
 * ADR, revisión jurídica, revisión de seguridad, corpus independiente y
 * evidencia de fidelidad ANTES de habilitar nada, y ninguna de esas cosas la
 * puede firmar un programa.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import {
  DWG_AC1018_BETA_AUTHORIZATION,
  DWG_BETA_AUTHORIZATION,
  DWG_IMPORT_DISABLED_REASON,
  DWG_IMPORT_FLAG,
  DWG_PROMOTION_GATES,
  DWG_REQUIRED_INDEPENDENT_VALIDATIONS,
  dwgAc1018BetaImportIsEnabled,
  dwgBetaImportIsEnabled,
  dwgImportIsEnabled,
  dwgPromotionBlockers,
  type DwgPromotionGates,
} from "./dwg-interop-flag";
import {
  DWG_BRIDGE_LOSS_CODES,
  DwgBridgeError,
  dwgBridgeStatus,
  dwgGeometryToPrimitive,
  dwgNeutralDatabaseToCadDocument,
  importDwgDocumentBytes,
} from "./dwg-document-bridge";
import {
  MAX_DWG_IMPORT_BYTES,
  importLimitForFileName,
  validateImportFile,
} from "./document-import";
import type { CadEntity } from "./cad-document";
import type {
  DwgNeutralDatabase,
  DwgNeutralEntityRecord,
  DwgNeutralPoint3,
} from "./dwg-neutral-model";

// ─── 1. LA BANDERA NO SE ENCIENDE SOLA ──────────────────────────────────────
// Va PRIMERO a propósito: si alguien la enciende, lo que tiene que leer es qué
// firmas le faltan, no un `true !== false` sin contexto.
if (DWG_IMPORT_FLAG) {
  assert.deepEqual(
    dwgPromotionBlockers(DWG_PROMOTION_GATES),
    [],
    "LA BANDERA DWG ESTÁ ENCENDIDA CON GATES PENDIENTES. ADR-0004 y ADR-0007 exigen ADR de promoción, revisión jurídica, revisión de seguridad, corpus independiente admitido, dos validaciones independientes y evidencia de fidelidad del mapping ANTES de habilitar la importación. Apágala o consigue las firmas.",
  );
  // Y aunque los gates se declararan firmados, la evidencia EJECUTABLE del
  // repositorio tiene que sostenerlo: declarar un hecho no lo hace cierto.
  const matrix = "../../docs/cad/evidence/dwg-decoder-matrix.json";
  assert.ok(
    existsSync(matrix),
    "con la bandera encendida, la evidencia del decodificador es obligatoria",
  );
  const evidence = JSON.parse(readFileSync(matrix, "utf8")) as {
    resumen: { bundlesAdmitidos: number; tiposVerificadosIndependientemente: number };
  };
  assert.ok(
    evidence.resumen.bundlesAdmitidos >= 1 &&
      evidence.resumen.tiposVerificadosIndependientemente >= 1,
    "con la bandera encendida, la evidencia tiene que mostrar corpus admitido y tipos verificados fuera del laboratorio; hoy dice cero de las dos cosas",
  );
}

// ─── 2. La bandera está apagada y el gate cerrado ───────────────────────────
assert.equal(DWG_IMPORT_FLAG, false, "la bandera de importación DWG nace y permanece APAGADA");
assert.equal(dwgImportIsEnabled(), false, "y con ella apagada la importación no está habilitada");
assert.ok(
  dwgPromotionBlockers().length >= 7,
  "hoy faltan TODOS los gates de promoción, y constan uno a uno",
);
assert.ok(
  dwgPromotionBlockers().some((blocker) => blocker.includes("ADR de promoción")),
  "el primer bloqueo es el ADR que ningún programa puede firmar",
);
assert.equal(
  DWG_PROMOTION_GATES.admittedCorpusBundles,
  0,
  "cero bundles admitidos en el corpus independiente",
);
assert.equal(
  DWG_PROMOTION_GATES.independentValidations,
  0,
  "cero validaciones independientes autorizadas",
);
assert.equal(DWG_REQUIRED_INDEPENDENT_VALIDATIONS, 2, "la política exige dos oráculos, no uno");

// Encenderla sin gates NO abre la puerta: el gate es una conjunción.
assert.equal(
  dwgImportIsEnabled(true, DWG_PROMOTION_GATES),
  false,
  "encender la bandera con los gates pendientes deja la importación cerrada: fallo cerrado",
);

const gatesFirmados: DwgPromotionGates = {
  promotionAdrSigned: true,
  legalReviewCleared: true,
  securityReviewCleared: true,
  admittedCorpusBundles: 1,
  independentValidations: 2,
  labEntityImportSupported: true,
  canonicalMappingVerified: true,
};
assert.deepEqual(dwgPromotionBlockers(gatesFirmados), [], "con todo firmado no queda bloqueo");
assert.equal(
  dwgImportIsEnabled(true, gatesFirmados),
  true,
  "y sólo entonces la importación quedaría habilitada: el cierre de hoy es un resultado, no una constante",
);
assert.equal(
  dwgImportIsEnabled(false, gatesFirmados),
  false,
  "con todos los gates firmados pero la bandera apagada, sigue cerrado",
);
for (const gate of Object.keys(gatesFirmados) as Array<keyof DwgPromotionGates>) {
  const uno = { ...gatesFirmados, [gate]: typeof gatesFirmados[gate] === "number" ? 0 : false };
  assert.equal(
    dwgImportIsEnabled(true, uno),
    false,
    `basta con que falte ${gate} para que el gate siga cerrado`,
  );
}

// ─── 2-bis. Las betas acotadas son conjunciones, no banderas sueltas ───────
// `DWG_BETA_AUTHORIZATION`/`DWG_AC1018_BETA_AUTHORIZATION` no tenían spec
// propia hasta ahora; se prueban aquí, junto a los gates que sí la tenían,
// porque son la misma familia de mecanismo (ADR-0009 §6-bis/§7).
assert.equal(dwgBetaImportIsEnabled(false), false, "la variable apagada cierra la beta base");
assert.equal(
  dwgBetaImportIsEnabled(true),
  DWG_BETA_AUTHORIZATION.ownerSigned,
  "encendida, depende SÓLO de la firma registrada — hoy true, porque §6-bis la firmó",
);
assert.equal(
  dwgAc1018BetaImportIsEnabled(false, true),
  false,
  "la variable de AC1018 apagada cierra AC1018 aunque la beta base esté encendida",
);
assert.equal(
  dwgAc1018BetaImportIsEnabled(true, false),
  false,
  "AC1018 encendido no basta: sin la beta base, sigue cerrado — nunca una vía independiente",
);
assert.equal(
  dwgAc1018BetaImportIsEnabled(true, true),
  DWG_AC1018_BETA_AUTHORIZATION.ownerSigned && DWG_BETA_AUTHORIZATION.ownerSigned,
  "las dos variables encendidas: depende de las dos firmas registradas",
);
assert.equal(DWG_BETA_AUTHORIZATION.profile, "AC1015_MODELSPACE_2D_V3");
assert.equal(DWG_AC1018_BETA_AUTHORIZATION.profile, "AC1018_MODELSPACE_2D_V1");
assert.equal(
  DWG_BETA_AUTHORIZATION.legalReviewStatus,
  "pending_parallel",
  "encender este archivo no puede convertirse en legalReviewCleared:true en DWG_PROMOTION_GATES",
);
assert.equal(DWG_AC1018_BETA_AUTHORIZATION.legalReviewStatus, "pending_parallel");

// ─── 3. La interfaz de importación sigue rechazando .dwg ────────────────────
assert.throws(
  () => validateImportFile("plano.dwg", 1000),
  /no soportado/i,
  "la interfaz de importación rechaza .dwg mientras el gate esté cerrado",
);
assert.throws(() => validateImportFile("PLANO.DWG", 1000), /no soportado/i, "y da igual la caja");
assert.equal(
  importLimitForFileName("plano.dwg"),
  MAX_DWG_IMPORT_BYTES,
  "el límite del binario está declarado aunque hoy no se pueda alcanzar",
);
const estado = dwgBridgeStatus();
assert.equal(estado.available, false, "el estado del puente dice que no está disponible");
assert.equal(estado.reason, DWG_IMPORT_DISABLED_REASON, "con la razón exacta y accionable");
assert.match(estado.reason, /DXF/u, "y la salida real —exportar a DXF— va primero");
assert.doesNotMatch(
  DWG_IMPORT_DISABLED_REASON,
  /compatible con DWG|soporte DWG|reemplaza(?:r)? a AutoCAD|sustituye a AutoCAD/iu,
  "la razón no cuela ningún claim que el producto no cumpla",
);

// ─── 4. La mitad que toca bytes falla CERRADO y tipado ──────────────────────
const bytes = new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x31, 0x35]);
assert.throws(
  () => importDwgDocumentBytes(bytes),
  (error: unknown) =>
    error instanceof DwgBridgeError &&
    error.code === "DWG_IMPORT_DISABLED" &&
    error.blockers.length > 0,
  "importar bytes falla con error tipado, no con un resultado a medias",
);
// Ni siquiera pasando un decodificador se salta el gate.
assert.throws(
  () => importDwgDocumentBytes(bytes, () => vacia),
  (error: unknown) => error instanceof DwgBridgeError && error.code === "DWG_IMPORT_DISABLED",
  "traer un decodificador propio no abre la puerta: la bandera se comprueba antes",
);

// ─── 5. El mapeo, que es lo que sí se puede construir hoy ───────────────────
const p3 = (x: number, y: number, z = 0): DwgNeutralPoint3 => ({ x, y, z });
const bytesDe = (text: string): number[] => [...text].map((char) => char.charCodeAt(0) & 0xff);
const registro = (
  handle: number,
  entity: DwgNeutralEntityRecord["entity"],
  layerHandle?: number,
  insertedBlockName?: number[],
  attributes?: DwgNeutralEntityRecord[],
  vertices?: DwgNeutralEntityRecord[],
): DwgNeutralEntityRecord => ({
  handle,
  entity,
  layerHandle,
  insertedBlockName,
  attributes,
  vertices,
});

const vacia: DwgNeutralDatabase = {
  layers: [],
  blocks: [],
  modelSpaceEntities: [],
  insunits: 0,
  unsupported: [],
  diagnostics: [],
};
// Fallo cerrado (Fase 3, hallazgo del subagente de fidelidad): antes de este
// arreglo una base vacía producía un documento "exitoso" con cero entidades
// — exactamente el éxito silencioso que DXF y shapefile ya rechazan en este
// mismo producto. Ahora DWG hace lo mismo, sin excepción.
assert.throws(
  () => dwgNeutralDatabaseToCadDocument(vacia),
  /ninguna de sus entidades produjo algo importable/,
  "una base sin entidades ni bloques falla cerrado, no produce un documento vacío 'exitoso'",
);
// Una base con SÓLO un bloque (sin nada en model space) sigue contando como
// contenido útil — mismo criterio que ya usa el importador DXF.
const soloBloque: DwgNeutralDatabase = {
  layers: [],
  blocks: [
    {
      handle: 0x50,
      name: bytesDe("MARCO"),
      blockBeginHandle: 0x51,
      blockEndHandle: 0x52,
      entities: [
        registro(
          0x53,
          { kind: "line", start: p3(0, 0), end: p3(10, 0), thickness: 0, extrusion: p3(0, 0, 1) },
        ),
      ],
    },
  ],
  modelSpaceEntities: [],
  insunits: 0,
  unsupported: [],
  diagnostics: [],
};
const informeSoloBloque = dwgNeutralDatabaseToCadDocument(soloBloque);
assert.equal(
  informeSoloBloque.importedBlockCount,
  1,
  "una base sin nada en model space pero con un bloque definido no falla: el bloque es contenido real",
);
assert.ok(
  informeSoloBloque.document.layers.some((layer) => layer.id === "0"),
  "la capa 0 existe siempre, como en cualquier dibujo",
);
assert.ok(
  informeSoloBloque.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.unitAssumed,
  ),
  "las unidades asumidas se declaran SIEMPRE, prominente y persistente, no sólo cuando algo falta",
);

const base: DwgNeutralDatabase = {
  insunits: 0,
  layers: [
    { handle: 0x10, name: bytesDe("MUROS"), colorIndex: 1, stateFlags: 0 },
    { handle: 0x11, name: bytesDe("COTASÑ"), colorIndex: 2, stateFlags: 0 },
  ],
  blocks: [
    {
      handle: 0x20,
      name: bytesDe("PUERTA"),
      blockBeginHandle: 0x21,
      blockEndHandle: 0x22,
      entities: [
        registro(
          0x23,
          {
            kind: "line",
            start: p3(0, 0),
            end: p3(90, 0),
            thickness: 0,
            extrusion: p3(0, 0, 1),
          },
          0x10,
        ),
      ],
    },
  ],
  modelSpaceEntities: [
    registro(
      0x30,
      { kind: "line", start: p3(0, 0), end: p3(100, 50), thickness: 0, extrusion: p3(0, 0, 1) },
      0x10,
    ),
    registro(
      0x31,
      { kind: "circle", center: p3(10, 10), radius: 5, thickness: 0, extrusion: p3(0, 0, 1) },
      0x10,
    ),
    registro(
      0x32,
      {
        kind: "arc",
        center: p3(20, 20),
        radius: 4,
        thickness: 0,
        extrusion: p3(0, 0, 1),
        startAngle: 0,
        endAngle: Math.PI / 2,
      },
      0x11,
    ),
    registro(
      0x33,
      {
        kind: "lwpolyline",
        closed: true,
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        bulges: [0, 0.5, 0],
        widths: undefined,
        constantWidth: undefined,
        elevation: undefined,
        thickness: undefined,
        extrusion: undefined,
      },
      0x10,
    ),
    registro(
      0x34,
      {
        kind: "text",
        insertion: { x: 5, y: 5 },
        elevation: undefined,
        alignment: undefined,
        thickness: 0,
        extrusion: p3(0, 0, 1),
        obliqueAngle: undefined,
        rotation: 0,
        height: 2.5,
        widthFactor: undefined,
        valueBytes: bytesDe("SALÓN"),
        generation: undefined,
        horizontalAlignment: undefined,
        verticalAlignment: undefined,
      },
      0x11,
    ),
    registro(
      0x35,
      {
        kind: "insert",
        position: p3(50, 50),
        scale: p3(1, 1, 1),
        rotation: 0,
        extrusion: p3(0, 0, 1),
        attributesFollow: true,
      },
      0x10,
      bytesDe("PUERTA"),
    ),
    // Capa que no existe en la tabla: cae a "0" y CONSTA.
    registro(
      0x36,
      { kind: "point", position: p3(1, 2), thickness: 0, extrusion: p3(0, 0, 1), xAxisAngle: 0 },
      0x99,
    ),
    // INSERT cuyo bloque no resolvió: no se coloca y consta como error.
    registro(
      0x37,
      {
        kind: "insert",
        position: p3(0, 0),
        scale: p3(1, 1, 1),
        rotation: 0,
        extrusion: p3(0, 0, 1),
        attributesFollow: false,
      },
      0x10,
    ),
  ],
  unsupported: [{ handle: 0x40, type: 44 }],
  diagnostics: [
    { code: "DWG_OWNER_UNRESOLVED", severity: "warning", offset: 1024, message: "propietario desconocido" },
  ],
};

const informe = dwgNeutralDatabaseToCadDocument(base);
assert.equal(informe.format, "dwg");
assert.ok(informe.importedEntityCount >= 6, "las entidades de model space llegan al documento");
assert.equal(informe.importedBlockCount, 1, "el bloque llega como definición");
assert.ok(
  informe.document.layers.some((layer) => layer.id === "MUROS"),
  "las capas del dibujo llegan con su nombre",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "line"),
  "una LINE vuelve línea",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "circle"),
  "un CIRCLE vuelve círculo",
);
assert.ok(
  informe.document.entities.some((entity) => entity.type === "insert"),
  "un INSERT resuelto vuelve referencia de bloque",
);
assert.equal(
  informe.document.modelSpace?.entityIds.length,
  informe.document.entities.length,
  "el orden del mapa de objetos es el orden de dibujo",
);

const codigos = new Set(informe.document.lossManifest.map((entry) => entry.code));
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.unsupportedObject), "lo no decodificado se PUBLICA");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.diagnostic), "los diagnósticos del decodificador también");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.danglingLayer), "una capa que no resuelve consta");
assert.ok(codigos.has(DWG_BRIDGE_LOSS_CODES.danglingBlock), "un INSERT que no resuelve consta");
assert.ok(
  codigos.has(DWG_BRIDGE_LOSS_CODES.codePage),
  "un nombre con bytes fuera de ASCII declara que la página de códigos no se decodifica",
);
assert.ok(
  informe.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.danglingBlock && entry.severity === "error",
  ),
  "un INSERT sin bloque es error, no aviso: falta geometría en el plano",
);

// ─── Fase 3: color ACI real, no una paleta rotatoria inventada ─────────────
const muros = informe.document.layers.find((layer) => layer.id === "MUROS");
const cotas = informe.document.layers.find((layer) => layer.id === "COTASÑ");
assert.equal(muros?.color, "#ff0000", "ACI 1 es rojo exacto — la tabla real, no una posición de array");
assert.equal(cotas?.color, "#ffff00", "ACI 2 es amarillo exacto");
assert.equal(
  informe.document.layers.find((layer) => layer.id === "0")?.color,
  "#ffffff",
  "la capa 0 sintética usa ACI 7 (blanco), el default tradicional de AutoCAD",
);

// ─── Fase 3: unidades asumidas cuando INSUNITS no es representable ────────
assert.ok(
  codigos.has(DWG_BRIDGE_LOSS_CODES.unitAssumed),
  "INSUNITS=0 (sin unidad, el valor de `base`) no es representable: se asume mm y se declara",
);
assert.equal(
  informe.document.meta.unit,
  "mm",
  "sin unidad representable, el documento sigue asumiendo milímetros",
);

// ─── INSUNITS mapeado: unidad real, sin pérdida inventada ──────────────────
const enMetros: DwgNeutralDatabase = { ...base, insunits: 6 };
const informeEnMetros = dwgNeutralDatabaseToCadDocument(enMetros);
assert.equal(
  informeEnMetros.document.meta.unit,
  "m",
  "INSUNITS=6 (metros) se lee de verdad: el documento nace en metros, no en el mm por defecto",
);
assert.ok(
  !informeEnMetros.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.unitAssumed,
  ),
  "con una unidad representable, no hay nada que asumir: la pérdida no se declara",
);
const sinUnidadDeclarada: DwgNeutralDatabase = { ...base, insunits: 7 };
const informeSinUnidadDeclarada = dwgNeutralDatabaseToCadDocument(sinUnidadDeclarada);
assert.ok(
  informeSinUnidadDeclarada.document.lossManifest.some(
    (entry) =>
      entry.code === DWG_BRIDGE_LOSS_CODES.unitAssumed && entry.detail.includes("INSUNITS=7"),
  ),
  "INSUNITS=7 (kilómetros) se leyó, pero el perfil no lo representa: la pérdida nombra el valor real, no un genérico",
);

// ─── Fase 3: punto base de bloque, declarado como suposición ──────────────
assert.ok(
  codigos.has(DWG_BRIDGE_LOSS_CODES.blockBasePointAssumed),
  "el punto base {0,0} del bloque PUERTA se declara como suposición, no se esconde",
);

// ─── Fase 3: stateFlags de capa crudo, sin adivinar su semántica ──────────
const conBanderas: DwgNeutralDatabase = {
  ...base,
  layers: [
    { handle: 0x10, name: bytesDe("MUROS"), colorIndex: 1, stateFlags: 1 },
    { handle: 0x11, name: bytesDe("COTASÑ"), colorIndex: 2, stateFlags: 0 },
  ],
};
const informeBanderas = dwgNeutralDatabaseToCadDocument(conBanderas);
assert.ok(
  informeBanderas.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerStateFlags && entry.detail.includes("MUROS"),
  ),
  "stateFlags!=0 en MUROS se declara como pérdida específica de esa capa",
);
assert.equal(
  informeBanderas.document.lossManifest.filter(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.layerStateFlags,
  ).length,
  1,
  "COTASÑ tiene stateFlags=0: no genera pérdida — sólo se declara lo que de verdad está presente",
);
assert.equal(
  informeBanderas.document.layers.find((layer) => layer.id === "MUROS")?.visible,
  true,
  "sin semántica de bit confirmada, la capa se importa visible en vez de adivinar 'apagada'",
);

// ─── Fase 3: propiedades de TEXT/LWPOLYLINE que no caben en la primitiva ──
const conPropiedadesNoDefault: DwgNeutralDatabase = {
  layers: [],
  blocks: [],
  insunits: 0,
  modelSpaceEntities: [
    registro(0x60, {
      kind: "text",
      insertion: p3(0, 0),
      elevation: undefined,
      alignment: undefined,
      thickness: 0,
      extrusion: p3(0, 0, 1),
      obliqueAngle: 0.2,
      rotation: Math.PI / 4,
      height: 2.5,
      widthFactor: 0.8,
      valueBytes: bytesDe("ROTADO"),
      generation: undefined,
      horizontalAlignment: 1,
      verticalAlignment: 0,
    }),
    registro(0x61, {
      kind: "lwpolyline",
      closed: false,
      vertices: [p3(0, 0), p3(5, 0)],
      bulges: undefined,
      widths: undefined,
      constantWidth: 1.5,
      elevation: 3,
      thickness: undefined,
      extrusion: undefined,
    }),
  ],
  unsupported: [],
  diagnostics: [],
};
const informeNoDefault = dwgNeutralDatabaseToCadDocument(conPropiedadesNoDefault);
const perdidasPrimitiva = informeNoDefault.document.lossManifest.filter(
  (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.primitiveProperty,
);
assert.equal(perdidasPrimitiva.length, 2, "TEXT y LWPOLYLINE con propiedades no-default declaran cada uno su pérdida");
assert.ok(
  perdidasPrimitiva.some(
    (entry) =>
      entry.sourceType === "text" &&
      /rotación/.test(entry.detail) &&
      /factor de ancho/.test(entry.detail) &&
      /ángulo oblicuo/.test(entry.detail) &&
      /alineación/.test(entry.detail),
  ),
  "el TEXT rotado declara CADA propiedad que se descartó, no un aviso genérico",
);
assert.ok(
  perdidasPrimitiva.some(
    (entry) =>
      entry.sourceType === "lwpolyline" &&
      /elevación/.test(entry.detail) &&
      /ancho constante/.test(entry.detail),
  ),
  "la LWPOLYLINE con elevación/ancho constante declara ambas propiedades",
);
// El TEXT "SALÓN" de la base original es todo-default: no debe generar ruido.
assert.ok(
  !informe.document.lossManifest.some(
    (entry) => entry.code === DWG_BRIDGE_LOSS_CODES.primitiveProperty,
  ),
  "un TEXT/LWPOLYLINE con sólo valores por defecto no genera una pérdida falsa",
);

// ─── ATTRIB de INSERT: el mapa tag→valor que ya decodifica el laboratorio ──
// `record.attributes` (fase D4 del laboratorio, ya estrechada al perfil V3
// por la frontera de producto) llega al mismo destino que ya usa DXF: el
// `attributes: Record<string,string>` de `CadDxfSemanticInsert`, proyectado
// por las mismas `cadDxfBlocksToCadDocumentParts`/`semanticInsertToEntity`.
const numeroDeParte = registro(
  0x71,
  {
    kind: "attrib",
    insertion: { x: 55, y: 52 },
    elevation: undefined,
    alignment: undefined,
    thickness: 0,
    extrusion: p3(0, 0, 1),
    obliqueAngle: undefined,
    rotation: undefined,
    height: 2.5,
    widthFactor: undefined,
    valueBytes: bytesDe("HB-2026-014"),
    generation: undefined,
    horizontalAlignment: undefined,
    verticalAlignment: undefined,
    tagBytes: bytesDe("PARTNO"),
    fieldLength: 0,
    attributeFlags: 0,
  },
  0x10,
);
const modelo = registro(
  0x72,
  {
    kind: "attrib",
    insertion: { x: 55, y: 49 },
    elevation: undefined,
    alignment: undefined,
    thickness: 0,
    extrusion: p3(0, 0, 1),
    obliqueAngle: undefined,
    rotation: undefined,
    height: 2.5,
    widthFactor: undefined,
    valueBytes: bytesDe("PVC-60"),
    generation: undefined,
    horizontalAlignment: undefined,
    verticalAlignment: undefined,
    tagBytes: bytesDe("MODELO"),
    fieldLength: 0,
    attributeFlags: 0,
  },
  0x10,
);
const conAtributos: DwgNeutralDatabase = {
  layers: [],
  blocks: [
    {
      handle: 0x70,
      name: bytesDe("CAJETIN"),
      blockBeginHandle: 0x73,
      blockEndHandle: 0x74,
      entities: [],
    },
  ],
  insunits: 0,
  modelSpaceEntities: [
    registro(
      0x75,
      {
        kind: "insert",
        position: p3(55, 55),
        scale: p3(1, 1, 1),
        rotation: 0,
        extrusion: p3(0, 0, 1),
        attributesFollow: true,
      },
      undefined,
      bytesDe("CAJETIN"),
      [numeroDeParte, modelo],
    ),
  ],
  unsupported: [],
  diagnostics: [],
};
const informeAtributos = dwgNeutralDatabaseToCadDocument(conAtributos);
const insertConAtributos = informeAtributos.document.entities.find(
  (entity) => entity.type === "insert",
) as Extract<CadEntity, { type: "insert" }> | undefined;
assert.deepEqual(
  insertConAtributos?.attributes,
  { PARTNO: "HB-2026-014", MODELO: "PVC-60" },
  "los ATTRIB atados al INSERT llegan como el mismo mapa tag→valor que ya usa DXF",
);
assert.ok(
  !informeAtributos.document.lossManifest.some(
    (entry) =>
      entry.code === DWG_BRIDGE_LOSS_CODES.unsupportedObject && entry.sourceType === "attrib",
  ),
  "con los atributos resueltos, ya no se declara la pérdida de 'atributos sin atar'",
);

// La anomalía real —`attributesFollow` en `true` sin ningún ATTRIB atado, el
// INSERT 0x35 de `base` (arriba)— sigue constando, con el motivo correcto en
// vez del genérico "todavía no lee" que ya no es verdad.
assert.ok(
  informe.document.lossManifest.some(
    (entry) =>
      entry.code === DWG_BRIDGE_LOSS_CODES.unsupportedObject &&
      entry.sourceType === "attrib" &&
      entry.detail.includes("ninguno se pudo atar"),
  ),
  "un INSERT que declara atributos sin ninguno atado sigue constando, con el motivo correcto",
);

// Ángulos: el modelo neutral habla radianes y el canónico grados.
const arco = dwgGeometryToPrimitive(
  {
    kind: "arc",
    center: p3(0, 0),
    radius: 1,
    thickness: 0,
    extrusion: p3(0, 0, 1),
    startAngle: 0,
    endAngle: Math.PI,
  },
  "0",
);
assert.equal(arco?.endAngle, 180, "π radianes son 180 grados, convertidos UNA vez en el puente");
const poli = dwgGeometryToPrimitive(
  {
    kind: "lwpolyline",
    closed: false,
    vertices: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    bulges: [0.25, 0],
    widths: undefined,
    constantWidth: undefined,
    elevation: undefined,
    thickness: undefined,
    extrusion: undefined,
  },
  "0",
);
assert.equal(poli?.points[0].bulge, 0.25, "el bulge se queda en el vértice donde arranca el segmento");
assert.equal(poli?.points[1].bulge, undefined, "un bulge cero no se escribe: ausencia es recto");

console.log(
  "dwg-document-bridge: bandera APAGADA, gate cerrado con 7 bloqueos, .dwg rechazado, mapeo " +
    "neutral→canónico probado con sus pérdidas declaradas, ATTRIB de INSERT proyectado al mismo " +
    "mapa tag→valor que DXF (ver dwg-document-bridge-entities.spec.ts para " +
    "ELLIPSE/SPLINE/MTEXT/DIMENSION/HATCH)",
);
