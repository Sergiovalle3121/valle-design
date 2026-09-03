/**
 * ATTSYNC: las cuatro reglas, sobre documentos que se leen de un vistazo.
 *
 * Lo que se afirma es lo que le pasa a un despacho de verdad: se redefine el
 * cajetín y las cuarenta láminas que ya estaban tienen que ponerse al día sin
 * perder lo que alguien escribió.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { cadAttsyncCommands, cadAttsyncValues } from "./attribute-sync";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

type Insert = Extract<CadEntity, { type: "insert" }>;

function documento(
  atributos: Record<string, { defaultValue?: string; constant?: boolean; position?: { x: number; y: number; z: number }; height?: number }>,
  inserts: Array<{ id: string; attributes?: Record<string, string> }>,
): Pick<CadDocument, "entities" | "blocks"> {
  return {
    blocks: [
      {
        id: "block:cajetin",
        name: "CAJETIN",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [],
        attributes: atributos,
      },
    ],
    entities: inserts.map((entrada) => ({
      id: entrada.id,
      type: "insert",
      block: "block:cajetin",
      insertion: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: 0,
      layer: "0",
      ...(entrada.attributes ? { attributes: entrada.attributes } : {}),
    })) as CadEntity[],
  };
}

// --- 1 · lo escrito se conserva; lo nuevo entra; lo retirado sale ---------
{
  const doc = documento(
    { PROYECTO: { defaultValue: "-" }, REVISION: { defaultValue: "P01" } },
    [{ id: "i1", attributes: { PROYECTO: "Nave industrial", OBSOLETO: "x" } }],
  );
  const resultado = cadAttsyncCommands(doc);
  eq(resultado.visited, 1, "se mira la única referencia");
  eq(resultado.updated, 1, "y cambia");
  eq(resultado.added.join(","), "REVISION", "entra la etiqueta nueva");
  eq(resultado.removed.join(","), "OBSOLETO", "y sale la que ya no se declara");
  const orden = resultado.commands[0];
  assert.ok(orden.type === "replace");
  const insert = orden.entity as unknown as Insert;
  eq(insert.attributes?.PROYECTO, "Nave industrial", "lo que el dibujante escribió NO se pierde");
  eq(insert.attributes?.REVISION, "P01", "la etiqueta nueva entra con su valor por defecto");
  eq(insert.attributes?.OBSOLETO, undefined, "y la huérfana desaparece");
  eq(orden.entityId, "i1", "sobre la misma referencia, conservando su id");
}

// --- 2 · un atributo CONSTANTE lo manda la definición ---------------------
{
  const doc = documento(
    { ESCALA: { defaultValue: "1:50", constant: true } },
    [{ id: "i1", attributes: { ESCALA: "1:100" } }],
  );
  const resultado = cadAttsyncCommands(doc);
  eq(resultado.updated, 1, "una constante desalineada se corrige");
  const insert = (resultado.commands[0] as { entity: unknown }).entity as Insert;
  eq(insert.attributes?.ESCALA, "1:50", "y toma el valor de la definición, no el que tenía");
}

// --- 3 · lo que ya está al día NO deja paso de deshacer -------------------
{
  const doc = documento({ PROYECTO: { defaultValue: "-" } }, [
    { id: "i1", attributes: { PROYECTO: "Nave" } },
  ]);
  const resultado = cadAttsyncCommands(doc);
  eq(resultado.visited, 1, "se mira igual");
  eq(resultado.updated, 0, "pero no cambia nada");
  eq(resultado.commands.length, 0, "y no se emite ni una orden");
}

// --- 4 · la geometría se recalcula desde la DEFINICIÓN --------------------
{
  const doc = documento(
    { PROYECTO: { defaultValue: "-", position: { x: 10, y: 20, z: 0 }, height: 250 } },
    [{ id: "i1", attributes: { PROYECTO: "Nave" } }],
  );
  const resultado = cadAttsyncCommands(doc);
  eq(resultado.updated, 1, "la referencia sin geometría de atributos se pone al día");
  const insert = (resultado.commands[0] as { entity: unknown }).entity as Insert;
  eq(insert.positionedAttributes?.length, 1, "y estrena el atributo colocado");
  eq(insert.positionedAttributes?.[0].tag, "PROYECTO", "con su etiqueta");
  eq(insert.positionedAttributes?.[0].height, 250, "y la altura que dice la definición");
  eq(insert.positionedAttributes?.[0].insertion.x, 10, "en el punto de la definición");
}

// --- 5 · acotar por nombre de bloque, y por id ----------------------------
{
  const doc = documento({ PROYECTO: { defaultValue: "-" } }, [{ id: "i1" }]);
  eq(cadAttsyncCommands(doc, "CAJETIN").updated, 1, "acota por nombre");
  eq(cadAttsyncCommands(doc, "cajetin").updated, 1, "sin distinguir mayúsculas");
  eq(cadAttsyncCommands(doc, "block:cajetin").updated, 1, "y por id");
  eq(cadAttsyncCommands(doc, "OTRO").visited, 0, "un bloque que no está no mira nada");
  eq(cadAttsyncCommands(doc, "OTRO").commands.length, 0, "ni emite nada");
}

// --- 6 · una referencia a un bloque que ya no existe no se toca ----------
{
  const doc = documento({ PROYECTO: { defaultValue: "-" } }, [{ id: "i1" }]);
  const huerfana = {
    ...doc,
    entities: [
      ...doc.entities,
      { id: "i2", type: "insert", block: "block:fantasma", insertion: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, layer: "0" },
    ] as CadEntity[],
  };
  const resultado = cadAttsyncCommands(huerfana);
  eq(resultado.visited, 1, "sólo se mira la que tiene definición");
  ok(
    resultado.commands.every((orden) => orden.type === "replace" && orden.entityId === "i1"),
    "y la huérfana se deja como está en vez de inventarle atributos",
  );
}

// --- 7 · la tabla de valores, por separado -------------------------------
{
  const valores = cadAttsyncValues(
    { attributes: { A: { defaultValue: "a" }, B: { defaultValue: "b", constant: true } } },
    { A: "escrito", B: "ignorado", C: "sobra" },
  );
  eq(JSON.stringify(valores), JSON.stringify({ A: "escrito", B: "b" }), "conserva, fija la constante y descarta la que sobra");
}

console.log(`attribute-sync: ${verdes} comprobaciones verdes`);
