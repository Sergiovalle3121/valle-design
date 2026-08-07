/**
 * Una cota HEREDADA tenía DOS dueños, y ninguno de los dos ganaba del todo.
 *
 * EL DEFECTO. `CadEntityRegistry.supports()` sólo excluía los círculos
 * heredados (`isLegacyCircle`), así que una `dimension` SIN `dimensionKind` —la
 * cota que crea la herramienta de medir del editor histórico— la reclamaba el
 * registro NATIVO: entraba en `nativeEntities`, se podía seleccionar y mutar por
 * `commitNativeCommands`, y se dibujaba en la escena nativa.
 *
 * Pero `replaceEditorProjection` NO la preserva: su filtro deja pasar
 * `dimension` sólo cuando trae `dimensionKind`. O sea que la cota heredada se
 * reconstruye desde la PROYECCIÓN —desde `annotationsRef`— en cada guardado.
 *
 * De ahí salen tres pérdidas, todas silenciosas:
 *
 *   1. EDITAR. Una mutación nativa escribe en el documento cargado, pero la
 *      siguiente reproyección lo rehace desde las anotaciones, que nadie
 *      actualizó. El cambio se revierte y el guardado responde 200.
 *   2. BORRAR. La orden nativa la quita del documento; la anotación sigue viva,
 *      así que la reproyección la resucita. Un zombi.
 *   3. COPIAR. La orden nativa crea una entidad nueva que no existe como
 *      anotación, así que la reproyección la tira. La copia desaparece.
 *
 * Y de propina se dibujaba DOS VECES: por `rebuildDims` (desde las anotaciones)
 * y por la escena nativa.
 *
 * EL ARREGLO es el que ya estaba escrito al lado: un solo dueño. `isLegacyCircle`
 * excluye del registro nativo lo que posee el sistema heredado; aquí faltaba lo
 * simétrico. La cota con `dimensionKind` sigue siendo nativa y asociativa; la
 * heredada pertenece al sistema de anotaciones, que es quien sabe guardarla.
 */
import { strict as assert } from "node:assert";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";
import {
  cadDocumentToEditorSnapshot,
  editorSnapshotToCadDocument,
} from "./editor-snapshot";
import {
  layoutToCadDocument,
  replaceEditorProjection,
  type CadDocument,
  type CadEntity,
} from "./cad-document";

type CadDimension = Extract<CadEntity, { type: "dimension" }>;

const LEGACY: CadDimension = {
  id: "medida-1",
  type: "dimension",
  a: { x: 0, y: 0 },
  b: { x: 5_000, y: 0 },
  layer: "Measurements",
  text: "5 m",
};

/** Una cota NATIVA: lleva `dimensionKind`, y ésa sí es del registro. */
const NATIVE: CadDimension = {
  id: "cota-nativa",
  type: "dimension",
  dimensionKind: "linear",
  a: { x: 0, y: 1_000 },
  b: { x: 5_000, y: 1_000 },
  axis: "x",
  offset: 300,
  layer: "Measurements",
  associative: true,
};

// ---------------------------------------------------------------------------
// UN SOLO DUEÑO
// ---------------------------------------------------------------------------

assert.equal(
  CAD_ENTITY_REGISTRY.supports(LEGACY),
  false,
  "una cota heredada NO puede ser del registro nativo: el nativo no sabe guardarla, porque la reproyección la rehace desde las anotaciones",
);
assert.equal(
  CAD_ENTITY_REGISTRY.supports(NATIVE),
  true,
  "la cota con `dimensionKind` sí, y tiene que seguir siéndolo — es la asociativa",
);

// El precedente que se está imitando, para que quede atado:
assert.equal(
  CAD_ENTITY_REGISTRY.supports({
    id: "c1",
    type: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    layer: "0",
    legacy: { kind: "wall", rotation: 0 },
  }),
  false,
  "un círculo heredado ya estaba excluido: esto es lo simétrico",
);
assert.equal(
  CAD_ENTITY_REGISTRY.supports({
    id: "c2",
    type: "circle",
    center: { x: 0, y: 0, z: 0 },
    radius: 10,
    layer: "0",
  }),
  true,
  "y un círculo nativo sigue siendo nativo",
);

// ---------------------------------------------------------------------------
// EL INVARIANTE: lo que el registro reclama, la reproyección no puede destruirlo
// ---------------------------------------------------------------------------

/**
 * Aquí está el porqué, y conviene ser exacto sobre lo que se afirma.
 *
 * `replaceEditorProjection` CONSERVA las entidades que no están en la
 * proyección, salvo las que el editor histórico reconstruye desde ella
 * (`box`, `station`, `text`, `connector`, el círculo heredado y la cota SIN
 * `dimensionKind`). Y el editor arma esa proyección desde `annotationsRef`, no
 * desde el documento cargado.
 *
 * Ahí estaba la contradicción: el registro reclamaba la cota heredada —se podía
 * seleccionar y mutar por `commitNativeCommands`, que escribe en el documento
 * cargado— pero la reproyección la rehacía desde unas anotaciones que esa orden
 * no tocaba. Editar la revertía, borrarla la resucitaba y copiarla perdía la
 * copia, siempre con respuesta 200.
 *
 * El invariante que lo cierra: si el registro reclama una entidad, tiene que
 * sobrevivir a una reproyección que no la mencione. Se comprueba sobre un
 * representante de cada tipo nativo.
 */
const NATIVE_SAMPLES: CadEntity[] = [
  { id: "n-line", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "0" },
  { id: "n-circle", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 5, layer: "0" },
  { id: "n-arc", type: "arc", center: { x: 0, y: 0, z: 0 }, radius: 5, startAngle: 0, endAngle: 90, layer: "0" },
  { id: "n-polyline", type: "polyline", vertices: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 0 }], closed: false, layer: "0" },
  NATIVE,
];

/** Una proyección VACÍA: el caso extremo de "la proyección no la menciona". */
const emptyProjection = layoutToCadDocument({ assets: [] });

for (const sample of NATIVE_SAMPLES) {
  assert.equal(
    CAD_ENTITY_REGISTRY.supports(sample),
    true,
    `${sample.id} tiene que ser del registro para que el invariante aplique`,
  );
  const base: CadDocument = {
    ...emptyProjection,
    entities: [sample],
    modelSpace: { entityIds: [sample.id] },
  };
  const survivors = replaceEditorProjection(base, emptyProjection).entities;
  assert.ok(
    survivors.some((entity) => entity.id === sample.id),
    `${sample.id}: lo que el registro reclama NO puede desaparecer en una reproyección que no lo mencione — eso es lo que le pasaba a la cota heredada`,
  );
}

// Y el reverso, que es el que documenta por qué la cota heredada NO puede ser
// nativa: la reproyección SÍ la retira, porque su dueño es la proyección.
{
  const base: CadDocument = {
    ...emptyProjection,
    entities: [LEGACY],
    modelSpace: { entityIds: [LEGACY.id] },
  };
  assert.equal(
    replaceEditorProjection(base, emptyProjection).entities.some(
      (entity) => entity.id === LEGACY.id,
    ),
    false,
    "la cota heredada la manda la proyección, no el documento: por eso el registro nativo no puede reclamarla",
  );
  assert.equal(
    CAD_ENTITY_REGISTRY.supports(LEGACY),
    false,
    "y por eso mismo queda fuera del registro: un dueño, no dos",
  );
}

console.log(
  "legacy-dimension: un solo dueño — el registro nativo ya no reclama la cota heredada, y lo que sí reclama sobrevive a la reproyección",
);
