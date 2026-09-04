/**
 * EL VOLUMEN DE TESELADO DE UN PLANO DENSO, POR ESCALÓN DE LOD.
 *
 * ## Por qué esta prueba cuenta y no cronometra
 *
 * El SLO que falla es `architecture@100k`: 25,3 s hasta el detalle y 8,57 fps
 * contra ≤5 s y ≥30 fps. Un cronómetro en una máquina compartida mide a los
 * vecinos tanto como al producto, así que aquí no se cronometra nada: se
 * CUENTAN puntos y caminos, que es trabajo que el producto se impone a sí mismo
 * y sale igual en cualquier máquina.
 *
 * ## Lo que la medición encontró
 *
 * En `architecture@20k`, con el escalón medio, el sombreado era el **99,8 %**
 * de todos los puntos teselados: 2.800 sombreados producían 36,1 millones de
 * caminos. Un solo `AR-CONC` sobre un contorno de CUATRO vértices producía
 * 24.004 trazos, y no eran líneas: eran GUIONES, de 0,543 unidades de mediana
 * sobre una diagonal de 652. A 320 px aparentes —el tope del escalón medio, el
 * sombreado más grande que llega ahí— ese guión mide **0,27 px**.
 *
 * El escalón 0 ya devolvía sólo el contorno, así que el salto era de 1 camino a
 * 24.004 en cuanto el sombreado pasaba de 24 px: un acantilado de 24.000×.
 *
 * ## Qué fija esta prueba
 *
 * Que los tres escalones sigan separados por el trabajo que hacen, y que el
 * escalón medio siga sin pagar los guiones que no se ven. Si alguien vuelve a
 * trocear el patrón ahí, este presupuesto lo dice antes que un usuario con un
 * plano denso.
 *
 * Los topes son GENEROSOS a propósito —el doble de lo medido—: esto es un
 * trinquete contra una regresión de orden de magnitud, no un ajuste fino que
 * se rompa porque el corpus cambie una entidad.
 */
import { strict as assert } from "node:assert";
import { createCadCorpusMix } from "../benchmark/corpus-mixes";
import { CAD_ENTITY_REGISTRY, type CadNativeEntity } from "../entity-runtime";
import { CAD_RENDER_LOD_SEGMENTS } from "./tessellation-cache";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

const corpus = createCadCorpusMix({ mix: "architecture", entities: 20_000 }) as unknown as {
  nativeEntities: CadNativeEntity[];
  document?: unknown;
};

function volumen(segments: number): { caminos: number; puntos: number; hatch: number } {
  let caminos = 0;
  let puntos = 0;
  let hatch = 0;
  for (const entity of corpus.nativeEntities) {
    if (!CAD_ENTITY_REGISTRY.supports(entity)) continue;
    for (const path of CAD_ENTITY_REGISTRY.adapter(entity).renderer.paths(
      entity,
      segments,
      corpus.document as never,
    )) {
      caminos += 1;
      puntos += path.points.length;
      if ((entity as { type: string }).type === "hatch") hatch += path.points.length;
    }
  }
  return { caminos, puntos, hatch };
}

const [SEG_GRUESO, SEG_MEDIO, SEG_DETALLE] = CAD_RENDER_LOD_SEGMENTS;

// --- 1 · el escalón grueso no dibuja trama ---------------------------------
{
  const grueso = volumen(SEG_GRUESO);
  ok(
    grueso.puntos < 300_000,
    `el escalón grueso de 20.000 entidades cabe en 300.000 puntos — salieron ${grueso.puntos}`,
  );
  // 2.800 sombreados × 1 contorno × 4 vértices: sólo el contorno, ni un trazo
  // de relleno. Es lo que ya hacía antes de esta ola y se fija para que siga.
  ok(
    grueso.hatch <= 12_000,
    `a 24 px un sombreado es una mancha: sólo su contorno — salieron ${grueso.hatch} puntos de sombreado`,
  );
}

// --- 2 · el escalón medio no paga los guiones que no se ven ----------------
{
  const medio = volumen(SEG_MEDIO);
  // Medido tras colapsar los guiones subpíxel: 1.800.388. El tope es el doble.
  ok(
    medio.puntos < 4_000_000,
    `el escalón medio no vuelve a los 72 millones de puntos — salieron ${medio.puntos}`,
  );
  ok(
    medio.puntos > 300_000,
    `pero SÍ dibuja la trama: si cayera al volumen del escalón grueso, el sombreado habría desaparecido de la pantalla (${medio.puntos})`,
  );
}

// --- 3 · el detalle conserva el patrón entero, guiones incluidos -----------
{
  const detalle = volumen(SEG_DETALLE);
  const medio = volumen(SEG_MEDIO);
  ok(
    detalle.puntos > medio.puntos * 10,
    `por encima de 320 px el guión ya se ve y se dibuja: el detalle tiene que costar mucho más que el medio (${detalle.puntos} vs ${medio.puntos})`,
  );
}

// --- 4 · el valor POR DEFECTO no es un escalón de LOD ----------------------
{
  // 96 es el valor por defecto del renderizador y significa «nadie pidió LOD,
  // dame el dibujo de verdad»: lo usan el trazado de bloques y las pruebas que
  // comparan patrones entre sí. Tratarlo como escalón medio volvía
  // indistinguibles dos de los ocho patrones, y `hatch-pattern-table.spec.ts`
  // lo cazó. Se fija aquí para que no vuelva por otra puerta.
  const porDefecto = volumen(96);
  const medio = volumen(SEG_MEDIO);
  ok(
    porDefecto.puntos > medio.puntos * 10,
    `el valor por defecto (96) dibuja el patrón COMPLETO, no el del escalón medio (${porDefecto.puntos} vs ${medio.puntos})`,
  );
}

console.log(
  `Volumen de teselado por escalón: ${verdes} comprobaciones verdes — el sombreado no vuelve a costar 72 millones de puntos en el escalón medio, y el valor por defecto sigue dibujando el patrón entero`,
);
