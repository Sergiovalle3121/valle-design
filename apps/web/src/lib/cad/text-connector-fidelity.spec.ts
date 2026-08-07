/**
 * El TEXTO perdía su estilo, su altura y su rotación; el CONECTOR, su capa.
 *
 * EL DEFECTO, que es el mismo del `context` (PR #35) en otros dos campos.
 * `replaceEditorProjection` reemplaza EN BLOQUE las entidades `box`, `station`,
 * `text` y `connector` desde la proyección del editor. Y esa proyección es una
 * vista PARCIAL:
 *
 *   · Una entidad `text` canónica declara `style`, `height` y `rotation`.
 *     `CadEditorAnnotation` sólo lleva `x`, `y`, `text`, `color` y capa, así
 *     que los tres se perdían en CADA guardado del estudio moderno. No son
 *     decorativos: la altura del texto es su tamaño en el dibujo y la rotación
 *     es cómo lo colocó el usuario.
 *
 *   · Con el conector es peor todavía. `layoutToCadDocument` escribe
 *     `layer: "Flow"` LITERAL, así que su capa no es que se pierda al guardar:
 *     es que nunca se lee. Un conector importado en otra capa la perdía ya en
 *     la primera reproyección.
 *
 * EL ARREGLO es el que el PR #35 ya dejó probado para el `context`: lo que la
 * proyección no sabe expresar no puede destruirlo. Se arrastra desde el
 * documento BASE cuando la proyección no lo trae, y manda la proyección cuando
 * sí. Un solo sitio, sin tocar el modelo heredado.
 */
import { strict as assert } from "node:assert";
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

type CadText = Extract<CadEntity, { type: "text" }>;
type CadConnector = Extract<CadEntity, { type: "connector" }>;

function textOf(document: CadDocument, id: string): CadText {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity && entity.type === "text", `se esperaba un texto ${id}`);
  return entity;
}

function connectorOf(document: CadDocument, id: string): CadConnector {
  const entity = document.entities.find((candidate) => candidate.id === id);
  assert.ok(entity && entity.type === "connector", `se esperaba un conector ${id}`);
  return entity;
}

/**
 * Documento como el que devuelve el servidor: un texto con estilo, altura y
 * rotación, y un conector en una capa que NO es la que el adaptador impone.
 */
const server: CadDocument = (() => {
  const base = layoutToCadDocument({
    assets: [
      { id: "a1", kind: "wall", x: 0, y: 0, w: 100, h: 10, rotation: 0 },
      { id: "a2", kind: "wall", x: 0, y: 60, w: 100, h: 10, rotation: 0 },
    ],
    annotations: [{ id: "t1", type: "text", x: 500, y: 500, text: "SALIDA" }],
    connectors: [{ from: "a1", to: "a2", kind: "flow" }],
  });
  return {
    ...base,
    entities: base.entities.map((entity) => {
      if (entity.type === "text")
        return { ...entity, style: "TITULOS", height: 250, rotation: 90 };
      if (entity.type === "connector")
        return { ...entity, layer: "PROCESO" };
      return entity;
    }),
  };
})();

const TEXT_ID = "t1";
const CONNECTOR_ID = connectorOf(server, server.entities.find((e) => e.type === "connector")!.id).id;

assert.equal(textOf(server, TEXT_ID).style, "TITULOS", "el esquema SÍ tiene sitio para el estilo");
assert.equal(textOf(server, TEXT_ID).height, 250);
assert.equal(textOf(server, TEXT_ID).rotation, 90);
assert.equal(connectorOf(server, CONNECTOR_ID).layer, "PROCESO", "y el conector para su capa");

// ---------------------------------------------------------------------------
// El ida y vuelta que hace el editor en CADA guardado canónico
// ---------------------------------------------------------------------------

/** Lo que hace `snapshotDocument()`: reproyectar sobre el documento cargado. */
function saved(document: CadDocument): CadDocument {
  return replaceEditorProjection(
    document,
    editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(document)),
  );
}

{
  const once = saved(server);
  assert.equal(
    textOf(once, TEXT_ID).style,
    "TITULOS",
    "el estilo del texto tiene que sobrevivir al guardado: era el defecto",
  );
  assert.equal(
    textOf(once, TEXT_ID).height,
    250,
    "y la altura, que es el tamaño del texto en el dibujo",
  );
  assert.equal(
    textOf(once, TEXT_ID).rotation,
    90,
    "y la rotación, que la puso el usuario a propósito",
  );
  assert.equal(
    connectorOf(once, CONNECTOR_ID).layer,
    "PROCESO",
    "la capa del conector NO puede volver a `Flow`: el adaptador la escribía literal",
  );

  // Lo que la proyección SÍ sabe expresar sigue mandando ella.
  assert.equal(textOf(once, TEXT_ID).text, "SALIDA");
  assert.equal(textOf(once, TEXT_ID).x, 500);

  // Guardar dos veces seguidas tampoco degrada.
  const twice = saved(once);
  assert.equal(textOf(twice, TEXT_ID).style, "TITULOS", "ni al segundo guardado");
  assert.equal(textOf(twice, TEXT_ID).height, 250);
  assert.equal(textOf(twice, TEXT_ID).rotation, 90);
  assert.equal(connectorOf(twice, CONNECTOR_ID).layer, "PROCESO");
}

// ---------------------------------------------------------------------------
// Sin base no se inventa nada, y una entidad nueva no estrena campos
// ---------------------------------------------------------------------------

{
  const plain = layoutToCadDocument({
    annotations: [{ id: "t2", type: "text", x: 10, y: 10, text: "hola" }],
  });
  const projected = editorSnapshotToCadDocument(cadDocumentToEditorSnapshot(plain));
  assert.equal(textOf(projected, "t2").style, undefined, "sin estilo no se inventa uno");
  assert.equal(textOf(projected, "t2").height, undefined);
  assert.equal(textOf(projected, "t2").rotation, undefined);

  // Y reproyectar contra un base que tampoco los tiene no los materializa.
  const merged = replaceEditorProjection(plain, projected);
  assert.equal(textOf(merged, "t2").style, undefined);
  assert.equal(textOf(merged, "t2").height, undefined);
}

// ---------------------------------------------------------------------------
// Un texto NUEVO, que no está en el base, no hereda del que había
// ---------------------------------------------------------------------------

{
  const conNuevo: CadDocument = {
    ...server,
    entities: [
      ...server.entities,
      { id: "t-nuevo", type: "text", x: 900, y: 900, text: "NUEVO", layer: "Text" },
    ],
    modelSpace: { entityIds: [...server.modelSpace.entityIds, "t-nuevo"] },
  };
  const once = saved(conNuevo);
  assert.equal(
    textOf(once, "t-nuevo").style,
    undefined,
    "el acarreo es POR ENTIDAD: un texto nuevo no puede heredar el estilo de otro",
  );
  assert.equal(textOf(once, TEXT_ID).style, "TITULOS", "y el que sí lo tenía lo conserva");
}

console.log(
  "text/connector: el estilo, la altura y la rotación del texto y la capa del conector sobreviven a la reproyección canónica",
);
