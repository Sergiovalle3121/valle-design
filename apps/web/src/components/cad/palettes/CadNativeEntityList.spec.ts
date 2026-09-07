/**
 * T-73(g): la lista de entidades no tenía estructura de lista para un lector
 * de pantalla — botones sueltos, uno tras otro, sin `role="list"` que
 * anunciara cuántos hay ni permitiera saltar de fila en fila. El nombre y la
 * capa, antes en dos `<span>` sin espacio garantizado entre ellos, ahora
 * también llegan como un único `aria-label` en el botón.
 *
 * Correr: npx tsx src/components/cad/palettes/CadNativeEntityList.spec.ts
 */
import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import { CadNativeEntityList } from "./CadNativeEntityList";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const arco = (id: string, layer: string): CadNativeEntity => ({
  id,
  type: "arc",
  center: { x: 0, y: 0, z: 0 },
  radius: 5,
  startAngle: 0,
  endAngle: 180,
  layer,
});

{
  const html = renderToStaticMarkup(
    createElement(CadNativeEntityList, {
      entities: [arco("a1", "MUROS"), arco("a2", "MUROS")],
      onSelect: () => undefined,
    }),
  );
  ok(html.includes('role="list"'), "el contenedor se anuncia como lista");
  ok(html.includes('role="listitem"'), "cada fila se anuncia como elemento de la lista");
  ok(
    html.includes('aria-label="Arco 1 — capa MUROS"'),
    "el botón lleva un nombre accesible único, sin depender del espaciado entre spans",
  );
  ok(
    html.includes('aria-label="Arco 2 — capa MUROS"'),
    "el ordinal distingue la segunda fila del mismo tipo",
  );
  ok(
    html.includes('aria-labelledby="cad-native-entity-list-titulo"'),
    "la lista está enlazada al título visible (\"Entidades nativas\")",
  );
}

{
  // El corte a `limit` sigue siendo honesto: no desaparece contenido sin
  // decirlo (fix-or-hide), y eso no cambió con este arreglo.
  const html = renderToStaticMarkup(
    createElement(CadNativeEntityList, {
      entities: [arco("a1", "MUROS"), arco("a2", "MUROS"), arco("a3", "MUROS")],
      limit: 2,
      onSelect: () => undefined,
    }),
  );
  ok(html.includes("y") && html.includes("más"), "declara las filas ocultas en vez de esconderlas en silencio");
}

console.log(`CadNativeEntityList: ${checks}/${checks} comprobaciones verdes`);
