/**
 * T-15 · LA ETIQUETA QUE EL REPOSITORIO JURA DIBUJADA, DIBUJADA DE VERDAD.
 *
 * `device-tags.ts` afirma en su cabecera que la etiqueta del componente «se
 * DIBUJA junto al símbolo… y viaja al DXF como ATTRIB dentro del INSERT», y
 * `device-tags.spec.ts` repite la misma frase. Hasta este cambio esa frase era
 * prosa sin prueba: `cadMepBlockDefinition` no declaraba ningún `attributes`,
 * así que el exportador (`dxf-export.ts:791-794`, que sólo escribe ATTRIB
 * cuando `definition.attributes[tag]` existe) descartaba la etiqueta en
 * silencio. `grep -rn ATTRIB electrical/*.spec.ts` no devolvía ni una
 * aserción. Este spec lee los BYTES del DXF exportado, no la intención.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad-document";
import { exportCadDocumentDxf } from "../dxf-document-export";
import { CAD_MEP_SYMBOLS, cadMepBlockDefinition, cadMepSymbolFor } from "../mep-symbols";
import { CAD_IE_TAG } from "./device-tags";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

const tablero = cadMepSymbolFor("Tablero");
assert.ok(tablero, "el símbolo MEP-TABLERO tiene que existir para esta prueba");

const document: Pick<CadDocument, "entities" | "blocks"> = {
  blocks: [cadMepBlockDefinition(tablero!)],
  entities: [
    {
      id: "tb1",
      type: "insert",
      block: tablero!.id,
      insertion: { x: 1_000, y: 500, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: tablero!.layer,
      attributes: { [CAD_IE_TAG]: "-TB1" },
    } as never,
  ],
};

const exported = exportCadDocumentDxf({ ...document, layers: [] });

// (1) La DEFINICIÓN del bloque lleva su ATTDEF: sin él ningún INSERT puede
// dibujar el atributo, porque `pushInsert` filtra por `definition.attributes`.
ok(/ATTDEF/.test(exported.content), "el bloque MEP-TABLERO tiene que declarar un ATTDEF");
{
  const lines = exported.content.split(/\r?\n/);
  const attdefAt = lines.findIndex((line) => line.trim() === "ATTDEF");
  ok(attdefAt >= 0, "el ATTDEF aparece en la sección BLOCKS");
  const tagAt = lines.findIndex(
    (line, index) => index > attdefAt && line.trim() === "2" && lines[index + 1]?.trim() === CAD_IE_TAG,
  );
  ok(tagAt >= 0, `el ATTDEF declara el tag ${CAD_IE_TAG} (código de grupo 2)`);
}

// (2) La INSERCIÓN real lleva su ATTRIB con el valor que AETAG escribió.
ok(/ATTRIB/.test(exported.content), "la inserción tiene que escribir un ATTRIB, no sólo la definición");
{
  const lines = exported.content.split(/\r?\n/);
  const attribAt = lines.findIndex((line) => line.trim() === "ATTRIB");
  ok(attribAt >= 0, "el ATTRIB aparece en ENTITIES");
  // Código 1: el valor del texto del atributo, tiene que ser la etiqueta real.
  const valueAt = lines.findIndex(
    (line, index) => index > attribAt && line.trim() === "1" && lines[index + 1]?.trim() === "-TB1",
  );
  ok(valueAt >= 0, `el ATTRIB lleva el valor -TB1, no queda mudo: ${exported.content.slice(0, 4000)}`);
}

// (3) Un bloque MEP sin AETAG (sin `entity.attributes`) no inventa un ATTRIB:
// fix-or-hide en el otro sentido — nada de geometría fantasma.
{
  const sinEtiqueta = exportCadDocumentDxf({
    blocks: [cadMepBlockDefinition(tablero!)],
    entities: [
      {
        id: "tb2",
        type: "insert",
        block: tablero!.id,
        insertion: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        layer: tablero!.layer,
      } as never,
    ],
    layers: [],
  });
  ok(
    !/ATTRIB/.test(sinEtiqueta.content),
    "sin etiqueta puesta por AETAG, la inserción no escribe ningún ATTRIB",
  );
}

// (4) Los ocho símbolos MEP declaran su ATTDEF de etiqueta: el olvido era de
// TODO el catálogo (T-15 lo dice de mep-symbols.ts en conjunto), no de uno.
for (const symbol of CAD_MEP_SYMBOLS)
  ok(
    cadMepBlockDefinition(symbol).attributes?.[CAD_IE_TAG],
    `${symbol.id} tiene que declarar el atributo ${CAD_IE_TAG} para que AETAG pueda dibujarlo`,
  );

console.log(
  `electrical-attributes-dxf: ${verdes} comprobaciones verdes — el ATTDEF y el ATTRIB de la etiqueta MEP salen en los bytes del DXF, no sólo en la XDATA propia`,
);
