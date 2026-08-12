/**
 * Spec del anfitrión del visor sombreado de sólidos.
 *
 * Lo que se puede afirmar en Node es la RECONCILIACIÓN: que el grupo contiene
 * exactamente un objeto por sólido del documento, que la identidad de
 * referencia evita reconstruir lo que no cambió (las mutaciones canónicas no
 * clonan lo que no tocan, y a 100k eso es la diferencia entre un cuadro y un
 * segundo), y que cambiar el estilo reconstruye las mallas con el estilo nuevo.
 * La LUZ y la oclusión reales —GPU— las afirma el golden 47 en Chromium.
 */
import assert from "node:assert/strict";
import type { CadDocument, CadEntity } from "@/lib/cad/cad-document";
import { CAD_DOCUMENT_SCHEMA } from "@/lib/cad/cad-document";
import type { CadSolid3dEntity } from "@/lib/cad/cad-entities-v5";
import { CadSolidShadeHost, cadSolidEntityIds } from "./solid-shade-host";

const layer = { id: "0", name: "0", color: "#94a3b8", visible: true, locked: false };

function solid(id: string, height: number): CadSolid3dEntity {
  return {
    id,
    type: "solid3d",
    root: `${id}-perfil`,
    nodes: [
      {
        id: `${id}-perfil`,
        op: "extrude",
        profile: {
          outer: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
        height,
      },
    ],
    layer: "0",
  };
}

function documentWith(entities: readonly CadEntity[]): CadDocument {
  return {
    meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
    layers: [layer],
    entities: [...entities],
    history: [],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  } as CadDocument;
}

const line: CadEntity = {
  id: "line-1",
  type: "line",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 400, y: 0, z: 0 },
  layer: "0",
};

const viewport = { scale: 0.01, width: 1_000, height: 800, elevation: 0.11 };
const none: ReadonlySet<string> = new Set();

// --- los ids a excluir del pipeline por lotes son los sólidos, y sólo ellos ---
{
  const document = documentWith([line, solid("caja", 50), solid("torre", 200)]);
  assert.deepEqual(cadSolidEntityIds(document).sort(), ["caja", "torre"]);
  assert.deepEqual(cadSolidEntityIds(documentWith([line])), []);
}

// --- sync reconcilia: crea, conserva por referencia, reconstruye y libera ----
{
  const host = new CadSolidShadeHost(() => viewport);
  const caja = solid("caja", 50);
  const torre = solid("torre", 200);
  host.sync(documentWith([line, caja, torre]), none);
  assert.equal(host.count, 2, "un objeto por sólido; la línea no entra");
  assert.equal(host.group.children.length, 2, "y ambos cuelgan del grupo");

  // Mismas referencias → mismos objetos. Es el contrato que hace barato
  // llamar a sync en cada commit.
  const before = [...host.group.children];
  host.sync(documentWith([line, caja, torre]), none);
  assert.deepEqual([...host.group.children], before, "sin cambios no se reconstruye nada");

  // Una referencia nueva para el mismo id → ese objeto se reconstruye; el otro no.
  const cajaAlta = solid("caja", 80);
  host.sync(documentWith([line, cajaAlta, torre]), none);
  assert.equal(host.count, 2);
  const torreDespues = host.group.children.filter((child) => before.includes(child));
  assert.equal(torreDespues.length, 1, "la torre intacta conserva su objeto; la caja no");

  // Borrar el sólido lo saca del grupo.
  host.sync(documentWith([line, torre]), none);
  assert.equal(host.count, 1, "el sólido borrado se libera");

  host.dispose();
  assert.equal(host.count, 0);
  assert.equal(host.group.children.length, 0, "dispose vacía el grupo");
}

// --- la designación reconstruye sólo al designado ----------------------------
{
  const host = new CadSolidShadeHost(() => viewport);
  const caja = solid("caja", 50);
  const torre = solid("torre", 200);
  host.sync(documentWith([caja, torre]), none);
  const before = [...host.group.children];
  host.sync(documentWith([caja, torre]), new Set(["caja"]));
  const kept = host.group.children.filter((child) => before.includes(child));
  assert.equal(kept.length, 1, "designar la caja reconstruye la caja y respeta la torre");
  host.dispose();
}

// --- cambiar el estilo reconstruye con el estilo nuevo -----------------------
{
  const host = new CadSolidShadeHost(() => viewport);
  host.sync(documentWith([solid("caja", 50)]), none);
  assert.equal(host.visualStyle, "shaded-edges", "el estilo por defecto es el de AutoCAD");
  assert.equal(
    host.group.children[0]?.userData.visualStyle,
    "shaded-edges",
    "y la malla se construyó con él",
  );

  assert.equal(host.applyVisualStyle("wireframe"), "Alámbrico", "devuelve la etiqueta aplicada");
  assert.equal(host.visualStyle, "wireframe");
  assert.equal(host.count, 1, "cambiar de estilo no pierde sólidos");
  assert.equal(
    host.group.children[0]?.userData.visualStyle,
    "wireframe",
    "la malla se reconstruyó con el estilo nuevo",
  );

  // Reaplicar el mismo estilo no reconstruye: es lo que hace barato repetir VSCURRENT.
  const before = [...host.group.children];
  host.setStyle("wireframe");
  assert.deepEqual([...host.group.children], before, "mismo estilo, mismos objetos");
  host.dispose();
}

console.log("solid-shade-host.spec: reconciliación por referencia y estilos conmutables");
