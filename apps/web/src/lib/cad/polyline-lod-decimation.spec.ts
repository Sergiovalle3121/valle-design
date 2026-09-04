/**
 * NO DIBUJAR VÉRTICES QUE CAEN DENTRO DEL MISMO PÍXEL.
 *
 * ## Lo medido antes de escribirlo
 *
 * `cartography@20k` son 18.400 polilíneas de 20 vértices de mediana. Con el
 * plano ajustado a pantalla ocupan **9,74 px** cada una, con sus vértices a
 * **0,796 px** unos de otros: veinte vértices dentro de diez píxeles. El LOD no
 * hacía nada con ellas —362.479 puntos en los TRES escalones, idénticos—,
 * porque `segments` sólo gobernaba los arcos de `bulge`.
 *
 * Es el mismo desperdicio que los guiones subpíxel del sombreado y se quita con
 * el mismo criterio. Medido después: **362.479 → 122.543 puntos (3,0×)** en el
 * escalón grueso, sin tocar el escalón de detalle ni el valor por defecto.
 *
 * ## Lo que esta prueba fija, que es sobre todo lo que NO se toca
 *
 * Decimar una polilínea no es adornarla: sus vértices SON el dibujo. Por eso lo
 * que más se comprueba aquí no es el ahorro, sino los cuatro casos en los que
 * no se decima y la cota de error en el único en que sí.
 */
import { strict as assert } from "node:assert";
import type { CadEntity } from "./cad-document";
import { CAD_ENTITY_REGISTRY } from "./entity-runtime";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Una polilínea con `n` vértices sobre una recta, con ruido de amplitud `ruido`. */
function serpentea(
  id: string,
  n: number,
  largo: number,
  ruido: number,
  extra: Record<string, unknown> = {},
): CadEntity {
  const vertices = Array.from({ length: n }, (_, index) => ({
    x: (index / (n - 1)) * largo,
    y: index % 2 === 0 ? ruido : -ruido,
  }));
  return { id, type: "polyline", vertices, closed: false, layer: "0", ...extra } as unknown as CadEntity;
}

const dibuja = (entity: CadEntity, segments: number) =>
  CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(entity, segments)[0].points;

// --- 1 · el ruido subpíxel se va, y los extremos se quedan -----------------
{
  // 101 vértices sobre 1.000 unidades, con ruido de 0,1: a 24 px aparentes el
  // ruido mide 0,0024 px. Invisible.
  const entidad = serpentea("p1", 101, 1_000, 0.1);
  const completo = dibuja(entidad, 96);
  const grueso = dibuja(entidad, 8);
  eq(completo.length, 101, "el valor por defecto dibuja los 101 vértices: no es un escalón de LOD");
  ok(grueso.length < 10, `en el escalón grueso quedan poquísimos — quedaron ${grueso.length}`);
  eq(grueso[0].x, completo[0].x, "el primer vértice no se mueve");
  eq(grueso[grueso.length - 1].x, completo[completo.length - 1].x, "ni el último");
  eq(grueso[grueso.length - 1].y, completo[completo.length - 1].y, "ni en y");
}

// --- 2 · el detalle REAL no se pierde --------------------------------------
{
  // Mismo número de vértices, pero el ruido es de 100 sobre 1.000: a 24 px eso
  // son 2,3 px de desviación. Eso SÍ se ve, y tiene que quedarse.
  const entidad = serpentea("p2", 101, 1_000, 100);
  const grueso = dibuja(entidad, 8);
  ok(
    grueso.length > 50,
    `un zigzag que se ve NO se aplana: quedaron ${grueso.length} de 101`,
  );
}

// --- 3 · la cota de error: nunca más de un píxel del escalón ---------------
{
  const entidad = serpentea("p3", 201, 1_000, 3);
  const completo = dibuja(entidad, 96);
  const grueso = dibuja(entidad, 8);
  // Tolerancia = diagonal/24, que es UN píxel en el tope del escalón grueso.
  const diagonal = Math.hypot(1_000, 6);
  const tope = diagonal / 24;
  let peor = 0;
  for (const punto of completo) {
    let mejor = Infinity;
    for (let i = 1; i < grueso.length; i += 1) {
      const a = grueso[i - 1];
      const b = grueso[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 <= 1e-18 ? 0 : Math.max(0, Math.min(1, ((punto.x - a.x) * dx + (punto.y - a.y) * dy) / l2));
      mejor = Math.min(mejor, Math.hypot(punto.x - (a.x + t * dx), punto.y - (a.y + t * dy)));
    }
    peor = Math.max(peor, mejor);
  }
  ok(
    peor <= tope,
    `ningún vértice original queda a más de la tolerancia del trazo dibujado — peor ${peor.toFixed(3)} contra ${tope.toFixed(3)}`,
  );
}

// --- 4 · lo que NO se decima -----------------------------------------------
{
  const cerrada = serpentea("p4", 101, 1_000, 0.1, { closed: true });
  eq(
    dibuja(cerrada, 8).length,
    dibuja(cerrada, 96).length,
    "una polilínea CERRADA no se decima: es un local, un predio o una pieza, y colapsarla cambia la figura, no el detalle",
  );

  const conBulge = serpentea("p5", 21, 1_000, 0.1);
  (conBulge as unknown as { vertices: { bulge?: number }[] }).vertices[5].bulge = 0.5;
  ok(
    dibuja(conBulge, 8).length >= 21,
    "un tramo con bulge es un ARCO: decimarlo lo convertiría en su cuerda",
  );

  const dosPuntos = serpentea("p6", 2, 1_000, 0);
  eq(dibuja(dosPuntos, 8).length, 2, "dos puntos ya son el mínimo");
}

// --- 5 · el valor por defecto NO es un escalón -----------------------------
{
  // Misma lección que el sombreado, y por eso se comprueba aquí también: 96 es
  // «nadie pidió LOD», no «escalón medio». Un umbral se lo tragaría.
  const entidad = serpentea("p7", 101, 1_000, 0.1);
  eq(dibuja(entidad, 96).length, 101, "96 dibuja el trazo completo");
  eq(dibuja(entidad, 128).length, 101, "y el escalón de detalle también");
  ok(dibuja(entidad, 32).length < 101, "sólo los dos escalones bajos deciman");
}

console.log(
  `Decimación de polilínea por LOD: ${verdes} comprobaciones verdes — el ruido subpíxel se va, el zigzag que se ve se queda, los extremos no se mueven, y ni las cerradas ni las de bulge ni el valor por defecto se tocan`,
);
