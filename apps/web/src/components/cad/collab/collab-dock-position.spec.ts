import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

/*
 * DÓNDE SE POSA EL MUELLE DE COLABORACIÓN, Y POR QUÉ NO EN LOS OTROS DOS SITIOS.
 *
 * Un panel que flota tiene que elegir sobre qué se posa. Las dos elecciones
 * malas no se razonaron: se MIDIERON con los goldens, y cada una dejó su
 * cadáver en el registro.
 *
 *  1. `right-3 top-24` — la esquina SUPERIOR del panel derecho. Ahí viven el
 *     texto de «Selecciona objetos para ver y editar sus propiedades» —que el
 *     globo dejaba ilegible, visto en la captura de portada— y la fila de
 *     pestañas de la biblioteca. El golden 21 llevaba MESES en rojo con el
 *     mensaje exacto «<aside cad-collab-dock> subtree intercepts pointer
 *     events» mientras intentaba pulsar `cad-library-tab-xrefs`, y ese golden
 *     estaba en la lista de rojos heredados que nadie había leído.
 *
 *  2. Anclado al LIENZO — el arreglo apresurado. Dejó de tapar texto y empezó a
 *     comerse los clics del DIBUJO: seis specs más en rojo (12, 20, 27, 39, 46,
 *     50) y quince mensajes nombrando `cad-collab-toggle`.
 *
 * La esquina INFERIOR derecha no tiene ninguna de las dos cosas.
 */

const layer = readFileSync(
  "src/components/cad/collab/StudioCollaborationLayer.tsx",
  "utf8",
);

assert.ok(
  layer.includes('"fixed right-3 bottom-16'),
  "el muelle se posa abajo a la derecha",
);
// Se mira la CONSTANTE, no la prosa: el archivo explica largamente por qué el
// muelle no vuelve arriba, y buscar el texto a secas cazaría esa explicación.
const dockConstant = layer.slice(
  layer.indexOf("const DOCK ="),
  layer.indexOf("const DOCK =") + 260,
);
assert.ok(
  !dockConstant.includes("top-24"),
  "y NO en la esquina superior: ahí están las pestañas de la biblioteca (golden 21)",
);
assert.ok(
  !layer.includes("window.innerWidth - rect.right"),
  "ni anclado al lienzo: eso se come los clics del dibujo (goldens 12, 27, 39, 50)",
);

/*
 * Y colocando una chincheta se aparta del ratón ENTERO. Es una orden explícita
 * —«pincha un punto del plano»— y ningún panel flotante puede quedársela;
 * cancelar sigue disponible con Escape, que es lo que anuncia la pista sobre el
 * dibujo. Sin esto, el golden 55 falla nombrando «Enlace para el cliente».
 */
assert.ok(
  layer.includes('placing ? "pointer-events-none" : ""'),
  "en modo colocar el muelle deja pasar el raton",
);

/*
 * El editor no paga nada por esto: ni una línea, ni un `useState`, ni un token
 * de clase. Si alguien vuelve a resolverlo reservando sitio en el panel
 * derecho, que sepa que ya se probó: empujar la columna 99 px hacia abajo sacó
 * de la vista las filas que el golden 39 edita.
 */
const editor = readFileSync(
  "src/components/cad/editor/Layout3DEditor.tsx",
  "utf8",
);
assert.ok(
  !editor.includes("cad-collab-dock-inset"),
  "el panel derecho no reserva sitio para el muelle: se probo y costo goldens",
);

console.log(
  "collab-dock-position.spec: OK — abajo a la derecha, sin tapar pestañas ni robar clics del plano",
);
