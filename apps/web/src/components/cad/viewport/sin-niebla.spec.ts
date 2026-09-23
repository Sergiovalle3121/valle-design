/**
 * LO QUE SE LEE NO SE DESVANECE.
 *
 * El 2026-09-22 la niebla de la escena dejó invisible medio producto: está
 * calibrada para la cámara del paseo 3D y la vista en planta la dibuja una
 * ortográfica a 1000 unidades, diez veces más allá de su borde lejano, así que
 * todo material estándar salía pintado del color exacto del fondo. La planta ya
 * no lleva niebla (`viewport/plan-fog.ts`), pero el 3D sí — y ahí sigue
 * habiendo cosas que NO son atmósfera: una cota, un rótulo, el realce de lo
 * designado y el icono del SCU son información, y una información que se borra
 * al alejarse es un dato perdido.
 *
 * Esta prueba lo fija construyendo los objetos de verdad y mirando sus
 * materiales. El cuerpo de los activos NO entra: eso es escenografía, y
 * desvanecerse a lo lejos es lo que tiene que hacer.
 *
 * Correr: npx tsx src/components/cad/viewport/sin-niebla.spec.ts
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
// Los módulos sólo tocan el DOM DENTRO de sus funciones, así que importarlos
// arriba es seguro: el `document` de mentira se instala antes de llamarlas.
import { buildDim, makeLabel, makeNoteLabel } from "./scene-objects";
import { createCadUcsIconObject } from "./ucs-icon";

/**
 * Un `<canvas>` de mentira, porque los rótulos se dibujan sobre uno de verdad
 * en el navegador y aquí no hay DOM. Sólo tiene que aguantar las llamadas de
 * `makeLabel`: lo que esta prueba mira es el MATERIAL que sale al final, no el
 * mapa de bits. Se instala antes de la primera llamada, que es cuando se usa.
 */
const contexto2d = new Proxy(
  { measureText: () => ({ width: 120 }) },
  {
    get: (destino, prop) =>
      prop in destino
        ? (destino as Record<string, unknown>)[prop as string]
        : typeof prop === "string" && prop.startsWith("font")
          ? ""
          : () => undefined,
    set: () => true,
  },
);
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d }),
};



let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};

/** Todos los materiales de un objeto y su descendencia. */
function materiales(objeto: THREE.Object3D): THREE.Material[] {
  const salida: THREE.Material[] = [];
  objeto.traverse((hijo) => {
    const material = (hijo as THREE.Mesh).material;
    if (Array.isArray(material)) salida.push(...material);
    else if (material) salida.push(material);
  });
  return salida;
}

/** `fog` es propiedad de casi todo material de three; sólo miramos los que la tienen. */
function conNiebla(lista: readonly THREE.Material[]): THREE.Material[] {
  return lista.filter((m) => (m as unknown as { fog?: boolean }).fog === true);
}

// ── Rótulos ─────────────────────────────────────────────────────────────────
{
  const rotulo = makeLabel("SALA");
  ok(
    conNiebla(materiales(rotulo)).length === 0,
    "el rótulo de una estancia no se desvanece: es su nombre, no su atmósfera",
  );
  const nota = makeNoteLabel("Revisar hueco");
  ok(conNiebla(materiales(nota)).length === 0, "una nota tampoco");
}

// ── Cotas ───────────────────────────────────────────────────────────────────
{
  const partes = buildDim(
    { id: "d1", x: 0, y: 0, x2: 3_000, y2: 0 } as unknown as Parameters<typeof buildDim>[0],
    0.0025,
    12_000,
    10_000,
    "mm",
  );
  ok(partes.length > 0, "la cota produce geometría");
  const materialesCota = partes.flatMap((parte) => materiales(parte));
  ok(
    conNiebla(materialesCota).length === 0,
    "NINGUNA parte de una cota se desvanece: una medida que se borra al alejarse es un dato perdido",
  );
}

// ── Icono del SCU ───────────────────────────────────────────────────────────
{
  const icono = createCadUcsIconObject(1, { axisX: 0xff0000, axisY: 0x00ff00 });
  ok(
    conNiebla(materiales(icono)).length === 0,
    "el icono del SCU dice dónde está el origen y hacia dónde miran los ejes: es información",
  );
}

console.log(`✔ lo que se lee no se desvanece: ${verdes} aserciones verdes`);
