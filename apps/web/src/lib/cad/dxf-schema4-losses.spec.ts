import assert from "node:assert/strict";
import { cadDocumentDxfExportLosses } from "./dxf-cad-document";
import { CAD_SCHEMA_4_ENTITY_TYPES, type CadDocument, type CadEntity } from "./cad-document";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

/**
 * Los OCHO tipos del esquema 4 y el manifiesto de pérdidas.
 *
 * La ola 1 metió POINT, XLINE, RAY, SOLID, WIPEOUT, IMAGE, ATTDEF y TABLE en el
 * documento canónico y ninguno se escribe en el DXF. Eso, por sí solo, es una
 * limitación conocida. Lo que sería una regresión de confianza es que se
 * perdieran CALLANDO: un dibujante pone una directriz de referencia, un
 * enmascaramiento y una imagen de fondo, exporta para mandárselo al cliente, y
 * llegan tres cosas menos sin que nadie avise.
 *
 * Este spec fija el contrato ANTES de escribir una sola línea de exportación:
 *
 *   1. Los ocho tipos aparecen en el manifiesto. Sin excepciones, y la lista se
 *      recorre desde `CAD_SCHEMA_4_ENTITY_TYPES` para que un noveno tipo futuro
 *      no pueda colarse sin entrada.
 *   2. Cada aviso dice QUÉ se pierde en concreto, no una frase genérica.
 *   3. Las entidades OPACAS —lo que se conservó de un DXF ajeno— también se
 *      declaran: son la pérdida más traicionera porque el usuario cree que
 *      están precisamente porque las importó.
 *   4. El filtro de ámbito se sigue respetando: avisar de lo que no viaja sería
 *      ruido, y el ruido erosiona la confianza en el aviso.
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
  const losses = cadDocumentDxfExportLosses(documentWith([SAMPLES[type]]));
  assert.ok(
    losses.length > 0,
    `${type} no aparece en el manifiesto: se perdería en SILENCIO`,
  );
  assert.equal(
    losses[0].entityId,
    SAMPLES[type].id,
    `el aviso de ${type} debe nombrar la entidad concreta`,
  );
  assert.equal(losses[0].sourceType, type);
  assert.equal(
    losses[0].severity,
    "error",
    `descartar una entidad ${type} entera es más grave que degradarla`,
  );
}

// --- 2. El aviso dice QUÉ se pierde, no una frase intercambiable -----------
//
// El aviso genérico existía y ya los cubría; lo que no daba era nada
// accionable. Cada tipo tiene que nombrar lo suyo.

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
  const [loss] = cadDocumentDxfExportLosses(documentWith([SAMPLES[type]]));
  assert.match(
    loss.detail,
    CONCRETE[type],
    `el aviso de ${type} debe nombrar el tipo DXF que se queda fuera`,
  );
  assert.ok(
    loss.detail.length > 60,
    `el aviso de ${type} debe explicar la pérdida, no despacharla`,
  );
}

// El manifiesto de un documento con los OCHO a la vez los lista todos.
const everything = cadDocumentDxfExportLosses(
  documentWith(CAD_SCHEMA_4_ENTITY_TYPES.map((type) => SAMPLES[type])),
);
assert.deepEqual(
  [...new Set(everything.map((loss) => loss.sourceType))].sort(),
  [...CAD_SCHEMA_4_ENTITY_TYPES].sort(),
  "un documento con los ocho tipos debe declarar los ocho",
);

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

const scoped = documentWith([SAMPLES.xline, SAMPLES.ray]);
assert.deepEqual(
  cadDocumentDxfExportLosses(scoped, (entity) => entity.id === "s4-ray").map(
    (loss) => loss.entityId,
  ),
  ["s4-ray"],
  "sólo se avisa de lo que el ámbito exportado incluye",
);

// --- 6. Una entidad descartada NO acumula además avisos de degradación -----
//
// Detallar que se aplana la Z de algo que no llega al fichero es ruido.

const elevated = {
  ...SAMPLES.solid,
  id: "s4-solid-elevado",
  points: [p(0, 0, 500), p(100, 0, 500), p(100, 80, 500)],
} as CadEntity;
assert.equal(
  cadDocumentDxfExportLosses(documentWith([elevated])).length,
  1,
  "una entidad que no viaja se declara UNA vez, no una por campo degradado",
);

console.log(
  `dxf-schema4-losses.spec.ts OK — ${CAD_SCHEMA_4_ENTITY_TYPES.length} tipos declarados, ${everything.length} avisos`,
);
