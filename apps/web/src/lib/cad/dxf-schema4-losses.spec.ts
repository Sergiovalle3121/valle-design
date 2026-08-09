import assert from "node:assert/strict";
import {
  cadDocumentDxfExportLosses,
  cadDocumentNativeDxfPrimitives,
} from "./dxf-cad-document";
import { CAD_SCHEMA_4_ENTITY_TYPES, type CadDocument, type CadEntity } from "./cad-document";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

/**
 * La regla ANTI-SILENCIO de los ocho tipos del esquema 4.
 *
 * Este spec no comprueba que la exportación sea completa —de eso se ocupa
 * `dxf-schema4-export.spec.ts`—, sino algo que tiene que seguir siendo verdad
 * pase lo que pase con el soporte: **de cada entidad, o viaja al fichero, o el
 * manifiesto dice qué se pierde**. Nunca las dos cosas a cero.
 *
 * La regresión de confianza que esto impide es concreta: un dibujante pone una
 * directriz de referencia, un enmascaramiento y una imagen de fondo, exporta
 * para mandárselo al cliente, y llegan tres cosas menos sin que nadie avise.
 *
 * La lista de tipos se recorre desde `CAD_SCHEMA_4_ENTITY_TYPES` —no una copia
 * escrita a mano— para que un noveno tipo futuro no pueda colarse sin pasar por
 * aquí.
 */

function documentWith(
  entities: CadEntity[],
  extra: Partial<CadDocument> = {},
): CadDocument {
  return {
    entities,
    layers: [{ id: "0", name: "0", color: "#fff", visible: true, locked: false }],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    unsupportedEntities: [],
    ...extra,
  } as unknown as CadDocument;
}

const p = (x: number, y: number, z = 0) => ({ x, y, z });

const IMAGE_DEFINITION = {
  id: "img-1",
  name: "fondo",
  uri: "asset://tenant/fondo.png",
  pixelWidth: 64,
  pixelHeight: 48,
};

/** Una entidad mínima pero VÁLIDA de cada tipo del esquema 4. */
const SAMPLES: Record<(typeof CAD_SCHEMA_4_ENTITY_TYPES)[number], CadEntity> = {
  point: { id: "s4-point", type: "point", position: p(120, 240), style: 34, layer: "0" },
  xline: { id: "s4-xline", type: "xline", basePoint: p(0, 0), direction: p(1, 0), layer: "0" },
  ray: { id: "s4-ray", type: "ray", basePoint: p(50, 50), direction: p(0, 1), layer: "0" },
  solid: {
    id: "s4-solid",
    type: "solid",
    points: [p(0, 0), p(100, 0), p(100, 80), p(0, 80)],
    layer: "0",
  },
  wipeout: {
    id: "s4-wipeout",
    type: "wipeout",
    boundary: [p(10, 10), p(60, 10), p(60, 40), p(10, 40)],
    frame: true,
    layer: "0",
  },
  image: {
    id: "s4-image",
    type: "image",
    definition: "img-1",
    insertion: p(200, 300),
    uVector: p(2, 0),
    vVector: p(0, 2),
    size: { width: 64, height: 48 },
    layer: "0",
  },
  attdef: {
    id: "s4-attdef",
    type: "attdef",
    tag: "MARCA",
    prompt: "Marca del equipo",
    defaultValue: "P-101",
    insertion: p(15, 25),
    height: 120,
    invisible: true,
    layer: "0",
  },
  table: {
    id: "s4-table",
    type: "table",
    insertion: p(0, 1_000),
    rows: 2,
    columns: 2,
    rowHeights: [200, 200],
    columnWidths: [500, 500],
    cells: [{ row: 0, column: 0, text: "Ref" }],
    layer: "0",
  },
} as unknown as Record<(typeof CAD_SCHEMA_4_ENTITY_TYPES)[number], CadEntity>;

// --- 0. Los ocho tipos SÍ entran en el ámbito exportable -------------------
//
// Si el registro no los reclamase, el filtro de la exportación los dejaría
// fuera ANTES del manifiesto y este spec pasaría de forma vacía: estarían
// perdiéndose en silencio y nadie se enteraría.

for (const type of CAD_SCHEMA_4_ENTITY_TYPES) {
  assert.ok(
    CAD_ENTITY_REGISTRY.supports(SAMPLES[type]),
    `${type} debe estar en el registro nativo, o el filtro de exportación lo descarta sin avisar`,
  );
}

// --- 1. Ninguno de los ocho se pierde en silencio --------------------------

for (const type of CAD_SCHEMA_4_ENTITY_TYPES) {
  const document = documentWith([SAMPLES[type]], {
    imageDefinitions: [IMAGE_DEFINITION],
  } as Partial<CadDocument>);
  const written = cadDocumentNativeDxfPrimitives(document).length;
  const losses = cadDocumentDxfExportLosses(document);
  assert.ok(
    written > 0 || losses.length > 0,
    `${type} no viaja al fichero Y tampoco aparece en el manifiesto: se perdería en SILENCIO`,
  );
  for (const loss of losses) {
    assert.equal(loss.entityId, SAMPLES[type].id, `el aviso de ${type} debe nombrar la entidad`);
    assert.equal(loss.sourceType, type);
  }
}

// --- 2. Lo que se declara dice QUÉ se pierde, no una frase intercambiable --

const CONCRETE: Record<string, RegExp> = {
  point: /POINT/,
  xline: /XLINE/,
  ray: /RAY/,
  solid: /SOLID/,
  wipeout: /WIPEOUT/,
  image: /IMAGE/,
  attdef: /ATTDEF/,
  table: /TABLE/,
};

for (const type of CAD_SCHEMA_4_ENTITY_TYPES) {
  for (const loss of cadDocumentDxfExportLosses(
    documentWith([SAMPLES[type]], { imageDefinitions: [IMAGE_DEFINITION] } as Partial<CadDocument>),
  )) {
    assert.match(
      loss.detail,
      CONCRETE[type],
      `el aviso de ${type} debe nombrar el tipo DXF del que habla`,
    );
    assert.ok(
      loss.detail.length > 60,
      `el aviso de ${type} debe explicar la pérdida, no despacharla`,
    );
  }
}

// Las tres pérdidas de FORMATO que quedan tras exportar los ocho: la tabla
// degradada a geometría, la imagen que sólo lleva su ruta y —porque este
// documento mezcla estilos de punto— la variable global $PDMODE.
const everything = cadDocumentDxfExportLosses(
  documentWith(
    [
      ...CAD_SCHEMA_4_ENTITY_TYPES.map((type) => SAMPLES[type]),
      { ...SAMPLES.point, id: "s4-point-otro", style: 3 } as CadEntity,
    ],
    { imageDefinitions: [IMAGE_DEFINITION] } as Partial<CadDocument>,
  ),
);
assert.deepEqual(
  [...new Set(everything.map((loss) => loss.code))].sort(),
  [
    "dxf_export_image_reference_only",
    "dxf_export_point_style_global",
    "dxf_export_table_degraded",
  ],
  "tras exportar los ocho, lo que queda declarado es lo que el FORMATO no sabe guardar",
);

// Una IMAGE cuya definición no existe no llega al fichero: eso ya es pérdida de
// geometría, y sube a error para que el preflight la bloquee.
const orphan = cadDocumentDxfExportLosses(documentWith([SAMPLES.image]));
assert.equal(orphan.length, 1);
assert.equal(orphan[0].code, "dxf_export_image_definition_missing");
assert.equal(orphan[0].severity, "error");

// --- 3. Entidades opacas: lo que llegó de un DXF ajeno ---------------------

const opaque = cadDocumentDxfExportLosses(
  documentWith([], {
    unsupportedEntities: [
      {
        id: "opaca-1",
        provider: "native-dxf",
        sourceType: "ACAD_PROXY_ENTITY",
        raw: "0\nACAD_PROXY_ENTITY\n",
        editable: false,
      },
    ],
  } as Partial<CadDocument>),
);
assert.equal(opaque.length, 1, "una entidad opaca no puede desaparecer callando");
assert.equal(opaque[0].code, "dxf_export_opaque_entity_dropped");
assert.equal(opaque[0].sourceType, "ACAD_PROXY_ENTITY");
assert.equal(opaque[0].severity, "error");
assert.match(opaque[0].detail, /ACAD_PROXY_ENTITY/);

// --- 4. La geometría 2D limpia sigue sin generar ruido ---------------------

assert.deepEqual(
  cadDocumentDxfExportLosses(
    documentWith([
      {
        id: "linea",
        type: "line",
        start: p(0, 0),
        end: p(10, 0),
        layer: "0",
      } as CadEntity,
    ]),
  ),
  [],
  "una línea plana exporta sin pérdidas: no debe inventarse un aviso",
);

// --- 5. El ámbito se respeta ----------------------------------------------
//
// Avisar de pérdidas en entidades que no viajan al fichero sería ruido, y el
// ruido erosiona la confianza en el aviso.

const scoped = documentWith([
  SAMPLES.table,
  { ...SAMPLES.table, id: "s4-table-fuera" } as CadEntity,
]);
assert.deepEqual(
  cadDocumentDxfExportLosses(scoped, (entity) => entity.id === "s4-table").map(
    (loss) => loss.entityId,
  ),
  ["s4-table"],
  "sólo se avisa de lo que el ámbito exportado incluye",
);

// --- 6. Una entidad que SÍ se descarta se declara una vez, no una por campo -

const degenerate = cadDocumentDxfExportLosses(
  documentWith([
    {
      id: "s4-xline-degenerado",
      type: "xline",
      basePoint: p(0, 0, 500),
      direction: p(0, 0),
      layer: "0",
    } as CadEntity,
  ]),
);
assert.equal(
  degenerate.length,
  1,
  "una XLINE sin dirección no define recta: se declara UNA vez, no una por campo degradado",
);
assert.equal(degenerate[0].severity, "error");

console.log(
  `dxf-schema4-losses.spec.ts OK — ${CAD_SCHEMA_4_ENTITY_TYPES.length} tipos sin silencio, ${everything.length} pérdidas de formato declaradas`,
);
