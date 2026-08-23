import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { DEFAULT_ACTIVE_CAD_LAYER, DEFAULT_CAD_LAYERS } from "./layers";
import { cadStarterLayers, CAD_STARTER_TEMPLATES } from "./starter-templates";

/*
 * LA CAPA ACTIVA AL ABRIR UN DIBUJO NO ES LA DE EQUIPAMIENTO.
 *
 * El defecto se midió sobre el plano de ejemplo de la portada, dibujado con los
 * comandos reales: seis muros, cuatro huecos, un sombreado y tres rótulos de
 * local, y los dieciocho en la capa `equipment`. Una planta arquitectónica
 * entera en la capa de equipamiento no se puede publicar por capas.
 */
assert.equal(DEFAULT_ACTIVE_CAD_LAYER, "layout");
assert.notEqual(
  DEFAULT_ACTIVE_CAD_LAYER,
  "equipment",
  "la capa activa de fabrica es herencia del planificador de plantas",
);

// La capa activa tiene que EXISTIR en el juego de fábrica, o el primer trazo
// aterriza en una capa que no está en el gestor.
assert.ok(
  DEFAULT_CAD_LAYERS.some((layer) => layer.id === DEFAULT_ACTIVE_CAD_LAYER),
  "la capa activa de fabrica esta declarada",
);

// Y en el juego que cada plantilla de arranque escribe en el documento, que es
// lo que el usuario ve en el gestor de capas al abrir un plano nuevo.
for (const template of CAD_STARTER_TEMPLATES) {
  const layers = cadStarterLayers(template);
  assert.ok(
    layers.some((layer) => layer.id === DEFAULT_ACTIVE_CAD_LAYER),
    `la plantilla ${template.id} declara la capa activa de fabrica`,
  );
}

/*
 * EL NOMBRE DE LA CAPA NO SE TOCA. `Equipment` viaja dentro de los DXF que los
 * clientes ya exportaron —`cadStarterLayers` escribe `name: item.label`— y
 * además es vocabulario de dibujo legítimo: el estándar AIA nombra `A-EQPM` la
 * capa de equipamiento de una planta. Lo que cambió es cuál está ACTIVA.
 */
const equipment = DEFAULT_CAD_LAYERS.find((layer) => layer.id === "equipment");
assert.equal(equipment?.label, "Equipment", "el nombre persistido sigue igual");
assert.ok(
  cadStarterLayers(CAD_STARTER_TEMPLATES[0]).some(
    (layer) => layer.id === "equipment" && layer.name === "Equipment",
  ),
  "y sigue llegando al documento con ese nombre",
);

/*
 * El centinela de `addAsset` —«si el usuario no ha elegido capa, usa la de la
 * clase de objeto»— tiene que seguir comparando contra la MISMA constante. Si
 * alguien cambia una y no la otra, colocar un objeto legado deja de respetar su
 * capa por clase y nadie se entera hasta que un plano sale mal por capas.
 */
const editor = readFileSync(
  "src/components/cad/editor/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(
  editor.includes("useState<CadLayerId>(DEFAULT_ACTIVE_CAD_LAYER)"),
  "el editor arranca en la capa activa de fabrica",
);
assert.ok(
  editor.includes("activeCadLayer === DEFAULT_ACTIVE_CAD_LAYER"),
  "y el centinela de addAsset compara contra la misma constante",
);
assert.ok(
  !editor.includes('useState<CadLayerId>("equipment")'),
  "ya no queda el equipment cableado",
);

console.log("default-active-layer.spec: OK");
