/**
 * La paleta de materiales del muro: cada id resuelve a un estilo distinto, lo
 * no declarado y lo basura caen al mismo genérico, y ese genérico es
 * BIT A BIT el `WALL_COLOR` que `wall-solid-three.ts` ya pintaba antes de que
 * `material` existiera — para que ningún documento ya guardado cambie de
 * aspecto al abrirse.
 */
import { strict as assert } from "node:assert";
import {
  CAD_WALL_MATERIAL_DEFAULT,
  CAD_WALL_MATERIAL_IDS,
  cadWallMaterialStyle,
  isCadWallMaterialId,
} from "./wall-materials";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

// --- 1. cada id declarado resuelve a un estilo con etiqueta y color propios -
{
  ok(CAD_WALL_MATERIAL_IDS.length > 0, "hay al menos un material declarado");
  const seenColors = new Set<number>();
  for (const id of CAD_WALL_MATERIAL_IDS) {
    const style = cadWallMaterialStyle(id);
    ok(style.label.length > 0, `${id} trae una etiqueta no vacía`);
    ok(!seenColors.has(style.color), `${id} no repite el color de otro material`);
    seenColors.add(style.color);
  }
}

// --- 2. indefinido, desconocido o basura caen al genérico -------------------
{
  ok(
    cadWallMaterialStyle(undefined) === CAD_WALL_MATERIAL_DEFAULT,
    "sin material declarado, el genérico",
  );
  ok(
    cadWallMaterialStyle("marble") === CAD_WALL_MATERIAL_DEFAULT,
    "un id que no está en la paleta, el genérico",
  );
  ok(
    cadWallMaterialStyle("") === CAD_WALL_MATERIAL_DEFAULT,
    "una cadena vacía, el genérico",
  );
}

// --- 3. el genérico es EXACTAMENTE el WALL_COLOR de antes de este campo -----
{
  // No es el número en sí lo que importa: es que un muro sin `material`
  // guardado hace meses se siga viendo igual hoy. Si esto cambia, cambia el
  // aspecto de cada documento existente sin que nadie tocara nada.
  ok(
    CAD_WALL_MATERIAL_DEFAULT.color === 0xcbd5e1,
    "el genérico sigue siendo el gris que ya pintaba wall-solid-three.ts",
  );
}

// --- 4. isCadWallMaterialId acota exactamente el conjunto declarado ---------
{
  for (const id of CAD_WALL_MATERIAL_IDS)
    ok(isCadWallMaterialId(id), `${id} narrows como material válido`);
  ok(!isCadWallMaterialId("concrete_"), "un id parecido no cuela");
  ok(!isCadWallMaterialId(42), "un número no es un id de material");
  ok(!isCadWallMaterialId(null), "null no es un id de material");
}

console.log(
  `wall-materials: ${checks} aserciones verdes. Cinco acabados resuelven a colores ` +
    `distintos, lo no declarado y lo inválido caen al mismo genérico, y ese genérico ` +
    `es bit a bit el WALL_COLOR de antes de que el campo existiera.`,
);
