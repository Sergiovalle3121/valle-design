/**
 * Ranuras de tipo de línea: la secuencia `.lin` COMPLETA por ranura.
 *
 * Medido el 2026-09-02 antes de este cambio: la tabla guardaba sólo (primer
 * trazo, primer hueco), así que CENTER → [1.25, 0.25] perdía el trazo corto,
 * DASHDOT/BORDER/DIVIDE quedaban idénticos a DASHED, PHANTOM a CENTER, y DOT
 * ([0, −0.25]) no entraba en ninguna ranura ni en `simplified` ni en
 * `overflow`: continuo en silencio. Con el tope de 8, el octavo nombre no
 * continuo ya caía a continuo. Cada afirmación de abajo vuelve a rojo si se
 * revierte una de esas tres decisiones.
 */
import assert from "node:assert/strict";
import {
  CAD_LINETYPE_MAX_ELEMENTS,
  CAD_LINETYPE_SLOT_LIMIT,
  buildCadLinetypeSlots,
  resolveCadEntityStyle,
} from "./cad-effective-style";
import { CAD_BUILTIN_LINETYPES } from "./linetype-lin";
import { CAD_DOCUMENT_SCHEMA, type CadDocument, type CadLayerDef } from "./cad-document";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const layer = (name: string, linetype?: string): CadLayerDef => ({
  id: name,
  name,
  color: "#94a3b8",
  visible: true,
  locked: false,
  ...(linetype ? { linetype } : {}),
});

function styles(catalog: Record<string, number[]>): Pick<CadDocument, "styles"> {
  const linetype: Record<string, { pattern: number[] }> = {};
  for (const [name, pattern] of Object.entries(catalog)) linetype[name] = { pattern };
  return { styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {}, linetype } };
}

// ---------------------------------------------------------------------------
// 1. La secuencia completa, con signo, y el punto conservado.
// ---------------------------------------------------------------------------
const imported = buildCadLinetypeSlots(
  styles({
    CENTER: [1.25, -0.25, 0.25, -0.25],
    DASHDOT: [0.5, -0.25, 0, -0.25],
    DASHED: [0.5, -0.25],
    HIDDEN: [0.25, -0.125],
    PHANTOM: [1.25, -0.25, 0.25, -0.25, 0.25, -0.25],
    DOT: [0, -0.25],
  }),
);
assert.deepEqual(imported.patterns[0], [], "la ranura 0 es la continua");
assert.deepEqual(
  imported.patterns[imported.slots.get("CENTER")!],
  [1.25, -0.25, 0.25, -0.25],
  "CENTER conserva sus cuatro tramos con signo",
);
assert.deepEqual(
  imported.patterns[imported.slots.get("DASHDOT")!],
  [0.5, -0.25, 0, -0.25],
  "DASHDOT conserva el 0 del punto",
);
assert.notDeepEqual(
  imported.patterns[imported.slots.get("DASHDOT")!],
  imported.patterns[imported.slots.get("DASHED")!],
  "DASHDOT y DASHED ya no son el mismo patrón",
);
assert.notDeepEqual(
  imported.patterns[imported.slots.get("PHANTOM")!],
  imported.patterns[imported.slots.get("CENTER")!],
  "PHANTOM y CENTER ya no son el mismo patrón",
);
ok(imported.slots.has("DOT"), "DOT tiene ranura: un patrón de sólo punto y hueco ya no se pierde");
assert.deepEqual(imported.simplified, [], "ningún patrón de seis tramos se trunca");
ok(true, "las ranuras guardan la secuencia .lin completa, con puntos y con signo");

// El catálogo va PRIMERO y en orden alfabético: es el contrato que la matriz
// de propiedades del DXF mide como «visor.linetypeIndex = 1» para EJES=CENTER.
assert.equal(imported.slots.get("CENTER"), 1, "CENTER es la ranura 1 en un catálogo alfabético");
assert.equal(imported.slots.get("DASHDOT"), 2);
assert.equal(imported.slots.get("DASHED"), 3);

// ---------------------------------------------------------------------------
// 2. Respaldo de fábrica DETRÁS del catálogo, en orden fijo. Un dibujo nuevo
//    con capa EJES=CENTER (norma mexicana) no lleva `styles.linetype`.
// ---------------------------------------------------------------------------
const fresh = buildCadLinetypeSlots({ styles: undefined as unknown as CadDocument["styles"] });
const builtinOrder = CAD_BUILTIN_LINETYPES.filter((entry) => entry.pattern.length > 0).map((entry) => entry.name.toUpperCase());
assert.deepEqual(
  builtinOrder.map((name) => fresh.slots.get(name)),
  builtinOrder.map((_, index) => index + 1),
  `los de fábrica ocupan las ranuras 1..${builtinOrder.length} en su orden fijo`,
);
assert.deepEqual(fresh.patterns[fresh.slots.get("CENTER")!], [1.25, -0.25, 0.25, -0.25], "CENTER de fábrica trae su secuencia completa");
ok(fresh.slots.has("DOT") && fresh.slots.has("PHANTOM") && fresh.slots.has("BORDER") && fresh.slots.has("DIVIDE"), "los nueve de fábrica caben, DOT incluido");
// Y con catálogo, los de fábrica que el catálogo NO define van detrás y los que
// sí define no se duplican.
const mixed = buildCadLinetypeSlots(styles({ CENTER: [12.7, -3.175, 3.175, -3.175], Continuous: [] }));
assert.equal(mixed.slots.get("CENTER"), 1, "el CENTER del catálogo manda sobre el de fábrica");
assert.deepEqual(mixed.patterns[1], [12.7, -3.175, 3.175, -3.175], "y trae SU patrón, no el de fábrica");
assert.equal(mixed.slots.get("DASHED"), 2, "el primer tipo de fábrica no declarado va justo detrás del catálogo");
assert.equal([...mixed.slots.values()].filter((slot) => slot === 1).length, 1, "ninguna ranura se asigna dos veces");
ok(true, "sin catálogo, un dibujo nuevo tiene ranura para CENTER; con catálogo, la fábrica va detrás sin duplicar");

// ---------------------------------------------------------------------------
// 3. Tope 32 medido, no 8: 20 nombres caben; el 33.º no, y se DICE.
// ---------------------------------------------------------------------------
const twenty: Record<string, number[]> = {};
for (let index = 0; index < 20; index += 1) twenty[`LT${String(index).padStart(2, "0")}`] = [1 + index, -0.5];
const roomy = buildCadLinetypeSlots(styles(twenty));
assert.deepEqual(roomy.overflow, [], "veinte nombres de despacho caben sin desbordar");
assert.equal(roomy.slots.size, 20 + builtinOrder.length, "y los de fábrica siguen detrás");
const many: Record<string, number[]> = {};
for (let index = 0; index < 40; index += 1) many[`LT${String(index).padStart(2, "0")}`] = [1 + index, -0.5];
const crowded = buildCadLinetypeSlots(styles(many));
assert.equal(crowded.slots.size, CAD_LINETYPE_SLOT_LIMIT - 1, "caben exactamente SLOT_LIMIT − 1 nombres no continuos");
assert.equal(crowded.overflow[0], "LT31", "el primer desbordado es el 32.º nombre en orden alfabético");
ok(crowded.overflow.includes("DASHED") && crowded.overflow.includes("CENTER"), "y los de fábrica desplazados se declaran en overflow, no se pierden en silencio");
ok(true, `el tope de ${CAD_LINETYPE_SLOT_LIMIT} ranuras se declara: ${crowded.overflow.length} nombres en overflow`);

// Un patrón de más de MAX_ELEMENTS tramos se trunca y se declara.
const long = buildCadLinetypeSlots(styles({ LARGO: [1, -0.5, 1, -0.5, 1, -0.5, 1, -0.5, 0, -0.5] }));
assert.equal(long.patterns[long.slots.get("LARGO")!].length, CAD_LINETYPE_MAX_ELEMENTS);
assert.deepEqual(long.simplified, ["LARGO"], "el truncado se declara por nombre");
ok(true, `un patrón de 10 tramos se trunca a ${CAD_LINETYPE_MAX_ELEMENTS} y se lista en simplified`);

// ---------------------------------------------------------------------------
// 4. La ranura NO depende de qué capas referencian qué: viaja horneada en el
//    lote y un índice que cambiara al añadir una entidad dejaría tiles viejos
//    con la ranura equivocada.
// ---------------------------------------------------------------------------
const catalogOnly = styles({ CENTER: [1.25, -0.25, 0.25, -0.25] });
const withoutLayers = buildCadLinetypeSlots(catalogOnly);
const document: Pick<CadDocument, "styles" | "layers" | "blocks" | "entities" | "meta"> = {
  ...catalogOnly,
  layers: [layer("0"), layer("EJES", "CENTER"), layer("AUX", "DASHED")],
  blocks: [],
  entities: [{ id: "l1", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, layer: "EJES" }],
  meta: { version: 1, schema: CAD_DOCUMENT_SCHEMA, unit: "mm" },
};
const withLayers = buildCadLinetypeSlots(document);
assert.deepEqual([...withLayers.slots], [...withoutLayers.slots], "las capas no mueven las ranuras");
const resolved = resolveCadEntityStyle(document.entities[0], document);
assert.equal(resolved.linetype, "CENTER", "una LINE en EJES hereda CENTER por capa");
assert.equal(withLayers.slots.get(resolved.linetype.toUpperCase()), 1, "y su ranura es la 1");
assert.equal(withLayers.slots.get("DASHED"), 2, "AUX=DASHED resuelve a la ranura de fábrica que va detrás");
ok(true, "la tabla depende sólo del catálogo; la herencia por capa resuelve contra ella");

// La caché es por objeto `styles`: la misma tabla se devuelve mientras el
// catálogo no cambie, que es lo que permite que la escena no reempaquete los
// uniformes en cada edición.
assert.equal(buildCadLinetypeSlots(document), withLayers, "misma referencia para el mismo catálogo");
ok(true, "buildCadLinetypeSlots cachea por catálogo");

console.log(
  `cad-effective-style: ${checks} comprobaciones verdes — CENTER guarda [1.25,−0.25,0.25,−0.25], DOT tiene ranura, ${CAD_LINETYPE_SLOT_LIMIT} ranuras × ${CAD_LINETYPE_MAX_ELEMENTS} tramos, fábrica detrás del catálogo y overflow declarado.`,
);
